const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['EMAIL', 'PUSH'], default: 'EMAIL' },
    recipientEmail: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' },
    attempts: { type: Number, default: 0 },
    failureReason: { type: String },
  },
  { timestamps: true }
)

notificationSchema.index({ userId: 1, createdAt: -1 })
notificationSchema.index({ transactionId: 1 })

module.exports = mongoose.model('Notification', notificationSchema)
