/**
 * Tests for Token Calculation Module
 */

const {
  CHARS_PER_TOKEN,
  MESSAGE_OVERHEAD_TOKENS,
  TOOL_OVERHEAD_TOKENS,
  detectModelFamily,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateToolTokens,
  estimateInputTokens,
  estimateOutputTokens,
  calculateCost,
  estimateRequestCost,
  fitsInContextWindow,
  getRecommendedMaxTokens
} = require('../../src/model-selection/token-calculator');

describe('Token Calculator', () => {
  describe('detectModelFamily', () => {
    it('should detect GPT-4 family', () => {
      expect(detectModelFamily('gpt-4')).toBe('gpt-4');
      expect(detectModelFamily('gpt-4-turbo')).toBe('gpt-4');
      expect(detectModelFamily('gpt-4o-mini')).toBe('gpt-4');
    });

    it('should detect GPT-3.5 family', () => {
      expect(detectModelFamily('gpt-3.5-turbo')).toBe('gpt-3.5');
    });

    it('should detect Llama family', () => {
      expect(detectModelFamily('llama-3.1-8b-instant')).toBe('llama');
      expect(detectModelFamily('llama-3.3-70b-versatile')).toBe('llama');
    });

    it('should detect Mixtral family', () => {
      expect(detectModelFamily('mixtral-8x7b-32768')).toBe('mixtral');
    });

    it('should detect Gemma family', () => {
      expect(detectModelFamily('gemma2-9b-it')).toBe('gemma');
    });

    it('should detect Qwen family', () => {
      expect(detectModelFamily('qwen2-72b-instruct')).toBe('qwen');
    });

    it('should detect Claude family', () => {
      expect(detectModelFamily('claude-3-opus')).toBe('claude');
    });

    it('should detect Gemini family', () => {
      expect(detectModelFamily('gemini-1.5-pro')).toBe('gemini');
    });

    it('should return default for unknown models', () => {
      expect(detectModelFamily('unknown-model')).toBe('default');
      expect(detectModelFamily('')).toBe('default');
      expect(detectModelFamily(null)).toBe('default');
    });

    it('should be case insensitive', () => {
      expect(detectModelFamily('GPT-4')).toBe('gpt-4');
      expect(detectModelFamily('LLAMA-3.1-8B')).toBe('llama');
    });
  });

  describe('estimateMessageTokens', () => {
    it('should estimate tokens for simple message', () => {
      const message = {
        role: 'user',
        content: 'Hello, how are you?'
      };
      const tokens = estimateMessageTokens(message, 'gpt-4');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20); // ~5 content tokens + 4 overhead
    });

    it('should include message overhead', () => {
      const message = { role: 'user', content: '' };
      const tokens = estimateMessageTokens(message, 'gpt-4');
      // Should include overhead + role characters
      expect(tokens).toBeGreaterThanOrEqual(MESSAGE_OVERHEAD_TOKENS['gpt-4']);
    });

    it('should estimate tokens for long message', () => {
      const content = 'a'.repeat(1000); // 1000 characters
      const message = { role: 'user', content };
      const tokens = estimateMessageTokens(message, 'gpt-4');
      
      // ~250 tokens for content + 4 overhead
      expect(tokens).toBeGreaterThan(200);
      expect(tokens).toBeLessThan(300);
    });

    it('should handle multi-modal content', () => {
      const message = {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image_url', image_url: { url: 'http://example.com/img.jpg' } }
        ]
      };
      const tokens = estimateMessageTokens(message, 'gpt-4');
      expect(tokens).toBeGreaterThan(0);
      // Note: Image tokens not included in this calculation
    });

    it('should return overhead for empty content', () => {
      const message = { role: 'user', content: '' };
      const tokens = estimateMessageTokens(message, 'gpt-4');
      // Empty content still has role and overhead
      expect(tokens).toBeGreaterThanOrEqual(MESSAGE_OVERHEAD_TOKENS['gpt-4']);
    });

    it('should return 0 for null/undefined message', () => {
      expect(estimateMessageTokens(null)).toBe(0);
      expect(estimateMessageTokens(undefined)).toBe(0);
    });

    it('should use different overhead for different models', () => {
      const message = { role: 'user', content: 'test' };
      const gptTokens = estimateMessageTokens(message, 'gpt-4');
      const llamaTokens = estimateMessageTokens(message, 'llama');
      
      // Different overhead values
      expect(gptTokens).not.toBe(llamaTokens);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should estimate tokens for message array', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there! How can I help you?' }
      ];
      const tokens = estimateMessagesTokens(messages, 'gpt-4');
      expect(tokens).toBeGreaterThan(20); // At least some content + overhead
    });

    it('should include conversation overhead', () => {
      const messages = [
        { role: 'user', content: '' }
      ];
      const tokens = estimateMessagesTokens(messages, 'gpt-4');
      // Should be at least message overhead + conversation overhead
      expect(tokens).toBeGreaterThan(MESSAGE_OVERHEAD_TOKENS['gpt-4']);
    });

    it('should return 0 for empty array', () => {
      expect(estimateMessagesTokens([])).toBe(0);
    });

    it('should return 0 for invalid input', () => {
      expect(estimateMessagesTokens(null)).toBe(0);
      expect(estimateMessagesTokens(undefined)).toBe(0);
    });

    it('should scale linearly with message count', () => {
      const singleMessage = [{ role: 'user', content: 'test' }];
      const doubleMessages = [
        { role: 'user', content: 'test' },
        { role: 'assistant', content: 'test' }
      ];
      
      const singleTokens = estimateMessagesTokens(singleMessage, 'gpt-4');
      const doubleTokens = estimateMessagesTokens(doubleMessages, 'gpt-4');
      
      expect(doubleTokens).toBeGreaterThan(singleTokens);
    });
  });

  describe('estimateToolTokens', () => {
    it('should estimate tokens for tool definitions', () => {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'search_web',
            description: 'Search the web',
            parameters: { type: 'object', properties: {} }
          }
        }
      ];
      const tokens = estimateToolTokens(tools);
      expect(tokens).toBe(TOOL_OVERHEAD_TOKENS);
    });

    it('should scale with number of tools', () => {
      const tools = [{}, {}, {}]; // 3 tools
      const tokens = estimateToolTokens(tools);
      expect(tokens).toBe(TOOL_OVERHEAD_TOKENS * 3);
    });

    it('should return 0 for empty array', () => {
      expect(estimateToolTokens([])).toBe(0);
    });

    it('should return 0 for invalid input', () => {
      expect(estimateToolTokens(null)).toBe(0);
      expect(estimateToolTokens(undefined)).toBe(0);
    });
  });

  describe('estimateInputTokens', () => {
    it('should estimate total input tokens', () => {
      const options = {
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        tools: [{}],
        modelName: 'gpt-4'
      };
      const tokens = estimateInputTokens(options);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should sum messages and tools', () => {
      const options = {
        messages: [{ role: 'user', content: 'test' }],
        tools: [{}],
        modelName: 'gpt-4'
      };
      const tokens = estimateInputTokens(options);
      
      const messagesOnly = estimateInputTokens({
        messages: options.messages,
        tools: [],
        modelName: 'gpt-4'
      });
      
      const toolsOnly = estimateToolTokens([{}]);
      
      expect(tokens).toBe(messagesOnly + toolsOnly);
    });

    it('should handle missing options', () => {
      expect(estimateInputTokens()).toBeGreaterThanOrEqual(0);
      expect(estimateInputTokens({})).toBeGreaterThanOrEqual(0);
    });
  });

  describe('estimateOutputTokens', () => {
    it('should estimate output tokens for simple requests', () => {
      const tokens = estimateOutputTokens({
        max_tokens: 1000,
        requestType: 'simple'
      });
      expect(tokens).toBeLessThan(1000);
      expect(tokens).toBe(Math.ceil(1000 * 0.3)); // 30% of 1000
    });

    it('should estimate output tokens for complex requests', () => {
      const tokens = estimateOutputTokens({
        max_tokens: 1000,
        requestType: 'complex'
      });
      expect(tokens).toBe(600); // 60% of 1000
    });

    it('should estimate output tokens for reasoning requests', () => {
      const tokens = estimateOutputTokens({
        max_tokens: 1000,
        requestType: 'reasoning'
      });
      expect(tokens).toBe(800); // 80% of 1000
    });

    it('should use default rate for unknown request types', () => {
      const tokens = estimateOutputTokens({
        max_tokens: 1000,
        requestType: 'unknown'
      });
      expect(tokens).toBe(500); // 50% default
    });

    it('should handle missing options', () => {
      expect(estimateOutputTokens()).toBeGreaterThan(0);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost correctly', () => {
      const cost = calculateCost({
        inputTokens: 1000,
        outputTokens: 1000,
        inputCostPerMToken: 10,    // $10 per million
        outputCostPerMToken: 30    // $30 per million
      });
      
      // (1000/1M * 10) + (1000/1M * 30) = 0.01 + 0.03 = 0.04
      expect(cost).toBeCloseTo(0.04, 4);
    });

    it('should return 0 for free models', () => {
      const cost = calculateCost({
        inputTokens: 10000,
        outputTokens: 10000,
        inputCostPerMToken: 0,
        outputCostPerMToken: 0
      });
      expect(cost).toBe(0);
    });

    it('should handle large token counts', () => {
      const cost = calculateCost({
        inputTokens: 1_000_000,  // 1M tokens
        outputTokens: 1_000_000,
        inputCostPerMToken: 10,
        outputCostPerMToken: 30
      });
      
      // (1M/1M * 10) + (1M/1M * 30) = 10 + 30 = 40
      expect(cost).toBe(40);
    });

    it('should handle different input/output costs', () => {
      const cost = calculateCost({
        inputTokens: 500_000,
        outputTokens: 500_000,
        inputCostPerMToken: 5,
        outputCostPerMToken: 15
      });
      
      // (500k/1M * 5) + (500k/1M * 15) = 2.5 + 7.5 = 10
      expect(cost).toBe(10);
    });

    it('should handle missing options', () => {
      expect(calculateCost()).toBe(0);
      expect(calculateCost({})).toBe(0);
    });
  });

  describe('estimateRequestCost', () => {
    it('should return complete cost breakdown', () => {
      const result = estimateRequestCost({
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        modelName: 'gpt-4',
        max_tokens: 1000,
        requestType: 'simple',
        inputCostPerMToken: 10,
        outputCostPerMToken: 30
      });
      
      expect(result).toHaveProperty('inputTokens');
      expect(result).toHaveProperty('outputTokens');
      expect(result).toHaveProperty('totalTokens');
      expect(result).toHaveProperty('cost');
      
      expect(result.totalTokens).toBe(result.inputTokens + result.outputTokens);
      expect(result.cost).toBeGreaterThanOrEqual(0);
    });

    it('should estimate cost for free tier correctly', () => {
      const result = estimateRequestCost({
        messages: [{ role: 'user', content: 'test' }],
        modelName: 'llama-3.1-8b-instant',
        inputCostPerMToken: 0,
        outputCostPerMToken: 0
      });
      
      expect(result.cost).toBe(0);
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
    });

    it('should handle complex requests with tools', () => {
      const result = estimateRequestCost({
        messages: [{ role: 'user', content: 'Search for information' }],
        tools: [{}, {}, {}], // 3 tools
        modelName: 'gpt-4',
        max_tokens: 2000,
        requestType: 'complex',
        inputCostPerMToken: 30,
        outputCostPerMToken: 60
      });
      
      expect(result.inputTokens).toBeGreaterThan(150); // Should include tool overhead
      expect(result.cost).toBeGreaterThan(0);
    });
  });

  describe('fitsInContextWindow', () => {
    it('should return true when request fits', () => {
      expect(fitsInContextWindow(4000, 2000, 8192)).toBe(true);
    });

    it('should return true when exactly fits', () => {
      expect(fitsInContextWindow(4096, 4096, 8192)).toBe(true);
    });

    it('should return false when request exceeds window', () => {
      expect(fitsInContextWindow(6000, 4000, 8192)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(fitsInContextWindow(0, 0, 8192)).toBe(true);
      expect(fitsInContextWindow(8193, 0, 8192)).toBe(false);
      expect(fitsInContextWindow(0, 8193, 8192)).toBe(false);
    });
  });

  describe('getRecommendedMaxTokens', () => {
    it('should return requested tokens when plenty of space', () => {
      expect(getRecommendedMaxTokens(1000, 8192, 2000)).toBe(2000);
    });

    it('should limit tokens when approaching context window', () => {
      const recommended = getRecommendedMaxTokens(7000, 8192, 4000);
      expect(recommended).toBeLessThan(4000);
      expect(recommended).toBeGreaterThan(0);
    });

    it('should return 0 when context window exceeded', () => {
      expect(getRecommendedMaxTokens(8200, 8192, 1000)).toBe(0);
    });

    it('should account for safety margin', () => {
      const recommended = getRecommendedMaxTokens(8000, 8192, 200);
      expect(recommended).toBeLessThan(200); // Safety margin reduces available space
    });

    it('should use default max_tokens when not specified', () => {
      const recommended = getRecommendedMaxTokens(1000, 8192);
      expect(recommended).toBe(4096); // Enough space for default
    });
  });

  describe('integration scenarios', () => {
    it('should estimate cost for typical chat request', () => {
      const result = estimateRequestCost({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
          { role: 'assistant', content: 'The capital of France is Paris.' },
          { role: 'user', content: 'What is its population?' }
        ],
        modelName: 'gpt-4o-mini',
        max_tokens: 500,
        requestType: 'simple',
        inputCostPerMToken: 0.15,
        outputCostPerMToken: 0.6
      });
      
      expect(result.inputTokens).toBeGreaterThan(30);
      expect(result.inputTokens).toBeLessThan(100);
      expect(result.cost).toBeGreaterThan(0);
      expect(result.cost).toBeLessThan(0.001); // Should be very cheap
    });

    it('should estimate cost for tool-using request', () => {
      const result = estimateRequestCost({
        messages: [
          { role: 'user', content: 'Search for recent news about AI' }
        ],
        tools: [
          { type: 'function', function: { name: 'search_web' } },
          { type: 'function', function: { name: 'scrape_url' } }
        ],
        modelName: 'gpt-4',
        max_tokens: 2000,
        requestType: 'complex',
        inputCostPerMToken: 30,
        outputCostPerMToken: 60
      });
      
      expect(result.inputTokens).toBeGreaterThan(100); // Tools add overhead
      expect(result.totalTokens).toBeGreaterThan(1000);
    });

    it('should check if large request fits in small context window', () => {
      const inputTokens = estimateInputTokens({
        messages: [
          { role: 'user', content: 'a'.repeat(30000) } // Very long message (~7500 tokens)
        ],
        modelName: 'gpt-4'
      });
      
      expect(inputTokens).toBeGreaterThan(7000); // Verify it's actually large
      const fits = fitsInContextWindow(inputTokens, 2000, 8192);
      expect(fits).toBe(false); // Should not fit
    });
  });
});
