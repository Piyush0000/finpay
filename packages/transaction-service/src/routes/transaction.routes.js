const express = require('express')
const router = express.Router()
const transactionController = require('../controllers/transaction.controller')

// Core Transfer Endpoints
router.post('/', transactionController.initiateTransfer)
router.get('/', transactionController.listTransactions)

// Developer Sandbox Webhooks Endpoints (must be registered before wildcard GET /:id)
router.post('/webhooks', transactionController.saveWebhookSubscription)
router.get('/webhooks', transactionController.getWebhookSubscription)
router.get('/webhooks/logs', transactionController.getWebhookLogs)
router.post('/webhooks/logs/:logId/retry', transactionController.retryWebhook)

// Transaction details wildcard
router.get('/:id', transactionController.getTransaction)

module.exports = router
