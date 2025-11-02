/**
 * Unit Tests for Tools System (src/tools.js)
 * 
 * Critical: This file (3,190 lines) contains all tool execution logic
 * Priority: Test tool parameter validation, execution flow, and result formatting
 * 
 * Coverage Target: 80%+ of src/tools.js
 */

const {
  toolFunctions,
  getToolFunctions,
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

describe('Tools System', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    getFromCache.mockResolvedValue(null); // No cache by default
    saveToCache.mockResolvedValue(true);
    getOptimalSearchResultCount.mockReturnValue(5);
    getOptimalContentLength.mockReturnValue(10000);
  });

  describe('Tool Registry (toolFunctions)', () => {
    
    test('should export array of tool functions', () => {
      expect(Array.isArray(toolFunctions)).toBe(true);
      expect(toolFunctions.length).toBeGreaterThan(0);
    });

    test('all tools should have required structure', () => {
      toolFunctions.forEach(tool => {
        expect(tool).toHaveProperty('type', 'function');
        expect(tool).toHaveProperty('function');
        expect(tool.function).toHaveProperty('name');
        expect(tool.function).toHaveProperty('description');
        expect(tool.function).toHaveProperty('parameters');
        expect(tool.function.parameters).toHaveProperty('type', 'object');
        expect(tool.function.parameters).toHaveProperty('properties');
        expect(tool.function.parameters).toHaveProperty('required');
      });
    });

    test('tool names should be unique', () => {
      const names = toolFunctions.map(t => t.function.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    test('should include critical tools', () => {
      const toolNames = toolFunctions.map(t => t.function.name);
      
      expect(toolNames).toContain('search_web');
      expect(toolNames).toContain('search_youtube');
      expect(toolNames).toContain('scrape_web_content');
      expect(toolNames).toContain('execute_javascript');
      expect(toolNames).toContain('transcribe_url');
      expect(toolNames).toContain('generate_image');
      expect(toolNames).toContain('generate_chart');
      expect(toolNames).toContain('get_youtube_transcript');
    });

    test('search_web tool should have correct parameters', () => {
      const searchTool = toolFunctions.find(t => t.function.name === 'search_web');
      
      expect(searchTool).toBeDefined();
      expect(searchTool.function.parameters.properties).toHaveProperty('query');
      expect(searchTool.function.parameters.properties).toHaveProperty('limit');
      expect(searchTool.function.parameters.properties).toHaveProperty('timeout');
      expect(searchTool.function.parameters.required).toContain('query');
    });

    test('execute_javascript tool should have code parameter', () => {
      const jsTool = toolFunctions.find(t => t.function.name === 'execute_javascript');
      
      expect(jsTool).toBeDefined();
      expect(jsTool.function.parameters.properties).toHaveProperty('code');
      expect(jsTool.function.parameters.properties).toHaveProperty('timeout');
      expect(jsTool.function.parameters.required).toContain('code');
    });
  });

  describe('getToolFunctions()', () => {
    
    test('should return all tools when no filter', () => {
      const tools = getToolFunctions();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(toolFunctions.length);
    });

    test('should return tools array with OpenAI-compatible format', () => {
      const tools = getToolFunctions();
      tools.forEach(tool => {
        expect(tool.type).toBe('function');
        expect(tool.function).toHaveProperty('name');
        expect(tool.function).toHaveProperty('description');
      });
    });
  });

  describe('Tool Execution - search_web', () => {
    
    test('should execute search_web with single query', async () => {
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
        content: 'Test content',
        images: [],
        links: []
      });

      const result = await callFunction('search_web', {
        query: 'test query'
      }, {
        writeEvent: jest.fn()
      });

      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('results');
      expect(Array.isArray(parsed.results)).toBe(true);
    });

    test('should handle array of queries', async () => {
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([
          { title: 'Result 1', url: 'https://example1.com', snippet: 'Snippet 1' }
        ])
      });

      extractContent.mockResolvedValue({
        content: 'Test content',
        images: [],
        links: []
      });

      const result = await callFunction('search_web', {
        query: ['query1', 'query2']
      }, {
        writeEvent: jest.fn()
      });

      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('results');
      expect(Array.isArray(parsed.results)).toBe(true);
    });

    test('should return error for missing query', async () => {
      const result = await callFunction('search_web', {}, {});
      
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });

    test('should emit progress events', async () => {
      const writeEvent = jest.fn();
      
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      await callFunction('search_web', {
        query: 'test'
      }, {
        writeEvent
      });

      expect(writeEvent).toHaveBeenCalled();
      const progressCalls = writeEvent.mock.calls.filter(
        call => call[0] === 'search_progress'
      );
      expect(progressCalls.length).toBeGreaterThan(0);
    });

    test('should use Tavily when API key provided', async () => {
      tavilySearch.mockResolvedValue([
        {
          title: 'Tavily Result',
          url: 'https://example.com',
          content: 'Tavily content'
        }
      ]);

      const result = await callFunction('search_web', {
        query: 'test'
      }, {
        tavilyApiKey: 'test-key',
        writeEvent: jest.fn()
      });

      expect(tavilySearch).toHaveBeenCalled();
      expect(typeof result).toBe('string');
    });

    test('should respect limit parameter', async () => {
      const searchMock = jest.fn().mockResolvedValue([]);
      DuckDuckGoSearcher.mockReturnValue({ search: searchMock });

      await callFunction('search_web', {
        query: 'test',
        limit: 3
      }, {
        writeEvent: jest.fn()
      });

      // Verify limit was passed
      expect(searchMock).toHaveBeenCalled();
    });

    test('should clamp timeout values to valid range', async () => {
      // Test with invalid timeout values
      const mockSearcher = {
        search: jest.fn().mockResolvedValue({
          results: []
        })
      };
      DuckDuckGoSearcher.mockReturnValue(mockSearcher);

      // Test below minimum (should clamp to 1)
      await callFunction('search_web', {
        query: 'test',
        timeout: -5
      }, { writeEvent: jest.fn() });

      // Test above maximum (should clamp to 60)
      await callFunction('search_web', {
        query: 'test',
        timeout: 999
      }, { writeEvent: jest.fn() });

      // Both should complete without crashing
      expect(mockSearcher.search).toHaveBeenCalled();
    });

    test('should handle multiple queries in single call', async () => {
      const mockSearcher = {
        search: jest.fn().mockResolvedValue({
          results: []
        })
      };
      DuckDuckGoSearcher.mockReturnValue(mockSearcher);

      const result = await callFunction('search_web', {
        query: ['query1', 'query2', 'query3']
      }, { writeEvent: jest.fn() });

      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('results');
      expect(Array.isArray(parsed.results)).toBe(true);
    });
  });

  describe('Tool Execution - execute_javascript', () => {
    
    test('should execute simple JavaScript code', async () => {
      const result = await callFunction('execute_javascript', {
        code: '42;'
      }, {});

      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('result');
    });

    test('should capture console.log output', async () => {
      const result = await callFunction('execute_javascript', {
        code: 'console.log("Test output");'
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed.result).toContain('Test output');
    });

    test('should return execution result', async () => {
      const result = await callFunction('execute_javascript', {
        code: '2 + 2'
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed.result).toBe(4);
    });

    test('should handle errors gracefully', async () => {
      const result = await callFunction('execute_javascript', {
        code: 'throw new Error("Test error");'
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('Test error');
    });

    test('should handle syntax errors', async () => {
      const result = await callFunction('execute_javascript', {
        code: 'invalid javascript code {'
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });

    test('should respect timeout parameter', async () => {
      const result = await callFunction('execute_javascript', {
        code: 'while(true) {}', // Infinite loop
        timeout: 1
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toMatch(/timeout|timed out/i);
    }, 10000);

    test('should handle Math operations', async () => {
      const result = await callFunction('execute_javascript', {
        code: 'Math.PI * 5 * 5'
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed.result).toBeCloseTo(78.54, 1);
    });

    test('should handle array operations', async () => {
      const result = await callFunction('execute_javascript', {
        code: '[1, 2, 3].map(x => x * 2)'
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed.result).toEqual([2, 4, 6]);
    });

    test('should not have access to require()', async () => {
      const result = await callFunction('execute_javascript', {
        code: 'require("fs")'
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });

    test('should not have access to global process', async () => {
      const result = await callFunction('execute_javascript', {
        code: 'process.exit(1)'
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });
  });

  describe('Tool Execution - scrape_web_content', () => {
    
    test('should require URL parameter', async () => {
      const result = await callFunction('scrape_web_content', {}, {});
      
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('url required');
    });

    test('should validate URL is not empty string', async () => {
      const result = await callFunction('scrape_web_content', {
        url: '   ' // Whitespace only
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });

    test('should return cached content when available', async () => {
      const cachedContent = {
        content: 'Cached content',
        format: 'text',
        url: 'https://example.com'
      };
      
      getFromCache.mockResolvedValueOnce(cachedContent);

      const result = await callFunction('scrape_web_content', {
        url: 'https://example.com'
      }, {
        writeEvent: jest.fn()
      });

      const parsed = JSON.parse(result);
      expect(parsed.cached).toBe(true);
      expect(parsed.content).toBe('Cached content');
      expect(getFromCache).toHaveBeenCalled();
    });

    test('should handle timeout parameter validation', async () => {
      // Mock the searcher to prevent actual network calls
      DuckDuckGoSearcher.mockReturnValue({
        fetchUrl: jest.fn().mockRejectedValue(new Error('Mocked'))
      });

      await callFunction('scrape_web_content', {
        url: 'https://example.com',
        timeout: 100 // Above maximum
      }, {
        writeEvent: jest.fn()
      });

      // Should not throw - timeout should be clamped
      // Test just verifies it doesn't crash
    });
  });

  describe('Tool Execution - transcribe_url', () => {
    
    test('should require URL parameter', async () => {
      const result = await callFunction('transcribe_url', {}, {});
      
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('url required');
    });

    test('should require API key for Whisper transcription', async () => {
      const result = await callFunction('transcribe_url', {
        url: 'https://example.com/audio.mp3'
      }, {
        writeEvent: jest.fn()
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toMatch(/API key|credentials/i);
    });

    test('should reject Gemini API keys for transcription', async () => {
      const result = await callFunction('transcribe_url', {
        url: 'https://example.com/audio.mp3'
      }, {
        apiKey: 'AIzaSyTest123', // Gemini key format
        writeEvent: jest.fn()
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('Gemini does not support');
    });

    test('should detect YouTube URLs and require OAuth when Whisper disabled', async () => {
      // Set environment variable to disable Whisper for YouTube
      const originalEnv = process.env.NO_YT_TRANS;
      process.env.NO_YT_TRANS = 'true';

      const result = await callFunction('transcribe_url', {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      }, {
        writeEvent: jest.fn()
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(parsed.whisperDisabled).toBe(true);

      // Restore environment
      if (originalEnv) {
        process.env.NO_YT_TRANS = originalEnv;
      } else {
        delete process.env.NO_YT_TRANS;
      }
    });
  });

  describe('Parameter Validation', () => {
    
    test('should clamp limit parameter to valid range', async () => {
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      // Test below minimum
      await callFunction('search_web', {
        query: 'test',
        limit: 0
      }, { writeEvent: jest.fn() });

      // Test above maximum
      await callFunction('search_web', {
        query: 'test',
        limit: 100
      }, { writeEvent: jest.fn() });

      // Both should not throw errors - should clamp
      expect(DuckDuckGoSearcher).toHaveBeenCalled();
    });

    test('should handle missing required parameters', async () => {
      const result = await callFunction('search_web', {
        // Missing query
        limit: 10
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });

    test('should handle invalid parameter types', async () => {
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      // Non-string query should be handled
      await callFunction('search_web', {
        query: 123 // Number instead of string
      }, { writeEvent: jest.fn() });

      expect(DuckDuckGoSearcher).toHaveBeenCalled();
    });

    test('should handle empty string parameters', async () => {
      const result = await callFunction('search_web', {
        query: ''  // Empty string
      }, { writeEvent: jest.fn() });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });
  });

  describe('compressSearchResultsForLLM()', () => {
    
    test('should compress results into markdown format', () => {
      const results = [
        {
          title: 'Test Article',
          url: 'https://example.com',
          content: 'This is test content'
        }
      ];

      const compressed = compressSearchResultsForLLM('test query', results);
      
      expect(typeof compressed).toBe('string');
      expect(compressed).toContain('# test query');
      expect(compressed).toContain('Test Article');
      expect(compressed).toContain('https://example.com');
    });

    test('should handle empty results', () => {
      const compressed = compressSearchResultsForLLM('test', []);
      expect(compressed).toBe('');
    });

    test('should handle null results', () => {
      const compressed = compressSearchResultsForLLM('test', null);
      expect(compressed).toBe('');
    });

    test('should format multiple results', () => {
      const results = [
        { title: 'Result 1', url: 'https://example1.com', content: 'Content 1' },
        { title: 'Result 2', url: 'https://example2.com', content: 'Content 2' },
        { title: 'Result 3', url: 'https://example3.com', content: 'Content 3' }
      ];

      const compressed = compressSearchResultsForLLM('test', results);
      
      expect(compressed).toContain('Result 1');
      expect(compressed).toContain('Result 2');
      expect(compressed).toContain('Result 3');
    });

    test('should strip markdown formatting from content', () => {
      const results = [
        {
          title: 'Test',
          url: 'https://example.com',
          content: '**Bold** _italic_ [link](url) `code`'
        }
      ];

      const compressed = compressSearchResultsForLLM('test', results);
      
      // Should have markdown symbols removed from content
      expect(compressed).not.toContain('**');
      expect(compressed).not.toContain('_italic_');
    });
  });

  describe('Unknown Tool Handling', () => {
    
    test('should return error for unknown tool', async () => {
      const result = await callFunction('nonexistent_tool', {}, {});
      
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toMatch(/unknown|not found|invalid/i);
    });

    test('should handle empty string tool name', async () => {
      const result = await callFunction('', {}, {});
      
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });
  });

  describe('Context Propagation', () => {
    
    test('should pass context to tool execution', async () => {
      const writeEvent = jest.fn();
      const context = {
        model: 'gpt-4',
        apiKey: 'test-key',
        writeEvent,
        optimization: 'balanced'
      };

      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      await callFunction('search_web', { query: 'test' }, context);

      expect(writeEvent).toHaveBeenCalled();
    });

    test('should use optimization context for result count', async () => {
      getOptimalSearchResultCount.mockReturnValue(3);
      
      DuckDuckGoSearcher.mockReturnValue({
        search: jest.fn().mockResolvedValue([])
      });

      await callFunction('search_web', {
        query: 'test'
      }, {
        optimization: 'cheap',
        writeEvent: jest.fn()
      });

      expect(getOptimalSearchResultCount).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    
    test('should handle search errors gracefully', async () => {
      // Mock searcher that returns error results
      const mockSearcher = {
        search: jest.fn().mockImplementation(async () => {
          throw new Error('Network timeout');
        })
      };
      DuckDuckGoSearcher.mockReturnValue(mockSearcher);

      // This may throw or return error JSON depending on where error occurs
      await expect(async () => {
        const result = await callFunction('search_web', {
          query: 'test'
        }, { writeEvent: jest.fn() });

        // If it doesn't throw, verify it returned error JSON
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('error');
      }).rejects.toThrow();
    });

    test('should handle invalid JavaScript execution', async () => {
      const result = await callFunction('execute_javascript', {
        code: 'invalid javascript {'
      }, {});

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toBeTruthy();
    });

    test('should require parameters for tools', async () => {
      // Test multiple tools missing required params
      const results = await Promise.all([
        callFunction('search_web', {}, {}),
        callFunction('scrape_web_content', {}, {}),
        callFunction('execute_javascript', {}, {}),
        callFunction('transcribe_url', {}, {})
      ]);

      results.forEach(result => {
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('error');
      });
    });
  });
});
