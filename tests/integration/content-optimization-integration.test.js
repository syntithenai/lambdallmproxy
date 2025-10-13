/**
 * Integration Tests for Content Optimization System
 * 
 * Tests how content optimizer dynamically adjusts max_tokens, search results,
 * and content length based on model capabilities, user preferences, and request
 * complexity.
 * 
 * Pattern: Pure logic only - no AWS SDK, no HTTP clients at module load.
 */

const {
  getOptimalMaxTokens,
  getOptimalSearchResultCount,
  getOptimalContentLength,
  getOptimizationSummary
} = require('../../src/utils/content-optimizer');

describe('Content Optimization Integration Tests', () => {
  
  describe('Max Tokens Optimization', () => {
    const mockModel = {
      name: 'gpt-4',
      maxOutput: 16384,
      context_window: 128000
    };

    test('should optimize for cost (cheap setting)', () => {
      const result = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'cheap',
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      expect(result).toBeLessThan(2048); // Should be conservative
      expect(result).toBeGreaterThan(0);
    });

    test('should optimize for quality (powerful setting)', () => {
      const result = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'powerful',
        requestType: 'COMPLEX',
        inputTokens: 1000
      });

      expect(result).toBeGreaterThan(8000); // Should allow longer responses
      expect(result).toBeLessThanOrEqual(mockModel.maxOutput);
    });

    test('should optimize for speed (fastest setting)', () => {
      const result = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'fastest',
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      expect(result).toBeLessThan(2048); // Should be relatively short
      expect(result).toBeGreaterThan(0);
    });

    test('should provide balanced defaults', () => {
      const result = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      expect(result).toBeGreaterThan(1000);
      expect(result).toBeLessThan(5000);
    });
  });

  describe('Request Type Adaptation', () => {
    const mockModel = {
      maxOutput: 16384,
      context_window: 128000
    };

    test('should allocate appropriate tokens for simple requests', () => {
      const simple = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'SIMPLE',
        inputTokens: 500
      });

      expect(simple).toBeLessThan(4000);
    });

    test('should allocate more tokens for complex requests', () => {
      const complex = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'COMPLEX',
        inputTokens: 500
      });

      const simple = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'SIMPLE',
        inputTokens: 500
      });

      expect(complex).toBeGreaterThan(simple);
    });

    test('should allocate maximum tokens for reasoning requests', () => {
      const reasoning = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'REASONING',
        inputTokens: 1000
      });

      expect(reasoning).toBeGreaterThan(12000); // Should be very generous
    });

    test('should handle tool-heavy requests appropriately', () => {
      const toolHeavy = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'TOOL_HEAVY',
        inputTokens: 2000
      });

      expect(toolHeavy).toBeGreaterThan(2000);
      expect(toolHeavy).toBeLessThan(10000);
    });

    test('should handle creative content generation', () => {
      const creative = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'CREATIVE',
        inputTokens: 1000
      });

      expect(creative).toBeGreaterThan(4000); // Creative needs space
    });
  });

  describe('Model Capability Constraints', () => {
    test('should respect model max output limits', () => {
      const limitedModel = {
        name: 'small-model',
        maxOutput: 2048,
        context_window: 8192
      };

      const result = getOptimalMaxTokens({
        model: limitedModel,
        optimization: 'powerful',
        requestType: 'COMPLEX',
        inputTokens: 500
      });

      // Should not exceed model's max output
      expect(result).toBeLessThanOrEqual(limitedModel.maxOutput);
    });

    test('should respect context window constraints', () => {
      const model = {
        maxOutput: 16384,
        context_window: 8192
      };

      const result = getOptimalMaxTokens({
        model: model,
        optimization: 'balanced',
        requestType: 'SIMPLE',
        inputTokens: 6000 // Large input
      });

      // Should leave room for input
      expect(result).toBeLessThan(model.context_window - 6000);
    });

    test('should handle models with very small context windows', () => {
      const tinyModel = {
        maxOutput: 512,
        context_window: 2048
      };

      const result = getOptimalMaxTokens({
        model: tinyModel,
        optimization: 'powerful',
        requestType: 'COMPLEX',
        inputTokens: 1000
      });

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(tinyModel.maxOutput);
    });

    test('should provide safe defaults when model info missing', () => {
      const result = getOptimalMaxTokens({
        model: null,
        optimization: 'balanced',
        requestType: 'SIMPLE'
      });

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10000); // Reasonable default
    });
  });

  describe('Search Result Optimization', () => {
    test('should optimize search results for cheap setting', () => {
      const count = getOptimalSearchResultCount({
        optimization: 'cheap',
        requestComplexity: 'SIMPLE'
      });

      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10); // Conservative
    });

    test('should allow more results for powerful setting', () => {
      const cheap = getOptimalSearchResultCount({
        optimization: 'cheap',
        requestComplexity: 'COMPLEX'
      });

      const powerful = getOptimalSearchResultCount({
        optimization: 'powerful',
        requestComplexity: 'COMPLEX'
      });

      expect(powerful).toBeGreaterThanOrEqual(cheap);
    });

    test('should adapt to request complexity', () => {
      const simple = getOptimalSearchResultCount({
        optimization: 'balanced',
        requestComplexity: 'SIMPLE'
      });

      const complex = getOptimalSearchResultCount({
        optimization: 'balanced',
        requestComplexity: 'COMPLEX'
      });

      expect(complex).toBeGreaterThanOrEqual(simple);
    });

    test('should return reasonable defaults', () => {
      const count = getOptimalSearchResultCount({});
      
      expect(count).toBeGreaterThan(2);
      expect(count).toBeLessThan(20);
    });
  });

  describe('Content Length Optimization', () => {
    test('should optimize content length for cheap setting', () => {
      const length = getOptimalContentLength({
        optimization: 'cheap',
        contentType: 'article'
      });

      expect(length).toBeGreaterThan(1000);
      expect(length).toBeLessThan(15000); // Conservative
    });

    test('should allow longer content for powerful setting', () => {
      const cheap = getOptimalContentLength({
        optimization: 'cheap',
        contentType: 'article'
      });

      const powerful = getOptimalContentLength({
        optimization: 'powerful',
        contentType: 'article'
      });

      expect(powerful).toBeGreaterThanOrEqual(cheap);
    });

    test('should adapt to content type', () => {
      const snippet = getOptimalContentLength({
        optimization: 'balanced',
        contentType: 'snippet'
      });

      const article = getOptimalContentLength({
        optimization: 'balanced',
        contentType: 'article'
      });

      const documentation = getOptimalContentLength({
        optimization: 'balanced',
        contentType: 'documentation'
      });

      // Different content types should have different optimal lengths
      expect(snippet).toBeGreaterThan(0);
      expect(article).toBeGreaterThan(0);
      expect(documentation).toBeGreaterThan(0);
      
      // Snippet should be shortest
      expect(snippet).toBeLessThanOrEqual(Math.max(article, documentation));
    });

    test('should return reasonable defaults', () => {
      const length = getOptimalContentLength({});
      
      expect(length).toBeGreaterThan(1000);
      expect(length).toBeLessThan(50000);
    });
  });

  describe('Optimization Summary', () => {
    test('should provide comprehensive optimization summary', () => {
      const mockModel = {
        name: 'gpt-4',
        maxOutput: 16384,
        context_window: 128000
      };

      const summary = getOptimizationSummary({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'COMPLEX',
        inputTokens: 2000
      });

      expect(summary).toBeDefined();
      expect(summary.maxTokens).toBeDefined();
      expect(summary.searchResults).toBeDefined();
      expect(summary.contentLength).toBeDefined();
    });

    test('should summarize cheap optimization strategy', () => {
      const mockModel = {
        name: 'gpt-3.5-turbo',
        maxOutput: 4096,
        context_window: 16385
      };

      const summary = getOptimizationSummary({
        model: mockModel,
        optimization: 'cheap',
        requestType: 'SIMPLE',
        inputTokens: 500
      });

      // Cheap should have conservative values
      expect(summary.maxTokens).toBeLessThan(3000);
      expect(summary.searchResults).toBeLessThan(10);
      expect(summary.contentLength).toBeLessThan(15000);
    });

    test('should summarize powerful optimization strategy', () => {
      const mockModel = {
        name: 'gpt-4',
        maxOutput: 16384,
        context_window: 128000
      };

      const summary = getOptimizationSummary({
        model: mockModel,
        optimization: 'powerful',
        requestType: 'REASONING',
        inputTokens: 1000
      });

      // Powerful should have generous values
      expect(summary.maxTokens).toBeGreaterThan(10000);
      expect(summary.searchResults).toBeGreaterThanOrEqual(5);
      expect(summary.contentLength).toBeGreaterThan(15000);
    });
  });

  describe('Optimization Trade-offs', () => {
    const mockModel = {
      name: 'gpt-4',
      maxOutput: 16384,
      context_window: 128000
    };

    test('cheap vs powerful trade-off for simple requests', () => {
      const cheap = getOptimizationSummary({
        model: mockModel,
        optimization: 'cheap',
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      const powerful = getOptimizationSummary({
        model: mockModel,
        optimization: 'powerful',
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      // Powerful should use more resources across the board
      expect(powerful.maxTokens).toBeGreaterThan(cheap.maxTokens);
      expect(powerful.searchResults).toBeGreaterThanOrEqual(cheap.searchResults);
      expect(powerful.contentLength).toBeGreaterThan(cheap.contentLength);
    });

    test('simple vs complex request trade-off', () => {
      const simple = getOptimizationSummary({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      const complex = getOptimizationSummary({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'COMPLEX',
        inputTokens: 1000
      });

      // Complex requests should get more resources
      expect(complex.maxTokens).toBeGreaterThan(simple.maxTokens);
    });

    test('fastest vs powerful trade-off', () => {
      const fastest = getOptimizationSummary({
        model: mockModel,
        optimization: 'fastest',
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      const powerful = getOptimizationSummary({
        model: mockModel,
        optimization: 'powerful',
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      // Fastest should use less to improve speed
      expect(fastest.maxTokens).toBeLessThan(powerful.maxTokens);
    });
  });

  describe('Edge Cases and Robustness', () => {
    test('should handle missing optimization parameter', () => {
      const mockModel = {
        maxOutput: 4096,
        context_window: 16384
      };

      const result = getOptimalMaxTokens({
        model: mockModel,
        // optimization missing
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(mockModel.maxOutput);
    });

    test('should handle missing request type', () => {
      const mockModel = {
        maxOutput: 4096,
        context_window: 16384
      };

      const result = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        // requestType missing
        inputTokens: 1000
      });

      expect(result).toBeGreaterThan(0);
    });

    test('should handle invalid optimization values', () => {
      const mockModel = {
        maxOutput: 4096,
        context_window: 16384
      };

      const result = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'invalid-value',
        requestType: 'SIMPLE',
        inputTokens: 1000
      });

      // Should fall back to default behavior
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(mockModel.maxOutput);
    });

    test('should handle very large input tokens', () => {
      const mockModel = {
        maxOutput: 4096,
        context_window: 8192
      };

      const result = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'SIMPLE',
        inputTokens: 7000 // Almost fills context window
      });

      // Should still return valid value
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(2000);
    });

    test('should handle negative or zero input tokens', () => {
      const mockModel = {
        maxOutput: 4096,
        context_window: 16384
      };

      const negative = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'SIMPLE',
        inputTokens: -100
      });

      const zero = getOptimalMaxTokens({
        model: mockModel,
        optimization: 'balanced',
        requestType: 'SIMPLE',
        inputTokens: 0
      });

      expect(negative).toBeGreaterThan(0);
      expect(zero).toBeGreaterThan(0);
    });

    test('should handle models with missing or invalid properties', () => {
      const incompleteModels = [
        {},
        { name: 'model' },
        { maxOutput: 4096 },
        { context_window: 16384 },
        null,
        undefined
      ];

      incompleteModels.forEach(model => {
        const result = getOptimalMaxTokens({
          model,
          optimization: 'balanced',
          requestType: 'SIMPLE',
          inputTokens: 1000
        });

        expect(result).toBeGreaterThan(0);
      });
    });
  });

  describe('Optimization Consistency', () => {
    const mockModel = {
      name: 'gpt-4',
      maxOutput: 16384,
      context_window: 128000
    };

    test('should produce consistent results for same inputs', () => {
      const options = {
        model: mockModel,
        optimization: 'balanced',
        requestType: 'COMPLEX',
        inputTokens: 2000
      };

      const result1 = getOptimalMaxTokens(options);
      const result2 = getOptimalMaxTokens(options);

      expect(result1).toBe(result2);
    });

    test('should scale predictably with optimization levels', () => {
      const optimizations = ['cheap', 'balanced', 'powerful'];
      const results = optimizations.map(opt => 
        getOptimalMaxTokens({
          model: mockModel,
          optimization: opt,
          requestType: 'SIMPLE',
          inputTokens: 1000
        })
      );

      // Should be monotonically increasing
      expect(results[0]).toBeLessThan(results[1]); // cheap < balanced
      expect(results[1]).toBeLessThan(results[2]); // balanced < powerful
    });

    test('should scale predictably with request complexity', () => {
      const types = ['SIMPLE', 'COMPLEX', 'REASONING'];
      const results = types.map(type => 
        getOptimalMaxTokens({
          model: mockModel,
          optimization: 'balanced',
          requestType: type,
          inputTokens: 1000
        })
      );

      // Should be monotonically increasing
      expect(results[0]).toBeLessThan(results[1]); // SIMPLE < COMPLEX
      expect(results[1]).toBeLessThan(results[2]); // COMPLEX < REASONING
    });
  });
});
