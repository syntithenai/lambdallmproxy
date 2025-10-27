/**
 * Unit tests for proxy endpoint
 */

const { handler, validateOpenAIRequest, verifyAuthToken, forwardRequest } = require('../../../src/endpoints/proxy');
const { verifyGoogleToken, getAllowedEmails } = require('../../../src/auth');

jest.mock('../../../src/auth');

// SKIP: These tests import endpoints which transitively import tools.js
// TODO: Refactor to separate business logic from HTTP handler logic  
describe.skip('Proxy Endpoint', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.GROQ_KEY;
        delete process.env.OPENAI_KEY;
    });
    
    describe('validateOpenAIRequest', () => {
        it('should validate valid OpenAI request', () => {
            const body = {
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: 'System message' },
                    { role: 'user', content: 'User message' }
                ]
            };
            
            const result = validateOpenAIRequest(body);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
        
        it('should accept request without model (uses intelligent selection)', () => {
            const body = {
                messages: [{ role: 'user', content: 'Test' }]
            };
            
            const result = validateOpenAIRequest(body);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
        
        it('should reject request without messages', () => {
            const body = {
                model: 'gpt-4'
            };
            
            const result = validateOpenAIRequest(body);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('messages'))).toBe(true);
        });
        
        it('should reject request with invalid message format', () => {
            const body = {
                model: 'gpt-4',
                messages: [
                    { role: 'user' } // Missing content
                ]
            };
            
            const result = validateOpenAIRequest(body);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('role') && e.includes('content'))).toBe(true);
        });
        
        it('should reject invalid temperature', () => {
            const body = {
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Test' }],
                temperature: 5
            };
            
            const result = validateOpenAIRequest(body);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('temperature'))).toBe(true);
        });
        
        it('should validate optional parameters correctly', () => {
            const body = {
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Test' }],
                temperature: 0.7,
                max_tokens: 1000,
                top_p: 0.9,
                frequency_penalty: 0.5,
                presence_penalty: 0.5,
                stream: true,
                tools: []
            };
            
            const result = validateOpenAIRequest(body);
            
            expect(result.isValid).toBe(true);
        });
    });
    
    describe('verifyAuthToken', () => {
        it('should verify valid JWT token', async () => {
            const mockUser = { email: 'user@example.com', name: 'Test User' };
            verifyGoogleToken.mockResolvedValue(mockUser);
            getAllowedEmails.mockReturnValue(['user@example.com']);
            
            const result = await verifyAuthToken('Bearer valid-token');
            
            expect(result).toEqual(mockUser);
            expect(verifyGoogleToken).toHaveBeenCalledWith('valid-token');
        });
        
        it('should handle token without Bearer prefix', async () => {
            const mockUser = { email: 'user@example.com', name: 'Test User' };
            verifyGoogleToken.mockResolvedValue(mockUser);
            getAllowedEmails.mockReturnValue(['user@example.com']);
            
            const result = await verifyAuthToken('valid-token');
            
            expect(result).toEqual(mockUser);
        });
        
        it('should return null for invalid token', async () => {
            verifyGoogleToken.mockResolvedValue(null);
            getAllowedEmails.mockReturnValue(['user@example.com']);
            
            const result = await verifyAuthToken('Bearer invalid-token');
            
            expect(result).toBeNull();
        });
        
        it('should return null if user not in allowed list', async () => {
            const mockUser = { email: 'user@example.com', name: 'Test User' };
            verifyGoogleToken.mockResolvedValue(mockUser);
            getAllowedEmails.mockReturnValue(['other@example.com']);
            
            const result = await verifyAuthToken('Bearer valid-token');
            
            expect(result).toBeNull();
        });
        
        it('should return null for missing auth header', async () => {
            const result = await verifyAuthToken('');
            
            expect(result).toBeNull();
        });
    });
    
    describe('forwardRequest', () => {
        it('should forward request to target API', async () => {
            const mockResponse = {
                choices: [{ message: { content: 'Response' } }]
            };
            
            const mockRequest = jest.fn((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    headers: { 'content-type': 'application/json' },
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify(mockResponse));
                        } else if (event === 'end') {
                            handler();
                        }
                    })
                };
                
                setTimeout(() => callback(mockRes), 0);
                
                return {
                    on: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn(),
                    write: jest.fn()
                };
            });
            
            const https = require('https');
            https.request = mockRequest;
            
            const result = await forwardRequest(
                'https://api.openai.com/v1/chat/completions',
                'test-api-key',
                { model: 'gpt-4', messages: [{ role: 'user', content: 'Test' }] }
            );
            
            expect(result.statusCode).toBe(200);
            expect(result.json).toEqual(mockResponse);
        });
        
        it('should handle request errors', async () => {
            const mockRequest = jest.fn((options, callback) => {
                return {
                    on: jest.fn((event, handler) => {
                        if (event === 'error') {
                            setTimeout(() => handler(new Error('Network error')), 0);
                        }
                    }),
                    end: jest.fn(),
                    destroy: jest.fn(),
                    write: jest.fn()
                };
            });
            
            const https = require('https');
            https.request = mockRequest;
            
            await expect(forwardRequest(
                'https://api.openai.com/v1/chat/completions',
                'test-api-key',
                { model: 'gpt-4', messages: [] }
            )).rejects.toThrow('Request failed');
        });
    });
    
    describe('handler', () => {
        it('should return 401 when API key provided but not authenticated', async () => {
            verifyGoogleToken.mockReturnValue(null);
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: {},
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: 'Test' }],
                    apiKey: 'user-api-key'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(401);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Authentication required');
        });
        
        it('should use env API key for verified user', async () => {
            process.env.OPENAI_KEY = 'env-api-key';
            
            const mockUser = { email: 'user@example.com', name: 'Test User' };
            verifyGoogleToken.mockReturnValue(mockUser);
            getAllowedEmails.mockReturnValue(['user@example.com']);
            
            const mockRequest = jest.fn((options, callback) => {
                expect(options.headers.Authorization).toBe('Bearer env-api-key');
                
                const mockRes = {
                    statusCode: 200,
                    headers: { 'content-type': 'application/json' },
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ result: 'success' }));
                        } else if (event === 'end') {
                            handler();
                        }
                    })
                };
                
                setTimeout(() => callback(mockRes), 0);
                
                return {
                    on: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn(),
                    write: jest.fn()
                };
            });
            
            const https = require('https');
            https.request = mockRequest;
            
            const event = {
                headers: {
                    Authorization: 'Bearer valid-jwt-token'
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: 'Test' }]
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
        });
        
        it('should return 401 for missing authentication and API key', async () => {
            verifyGoogleToken.mockReturnValue(null);
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: {},
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: 'Test' }]
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(401);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Authentication required');
        });
        
        it('should return 400 for invalid request parameters', async () => {
            const mockUser = { email: 'user@example.com', name: 'Test User' };
            verifyGoogleToken.mockReturnValue(mockUser);
            getAllowedEmails.mockReturnValue(['user@example.com']);
            
            const event = {
                headers: { Authorization: 'Bearer valid-jwt-token' },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [], // Empty messages array is invalid
                    apiKey: 'test-key'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Invalid request parameters');
        });
        
        it('should include CORS headers', async () => {
            verifyGoogleToken.mockReturnValue(null);
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: {},
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: 'Test' }]
                })
            };
            
            const response = await handler(event);
            
            expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
        });
    });
});
