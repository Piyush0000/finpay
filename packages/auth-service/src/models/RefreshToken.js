const mongoose = require('mongoose')

const refreshTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  isRevoked: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
})

refreshTokenSchema.index({ token: 1 }, { unique: true })
refreshTokenSchema.index({ userId: 1 })
// auto-delete expired tokens from MongoDB
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('RefreshToken', refreshTokenSchema)
