/**
 * FinPay Phase 1 — End-to-End Test Script
 *
 * Tests the full happy path:
 *   1. Register User A (sender)
 *   2. Register User B (receiver)
 *   3. Login as User A  → get access token
 *   4. Create wallet for User A
 *   5. Login as User B  → get access token
 *   6. Create wallet for User B
 *   7. POST /transfers from A → B (expects FAILED due to 0 balance — intentional Phase 1)
 *   8. GET /transfers/:id → verify status
 *   9. GET /wallets/me for both users
 *
 * Usage: node scripts/test-phase1.js
 * Requires: docker compose up (services running on port 3000)
 */

const http = require('http')

const BASE_URL = 'http://localhost:3000'

let passed = 0
let failed = 0

// ─── helpers ────────────────────────────────────────────────────────────────

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path)
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
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
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`)
    failed++
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(50))
}

// ─── test runner ─────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🚀 FinPay Phase 1 — End-to-End Test\n')

  const timestamp = Date.now()
  const emailA = `sender_${timestamp}@finpay.test`
  const emailB = `receiver_${timestamp}@finpay.test`

  let tokenA, tokenB, transactionId

  // ── 1. Register User A ───────────────────────────────────────────────────
  section('1. Register User A (sender)')
  {
    const res = await request('POST', '/api/auth/register', {
      name: 'Sender User',
      email: emailA,
      password: 'Test@1234',
    })
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    assert('Status 201', res.status === 201)
    assert('Returns userId', !!res.body.userId)
    assert('Returns email', res.body.email === emailA)
  }

  // ── 2. Register User B ───────────────────────────────────────────────────
  section('2. Register User B (receiver)')
  {
    const res = await request('POST', '/api/auth/register', {
      name: 'Receiver User',
      email: emailB,
      password: 'Test@5678',
    })
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    assert('Status 201', res.status === 201)
    assert('Returns userId', !!res.body.userId)
  }

  // ── 3. Login as User A ───────────────────────────────────────────────────
  section('3. Login as User A')
  {
    const res = await request('POST', '/api/auth/login', {
      email: emailA,
      password: 'Test@1234',
    })
    console.log(`     HTTP ${res.status}`, JSON.stringify({ ...res.body, accessToken: res.body.accessToken?.slice(0, 40) + '...' }))
    assert('Status 200', res.status === 200)
    assert('Returns accessToken', !!res.body.accessToken)
    assert('Returns refreshToken', !!res.body.refreshToken)
    tokenA = res.body.accessToken
  }

  // ── 4. GET /auth/me for User A ───────────────────────────────────────────
  section('4. GET /api/auth/me — User A')
  {
    const res = await request('GET', '/api/auth/me', null, {
      Authorization: `Bearer ${tokenA}`,
    })
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    assert('Status 200', res.status === 200)
    assert('Returns email', res.body.email === emailA)
    assert('Status is active', res.body.status === 'active')
  }

  // ── 5. Create wallet for User A ──────────────────────────────────────────
  section('5. Create Wallet — User A')
  {
    const res = await request('POST', '/api/wallets', {}, {
      Authorization: `Bearer ${tokenA}`,
    })
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    assert('Status 201', res.status === 201)
    assert('Returns walletId', !!res.body.walletId)
    assert('Balance starts at 0', res.body.balance === 0)
    assert('Currency is INR', res.body.currency === 'INR')
  }

  // ── 6. GET /wallets/me for User A ────────────────────────────────────────
  section('6. GET /api/wallets/me — User A')
  {
    const res = await request('GET', '/api/wallets/me', null, {
      Authorization: `Bearer ${tokenA}`,
    })
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    assert('Status 200', res.status === 200)
    assert('Has walletId', !!res.body.walletId)
    assert('Balance is 0', res.body.balance === 0)
  }

  // ── 7. Login as User B and create wallet ─────────────────────────────────
  section('7. Login as User B + Create Wallet')
  {
    const loginRes = await request('POST', '/api/auth/login', {
      email: emailB,
      password: 'Test@5678',
    })
    assert('Login 200', loginRes.status === 200)
    tokenB = loginRes.body.accessToken

    const walletRes = await request('POST', '/api/wallets', {}, {
      Authorization: `Bearer ${tokenB}`,
    })
    console.log(`     Wallet HTTP ${walletRes.status}`, JSON.stringify(walletRes.body))
    assert('Wallet created 201', walletRes.status === 201)
  }

  // ── 8. Duplicate wallet → should 409 ─────────────────────────────────────
  section('8. Duplicate Wallet → expect 409 Conflict')
  {
    const res = await request('POST', '/api/wallets', {}, {
      Authorization: `Bearer ${tokenA}`,
    })
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    assert('Status 409', res.status === 409)
    assert('Error code CONFLICT', res.body.error?.code === 'CONFLICT')
  }

  // ── 9. POST /transfers (insufficient balance → 400 pre-check) ──────────────
  section('9. POST /api/transfers — A → B (balance=0, expect 400 pre-check)')
  {
    const res = await request(
      'POST',
      '/api/transfers',
      { receiverEmail: emailB, amount: 50000, currency: 'INR' },
      { Authorization: `Bearer ${tokenA}`, 'Idempotency-Key': `test-key-${timestamp}` }
    )
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    // Phase 1: balance is checked BEFORE creating a transaction record (fail-fast).
    // The wallet pre-check catches 0 balance → 400 ValidationError.
    // No transaction record is created. This is correct Phase 1 behavior.
    assert('Status 400 (pre-check rejects 0 balance)', res.status === 400)
    assert('Error code VALIDATION_ERROR', res.body.error?.code === 'VALIDATION_ERROR')
    assert('Message mentions balance', res.body.error?.message?.toLowerCase().includes('balance'))
  }

  // ── 10. Verify no transaction record was created ────────────────────────────
  section('10. GET /api/transfers — list is empty (no record created for rejected tx)')
  {
    const res = await request('GET', '/api/transfers?page=1&limit=10', null, {
      Authorization: `Bearer ${tokenA}`,
    })
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    assert('Status 200', res.status === 200)
    assert('No transactions stored (pre-check rejected before DB write)', res.body.total === 0)
  }

  // ── 11. GET /transfers (list) ─────────────────────────────────────────────
  section('11. GET /api/transfers — paginated list')
  {
    const res = await request('GET', '/api/transfers?page=1&limit=10', null, {
      Authorization: `Bearer ${tokenA}`,
    })
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    assert('Status 200', res.status === 200)
    assert('Has transactions array', Array.isArray(res.body.transactions))
    assert('Has total', typeof res.body.total === 'number')
  }

  // ── 12. Token refresh ─────────────────────────────────────────────────────
  section('12. POST /api/auth/refresh — token rotation')
  {
    const loginRes = await request('POST', '/api/auth/login', { email: emailA, password: 'Test@1234' })
    const oldRefreshToken = loginRes.body.refreshToken

    const refreshRes = await request('POST', '/api/auth/refresh', { refreshToken: oldRefreshToken })
    console.log(`     HTTP ${refreshRes.status}`, JSON.stringify({
      ...refreshRes.body,
      accessToken: refreshRes.body.accessToken?.slice(0, 40) + '...',
    }))
    assert('Status 200', refreshRes.status === 200)
    assert('New accessToken returned', !!refreshRes.body.accessToken)
    assert('New refreshToken returned', !!refreshRes.body.refreshToken)
    assert('Token rotated (different)', refreshRes.body.refreshToken !== oldRefreshToken)

    // ── 13. Old token should now be rejected
    const replayRes = await request('POST', '/api/auth/refresh', { refreshToken: oldRefreshToken })
    console.log(`     Replay HTTP ${replayRes.status}`, JSON.stringify(replayRes.body))
    assert('Old token rejected 401', replayRes.status === 401)
  }

  // ── 14. Unauthorized access without token ────────────────────────────────
  section('14. No-token requests → expect 401')
  {
    const res = await request('GET', '/api/wallets/me')
    console.log(`     HTTP ${res.status}`, JSON.stringify(res.body))
    assert('Status 401', res.status === 401)
    assert('Error code UNAUTHORIZED', res.body.error?.code === 'UNAUTHORIZED')
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log('═'.repeat(50))

  if (failed > 0) process.exit(1)
}

run().catch((err) => {
  console.error('\n💥 Test runner crashed:', err.message)
  if (err.code === 'ECONNREFUSED') {
    console.error('   → Is the API Gateway running? Try: docker compose up')
  }
  process.exit(1)
})
