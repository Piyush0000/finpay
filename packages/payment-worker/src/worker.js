'use strict'

require('dotenv').config()
const mongoose = require('mongoose')
const axios = require('axios')
const { Worker } = require('bullmq')
const { getRedisClient, getBullMQConnection, createLogger } = require('@finpay/shared')
const Transaction = require('./models/Transaction')
const LedgerEntry = require('./models/LedgerEntry')

const logger = createLogger('payment-worker')

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/finpay'
const walletServiceUrl = process.env.WALLET_SERVICE_URL || 'http://localhost:3002'

const walletClient = axios.create({ baseURL: walletServiceUrl })
const IDEMPOTENCY_TTL_SECONDS = 86400

async function publishPaymentEvent(tx) {
  try {
    const redis = getRedisClient()
    const event = {
      transactionId: tx._id.toString(),
      senderId: tx.senderId.toString(),
      receiverId: tx.receiverId.toString(),
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      failureReason: tx.failureReason || '',
      settledAt: (tx.completedAt || new Date()).toISOString(),
    }
    // 1. Publish to Redis Stream (durable, replayable)
    await redis.xadd('stream:payment.events', 'MAXLEN', '~', '10000', '*', 'event', JSON.stringify(event))

    // 2. Publish to Redis PubSub (fire-and-forget channel subscription)
    const channel = `channel:payment.${tx.status.toLowerCase()}`
    await redis.publish(channel, JSON.stringify(event))

    logger.info({ transactionId: tx._id.toString(), status: tx.status, channel }, 'Payment event published to Redis Stream and PubSub')
  } catch (err) {
    logger.error({ err, txId: tx._id.toString() }, 'Failed to publish payment event')
  }
}

async function updateIdempotencyCache(tx) {
  if (!tx.idempotencyKey) return
  try {
    const redis = getRedisClient()
    const cacheKey = `idempotency:${tx.senderId}:${tx.idempotencyKey}`
    await redis.set(cacheKey, JSON.stringify(tx), 'EX', IDEMPOTENCY_TTL_SECONDS)
  } catch (err) {
    logger.error({ err, txId: tx._id }, 'Failed to update idempotency cache in worker')
  }
}

async function connectMongo() {
  await mongoose.connect(mongoUri)
  logger.info('Connected to MongoDB')
}

async function start() {
  await connectMongo()

  const redisConnection = getBullMQConnection()

  const worker = new Worker(
    'payment-queue',
    async (job) => {
      const { transactionId, simulateDelay, simulateError } = job.data
      logger.info({ transactionId, jobId: job.id }, 'Processing payment job')

      const tx = await Transaction.findById(transactionId)
      if (!tx) {
        logger.error({ transactionId }, 'Transaction not found')
        return
      }

      // If already settled, do nothing (idempotent job run)
      if (['COMPLETED', 'FAILED', 'ROLLED_BACK'].includes(tx.status)) {
        logger.info({ transactionId, status: tx.status }, 'Transaction already settled, skipping')
        return
      }

      // ── Artificial Latency Simulation ──────────────────────────────────────
      if (simulateDelay) {
        logger.info({ transactionId, simulateDelay }, 'Simulating artificial latency delay...')
        await new Promise(r => setTimeout(r, simulateDelay))
      }

      // ── Artificial Error Simulation ────────────────────────────────────────
      if (simulateError) {
        logger.warn({ transactionId, simulateError }, 'Simulating artificial transaction error')
        tx.status = 'FAILED'
        tx.failureReason = `Simulated error: ${simulateError}`
        await tx.save()
        await updateIdempotencyCache(tx)
        await publishPaymentEvent(tx)
        return
      }

      // Update to PROCESSING if it is currently PENDING
      if (tx.status === 'PENDING') {
        tx.status = 'PROCESSING'
        await tx.save()
        await updateIdempotencyCache(tx)
      }

      let debitSucceeded = false

      // ── Step 1: Debit Sender ────────────────────────────────────────────────
      try {
        const debitLedger = await LedgerEntry.findOne({ transactionId: tx._id, type: 'debit' })
        if (debitLedger) {
          logger.info({ transactionId }, 'Debit already processed in a previous attempt, skipping to credit')
          debitSucceeded = true
        } else {
          // Perform debit via wallet-service
          await walletClient.post('/wallets/internal/debit', {
            walletId: tx.senderWalletId,
            amount: tx.amount,
            transactionId: tx._id,
            description: 'Transfer out',
          })
          logger.info({ transactionId }, 'Debit request succeeded')
          debitSucceeded = true
        }
      } catch (err) {
        const status = err.response?.status
        const errorMessage = err.response?.data?.error?.message || err.message

        if (status === 400) {
          // Permanent failure (e.g. insufficient balance validation)
          logger.warn({ transactionId, errorMessage }, 'Debit failed permanently (ValidationError)')
          tx.status = 'FAILED'
          tx.failureReason = errorMessage
          await tx.save()
          await updateIdempotencyCache(tx)
          await publishPaymentEvent(tx)
          return // Stop saga, complete job without retrying
        } else {
          // Transient failure (network/timeout) -> throw to retry
          logger.error({ err, transactionId }, 'Debit request failed transiently, throwing for retry')
          throw err
        }
      }

      // ── Step 2: Credit Receiver ──────────────────────────────────────────────
      if (debitSucceeded) {
        try {
          const creditLedger = await LedgerEntry.findOne({ transactionId: tx._id, type: 'credit' })
          if (creditLedger) {
            logger.info({ transactionId }, 'Credit already processed, finalizing transaction')
          } else {
            // Perform credit via wallet-service
            await walletClient.post('/wallets/internal/credit', {
              walletId: tx.receiverWalletId,
              amount: tx.amount,
              transactionId: tx._id,
              description: 'Transfer in',
            })
            logger.info({ transactionId }, 'Credit request succeeded')
          }

          // Complete Transaction
          tx.status = 'COMPLETED'
          tx.completedAt = new Date()
          await tx.save()
          await updateIdempotencyCache(tx)
          await publishPaymentEvent(tx)
          logger.info({ transactionId }, 'Transaction completed successfully')
        } catch (err) {
          const status = err.response?.status
          const errorMessage = err.response?.data?.error?.message || err.message

          if (status === 400) {
            // Permanent failure on credit step -> Saga Compensation (Rollback debit)
            logger.error({ transactionId, errorMessage }, 'Credit failed permanently. Starting Saga compensation rollback...')
            
            try {
              // Refund the sender wallet
              await walletClient.post('/wallets/internal/credit', {
                walletId: tx.senderWalletId,
                amount: tx.amount,
                transactionId: tx._id,
                description: 'Transfer rollback',
              })
              logger.info({ transactionId }, 'Saga compensation: sender wallet re-credited successfully')
              tx.status = 'FAILED'
              tx.failureReason = `Credit failed: ${errorMessage} (Rolled back)`
            } catch (rollbackErr) {
              logger.error({ rollbackErr, transactionId }, 'CRITICAL: Saga compensation rollback failed!')
              tx.status = 'FAILED'
              tx.failureReason = `Credit failed: ${errorMessage} (Rollback failed)`
            }

            await tx.save()
            await updateIdempotencyCache(tx)
            await publishPaymentEvent(tx)
            return // Complete job, do not retry
          } else {
            // Transient failure (network/timeout) -> throw to retry
            logger.error({ err, transactionId }, 'Credit request failed transiently, throwing for retry')
            throw err
          }
        }
      }
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 jobs concurrently
    }
  )

  worker.on('ready', () => logger.info('BullMQ payment-worker active'))
  worker.on('error', (err) => logger.error({ err }, 'Worker error'))
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Payment job failed')
  })
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start payment-worker')
  process.exit(1)
})
