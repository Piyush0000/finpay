import { FinPayClient, ValidationError, AuthenticationError, NetworkError, WebhookPayload } from './index';
import MockAdapter from 'axios-mock-adapter';
import crypto from 'crypto';

// Increase default timeout for all tests
jest.setTimeout(10000);

describe('FinPayClient', () => {
  let client: FinPayClient;
  let mock: MockAdapter;

  beforeEach(() => {
    client = new FinPayClient({
      apiBase: 'http://localhost:3000/api',
      token: 'test-jwt-token',
      enableLogging: false,
      retryConfig: {
        maxRetries: 0, // Disable retries for tests
        retryDelay: 100
      }
    });
    // Access the private axios instance via reflection
    const axiosInstance = (client as any).client;
    mock = new MockAdapter(axiosInstance);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const defaultClient = new FinPayClient({ token: 'test' });
      expect(defaultClient).toBeInstanceOf(FinPayClient);
    });

    it('should initialize with custom config', () => {
      const customClient = new FinPayClient({
        apiBase: 'https://api.example.com',
        token: 'custom-token',
        timeout: 60000,
        enableLogging: true
      });
      expect(customClient).toBeInstanceOf(FinPayClient);
    });
  });

  describe('getWallet', () => {
    it('should fetch wallet details successfully', async () => {
      const mockWallet = {
        walletId: 'w_123',
        balance: 150000,
        currency: 'INR',
        status: 'active'
      };

      mock.onGet('/wallets/me').reply(200, mockWallet);

      const wallet = await client.getWallet();
      expect(wallet).toEqual(mockWallet);
    });

    it('should handle authentication errors', async () => {
      mock.onGet('/wallets/me').reply(401, {
        error: { message: 'Invalid token' }
      });

      await expect(client.getWallet()).rejects.toThrow(AuthenticationError);
    });

    it('should handle network errors', async () => {
      mock.onGet('/wallets/me').timeout();

      await expect(client.getWallet()).rejects.toThrow(NetworkError);
    });
  });

  describe('createWallet', () => {
    it('should create a new wallet successfully', async () => {
      const newWallet = {
        walletId: 'w_456',
        balance: 0,
        currency: 'INR',
        status: 'active'
      };

      mock.onPost('/wallets').reply(200, newWallet);

      const wallet = await client.createWallet();
      expect(wallet).toEqual(newWallet);
    });
  });

  describe('fundWallet', () => {
    it('should fund wallet successfully', async () => {
      const fundedWallet = {
        walletId: 'w_123',
        balance: 100000,
        currency: 'INR',
        status: 'active'
      };

      mock.onPost('/wallets/me/fund').reply(200, fundedWallet);

      const wallet = await client.fundWallet();
      expect(wallet).toEqual(fundedWallet);
    });
  });

  describe('transfer', () => {
    it('should initiate transfer successfully', async () => {
      const transferResponse = {
        transactionId: 't_789',
        status: 'PENDING',
        amount: 15000,
        currency: 'INR'
      };

      mock.onPost('/transfers').reply(200, transferResponse);

      const result = await client.transfer({
        receiverEmail: 'test@example.com',
        amount: 15000,
        idempotencyKey: 'unique-key-123'
      });

      expect(result).toEqual(transferResponse);
    });

    it('should validate receiver email format', async () => {
      await expect(
        client.transfer({
          receiverEmail: 'invalid-email',
          amount: 15000,
          idempotencyKey: 'unique-key-123'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should validate amount is positive integer', async () => {
      await expect(
        client.transfer({
          receiverEmail: 'test@example.com',
          amount: -100,
          idempotencyKey: 'unique-key-123'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should validate idempotency key presence', async () => {
      await expect(
        client.transfer({
          receiverEmail: 'test@example.com',
          amount: 15000,
          idempotencyKey: ''
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should include simulation headers when provided', async () => {
      mock.onPost('/transfers').reply(200, {
        transactionId: 't_789',
        status: 'PENDING',
        amount: 15000,
        currency: 'INR'
      });

      await client.transfer({
        receiverEmail: 'test@example.com',
        amount: 15000,
        idempotencyKey: 'unique-key-123'
      }, {
        simulateDelay: 2000,
        simulateError: 'CARD_DECLINED'
      });

      const request = mock.history.post[0];
      expect(request.headers?.['X-Simulate-Delay']).toBe('2000');
      expect(request.headers?.['X-Simulate-Error']).toBe('CARD_DECLINED');
    });
  });

  describe('getTransaction', () => {
    it('should fetch transaction details successfully', async () => {
      const transaction = {
        _id: 't_789',
        senderId: 'user1',
        receiverId: 'user2',
        amount: 15000,
        currency: 'INR',
        status: 'COMPLETED',
        idempotencyKey: 'unique-key-123',
        createdAt: '2026-07-19T18:15:24.120Z',
        updatedAt: '2026-07-19T18:15:24.950Z'
      };

      mock.onGet('/transfers/t_789').reply(200, transaction);

      const result = await client.getTransaction('t_789');
      expect(result).toEqual(transaction);
    });

    it('should validate transaction ID', async () => {
      await expect(client.getTransaction('')).rejects.toThrow(ValidationError);
    });
  });

  describe('listTransactions', () => {
    it('should list transactions successfully', async () => {
      const response = {
        transactions: [
          {
            _id: 't_789',
            senderId: 'user1',
            receiverId: 'user2',
            amount: 15000,
            currency: 'INR',
            status: 'COMPLETED',
            idempotencyKey: 'key1',
            createdAt: '2026-07-19T18:15:24.120Z',
            updatedAt: '2026-07-19T18:15:24.950Z'
          }
        ],
        total: 1,
        page: 1,
        limit: 20
      };

      mock.onGet('/transfers?page=1&limit=20').reply(200, response);

      const result = await client.listTransactions(1, 20);
      expect(result).toEqual(response);
    });

    it('should validate page parameter', async () => {
      await expect(client.listTransactions(0, 20)).rejects.toThrow(ValidationError);
    });

    it('should validate limit parameter', async () => {
      await expect(client.listTransactions(1, 0)).rejects.toThrow(ValidationError);
      await expect(client.listTransactions(1, 101)).rejects.toThrow(ValidationError);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature', () => {
      const payload: WebhookPayload = {
        event: 'payment.completed',
        data: {
          transactionId: 't_123',
          senderEmail: 'sender@example.com',
          receiverEmail: 'receiver@example.com',
          amount: 15000,
          currency: 'INR',
          status: 'COMPLETED',
          failureReason: '',
          timestamp: '2026-07-19T18:15:25.105Z'
        }
      };
      const secret = 'test-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const isValid = FinPayClient.verifyWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const payload: WebhookPayload = {
        event: 'payment.completed',
        data: {
          transactionId: 't_123',
          senderEmail: 'sender@example.com',
          receiverEmail: 'receiver@example.com',
          amount: 15000,
          currency: 'INR',
          status: 'COMPLETED',
          failureReason: '',
          timestamp: '2026-07-19T18:15:25.105Z'
        }
      };
      const secret = 'test-secret';
      const invalidSignature = 'invalid-signature';

      const isValid = FinPayClient.verifyWebhookSignature(payload, invalidSignature, secret);
      expect(isValid).toBe(false);
    });

    it('should handle string payloads', () => {
      const payload = JSON.stringify({
        event: 'payment.completed',
        data: {
          transactionId: 't_123',
          senderEmail: 'sender@example.com',
          receiverEmail: 'receiver@example.com',
          amount: 15000,
          currency: 'INR',
          status: 'COMPLETED',
          failureReason: '',
          timestamp: '2026-07-19T18:15:25.105Z'
        }
      });
      const secret = 'test-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const isValid = FinPayClient.verifyWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });
  });

  describe('Event Emitter', () => {
    it('should emit transfer.initiated event', (done) => {
      mock.onPost('/transfers').reply(200, {
        transactionId: 't_789',
        status: 'PENDING',
        amount: 15000,
        currency: 'INR'
      });

      client.on('transfer.initiated', (data) => {
        expect(data.transactionId).toBe('t_789');
        done();
      });

      client.transfer({
        receiverEmail: 'test@example.com',
        amount: 15000,
        idempotencyKey: 'unique-key-123'
      });
    }, 10000); // Increase timeout for callback-based test
  });

  describe('Retry Logic', () => {
    it('should retry failed requests', async () => {
      // Create a new client with retries enabled for this test
      const retryClient = new FinPayClient({
        apiBase: 'http://localhost:3000/api',
        token: 'test-jwt-token',
        enableLogging: false,
        retryConfig: {
          maxRetries: 3,
          retryDelay: 10 // Very short delay for tests
        }
      });
      
      const axiosInstance = (retryClient as any).client;
      const retryMock = new MockAdapter(axiosInstance);
      
      let attemptCount = 0;
      retryMock.onPost('/transfers').reply(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return [500, { error: { message: 'Server error' } }];
        }
        return [200, {
          transactionId: 't_789',
          status: 'PENDING',
          amount: 15000,
          currency: 'INR'
        }];
      });

      const result = await retryClient.transfer({
        receiverEmail: 'test@example.com',
        amount: 15000,
        idempotencyKey: 'unique-key-123'
      });

      expect(attemptCount).toBe(3);
      expect(result.transactionId).toBe('t_789');
      
      retryMock.restore();
    });

    it('should give up after max retries', async () => {
      // Create a new client with retries enabled for this test
      const retryClient = new FinPayClient({
        apiBase: 'http://localhost:3000/api',
        token: 'test-jwt-token',
        enableLogging: false,
        retryConfig: {
          maxRetries: 2,
          retryDelay: 10 // Very short delay for tests
        }
      });
      
      const axiosInstance = (retryClient as any).client;
      const retryMock = new MockAdapter(axiosInstance);
      
      retryMock.onPost('/transfers').reply(500, {
        error: { message: 'Server error' }
      });

      await expect(
        retryClient.transfer({
          receiverEmail: 'test@example.com',
          amount: 15000,
          idempotencyKey: 'unique-key-123'
        })
      ).rejects.toThrow();
      
      retryMock.restore();
    });

    it('should NOT retry on 401 auth errors (retries can only ever repeat the failure)', async () => {
      const retryClient = new FinPayClient({
        apiBase: 'http://localhost:3000/api',
        token: 'test-jwt-token',
        retryConfig: {
          maxRetries: 3,
          retryDelay: 10
        }
      });

      const axiosInstance = (retryClient as any).client;
      const retryMock = new MockAdapter(axiosInstance);

      let attemptCount = 0;
      retryMock.onGet('/wallets/me').reply(() => {
        attemptCount++;
        return [401, { error: { message: 'bad token' } }];
      });

      await expect(retryClient.getWallet()).rejects.toThrow(AuthenticationError);
      expect(attemptCount).toBe(1);

      retryMock.restore();
    });

    it('should NOT retry on 400 validation errors', async () => {
      const retryClient = new FinPayClient({
        apiBase: 'http://localhost:3000/api',
        token: 'test-jwt-token',
        retryConfig: {
          maxRetries: 3,
          retryDelay: 10
        }
      });

      const axiosInstance = (retryClient as any).client;
      const retryMock = new MockAdapter(axiosInstance);

      let attemptCount = 0;
      retryMock.onGet('/wallets/me').reply(() => {
        attemptCount++;
        return [400, { error: { message: 'bad request' } }];
      });

      await expect(retryClient.getWallet()).rejects.toThrow(ValidationError);
      expect(attemptCount).toBe(1);

      retryMock.restore();
    });

    it('should honor Retry-After header on 429 responses instead of exponential backoff', async () => {
      const retryClient = new FinPayClient({
        apiBase: 'http://localhost:3000/api',
        token: 'test-jwt-token',
        retryConfig: {
          maxRetries: 1,
          retryDelay: 5000 // deliberately large so the test would time out if Retry-After is ignored
        }
      });

      const axiosInstance = (retryClient as any).client;
      const retryMock = new MockAdapter(axiosInstance);

      let attemptCount = 0;
      retryMock.onGet('/wallets/me').reply(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return [429, { error: { message: 'slow down' } }, { 'Retry-After': '0' }];
        }
        return [200, { walletId: 'w_1', balance: 0, currency: 'INR', status: 'active' }];
      });

      const wallet = await retryClient.getWallet();
      expect(wallet.walletId).toBe('w_1');
      expect(attemptCount).toBe(2);

      retryMock.restore();
    }, 1000);
  });

  describe('Idempotency key auto-generation', () => {
    it('generates an idempotency key when none is provided', async () => {
      mock.onPost('/transfers').reply(200, {
        transactionId: 't_789',
        status: 'PENDING',
        amount: 15000,
        currency: 'INR'
      });

      await client.transfer({
        receiverEmail: 'test@example.com',
        amount: 15000
      });

      const request = mock.history.post[0];
      expect(request.headers?.['Idempotency-Key']).toBeTruthy();
      expect(typeof request.headers?.['Idempotency-Key']).toBe('string');
    });

    it('still rejects an explicitly empty idempotency key', async () => {
      await expect(
        client.transfer({
          receiverEmail: 'test@example.com',
          amount: 15000,
          idempotencyKey: ''
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('iterateTransactions', () => {
    it('pages through all transactions transparently', async () => {
      const txPage = (id: string) => ({
        _id: id,
        senderId: 'user1',
        receiverId: 'user2',
        amount: 1000,
        currency: 'INR',
        status: 'COMPLETED',
        idempotencyKey: id,
        createdAt: '2026-07-19T18:15:24.120Z',
        updatedAt: '2026-07-19T18:15:24.950Z'
      });

      mock.onGet('/transfers?page=1&limit=2').reply(200, {
        transactions: [txPage('t_1'), txPage('t_2')],
        total: 3,
        page: 1,
        limit: 2
      });
      mock.onGet('/transfers?page=2&limit=2').reply(200, {
        transactions: [txPage('t_3')],
        total: 3,
        page: 2,
        limit: 2
      });

      const ids: string[] = [];
      for await (const tx of client.iterateTransactions(2)) {
        ids.push(tx._id);
      }

      expect(ids).toEqual(['t_1', 't_2', 't_3']);
    });
  });

  describe('fromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('builds a client from FINPAY_* environment variables', () => {
      process.env.FINPAY_TOKEN = 'env-token';
      process.env.FINPAY_API_BASE = 'https://api.env.example.com';

      const envClient = FinPayClient.fromEnv();
      expect(envClient).toBeInstanceOf(FinPayClient);
    });

    it('throws when no token is available', () => {
      delete process.env.FINPAY_TOKEN;
      expect(() => FinPayClient.fromEnv()).toThrow(ValidationError);
    });
  });

  describe('webhook event namespacing', () => {
    it('emits webhook events prefixed with webhook: so untrusted event names can never collide with EventEmitter internals', () => {
      const payload: WebhookPayload = {
        event: 'payment.completed',
        data: {
          transactionId: 't_123',
          senderEmail: 'sender@example.com',
          receiverEmail: 'receiver@example.com',
          amount: 15000,
          currency: 'INR',
          status: 'COMPLETED',
          failureReason: '',
          timestamp: '2026-07-19T18:15:25.105Z'
        }
      };
      const secret = 'test-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const received: any[] = [];
      client.on('webhook:payment.completed', (data) => received.push(data));

      const isValid = FinPayClient.handleWebhook(payload, signature, secret, client);

      expect(isValid).toBe(true);
      expect(received).toHaveLength(1);
      expect(received[0].transactionId).toBe('t_123');
    });
  });
});
