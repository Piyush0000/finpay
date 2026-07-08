const express = require('express')
const { requestId, createLogger, createRateLimiter } = require('@finpay/shared')
const { jwtVerify } = require('./middleware/jwtVerify')
const { setupRoutes } = require('./routes')
const config = require('./config')

const app = express()
const logger = createLogger('api-gateway')

// NOTE: Do NOT add express.json() here — the gateway is a pure proxy.
// Parsing the body here consumes the stream; downstream services would receive
// an empty body. JWT verification only reads headers, so no body parsing needed.
app.use(requestId)

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Strict limit on auth routes — prevents brute-force password attacks
const authRateLimiter = createRateLimiter({
  limit: 20,
  windowSeconds: 15 * 60, // 15 minutes
  keyPrefix: 'auth',
})

// Standard limit for all other API routes
const globalRateLimiter = createRateLimiter({
  limit: 100,
  windowSeconds: 60, // 1 minute
  keyPrefix: 'global',
})

app.use('/api/auth', authRateLimiter)
app.use('/api', globalRateLimiter)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() })
})

setupRoutes(app, jwtVerify)

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'api-gateway started')
})
