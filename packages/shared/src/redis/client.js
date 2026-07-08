'use strict'

const Redis = require('ioredis')
const { createLogger } = require('../logger')

const logger = createLogger('shared:redis')

let client = null

/**
 * Returns a singleton ioredis client.
 * Services call this once on startup; all subsequent calls get the same instance.
 */
function getRedisClient() {
  if (client) return client

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

  client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  })

  client.on('connect', () => logger.info({ redisUrl }, 'Redis connected'))
  client.on('error', (err) => logger.error({ err }, 'Redis error'))
  client.on('close', () => logger.warn('Redis connection closed'))

  return client
}

/**
 * Returns a connection option object or client for BullMQ.
 * BullMQ requires maxRetriesPerRequest to be null.
 */
function getBullMQConnection() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  })
}

module.exports = { getRedisClient, getBullMQConnection }
