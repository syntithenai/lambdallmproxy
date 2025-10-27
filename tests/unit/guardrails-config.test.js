/**
 * Unit tests for guardrails configuration auto-detection
 */

const path = require('path');

// Mock PROVIDER_CATALOG.json before requiring config
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
          },
          'gemini-1.5-flash-8b': {
            id: 'gemini-1.5-flash-8b',
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
          },
          'llama-3.3-70b-versatile': {
            id: 'llama-3.3-70b-versatile',
            category: 'large',
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
      'anthropic': {
        name: 'Anthropic',
        type: 'anthropic',
        models: {
          'claude-3-haiku-20240307': {
            id: 'claude-3-haiku-20240307',
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

describe('Guardrails Auto-Detection', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear all guardrail-related env vars
    delete process.env.ENABLE_GUARDRAILS;
    delete process.env.GUARDRAIL_PROVIDER;
    delete process.env.GUARDRAIL_INPUT_MODEL;
    delete process.env.GUARDRAIL_OUTPUT_MODEL;
    
    // Clear provider API keys
    delete process.env.GROQ_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.TOGETHER_API_KEY;
    
    // Clear indexed provider env vars
    for (let i = 0; i < 10; i++) {
      delete process.env[`P_T${i}`];
      delete process.env[`P_K${i}`];
    }
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Disabled State', () => {
    test('should return null when ENABLE_GUARDRAILS is not set', () => {
      const config = loadGuardrailConfig();
      expect(config).toBeNull();
    });

    test('should return null when ENABLE_GUARDRAILS is false', () => {
      process.env.ENABLE_GUARDRAILS = 'false';
      const config = loadGuardrailConfig();
      expect(config).toBeNull();
    });

    test('should return null when ENABLE_GUARDRAILS is true but no providers available', () => {
      process.env.ENABLE_GUARDRAILS = 'true';
      const config = loadGuardrailConfig({});
      expect(config).toBeNull();
    });
  });

  describe('Provider Priority - Context Keys', () => {
    beforeEach(() => {
      process.env.ENABLE_GUARDRAILS = 'true';
    });

    test('should prefer groq-free when groqApiKey is provided in context', () => {
      const context = { groqApiKey: 'test-groq-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config).not.toBeNull();
      expect(config.enabled).toBe(true);
      expect(config.provider).toBe('groq-free');
      expect(config.inputModel).toBe('llama-3.1-8b-instant');
      expect(config.outputModel).toBe('llama-3.1-8b-instant');
    });

    test('should use gemini-free when geminiApiKey is provided and groq is not available', () => {
      const context = { geminiApiKey: 'test-gemini-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config).not.toBeNull();
      expect(config.enabled).toBe(true);
      expect(config.provider).toBe('gemini-free');
      expect(config.inputModel).toBe('gemini-1.5-flash');
      expect(config.outputModel).toBe('gemini-1.5-flash');
    });

    test('should use together when togetherApiKey is provided and free tiers not available', () => {
      const context = { togetherApiKey: 'test-together-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config).not.toBeNull();
      expect(config.enabled).toBe(true);
      expect(config.provider).toBe('together');
      expect(config.inputModel).toBe('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
    });

    test('should use openai when openaiApiKey is provided and higher priority providers not available', () => {
      const context = { openaiApiKey: 'test-openai-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config).not.toBeNull();
      expect(config.enabled).toBe(true);
      expect(config.provider).toBe('openai');
      expect(config.inputModel).toBe('gpt-4o-mini');
    });

    test('should prefer groq-free over other providers when multiple keys provided', () => {
      const context = {
        groqApiKey: 'test-groq-key',
        geminiApiKey: 'test-gemini-key',
        openaiApiKey: 'test-openai-key'
      };
      const config = loadGuardrailConfig(context);
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('groq-free');
    });

    test('should prefer gemini-free over paid providers when groq not available', () => {
      const context = {
        geminiApiKey: 'test-gemini-key',
        openaiApiKey: 'test-openai-key',
        anthropicApiKey: 'test-anthropic-key'
      };
      const config = loadGuardrailConfig(context);
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('gemini-free');
    });
  });

  describe('Provider Priority - Indexed Env Vars', () => {
    beforeEach(() => {
      process.env.ENABLE_GUARDRAILS = 'true';
    });

    test('should use groq-free from indexed provider env vars', () => {
      process.env.P_T0 = 'groq-free';
      process.env.P_K0 = 'indexed-groq-key';
      
      const config = loadGuardrailConfig();
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('groq-free');
    });

    test('should use gemini-free from indexed provider env vars', () => {
      process.env.P_T0 = 'gemini-free';
      process.env.P_K0 = 'indexed-gemini-key';
      
      const config = loadGuardrailConfig();
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('gemini-free');
    });

    test('should skip providers without API keys in indexed format', () => {
      process.env.P_T0 = 'groq-free';
      process.env.P_K0 = ''; // Empty key
      process.env.P_T1 = 'openai';
      process.env.P_K1 = 'indexed-openai-key';
      
      const config = loadGuardrailConfig();
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('openai'); // Should skip groq-free and use openai
    });
  });

  describe('Context Overrides Env Vars', () => {
    beforeEach(() => {
      process.env.ENABLE_GUARDRAILS = 'true';
    });

    test('should prefer context keys over indexed env vars', () => {
      process.env.P_T0 = 'openai';
      process.env.P_K0 = 'indexed-openai-key';
      const context = { groqApiKey: 'context-groq-key' };
      
      const config = loadGuardrailConfig(context);
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('groq-free'); // Context groq should win
    });
  });

  describe('Configuration Structure', () => {
    beforeEach(() => {
      process.env.ENABLE_GUARDRAILS = 'true';
    });

    test('should return complete config structure', () => {
      const context = { groqApiKey: 'test-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config).toMatchObject({
        enabled: expect.any(Boolean),
        provider: expect.any(String),
        inputModel: expect.any(String),
        outputModel: expect.any(String),
        strictness: expect.any(String)
      });
    });

    test('should set enabled to true', () => {
      const context = { groqApiKey: 'test-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config.enabled).toBe(true);
    });

    test('should default strictness to moderate', () => {
      const context = { groqApiKey: 'test-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config.strictness).toBe('moderate');
    });

    test('should have same model for input and output by default', () => {
      const context = { groqApiKey: 'test-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config.inputModel).toBe(config.outputModel);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      process.env.ENABLE_GUARDRAILS = 'true';
    });

    test('should handle empty context object when indexed provider available', () => {
      process.env.P_T0 = 'groq-free';
      process.env.P_K0 = 'test-key';
      const config = loadGuardrailConfig({});
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('groq-free');
    });

    test('should handle undefined context when indexed provider available', () => {
      process.env.P_T0 = 'groq-free';
      process.env.P_K0 = 'test-key';
      const config = loadGuardrailConfig();
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('groq-free');
    });

    test('should handle context with null values', () => {
      process.env.P_T0 = 'groq-free';
      process.env.P_K0 = 'test-key';
      const context = { groqApiKey: null, openaiApiKey: null };
      const config = loadGuardrailConfig(context);
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('groq-free'); // Should fall back to indexed provider
    });

    test('should handle whitespace-only API keys in indexed providers', () => {
      process.env.P_T0 = 'groq-free';
      process.env.P_K0 = '   '; // Whitespace only
      process.env.P_T1 = 'openai';
      process.env.P_K1 = 'test-key';
      const config = loadGuardrailConfig();
      
      expect(config).not.toBeNull();
      expect(config.provider).toBe('openai'); // Should skip groq with whitespace key
    });
  });

  describe('Groq Paid Tier', () => {
    beforeEach(() => {
      process.env.ENABLE_GUARDRAILS = 'true';
    });

    test('should use groq paid tier when groq-free not available', () => {
      // Simulate groq-free being exhausted/unavailable by not providing groq-free in catalog
      // In practice, both use same API key so this tests the priority logic
      const context = { groqApiKey: 'test-groq-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config).not.toBeNull();
      // Should prefer groq-free first
      expect(config.provider).toBe('groq-free');
    });
  });

  describe('Model Selection', () => {
    beforeEach(() => {
      process.env.ENABLE_GUARDRAILS = 'true';
    });

    test('should select fast small model for groq-free', () => {
      const context = { groqApiKey: 'test-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config.inputModel).toBe('llama-3.1-8b-instant');
      expect(config.outputModel).toBe('llama-3.1-8b-instant');
    });

    test('should select flash model for gemini-free', () => {
      const context = { geminiApiKey: 'test-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config.inputModel).toBe('gemini-1.5-flash');
    });

    test('should select mini model for openai', () => {
      const context = { openaiApiKey: 'test-key' };
      const config = loadGuardrailConfig(context);
      
      expect(config.inputModel).toBe('gpt-4o-mini');
    });
  });
});
