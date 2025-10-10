/**
 * Test the chat endpoint with streaming and tool execution
 * This test validates the SSE streaming flow and tool calling
 */

// IMPORTANT: All jest.mock calls must be at the top before any requires
// Mock auth module
jest.mock('../../src/auth', () => ({
    verifyGoogleToken: jest.fn((token) => {
        if (token === 'valid-token') {
            return Promise.resolve({ email: 'test@example.com' });
        }
        return Promise.resolve(null);
    }),
    getAllowedEmails: jest.fn(() => ['test@example.com']),
    authenticateRequest: jest.fn((authHeader) => {
        if (!authHeader) {
            return Promise.resolve({
                authenticated: false,
                authorized: false,
                email: null,
                user: null
            });
        }
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;
        if (token === 'valid-token') {
            return Promise.resolve({
                authenticated: true,
                authorized: true,
                email: 'test@example.com',
                user: { email: 'test@example.com' }
            });
        }
        return Promise.resolve({
            authenticated: false,
            authorized: false,
            email: null,
            user: null
        });
    })
}));

// Mock tools module
jest.mock('../../src/tools', () => ({
    callFunction: jest.fn((name, args, context) => {
        if (name === 'search_web') {
            return Promise.resolve(JSON.stringify({
                query: args.query,
                count: 2,
                results: [
                    { title: 'Result 1', url: 'https://example.com/1', description: 'Test result 1' },
                    { title: 'Result 2', url: 'https://example.com/2', description: 'Test result 2' }
                ]
            }));
        }
        if (name === 'execute_javascript') {
            return Promise.resolve(JSON.stringify({
                result: '42'
            }));
        }
        return Promise.resolve(JSON.stringify({ error: 'Unknown function' }));
    })
}));

// Set up global mocks and requires AFTER jest.mock calls
global.awslambda = {
    streamifyResponse: jest.fn((fn) => fn),
    HttpResponseStream: {
        from: jest.fn((stream, metadata) => {
            stream.metadata = metadata;
            return stream;
        })
    }
};

const chatEndpoint = require('../../src/endpoints/chat');

// Mock response stream helper
class MockResponseStream {
    constructor() {
        this.events = [];
        this.ended = false;
    }
    
    write(data) {
        // Parse SSE events
        const lines = data.split('\n');
        let currentEvent = null;
        let currentData = null;
        
        for (const line of lines) {
            if (line.startsWith('event: ')) {
                currentEvent = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
                currentData = line.substring(6).trim();
                if (currentEvent && currentData) {
                    this.events.push({
                        type: currentEvent,
                        data: JSON.parse(currentData)
                    });
                    currentEvent = null;
                    currentData = null;
                }
            }
        }
    }
    
    end() {
        this.ended = true;
    }
    
    getEvents(type) {
        return this.events.filter(e => e.type === type);
    }
}

describe('Chat Endpoint', () => {
    beforeEach(() => {
        // Set environment variables
        process.env.OPENAI_API_KEY = 'test-key';
        process.env.GROQ_API_KEY = 'test-key';
        process.env.MAX_TOOL_ITERATIONS = '5';
        
        // Clear mocks
        jest.clearAllMocks();
    });
    
    test('should reject unauthenticated requests', async () => {
        const event = {
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hello' }]
            }),
            headers: {}
        };
        
        const mockStream = new MockResponseStream();
        await chatEndpoint.handler(event, mockStream);
        
        expect(mockStream.ended).toBe(true);
        const errorEvents = mockStream.getEvents('error');
        expect(errorEvents.length).toBeGreaterThanOrEqual(1);
        // Debug: Show actual error if not UNAUTHORIZED
        if (errorEvents.length > 0 && errorEvents[0].data.code !== 'UNAUTHORIZED') {
            throw new Error(`Expected UNAUTHORIZED but got ${errorEvents[0].data.code}. Error message: ${errorEvents[0].data.error || 'none'}`);
        }
        expect(errorEvents[0].data.code).toBe('UNAUTHORIZED');
    });
    
    test('should validate required fields', async () => {
        const event = {
            body: JSON.stringify({
                model: 'gpt-4'
                // Missing messages
            }),
            headers: {
                Authorization: 'Bearer valid-token'
            }
        };
        
        const mockStream = new MockResponseStream();
        await chatEndpoint.handler(event, mockStream);
        
        expect(mockStream.ended).toBe(true);
        const errorEvents = mockStream.getEvents('error');
        expect(errorEvents.length).toBe(1);
        expect(errorEvents[0].data.code).toBe('INVALID_REQUEST');
        expect(errorEvents[0].data.error).toContain('messages');
    });
    
    test('should handle missing API key', async () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.GROQ_API_KEY;
        
        const event = {
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hello' }]
            }),
            headers: {
                Authorization: 'Bearer valid-token'
            }
        };
        
        const mockStream = new MockResponseStream();
        await chatEndpoint.handler(event, mockStream);
        
        expect(mockStream.ended).toBe(true);
        const errorEvents = mockStream.getEvents('error');
        expect(errorEvents.length).toBe(1);
        expect(errorEvents[0].data.code).toBe('CONFIGURATION_ERROR');
    });
    
    test('should parse OpenAI stream correctly', async () => {
        const mockResponse = {
            on: jest.fn((event, handler) => {
                if (event === 'data') {
                    // Simulate SSE chunks
                    handler(Buffer.from('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
                    handler(Buffer.from('data: {"choices":[{"delta":{"content":" world"}}]}\n\n'));
                    handler(Buffer.from('data: [DONE]\n\n'));
                } else if (event === 'end') {
                    handler();
                }
            })
        };
        
        const chunks = [];
        await chatEndpoint.parseOpenAIStream(mockResponse, (chunk) => {
            chunks.push(chunk);
        });
        
        expect(chunks.length).toBe(2);
        expect(chunks[0].choices[0].delta.content).toBe('Hello');
        expect(chunks[1].choices[0].delta.content).toBe(' world');
    });
    
    test('should execute tool calls correctly', async () => {
        const mockTools = require('../../src/tools');
        const mockStream = new MockResponseStream();
        const sseWriter = {
            writeEvent: jest.fn((type, data) => mockStream.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
        };
        
        const toolCalls = [
            {
                id: 'call_123',
                function: {
                    name: 'search_web',
                    arguments: '{"query":"test query","limit":3}'
                }
            }
        ];
        
        const context = {
            user: 'test@example.com',
            model: 'gpt-4',
            apiKey: 'test-key'
        };
        
        const results = await chatEndpoint.executeToolCalls(toolCalls, context, sseWriter);
        
        expect(results.length).toBe(1);
        expect(results[0].role).toBe('tool');
        expect(results[0].tool_call_id).toBe('call_123');
        expect(results[0].name).toBe('search_web');
        
        // Check SSE events were written
        expect(sseWriter.writeEvent).toHaveBeenCalledWith('tool_call_start', expect.any(Object));
        expect(sseWriter.writeEvent).toHaveBeenCalledWith('tool_call_progress', expect.any(Object));
        expect(sseWriter.writeEvent).toHaveBeenCalledWith('tool_call_result', expect.any(Object));
        
        // Verify tool was called
        expect(mockTools.callFunction).toHaveBeenCalledWith(
            'search_web',
            { query: 'test query', limit: 3 },
            expect.objectContaining({
                user: 'test@example.com',
                writeEvent: expect.any(Function)
            })
        );
    });
    
    test('should handle tool execution errors', async () => {
        const mockTools = require('../../src/tools');
        mockTools.callFunction.mockRejectedValueOnce(new Error('Tool failed'));
        
        const mockStream = new MockResponseStream();
        const sseWriter = {
            writeEvent: jest.fn((type, data) => mockStream.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
        };
        
        const toolCalls = [
            {
                id: 'call_123',
                function: {
                    name: 'search_web',
                    arguments: '{"query":"test"}'
                }
            }
        ];
        
        const results = await chatEndpoint.executeToolCalls(toolCalls, {}, sseWriter);
        
        expect(results.length).toBe(1);
        expect(results[0].content).toContain('error');
        expect(results[0].content).toContain('Tool failed');
        
        // Check error event was written
        const resultEvents = mockStream.getEvents('tool_call_result');
        expect(resultEvents.some(e => e.data.error === true)).toBe(true);
    });
    
    test('should verify auth token correctly', async () => {
        const validUser = await chatEndpoint.verifyAuthToken('Bearer valid-token');
        expect(validUser).toBeTruthy();
        expect(validUser.email).toBe('test@example.com');
        
        const invalidUser = await chatEndpoint.verifyAuthToken('Bearer invalid-token');
        expect(invalidUser).toBeNull();
        
        const noToken = await chatEndpoint.verifyAuthToken('');
        expect(noToken).toBeNull();
    });
});

console.log('✅ Chat endpoint test suite ready');
console.log('Run with: npm test -- tests/integration/chat-endpoint.test.js');
