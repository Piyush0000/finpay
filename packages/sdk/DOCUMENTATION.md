# `@piyush2205/finpay-sdk` Developer Documentation

Welcome to the comprehensive API integration documentation for the official **FinPay Node.js SDK**. This library allows developers to interface with the FinPay distributed payment ledger core, simulate sandboxed transaction environments, and cryptographically verify webhook events.

---

## Table of Contents
1. [Initialization & Configuration](#1-initialization--configuration)
2. [API Reference Guide](#2-api-reference-guide)
   - [Constructor](#constructor)
   - [`getWallet()`](#getwallet)
   - [`createWallet()`](#createwallet)
   - [`fundWallet()`](#fundwallet)
   - [`transfer()`](#transfer)
   - [`getTransaction()`](#gettransaction)
   - [`listTransactions()`](#listtransactions)
   - [`verifyWebhookSignature()`](#verifywebhooksignature-static)
3. [Simulating Sandbox States](#3-simulating-sandbox-states)
4. [Webhook Delivery Payload Structure](#4-webhook-delivery-payload-structure)
5. [Error Handling & Exceptions](#5-error-handling--exceptions)

---

## 1. Initialization & Configuration

First, require the SDK module and create an instance of `FinPayClient`. Typically, this client is initialized in a service file or backend gateway wrapper.

```javascript
const FinPayClient = require('@piyush2205/finpay-sdk');

const client = new FinPayClient({
  apiBase: process.env.FINPAY_API_BASE || 'http://localhost:3000/api',
  token: process.env.FINPAY_MERCHANT_JWT // The authenticated JWT token of the merchant
});
```

### Configuration Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `apiBase` | `string` | No (Defaults to local) | The fully qualified base URL of the API Gateway proxy. |
| `token` | `string` | Yes | The authenticated JWT token used to sign requests for wallet and transaction lookups. |

---

## 2. API Reference Guide

### `getWallet()`
Fetches balance details and status metadata associated with the authenticated credentials.

* **Returns:** `Promise<Object>`
* **Response Payload Example:**
  ```json
  {
    "walletId": "w_6a4ead15df290b2e88a38c21",
    "balance": 150000,
    "currency": "INR",
    "status": "active"
  }
  ```
  *(Note: All monetary balances are represented as positive integers in **paisa**, e.g., `150000` = ₹1,500.00).*

---

### `createWallet()`
Generates a new digital wallet ledger profile if the authenticated identity does not already have one.

* **Returns:** `Promise<Object>`
* **Response Payload Example:**
  ```json
  {
    "walletId": "w_6a4ead15df290b2e88a38c21",
    "balance": 0,
    "currency": "INR",
    "status": "active"
  }
  ```

---

### `fundWallet()`
Adds sandbox-tier simulation credits (₹1,000.00) to the merchant wallet profile.

* **Returns:** `Promise<Object>`
* **Response Payload Example:**
  ```json
  {
    "walletId": "w_6a4ead15df290b2e88a38c21",
    "balance": 100000,
    "currency": "INR",
    "status": "active"
  }
  ```

---

### `transfer(params, options)`
Enqueues an asynchronous money transfer through the Distributed Saga engine.

* **Parameters:**
  * `params` (`Object`):
    * `receiverEmail` (`string`, required): Email of the recipient user.
    * `amount` (`number`, required): Amount to transfer in paisa (positive integer).
    * `currency` (`string`, optional): Defaults to `'INR'`.
    * `idempotencyKey` (`string`, required): Client-generated unique UUID to prevent double-charging.
  * `options` (`Object`, optional):
    * `simulateDelay` (`number`): Injects artificial payment-worker latency in milliseconds (e.g., `2000`).
    * `simulateError` (`string`): Forces core transaction validation to decline with a specific exception tag (e.g. `'CARD_DECLINED'`, `'INSUFFICIENT_FUNDS'`).
* **Returns:** `Promise<Object>`
* **Response Payload Example:**
  ```json
  {
    "transactionId": "t_6a4eb23fdf290b2e88a38c92",
    "status": "PENDING",
    "amount": 15000,
    "currency": "INR"
  }
  ```

---

### `getTransaction(transactionId)`
Queries the current state of a ledger transaction block.

* **Parameters:**
  * `transactionId` (`string`, required): The target transaction hash/ID.
* **Returns:** `Promise<Object>`
* **Response Payload Example:**
  ```json
  {
    "_id": "t_6a4eb23fdf290b2e88a38c92",
    "senderId": "6a4ea583df290b2e88a38b14",
    "receiverId": "6a4ea58cdf290b2e88a38b1e",
    "amount": 15000,
    "currency": "INR",
    "status": "COMPLETED",
    "idempotencyKey": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "createdAt": "2026-07-19T18:15:24.120Z",
    "updatedAt": "2026-07-19T18:15:24.950Z"
  }
  ```

---

### `listTransactions(page, limit)`
Lists paginate-enabled ledger log offsets for the authenticated profile.

* **Parameters:**
  * `page` (`number`, optional): Default is `1`.
  * `limit` (`number`, optional): Default is `20`.
* **Returns:** `Promise<Object>`
* **Response Payload Example:**
  ```json
  {
    "transactions": [...],
    "total": 35,
    "page": 1,
    "limit": 20
  }
  ```

---

### `verifyWebhookSignature(payload, signature, secret) [Static]`
Cryptographic validator that verifies HMAC-SHA256 signature headers. Use this inside callback endpoints to protect your routes.

* **Parameters:**
  * `payload` (`Object` \| `string`): The incoming raw webhook request body object or string.
  * `signature` (`string`): The value of the `X-FinPay-Signature` request header.
  * `secret` (`string`): The Webhook Secret key obtained from Developer Settings.
* **Returns:** `boolean` (Returns `true` if authentic, `false` otherwise).
* **Usage:**
  ```javascript
  const isValid = FinPayClient.verifyWebhookSignature(req.body, req.headers['x-finpay-signature'], 'whsec_abcd123...');
  ```

---

## 3. Simulating Sandbox States

The SDK makes it simple to write automated integration tests to confirm how your application handles latency delays or banking failures:

### Testing Latency & Timeouts
To verify that your checkout UI displays progress indicators during prolonged processing times:
```javascript
// Injects a 4-second delay before processing credits/debits
await client.transfer({
  receiverEmail: 'bob@gmail.com',
  amount: 2500,
  idempotencyKey: 'test-delay-key'
}, {
  simulateDelay: 4000
});
```

### Testing Compensating Actions (Refunds)
To verify that your software accurately captures card declines or user limit constraints:
```javascript
// Automatically aborts transaction and reverts lock states
await client.transfer({
  receiverEmail: 'bob@gmail.com',
  amount: 2500,
  idempotencyKey: 'test-decline-key'
}, {
  simulateError: 'CARD_DECLINED'
});
```

---

## 4. Webhook Delivery Payload Structure

When a payment resolves, your configured URL will receive a `POST` request with the following structure:

### Headers
*   `X-FinPay-Signature`: `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824`
*   `X-FinPay-Event`: `payment.completed`
*   `Content-Type`: `application/json`

### Body Payload Schema
```json
{
  "event": "payment.completed",
  "data": {
    "transactionId": "6a4eb23fdf290b2e88a38c92",
    "senderEmail": "alice@gmail.com",
    "receiverEmail": "bob@gmail.com",
    "amount": 15000,
    "currency": "INR",
    "status": "COMPLETED",
    "failureReason": "",
    "timestamp": "2026-07-19T18:15:25.105Z"
  }
}
```

---

## 5. Error Handling & Exceptions

API errors thrown by Axios are captured by the SDK and formatted as readable JS exceptions with diagnostic messages returned by the API gateway:

```javascript
try {
  await client.transfer({
    receiverEmail: 'nonexistent@gmail.com', // triggers error
    amount: 1000,
    idempotencyKey: 'error-key'
  });
} catch (err) {
  console.error('Error Code:', err.message); 
  // Output: "Receiver not found" or "Insufficient balance"
}
```
