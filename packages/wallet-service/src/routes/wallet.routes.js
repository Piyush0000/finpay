const express = require('express')
const router = express.Router()
const walletController = require('../controllers/wallet.controller')

// public routes (JWT already verified by API Gateway, userId injected as header)
router.post('/', walletController.createWallet)
router.get('/me', walletController.getMyWallet)

// internal routes — only reachable within the Docker network
router.post('/internal/transfer', walletController.internalTransfer)
router.get('/internal/by-user/:userId', walletController.internalGetByUser)

module.exports = router
