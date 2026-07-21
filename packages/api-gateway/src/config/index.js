require('dotenv').config()

module.exports = {
  port: process.env.API_GATEWAY_PORT || 3000,
  jwtPublicKey: Buffer.from(process.env.JWT_PUBLIC_KEY || '', 'base64').toString('utf8'),
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  walletServiceUrl: process.env.WALLET_SERVICE_URL || 'http://localhost:3002',
  transactionServiceUrl: process.env.TRANSACTION_SERVICE_URL || 'http://localhost:3003',
  analyticsServiceUrl: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3005',
  paymentLinkServiceUrl: process.env.PAYMENT_LINK_SERVICE_URL || 'http://localhost:3006',
}
