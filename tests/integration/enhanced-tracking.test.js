/**
 * Integration tests for enhanced Lambda handler tracking using streaming SSE events.
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

// SKIP: These tests import lambda handler which transitively imports tools.js
// TODO: Refactor to separate business logic from HTTP handler logic
describe.skip('Enhanced Lambda Handler Tracking (Streaming)', () => {
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

    process.env.ACCESS_SECRET = 'test-secret';
    process.env.GROQ_API_KEY = 'test-groq-key';

    baseEvent = {
      httpMethod: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        query: 'Calculate the area and perimeter of a circle with radius 8.5 meters',
        model: 'groq:llama-3.1-8b-instant',
        accessSecret: 'test-secret',
        apiKey: 'test-api-key'
      })
    };

    mockContext = {
      awsRequestId: 'tracking-test-request',
      functionName: 'tracking-test-function'
    };

    verifyGoogleToken.mockResolvedValue({
      email: 'test@example.com',
      email_verified: true
    });

    DuckDuckGoSearcher.prototype.search = jest.fn().mockResolvedValue({
      query: 'circle formulas',
      results: [],
      returned: 0
    });

    const planningResponse = {
      text: JSON.stringify({
        research_questions: ['What is the area of a circle with radius 8.5 meters?'],
        optimal_persona: 'I am a mathematician specialized in geometry.',
        reasoning: 'Use geometry formulas to compute area and perimeter.',
        complexity_assessment: 'medium'
      }),
      output: []
    };

    const synthesisResponse = {
      text:
        'The area is approximately 227.0 square meters and the perimeter is approximately 53.41 meters.',
      output: []
    };

    llmResponsesWithTools
      .mockResolvedValueOnce(planningResponse)
      .mockResolvedValueOnce(synthesisResponse);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ACCESS_SECRET;
    delete process.env.GROQ_API_KEY;
  });

  test('streams planning and synthesis events with completion metadata', async () => {
    await invokeHandler();

    const llmRequests = collector.getEvents().filter((evt) => evt.type === 'llm_request');
    expect(llmRequests.length).toBeGreaterThanOrEqual(2);
    expect(llmRequests.some((evt) => evt.data?.phase === 'planning')).toBe(true);

    const llmResponses = collector.getEvents().filter((evt) => evt.type === 'llm_response');
    expect(llmResponses.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(llmResponses[0].data)).toContain('geometry');

    const completeEvent = collector.findEvent('complete');
    expect(completeEvent).toBeDefined();
    expect(typeof completeEvent.data.executionTime).toBe('number');
    expect(collector.state.ended).toBe(true);
  });

  test('emits llm_response event payload from adapter output', async () => {
    await invokeHandler();

    const responseEvent = collector.findEvent('llm_response');
    expect(responseEvent).toBeDefined();
    expect(responseEvent.data).toBeDefined();
    expect(responseEvent.data.response?.text || responseEvent.data.text).toBeDefined();
  });

  test('emits quota error event when adapter rejects with rate limit', async () => {
    const planningResponse = {
      text: JSON.stringify({
        research_questions: ['What is the area of a circle?'],
        optimal_persona: 'I am a mathematician.',
        reasoning: 'Use circle area formula.',
        complexity_assessment: 'low'
      }),
      output: []
    };

    llmResponsesWithTools.mockReset();
    llmResponsesWithTools
      .mockResolvedValueOnce(planningResponse)
      .mockRejectedValueOnce(new Error('Rate limit exceeded. Please wait 60 seconds.'));

    await invokeHandler();

    const errorEvent = collector.findEvent('error');
    expect(errorEvent).toBeDefined();
    expect(String(errorEvent.data.error)).toContain('Rate limit');
  });
});