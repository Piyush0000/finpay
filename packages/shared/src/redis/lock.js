'use strict'

const crypto = require('crypto')
const { getRedisClient } = require('./client')
const { createLogger } = require('../logger')

const logger = createLogger('shared:lock')

const DEFAULT_TTL_MS = 10_000   // 10 seconds max lock hold time
const DEFAULT_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 100

/**
 * Atomic Lua script for lock release.
 * Only deletes the key if the stored token matches ours —
 * prevents us from releasing a lock that was re-acquired by another process
 * after our TTL expired.
 */
const RELEASE_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`

/**
 * Acquire a distributed lock on a resource key.
 *
 * @param {string} resource   e.g. "wallet:6a4e8c..."
 * @param {number} ttlMs      how long to hold the lock (default 10s)
 * @param {number} retries    how many times to retry on contention
 * @param {number} retryDelay ms between retries
 * @returns {string|null}     lock token (use to release), or null if failed
 */
async function acquireLock(resource, ttlMs = DEFAULT_TTL_MS, retries = DEFAULT_RETRIES, retryDelay = DEFAULT_RETRY_DELAY_MS) {
  const redis = getRedisClient()
  const lockKey = `lock:${resource}`
  const token = crypto.randomBytes(16).toString('hex')

  for (let attempt = 0; attempt <= retries; attempt++) {
    // SET key token NX PX ttl — atomic: only sets if key doesn't exist
    const result = await redis.set(lockKey, token, 'NX', 'PX', ttlMs)

    if (result === 'OK') {
      logger.debug({ resource, attempt }, 'Lock acquired')
      return token
    }

    if (attempt < retries) {
      logger.debug({ resource, attempt }, 'Lock contention, retrying...')
      await sleep(retryDelay * (attempt + 1)) // linear backoff
    }
  }

  logger.warn({ resource }, 'Failed to acquire lock after retries')
  return null
}

/**
 * Release a distributed lock.
 * Uses a Lua script to ensure we only delete the key if we still own it.
 *
 * @param {string} resource  same resource key used in acquireLock
 * @param {string} token     the token returned by acquireLock
 * @returns {boolean}        true if we released it, false if it had already expired
 */
async function releaseLock(resource, token) {
  const redis = getRedisClient()
  const lockKey = `lock:${resource}`

  try {
    const result = await redis.eval(RELEASE_SCRIPT, 1, lockKey, token)
    const released = result === 1
    logger.debug({ resource, released }, 'Lock release')
    return released
  } catch (err) {
    logger.error({ err, resource }, 'Lock release error')
    return false
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = { acquireLock, releaseLock }
