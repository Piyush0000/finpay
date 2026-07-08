const mongoose = require('mongoose')

const ledgerEntrySchema = new mongoose.Schema({
  walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now, immutable: true },
})

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema)
