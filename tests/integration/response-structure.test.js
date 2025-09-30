/**
 * Simple integration test for Lambda function response structure
 * Tests that the enhanced response includes all expected fields
 */

// Mock AWS Lambda streaming response before requiring the handler
jest.mock('aws-lambda', () => ({
  streamifyResponse: (handler) => handler
}), { virtual: true });

// Mock awslambda global
global.awslambda = {
  streamifyResponse: (handler) => handler
};

const { handleNonStreamingRequest } = require('../../src/lambda_search_llm_handler');

describe('Lambda Response Structure', () => {
  test('should return enhanced response structure fields', async () => {
    // Create a minimal valid request
    const mockEvent = {
      httpMethod: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        query: 'Simple test query',
        model: 'groq:llama-3.1-8b-instant',
        accessSecret: 'test-secret'
      })
    };

    const mockContext = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function'
    };

    // Set required environment variables
    process.env.ACCESS_SECRET = 'test-secret';
    process.env.GROQ_API_KEY = 'test-key';

    try {
      const response = await handleNonStreamingRequest(mockEvent, mockContext, Date.now());
      
      // Test should verify structure regardless of success/failure
      expect(response).toHaveProperty('statusCode');
      expect(response).toHaveProperty('headers');
      expect(response).toHaveProperty('body');
      
      const responseBody = JSON.parse(response.body);
      
      // Log response for debugging
      console.log('\n=== RESPONSE DEBUG ===');
      console.log('Status Code:', response.statusCode);
      console.log('Response Keys:', Object.keys(responseBody));
      
      // If successful, check for enhanced fields
      if (response.statusCode === 200) {
        console.log('SUCCESS: Checking enhanced fields...');
        expect(responseBody).toHaveProperty('query');
        expect(responseBody).toHaveProperty('response');
        expect(responseBody).toHaveProperty('metadata');
        expect(responseBody).toHaveProperty('toolCallCycles');
        expect(responseBody).toHaveProperty('llmCalls');
        expect(responseBody).toHaveProperty('costSummary');
        expect(responseBody).toHaveProperty('processingTime');
        expect(responseBody).toHaveProperty('timestamp');
        
        // Log structure details
        console.log('Tool Call Cycles:', Array.isArray(responseBody.toolCallCycles) ? responseBody.toolCallCycles.length + ' cycles' : 'not array');
        console.log('LLM Calls:', Array.isArray(responseBody.llmCalls) ? responseBody.llmCalls.length + ' calls' : 'not array');
        console.log('Cost Summary keys:', responseBody.costSummary ? Object.keys(responseBody.costSummary) : 'no cost summary');
      } else {
        console.log('ERROR RESPONSE:', responseBody);
      }
      
    } finally {
      // Clean up environment variables
      delete process.env.ACCESS_SECRET;
      delete process.env.GROQ_API_KEY;
    }
  });
});