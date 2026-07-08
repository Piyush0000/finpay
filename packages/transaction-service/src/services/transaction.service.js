const axios = require('axios')
const Transaction = require('../models/Transaction')
const User = require('../models/User')
const { NotFoundError, ValidationError, ConflictError } = require('@finpay/shared')
const config = require('../config')

const walletClient = axios.create({ baseURL: config.walletServiceUrl })

class TransactionService {
  async initiateTransfer({ senderId, receiverEmail, amount, currency = 'INR', idempotencyKey }) {
    if (!amount || amount <= 0) throw new ValidationError('Amount must be a positive integer in paisa')

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

    // advance to PROCESSING before hitting wallet-service
    transaction.status = 'PROCESSING'
    await transaction.save()

    // execute transfer synchronously via wallet-service (Phase 1 — no queue)
    try {
      await walletClient.post('/wallets/internal/transfer', {
        senderWalletId: senderWallet.walletId,
        receiverWalletId: receiverWallet.walletId,
        amount,
        transactionId: transaction._id,
      })

      transaction.status = 'COMPLETED'
      transaction.completedAt = new Date()
      await transaction.save()
    } catch (err) {
      transaction.status = 'FAILED'
      transaction.failureReason = err.response?.data?.error?.message || err.message
      await transaction.save()
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
