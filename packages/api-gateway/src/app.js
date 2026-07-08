const express = require('express')
const { requestId, createLogger } = require('@finpay/shared')
const { jwtVerify } = require('./middleware/jwtVerify')
const { setupRoutes } = require('./routes')
const config = require('./config')

const app = express()
const logger = createLogger('api-gateway')

// NOTE: Do NOT add express.json() here — the gateway is a pure proxy.
// Parsing the body here consumes the stream; downstream services would receive
// an empty body. JWT verification only reads headers, so no body parsing needed.
app.use(requestId)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() })
})

setupRoutes(app, jwtVerify)

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'api-gateway started')
})
