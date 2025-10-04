/**
 * Integration tests for all endpoints through the main router
 */

const { handler } = require('../../src/index');
const planningEndpoint = require('../../src/endpoints/planning');
const searchEndpoint = require('../../src/endpoints/search');
const proxyEndpoint = require('../../src/endpoints/proxy');
const staticEndpoint = require('../../src/endpoints/static');

jest.mock('../../src/endpoints/planning');
jest.mock('../../src/endpoints/search');
jest.mock('../../src/endpoints/proxy');
jest.mock('../../src/endpoints/static');

describe('Main Router Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    
    describe('CORS Preflight', () => {
        it('should handle OPTIONS requests', async () => {
            const event = {
                httpMethod: 'OPTIONS',
                path: '/planning'
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
            expect(response.headers).toHaveProperty('Access-Control-Allow-Methods');
            expect(response.headers).toHaveProperty('Access-Control-Allow-Headers');
        });
    });
    
    describe('Planning Endpoint Routing', () => {
        it('should route POST /planning to planning endpoint', async () => {
            const mockResponse = {
                statusCode: 200,
                body: JSON.stringify({ text: 'Plan' })
            };
            
            planningEndpoint.handler.mockResolvedValue(mockResponse);
            
            const event = {
                httpMethod: 'POST',
                path: '/planning',
                body: JSON.stringify({ query: 'test', apiKey: 'key' })
            };
            
            const response = await handler(event);
            
            expect(planningEndpoint.handler).toHaveBeenCalledWith(event);
            expect(response).toEqual(mockResponse);
        });
        
        it('should not route GET /planning to planning endpoint', async () => {
            staticEndpoint.handler.mockResolvedValue({
                statusCode: 404,
                body: 'Not found'
            });
            
            const event = {
                httpMethod: 'GET',
                path: '/planning'
            };
            
            await handler(event);
            
            expect(planningEndpoint.handler).not.toHaveBeenCalled();
            expect(staticEndpoint.handler).toHaveBeenCalled();
        });
    });
    
    describe('Search Endpoint Routing', () => {
        it('should route POST /search to search endpoint', async () => {
            const mockResponse = {
                statusCode: 200,
                body: JSON.stringify({ results: [] })
            };
            
            searchEndpoint.handler.mockResolvedValue(mockResponse);
            
            const event = {
                httpMethod: 'POST',
                path: '/search',
                body: JSON.stringify({ query: 'test' })
            };
            
            const response = await handler(event);
            
            expect(searchEndpoint.handler).toHaveBeenCalledWith(event);
            expect(response).toEqual(mockResponse);
        });
    });
    
    describe('Proxy Endpoint Routing', () => {
        it('should route POST /proxy to proxy endpoint', async () => {
            const mockResponse = {
                statusCode: 200,
                body: JSON.stringify({ result: 'success' })
            };
            
            proxyEndpoint.handler.mockResolvedValue(mockResponse);
            
            const event = {
                httpMethod: 'POST',
                path: '/proxy',
                body: JSON.stringify({ 
                    model: 'gpt-4', 
                    messages: [{ role: 'user', content: 'Test' }],
                    apiKey: 'key'
                })
            };
            
            const response = await handler(event);
            
            expect(proxyEndpoint.handler).toHaveBeenCalledWith(event);
            expect(response).toEqual(mockResponse);
        });
    });
    
    describe('Static File Routing', () => {
        it('should route GET / to static endpoint', async () => {
            const mockResponse = {
                statusCode: 200,
                body: '<html></html>',
                headers: { 'Content-Type': 'text/html' }
            };
            
            staticEndpoint.handler.mockResolvedValue(mockResponse);
            
            const event = {
                httpMethod: 'GET',
                path: '/'
            };
            
            const response = await handler(event);
            
            expect(staticEndpoint.handler).toHaveBeenCalledWith(event);
            expect(response).toEqual(mockResponse);
        });
        
        it('should route GET /index.html to static endpoint', async () => {
            const mockResponse = {
                statusCode: 200,
                body: '<html></html>',
                headers: { 'Content-Type': 'text/html' }
            };
            
            staticEndpoint.handler.mockResolvedValue(mockResponse);
            
            const event = {
                httpMethod: 'GET',
                path: '/index.html'
            };
            
            const response = await handler(event);
            
            expect(staticEndpoint.handler).toHaveBeenCalledWith(event);
            expect(response).toEqual(mockResponse);
        });
        
        it('should route GET /css/styles.css to static endpoint', async () => {
            const mockResponse = {
                statusCode: 200,
                body: 'body { }',
                headers: { 'Content-Type': 'text/css' }
            };
            
            staticEndpoint.handler.mockResolvedValue(mockResponse);
            
            const event = {
                httpMethod: 'GET',
                path: '/css/styles.css'
            };
            
            const response = await handler(event);
            
            expect(staticEndpoint.handler).toHaveBeenCalledWith(event);
            expect(response).toEqual(mockResponse);
        });
    });
    
    describe('Method Not Allowed', () => {
        it('should return 405 for unsupported methods', async () => {
            const event = {
                httpMethod: 'DELETE',
                path: '/planning'
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(405);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Method not allowed');
        });
        
        it('should return 405 for PUT requests', async () => {
            const event = {
                httpMethod: 'PUT',
                path: '/search'
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(405);
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
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBeDefined();
        });
        
        it('should include CORS headers in error responses', async () => {
            planningEndpoint.handler.mockRejectedValue(new Error('Test error'));
            
            const event = {
                httpMethod: 'POST',
                path: '/planning',
                body: JSON.stringify({ query: 'test', apiKey: 'key' })
            };
            
            const response = await handler(event);
            
            expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
        });
    });
    
    describe('Alternative Event Formats', () => {
        it('should handle requestContext.http.method format', async () => {
            staticEndpoint.handler.mockResolvedValue({
                statusCode: 200,
                body: '<html></html>'
            });
            
            const event = {
                requestContext: {
                    http: {
                        method: 'GET'
                    }
                },
                rawPath: '/'
            };
            
            const response = await handler(event);
            
            expect(staticEndpoint.handler).toHaveBeenCalled();
        });
        
        it('should handle rawPath instead of path', async () => {
            planningEndpoint.handler.mockResolvedValue({
                statusCode: 200,
                body: JSON.stringify({ text: 'Plan' })
            });
            
            const event = {
                httpMethod: 'POST',
                rawPath: '/planning',
                body: JSON.stringify({ query: 'test', apiKey: 'key' })
            };
            
            const response = await handler(event);
            
            expect(planningEndpoint.handler).toHaveBeenCalled();
        });
    });
});
