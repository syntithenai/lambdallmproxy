/**
 * AWS Lambda handler for intelligent search + LLM response with streaming support
 * Combines DuckDuckGo search functionality with LLM processing to provide
 * comprehensive answers with citations and source references
 */

// AWS Lambda Response Streaming (available as global in runtime)

// Import Node.js modules
const https = require('https');

// Import modularized components
const { getAllowedEmails, verifyGoogleToken } = require('./auth');
const { PROVIDERS, parseProviderModel, getProviderConfig } = require('./providers');
const { MemoryTracker, TokenAwareMemoryTracker } = require('./memory-tracker');
const { SimpleHTMLParser } = require('./html-parser');
const { DuckDuckGoSearcher } = require('./search');
const { llmResponsesWithTools } = require('./llm_tools_adapter');
const { toolFunctions, callFunction } = require('./tools');
const { getPricingData, calculateCost, validateContextSize, countTokens } = require('./pricing_scraper');

// Timeout configuration
const LAMBDA_TIMEOUT_MS = Number(process.env.LAMBDA_TIMEOUT_MS ?? 900000); // 15 minutes default
const GRACEFUL_STOP_BUFFER_MS = 30000; // Stop 30 seconds before timeout

/**
 * Query state manager for retry functionality
 */
class QueryStateManager {
    constructor() {
        this.queryId = this.generateQueryId();
        this.startTime = Date.now();
        this.state = {
            originalQuery: '',
            systemPrompt: '',
            modelId: '',
            toolResults: [],
            conversationHistory: [],
            completedSteps: [],
            totalCost: 0,
            totalTokensUsed: 0,
            stepCosts: [],
            searchResults: {},
            currentIteration: 0,
            isRetry: false,
            retryCount: 0,
            lastError: null,
            interrupted: false,
            interruptReason: null
        };
    }

    generateQueryId() {
        return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    updateState(updates) {
        this.state = { ...this.state, ...updates };
    }

    addCompletedStep(stepName, result, tokens, cost) {
        this.state.completedSteps.push({
            stepName,
            result,
            tokens,
            cost,
            timestamp: new Date().toISOString(),
            iteration: this.state.currentIteration
        });
        this.state.totalTokensUsed += tokens;
        this.state.totalCost += cost;
    }

    addToolResult(toolName, args, result, tokens, cost) {
        this.state.toolResults.push({
            toolName,
            args,
            result,
            tokens,
            cost,
            timestamp: new Date().toISOString(),
            iteration: this.state.currentIteration
        });
    }

    addConversationMessage(role, content, tokens) {
        this.state.conversationHistory.push({
            role,
            content,
            tokens,
            timestamp: new Date().toISOString()
        });
    }

    shouldGracefullyStop() {
        const elapsedTime = Date.now() - this.startTime;
        return elapsedTime > (LAMBDA_TIMEOUT_MS - GRACEFUL_STOP_BUFFER_MS);
    }

    createInterruptState(reason) {
        this.state.interrupted = true;
        this.state.interruptReason = reason;
        return {
            queryId: this.queryId,
            state: this.state,
            resumeData: {
                lastIteration: this.state.currentIteration,
                toolResults: this.state.toolResults,
                conversationHistory: this.state.conversationHistory,
                completedSteps: this.state.completedSteps,
                searchResults: this.state.searchResults
            }
        };
    }

    static fromRetryData(retryData) {
        const manager = new QueryStateManager();
        manager.queryId = retryData.queryId;
        manager.state = { ...retryData.state, isRetry: true, retryCount: (retryData.state.retryCount || 0) + 1 };
        return manager;
    }
}

// Memory management constants
// Infer memory limit from environment when possible
const LAMBDA_MEMORY_LIMIT_MB = (process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE && parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE, 10))
    || (process.env.LAMBDA_MEMORY && parseInt(process.env.LAMBDA_MEMORY, 10))
    || 128;
const MEMORY_SAFETY_BUFFER_MB = 16; // Reserve 16MB for other operations
const MAX_CONTENT_SIZE_MB = LAMBDA_MEMORY_LIMIT_MB - MEMORY_SAFETY_BUFFER_MB;
const BYTES_PER_MB = 1024 * 1024;

// No legacy templates needed - tools-based approach handles everything dynamically

// --- Tools flow configuration ---
const MAX_TOOL_ITERATIONS_ENV = process.env.MAX_TOOL_ITERATIONS;
const MAX_TOOL_ITERATIONS = Number(process.env.MAX_TOOL_ITERATIONS) || 3; // Allow more thorough research - force fallback if NaN
const DEFAULT_REASONING_EFFORT = process.env.REASONING_EFFORT || 'medium';

// --- Token limit configuration ---
const MAX_TOKENS_PLANNING = Number(process.env.MAX_TOKENS_PLANNING ?? 300); // Planning query tokens - keep moderate for decision making
const MAX_TOKENS_TOOL_SYNTHESIS = Number(process.env.MAX_TOKENS_TOOL_SYNTHESIS ?? 512); // Tool synthesis tokens  

// Dynamic token allocation based on complexity assessment
const MAX_TOKENS_LOW_COMPLEXITY = Number(process.env.MAX_TOKENS_LOW_COMPLEXITY ?? 1024); // Simple queries
const MAX_TOKENS_MEDIUM_COMPLEXITY = Number(process.env.MAX_TOKENS_MEDIUM_COMPLEXITY ?? 2048); // Standard queries  
const MAX_TOKENS_HIGH_COMPLEXITY = Number(process.env.MAX_TOKENS_HIGH_COMPLEXITY ?? 4096); // Complex analysis queries

const MAX_TOKENS_MATH_RESPONSE = Number(process.env.MAX_TOKENS_MATH_RESPONSE ?? 512); // Mathematical response tokens - concise math answers

// Legacy fallback (maintain compatibility)
const MAX_TOKENS_FINAL_RESPONSE = Number(process.env.MAX_TOKENS_FINAL_RESPONSE ?? MAX_TOKENS_MEDIUM_COMPLEXITY); // Default to medium complexity

// Function to determine token allocation based on complexity assessment
function getTokensForComplexity(complexityAssessment) {
    switch(complexityAssessment) {
        case 'low':
            return MAX_TOKENS_LOW_COMPLEXITY;
        case 'high':
            return MAX_TOKENS_HIGH_COMPLEXITY;
        case 'medium':
        default:
            return MAX_TOKENS_MEDIUM_COMPLEXITY;
    }
}

// Comprehensive system prompt that encourages tool usage
const COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT = process.env.SYSTEM_PROMPT_SEARCH || `You are a helpful AI assistant with access to powerful tools. For any query that could benefit from current information, web search, mathematical calculations, or data analysis, you should actively use the available tools.

RESPONSE FORMAT GUIDELINES:
- Start with a direct, concise answer to the question
- For calculations: Give the result first, then show the work if needed
- Minimize descriptive text about your thinking process
- Be concise and factual rather than verbose

TOOL USAGE GUIDELINES:
- Use search_web for current information, news, recent events, stock prices, or any factual queries
- Use execute_javascript for mathematical calculations, data analysis, or computational problems  
- Use scrape_web_content when you need to extract detailed information from specific websites
- Always use tools when they can provide more accurate or current information than your training data

CRITICAL TOOL PARAMETER RULES:
- For execute_javascript: ONLY provide the "code" parameter. NEVER include result, type, executed_at or any other properties.
- For search_web: Required parameter is "query". Optional parameters are "limit" (1-3 max), "timeout" (1-60 max), "load_content" (boolean). For comprehensive research, make multiple separate calls with different queries rather than using high limits. NEVER include summary, count, results, or any other properties not in the schema.
- For scrape_web_content: Required parameter is "url". Optional parameter is "timeout" (1-60 max). NEVER include any other properties.
- The tool schemas have additionalProperties: false. Any extra parameters will cause HTTP 400 validation errors.
- You MUST follow the exact parameter schema. Do NOT invent or add extra properties.
- IMPORTANT: Tool functions make requests and return results. Do NOT try to include results in the function call parameters.

Keep responses focused and direct. Always cite sources with URLs when using web search results.`;

function safeParseJson(s) {
    try { return JSON.parse(s); } catch { return {}; }
}

// Global pricing data cache - initialized on first Lambda invocation
let globalPricingData = null;

/**
 * Initialize pricing data if not already loaded
 */
async function initializePricingData() {
    if (!globalPricingData) {
        console.log('💰 Initializing pricing data...');
        globalPricingData = await getPricingData();
        console.log(`💰 Pricing data loaded: ${Object.keys(globalPricingData.models).length} models available`);
    }
    return globalPricingData;
}

/**
 * Cost tracking for a query session
 */
class QueryCostTracker {
    constructor(modelId, pricingData, previousSteps = []) {
        this.modelId = modelId;
        this.pricingData = pricingData;
        this.steps = [...previousSteps]; // Include previous steps from retries
        this.sessionSteps = []; // Steps from current session only
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
        this.totalCost = 0;
        this.sessionInputTokens = 0;
        this.sessionOutputTokens = 0;
        this.sessionCost = 0;
        
        // Calculate totals from previous steps
        this.steps.forEach(step => {
            this.totalInputTokens += step.inputTokens;
            this.totalOutputTokens += step.outputTokens;
            this.totalCost += step.cost;
        });
    }

    addStep(stepName, inputText, outputText, description = '', requestNumber = 1) {
        const inputTokens = countTokens(inputText);
        const outputTokens = countTokens(outputText);
        const cost = calculateCost(this.modelId, inputTokens, outputTokens, this.pricingData);
        
        const step = {
            stepName,
            description,
            inputTokens,
            outputTokens,
            cost: cost.totalCost,
            costDetails: cost,
            timestamp: new Date().toISOString(),
            requestNumber, // Track which request/retry this step belongs to
            sessionStep: true // Mark as current session step
        };
        
        this.steps.push(step);
        this.sessionSteps.push(step);
        this.totalInputTokens += inputTokens;
        this.totalOutputTokens += outputTokens;
        this.totalCost += cost.totalCost;
        this.sessionInputTokens += inputTokens;
        this.sessionOutputTokens += outputTokens;
        this.sessionCost += cost.totalCost;
        
        console.log(`💰 ${stepName}: ${inputTokens}in + ${outputTokens}out = $${cost.totalCost.toFixed(4)} (Total: $${this.totalCost.toFixed(4)})`);
        return step;
    }

    getSummary() {
        const totalCost = calculateCost(this.modelId, this.totalInputTokens, this.totalOutputTokens, this.pricingData);
        return {
            modelId: this.modelId,
            modelName: totalCost.modelName || this.modelId,
            provider: totalCost.provider,
            totalSteps: this.steps.length,
            sessionSteps: this.sessionSteps.length,
            totalInputTokens: this.totalInputTokens,
            totalOutputTokens: this.totalOutputTokens,
            totalTokens: this.totalInputTokens + this.totalOutputTokens,
            sessionInputTokens: this.sessionInputTokens,
            sessionOutputTokens: this.sessionOutputTokens,
            sessionTokens: this.sessionInputTokens + this.sessionOutputTokens,
            totalCost: this.totalCost,
            sessionCost: this.sessionCost,
            costDetails: totalCost,
            steps: this.steps,
            sessionSteps: this.sessionSteps,
            allRequests: this.groupStepsByRequest()
        };
    }

    groupStepsByRequest() {
        const requestGroups = {};
        this.steps.forEach(step => {
            const reqNum = step.requestNumber || 1;
            if (!requestGroups[reqNum]) {
                requestGroups[reqNum] = {
                    requestNumber: reqNum,
                    steps: [],
                    totalCost: 0,
                    totalTokens: 0
                };
            }
            requestGroups[reqNum].steps.push(step);
            requestGroups[reqNum].totalCost += step.cost;
            requestGroups[reqNum].totalTokens += step.inputTokens + step.outputTokens;
        });
        return Object.values(requestGroups);
    }
}

async function runToolLoop({ model, apiKey, userQuery, systemPrompt, stream, queryId, previousSteps }) {
    // Starting tool loop for model: ${model}

    // Initialize pricing data and cost tracking
    const pricingData = await initializePricingData();
    const { provider, model: modelName } = parseProviderModel(model);
    const modelId = modelName;
    const costTracker = new QueryCostTracker(modelId, pricingData, previousSteps);
    
    // Initialize state manager
    const stateManager = new QueryStateManager(queryId);
    
    // Track Lambda execution timing
    const startTime = Date.now();
    const maxDuration = 14.5 * 60 * 1000; // 14.5 minutes, 30 second buffer
    
    // Validate context size for the initial query
    const queryTokens = countTokens(userQuery + systemPrompt);
    const contextValidation = validateContextSize(modelId, queryTokens, pricingData);
    
    console.log(`💰 Model: ${modelId} (${contextValidation.modelName})`);
    console.log(`💰 Context: ${queryTokens}/${contextValidation.maxTokens} tokens (${contextValidation.utilizationPercent.toFixed(1)}%)`);
    
    if (!contextValidation.valid) {
        throw new Error(`Query too long: ${queryTokens} tokens exceeds model limit of ${contextValidation.maxTokens}`);
    }

    // Step 1: Initial planning query to determine research strategy and optimal persona
    stream?.writeEvent?.('log', { message: 'Analyzing query and determining research strategy...' });
    // Planning phase
    
    // Initialize researchPlan at function level to ensure availability throughout function
    let researchPlan = { 
        research_questions: ["Initial research question"], 
        optimal_persona: systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT, 
        reasoning: "Default plan",
        complexity_assessment: "medium"
    };
    
    const planningPrompt = `Analyze this user query and determine the optimal research strategy and expert approach:

Query: "${userQuery}"

Provide a comprehensive analysis that considers:
1. What specific research questions are needed to gather all necessary facts
2. What expert persona/role would be most qualified to provide the best answer
3. Whether the query requires mathematical calculations, data processing, or computational analysis
4. The complexity level and depth of analysis needed
5. Any potential challenges or nuances in answering this query

You may provide detailed reasoning if the query is complex or multi-faceted.

Respond with JSON in this exact format:
{
  "research_questions": ["Question 1 phrased as a clear search query?", "Question 2?", "Question 3?"],
  "optimal_persona": "I am a [specific expert role/title] with expertise in [domain]. I specialize in [specific areas and computational tools when relevant]. I provide direct, concise answers that start with the key result.",
  "reasoning": "Detailed explanation of why this approach and persona are optimal, including analysis complexity, computational tools needed, potential challenges, and research strategy rationale. Be thorough if the query warrants it.",
  "complexity_assessment": "low|medium|high - IMPORTANT: This determines response token allocation. LOW=1024 tokens (simple facts), MEDIUM=2048 tokens (standard analysis), HIGH=4096 tokens (comprehensive analysis)"
}

Generate 1-5 specific, targeted research questions based on query complexity. For complex queries, provide more detailed reasoning and additional research questions. Be specific about the expert role and tailor it precisely to the query domain.`;

    try {
        const planningResponse = await llmResponsesWithTools({
            model,
            input: [
                { role: 'system', content: 'You are a research strategist. Analyze queries and determine optimal research approaches and expert personas. You may provide detailed analysis if the query is complex. Always respond with valid JSON only.' },
                { role: 'user', content: planningPrompt }
            ],
            tools: [], // No tools needed for planning
            options: {
                apiKey,
                reasoningEffort: 'medium', // Increased reasoning effort for better planning
                temperature: 0.2, // Slightly higher temperature for more creative planning
                max_tokens: MAX_TOKENS_PLANNING, // Now allows up to 1500 tokens
                timeoutMs: 25000 // Increased timeout for more complex planning
            }
        });

        // Track cost for planning step
        costTracker.addStep('Planning', planningPrompt, planningResponse?.text || '', 'Query analysis and research strategy');
        
        if (planningResponse?.text) {
            try {
                const parsed = JSON.parse(planningResponse.text.trim());
                if (parsed.research_questions && parsed.optimal_persona) {
                    researchPlan = parsed;
                    stream?.writeEvent?.('log', { 
                        message: `Research plan: ${researchPlan.research_questions.length} questions, Complexity: ${researchPlan.complexity_assessment || 'medium'}, Persona: ${researchPlan.optimal_persona.substring(0, 80)}...`
                    });
                    
                    // Send dedicated persona event for UI display
                    stream?.writeEvent?.('persona', {
                        persona: researchPlan.optimal_persona,
                        research_questions_needed: researchPlan.research_questions?.length || 1,
                        reasoning: researchPlan.reasoning
                    });
                    
                    // Send research questions event for UI display
                    stream?.writeEvent?.('research_questions', {
                        questions: researchPlan.research_questions,
                        questions_needed: researchPlan.research_questions?.length || 1,
                        reasoning: researchPlan.reasoning
                    });
                }
            } catch (e) {
                console.warn('Failed to parse planning response, using defaults:', e.message);
            }
        }

        // Get current date and time for environmental context
        const now = new Date();
        const currentDateTime = now.toISOString().split('T')[0] + ' ' + now.toTimeString().split(' ')[0] + ' UTC';
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
        const environmentContext = `\n\nCurrent Context: Today is ${dayOfWeek}, ${currentDateTime}. Use this temporal context when discussing recent events, current status, or time-sensitive information.`;

        // Update system prompt with determined persona and environmental context
        var dynamicSystemPrompt = researchPlan.optimal_persona + ' CRITICAL TOOL RULES: Always use the available search_web and execute_javascript tools when they can enhance your response. Use search tools for current information and calculations tools for math problems. PARAMETER RULES: When calling execute_javascript, ONLY provide the "code" parameter. When calling search_web, provide "query" parameter and optionally "limit" (1-3 max), "timeout" (1-60 max), "load_content" (boolean). For comprehensive research, make multiple separate calls with different queries. NEVER add extra properties like count, results, summary, etc. The schemas have additionalProperties: false and will reject extra parameters with HTTP 400 errors. Do NOT include results in function call parameters - tools return results automatically. RESPONSE FORMAT: Start with the direct answer, then show work if needed. Be concise and minimize descriptive text about your thinking. Cite all sources with URLs.' + environmentContext;
        
    } catch (e) {
        console.warn('Planning query failed, proceeding with default approach:', e.message);
        // Ensure researchPlan fallback is set
        researchPlan = { 
            research_questions: ["Initial research question"], 
            optimal_persona: systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT, 
            reasoning: "Default plan due to planning failure",
            complexity_assessment: "medium"
        };
        
        // Get current date and time for environmental context (fallback case)
        const now = new Date();
        const currentDateTime = now.toISOString().split('T')[0] + ' ' + now.toTimeString().split(' ')[0] + ' UTC';
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
        const environmentContext = `\n\nCurrent Context: Today is ${dayOfWeek}, ${currentDateTime}. Use this temporal context when discussing recent events, current status, or time-sensitive information.`;
        
        var dynamicSystemPrompt = (systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT) + ' CRITICAL TOOL RULES: Always use available tools (search_web, execute_javascript, scrape_web_content) when they can provide better, more current, or more accurate information. For math questions, always use execute_javascript. For current events or factual queries, always use search_web. PARAMETER RULES: When calling execute_javascript, ONLY provide the "code" parameter. When calling search_web, provide "query" and optionally "limit" (1-3 max), "timeout" (1-60 max), "load_content" (boolean). When calling scrape_web_content, provide "url" and optionally "timeout" (1-60 max). For comprehensive research, make multiple separate calls with different queries. NEVER add extra properties like count, results, summary, etc. The schemas have additionalProperties: false and will reject extra parameters with HTTP 400 errors. Do NOT include results in function call parameters - tools return results automatically. RESPONSE FORMAT: Start with the direct answer, then show work if needed. Be concise and minimize descriptive text about your thinking.' + environmentContext;
    }

    // System prompt and user query prepared

    const input = [
        { role: 'system', content: dynamicSystemPrompt },
        { role: 'user', content: userQuery }
    ];

    // Starting tool loop with ${toolFunctions?.length || 0} available tools

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        try {
            stream?.writeEvent?.('log', { message: `Tools iteration ${iter + 1}` });
            // Tool iteration ${iter + 1}
        } catch {}

        // Check if we should gracefully stop due to timeout
        const elapsed = Date.now() - startTime;
        if (stateManager.shouldGracefullyStop(elapsed, maxDuration)) {
            console.log('🕒 Approaching timeout limit, stopping gracefully...');
            const interruptState = stateManager.createInterruptState(
                input, costTracker, 'timeout', 
                'Lambda function approaching timeout limit'
            );
            
            stream?.writeEvent?.('interrupt_state', interruptState);
            stream?.writeEvent?.('log', { 
                message: 'Execution paused due to timeout. Use continue button to resume.' 
            });
            
            return {
                finalText: `Query execution was paused due to approaching timeout limit. Click the continue button below to resume processing.`,
                costTracker,
                interrupted: true,
                interruptState
            };
        }

        let llmResponse;
        try {
            llmResponse = await llmResponsesWithTools({
                model,
                input,
                tools: toolFunctions,
                options: {
                    apiKey,
                    reasoningEffort: DEFAULT_REASONING_EFFORT,
                    temperature: 0.2,
                    max_tokens: MAX_TOKENS_TOOL_SYNTHESIS,
                    timeoutMs: 30000
                }
            });
        } catch (error) {
            // Handle API rate limits and quota issues
            if (error.message?.includes('Rate limit') || 
                error.message?.includes('429') ||
                error.message?.includes('quota') ||
                error.message?.includes('Quota') ||
                error.status === 429) {
                console.log('🚫 API Rate limit or quota hit, creating interrupt state...');
                
                const interruptState = stateManager.createInterruptState(
                    input, costTracker, 'rate_limit', 
                    `API rate limit or quota exceeded. Please wait a few seconds and continue.`
                );
                
                stream?.writeEvent?.('interrupt_state', interruptState);
                stream?.writeEvent?.('log', { 
                    message: 'API rate limit or quota reached. Click continue to resume processing.' 
                });
                
                return {
                    finalText: `Query execution was paused due to API rate limiting or quota. Click the continue button below to resume processing.`,
                    costTracker,
                    interrupted: true,
                    interruptState
                };
            }
            
            // Re-throw other errors
            throw error;
        }

        const { output, text } = llmResponse;

        // Track cost for tool iteration
        const iterationInputText = JSON.stringify(input);
        costTracker.addStep(`Tool Iteration ${iter + 1}`, iterationInputText, text || '', `LLM reasoning and tool calls`);
        
        // Update state manager with completed step
        stateManager.addCompletedStep(`Tool Iteration ${iter + 1}`, 'llm_call');

        // LLM response received: ${output?.length || 0} items, ${text?.length || 0} chars

        if (!output || output.length === 0) {
            // No more tool calls needed - proceed to final synthesis
            // No tool calls, proceeding to synthesis
            break;
        }

        const calls = output.filter(x => x.type === 'function_call');
        
        // Found ${calls.length} function calls
        console.log(`🔧 Raw output items:`, JSON.stringify(output, null, 2));
        
        if (calls.length > 0) {
            console.log(`🔧 EMITTING TOOLS EVENT - Iteration ${iter + 1}, ${calls.length} calls`);
            stream?.writeEvent?.('log', { 
                message: `Executing ${calls.length} tool${calls.length !== 1 ? 's' : ''}: ${calls.map(c => c.name).join(', ')}` 
            });
            
            // Add assistant message with tool calls to conversation history
            // This is required for OpenAI API - tool messages must be preceded by assistant message with tool_calls
            const toolCalls = calls.map(call => ({
                id: call.call_id || call.id,
                type: 'function',
                function: {
                    name: call.name,
                    arguments: call.arguments || '{}'
                }
            }));
            
            input.push({
                role: 'assistant',
                content: text || null,
                tool_calls: toolCalls
            });
        }
        
        // Emit detailed tool call info for UI
        try {
            const detailedCalls = calls.map((tc, idx) => ({
                iteration: iter + 1,
                call_id: tc.call_id || tc.id || `iter-${iter + 1}-call-${idx + 1}`,
                name: tc.name,
                args: safeParseJson(tc.arguments || '{}')
            }));
            console.log(`🔧 EMITTING 'tools' EVENT:`, JSON.stringify({ iteration: iter + 1, pending: calls.length, calls: detailedCalls }, null, 2));
            stream?.writeEvent?.('tools', { iteration: iter + 1, pending: calls.length, calls: detailedCalls });
            console.log(`🔧 'tools' EVENT EMITTED SUCCESSFULLY`);
        } catch (error) {
            console.log(`🔧 ERROR emitting 'tools' event:`, error);
        }

        const results = await Promise.allSettled(
            calls.map(async (tc, idx) => {
                const args = safeParseJson(tc.arguments || '{}');
                let output;
                try {
                    output = await callFunction(tc.name, args, { model, apiKey });
                } catch (e) {
                    output = JSON.stringify({ error: String(e?.message || e) });
                }
                const call_id = tc.call_id || tc.id || `iter-${iter + 1}-call-${idx + 1}`;
                const result = { iteration: iter + 1, call_id, name: tc.name, args, output: String(output) };
                try { 
                    console.log(`🔧 EMITTING 'tool_result' EVENT for ${tc.name}:`, JSON.stringify(result, null, 2));
                    stream?.writeEvent?.('tool_result', result); 
                    console.log(`🔧 'tool_result' EVENT EMITTED SUCCESSFULLY for ${tc.name}`);
                } catch (error) {
                    console.log(`🔧 ERROR emitting 'tool_result' event for ${tc.name}:`, error);
                }
                return result;
            })
        );

        for (const r of results) {
            const item = r.status === 'fulfilled'
                ? r.value
                : { call_id: null, output: JSON.stringify({ error: String(r.reason?.message || r.reason) }) };
            
            // Emergency: Truncate tool outputs to prevent token explosion
            const truncatedOutput = String(item.output || '').substring(0, 300); // Extremely aggressive limit
            input.push({ type: 'function_call_output', call_id: item.call_id, output: truncatedOutput });
        }
        
        // Emergency: Prune conversation context if getting too large
        const contextStr = JSON.stringify(input);
        const estimatedTokens = Math.ceil(contextStr.length / 4); // Rough token estimate
        if (estimatedTokens > 3000) { // Emergency context limit
            console.warn(`🚨 EMERGENCY: Context too large (${estimatedTokens} tokens), pruning...`);
            // Keep only system prompt, user query, last assistant message with tool calls, and last 2 tool results
            const systemMsg = input.find(m => m.role === 'system');
            const userMsg = input.find(m => m.role === 'user');
            const lastAssistantMsg = input.filter(m => m.role === 'assistant' && m.tool_calls).slice(-1)[0];
            const lastToolResults = input.filter(m => m.type === 'function_call_output').slice(-2);
            input = [systemMsg, userMsg, lastAssistantMsg, ...lastToolResults].filter(Boolean);
        }
    }

    // After all tool calls are complete, get the final synthesis
    try {
        console.log('🔄 Starting final synthesis step...');
        stream?.writeEvent?.('log', { message: 'Synthesizing comprehensive final answer...' });
        
        // Build minimal context to save tokens
        const allInformation = input
            .filter(item => item.type === 'function_call_output')
            .slice(0, 2) // Emergency: max 2 sources
            .map((item, index) => {
                try {
                    const data = JSON.parse(item.output);
                    if (data.summary) {
                        return `${index + 1}: ${data.summary.substring(0, 100)}...`; // Drastically reduced
                    } else if (data.content) {
                        return `${index + 1}: ${data.content.substring(0, 100)}...`;
                    }
                    return `${index + 1}: ${item.output.substring(0, 80)}...`;
                } catch {
                    return `${index + 1}: ${item.output.substring(0, 80)}...`;
                }
            })
            .join('\n');

        // Get current date and time for environmental context
        const now = new Date();
        const currentDateTime = now.toISOString().split('T')[0] + ' ' + now.toTimeString().split(' ')[0] + ' UTC';
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
        
        // Use the comprehensive final template from environment variables
        const finalTemplate = process.env.FINAL_TEMPLATE || `Q: {{ORIGINAL_QUERY}}
Data: {{ALL_INFORMATION}}
Answer with URLs:`;

        // Add environmental context to the final prompt
        const environmentalContext = `\n\nCurrent Environmental Context:\n- Date: ${dayOfWeek}, ${currentDateTime}\n- Analysis conducted in real-time with current information\n`;
        
        const finalPrompt = finalTemplate
            .replace('{{ORIGINAL_QUERY}}', userQuery)
            .replace('{{ALL_INFORMATION}}', allInformation) + environmentalContext;

        // Detect mathematical queries for concise responses
        const isMathQuery = /\b(calculate|compute|solve|equation|formula|math|add|subtract|multiply|divide|percentage|percent|interest|probability|statistics|algebra|geometry|trigonometry|\+|\-|\*|\/|\=|\^|√|∫|∑|\d+[\+\-\*\/]\d+)\b/i.test(userQuery);
        
        // Adjust system prompt and token limits based on query type and complexity
        let mathSystemPrompt = dynamicSystemPrompt;
        let maxTokens;
        
        if (isMathQuery) {
            maxTokens = MAX_TOKENS_MATH_RESPONSE; // Use dedicated math response limit for concise answers
            mathSystemPrompt = `${dynamicSystemPrompt}\n\nFor mathematical questions: Start with the answer first (e.g., "The result is X."), then show calculations if helpful. Be direct and concise. Avoid lengthy explanations about your process or thinking. Focus on the solution.`;
        } else {
            // Use complexity-based token allocation from planning phase
            const complexityAssessment = researchPlan?.complexity_assessment || 'medium';
            maxTokens = getTokensForComplexity(complexityAssessment);
            
            // Log the dynamic token allocation
            console.log(`🔧 Dynamic token allocation: complexity=${complexityAssessment}, tokens=${maxTokens}`);
            stream?.writeEvent?.('log', { 
                message: `Using ${maxTokens} tokens for ${complexityAssessment} complexity analysis` 
            });
            
            // Enhance system prompt for high complexity queries
            if (complexityAssessment === 'high') {
                mathSystemPrompt = `${dynamicSystemPrompt}\n\nFor this high-complexity analysis: Provide comprehensive, detailed responses with thorough analysis. You have expanded token allocation to deliver in-depth insights, multiple perspectives, and detailed explanations as needed.`;
            }
        }

        const finalSynthesisInput = [
            { role: 'system', content: mathSystemPrompt },
            { role: 'user', content: finalPrompt }
        ];

        // Check limits before final synthesis
        const elapsed = Date.now() - startTime;
        if (stateManager.shouldGracefullyStop(elapsed, maxDuration)) {
            console.log('🕒 Timeout approaching during final synthesis, creating interrupt...');
            const interruptState = stateManager.createInterruptState(
                input, costTracker, 'timeout', 
                'Lambda function approaching timeout during final synthesis'
            );
            
            stream?.writeEvent?.('interrupt_state', interruptState);
            return {
                finalText: `Query execution was paused during final synthesis due to timeout. Click continue to resume.`,
                costTracker,
                interrupted: true,
                interruptState
            };
        }

        let finalResponse;
        try {
            finalResponse = await llmResponsesWithTools({
                model,
                input: finalSynthesisInput,
                tools: [], // No more tools, just final answer
                options: {
                    apiKey,
                    reasoningEffort: DEFAULT_REASONING_EFFORT,
                    temperature: 0.2,
                    max_tokens: maxTokens, // Adjust based on query type
                    timeoutMs: 30000
                }
            });
        } catch (error) {
            // Handle API rate limits and quota issues during final synthesis
            if (error.message?.includes('Rate limit') || 
                error.message?.includes('429') ||
                error.message?.includes('quota') ||
                error.message?.includes('Quota') ||
                error.status === 429) {
                console.log('🚫 API Rate limit or quota hit during final synthesis, creating interrupt state...');
                
                const interruptState = stateManager.createInterruptState(
                    input, costTracker, 'rate_limit', 
                    `API rate limit or quota exceeded during final synthesis. Please wait and continue.`
                );
                
                stream?.writeEvent?.('interrupt_state', interruptState);
                
                return {
                    finalText: `Query execution was paused during final synthesis due to API rate limiting. Click the continue button below to resume processing.`,
                    costTracker,
                    interrupted: true,
                    interruptState
                };
            }
            
            // Re-throw other errors
            throw error;
        }

        // Track cost for final synthesis
        const synthesisInputText = JSON.stringify(finalSynthesisInput);
        costTracker.addStep('Final Synthesis', synthesisInputText, finalResponse?.text || '', 'Comprehensive answer generation');
        
        const result = finalResponse?.text || 'I was unable to provide a comprehensive answer based on the research conducted.';
        
        // Get cost summary
        const costSummary = costTracker.getSummary();
        console.log(`💰 Total Query Cost: $${costSummary.totalCost.toFixed(4)} (${costSummary.totalTokens} tokens)`);
        
        // Send cost information to the UI in the format expected by the UI
        stream?.writeEvent?.('cost_summary', {
            totalCost: costSummary.totalCost,
            tokenCounts: {
                input: costSummary.totalInputTokens,
                output: costSummary.totalOutputTokens,
                total: costSummary.totalTokens
            },
            stepCosts: costSummary.steps.map(step => ({
                stepName: step.stepName,
                model: costSummary.modelName || costSummary.modelId,
                cost: step.cost,
                inputTokens: step.inputTokens,
                outputTokens: step.outputTokens,
                description: step.description || '',
                timestamp: step.timestamp
            })),
            modelName: costSummary.modelName,
            provider: costSummary.provider
        });
        
        // Send the final response to the UI
        // Sending final answer (${result?.length || 0} chars)
        stream?.writeEvent?.('final_answer', { 
            content: result,
            timestamp: new Date().toISOString(),
            costSummary: {
                totalCost: costSummary.totalCost,
                totalTokens: costSummary.totalTokens,
                modelName: costSummary.modelName
            }
        });
        
        return { 
            finalText: result,
            researchPlan: researchPlan,
            costSummary: costSummary
        };
    } catch (e) {
        console.error('Final synthesis failed:', e?.message || e);
        const errorMsg = 'I apologize, but I encountered an issue while synthesizing the final answer.';
        
        // Get cost summary even for errors
        const costSummary = costTracker?.getSummary() || { totalCost: 0, totalTokens: 0, steps: [] };
        
        // Send error as final answer
        stream?.writeEvent?.('final_answer', { 
            content: errorMsg,
            timestamp: new Date().toISOString(),
            costSummary: {
                totalCost: costSummary.totalCost,
                totalTokens: costSummary.totalTokens,
                modelName: costSummary.modelName || modelId
            }
        });
        
        return { 
            finalText: errorMsg,
            researchPlan: researchPlan || { complexity_assessment: 'medium' },
            costSummary: costSummary
        };
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
        
        // Retry parameters
        const queryId = body.queryId || null;
        const previousSteps = body.previousSteps || [];

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
        
        // Process the request with tools-based approach
        const toolsRun = await runToolLoop({
            model,
            apiKey: apiKey || (allowEnvFallback ? (process.env[parseProviderModel(model).provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'] || '') : ''),
            userQuery: query,
            systemPrompt: COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT,
            stream: streamAdapter,
            queryId,
            previousSteps
        });
        
        const finalResult = {
            query: query,
            searches: [],
            searchResults: [],
            response: toolsRun.finalText || 'I apologize, but I encountered an issue while processing your request. Please try rephrasing your question.',
            metadata: {
                totalResults: 0,
                searchIterations: 0,
                finalModel: model,
                searchMode: 'tools',
                totalCost: toolsRun.costSummary?.totalCost || 0,
                totalTokens: toolsRun.costSummary?.totalTokens || 0,
                costBreakdown: toolsRun.costSummary?.steps || []
            }
        };
        
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
        
        // Retry parameters
        const queryId = body.queryId || null;
        const previousSteps = body.previousSteps || [];

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

        // Use tools-based approach only
        let finalResult = null;
        try {
            const toolsRun = await runToolLoop({
                model,
                apiKey: apiKey || (allowEnvFallback ? (process.env[parseProviderModel(model).provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'] || '') : ''),
                userQuery: query,
                systemPrompt: COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT,
                stream,
                queryId,
                previousSteps
            });
            
            finalResult = {
                success: true,
                mode: 'tools',
                answer: toolsRun.finalText || 'I apologize, but I encountered an issue while processing your request. Please try rephrasing your question.',
                searchResults: [],
                metadata: { 
                    tools: true,
                    totalCost: toolsRun.costSummary?.totalCost || 0,
                    totalTokens: toolsRun.costSummary?.totalTokens || 0,
                    costBreakdown: toolsRun.costSummary?.steps || []
                }
            };
        } catch (e) {
            stream.writeEvent('error', {
                error: `Processing failed: ${e?.message || e}`,
                timestamp: new Date().toISOString()
            });
            
            finalResult = {
                success: false,
                mode: 'tools',
                answer: 'I apologize, but I encountered an error while processing your request. Please try again.',
                searchResults: [],
                metadata: { tools: true, error: true }
            };
        }
        
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
// Legacy multi-search functions removed - using tools-based approach only

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
        
        // Retry parameters
        const queryId = body.queryId || null;
        const previousSteps = body.previousSteps || [];
        
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
        
        // Use tools-based approach only
        let finalResult;
        try {
            const toolsRun = await runToolLoop({
                model,
                apiKey: apiKey || (allowEnvFallback ? (process.env[parseProviderModel(model).provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'] || '') : ''),
                userQuery: query,
                systemPrompt: COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT,
                stream: null,
                queryId,
                previousSteps
            });
            
            finalResult = {
                query,
                searches: [],
                searchResults: [],
                response: toolsRun.finalText || 'I apologize, but I encountered an issue while processing your request. Please try rephrasing your question.',
                metadata: { 
                    finalModel: model, 
                    mode: 'tools',
                    totalCost: toolsRun.costSummary?.totalCost || 0,
                    totalTokens: toolsRun.costSummary?.totalTokens || 0,
                    costBreakdown: toolsRun.costSummary?.steps || []
                }
            };
        } catch (e) {
            console.error('Tools flow failed:', e?.message || e);
            finalResult = {
                query,
                searches: [],
                searchResults: [],
                response: 'I apologize, but I encountered an error while processing your request. Please try again.',
                metadata: { finalModel: model, mode: 'tools', error: true }
            };
        }
        
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
