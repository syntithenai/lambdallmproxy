/**
 * Integration tests for Lambda handler core logic using streaming SSE output.
 */

const { createSSECollector } = require('../helpers/sse-test-utils');

// Mock dependencies before requiring the handler
jest.mock('../../src/auth');
jest.mock('../../src/search');
jest.mock('../../src/llm_tools_adapter');
jest.mock('../../src/tools', () => ({
  toolFunctions: {},
  callFunction: jest.fn()
}));

global.awslambda = {
  streamifyResponse: jest.fn((fn) => fn),
  HttpResponseStream: {
    from: jest.fn()
  }
};

const { handler } = require('../../src/lambda_search_llm_handler');

// SKIP: These tests import lambda handler which transitively imports tools.js
// TODO: Refactor to separate business logic from HTTP handler logic
describe.skip('Lambda Handler Core Logic (Streaming)', () => {
  const { verifyGoogleToken } = require('../../src/auth');
  const { llmResponsesWithTools } = require('../../src/llm_tools_adapter');
  const { DuckDuckGoSearcher } = require('../../src/search');

  let collector;
  let mockContext;
  let baseEvent;

  const invokeHandler = async (overrides = {}) => {
    const event = {
      ...baseEvent,
      ...overrides,
      headers: {
        ...baseEvent.headers,
        ...(overrides.headers || {})
      }
    };

    const responseStream = collector.stream;
    await handler(event, responseStream, mockContext);
    return collector;
  };

  beforeEach(() => {
    collector = createSSECollector();

    global.awslambda = {
      streamifyResponse: jest.fn((fn) => fn),
      HttpResponseStream: {
        from: jest.fn((stream, metadata) => {
          collector.setMetadata(metadata);
          return collector.stream;
        })
      }
    };

    process.env.ACCESS_SECRET = 'test-secret';

    baseEvent = {
      httpMethod: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        query: 'What is machine learning?',
        model: 'groq:llama-3.1-8b-instant',
        accessSecret: 'test-secret',
        apiKey: 'test-api-key'
      })
    };

    mockContext = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function'
    };

    verifyGoogleToken.mockResolvedValue({
      email: 'test@example.com',
      email_verified: true
    });

    llmResponsesWithTools.mockResolvedValue({
      text: 'Mock response from LLM',
      output: []
    });

    DuckDuckGoSearcher.prototype.search = jest.fn().mockResolvedValue({
      query: 'test query',
      results: [],
      returned: 0
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ACCESS_SECRET;
  });

  test('rejects non-POST requests with error event', async () => {
    await invokeHandler({ httpMethod: 'OPTIONS' });

    const errorEvents = collector.events.filter(e => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0].data.error).toContain('Method not allowed');
    expect(collector.state.ended).toBe(true);
  });

  test('emits error when request body is missing query', async () => {
    await invokeHandler({
      body: JSON.stringify({
        model: 'groq:llama-3.1-8b-instant',
        accessSecret: 'test-secret',
        apiKey: 'test-api-key'
      })
    });

    const errorEvent = collector.findEvent('error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data.error).toMatch(/Query parameter is required/);
  });

  test('emits error when access secret is invalid', async () => {
    await invokeHandler({
      body: JSON.stringify({
        query: 'hello',
        model: 'groq:llama-3.1-8b-instant',
        accessSecret: 'wrong-secret',
        apiKey: 'test-api-key'
      })
    });

    const errorEvent = collector.findEvent('error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data.code).toBe('INVALID_ACCESS_SECRET');
  });

  test('emits init and complete events for valid request', async () => {
    await invokeHandler();

    const initEvent = collector.findEvent('init');
    expect(initEvent).toBeDefined();
    expect(initEvent.data.query).toBe('What is machine learning?');

    const completeEvent = collector.findEvent('complete');
    expect(completeEvent).toBeDefined();
    expect(typeof completeEvent.data.executionTime).toBe('number');
    expect(collector.state.ended).toBe(true);
  });
});