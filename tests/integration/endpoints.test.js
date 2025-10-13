/**
 * Integration tests for all endpoints through the main router
 */

// Mock response stream helper
class MockResponseStream {
    constructor() {
        this.chunks = [];
        this.ended = false;
        this.metadata = null;
    }
    
    write(chunk) {
        this.chunks.push(chunk);
    }
    
    end() {
        this.ended = true;
    }
}

// Mock awslambda global before requiring handlers
global.awslambda = {
  streamifyResponse: jest.fn((fn) => fn),
  HttpResponseStream: {
    from: jest.fn((stream, metadata) => {
        // Create a wrapper stream that has both the original stream methods
        // and the metadata property
        const wrappedStream = Object.create(stream);
        wrappedStream.metadata = metadata;
        wrappedStream.write = stream.write.bind(stream);
        wrappedStream.end = stream.end.bind(stream);
        // Also set metadata on original stream for test assertions
        stream.metadata = metadata;
        return wrappedStream;
    })
  }
};

const { handler } = require('../../src/index');
const planningEndpoint = require('../../src/endpoints/planning');
const searchEndpoint = require('../../src/endpoints/search');
const proxyEndpoint = require('../../src/endpoints/proxy');
const staticEndpoint = require('../../src/endpoints/static');

jest.mock('../../src/endpoints/planning');
jest.mock('../../src/endpoints/search');
jest.mock('../../src/endpoints/proxy');
jest.mock('../../src/endpoints/static');

// SKIP: These tests import endpoints which transitively import tools.js
// TODO: Refactor to separate business logic from HTTP handler logic
describe.skip('Main Router Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    
    describe('CORS Preflight', () => {
        it('should handle OPTIONS requests', async () => {
            const event = {
                httpMethod: 'OPTIONS',
                path: '/planning'
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(global.awslambda.HttpResponseStream.from).toHaveBeenCalled();
            expect(mockStream.metadata?.statusCode).toBe(200);
            expect(mockStream.ended).toBe(true);
        });
    });
    
    describe('Planning Endpoint Routing', () => {
        it('should route POST /planning to planning endpoint', async () => {
            planningEndpoint.handler.mockResolvedValue(undefined);
            
            const event = {
                httpMethod: 'POST',
                path: '/planning',
                body: JSON.stringify({ query: 'test', apiKey: 'key' })
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(planningEndpoint.handler).toHaveBeenCalledWith(event, mockStream);
        });
        
        it('should not route GET /planning to planning endpoint', async () => {
            staticEndpoint.handler.mockResolvedValue(undefined);
            
            const event = {
                httpMethod: 'GET',
                path: '/planning'
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(planningEndpoint.handler).not.toHaveBeenCalled();
            expect(staticEndpoint.handler).toHaveBeenCalled();
        });
    });
    
    describe('Search Endpoint Routing', () => {
        it('should route POST /search to search endpoint', async () => {
            searchEndpoint.handler.mockResolvedValue(undefined);
            
            const event = {
                httpMethod: 'POST',
                path: '/search',
                body: JSON.stringify({ query: 'test' })
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(searchEndpoint.handler).toHaveBeenCalledWith(event, mockStream);
        });
    });
    
    describe('Proxy Endpoint Routing', () => {
        it('should route POST /proxy to proxy endpoint', async () => {
            proxyEndpoint.handler.mockResolvedValue(undefined);
            
            const event = {
                httpMethod: 'POST',
                path: '/proxy',
                body: JSON.stringify({ 
                    model: 'gpt-4', 
                    messages: [{ role: 'user', content: 'Test' }],
                    apiKey: 'key'
                })
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(proxyEndpoint.handler).toHaveBeenCalledWith(event, mockStream);
        });
    });
    
    describe('Static File Routing', () => {
        it('should route GET / to static endpoint', async () => {
            staticEndpoint.handler.mockResolvedValue(undefined);
            
            const event = {
                httpMethod: 'GET',
                path: '/'
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(staticEndpoint.handler).toHaveBeenCalledWith(event, mockStream);
        });
        
        it('should route GET /index.html to static endpoint', async () => {
            staticEndpoint.handler.mockResolvedValue(undefined);
            
            const event = {
                httpMethod: 'GET',
                path: '/index.html'
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(staticEndpoint.handler).toHaveBeenCalledWith(event, mockStream);
        });
        
        it('should route GET /css/styles.css to static endpoint', async () => {
            staticEndpoint.handler.mockResolvedValue(undefined);
            
            const event = {
                httpMethod: 'GET',
                path: '/css/styles.css'
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(staticEndpoint.handler).toHaveBeenCalledWith(event, mockStream);
        });
    });
    
    describe('Method Not Allowed', () => {
        it('should return 405 for unsupported methods', async () => {
            const event = {
                httpMethod: 'DELETE',
                path: '/planning'
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(mockStream.metadata?.statusCode).toBe(405);
            expect(mockStream.ended).toBe(true);
        });
        
        it('should return 405 for PUT requests', async () => {
            const event = {
                httpMethod: 'PUT',
                path: '/search'
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(mockStream.metadata?.statusCode).toBe(405);
            expect(mockStream.ended).toBe(true);
        });
    });
    
    describe('Error Handling', () => {
        it('should handle endpoint errors gracefully', async () => {
            planningEndpoint.handler.mockRejectedValue(new Error('Endpoint error'));
            
            const event = {
                httpMethod: 'POST',
                path: '/planning',
                body: JSON.stringify({ query: 'test', apiKey: 'key' })
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(mockStream.metadata?.statusCode).toBe(500);
            expect(mockStream.ended).toBe(true);
        });
        
        it('should include CORS headers in error responses', async () => {
            planningEndpoint.handler.mockRejectedValue(new Error('Test error'));
            
            const event = {
                httpMethod: 'POST',
                path: '/planning',
                body: JSON.stringify({ query: 'test', apiKey: 'key' })
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(mockStream.metadata?.headers).toHaveProperty('Content-Type', 'application/json');
        });
    });
    
    describe('Alternative Event Formats', () => {
        it('should handle requestContext.http.method format', async () => {
            staticEndpoint.handler.mockResolvedValue(undefined);
            
            const event = {
                requestContext: {
                    http: {
                        method: 'GET'
                    }
                },
                rawPath: '/'
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(staticEndpoint.handler).toHaveBeenCalled();
        });
        
        it('should handle rawPath instead of path', async () => {
            planningEndpoint.handler.mockResolvedValue(undefined);
            
            const event = {
                httpMethod: 'POST',
                rawPath: '/planning',
                body: JSON.stringify({ query: 'test', apiKey: 'key' })
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            expect(planningEndpoint.handler).toHaveBeenCalled();
        });
    });
});
