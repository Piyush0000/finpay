const { AppError } = require('../errors')
const { createLogger } = require('../logger')

const logger = createLogger('shared')

function errorHandler(err, req, res, next) {
  const requestId = req.requestId || 'unknown'

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, requestId }
    })
  }

  // unexpected error — log with Pino, don't leak internals
  logger.error({ err, requestId }, 'Unhandled error')
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId }
  })
}

module.exports = { errorHandler }
