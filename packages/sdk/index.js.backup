'use strict'

const axios = require('axios')
const crypto = require('crypto')

class FinPayClient {
  /**
   * Initialize FinPay Client
   * @param {Object} config
   * @param {string} config.apiBase - Base URL of the API gateway (e.g. http://localhost:3000/api)
   * @param {string} config.token - JWT access token of the authenticated merchant/user
   */
  constructor({ apiBase, token }) {
    this.apiBase = apiBase || 'http://localhost:3000/api'
    this.token = token || ''
    
    this.client = axios.create({
      baseURL: this.apiBase,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
  }

  /**
   * Retrieve active wallet ledger details
   */
  async getWallet() {
    try {
      const res = await this.client.get('/wallets/me')
      return res.data;
    } catch (err) {
      throw this._handleError(err)
    }
  }

  /**
   * Register a new active digital wallet
   */
  async createWallet() {
    try {
      const res = await this.client.post('/wallets')
      return res.data;
    } catch (err) {
      throw this._handleError(err)
    }
  }

  /**
   * Add mock funding credits to the wallet
   */
  async fundWallet() {
    try {
      const res = await this.client.post('/wallets/me/fund')
      return res.data;
    } catch (err) {
      throw this._handleError(err)
    }
  }

  /**
   * Initiate an asynchronous instant transfer via the Saga core
   * @param {Object} params
   * @param {string} params.receiverEmail - Target recipient email
   * @param {number} params.amount - Amount to transfer in paisa (positive integer)
   * @param {string} [params.currency='INR'] - Target currency
   * @param {string} params.idempotencyKey - Browser/Client generated idempotency identifier
   * @param {Object} [options]
   * @param {number} [options.simulateDelay] - Artificial worker latency in ms
   * @param {string} [options.simulateError] - Simulated failure type
   */
  async transfer({ receiverEmail, amount, currency = 'INR', idempotencyKey }, options = {}) {
    const headers = {}
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey
    }
    if (options.simulateDelay) {
      headers['X-Simulate-Delay'] = options.simulateDelay.toString()
    }
    if (options.simulateError) {
      headers['X-Simulate-Error'] = options.simulateError
    }

    try {
      const res = await this.client.post('/transfers', {
        receiverEmail,
        amount,
        currency
      }, { headers })
      return res.data;
    } catch (err) {
      throw this._handleError(err)
    }
  }

  /**
   * Retrieve transfer pipeline status
   * @param {string} transactionId 
   */
  async getTransaction(transactionId) {
    try {
      const res = await this.client.get(`/transfers/${transactionId}`)
      return res.data;
    } catch (err) {
      throw this._handleError(err)
    }
  }

  /**
   * List recent client ledger transaction history
   */
  async listTransactions(page = 1, limit = 20) {
    try {
      const res = await this.client.get(`/transfers?page=${page}&limit=${limit}`)
      return res.data;
    } catch (err) {
      throw this._handleError(err)
    }
  }

  /**
   * Verify FinPay webhook signature headers to validate origin authenticity
   * @param {Object|string} payload - Raw webhook request body object or string
   * @param {string} signature - Value of X-FinPay-Signature header
   * @param {string} secret - HMAC signature key configured in Developer Settings
   * @returns {boolean}
   */
  static verifyWebhookSignature(payload, signature, secret) {
    if (!payload || !signature || !secret) return false
    const stringPayload = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const computed = crypto.createHmac('sha256', secret).update(stringPayload).digest('hex')
    return computed === signature
  }

  _handleError(err) {
    if (err.response && err.response.data) {
      return new Error(err.response.data.error?.message || 'FinPay API Request failed')
    }
    return new Error(err.message || 'FinPay connection failed')
  }
}

module.exports = FinPayClient
