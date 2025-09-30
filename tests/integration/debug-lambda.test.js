/**
 * Debug test to check Lambda function loading and basic structure
 */

// Mock AWS Lambda streaming response before requiring the handler
jest.mock('aws-lambda', () => ({
  streamifyResponse: (handler) => handler
}), { virtual: true });

// Mock awslambda global
global.awslambda = {
  streamifyResponse: (handler) => handler
};

describe('Lambda Function Debug', () => {
  test('should load Lambda handler without errors', () => {
    console.log('=== LOADING LAMBDA HANDLER ===');
    
    try {
      const handler = require('../../src/lambda_search_llm_handler');
      console.log('Handler loaded successfully');
      console.log('Handler exports:', Object.keys(handler));
      
      // Check if handleNonStreamingRequest exists
      expect(handler).toHaveProperty('handleNonStreamingRequest');
      expect(typeof handler.handleNonStreamingRequest).toBe('function');
      
      console.log('handleNonStreamingRequest is a function:', typeof handler.handleNonStreamingRequest === 'function');
      
    } catch (error) {
      console.error('Error loading handler:', error.message);
      throw error;
    }
  });
  
  test('should create basic response structure', async () => {
    console.log('=== TESTING BASIC RESPONSE ===');
    
    const { handleNonStreamingRequest } = require('../../src/lambda_search_llm_handler');
    
    // Create minimal test event
    const mockEvent = {
      httpMethod: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        model: 'groq:llama-3.1-8b-instant',
        accessSecret: 'wrong-secret' // Use wrong secret to get predictable error
      })
    };
    
    const mockContext = {
      awsRequestId: 'test-123',
      functionName: 'test'
    };
    
    process.env.ACCESS_SECRET = 'correct-secret';
    
    try {
      const response = await handleNonStreamingRequest(mockEvent, mockContext, Date.now());
      
      console.log('Response received');
      console.log('Status:', response.statusCode);
      console.log('Headers:', response.headers ? Object.keys(response.headers) : 'no headers');
      console.log('Body exists:', !!response.body);
      
      if (response.body) {
        const body = JSON.parse(response.body);
        console.log('Body keys:', Object.keys(body));
        
        if (body.error) {
          console.log('Error response:', body.error);
        }
      }
      
      expect(response).toHaveProperty('statusCode');
      expect(response).toHaveProperty('body');
      
    } catch (error) {
      console.error('Test error:', error.message);
      throw error;
    } finally {
      delete process.env.ACCESS_SECRET;
    }
  });
});