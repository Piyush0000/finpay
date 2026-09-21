/**
 * Circuit Breaker Test Script
 * This script demonstrates the circuit breaker functionality by simulating failures
 */

const { createCircuitBreaker } = require('@finpay/shared');

// Simulate a flaky operation that fails 70% of the time
let failureCount = 0;
async function flakyOperation() {
  failureCount++;
  console.log(`Operation attempt #${failureCount}`);
  
  // Fail 70% of the time
  if (Math.random() < 0.7) {
    console.log('❌ Operation failed');
    throw new Error('Simulated operation failure');
  }
  
  console.log('✅ Operation succeeded');
  return { success: true, attempt: failureCount };
}

// Create circuit breaker with aggressive settings for testing
const circuitBreaker = createCircuitBreaker(flakyOperation, {
  timeout: 1000,
  errorThresholdPercentage: 50, // Trip after 50% failures
  resetTimeout: 5000, // Try again after 5 seconds
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10
});

// Fallback when circuit is open
circuitBreaker.fallback(() => {
  console.log('⚠️ Circuit breaker fallback triggered');
  return { success: false, message: 'Service temporarily unavailable' };
});

// Test the circuit breaker
async function testCircuitBreaker() {
  console.log('=== Circuit Breaker Test ===\n');
  
  console.log('Phase 1: Normal operations (some failures expected)');
  for (let i = 0; i < 10; i++) {
    try {
      const result = await circuitBreaker.fire();
      console.log('Result:', result);
    } catch (error) {
      console.log('Error:', error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\nPhase 2: Circuit breaker status');
  console.log('Circuit state:', circuitBreaker.opened ? 'OPEN' : (circuitBreaker.halfOpen ? 'HALF_OPEN' : 'CLOSED'));
  console.log('Stats:', circuitBreaker.stats);
  
  console.log('\nPhase 3: Wait for circuit to potentially reset...');
  await new Promise(resolve => setTimeout(resolve, 6000));
  
  console.log('\nPhase 4: Try operation after reset timeout');
  try {
    const result = await circuitBreaker.fire();
    console.log('Result:', result);
  } catch (error) {
    console.log('Error:', error.message);
  }
  
  console.log('\nFinal circuit breaker status');
  console.log('Circuit state:', circuitBreaker.opened ? 'OPEN' : (circuitBreaker.halfOpen ? 'HALF_OPEN' : 'CLOSED'));
  console.log('Final stats:', circuitBreaker.stats);
}

// Run the test
testCircuitBreaker().catch(console.error);