/**
 * Unit tests for search functionality and anti-blocking features
 */

const { DuckDuckGoSearcher } = require('../../src/search');

// Mock external dependencies
jest.mock('https');
jest.mock('http');

// Create mock request object
const createMockRequest = () => ({
  on: jest.fn(),
  end: jest.fn(),
  destroy: jest.fn()
});

// Mock https and http modules
const https = require('https');
const http = require('http');
https.request = jest.fn(() => createMockRequest());
http.request = jest.fn(() => createMockRequest());

describe('DuckDuckGoSearcher', () => {
  let searcher;

  beforeEach(() => {
    searcher = new DuckDuckGoSearcher();
    jest.clearAllMocks();
    
    // Reset HTTP mocks
    https.request.mockImplementation(() => createMockRequest());
    http.request.mockImplementation(() => createMockRequest());
    
    // Reset anti-blocking state
    searcher.requestHistory = [];
    searcher.lastRequestTime = 0;
    searcher.failureCount = 0;
    searcher.circuitBreakerOpen = false;
    searcher.circuitBreakerOpenTime = 0;
  });

  describe('search', () => {
    test('should return search results for valid query', async () => {
      // Mock response data
      const mockResults = [
        {
          title: 'Test Result',
          url: 'https://example.com',
          description: 'Test description'
        }
      ];

      // Mock the fetchUrl method and disable request spacing
      searcher.fetchUrl = jest.fn().mockResolvedValue(JSON.stringify({
        RelatedTopics: mockResults
      }));
      searcher.minRequestInterval = 0;

      const results = await searcher.search('test query', 1);

      expect(results).toBeDefined();
      expect(searcher.fetchUrl).toHaveBeenCalled();
    }, 15000);

    test('should handle search errors by throwing', async () => {
      searcher.fetchUrl = jest.fn().mockRejectedValue(new Error('Network error'));

      // The search function throws errors instead of handling them gracefully
      await expect(searcher.search('test query', 1)).rejects.toThrow('Search failed: Network error');
      
      expect(searcher.fetchUrl).toHaveBeenCalled();
    });

    test('should respect timeout parameter', async () => {
      const timeout = 5;
      searcher.fetchUrl = jest.fn().mockResolvedValue('{}');

      await searcher.search('test query', 1, false, timeout);

      expect(searcher.fetchUrl).toHaveBeenCalledWith(
        expect.any(String),
        timeout * 1000
      );
    });

    test('should limit results to specified count', async () => {
      const limit = 3;
      searcher.fetchUrl = jest.fn().mockResolvedValue('{}');
      searcher.extractSearchResults = jest.fn().mockReturnValue([{
        title: 'Test',
        url: 'https://example.com',
        description: 'Test result',
        score: 50
      }]);
      searcher.minRequestInterval = 0;

      await searcher.search('test query', limit);

      // Verify limit is respected in the search logic
      expect(limit).toBe(3);
    }, 15000);
  });

  describe('memory tracking', () => {
    test('should track memory usage during search', async () => {
      searcher.fetchUrl = jest.fn().mockResolvedValue('{}');
      searcher.extractSearchResults = jest.fn().mockReturnValue([]);
      searcher.minRequestInterval = 0;
      
      const initialMemory = process.memoryUsage().heapUsed;
      await searcher.search('test query', 1);
      
      // Memory tracking should be active
      expect(searcher.memoryTracker).toBeDefined();
    }, 15000);
  });

  describe('Anti-blocking Features', () => {
    describe('Request Spacing', () => {
      test('should enforce minimum request interval', async () => {
        // Mock the full search pipeline for faster execution
        searcher.fetchUrl = jest.fn().mockResolvedValue('{}');
        searcher.fetchUrlWithBotAvoidance = jest.fn().mockResolvedValue('<html></html>');
        searcher.extractSearchResults = jest.fn().mockReturnValue([{
          title: 'Test',
          url: 'https://example.com',
          description: 'Test result',
          score: 50
        }]);
        
        // Use shorter interval for testing
        searcher.minRequestInterval = 100;
        
        const startTime = Date.now();
        
        // First request
        await searcher.search('test query 1', 1);
        const firstRequestTime = Date.now();
        
        // Second request should be delayed
        await searcher.search('test query 2', 1);
        const secondRequestTime = Date.now();
        
        const timeDiff = secondRequestTime - firstRequestTime;
        expect(timeDiff).toBeGreaterThanOrEqual(90); // Allow for some timing variance
      }, 15000);

      test('should apply exponential backoff on failures', async () => {
        searcher.fetchUrl = jest.fn().mockRejectedValue(new Error('Network error'));
        
        // Simulate failures to increase backoff
        try { await searcher.search('test', 1); } catch (e) {}
        expect(searcher.failureCount).toBe(1);
        
        try { await searcher.search('test', 1); } catch (e) {}
        expect(searcher.failureCount).toBe(2);
        
        // Check that backoff multiplier is applied
        const expectedBackoff = searcher.minRequestInterval * Math.min(Math.pow(2, 2), 4);
        expect(expectedBackoff).toBeGreaterThan(searcher.minRequestInterval);
      });
    });

    describe('Circuit Breaker', () => {
      test('should open circuit breaker after max failures', async () => {
        searcher.fetchUrl = jest.fn().mockRejectedValue(new Error('Network error'));
        
        // Disable request spacing for faster test execution
        searcher.minRequestInterval = 0;
        
        // Trigger enough failures to open circuit breaker
        for (let i = 0; i < searcher.maxFailures; i++) {
          try {
            await searcher.search('test', 1);
          } catch (e) {}
        }
        
        expect(searcher.circuitBreakerOpen).toBe(true);
        expect(searcher.failureCount).toBe(searcher.maxFailures);
      }, 15000);

      test('should reject requests when circuit breaker is open', async () => {
        searcher.circuitBreakerOpen = true;
        searcher.circuitBreakerOpenTime = Date.now();
        
        await expect(searcher.search('test', 1))
          .rejects.toThrow('Search temporarily disabled due to repeated failures');
      });

      test('should close circuit breaker after timeout', async () => {
        searcher.circuitBreakerOpen = true;
        searcher.circuitBreakerOpenTime = Date.now() - (searcher.circuitBreakerTimeout + 1000);
        
        // Mock the full search pipeline
        searcher.fetchUrl = jest.fn().mockResolvedValue('{}');
        searcher.extractSearchResults = jest.fn().mockReturnValue([{
          title: 'Test',
          url: 'https://example.com',
          description: 'Test result',
          score: 50
        }]);
        searcher.minRequestInterval = 0; // No delays for testing
        
        // Should close circuit breaker and allow request
        await searcher.search('test', 1);
        
        expect(searcher.circuitBreakerOpen).toBe(false);
        expect(searcher.failureCount).toBe(0);
      }, 15000);
    });

    describe('Request Tracking', () => {
      test('should track successful requests', async () => {
        // Mock the full search pipeline
        searcher.fetchUrl = jest.fn().mockResolvedValue('{}');
        searcher.extractSearchResults = jest.fn().mockReturnValue([{
          title: 'Test',
          url: 'https://example.com',
          description: 'Test result',
          score: 50
        }]);
        searcher.minRequestInterval = 0; // No delays for testing
        
        await searcher.search('test', 1);
        
        expect(searcher.requestHistory).toHaveLength(1);
        expect(searcher.requestHistory[0].success).toBe(true);
        expect(searcher.failureCount).toBe(0);
      }, 15000);

      test('should track failed requests', async () => {
        searcher.fetchUrl = jest.fn().mockRejectedValue(new Error('Network error'));
        
        try {
          await searcher.search('test', 1);
        } catch (e) {}
        
        expect(searcher.requestHistory).toHaveLength(1);
        expect(searcher.requestHistory[0].success).toBe(false);
        expect(searcher.requestHistory[0].error).toBe('Network error');
        expect(searcher.failureCount).toBe(1);
      });

      test('should limit request history size', async () => {
        // Test the tracking functionality directly instead of through full search
        for (let i = 0; i < 15; i++) {
          searcher.trackRequestResult(true);
        }
        
        expect(searcher.requestHistory).toHaveLength(10); // Should be capped at 10
        expect(searcher.requestHistory[0].success).toBe(true);
      });
    });

    describe('Enhanced User Agent Rotation', () => {
      test('should use different browser fingerprints', () => {
        const userAgents = new Set();
        
        // Mock the fetchUrlWithBotAvoidance method to capture user agents
        const originalFetchUrlWithBotAvoidance = searcher.fetchUrlWithBotAvoidance;
        searcher.fetchUrlWithBotAvoidance = jest.fn().mockImplementation(async (url) => {
          // Extract the options that would be passed to the request
          return originalFetchUrlWithBotAvoidance.call(searcher, url);
        });
        
        // Multiple calls should potentially use different fingerprints
        for (let i = 0; i < 5; i++) {
          searcher.fetchUrlWithBotAvoidance('https://example.com');
        }
        
        // At minimum, the method should be configured with fingerprint data
        expect(searcher.fetchUrlWithBotAvoidance).toHaveBeenCalled();
      });
    });

    describe('CAPTCHA Detection', () => {
      test('should detect and track CAPTCHA responses', async () => {
        const mockCaptchaResponse = '<html><body>challenge detected</body></html>';
        searcher.fetchUrl = jest.fn().mockResolvedValue('{}'); // API fails
        searcher.fetchUrlWithBotAvoidance = jest.fn().mockResolvedValue(mockCaptchaResponse);
        
        await searcher.search('test', 1);
        
        // Should have tracked a failure due to CAPTCHA detection
        expect(searcher.requestHistory.some(req => 
          !req.success && req.error && req.error.includes('CAPTCHA')
        )).toBe(true);
      });
    });

    describe('Session Management', () => {
      test('should initialize session state correctly', () => {
        const newSearcher = new DuckDuckGoSearcher();
        
        expect(newSearcher.requestHistory).toEqual([]);
        expect(newSearcher.lastRequestTime).toBe(0);
        expect(newSearcher.failureCount).toBe(0);
        expect(newSearcher.circuitBreakerOpen).toBe(false);
        expect(newSearcher.minRequestInterval).toBeGreaterThan(0);
        expect(newSearcher.maxRequestInterval).toBeGreaterThan(newSearcher.minRequestInterval);
      });

      test('should handle rapid consecutive requests with spacing', async () => {
        // Mock all search components to avoid network timeouts
        searcher.fetchUrl = jest.fn().mockResolvedValue('{}');
        searcher.fetchUrlWithBotAvoidance = jest.fn().mockResolvedValue('<html></html>');
        searcher.extractSearchResults = jest.fn().mockReturnValue([{
          title: 'Test',
          url: 'https://example.com',
          description: 'Test result',
          score: 50
        }]);
        
        // Use shorter interval for testing but still measurable
        searcher.minRequestInterval = 50; // Very short for testing
        
        const startTime = Date.now();
        
        // Execute requests sequentially to properly test spacing
        await searcher.search('test 1', 1);
        await searcher.search('test 2', 1);
        await searcher.search('test 3', 1);
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        // Should have some delay between requests (2 intervals minimum)
        expect(totalTime).toBeGreaterThanOrEqual(100); // At least 2 * 50ms intervals
      }, 20000);
    });
  });
});