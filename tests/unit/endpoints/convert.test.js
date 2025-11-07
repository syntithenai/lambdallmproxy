/**
 * Unit tests for convert endpoint
 * 
 * This test file covers the document conversion endpoint functionality including:
 * - Authentication handling
 * - File buffer conversion
 * - URL-based conversion
 * - Error handling for various scenarios
 */

// Mock external dependencies to isolate the convert endpoint logic
jest.mock('../../../src/rag/file-converters');
jest.mock('../../../src/auth');

const convertEndpoint = require('../../../src/endpoints/convert');
const { authenticateRequest } = require('../../../src/auth');
const { convertToMarkdown } = require('../../../src/rag/file-converters');

// Mock awslambda for streaming responses
global.awslambda = {
    HttpResponseStream: {
        from: jest.fn((stream, metadata) => {
            stream.metadata = metadata;
            return stream;
        })
    }
};

describe('Convert Endpoint Service', () => {
    let originalEnv;
    
    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };
        
        // Clear all environment variables that might affect tests
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('GS_') || key === 'CREDIT_LIMIT') {
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
        
        convertToMarkdown.mockResolvedValue({
            markdown: '# Test Document\n\nThis is a test conversion.',
            images: []
        });
    });
    
    afterEach(() => {
        // Restore original environment
        process.env = { ...originalEnv };
    });
    
    describe('Module Structure', () => {
        it('should properly load the convert module', () => {
            expect(convertEndpoint).toBeDefined();
            expect(typeof convertEndpoint).toBe('object');
        });
        
        it('should have a handler function', () => {
            // The convert endpoint exports a handler function for Lambda
            expect(convertEndpoint).toHaveProperty('handler');
            expect(typeof convertEndpoint.handler).toBe('function');
        });
    });
    
    describe('Authentication and Authorization', () => {
        it('should reject unauthenticated requests', async () => {
            authenticateRequest.mockReturnValue({
                authenticated: false,
                authorized: false
            });
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: {},
                body: JSON.stringify({})
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
        
        it('should handle authentication errors gracefully', async () => {
            authenticateRequest.mockRejectedValue(new Error('Auth failed'));
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer invalid-token' },
                body: JSON.stringify({})
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
    });
    
    describe('File Buffer Conversion', () => {
        it('should convert file buffer to markdown', async () => {
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    fileBuffer: 'base64-encoded-content',
                    fileName: 'test.pdf',
                    mimeType: 'application/pdf'
                })
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            // Should have written a successful response
            expect(mockStream.write).toHaveBeenCalled();
        });
        
        it('should handle empty file buffer gracefully', async () => {
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    fileBuffer: '',
                    fileName: 'test.pdf',
                    mimeType: 'application/pdf'
                })
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            // Should have written an error response
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
        
        it('should handle missing file buffer and URL', async () => {
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    // No fileBuffer or url
                })
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            // Should have written an error response
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
    });
    
    describe('URL-based Conversion', () => {
        it('should fetch and convert content from URL', async () => {
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    url: 'https://example.com/test.pdf'
                })
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            // Should have written a successful response
            expect(mockStream.write).toHaveBeenCalled();
        });
        
        it('should handle URL fetch errors gracefully', async () => {
            // Mock the http client to simulate network error
            const originalHttp = require('http');
            const mockRequest = jest.fn().mockImplementation((options, callback) => {
                const mockResponse = {
                    on: jest.fn((event, handler) => {
                        if (event === 'error') {
                            handler(new Error('Network error'));
                        }
                    })
                };
                setTimeout(() => callback(mockResponse), 0);
                return {
                    on: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
            });
            
            const http = require('http');
            http.get = mockRequest;
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    url: 'https://example.com/test.pdf'
                })
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            // Should have written an error response
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
    });
    
    describe('Error Handling', () => {
        it('should handle conversion errors gracefully', async () => {
            convertToMarkdown.mockRejectedValue(new Error('Conversion failed'));
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    fileBuffer: 'base64-encoded-content',
                    fileName: 'test.pdf',
                    mimeType: 'application/pdf'
                })
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            // Should have written an error response
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
        
        it('should handle empty markdown results gracefully', async () => {
            convertToMarkdown.mockResolvedValue({
                markdown: '',
                images: []
            });
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    fileBuffer: 'base64-encoded-content',
                    fileName: 'test.pdf',
                    mimeType: 'application/pdf'
                })
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            // Should have written an error response
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
    });
    
    describe('Response Format', () => {
        it('should return proper JSON response with markdown content', async () => {
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    fileBuffer: 'base64-encoded-content',
                    fileName: 'test.pdf',
                    mimeType: 'application/pdf'
                })
            };
            
            await convertEndpoint.handler(event, mockStream);
            
            // Should have written a response with markdown content
            const writeCalls = mockStream.write.mock.calls;
            expect(writeCalls.length).toBeGreaterThan(0);
            
            // Check that at least one call contains the expected structure
            const lastCall = writeCalls[writeCalls.length - 1];
            const responseString = lastCall[0];
            const response = JSON.parse(responseString);
            
            expect(response).toHaveProperty('statusCode', 200);
            expect(response).toHaveProperty('body');
            expect(response.body).toContain('Test Document');
        });
    });
});
