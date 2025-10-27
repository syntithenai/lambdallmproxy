/**
 * Integration test for guardrails auto-detection in chat endpoint
 */

// Mock PROVIDER_CATALOG.json before requiring modules
jest.mock('../../PROVIDER_CATALOG.json', () => ({
  version: '1.0.1',
  chat: {
    providers: {
      'groq-free': {
        name: 'Groq Free Tier',
        type: 'groq-free',
        models: {
          'llama-3.1-8b-instant': {
            id: 'llama-3.1-8b-instant',
            category: 'small',
            available: true
          }
        }
      },
      'gemini-free': {
        name: 'Gemini Free',
        type: 'gemini-free',
        models: {
          'gemini-1.5-flash': {
            id: 'gemini-1.5-flash',
            category: 'small',
            available: true
          }
        }
      },
      'groq': {
        name: 'Groq Paid',
        type: 'groq',
        models: {
          'llama-3.1-8b-instant': {
            id: 'llama-3.1-8b-instant',
            category: 'small',
            available: true
          }
        }
      },
      'openai': {
        name: 'OpenAI',
        type: 'openai',
        models: {
          'gpt-4o-mini': {
            id: 'gpt-4o-mini',
            category: 'small',
            available: true
          }
        }
      },
      'together': {
        name: 'Together AI',
        type: 'together',
        models: {
          'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': {
            id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
            category: 'small',
            available: true
          }
        }
      }
    }
  }
}), { virtual: true });

const { loadGuardrailConfig } = require('../../src/guardrails/config');
const { createGuardrailValidator } = require('../../src/guardrails/guardrail-factory');

// Mock the provider factory to avoid real API calls
jest.mock('../../src/providers/provider-factory', () => ({
  createProvider: jest.fn((config) => ({
    makeRequest: jest.fn(async (messages, options) => ({
      choices: [{
        message: {
          content: JSON.stringify({
            safe: true,
            violations: [],
            reason: 'Content is acceptable'
          })
        }
      }],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 20
      }
    }))
  }))
}));

describe('Guardrails Integration', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    
    // Clear all environment variables
    delete process.env.ENABLE_GUARDRAILS;
    delete process.env.GROQ_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_KEY;
    
    for (let i = 0; i < 10; i++) {
      delete process.env[`P_T${i}`];
      delete process.env[`P_K${i}`];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('End-to-End Flow', () => {
    test('should complete config and validator creation with groq-free', async () => {
      // Enable guardrails
      process.env.ENABLE_GUARDRAILS = 'true';
      
      // Provide API key via context (simulating UI)
      const context = { groqApiKey: 'test-groq-key' };
      
      // Step 1: Load config (auto-detect)
      const config = loadGuardrailConfig(context);
      expect(config).not.toBeNull();
      expect(config.provider).toBe('groq-free');
      expect(config.inputModel).toBe('llama-3.1-8b-instant');
      expect(config.outputModel).toBe('llama-3.1-8b-instant');
      expect(config.enabled).toBe(true);
      expect(config.strictness).toBe('moderate');
      
      // Step 2: Create validator
      const validator = createGuardrailValidator(config, context);
      expect(validator).not.toBeNull();
      expect(validator.validateInput).toBeInstanceOf(Function);
      expect(validator.validateOutput).toBeInstanceOf(Function);
    });

    test('should work with indexed provider format', () => {
      process.env.ENABLE_GUARDRAILS = 'true';
      process.env.P_T0 = 'groq-free';
      process.env.P_K0 = 'indexed-groq-key';
      
      const config = loadGuardrailConfig();
      expect(config).not.toBeNull();
      expect(config.provider).toBe('groq-free');
      
      const validator = createGuardrailValidator(config, {});
      expect(validator).not.toBeNull();
    });

    test('should skip guardrails when disabled', async () => {
      process.env.ENABLE_GUARDRAILS = 'false';
      const context = { groqApiKey: 'test-key' };
      
      const config = loadGuardrailConfig(context);
      expect(config).toBeNull();
      
      const validator = createGuardrailValidator(config, context);
      expect(validator).toBeNull();
    });

    test('should skip guardrails when no provider available', async () => {
      process.env.ENABLE_GUARDRAILS = 'true';
      // No API keys provided
      
      const config = loadGuardrailConfig({});
      expect(config).toBeNull();
      
      const validator = createGuardrailValidator(config, {});
      expect(validator).toBeNull();
    });

    test('should prefer context over environment variables', async () => {
      process.env.ENABLE_GUARDRAILS = 'true';
      process.env.OPENAI_KEY = 'env-openai-key';
      
      // Context should override env
      const context = { groqApiKey: 'context-groq-key' };
      
      const config = loadGuardrailConfig(context);
      expect(config).not.toBeNull();
      expect(config.provider).toBe('groq-free'); // Should use context, not env
    });

    test('should fallback through provider priority', async () => {
      process.env.ENABLE_GUARDRAILS = 'true';
      
      // Test priority: groq-free > gemini-free > groq > together > openai
      
      // Only OpenAI available
      let config = loadGuardrailConfig({ openaiApiKey: 'openai-key' });
      expect(config.provider).toBe('openai');
      
      // Add Together (higher priority)
      config = loadGuardrailConfig({ 
        openaiApiKey: 'openai-key',
        togetherApiKey: 'together-key'
      });
      expect(config.provider).toBe('together');
      
      // Add Gemini Free (higher priority)
      config = loadGuardrailConfig({ 
        openaiApiKey: 'openai-key',
        togetherApiKey: 'together-key',
        geminiApiKey: 'gemini-key'
      });
      expect(config.provider).toBe('gemini-free');
      
      // Add Groq Free (highest priority)
      config = loadGuardrailConfig({ 
        openaiApiKey: 'openai-key',
        togetherApiKey: 'together-key',
        geminiApiKey: 'gemini-key',
        groqApiKey: 'groq-key'
      });
      expect(config.provider).toBe('groq-free');
    });
  });

  describe('Cost Tracking', () => {
    test('should create validator with tracking capabilities', () => {
      process.env.ENABLE_GUARDRAILS = 'true';
      const context = { groqApiKey: 'test-key' };
      
      const config = loadGuardrailConfig(context);
      const validator = createGuardrailValidator(config, context);
      
      // Validator should have methods that return tracking data
      expect(validator.validateInput).toBeInstanceOf(Function);
      expect(validator.validateOutput).toBeInstanceOf(Function);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing provider gracefully', async () => {
      process.env.ENABLE_GUARDRAILS = 'true';
      
      const config = loadGuardrailConfig({});
      expect(config).toBeNull(); // No provider available
      
      // Should not throw
      const validator = createGuardrailValidator(config, {});
      expect(validator).toBeNull();
    });

    test('should throw when config specifies unavailable provider', () => {
      const config = {
        enabled: true,
        provider: 'unavailable-provider',
        inputModel: 'test-model',
        outputModel: 'test-model'
      };
      
      expect(() => {
        createGuardrailValidator(config, {});
      }).toThrow(/No API key found for provider/);
    });
  });

  describe('Indexed Provider Format', () => {
    test('should work with indexed provider environment variables', async () => {
      process.env.ENABLE_GUARDRAILS = 'true';
      process.env.P_T0 = 'groq-free';
      process.env.P_K0 = 'indexed-key';
      
      const config = loadGuardrailConfig();
      expect(config).not.toBeNull();
      
      const validator = createGuardrailValidator(config, {});
      expect(validator).not.toBeNull();
    });
  });
});
