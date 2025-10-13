/**
 * Unit Tests for Provider System
 * 
 * Tests provider factory, base provider, and provider-specific implementations
 * Priority: Test request formatting, response parsing, error handling
 * 
 * Coverage Target: 75%+ of provider code
 */

const { BaseProvider } = require('../../../src/providers/base-provider');
const { 
  createProvider, 
  createProviders,
  getSupportedProviderTypes,
  isProviderTypeSupported
} = require('../../../src/providers/provider-factory');

describe('Provider System', () => {
  
  describe('BaseProvider', () => {
    
    test('should not allow direct instantiation', () => {
      expect(() => {
        new BaseProvider({ type: 'test', apiKey: 'test' });
      }).toThrow('BaseProvider is abstract');
    });

    test('should store configuration', () => {
      class TestProvider extends BaseProvider {
        getEndpoint() { return 'https://api.test.com'; }
        getHeaders() { return {}; }
        buildRequestBody() { return {}; }
        async makeRequest() { return {}; }
        async streamRequest() { }
        getSupportedModels() { return []; }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
      }

      const provider = new TestProvider({
        type: 'test',
        apiKey: 'key123',
        apiEndpoint: 'https://custom.api.com',
        id: 'test-id',
        source: 'config'
      });

      expect(provider.type).toBe('test');
      expect(provider.apiKey).toBe('key123');
      expect(provider.apiEndpoint).toBe('https://custom.api.com');
      expect(provider.id).toBe('test-id');
      expect(provider.source).toBe('config');
    });

    test('should use default values for optional config', () => {
      class TestProvider extends BaseProvider {
        getEndpoint() { return 'https://api.test.com'; }
        getHeaders() { return {}; }
        buildRequestBody() { return {}; }
        async makeRequest() { return {}; }
        async streamRequest() { }
        getSupportedModels() { return []; }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
      }

      const provider = new TestProvider({
        type: 'test',
        apiKey: 'key123'
      });

      expect(provider.id).toBe('unknown');
      expect(provider.source).toBe('unknown');
    });

    test('should require subclass to implement getEndpoint', () => {
      class IncompleteProvider extends BaseProvider {
        getHeaders() { return {}; }
        buildRequestBody() { return {}; }
        async makeRequest() { return {}; }
        async streamRequest() { }
        getSupportedModels() { return []; }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
      }

      const provider = new IncompleteProvider({ type: 'test', apiKey: 'test' });
      
      expect(() => provider.getEndpoint()).toThrow('getEndpoint() must be implemented');
    });

    test('should require subclass to implement getHeaders', () => {
      class IncompleteProvider extends BaseProvider {
        getEndpoint() { return 'https://api.test.com'; }
        buildRequestBody() { return {}; }
        async makeRequest() { return {}; }
        async streamRequest() { }
        getSupportedModels() { return []; }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
      }

      const provider = new IncompleteProvider({ type: 'test', apiKey: 'test' });
      
      expect(() => provider.getHeaders()).toThrow('getHeaders() must be implemented');
    });

    test('should require subclass to implement buildRequestBody', () => {
      class IncompleteProvider extends BaseProvider {
        getEndpoint() { return 'https://api.test.com'; }
        getHeaders() { return {}; }
        async makeRequest() { return {}; }
        async streamRequest() { }
        getSupportedModels() { return []; }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
      }

      const provider = new IncompleteProvider({ type: 'test', apiKey: 'test' });
      
      expect(() => provider.buildRequestBody([])).toThrow('buildRequestBody() must be implemented');
    });

    test('should require subclass to implement makeRequest', async () => {
      class IncompleteProvider extends BaseProvider {
        getEndpoint() { return 'https://api.test.com'; }
        getHeaders() { return {}; }
        buildRequestBody() { return {}; }
        async streamRequest() { }
        getSupportedModels() { return []; }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
      }

      const provider = new IncompleteProvider({ type: 'test', apiKey: 'test' });
      
      await expect(provider.makeRequest([])).rejects.toThrow('makeRequest() must be implemented');
    });

    test('should require subclass to implement streamRequest', async () => {
      class IncompleteProvider extends BaseProvider {
        getEndpoint() { return 'https://api.test.com'; }
        getHeaders() { return {}; }
        buildRequestBody() { return {}; }
        async makeRequest() { return {}; }
        getSupportedModels() { return []; }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
      }

      const provider = new IncompleteProvider({ type: 'test', apiKey: 'test' });
      
      await expect(provider.streamRequest([], {}, () => {})).rejects.toThrow('streamRequest() must be implemented');
    });

    test('should require subclass to implement getSupportedModels', () => {
      class IncompleteProvider extends BaseProvider {
        getEndpoint() { return 'https://api.test.com'; }
        getHeaders() { return {}; }
        buildRequestBody() { return {}; }
        async makeRequest() { return {}; }
        async streamRequest() { }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
      }

      const provider = new IncompleteProvider({ type: 'test', apiKey: 'test' });
      
      expect(() => provider.getSupportedModels()).toThrow('getSupportedModels() must be implemented');
    });

    test('should provide default parseRateLimits implementation', () => {
      class TestProvider extends BaseProvider {
        getEndpoint() { return 'https://api.test.com'; }
        getHeaders() { return {}; }
        buildRequestBody() { return {}; }
        async makeRequest() { return {}; }
        async streamRequest() { }
        getSupportedModels() { return []; }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
      }

      const provider = new TestProvider({ type: 'test', apiKey: 'test' });
      const limits = provider.parseRateLimits({});

      expect(limits).toEqual({
        requestsLimit: null,
        requestsRemaining: null,
        tokensLimit: null,
        tokensRemaining: null,
        resetTime: null
      });
    });

    test('should allow overriding parseRateLimits', () => {
      class CustomProvider extends BaseProvider {
        getEndpoint() { return 'https://api.test.com'; }
        getHeaders() { return {}; }
        buildRequestBody() { return {}; }
        async makeRequest() { return {}; }
        async streamRequest() { }
        getSupportedModels() { return []; }
        isModelSupported() { return false; }
        estimateTokens() { return 0; }
        
        parseRateLimits(headers) {
          return {
            requestsLimit: parseInt(headers['x-ratelimit-limit-requests']),
            requestsRemaining: parseInt(headers['x-ratelimit-remaining-requests']),
            tokensLimit: parseInt(headers['x-ratelimit-limit-tokens']),
            tokensRemaining: parseInt(headers['x-ratelimit-remaining-tokens']),
            resetTime: headers['x-ratelimit-reset']
          };
        }
      }

      const provider = new CustomProvider({ type: 'test', apiKey: 'test' });
      const limits = provider.parseRateLimits({
        'x-ratelimit-limit-requests': '100',
        'x-ratelimit-remaining-requests': '95',
        'x-ratelimit-limit-tokens': '10000',
        'x-ratelimit-remaining-tokens': '9500',
        'x-ratelimit-reset': '2025-01-01T00:00:00Z'
      });

      expect(limits.requestsLimit).toBe(100);
      expect(limits.requestsRemaining).toBe(95);
      expect(limits.tokensLimit).toBe(10000);
      expect(limits.tokensRemaining).toBe(9500);
      expect(limits.resetTime).toBe('2025-01-01T00:00:00Z');
    });
  });

  describe('ProviderFactory', () => {
    
    test('should create OpenAI provider', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test123',
        id: 'openai-1'
      });

      expect(provider).toBeDefined();
      expect(provider.type).toBe('openai');
      expect(provider.apiKey).toBe('sk-test123');
    });

    test('should create Groq provider', () => {
      const provider = createProvider({
        type: 'groq',
        apiKey: 'gsk_test123',
        id: 'groq-1'
      });

      expect(provider).toBeDefined();
      expect(provider.type).toBe('groq');
      expect(provider.apiKey).toBe('gsk_test123');
    });

    test('should handle unknown provider type', () => {
      expect(() => {
        createProvider({
          type: 'unknown-provider',
          apiKey: 'test'
        });
      }).toThrow();
    });

    test('should require apiKey for provider creation', () => {
      expect(() => {
        createProvider({
          type: 'openai'
        });
      }).toThrow();
    });

    test('should pass configuration to created provider', () => {
      const config = {
        type: 'openai',
        apiKey: 'sk-test',
        apiEndpoint: 'https://custom.openai.com',
        id: 'custom-openai',
        source: 'env'
      };

      const provider = createProvider(config);

      expect(provider.type).toBe('openai');
      expect(provider.apiKey).toBe('sk-test');
      expect(provider.id).toBe('custom-openai');
      expect(provider.source).toBe('env');
    });
  });

  describe('Provider Request Formatting', () => {
    
    test('should format basic chat messages', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const body = provider.buildRequestBody(messages, {
        model: 'gpt-4',
        temperature: 0.7
      });

      expect(body.messages).toEqual(messages);
      expect(body.model).toBe('gpt-4');
      expect(body.temperature).toBe(0.7);
    });

    test('should include tools in request body', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      const messages = [{ role: 'user', content: 'Search for cats' }];
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

      const body = provider.buildRequestBody(messages, {
        model: 'gpt-4',
        tools
      });

      expect(body.tools).toEqual(tools);
    });

    test('should handle max_tokens parameter', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      const body = provider.buildRequestBody([], {
        model: 'gpt-4',
        max_tokens: 1000
      });

      expect(body.max_tokens).toBe(1000);
    });

    test('should handle stream parameter', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      const body = provider.buildRequestBody([], {
        model: 'gpt-4',
        stream: true
      });

      expect(body.stream).toBe(true);
    });
  });

  describe('Provider Headers', () => {
    
    test('should include API key in OpenAI headers', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test123'
      });

      const headers = provider.getHeaders();

      expect(headers['Authorization']).toBe('Bearer sk-test123');
      expect(headers['Content-Type']).toBe('application/json');
    });

    test('should include API key in Groq headers', () => {
      const provider = createProvider({
        type: 'groq',
        apiKey: 'gsk_test123'
      });

      const headers = provider.getHeaders();

      expect(headers['Authorization']).toBe('Bearer gsk_test123');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('Provider Endpoints', () => {
    
    test('should return OpenAI endpoint', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      const endpoint = provider.getEndpoint();

      expect(endpoint).toContain('openai.com');
      expect(endpoint).toContain('/chat/completions');
    });

    test('should return Groq endpoint', () => {
      const provider = createProvider({
        type: 'groq',
        apiKey: 'gsk_test'
      });

      const endpoint = provider.getEndpoint();

      expect(endpoint).toContain('groq.com');
      expect(endpoint).toContain('/chat/completions');
    });

    test('should use custom endpoint if provided', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test',
        apiEndpoint: 'https://custom.api.com/v1/chat'
      });

      const endpoint = provider.getEndpoint();

      expect(endpoint).toBe('https://custom.api.com/v1/chat');
    });
  });

  describe('Supported Models', () => {
    
    test('OpenAI provider should support GPT models', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      const models = provider.getSupportedModels();

      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-4-turbo');
      expect(models).toContain('gpt-3.5-turbo');
    });

    test('Groq provider should support Groq models', () => {
      const provider = createProvider({
        type: 'groq',
        apiKey: 'gsk_test'
      });

      const models = provider.getSupportedModels();

      expect(models.length).toBeGreaterThan(0);
      expect(Array.isArray(models)).toBe(true);
    });

    test('should check if specific model is supported', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      expect(provider.supportsModel('gpt-4')).toBe(true);
      expect(provider.supportsModel('invalid-model')).toBe(false);
    });
  });

  describe('Token Estimation', () => {
    
    test('should estimate tokens for messages', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      const messages = [
        { role: 'user', content: 'Hello world' }
      ];

      const tokens = provider.estimateTokens(messages);

      expect(tokens).toBeGreaterThan(0);
      expect(typeof tokens).toBe('number');
    });

    test('should estimate more tokens for longer content', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      const shortMessage = [{ role: 'user', content: 'Hi' }];
      const longMessage = [{ role: 'user', content: 'This is a much longer message with many more words and tokens in it that should result in a higher token count estimate' }];

      const shortTokens = provider.estimateTokens(shortMessage);
      const longTokens = provider.estimateTokens(longMessage);

      expect(longTokens).toBeGreaterThan(shortTokens);
    });

    test('should handle empty messages', () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'sk-test'
      });

      const tokens = provider.estimateTokens([]);

      expect(tokens).toBe(0);
    });
  });
});
