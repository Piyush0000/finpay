const mongoose = require('mongoose')

const paymentLinkSchema = new mongoose.Schema(
  {
    creatorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    merchantEmail: { type: String, required: true },
    amount: { type: Number, required: true }, // positive integer in paisa
    description: { type: String, default: '' },
    status: { type: String, enum: ['active', 'paid'], default: 'active' },
    transactionId: { type: String, default: '' },
  },
  { timestamps: true }
)

module.exports = mongoose.model('PaymentLink', paymentLinkSchema)
