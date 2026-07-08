const mongoose = require('mongoose')

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['active', 'frozen', 'closed'], default: 'active' },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
)

walletSchema.index({ userId: 1 }, { unique: true })
walletSchema.index({ status: 1 })

module.exports = mongoose.model('Wallet', walletSchema)
