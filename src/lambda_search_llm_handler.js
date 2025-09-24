/**
 * AWS Lambda handler for intelligent search + LLM response with streaming support
 * Combines DuckDuckGo search functionality with LLM processing to provide
 * comprehensive answers with citations and source references
 */

// AWS Lambda Response Streaming (available as global in runtime)

// Import modularized components
const { getAllowedEmails, verifyGoogleToken } = require('./auth');
const { PROVIDERS, parseProviderModel, getProviderConfig } = require('./providers');
const { MemoryTracker, TokenAwareMemoryTracker } = require('./memory-tracker');
const { SimpleHTMLParser } = require('./html-parser');
const { DuckDuckGoSearcher } = require('./search');






// Memory management constants
// Infer memory limit from environment when possible
const LAMBDA_MEMORY_LIMIT_MB = (process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE && parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE, 10))
    || (process.env.LAMBDA_MEMORY && parseInt(process.env.LAMBDA_MEMORY, 10))
    || 128;
const MEMORY_SAFETY_BUFFER_MB = 16; // Reserve 16MB for other operations
const MAX_CONTENT_SIZE_MB = LAMBDA_MEMORY_LIMIT_MB - MEMORY_SAFETY_BUFFER_MB;
const BYTES_PER_MB = 1024 * 1024;

// System prompt configurations - now loaded from environment variables with fallbacks
const DEFAULT_SYSTEM_PROMPTS = {
    decision: process.env.SYSTEM_PROMPT_DECISION || 'You are a research planner. Your job is to decide if the question can be answered directly or if it needs a comprehensive research plan. When research is needed, produce a thorough set of sub-questions that, if answered, would fully answer the original question. For each sub-question, decide if web search is needed and, if so, provide 2-4 targeted search keywords/phrases tuned for web search quality. IMPORTANT: Respond with JSON ONLY and never include extra text.',
    direct: process.env.SYSTEM_PROMPT_DIRECT || 'You are a knowledgeable assistant. Answer the user\'s question directly based on your knowledge. Be comprehensive, informative, and thorough in your explanations.',
    search: process.env.SYSTEM_PROMPT_SEARCH || 'You are a comprehensive research assistant. Use all provided search results to answer questions thoroughly and completely. Always cite specific sources using the URLs provided when making factual claims. Synthesize information from multiple sources to provide the most complete picture possible. Format your response in a clear, well-organized manner that covers all important aspects of the topic.',
    digestAnalyst: process.env.SYSTEM_PROMPT_DIGEST_ANALYST || 'You are a thorough research analyst that extracts comprehensive information from search results. Capture all important details, facts, and insights that are relevant to the user\'s question. Be thorough and don\'t miss key information that could be valuable for the final answer.',
    continuationStrategist: process.env.SYSTEM_PROMPT_CONTINUATION_STRATEGIST || 'You are a thorough research strategist. Your job is to ensure no important information is missed. You should bias toward additional searches when they could meaningfully improve the comprehensiveness and quality of the final answer. Only stop when you are confident all key aspects are well-covered.'
};

const DEFAULT_DECISION_TEMPLATE = process.env.DECISION_TEMPLATE || `Analyze the user's question and decide if you can answer it directly or if a comprehensive research plan is required.

Return ONLY one of these JSON structures:

1) If you can answer directly without web search:
{"direct_response": "Your complete answer here"}

2) If research is required, return a plan of sub-questions. Each sub-question should reflect a specific aspect needed to fully answer the original question. For each sub-question, decide if web search is needed and, if so, provide 2-4 high-signal search keywords/phrases (no question words, just search-ready terms):
{"research_plan": {"questions": [
    {"question": "First sub-question", "should_search": true, "search_keywords": ["keyword1", "keyword2", "keyword3"]},
    {"question": "Second sub-question", "should_search": false}
]}}

Guidelines:
- Make the sub-questions comprehensive and collectively exhaustive; cover all important facets.
- Use should_search=true only when external information is required.
- When should_search=true, choose targeted keywords likely to retrieve authoritative sources.
- Do NOT include any text outside of the JSON.

Original question: "{{QUERY}}"`;

const DEFAULT_SEARCH_TEMPLATE = process.env.SEARCH_TEMPLATE || `Answer this question using the sources below. Cite URLs when stating facts.

Question: {{QUERY}}

Sources:
{{SEARCH_CONTEXT}}

Answer:`;

const COMPACT_SEARCH_TEMPLATE = `Q: {{QUERY}}

Sources:
{{SEARCH_CONTEXT}}

A:`;

// Additional prompt templates for search digest and continuation analysis
const DEFAULT_DIGEST_TEMPLATE = process.env.DIGEST_TEMPLATE || `Thoroughly analyze these search results for "{{SEARCH_QUERY}}" in context of the question "{{ORIGINAL_QUERY}}".

Extract ALL key information, facts, insights, and important details. Identify the most valuable and relevant findings that directly address the original question. Don't miss important nuances, data points, or perspectives.

Search Results:
{{SEARCH_CONTEXT}}

Provide a comprehensive summary (3-4 sentences) capturing the most important and relevant information found. Include specific details, numbers, dates, and key facts that would be valuable for answering the original question:`;

const DEFAULT_CONTINUATION_TEMPLATE = process.env.CONTINUATION_TEMPLATE || `Original Question: "{{ORIGINAL_QUERY}}"

Current Information Gathered:
{{CURRENT_KNOWLEDGE}}

Analyze if additional targeted searches would significantly improve the comprehensiveness and quality of the final answer.

Respond ONLY with valid JSON in one of these formats:

If you have comprehensive information covering ALL important aspects:
{"continue": false, "reason": "Complete coverage achieved across all key areas"}

If additional searches would add significant value (RECOMMENDED - up to 2 more queries):
{"continue": true, "reason": "Could benefit from more depth on X or coverage of Y", "next_queries": ["targeted search 1", "targeted search 2"]}

BIAS TOWARD THOROUGHNESS - Consider these factors:
- Are there multiple perspectives or viewpoints to explore?
- Could more recent developments or data enhance the answer?
- Are there specific sub-topics or related areas that need deeper coverage?
- Would expert opinions, case studies, or detailed examples strengthen the response?
- Are there potential counterarguments or alternative approaches to explore?
- Could technical details, implementation specifics, or practical applications be useful?

Err on the side of gathering MORE information rather than less. Quality comprehensive answers require thorough research.

JSON Response:`;

const DEFAULT_FINAL_TEMPLATE = process.env.FINAL_TEMPLATE || `Based on comprehensive multi-search research, provide the most complete and authoritative answer possible to this question.

Question: "{{ORIGINAL_QUERY}}"

Comprehensive Research Gathered from Multiple Sources:
{{ALL_INFORMATION}}

Please provide a thorough, expertly-crafted answer that:
1. COMPLETELY addresses the question from all important angles
2. Synthesizes information from ALL research sources intelligently
3. Includes specific facts, data, examples, and details from the research
4. Cites relevant sources with URLs when stating facts or claims
5. Covers different perspectives, approaches, or viewpoints where relevant
6. Is well-organized with clear structure and logical flow
7. Ensures no important aspects of the topic are left unaddressed
8. Provides depth and nuance appropriate to the complexity of the question

Create a comprehensive, authoritative response that demonstrates the full value of the extensive research conducted:`;







/**
 * LLM API client for processing search results
 */
class LLMClient {
    constructor(apiKey, systemPrompts = {}, templates = {}, allowEnvFallback = false) {
        this.accessSecret = process.env.ACCESS_SECRET;
        this.apiKey = apiKey;
        this.allowEnvFallback = !!allowEnvFallback;
        this.systemPrompts = {
            ...DEFAULT_SYSTEM_PROMPTS,
            ...systemPrompts
        };
        this.decisionTemplate = templates.decision || DEFAULT_DECISION_TEMPLATE;
        this.searchTemplate = templates.search || DEFAULT_SEARCH_TEMPLATE;
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000, // Start with 1 second
            maxDelay: 10000, // Max 10 seconds
            backoffMultiplier: 2,
            retryableErrors: ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE']
        };
    }

    /**
     * Determines if an error is retryable
     * @param {Error} error - The error to check
     * @returns {boolean} Whether the error should trigger a retry
     */
    isRetryableError(error) {
        // Network errors that might be transient
        if (this.retryConfig.retryableErrors.some(code => error.message.includes(code))) {
            return true;
        }
        
        // Rate limit errors (HTTP 429)
        if (error.message.includes('429')) {
            return true;
        }
        
        // Server errors (5xx) that might be temporary
        if (error.message.includes('500') || error.message.includes('502') || 
            error.message.includes('503') || error.message.includes('504')) {
            return true;
        }
        
        // Timeout errors
        if (error.message.toLowerCase().includes('timeout')) {
            return true;
        }
        
        return false;
    }

    /**
     * Calculate delay for retry with exponential backoff
     * @param {number} attemptNumber - Current attempt number (0-based)
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attemptNumber) {
        const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attemptNumber);
        return Math.min(delay, this.retryConfig.maxDelay);
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Promise that resolves after delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Process initial decision - whether to search or respond directly
     * @param {string} query - User's original question
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} Decision response with either 'response' or 'search_queries'
     */
    async processInitialDecision(query, options = {}) {
        const startTime = Date.now();
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            // Use provided API key; only fall back to env if allowed
            const rawApiKey = this.allowEnvFallback ? (this.apiKey || process.env[providerConfig.envKey]) : this.apiKey;
            if (!rawApiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }
            
            // Clean the API key by removing any whitespace and ensuring it's a valid string
            const apiKey = String(rawApiKey).trim();
            if (!apiKey) {
                throw new Error(`Invalid API key provided for provider: ${provider}`);
            }

            // Create the decision prompt using the template
            const prompt = this.decisionTemplate.replace('{{QUERY}}', query);
            
            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: this.systemPrompts.decision
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };

            const postData = JSON.stringify(requestBody);
            const requestOptions = {
                hostname: providerConfig.hostname,
                port: 443,
                path: providerConfig.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                const requestTimeout = setTimeout(() => {
                    reject(new Error(`Initial decision timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    let data = '';
                    const statusCode = res.statusCode;
                    
                    res.on('data', chunk => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        clearTimeout(requestTimeout);
                        const responseTime = Date.now() - startTime;
                        
                        try {
                            if (statusCode !== 200) {
                                const errorData = data ? JSON.parse(data) : {};
                                const errorMessage = errorData.error?.message || `HTTP ${statusCode}: ${data}`;
                                reject(new Error(`OpenAI API error (${statusCode}): ${errorMessage}`));
                                return;
                            }
                            
                            const response = JSON.parse(data);
                            
                            if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
                                reject(new Error('Invalid OpenAI response: missing or empty choices array'));
                                return;
                            }
                            
                            const content = response.choices[0]?.message?.content;
                            if (!content) {
                                reject(new Error('No content in OpenAI response'));
                                return;
                            }

                            // Parse the JSON response
                            let parsed;
                            try {
                                parsed = JSON.parse(content);
                            } catch (parseError) {
                                // Fallback: minimal plan with a single search on the original query
                                parsed = { research_plan: { questions: [ { question: query, should_search: true, search_keywords: [query] } ] } };
                            }

                            // Normalize into a stable shape for the caller
                            let normalized;
                            if (parsed.direct_response || parsed.response) {
                                normalized = { directResponse: parsed.direct_response || parsed.response, needsSearch: false };
                            } else if (Array.isArray(parsed.search_queries)) {
                                // Backward compatibility: treat as a single sub-question with keywords
                                normalized = { needsSearch: true, researchPlan: { questions: [ { question: query, should_search: true, search_keywords: parsed.search_queries } ] } };
                            } else if (parsed.research_plan && Array.isArray(parsed.research_plan.questions)) {
                                normalized = { needsSearch: true, researchPlan: parsed.research_plan };
                            } else {
                                // Fallback
                                normalized = { needsSearch: true, researchPlan: { questions: [ { question: query, should_search: true, search_keywords: [query] } ] } };
                            }

                            normalized.usage = response.usage;
                            resolve(normalized);
                            
                        } catch (parseError) {
                            reject(new Error(`Failed to parse initial decision response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Initial decision network error: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    clearTimeout(requestTimeout);
                    reject(new Error(`Initial decision socket timeout after ${timeout}ms`));
                });

                req.setTimeout(timeout);
                req.write(postData);
                req.end();
            });
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Build the decision prompt for initial LLM query
     * @param {string} query - User's original question
     * @returns {string} Formatted decision prompt
     */
    /**
     * Generate response directly without search
     * @param {string} query - User's question
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} LLM response with content and metadata
     */
    async generateResponseWithoutSearch(query, options = {}) {
        const startTime = Date.now();
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            // Use provided API key; only fall back to env if allowed
            const rawApiKey = this.allowEnvFallback ? (this.apiKey || process.env[providerConfig.envKey]) : this.apiKey;
            if (!rawApiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }
            
            // Clean the API key by removing any whitespace and ensuring it's a valid string
            const apiKey = String(rawApiKey).trim();
            if (!apiKey) {
                throw new Error(`Invalid API key provided for provider: ${provider}`);
            }

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: this.systemPrompts.direct
                    },
                    {
                        role: 'user',
                        content: query
                    }
                ]
            };

            const postData = JSON.stringify(requestBody);
            const requestOptions = {
                hostname: providerConfig.hostname,
                port: 443,
                path: providerConfig.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                const requestTimeout = setTimeout(() => {
                    reject(new Error(`Direct response timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    let data = '';
                    const statusCode = res.statusCode;
                    
                    res.on('data', chunk => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        clearTimeout(requestTimeout);
                        const responseTime = Date.now() - startTime;
                        
                        try {
                            if (statusCode !== 200) {
                                const errorData = data ? JSON.parse(data) : {};
                                const errorMessage = errorData.error?.message || `HTTP ${statusCode}: ${data}`;
                                reject(new Error(`OpenAI API error (${statusCode}): ${errorMessage}`));
                                return;
                            }
                            
                            const response = JSON.parse(data);
                            
                            if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
                                reject(new Error('Invalid OpenAI response: missing or empty choices array'));
                                return;
                            }
                            
                            const content = response.choices[0]?.message?.content;
                            if (!content) {
                                reject(new Error('No content in OpenAI response'));
                                return;
                            }

                            resolve({
                                content: content,
                                usage: response.usage,
                                processingTime: responseTime
                            });
                            
                        } catch (parseError) {
                            reject(new Error(`Failed to parse direct response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Direct response network error: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    clearTimeout(requestTimeout);
                    reject(new Error(`Direct response socket timeout after ${timeout}ms`));
                });

                req.setTimeout(timeout);
                req.write(postData);
                req.end();
            });
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Process with LLM with automatic retry logic
     * @param {string} originalQuery - User's original question
     * @param {Array} searchResults - Search results to process
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} LLM response
     */
    async processWithLLMWithRetry(originalQuery, searchResults, options = {}) {
        const startTime = Date.now();
        let lastError = null;
        
        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                const result = await this.processWithLLM(originalQuery, searchResults, options);
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // If this is the last attempt, throw the error
                if (attempt === this.retryConfig.maxRetries) {
                    throw error;
                }
                
                // Check if error is retryable
                if (!this.isRetryableError(error)) {
                    throw error;
                }
                
                // Calculate delay and wait before retry
                const delay = this.calculateRetryDelay(attempt);
                await this.sleep(delay);
            }
        }
        
        // This should never be reached, but just in case
        throw lastError || new Error('Unknown error in retry logic');
    }

    /**
     * Send query and search results to LLM for processing
     * @param {string} originalQuery - The user's original question
     * @param {Array} searchResults - Array of search results
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} LLM response
     */
    async processWithLLM(originalQuery, searchResults, options = {}) {
        const startTime = Date.now();
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000 // 30 second timeout for LLM requests
        } = options;

        console.log('🤖 LLM Processing Started:', {
            query: originalQuery.substring(0, 100) + (originalQuery.length > 100 ? '...' : ''),
            model,
            timeout,
            searchResultsCount: searchResults?.length || 0,
            timestamp: new Date().toISOString()
        });

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            // Use provided API key; only fall back to env if allowed
            const rawApiKey = this.allowEnvFallback ? (this.apiKey || process.env[providerConfig.envKey]) : this.apiKey;
            if (!rawApiKey || typeof rawApiKey !== 'string') {
                throw new Error(`Invalid or missing API key for provider: ${provider}`);
            }
            
            // Clean the API key by removing any whitespace and ensuring it's a valid string
            const apiKey = String(rawApiKey).trim();
            if (!apiKey) {
                throw new Error(`Invalid API key provided for provider: ${provider}`);
            }
            
            if (!originalQuery || typeof originalQuery !== 'string') {
                throw new Error('Invalid or missing query');
            }
            
            if (!Array.isArray(searchResults)) {
                throw new Error('Invalid search results format');
            }

            // Create the prompt with search context
            const prompt = this.buildPrompt(originalQuery, searchResults);
            
            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: this.systemPrompts.search
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };

            // Note: access_secret is not sent to OpenAI API - it's used for Lambda authorization only
            const postData = JSON.stringify(requestBody);
            const requestOptions = {
                hostname: providerConfig.hostname,
                port: 443,
                path: providerConfig.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                // Set up timeout for the request
                const requestTimeout = setTimeout(() => {
                    reject(new Error(`LLM API request timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    let data = '';
                    const statusCode = res.statusCode;
                    
                    res.on('data', chunk => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        clearTimeout(requestTimeout);
                        const responseTime = Date.now() - startTime;
                        
                        try {
                            if (statusCode !== 200) {
                                const errorData = data ? JSON.parse(data) : {};
                                const errorMessage = errorData.error?.message || `HTTP ${statusCode}: ${data}`;
                                reject(new Error(`OpenAI API error (${statusCode}): ${errorMessage}`));
                                return;
                            }
                            
                            const response = JSON.parse(data);
                            
                            if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
                                reject(new Error('Invalid OpenAI response: missing or empty choices array'));
                                return;
                            }
                            
                            const content = response.choices[0]?.message?.content;
                            if (!content) {
                                reject(new Error('No content in OpenAI response'));
                                return;
                            }

                            resolve({
                                choices: response.choices,
                                usage: response.usage,
                                model: response.model,
                                processingTime: responseTime
                            });
                            
                        } catch (parseError) {
                            reject(new Error(`Failed to parse LLM response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Network error during LLM request: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    clearTimeout(requestTimeout);
                    reject(new Error(`LLM request socket timeout after ${timeout}ms`));
                });

                req.setTimeout(timeout);
                
                try {
                    req.write(postData);
                    req.end();
                } catch (writeError) {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Failed to send request data: ${writeError.message}`));
                }
            });
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Build the prompt for the LLM with search context
     * @param {string} originalQuery - User's original question
     * @param {Array} searchResults - Search results to include
     * @returns {string} Formatted prompt
     */
    buildPrompt(originalQuery, searchResults) {
        // Use expanded format for higher token budget (32K)
        const searchContext = searchResults
            .slice(0, 8) // Increased to top 8 results for 32K token budget
            .map((result, index) => {
                // Progressive content loading - start with title and description
                let contextEntry = `${index + 1}. ${result.title}\n${result.url}`;
                
                // Add description if available (increased length for 32K tokens)
                if (result.description && result.description.length > 0) {
                    const shortDesc = result.description.slice(0, 300);
                    contextEntry += `\n${shortDesc}${result.description.length > 300 ? '...' : ''}`;
                }
                
                // Add content with higher token budget allowance
                if (result.content && result.content.length > 100) {
                    // Increased token estimation budget for 32K context
                    const estimatedTokens = Math.ceil((contextEntry + result.content).length / 4);
                    if (estimatedTokens < 25000) { // Leave 7K tokens for response
                        const shortContent = result.content.slice(0, 800); // Increased content length
                        contextEntry += `\nKey info: ${shortContent}${result.content.length > 800 ? '...' : ''}`;
                    }
                }
                
                return contextEntry;
            })
            .join('\n\n');

        // Use full template more often with 32K token budget, compact only for many results
        // But prioritize custom templates if they were provided
        let template;
        if (this.searchTemplate !== DEFAULT_SEARCH_TEMPLATE) {
            // Custom template provided, use it regardless of result count
            template = this.searchTemplate;
        } else {
            // Using default template, apply compact logic for efficiency
            template = searchResults.length > 6 ? COMPACT_SEARCH_TEMPLATE : this.searchTemplate;
        }
        return template
            .replace('{{QUERY}}', originalQuery)
            .replace('{{SEARCH_CONTEXT}}', searchContext);
    }

    /**
     * Pre-summarize long content before final LLM call
     * @param {string} content - Content to summarize
     * @param {string} query - Original query for context
     * @returns {Promise<string>} Summarized content
     */
    async summarizeContent(content, query) {
        if (!content || content.length < 3000) return content; // Increased threshold for 32K tokens

        // Local, safe summarization fallback: trim and keep most relevant leading content.
        // Avoid external API calls here to prevent missing-key failures.
        try {
            // Prefer keeping sentences whole up to ~2000 chars
            const trimmed = content.slice(0, 2200);
            const lastPeriod = trimmed.lastIndexOf('.')
            const cut = lastPeriod > 1200 ? lastPeriod + 1 : trimmed.length;
            return trimmed.slice(0, cut);
        } catch (error) {
            console.log(`Content summarization fallback failed: ${error.message}`);
            return content.slice(0, 2000);
        }
    }

    /**
     * Digest search results for a single search query
     * @param {string} searchQuery - The search query used
     * @param {Array} searchResults - Raw search results
     * @param {string} originalQuery - Original user question
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} Digested summary with key information
     */
    async digestSearchResults(searchQuery, searchResults, originalQuery, options = {}) {
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            // Use provided API key; only fall back to env if allowed
            const rawApiKey = this.allowEnvFallback ? (this.apiKey || process.env[providerConfig.envKey]) : this.apiKey;
            if (!rawApiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }
            
            // Clean the API key by removing any whitespace and ensuring it's a valid string
            const apiKey = String(rawApiKey).trim();
            if (!apiKey) {
                throw new Error(`Invalid API key provided for provider: ${provider}`);
            }

            // Format search results for digestion
            const searchContext = searchResults
                .slice(0, 5) // Focus on top 5 results
                .map((result, index) => {
                    let contextEntry = `${index + 1}. ${result.title}\n${result.url}`;
                    if (result.description) {
                        contextEntry += `\n${result.description.slice(0, 200)}`;
                    }
                    if (result.content) {
                        contextEntry += `\nContent: ${result.content.slice(0, 400)}`;
                    }
                    return contextEntry;
                })
                .join('\n\n');

            const digestPrompt = DEFAULT_DIGEST_TEMPLATE
                .replace('{{SEARCH_QUERY}}', searchQuery)
                .replace('{{ORIGINAL_QUERY}}', originalQuery)
                .replace('{{SEARCH_CONTEXT}}', searchContext);

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: DEFAULT_SYSTEM_PROMPTS.digestAnalyst
                    },
                    {
                        role: 'user',
                        content: digestPrompt
                    }
                ],
                max_tokens: 300,
                temperature: 0.3
            };

            const postData = JSON.stringify(requestBody);
            const requestOptions = {
                hostname: providerConfig.hostname,
                port: 443,
                path: providerConfig.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                const requestTimeout = setTimeout(() => {
                    reject(new Error(`Search digest timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    clearTimeout(requestTimeout);
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            const content = response.choices?.[0]?.message?.content || 'No summary available';
                            
                            // Extract top 2 links with titles
                            const links = searchResults.slice(0, 2).map(result => ({
                                title: result.title,
                                url: result.url,
                                snippet: result.description ? result.description.slice(0, 100) + '...' : ''
                            }));
                            
                            resolve({
                                searchQuery,
                                summary: content,
                                links,
                                rawResults: searchResults
                            });
                        } catch (parseError) {
                            reject(new Error(`Failed to parse digest response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Digest network error: ${error.message}`));
                });

                req.setTimeout(timeout);
                req.write(postData);
                req.end();
            });
        } catch (error) {
            throw error;
        }
    }

    /**
     * Determine if additional searches are needed based on current information
     * @param {string} originalQuery - Original user question
     * @param {Array} digestedResults - Array of digested search results
     * @param {number} currentIteration - Current search iteration (0-based)
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} Decision on whether to continue searching
     */
    async shouldContinueSearching(originalQuery, digestedResults, currentIteration, options = {}) {
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        // Always stop after 3 iterations
        if (currentIteration >= 3) {
            return { 
                continue: false, 
                reason: 'Maximum search iterations reached',
                nextQueries: []
            };
        }

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            // Use provided API key; only fall back to env if allowed
            const rawApiKey = this.allowEnvFallback ? (this.apiKey || process.env[providerConfig.envKey]) : this.apiKey;
            if (!rawApiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }
            
            // Clean the API key by removing any whitespace and ensuring it's a valid string
            const apiKey = String(rawApiKey).trim();
            if (!apiKey) {
                throw new Error(`Invalid API key provided for provider: ${provider}`);
            }

            // Format current knowledge
            const currentKnowledge = digestedResults.map((digest, index) => {
                return `Search ${index + 1} (${digest.searchQuery}): ${digest.summary}`;
            }).join('\n\n');

            const continuationPrompt = DEFAULT_CONTINUATION_TEMPLATE
                .replace('{{ORIGINAL_QUERY}}', originalQuery)
                .replace('{{CURRENT_KNOWLEDGE}}', currentKnowledge);

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: DEFAULT_SYSTEM_PROMPTS.continuationStrategist
                    },
                    {
                        role: 'user',
                        content: continuationPrompt
                    }
                ],
                max_tokens: 150,
                temperature: 0.1
            };

            const postData = JSON.stringify(requestBody);
            const requestOptions = {
                hostname: providerConfig.hostname,
                port: 443,
                path: providerConfig.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                const requestTimeout = setTimeout(() => {
                    reject(new Error(`Continuation decision timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    clearTimeout(requestTimeout);
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            const content = response.choices?.[0]?.message?.content;
                            
                            let decision;
                            try {
                                decision = JSON.parse(content);
                            } catch (parseError) {
                                // Default to not continuing if parsing fails
                                decision = { 
                                    continue: false, 
                                    reason: 'Parse error - stopping search'
                                };
                            }
                            
                            resolve(decision);
                        } catch (parseError) {
                            reject(new Error(`Failed to parse continuation response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Continuation decision network error: ${error.message}`));
                });

                req.setTimeout(timeout);
                req.write(postData);
                req.end();
            });
        } catch (error) {
            throw error;
        }
    }

    /**
     * Generate final response using all gathered information
     * @param {string} originalQuery - Original user question
     * @param {Array} digestedResults - Array of digested search results
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} Final comprehensive response
     */
    async generateFinalResponse(originalQuery, digestedResults, options = {}) {
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            // Use provided API key; only fall back to env if allowed
            const rawApiKey = this.allowEnvFallback ? (this.apiKey || process.env[providerConfig.envKey]) : this.apiKey;
            if (!rawApiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }
            
            // Clean the API key by removing any whitespace and ensuring it's a valid string
            const apiKey = String(rawApiKey).trim();
            if (!apiKey) {
                throw new Error(`Invalid API key provided for provider: ${provider}`);
            }

            // Combine all gathered information
            const allInformation = digestedResults.map((digest, index) => {
                const links = digest.links.map(link => `${link.title} (${link.url})`).join(', ');
                return `Research ${index + 1} - ${digest.searchQuery}:\n${digest.summary}\nSources: ${links}`;
            }).join('\n\n');

            const finalPrompt = DEFAULT_FINAL_TEMPLATE
                .replace('{{ORIGINAL_QUERY}}', originalQuery)
                .replace('{{ALL_INFORMATION}}', allInformation);

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: this.systemPrompts.search
                    },
                    {
                        role: 'user',
                        content: finalPrompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.7
            };

            const postData = JSON.stringify(requestBody);
            const requestOptions = {
                hostname: providerConfig.hostname,
                port: 443,
                path: providerConfig.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                const requestTimeout = setTimeout(() => {
                    reject(new Error(`Final response timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    clearTimeout(requestTimeout);
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            resolve({
                                choices: response.choices,
                                usage: response.usage,
                                model: response.model
                            });
                        } catch (parseError) {
                            reject(new Error(`Failed to parse final response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Final response network error: ${error.message}`));
                });

                req.setTimeout(timeout);
                req.write(postData);
                req.end();
            });
        } catch (error) {
            throw error;
        }
    }
}

/**
 * Legacy streaming handler (replaced by awslambda.streamifyResponse)
 */
const legacyStreamingHandler = async (event, responseStream, context) => {
    const startTime = Date.now();
    
    console.log('streamingHandler - responseStream type:', typeof responseStream);
    console.log('streamingHandler - responseStream methods:', responseStream ? Object.getOwnPropertyNames(responseStream) : 'null');
    
    try {
        // Set up headers for Server-Sent Events
        if (typeof responseStream.setContentType === 'function') {
            responseStream.setContentType('text/event-stream');
        }
        if (typeof responseStream.setHeader === 'function') {
            responseStream.setHeader('Cache-Control', 'no-cache');
            responseStream.setHeader('Connection', 'keep-alive');
            responseStream.setHeader('Access-Control-Allow-Origin', '*');
            responseStream.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, origin, accept');
            responseStream.setHeader('Access-Control-Allow-Methods', '*');
        }
    } catch (headerError) {
        console.error('Error setting headers:', headerError);
    }
    
    try {
        // Initialize query variable for error handling
        let query = '';
        let user = null;
        let allowEnvFallback = false;
        
        // Helper function to write events to the stream
        function writeEvent(type, data) {
            try {
                const eventText = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
                responseStream.write(eventText);
            } catch (writeError) {
                console.error('Stream write error:', writeError);
            }
        }
        
        // Send initial connection message
        writeEvent('log', {
            message: 'Connected! Processing request...',
            timestamp: new Date().toISOString()
        });
        
        // Extract parameters from request (POST only)
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        
        if (httpMethod !== 'POST') {
            writeEvent('error', {
                error: 'Method not allowed. Only POST requests are supported.',
                timestamp: new Date().toISOString()
            });
            responseStream.end();
            return;
        }
        
        const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        const limit = parseInt(body.limit) || 10;
        const fetchContent = body.fetchContent || false;
        const timeout = parseInt(body.timeout) || 30000;
        const model = body.model || 'groq:llama-3.1-8b-instant';
        const accessSecret = body.accessSecret || '';
        const apiKey = body.apiKey || '';
        const searchMode = body.searchMode || 'web_search';
        const googleToken = body.google_token || body.googleToken || null;

        // Authentication check
        if (process.env.ACCESS_SECRET) {
            if (!accessSecret || accessSecret !== process.env.ACCESS_SECRET) {
                writeEvent('error', {
                    error: 'Invalid or missing accessSecret',
                    code: 'INVALID_ACCESS_SECRET',
                    timestamp: new Date().toISOString()
                });
                responseStream.end();
                return;
            }
        }

        // Google token verification
        if (googleToken) {
            const verified = verifyGoogleToken(googleToken);
            const allowedEmails = getAllowedEmails();
            const whitelistEnabled = Array.isArray(allowedEmails) && allowedEmails.length > 0;
            
            if (verified && whitelistEnabled) {
                user = verified;
            }
            allowEnvFallback = !!(verified && whitelistEnabled);
        }
        
        if (!query) {
            writeEvent('error', {
                error: 'Query parameter is required',
                timestamp: new Date().toISOString()
            });
            responseStream.end();
            return;
        }
        
        if (!apiKey && !allowEnvFallback) {
            writeEvent('error', {
                error: 'API key required. Sign in with an allowed Google account or provide an apiKey.',
                code: 'NO_API_KEY',
                timestamp: new Date().toISOString()
            });
            responseStream.end();
            return;
        }

        // Send initialization event
        writeEvent('init', {
            query: query,
            model: model,
            searchMode: searchMode,
            user: user ? { email: user.email, name: user.name } : null,
            timestamp: new Date().toISOString()
        });

        // Create a stream adapter for real-time streaming
        const streamAdapter = {
            writeEvent: writeEvent,
            write: (data) => writeEvent('data', data)
        };
        
        // Send immediate feedback
        writeEvent('step', {
            type: 'starting',
            message: 'Starting search and analysis...',
            timestamp: new Date().toISOString()
        });
        
        // Process the request with real-time streaming
        const finalResult = await executeMultiSearchWithStreaming(
            query, 
            limit, 
            fetchContent, 
            timeout, 
            model, 
            accessSecret, 
            apiKey, 
            searchMode,
            null,
            null,
            null,
            streamAdapter,
            allowEnvFallback
        );
        
        // Send final completion event
        writeEvent('complete', {
            result: finalResult,
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
        });
        
        responseStream.end();
        
    } catch (error) {
        const writeEvent = (type, data) => {
            try {
                const eventText = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
                responseStream.write(eventText);
            } catch (writeError) {
                console.error('Stream write error:', writeError);
            }
        };
        
        writeEvent('error', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        responseStream.end();
    }
};

// Using native Lambda Response Streaming for real-time SSE

/**
 * Main Lambda handler function (streamified). Streams SSE when requested,
 * otherwise responds with JSON. Keeps CORS-friendly headers.
 */
exports.handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    const startTime = Date.now();
    try {
        const accept = event.headers?.['accept'] || event.headers?.['Accept'] || '';
        const wantsSSE = accept.includes('text/event-stream') || event.queryStringParameters?.stream === 'true';

        if (wantsSSE) {
            // Delegate to legacy streaming handler that writes SSE events progressively
            return await legacyStreamingHandler(event, responseStream, context);
        }

        // Non-streaming JSON path: reuse existing logic and write body once
        const result = await handleNonStreamingRequest(event, context, startTime);
        try {
            if (typeof responseStream.setContentType === 'function') responseStream.setContentType('application/json');
            if (typeof responseStream.setHeader === 'function') {
                responseStream.setHeader('Cache-Control', 'no-cache');
                responseStream.setHeader('Connection', 'keep-alive');
                responseStream.setHeader('Access-Control-Allow-Origin', '*');
                responseStream.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, origin, accept');
                responseStream.setHeader('Access-Control-Allow-Methods', '*');
            }
        } catch (headerErr) {
            console.error('Error setting JSON headers:', headerErr);
        }
        responseStream.write(result?.body || '');
        responseStream.end();
    } catch (err) {
        // Ensure we always end the stream even on error
        try {
            if (typeof responseStream.setContentType === 'function') responseStream.setContentType('application/json');
        } catch {}
        const payload = { error: err?.message || 'Unhandled error' };
        try { responseStream.write(JSON.stringify(payload)); } catch {}
        try { responseStream.end(); } catch {}
    }
});

/**
 * Create a streaming response accumulator
 */
class StreamingResponse {
    constructor() {
        this.chunks = [];
    }
    
    write(data) {
        this.chunks.push(`data: ${JSON.stringify(data)}\n\n`);
    }
    
    writeEvent(type, data) {
        this.chunks.push(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    
    getResponse() {
        return this.chunks.join('');
    }
}

/**
 * Handle streaming requests with Server-Sent Events
 */
async function handleStreamingRequest(event, context, startTime) {
    const stream = new StreamingResponse();
    
    try {
        const initialMemory = process.memoryUsage();
        stream.writeEvent('log', {
            message: `Lambda handler started. Initial memory: RSS=${Math.round(initialMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(initialMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB`,
            timestamp: new Date().toISOString()
        });
    } catch (memoryError) {
        stream.writeEvent('log', {
            message: `Lambda handler started. Memory logging error: ${memoryError.message}`,
            timestamp: new Date().toISOString()
        });
    }
    
    // Initialize query variable for error handling
    let query = '';
    let user = null;
    let allowEnvFallback = false;
    
    try {
        // Extract parameters from request (POST only)
        let limit, fetchContent, timeout, model, accessSecret, apiKey, searchMode;
        
        // Extract the HTTP method (support both API Gateway and Function URL formats)
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        
        if (httpMethod !== 'POST') {
            stream.writeEvent('error', {
                error: 'Method not allowed. Only POST requests are supported.',
                timestamp: new Date().toISOString()
            });
            
            return {
                statusCode: 405,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                body: stream.getResponse()
            };
        }
        
    const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        limit = parseInt(body.limit) || 10;
        fetchContent = body.fetchContent || false;
        timeout = parseInt(body.timeout) || 30000;
        model = body.model || 'groq:llama-3.1-8b-instant';
        accessSecret = body.accessSecret || '';
        apiKey = body.apiKey || '';
        searchMode = body.searchMode || 'web_search';
        const googleToken = body.google_token || body.googleToken || null;

        // If server has ACCESS_SECRET set, require clients to provide it. Do NOT affect env-key fallback.
        if (process.env.ACCESS_SECRET) {
            if (!accessSecret || accessSecret !== process.env.ACCESS_SECRET) {
                stream.writeEvent('error', {
                    error: 'Invalid or missing accessSecret',
                    code: 'INVALID_ACCESS_SECRET',
                    timestamp: new Date().toISOString()
                });
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    },
                    body: stream.getResponse()
                };
            }
        }

        // Determine if user is allowed to use server-side API keys
        let tokenExpired = false;
        if (googleToken) {
            // First, let's check if the token appears to be expired by parsing it ourselves
            try {
                const base64Url = googleToken.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(
                    Buffer.from(base64, 'base64')
                        .toString()
                        .split('')
                        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                        .join('')
                );
                const payload = JSON.parse(jsonPayload);
                const now = Math.floor(Date.now() / 1000);
                tokenExpired = payload.exp < now;
            } catch (parseError) {
                // If we can't parse the token, let the regular verification handle it
            }
            
            if (tokenExpired) {
                stream.writeEvent('error', {
                    error: 'Google token has expired. Please clear your browser cache, refresh the page, and sign in again.',
                    code: 'TOKEN_EXPIRED',
                    timestamp: new Date().toISOString()
                });
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    },
                    body: stream.getResponse()
                };
            }
            
            const verified = verifyGoogleToken(googleToken);
            const allowedEmails = getAllowedEmails();
            const whitelistEnabled = Array.isArray(allowedEmails) && allowedEmails.length > 0;
            
            if (verified && whitelistEnabled) {
                user = verified;
            }
            // Combine sources: accessSecret OR verified allowlisted googleToken
            allowEnvFallback = !!(allowEnvFallback || (verified && whitelistEnabled));
            try {
                stream.writeEvent('log', {
                    message: `Auth Debug: googleToken length=${googleToken?.length}, verified=${!!verified}, whitelistEnabled=${whitelistEnabled}, allowedEmails=[${allowedEmails.join(', ')}], allowEnvFallback=${allowEnvFallback}, email=${verified?.email || 'n/a'}, tokenExpired=${tokenExpired}`,
                    timestamp: new Date().toISOString()
                });
            } catch {}
        } else {
            try {
                stream.writeEvent('log', {
                    message: `Auth Debug: No googleToken provided`,
                    timestamp: new Date().toISOString()
                });
            } catch {}
        }
        
        stream.writeEvent('log', {
            message: `Processing request for query: "${query}" with model: ${model}`,
            timestamp: new Date().toISOString()
        });
        
        // Validate required parameters
        if (!query) {
            stream.writeEvent('error', {
                error: 'Query parameter is required',
                timestamp: new Date().toISOString()
            });
            
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                body: stream.getResponse()
            };
        }
        
        // Enforce auth for server-side usage: require apiKey unless allowEnvFallback is true
        if (!apiKey && !allowEnvFallback) {
            stream.writeEvent('error', {
                error: 'API key required. Sign in with an allowed Google account or provide an apiKey.',
                code: 'NO_API_KEY',
                timestamp: new Date().toISOString()
            });
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                body: stream.getResponse()
            };
        }

        // Initialize streaming response data
        const streamingResults = {
            query: query,
            searches: [],
            finalResponse: null,
            metadata: {
                searchMode: searchMode,
                model: model,
                iterations: 0,
                maxIterations: 3,
                totalSearchResults: 0
            }
        };
        
    stream.writeEvent('init', { ...streamingResults, user: user ? { email: user.email, name: user.name } : null, allowEnvFallback });

        // Do not emit an empty initial snapshot; the client will render once real results arrive
        
        // Start the multi-search process with immediate streaming feedback
        const finalResult = await executeMultiSearchWithRealTimeStreaming(
            query, 
            limit, 
            fetchContent, 
            timeout, 
            model, 
            accessSecret, 
            apiKey, 
            searchMode,
            null, // No custom systemPrompts
            null, // No custom decisionTemplate  
            null, // No custom searchTemplate
            stream,
            allowEnvFallback
        );
        
        // Send final completion event
        stream.writeEvent('complete', {
            result: finalResult,
            allResults: finalResult.searchResults,
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
        });
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Transfer-Encoding': 'chunked'
            },
            body: stream.getResponse()
        };
        
    } catch (error) {
        stream.writeEvent('error', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            },
            body: stream.getResponse()
        };
    }
}

/**
 * Handle streaming requests with AWS Lambda Response Streaming
 */
async function handleNativeStreamingRequest(event, responseStream, context, startTime) {
    // Use the existing streaming logic but return the buffered response for now
    // This is a fallback until we can properly implement native streaming
    return await handleStreamingRequest(event, context, startTime);
}

/**
 * Execute multi-search with immediate streaming feedback
 */
async function executeMultiSearchWithRealTimeStreaming(
    query, 
    limit, 
    fetchContent, 
    timeout, 
    model, 
    accessSecret, 
    apiKey, 
    searchMode,
    systemPrompts,
    decisionTemplate,
    searchTemplate,
    stream,
    allowEnvFallback = false
) {
    // Start sending immediate feedback
    stream.writeEvent('step', {
        type: 'starting',
        message: 'Starting search and analysis...',
        timestamp: new Date().toISOString()
    });
    
    // Simulate immediate response for better UX
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return await executeMultiSearchWithStreaming(
        query, 
        limit, 
        fetchContent, 
        timeout, 
        model, 
        accessSecret, 
        apiKey, 
        searchMode,
        systemPrompts,
        decisionTemplate,
        searchTemplate,
        stream,
        allowEnvFallback
    );
}

/**
 * Execute multi-search with streaming updates
 */
async function executeMultiSearchWithStreaming(
    query, 
    limit, 
    fetchContent, 
    timeout, 
    model, 
    accessSecret, 
    apiKey, 
    searchMode,
    systemPrompts,
    decisionTemplate,
    searchTemplate,
    stream,
    allowEnvFallback = false
) {
    let allSearchResults = [];
    let searchesPerformed = [];
    const maxIterations = 3;
    // Prepare a shared LLM client for digests and final generation
    const llmClient = new LLMClient(
        apiKey,
        systemPrompts || {},
        { search: searchTemplate },
        allowEnvFallback
    );
    
    try {
        // Process initial decision to get search terms
        if (stream) {
            stream.writeEvent('step', {
                type: 'initial_decision',
                message: 'Analyzing query to determine search strategy...',
                timestamp: new Date().toISOString()
            });
        }
        
        const initialDecision = await processInitialDecision(
            query, 
            model, 
            accessSecret, 
            apiKey, 
            systemPrompts, 
            decisionTemplate,
            allowEnvFallback
        );
        
        if (stream) {
            stream.writeEvent('decision', {
                decision: initialDecision,
                timestamp: new Date().toISOString()
            });
        }
        
    // If direct response is possible, return it
    if (!initialDecision.needsSearch && initialDecision.directResponse) {
            if (stream) {
                stream.writeEvent('final_response', {
                    response: initialDecision.directResponse,
                    totalResults: 0,
                    searchIterations: 0,
                    timestamp: new Date().toISOString()
                });
            }
            
            return {
                query: query,
                searches: [],
                searchResults: [],
                response: initialDecision.directResponse,
                metadata: {
                    totalResults: 0,
                    searchIterations: 0,
                    finalModel: model,
                    searchMode: 'direct',
                    directResponse: true
                }
            };
        }
        
        // Prepare research plan with sub-questions and keywords
        const planQuestions = (initialDecision.researchPlan && Array.isArray(initialDecision.researchPlan.questions))
            ? initialDecision.researchPlan.questions
            : [{ question: query, should_search: true, search_keywords: [query] }];

        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            if (stream) {
                stream.writeEvent('step', {
                    type: 'search_iteration',
                    iteration: iteration,
                    message: `Starting search iteration ${iteration}/${maxIterations}...`,
                    timestamp: new Date().toISOString()
                });
            }
            
            // For iteration 1, execute planned sub-questions; later iterations can add expansions if needed
            const currentItems = iteration === 1 ? planQuestions : await generateAdditionalSearchTerms(query, allSearchResults, model, accessSecret, apiKey);

            for (let i = 0; i < currentItems.length; i++) {
                const item = currentItems[i];
                const subQuestion = typeof item === 'string' ? item : (item.question || item);
                const shouldSearch = typeof item === 'string' ? true : (item.should_search !== false);
                const keywords = Array.isArray(item.search_keywords) && item.search_keywords.length ? item.search_keywords : [subQuestion];
                const searchTerm = keywords.join(' ');
                
                if (stream) {
                    stream.writeEvent('search', {
                        term: searchTerm,
                        iteration: iteration,
                        searchIndex: i + 1,
                        totalSearches: currentItems.length,
                        subQuestion: subQuestion,
                        keywords,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Perform the search
                const searchResults = shouldSearch ? await performSearch(
                    searchTerm, 
                    limit, 
                    fetchContent, 
                    timeout, 
                    searchMode
                ) : [];
                
                allSearchResults.push(...searchResults);
                const searchRecord = {
                    iteration: iteration,
                    query: searchTerm,
                    resultsCount: searchResults.length,
                    subQuestion,
                    keywords
                };
                searchesPerformed.push(searchRecord);
                
                if (stream) {
                    // Send full results for this search and cumulative snapshot for live UI
                    stream.writeEvent('search_results', {
                        term: searchTerm,
                        iteration: iteration,
                        resultsCount: searchResults.length,
                        results: searchResults,
                        cumulativeResultsCount: allSearchResults.length,
                        allResults: allSearchResults,
                        searches: searchesPerformed,
                        subQuestion,
                        keywords,
                        timestamp: new Date().toISOString()
                    });

                    // Also compute and stream a digest summary for this specific search
                    try {
                        const digest = shouldSearch ? await llmClient.digestSearchResults(searchTerm, searchResults, query, { model }) : { summary: 'No web search needed for this sub-question.', links: [] };
                        // Attach to the latest search record so future snapshots include it if needed
                        searchRecord.summary = digest.summary || digest?.summary || '';
                        searchRecord.links = digest.links || [];
                        // Emit a dedicated event for immediate UI update
                        stream.writeEvent('search_digest', {
                            term: searchTerm,
                            iteration,
                            summary: searchRecord.summary,
                            links: searchRecord.links,
                            subQuestion,
                            keywords,
                            timestamp: new Date().toISOString()
                        });
                    } catch (digestError) {
                        // Non-fatal; just log and continue
                        stream.writeEvent('log', {
                            message: `Digest failed for term "${searchTerm}": ${digestError.message}`,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
            
            // Check if we should continue searching
            if (stream) {
                stream.writeEvent('step', {
                    type: 'continuation_check',
                    message: 'Evaluating if additional searches are needed...',
                    timestamp: new Date().toISOString()
                });
            }
            
            const shouldContinue = await shouldContinueSearching(
                query, 
                allSearchResults, 
                iteration, 
                maxIterations, 
                model, 
                accessSecret, 
                apiKey, 
                systemPrompts
            );
            
            if (stream) {
                stream.writeEvent('continuation', {
                    shouldContinue: shouldContinue.shouldContinue,
                    reasoning: shouldContinue.reasoning,
                    iteration: iteration,
                    totalResultsSoFar: allSearchResults.length,
                    searchesPerformed: searchesPerformed,
                    timestamp: new Date().toISOString()
                });
            }
            
            if (!shouldContinue.shouldContinue) {
                if (stream) {
                    stream.writeEvent('step', {
                        type: 'search_complete',
                        message: `Search process completed after ${iteration} iterations`,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
            }
        }
        
        // Generate final response
        if (stream) {
            stream.writeEvent('step', {
                type: 'final_generation',
                message: 'Generating comprehensive response...',
                timestamp: new Date().toISOString()
            });
        }
        
        const finalResponse = await generateFinalResponse(
            query, 
            allSearchResults, 
            model, 
            accessSecret, 
            apiKey, 
            systemPrompts, 
            searchTemplate,
            allowEnvFallback
        );
        
        // Prepare final result
        const result = {
            query: query,
            searches: searchesPerformed,
            searchResults: allSearchResults,
            response: finalResponse,
            metadata: {
                totalResults: allSearchResults.length,
                searchIterations: searchesPerformed.length,
                finalModel: model,
                searchMode: searchMode
            }
        };
        
        if (stream) {
            stream.writeEvent('final_response', {
                response: finalResponse,
                totalResults: allSearchResults.length,
                searchIterations: searchesPerformed.length,
                timestamp: new Date().toISOString(),
                searchResults: allSearchResults,
                searches: searchesPerformed
            });
        }
        
        return result;
        
    } catch (error) {
        if (stream) {
            stream.writeEvent('error', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        }
        throw error;
    }
}

/**
 * Generate additional search terms for subsequent iterations
 */
async function generateAdditionalSearchTerms(query, existingResults, model, accessSecret, apiKey) {
    // Expand by extracting high-signal tokens from previous result titles and descriptions
    try {
        const tokens = new Map();
        const addTokensFrom = (text) => {
            (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).forEach(t => {
                if (t.length > 3) tokens.set(t, (tokens.get(t) || 0) + 1);
            });
        };
        existingResults.slice(-8).forEach(r => { addTokensFrom(r.title); addTokensFrom(r.description); });
        const top = [...tokens.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([t])=>t);
        if (top.length) {
            const expanded = [top.join(' ')];
            if (top.length >= 4) expanded.push(top.slice(0,4).join(' '));
            return expanded;
        }
    } catch {}
    // Fallback to the original query
    return [query];
}

/**
 * Process initial decision to determine search strategy
 */
async function processInitialDecision(query, model, accessSecret, apiKey, systemPrompts = null, decisionTemplate = null, allowEnvFallback = false) {
    // Use default templates and prompts
    const llmClient = new LLMClient(apiKey, {}, {}, allowEnvFallback);
    
    try {
        const normalized = await llmClient.processInitialDecision(query, { model });
        // normalized has shape { needsSearch:boolean, directResponse?, researchPlan? }
        if (!normalized.needsSearch && normalized.directResponse) {
            return { needsSearch: false, directResponse: normalized.directResponse, usage: normalized.usage };
        }
        if (normalized.researchPlan) {
            return { needsSearch: true, researchPlan: normalized.researchPlan, usage: normalized.usage };
        }
        return { needsSearch: true, researchPlan: { questions: [ { question: query, should_search: true, search_keywords: [query] } ] }, usage: normalized.usage };
    } catch (error) {
        console.error('Initial decision error:', error);
        // Fallback to search mode
        return {
            needsSearch: true,
            researchPlan: { questions: [ { question: query, should_search: true, search_keywords: [query] } ] }
        };
    }
}

/**
 * Perform search using DuckDuckGo
 */
async function performSearch(searchTerm, limit, fetchContent, timeout, searchMode) {
    try {
        // Add a small random delay to avoid being detected as bot
        const delay = Math.floor(Math.random() * 1000) + 500; // 500-1500ms delay
        await new Promise(resolve => setTimeout(resolve, delay));
        
        const searcher = new DuckDuckGoSearcher();
        const searchResult = await searcher.search(searchTerm, limit, fetchContent, timeout);
        return searchResult.results || [];
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

/**
 * Check if we should continue searching
 */
async function shouldContinueSearching(query, allSearchResults, iteration, maxIterations, model, accessSecret, apiKey, systemPrompts = null) {
    // Simple logic for now - stop after 2 iterations or if we have enough results
    if (iteration >= 2 || allSearchResults.length >= 15) {
        return {
            shouldContinue: false,
            reasoning: `Stopping after ${iteration} iterations with ${allSearchResults.length} results`
        };
    }
    
    return {
        shouldContinue: true,
        reasoning: `Continuing search to gather more comprehensive information`
    };
}

/**
 * Generate final response from search results
 */
async function generateFinalResponse(query, allSearchResults, model, accessSecret, apiKey, systemPrompts = null, searchTemplate = null, allowEnvFallback = false) {
    // Create LLMClient with proper system prompts and search template
    const llmClient = new LLMClient(apiKey, systemPrompts || {}, { search: searchTemplate }, allowEnvFallback);
    
    try {
        const response = await llmClient.processWithLLMWithRetry(query, allSearchResults, { model });
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Final response generation error:', error);
        
        // Fallback response
        const resultSummary = allSearchResults.slice(0, 5).map((result, index) => 
            `${index + 1}. ${result.title} (${result.url})\n${result.description || 'No description available'}`
        ).join('\n\n');
        
        return `Based on search results for "${query}":\n\n${resultSummary}\n\nNote: Full AI processing encountered an error, but these search results provide relevant information.`;
    }
}

/**
 * Handle non-streaming requests (original behavior)
 */
async function handleNonStreamingRequest(event, context, startTime) {
    const initialMemory = process.memoryUsage();
    console.log(`Lambda handler started. Initial memory: RSS=${Math.round(initialMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(initialMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB`);
    
    let query = '';
    let allowEnvFallback = false;
    
    try {
        // Extract parameters from request
        let limit, fetchContent, timeout, model, accessSecret, apiKey, searchMode;
        
        // Extract the HTTP method (support both API Gateway and Function URL formats)
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        
        if (httpMethod === 'OPTIONS') {
            // Let AWS Lambda Function URL handle CORS preflight
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: ''
            };
        }
        
        if (httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Method not allowed. Only POST requests are supported.',
                    timestamp: new Date().toISOString()
                })
            };
        }
        
    const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        limit = parseInt(body.limit) || 10;
        fetchContent = body.fetchContent || false;
        timeout = parseInt(body.timeout) || 30000;
        model = body.model || 'groq:llama-3.1-8b-instant';
        accessSecret = body.accessSecret || '';
        apiKey = body.apiKey || '';
        searchMode = body.searchMode || 'web_search';
        const googleToken = body.google_token || body.googleToken || null;
        // If server has ACCESS_SECRET set, require clients to provide it. Do NOT affect env-key fallback.
        if (process.env.ACCESS_SECRET) {
            if (!accessSecret || accessSecret !== process.env.ACCESS_SECRET) {
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        error: 'Invalid or missing accessSecret',
                        code: 'INVALID_ACCESS_SECRET',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }
        let tokenExpired = false;
        if (googleToken) {
            // First, let's check if the token appears to be expired by parsing it ourselves
            try {
                const base64Url = googleToken.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(
                    Buffer.from(base64, 'base64')
                        .toString()
                        .split('')
                        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                        .join('')
                );
                const payload = JSON.parse(jsonPayload);
                const now = Math.floor(Date.now() / 1000);
                tokenExpired = payload.exp < now;
            } catch (parseError) {
                // If we can't parse the token, let the regular verification handle it
            }
            
            if (tokenExpired) {
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        error: 'Google token has expired. Please clear your browser cache, refresh the page, and sign in again.',
                        code: 'TOKEN_EXPIRED',
                        timestamp: new Date().toISOString()
                    })
                };
            }
            
            const verified = verifyGoogleToken(googleToken);
            const allowedEmails = getAllowedEmails();
            const whitelistEnabled = Array.isArray(allowedEmails) && allowedEmails.length > 0;
            
            // Combine sources: accessSecret OR verified allowlisted googleToken
            allowEnvFallback = !!(allowEnvFallback || (verified && whitelistEnabled));
            console.log(`Auth Debug (non-streaming): googleToken length=${googleToken?.length}, verified=${!!verified}, whitelistEnabled=${whitelistEnabled}, allowedEmails=[${allowedEmails.join(', ')}], allowEnvFallback=${allowEnvFallback}, email=${verified?.email || 'n/a'}, tokenExpired=${tokenExpired}`);
        } else {
            console.log(`Auth Debug (non-streaming): No googleToken provided`);
        }
        
    console.log(`Processing non-streaming request for query: "${query}" with model: ${model}`);
        
    // Validate required parameters
        if (!query) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Query parameter is required',
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Enforce auth for server-side usage: require apiKey unless allowEnvFallback is true
        if (!apiKey && !allowEnvFallback) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'API key required. Sign in with an allowed Google account or provide an apiKey.',
                    code: 'NO_API_KEY',
                    timestamp: new Date().toISOString()
                })
            };
        }
        
        // Execute the multi-search process
        const finalResult = await executeMultiSearchWithStreaming(
            query, 
            limit, 
            fetchContent, 
            timeout, 
            model, 
            accessSecret, 
            apiKey, 
            searchMode,
            null, // No custom systemPrompts
            null, // No custom decisionTemplate
            null, // No custom searchTemplate
            null, // No streaming for non-streaming requests
            allowEnvFallback
        );
        
        const processingTime = Date.now() - startTime;
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...finalResult,
                processingTime: processingTime,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Lambda handler error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message,
                query: query,
                timestamp: new Date().toISOString()
            })
        };
    }
}
