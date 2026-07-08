'use strict'

const { Queue } = require('bullmq')
const { getBullMQConnection, createLogger } = require('@finpay/shared')

const logger = createLogger('transaction-service:payment-queue')

const redisConnection = getBullMQConnection()

// Initialize the payment queue
const paymentQueue = new Queue('payment-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s, 2s, 4s...
    },
    removeOnComplete: false, // Keep completed jobs in Redis for UI visibility
    removeOnFail: false,    // Keep failed jobs for debugging/DLQ
  },
})

paymentQueue.on('error', (err) => {
  logger.error({ err }, 'BullMQ payment-queue error')
})

/**
 * Enqueue a transfer job for async processing
 */
async function addPaymentJob({ transactionId, senderWalletId, receiverWalletId, amount, currency, idempotencyKey }) {
  try {
    const job = await paymentQueue.add(
      'process-transfer',
      {
        transactionId,
        senderWalletId,
        receiverWalletId,
        amount,
        currency,
        idempotencyKey,
      },
      {
        jobId: transactionId, // Ensures we don't enqueue the same transaction twice
      }
    )
    logger.info({ jobId: job.id, transactionId }, 'Payment job enqueued')
    return job
  } catch (err) {
    logger.error({ err, transactionId }, 'Failed to enqueue payment job')
    throw err
  }
}

module.exports = {
  paymentQueue,
  addPaymentJob,
}
