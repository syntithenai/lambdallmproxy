/**
 * AWS Lambda handler for intelligent search + LLM response with streaming support
 * Combines DuckDuckGo search functionality with LLM processing to provide
 * comprehensive an        dynamicSystemPrompt = researchPlan.optimal_persona + ' CRITICAL TOOL RULES: Always use the available search_web and execute_javascript tools when they can enhance your response. Use search tools for current information and calculations tools for math problems. PARAMETER RULES: When calling execute_javascript, ONLY provide the "code" parameter. When calling search_web, ONLY provide the "query" parameter. NEVER add extra properties like count, results, limit, etc. The schemas have additionalProperties: false and will reject extra parameters with HTTP 400 errors. RESPONSE FORMAT: Start with the direct answer, then show work if needed. Be concise and minimize descriptive text about your thinking. Cite all sources with URLs. CRITICAL: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. NEVER write things like <execute_javascript>{"code": "..."}</execute_javascript> or <function=search_web> or <function=execute_javascript> in your response. This API uses OpenAI function calling format, NOT Anthropic/Claude syntax. Tool calls happen automatically through the API.' + environmentContext;wers with citations and source references
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
const { getToolFunctions, callFunction } = require('./tools');
const { loadAllPricing, calculateLLMCost } = require('./pricing');
const { createProgressEmitter } = require('./utils/progress-emitter');

// Import refactored modules
const { 
    MAX_TOKENS_PLANNING, 
    MAX_TOKENS_TOOL_SYNTHESIS, 
    MAX_TOKENS_MATH_RESPONSE,
    MAX_TOKENS_FINAL_RESPONSE,
    getTokensForComplexity 
} = require('./config/tokens');
const { LAMBDA_MEMORY_LIMIT_MB, MEMORY_SAFETY_BUFFER_MB, MAX_CONTENT_SIZE_MB, BYTES_PER_MB } = require('./config/memory');
const { MAX_TOOL_ITERATIONS, DEFAULT_REASONING_EFFORT, getComprehensiveResearchSystemPrompt } = require('./config/prompts');
const { isQuotaLimitError, parseWaitTimeFromMessage } = require('./utils/error-handling');
const { safeParseJson } = require('./utils/token-estimation');
const { trackToolCall, trackLLMCall } = require('./services/tracking-service');
const { StreamingResponse } = require('./streaming/sse-writer');
const { formatJsonResponse, formatStreamingResponse, formatErrorResponse, formatCORSResponse } = require('./streaming/response-formatter');

// Tool call and LLM call tracking functions moved to src/services/tracking-service.js

// Global pricing cache - loaded once per Lambda container
let globalPricingCache = null;

// No legacy templates needed - tools-based approach handles everything dynamically

// Quota/rate limit error detection function moved to utils/error-handling.js

// parseWaitTimeFromMessage function moved to src/utils/error-handling.js

// Token configuration and tool flow configuration moved to src/config/tokens.js

// System prompt and safeParseJson moved to config/prompts.js and utils/token-estimation.js respectively

async function runToolLoop({ model, apiKey, userQuery, systemPrompt, stream }) {
    console.log(`🔧 ENTERED runToolLoop - model: ${model}, apiKey: ${!!apiKey}, userQuery length: ${userQuery?.length || 0}`);
    console.log(`🔧 runToolLoop userQuery:`, userQuery);
    console.log(`🔧 runToolLoop systemPrompt:`, systemPrompt);
    console.log(`🔧 STREAM CHECK - stream exists:`, !!stream, ', stream.writeEvent exists:', !!stream?.writeEvent);
    
    // TEST: Emit a test event immediately to verify stream works
    if (stream?.writeEvent) {
        stream.writeEvent('debug', { message: 'runToolLoop started', timestamp: new Date().toISOString() });
        console.log('✅ TEST: Successfully emitted debug event');
    } else {
        console.error('❌ TEST: stream or stream.writeEvent is undefined!');
    }
    
    // Initialize tracking variables
    let allToolCallCycles = [];
    let allLLMCalls = [];
    let totalCost = 0;
    let totalTokens = 0;
    
    // Collect search results
    const collectedSearchResults = [];

    // Step 1: Initial planning query to determine research strategy and optimal persona
    let researchPlan;
    let dynamicSystemPrompt; // Declare once at function level
    
    {
        // Step 1: Initial planning query to determine research strategy and optimal persona
        console.log(`🔧 Executing planning phase to optimize research approach...`);
        
        // Initialize researchPlan at function level to ensure availability throughout function
        // Get fresh system prompt with current date/time
        const COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT = getComprehensiveResearchSystemPrompt();
        
        researchPlan = { 
            research_questions: ["Initial research question"], 
            optimal_persona: systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT, 
            reasoning: "Default plan",
            complexity_assessment: "medium"
        };
    

                const planningPrompt = `You are an expert research strategist. Analyze this user query and classify it into one of these categories:

1. SIMPLE: Straightforward question that doesn't need extensive planning
     - Single fact lookup, definition, simple calculation
     - Example: "What is the capital of France?"
   
2. OVERVIEW: User wants a comprehensive understanding of a topic
     - Broad exploration with multiple angles
     - Multiple search queries and sub-questions needed
     - Example: "Tell me about climate change"
   
3. LONG_FORM: User wants a detailed document with sections and images
     - Explicitly asks for "detailed report", "comprehensive guide", "full analysis"
     - Requires multi-stage document building with snippets
     - Example: "Create a comprehensive guide to starting a business"
   
4. NEEDS_CLARIFICATION: Query is too vague or ambiguous
     - Missing critical context or details
     - Multiple interpretations possible
     - Example: "Tell me about it" (what is "it"?)

Query: "${userQuery}"

Respond with JSON in this format:
{
    "query_type": "SIMPLE|OVERVIEW|LONG_FORM|NEEDS_CLARIFICATION",
    "reasoning": "Explain why you classified it this way and your analysis",
  
    // For SIMPLE queries
    "simple_instruction": "Brief note that normal chat flow is sufficient",
  
    // For OVERVIEW queries
    "search_strategies": [
        {"keywords": ["term 1", "term 2"], "purpose": "Why search this"},
        {"keywords": ["term 3"], "purpose": "What this will reveal"}
    ],
    "research_questions": ["Question 1?", "Question 2?", "Question 3?"],
    "enhanced_system_prompt": "System prompt additions for broad topic coverage",
    "enhanced_user_prompt": "User prompt additions/clarifications",
  
    // For LONG_FORM queries
    "document_sections": [
        {"title": "Introduction", "keywords": ["..."], "questions": ["..."]},
        {"title": "Section 2", "keywords": ["..."], "questions": ["..."]}
    ],
    "snippet_workflow": "Step-by-step workflow for building sections and combining",
  
    // For NEEDS_CLARIFICATION
    "clarification_questions": [
        "What specific aspect are you interested in?",
        "What is the context or use case?",
        "What level of detail do you need?"
    ],
  
    // Common fields
    "optimal_persona": "Expert role and expertise description",
    "complexity_assessment": "low|medium|high"
}

IMPORTANT: Only include fields relevant to the query_type. Be decisive in classification.`;

    try {
        // Execute planning API call to determine optimal research strategy
        console.log('🔧 Making planning API call to determine research strategy...');
        //stream?.writeEvent?.('log', { message: 'Determining optimal research approach and expert persona...' });
        
        const planningRequestBody = {
            model,
            input: [
                { role: 'system', content: 'You are a research strategist. Analyze queries and determine optimal research approaches and expert personas. You may provide detailed analysis if the query is complex. Always respond with valid JSON only.' },
                { role: 'user', content: planningPrompt }
            ],
            tools: [], // No tools needed for planning
            options: {
                apiKey,
                reasoningEffort: DEFAULT_REASONING_EFFORT, // Use configurable reasoning effort
                temperature: 0.7, // Higher temperature for more creative and expansive planning
                max_tokens: MAX_TOKENS_PLANNING, // Allows up to 600 tokens for comprehensive planning
                timeoutMs: 25000 // Increased timeout for more complex planning
            }
        };
        
        // TEST: Emit a search_progress event first to verify stream works
        console.log('🔧 TEST: Emitting test search_progress event');
        if (stream?.writeEvent) {
            stream.writeEvent('search_progress', {
                phase: 'test',
                message: 'Testing if events work before planning',
                timestamp: new Date().toISOString()
            });
            console.log('✅ TEST: search_progress event emitted successfully');
        }
        
        // Emit LLM request event
        console.log('🔧 About to emit llm_request event - stream exists:', !!stream, 'writeEvent exists:', !!stream?.writeEvent);
        if (stream?.writeEvent) {
            stream.writeEvent('llm_request', {
                phase: 'planning',
                model,
                request: planningRequestBody,
                timestamp: new Date().toISOString()
            });
            console.log('✅ llm_request event emitted for planning phase');
        } else {
            console.error('❌ Cannot emit llm_request - stream or writeEvent is undefined');
        }
        
        let planningResponse;
        try {
            planningResponse = await llmResponsesWithTools(planningRequestBody);
            
            // Debug logging for HTTP headers
            console.log('📋 DEBUG - Full planningResponse object keys:', Object.keys(planningResponse));
            console.log('📋 DEBUG - httpHeaders value:', planningResponse.httpHeaders);
            console.log('📋 DEBUG - httpHeaders type:', typeof planningResponse.httpHeaders);
            console.log('📋 DEBUG - httpHeaders JSON:', JSON.stringify(planningResponse.httpHeaders, null, 2));
            console.log('📊 DEBUG - HTTP Status:', planningResponse.httpStatus);
            
            // Emit LLM response event with HTTP headers
            const eventData = {
                phase: 'planning',
                response: planningResponse.rawResponse || planningResponse,
                httpHeaders: planningResponse.httpHeaders || {},
                httpStatus: planningResponse.httpStatus
            };
            console.log('🔧 DEBUG - Event data to send:', JSON.stringify(eventData, null, 2));
            console.log('🔧 About to emit llm_response event - stream exists:', !!stream, 'writeEvent exists:', !!stream?.writeEvent);
            if (stream?.writeEvent) {
                stream.writeEvent('llm_response', eventData);
                console.log('✅ llm_response event emitted for planning phase');
            } else {
                console.error('❌ Cannot emit llm_response - stream or writeEvent is undefined');
            }

            console.log('🔍 Planning step completed');
        } catch (e) {
            console.error('Planning LLM call failed:', e?.message || e);
            stream?.writeEvent?.('error', {
                error: `Planning failed: ${e?.message || String(e)}`,
                phase: 'planning'
            });
            throw e; // Re-throw to trigger fallback handling
        }
        
        if (planningResponse?.text) {
            try {
                const parsed = JSON.parse(planningResponse.text.trim());
                if (parsed.research_questions && parsed.optimal_persona) {
                    researchPlan = parsed;
                    
                    // Send dedicated persona event for UI display
                    stream?.writeEvent?.('planning', {
                        persona: researchPlan.optimal_persona,
                        research_questions_needed: researchPlan.research_questions?.length || 1,
                        reasoning: researchPlan.reasoning,
                        questions: researchPlan.research_questions
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
        dynamicSystemPrompt = researchPlan.optimal_persona + ' Use tools when helpful. Strict params only. Cite sources.' + environmentContext;
        
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
        
        dynamicSystemPrompt = (systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT) + ' Use tools when helpful. Strict params only.' + environmentContext;
    }
    } // Close the block for planning

    // System prompt and user query prepared

    let input = [
        { role: 'system', content: dynamicSystemPrompt },
        { role: 'user', content: userQuery }
    ];
    
    // Track full tool results for final synthesis (separate from truncated conversation history)
    const fullToolResults = [];

    // Get tool functions with environment-based filtering
    const toolFunctions = getToolFunctions();
    // Starting tool loop with ${toolFunctions?.length || 0} available tools

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
       

        const toolIterationRequestBody = {
            model,
            input,
            tools: toolFunctions,
            options: {
                apiKey,
                reasoningEffort: DEFAULT_REASONING_EFFORT,
                temperature: 0.8,
                max_tokens: MAX_TOKENS_TOOL_SYNTHESIS,
                timeoutMs: 30000
            }
        };
        
        // Emit LLM request event
        stream?.writeEvent?.('llm_request', {
            phase: 'tool_iteration',
            iteration: iter + 1,
            model,
            request: toolIterationRequestBody,
            timestamp: new Date().toISOString()
        });
        
        let output, text;
        try {
            const response = await llmResponsesWithTools(toolIterationRequestBody);
            output = response.output;
            text = response.text;
            
            // Debug logging for HTTP headers
            console.log('📋 DEBUG tool_iteration - Full response object keys:', Object.keys(response));
            console.log('📋 DEBUG tool_iteration - httpHeaders:', response.httpHeaders);
            console.log('📋 DEBUG tool_iteration - httpHeaders JSON:', JSON.stringify(response.httpHeaders, null, 2));
            console.log('📊 DEBUG tool_iteration - httpStatus:', response.httpStatus);
            
            // Emit LLM response event with full response metadata and HTTP headers
            const eventData = {
                phase: 'tool_iteration',
                iteration: iter + 1,
                model,
                response: response.rawResponse || { output, text },
                httpHeaders: response.httpHeaders || {},
                httpStatus: response.httpStatus,
                timestamp: new Date().toISOString()
            };
            console.log('🔧 DEBUG tool_iteration - Event data:', JSON.stringify(eventData, null, 2));
            stream?.writeEvent?.('llm_response', eventData);
            
            console.log(`🔧 LLM Response - output:`, output?.length || 0, 'items, text length:', text?.length || 0);
            console.log(`🔧 LLM Output items:`, output?.map(item => ({ type: item.type, name: item.name })) || []);
        } catch (e) {
            console.error(`LLM call failed in tool iteration ${iter + 1}:`, e?.message || e);
            
            // Check if this is a tool_use_failed error (model generated malformed tool calls)
            const errorMsg = e?.message || String(e);
            const isToolFormatError = errorMsg.includes('tool_use_failed') || errorMsg.includes('Failed to call a function');
            
            if (isToolFormatError) {
                console.error(`⚠️ Model generated malformed tool calls. This model may not support tool calling properly.`);
                console.error(`💡 Recommendation: Try using a different model with better tool-calling support (e.g., groq:llama-3.3-70b-versatile or openai:gpt-4)`);
                
                stream?.writeEvent?.('error', {
                    error: `Model does not support tool calling properly. Try a different model like groq:llama-3.3-70b-versatile or openai:gpt-4. Error: ${errorMsg}`,
                    phase: 'tool_iteration',
                    iteration: iter + 1,
                    model_incompatible: true,
                    suggested_models: ['groq:llama-3.3-70b-versatile', 'groq:llama-3.3-70b-specdec', 'openai:gpt-4', 'openai:gpt-4o']
                });
            } else {
                stream?.writeEvent?.('error', {
                    error: `LLM call failed: ${errorMsg}`,
                    phase: 'tool_iteration',
                    iteration: iter + 1
                });
            }
            
            // Break the loop - cannot continue without LLM response
            break;
        }

        if (!output || output.length === 0) {
            // No more tool calls needed - proceed to final synthesis
            break;
        }

        const calls = output.filter(x => x.type === 'function_call');
        
        // Found ${calls.length} function calls
        console.log(`🔧 Raw output items:`, JSON.stringify(output, null, 2));
        
        // Prepare tool calls array for conversation history and events
        const toolCalls = calls.map(call => ({
            id: call.call_id || call.id,
            type: 'function',
            function: {
                name: call.name,
                arguments: call.arguments || '{}'
            }
        }));
        
        if (calls.length > 0) {
            console.log(`🔧 EMITTING TOOLS EVENT - Iteration ${iter + 1}, ${calls.length} calls`);
           
            // Add assistant message with tool calls to conversation history
            // This is required for OpenAI API - tool messages must be preceded by assistant message with tool_calls
            input.push({
                role: 'assistant',
                content: text || null,
                tool_calls: toolCalls
            });
            
            // Emit tool call info for UI
            stream?.writeEvent?.('tools', { 
                iteration: iter + 1, 
                count: calls.length, 
                names: calls.map(c => c.name),
                tool_calls: toolCalls
            });
        }

        const results = await Promise.allSettled(
            calls.map(async (tc, idx) => {
                const args = safeParseJson(tc.arguments || '{}');
                const call_id = tc.call_id || tc.id || `iter-${iter + 1}-call-${idx + 1}`;
                let output;
                try {
                    // Parse provider from model string for tool context
                    const { provider } = parseProviderModel(model);
                    
                    // Create context for tool execution
                    const context = { 
                        model, 
                        provider, // Add provider to context for tools like transcribe_url
                        apiKey, 
                        openaiApiKey: apiKey, // Ensure openaiApiKey is available for Whisper
                        googleToken,
                        tavilyApiKey, // Add Tavily API key for search/scrape tools
                        writeEvent: stream?.writeEvent,
                        toolCallId: call_id
                    };

                    // For transcribe_url tool, create progress emitter
                    if (tc.name === 'transcribe_url' && stream?.writeEvent) {
                        context.onProgress = createProgressEmitter(stream.writeEvent, call_id, 'transcribe_url');
                    }

                    output = await callFunction(tc.name, args, context);
                } catch (e) {
                    const errorMsg = String(e?.message || e);
                    console.error(`Tool ${tc.name} failed:`, errorMsg);
                    
                    // Emit error event for tool failures
                    stream?.writeEvent?.('error', {
                        iteration: iter + 1,
                        name: tc.name,
                        error: errorMsg
                    });
                    
                    output = JSON.stringify({ error: errorMsg });
                }
                const result = { iteration: iter + 1, call_id, name: tc.name, args, output: String(output) };
                
                // Collect search results and emit dedicated search_results event
                if (tc.name === 'search_web' && output) {
                    try {
                        const parsed = JSON.parse(output);
                        if (parsed.results && Array.isArray(parsed.results)) {
                            // Collect for final summary
                            collectedSearchResults.push(...parsed.results.map(r => ({
                                query: parsed.query,
                                title: r.title,
                                url: r.url,
                                description: r.description,
                                summary: parsed.summary || null
                            })));
                            
                            // Emit dedicated search_results event with full details
                            stream?.writeEvent?.('search_results', {
                                iteration: iter + 1,
                                query: parsed.query,
                                count: parsed.count || parsed.results.length,
                                results: parsed.results,
                                summary: parsed.summary || null,
                                individual_summaries: parsed.individual_summaries || null,
                                timestamp: new Date().toISOString()
                            });
                        }
                    } catch (e) {
                        console.log(`Failed to parse search results:`, e.message);
                    }
                }
                
                // Parse the output JSON for the tool_result event
                let parsedOutput = output;
                try {
                    parsedOutput = JSON.parse(String(output));
                } catch (parseError) {
                    // If parsing fails, keep the original string output
                    parsedOutput = String(output);
                }
                
                // Emit tool_result event with parsed output for easy UI consumption
                stream?.writeEvent?.('tool_result', { 
                    iteration: iter + 1, 
                    name: tc.name,
                    call_id: call_id,
                    args: args,
                    output: parsedOutput,
                    duration: result.duration || null,
                    timestamp: new Date().toISOString()
                });
                
                // Store full parsed output for final synthesis (not truncated)
                fullToolResults.push({
                    iteration: iter + 1,
                    name: tc.name,
                    args: args,
                    parsedOutput: parsedOutput,
                    timestamp: new Date().toISOString()
                });
                
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
        
        // Build context from full tool results, preferring LLM-generated summaries
        let allInformation = fullToolResults
            .map((toolResult, index) => {
                const output = toolResult.parsedOutput;
                const toolName = toolResult.name;
                
                // For search_web: prefer summary > individual_summaries > descriptions > content
                if (toolName === 'search_web' && typeof output === 'object') {
                    const searchQuery = output.query || 'unknown';
                    
                    // If we have an LLM-generated synthesis summary, use it (most concise)
                    if (output.summary) {
                        return `Search: "${searchQuery}"\nFindings: ${output.summary}`;
                    }
                    
                    // If we have individual page summaries, format them with full context
                    if (output.individual_summaries && Array.isArray(output.individual_summaries)) {
                        const formattedSummaries = output.individual_summaries
                            .map((pageSum, i) => {
                                // Handle both object format {url, title, summary} and string format
                                if (typeof pageSum === 'object' && pageSum.summary) {
                                    return `  [${i + 1}] ${pageSum.title || pageSum.url}: ${pageSum.summary}`;
                                } else if (typeof pageSum === 'string') {
                                    return `  [${i + 1}] ${pageSum}`;
                                }
                                return null;
                            })
                            .filter(Boolean)
                            .join('\n');
                        return `Search: "${searchQuery}"\nRelevant findings:\n${formattedSummaries}`;
                    }
                    
                    // Fall back to descriptions from search results
                    if (output.results && Array.isArray(output.results)) {
                        const descriptions = output.results
                            .map((r, i) => `  [${i + 1}] ${r.title}: ${r.description || 'No description'}`)
                            .join('\n');
                        return `Search: "${searchQuery}"\nResults:\n${descriptions}`;
                    }
                }
                
                // For scrape_web_content: prefer summary > content
                if (toolName === 'scrape_web_content' && typeof output === 'object') {
                    if (output.summary) {
                        return `Source ${index + 1} (Scraped: ${output.url || 'unknown'}): ${output.summary}`;
                    }
                    if (output.content) {
                        return `Source ${index + 1} (Scraped: ${output.url || 'unknown'}): ${output.content}`;
                    }
                }
                
                // For execute_javascript: just use the result
                if (toolName === 'execute_javascript' && typeof output === 'object') {
                    if (output.result !== undefined) {
                        return `Source ${index + 1} (Code execution): ${output.result}`;
                    }
                }
                
                // Fallback: stringify the output
                const stringOutput = typeof output === 'string' ? output : JSON.stringify(output);
                return `Source ${index + 1} (${toolName}): ${stringOutput}`;
            })
            .join('\n\n');
        
        // CRITICAL: Model-aware token budget management
        // Different models have different context windows and TPM limits
        const modelName = model.replace(/^(openai:|groq:)/, '');
        
        // Detect low-TPM models that need ultra-aggressive optimization
        const isLowTPMModel = modelName.includes('llama-4-scout') || 
                              modelName.includes('llama-4-maverick');
        
        // Define per-model token budgets (conservative estimates accounting for TPM limits)
        // CRITICAL: TPM = cumulative tokens across ALL calls in 60 seconds, not per-request
        // Low-TPM models need ULTRA-AGGRESSIVE limits: 30k TPM total ÷ 3 calls = ~10k per call MAX
        // But we also need buffer for: initial query + conversation history + response generation
        // Therefore: Limit information context to just 1500 tokens (~6k chars) for low-TPM models
        const MODEL_TOKEN_BUDGETS = {
            // Groq models with TPM limits
            'meta-llama/llama-4-scout-17b-16e-instruct': 1500,  // 30k TPM ÷ 3 calls = 10k per call, use 1.5k for info
            'meta-llama/llama-4-maverick-17b-128e-instruct': 1500, // Must leave room for query + history + response
            'llama-3.1-8b-instant': 20000, // 120k TPM, can use more
            'llama-3.3-70b-versatile': 20000, // 64k TPM, higher capacity
            'mixtral-8x7b-32768': 20000, // 60k TPM
            // OpenAI models (higher limits)
            'gpt-4o': 40000,
            'gpt-4o-mini': 40000,
            'gpt-4': 40000,
            'gpt-3.5-turbo': 30000,
            // Default for unknown models
            'default': 15000
        };
        
        // Get token budget for this model
        const maxInfoTokens = MODEL_TOKEN_BUDGETS[modelName] || MODEL_TOKEN_BUDGETS['default'];
        const MAX_INFO_CHARS = maxInfoTokens * 4; // ~4 chars per token
        
        if (isLowTPMModel) {
            console.warn(`⚠️ LOW-TPM MODEL DETECTED: ${modelName}`);
            console.warn(`⚠️ Using ultra-aggressive optimization: ${maxInfoTokens} tokens (~${MAX_INFO_CHARS} chars)`);
            console.warn(`⚠️ TPM accounting: 30k limit ÷ 3 calls = 10k/call, leaving room for query + history`);
        }
        
        console.log(`📊 Token budget for ${modelName}: ${maxInfoTokens} tokens (~${MAX_INFO_CHARS} chars)`);
        
        // Calculate current size
        const currentTokens = Math.ceil(allInformation.length / 4);
        console.log(`📊 Current information size: ${allInformation.length} chars (~${currentTokens} tokens)`);
        
        if (allInformation.length > MAX_INFO_CHARS) {
            console.warn(`⚠️ Information context too large for model ${modelName}`);
            console.warn(`   Current: ${allInformation.length} chars (~${currentTokens} tokens)`);
            console.warn(`   Limit: ${MAX_INFO_CHARS} chars (~${maxInfoTokens} tokens)`);
            console.warn(`   Truncating to fit model's token budget...`);
            
            // Smart truncation: Try to keep complete sources rather than cutting mid-sentence
            const sources = allInformation.split('\n\n');
            let truncated = '';
            let charCount = 0;
            
            for (const source of sources) {
                if (charCount + source.length + 2 <= MAX_INFO_CHARS - 200) { // Leave 200 chars for truncation notice
                    truncated += source + '\n\n';
                    charCount += source.length + 2;
                } else {
                    break;
                }
            }
            
            allInformation = truncated + `\n[...Additional sources truncated to fit model token limit of ${maxInfoTokens} tokens. Analysis based on ${sources.length} total sources, ${truncated.split('\n\n').length - 1} included above.]`;
            console.log(`✅ Truncated to ${allInformation.length} chars (~${Math.ceil(allInformation.length / 4)} tokens)`);
        }

        // Get current date and time for environmental context
        const now = new Date();
        const currentDateTime = now.toISOString().split('T')[0] + ' ' + now.toTimeString().split(' ')[0] + ' UTC';
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
        
        // Use the comprehensive final template from environment variables
        // Enhanced template that emphasizes query-context relationship
        const finalTemplate = process.env.FINAL_TEMPLATE || `User Question: {{ORIGINAL_QUERY}}

Research Findings:
{{ALL_INFORMATION}}

Task: Synthesize the above findings to answer the user's question. Each finding was gathered specifically to address aspects of this question. Cite URLs when referencing specific information.`;

        // Add environmental context to the final prompt
        const environmentalContext = `\n\nContext: ${dayOfWeek}, ${currentDateTime} - Analysis based on current real-time information.`;
        
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
            
            
            // Enhance system prompt for high complexity queries
            if (complexityAssessment === 'high') {
                mathSystemPrompt = `${dynamicSystemPrompt}\n\nFor this high-complexity analysis: Provide comprehensive, detailed responses with thorough analysis. You have expanded token allocation to deliver in-depth insights, multiple perspectives, and detailed explanations as needed.`;
            }
        }

        const finalSynthesisInput = [
            { role: 'system', content: mathSystemPrompt },
            { role: 'user', content: finalPrompt }
        ];

        const finalRequestBody = {
            model,
            input: finalSynthesisInput,
            tools: [], // No more tools, just final answer
            options: {
                apiKey,
                reasoningEffort: DEFAULT_REASONING_EFFORT,
                temperature: 0.8, // Higher temperature for more comprehensive, detailed responses
                max_tokens: maxTokens, // Dynamically adjusted based on query complexity (2048-8192 tokens)
                timeoutMs: 30000
            }
        };
        
        // Emit LLM request event
        stream?.writeEvent?.('llm_request', {
            phase: 'final_synthesis',
            model,
            request: finalRequestBody,
            timestamp: new Date().toISOString()
        });
        
        let finalResponse;
        try {
            finalResponse = await llmResponsesWithTools(finalRequestBody);
            
            // Emit LLM response event with full response metadata and HTTP headers
            stream?.writeEvent?.('llm_response', {
                phase: 'final_synthesis',
                response: finalResponse.rawResponse || finalResponse,
                httpHeaders: finalResponse.httpHeaders || {},
                httpStatus: finalResponse.httpStatus
            });
        } catch (e) {
            console.error('Final synthesis LLM call failed:', e?.message || e);
            stream?.writeEvent?.('error', {
                error: `Final synthesis failed: ${e?.message || String(e)}`,
                phase: 'final_synthesis'
            });
            throw e; // Re-throw to outer catch block
        }
        
        const result = finalResponse?.text || 'I was unable to provide a comprehensive answer based on the research conducted.';
        
        // Create cost summary from tracked values
        const costSummary = {
            totalCost: totalCost,
            totalTokens: totalTokens,
            totalInputTokens: allLLMCalls.reduce((sum, call) => sum + (call.request?.usage?.prompt_tokens || 0), 0),
            totalOutputTokens: allLLMCalls.reduce((sum, call) => sum + (call.request?.usage?.completion_tokens || 0), 0),
            details: allLLMCalls
        };
        console.log(`💰 Total Query Cost: $${costSummary.totalCost.toFixed(4)} (${costSummary.totalTokens} tokens)`);
        
        // Send cost information to the UI
        stream?.writeEvent?.('cost_summary', {
            totalCost: costSummary.totalCost,
            totalTokens: costSummary.totalTokens
        });
        
        // Send the final response to the UI
        stream?.writeEvent?.('final_answer', { 
            content: result
        });
        
        return { 
            finalText: result,
            researchPlan: researchPlan,
            searchResults: collectedSearchResults
        };
    } catch (e) {
        console.error('Final synthesis failed:', e?.message || e);
        const originalError = e?.message || String(e);
        const errorMsg = `Error from LLM provider: ${originalError}`;
        
        // Send error event - never return errors as final_answer
        const isQuotaError = isQuotaLimitError(originalError);
        const waitTime = isQuotaError ? parseWaitTimeFromMessage(originalError) : null;
        
        stream?.writeEvent?.('error', {
            error: errorMsg,
            isQuotaError,
            waitTime
        });
        
        // Return empty result - error was already sent via event
        return { 
            finalText: ''
        };
    }
}

/**
 * Handle file/URL conversion to markdown
 * @param {object} event - Lambda event
 * @param {object} responseStream - Response stream
 * @param {object} context - Lambda context
 */
async function handleConvertToMarkdown(event, responseStream, context) {
    const { convertToMarkdown } = require('./rag/file-converters');
    
    try {
        const body = JSON.parse(event.body || '{}');
        let markdown;
        
        // Handle file buffer (from multer middleware in local server)
        if (body.fileBuffer && body.fileName) {
            console.log(`📄 Converting file: ${body.fileName} (${body.mimeType})`);
            console.log(`📊 Buffer size: ${body.fileBuffer.length} chars (base64)`);
            
            const buffer = Buffer.from(body.fileBuffer, 'base64');
            console.log(`📊 Decoded buffer size: ${buffer.length} bytes`);
            
            const mimeType = body.mimeType || '';
            
            // Convert to markdown
            console.log('🔄 Starting conversion...');
            const result = await convertToMarkdown(buffer, mimeType, {});
            console.log(`✅ Conversion complete. Result:`, {
                hasMarkdown: !!result.markdown,
                markdownLength: result.markdown?.length || 0,
                hasImages: !!result.images,
                imageCount: result.images?.length || 0,
                markdownPreview: result.markdown ? result.markdown.substring(0, 100) + '...' : '(empty)'
            });
            
            markdown = result.markdown;
            
            if (!markdown || markdown.trim().length === 0) {
                console.error('❌ Conversion returned empty markdown!');
                throw new Error('PDF conversion returned no content');
            }
            
        } else if (body.url) {
            // Handle URL fetch and conversion
            const https = require('https');
            const http = require('http');
            const url = body.url;
            
            // Fetch URL content
            const fetchPromise = new Promise((resolve, reject) => {
                const client = url.startsWith('https') ? https : http;
                
                client.get(url, (res) => {
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        const buffer = Buffer.concat(chunks);
                        const contentType = res.headers['content-type'] || '';
                        resolve({ buffer, contentType });
                    });
                }).on('error', reject);
            });
            
            const { buffer, contentType } = await fetchPromise;
            
            // Convert to markdown
            const result = await convertToMarkdown(buffer, contentType.split(';')[0], {});
            markdown = result.markdown;
        } else {
            throw new Error('Either file or URL is required');
        }
        
        // Validate markdown before sending
        if (!markdown || markdown.trim().length === 0) {
            console.error('❌ Final markdown is empty or null!');
            throw new Error('Conversion produced no content');
        }
        
        console.log(`📤 Sending response with markdown length: ${markdown.length}`);
        
        // Return markdown
        responseStream.write(JSON.stringify({
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ markdown, content: markdown })
        }));
        
    } catch (error) {
        console.error('❌ Conversion error:', error);
        console.error('Error stack:', error.stack);
        
        responseStream.write(JSON.stringify({
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                error: 'Failed to convert document',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        }));
    }
    
    responseStream.end();
}

/**
 * Handle RAG-specific endpoints
 * @param {object} event - Lambda event
 * @param {object} responseStream - Response stream
 * @param {object} context - Lambda context
 * @param {function} writeEvent - Function to write SSE events
 * @param {string} path - Request path
 * @param {string} httpMethod - HTTP method
 */
async function handleRAGEndpoint(event, responseStream, context, writeEvent, path, httpMethod) {
    const { ingestDocument } = require('./rag');
    const { searchChunks } = require('./rag/search');
    const { getChunksBySnippetIds, hasEmbedding } = require('./rag/libsql-storage');
    
    try {
        const body = JSON.parse(event.body || '{}');
        
        // POST /rag/ingest - Ingest documents/URLs/text
        if (path === '/rag/ingest' && httpMethod === 'POST') {
            const { content, sourceType, title, url } = body;
            
            if (!content && !url) {
                writeEvent('error', { error: 'Either content or url is required' });
                responseStream.end();
                return;
            }
            
            writeEvent('log', { message: 'Starting document ingestion...' });
            
            try {
                let result;
                if (url) {
                    // Ingest from URL
                    result = await ingestDocument(url, {
                        sourceType: 'url',
                        title: title || url
                    });
                } else {
                    // Ingest text content
                    result = await ingestDocument(content, {
                        sourceType: sourceType || 'text',
                        title: title || 'Untitled Document'
                    });
                }
                
                writeEvent('success', {
                    message: 'Document ingested successfully',
                    chunks: result.chunks.length,
                    document: result.document
                });
                
            } catch (error) {
                console.error('Ingestion error:', error);
                writeEvent('error', {
                    error: 'Failed to ingest document',
                    details: error.message
                });
            }
            
            responseStream.end();
            return;
        }
        
        // POST /rag/embed-snippets - Generate embeddings for SWAG snippets
        if (path === '/rag/embed-snippets' && httpMethod === 'POST') {
            const { snippetIds, snippets } = body;
            
            if (!Array.isArray(snippets) || snippets.length === 0) {
                writeEvent('error', { error: 'snippets array is required' });
                responseStream.end();
                return;
            }
            
            writeEvent('log', { message: `Processing ${snippets.length} snippets...` });
            
            const results = [];
            let embedded = 0;
            let skipped = 0;
            let failed = 0;
            
            for (const snippet of snippets) {
                try {
                    // Check if already has embeddings
                    const exists = await hasEmbedding(snippet.id);
                    
                    if (exists) {
                        results.push({
                            id: snippet.id,
                            status: 'skipped',
                            reason: 'Already has embeddings'
                        });
                        skipped++;
                        writeEvent('progress', {
                            current: results.length,
                            total: snippets.length,
                            skipped,
                            embedded
                        });
                        continue;
                    }
                    
                    // Generate embeddings
                    const result = await ingestDocument(snippet.content, {
                        sourceType: 'text',
                        title: snippet.title || `Snippet ${snippet.id}`,
                        metadata: {
                            snippetId: snippet.id,
                            tags: snippet.tags || [],
                            timestamp: snippet.timestamp
                        }
                    });
                    
                    results.push({
                        id: snippet.id,
                        status: 'embedded',
                        chunks: result.chunks.length
                    });
                    embedded++;
                    
                    writeEvent('progress', {
                        current: results.length,
                        total: snippets.length,
                        skipped,
                        embedded
                    });
                    
                } catch (error) {
                    console.error(`Failed to embed snippet ${snippet.id}:`, error);
                    results.push({
                        id: snippet.id,
                        status: 'failed',
                        error: error.message
                    });
                    failed++;
                }
            }
            
            writeEvent('success', {
                message: 'Bulk embedding complete',
                embedded,
                skipped,
                failed,
                results
            });
            
            responseStream.end();
            return;
        }
        
        // GET /rag/documents - List ingested documents
        if (path === '/rag/documents' && httpMethod === 'GET') {
            const { listDocuments } = require('./rag/libsql-storage');
            
            try {
                const documents = await listDocuments();
                
                writeEvent('success', {
                    documents,
                    count: documents.length
                });
                
            } catch (error) {
                console.error('Failed to list documents:', error);
                writeEvent('error', {
                    error: 'Failed to list documents',
                    details: error.message
                });
            }
            
            responseStream.end();
            return;
        }
        
        // Unknown RAG endpoint
        writeEvent('error', { error: `Unknown RAG endpoint: ${path}` });
        responseStream.end();
        
    } catch (error) {
        console.error('RAG endpoint error:', error);
        writeEvent('error', {
            error: 'RAG endpoint failed',
            details: error.message
        });
        responseStream.end();
    }
}

/**
 * Main Lambda handler function - streaming only
 */
exports.handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    const startTime = Date.now();
    
    // DEBUG: Log the event structure
    console.log('🔧 EVENT STRUCTURE:', JSON.stringify({
        httpMethod: event.httpMethod,
        requestContext: event.requestContext,
        method: event.requestContext?.http?.method,
        rawPath: event.rawPath,
        headers: event.headers
    }));
    
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
        // Initialize pricing cache if not already loaded
        if (!globalPricingCache) {
            try {
                console.log('Loading pricing data...');
                globalPricingCache = await loadAllPricing();
                console.log('Pricing data loaded successfully');
            } catch (pricingError) {
                console.error('Failed to load pricing data:', pricingError.message);
            }
        }
        
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
        
        //writeEvent('log', { message: 'Connected! Processing request...' });
        
        // Extract parameters from request
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        const path = event.path || event.rawPath || '/';
        
        console.log(`🔧 REQUEST: ${httpMethod} ${path}`);
        
        // Route document conversion endpoint
        if (path === '/convert-to-markdown' && httpMethod === 'POST') {
            return await handleConvertToMarkdown(event, responseStream, context);
        }
        
        // Route different paths
        if (path.startsWith('/rag/')) {
            // RAG-specific endpoints - handle in separate handlers
            return await handleRAGEndpoint(event, responseStream, context, writeEvent, path, httpMethod);
        }
        
        // Default /chat endpoint - require POST
        if (httpMethod !== 'POST') {
            writeEvent('error', { error: 'Method not allowed. Only POST requests are supported.' });
            responseStream.end();
            return;
        }
        
        const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        const model = body.model || 'groq:llama-3.1-8b-instant';
        const accessSecret = body.accessSecret || '';
        const apiKey = body.apiKey || '';
        const tavilyApiKey = body.tavilyApiKey || '';
        
        // Extract Google token from body OR Authorization header
        let googleToken = body.google_token || body.googleToken || null;
        if (!googleToken && event.headers) {
            const authHeader = event.headers.authorization || event.headers.Authorization;
            console.log('🔑 Auth header present:', !!authHeader);
            console.log('🔑 Auth header starts with Bearer:', authHeader ? authHeader.startsWith('Bearer ') : false);
            if (authHeader && authHeader.startsWith('Bearer ')) {
                googleToken = authHeader.substring(7);
                console.log('🔑 Extracted googleToken length:', googleToken ? googleToken.length : 0);
            }
        }
        console.log('🔑 Final googleToken exists:', !!googleToken);

        // Authentication check
        if (process.env.ACCESS_SECRET) {
            if (!accessSecret || accessSecret !== process.env.ACCESS_SECRET) {
                writeEvent('error', { error: 'Invalid or missing accessSecret', code: 'INVALID_ACCESS_SECRET' });
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
            writeEvent('error', { error: 'Query parameter is required' });
            responseStream.end();
            return;
        }
        
        if (!apiKey && !allowEnvFallback) {
            writeEvent('error', { error: 'API key required. Sign in with an allowed Google account or provide an apiKey.', code: 'NO_API_KEY' });
            responseStream.end();
            return;
        }

        // Send initialization event
        writeEvent('init', {
            query: query,
            model: model,
            user: user ? { email: user.email, name: user.name } : null
        });

        // TEST: Emit a test llm_request event IMMEDIATELY to verify it works
        console.log('🔧 TEST: About to emit test llm_request event at handler level');
        writeEvent('llm_request', {
            phase: 'test_handler',
            model: model,
            request: { test: 'This is a test llm_request event from the handler' },
            timestamp: new Date().toISOString()
        });
        console.log('✅ TEST: llm_request event emitted at handler level');

        // Execute tool loop with streaming
        const streamObject = { writeEvent };
        console.log('🔧 HANDLER: About to call runToolLoop');
        console.log('🔧 HANDLER: writeEvent function exists:', typeof writeEvent === 'function');
        console.log('🔧 HANDLER: streamObject:', !!streamObject, 'streamObject.writeEvent:', typeof streamObject.writeEvent);
        
        const toolsRun = await runToolLoop({
            model,
            apiKey: apiKey || (allowEnvFallback ? (process.env[parseProviderModel(model).provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'] || '') : ''),
            userQuery: query,
            systemPrompt: getComprehensiveResearchSystemPrompt(), // Get fresh prompt with current date/time
            stream: streamObject
        });
        
        // Send completion event
        writeEvent('complete', {
            executionTime: Date.now() - startTime
        });
        
        responseStream.end();
        
    } catch (error) {
        console.error('Lambda handler error:', error);
        const writeEvent = (type, data) => {
            try {
                const eventText = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
                responseStream.write(eventText);
            } catch (writeError) {
                console.error('Stream write error:', writeError);
            }
        };
        
        writeEvent('error', { error: error.message });
        responseStream.end();
    }
});

// StreamingResponse class moved to src/streaming/sse-writer.js

/**
 * Generate planning prompt for research strategy analysis
 * @param {string} query - The user query to analyze
 * @returns {string} - Formatted planning prompt
 */
function generatePlanningPrompt(query) {
    return `Analyze this research query and provide a comprehensive planning response.

**Query to analyze:** "${query}"

Please provide your analysis in the following JSON format based on the query type:

**For overview queries:**
{
  "queryType": "overview",
  "complexity": "simple|moderate|complex",
  "researchApproach": "direct|search-based|comprehensive",
  "searchQueries": [
    "primary search term 1", "primary search term 2", "primary search term 3",
    "alternative phrasing 1", "alternative phrasing 2", "alternative phrasing 3",
    "technical term 1", "technical term 2", "specific subtopic 1", "specific subtopic 2"
  ],
  "researchQuestions": [
    "What is the fundamental question about X?", "How does Y relate to Z?", "What are the key factors affecting A?",
    "What are the current trends in B?", "What are the main challenges with C?", "How do experts view D?",
    "What evidence supports E?", "What are the implications of F?", "How does this compare to G?", "What future developments are expected?"
  ],
  "suggestedSources": [
    {"type": "academic", "examples": ["PubMed", "Google Scholar", "ResearchGate", "JSTOR", "specific academic databases"]},
    {"type": "government", "examples": ["CDC", "NIH", "FDA", "specific government agencies"]},
    {"type": "professional", "examples": ["professional associations", "industry organizations", "certification bodies"]},
    {"type": "news", "examples": ["Reuters", "Associated Press", "BBC", "specialized trade publications"]},
    {"type": "specialized", "examples": ["domain-specific databases", "specialized websites", "expert blogs", "conference proceedings"]}
  ],
  "expertPersona": "You are a [specific expert type] with expertise in [specific area]. You have [specific qualifications/experience].",
  "enhancedSystemPrompt": "You are a [expert persona]. Your task is to research and analyze [topic] by searching for information about: [list key areas]. Focus on answering: [research questions]. Use a [methodology] approach and aim to find [estimatedSources] high-quality sources from suggested source types.",
  "enhancedUserPrompt": "Please research [topic] comprehensively. Search for: [searchQueries]. Answer these key questions: [researchQuestions]. Consult these types of sources: [suggestedSources]. Provide detailed analysis based on your findings.",
  "estimatedSources": 8-15,
  "methodology": "description of specific research approach and analysis method"
}

**For long-form queries:**
{
  "queryType": "long-form",
  "complexity": "simple|moderate|complex", 
  "researchApproach": "comprehensive",
  "documentSections": [
    {"title": "Section 1 Title", "keywords": ["keyword1", "keyword2", "keyword3", "related term1", "alternative term1"], "questions": ["Primary question?", "Secondary question?", "Supporting question?"]},
    {"title": "Section 2 Title", "keywords": ["keyword4", "keyword5", "keyword6", "related term2", "alternative term2"], "questions": ["Primary question?", "Secondary question?", "Supporting question?"]},
    {"title": "Section 3 Title", "keywords": ["keyword7", "keyword8", "keyword9", "related term3", "alternative term3"], "questions": ["Primary question?", "Secondary question?", "Supporting question?"]}
  ],
  "suggestedSources": [
    {"type": "academic", "examples": ["relevant academic databases", "peer-reviewed journals", "research institutions"]},
    {"type": "authoritative", "examples": ["government agencies", "official organizations", "expert institutions"]},
    {"type": "current", "examples": ["recent publications", "industry reports", "current news sources"]},
    {"type": "specialized", "examples": ["domain-specific resources", "professional publications", "expert interviews"]}
  ],
  "expertPersona": "You are a [specific expert type] specializing in [area].",
  "snippetWorkflow": "1. Research Section 1 using keywords [keywords] from [suggestedSources] and answer [questions]\n2. Research Section 2 using keywords [keywords] from [suggestedSources] and answer [questions]\n3. Research Section 3 using keywords [keywords] from [suggestedSources] and answer [questions]\n4. Synthesize findings into comprehensive document",
  "enhancedSystemPrompt": "You are a [expert persona]. You will create a comprehensive document about [topic] with sections: [section titles]. For each section, research using the specified keywords from suggested source types and answer the associated questions.",
  "enhancedUserPrompt": "Create a comprehensive document about [topic]. Follow this workflow: [snippetWorkflow]. Research each section thoroughly using the provided keywords from these source types: [suggestedSources]. Answer all associated questions.",
  "estimatedSources": 12-25,
  "methodology": "Section-by-section research and synthesis approach with diverse source consultation"
}

**For minimal queries:**
{
  "queryType": "minimal",
  "complexity": "simple",
  "researchApproach": "direct",
  "simpleInstruction": "Brief, direct answer to the query",
  "expertPersona": "You are a knowledgeable assistant.",
  "enhancedSystemPrompt": "Provide a direct, factual answer to the user's question.",
  "enhancedUserPrompt": "[original query]"
}

**For clarification queries:**
{
  "queryType": "clarification", 
  "complexity": "unknown",
  "clarificationQuestions": ["What specifically do you mean by X?", "Are you looking for Y or Z?"],
  "expertPersona": "You are a helpful research assistant.",
  "enhancedSystemPrompt": "Ask clarifying questions to better understand the user's research needs.",
  "enhancedUserPrompt": "I need clarification on your request. [clarificationQuestions]"
}

**CRITICAL JSON Requirements:**
- Response MUST be valid JSON only - no additional text before or after
- All strings must use double quotes, not single quotes
- No trailing commas in arrays or objects
- Escape quotes inside strings with backslashes
- Arrays must be properly closed with ]
- Objects must be properly closed with }

**Guidelines:**
- **searchQueries**: Create 8-12 diverse search terms including: primary terms, alternative phrasings, technical terms, related concepts, and specific subtopics
- **researchQuestions**: Generate 8-15 comprehensive questions covering: fundamental concepts, relationships, current trends, challenges, expert perspectives, evidence, implications, comparisons, and future developments  
- **suggestedSources**: Provide 4-6 source categories with specific examples of where to find authoritative information
- **enhancedSystemPrompt**: Build a detailed system prompt that incorporates the expert persona, search queries, research questions, suggested sources, and methodology
- **enhancedUserPrompt**: Create a detailed user prompt that references the search queries, research questions, suggested sources, and expected analysis
- **expertPersona**: Define a specific expert role with relevant credentials and specialization
- **methodology**: Describe the specific research and analysis approach including source diversification

**JSON Validation Checklist:**
✓ Valid JSON structure with proper opening and closing braces
✓ All property names in double quotes
✓ All string values in double quotes with escaped internal quotes
✓ No trailing commas before closing braces or brackets
✓ Proper array syntax with square brackets
✓ Consistent formatting throughout

Determine the optimal research strategy:
- **minimal**: Simple factual queries needing brief answers
- **overview**: Broad topics needing comprehensive coverage with multiple sources
- **long-form**: Complex analysis requiring structured document creation  
- **clarification**: Ambiguous queries needing clarification

IMPORTANT: The enhancedSystemPrompt and enhancedUserPrompt must incorporate the planning details (searchQueries, researchQuestions, methodology, etc.) to guide the actual research process.`;
}

// Export the handler and utility functions
module.exports = {
    handler: exports.handler,
    generatePlanningPrompt
};
