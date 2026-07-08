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

  // internal endpoint — debit a wallet (called by payment-worker saga)
  async internalDebit(req, res, next) {
    try {
      const { walletId, amount, transactionId, description } = req.body
      const wallet = await walletService.debit(walletId, amount, transactionId, description || 'Transfer out')
      res.json({ success: true, balance: wallet.balance })
    } catch (err) {
      next(err)
    }
  },

  // internal endpoint — credit a wallet (called by payment-worker saga)
  async internalCredit(req, res, next) {
    try {
      const { walletId, amount, transactionId, description } = req.body
      const wallet = await walletService.credit(walletId, amount, transactionId, description || 'Transfer in')
      res.json({ success: true, balance: wallet.balance })
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

  // public endpoint — add mock funds for testing/demo purposes
  async fundWallet(req, res, next) {
    try {
      const userId = req.headers['x-user-id']
      const wallet = await walletService.getWalletByUserId(userId)
      wallet.balance += 100000 // Add ₹1,000.00 (100,000 paisa)
      await wallet.save()
      res.json({
        walletId: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        status: wallet.status,
      })
    } catch (err) {
      next(err)
    }
  },
}

module.exports = walletController
