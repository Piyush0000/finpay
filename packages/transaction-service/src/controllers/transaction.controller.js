const transactionService = require('../services/transaction.service')

const transactionController = {
  async initiateTransfer(req, res, next) {
    try {
      const senderId = req.headers['x-user-id']
      const idempotencyKey = req.headers['idempotency-key']
      const { receiverEmail, amount, currency } = req.body

      const transaction = await transactionService.initiateTransfer({
        senderId,
        receiverEmail,
        amount,
        currency,
        idempotencyKey,
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
}

module.exports = transactionController
