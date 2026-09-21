const Wallet = require('../models/Wallet')
const LedgerEntry = require('../models/LedgerEntry')
const { NotFoundError, ConflictError, ValidationError, acquireLock, releaseLock, createLogger, createCircuitBreaker } = require('@finpay/shared')

const logger = createLogger('wallet-service:wallet.service')

// Static circuit breakers for monitoring
let debitCircuitBreaker = null;
let creditCircuitBreaker = null;

class WalletService {
  constructor() {
    // Create circuit breakers for critical operations if not already created
    if (!debitCircuitBreaker) {
      debitCircuitBreaker = createCircuitBreaker(
        this._performDebit.bind(this),
        {
          timeout: 5000,
          errorThresholdPercentage: 30,
          resetTimeout: 20000
        }
      );

      debitCircuitBreaker.fallback(() => {
        throw new ValidationError('Wallet debit operation temporarily unavailable due to high load. Please retry later.');
      });
    }

    if (!creditCircuitBreaker) {
      creditCircuitBreaker = createCircuitBreaker(
        this._performCredit.bind(this),
        {
          timeout: 5000,
          errorThresholdPercentage: 30,
          resetTimeout: 20000
        }
      );

      creditCircuitBreaker.fallback(() => {
        throw new ValidationError('Wallet credit operation temporarily unavailable due to high load. Please retry later.');
      });
    }

    this.debitCircuitBreaker = debitCircuitBreaker;
    this.creditCircuitBreaker = creditCircuitBreaker;
  }

  static getCircuitBreakerStatus() {
    return {
      debit: {
        status: debitCircuitBreaker ? (debitCircuitBreaker.opened ? 'open' : (debitCircuitBreaker.halfOpen ? 'halfOpen' : 'closed')) : 'not_initialized',
        stats: debitCircuitBreaker ? debitCircuitBreaker.stats : null
      },
      credit: {
        status: creditCircuitBreaker ? (creditCircuitBreaker.opened ? 'open' : (creditCircuitBreaker.halfOpen ? 'halfOpen' : 'closed')) : 'not_initialized',
        stats: creditCircuitBreaker ? creditCircuitBreaker.stats : null
      }
    };
  }

  async _performDebit(walletId, amount, transactionId, description) {
    const lockToken = await acquireLock(`wallet:${walletId}`)
    if (!lockToken) {
      throw new ValidationError('Wallet is busy — another operation is in progress. Please retry.')
    }

    try {
      const wallet = await Wallet.findById(walletId)
      if (!wallet) throw new NotFoundError('Wallet not found')

      if (wallet.status !== 'active') {
        throw new ValidationError(`Wallet is ${wallet.status}`)
      }

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
      await releaseLock(`wallet:${walletId}`, lockToken)
    }
  }

  async _performCredit(walletId, amount, transactionId, description) {
    const lockToken = await acquireLock(`wallet:${walletId}`)
    if (!lockToken) {
      throw new ValidationError('Wallet is busy — another operation is in progress. Please retry.')
    }

    try {
      const wallet = await Wallet.findById(walletId)
      if (!wallet) throw new NotFoundError('Wallet not found')

      if (wallet.status !== 'active') {
        throw new ValidationError(`Wallet is ${wallet.status}`)
      }

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
   * Debit a wallet with circuit breaker protection and distributed lock.
   * Circuit Breaker → Lock → re-read balance (definitive check) → write → release.
   */
  async debit(walletId, amount, transactionId, description = 'Debit') {
    return this.debitCircuitBreaker.fire(walletId, amount, transactionId, description)
  }

  /**
   * Credit a wallet with circuit breaker protection and distributed lock.
   * Circuit Breaker → Lock → re-read wallet → write → release.
   */
  async credit(walletId, amount, transactionId, description = 'Credit') {
    return this.creditCircuitBreaker.fire(walletId, amount, transactionId, description)
  }
}

module.exports = WalletService
