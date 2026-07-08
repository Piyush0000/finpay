/**
 * FinPay Phase 4 — Analytics & Notifications Integration Test Suite
 *
 * Verification checklist:
 *   1. Event-Driven Propagation — successful transfer publishes stream/PubSub events.
 *   2. Analytics Consumption — analytics-service consumes Stream, upserts sender/receiver metrics.
 *   3. Email Dispatch — notification-service consumes PubSub, schedules/logs audit emails.
 *   4. Failure State Metrics — failed transfer increments failedCount without modifying totalSent.
 *   5. Failure Notification — failed transfer dispatches failure email notice to sender.
 */

'use strict'

const http = require('http')
const mongoose = require('mongoose')
const Redis = require('ioredis')

const timestamp = Date.now()
let passed = 0
let failed = 0

// Define database schemas for direct verification
const walletSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  balance: Number,
  currency: String,
  status: String,
})
const Wallet = mongoose.model('TestWalletP4', walletSchema, 'wallets')

const notificationSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  transactionId: mongoose.Schema.Types.ObjectId,
  type: String,
  recipientEmail: String,
  subject: String,
  body: String,
  status: String,
})
const Notification = mongoose.model('TestNotificationP4', notificationSchema, 'notifications')

// ── helpers ────────────────────────────────────────────────────────────────────
function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    }
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers })
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers })
        }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}`)
    failed++
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(50))
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 FinPay Phase 4 — Analytics & Notifications Test\n')

  // 1. Reset Redis
  try {
    const redis = new Redis('redis://localhost:6379')
    await redis.flushall()
    console.log('🧹 Redis flushed (cleared queues, streams, limits)')
    await redis.quit()
  } catch (err) {
    console.log('⚠️ Could not flush Redis:', err.message)
  }

  // 2. Connect MongoDB
  try {
    await mongoose.connect('mongodb://localhost:27017/finpay')
    console.log('🌱 Connected to MongoDB for database verification')
  } catch (err) {
    console.error('💥 Failed to connect to MongoDB:', err.message)
    process.exit(1)
  }

  // ── Setup: Register & Fund User A ────────────────────────────
  section('Setup: Register & Fund User A')
  const emailA = `sender_p4_${timestamp}@finpay.test`
  const emailB = `receiver_p4_${timestamp}@finpay.test`
  const password = 'Test1234!'

  const regA = await request('POST', '/api/auth/register', { name: 'Sender P4', email: emailA, password })
  const regB = await request('POST', '/api/auth/register', { name: 'Receiver P4', email: emailB, password })
  
  const loginA = await request('POST', '/api/auth/login', { email: emailA, password })
  const loginB = await request('POST', '/api/auth/login', { email: emailB, password })
  const tokenA = loginA.body.accessToken
  const tokenB = loginB.body.accessToken

  assert('Users registered successfully', regA.status === 201 && regB.status === 201)
  assert('Logins completed successfully', !!tokenA && !!tokenB)

  // Create Wallets
  const walletARes = await request('POST', '/api/wallets', null, { Authorization: `Bearer ${tokenA}` })
  const walletBRes = await request('POST', '/api/wallets', null, { Authorization: `Bearer ${tokenB}` })
  
  const walletAId = walletARes.body.walletId
  const walletBId = walletBRes.body.walletId

  assert('Wallets created', !!walletAId && !!walletBId)

  // Seed balance of Wallet A to 100000 paisa (₹1000.00) in database
  await Wallet.findByIdAndUpdate(walletAId, { balance: 100000 })
  console.log(`     Funded Wallet A (${walletAId}) with ₹1000.00 directly in DB`)

  // ── Test 1: Successful Transfer Event Chain ──────────────────────────────
  section('1. Trigger successful transfer & verify eventual updates')
  const key1 = `transfer-p4-key-1-${timestamp}`
  const txRes = await request(
    'POST',
    '/api/transfers',
    { receiverEmail: emailB, amount: 25000, currency: 'INR' },
    { Authorization: `Bearer ${tokenA}`, 'Idempotency-Key': key1 }
  )

  assert('Transfer request accepted (202)', txRes.status === 202)
  const txId = txRes.body.transactionId
  assert('Transaction ID is returned', !!txId)

  console.log('     Waiting 3.5 seconds for workers to process and propagate events...')
  await sleep(3500)

  // Check Transaction Completed
  const statusRes = await request('GET', `/api/transfers/${txId}`, null, { Authorization: `Bearer ${tokenA}` })
  assert('Final status is COMPLETED', statusRes.body.status === 'COMPLETED')

  // Verify Analytics for Sender A via API Gateway
  console.log('     Fetching sender summary via Gateway (GET /api/analytics/summary)...')
  const senderAnalytics = await request('GET', '/api/analytics/summary', null, { Authorization: `Bearer ${tokenA}` })
  console.log('     Sender aggregate data:', JSON.stringify(senderAnalytics.body))
  assert('Sender summary HTTP 200', senderAnalytics.status === 200)
  assert('Sender totalSent is 25000', senderAnalytics.body.totalSent === 25000)
  assert('Sender totalReceived is 0', senderAnalytics.body.totalReceived === 0)
  assert('Sender transactionCount is 1', senderAnalytics.body.transactionCount === 1)
  assert('Sender failedCount is 0', senderAnalytics.body.failedCount === 0)

  // Verify Analytics for Receiver B via API Gateway
  console.log('     Fetching receiver summary via Gateway...')
  const receiverAnalytics = await request('GET', '/api/analytics/summary', null, { Authorization: `Bearer ${tokenB}` })
  console.log('     Receiver aggregate data:', JSON.stringify(receiverAnalytics.body))
  assert('Receiver summary HTTP 200', receiverAnalytics.status === 200)
  assert('Receiver totalSent is 0', receiverAnalytics.body.totalSent === 0)
  assert('Receiver totalReceived is 25000', receiverAnalytics.body.totalReceived === 25000)
  assert('Receiver transactionCount is 1', receiverAnalytics.body.transactionCount === 1)

  // Verify Notification Records in MongoDB directly
  console.log('     Verifying dispatch of audit emails in MongoDB...')
  const notifications = await Notification.find({ transactionId: txId })
  console.log(`     Found ${notifications.length} email records:`, notifications.map(n => `${n.recipientEmail}: ${n.status}`))
  assert('Exactly 2 email records generated (sender debit notice, receiver credit notice)', notifications.length === 2)
  assert('Sender email status is SENT', notifications.find(n => n.recipientEmail === emailA)?.status === 'SENT')
  assert('Receiver email status is SENT', notifications.find(n => n.recipientEmail === emailB)?.status === 'SENT')

  // ── Test 2: Failed Transfer Event Chain (Saga Compensation) ───────────────
  section('2. Trigger failed transfer (receiver frozen) & verify rollback metrics')
  
  // Freeze Wallet B directly in DB
  await Wallet.findByIdAndUpdate(walletBId, { status: 'frozen' })
  console.log(`     Set Wallet B (${walletBId}) status to "frozen" in database`)

  const key2 = `transfer-p4-key-2-${timestamp}`
  const txRes2 = await request(
    'POST',
    '/api/transfers',
    { receiverEmail: emailB, amount: 15000, currency: 'INR' },
    { Authorization: `Bearer ${tokenA}`, 'Idempotency-Key': key2 }
  )

  assert('Transfer request accepted (202)', txRes2.status === 202)
  const txId2 = txRes2.body.transactionId

  console.log('     Waiting 3.5 seconds for compensation + failed event stream processing...')
  await sleep(3500)

  // Check Transaction Failed
  const statusRes2 = await request('GET', `/api/transfers/${txId2}`, null, { Authorization: `Bearer ${tokenA}` })
  assert('Final status is FAILED', statusRes2.body.status === 'FAILED')

  // Verify Analytics for Sender A (should reflect failures)
  console.log('     Re-fetching sender summary...')
  const senderAnalytics2 = await request('GET', '/api/analytics/summary', null, { Authorization: `Bearer ${tokenA}` })
  console.log('     Sender aggregate data after failure:', JSON.stringify(senderAnalytics2.body))
  assert('totalSent remains 25000 (failed amounts not counted)', senderAnalytics2.body.totalSent === 25000)
  assert('failedCount incremented to 1', senderAnalytics2.body.failedCount === 1)
  assert('transactionCount incremented to 2', senderAnalytics2.body.transactionCount === 2)

  // Verify Analytics for Receiver B (should NOT have changed)
  const receiverAnalytics2 = await request('GET', '/api/analytics/summary', null, { Authorization: `Bearer ${tokenB}` })
  assert('Receiver totalReceived remains 25000', receiverAnalytics2.body.totalReceived === 25000)
  assert('Receiver transactionCount remains 1 (did not count failure)', receiverAnalytics2.body.transactionCount === 1)

  // Verify Failure Notification for Sender
  console.log('     Verifying failure notice dispatch in MongoDB...')
  const notifications2 = await Notification.find({ transactionId: txId2 })
  console.log(`     Found ${notifications2.length} email records for failed TX:`, notifications2.map(n => `${n.recipientEmail}: ${n.subject} (${n.status})`))
  assert('Exactly 1 email record generated (debit failure warning for sender)', notifications2.length === 1)
  assert('Recipient is Sender A', notifications2[0].recipientEmail === emailA)
  assert('Subject contains Failed label', notifications2[0].subject.includes('Failed'))
  assert('Email status is SENT', notifications2[0].status === 'SENT')

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50))
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log('═'.repeat(50) + '\n')

  await mongoose.disconnect()

  if (failed === 0) {
    console.log('🎉 Phase 4 complete! Events, Analytics, and Notifications working flawlessly.\n')
  } else {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n💥 Test runner crashed:', err.message)
  process.exit(1)
})
