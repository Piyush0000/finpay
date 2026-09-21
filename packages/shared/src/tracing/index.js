const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

let sdk = null;

/**
 * Initialize OpenTelemetry tracing
 * @param {Object} options - Configuration options
 * @param {string} options.serviceName - Name of the service
 * @param {string} options.serviceVersion - Version of the service
 * @param {string} options.otlpEndpoint - OTLP collector endpoint (optional)
 */
function initializeTracing(options = {}) {
  const {
    serviceName = 'finpay-service',
    serviceVersion = '1.0.0',
    otlpEndpoint = process.env.OTLP_ENDPOINT || 'http://localhost:4318'
  } = options;

  // Create a resource with service information
  const resource = Resource.default().merge(
    new Resource({
      'service.name': serviceName,
      'service.version': serviceVersion,
      'deployment.environment': process.env.NODE_ENV || 'development'
    })
  );

  // Initialize the SDK
  sdk = new NodeSDK({
    resource,
    instrumentations: [getNodeAutoInstrumentations()],
    // Use console exporter for local development
    traceExporter: new ConsoleSpanExporter(),
  });

  // Start the SDK
  sdk.start();

  console.log(`[OpenTelemetry] Tracing initialized for service: ${serviceName}`);
}

/**
 * Get the current trace context
 * @returns {Object} - Trace context with traceId and spanId
 */
function getTraceContext() {
  const api = require('@opentelemetry/api');
  const currentSpan = api.trace.getSpan(api.context.active());
  
  if (currentSpan) {
    const spanContext = currentSpan.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags
    };
  }
  
  return null;
}

/**
 * Shutdown the OpenTelemetry SDK
 */
async function shutdownTracing() {
  if (sdk) {
    await sdk.shutdown();
    console.log('[OpenTelemetry] Tracing shutdown complete');
  }
}

module.exports = {
  initializeTracing,
  getTraceContext,
  shutdownTracing
};