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
const { toolFunctions, callFunction } = require('./tools');
const { loadAllPricing, calculateLLMCost } = require('./pricing');

// Import refactored modules
const { 
    MAX_TOKENS_PLANNING, 
    MAX_TOKENS_TOOL_SYNTHESIS, 
    MAX_TOKENS_MATH_RESPONSE,
    MAX_TOKENS_FINAL_RESPONSE,
    getTokensForComplexity 
} = require('./config/tokens');
const { LAMBDA_MEMORY_LIMIT_MB, MEMORY_SAFETY_BUFFER_MB, MAX_CONTENT_SIZE_MB, BYTES_PER_MB } = require('./config/memory');
const { MAX_TOOL_ITERATIONS, DEFAULT_REASONING_EFFORT, COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT } = require('./config/prompts');
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
        researchPlan = { 
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
                temperature: 0.2, // Slightly higher temperature for more creative planning
                max_tokens: MAX_TOKENS_PLANNING, // Now allows up to 300 tokens for planning
                timeoutMs: 25000 // Increased timeout for more complex planning
            }
        };
        
        // Emit LLM request event
        stream?.writeEvent?.('llm_request', {
            phase: 'planning',
            model,
            request: planningRequestBody,
            timestamp: new Date().toISOString()
        });
        
        let planningResponse;
        try {
            planningResponse = await llmResponsesWithTools(planningRequestBody);
            
            // Emit LLM response event
            stream?.writeEvent?.('llm_response', {
                phase: 'planning',
                response: planningResponse
            });

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
        dynamicSystemPrompt = researchPlan.optimal_persona + ' CRITICAL TOOL RULES: Always use the available search_web and execute_javascript tools when they can enhance your response. Use search tools for current information and calculations tools for math problems. PARAMETER RULES: When calling execute_javascript, ONLY provide the "code" parameter. When calling search_web, ONLY provide the "query" parameter. NEVER add extra properties like count, results, limit, etc. The schemas have additionalProperties: false and will reject extra parameters with HTTP 400 errors. RESPONSE FORMAT: Start with the direct answer, then show work if needed. Be concise and minimize descriptive text about your thinking. Cite all sources with URLs. CRITICAL: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. NEVER write things like <execute_javascript>{\"code\": \"...\"}</execute_javascript> in your response. Tool calls happen automatically through the API.' + environmentContext;
        
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
        
        dynamicSystemPrompt = (systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT) + ' CRITICAL TOOL RULES: Always use available tools (search_web, execute_javascript, scrape_web_content) when they can provide better, more current, or more accurate information. For math questions, always use execute_javascript. For current events or factual queries, always use search_web. PARAMETER RULES: When calling execute_javascript, ONLY provide the "code" parameter. When calling search_web, ONLY provide the "query" parameter. When calling scrape_web_content, ONLY provide the "url" parameter. NEVER add extra properties like count, results, limit, etc. The schemas have additionalProperties: false and will reject extra parameters with HTTP 400 errors. RESPONSE FORMAT: Start with the direct answer, then show work if needed. Be concise and minimize descriptive text about your thinking. CRITICAL: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. NEVER write things like <execute_javascript>{\"code\": \"...\"}</execute_javascript> or <function=search_web> or <function=execute_javascript> in your response. This API uses OpenAI function calling format, NOT Anthropic/Claude syntax. Tool calls happen automatically through the API.' + environmentContext;
    }
    } // Close the block for planning

    // System prompt and user query prepared

    let input = [
        { role: 'system', content: dynamicSystemPrompt },
        { role: 'user', content: userQuery }
    ];
    
    // Track full tool results for final synthesis (separate from truncated conversation history)
    const fullToolResults = [];

    // Starting tool loop with ${toolFunctions?.length || 0} available tools

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
       

        const toolIterationRequestBody = {
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
            
            // Emit LLM response event
            stream?.writeEvent?.('llm_response', {
                phase: 'tool_iteration',
                iteration: iter + 1,
                model,
                response: { output, text },
                timestamp: new Date().toISOString()
            });
            
            console.log(`🔧 LLM Response - output:`, output?.length || 0, 'items, text length:', text?.length || 0);
            console.log(`🔧 LLM Output items:`, output?.map(item => ({ type: item.type, name: item.name })) || []);
        } catch (e) {
            console.error(`LLM call failed in tool iteration ${iter + 1}:`, e?.message || e);
            
            // Check if this is a tool_use_failed error (model generated malformed tool calls)
            const errorMsg = e?.message || String(e);
            const isToolFormatError = errorMsg.includes('tool_use_failed') || errorMsg.includes('Failed to call a function');
            
            if (isToolFormatError) {
                console.error(`⚠️ Model generated malformed tool calls. This model may not support tool calling properly.`);
                console.error(`💡 Recommendation: Try using a different model with better tool-calling support (e.g., groq:llama-3.1-70b-versatile or openai:gpt-4)`);
                
                stream?.writeEvent?.('error', {
                    error: `Model does not support tool calling properly. Try a different model like groq:llama-3.1-70b-versatile or openai:gpt-4. Error: ${errorMsg}`,
                    phase: 'tool_iteration',
                    iteration: iter + 1,
                    model_incompatible: true,
                    suggested_models: ['groq:llama-3.1-70b-versatile', 'groq:llama-3.3-70b-versatile', 'openai:gpt-4', 'openai:gpt-4o']
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
                let output;
                try {
                    output = await callFunction(tc.name, args, { model, apiKey, writeEvent: stream?.writeEvent });
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
                const call_id = tc.call_id || tc.id || `iter-${iter + 1}-call-${idx + 1}`;
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
        const allInformation = fullToolResults
            .map((toolResult, index) => {
                const output = toolResult.parsedOutput;
                const toolName = toolResult.name;
                
                // For search_web: prefer summary > individual_summaries > descriptions > content
                if (toolName === 'search_web' && typeof output === 'object') {
                    // If we have an LLM-generated summary, use it
                    if (output.summary) {
                        return `Source ${index + 1} (Search: "${output.query || 'unknown'}"): ${output.summary}`;
                    }
                    // If we have individual page summaries, combine them
                    if (output.individual_summaries && Array.isArray(output.individual_summaries)) {
                        const combinedSummaries = output.individual_summaries
                            .map((s, i) => `[${i + 1}] ${s}`)
                            .join(' ');
                        return `Source ${index + 1} (Search: "${output.query || 'unknown'}"): ${combinedSummaries}`;
                    }
                    // Fall back to descriptions from search results
                    if (output.results && Array.isArray(output.results)) {
                        const descriptions = output.results
                            .map((r, i) => `[${i + 1}] ${r.title}: ${r.description || ''}`)
                            .join(' ');
                        return `Source ${index + 1} (Search: "${output.query || 'unknown'}"): ${descriptions}`;
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
                temperature: 0.2,
                max_tokens: maxTokens, // Adjust based on query type
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
            
            // Emit LLM response event
            stream?.writeEvent?.('llm_response', {
                phase: 'final_synthesis',
                response: finalResponse
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
 * Main Lambda handler function - streaming only
 */
exports.handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    const startTime = Date.now();
    
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
        
        // Extract parameters from request (POST only)
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        
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
        const googleToken = body.google_token || body.googleToken || null;

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

        // Execute tool loop with streaming
        const toolsRun = await runToolLoop({
            model,
            apiKey: apiKey || (allowEnvFallback ? (process.env[parseProviderModel(model).provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'] || '') : ''),
            userQuery: query,
            systemPrompt: COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT,
            stream: { writeEvent }
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

// Export only the handler
module.exports = {
    handler: exports.handler
};
