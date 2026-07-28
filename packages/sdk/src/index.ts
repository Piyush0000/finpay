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
  retryCondition?: (error: AxiosError) => boolean;
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
  idempotencyKey: string;
}

export interface TransferOptions {
  simulateDelay?: number;
  simulateError?: string;
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

export interface WebhookPayload {
  event: string;
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
  constructor(message: string = 'Rate limit exceeded') {
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

  static validateTransferParams(params: TransferParams): void {
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
    retryCondition: (error: AxiosError) => boolean;
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

  private defaultRetryCondition(error: AxiosError): boolean {
    if (!error.response) return true; // Network errors
    const status = error.response.status;
    return status === 429 || status >= 500; // Retry on rate limits and server errors
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
        case 429:
          return new RateLimitError(data?.error?.message || 'Rate limit exceeded');
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
        if (attempt === this.retryConfig.maxRetries || !this.retryConfig.retryCondition(error as AxiosError)) {
          throw lastError;
        }

        // Exponential backoff
        const delay = this.retryConfig.retryDelay * Math.pow(2, attempt);
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
  async getWallet(): Promise<Wallet> {
    return this.retryRequest(async () => {
      const res = await this.client.get('/wallets/me');
      return res.data;
    });
  }

  /**
   * Register a new active digital wallet
   */
  async createWallet(): Promise<Wallet> {
    return this.retryRequest(async () => {
      const res = await this.client.post('/wallets');
      return res.data;
    });
  }

  /**
   * Add mock funding credits to the wallet
   */
  async fundWallet(): Promise<Wallet> {
    return this.retryRequest(async () => {
      const res = await this.client.post('/wallets/me/fund');
      return res.data;
    });
  }

  /**
   * Initiate an asynchronous instant transfer via the Saga core
   */
  async transfer(params: TransferParams, options: TransferOptions = {}): Promise<TransferResponse> {
    Validator.validateTransferParams(params);

    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }
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
      }, { headers });

      // Emit event for successful transfer initiation
      this.emit('transfer.initiated', res.data);
      
      return res.data;
    });
  }

  /**
   * Retrieve transfer pipeline status
   */
  async getTransaction(transactionId: string): Promise<Transaction> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new ValidationError('Invalid transaction ID', { field: 'transactionId' });
    }

    return this.retryRequest(async () => {
      const res = await this.client.get(`/transfers/${transactionId}`);
      return res.data;
    });
  }

  /**
   * List recent client ledger transaction history
   */
  async listTransactions(page: number = 1, limit: number = 20): Promise<TransactionList> {
    if (!Number.isInteger(page) || page < 1) {
      throw new ValidationError('Page must be a positive integer', { field: 'page' });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100', { field: 'limit' });
    }

    return this.retryRequest(async () => {
      const res = await this.client.get(`/transfers?page=${page}&limit=${limit}`);
      return res.data;
    });
  }

  // ============================================================================
  // Static Methods
  // ============================================================================

  /**
   * Verify FinPay webhook signature headers to validate origin authenticity
   */
  static verifyWebhookSignature(
    payload: WebhookPayload | string,
    signature: string,
    secret: string
  ): boolean {
    if (!payload || !signature || !secret) return false;
    
    const stringPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const computed = crypto.createHmac('sha256', secret).update(stringPayload).digest('hex');
    
    return computed === signature;
  }

  /**
   * Parse webhook event and emit on a client instance if provided
   */
  static handleWebhook(
    payload: WebhookPayload,
    signature: string,
    secret: string,
    client?: FinPayClient
  ): boolean {
    const isValid = this.verifyWebhookSignature(payload, signature, secret);
    
    if (isValid && client) {
      client.emit(payload.event, payload.data);
    }
    
    return isValid;
  }
}

// ============================================================================
// Export
// ============================================================================

export default FinPayClient;
