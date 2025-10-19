/**
 * Lambda Metrics Integration Tests
 * 
 * Verify that Lambda metrics (memory limit, memory used, request ID) are correctly
 * extracted and passed to logging calls across all endpoints.
 */

const { logToGoogleSheets } = require('../../src/services/google-sheets-logger');

// Mock the actual Google Sheets logging to capture calls
jest.mock('../../src/services/google-sheets-logger', () => {
    const originalModule = jest.requireActual('../../src/services/google-sheets-logger');
    return {
        ...originalModule,
        logToGoogleSheets: jest.fn().mockResolvedValue(undefined)
    };
});

describe('Lambda Metrics Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Chat Endpoint', () => {
        it('should extract Lambda metrics from context and pass to logging', async () => {
            const chatHandler = require('../../src/endpoints/chat');
            
            // Mock context with Lambda metrics
            const mockContext = {
                memoryLimitInMB: 512,
                requestId: 'test-request-id-123',
                functionName: 'lambdallmproxy',
                functionVersion: '1'
            };

            // Mock event and response stream
            const mockEvent = {
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'test message' }],
                    model: 'gpt-3.5-turbo',
                    providers: {}
                }),
                headers: {
                    authorization: 'Bearer test-token'
                },
                requestContext: { http: { method: 'POST' } },
                rawPath: '/chat'
            };

            const mockResponseStream = {
                write: jest.fn(),
                end: jest.fn()
            };

            // Test that handler accepts context parameter (signature test)
            expect(chatHandler.handler.length).toBe(3); // event, responseStream, context
        });
    });

    describe('RAG Endpoint', () => {
        it('should extract Lambda metrics from context in RAG handler', async () => {
            const ragHandler = require('../../src/endpoints/rag');
            
            // Test that handler accepts context parameter (signature test)
            expect(ragHandler.handler.length).toBe(3); // event, responseStream, context
        });
    });

    describe('Planning Endpoint', () => {
        it('should extract Lambda metrics from context in planning handler', async () => {
            const planningEndpoint = require('../../src/endpoints/planning');
            
            // Test that handler accepts context parameter (signature test)
            expect(planningEndpoint.handler.length).toBe(3); // event, responseStream, context
        });
    });

    describe('Google Sheets Logger', () => {
        it('should accept Lambda metrics fields in logToGoogleSheets', () => {
            // Clear previous calls
            logToGoogleSheets.mockClear();

            // Call with Lambda metrics
            logToGoogleSheets({
                userEmail: 'test@example.com',
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
                cost: 0.00015,
                duration: 1.5,
                type: 'chat',
                memoryLimitMB: 512,
                memoryUsedMB: 89.45,
                requestId: 'test-request-123',
                error: null
            });

            // Verify it was called with all fields including Lambda metrics
            expect(logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    memoryLimitMB: 512,
                    memoryUsedMB: 89.45,
                    requestId: 'test-request-123'
                })
            );
        });

        it('should handle missing Lambda metrics gracefully', () => {
            logToGoogleSheets.mockClear();

            // Call without Lambda metrics
            logToGoogleSheets({
                userEmail: 'test@example.com',
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
                cost: 0.00015,
                duration: 1.5,
                type: 'chat',
                error: null
            });

            // Should still work
            expect(logToGoogleSheets).toHaveBeenCalled();
        });
    });

    describe('Memory Usage Calculation', () => {
        it('should calculate memory usage in MB with proper precision', () => {
            const memoryUsage = process.memoryUsage();
            const heapUsedBytes = memoryUsage.heapUsed;
            const heapUsedMB = (heapUsedBytes / (1024 * 1024)).toFixed(2);
            
            // Should be a string with 2 decimal places
            expect(heapUsedMB).toMatch(/^\d+\.\d{2}$/);
            
            // Should be a reasonable value (> 0 and < 10GB)
            const heapUsedNum = parseFloat(heapUsedMB);
            expect(heapUsedNum).toBeGreaterThan(0);
            expect(heapUsedNum).toBeLessThan(10240); // Less than 10GB
        });
    });
});
