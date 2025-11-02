/**
 * Tests for Model Categorization Module
 */

const {
  ModelCategory,
  categorizeModel,
  getModelsByCategory,
  getRecommendedCategory,
  supportsContextWindow,
  filterByContextWindow,
  getModelInfo
} = require('../../src/model-selection/categorizer');

describe('Model Categorization', () => {
  describe('categorizeModel', () => {
    describe('reasoning models', () => {
      it('should categorize o1-preview as reasoning', () => {
        expect(categorizeModel('o1-preview')).toBe(ModelCategory.REASONING);
      });

      it('should categorize o1-mini as reasoning', () => {
        expect(categorizeModel('o1-mini')).toBe(ModelCategory.REASONING);
      });

      it('should categorize deepseek-reasoner as reasoning', () => {
        expect(categorizeModel('deepseek-reasoner')).toBe(ModelCategory.REASONING);
      });

      it('should categorize QwQ models as reasoning', () => {
        expect(categorizeModel('qwq-32b-preview')).toBe(ModelCategory.REASONING);
      });
    });

    describe('large models', () => {
      it('should categorize llama-3.3-70b as large', () => {
        expect(categorizeModel('llama-3.3-70b-versatile')).toBe(ModelCategory.LARGE);
      });

      it('should categorize llama-3.3-70b as large', () => {
        expect(categorizeModel('llama-3.3-70b-versatile')).toBe(ModelCategory.LARGE);
      });

      it('should categorize llama-405b as large', () => {
        expect(categorizeModel('llama-3.1-405b-instruct')).toBe(ModelCategory.LARGE);
      });

      it('should categorize mixtral-8x22b as large', () => {
        expect(categorizeModel('mixtral-8x22b-instruct')).toBe(ModelCategory.LARGE);
      });

      it('should categorize gpt-4 as large', () => {
        expect(categorizeModel('gpt-4')).toBe(ModelCategory.LARGE);
      });

      it('should categorize gpt-4-turbo as large', () => {
        expect(categorizeModel('gpt-4-turbo')).toBe(ModelCategory.LARGE);
      });

      it('should categorize qwen-72b as large', () => {
        expect(categorizeModel('qwen2-72b-instruct')).toBe(ModelCategory.LARGE);
      });

      it('should categorize claude-3-opus as large', () => {
        expect(categorizeModel('claude-3-opus')).toBe(ModelCategory.LARGE);
      });

      it('should categorize gemini-pro as large', () => {
        expect(categorizeModel('gemini-1.5-pro')).toBe(ModelCategory.LARGE);
      });
    });

    describe('small models', () => {
      it('should categorize llama-3.1-8b as small', () => {
        expect(categorizeModel('llama-3.1-8b-instant')).toBe(ModelCategory.SMALL);
      });

      it('should categorize mixtral-8x7b as small', () => {
        expect(categorizeModel('mixtral-8x7b-32768')).toBe(ModelCategory.SMALL);
      });

      it('should categorize gemma as small', () => {
        expect(categorizeModel('gemma2-9b-it')).toBe(ModelCategory.SMALL);
      });

      it('should categorize gpt-4o-mini as small', () => {
        expect(categorizeModel('gpt-4o-mini')).toBe(ModelCategory.SMALL);
      });

      it('should categorize gpt-3.5-turbo as small', () => {
        expect(categorizeModel('gpt-3.5-turbo')).toBe(ModelCategory.SMALL);
      });

      it('should categorize claude-3-haiku as small', () => {
        expect(categorizeModel('claude-3-haiku')).toBe(ModelCategory.SMALL);
      });

      it('should categorize gemini-flash as small', () => {
        expect(categorizeModel('gemini-1.5-flash')).toBe(ModelCategory.SMALL);
      });

      it('should categorize qwen-32b as small', () => {
        expect(categorizeModel('qwen2-32b-instruct')).toBe(ModelCategory.SMALL);
      });
    });

    describe('edge cases', () => {
      it('should default to small for unknown models', () => {
        expect(categorizeModel('unknown-model-xyz')).toBe(ModelCategory.SMALL);
      });

      it('should default to small for null', () => {
        expect(categorizeModel(null)).toBe(ModelCategory.SMALL);
      });

      it('should default to small for undefined', () => {
        expect(categorizeModel(undefined)).toBe(ModelCategory.SMALL);
      });

      it('should default to small for empty string', () => {
        expect(categorizeModel('')).toBe(ModelCategory.SMALL);
      });

      it('should handle mixed case model names', () => {
        expect(categorizeModel('GPT-4-TURBO')).toBe(ModelCategory.LARGE);
        expect(categorizeModel('LLaMa-3.1-8B-instant')).toBe(ModelCategory.SMALL);
      });
    });
  });

  describe('getModelsByCategory', () => {
    const mockCatalog = {
      providers: {
        'groq-free': {
          models: [
            { name: 'llama-3.1-8b-instant', contextWindow: 8192 },
            { name: 'llama-3.3-70b-versatile', contextWindow: 32768 }
          ]
        },
        'openai': {
          models: [
            { name: 'gpt-4o-mini', contextWindow: 16384 },
            { name: 'gpt-4', contextWindow: 8192 },
            { name: 'o1-preview', contextWindow: 32768 }
          ]
        }
      }
    };

    it('should get all small models', () => {
      const smalls = getModelsByCategory(mockCatalog, ModelCategory.SMALL);
      expect(smalls).toHaveLength(2);
      expect(smalls.map(m => m.name)).toContain('llama-3.1-8b-instant');
      expect(smalls.map(m => m.name)).toContain('gpt-4o-mini');
    });

    it('should get all large models', () => {
      const larges = getModelsByCategory(mockCatalog, ModelCategory.LARGE);
      expect(larges).toHaveLength(2);
      expect(larges.map(m => m.name)).toContain('llama-3.3-70b-versatile');
      expect(larges.map(m => m.name)).toContain('gpt-4');
    });

    it('should get all reasoning models', () => {
      const reasoning = getModelsByCategory(mockCatalog, ModelCategory.REASONING);
      expect(reasoning).toHaveLength(1);
      expect(reasoning[0].name).toBe('o1-preview');
    });

    it('should include provider type in results', () => {
      const smalls = getModelsByCategory(mockCatalog, ModelCategory.SMALL);
      const groqModel = smalls.find(m => m.name === 'llama-3.1-8b-instant');
      expect(groqModel.providerType).toBe('groq-free');
    });

    it('should include category in results', () => {
      const smalls = getModelsByCategory(mockCatalog, ModelCategory.SMALL);
      expect(smalls.every(m => m.category === ModelCategory.SMALL)).toBe(true);
    });

    it('should return empty array for invalid catalog', () => {
      expect(getModelsByCategory(null, ModelCategory.SMALL)).toEqual([]);
      expect(getModelsByCategory({}, ModelCategory.SMALL)).toEqual([]);
    });

    it('should handle missing models array', () => {
      const badCatalog = {
        providers: {
          'test': {}
        }
      };
      expect(getModelsByCategory(badCatalog, ModelCategory.SMALL)).toEqual([]);
    });
  });

  describe('getRecommendedCategory', () => {
    it('should recommend reasoning for requiresReasoning=true', () => {
      expect(getRecommendedCategory({ requiresReasoning: true })).toBe(ModelCategory.REASONING);
    });

    it('should recommend large for requiresLargeContext=true', () => {
      expect(getRecommendedCategory({ requiresLargeContext: true })).toBe(ModelCategory.LARGE);
    });

    it('should recommend large for estimatedTokens > 8000', () => {
      expect(getRecommendedCategory({ estimatedTokens: 10000 })).toBe(ModelCategory.LARGE);
    });

    it('should recommend small for estimatedTokens <= 8000', () => {
      expect(getRecommendedCategory({ estimatedTokens: 5000 })).toBe(ModelCategory.SMALL);
    });

    it('should recommend small by default', () => {
      expect(getRecommendedCategory()).toBe(ModelCategory.SMALL);
      expect(getRecommendedCategory({})).toBe(ModelCategory.SMALL);
    });

    it('should prioritize reasoning over large context', () => {
      expect(getRecommendedCategory({
        requiresReasoning: true,
        requiresLargeContext: true
      })).toBe(ModelCategory.REASONING);
    });

    it('should prioritize reasoning over token count', () => {
      expect(getRecommendedCategory({
        requiresReasoning: true,
        estimatedTokens: 10000
      })).toBe(ModelCategory.REASONING);
    });
  });

  describe('supportsContextWindow', () => {
    it('should return true when context window is sufficient', () => {
      const model = { name: 'test', contextWindow: 8192 };
      expect(supportsContextWindow(model, 4000)).toBe(true);
    });

    it('should return false when required tokens exactly match (due to 20% safety buffer)', () => {
      const model = { name: 'test', contextWindow: 8192 };
      // With 20% safety buffer, requiring 8192 tokens needs 8192*1.2 = 9830 tokens
      // So the model with 8192 context window cannot support this
      expect(supportsContextWindow(model, 8192)).toBe(false);
    });

    it('should return true when required tokens are within safe range', () => {
      const model = { name: 'test', contextWindow: 8192 };
      // 6800 * 1.2 = 8160, which is less than 8192
      expect(supportsContextWindow(model, 6800)).toBe(true);
    });

    it('should return false when context window is insufficient', () => {
      const model = { name: 'test', contextWindow: 8192 };
      expect(supportsContextWindow(model, 16000)).toBe(false);
    });

    it('should return false for null model', () => {
      expect(supportsContextWindow(null, 8000)).toBe(false);
    });

    it('should return false when contextWindow is missing', () => {
      const model = { name: 'test' };
      expect(supportsContextWindow(model, 8000)).toBe(false);
    });
  });

  describe('filterByContextWindow', () => {
    const models = [
      { name: 'small', contextWindow: 4096 },
      { name: 'medium', contextWindow: 8192 },
      { name: 'large', contextWindow: 32768 },
      { name: 'xlarge', contextWindow: 128000 }
    ];

    it('should filter models by context window requirement', () => {
      const filtered = filterByContextWindow(models, 16000);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(m => m.name)).toEqual(['large', 'xlarge']);
    });

    it('should return all models when requiredTokens is 0', () => {
      const filtered = filterByContextWindow(models, 0);
      expect(filtered).toHaveLength(4);
    });

    it('should return all models when requiredTokens is negative', () => {
      const filtered = filterByContextWindow(models, -100);
      expect(filtered).toHaveLength(4);
    });

    it('should return empty array when no models meet requirement', () => {
      const filtered = filterByContextWindow(models, 200000);
      expect(filtered).toHaveLength(0);
    });

    it('should return all models when requirement is very low', () => {
      const filtered = filterByContextWindow(models, 1000);
      expect(filtered).toHaveLength(4);
    });
  });

  describe('getModelInfo', () => {
    const mockCatalog = {
      providers: {
        'groq-free': {
          models: [
            { name: 'llama-3.1-8b-instant', contextWindow: 8192, costPerMToken: 0 }
          ]
        },
        'openai': {
          models: [
            { name: 'gpt-4', contextWindow: 8192, costPerMToken: 30 }
          ]
        }
      }
    };

    it('should get model info with category', () => {
      const info = getModelInfo('llama-3.1-8b-instant', mockCatalog);
      expect(info).toBeDefined();
      expect(info.name).toBe('llama-3.1-8b-instant');
      expect(info.category).toBe(ModelCategory.SMALL);
      expect(info.providerType).toBe('groq-free');
      expect(info.contextWindow).toBe(8192);
    });

    it('should find model in any provider', () => {
      const info = getModelInfo('gpt-4', mockCatalog);
      expect(info).toBeDefined();
      expect(info.name).toBe('gpt-4');
      expect(info.category).toBe(ModelCategory.LARGE);
      expect(info.providerType).toBe('openai');
    });

    it('should return null for unknown model', () => {
      const info = getModelInfo('unknown-model', mockCatalog);
      expect(info).toBeNull();
    });

    it('should return null for invalid inputs', () => {
      expect(getModelInfo(null, mockCatalog)).toBeNull();
      expect(getModelInfo('test', null)).toBeNull();
      expect(getModelInfo('test', {})).toBeNull();
    });
  });

  describe('ModelCategory constants', () => {
    it('should have correct category values', () => {
      expect(ModelCategory.SMALL).toBe('small');
      expect(ModelCategory.LARGE).toBe('large');
      expect(ModelCategory.REASONING).toBe('reasoning');
    });

    it('should be defined and accessible', () => {
      expect(ModelCategory).toBeDefined();
      expect(ModelCategory.SMALL).toBeDefined();
      expect(ModelCategory.LARGE).toBeDefined();
      expect(ModelCategory.REASONING).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    const fullCatalog = {
      providers: {
        'groq-free': {
          models: [
            { name: 'llama-3.1-8b-instant', contextWindow: 8192, costPerMToken: 0 },
            { name: 'llama-3.3-70b-versatile', contextWindow: 32768, costPerMToken: 0 }
          ]
        },
        'openai': {
          models: [
            { name: 'gpt-4o-mini', contextWindow: 16384, costPerMToken: 0.15 },
            { name: 'gpt-4', contextWindow: 8192, costPerMToken: 30 },
            { name: 'o1-preview', contextWindow: 32768, costPerMToken: 15 }
          ]
        }
      }
    };

    it('should find suitable small models for simple request', () => {
      const category = getRecommendedCategory({ estimatedTokens: 2000 });
      const models = getModelsByCategory(fullCatalog, category);
      const suitable = filterByContextWindow(models, 2000);
      
      expect(category).toBe(ModelCategory.SMALL);
      expect(suitable.length).toBeGreaterThan(0);
      expect(suitable.some(m => m.name === 'llama-3.1-8b-instant')).toBe(true);
    });

    it('should find suitable large models for complex request', () => {
      const category = getRecommendedCategory({ 
        estimatedTokens: 12000,
        requiresLargeContext: true 
      });
      const models = getModelsByCategory(fullCatalog, category);
      const suitable = filterByContextWindow(models, 12000);
      
      expect(category).toBe(ModelCategory.LARGE);
      expect(suitable.length).toBeGreaterThan(0);
      expect(suitable.some(m => m.name === 'llama-3.3-70b-versatile')).toBe(true);
    });

    it('should find reasoning models when needed', () => {
      const category = getRecommendedCategory({ requiresReasoning: true });
      const models = getModelsByCategory(fullCatalog, category);
      
      expect(category).toBe(ModelCategory.REASONING);
      expect(models.length).toBe(1);
      expect(models[0].name).toBe('o1-preview');
    });
  });
});
