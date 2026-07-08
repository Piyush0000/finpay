const express = require('express')
const router = express.Router()
const walletController = require('../controllers/wallet.controller')

// public routes (JWT already verified by API Gateway, userId injected as header)
router.post('/', walletController.createWallet)
router.get('/me', walletController.getMyWallet)
router.post('/me/fund', walletController.fundWallet)

// internal routes — only reachable within the Docker network
router.post('/internal/transfer', walletController.internalTransfer)
router.post('/internal/debit', walletController.internalDebit)
router.post('/internal/credit', walletController.internalCredit)
router.get('/internal/by-user/:userId', walletController.internalGetByUser)

module.exports = router
