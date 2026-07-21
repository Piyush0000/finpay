# FinPay Node.js SDK

Official Node.js client library wrapper for the **FinPay** distributed payments core. Integrates wallet operations, idempotency handling, Saga simulation states, and webhook signature verification into your Node.js apps.

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
  token: 'YOUR_JWT_ACCESS_TOKEN' // Obtained via auth/login
});
```

### 2. Fetch Wallet Details
Retrieve balance (in paisa) and wallet configurations.

```javascript
async function checkBalance() {
  try {
    const wallet = await finpay.getWallet();
    console.log(`Balance: ₹${(wallet.balance / 100).toFixed(2)}`);
  } catch (err) {
    console.error('Failed:', err.message);
  }
}
```

### 3. Trigger Instant Transfer (With Simulation Headers)
Initiate a transaction. You can pass headers in `options` to test custom sandbox delays or errors.

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
    console.error('Initiation failed:', err.message);
  }
}
```

### 4. Verify Webhooks Signature
FinPay sends signed webhooks when transactions settle. Use the client helper to verify the signature authenticity.

```javascript
const express = require('express');
const app = express();

app.post('/webhooks/payment', express.json(), (req, res) => {
  const signature = req.headers['x-finpay-signature'];
  const secret = 'whsec_your_webhook_hmac_secret'; // Configured in Dev settings

  const isValid = FinPayClient.verifyWebhookSignature(req.body, signature, secret);

  if (!isValid) {
    return res.status(401).send('Invalid webhook signature');
  }

  // Handle Event
  const { event, data } = req.body;
  if (event === 'payment.completed') {
    console.log(`Payment successful for TX ${data.transactionId}`);
  }

  res.status(200).send('Received');
});
```
