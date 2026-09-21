const express = require('express')
const mongoose = require('mongoose')
const { requestId, errorHandler, createLogger, initializeTracing } = require('@finpay/shared')
const config = require('./config')
const walletRoutes = require('./routes/wallet.routes')

// Initialize OpenTelemetry tracing
initializeTracing({
  serviceName: 'wallet-service',
  serviceVersion: '1.0.0'
})

const app = express()
const logger = createLogger('wallet-service')

app.use(express.json())
app.use(requestId)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'wallet-service', timestamp: new Date().toISOString() })
})

app.use('/wallets', walletRoutes)
app.use(errorHandler)

async function start() {
  await mongoose.connect(config.mongoUri)
  logger.info('Connected to MongoDB')

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'wallet-service started')
  })
}

start().catch((err) => {
  logger.error(err, 'Failed to start wallet-service')
  process.exit(1)
})
