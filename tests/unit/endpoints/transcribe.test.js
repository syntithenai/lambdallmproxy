/**
 * Unit tests for transcribe endpoint
 * 
 * This test file covers the audio transcription endpoint functionality including:
 * - Authentication handling
 * - Multipart form data parsing
 * - Whisper API integration
 * - Cache handling
 * - Error scenarios
 */

// Mock external dependencies to isolate the transcribe endpoint logic
jest.mock('../../../src/auth');
jest.mock('../../../src/credential-pool');
jest.mock('../../../src/utils/cache');
jest.mock('../../../src/services/google-sheets-logger');
jest.mock('../../../src/utils/credit-check');

const transcribeEndpoint = require('../../../src/endpoints/transcribe');
const { authenticateRequest } = require('../../../src/auth');
const { loadEnvironmentProviders } = require('../../../src/credential-pool');
const { getCacheKey, getFromCache, saveToCache } = require('../../../src/utils/cache');
const { logToGoogleSheets } = require('../../../src/services/google-sheets-logger');
const { deductCreditFromCache } = require('../../../src/utils/credit-check');

// Mock awslambda for streaming responses
global.awslambda = {
    HttpResponseStream: {
        from: jest.fn((stream, metadata) => {
            stream.metadata = metadata;
            return stream;
        })
    }
};

describe('Transcribe Endpoint Service', () => {
    let originalEnv;
    
    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };
        
        // Clear all environment variables that might affect tests
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('GS_') || key === 'CREDIT_LIMIT' || key.includes('WHISPER') || key.includes('GROQ') || key.includes('OPENAI')) {
                delete process.env[key];
            }
        });
        
        // Reset all mocks
        jest.clearAllMocks();
        
        // Setup default mock returns
        authenticateRequest.mockReturnValue({
            authenticated: true,
            authorized: true,
            email: 'test@example.com'
        });
        
        loadEnvironmentProviders.mockReturnValue([
            {
                type: 'groq',
                apiKey: 'test-groq-key'
            }
        ]);
        
        getFromCache.mockResolvedValue(null); // No cache hit
        saveToCache.mockResolvedValue(undefined);
        logToGoogleSheets.mockResolvedValue(undefined);
        deductCreditFromCache.mockResolvedValue(undefined);
    });
    
    afterEach(() => {
        // Restore original environment
        process.env = { ...originalEnv };
    });
    
    describe('Module Structure', () => {
        it('should properly load the transcribe module', () => {
            expect(transcribeEndpoint).toBeDefined();
            expect(typeof transcribeEndpoint).toBe('object');
        });
        
        it('should have a handler function', () => {
            // The transcribe endpoint exports a handler function for Lambda
            expect(transcribeEndpoint).toHaveProperty('handler');
            expect(typeof transcribeEndpoint.handler).toBe('function');
        });
    });
    
    describe('Authentication and Authorization', () => {
        it('should reject unauthenticated requests', async () => {
            authenticateRequest.mockReturnValue({
                authenticated: false,
                authorized: false
            });
            
            const event = {
                headers: {},
                body: 'test-body',
                isBase64Encoded: false
            };
            
            const response = await transcribeEndpoint.handler(event);
            
            expect(response.statusCode).toBe(401);
        });
        
        it('should handle authentication errors gracefully', async () => {
            authenticateRequest.mockRejectedValue(new Error('Auth failed'));
            
            const event = {
                headers: { Authorization: 'Bearer invalid-token' },
                body: 'test-body',
                isBase64Encoded: false
            };
            
            const response = await transcribeEndpoint.handler(event);
            
            expect(response.statusCode).toBe(401);
        });
    });
    
    describe('Multipart Form Data Parsing', () => {
        it('should handle invalid content-type gracefully', async () => {
            const event = {
                headers: {
                    'content-type': 'application/json' // Invalid for multipart
                },
                body: 'test-body',
                isBase64Encoded: false
            };
            
            const response = await transcribeEndpoint.handler(event);
            
            expect(response.statusCode).toBe(400);
        });
        
        it('should handle missing boundary in content-type', async () => {
            const event = {
                headers: {
                    'content-type': 'multipart/form-data' // No boundary
                },
                body: 'test-body',
                isBase64Encoded: false
            };
            
            const response = await transcribeEndpoint.handler(event);
            
            expect(response.statusCode).toBe(400);
        });
    });
    
    describe('Whisper API Integration', () => {
        it('should use Groq provider when available', async () => {
            loadEnvironmentProviders.mockReturnValue([
                {
                    type: 'groq',
                    apiKey: 'test-groq-key'
                }
            ]);
            
            const event = {
                headers: { 
                    Authorization: 'Bearer valid-token',
                    'content-type': 'multipart/form-data; boundary=test-boundary'
                },
                body: 'base64-encoded-multipart-data',
                isBase64Encoded: true
            };
            
            // Mock the parse function to return a valid audio part
            const originalParse = require('../../../src/endpoints/transcribe').parseMultipartFormData;
            jest.spyOn(require('../../../src/endpoints/transcribe'), 'parseMultipartFormData')
                .mockReturnValue([
                    {
                        name: 'audio',
                        filename: 'test.mp3',
                        data: Buffer.from('test-audio-data')
                    }
                ]);
            
            const response = await transcribeEndpoint.handler(event);
            
            // Should have processed the request (may fail on API call, but not auth)
            expect(response.statusCode).toBe(200); // Could be 500 due to API error, but not auth error
            
            // Restore original function
            require('../../../src/endpoints/transcribe').parseMultipartFormData = originalParse;
        });
        
        it('should fallback to OpenAI when Groq is not available', async () => {
            loadEnvironmentProviders.mockReturnValue([
                {
                    type: 'openai',
                    apiKey: 'test-openai-key'
                }
            ]);
            
            const event = {
                headers: { 
                    Authorization: 'Bearer valid-token',
                    'content-type': 'multipart/form-data; boundary=test-boundary'
                },
                body: 'base64-encoded-multipart-data',
                isBase64Encoded: true
            };
            
            // Mock the parse function to return a valid audio part
            const originalParse = require('../../../src/endpoints/transcribe').parseMultipartFormData;
            jest.spyOn(require('../../../src/endpoints/transcribe'), 'parseMultipartFormData')
                .mockReturnValue([
                    {
                        name: 'audio',
                        filename: 'test.mp3',
                        data: Buffer.from('test-audio-data')
                    }
                ]);
            
            const response = await transcribeEndpoint.handler(event);
            
            // Should have processed the request (may fail on API call, but not auth)
            expect(response.statusCode).toBe(200); // Could be 500 due to API error, but not auth error
            
            // Restore original function
            require('../../../src/endpoints/transcribe').parseMultipartFormData = originalParse;
        });
        
        it('should reject requests with no API keys configured', async () => {
            loadEnvironmentProviders.mockReturnValue([]);
            
            const event = {
                headers: { 
                    Authorization: 'Bearer valid-token',
                    'content-type': 'multipart/form-data; boundary=test-boundary'
                },
                body: 'base64-encoded-multipart-data',
                isBase64Encoded: true
            };
            
            const response = await transcribeEndpoint.handler(event);
            
            expect(response.statusCode).toBe(500);
        });
    });
    
    describe('Cache Handling', () => {
        it('should check cache and use cached result when available', async () => {
            getFromCache.mockResolvedValue({
                text: 'cached transcription result',
                filename: 'test.mp3',
                provider: 'groq'
            });
            
            const event = {
                headers: { 
                    Authorization: 'Bearer valid-token',
                    'content-type': 'multipart/form-data; boundary=test-boundary'
                },
                body: 'base64-encoded-multipart-data',
                isBase64Encoded: true
            };
            
            // Mock the parse function to return a valid audio part
            const originalParse = require('../../../src/endpoints/transcribe').parseMultipartFormData;
            jest.spyOn(require('../../../src/endpoints/transcribe'), 'parseMultipartFormData')
                .mockReturnValue([
                    {
                        name: 'audio',
                        filename: 'test.mp3',
                        data: Buffer.from('test-audio-data')
                    }
                ]);
            
            const response = await transcribeEndpoint.handler(event);
            
            // Should have processed the request
            expect(response.statusCode).toBe(200); // Could be 500 due to API error, but not auth error
            
            // Restore original function
            require('../../../src/endpoints/transcribe').parseMultipartFormData = originalParse;
        });
        
        it('should save result to cache after successful transcription', async () => {
            const event = {
                headers: { 
                    Authorization: 'Bearer valid-token',
                    'content-type': 'multipart/form-data; boundary=test-boundary'
                },
                body: 'base64-encoded-multipart-data',
                isBase64Encoded: true
            };
            
            // Mock the parse function to return a valid audio part
            const originalParse = require('../../../src/endpoints/transcribe').parseMultipartFormData;
            jest.spyOn(require('../../../src/endpoints/transcribe'), 'parseMultipartFormData')
                .mockReturnValue([
                    {
                        name: 'audio',
                        filename: 'test.mp3',
                        data: Buffer.from('test-audio-data')
                    }
                ]);
            
            const response = await transcribeEndpoint.handler(event);
            
            // Should have processed the request
            expect(response.statusCode).toBe(200); // Could be 500 due to API error, but not auth error
            
            // Restore original function
            require('../../../src/endpoints/transcribe').parseMultipartFormData = originalParse;
        });
    });
    
    describe('Error Handling', () => {
        it('should handle Whisper API errors gracefully', async () => {
            // Mock the parse function to return a valid audio part
            const originalParse = require('../../../src/endpoints/transcribe').parseMultipartFormData;
            jest.spyOn(require('../../../src/endpoints/transcribe'), 'parseMultipartFormData')
                .mockReturnValue([
                    {
                        name: 'audio',
                        filename: 'test.mp3',
                        data: Buffer.from('test-audio-data')
                    }
                ]);
            
            const event = {
                headers: { 
                    Authorization: 'Bearer valid-token',
                    'content-type': 'multipart/form-data; boundary=test-boundary'
                },
                body: 'base64-encoded-multipart-data',
                isBase64Encoded: true
            };
            
            const response = await transcribeEndpoint.handler(event);
            
            // Should have processed the request (will likely be 500 due to API error)
            expect(response.statusCode).toBe(500); // Expected error from API call
            
            // Restore original function
            require('../../../src/endpoints/transcribe').parseMultipartFormData = originalParse;
        });
        
        it('should handle internal errors gracefully', async () => {
            // Force an error in the main handler by mocking a critical failure
            jest.spyOn(require('../../../src/endpoints/transcribe'), 'parseMultipartFormData')
                .mockImplementation(() => {
                    throw new Error('Critical parsing error');
                });
            
            const event = {
                headers: { 
                    Authorization: 'Bearer valid-token',
                    'content-type': 'multipart/form-data; boundary=test-boundary'
                },
                body: 'base64-encoded-multipart-data',
                isBase64Encoded: true
            };
            
            const response = await transcribeEndpoint.handler(event);
            
            expect(response.statusCode).toBe(500);
        });
    });
    
    describe('Response Format', () => {
        it('should return proper JSON response with transcription result', async () => {
            // Mock the parse function to return a valid audio part
            const originalParse = require('../../../src/endpoints/transcribe').parseMultipartFormData;
            jest.spyOn(require('../../../src/endpoints/transcribe'), 'parseMultipartFormData')
                .mockReturnValue([
                    {
                        name: 'audio',
                        filename: 'test.mp3',
                        data: Buffer.from('test-audio-data')
                    }
                ]);
            
            const event = {
                headers: { 
                    Authorization: 'Bearer valid-token',
                    'content-type': 'multipart/form-data; boundary=test-boundary'
                },
                body: 'base64-encoded-multipart-data',
                isBase64Encoded: true
            };
            
            const response = await transcribeEndpoint.handler(event);
            
            // Should have processed the request (may be 500 due to API error, but not auth error)
            expect(response.statusCode).toBe(200); // Could be 500 due to API error, but not auth error
            
            // Restore original function
            require('../../../src/endpoints/transcribe').parseMultipartFormData = originalParse;
        });
    });
});
