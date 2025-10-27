/**
 * Query Complexity Analyzer
 * 
 * Determines whether a query is simple or complex to route to appropriate models:
 * - Simple queries → 70B model (faster, cheaper)
 * - Complex queries → 405B model (more capable)
 */

/**
 * Analyze query complexity based on multiple factors
 * @param {string} query - The user's query or prompt
 * @param {object} context - Additional context (tool usage, conversation history, etc.)
 * @returns {'simple'|'complex'} - Complexity classification
 */
function analyzeQueryComplexity(query, context = {}) {
  if (!query || typeof query !== 'string') {
    return 'simple';
  }

  const queryLower = query.toLowerCase();
  let complexityScore = 0;

  // FACTOR 1: Query length (longer queries often more complex)
  const wordCount = query.split(/\s+/).length;
  if (wordCount > 50) {
    complexityScore += 2;
  } else if (wordCount > 20) {
    complexityScore += 1;
  }

  // FACTOR 2: Multiple questions (indicates complexity)
  const questionMarks = (query.match(/\?/g) || []).length;
  if (questionMarks > 2) {
    complexityScore += 2;
  } else if (questionMarks > 1) {
    complexityScore += 1;
  }

  // FACTOR 3: Complex reasoning keywords
  const complexReasoningPatterns = [
    /analyz[e|ing]/i,
    /compar[e|ing|ison]/i,
    /evaluat[e|ing]/i,
    /synthesiz[e|ing]/i,
    /reasoning/i,
    /logic/i,
    /deduce|infer/i,
    /multi-step/i,
    /complex/i,
    /sophisticated/i,
    /advanced/i,
    /deep dive/i,
    /comprehensive/i,
    /in-depth/i,
    /critically/i,
    /philosophical/i,
    /ethical/i,
    /strategic/i
  ];

  const matchedComplexPatterns = complexReasoningPatterns.filter(pattern => 
    pattern.test(query)
  ).length;
  complexityScore += matchedComplexPatterns * 2;

  // FACTOR 4: Simple task keywords (reduce complexity)
  const simpleTaskPatterns = [
    /^what is/i,
    /^who is/i,
    /^when did/i,
    /^where is/i,
    /^define/i,
    /^explain simply/i,
    /^list/i,
    /^name/i,
    /quick/i,
    /briefly/i,
    /summarize in one sentence/i,
    /yes or no/i,
    /true or false/i
  ];

  const matchedSimplePatterns = simpleTaskPatterns.filter(pattern => 
    pattern.test(query)
  ).length;
  complexityScore -= matchedSimplePatterns * 2;

  // FACTOR 5: Code generation (moderately complex)
  if (/write (a |an )?code|function|class|program|script/i.test(query)) {
    complexityScore += 1;
  }

  // FACTOR 6: Mathematical/logical problems (often complex)
  if (/solve|equation|proof|theorem|calculate|compute/i.test(query)) {
    complexityScore += 2;
  }

  // FACTOR 7: Context-based complexity
  if (context.hasTools) {
    // Tool usage suggests complexity
    complexityScore += 1;
  }

  if (context.conversationLength > 10) {
    // Long conversations may need better context tracking
    complexityScore += 1;
  }

  if (context.requiresMultipleSteps) {
    complexityScore += 2;
  }

  // DECISION THRESHOLD
  // Score >= 3 → complex (use 405B)
  // Score < 3 → simple (use 70B)
  return complexityScore >= 3 ? 'complex' : 'simple';
}

/**
 * Detect if task is text compression/summarization
 * @param {string} taskDescription - Description of the task
 * @returns {boolean} - True if this is a compression/summarization task
 */
function isTextCompression(taskDescription) {
  if (!taskDescription || typeof taskDescription !== 'string') {
    return false;
  }

  const compressionPatterns = [
    /summariz[e|ing]/i,
    /compress/i,
    /shorten/i,
    /condense/i,
    /brief/i,
    /tldr/i,
    /key points/i,
    /main ideas/i,
    /digest/i,
    /synopsis/i,
    /abstract/i,
    /executive summary/i
  ];

  return compressionPatterns.some(pattern => pattern.test(taskDescription));
}

/**
 * Select optimal Together AI model based on task
 * @param {string} query - The user's query
 * @param {object} options - Options { isCompression, context }
 * @returns {string} - Model name (70B or 405B)
 */
function selectTogetherModel(query, options = {}) {
  const { isCompression, context } = options;

  // RULE 1: Text compression always uses 70B (fast & efficient)
  if (isCompression) {
    console.log('📊 Model selection: 70B (text compression task)');
    return 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';
  }

  // RULE 2: Analyze query complexity
  const complexity = analyzeQueryComplexity(query, context);

  if (complexity === 'complex') {
    console.log('📊 Model selection: 405B (complex query detected)');
    return 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo';
  } else {
    console.log('📊 Model selection: 70B (simple query)');
    return 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';
  }
}

/**
 * Get model with provider prefix
 * @param {string} query - The user's query
 * @param {object} options - Options { isCompression, context, provider }
 * @returns {string} - Full model string with provider prefix
 */
function getOptimalModel(query, options = {}) {
  const { provider = 'together' } = options;
  const model = selectTogetherModel(query, options);
  
  // Return with provider prefix for llm_tools_adapter
  return `${provider}:${model}`;
}

module.exports = {
  analyzeQueryComplexity,
  isTextCompression,
  selectTogetherModel,
  getOptimalModel
};
