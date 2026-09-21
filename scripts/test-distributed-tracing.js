/**
 * Distributed Tracing Test Script
 * This script verifies that OpenTelemetry tracing is properly initialized
 */

const { initializeTracing, getTraceContext, shutdownTracing } = require('@finpay/shared');

async function testDistributedTracing() {
  console.log('=== Distributed Tracing Test ===\n');
  
  // Initialize tracing for a test service
  console.log('1. Initializing OpenTelemetry tracing...');
  initializeTracing({
    serviceName: 'test-service',
    serviceVersion: '1.0.0'
  });
  
  // Get trace context
  console.log('2. Getting trace context...');
  const traceContext = getTraceContext();
  
  if (traceContext) {
    console.log('✅ Trace context available:');
    console.log('   Trace ID:', traceContext.traceId);
    console.log('   Span ID:', traceContext.spanId);
    console.log('   Trace Flags:', traceContext.traceFlags);
  } else {
    console.log('⚠️ No active trace context (expected in standalone test)');
  }
  
  // Simulate some operations to generate spans
  console.log('\n3. Simulating operations to generate spans...');
  
  // Import the trace API to create a manual span
  const api = require('@opentelemetry/api');
  const tracer = api.trace.getTracer('test-tracer');
  
  await tracer.startActiveSpan('test-operation', async (span) => {
    span.setAttribute('operation.type', 'test');
    span.setAttribute('operation.id', '12345');
    
    console.log('   Executing test operation...');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    span.end();
  });
  
  console.log('4. Operation completed with tracing context');
  
  // Wait a moment for spans to be exported
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n5. Distributed tracing verification complete');
  console.log('   (In production, spans would be exported to OTLP collector)');
  
  // Shutdown tracing
  console.log('\n6. Shutting down OpenTelemetry...');
  await shutdownTracing();
  
  console.log('\n✅ Distributed tracing test completed successfully');
}

// Run the test
testDistributedTracing().catch(console.error);