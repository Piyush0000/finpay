'use strict'

require('dotenv').config()
const crypto = require('crypto')
const mongoose = require('mongoose')
const axios = require('axios')
const { Queue, Worker } = require('bullmq')
const { getRedisClient, getBullMQConnection, createLogger } = require('@finpay/shared')
const Notification = require('./models/Notification')
const User = require('./models/User')
const WebhookSubscription = require('./models/WebhookSubscription')
const WebhookLog = require('./models/WebhookLog')

const logger = createLogger('notification-service')

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/finpay'
const resendApiKey = process.env.RESEND_API_KEY || ''

// ── Database connection ────────────────────────────────────────────────────────
async function connectMongo() {
  await mongoose.connect(mongoUri)
  logger.info('Connected to MongoDB')
}

async function start() {
  await connectMongo()

  const redisPubSub = getRedisClient() // PubSub client (uses standard client)
  const bullMQConnection = getBullMQConnection() // Connection client for BullMQ

  // ── Setup BullMQ Queue & Worker for Emails ──────────────────────────────
  const emailQueue = new Queue('email-queue', {
    connection: bullMQConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s, 4s, 8s...
      },
      removeOnComplete: false,
      removeOnFail: false,
    },
  })

  const emailWorker = new Worker(
    'email-queue',
    async (job) => {
      const { notificationId, recipientEmail, subject, body } = job.data
      logger.info({ notificationId, recipientEmail }, 'Processing email job')

      const notification = await Notification.findById(notificationId)
      if (!notification) {
        logger.error({ notificationId }, 'Notification audit record not found')
        return
      }

      notification.attempts += 1

      try {
        if (!resendApiKey) {
          // Fallback / Mock Mode: log email to console/logs
          logger.info(
            {
              mock: true,
              to: recipientEmail,
              subject,
              bodyLength: body.length,
            },
            `✉️ MOCK EMAIL SENT:
==================================================
To: ${recipientEmail}
Subject: ${subject}
Body:
${body}
==================================================`
          )
        } else {
          // Real Mode: Send via Resend API
          await axios.post(
            'https://api.resend.com/emails',
            {
              from: 'FinPay <onboarding@resend.dev>',
              to: recipientEmail,
              subject: subject,
              html: `<div style="font-family: sans-serif; line-height: 1.5; color: #333;">${body}</div>`,
            },
            {
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
            }
          )
          logger.info({ notificationId, recipientEmail }, 'Real email successfully sent via Resend API')
        }

        notification.status = 'SENT'
        await notification.save()
      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message
        logger.error({ err, notificationId, errorMsg }, 'Email delivery attempt failed')

        notification.failureReason = errorMsg
        await notification.save()

        // Throw error to trigger BullMQ retry backoff
        throw err
      }
    },
    {
      connection: bullMQConnection,
      concurrency: 2,
    }
  )

  emailWorker.on('error', (err) => logger.error({ err }, 'BullMQ email-worker error'))

  // ── Setup BullMQ Queue & Worker for Webhooks ────────────────────────────
  const webhookQueue = new Queue('webhook-queue', {
    connection: bullMQConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    },
  })

  const webhookWorker = new Worker(
    'webhook-queue',
    async (job) => {
      const { logId } = job.data
      logger.info({ logId }, 'Processing webhook delivery job')

      const log = await WebhookLog.findById(logId)
      if (!log) {
        logger.error({ logId }, 'WebhookLog record not found')
        return
      }

      const sub = await WebhookSubscription.findOne({ userId: log.userId })
      if (!sub || sub.status !== 'active') {
        logger.warn({ logId, userId: log.userId }, 'Webhook subscription inactive or not found, canceling dispatch')
        log.status = 'failed'
        log.responseBody = 'Subscription inactive or deleted'
        await log.save()
        return
      }

      log.attempts += 1

      try {
        const stringPayload = JSON.stringify(log.payload)
        const signature = crypto.createHmac('sha256', sub.secret).update(stringPayload).digest('hex')

        const res = await axios.post(log.url, log.payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-FinPay-Signature': signature,
            'X-FinPay-Event': log.eventType,
          },
          timeout: 5000,
        })

        log.statusCode = res.status
        log.responseBody = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data)
        log.status = 'success'
        await log.save()
        logger.info({ logId, url: log.url, statusCode: res.status }, 'Webhook delivered successfully')
      } catch (err) {
        log.statusCode = err.response?.status || 500
        log.responseBody = err.response?.data ? (typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : String(err.response.data)) : err.message
        log.status = 'failed'
        await log.save()

        logger.error({ err, logId, url: log.url }, 'Webhook delivery attempt failed')
        throw err
      }
    },
    {
      connection: bullMQConnection,
      concurrency: 3,
    }
  )

  webhookWorker.on('error', (err) => logger.error({ err }, 'BullMQ webhook-worker error'))

  // ── Subscribe to Redis PubSub Payment & Telemetry Channels ──────────────────
  const channels = ['channel:payment.completed', 'channel:payment.failed', 'channel:webhook.retry']
  await redisPubSub.subscribe(...channels)
  logger.info({ channels }, 'Subscribed to Redis PubSub payment and retry channels')

  redisPubSub.on('message', async (channel, message) => {
    logger.info({ channel }, 'Received message from PubSub channel')

    // Handle Manual Retry Signal
    if (channel === 'channel:webhook.retry') {
      try {
        const { logId } = JSON.parse(message)
        logger.info({ logId }, 'Received manual webhook retry request')
        const log = await WebhookLog.findById(logId)
        if (log) {
          log.status = 'failed'
          await log.save()
          await webhookQueue.add('send-webhook', { logId: log._id.toString() })
        }
      } catch (err) {
        logger.error(err, 'Failed to process webhook retry message')
      }
      return
    }

    try {
      const event = JSON.parse(message)
      const { transactionId, senderId, receiverId, amount, status, failureReason } = event

      const amountFormatted = (amount / 100).toFixed(2)

      // Fetch user profile emails directly from MongoDB
      const [sender, receiver] = await Promise.all([
        User.findById(senderId),
        User.findById(receiverId),
      ])

      if (!sender || !receiver) {
        logger.warn({ senderId, receiverId }, 'Sender or Receiver user profile not found in DB, skipping email dispatch')
        return
      }

      // ── Dispatch Email notifications ──────────────────────────────────────
      if (status === 'COMPLETED') {
        // Dispatch to Sender (Debit notice)
        const senderSubject = `FinPay: Transfer Successful - ₹${amountFormatted}`
        const senderBody = `Hi ${sender.name},<br/><br/>Your transfer of <b>₹${amountFormatted}</b> to <b>${receiver.name}</b> (${receiver.email}) was successful.<br/><br/>Transaction ID: ${transactionId}`
        
        const notifSender = await Notification.create({
          userId: sender._id,
          transactionId,
          recipientEmail: sender.email,
          subject: senderSubject,
          body: senderBody,
        })
        await emailQueue.add('send-email', {
          notificationId: notifSender._id.toString(),
          recipientEmail: sender.email,
          subject: senderSubject,
          body: senderBody,
        })

        // Dispatch to Receiver (Credit notice)
        const receiverSubject = `FinPay: You received ₹${amountFormatted}`
        const receiverBody = `Hi ${receiver.name},<br/><br/>You have received <b>₹${amountFormatted}</b> from <b>${sender.name}</b> (${sender.email}).<br/><br/>Transaction ID: ${transactionId}`
        
        const notifReceiver = await Notification.create({
          userId: receiver._id,
          transactionId,
          recipientEmail: receiver.email,
          subject: receiverSubject,
          body: receiverBody,
        })
        await emailQueue.add('send-email', {
          notificationId: notifReceiver._id.toString(),
          recipientEmail: receiver.email,
          subject: receiverSubject,
          body: receiverBody,
        })
      } else if (status === 'FAILED') {
        // Dispatch failure notice to Sender only
        const failureSubject = `FinPay: Transfer Failed - ₹${amountFormatted}`
        const failureBody = `Hi ${sender.name},<br/><br/>Your transfer of <b>₹${amountFormatted}</b> to <b>${receiver.name}</b> (${receiver.email}) failed.<br/><br/>Reason: ${failureReason || 'Declined'}<br/><br/>Transaction ID: ${transactionId}`

        const notifFailure = await Notification.create({
          userId: sender._id,
          transactionId,
          recipientEmail: sender.email,
          subject: failureSubject,
          body: failureBody,
        })
        await emailQueue.add('send-email', {
          notificationId: notifFailure._id.toString(),
          recipientEmail: sender.email,
          subject: failureSubject,
          body: failureBody,
        })
      }

      // ── Webhook Trigger ────────────────────────────────────────────────────
      try {
        const sub = await WebhookSubscription.findOne({ userId: senderId })
        if (sub && sub.status === 'active') {
          const log = await WebhookLog.create({
            userId: senderId,
            transactionId,
            url: sub.url,
            eventType: `payment.${status.toLowerCase()}`,
            payload: {
              event: `payment.${status.toLowerCase()}`,
              data: {
                transactionId,
                senderEmail: sender.email,
                receiverEmail: receiver.email,
                amount,
                currency,
                status,
                failureReason: failureReason || '',
                timestamp: new Date().toISOString(),
              }
            },
            attempts: 0,
            status: 'failed',
          })

          await webhookQueue.add('send-webhook', { logId: log._id.toString() })
          logger.info({ transactionId, logId: log._id.toString() }, 'Enqueued webhook delivery task')
        }
      } catch (webhookErr) {
        logger.error({ webhookErr, transactionId }, 'Failed to schedule webhook dispatch')
      }

    } catch (err) {
      logger.error({ err, message }, 'Error processing payment PubSub message')
    }
  })
}

start().catch((err) => {
  logger.error(err, 'Failed to start notification-service')
  process.exit(1)
})
