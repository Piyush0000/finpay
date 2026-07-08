const mongoose = require('mongoose')

// read-only reference model — transaction service reads users but never writes them
const userSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    status: String,
  },
  { timestamps: true }
)

module.exports = mongoose.model('User', userSchema)
