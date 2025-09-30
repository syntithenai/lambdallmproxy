/**
 * Jest setup file
 * This file runs before each test suite
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.ALLOWED_EMAILS = 'test@example.com,admin@test.com';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';

// Mock AWS SDK globally if needed (only if it exists)
try {
  jest.mock('aws-sdk', () => ({
    config: {
      update: jest.fn()
    }
  }));
} catch (e) {
  // AWS SDK not installed, skip mocking
  console.log('AWS SDK not found, skipping mock');
}

// Global test utilities
global.testUtils = require('./helpers/testUtils');
global.mockData = require('./fixtures/mockData');

// Increase timeout for integration tests
jest.setTimeout(10000);

// Suppress console.log in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn() // Suppress errors in tests too for cleaner output
  };
}

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});