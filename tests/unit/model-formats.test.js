/**
 * Unit tests for model-specific format translation
 * 
 * Tests the MODEL_FORMATS registry and cleaning functions for models
 * that generate non-standard output formats (e.g., Claude-style XML
 * syntax from gpt-oss models on Groq).
 */

const {
  MODEL_FORMATS,
  getModelFormat,
  requiresCleaning,
  cleanModelContent,
  cleanStreamingChunk,
  getModelsRequiringCleaning,
  registerModelFormat
} = require('../../src/model-formats');

describe('Model Format Registry', () => {
  describe('MODEL_FORMATS', () => {
    test('should include gpt-oss-20b configuration', () => {
      expect(MODEL_FORMATS['groq:openai/gpt-oss-20b']).toBeDefined();
      expect(MODEL_FORMATS['groq:openai/gpt-oss-20b'].requiresCleaning).toBe(true);
      expect(MODEL_FORMATS['groq:openai/gpt-oss-20b'].cleaningPatterns).toBeInstanceOf(Array);
      expect(MODEL_FORMATS['groq:openai/gpt-oss-20b'].cleaningPatterns.length).toBeGreaterThan(0);
    });

    test('should include gpt-oss-120b configuration', () => {
      expect(MODEL_FORMATS['groq:openai/gpt-oss-120b']).toBeDefined();
      expect(MODEL_FORMATS['groq:openai/gpt-oss-120b'].requiresCleaning).toBe(true);
      expect(MODEL_FORMATS['groq:openai/gpt-oss-120b'].cleaningPatterns).toBeInstanceOf(Array);
    });

    test('should have description for each model', () => {
      expect(MODEL_FORMATS['groq:openai/gpt-oss-20b'].description).toBeTruthy();
      expect(MODEL_FORMATS['groq:openai/gpt-oss-120b'].description).toBeTruthy();
    });
  });

  describe('getModelFormat', () => {
    test('should return format for gpt-oss models', () => {
      const format = getModelFormat('groq:openai/gpt-oss-20b');
      expect(format).toBeDefined();
      expect(format.requiresCleaning).toBe(true);
    });

    test('should return null for models without special formatting', () => {
      const format = getModelFormat('openai:gpt-4');
      expect(format).toBeNull();
    });

    test('should return null for undefined model', () => {
      const format = getModelFormat('nonexistent:model');
      expect(format).toBeNull();
    });
  });

  describe('requiresCleaning', () => {
    test('should return true for gpt-oss models', () => {
      expect(requiresCleaning('groq:openai/gpt-oss-20b')).toBe(true);
      expect(requiresCleaning('groq:openai/gpt-oss-120b')).toBe(true);
    });

    test('should return false for standard models', () => {
      expect(requiresCleaning('openai:gpt-4')).toBe(false);
      expect(requiresCleaning('groq:llama-3.1-70b-versatile')).toBe(false);
    });

    test('should return false for undefined model', () => {
      expect(requiresCleaning('nonexistent:model')).toBe(false);
    });
  });

  describe('getModelsRequiringCleaning', () => {
    test('should return array of models requiring cleaning', () => {
      const models = getModelsRequiringCleaning();
      expect(Array.isArray(models)).toBe(true);
      expect(models).toContain('groq:openai/gpt-oss-20b');
      expect(models).toContain('groq:openai/gpt-oss-120b');
    });

    test('should only return models with requiresCleaning: true', () => {
      const models = getModelsRequiringCleaning();
      models.forEach(model => {
        expect(MODEL_FORMATS[model].requiresCleaning).toBe(true);
      });
    });
  });
});

describe('Content Cleaning Functions', () => {
  describe('cleanModelContent', () => {
    test('should remove <function=name> tags', () => {
      const input = 'Let me search for that. <function=search_web>I will look it up.';
      const expected = 'Let me search for that. I will look it up.';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).toBe(expected);
    });

    test('should remove complete XML function calls', () => {
      const input = 'Here is the code: <execute_javascript>{"code": "console.log(\'hello\');"}</execute_javascript>';
      const expected = 'Here is the code:';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).toBe(expected);
    });

    test('should remove self-closing XML tags', () => {
      const input = 'Searching now <search_web query="AI news" />';
      const expected = 'Searching now';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).toBe(expected);
    });

    test('should remove JSON-like objects in XML', () => {
      const input = 'I will search: <function=search>{"query": "test"}</function> and show results.';
      const expected = 'I will search: and show results.';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).toBe(expected);
    });

    test('should handle multiple Claude-style tags in one message', () => {
      const input = 'First <function=search_web> then <execute_javascript>code</execute_javascript> and finally <scrape_url />';
      const expected = 'First then and finally';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).toBe(expected);
    });

    test('should clean up excessive whitespace after removing tags', () => {
      const input = 'Text before\n\n\n<function=search>\n\n\nText after';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).not.toMatch(/\n\n\n/); // Should not have 3+ newlines
    });

    test('should trim leading and trailing whitespace', () => {
      const input = '   <function=test>  Text with spaces  <function=test>   ';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).toBe('Text with spaces');
    });

    test('should return original content for models not requiring cleaning', () => {
      const input = 'This is <function=test> normal content';
      const result = cleanModelContent(input, 'openai:gpt-4');
      expect(result).toBe(input);
    });

    test('should handle empty strings', () => {
      const result = cleanModelContent('', 'groq:openai/gpt-oss-20b');
      expect(result).toBe('');
    });

    test('should handle null/undefined content', () => {
      expect(cleanModelContent(null, 'groq:openai/gpt-oss-20b')).toBeNull();
      expect(cleanModelContent(undefined, 'groq:openai/gpt-oss-20b')).toBeUndefined();
    });

    test('should preserve valid markdown and HTML', () => {
      const input = '# Heading\n\n**Bold text** and `code` with <strong>HTML</strong>';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).toBe(input);
    });

    test('should handle multiline XML function calls', () => {
      const input = `Let me execute this:
<execute_javascript>
{
  "code": "console.log('test');"
}
</execute_javascript>
Done!`;
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).not.toContain('<execute_javascript>');
      expect(result).toContain('Let me execute this:');
      expect(result).toContain('Done!');
    });
  });

  describe('cleanStreamingChunk', () => {
    test('should clean chunks with Claude syntax', () => {
      const chunk = '<function=search>';
      const result = cleanStreamingChunk(chunk, 'groq:openai/gpt-oss-20b');
      expect(result).toBe('');
    });

    test('should handle partial tags in streaming', () => {
      const chunk1 = 'Text before <funct';
      const chunk2 = 'ion=search> text after';
      // Note: In real streaming, partial tags might not be caught until complete
      // This test documents current behavior
      const result1 = cleanStreamingChunk(chunk1, 'groq:openai/gpt-oss-20b');
      const result2 = cleanStreamingChunk(chunk2, 'groq:openai/gpt-oss-20b');
      // First chunk stays as-is (partial tag)
      expect(result1).toBe(chunk1);
      // Second chunk might or might not clean depending on pattern matching
    });

    test('should return original chunk for models not requiring cleaning', () => {
      const chunk = '<function=test>';
      const result = cleanStreamingChunk(chunk, 'openai:gpt-4');
      expect(result).toBe(chunk);
    });

    test('should handle empty chunks', () => {
      const result = cleanStreamingChunk('', 'groq:openai/gpt-oss-20b');
      expect(result).toBe('');
    });

    test('should handle null/undefined chunks', () => {
      expect(cleanStreamingChunk(null, 'groq:openai/gpt-oss-20b')).toBeNull();
      expect(cleanStreamingChunk(undefined, 'groq:openai/gpt-oss-20b')).toBeUndefined();
    });
  });
});

describe('Dynamic Registration', () => {
  describe('registerModelFormat', () => {
    test('should allow registering new model format', () => {
      const config = {
        requiresCleaning: true,
        cleaningPatterns: [/<test>/g],
        description: 'Test model'
      };
      
      registerModelFormat('test:model', config);
      
      expect(MODEL_FORMATS['test:model']).toBeDefined();
      expect(requiresCleaning('test:model')).toBe(true);
    });

    test('should throw error if model is missing', () => {
      expect(() => {
        registerModelFormat(null, { requiresCleaning: true, cleaningPatterns: [] });
      }).toThrow();
    });

    test('should throw error if config is missing', () => {
      expect(() => {
        registerModelFormat('test:model', null);
      }).toThrow();
    });

    test('should throw error if requiresCleaning is not boolean', () => {
      expect(() => {
        registerModelFormat('test:model', {
          requiresCleaning: 'yes',
          cleaningPatterns: []
        });
      }).toThrow('requiresCleaning must be a boolean');
    });

    test('should throw error if cleaningPatterns is not array', () => {
      expect(() => {
        registerModelFormat('test:model', {
          requiresCleaning: true,
          cleaningPatterns: 'not an array'
        });
      }).toThrow('cleaningPatterns must be an array');
    });

    test('should allow overriding existing model format', () => {
      const originalConfig = MODEL_FORMATS['groq:openai/gpt-oss-20b'];
      const newConfig = {
        requiresCleaning: false,
        cleaningPatterns: [],
        description: 'Updated'
      };
      
      registerModelFormat('groq:openai/gpt-oss-20b', newConfig);
      expect(MODEL_FORMATS['groq:openai/gpt-oss-20b'].requiresCleaning).toBe(false);
      
      // Restore original
      registerModelFormat('groq:openai/gpt-oss-20b', originalConfig);
    });
  });
});

describe('Real-World Scenarios', () => {
  describe('Claude syntax patterns from gpt-oss models', () => {
    test('should clean typical search web pattern', () => {
      const input = 'I will search for that information. <function=search_web>';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-120b');
      expect(result).toBe('I will search for that information.');
    });

    test('should clean typical execute javascript pattern', () => {
      const input = 'Let me calculate that. <execute_javascript>{"code": "return 2 + 2;"}</execute_javascript>';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-120b');
      expect(result).toBe('Let me calculate that.');
    });

    test('should clean typical scrape url pattern', () => {
      const input = 'I will fetch that page. <scrape_url url="https://example.com" />';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-120b');
      expect(result).toBe('I will fetch that page.');
    });

    test('should handle mixed valid content with Claude syntax', () => {
      const input = `Based on your request, I will perform the following steps:

1. Search for recent news <function=search_web>
2. Analyze the results
3. Generate a summary

Let me start now.`;
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-120b');
      expect(result).toContain('Based on your request');
      expect(result).toContain('1. Search for recent news');
      expect(result).toContain('2. Analyze the results');
      expect(result).not.toContain('<function=search_web>');
    });

    test('should preserve actual tool call responses (JSON)', () => {
      // Tool results are separate from message content, so they shouldn't be affected
      const toolResult = '{"results": [{"url": "https://example.com"}]}';
      const result = cleanModelContent(toolResult, 'groq:openai/gpt-oss-120b');
      expect(result).toBe(toolResult);
    });
  });

  describe('Edge cases and corner cases', () => {
    test('should handle malformed XML tags', () => {
      const input = 'Text <function=test Text after';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      // Malformed tags should be handled gracefully (cleaned or left as-is)
      expect(result).toBeTruthy();
    });

    test('should handle nested tags', () => {
      const input = '<execute_javascript><function=search_web>nested</function></execute_javascript>';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).toBe('');
    });

    test('should handle tags with special characters', () => {
      const input = '<function=search_web query="test & test">';
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      expect(result).toBe('');
    });

    test('should handle very long content efficiently', () => {
      const longText = 'Normal text. '.repeat(10000);
      const input = longText + '<function=test>' + longText;
      const start = Date.now();
      const result = cleanModelContent(input, 'groq:openai/gpt-oss-20b');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // Should be fast (< 100ms)
      expect(result).not.toContain('<function=test>');
    });
  });
});
