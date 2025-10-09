/**
 * Tests for Request Analyzer Module
 */

const {
  RequestType,
  REASONING_PATTERNS,
  COMPLEX_PATTERNS,
  CREATIVE_PATTERNS,
  TOOL_PATTERNS,
  countPatternMatches,
  detectRequestType,
  analyzeMessages,
  requiresLargeContext,
  requiresReasoning,
  isToolHeavy,
  estimateConversationDepth,
  analyzeRequest,
  getComplexityScore
} = require('../../src/model-selection/request-analyzer');

describe('RequestType Constants', () => {
  test('should define all request types', () => {
    expect(RequestType.SIMPLE).toBe('simple');
    expect(RequestType.COMPLEX).toBe('complex');
    expect(RequestType.REASONING).toBe('reasoning');
    expect(RequestType.CREATIVE).toBe('creative');
    expect(RequestType.TOOL_HEAVY).toBe('tool_heavy');
  });
});

describe('Pattern Constants', () => {
  test('should define reasoning patterns', () => {
    expect(Array.isArray(REASONING_PATTERNS)).toBe(true);
    expect(REASONING_PATTERNS.length).toBeGreaterThan(0);
  });

  test('should define complex patterns', () => {
    expect(Array.isArray(COMPLEX_PATTERNS)).toBe(true);
    expect(COMPLEX_PATTERNS.length).toBeGreaterThan(0);
  });

  test('should define creative patterns', () => {
    expect(Array.isArray(CREATIVE_PATTERNS)).toBe(true);
    expect(CREATIVE_PATTERNS.length).toBeGreaterThan(0);
  });

  test('should define tool patterns', () => {
    expect(Array.isArray(TOOL_PATTERNS)).toBe(true);
    expect(TOOL_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe('countPatternMatches', () => {
  test('should count matching patterns', () => {
    const content = 'Calculate the sum and solve the equation';
    const count = countPatternMatches(content, REASONING_PATTERNS);
    expect(count).toBeGreaterThan(0);
  });

  test('should return 0 for no matches', () => {
    const content = 'Hello there';
    const count = countPatternMatches(content, REASONING_PATTERNS);
    expect(count).toBe(0);
  });

  test('should handle empty content', () => {
    const count = countPatternMatches('', REASONING_PATTERNS);
    expect(count).toBe(0);
  });

  test('should handle null/undefined content', () => {
    expect(countPatternMatches(null, REASONING_PATTERNS)).toBe(0);
    expect(countPatternMatches(undefined, REASONING_PATTERNS)).toBe(0);
  });

  test('should be case insensitive', () => {
    const count1 = countPatternMatches('CALCULATE this', REASONING_PATTERNS);
    const count2 = countPatternMatches('calculate this', REASONING_PATTERNS);
    expect(count1).toBe(count2);
    expect(count1).toBeGreaterThan(0);
  });
});

describe('detectRequestType', () => {
  describe('REASONING type detection', () => {
    test('should detect math problems', () => {
      const type = detectRequestType('Calculate the derivative of x^2 + 3x + 5');
      expect(type).toBe(RequestType.REASONING);
    });

    test('should detect logic problems', () => {
      const type = detectRequestType('Prove that the algorithm is correct');
      expect(type).toBe(RequestType.REASONING);
    });

    test('should detect code debugging', () => {
      const type = detectRequestType('Debug this code and fix the memory leak');
      expect(type).toBe(RequestType.REASONING);
    });

    test('should detect step-by-step requests', () => {
      const type = detectRequestType('Explain step by step how encryption works');
      expect(type).toBe(RequestType.REASONING);
    });

    test('should detect "why" questions', () => {
      const type = detectRequestType('Why does gravity work this way?');
      expect(type).toBe(RequestType.REASONING);
    });
  });

  describe('TOOL_HEAVY type detection', () => {
    test('should detect multiple tool indicators', () => {
      const type = detectRequestType('Search for recent news and look up the latest updates');
      expect(type).toBe(RequestType.TOOL_HEAVY);
    });

    test('should detect web scraping requests', () => {
      const type = detectRequestType('Scrape this website and fetch data from that API');
      expect(type).toBe(RequestType.TOOL_HEAVY);
    });

    test('should not trigger on single tool mention', () => {
      const type = detectRequestType('Search for information about cats');
      // Should be simple, not tool-heavy (only 1 match)
      expect(type).not.toBe(RequestType.TOOL_HEAVY);
    });
  });

  describe('COMPLEX type detection', () => {
    test('should detect detailed explanation requests', () => {
      const type = detectRequestType('Explain in detail how neural networks work');
      expect(type).toBe(RequestType.COMPLEX);
    });

    test('should detect research requests', () => {
      const type = detectRequestType('Research and investigate different machine learning approaches');
      expect(type).toBe(RequestType.COMPLEX);
    });

    test('should detect planning requests', () => {
      const type = detectRequestType('Create a comprehensive plan for our marketing strategy');
      expect(type).toBe(RequestType.COMPLEX);
    });

    test('should detect multiple approaches requests', () => {
      const type = detectRequestType('Show me several different ways to solve this problem');
      expect(type).toBe(RequestType.COMPLEX);
    });
  });

  describe('CREATIVE type detection', () => {
    test('should detect story writing', () => {
      const type = detectRequestType('Write a short story about a detective');
      expect(type).toBe(RequestType.CREATIVE);
    });

    test('should detect poetry requests', () => {
      const type = detectRequestType('Compose a poem about the ocean');
      expect(type).toBe(RequestType.CREATIVE);
    });

    test('should detect brainstorming', () => {
      const type = detectRequestType('Help me brainstorm creative ideas for my project');
      expect(type).toBe(RequestType.CREATIVE);
    });

    test('should detect fictional content', () => {
      const type = detectRequestType('Create a fictional character for my fantasy novel');
      expect(type).toBe(RequestType.CREATIVE);
    });
  });

  describe('SIMPLE type detection', () => {
    test('should detect short queries', () => {
      const type = detectRequestType('What is AI?');
      expect(type).toBe(RequestType.SIMPLE);
    });

    test('should detect greetings', () => {
      const type = detectRequestType('Hello, how are you?');
      expect(type).toBe(RequestType.SIMPLE);
    });

    test('should detect basic facts', () => {
      const type = detectRequestType('Who is the president?');
      expect(type).toBe(RequestType.SIMPLE);
    });
  });

  describe('Length-based detection', () => {
    test('should default to simple for short content', () => {
      const type = detectRequestType('Tell me');
      expect(type).toBe(RequestType.SIMPLE);
    });

    test('should default to complex for long content without patterns', () => {
      const longText = 'a'.repeat(250);
      const type = detectRequestType(longText);
      expect(type).toBe(RequestType.COMPLEX);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty string', () => {
      const type = detectRequestType('');
      expect(type).toBe(RequestType.SIMPLE);
    });

    test('should handle null', () => {
      const type = detectRequestType(null);
      expect(type).toBe(RequestType.SIMPLE);
    });

    test('should handle undefined', () => {
      const type = detectRequestType(undefined);
      expect(type).toBe(RequestType.SIMPLE);
    });

    test('should handle non-string input', () => {
      const type = detectRequestType(123);
      expect(type).toBe(RequestType.SIMPLE);
    });
  });
});

describe('analyzeMessages', () => {
  test('should analyze single user message', () => {
    const messages = [
      { role: 'user', content: 'Calculate the square root of 144' }
    ];
    const type = analyzeMessages(messages);
    expect(type).toBe(RequestType.REASONING);
  });

  test('should focus on last user message', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'Solve this equation: x^2 = 16' }
    ];
    const type = analyzeMessages(messages);
    expect(type).toBe(RequestType.REASONING);
  });

  test('should ignore assistant messages when finding last user message', () => {
    const messages = [
      { role: 'user', content: 'Calculate 2 + 2' },
      { role: 'assistant', content: 'Write a poem about cats' }
    ];
    const type = analyzeMessages(messages);
    expect(type).toBe(RequestType.REASONING);
  });

  test('should handle empty messages array', () => {
    const type = analyzeMessages([]);
    expect(type).toBe(RequestType.SIMPLE);
  });

  test('should handle null messages', () => {
    const type = analyzeMessages(null);
    expect(type).toBe(RequestType.SIMPLE);
  });

  test('should handle messages without user role', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'assistant', content: 'How can I help?' }
    ];
    const type = analyzeMessages(messages);
    expect(type).toBe(RequestType.SIMPLE);
  });

  test('should handle messages with empty content', () => {
    const messages = [
      { role: 'user', content: '' }
    ];
    const type = analyzeMessages(messages);
    expect(type).toBe(RequestType.SIMPLE);
  });
});

describe('requiresLargeContext', () => {
  test('should detect large context from message length', () => {
    const longContent = 'a'.repeat(40000); // ~10K tokens
    const messages = [
      { role: 'user', content: longContent }
    ];
    const result = requiresLargeContext(messages);
    expect(result).toBe(true);
  });

  test('should detect large context from multiple messages', () => {
    const messages = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: 'user', content: 'a'.repeat(2000) });
    }
    const result = requiresLargeContext(messages);
    expect(result).toBe(true);
  });

  test('should not flag small contexts', () => {
    const messages = [
      { role: 'user', content: 'Short message' }
    ];
    const result = requiresLargeContext(messages);
    expect(result).toBe(false);
  });

  test('should use custom threshold', () => {
    const messages = [
      { role: 'user', content: 'a'.repeat(5000) }
    ];
    // Default threshold (8000 tokens = 32000 chars)
    expect(requiresLargeContext(messages, 8000)).toBe(false);
    // Lower threshold (1000 tokens = 4000 chars)
    expect(requiresLargeContext(messages, 1000)).toBe(true);
  });

  test('should handle empty messages', () => {
    const result = requiresLargeContext([]);
    expect(result).toBe(false);
  });

  test('should handle null messages', () => {
    const result = requiresLargeContext(null);
    expect(result).toBe(false);
  });
});

describe('requiresReasoning', () => {
  test('should return true for reasoning requests', () => {
    const messages = [
      { role: 'user', content: 'Prove that P = NP is undecidable' }
    ];
    const result = requiresReasoning(messages);
    expect(result).toBe(true);
  });

  test('should return false for simple requests', () => {
    const messages = [
      { role: 'user', content: 'What is your name?' }
    ];
    const result = requiresReasoning(messages);
    expect(result).toBe(false);
  });

  test('should handle empty messages', () => {
    const result = requiresReasoning([]);
    expect(result).toBe(false);
  });
});

describe('isToolHeavy', () => {
  test('should return true for tool-heavy requests with tools available', () => {
    const messages = [
      { role: 'user', content: 'Search the web and scrape that website' }
    ];
    const tools = [{ type: 'function', function: { name: 'search' } }];
    const result = isToolHeavy(messages, tools);
    expect(result).toBe(true);
  });

  test('should return false when no tools available', () => {
    const messages = [
      { role: 'user', content: 'Search the web and scrape that website' }
    ];
    const result = isToolHeavy(messages, []);
    expect(result).toBe(false);
  });

  test('should return false for non-tool-heavy requests', () => {
    const messages = [
      { role: 'user', content: 'Tell me a joke' }
    ];
    const tools = [{ type: 'function', function: { name: 'search' } }];
    const result = isToolHeavy(messages, tools);
    expect(result).toBe(false);
  });

  test('should handle empty messages', () => {
    const result = isToolHeavy([], [{ type: 'function' }]);
    expect(result).toBe(false);
  });
});

describe('estimateConversationDepth', () => {
  test('should count single turn', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' }
    ];
    const depth = estimateConversationDepth(messages);
    expect(depth).toBe(1);
  });

  test('should count multiple turns', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'Good' },
      { role: 'user', content: 'Great!' }
    ];
    const depth = estimateConversationDepth(messages);
    expect(depth).toBeGreaterThanOrEqual(2);
  });

  test('should handle consecutive messages from same role', () => {
    const messages = [
      { role: 'user', content: 'First' },
      { role: 'user', content: 'Second' },
      { role: 'assistant', content: 'Reply' }
    ];
    const depth = estimateConversationDepth(messages);
    expect(depth).toBeGreaterThanOrEqual(1);
  });

  test('should ignore system messages', () => {
    const messages = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' }
    ];
    const depth = estimateConversationDepth(messages);
    expect(depth).toBe(1);
  });

  test('should handle empty messages', () => {
    const depth = estimateConversationDepth([]);
    expect(depth).toBe(0);
  });

  test('should handle null messages', () => {
    const depth = estimateConversationDepth(null);
    expect(depth).toBe(0);
  });
});

describe('analyzeRequest', () => {
  test('should provide comprehensive analysis for simple request', () => {
    const result = analyzeRequest({
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [],
      max_tokens: 1024
    });

    expect(result.type).toBe(RequestType.SIMPLE);
    expect(result.depth).toBe(1);
    expect(result.requiresLargeContext).toBe(false);
    expect(result.requiresReasoning).toBe(false);
    expect(result.isToolHeavy).toBe(false);
    expect(result.priority).toBe('normal');
    expect(result.hasTools).toBe(false);
    expect(result.estimatedComplexity).toBeGreaterThanOrEqual(0);
  });

  test('should provide comprehensive analysis for reasoning request', () => {
    const result = analyzeRequest({
      messages: [{ role: 'user', content: 'Solve this equation: x^2 + 5x + 6 = 0' }],
      tools: [],
      max_tokens: 4096
    });

    expect(result.type).toBe(RequestType.REASONING);
    expect(result.requiresReasoning).toBe(true);
    expect(result.priority).toBe('high');
    expect(result.estimatedComplexity).toBeGreaterThanOrEqual(7);
  });

  test('should provide comprehensive analysis for complex request', () => {
    const result = analyzeRequest({
      messages: [{ role: 'user', content: 'Explain in detail how quantum computing works' }],
      tools: [],
      max_tokens: 4096
    });

    expect(result.type).toBe(RequestType.COMPLEX);
    expect(result.priority).toBe('medium');
    expect(result.estimatedComplexity).toBeGreaterThanOrEqual(4);
  });

  test('should detect tool-heavy requests', () => {
    const result = analyzeRequest({
      messages: [{ role: 'user', content: 'Search for news and look up latest updates' }],
      tools: [{ type: 'function', function: { name: 'search' } }],
      max_tokens: 2048
    });

    expect(result.type).toBe(RequestType.TOOL_HEAVY);
    expect(result.isToolHeavy).toBe(true);
    expect(result.hasTools).toBe(true);
    expect(result.priority).toBe('medium');
  });

  test('should detect large context requirements', () => {
    const longContent = 'a'.repeat(40000);
    const result = analyzeRequest({
      messages: [{ role: 'user', content: longContent }],
      tools: [],
      max_tokens: 4096
    });

    expect(result.requiresLargeContext).toBe(true);
    expect(result.estimatedComplexity).toBeGreaterThanOrEqual(3);
  });

  test('should handle multi-turn conversations', () => {
    const result = analyzeRequest({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'Good' },
        { role: 'user', content: 'Solve x^2 = 9' }
      ],
      tools: [],
      max_tokens: 2048
    });

    expect(result.type).toBe(RequestType.REASONING);
    expect(result.depth).toBeGreaterThanOrEqual(2);
  });

  test('should handle empty options', () => {
    const result = analyzeRequest({});
    
    expect(result.type).toBe(RequestType.SIMPLE);
    expect(result.depth).toBe(0);
    expect(result.hasTools).toBe(false);
  });

  test('should handle missing options', () => {
    const result = analyzeRequest();
    
    expect(result.type).toBe(RequestType.SIMPLE);
    expect(result.priority).toBe('normal');
  });
});

describe('getComplexityScore', () => {
  test('should score simple requests low', () => {
    const score = getComplexityScore(RequestType.SIMPLE, 0, false);
    expect(score).toBeLessThanOrEqual(3);
  });

  test('should score reasoning requests high', () => {
    const score = getComplexityScore(RequestType.REASONING, 0, false);
    expect(score).toBeGreaterThanOrEqual(7);
  });

  test('should increase score with conversation depth', () => {
    const score1 = getComplexityScore(RequestType.SIMPLE, 0, false);
    const score2 = getComplexityScore(RequestType.SIMPLE, 5, false);
    expect(score2).toBeGreaterThan(score1);
  });

  test('should increase score for large context', () => {
    const score1 = getComplexityScore(RequestType.COMPLEX, 0, false);
    const score2 = getComplexityScore(RequestType.COMPLEX, 0, true);
    expect(score2).toBeGreaterThan(score1);
  });

  test('should cap score at 10', () => {
    const score = getComplexityScore(RequestType.REASONING, 10, true);
    expect(score).toBeLessThanOrEqual(10);
  });

  test('should return integer scores', () => {
    const score = getComplexityScore(RequestType.COMPLEX, 3, false);
    expect(Number.isInteger(score)).toBe(true);
  });
});
