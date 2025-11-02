/**
 * Unit tests for guardrails factory integration
 */

const { createGuardrailValidator } = require('../../src/guardrails/guardrail-factory');

// Mock the provider factory
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

const { createProvider } = require('../../src/providers/provider-factory');

describe('Guardrails Factory', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createGuardrailValidator', () => {
    test('should return null when config is null', () => {
      const validator = createGuardrailValidator(null);
      expect(validator).toBeNull();
    });

    test('should return null when config.enabled is false', () => {
      const config = { enabled: false };
      const validator = createGuardrailValidator(config);
      expect(validator).toBeNull();
    });

    test('should throw error when no API key found for provider', () => {
      const config = {
        enabled: true,
        provider: 'groq-free',
        inputModel: 'llama-3.1-8b-instant',
        outputModel: 'llama-3.1-8b-instant'
      };

      expect(() => {
        createGuardrailValidator(config, {});
      }).toThrow(/No API key found for provider/);
    });

    test('should create validator with context API key', () => {
      const config = {
        enabled: true,
        provider: 'groq-free',
        inputModel: 'llama-3.1-8b-instant',
        outputModel: 'llama-3.1-8b-instant'
      };
      const context = { groqApiKey: 'test-groq-key' };

      const validator = createGuardrailValidator(config, context);

      expect(validator).not.toBeNull();
      expect(validator.validateInput).toBeInstanceOf(Function);
      expect(validator.validateOutput).toBeInstanceOf(Function);
      expect(createProvider).toHaveBeenCalledWith({
        id: 'guardrail',
        type: 'groq-free',
        apiKey: 'test-groq-key',
        source: 'guardrail'
      });
    });

    test('should create validator with indexed env var API key', () => {
      process.env.LP_TYPE_0 = 'groq-free';
      process.env.LP_KEY_0 = 'indexed-groq-key';
      const config = {
        enabled: true,
        provider: 'groq-free',
        inputModel: 'llama-3.1-8b-instant',
        outputModel: 'llama-3.1-8b-instant'
      };

      const validator = createGuardrailValidator(config, {});

      expect(validator).not.toBeNull();
      expect(createProvider).toHaveBeenCalledWith({
        id: 'guardrail',
        type: 'groq-free',
        apiKey: 'indexed-groq-key',
        source: 'guardrail'
      });
      
      // Cleanup
      delete process.env.LP_TYPE_0;
      delete process.env.LP_KEY_0;
    });
  });

  describe('Validator Methods', () => {
    let validator;
    let mockMakeRequest;

    beforeEach(() => {
      // Reset the mock
      mockMakeRequest = jest.fn(async (messages, options) => ({
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
      }));

      // Update the createProvider mock to use our mockMakeRequest
      createProvider.mockReturnValue({
        makeRequest: mockMakeRequest
      });

      const config = {
        enabled: true,
        provider: 'groq-free',
        inputModel: 'llama-3.1-8b-instant',
        outputModel: 'llama-3.1-8b-instant'
      };
      const context = { groqApiKey: 'test-key' };

      validator = createGuardrailValidator(config, context);
    });

    describe('validateInput', () => {
      test('should validate safe input', async () => {
        mockMakeRequest.mockResolvedValue({
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
        });

        const result = await validator.validateInput('Hello world');

        expect(result.safe).toBe(true);
        expect(result.violations).toEqual([]);
        expect(result.tracking).toMatchObject({
          type: 'guardrail_input',
          model: 'llama-3.1-8b-instant',
          provider: 'groq-free',
          promptTokens: 50,
          completionTokens: 20
        });
      });

      test('should detect unsafe input', async () => {
        mockMakeRequest.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                safe: false,
                violations: ['harmful_content'],
                reason: 'Contains harmful language',
                suggested_revision: 'Please rephrase'
              })
            }
          }],
          usage: {
            prompt_tokens: 60,
            completion_tokens: 30
          }
        });

        const result = await validator.validateInput('Harmful content here');

        expect(result.safe).toBe(false);
        expect(result.violations).toContain('harmful_content');
        expect(result.reason).toBe('Contains harmful language');
        expect(result.suggestedRevision).toBe('Please rephrase');
      });

      test('should handle JSON wrapped in markdown code blocks', async () => {
        mockMakeRequest.mockResolvedValue({
          choices: [{
            message: {
              content: '```json\n{"safe": true, "violations": [], "reason": "OK"}\n```'
            }
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 20
          }
        });

        const result = await validator.validateInput('Test input');

        expect(result.safe).toBe(true);
      });

      test('should fail safe on API error', async () => {
        mockMakeRequest.mockRejectedValue(
          new Error('API timeout')
        );

        const result = await validator.validateInput('Test input');

        expect(result.safe).toBe(false);
        expect(result.violations).toContain('system_error');
        expect(result.reason).toContain('API timeout');
        expect(result.tracking.error).toBe('API timeout');
      });

      test('should fail safe on JSON parse error', async () => {
        mockMakeRequest.mockResolvedValue({
          choices: [{
            message: {
              content: 'Invalid JSON response'
            }
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 20
          }
        });

        const result = await validator.validateInput('Test input');

        expect(result.safe).toBe(false);
        expect(result.violations).toContain('system_error');
      });
    });

    describe('validateOutput', () => {
      test('should validate safe output', async () => {
        mockMakeRequest.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                safe: true,
                violations: [],
                reason: 'Output is acceptable'
              })
            }
          }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 25
          }
        });

        const result = await validator.validateOutput('This is a safe response');

        expect(result.safe).toBe(true);
        expect(result.tracking).toMatchObject({
          type: 'guardrail_output',
          model: 'llama-3.1-8b-instant',
          provider: 'groq-free',
          promptTokens: 100,
          completionTokens: 25
        });
      });

      test('should detect unsafe output', async () => {
        mockMakeRequest.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                safe: false,
                violations: ['inappropriate_content', 'policy_violation'],
                reason: 'Output contains policy violations'
              })
            }
          }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 35
          }
        });

        const result = await validator.validateOutput('Unsafe output here');

        expect(result.safe).toBe(false);
        expect(result.violations).toEqual(['inappropriate_content', 'policy_violation']);
        expect(result.reason).toBe('Output contains policy violations');
      });

      test('should fail safe on error', async () => {
        mockMakeRequest.mockRejectedValue(
          new Error('Network error')
        );

        const result = await validator.validateOutput('Test output');

        expect(result.safe).toBe(false);
        expect(result.violations).toContain('system_error');
        expect(result.tracking.error).toBe('Network error');
      });
    });
  });

  describe('Multiple Provider Support', () => {
    test('should work with OpenAI provider', () => {
      const config = {
        enabled: true,
        provider: 'openai',
        inputModel: 'gpt-4o-mini',
        outputModel: 'gpt-4o-mini'
      };
      const context = { openaiApiKey: 'test-openai-key' };

      const validator = createGuardrailValidator(config, context);

      expect(validator).not.toBeNull();
      expect(createProvider).toHaveBeenCalledWith({
        id: 'guardrail',
        type: 'openai',
        apiKey: 'test-openai-key',
        source: 'guardrail'
      });
    });

    test('should work with Anthropic provider', () => {
      const config = {
        enabled: true,
        provider: 'anthropic',
        inputModel: 'claude-3-haiku-20240307',
        outputModel: 'claude-3-haiku-20240307'
      };
      const context = { anthropicApiKey: 'test-anthropic-key' };

      const validator = createGuardrailValidator(config, context);

      expect(validator).not.toBeNull();
      expect(createProvider).toHaveBeenCalledWith({
        id: 'guardrail',
        type: 'anthropic',
        apiKey: 'test-anthropic-key',
        source: 'guardrail'
      });
    });

    test('should work with Gemini provider', () => {
      const config = {
        enabled: true,
        provider: 'gemini-free',
        inputModel: 'gemini-1.5-flash',
        outputModel: 'gemini-1.5-flash'
      };
      const context = { geminiApiKey: 'test-gemini-key' };

      const validator = createGuardrailValidator(config, context);

      expect(validator).not.toBeNull();
      expect(createProvider).toHaveBeenCalledWith({
        id: 'guardrail',
        type: 'gemini-free',
        apiKey: 'test-gemini-key',
        source: 'guardrail'
      });
    });
  });

  describe('Context Priority', () => {
    test('should prefer context key over indexed env var', () => {
      process.env.P_T0 = 'groq-free';
      process.env.P_K0 = 'indexed-key';
      const config = {
        enabled: true,
        provider: 'groq-free',
        inputModel: 'llama-3.1-8b-instant',
        outputModel: 'llama-3.1-8b-instant'
      };
      const context = { groqApiKey: 'context-key' };

      createGuardrailValidator(config, context);

      expect(createProvider).toHaveBeenCalledWith({
        id: 'guardrail',
        type: 'groq-free',
        apiKey: 'context-key',  // Should use context key, not indexed
        source: 'guardrail'
      });
    });
  });
});
