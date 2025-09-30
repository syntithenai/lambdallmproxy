/**
 * Test helper utilities
 */

/**
 * Create a mock stream for testing streaming responses
 */
function createMockStream() {
  const events = [];
  
  return {
    writeEvent: jest.fn((type, data) => {
      events.push({ type, data, timestamp: new Date().toISOString() });
    }),
    
    getEvents: () => events,
    
    getEventsByType: (type) => events.filter(e => e.type === type),
    
    getLastEvent: (type) => {
      const filtered = type ? events.filter(e => e.type === type) : events;
      return filtered[filtered.length - 1];
    },
    
    clear: () => {
      events.length = 0;
    }
  };
}

/**
 * Create a mock Lambda context
 */
function createMockContext(overrides = {}) {
  return {
    awsRequestId: 'test-request-id',
    functionName: 'test-function',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: 256,
    remainingTimeInMillis: () => 30000,
    ...overrides
  };
}

/**
 * Create a mock Lambda event
 */
function createMockEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer valid-token'
    },
    queryStringParameters: null,
    pathParameters: null,
    body: JSON.stringify({
      query: 'test query',
      model: 'groq:llama-3.1-8b-instant'
    }),
    isBase64Encoded: false,
    ...overrides
  };
}

/**
 * Wait for a specified amount of time
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate Lambda response format
 */
function validateLambdaResponse(response) {
  expect(response).toBeDefined();
  expect(response).toHaveProperty('statusCode');
  expect(response).toHaveProperty('headers');
  expect(response).toHaveProperty('body');
  expect(typeof response.statusCode).toBe('number');
  expect(typeof response.headers).toBe('object');
  expect(typeof response.body).toBe('string');
}

/**
 * Validate CORS headers
 */
function validateCorsHeaders(headers) {
  expect(headers).toHaveProperty('Access-Control-Allow-Origin');
  expect(headers).toHaveProperty('Access-Control-Allow-Methods');
  expect(headers).toHaveProperty('Access-Control-Allow-Headers');
}

/**
 * Create a mock timer for testing timeouts
 */
function createMockTimer() {
  let timeoutId = null;
  let callbacks = [];
  
  return {
    setTimeout: jest.fn((callback, delay) => {
      timeoutId = Math.random();
      callbacks.push({ id: timeoutId, callback, delay });
      return timeoutId;
    }),
    
    clearTimeout: jest.fn((id) => {
      callbacks = callbacks.filter(c => c.id !== id);
    }),
    
    runTimers: () => {
      callbacks.forEach(c => c.callback());
      callbacks = [];
    },
    
    getActiveTimers: () => callbacks
  };
}

module.exports = {
  createMockStream,
  createMockContext,
  createMockEvent,
  delay,
  validateLambdaResponse,
  validateCorsHeaders,
  createMockTimer
};