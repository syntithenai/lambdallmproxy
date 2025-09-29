/**
 * Tests for streaming modules
 */

const { StreamingResponse, createSSEStreamAdapter } = require('../../src/streaming/sse-writer');
const { 
    formatJsonResponse, 
    formatStreamingResponse, 
    formatErrorResponse, 
    formatCORSResponse 
} = require('../../src/streaming/response-formatter');

describe('Streaming Modules', () => {
    describe('SSE Writer', () => {
        describe('StreamingResponse', () => {
            test('should accumulate SSE data', () => {
                const stream = new StreamingResponse();
                
                stream.write({ message: 'hello' });
                stream.writeEvent('log', { level: 'info' });

                const response = stream.getResponse();
                expect(response).toContain('data: {"message":"hello"}');
                expect(response).toContain('event: log\ndata: {"level":"info"}');
            });
        });

        describe('createSSEStreamAdapter', () => {
            test('should create adapter with writeEvent method', () => {
                const mockStream = {
                    write: jest.fn()
                };

                const adapter = createSSEStreamAdapter(mockStream);
                
                expect(adapter.writeEvent).toBeDefined();
                expect(adapter.write).toBeDefined();

                adapter.writeEvent('test', { data: 'value' });
                expect(mockStream.write).toHaveBeenCalledWith('event: test\ndata: {"data":"value"}\n\n');
            });

            test('should handle write errors gracefully', () => {
                const mockStream = {
                    write: jest.fn().mockImplementation(() => {
                        throw new Error('Write failed');
                    })
                };

                const adapter = createSSEStreamAdapter(mockStream);
                
                // Should not throw
                expect(() => {
                    adapter.writeEvent('test', { data: 'value' });
                }).not.toThrow();
            });
        });
    });

    describe('Response Formatter', () => {
        describe('formatJsonResponse', () => {
            test('should format JSON response with CORS headers', () => {
                const response = formatJsonResponse({ message: 'success' });

                expect(response.statusCode).toBe(200);
                expect(response.headers['Content-Type']).toBe('application/json');
                expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
                expect(response.body).toBe('{"message":"success"}');
            });

            test('should accept custom status code and headers', () => {
                const response = formatJsonResponse(
                    { error: 'not found' }, 
                    404, 
                    { 'Custom-Header': 'value' }
                );

                expect(response.statusCode).toBe(404);
                expect(response.headers['Custom-Header']).toBe('value');
            });
        });

        describe('formatStreamingResponse', () => {
            test('should format SSE response', () => {
                const response = formatStreamingResponse('event: test\ndata: {}\n\n');

                expect(response.statusCode).toBe(200);
                expect(response.headers['Content-Type']).toBe('text/event-stream');
                expect(response.headers['Cache-Control']).toBe('no-cache');
                expect(response.body).toBe('event: test\ndata: {}\n\n');
            });
        });

        describe('formatErrorResponse', () => {
            test('should format error response', () => {
                const response = formatErrorResponse('Something went wrong', 400);

                expect(response.statusCode).toBe(400);
                expect(JSON.parse(response.body)).toMatchObject({
                    error: 'Something went wrong'
                });
                expect(JSON.parse(response.body).timestamp).toBeDefined();
            });
        });

        describe('formatCORSResponse', () => {
            test('should format CORS preflight response', () => {
                const response = formatCORSResponse();

                expect(response.statusCode).toBe(200);
                expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
                expect(response.headers['Access-Control-Max-Age']).toBe('86400');
                expect(response.body).toBe('');
            });
        });
    });
});