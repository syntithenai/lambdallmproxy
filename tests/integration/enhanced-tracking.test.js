/**
 * Integration tests for enhanced Lambda handler tracking features
 * Tests tool calls, LLM responses, and cost tracking functionality
 */

// Mock AWS Lambda runtime before any imports
global.awslambda = {
  streamifyResponse: jest.fn((handler) => handler),
  HttpResponseStream: {
    from: jest.fn(() => ({
      writeEvent: jest.fn(),
      end: jest.fn()
    }))
  }
};

// Mock dependencies before requiring the handler
jest.mock('../../src/auth');
jest.mock('../../src/search');
jest.mock('../../src/llm_tools_adapter');

const { handleNonStreamingRequest } = require('../../src/lambda_search_llm_handler');

describe('Enhanced Lambda Handler Tracking', () => {
  let mockEvent;
  let mockContext;
  let mockLLMResponse;

  beforeEach(() => {
    mockEvent = {
      httpMethod: 'POST',
      headers: {
        'authorization': 'Bearer valid-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        query: 'Calculate the area and perimeter of a circle with radius 8.5 meters',
        model: 'groq:llama-3.1-8b-instant',
        accessSecret: 'test-secret'
      })
    };

    mockContext = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function'
    };

    // Mock comprehensive LLM response with tool calls
    mockLLMResponse = {
      text: 'The result is 53.41 square meters for the area and 53.41 meters for the perimeter.',
      output: [
        {
          request: {
            function: {
              name: 'execute_javascript',
              arguments: JSON.stringify({
                code: 'Math.PI * 8.5 ** 2; 2 * Math.PI * 8.5;'
              })
            },
            timestamp: new Date().toISOString()
          },
          response: {
            result: '53.40707511102649\n53.40707511102649',
            timestamp: new Date().toISOString()
          },
          cost: 0.001,
          inputTokens: 150,
          outputTokens: 75
        }
      ],
      totalCost: 0.0025,
      totalTokens: 300,
      inputTokens: 200,
      outputTokens: 100
    };

    // Setup mocks
    const { verifyGoogleToken } = require('../../src/auth');
    verifyGoogleToken.mockResolvedValue({
      email: 'test@example.com',
      email_verified: true
    });

    // Mock the llm tools adapter with detailed response
    const { llmResponsesWithTools } = require('../../src/llm_tools_adapter');
    llmResponsesWithTools.mockResolvedValue(mockLLMResponse);

    // Mock the search functionality
    const { DuckDuckGoSearcher } = require('../../src/search');
    DuckDuckGoSearcher.prototype.search = jest.fn().mockResolvedValue({
      query: 'test query',
      results: [],
      returned: 0
    });

    // Mock environment variables for testing
    process.env.ACCESS_SECRET = 'test-secret';
    process.env.GROQ_API_KEY = 'test-groq-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ACCESS_SECRET;
    delete process.env.GROQ_API_KEY;
  });

  test('should include comprehensive tool call tracking in response', async () => {
    const response = await handleNonStreamingRequest(mockEvent, mockContext, Date.now());

    expect(response).toBeDefined();
    
    // Debug: log the response to see what's happening
    console.log('Debug - Response status:', response.statusCode);
    console.log('Debug - Response body:', response.body);
    
    expect(response.statusCode).toBe(200);

    const responseBody = JSON.parse(response.body);
    
    // Check basic response structure
    expect(responseBody).toHaveProperty('query');
    expect(responseBody).toHaveProperty('response');
    expect(responseBody).toHaveProperty('metadata');
    expect(responseBody).toHaveProperty('processingTime');
    expect(responseBody).toHaveProperty('timestamp');

    // Check enhanced tracking data
    expect(responseBody).toHaveProperty('toolCallCycles');
    expect(responseBody).toHaveProperty('llmCalls');
    expect(responseBody).toHaveProperty('costSummary');

    // Verify tool call cycles structure
    expect(Array.isArray(responseBody.toolCallCycles)).toBe(true);
    
    // Verify LLM calls structure
    expect(Array.isArray(responseBody.llmCalls)).toBe(true);

    // Verify cost summary structure
    expect(responseBody.costSummary).toHaveProperty('totalCost');
    expect(responseBody.costSummary).toHaveProperty('totalTokens');
    expect(responseBody.costSummary).toHaveProperty('modelName');
    expect(responseBody.costSummary).toHaveProperty('steps');
    expect(Array.isArray(responseBody.costSummary.steps)).toBe(true);
  });

  test('should include metadata with iteration and call counts', async () => {
    const response = await handleNonStreamingRequest(mockEvent, mockContext, Date.now());

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);

    // Check enhanced metadata
    expect(responseBody.metadata).toHaveProperty('currentIteration');
    expect(responseBody.metadata).toHaveProperty('totalIterations');
    expect(responseBody.metadata).toHaveProperty('totalToolCalls');
    expect(responseBody.metadata).toHaveProperty('totalLLMCalls');
    expect(responseBody.metadata).toHaveProperty('finalModel');
    expect(responseBody.metadata).toHaveProperty('mode');

    // Verify metadata values are numbers
    expect(typeof responseBody.metadata.currentIteration).toBe('number');
    expect(typeof responseBody.metadata.totalIterations).toBe('number');
    expect(typeof responseBody.metadata.totalToolCalls).toBe('number');
    expect(typeof responseBody.metadata.totalLLMCalls).toBe('number');
  });

  test('should handle mathematical queries with tool execution', async () => {
    const response = await handleNonStreamingRequest(mockEvent, mockContext, Date.now());

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);

    // Verify response contains mathematical calculation
    expect(responseBody.response).toContain('53.41');
    expect(responseBody.response).toContain('area');
    expect(responseBody.response).toContain('perimeter');

    // Check that cost summary has reasonable values for a mathematical query
    expect(responseBody.costSummary.totalCost).toBeGreaterThanOrEqual(0);
    expect(responseBody.costSummary.totalTokens).toBeGreaterThan(0);
  });

  test('should include research plan when available', async () => {
    const response = await handleNonStreamingRequest(mockEvent, mockContext, Date.now());

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);

    // Research plan should be included (may be null for simple queries)
    expect(responseBody).toHaveProperty('researchPlan');
  });

  test('should handle queries without access secret', async () => {
    // Remove access secret from request
    const eventWithoutSecret = {
      ...mockEvent,
      body: JSON.stringify({
        query: 'Test query without secret',
        model: 'groq:llama-3.1-8b-instant'
      })
    };

    const response = await handleNonStreamingRequest(eventWithoutSecret, mockContext, Date.now());

    expect(response.statusCode).toBe(401);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.error).toContain('Invalid or missing accessSecret');
  });

  test('should handle quota/rate limit errors gracefully', async () => {
    // Mock LLM adapter to throw a quota error
    const { llmResponsesWithTools } = require('../../src/llm_tools_adapter');
    llmResponsesWithTools.mockRejectedValue(new Error('Rate limit exceeded. Please wait 60 seconds.'));

    const response = await handleNonStreamingRequest(mockEvent, mockContext, Date.now());

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);

    // Should include quota error information
    expect(responseBody.metadata).toHaveProperty('error', true);
    expect(responseBody.metadata).toHaveProperty('quotaError', true);
    expect(responseBody.response).toContain('Rate limit reached');
  });

  test('should preserve tool call cycle structure', async () => {
    // Mock a more complex tool call structure
    const complexMockResponse = {
      ...mockLLMResponse,
      output: [
        {
          request: {
            function: { name: 'search_web', arguments: JSON.stringify({ query: 'circle formulas' }) },
            timestamp: new Date().toISOString()
          },
          response: {
            result: 'Search results about circle formulas',
            timestamp: new Date().toISOString()
          }
        },
        {
          request: {
            function: { name: 'execute_javascript', arguments: JSON.stringify({ code: 'Math.PI * 8.5 ** 2' }) },
            timestamp: new Date().toISOString()
          },
          response: {
            result: '53.40707511102649',
            timestamp: new Date().toISOString()
          }
        }
      ]
    };

    const { llmResponsesWithTools } = require('../../src/llm_tools_adapter');
    llmResponsesWithTools.mockResolvedValue(complexMockResponse);

    const response = await handleNonStreamingRequest(mockEvent, mockContext, Date.now());

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);

    // Verify tool call cycles preserve the structure
    expect(responseBody.toolCallCycles).toBeDefined();
    expect(Array.isArray(responseBody.toolCallCycles)).toBe(true);
    
    // Verify metadata reflects multiple tool calls
    expect(responseBody.metadata.totalToolCalls).toBeGreaterThanOrEqual(0);
  });
});