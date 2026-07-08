const { randomUUID } = require('crypto')

function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || randomUUID()
  res.setHeader('X-Request-ID', req.requestId)
  next()
}

module.exports = { requestId }
