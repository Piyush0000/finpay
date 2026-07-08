const mongoose = require('mongoose')

const analyticsAggregateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    period: { type: String, required: true }, // Format: YYYY-MM (e.g. 2026-07)
    totalSent: { type: Number, default: 0 }, // in paisa
    totalReceived: { type: Number, default: 0 }, // in paisa
    transactionCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// Ensure unique index for fast atomic upserts
analyticsAggregateSchema.index({ userId: 1, period: 1 }, { unique: true })

module.exports = mongoose.model('AnalyticsAggregate', analyticsAggregateSchema)
