/**
 * Tests for service modules
 */

const { trackToolCall, trackLLMCall } = require('../../src/services/tracking-service');

describe('Service Modules', () => {
    describe('Tracking Service', () => {
        describe('trackToolCall', () => {
            test('should create tool call tracking record', () => {
                const toolCall = {
                    id: 'call_123',
                    type: 'function',
                    function: {
                        name: 'search_web',
                        arguments: '{"query": "test"}'
                    }
                };

                const record = trackToolCall(toolCall, 'result', 1000, 50, 0.01);

                expect(record).toMatchObject({
                    request: {
                        id: 'call_123',
                        type: 'function',
                        function: {
                            name: 'search_web',
                            arguments: '{"query": "test"}'
                        }
                    },
                    response: 'result',
                    duration: 1000,
                    tokenUse: 50,
                    cost: 0.01
                });
                expect(record.timestamp).toBeDefined();
            });

            test('should handle minimal tool call data', () => {
                const toolCall = { id: 'call_456' };
                const record = trackToolCall(toolCall);

                expect(record.request.id).toBe('call_456');
                expect(record.response).toBe(null);
                expect(record.duration).toBe(0);
            });
        });

        describe('trackLLMCall', () => {
            test('should create LLM call tracking record', () => {
                const request = {
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: 'Hello' }],
                    tools: ['search_web'],
                    temperature: 0.7,
                    max_tokens: 1000
                };

                const response = {
                    content: 'Hello there!',
                    tool_calls: [],
                    finish_reason: 'stop',
                    usage: { prompt_tokens: 10, completion_tokens: 5 }
                };

                const record = trackLLMCall(request, response, 2000, 15, 0.02);

                expect(record).toMatchObject({
                    request: {
                        model: 'gpt-4',
                        messages: [{ role: 'user', content: 'Hello' }],
                        tools: 1,
                        temperature: 0.7,
                        max_tokens: 1000
                    },
                    response: {
                        content: 'Hello there!',
                        tool_calls: [],
                        finish_reason: 'stop',
                        usage: { prompt_tokens: 10, completion_tokens: 5 }
                    },
                    duration: 2000,
                    tokenUse: 15,
                    cost: 0.02
                });
                expect(record.timestamp).toBeDefined();
            });

            test('should handle response with text field', () => {
                const request = { model: 'gpt-4' };
                const response = { text: 'Response text' };

                const record = trackLLMCall(request, response);

                expect(record.response.content).toBe('Response text');
            });
        });
    });
});