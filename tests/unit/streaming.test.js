/**
 * Comprehensive Tests for Streaming Modules
 * Enhanced coverage for SSE streaming, response formatting, and error handling
 * 
 * Coverage Target: 80%+ of streaming modules
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

            test('should create empty stream initially', () => {
                const stream = new StreamingResponse();
                expect(stream.getResponse()).toBe('');
            });

            test('should accumulate multiple writes in order', () => {
                const stream = new StreamingResponse();
                
                stream.write({ id: 1 });
                stream.write({ id: 2 });
                stream.write({ id: 3 });

                const response = stream.getResponse();
                const lines = response.split('\n\n').filter(l => l);
                
                expect(lines.length).toBe(3);
                expect(lines[0]).toContain('"id":1');
                expect(lines[1]).toContain('"id":2');
                expect(lines[2]).toContain('"id":3');
            });

            test('should format event with type and data', () => {
                const stream = new StreamingResponse();
                stream.writeEvent('message', { content: 'test' });

                const response = stream.getResponse();
                expect(response).toContain('event: message');
                expect(response).toContain('data: {"content":"test"}');
            });

            test('should handle complex nested objects', () => {
                const stream = new StreamingResponse();
                const complexData = {
                    user: { name: 'Test', email: 'test@example.com' },
                    items: [1, 2, 3],
                    metadata: { timestamp: '2025-01-01' }
                };

                stream.write(complexData);
                const response = stream.getResponse();

                expect(response).toContain('"name":"Test"');
                expect(response).toContain('"items":[1,2,3]');
            });

            test('should handle empty objects', () => {
                const stream = new StreamingResponse();
                stream.write({});

                const response = stream.getResponse();
                expect(response).toBe('data: {}\n\n');
            });

            test('should handle null values in data', () => {
                const stream = new StreamingResponse();
                stream.write({ value: null });

                const response = stream.getResponse();
                expect(response).toContain('"value":null');
            });

            test('should handle arrays as data', () => {
                const stream = new StreamingResponse();
                stream.write([1, 2, 3]);

                const response = stream.getResponse();
                expect(response).toBe('data: [1,2,3]\n\n');
            });

            test('should mix write and writeEvent calls', () => {
                const stream = new StreamingResponse();
                
                stream.write({ message: 'start' });
                stream.writeEvent('progress', { percent: 50 });
                stream.write({ message: 'end' });

                const response = stream.getResponse();
                expect(response).toContain('data: {"message":"start"}');
                expect(response).toContain('event: progress');
                expect(response).toContain('data: {"message":"end"}');
            });

            test('should properly format SSE with double newlines', () => {
                const stream = new StreamingResponse();
                stream.write({ test: true });

                const response = stream.getResponse();
                expect(response.endsWith('\n\n')).toBe(true);
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

            test('should handle write method errors gracefully', () => {
                const mockStream = {
                    write: jest.fn().mockImplementation(() => {
                        throw new Error('Stream closed');
                    })
                };

                const adapter = createSSEStreamAdapter(mockStream);
                
                // Should not throw on regular write
                expect(() => {
                    adapter.write({ message: 'test' });
                }).not.toThrow();
            });

            test('should call underlying stream write with correct format', () => {
                const mockStream = {
                    write: jest.fn()
                };

                const adapter = createSSEStreamAdapter(mockStream);
                adapter.write({ id: 123 });

                expect(mockStream.write).toHaveBeenCalledWith('data: {"id":123}\n\n');
            });

            test('should handle multiple sequential writes', () => {
                const mockStream = {
                    write: jest.fn()
                };

                const adapter = createSSEStreamAdapter(mockStream);
                adapter.write({ step: 1 });
                adapter.write({ step: 2 });
                adapter.write({ step: 3 });

                expect(mockStream.write).toHaveBeenCalledTimes(3);
            });

            test('should handle multiple sequential events', () => {
                const mockStream = {
                    write: jest.fn()
                };

                const adapter = createSSEStreamAdapter(mockStream);
                adapter.writeEvent('start', {});
                adapter.writeEvent('progress', { percent: 50 });
                adapter.writeEvent('complete', {});

                expect(mockStream.write).toHaveBeenCalledTimes(3);
                expect(mockStream.write).toHaveBeenNthCalledWith(1, 'event: start\ndata: {}\n\n');
                expect(mockStream.write).toHaveBeenNthCalledWith(2, 'event: progress\ndata: {"percent":50}\n\n');
                expect(mockStream.write).toHaveBeenNthCalledWith(3, 'event: complete\ndata: {}\n\n');
            });

            test('should preserve event type in formatted output', () => {
                const mockStream = {
                    write: jest.fn()
                };

                const adapter = createSSEStreamAdapter(mockStream);
                adapter.writeEvent('custom_event', { value: 42 });

                const call = mockStream.write.mock.calls[0][0];
                expect(call).toContain('event: custom_event');
            });

            test('should handle special characters in event data', () => {
                const mockStream = {
                    write: jest.fn()
                };

                const adapter = createSSEStreamAdapter(mockStream);
                adapter.write({ message: 'Line 1\nLine 2' });

                // JSON.stringify should escape newlines
                const call = mockStream.write.mock.calls[0][0];
                expect(call).toContain('\\n');
            });

            test('should handle empty event data', () => {
                const mockStream = {
                    write: jest.fn()
                };

                const adapter = createSSEStreamAdapter(mockStream);
                adapter.writeEvent('empty', {});

                expect(mockStream.write).toHaveBeenCalledWith('event: empty\ndata: {}\n\n');
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

            test('should include CORS methods in headers', () => {
                const response = formatJsonResponse({});

                expect(response.headers['Access-Control-Allow-Methods']).toBe('GET,POST,OPTIONS');
            });

            test('should include CORS headers in custom responses', () => {
                const response = formatJsonResponse({ data: 'test' }, 201);

                expect(response.headers['Access-Control-Allow-Headers']).toContain('Content-Type');
                expect(response.headers['Access-Control-Allow-Headers']).toContain('Authorization');
            });

            test('should serialize complex objects correctly', () => {
                const complexData = {
                    users: [{ id: 1, name: 'Test' }],
                    metadata: { count: 1 }
                };
                const response = formatJsonResponse(complexData);

                const parsed = JSON.parse(response.body);
                expect(parsed.users[0].name).toBe('Test');
                expect(parsed.metadata.count).toBe(1);
            });

            test('should handle null data', () => {
                const response = formatJsonResponse(null);
                expect(response.body).toBe('null');
            });

            test('should handle empty object', () => {
                const response = formatJsonResponse({});
                expect(response.body).toBe('{}');
            });

            test('should merge additional headers with defaults', () => {
                const response = formatJsonResponse({}, 200, {
                    'X-Custom': 'value',
                    'Content-Type': 'application/custom+json'
                });

                expect(response.headers['X-Custom']).toBe('value');
                expect(response.headers['Content-Type']).toBe('application/custom+json');
            });

            test('should handle various HTTP status codes', () => {
                expect(formatJsonResponse({}, 200).statusCode).toBe(200);
                expect(formatJsonResponse({}, 201).statusCode).toBe(201);
                expect(formatJsonResponse({}, 400).statusCode).toBe(400);
                expect(formatJsonResponse({}, 404).statusCode).toBe(404);
                expect(formatJsonResponse({}, 500).statusCode).toBe(500);
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

            test('should include keep-alive header', () => {
                const response = formatStreamingResponse('');

                expect(response.headers['Connection']).toBe('keep-alive');
            });

            test('should include transfer encoding header', () => {
                const response = formatStreamingResponse('');

                expect(response.headers['Transfer-Encoding']).toBe('chunked');
            });

            test('should include CORS headers', () => {
                const response = formatStreamingResponse('');

                expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
                expect(response.headers['Access-Control-Allow-Methods']).toBe('GET,POST,OPTIONS');
            });

            test('should handle empty body', () => {
                const response = formatStreamingResponse('');

                expect(response.body).toBe('');
                expect(response.statusCode).toBe(200);
            });

            test('should handle multiple SSE events in body', () => {
                const body = 'event: start\ndata: {}\n\nevent: end\ndata: {}\n\n';
                const response = formatStreamingResponse(body);

                expect(response.body).toBe(body);
            });

            test('should accept custom status code', () => {
                const response = formatStreamingResponse('test', 202);

                expect(response.statusCode).toBe(202);
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

            test('should default to 500 status code', () => {
                const response = formatErrorResponse('Internal error');

                expect(response.statusCode).toBe(500);
            });

            test('should include timestamp in ISO format', () => {
                const response = formatErrorResponse('Test error');
                const body = JSON.parse(response.body);

                expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            });

            test('should include additional context', () => {
                const response = formatErrorResponse('Error', 400, {
                    requestId: '123',
                    path: '/api/test'
                });
                const body = JSON.parse(response.body);

                expect(body.requestId).toBe('123');
                expect(body.path).toBe('/api/test');
            });

            test('should handle various error status codes', () => {
                expect(formatErrorResponse('Bad Request', 400).statusCode).toBe(400);
                expect(formatErrorResponse('Unauthorized', 401).statusCode).toBe(401);
                expect(formatErrorResponse('Forbidden', 403).statusCode).toBe(403);
                expect(formatErrorResponse('Not Found', 404).statusCode).toBe(404);
                expect(formatErrorResponse('Server Error', 500).statusCode).toBe(500);
            });

            test('should include CORS headers', () => {
                const response = formatErrorResponse('Error');

                expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
            });

            test('should be valid JSON', () => {
                const response = formatErrorResponse('Test error', 400);

                expect(() => JSON.parse(response.body)).not.toThrow();
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

            test('should allow Content-Type and Authorization headers', () => {
                const response = formatCORSResponse();

                expect(response.headers['Access-Control-Allow-Headers']).toContain('Content-Type');
                expect(response.headers['Access-Control-Allow-Headers']).toContain('Authorization');
            });

            test('should allow GET, POST, OPTIONS methods', () => {
                const response = formatCORSResponse();

                const methods = response.headers['Access-Control-Allow-Methods'];
                expect(methods).toContain('GET');
                expect(methods).toContain('POST');
                expect(methods).toContain('OPTIONS');
            });

            test('should have empty body', () => {
                const response = formatCORSResponse();

                expect(response.body).toBe('');
            });

            test('should cache preflight for 24 hours', () => {
                const response = formatCORSResponse();

                expect(response.headers['Access-Control-Max-Age']).toBe('86400');
            });
        });
    });
});