const walletService = require('../services/wallet.service')

const walletController = {
  async createWallet(req, res, next) {
    try {
      const userId = req.headers['x-user-id']
      const wallet = await walletService.createWallet(userId)
      res.status(201).json({
        walletId: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        status: wallet.status,
      })
    } catch (err) {
      next(err)
    }
  },

  async getMyWallet(req, res, next) {
    try {
      const userId = req.headers['x-user-id']
      const wallet = await walletService.getWalletByUserId(userId)
      res.json({
        walletId: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        status: wallet.status,
        createdAt: wallet.createdAt,
      })
    } catch (err) {
      next(err)
    }
  },

  // internal endpoint — called by transaction-service, not exposed publicly
  async internalTransfer(req, res, next) {
    try {
      const { senderWalletId, receiverWalletId, amount, transactionId } = req.body
      await walletService.debit(senderWalletId, amount, transactionId, 'Transfer out')
      await walletService.credit(receiverWalletId, amount, transactionId, 'Transfer in')
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  },

  // internal endpoint — get wallet by userId
  async internalGetByUser(req, res, next) {
    try {
      const wallet = await walletService.getWalletByUserId(req.params.userId)
      res.json({ walletId: wallet._id, balance: wallet.balance, status: wallet.status })
    } catch (err) {
      next(err)
    }
  },
}

module.exports = walletController
