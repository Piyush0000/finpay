const express = require('express')
const router = express.Router()
const transactionController = require('../controllers/transaction.controller')

router.post('/', transactionController.initiateTransfer)
router.get('/', transactionController.listTransactions)
router.get('/:id', transactionController.getTransaction)

module.exports = router
