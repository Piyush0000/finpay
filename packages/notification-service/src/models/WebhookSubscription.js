const mongoose = require('mongoose')

const webhookSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    url: { type: String, required: true },
    secret: { type: String, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
)

module.exports = mongoose.model('WebhookSubscription', webhookSubscriptionSchema)
