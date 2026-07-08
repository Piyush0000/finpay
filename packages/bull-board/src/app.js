'use strict'

require('dotenv').config()
const express = require('express')
const { createBullBoard } = require('@bull-board/api')
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter')
const { ExpressAdapter } = require('@bull-board/express')
const { Queue } = require('bullmq')
const { getBullMQConnection, createLogger } = require('@finpay/shared')

const logger = createLogger('bull-board')
const port = process.env.BULL_BOARD_PORT || 3010

const redisConnection = getBullMQConnection()

// Set up the BullMQ queue references
const paymentQueue = new Queue('payment-queue', { connection: redisConnection })
const emailQueue = new Queue('email-queue', { connection: redisConnection })

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/ui')

createBullBoard({
  queues: [
    new BullMQAdapter(paymentQueue),
    new BullMQAdapter(emailQueue)
  ],
  serverAdapter: serverAdapter,
})

const app = express()

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'bull-board', timestamp: new Date().toISOString() })
})

// Mount the dashboard router
app.use('/ui', serverAdapter.getRouter())

// Redirect root to /ui
app.get('/', (req, res) => {
  res.redirect('/ui')
})

app.listen(port, () => {
  logger.info({ port }, `Bull Board UI server active at http://localhost:${port}/ui`)
})
