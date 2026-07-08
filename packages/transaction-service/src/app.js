const express = require('express')
const mongoose = require('mongoose')
const { requestId, errorHandler, createLogger } = require('@finpay/shared')
const config = require('./config')
const transactionRoutes = require('./routes/transaction.routes')

const app = express()
const logger = createLogger('transaction-service')

app.use(express.json())
app.use(requestId)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'transaction-service', timestamp: new Date().toISOString() })
})

app.use('/transfers', transactionRoutes)
app.use(errorHandler)

async function start() {
  await mongoose.connect(config.mongoUri)
  logger.info('Connected to MongoDB')

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'transaction-service started')
  })
}

start().catch((err) => {
  logger.error(err, 'Failed to start transaction-service')
  process.exit(1)
})
