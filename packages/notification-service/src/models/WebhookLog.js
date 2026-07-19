const mongoose = require('mongoose')

const webhookLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    url: { type: String, required: true },
    eventType: { type: String, required: true },
    payload: { type: Object, required: true },
    statusCode: { type: Number },
    responseBody: { type: String },
    status: { type: String, enum: ['success', 'failed'], required: true },
    attempts: { type: Number, default: 1 },
  },
  { timestamps: true }
)

module.exports = mongoose.model('WebhookLog', webhookLogSchema)
