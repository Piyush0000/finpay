const mongoose = require('mongoose')

const transactionSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, unique: true, sparse: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'ROLLED_BACK'],
      default: 'PENDING',
    },
    failureReason: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Transaction', transactionSchema)
