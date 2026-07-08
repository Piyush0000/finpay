require('dotenv').config()

module.exports = {
  port: process.env.AUTH_SERVICE_PORT || 3001,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/finpay',
  jwtPrivateKey: Buffer.from(process.env.JWT_PRIVATE_KEY || '', 'base64').toString('utf8'),
  jwtPublicKey: Buffer.from(process.env.JWT_PUBLIC_KEY || '', 'base64').toString('utf8'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
}
