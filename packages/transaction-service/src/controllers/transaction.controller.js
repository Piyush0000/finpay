const crypto = require('crypto')
const transactionService = require('../services/transaction.service')
const WebhookSubscription = require('../models/WebhookSubscription')
const WebhookLog = require('../models/WebhookLog')

const transactionController = {
  async initiateTransfer(req, res, next) {
    try {
      const senderId = req.headers['x-user-id']
      const idempotencyKey = req.headers['idempotency-key']
      const { receiverEmail, amount, currency } = req.body

      // Read simulation headers
      const simulateDelay = req.headers['x-simulate-delay']
      const simulateError = req.headers['x-simulate-error']

      const transaction = await transactionService.initiateTransfer({
        senderId,
        receiverEmail,
        amount,
        currency,
        idempotencyKey,
        simulateDelay: simulateDelay ? parseInt(simulateDelay, 10) : undefined,
        simulateError,
      })

      res.status(202).json({
        transactionId: transaction._id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        completedAt: transaction.completedAt,
      })
    } catch (err) {
      next(err)
    }
  },

  async getTransaction(req, res, next) {
    try {
      const userId = req.headers['x-user-id']
      const transaction = await transactionService.getTransactionById(req.params.id, userId)
      res.json(transaction)
    } catch (err) {
      next(err)
    }
  },

  async listTransactions(req, res, next) {
    try {
      const userId = req.headers['x-user-id']
      const { page = 1, limit = 20 } = req.query
      const result = await transactionService.listTransactions(userId, Number(page), Number(limit))
      res.json(result)
    } catch (err) {
      next(err)
    }
  },

  async saveWebhookSubscription(req, res, next) {
    try {
      const userId = req.headers['x-user-id']
      const { url } = req.body
      if (!url) {
        const { ValidationError } = require('@finpay/shared')
        throw new ValidationError('Webhook destination URL is required')
      }

      let sub = await WebhookSubscription.findOne({ userId })
      if (sub) {
        sub.url = url
        await sub.save()
      } else {
        const secret = 'whsec_' + crypto.randomBytes(24).toString('hex')
        sub = await WebhookSubscription.create({ userId, url, secret })
      }

      res.status(200).json(sub)
    } catch (err) {
      next(err)
    }
  },

  async getWebhookSubscription(req, res, next) {
    try {
      const userId = req.headers['x-user-id']
      const sub = await WebhookSubscription.findOne({ userId })
      if (!sub) {
        return res.status(404).json({ message: 'No active webhook configuration found' })
      }
      res.json(sub)
    } catch (err) {
      next(err)
    }
  },

  async getWebhookLogs(req, res, next) {
    try {
      const userId = req.headers['x-user-id']
      const logs = await WebhookLog.find({ userId }).sort({ createdAt: -1 }).limit(100)
      res.json(logs)
    } catch (err) {
      next(err)
    }
  },

  async retryWebhook(req, res, next) {
    try {
      const userId = req.headers['x-user-id']
      const log = await WebhookLog.findOne({ _id: req.params.logId, userId })
      if (!log) {
        const { NotFoundError } = require('@finpay/shared')
        throw new NotFoundError('Webhook log not found')
      }

      // Signal retry event via Redis PubSub
      const { getRedisClient } = require('@finpay/shared')
      const redis = getRedisClient()
      await redis.publish('channel:webhook.retry', JSON.stringify({ logId: log._id.toString() }))

      res.status(200).json({ message: 'Webhook retry scheduled' })
    } catch (err) {
      next(err)
    }
  },
}

module.exports = transactionController
