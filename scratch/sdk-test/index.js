const axios = require('axios');
const FinPayClient = require('@piyush2205/finpay-sdk');

const API_BASE = 'http://localhost:3000/api';

async function runTest() {
  console.log('🚀 Starting end-to-end integration test for @piyush2205/finpay-sdk...\n');

  try {
    // 1. Log in to get Alice's JWT token
    console.log('🔑 Authenticating as Alice (alice@gmail.com)...');
    const authRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'alice@gmail.com',
      password: 'Password123!'
    });
    const token = authRes.data.accessToken;
    console.log('✅ Authentication successful! JWT Token acquired.\n');

    // 2. Initialize the FinPay SDK Client
    const finpay = new FinPayClient({
      apiBase: API_BASE,
      token: token
    });

    // 3. Get initial wallet balance
    console.log('🔍 Fetching Alice\'s wallet details...');
    const initialWallet = await finpay.getWallet();
    console.log(`💳 Wallet ID: ${initialWallet.walletId}`);
    console.log(`💰 Current Balance: ₹${(initialWallet.balance / 100).toFixed(2)}\n`);

    // 4. Initiate an Instant Transfer to Bob
    const amount = 150; // ₹1.50 in paisa
    const idempotencyKey = 'test-sdk-key-' + Date.now();
    console.log(`💸 Transferring ₹${(amount / 100).toFixed(2)} to bob@gmail.com...`);
    
    const transferRes = await finpay.transfer({
      receiverEmail: 'bob@gmail.com',
      amount,
      currency: 'INR',
      idempotencyKey
    }, {
      simulateDelay: 1000 // Injects 1s sandbox latency to let us poll
    });

    const txId = transferRes.transactionId;
    console.log(`✅ Saga Enqueued! Transaction ID: ${txId}`);
    console.log(`⏱️ Status: ${transferRes.status} (Polling status in 2 seconds...)\n`);

    // 5. Wait for background worker settlement
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 6. Query final transaction status
    console.log('🔍 Auditing transaction state...');
    const txDetails = await finpay.getTransaction(txId);
    console.log(`📊 Final Status: ${txDetails.status}`);
    console.log(`📅 Settled At: ${txDetails.updatedAt || txDetails.createdAt}\n`);

    // 7. Get updated wallet balance
    console.log('🔄 Checking updated balance...');
    const finalWallet = await finpay.getWallet();
    console.log(`💰 New Balance: ₹${(finalWallet.balance / 100).toFixed(2)}`);
    console.log('🎉 SDK Integration test finished successfully!');

  } catch (err) {
    console.error('❌ Test failed with error:', err.message);
  }
}

runTest();
