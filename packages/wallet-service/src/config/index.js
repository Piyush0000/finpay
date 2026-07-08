require('dotenv').config()

module.exports = {
  port: process.env.WALLET_SERVICE_PORT || 3002,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/finpay',
}
