# FinPay Node.js SDK v2.2.0

Official Node.js client library wrapper for the **FinPay** distributed payments core. Now with TypeScript support, automatic retry logic, advanced error handling, circuit breaker monitoring, and distributed tracing support.

---

## What's New in v2.2

- **Circuit Breaker Monitoring** - Real-time circuit breaker status and health monitoring
- **Distributed Tracing Support** - Trace context propagation for end-to-end request tracking
- **New Error Types** - CircuitBreakerOpenError and ServiceUnavailableError
- **System Health Checks** - Overall system health and per-service status monitoring
- **Enhanced Configuration** - Tracing options and trace parent propagation

## What's New in v2.0

- **Full TypeScript Support** - Complete type definitions for better developer experience
- **Automatic Retry Logic** - Exponential backoff for failed requests
- **Advanced Error Handling** - Specific error types (Authentication, Validation, Network, RateLimit)
- **Input Validation** - Automatic validation of requests before API calls
- **Event Emitter** - Real-time transfer status updates via events
- **Request Logging** - Built-in logging for debugging
- **Comprehensive Tests** - Full test suite with Jest
- **Better Documentation** - Enhanced JSDoc comments

---

## Installation

```bash
npm install @piyush2205/finpay-sdk
```

---

## Getting Started

### 1. Initialize Client
Initialize the client with your portal API Gateway address and authenticated JWT token.

```javascript
const FinPayClient = require('@piyush2205/finpay-sdk');

const finpay = new FinPayClient({
  apiBase: 'http://localhost:3000/api',
  token: 'YOUR_JWT_ACCESS_TOKEN', // Obtained via auth/login
  enableLogging: true, // Enable request/response logging
  enableTracing: true, // Enable distributed tracing support
  retryConfig: {
    maxRetries: 3,
    retryDelay: 1000
  }
});
```

**TypeScript users:**
```typescript
import FinPayClient, { FinPayConfig } from '@piyush2205/finpay-sdk';

const config: FinPayConfig = {
  apiBase: 'http://localhost:3000/api',
  token: 'YOUR_JWT_ACCESS_TOKEN',
  enableLogging: true
};

const finpay = new FinPayClient(config);
```

### 2. Fetch Wallet Details
Retrieve balance (in paisa) and wallet configurations.

```javascript
async function checkBalance() {
  try {
    const wallet = await finpay.getWallet();
    console.log(`Balance: ₹${(wallet.balance / 100).toFixed(2)}`);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      console.error('Authentication failed:', err.message);
    } else {
      console.error('Failed:', err.message);
    }
  }
}
```

### 3. Trigger Instant Transfer (With Simulation Headers)
Initiate a transaction with automatic validation and retry logic.

```javascript
async function sendTransfer() {
  try {
    const response = await finpay.transfer({
      receiverEmail: 'bob@gmail.com',
      amount: 15000, // ₹150.00 (in paisa)
      currency: 'INR',
      idempotencyKey: 'custom-unique-uuid-key'
    }, {
      simulateDelay: 2000,          // Simulate 2 seconds worker latency
      simulateError: 'CARD_DECLINED' // Simulate declined error exceptions
    });

    console.log('Transfer Enqueued! Transaction ID:', response.transactionId);
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error('Validation error:', err.message, err.details);
    } else if (err instanceof InsufficientFundsError) {
      console.error('Insufficient funds for transfer');
    } else {
      console.error('Initiation failed:', err.message);
    }
  }
}
```

### 4. Real-time Event Streaming
Listen to transfer events in real-time.

```javascript
// Listen for transfer initiation
finpay.on('transfer.initiated', (data) => {
  console.log('Transfer initiated:', data.transactionId);
});

// Listen for payment completions via webhooks
const express = require('express');
const app = express();

app.post('/webhooks/payment', express.json(), (req, res) => {
  const signature = req.headers['x-finpay-signature'];
  const secret = 'whsec_your_webhook_hmac_secret';

  const isValid = FinPayClient.verifyWebhookSignature(req.body, signature, secret);

  if (!isValid) {
    return res.status(401).send('Invalid webhook signature');
  }

  // Handle event with automatic parsing
  FinPayClient.handleWebhook(req.body, signature, secret, finpay);

  res.status(200).send('Received');
});

// Listen for webhook events
finpay.on('payment.completed', (data) => {
  console.log(`Payment successful for TX ${data.transactionId}`);
});
```

---

## Advanced Error Handling

v2.2 provides specific error types for better error handling:

```javascript
const {
  FinPayError,
  AuthenticationError,
  ValidationError,
  NetworkError,
  RateLimitError,
  InsufficientFundsError,
  CircuitBreakerOpenError,
  ServiceUnavailableError
} = require('@piyush2205/finpay-sdk');

try {
  await finpay.transfer({ /* ... */ });
} catch (err) {
  if (err instanceof AuthenticationError) {
    // Handle authentication failures (401)
    console.error('Token expired or invalid');
  } else if (err instanceof ValidationError) {
    // Handle validation errors (400)
    console.error('Invalid input:', err.details);
  } else if (err instanceof InsufficientFundsError) {
    // Handle insufficient funds
    console.error('Not enough balance');
  } else if (err instanceof CircuitBreakerOpenError) {
    // Handle circuit breaker open (503)
    console.error('Service temporarily unavailable:', err.message);
  } else if (err instanceof ServiceUnavailableError) {
    // Handle service unavailable (503)
    console.error('Service unavailable:', err.message);
  } else if (err instanceof RateLimitError) {
    // Handle rate limiting (429)
    console.error('Too many requests');
  } else if (err instanceof NetworkError) {
    // Handle network issues
    console.error('Connection failed');
  } else {
    // Handle other errors
    console.error('Unexpected error:', err.message);
  }
}
```

---

## API Reference

### Constructor Options

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `apiBase` | string | No | `'http://localhost:3000/api'` | Base URL of the API gateway |
| `token` | string | Yes | - | JWT access token |
| `timeout` | number | No | `30000` | Request timeout in milliseconds |
| `enableLogging` | boolean | No | `false` | Enable request/response logging |
| `enableTracing` | boolean | No | `false` | Enable distributed tracing support |
| `traceParent` | string | No | - | Trace parent ID for context propagation |
| `retryConfig.maxRetries` | number | No | `3` | Maximum retry attempts |
| `retryConfig.retryDelay` | number | No | `1000` | Initial retry delay in ms |

### Methods

#### `getWallet(): Promise<Wallet>`
Fetches wallet details including balance and status.

#### `createWallet(): Promise<Wallet>`
Creates a new wallet for the authenticated user.

#### `fundWallet(): Promise<Wallet>`
Adds sandbox simulation credits to the wallet.

#### `transfer(params, options?): Promise<TransferResponse>`
Initiates a money transfer with automatic validation and retry logic.

#### `getTransaction(transactionId): Promise<Transaction>`
Retrieves details of a specific transaction.

#### `listTransactions(page?, limit?): Promise<TransactionList>`
Lists paginated transaction history.

#### `getCircuitBreakerStatus(): Promise<CircuitBreakerStatuses>`
Get circuit breaker status for all services.

#### `getServiceCircuitBreakerStatus(serviceName): Promise<CircuitBreakerStatus>`
Get circuit breaker status for a specific service.

#### `getSystemHealth(): Promise<SystemHealth>`
Get overall system health status including all services.

#### `isServiceHealthy(serviceName): Promise<boolean>`
Check if a specific service is healthy.

#### `verifyWebhookSignature(payload, signature, secret): boolean`
Static method to verify webhook signature authenticity.

#### `handleWebhook(payload, signature, secret, client?): boolean`
Static method to verify and emit webhook events on a client instance.

---

## Circuit Breaker & Health Monitoring

The SDK v2.2 includes built-in support for monitoring circuit breakers and system health.

### Check Circuit Breaker Status
```javascript
// Get all circuit breaker statuses
const statuses = await finpay.getCircuitBreakerStatus();
console.log(statuses);
// {
//   auth: { status: 'closed', stats: { failures: 0, successes: 10, ... } },
//   wallet: { status: 'open', stats: { failures: 8, successes: 2, ... } },
//   ...
// }

// Get specific service status
const walletStatus = await finpay.getServiceCircuitBreakerStatus('wallet');
console.log(walletStatus);
// { status: 'open', stats: { failures: 8, successes: 2, fallbacks: 5, ... } }
```

### System Health Monitoring
```javascript
// Get overall system health
const health = await finpay.getSystemHealth();
console.log(health);
// {
//   status: 'degraded',
//   services: {
//     'api-gateway': { status: 'ok' },
//     'wallet': { status: 'degraded', circuitBreaker: { status: 'open', ... } },
//     'auth': { status: 'healthy', circuitBreaker: { status: 'closed', ... } }
//   },
//   timestamp: '2024-01-15T10:30:00.000Z'
// }

// Check if specific service is healthy
const isWalletHealthy = await finpay.isServiceHealthy('wallet');
console.log('Wallet healthy:', isWalletHealthy); // false if circuit breaker is open
```

### Distributed Tracing
```javascript
// Enable tracing and propagate trace context
const finpay = new FinPayClient({
  apiBase: 'http://localhost:3000/api',
  token: 'YOUR_JWT_ACCESS_TOKEN',
  enableTracing: true,
  traceParent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' // W3C trace context
});

// The SDK will automatically include trace headers in all requests
// for end-to-end distributed tracing across microservices
```

---

## Configuration Examples

### Production Configuration
```javascript
const finpay = new FinPayClient({
  apiBase: 'https://api.finpay.io/v1',
  token: process.env.FINPAY_PRODUCTION_TOKEN,
  timeout: 60000,
  retryConfig: {
    maxRetries: 5,
    retryDelay: 2000
  },
  enableLogging: false
});
```

### Development Configuration
```javascript
const finpay = new FinPayClient({
  apiBase: 'http://localhost:3000/api',
  token: process.env.FINPAY_DEV_TOKEN,
  timeout: 30000,
  retryConfig: {
    maxRetries: 1,
    retryDelay: 500
  },
  enableLogging: true
});
```

---

## Testing

The SDK includes a comprehensive test suite. Run tests with:

```bash
npm install
npm test
```

For coverage report:
```bash
npm run test:coverage
```

---

## Building

To build the TypeScript code:

```bash
npm run build
```

The compiled JavaScript will be output to the `dist/` directory.

---

## License

MIT © Piyush Rathore

---

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/Piyush0000/finpay/tree/main/packages/sdk).
