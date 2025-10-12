/**
 * Integration Tests for Enhanced Model Selection
 * Tests the complete selection pipeline with optimization modes, health filtering, and speed optimization
 */

const { selectModel, SelectionStrategy } = require('../../src/model-selection/selector');
const { RateLimitTracker } = require('../../src/model-selection/rate-limit-tracker');
const { RoundRobinSelector } = require('../../src/model-selection/selector');

// Load real catalog
const fs = require('fs');
const path = require('path');
const catalogPath = path.join(__dirname, '../../PROVIDER_CATALOG.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

describe('Enhanced Model Selection Integration', () => {
  let rateLimitTracker;
  let roundRobinSelector;

  beforeEach(() => {
    rateLimitTracker = new RateLimitTracker();
    roundRobinSelector = new RoundRobinSelector();
  });

  describe('Cheap Mode - Free Tier Prioritization', () => {
    test('should select free tier model for simple query', () => {
      const messages = [
        { role: 'user', content: 'What is 2+2?' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.CHEAP },
        roundRobinSelector,
        max_tokens: 1000
      });

      expect(selection).toBeDefined();
      expect(selection.model).toBeDefined();
      
      // Should be a free model (Groq or Gemini)
      const isFree = selection.model.providerType === 'groq' || 
                     selection.model.providerType === 'gemini';
      expect(isFree).toBe(true);
    });

    test('should prefer small free models for simple tasks', () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.CHEAP },
        roundRobinSelector,
        max_tokens: 500
      });

      // Should pick llama-3.1-8b-instant or similar small model
      expect(selection.model.name).toMatch(/8b|small|mini|flash/i);
    });

    test('should fallback to paid when all free models rate limited', () => {
      // Rate limit all free models
      const freeModels = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 
                          'gemini-2.0-flash', 'gemini-2.5-flash'];
      
      freeModels.forEach(model => {
        const provider = model.includes('llama') ? 'groq' : 'gemini';
        rateLimitTracker.updateFrom429(provider, model, 60);
      });

      const messages = [
        { role: 'user', content: 'What is 2+2?' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.CHEAP },
        roundRobinSelector,
        max_tokens: 1000
      });

      expect(selection).toBeDefined();
      // Should fallback to paid model
      const isPaid = selection.model.pricing && 
                     (selection.model.pricing.input > 0 || selection.model.pricing.output > 0);
      expect(isPaid).toBe(true);
    });
  });

  describe('Balanced Mode - Cost-Per-Quality', () => {
    test('should select appropriate model for medium complexity', () => {
      const messages = [
        { role: 'user', content: 'Explain the theory of relativity in simple terms. Include key concepts and examples.' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.BALANCED },
        roundRobinSelector,
        max_tokens: 2000
      });

      expect(selection).toBeDefined();
      // Should select a capable model (not necessarily largest or cheapest)
      expect(selection.category).toMatch(/LARGE|SMALL/);
    });

    test('should optimize cost-per-quality ratio', () => {
      const messages = [
        { role: 'user', content: 'What is the capital of France?' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.BALANCED },
        roundRobinSelector,
        max_tokens: 1000
      });

      // For simple query, should not select expensive reasoning models
      expect(selection.model.name).not.toMatch(/o1-preview|o1-mini|deepseek-r1/);
    });
  });

  describe('Powerful Mode - Quality First', () => {
    test('should select best model for complex analysis', () => {
      const messages = [
        { role: 'user', content: 'Analyze the economic implications of quantum computing on global financial systems. Provide detailed reasoning with multiple perspectives.' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.POWERFUL },
        roundRobinSelector,
        max_tokens: 8000
      });

      expect(selection).toBeDefined();
      expect(selection.category).toMatch(/LARGE|REASONING/);
      
      // Should select a high-capability model
      const isPowerful = selection.model.name.includes('gpt-4o') ||
                        selection.model.name.includes('gemini-2.5-pro') ||
                        selection.model.name.includes('deepseek-v3') ||
                        selection.model.name.includes('o1');
      expect(isPowerful).toBe(true);
    });

    test('should prioritize reasoning models for math problems', () => {
      const messages = [
        { role: 'user', content: 'Solve: If x^2 + 5x + 6 = 0, find all values of x. Show your work step by step.' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.POWERFUL },
        roundRobinSelector,
        max_tokens: 4000
      });

      expect(selection).toBeDefined();
      // Should recommend REASONING category
      expect(selection.analysis.requiresReasoning).toBe(true);
    });
  });

  describe('Fastest Mode - Speed Optimization', () => {
    test('should select fast model without historical data', () => {
      const messages = [
        { role: 'user', content: 'Quick question: what time is it in Tokyo?' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.SPEED_OPTIMIZED },
        roundRobinSelector,
        max_tokens: 500
      });

      expect(selection).toBeDefined();
      // Should prefer Groq (fastest provider)
      expect(selection.model.providerType).toBe('groq');
    });

    test('should use historical performance data when available', () => {
      // Add performance data
      rateLimitTracker.recordPerformance('groq', 'llama-3.1-8b-instant', {
        timeToFirstToken: 50,
        totalDuration: 300
      });

      rateLimitTracker.recordPerformance('openai', 'gpt-4o-mini', {
        timeToFirstToken: 600,
        totalDuration: 2000
      });

      rateLimitTracker.recordPerformance('gemini', 'gemini-2.5-flash', {
        timeToFirstToken: 200,
        totalDuration: 800
      });

      const messages = [
        { role: 'user', content: 'What is 2+2?' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.SPEED_OPTIMIZED },
        roundRobinSelector,
        max_tokens: 500
      });

      expect(selection).toBeDefined();
      // Should select Groq model (fastest historical TTFT)
      expect(selection.model.name).toBe('llama-3.1-8b-instant');
    });
  });

  describe('Health-Based Filtering', () => {
    test('should filter out unhealthy models', () => {
      // Make gpt-4o unhealthy
      for (let i = 0; i < 5; i++) {
        rateLimitTracker.recordError('openai', 'gpt-4o');
      }

      const messages = [
        { role: 'user', content: 'Analyze this complex problem...' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.POWERFUL },
        roundRobinSelector,
        max_tokens: 4000
      });

      expect(selection).toBeDefined();
      // Should not select unhealthy gpt-4o
      expect(selection.model.name).not.toBe('gpt-4o');
    });

    test('should use all models when none are unhealthy', () => {
      const messages = [
        { role: 'user', content: 'Simple question' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.CHEAP },
        roundRobinSelector,
        max_tokens: 1000
      });

      expect(selection).toBeDefined();
      expect(selection.candidateCount).toBeGreaterThan(0);
    });

    test('should gracefully handle all models unhealthy', () => {
      // Make all models unhealthy
      const allModels = ['llama-3.1-8b-instant', 'gpt-4o', 'gemini-2.5-flash', 'gpt-4o-mini'];
      allModels.forEach(model => {
        const provider = model.includes('llama') ? 'groq' : 
                        model.includes('gpt') ? 'openai' : 'gemini';
        for (let i = 0; i < 5; i++) {
          rateLimitTracker.recordError(provider, model);
        }
      });

      const messages = [
        { role: 'user', content: 'Simple question' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.CHEAP },
        roundRobinSelector,
        max_tokens: 1000
      });

      // Should still return a model (bypassing health filter as fallback)
      expect(selection).toBeDefined();
      expect(selection.model).toBeDefined();
    });
  });

  describe('Context Window Filtering', () => {
    test('should filter models by context requirements', () => {
      // Create a very long conversation
      const messages = [];
      for (let i = 0; i < 50; i++) {
        messages.push({ role: 'user', content: 'Question ' + i });
        messages.push({ role: 'assistant', content: 'Answer ' + i.repeat(100) });
      }

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.BALANCED },
        roundRobinSelector,
        max_tokens: 2000
      });

      expect(selection).toBeDefined();
      // Should select a model with large context window
      expect(selection.model.context_window).toBeGreaterThan(50000);
    });

    test('should not select models with insufficient context', () => {
      const longContext = 'A'.repeat(100000); // ~100k chars
      const messages = [
        { role: 'user', content: longContext }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.POWERFUL },
        roundRobinSelector,
        max_tokens: 2000
      });

      expect(selection).toBeDefined();
      // Should select a model with very large context (gemini 2M, etc)
      expect(selection.model.context_window).toBeGreaterThan(100000);
    });
  });

  describe('Request Analysis Integration', () => {
    test('should detect simple queries', () => {
      const messages = [
        { role: 'user', content: 'Hi' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.BALANCED },
        roundRobinSelector,
        max_tokens: 500
      });

      expect(selection.analysis.type).toBe('SIMPLE');
      expect(selection.category).toBe('SMALL');
    });

    test('should detect complex analysis requests', () => {
      const messages = [
        { role: 'user', content: 'Analyze the following dataset and provide statistical insights, trends, and predictions. Include detailed methodology and confidence intervals. Here is a multi-paragraph description of the data...' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.POWERFUL },
        roundRobinSelector,
        max_tokens: 8000
      });

      expect(selection.analysis.type).toBe('COMPLEX');
      expect(selection.category).toMatch(/LARGE|REASONING/);
    });

    test('should detect reasoning tasks', () => {
      const messages = [
        { role: 'user', content: 'Calculate the optimal solution: maximize profit = 3x + 4y subject to constraints...' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.POWERFUL },
        roundRobinSelector,
        max_tokens: 4000
      });

      expect(selection.analysis.requiresReasoning).toBe(true);
      expect(selection.category).toBe('REASONING');
    });

    test('should detect tool-heavy requests', () => {
      const messages = [
        { role: 'user', content: 'Search for recent news about AI' }
      ];

      const tools = [
        { name: 'brave_search', description: 'Search the web' }
      ];

      const selection = selectModel({
        messages,
        tools,
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.BALANCED },
        roundRobinSelector,
        max_tokens: 2000
      });

      expect(selection.analysis.hasTools).toBe(true);
    });
  });

  describe('Round-Robin Load Distribution', () => {
    test('should distribute load across equivalent models', () => {
      const messages = [
        { role: 'user', content: 'Simple question' }
      ];

      const selections = [];
      for (let i = 0; i < 10; i++) {
        const selection = selectModel({
          messages,
          tools: [],
          catalog,
          rateLimitTracker,
          preferences: { strategy: SelectionStrategy.CHEAP },
          roundRobinSelector,
          max_tokens: 1000
        });
        selections.push(selection.model.name);
      }

      // Should have variety (not always the same model)
      const uniqueModels = new Set(selections);
      expect(uniqueModels.size).toBeGreaterThan(1);
    });
  });

  describe('Fallback Chains', () => {
    test('should fallback when primary model unavailable', () => {
      // Rate limit preferred model
      rateLimitTracker.updateFrom429('groq', 'llama-3.1-8b-instant', 60);

      const messages = [
        { role: 'user', content: 'What is 2+2?' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.CHEAP },
        roundRobinSelector,
        max_tokens: 1000
      });

      expect(selection).toBeDefined();
      expect(selection.model.name).not.toBe('llama-3.1-8b-instant');
    });

    test('should try multiple fallbacks if needed', () => {
      // Rate limit multiple Groq models
      rateLimitTracker.updateFrom429('groq', 'llama-3.1-8b-instant', 60);
      rateLimitTracker.updateFrom429('groq', 'llama-3.3-70b-versatile', 60);

      const messages = [
        { role: 'user', content: 'Simple question' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.CHEAP },
        roundRobinSelector,
        max_tokens: 1000
      });

      expect(selection).toBeDefined();
      // Should fallback to different provider
      expect(selection.model.providerType).not.toBe('groq');
    });
  });

  describe('Real-World Scenarios', () => {
    test('should handle coding task with balanced mode', () => {
      const messages = [
        { role: 'user', content: 'Write a Python function to implement binary search. Include docstring and error handling.' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.BALANCED },
        roundRobinSelector,
        max_tokens: 3000
      });

      expect(selection).toBeDefined();
      expect(selection.analysis.type).toMatch(/COMPLEX|CREATIVE/);
    });

    test('should handle chat conversation with context', () => {
      const messages = [
        { role: 'user', content: 'Tell me about quantum computing' },
        { role: 'assistant', content: 'Quantum computing uses qubits...' },
        { role: 'user', content: 'How does that compare to classical computing?' }
      ];

      const selection = selectModel({
        messages,
        tools: [],
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.BALANCED },
        roundRobinSelector,
        max_tokens: 2000
      });

      expect(selection).toBeDefined();
      expect(selection.inputTokens).toBeGreaterThan(0);
    });

    test('should handle search + analysis workflow', () => {
      const messages = [
        { role: 'user', content: 'Search for recent AI breakthroughs and analyze the trends' }
      ];

      const tools = [
        { name: 'brave_search', description: 'Search the web' }
      ];

      const selection = selectModel({
        messages,
        tools,
        catalog,
        rateLimitTracker,
        preferences: { strategy: SelectionStrategy.BALANCED },
        roundRobinSelector,
        max_tokens: 4000
      });

      expect(selection).toBeDefined();
      expect(selection.analysis.type).toMatch(/COMPLEX|TOOL_HEAVY/);
    });
  });
});
