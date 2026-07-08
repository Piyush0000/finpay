/**
 * FinPay LinkedIn Seeding Script
 * 
 * This script automates registering 5 users, initializing their wallets,
 * funding them, and executing 15 sequential transfers (both successful and failed).
 * 
 * Because it uses the live HTTP endpoints:
 *   - Real transactions are logged.
 *   - Real BullMQ queue jobs are processed.
 *   - Real notification emails are scheduled.
 *   - Real analytics stream event aggregates are computed.
 */

'use strict'

const http = require('http')
const mongoose = require('mongoose')

const API_BASE_URL = 'http://localhost:3000/api'
const MONGODB_URI = 'mongodb://localhost:27017/finpay'

// Define Wallet model for direct database manipulation (freezing)
const walletSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  balance: Number,
  currency: String,
  status: String,
})
const Wallet = mongoose.model('LinkedInSeedWallet', walletSchema, 'wallets')

// Helper to make HTTP requests
function apiRequest(method, path, body = null, token = null, idempotencyKey = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
    }

    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers,
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, body: data })
        }
      })
    })

    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

async function apiRequestWithRetry(method, path, body = null, token = null, idempotencyKey = null) {
  while (true) {
    const res = await apiRequest(method, path, body, token, idempotencyKey)
    if (res.status === 429) {
      const waitTime = (res.body?.error?.retryAfter || 5) + 1
      console.log(`      ⚠️ API Gateway Rate Limited. Sleeping for ${waitTime}s before retry...`)
      await new Promise(r => setTimeout(r, waitTime * 1000))
      continue
    }
    return res
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run() {
  console.log('🌱 Starting LinkedIn data seeding script...\n')

  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Clean up old runs for these emails to avoid password conflict
    const targetEmails = ['alice@gmail.com', 'bob@gmail.com', 'charlie@gmail.com', 'diana@gmail.com', 'ethan@gmail.com']
    const users = await mongoose.connection.db.collection('users').find({ email: { $in: targetEmails } }).toArray()
    const userIds = users.map(u => u._id)

    if (userIds.length > 0) {
      console.log('🧹 Cleaning old test data for seed users...')
      await mongoose.connection.db.collection('users').deleteMany({ email: { $in: targetEmails } })
      await mongoose.connection.db.collection('wallets').deleteMany({ userId: { $in: userIds } })
      await mongoose.connection.db.collection('transactions').deleteMany({
        $or: [{ senderId: { $in: userIds } }, { receiverId: { $in: userIds } }]
      })
      await mongoose.connection.db.collection('ledgerentries').deleteMany({
        $or: [{ walletId: { $in: userIds.map(id => id.toString()) } }] // standard check
      })
      // Clear all aggregates
      await mongoose.connection.db.collection('analyticsaggregates').deleteMany({ userId: { $in: userIds } })
      await mongoose.connection.db.collection('notifications').deleteMany({ userId: { $in: userIds } })
    }
  } catch (err) {
    console.error('❌ MongoDB Connection failed:', err.message)
    process.exit(1)
  }

  // 1. User details
  const password = 'Password123!'
  const usersToSeed = [
    { name: 'Alice Smith', email: 'alice@gmail.com' },
    { name: 'Bob Jones', email: 'bob@gmail.com' },
    { name: 'Charlie Brown', email: 'charlie@gmail.com' },
    { name: 'Diana Prince', email: 'diana@gmail.com' },
    { name: 'Ethan Hunt', email: 'ethan@gmail.com' },
  ]

  const sessionTokens = {}
  const walletIds = {}

  // 2. Register & Login Users
  console.log('\n🔐 Creating user accounts...')
  for (const u of usersToSeed) {
    // Try registering (fails gracefully if already exists)
    await apiRequestWithRetry('POST', '/api/auth/register', { name: u.name, email: u.email, password })
    
    // Login to obtain JWT token
    const loginRes = await apiRequestWithRetry('POST', '/api/auth/login', { email: u.email, password })
    if (loginRes.status === 200 && loginRes.body.accessToken) {
      sessionTokens[u.email] = loginRes.body.accessToken
      console.log(`   Registered & Logged in: ${u.name} (${u.email})`)
    } else {
      console.error(`   Failed to login ${u.email}:`, loginRes.body)
    }
  }

  // 3. Create & Fund Wallets
  console.log('\n💳 Creating and seeding wallets...')
  for (const u of usersToSeed) {
    const token = sessionTokens[u.email]
    if (!token) continue

    // Create wallet
    const walletRes = await apiRequestWithRetry('POST', '/api/wallets', null, token)
    let walletId = walletRes.body.walletId

    // If wallet already exists, retrieve it
    if (walletRes.status !== 201) {
      const getWallet = await apiRequestWithRetry('GET', '/api/wallets/me', null, token)
      walletId = getWallet.body.walletId
    }

    walletIds[u.email] = walletId
    console.log(`   Wallet configured for ${u.email}: ${walletId}`)

    // Fund wallet with 5 mock units (₹5,000.00 total)
    for (let i = 0; i < 5; i++) {
      await apiRequestWithRetry('POST', '/api/wallets/me/fund', null, token)
    }
    console.log(`   Funded ${u.email} wallet with ₹5,000.00`)
  }

  // 4. Freeze Ethan's wallet to trigger rollback failures
  console.log('\n❄️ Freezing Ethan Hunt\'s wallet to simulate compensation rollbacks...')
  const ethanWalletId = walletIds['ethan@gmail.com']
  if (ethanWalletId) {
    await Wallet.findByIdAndUpdate(ethanWalletId, { status: 'frozen' })
    console.log(`   Ethan's Wallet (${ethanWalletId}) marked as "frozen" in Database`)
  }

  // 5. Transfer schedule
  const transfers = [
    { sender: 'alice@gmail.com', receiver: 'bob@gmail.com', amount: 15000 },
    { sender: 'bob@gmail.com', receiver: 'charlie@gmail.com', amount: 8000 },
    { sender: 'charlie@gmail.com', receiver: 'diana@gmail.com', amount: 12000 },
    // This one will trigger Saga failure & compensation because Ethan's wallet is frozen
    { sender: 'diana@gmail.com', receiver: 'ethan@gmail.com', amount: 20000 },
    { sender: 'alice@gmail.com', receiver: 'charlie@gmail.com', amount: 35000 },
    { sender: 'bob@gmail.com', receiver: 'alice@gmail.com', amount: 45000 },
    { sender: 'charlie@gmail.com', receiver: 'bob@gmail.com', amount: 22000 },
    { sender: 'diana@gmail.com', receiver: 'alice@gmail.com', amount: 5000 },
    { sender: 'alice@gmail.com', receiver: 'diana@gmail.com', amount: 120000 },
    // Another failure due to frozen wallet
    { sender: 'ethan@gmail.com', receiver: 'charlie@gmail.com', amount: 10000 },
    { sender: 'bob@gmail.com', receiver: 'diana@gmail.com', amount: 3000 },
    // Insufficient balance failure (Alice has ~ ₹3,500 left but tries to send ₹8,000)
    { sender: 'alice@gmail.com', receiver: 'bob@gmail.com', amount: 800000 },
    { sender: 'charlie@gmail.com', receiver: 'alice@gmail.com', amount: 14000 },
    { sender: 'diana@gmail.com', receiver: 'charlie@gmail.com', amount: 9000 },
    { sender: 'alice@gmail.com', receiver: 'bob@gmail.com', amount: 50000 },
  ]

  console.log('\n💸 Dispatching 15 mock transfers to queue stream...')
  let counter = 1
  for (const t of transfers) {
    const token = sessionTokens[t.sender]
    if (!token) {
      console.error(`      Skipping transfer: Sender token missing for ${t.sender}`)
      counter++
      continue
    }
    const idemKey = `linkedin-seed-${counter}-${Date.now()}`
    
    console.log(`   [${counter}/15] Sending ₹${(t.amount/100).toFixed(2)} from ${t.sender} to ${t.receiver}...`)
    const res = await apiRequestWithRetry(
      'POST',
      '/api/transfers',
      { receiverEmail: t.receiver, amount: t.amount, currency: 'INR' },
      token,
      idemKey
    )

    if (res.status === 202) {
      console.log(`      Queued successfully: TX ID ${res.body.transactionId}`)
    } else {
      console.error(`      Enqueue failed:`, res.body)
    }

    counter++
    await sleep(400) // Small delay to let jobs flow sequentially
  }

  console.log('\n⌛ Waiting 8 seconds for workers to process and settle remaining queues...')
  await sleep(8000)

  console.log('\n✨ Database seeding completed successfully!')
  console.log('💡 Alice Smith (alice@gmail.com / Password123!) has been fully populated with balances, ledger lines, and graphs.')
  console.log('💡 Bull Board (http://localhost:3010/ui) now contains a mix of Completed and Failed jobs in payment-queue and email-queue!\n')

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('💥 Seeder crashed:', err)
  process.exit(1)
})
