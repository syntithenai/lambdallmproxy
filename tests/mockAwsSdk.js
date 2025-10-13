/**
 * Mock AWS SDK v3 globally to prevent initialization issues in tests
 * This file runs BEFORE any test files are imported
 */

// Mock AWS SDK v3 (client-lambda) to prevent hanging during imports
jest.mock('@aws-sdk/client-lambda', () => {
  return {
    LambdaClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({
          statusCode: 200,
          body: JSON.stringify({ success: true, html: '<html></html>' })
        }))
      })
    })),
    InvokeCommand: jest.fn().mockImplementation((params) => params)
  };
});
