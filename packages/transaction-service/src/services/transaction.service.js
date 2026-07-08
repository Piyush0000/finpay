const axios = require('axios')
const Transaction = require('../models/Transaction')
const User = require('../models/User')
const { NotFoundError, ValidationError, getRedisClient } = require('@finpay/shared')
const { addPaymentJob } = require('../queues/payment.queue')
const config = require('../config')

const IDEMPOTENCY_TTL_SECONDS = 86400 // 24 hours

const walletClient = axios.create({ baseURL: config.walletServiceUrl })

class TransactionService {
  async initiateTransfer({ senderId, receiverEmail, amount, currency = 'INR', idempotencyKey }) {
    if (!amount || amount <= 0) throw new ValidationError('Amount must be a positive integer in paisa')

    // ── Idempotency check ─────────────────────────────────────────────────────
    const redis = getRedisClient()
    const cacheKey = `idempotency:${senderId}:${idempotencyKey}`

    if (idempotencyKey) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // find receiver
    const receiver = await User.findOne({ email: receiverEmail, status: 'active' })
    if (!receiver) throw new NotFoundError('Receiver not found')

    if (receiver._id.toString() === senderId) {
      throw new ValidationError('Cannot transfer to yourself')
    }

    // get sender and receiver wallets from wallet-service
    const [senderWalletRes, receiverWalletRes] = await Promise.all([
      walletClient.get(`/wallets/internal/by-user/${senderId}`),
      walletClient.get(`/wallets/internal/by-user/${receiver._id}`),
    ])

    const senderWallet = senderWalletRes.data
    const receiverWallet = receiverWalletRes.data

    if (senderWallet.balance < amount) {
      throw new ValidationError('Insufficient balance')
    }

    // create transaction record — starts as PENDING
    const transaction = await Transaction.create({
      idempotencyKey,
      senderId,
      senderWalletId: senderWallet.walletId,
      receiverId: receiver._id,
      receiverWalletId: receiverWallet.walletId,
      amount,
      currency,
      status: 'PENDING',
    })

    // Enqueue the transfer job for asynchronous processing by the payment-worker
    await addPaymentJob({
      transactionId: transaction._id.toString(),
      senderWalletId: senderWallet.walletId,
      receiverWalletId: receiverWallet.walletId,
      amount,
      currency,
      idempotencyKey,
    })

    // Cache the pending transaction for idempotency (24h)
    if (idempotencyKey) {
      await redis.set(cacheKey, JSON.stringify(transaction), 'EX', IDEMPOTENCY_TTL_SECONDS)
    }

    return transaction
  }

  async getTransactionById(transactionId, userId) {
    const transaction = await Transaction.findById(transactionId)
    if (!transaction) throw new NotFoundError('Transaction not found')

    const isParty =
      transaction.senderId.toString() === userId ||
      transaction.receiverId.toString() === userId

    if (!isParty) {
      const { ForbiddenError } = require('@finpay/shared')
      throw new ForbiddenError('Access denied')
    }

    return transaction
  }

  async listTransactions(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit
    const query = { $or: [{ senderId: userId }, { receiverId: userId }] }

    const [transactions, total] = await Promise.all([
      Transaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(query),
    ])

    return { transactions, total, page, limit }
  }
}

module.exports = new TransactionService()
