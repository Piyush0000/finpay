const Wallet = require('../models/Wallet')
const LedgerEntry = require('../models/LedgerEntry')
const { NotFoundError, ConflictError, ValidationError } = require('@finpay/shared')

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

  async debit(walletId, amount, transactionId, description = 'Debit') {
    const wallet = await this.getWalletById(walletId)

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

    return wallet
  }

  async credit(walletId, amount, transactionId, description = 'Credit') {
    const wallet = await this.getWalletById(walletId)

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

    return wallet
  }
}

module.exports = new WalletService()
