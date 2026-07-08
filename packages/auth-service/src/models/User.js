const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
  },
  { timestamps: true }
)

userSchema.index({ email: 1 }, { unique: true })

// never return passwordHash in API responses
userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash
    return ret
  },
})

module.exports = mongoose.model('User', userSchema)
