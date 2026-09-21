import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// Type Definitions
// ============================================================================

export interface FinPayConfig {
  apiBase?: string;
  token: string;
  timeout?: number;
  retryConfig?: RetryConfig;
  enableLogging?: boolean;
}

export interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  retryCondition?: (error: FinPayError) => boolean;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface Wallet {
  walletId: string;
  balance: number;
  currency: string;
  status: string;
}

export interface TransferParams {
  receiverEmail: string;
  amount: number;
  currency?: string;
  /** Auto-generated via crypto.randomUUID() if omitted */
  idempotencyKey?: string;
}

export interface TransferOptions {
  simulateDelay?: number;
  simulateError?: string;
  signal?: AbortSignal;
}

export interface TransferResponse {
  transactionId: string;
  status: string;
  amount: number;
  currency: string;
}

export interface Transaction {
  _id: string;
  senderId: string;
  receiverId: string;
  amount: number;
  currency: string;
  status: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionList {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export type WebhookEventName =
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.pending'
  | 'transfer.initiated'
  | 'transfer.rolled_back';

export interface WebhookPayload {
  event: WebhookEventName;
  data: {
    transactionId: string;
    senderEmail: string;
    receiverEmail: string;
    amount: number;
    currency: string;
    status: string;
    failureReason: string;
    timestamp: string;
  };
}

// ============================================================================
// Custom Error Classes
// ============================================================================

export class FinPayError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'FinPayError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends FinPayError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends FinPayError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends FinPayError {
  constructor(message: string = 'Network connection failed') {
    super(message, 'NETWORK_ERROR', 0);
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends FinPayError {
  constructor(message: string = 'Rate limit exceeded', public retryAfterMs?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429);
    this.name = 'RateLimitError';
  }
}

export class InsufficientFundsError extends FinPayError {
  constructor(message: string = 'Insufficient funds') {
    super(message, 'INSUFFICIENT_FUNDS', 400);
    this.name = 'InsufficientFundsError';
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

class Validator {
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validateAmount(amount: number): boolean {
    return Number.isInteger(amount) && amount > 0;
  }

  static validateIdempotencyKey(key: string): boolean {
    return typeof key === 'string' && key.length > 0;
  }

  static validateTransferParams(params: TransferParams & { idempotencyKey: string }): void {
    if (!this.validateEmail(params.receiverEmail)) {
      throw new ValidationError('Invalid receiver email format', { field: 'receiverEmail' });
    }
    if (!this.validateAmount(params.amount)) {
      throw new ValidationError('Amount must be a positive integer in paisa', { field: 'amount' });
    }
    if (!this.validateIdempotencyKey(params.idempotencyKey)) {
      throw new ValidationError('Idempotency key is required', { field: 'idempotencyKey' });
    }
  }
}

/**
 * Retry-After can be seconds ("120") or an HTTP date. Returns milliseconds to wait, or undefined if unparseable.
 */
function parseRetryAfterMs(headerValue: string | undefined): number | undefined {
  if (!headerValue) return undefined;

  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds)) return seconds * 1000;

  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());

  return undefined;
}

// ============================================================================
// Main FinPay Client Class
// ============================================================================

export class FinPayClient extends EventEmitter {
  private client: AxiosInstance;
  private config: FinPayConfig & {
    timeout: number;
    enableLogging: boolean;
  };
  private retryConfig: {
    maxRetries: number;
    retryDelay: number;
    retryCondition: (error: FinPayError) => boolean;
  };

  constructor(config: FinPayConfig) {
    super();

    this.config = {
      apiBase: config.apiBase || 'http://localhost:3000/api',
      token: config.token,
      timeout: config.timeout || 30000,
      retryConfig: config.retryConfig || {
        maxRetries: 3,
        retryDelay: 1000,
        retryCondition: this.defaultRetryCondition
      },
      enableLogging: config.enableLogging ?? false
    } as FinPayConfig & {
      timeout: number;
      enableLogging: boolean;
    };

    this.retryConfig = {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      retryDelay: this.config.retryConfig?.retryDelay ?? 1000,
      retryCondition: this.config.retryConfig?.retryCondition || this.defaultRetryCondition
    };

    this.client = axios.create({
      baseURL: this.config.apiBase,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {})
      }
    });

    this.setupInterceptors();
  }

  /**
   * Build a client from FINPAY_TOKEN / FINPAY_API_BASE / FINPAY_TIMEOUT / FINPAY_DEBUG env vars.
   */
  static fromEnv(overrides: Partial<FinPayConfig> = {}): FinPayClient {
    const token = overrides.token ?? process.env.FINPAY_TOKEN;
    if (!token) {
      throw new ValidationError('FINPAY_TOKEN environment variable is required', { field: 'token' });
    }

    return new FinPayClient({
      apiBase: overrides.apiBase ?? process.env.FINPAY_API_BASE,
      token,
      timeout: overrides.timeout ?? (process.env.FINPAY_TIMEOUT ? Number(process.env.FINPAY_TIMEOUT) : undefined),
      retryConfig: overrides.retryConfig,
      enableLogging: overrides.enableLogging ?? process.env.FINPAY_DEBUG === 'true'
    });
  }

  /**
   * Retries on network failures and 429/5xx responses only — not on 4xx client errors
   * like auth or validation failures, which will never succeed on replay.
   */
  private defaultRetryCondition(error: FinPayError): boolean {
    if (error instanceof NetworkError) return true;
    const status = error.statusCode;
    if (status === undefined) return true;
    return status === 429 || status >= 500;
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.config.enableLogging) {
          console.log(`[FinPay SDK] Request: ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error: AxiosError) => {
        if (this.config.enableLogging) {
          console.error('[FinPay SDK] Request error:', error.message);
        }
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        if (this.config.enableLogging) {
          console.log(`[FinPay SDK] Response: ${response.status} ${response.config.url}`);
        }
        return response;
      },
      (error: AxiosError) => {
        if (this.config.enableLogging) {
          console.error('[FinPay SDK] Response error:', error.message);
        }
        return Promise.reject(this.handleApiError(error));
      }
    );
  }

  private handleApiError(error: AxiosError): FinPayError {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      switch (status) {
        case 401:
          return new AuthenticationError(data?.error?.message || 'Authentication failed');
        case 400:
          if (data?.error?.message?.toLowerCase().includes('insufficient')) {
            return new InsufficientFundsError(data.error.message);
          }
          return new ValidationError(data?.error?.message || 'Validation failed', data);
        case 429: {
          const headers = error.response.headers as any;
          const retryAfterHeader =
            typeof headers?.get === 'function' ? headers.get('retry-after') : headers?.['retry-after'];
          const retryAfterMs = parseRetryAfterMs(retryAfterHeader as string | undefined);
          return new RateLimitError(data?.error?.message || 'Rate limit exceeded', retryAfterMs);
        }
        default:
          return new FinPayError(
            data?.error?.message || 'API request failed',
            undefined,
            status,
            data
          );
      }
    } else if (error.request || error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return new NetworkError(error.message || 'Network connection failed');
    } else {
      return new FinPayError(error.message || 'Request setup failed');
    }
  }

  private async retryRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    let lastError: FinPayError;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as FinPayError;

        // Check if we should retry
        if (attempt === this.retryConfig.maxRetries || !this.retryConfig.retryCondition(lastError)) {
          throw lastError;
        }

        // Honor Retry-After on 429s, otherwise exponential backoff
        const delay =
          lastError instanceof RateLimitError && lastError.retryAfterMs !== undefined
            ? lastError.retryAfterMs
            : this.retryConfig.retryDelay * Math.pow(2, attempt);

        if (this.config.enableLogging) {
          console.log(`[FinPay SDK] Retry attempt ${attempt + 1}/${this.retryConfig.maxRetries} after ${delay}ms`);
        }
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // API Methods
  // ============================================================================

  /**
   * Retrieve active wallet ledger details
   */
  async getWallet(options: RequestOptions = {}): Promise<Wallet> {
    return this.retryRequest(async () => {
      const res = await this.client.get('/wallets/me', { signal: options.signal });
      return res.data;
    });
  }

  /**
   * Register a new active digital wallet
   */
  async createWallet(options: RequestOptions = {}): Promise<Wallet> {
    return this.retryRequest(async () => {
      const res = await this.client.post('/wallets', undefined, { signal: options.signal });
      return res.data;
    });
  }

  /**
   * Add mock funding credits to the wallet
   */
  async fundWallet(options: RequestOptions = {}): Promise<Wallet> {
    return this.retryRequest(async () => {
      const res = await this.client.post('/wallets/me/fund', undefined, { signal: options.signal });
      return res.data;
    });
  }

  /**
   * Initiate an asynchronous instant transfer via the Saga core.
   * If `idempotencyKey` is omitted, one is generated automatically.
   */
  async transfer(params: TransferParams, options: TransferOptions = {}): Promise<TransferResponse> {
    const idempotencyKey = params.idempotencyKey === undefined ? crypto.randomUUID() : params.idempotencyKey;
    Validator.validateTransferParams({ ...params, idempotencyKey });

    const headers: Record<string, string> = { 'Idempotency-Key': idempotencyKey };
    if (options.simulateDelay) {
      headers['X-Simulate-Delay'] = options.simulateDelay.toString();
    }
    if (options.simulateError) {
      headers['X-Simulate-Error'] = options.simulateError;
    }

    return this.retryRequest(async () => {
      const res = await this.client.post('/transfers', {
        receiverEmail: params.receiverEmail,
        amount: params.amount,
        currency: params.currency || 'INR'
      }, { headers, signal: options.signal });

      // Emit event for successful transfer initiation
      this.emit('transfer.initiated', res.data);

      return res.data;
    });
  }

  /**
   * Retrieve transfer pipeline status
   */
  async getTransaction(transactionId: string, options: RequestOptions = {}): Promise<Transaction> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new ValidationError('Invalid transaction ID', { field: 'transactionId' });
    }

    return this.retryRequest(async () => {
      const res = await this.client.get(`/transfers/${transactionId}`, { signal: options.signal });
      return res.data;
    });
  }

  /**
   * List recent client ledger transaction history
   */
  async listTransactions(page: number = 1, limit: number = 20, options: RequestOptions = {}): Promise<TransactionList> {
    if (!Number.isInteger(page) || page < 1) {
      throw new ValidationError('Page must be a positive integer', { field: 'page' });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100', { field: 'limit' });
    }

    return this.retryRequest(async () => {
      const res = await this.client.get(`/transfers?page=${page}&limit=${limit}`, { signal: options.signal });
      return res.data;
    });
  }

  /**
   * Walk the full transaction history, transparently paging under the hood.
   */
  async *iterateTransactions(pageSize: number = 20): AsyncGenerator<Transaction, void, void> {
    let page = 1;

    while (true) {
      const { transactions, total } = await this.listTransactions(page, pageSize);

      for (const transaction of transactions) {
        yield transaction;
      }

      if (transactions.length === 0 || page * pageSize >= total) {
        break;
      }
      page++;
    }
  }

  // ============================================================================
  // Static Methods
  // ============================================================================

  /**
   * Verify FinPay webhook signature headers to validate origin authenticity.
   * Uses a constant-time comparison to avoid leaking the secret via timing.
   */
  static verifyWebhookSignature(
    payload: WebhookPayload | string,
    signature: string,
    secret: string
  ): boolean {
    if (!payload || !signature || !secret) return false;

    const stringPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const computed = crypto.createHmac('sha256', secret).update(stringPayload).digest('hex');

    const computedBuffer = Buffer.from(computed, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');

    if (computedBuffer.length !== signatureBuffer.length) return false;

    return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
  }

  /**
   * Parse webhook event and emit on a client instance if provided.
   * Events are emitted as `webhook:<event>` so untrusted payloads can never
   * trigger EventEmitter's special 'error' event and crash the process.
   */
  static handleWebhook(
    payload: WebhookPayload,
    signature: string,
    secret: string,
    client?: FinPayClient
  ): boolean {
    const isValid = this.verifyWebhookSignature(payload, signature, secret);

    if (isValid && client) {
      client.emit(`webhook:${payload.event}`, payload.data);
    }

    return isValid;
  }
}

// ============================================================================
// Export
// ============================================================================

export default FinPayClient;

// Allow plain CommonJS consumers to do `const FinPayClient = require('@piyush2205/finpay-sdk')`
// and get the class directly, while TS/ESM consumers keep using default or named imports.
/* eslint-disable @typescript-eslint/no-var-requires */
if (typeof module !== 'undefined') {
  module.exports = FinPayClient;
  module.exports.default = FinPayClient;
  module.exports.FinPayClient = FinPayClient;
  module.exports.FinPayError = FinPayError;
  module.exports.AuthenticationError = AuthenticationError;
  module.exports.ValidationError = ValidationError;
  module.exports.NetworkError = NetworkError;
  module.exports.RateLimitError = RateLimitError;
  module.exports.InsufficientFundsError = InsufficientFundsError;
}
