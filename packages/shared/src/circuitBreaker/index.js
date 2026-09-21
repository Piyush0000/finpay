const CircuitBreaker = require('opossum');

/**
 * Create a circuit breaker for a function
 * @param {Function} fn - The function to protect with circuit breaker
 * @param {Object} options - Circuit breaker options
 * @returns {CircuitBreaker} - Circuit breaker instance
 */
function createCircuitBreaker(fn, options = {}) {
  const defaultOptions = {
    timeout: 3000, // If function takes longer than 3s, trigger a failure
    errorThresholdPercentage: 50, // When 50% of requests fail, trip the circuit
    resetTimeout: 30000, // After 30 seconds, try again
    rollingCountTimeout: 10000, // Consider last 10s for statistics
    rollingCountBuckets: 10, // Divide 10s into 10 buckets
    ...options
  };

  const circuitBreaker = new CircuitBreaker(fn, defaultOptions);

  // Circuit breaker event listeners for logging
  circuitBreaker.on('open', () => {
    console.log(`[CircuitBreaker] Circuit OPENED for ${fn.name || 'anonymous function'}`);
  });

  circuitBreaker.on('halfOpen', () => {
    console.log(`[CircuitBreaker] Circuit HALF-OPEN for ${fn.name || 'anonymous function'}`);
  });

  circuitBreaker.on('close', () => {
    console.log(`[CircuitBreaker] Circuit CLOSED for ${fn.name || 'anonymous function'}`);
  });

  circuitBreaker.on('fallback', (result) => {
    console.log(`[CircuitBreaker] Fallback executed for ${fn.name || 'anonymous function'}`);
  });

  return circuitBreaker;
}

/**
 * Create a circuit breaker for HTTP requests (useful for service-to-service calls)
 * @param {Object} axios - Axios instance
 * @param {Object} options - Circuit breaker options
 * @returns {Function} - Wrapped axios function with circuit breaker
 */
function createHttpCircuitBreaker(axios, options = {}) {
  const circuitBreakerOptions = {
    timeout: options.timeout || 5000,
    errorThresholdPercentage: options.errorThresholdPercentage || 50,
    resetTimeout: options.resetTimeout || 30000,
    ...options
  };

  const protectedRequest = createCircuitBreaker(
    async (config) => {
      const response = await axios(config);
      return response.data;
    },
    circuitBreakerOptions
  );

  // Fallback function when circuit is open
  protectedRequest.fallback(() => {
    throw new Error('Service temporarily unavailable due to circuit breaker');
  });

  return protectedRequest;
}

module.exports = {
  createCircuitBreaker,
  createHttpCircuitBreaker
};