const jwt = require('jsonwebtoken')
const config = require('../config')

function jwtVerify(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' } })
  }

  const token = authHeader.slice(7)

  try {
    const payload = jwt.verify(token, config.jwtPublicKey, { algorithms: ['RS256'] })
    // inject userId for downstream services
    req.headers['x-user-id'] = payload.sub
    req.headers['x-user-email'] = payload.email
    next()
  } catch {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } })
  }
}

module.exports = { jwtVerify }
