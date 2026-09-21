const axios = require('axios');
const { createHttpCircuitBreaker } = require('@finpay/shared');

// Circuit breaker configurations for different services
const circuitBreakerConfigs = {
  auth: {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  },
  wallet: {
    timeout: 3000,
    errorThresholdPercentage: 40,
    resetTimeout: 20000
  },
  transaction: {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  },
  analytics: {
    timeout: 3000,
    errorThresholdPercentage: 60,
    resetTimeout: 40000
  },
  paymentLinks: {
    timeout: 4000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  }
};

// Create axios instance with default config
const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Circuit breaker instances for each service
const circuitBreakers = {};

/**
 * Get or create a circuit breaker for a specific service
 * @param {string} service - Service name (auth, wallet, etc.)
 * @returns {Function} - Circuit breaker protected function
 */
function getServiceCircuitBreaker(service) {
  if (!circuitBreakers[service]) {
    const config = circuitBreakerConfigs[service] || circuitBreakerConfigs.auth;
    circuitBreakers[service] = createHttpCircuitBreaker(axiosInstance, config);
  }
  return circuitBreakers[service];
}

/**
 * Get circuit breaker status for a service
 * @param {string} service - Service name
 * @returns {Object} - Circuit breaker status
 */
function getCircuitBreakerStatus(service) {
  const circuitBreaker = circuitBreakers[service];
  if (!circuitBreaker) {
    return { status: 'not_initialized' };
  }

  return {
    status: circuitBreaker.opened ? 'open' : (circuitBreaker.halfOpen ? 'halfOpen' : 'closed'),
    stats: circuitBreaker.stats
  };
}

/**
 * Get all circuit breaker statuses
 * @returns {Object} - All circuit breaker statuses
 */
function getAllCircuitBreakerStatuses() {
  const statuses = {};
  Object.keys(circuitBreakerConfigs).forEach(service => {
    statuses[service] = getCircuitBreakerStatus(service);
  });
  return statuses;
}

module.exports = {
  getServiceCircuitBreaker,
  getCircuitBreakerStatus,
  getAllCircuitBreakerStatuses
};