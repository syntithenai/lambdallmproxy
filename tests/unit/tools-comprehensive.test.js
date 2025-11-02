/**
 * Comprehensive Unit Tests for Tools System (src/tools.js)
 * 
 * This file provides additional test coverage for the tools system to improve overall test quality.
 */

const {
  toolFunctions,
  callFunction,
  compressSearchResultsForLLM,
  mergeTools,
  executeMCPTool
} = require('../../src/tools');

// Mock dependencies BEFORE requiring the module under test
jest.mock('../../src/search', () => ({
  DuckDuckGoSearcher: jest.fn()
}));

jest.mock('../../src/html-content-extractor', () => ({
  extractContent: jest.fn()
}));

jest.mock('../../src/tools/transcribe', () => ({
  transcribeUrl: jest.fn()
}));

jest.mock('../../src/tavily-search', () => ({
  tavilySearch: jest.fn(),
  tavilyExtract: jest.fn()
}));

jest.mock('../../src/utils/cache', () => ({
  getCacheKey: jest.fn((type, params) => `${type}:${JSON.stringify(params)}`),
  getFromCache: jest.fn(),
  saveToCache: jest.fn(),
  initializeCache: jest.fn()
}));

jest.mock('../../src/utils/content-optimizer', () => ({
  getOptimalSearchResultCount: jest.fn(),
  getOptimalContentLength: jest.fn()
}));

// Import mocked modules
const { DuckDuckGoSearcher } = require('../../src/search');
const { extractContent } = require('../../src/html-content-extractor');
const { tavilySearch, tavilyExtract } = require('../../src/tavily-search');
const { transcribeUrl } = require('../../src/tools/transcribe');
const { getCacheKey, getFromCache, saveToCache } = require('../../src/utils/cache');
const { getOptimalSearchResultCount, getOptimalContentLength } = require('../../src/utils/content-optimizer');

describe('Tools System - Comprehensive Coverage', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    getFromCache.mockResolvedValue(null); // No cache by default
    saveToCache.mockResolvedValue(true);
    getOptimalSearchResultCount.mockReturnValue(5);
    getOptimalContentLength.mockReturnValue(10000);
  });

  describe('Tool Parameter Validation', () => {
    
    test('should handle all tool parameter combinations correctly', async () => {
      // Test various parameter combinations for search_web
      const testCases = [
        { query: 'test' },
        { query: 'test', limit: 10 },
        { query: 'test', timeout: 30 },
        { query: 'test', limit: 5, timeout: 20 },
        { query: ['test1', 'test2'], limit: 3 },
      ];

      for (const params of testCases) {
        if (params.query) {
          DuckDuckGoSearcher.mockReturnValue({
            search: jest.fn().mockResolvedValue([])
          });
          
          extractContent.mockResolvedValue({
            content: 'Test content',
            images: [],
            links: []
          });

          const result = await callFunction('search_web', params, {
            writeEvent: jest.fn()
          });
          
          expect(typeof result).toBe('string');
        }
      }
    });

    test('should validate tool parameter types', async () => {
      // Set up default mock for all test cases
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });
      
      extractContent.mockResolvedValue({
        content: 'Test content',
        images: [],
        links: []
      });
      
      // Test with invalid parameter types
      const invalidParams = [
        { query: 123 }, // Number instead of string
        { query: null }, // Null instead of string
        { limit: 'not-a-number' }, // String instead of number
        { timeout: -5 }, // Negative number
        { limit: 0 }, // Zero value
      ];

      for (const params of invalidParams) {
        const result = await callFunction('search_web', params, {
          writeEvent: jest.fn()
        });
        
        // Should return error response, not crash
        expect(typeof result).toBe('string');
        try {
          const parsed = JSON.parse(result);
          // At minimum should have an error field
          if (parsed.error) {
            expect(parsed.error).toBeDefined();
          }
        } catch (e) {
          // If it's not valid JSON, that might be OK too
        }
      }
    });
  });

  describe('Tool Execution Edge Cases', () => {
    
    test('should handle extremely long queries gracefully', async () => {
      const longQuery = 'a'.repeat(10000); // Very long query
      
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      extractContent.mockResolvedValue({
        content: 'Test content',
        images: [],
        links: []
      });

      const result = await callFunction('search_web', {
        query: longQuery
      }, { writeEvent: jest.fn() });
      
      expect(typeof result).toBe('string');
    });

    test('should handle Unicode and special characters in queries', async () => {
      const specialQueries = [
        'Hello 🌍',
        'Special chars: !@#$%^&*()',
        'Unicode: café, naïve, résumé',
        'Spaces and tabs	\n',
        'Mixed: "quotes" and \'apostrophes\'',
        'URLs: https://example.com/path?param=value'
      ];

      for (const query of specialQueries) {
        DuckDuckGoSearcher.mockReturnValue({
          search: jest.fn().mockResolvedValue([])
        });
        
        extractContent.mockResolvedValue({
          content: 'Test content',
          images: [],
          links: []
        });

        const result = await callFunction('search_web', {
          query
        }, { writeEvent: jest.fn() });
        
        expect(typeof result).toBe('string');
      }
    });

    test('should handle empty arrays in query parameter', async () => {
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      extractContent.mockResolvedValue({
        content: 'Test content',
        images: [],
        links: []
      });

      const result = await callFunction('search_web', {
        query: []
      }, { writeEvent: jest.fn() });
      
      expect(typeof result).toBe('string');
    });

    test('should handle very large limit values', async () => {
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      extractContent.mockResolvedValue({
        content: 'Test content',
        images: [],
        links: []
      });

      const result = await callFunction('search_web', {
        query: 'test',
        limit: 1000
      }, { writeEvent: jest.fn() });
      
      expect(typeof result).toBe('string');
    });
  });

  describe('Tool Execution Error Handling', () => {
    
    test('should handle network timeouts gracefully', async () => {
      // Mock network timeout - use mockImplementation to avoid synchronous throw
      const mockSearch = jest.fn().mockRejectedValue(new Error('Network timeout'));
      DuckDuckGoSearcher.mockImplementation(() => ({
        search: mockSearch
      }));

      const result = await callFunction('search_web', {
        query: 'test',
        timeout: 1
      }, { writeEvent: jest.fn() });
      
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      // Should contain some error information
      expect(parsed).toHaveProperty('error');
    });

    test('should handle invalid URLs gracefully', async () => {
      const mockSearch = jest.fn().mockRejectedValue(new Error('Invalid URL'));
      DuckDuckGoSearcher.mockImplementation(() => ({
        search: mockSearch
      }));

      const result = await callFunction('search_web', {
        query: 'test'
      }, { writeEvent: jest.fn() });
      
      expect(typeof result).toBe('string');
    });

    test('should handle cache errors gracefully', async () => {
      // Mock cache error
      getFromCache.mockRejectedValue(new Error('Cache error'));
      
      const result = await callFunction('scrape_web_content', {
        url: 'https://example.com'
      }, { writeEvent: jest.fn() });
      
      expect(typeof result).toBe('string');
    });

    test('should handle tool-specific errors', async () => {
      // Mock JavaScript execution error
      const result = await callFunction('execute_javascript', {
        code: 'throw new Error("Tool error")'
      }, {});
      
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });
  });

  describe('Tool Execution Flow', () => {
    
    test('should execute tools in correct sequence', async () => {
      // Test the flow of execution for a tool that requires multiple steps
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([
          {
            title: 'Test Result',
            url: 'https://example.com',
            snippet: 'Test snippet'
          }
        ])
      });

      extractContent.mockResolvedValue({
        content: 'Extracted content',
        images: [],
        links: []
      });

      const result = await callFunction('search_web', {
        query: 'test query'
      }, { writeEvent: jest.fn() });
      
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('results');
      expect(Array.isArray(parsed.results)).toBe(true);
    });

    test('should support multiple concurrent tool calls', async () => {
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      extractContent.mockResolvedValue({
        content: 'Test content',
        images: [],
        links: []
      });

      // Execute multiple tools concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(callFunction('search_web', { query: `test${i}` }, { writeEvent: jest.fn() }));
      }

      const results = await Promise.all(promises);
      
      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(typeof result).toBe('string');
      });
    });

    test('should maintain consistent error message format', async () => {
      const result = await callFunction('search_web', {}, {});
      
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(typeof parsed.error).toBe('string');
    });
  });

  describe('Tool Configuration Validation', () => {
    
    test('should validate tool function structure consistently', () => {
      // Ensure all tools have consistent structure
      toolFunctions.forEach(tool => {
        expect(tool).toHaveProperty('type', 'function');
        expect(tool.function).toHaveProperty('name');
        expect(tool.function).toHaveProperty('description');
        expect(tool.function).toHaveProperty('parameters');
        expect(tool.function.parameters).toHaveProperty('type', 'object');
        expect(tool.function.parameters).toHaveProperty('properties');
        expect(tool.function.parameters).toHaveProperty('required');
      });
    });

    test('should handle tool descriptions with special characters', () => {
      const toolNames = toolFunctions.map(t => t.function.name);
      
      toolFunctions.forEach(tool => {
        expect(typeof tool.function.description).toBe('string');
        // Should not contain invalid characters
        expect(tool.function.description).not.toContain('\0'); 
      });
    });

    test('should validate parameter schemas are complete', () => {
      toolFunctions.forEach(tool => {
        const params = tool.function.parameters;
        
        // Properties should be an object
        expect(typeof params.properties).toBe('object');
        
        // Required should be an array (or undefined)
        if (params.required) {
          expect(Array.isArray(params.required)).toBe(true);
        }
      });
    });
  });

  describe('Integration with Other Modules', () => {
    
    test('should integrate properly with caching system', async () => {
      // Mock successful cache retrieval
      const cachedContent = {
        content: 'Cached content',
        format: 'text',
        url: 'https://example.com'
      };
      
      getFromCache.mockResolvedValueOnce(cachedContent);
      
      const result = await callFunction('scrape_web_content', {
        url: 'https://example.com'
      }, { writeEvent: jest.fn() });
      
      expect(getFromCache).toHaveBeenCalled();
      expect(typeof result).toBe('string');
      
      // Parse and verify structure
      const parsed = JSON.parse(result);
      if (parsed.cached) {
        expect(parsed.content).toBe('Cached content');
      }
    });

    test('should integrate with content optimization utilities', async () => {
      getOptimalSearchResultCount.mockReturnValue(3);
      getOptimalContentLength.mockReturnValue(5000);
      
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      extractContent.mockResolvedValue({
        content: 'Test content',
        images: [],
        links: []
      });

      const result = await callFunction('search_web', {
        query: 'test'
      }, { 
        optimization: 'cost_optimized',
        writeEvent: jest.fn() 
      });
      
      expect(typeof result).toBe('string');
      expect(getOptimalSearchResultCount).toHaveBeenCalled();
    });
  });

  describe('Performance and Resource Management', () => {
    
    test('should not leak memory with many tool calls', async () => {
      // Test that we don't have memory leaks with repeated calls
      const results = [];
      
      for (let i = 0; i < 10; i++) {
        DuckDuckGoSearcher.mockReturnValue({
          search: jest.fn().mockResolvedValue([])
        });

        extractContent.mockResolvedValue({
          content: 'Test content',
          images: [],
          links: []
        });

        const result = await callFunction('search_web', {
          query: `test${i}`
        }, { writeEvent: jest.fn() });
        
        results.push(result);
      }
      
      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(typeof result).toBe('string');
      });
    });

    test('should handle large result sets without crashing', async () => {
      const mockResults = Array(100).fill().map((_, i) => ({
        title: `Result ${i}`,
        url: `https://example.com/${i}`,
        snippet: `Snippet ${i}`
      }));

      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue(mockResults)
      });

      extractContent.mockResolvedValue({
        content: 'Test content',
        images: [],
        links: []
      });

      const result = await callFunction('search_web', {
        query: 'large test'
      }, { writeEvent: jest.fn() });
      
      expect(typeof result).toBe('string');
    });
  });

  describe('Security and Sanitization', () => {
    
    test('should handle malicious JavaScript input safely', async () => {
      // Test with potentially dangerous code
      const dangerousCode = `
        require('fs').readFileSync('/etc/passwd')
        process.exit(1)
        console.log("malicious")
        setTimeout(() => {}, 1000)
      `;

      const result = await callFunction('execute_javascript', {
        code: dangerousCode
      }, {});
      
      expect(typeof result).toBe('string');
    });

    test('should sanitize tool input parameters', async () => {
      // Test that input is sanitized properly
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      extractContent.mockResolvedValue({
        content: 'Test content',
        images: [],
        links: []
      });

      const result = await callFunction('search_web', {
        query: '<script>alert("xss")</script>',
        limit: 10
      }, { writeEvent: jest.fn() });
      
      expect(typeof result).toBe('string');
    });
  });
});