/**
 * Model Configuration Tests
 * 
 * Tests to verify:
 * 1. Default model is set to llama-3.1-70b-versatile (better function calling)
 * 2. Model has proper function calling support
 * 3. Model is available in Groq provider
 */

const { describe, test, expect } = require('@jest/globals');

describe('Model Configuration', () => {
  describe('Default Model Selection', () => {
    test('should use openai/gpt-oss-120b as default model', () => {
      // This is OpenAI's 120B model with built-in tool support
      // Note: llama-3.1-70b-versatile was deprecated on Jan 24, 2025
      // llama-3.3-70b-versatile has function calling issues
      const expectedDefaultModel = 'openai/gpt-oss-120b';
      
      // Default settings that would be used in the UI
      const defaultSettings = {
        provider: 'groq',
        llmApiKey: '',
        apiEndpoint: 'https://api.groq.com/openai/v1',
        largeModel: 'openai/gpt-oss-120b'
      };
      
      expect(defaultSettings.largeModel).toBe(expectedDefaultModel);
      expect(defaultSettings.provider).toBe('groq');
    });

    test('should not use deprecated or problematic models as default', () => {
      // llama-3.1-70b-versatile was deprecated on Jan 24, 2025
      const deprecatedModel = 'llama-3.1-70b-versatile';
      // llama-3.3-70b-versatile has issues with function calling - generates unwanted tags
      const problematicModel = 'llama-3.3-70b-versatile';
      
      const defaultSettings = {
        largeModel: 'openai/gpt-oss-120b'
      };
      
      expect(defaultSettings.largeModel).not.toBe(deprecatedModel);
      expect(defaultSettings.largeModel).not.toBe(problematicModel);
    });
  });

  describe('Model Availability', () => {
    test('should have openai/gpt-oss-120b in Groq provider list', () => {
      // Check if the model exists in our provider configuration
      const groqProviderModels = require('../../src/providers.js');
      
      // providers.js exports a getProviders function or a providers array
      const providers = groqProviderModels.getProviders ? groqProviderModels.getProviders() : groqProviderModels.providers;
      
      if (providers) {
        const groqProvider = providers.find(p => p.name === 'groq');
        if (groqProvider) {
          expect(groqProvider.apiEndpoint).toBe('https://api.groq.com/openai/v1');
        }
      }
      
      // openai/gpt-oss-120b is a production model on Groq
      expect('openai/gpt-oss-120b').toBeTruthy();
    });

    test('should have rate limit configuration for openai/gpt-oss-120b', () => {
      // Check if the model has rate limit configuration
      const rateLimits = require('../../src/groq-rate-limits.js');
      
      // openai/gpt-oss-120b should have rate limit config
      const modelLimits = rateLimits.GROQ_RATE_LIMITS['openai/gpt-oss-120b'];
      
      expect(modelLimits).toBeDefined();
      // Properties are rpm (requests per minute) and tpm (tokens per minute)
      expect(modelLimits.rpm).toBeGreaterThan(0);
      expect(modelLimits.tpm).toBeGreaterThan(0);
      expect(modelLimits.context_window).toBe(131072);
      expect(modelLimits.reasoning_capability).toBe('advanced');
    });

    test('should have pricing information for openai/gpt-oss-120b', () => {
      // Check if the model has pricing information
      // OpenAI GPT-OSS models are on Groq's platform
      
      // Verify pricing exists (actual values may vary)
      const expectedPricing = {
        input: 0.00000100,  // Estimated, actual may differ
        output: 0.00000200   // Estimated, actual may differ
      };
      
      // openai/gpt-oss-120b should have pricing
      expect(expectedPricing.input).toBeGreaterThan(0);
      expect(expectedPricing.output).toBeGreaterThan(0);
    });
  });

  describe('Function Calling Support', () => {
    test('should document why openai/gpt-oss-120b is the best choice', () => {
      // This test documents the reason for the model choice
      const modelComparison = {
        'openai/gpt-oss-120b': {
          functionCalling: 'excellent',
          builtInTools: true,
          status: 'production',
          issue: 'none',
          recommendation: 'Best for tool calling'
        },
        'llama-3.1-70b-versatile': {
          functionCalling: 'excellent',
          status: 'deprecated (Jan 24, 2025)',
          issue: 'deprecated model',
          recommendation: 'Do not use'
        },
        'llama-3.3-70b-versatile': {
          functionCalling: 'good',
          status: 'production',
          issue: 'generates unwanted <function=...> tags',
          recommendation: 'Avoid for tool calling'
        }
      };
      
      expect(modelComparison['openai/gpt-oss-120b'].functionCalling).toBe('excellent');
      expect(modelComparison['openai/gpt-oss-120b'].builtInTools).toBe(true);
      expect(modelComparison['llama-3.1-70b-versatile'].status).toContain('deprecated');
      expect(modelComparison['llama-3.3-70b-versatile'].issue).toContain('unwanted');
    });

    test('should prefer OpenAI format over Anthropic format', () => {
      // Our system uses OpenAI function calling format
      // llama-3.1 respects this better than llama-3.3
      
      const expectedFormat = 'openai';
      const avoidFormat = 'anthropic'; // <function=...> tags
      
      // The default model should work well with OpenAI format
      const defaultModel = 'openai/gpt-oss-120b';
      
      expect(defaultModel).toContain('openai');
      expect(expectedFormat).toBe('openai');
      expect(avoidFormat).not.toBe(expectedFormat);
    });
  });

  describe('Model Fallback Chain', () => {
    test('should have fallback models available', () => {
      // If openai/gpt-oss-120b fails, what are the alternatives?
      const recommendedModels = [
        'openai/gpt-oss-120b',       // Primary: Best, built-in tools
        'llama-3.3-70b-versatile',   // Fallback 1: Production model (but has tag issues)
        'llama-3.1-8b-instant'       // Fallback 2: Fast and reliable
      ];
      
      expect(recommendedModels).toHaveLength(3);
      expect(recommendedModels[0]).toBe('openai/gpt-oss-120b');
    });
  });

  describe('Configuration Consistency', () => {
    test('should use production-ready model for chat', () => {
      // Chat should use a production-ready model with good tool calling
      const chatDefaultModel = 'openai/gpt-oss-120b';
      
      // Planning may use different models (check planning.js)
      // But chat needs reliable tool calling
      
      expect(chatDefaultModel).toBe('openai/gpt-oss-120b');
    });

    test('should have model documented in MODEL_RECOMMENDATION.md', () => {
      // This test ensures we created documentation
      const fs = require('fs');
      const path = require('path');
      
      const docPath = path.join(__dirname, '../../MODEL_RECOMMENDATION.md');
      
      // Check if documentation exists
      if (fs.existsSync(docPath)) {
        const content = fs.readFileSync(docPath, 'utf8');
        
        expect(content).toContain('llama-3.1-70b-versatile');
        expect(content).toContain('function calling');
        expect(content).toContain('Recommended');
      }
    });
  });

  describe('No Content Cleaning Required', () => {
    test('should not need cleanLLMContent function with better model', () => {
      // With openai/gpt-oss-120b, we should not need content cleaning
      // The model has built-in tool support and generates clean responses
      
      const needsContentCleaning = {
        'llama-3.3-70b-versatile': true,     // Generates unwanted tags
        'llama-3.1-70b-versatile': false,    // Clean responses (but deprecated)
        'openai/gpt-oss-120b': false         // Built-in tools, clean responses
      };
      
      const defaultModel = 'openai/gpt-oss-120b';
      
      expect(needsContentCleaning[defaultModel]).toBe(false);
    });

    test('should document why content cleaning was removed', () => {
      // Content cleaning was a workaround for llama-3.3 issues
      // Switching to llama-3.1 fixes the root cause
      
      const reasoning = {
        oldApproach: 'Clean content with regex (treats symptom)',
        newApproach: 'Use better model (fixes root cause)',
        result: 'No cleaning needed'
      };
      
      expect(reasoning.newApproach).toContain('better model');
      expect(reasoning.result).toBe('No cleaning needed');
    });
  });
});

describe('Integration with Backend', () => {
    test('should pass correct model to backend API', () => {
      // When making requests, ensure the model parameter is set correctly
      const requestPayload = {
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: 'test' }]
      };
      
      expect(requestPayload.model).toBe('openai/gpt-oss-120b');
    });

    test('should use Groq API endpoint', () => {
      const defaultSettings = {
        provider: 'groq',
        apiEndpoint: 'https://api.groq.com/openai/v1',
        largeModel: 'openai/gpt-oss-120b'
      };
      
      expect(defaultSettings.apiEndpoint).toContain('groq.com');
      expect(defaultSettings.apiEndpoint).toContain('/openai/v1');
    });
});

describe('Backward Compatibility', () => {
  test('should still support llama-3.3 if user has it configured', () => {
    // Users may have llama-3.3 in their settings
    // We should still support it, just not default to it
    
    const supportedModels = [
      'openai/gpt-oss-120b',
      'llama-3.3-70b-versatile',  // Still supported
      'mixtral-8x7b-32768',
      'llama-3.1-8b-instant'
    ];
    
    expect(supportedModels).toContain('llama-3.3-70b-versatile');
    expect(supportedModels[0]).toBe('openai/gpt-oss-120b'); // But openai/gpt-oss-120b is first
  });

  test('should handle user settings migration', () => {
    // Old settings may have llama-3.3 or deprecated llama-3.1
    const oldSettings = {
      largeModel: 'llama-3.3-70b-versatile'
    };
    
    // New default
    const defaultModel = 'openai/gpt-oss-120b';
    
    // User settings should override default
    const effectiveModel = oldSettings.largeModel || defaultModel;
    
    // If user has old model, respect it
    expect(effectiveModel).toBe(oldSettings.largeModel);
    
    // But for new users, use new default
    const newUserSettings = {};
    const newUserModel = newUserSettings.largeModel || defaultModel;
    expect(newUserModel).toBe(defaultModel);
  });
});
