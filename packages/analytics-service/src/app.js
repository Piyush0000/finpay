'use strict'

require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const { requestId, errorHandler, getRedisClient, createLogger } = require('@finpay/shared')
const AnalyticsAggregate = require('./models/AnalyticsAggregate')

const logger = createLogger('analytics-service')
const port = process.env.ANALYTICS_SERVICE_PORT || 3005
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/finpay'

// ── Express Setup ─────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())
app.use(requestId)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'analytics-service', timestamp: new Date().toISOString() })
})

/**
 * GET /analytics/summary
 * Exposes aggregate statistics for the authenticated user.
 */
app.get('/analytics/summary', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id']
    if (!userId) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing user header' } })
    }

    // Default to current YYYY-MM
    const currentPeriod = new Date().toISOString().slice(0, 7)
    const period = req.query.period || currentPeriod

    let aggregate = await AnalyticsAggregate.findOne({ userId, period })

    // If no data exists yet for this month, return an empty default payload instead of 404
    if (!aggregate) {
      aggregate = {
        userId,
        period,
        totalSent: 0,
        totalReceived: 0,
        transactionCount: 0,
        failedCount: 0,
      }
    }

    res.json(aggregate)
  } catch (err) {
    next(err)
  }
})

app.use(errorHandler)

// ── Event Processing ───────────────────────────────────────────────────────────
async function processEvent(event) {
  const { transactionId, senderId, receiverId, amount, status, settledAt } = event
  logger.info({ transactionId, status }, 'Aggregating metrics for payment event')

  const period = new Date(settledAt).toISOString().slice(0, 7) // Format: YYYY-MM
  const isCompleted = status === 'COMPLETED'

  try {
    // 1. Update Sender aggregates
    await AnalyticsAggregate.findOneAndUpdate(
      { userId: senderId, period },
      {
        $inc: {
          totalSent: isCompleted ? amount : 0,
          transactionCount: 1,
          failedCount: isCompleted ? 0 : 1,
        },
      },
      { upsert: true, new: true }
    )

    // 2. Update Receiver aggregates (only if transaction succeeded)
    if (isCompleted) {
      await AnalyticsAggregate.findOneAndUpdate(
        { userId: receiverId, period },
        {
          $inc: {
            totalReceived: amount,
            transactionCount: 1,
          },
        },
        { upsert: true, new: true }
      )
    }

    logger.info({ transactionId }, 'Metrics aggregated successfully')
  } catch (err) {
    logger.error({ err, transactionId }, 'Failed to aggregate metrics for event')
    throw err // Throw so message is NOT acknowledged and will be re-delivered
  }
}

async function ensureConsumerGroupExists(redis, stream, group) {
  try {
    await redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM')
    logger.info({ group, stream }, 'Created Redis Stream consumer group')
  } catch (err) {
    if (!err.message.includes('BUSYGROUP')) {
      logger.error({ err }, 'Failed to create Redis Stream consumer group')
      throw err
    }
  }
}

// ── Redis Stream Consumer ──────────────────────────────────────────────────────
async function startConsumer() {
  const redis = getRedisClient()
  const group = 'finpay-analytics'
  const stream = 'stream:payment.events'

  // Create Consumer Group if it does not already exist
  await ensureConsumerGroupExists(redis, stream, group)

  logger.info({ group, stream }, 'Redis Stream consumer group verified active')

  const consumerName = 'analytics-consumer-1'

  // Infinite polling loop
  while (true) {
    try {
      // Read new messages that have not been delivered to other consumers ('>')
      const data = await redis.xreadgroup(
        'GROUP', group, consumerName,
        'COUNT', '10',
        'BLOCK', '2000', // Block for up to 2 seconds if no events exist
        'STREAMS', stream,
        '>'
      )

      if (!data) continue

      const [_, messages] = data[0]
      for (const message of messages) {
        const [msgId, fields] = message
        const eventIndex = fields.indexOf('event')
        
        if (eventIndex !== -1) {
          const eventPayload = JSON.parse(fields[eventIndex + 1])
          await processEvent(eventPayload)
        }

        // Acknowledge the message so it's removed from PEL (Pending Entries List)
        await redis.xack(stream, group, msgId)
      }
    } catch (err) {
      if (err.message.includes('NOGROUP')) {
        logger.warn('Redis Stream consumer group missing (likely due to FLUSHALL). Re-creating group...')
        try {
          await ensureConsumerGroupExists(redis, stream, group)
        } catch (createErr) {
          logger.error({ createErr }, 'Failed to recreate consumer group during self-healing')
        }
      } else {
        logger.error({ err }, 'Error in Redis Stream consumer loop, retrying in 5 seconds...')
      }
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

// ── Startup ────────────────────────────────────────────────────────────────────
async function start() {
  await mongoose.connect(mongoUri)
  logger.info('Connected to MongoDB')

  // Start HTTP server
  app.listen(port, () => {
    logger.info({ port }, 'analytics-service started')
  })

  // Start background worker stream consumer
  startConsumer().catch((err) => {
    logger.error({ err }, 'Redis Stream consumer failed crash loop')
  })
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start analytics-service')
  process.exit(1)
})
