/**
 * Unit tests for pricing display functionality
 * Tests helper functions used to calculate and format pricing information
 */

describe('Pricing Display Functions', () => {
  // Mock pricing data matching ChatTab.tsx
  const mockPricing = {
    // Gemini models (free tier)
    'gemini-2.0-flash': { input: 0, output: 0 },
    'gemini-2.5-flash': { input: 0, output: 0 },
    'gemini-1.5-flash': { input: 0, output: 0 },
    // OpenAI models
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.150, output: 0.600 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    // Groq models (free tier)
    'llama-3.3-70b-versatile': { input: 0, output: 0 },
    'mixtral-8x7b-32768': { input: 0, output: 0 },
  };

  /**
   * Calculate cost from LLM API calls
   * Mirrors the function in ChatTab.tsx
   */
  const calculateCostFromLlmApiCalls = (llmApiCalls) => {
    if (!llmApiCalls || llmApiCalls.length === 0) return 0;
    
    let totalCost = 0;
    for (const call of llmApiCalls) {
      const model = call.model;
      const usage = call.response?.usage;
      if (!model || !usage) continue;

      const modelPricing = mockPricing[model] || { input: 0, output: 0 };
      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;

      const inputCost = (promptTokens / 1000000) * modelPricing.input;
      const outputCost = (completionTokens / 1000000) * modelPricing.output;
      totalCost += inputCost + outputCost;
    }

    return totalCost;
  };

  /**
   * Format cost for display
   * Mirrors the function in ChatTab.tsx
   */
  const formatCostDisplay = (cost) => {
    if (cost === 0) return '$0';
    if (cost < 0.0001) return '<$0.0001';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  };

  describe('calculateCostFromLlmApiCalls', () => {
    test('handles empty array', () => {
      expect(calculateCostFromLlmApiCalls([])).toBe(0);
    });

    test('handles null/undefined input', () => {
      expect(calculateCostFromLlmApiCalls(null)).toBe(0);
      expect(calculateCostFromLlmApiCalls(undefined)).toBe(0);
    });

    test('calculates GPT-4o cost correctly', () => {
      const calls = [{
        model: 'gpt-4o',
        response: { 
          usage: { 
            prompt_tokens: 1000, 
            completion_tokens: 500 
          } 
        }
      }];
      // (1000/1M * 2.50) + (500/1M * 10.00) = 0.0025 + 0.005 = 0.0075
      expect(calculateCostFromLlmApiCalls(calls)).toBeCloseTo(0.0075, 6);
    });

    test('calculates GPT-4o-mini cost correctly', () => {
      const calls = [{
        model: 'gpt-4o-mini',
        response: { 
          usage: { 
            prompt_tokens: 10000, 
            completion_tokens: 5000 
          } 
        }
      }];
      // (10000/1M * 0.150) + (5000/1M * 0.600) = 0.0015 + 0.003 = 0.0045
      expect(calculateCostFromLlmApiCalls(calls)).toBeCloseTo(0.0045, 6);
    });

    test('free models return $0', () => {
      const calls = [{
        model: 'gemini-2.0-flash',
        response: { 
          usage: { 
            prompt_tokens: 10000, 
            completion_tokens: 5000 
          } 
        }
      }];
      expect(calculateCostFromLlmApiCalls(calls)).toBe(0);
    });

    test('Groq models return $0', () => {
      const calls = [{
        model: 'llama-3.3-70b-versatile',
        response: { 
          usage: { 
            prompt_tokens: 5000, 
            completion_tokens: 2000 
          } 
        }
      }];
      expect(calculateCostFromLlmApiCalls(calls)).toBe(0);
    });

    test('aggregates costs from multiple calls', () => {
      const calls = [
        {
          model: 'gpt-4o',
          response: { 
            usage: { 
              prompt_tokens: 1000, 
              completion_tokens: 500 
            } 
          }
        },
        {
          model: 'gpt-4o-mini',
          response: { 
            usage: { 
              prompt_tokens: 2000, 
              completion_tokens: 1000 
            } 
          }
        }
      ];
      // GPT-4o: (1000/1M * 2.50) + (500/1M * 10.00) = 0.0075
      // GPT-4o-mini: (2000/1M * 0.150) + (1000/1M * 0.600) = 0.0009
      // Total: 0.0084
      expect(calculateCostFromLlmApiCalls(calls)).toBeCloseTo(0.0084, 6);
    });

    test('handles mixed free and paid models', () => {
      const calls = [
        {
          model: 'gemini-2.0-flash',
          response: { 
            usage: { 
              prompt_tokens: 5000, 
              completion_tokens: 2000 
            } 
          }
        },
        {
          model: 'gpt-4o',
          response: { 
            usage: { 
              prompt_tokens: 1000, 
              completion_tokens: 500 
            } 
          }
        }
      ];
      // Gemini: $0
      // GPT-4o: 0.0075
      // Total: 0.0075
      expect(calculateCostFromLlmApiCalls(calls)).toBeCloseTo(0.0075, 6);
    });

    test('handles missing usage data', () => {
      const calls = [
        {
          model: 'gpt-4o',
          response: { }
        }
      ];
      expect(calculateCostFromLlmApiCalls(calls)).toBe(0);
    });

    test('handles missing model', () => {
      const calls = [
        {
          response: { 
            usage: { 
              prompt_tokens: 1000, 
              completion_tokens: 500 
            } 
          }
        }
      ];
      expect(calculateCostFromLlmApiCalls(calls)).toBe(0);
    });

    test('handles unknown model (defaults to $0)', () => {
      const calls = [{
        model: 'unknown-model-xyz',
        response: { 
          usage: { 
            prompt_tokens: 1000, 
            completion_tokens: 500 
          } 
        }
      }];
      expect(calculateCostFromLlmApiCalls(calls)).toBe(0);
    });

    test('handles zero tokens', () => {
      const calls = [{
        model: 'gpt-4o',
        response: { 
          usage: { 
            prompt_tokens: 0, 
            completion_tokens: 0 
          } 
        }
      }];
      expect(calculateCostFromLlmApiCalls(calls)).toBe(0);
    });

    test('handles large token counts', () => {
      const calls = [{
        model: 'gpt-4o',
        response: { 
          usage: { 
            prompt_tokens: 100000, 
            completion_tokens: 50000 
          } 
        }
      }];
      // (100000/1M * 2.50) + (50000/1M * 10.00) = 0.25 + 0.50 = 0.75
      expect(calculateCostFromLlmApiCalls(calls)).toBeCloseTo(0.75, 6);
    });
  });

  describe('formatCostDisplay', () => {
    test('formats zero cost', () => {
      expect(formatCostDisplay(0)).toBe('$0');
    });

    test('formats very small costs', () => {
      expect(formatCostDisplay(0.00001)).toBe('<$0.0001');
      expect(formatCostDisplay(0.00005)).toBe('<$0.0001');
      expect(formatCostDisplay(0.00009)).toBe('<$0.0001');
    });

    test('formats small costs with 4 decimals', () => {
      expect(formatCostDisplay(0.0001)).toBe('$0.0001');
      expect(formatCostDisplay(0.0042)).toBe('$0.0042');
      expect(formatCostDisplay(0.0099)).toBe('$0.0099');
    });

    test('formats medium costs with 3 decimals', () => {
      expect(formatCostDisplay(0.01)).toBe('$0.010');
      expect(formatCostDisplay(0.15)).toBe('$0.150');
      expect(formatCostDisplay(0.999)).toBe('$0.999');
    });

    test('formats large costs with 2 decimals', () => {
      expect(formatCostDisplay(1.0)).toBe('$1.00');
      expect(formatCostDisplay(1.5)).toBe('$1.50');
      expect(formatCostDisplay(10.99)).toBe('$10.99');
      expect(formatCostDisplay(123.456)).toBe('$123.46');
    });

    test('handles negative costs (edge case)', () => {
      // While negative costs shouldn't happen in practice,
      // negative values still go through the <$0.0001 check first
      expect(formatCostDisplay(-0.5)).toBe('<$0.0001');
    });

    test('handles very large costs', () => {
      expect(formatCostDisplay(1000.00)).toBe('$1000.00');
      expect(formatCostDisplay(9999.99)).toBe('$9999.99');
    });
  });

  describe('Integration Tests', () => {
    test('real-world scenario: multiple GPT-4o calls', () => {
      const calls = [
        {
          model: 'gpt-4o',
          response: { usage: { prompt_tokens: 1500, completion_tokens: 800 } }
        },
        {
          model: 'gpt-4o',
          response: { usage: { prompt_tokens: 2000, completion_tokens: 1200 } }
        },
        {
          model: 'gpt-4o',
          response: { usage: { prompt_tokens: 500, completion_tokens: 300 } }
        }
      ];
      
      const cost = calculateCostFromLlmApiCalls(calls);
      const formatted = formatCostDisplay(cost);
      
      // Total: (4000/1M * 2.50) + (2300/1M * 10.00) = 0.01 + 0.023 = 0.033
      expect(cost).toBeCloseTo(0.033, 6);
      expect(formatted).toBe('$0.033');
    });

    test('real-world scenario: free models only', () => {
      const calls = [
        {
          model: 'gemini-2.0-flash',
          response: { usage: { prompt_tokens: 5000, completion_tokens: 3000 } }
        },
        {
          model: 'llama-3.3-70b-versatile',
          response: { usage: { prompt_tokens: 2000, completion_tokens: 1000 } }
        }
      ];
      
      const cost = calculateCostFromLlmApiCalls(calls);
      const formatted = formatCostDisplay(cost);
      
      expect(cost).toBe(0);
      expect(formatted).toBe('$0');
    });

    test('real-world scenario: mixed free and paid', () => {
      const calls = [
        {
          model: 'gemini-2.0-flash',
          response: { usage: { prompt_tokens: 10000, completion_tokens: 5000 } }
        },
        {
          model: 'gpt-4o-mini',
          response: { usage: { prompt_tokens: 1000, completion_tokens: 500 } }
        }
      ];
      
      const cost = calculateCostFromLlmApiCalls(calls);
      const formatted = formatCostDisplay(cost);
      
      // Gemini: $0
      // GPT-4o-mini: (1000/1M * 0.150) + (500/1M * 0.600) = 0.00045
      expect(cost).toBeCloseTo(0.00045, 6);
      expect(formatted).toBe('$0.0004'); // toFixed(4) doesn't round up from .00045
    });
  });
});
