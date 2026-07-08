const express = require('express')
const mongoose = require('mongoose')
const { requestId, errorHandler, createLogger } = require('@finpay/shared')
const config = require('./config')
const authRoutes = require('./routes/auth.routes')

const app = express()
const logger = createLogger('auth-service')

app.use(express.json())
app.use(requestId)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() })
})

app.use('/auth', authRoutes)
app.use(errorHandler)

async function start() {
  await mongoose.connect(config.mongoUri)
  logger.info('Connected to MongoDB')

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'auth-service started')
  })
}

start().catch((err) => {
  logger.error(err, 'Failed to start auth-service')
  process.exit(1)
})
