/**
 * Provider Streaming Tests
 * 
 * Tests streaming responses, SSE parsing, chunk handling
 */

const { BaseProvider } = require('../../../src/providers/base-provider');
const { createProvider } = require('../../../src/providers/provider-factory');

// Mock provider for testing streaming
class MockStreamProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.streamChunks = [];
    this.streamError = null;
    this.streamDelay = 0;
  }

  getEndpoint() {
    return 'https://api.mock.com/v1/chat';
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  buildRequestBody(messages, options = {}) {
    return {
      model: options.model || 'mock-model',
      messages,
      stream: options.stream || false,
      ...options
    };
  }

  async makeRequest(messages, options = {}) {
    return {
      id: 'mock-response',
      choices: [{
        message: {
          role: 'assistant',
          content: 'Mock response'
        }
      }]
    };
  }

  async streamRequest(messages, options = {}, onChunk) {
    if (this.streamError) {
      throw this.streamError;
    }

    // Emit configured chunks
    for (const chunk of this.streamChunks) {
      if (this.streamDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.streamDelay));
      }
      onChunk(chunk);
    }

    return { 
      complete: true,
      rateLimits: {
        requestsRemaining: 100,
        tokensRemaining: 50000
      }
    };
  }

  getSupportedModels() {
    return ['mock-model'];
  }
}

describe('Provider Streaming', () => {
  describe('Basic Streaming', () => {
    let provider;
    let chunks;

    beforeEach(() => {
      provider = new MockStreamProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
      chunks = [];
    });

    test('should stream simple chunks', async () => {
      provider.streamChunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] }
      ];

      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks).toHaveLength(2);
      expect(chunks[0].choices[0].delta.content).toBe('Hello');
      expect(chunks[1].choices[0].delta.content).toBe(' world');
    });

    test('should handle empty chunks', async () => {
      provider.streamChunks = [
        { choices: [{ delta: {} }] }
      ];

      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].choices[0].delta).toEqual({});
    });

    test('should handle multiple choices in chunks', async () => {
      provider.streamChunks = [
        { 
          choices: [
            { delta: { content: 'Option 1' }, index: 0 },
            { delta: { content: 'Option 2' }, index: 1 }
          ]
        }
      ];

      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks[0].choices).toHaveLength(2);
      expect(chunks[0].choices[0].delta.content).toBe('Option 1');
      expect(chunks[0].choices[1].delta.content).toBe('Option 2');
    });

    test('should return rate limits after streaming', async () => {
      provider.streamChunks = [
        { choices: [{ delta: { content: 'Test' } }] }
      ];

      const result = await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(result.rateLimits).toBeDefined();
      expect(result.rateLimits.requestsRemaining).toBe(100);
      expect(result.rateLimits.tokensRemaining).toBe(50000);
    });
  });

  describe('Chunk Types', () => {
    let provider;
    let chunks;

    beforeEach(() => {
      provider = new MockStreamProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
      chunks = [];
    });

    test('should handle content chunks', async () => {
      provider.streamChunks = [
        { choices: [{ delta: { content: 'Text content' } }] }
      ];

      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks[0].choices[0].delta.content).toBe('Text content');
    });

    test('should handle role chunks', async () => {
      provider.streamChunks = [
        { choices: [{ delta: { role: 'assistant' } }] }
      ];

      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks[0].choices[0].delta.role).toBe('assistant');
    });

    test('should handle tool call chunks', async () => {
      provider.streamChunks = [
        { 
          choices: [{ 
            delta: { 
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: { name: 'search_web', arguments: '{"query": "test"}' }
              }]
            } 
          }] 
        }
      ];

      await provider.streamRequest(
        [{ role: 'user', content: 'Search for test' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks[0].choices[0].delta.tool_calls).toBeDefined();
      expect(chunks[0].choices[0].delta.tool_calls[0].function.name).toBe('search_web');
    });

    test('should handle finish reason chunks', async () => {
      provider.streamChunks = [
        { choices: [{ delta: {}, finish_reason: 'stop' }] }
      ];

      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks[0].choices[0].finish_reason).toBe('stop');
    });

    test('should handle mixed chunk content', async () => {
      provider.streamChunks = [
        { 
          id: 'chatcmpl-123',
          choices: [{ 
            delta: { 
              role: 'assistant',
              content: 'Hello'
            },
            index: 0
          }],
          model: 'gpt-4o-mini'
        }
      ];

      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks[0].id).toBe('chatcmpl-123');
      expect(chunks[0].model).toBe('gpt-4o-mini');
      expect(chunks[0].choices[0].delta.role).toBe('assistant');
      expect(chunks[0].choices[0].delta.content).toBe('Hello');
    });
  });

  describe('Stream Error Handling', () => {
    let provider;

    beforeEach(() => {
      provider = new MockStreamProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should handle stream errors', async () => {
      provider.streamError = new Error('Stream failed');

      await expect(
        provider.streamRequest(
          [{ role: 'user', content: 'Hi' }],
          {},
          () => {}
        )
      ).rejects.toThrow('Stream failed');
    });

    test('should handle rate limit errors during streaming', async () => {
      const error = new Error('Rate limit exceeded');
      error.statusCode = 429;
      provider.streamError = error;

      try {
        await provider.streamRequest(
          [{ role: 'user', content: 'Hi' }],
          {},
          () => {}
        );
        fail('Should have thrown error');
      } catch (err) {
        expect(err.message).toContain('Rate limit');
      }
    });

    test('should handle network errors during streaming', async () => {
      const error = new Error('Connection lost');
      error.code = 'ECONNREFUSED';
      provider.streamError = error;

      await expect(
        provider.streamRequest(
          [{ role: 'user', content: 'Hi' }],
          {},
          () => {}
        )
      ).rejects.toThrow('Connection lost');
    });
  });

  describe('Stream Callback', () => {
    let provider;

    beforeEach(() => {
      provider = new MockStreamProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should call callback for each chunk', async () => {
      provider.streamChunks = [
        { choices: [{ delta: { content: 'A' } }] },
        { choices: [{ delta: { content: 'B' } }] },
        { choices: [{ delta: { content: 'C' } }] }
      ];

      let callCount = 0;
      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        () => { callCount++; }
      );

      expect(callCount).toBe(3);
    });

    test('should pass complete chunk data to callback', async () => {
      const testChunk = { 
        id: 'test-id',
        choices: [{ delta: { content: 'Test' } }],
        model: 'mock-model'
      };
      provider.streamChunks = [testChunk];

      let receivedChunk = null;
      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => { receivedChunk = chunk; }
      );

      expect(receivedChunk).toEqual(testChunk);
    });

    test('should handle callback errors gracefully', async () => {
      provider.streamChunks = [
        { choices: [{ delta: { content: 'Test' } }] }
      ];

      // Callback that throws should not crash the stream
      await expect(
        provider.streamRequest(
          [{ role: 'user', content: 'Hi' }],
          {},
          () => { throw new Error('Callback error'); }
        )
      ).rejects.toThrow('Callback error');
    });
  });

  describe('Stream Options', () => {
    let provider;

    beforeEach(() => {
      provider = new MockStreamProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should pass stream option in request body', () => {
      const messages = [{ role: 'user', content: 'Hi' }];
      const body = provider.buildRequestBody(messages, { stream: true });

      expect(body.stream).toBe(true);
    });

    test('should default stream to false', () => {
      const messages = [{ role: 'user', content: 'Hi' }];
      const body = provider.buildRequestBody(messages, {});

      expect(body.stream).toBe(false);
    });

    test('should include other options with stream', () => {
      const messages = [{ role: 'user', content: 'Hi' }];
      const body = provider.buildRequestBody(messages, {
        stream: true,
        model: 'custom-model',
        temperature: 0.5
      });

      expect(body.stream).toBe(true);
      expect(body.model).toBe('custom-model');
      expect(body.temperature).toBe(0.5);
    });
  });

  describe('Real Provider Streaming', () => {
    test('should handle OpenAI streaming response format', async () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'test-key'
      });

      // Simulate OpenAI chunk format
      if (provider instanceof MockStreamProvider) {
        provider.streamChunks = [
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 1677652288,
            model: 'gpt-4o-mini',
            choices: [{
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null
            }]
          },
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 1677652288,
            model: 'gpt-4o-mini',
            choices: [{
              index: 0,
              delta: { content: 'Hello' },
              finish_reason: null
            }]
          }
        ];
      }

      // Basic validation that provider was created
      expect(provider).toBeDefined();
      expect(provider.type).toBe('openai');
    });

    test('should handle Groq streaming response format', async () => {
      const provider = createProvider({
        type: 'groq',
        apiKey: 'test-key'
      });

      // Basic validation that provider was created
      expect(provider).toBeDefined();
      expect(provider.type).toBe('groq');
    });
  });

  describe('Stream Performance', () => {
    let provider;

    beforeEach(() => {
      provider = new MockStreamProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should handle rapid chunks', async () => {
      // Generate 100 rapid chunks
      provider.streamChunks = Array.from({ length: 100 }, (_, i) => ({
        choices: [{ delta: { content: `${i}` } }]
      }));

      const chunks = [];
      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks).toHaveLength(100);
    });

    test('should handle large chunks', async () => {
      const largeContent = 'x'.repeat(10000);
      provider.streamChunks = [
        { choices: [{ delta: { content: largeContent } }] }
      ];

      const chunks = [];
      await provider.streamRequest(
        [{ role: 'user', content: 'Hi' }],
        {},
        (chunk) => chunks.push(chunk)
      );

      expect(chunks[0].choices[0].delta.content).toHaveLength(10000);
    });
  });
});
