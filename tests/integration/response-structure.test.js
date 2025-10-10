/**
 * Streaming response structure smoke test
 * Ensures the SSE output includes expected event types.
 */

const { createSSECollector } = require('../helpers/sse-test-utils');

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

describe('Lambda Response Structure (Streaming)', () => {
  const { verifyGoogleToken } = require('../../src/auth');
  const { llmResponsesWithTools } = require('../../src/llm_tools_adapter');
  const { DuckDuckGoSearcher } = require('../../src/search');

  let collector;
  let baseEvent;
  let mockContext;

  const invokeHandler = async (overrides = {}) => {
    const event = {
      ...baseEvent,
      ...overrides,
      headers: {
        ...baseEvent.headers,
        ...(overrides.headers || {})
      }
    };

    await handler(event, collector.stream, mockContext);
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

    process.env.ACCESS_SECRET = 'structure-secret';
    process.env.GROQ_API_KEY = 'structure-api-key';

    baseEvent = {
      httpMethod: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        query: 'Simple test query',
        model: 'groq:llama-3.1-8b-instant',
        accessSecret: 'structure-secret',
        apiKey: 'structure-api-key'
      })
    };

    mockContext = {
      awsRequestId: 'structure-test-id',
      functionName: 'structure-test-function'
    };

    verifyGoogleToken.mockResolvedValue({
      email: 'structure@example.com',
      email_verified: true
    });

    DuckDuckGoSearcher.prototype.search = jest.fn().mockResolvedValue({
      query: 'test query',
      results: [],
      returned: 0
    });

    llmResponsesWithTools.mockResolvedValue({
      text: 'Mock synthesized answer.',
      output: []
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ACCESS_SECRET;
    delete process.env.GROQ_API_KEY;
  });

  test('emits init, llm events, and completion metadata', async () => {
    await invokeHandler();

    const initEvent = collector.findEvent('init');
    expect(initEvent).toBeDefined();
    expect(initEvent.data.query).toBe('Simple test query');

    const llmRequestEvent = collector.findEvent('llm_request');
    expect(llmRequestEvent).toBeDefined();

    const llmResponseEvent = collector.findEvent('llm_response');
    expect(llmResponseEvent).toBeDefined();

    const completeEvent = collector.findEvent('complete');
    expect(completeEvent).toBeDefined();
    expect(typeof completeEvent.data.executionTime).toBe('number');

    expect(collector.state.ended).toBe(true);
  });

  test('emits error event when JSON body is malformed', async () => {
    await invokeHandler({ body: 'not-json' });

    const errorEvent = collector.findEvent('error');
    expect(errorEvent).toBeDefined();
    expect(String(errorEvent.data.error)).toMatch(/Unexpected token|JSON/);
  });
});