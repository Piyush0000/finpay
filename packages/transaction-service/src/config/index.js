require('dotenv').config()

module.exports = {
  port: process.env.TRANSACTION_SERVICE_PORT || 3003,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/finpay',
  walletServiceUrl: process.env.WALLET_SERVICE_URL || 'http://localhost:3002',
}
