const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const RefreshToken = require('../models/RefreshToken')
const { UnauthorizedError } = require('@finpay/shared')
const config = require('../config')

class TokenService {
  generateAccessToken(user) {
    return jwt.sign(
      { sub: user._id.toString(), email: user.email, jti: crypto.randomUUID() },
      config.jwtPrivateKey,
      { algorithm: 'RS256', expiresIn: config.jwtAccessExpires }
    )
  }

  async generateRefreshToken(userId) {
    const token = crypto.randomBytes(64).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await RefreshToken.create({ userId, token, expiresAt })
    return token
  }

  async rotateRefreshToken(oldToken) {
    const record = await RefreshToken.findOne({ token: oldToken })

    if (!record || record.isRevoked || record.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token')
    }

    record.isRevoked = true
    await record.save()

    const newToken = await this.generateRefreshToken(record.userId)
    return { newToken, userId: record.userId }
  }

  async revokeRefreshToken(token) {
    await RefreshToken.findOneAndUpdate({ token }, { isRevoked: true })
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, config.jwtPublicKey, { algorithms: ['RS256'] })
    } catch {
      throw new UnauthorizedError('Invalid or expired access token')
    }
  }
}

module.exports = new TokenService()
