/**
 * Request Analyzer Module
 * 
 * Analyzes chat requests to determine complexity, type, and requirements
 * Used for intelligent model selection
 */

/**
 * Request types
 */
const RequestType = {
  SIMPLE: 'simple',       // Basic Q&A, greetings, simple facts
  COMPLEX: 'complex',     // Multi-step reasoning, detailed explanations
  REASONING: 'reasoning', // Math, code, logic problems, deep analysis
  CREATIVE: 'creative',   // Writing, brainstorming, creative tasks
  TOOL_HEAVY: 'tool_heavy' // Multiple tool calls expected
};

/**
 * Keyword patterns for detecting reasoning requests
 */
const REASONING_PATTERNS = [
  /\b(calculate|compute|prove|derive|analyze deeply|step by step)\b/i,
  /\b(mathematical|algorithm|logic|theorem|equation)\b/i,
  /\b(why (does|is|would)|explain why|reasoning behind)\b/i,
  /\b(debug|fix (this )?code|optimize|refactor)\b/i,
  /\b(compare.*contrast|pros.*cons|advantages.*disadvantages)\b/i,
  /\bsolve\b/i
];

/**
 * Keyword patterns for detecting complex requests
 */
const COMPLEX_PATTERNS = [
  /\b(explain in detail|comprehensive|thorough|detailed analysis)\b/i,
  /\b(multiple|several|various|different (ways|approaches|methods))\b/i,
  /\b(create.*plan|strategy|roadmap|architecture)\b/i,
  /\b(research|investigate|explore|examine)\b/i,
  /\b(write (a |an )?(long|detailed|comprehensive))\b/i
];

/**
 * Keyword patterns for detecting creative requests
 */
const CREATIVE_PATTERNS = [
  /\bwrite (a |an )?(short |long )?(story|poem|song|script|novel)\b/i,
  /\b(creative|imagine|brainstorm|generate ideas)\b/i,
  /\b(draft|compose|craft)\b/i,
  /\b(fictional|fantasy|sci-?fi)\b/i
];

/**
 * Keyword patterns for detecting tool usage
 */
const TOOL_PATTERNS = [
  /\b(search (for|the web)?|look up|find information|google)\b/i,
  /\b(scrape|fetch|get (data|content) from|fetch data)\b/i,
  /\b(execute|run (this )?code|evaluate)\b/i,
  /\b(latest|current|recent|news|updates)\b/i,
  /\b(website|API)\b/i
];

/**
 * Analyze message content for patterns
 * @param {string} content - Message content
 * @param {Array<RegExp>} patterns - Array of regex patterns
 * @returns {number} Number of pattern matches
 */
function countPatternMatches(content, patterns) {
  if (!content || typeof content !== 'string') {
    return 0;
  }

  let matches = 0;
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      matches++;
    }
  }
  return matches;
}

/**
 * Detect request type from message content
 * @param {string} content - Message content
 * @returns {string} Request type
 */
function detectRequestType(content) {
  if (!content || typeof content !== 'string') {
    return RequestType.SIMPLE;
  }

  // Count matches for each type
  const reasoningScore = countPatternMatches(content, REASONING_PATTERNS);
  const complexScore = countPatternMatches(content, COMPLEX_PATTERNS);
  const creativeScore = countPatternMatches(content, CREATIVE_PATTERNS);
  const toolScore = countPatternMatches(content, TOOL_PATTERNS);

  // Special case: If asking for multiple approaches explicitly, it's COMPLEX even if it mentions "solve"
  if (complexScore > 0 && /\b(multiple|several|various|different (ways|approaches|methods))/i.test(content)) {
    return RequestType.COMPLEX;
  }

  // Prioritize: reasoning > tool-heavy > complex > creative > simple
  if (reasoningScore > 0) {
    return RequestType.REASONING;
  }

  if (toolScore >= 2) {
    return RequestType.TOOL_HEAVY;
  }

  if (complexScore > 0) {
    return RequestType.COMPLEX;
  }

  if (creativeScore > 0) {
    return RequestType.CREATIVE;
  }

  // Check for short/simple queries
  if (content.length < 50) {
    return RequestType.SIMPLE;
  }

  // Default to complex for longer queries without specific patterns
  if (content.length > 200) {
    return RequestType.COMPLEX;
  }

  return RequestType.SIMPLE;
}

/**
 * Analyze messages array to determine overall request type
 * @param {Array<Object>} messages - Array of message objects
 * @returns {string} Request type
 */
function analyzeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return RequestType.SIMPLE;
  }

  // Focus on the last user message (most recent request)
  let lastUserMessage = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserMessage = messages[i];
      break;
    }
  }

  if (!lastUserMessage || !lastUserMessage.content) {
    return RequestType.SIMPLE;
  }

  return detectRequestType(lastUserMessage.content);
}

/**
 * Check if request requires large context window
 * @param {Array<Object>} messages - Array of message objects
 * @param {number} threshold - Token threshold for large context (default 8000)
 * @returns {boolean} True if large context needed
 */
function requiresLargeContext(messages, threshold = 8000) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }

  // Simple heuristic: estimate tokens from message count and content length
  let totalChars = 0;
  for (const msg of messages) {
    if (msg.content && typeof msg.content === 'string') {
      totalChars += msg.content.length;
    }
  }

  // Rough estimation: 4 chars per token
  const estimatedTokens = totalChars / 4;
  return estimatedTokens > threshold;
}

/**
 * Check if request requires reasoning capabilities
 * @param {Array<Object>} messages - Array of message objects
 * @returns {boolean} True if reasoning required
 */
function requiresReasoning(messages) {
  const type = analyzeMessages(messages);
  return type === RequestType.REASONING;
}

/**
 * Check if request is tool-heavy (multiple tool calls expected)
 * @param {Array<Object>} messages - Array of message objects
 * @param {Array<Object>} tools - Available tools
 * @returns {boolean} True if tool-heavy
 */
function isToolHeavy(messages, tools = []) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return false;
  }

  const type = analyzeMessages(messages);
  return type === RequestType.TOOL_HEAVY;
}

/**
 * Estimate conversation depth (number of turns)
 * @param {Array<Object>} messages - Array of message objects
 * @returns {number} Number of conversation turns
 */
function estimateConversationDepth(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }

  let turns = 0;
  let lastRole = null;

  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      if (msg.role !== lastRole) {
        turns++;
        lastRole = msg.role;
      }
    }
  }

  return Math.ceil(turns / 2); // Two messages (user + assistant) = 1 turn
}

/**
 * Analyze request and return comprehensive requirements
 * @param {Object} options - Analysis options
 * @param {Array<Object>} options.messages - Messages array
 * @param {Array<Object>} options.tools - Available tools
 * @param {number} options.max_tokens - Requested max tokens
 * @returns {Object} Request analysis
 */
function analyzeRequest(options = {}) {
  const {
    messages = [],
    tools = [],
    max_tokens = 4096
  } = options;

  const type = analyzeMessages(messages);
  const depth = estimateConversationDepth(messages);
  const needsLargeContext = requiresLargeContext(messages);
  const needsReasoning = requiresReasoning(messages);
  const isToolIntensive = isToolHeavy(messages, tools);

  // Determine priority (higher = more important to get right)
  let priority = 'normal';
  if (needsReasoning) {
    priority = 'high';
  } else if (type === RequestType.COMPLEX || isToolIntensive) {
    priority = 'medium';
  }

  return {
    type,
    depth,
    requiresLargeContext: needsLargeContext,
    requiresReasoning: needsReasoning,
    isToolHeavy: isToolIntensive,
    priority,
    hasTools: tools.length > 0,
    estimatedComplexity: getComplexityScore(type, depth, needsLargeContext)
  };
}

/**
 * Get complexity score (0-10)
 * @param {string} type - Request type
 * @param {number} depth - Conversation depth
 * @param {boolean} needsLargeContext - Large context flag
 * @returns {number} Complexity score (0-10)
 */
function getComplexityScore(type, depth, needsLargeContext) {
  let score = 0;

  // Base score from type
  const typeScores = {
    [RequestType.SIMPLE]: 1,
    [RequestType.CREATIVE]: 3,
    [RequestType.COMPLEX]: 5,
    [RequestType.TOOL_HEAVY]: 6,
    [RequestType.REASONING]: 8
  };
  score += typeScores[type] || 1;

  // Add points for conversation depth
  score += Math.min(depth * 0.5, 2);

  // Add points for large context
  if (needsLargeContext) {
    score += 2;
  }

  return Math.min(Math.round(score), 10);
}

module.exports = {
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
};
