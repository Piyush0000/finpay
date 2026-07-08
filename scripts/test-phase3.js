/**
 * FinPay Phase 3 — Asynchronous Processing & Saga Worker Test Suite
 *
 * Verification checklist:
 *   1. Async Acceptance — POST /api/transfers returns 202 Accepted + PENDING immediately.
 *   2. Saga Success — worker processes transfer: debits A, credits B, marks COMPLETED.
 *   3. Idempotency Cache Replay — retrying with same key returns COMPLETED instantly.
 *   4. Saga Compensation (Rollback) — if B's wallet is frozen, A is debited then refunded,
 *      transaction marks FAILED, database remains consistent.
 */

'use strict'

const http = require('http')
const mongoose = require('mongoose')
const Redis = require('ioredis')

const timestamp = Date.now()
let passed = 0
let failed = 0

// Define lightweight schemas for database verification
const walletSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  balance: Number,
  currency: String,
  status: String,
})
const Wallet = mongoose.model('TestWallet', walletSchema, 'wallets')

const ledgerSchema = new mongoose.Schema({
  walletId: mongoose.Schema.Types.ObjectId,
  transactionId: mongoose.Schema.Types.ObjectId,
  type: String,
  amount: Number,
  description: String,
})
const Ledger = mongoose.model('TestLedger', ledgerSchema, 'ledgerentries')

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
  console.log('\n🚀 FinPay Phase 3 — Asynchronous Processing & Saga Worker Test\n')

  // 1. Reset Redis
  try {
    const redis = new Redis('redis://localhost:6379')
    await redis.flushall()
    console.log('🧹 Redis flushed (cleared jobs & limits)')
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

  // ── Setup: Register & Login Users A & B ────────────────────────────
  section('Setup: Register & Fund User A')
  const emailA = `sender_p3_${timestamp}@finpay.test`
  const emailB = `receiver_p3_${timestamp}@finpay.test`
  const password = 'Test1234!'

  const regA = await request('POST', '/api/auth/register', { name: 'Sender P3', email: emailA, password })
  const regB = await request('POST', '/api/auth/register', { name: 'Receiver P3', email: emailB, password })
  
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

  // Directly seed balance of Wallet A to 100000 paisa (₹1000.00) in database
  await Wallet.findByIdAndUpdate(walletAId, { balance: 100000 })
  console.log(`     Funded Wallet A (${walletAId}) with ₹1000.00 (100000 paisa) directly in DB`)

  // ── Test 1: Async Transfer & Saga Execution ──────────────────────────────
  section('1. Async transfer — expect 202 Accepted + final COMPLETED status')
  const key1 = `transfer-key-1-${timestamp}`
  const txRes = await request(
    'POST',
    '/api/transfers',
    { receiverEmail: emailB, amount: 40000, currency: 'INR' },
    { Authorization: `Bearer ${tokenA}`, 'Idempotency-Key': key1 }
  )

  console.log(`     POST /api/transfers response: HTTP ${txRes.status}`, JSON.stringify(txRes.body))
  assert('Status is 202 (Accepted)', txRes.status === 202)
  assert('Initial status is PENDING', txRes.body.status === 'PENDING')

  const txId = txRes.body.transactionId
  assert('Transaction ID returned', !!txId)

  console.log('     Waiting 2.5 seconds for payment-worker to process...')
  await sleep(2500)

  // Check Transaction Status
  const statusRes = await request('GET', `/api/transfers/${txId}`, null, { Authorization: `Bearer ${tokenA}` })
  console.log(`     GET /api/transfers/${txId}:`, JSON.stringify(statusRes.body))
  assert('Final status is COMPLETED', statusRes.body.status === 'COMPLETED')

  // Verify wallet balances in MongoDB
  const walletA = await Wallet.findById(walletAId)
  const walletB = await Wallet.findById(walletBId)
  console.log(`     Wallet A Balance: ${walletA.balance} paisa (expected: 60000)`)
  console.log(`     Wallet B Balance: ${walletB.balance} paisa (expected: 40000)`)
  assert('Wallet A debited correctly', walletA.balance === 60000)
  assert('Wallet B credited correctly', walletB.balance === 40000)

  // Verify Ledger Entries
  const ledgers = await Ledger.find({ transactionId: txId })
  assert('Exactly 2 ledger entries written (debit & credit)', ledgers.length === 2)
  assert('Has debit ledger entry', ledgers.some(l => l.type === 'debit'))
  assert('Has credit ledger entry', ledgers.some(l => l.type === 'credit'))

  // ── Test 2: Idempotency Replay on COMPLETED Transaction ────────────────────
  section('2. Idempotency replay on settled transaction')
  const replayRes = await request(
    'POST',
    '/api/transfers',
    { receiverEmail: emailB, amount: 40000, currency: 'INR' },
    { Authorization: `Bearer ${tokenA}`, 'Idempotency-Key': key1 }
  )
  console.log(`     Replay response: HTTP ${replayRes.status}`, JSON.stringify(replayRes.body))
  assert('Returns settled status COMPLETED', replayRes.body.status === 'COMPLETED')

  const walletA_afterReplay = await Wallet.findById(walletAId)
  assert('Balance remained unchanged', walletA_afterReplay.balance === 60000)

  // ── Test 3: Saga Rollback (Compensation) Path ──────────────────────────────
  section('3. Saga Compensation — rollback on receiver wallet frozen')
  
  // Freeze Wallet B directly in DB
  await Wallet.findByIdAndUpdate(walletBId, { status: 'frozen' })
  console.log(`     Set Wallet B (${walletBId}) status to "frozen" in database`)

  const key2 = `transfer-key-2-${timestamp}`
  const txRes2 = await request(
    'POST',
    '/api/transfers',
    { receiverEmail: emailB, amount: 30000, currency: 'INR' },
    { Authorization: `Bearer ${tokenA}`, 'Idempotency-Key': key2 }
  )

  console.log(`     POST /api/transfers response: HTTP ${txRes2.status}`, JSON.stringify(txRes2.body))
  assert('Status is 202 (Accepted)', txRes2.status === 202)
  
  const txId2 = txRes2.body.transactionId

  console.log('     Waiting 2.5 seconds for payment-worker to execute saga + compensation...')
  await sleep(2500)

  const statusRes2 = await request('GET', `/api/transfers/${txId2}`, null, { Authorization: `Bearer ${tokenA}` })
  console.log(`     GET /api/transfers/${txId2}:`, JSON.stringify(statusRes2.body))
  assert('Transaction status is FAILED', statusRes2.body.status === 'FAILED')
  assert('Failure reason contains rollback or wallet state', 
    statusRes2.body.failureReason?.toLowerCase().includes('frozen') || 
    statusRes2.body.failureReason?.toLowerCase().includes('failed'))

  // Verify wallet balances in MongoDB (A should be refunded to 60000, B should remain at 40000)
  const walletA_final = await Wallet.findById(walletAId)
  const walletB_final = await Wallet.findById(walletBId)
  console.log(`     Wallet A Final Balance: ${walletA_final.balance} paisa (expected: 60000 due to rollback)`)
  console.log(`     Wallet B Final Balance: ${walletB_final.balance} paisa (expected: 40000 due to lock/freeze)`)
  assert('Wallet A refunded successfully (no balance leak)', walletA_final.balance === 60000)
  assert('Wallet B remained unchanged', walletB_final.balance === 40000)

  // Verify Rollback Ledger Entries
  const ledgers2 = await Ledger.find({ transactionId: txId2 })
  console.log('     Ledger entries written:', ledgers2.map(l => `${l.type}: ${l.description}`))
  assert('Contains debit ledger entry', ledgers2.some(l => l.type === 'debit'))
  assert('Contains credit rollback ledger entry', ledgers2.some(l => l.type === 'credit' && l.description.toLowerCase().includes('rollback')))

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50))
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log('═'.repeat(50) + '\n')

  await mongoose.disconnect()

  if (failed === 0) {
    console.log('🎉 Phase 3 complete! Saga Queue + Compensation working perfectly.\n')
  } else {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n💥 Test runner crashed:', err.message)
  process.exit(1)
})
