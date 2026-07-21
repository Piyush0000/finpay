'use strict'

require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const FinPayClient = require('@piyush2205/finpay-sdk')
const PaymentLink = require('./models/PaymentLink')
const { createLogger } = require('@finpay/shared')

const logger = createLogger('payment-link-service')
const app = express()
const port = process.env.PORT || 3006
const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017/finpay'
const apiGatewayUrl = process.env.API_GATEWAY_URL || 'http://api-gateway:3000/api'

app.use(cors())
app.use(express.json())

// ── Database Connection ──────────────────────────────────────────────────────
async function connectMongo() {
  await mongoose.connect(mongoUri)
  logger.info('Connected to MongoDB')
}

// ── API Endpoints ────────────────────────────────────────────────────────────

// Create a new Payment Link
app.post('/payment-links', async (req, res, next) => {
  try {
    const creatorId = req.headers['x-user-id']
    if (!creatorId) {
      return res.status(401).json({ error: { message: 'Missing user identification' } })
    }

    const { amount, description, merchantEmail } = req.body
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: { message: 'Amount must be positive integer in paisa' } })
    }
    if (!merchantEmail) {
      return res.status(400).json({ error: { message: 'Merchant recipient email is required' } })
    }

    const link = await PaymentLink.create({
      creatorId,
      merchantEmail,
      amount,
      description: description || '',
      status: 'active'
    })

    logger.info({ linkId: link._id }, 'Payment link generated successfully')
    res.status(201).json(link)
  } catch (err) {
    next(err)
  }
})

// List payment links created by the merchant
app.get('/payment-links', async (req, res, next) => {
  try {
    const creatorId = req.headers['x-user-id']
    if (!creatorId) {
      return res.status(401).json({ error: { message: 'Missing user identification' } })
    }

    const links = await PaymentLink.find({ creatorId }).sort({ createdAt: -1 })
    res.json(links)
  } catch (err) {
    next(err)
  }
})

// Get details of a specific payment link
app.get('/payment-links/:id', async (req, res, next) => {
  try {
    const link = await PaymentLink.findById(req.params.id)
    if (!link) {
      return res.status(404).json({ error: { message: 'Payment link not found' } })
    }
    res.json(link)
  } catch (err) {
    next(err)
  }
})

// Accept customer checkout payment (Uses published SDK!)
app.post('/payment-links/:id/pay', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader ? authHeader.split(' ')[1] : ''
    if (!token) {
      return res.status(401).json({ error: { message: 'Authentication required for checkout' } })
    }

    const link = await PaymentLink.findById(req.params.id)
    if (!link) {
      return res.status(404).json({ error: { message: 'Payment link not found' } })
    }
    if (link.status === 'paid') {
      return res.status(400).json({ error: { message: 'Payment link has already been settled' } })
    }

    logger.info({ linkId: link._id }, 'Customer executing checkout payment link via SDK')

    // 1. Initialize SDK Client using customer credentials
    const finpay = new FinPayClient({
      apiBase: apiGatewayUrl,
      token
    })

    // 2. Trigger transfer from Customer wallet to Merchant wallet
    const idempotencyKey = `pl-${link._id}-${Date.now()}`
    const transferRes = await finpay.transfer({
      receiverEmail: link.merchantEmail,
      amount: link.amount,
      currency: 'INR',
      idempotencyKey
    })

    const txId = transferRes.transactionId
    let txStatus = transferRes.status || 'PENDING'

    // 3. Poll transaction status using SDK
    for (let i = 0; i < 5; i++) {
      if (['COMPLETED', 'FAILED', 'ROLLED_BACK'].includes(txStatus)) break
      await new Promise(r => setTimeout(r, 1000))
      
      const tx = await finpay.getTransaction(txId)
      txStatus = tx.status
    }

    // 4. Resolve link status
    if (txStatus === 'COMPLETED') {
      link.status = 'paid'
      link.transactionId = txId
      await link.save()
      
      logger.info({ linkId: link._id, transactionId: txId }, 'Payment link successfully paid')
      res.json({ success: true, message: 'Checkout successful', transactionId: txId })
    } else {
      logger.warn({ linkId: link._id, status: txStatus }, 'Payment link checkout transfer failed')
      res.status(400).json({ error: { message: `Transaction failed with status: ${txStatus}` } })
    }

  } catch (err) {
    logger.error(err, 'Failed to complete payment link checkout')
    next(err)
  }
})

// ── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(err)
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error'
    }
  })
})

// ── Startup ──────────────────────────────────────────────────────────────────
connectMongo()
  .then(() => {
    app.listen(port, () => {
      logger.info(`Payment Links Service listening on port ${port}`)
    })
  })
  .catch((err) => {
    logger.error(err, 'Database connection failed')
    process.exit(1)
  })
