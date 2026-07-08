'use strict'

const { getRedisClient } = require('../redis/client')
const { createLogger } = require('../logger')

const logger = createLogger('shared:rateLimiter')

/**
 * Creates an Express rate-limiter middleware using Redis INCR + EXPIRE.
 *
 * How it works:
 *   Key: "rl:{windowKey}:{ip}"
 *   On each request:
 *     1. INCR the key (atomic)
 *     2. If count === 1 (first request in window) → set EXPIRE
 *     3. If count > limit → return 429
 *
 * @param {object} opts
 * @param {number} opts.limit         max requests per window (default: 100)
 * @param {number} opts.windowSeconds  window duration in seconds (default: 60)
 * @param {string} opts.keyPrefix      distinguishes different rate limit groups (default: 'global')
 */
function createRateLimiter({ limit = 100, windowSeconds = 60, keyPrefix = 'global' } = {}) {
  return async function rateLimiter(req, res, next) {
    const redis = getRedisClient()
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const key = `rl:${keyPrefix}:${ip}`

    try {
      const count = await redis.incr(key)

      if (count === 1) {
        // First request in this window — set the TTL
        await redis.expire(key, windowSeconds)
      }

      // Set rate limit headers so clients can see their quota
      const ttl = await redis.ttl(key)
      res.set({
        'X-RateLimit-Limit': limit,
        'X-RateLimit-Remaining': Math.max(0, limit - count),
        'X-RateLimit-Reset': Math.floor(Date.now() / 1000) + ttl,
      })

      if (count > limit) {
        logger.warn({ ip, key, count, limit }, 'Rate limit exceeded')
        return res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: `Too many requests. Limit is ${limit} per ${windowSeconds}s. Try again later.`,
            retryAfter: ttl,
          },
        })
      }

      next()
    } catch (err) {
      // If Redis is down, don't block requests — fail open
      logger.error({ err }, 'Rate limiter Redis error — failing open')
      next()
    }
  }
}

module.exports = { createRateLimiter }
