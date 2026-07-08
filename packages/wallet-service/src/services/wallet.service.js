const Wallet = require('../models/Wallet')
const LedgerEntry = require('../models/LedgerEntry')
const { NotFoundError, ConflictError, ValidationError, acquireLock, releaseLock, createLogger } = require('@finpay/shared')

const logger = createLogger('wallet-service:wallet.service')

class WalletService {
  async createWallet(userId) {
    const existing = await Wallet.findOne({ userId })
    if (existing) throw new ConflictError('Wallet already exists for this user')

    const wallet = await Wallet.create({ userId })
    return wallet
  }

  async getWalletByUserId(userId) {
    const wallet = await Wallet.findOne({ userId })
    if (!wallet) throw new NotFoundError('Wallet not found')
    return wallet
  }

  async getWalletById(walletId) {
    const wallet = await Wallet.findById(walletId)
    if (!wallet) throw new NotFoundError('Wallet not found')
    return wallet
  }

  /**
   * Debit a wallet with a distributed lock.
   * Lock → re-read balance (definitive check) → write → release.
   */
  async debit(walletId, amount, transactionId, description = 'Debit') {
    const lockToken = await acquireLock(`wallet:${walletId}`)
    if (!lockToken) {
      throw new ValidationError('Wallet is busy — another operation is in progress. Please retry.')
    }

    try {
      // Re-read balance under the lock (authoritative check)
      const wallet = await Wallet.findById(walletId)
      if (!wallet) throw new NotFoundError('Wallet not found')

      if (wallet.balance < amount) {
        throw new ValidationError('Insufficient balance')
      }

      const balanceBefore = wallet.balance
      const balanceAfter = balanceBefore - amount

      wallet.balance = balanceAfter
      wallet.version += 1
      await wallet.save()

      await LedgerEntry.create({
        walletId,
        transactionId,
        type: 'debit',
        amount,
        balanceBefore,
        balanceAfter,
        description,
      })

      logger.info({ walletId: walletId.toString(), balanceBefore, balanceAfter, amount }, 'Debit applied')
      return wallet
    } finally {
      // Always release the lock — even if an error was thrown
      await releaseLock(`wallet:${walletId}`, lockToken)
    }
  }

  /**
   * Credit a wallet with a distributed lock.
   * Lock → re-read wallet → write → release.
   */
  async credit(walletId, amount, transactionId, description = 'Credit') {
    const lockToken = await acquireLock(`wallet:${walletId}`)
    if (!lockToken) {
      throw new ValidationError('Wallet is busy — another operation is in progress. Please retry.')
    }

    try {
      const wallet = await Wallet.findById(walletId)
      if (!wallet) throw new NotFoundError('Wallet not found')

      const balanceBefore = wallet.balance
      const balanceAfter = balanceBefore + amount

      wallet.balance = balanceAfter
      wallet.version += 1
      await wallet.save()

      await LedgerEntry.create({
        walletId,
        transactionId,
        type: 'credit',
        amount,
        balanceBefore,
        balanceAfter,
        description,
      })

      logger.info({ walletId: walletId.toString(), balanceBefore, balanceAfter, amount }, 'Credit applied')
      return wallet
    } finally {
      await releaseLock(`wallet:${walletId}`, lockToken)
    }
  }
}

module.exports = new WalletService()
