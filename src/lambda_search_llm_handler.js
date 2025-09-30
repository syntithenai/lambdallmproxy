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

async function runToolLoop({ model, apiKey, userQuery, systemPrompt, stream, continuationState = null }) {
    console.log(`🔧 ENTERED runToolLoop - model: ${model}, apiKey: ${!!apiKey}, userQuery length: ${userQuery?.length || 0}`);
    console.log(`🔧 runToolLoop userQuery:`, userQuery);
    console.log(`🔧 runToolLoop systemPrompt:`, systemPrompt);
    
    // Initialize comprehensive tracking arrays with nested structure [cycle1[], cycle2[], ...]
    let allToolCallCycles = [];
    let allLLMCalls = [];
    let totalCost = 0;
    let totalTokens = 0;
    let currentIteration = 0;
    
    if (continuationState) {
        console.log(`🔄 LAMBDA CONTINUATION STATE RECEIVED:`, {
            stateExists: !!continuationState,
            stateKeys: continuationState ? Object.keys(continuationState) : [],
            researchPlan: !!continuationState.researchPlan,
            toolCallCycles: {
                exists: !!continuationState.toolCallCycles,
                length: continuationState.toolCallCycles?.length || 0,
                isArray: Array.isArray(continuationState.toolCallCycles),
                structure: continuationState.toolCallCycles?.map ? continuationState.toolCallCycles.map((cycle, i) => ({
                    cycle: i + 1,
                    calls: Array.isArray(cycle) ? cycle.length : 'not-array',
                    sample: Array.isArray(cycle) && cycle[0] ? {
                        hasRequest: !!cycle[0].request,
                        hasResponse: !!cycle[0].response,
                        functionName: cycle[0].request?.function?.name
                    } : null
                })) : 'not-mappable'
            },
            llmCalls: continuationState.llmCalls?.length || 0,
            searchResults: continuationState.searchResults?.length || 0,
            currentIteration: continuationState.currentIteration || 0,
            totalCost: continuationState.totalCost || 0,
            totalTokens: continuationState.totalTokens || 0
        });
        
        // Restore comprehensive tracking state from continuation
        allToolCallCycles = Array.isArray(continuationState.toolCallCycles) ? continuationState.toolCallCycles : [];
        allLLMCalls = Array.isArray(continuationState.llmCalls) ? continuationState.llmCalls : [];
        totalCost = continuationState.totalCost || 0;
        totalTokens = continuationState.totalTokens || 0;
        currentIteration = continuationState.currentIteration || 0;
        
        console.log(`🔄 RESTORED STATE:`, {
            allToolCallCycles: allToolCallCycles.length,
            allLLMCalls: allLLMCalls.length,
            totalCost,
            totalTokens,
            currentIteration
        });
        
        // Re-emit existing tool calls and LLM calls for UI continuity
        allToolCallCycles.forEach((cycle, cycleIndex) => {
            cycle.forEach(toolCall => {
                stream?.writeEvent?.('tool_result', {
                    iteration: cycleIndex + 1,
                    call_id: toolCall.request.id,
                    name: toolCall.request.function.name,
                    args: JSON.parse(toolCall.request.function.arguments || '{}'),
                    output: typeof toolCall.response === 'object' ? JSON.stringify(toolCall.response) : String(toolCall.response || ''),
                    duration: toolCall.duration,
                    cost: toolCall.cost,
                    continued: true
                });
            });
        });
        
        allLLMCalls.forEach((llmCall, index) => {
            stream?.writeEvent?.('llm_response', {
                type: 'continuation_restore',
                iteration: index + 1,
                content: llmCall.response?.content || '',
                usage: llmCall.response?.usage,
                cost: llmCall.cost,
                continued: true,
                timestamp: llmCall.timestamp
            });
        });
    }
    
    // Collect search results for continuation support
    const collectedSearchResults = continuationState?.searchResults || [];

    // Step 1: Use existing research plan or create new one
    let researchPlan;
    let dynamicSystemPrompt; // Declare once at function level
    
    if (continuationState?.researchPlan) {
        // Use existing research plan from continuation
        researchPlan = continuationState.researchPlan;
        console.log(`🔄 Using existing research plan from continuation`);
        stream?.writeEvent?.('log', { message: '🔄 Resuming with existing research plan...' });
        
        // Send existing persona and research questions to UI
        stream?.writeEvent?.('persona', {
            persona: researchPlan.persona || researchPlan.optimal_persona,
            research_questions_needed: researchPlan.research_questions_needed,
            reasoning: researchPlan.reasoning
        });
        
        if (researchPlan.research_questions) {
            stream?.writeEvent?.('research_questions', {
                questions: researchPlan.research_questions,
                questions_needed: researchPlan.questions_needed || researchPlan.research_questions.length,
                reasoning: researchPlan.reasoning
            });
        }
    } else {
        // Step 1: Initial planning query to determine research strategy and optimal persona
        stream?.writeEvent?.('log', { message: 'Analyzing query to determine optimal research strategy...' });
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
        stream?.writeEvent?.('log', { message: 'Determining optimal research approach and expert persona...' });
        
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
        
        const planningResponse = await llmResponsesWithTools(planningRequestBody);
        
        // Emit LLM response event
        stream?.writeEvent?.('llm_response', {
            phase: 'planning',
            model,
            response: planningResponse,
            timestamp: new Date().toISOString()
        });

        // Track cost for planning step (cost is already tracked in llmResponsesWithTools)
        console.log('🔍 Planning step completed - cost tracking handled by LLM response function');
        
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
        dynamicSystemPrompt = researchPlan.optimal_persona + ' CRITICAL TOOL RULES: Always use the available search_web and execute_javascript tools when they can enhance your response. Use search tools for current information and calculations tools for math problems. PARAMETER RULES: When calling execute_javascript, ONLY provide the "code" parameter. When calling search_web, ONLY provide the "query" parameter. NEVER add extra properties like count, results, limit, etc. The schemas have additionalProperties: false and will reject extra parameters with HTTP 400 errors. RESPONSE FORMAT: Start with the direct answer, then show work if needed. Be concise and minimize descriptive text about your thinking. Cite all sources with URLs.' + environmentContext;
        
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
        
        dynamicSystemPrompt = (systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT) + ' CRITICAL TOOL RULES: Always use available tools (search_web, execute_javascript, scrape_web_content) when they can provide better, more current, or more accurate information. For math questions, always use execute_javascript. For current events or factual queries, always use search_web. PARAMETER RULES: When calling execute_javascript, ONLY provide the "code" parameter. When calling search_web, ONLY provide the "query" parameter. When calling scrape_web_content, ONLY provide the "url" parameter. NEVER add extra properties like count, results, limit, etc. The schemas have additionalProperties: false and will reject extra parameters with HTTP 400 errors. RESPONSE FORMAT: Start with the direct answer, then show work if needed. Be concise and minimize descriptive text about your thinking.' + environmentContext;
    }
    } // Close the else block for planning
    
    // Set up system prompt for continuation if not already set
    if (!dynamicSystemPrompt) {
        const now = new Date();
        const currentDateTime = now.toISOString().split('T')[0] + ' ' + now.toTimeString().split(' ')[0] + ' UTC';
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
        const environmentContext = `\n\nCurrent Context: Today is ${dayOfWeek}, ${currentDateTime}. Use this temporal context when discussing recent events, current status, or time-sensitive information.`;
        
        // Add previous research context if available
        
        dynamicSystemPrompt = (researchPlan.persona || researchPlan.optimal_persona || systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT) + ' CRITICAL TOOL RULES: Always use available tools (search_web, execute_javascript, scrape_web_content) when they can provide better, more current, or more accurate information. For math questions, always use execute_javascript. For current events or factual queries, always use search_web. PARAMETER RULES: When calling execute_javascript, ONLY provide the "code" parameter. When calling search_web, ONLY provide the "query" parameter. When calling scrape_web_content, ONLY provide the "url" parameter. NEVER add extra properties like count, results, limit, etc. The schemas have additionalProperties: false and will reject extra parameters with HTTP 400 errors. RESPONSE FORMAT: Start with the direct answer, then show work if needed. Be concise and minimize descriptive text about your thinking.' + environmentContext + previousSearchSummary;
    }

    // System prompt and user query prepared

    let input = [
        { role: 'system', content: dynamicSystemPrompt },
        { role: 'user', content: userQuery }
    ];

    // Starting tool loop with ${toolFunctions?.length || 0} available tools

    // Handle continuation: show previous results and guide LLM to build upon them
    let previousSearchSummary = '';
    if (continuationState?.searchResults?.length > 0) {
        console.log(`🔄 Continuation: Found ${continuationState.searchResults.length} previous search results`);
        
        // Re-emit previous search results for UI continuity
        continuationState.searchResults.forEach((result, index) => {
            stream?.writeEvent?.('search_results', {
                results: [result],
                query: result.query || `Previous search ${index + 1}`,
                timestamp: new Date().toISOString()
            });
        });
        
        // Create a summary of previous research for the LLM context
        const summaries = continuationState.searchResults.map((result, index) => {
            return `${index + 1}. ${result.query || 'Search'}: ${result.summary || 'No summary available'}`;
        }).join('\n');
        
        previousSearchSummary = `\n\nPREVIOUS RESEARCH COMPLETED:\nYou have already completed ${continuationState.searchResults.length} searches on this topic:\n\n${summaries}\n\nBuild upon this existing research. Focus on areas not yet covered, provide more detailed analysis, or explore specific aspects that need deeper investigation. Avoid repeating identical searches unless you need to verify or update information.`;
        
        stream?.writeEvent?.('log', {
            message: `🔄 Continuing with ${continuationState.searchResults.length} previous search results`,
            timestamp: new Date().toISOString()
        });
    }
    
    // DISABLED: Complex conversation reconstruction that was causing tool_call_id errors
    if (false && continuationState?.completedToolCalls?.length > 0) {
        console.log(`🔄 Reconstructing conversation history from ${continuationState.completedToolCalls.length} completed tool calls`);
        
        // Group tool calls by iteration for proper reconstruction
        const callsByIteration = {};
        console.log(`🔧 DEBUG: All completed tool calls:`, JSON.stringify(continuationState.completedToolCalls, null, 2));
        continuationState.completedToolCalls.forEach(call => {
            const iter = call.iteration || 0;
            if (!callsByIteration[iter]) callsByIteration[iter] = [];
            callsByIteration[iter].push(call);
        });

        // Add tool calls and results to conversation in iteration order
        Object.keys(callsByIteration).sort((a, b) => parseInt(a) - parseInt(b)).forEach(iterStr => {
            const iter = parseInt(iterStr);
            const calls = callsByIteration[iter];
            
            // Add assistant message with tool calls
            const toolCalls = calls.map(call => {
                if (!call.call_id) {
                    console.error(`🚨 ERROR: Tool call missing call_id when creating assistant message:`, call);
                    return null;
                }
                return {
                    id: call.call_id,
                    type: 'function',
                    function: {
                        name: call.name,
                        arguments: typeof call.args === 'string' ? call.args : JSON.stringify(call.args)
                    }
                };
            }).filter(Boolean); // Remove null entries
            
            console.log(`🔧 DEBUG: Adding assistant message for iteration ${iter} with ${toolCalls.length} tool calls:`, toolCalls);
            
            // Only add assistant message if we have valid tool calls
            if (toolCalls.length > 0) {
                const assistantMessage = {
                    role: 'assistant',
                    content: null,
                    tool_calls: toolCalls
                };
                
                console.log(`🔧 DEBUG: Assistant message:`, JSON.stringify(assistantMessage, null, 2));
                input.push(assistantMessage);
            } else {
                console.error(`🚨 ERROR: No valid tool calls for iteration ${iter}, skipping assistant message`);
            }
            
            // Add tool result messages
            calls.forEach((call, index) => {
                console.log(`🔧 DEBUG: Processing tool call ${index}:`, {
                    call_id: call.call_id,
                    name: call.name,
                    iteration: call.iteration,
                    hasOutput: !!call.output
                });
                
                if (!call.call_id) {
                    console.error(`🚨 ERROR: Tool call missing call_id at index ${index}:`, call);
                    return; // Skip this call if no ID
                }
                
                const toolMessage = {
                    role: 'tool',
                    tool_call_id: call.call_id,
                    content: call.output || 'No output'
                };
                
                console.log(`🔧 DEBUG: Adding tool message:`, toolMessage);
                input.push(toolMessage);
                
                // Re-emit tool result for UI continuity
                stream?.writeEvent?.('tool_result', {
                    iteration: call.iteration,
                    call_id: call.call_id,
                    name: call.name,
                    args: call.args,
                    output: call.output
                });
            });
        });
        
        console.log(`🔄 Reconstructed input with ${input.length} messages`);
        console.log(`🔧 DEBUG: Reconstructed messages:`, JSON.stringify(input, null, 2));
    }

    // Start from appropriate iteration based on continuation state
    const startIteration = continuationState?.currentIteration ? (continuationState.currentIteration + 1) : 0;
    console.log(`🔄 Starting tool loop from iteration ${startIteration} (${continuationState ? 'continuation' : 'fresh start'})`);
    
    // If we have completed tool calls, we can proceed directly to LLM with reconstructed conversation
    if (continuationState?.completedToolCalls?.length > 0) {
        console.log(`🔄 Conversation reconstructed, proceeding to LLM call...`);
    }

    for (let iter = startIteration; iter < MAX_TOOL_ITERATIONS; iter++) {
        try {
            stream?.writeEvent?.('log', { message: `Tools iteration ${iter + 1}` });
            // Tool iteration ${iter + 1}
        } catch {}

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
        
        const { output, text } = await llmResponsesWithTools(toolIterationRequestBody);
        
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
                    output = await callFunction(tc.name, args, { model, apiKey, writeEvent: stream?.writeEvent });
                } catch (e) {
                    output = JSON.stringify({ error: String(e?.message || e) });
                }
                const call_id = tc.call_id || tc.id || `iter-${iter + 1}-call-${idx + 1}`;
                const result = { iteration: iter + 1, call_id, name: tc.name, args, output: String(output) };
                
                // Collect search results for continuation support
                if (tc.name === 'search_web' && output) {
                    try {
                        const parsed = JSON.parse(output);
                        if (parsed.results && Array.isArray(parsed.results)) {
                            collectedSearchResults.push(...parsed.results.map(r => ({
                                query: parsed.query,
                                title: r.title,
                                url: r.url,
                                description: r.description,
                                summary: parsed.summary || null
                            })));
                        }
                    } catch (e) {
                        console.log(`🔧 Failed to parse search results for continuation:`, e.message);
                    }
                }
                
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
        
        const finalResponse = await llmResponsesWithTools(finalRequestBody);
        
        // Emit LLM response event
        stream?.writeEvent?.('llm_response', {
            phase: 'final_synthesis',
            model,
            response: finalResponse,
            timestamp: new Date().toISOString()
        });
        
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
            searchResults: collectedSearchResults,
            // Enhanced tracking data for comprehensive UI display
            toolCallCycles: allToolCallCycles || [],
            llmCalls: allLLMCalls || [],
            costSummary: {
                totalCost: totalCost || 0,
                totalTokens: totalTokens || 0,
                modelName: costSummary.modelName,
                provider: costSummary.provider,
                steps: (allLLMCalls || []).map(step => ({
                    cost: step.cost || 0,
                    inputTokens: step.inputTokens,
                    outputTokens: step.outputTokens,
                    description: step.description || '',
                    timestamp: step.timestamp
                }))
            },
            metadata: {
                currentIteration: currentIteration,
                totalIterations: allToolCallCycles.length,
                totalToolCalls: allToolCallCycles.reduce((sum, cycle) => sum + (Array.isArray(cycle) ? cycle.length : 0), 0),
                totalLLMCalls: allLLMCalls.length
            }
        };
    } catch (e) {
        console.error('Final synthesis failed:', e?.message || e);
        const originalError = e?.message || String(e);
        const errorMsg = `Error from LLM provider: ${originalError}`;
        
        // Check if this is a quota/rate limit error that should trigger continuation
        const isQuotaError = isQuotaLimitError(originalError);
        
        if (isQuotaError) {
            const waitTime = parseWaitTimeFromMessage(originalError);
            console.log(`🔄 Rate limit hit during synthesis, triggering continuation with ${waitTime}s wait`);
            
            // Send quota exceeded event with comprehensive continuation state
            stream?.writeEvent?.('quota_exceeded', {
                message: `Rate limit reached during final synthesis. Please continue in ${waitTime} seconds to complete the analysis.`,
                waitTime,
                timestamp: new Date().toISOString(),
                continuationState: {
                    toolCallCycles: allToolCallCycles || [],
                    llmCalls: allLLMCalls || [],
                    searchResults: collectedSearchResults || [],
                    currentIteration: currentIteration,
                    researchPlan: researchPlan || null,
                    totalCost: totalCost || 0,
                    totalTokens: totalTokens || 0
                }
            });
        } else {
            // Send other errors as final answer
            stream?.writeEvent?.('final_answer', { 
                content: errorMsg,
                timestamp: new Date().toISOString()
            });
        }
        
        return { 
            finalText: errorMsg,
            researchPlan: researchPlan || { complexity_assessment: 'medium' },
            searchResults: collectedSearchResults || []
        };
    }
}

/**
 * Execute initial setup query to get persona, questions, and research parameters
 * @param {Object} params - Query parameters
 * @param {Function} writeEvent - Event writing function for streaming
 * @returns {Promise<Object>} - Setup results with persona and questions
 */
async function executeInitialSetupQuery(params, writeEvent) {
    const { query, model, apiKey, allowEnvFallback } = params;
    
    writeEvent('log', {
        message: 'Starting initial setup query to determine research approach...',
        timestamp: new Date().toISOString()
    });
    
    // Initial setup prompt to get structured research plan
    const setupPrompt = `You are a research planning expert. Based on the user's query, provide a JSON response with exactly these fields:

{
    "persona": "A detailed description of the expert persona most suited to answer this query (e.g., 'Financial analyst with expertise in cryptocurrency markets', 'Climate scientist specializing in renewable energy')",
    "questions": [
        "First specific research question to investigate",
        "Second specific research question to investigate", 
        "Third specific research question to investigate"
    ],
    "response_length": "short|medium|long - suggested length for final response",
    "reasoning_level": "basic|detailed|comprehensive - how much reasoning to show",
    "temperature": 0.1-0.9 - creativity level for responses
}

User Query: "${query}"

Provide ONLY valid JSON, no other text.`;

    try {
        const { provider, model: modelName } = parseProviderModel(model);
        const config = getProviderConfig(provider);
        const finalApiKey = apiKey || (allowEnvFallback ? process.env[config.envVar] : '');
        
        writeEvent('llm_call', {
            type: 'setup_query',
            model: model,
            prompt_preview: setupPrompt.substring(0, 200) + '...',
            timestamp: new Date().toISOString()
        });
        
        // Make LLM call for setup
        const setupRequestBody = {
            model: `${provider}:${modelName}`,
            input: [
                {
                    role: 'user',
                    content: setupPrompt
                }
            ],
            tools: [], // No tools for setup query
            options: {
                apiKey: finalApiKey,
                temperature: 0.3,
                timeoutMs: 30000
            }
        };
        
        // Emit LLM request event
        writeEvent('llm_request', {
            phase: 'initial_setup',
            model: `${provider}:${modelName}`,
            request: setupRequestBody,
            timestamp: new Date().toISOString()
        });
        
        const setupResponse = await llmResponsesWithTools(setupRequestBody);
        
        // Emit LLM response event
        writeEvent('llm_response', {
            phase: 'initial_setup',
            model: `${provider}:${modelName}`,
            response: setupResponse,
            timestamp: new Date().toISOString()
        });
        
        let setupData;
        try {
            // Try to parse JSON from response
            const responseText = setupResponse.text || setupResponse.finalText || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                setupData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.warn('Failed to parse setup response as JSON:', parseError.message);
            // Provide fallback setup data
            setupData = {
                persona: "Expert researcher and analyst",
                questions: [
                    `What are the key aspects of: ${query}?`,
                    `What are the current developments related to: ${query}?`,
                    `What are the implications and conclusions about: ${query}?`
                ],
                response_length: "medium",
                reasoning_level: "detailed", 
                temperature: 0.7
            };
        }
        
        // Calculate cost if pricing data is available
        let costInfo = null;
        if (globalPricingCache && setupResponse.usage) {
            costInfo = calculateLLMCost(
                provider,
                modelName,
                setupResponse.usage.prompt_tokens || 0,
                setupResponse.usage.completion_tokens || 0,
                globalPricingCache
            );
        }
        
        writeEvent('setup_complete', {
            persona: setupData.persona,
            questions: setupData.questions,
            response_length: setupData.response_length,
            reasoning_level: setupData.reasoning_level,
            temperature: setupData.temperature,
            cost: costInfo,
            timestamp: new Date().toISOString()
        });
        
        return {
            success: true,
            setupData,
            cost: costInfo
        };
        
    } catch (error) {
        console.error('Setup query failed:', error);
        writeEvent('error', {
            error: `Setup query failed: ${error.message}`,
            timestamp: new Date().toISOString()
        });
        
        return {
            success: false,
            error: error.message,
            setupData: {
                persona: "Expert researcher and analyst",
                questions: [
                    `What are the key aspects of: ${query}?`,
                    `What are the current developments related to: ${query}?`,
                    `What are the implications and conclusions about: ${query}?`
                ],
                response_length: "medium",
                reasoning_level: "detailed",
                temperature: 0.7
            }
        };
    }
}

/**
 * Execute a query cycle with persona, questions, and tool calls
 * @param {Object} params - Query cycle parameters  
 * @param {Function} writeEvent - Event writing function for streaming
 * @returns {Promise<Object>} - Query cycle results
 */
async function executeQueryCycle(params, writeEvent) {
    const { query, setupData, model, apiKey, allowEnvFallback, continuationContext } = params;
    
    writeEvent('log', {
        message: 'Starting query cycle with research questions...',
        timestamp: new Date().toISOString()
    });
    
    // Build comprehensive prompt with persona and questions
    const researchPrompt = `${setupData.persona}

You are tasked with conducting comprehensive research to answer the user's query. Use the following research questions as your guide:

${setupData.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Original Query: "${query}"

Response Guidelines:
- **STRUCTURE**: Always start with a brief "Quick Answer" or "Summary" section (2-3 sentences) that directly addresses the query, then provide detailed explanation
- Length: ${setupData.response_length}  
- Reasoning Level: ${setupData.reasoning_level}
- **IMPORTANT**: Use diverse tools strategically:
  * search_web: Find current information, resources, and overviews
  * execute_javascript: Create code examples, calculations, demonstrations, timelines
  * scrape_web_content: Get detailed content from promising URLs found in searches
- Combine multiple tools for comprehensive answers (search + scrape + code examples)
- Format: **Quick Answer** → Detailed explanation with evidence and working examples
- Be thorough but concise

**Tool Usage Strategy for Educational Content:**
- For study plans, learning paths, or tutorials: Use search_web to find resources, then scrape_web_content for detailed curricula
- For programming/technical topics: Always include execute_javascript with working code examples and demonstrations
- For mathematical concepts: Use execute_javascript to show calculations, formulas, and interactive examples
- For comprehensive guides: Combine all tools - search for overview, scrape for details, code for examples

**Response Format Required:**
1. **Quick Answer** (2-3 sentences): Direct, actionable response to the query
2. **Detailed Explanation**: Comprehensive information with tool-gathered evidence, examples, and step-by-step guidance

Research and provide a comprehensive response following this exact structure.`;

    try {
        const { provider, model: modelName } = parseProviderModel(model);
        const config = getProviderConfig(provider);
        const finalApiKey = apiKey || (allowEnvFallback ? process.env[config.envVar] : '');
        
        writeEvent('llm_call', {
            type: 'query_cycle',
            model: model,
            persona: setupData.persona,
            questions: setupData.questions,
            timestamp: new Date().toISOString()
        });
        
        // Execute research with tools using the tool loop
        const researchResponse = await runToolLoop({
            model,
            apiKey: finalApiKey,
            userQuery: researchPrompt,
            systemPrompt: "", // Empty since we're including persona in user query
            stream: { writeEvent }
        });
        
        // Calculate cost if pricing data is available
        let costInfo = null;
        if (globalPricingCache && researchResponse.usage) {
            costInfo = calculateLLMCost(
                provider,
                modelName,
                researchResponse.usage.prompt_tokens || 0,
                researchResponse.usage.completion_tokens || 0,
                globalPricingCache
            );
        }
        
        // Emit final response
        writeEvent('llm_response', {
            type: 'final_response',
            content: researchResponse.finalText || researchResponse.text,
            cost: costInfo,
            timestamp: new Date().toISOString()
        });
        
        return {
            success: true,
            response: researchResponse.finalText || researchResponse.text,
            toolCalls: researchResponse.toolCalls || [],
            cost: costInfo,
            usage: researchResponse.usage
        };
        
    } catch (error) {
        console.error('Query cycle failed:', error);
        
        // Check if it's a quota/rate limit error
        if (isQuotaLimitError(error.message)) {
            const waitTime = parseWaitTimeFromMessage(error.message);
            console.log(`🔄 Rate limit hit during query cycle, triggering continuation with ${waitTime}s wait`);
            
            writeEvent('quota_exceeded', {
                message: `Rate limit reached. Please continue in ${waitTime} seconds to complete the research.`,
                waitTime,
                timestamp: new Date().toISOString(),
                continuationState: {
                    query,
                    setupData,
                    model,
                    toolCallCycles: [],
                    llmCalls: [],
                    searchResults: [],
                    currentIteration: 0,
                    totalCost: 0,
                    totalTokens: 0,
                    persona: setupData.persona,
                    questions: setupData.questions
                }
            });
        } else {
            writeEvent('error', {
                error: `Query cycle failed: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        }
        
        return {
            success: false,
            error: error.message
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
        // Initialize pricing cache if not already loaded
        if (!globalPricingCache) {
            try {
                console.log('Loading pricing data...');
                globalPricingCache = await loadAllPricing();
                console.log('Pricing data loaded successfully');
            } catch (pricingError) {
                console.error('Failed to load pricing data:', pricingError.message);
                // Continue without pricing - will use fallback values when needed
            }
        }
        
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
        const googleToken = body.google_token || body.googleToken || null;
        
        // Check if this is a continuation request
        const isContinuation = body.continuation === true;
        const continuationContext = body.continuationContext || null;
        if (isContinuation) {
            console.log(`🔄 Continuation request detected. Context:`, continuationContext);
            writeEvent('log', { 
                message: `🔄 Continuing request after rate limit (retry attempt: ${body.retryAttempt || 1})`,
                timestamp: new Date().toISOString()
            });
        }

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
            user: user ? { email: user.email, name: user.name } : null,
            timestamp: new Date().toISOString()
        });

        // Create a stream adapter for real-time streaming
        const streamAdapter = {
            writeEvent: writeEvent,
            write: (data) => writeEvent('data', data)
        };
        
        // Determine if this is a continuation request with setup data
        const hasSetupData = isContinuation && continuationContext?.setupData;
        
        let setupResult;
        let queryResult;
        
        if (!hasSetupData) {
            // Step 1: Execute initial setup query
            writeEvent('step', {
                type: 'setup_query',
                message: 'Analyzing query to determine research approach...',
                timestamp: new Date().toISOString()
            });
            
            setupResult = await executeInitialSetupQuery({
                query,
                model,
                apiKey,
                allowEnvFallback
            }, writeEvent);
            
            if (!setupResult.success) {
                // Use fallback setup data if setup query failed
                setupResult.setupData = setupResult.setupData || {
                    persona: "Expert researcher and analyst",
                    questions: [`Research and analyze: ${query}`],
                    response_length: "medium",
                    reasoning_level: "detailed",
                    temperature: 0.7
                };
            }
        } else {
            // Use setup data from continuation context
            setupResult = {
                success: true,
                setupData: continuationContext.setupData
            };
            
            writeEvent('log', {
                message: 'Using setup data from continuation context',
                timestamp: new Date().toISOString()
            });
        }
        
        // Step 2: Execute query cycle with research questions
        writeEvent('step', {
            type: 'query_cycle',
            message: 'Conducting research with determined approach...',
            timestamp: new Date().toISOString()
        });
        
        queryResult = await executeQueryCycle({
            query,
            setupData: setupResult.setupData,
            model,
            apiKey,
            allowEnvFallback,
            continuationContext
        }, writeEvent);
        
        // Prepare final result
        const finalResult = {
            query: query,
            searches: [],
            searchResults: [],
            response: queryResult.success ? queryResult.response : 'Unable to process request - please check your query and try again.',
            persona: setupResult.setupData.persona,
            questions: setupResult.setupData.questions,
            metadata: {
                totalResults: 0,
                searchIterations: 0,
                finalModel: model,
                setup_cost: setupResult.cost,
                query_cost: queryResult.cost,
                total_cost: (setupResult.cost?.totalCost || 0) + (queryResult.cost?.totalCost || 0)
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

// StreamingResponse class moved to src/streaming/sse-writer.js

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
        let limit, fetchContent, timeout, model, accessSecret, apiKey;
        
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
                continuationState: continuationContext?.workState || null
            });
            
            finalResult = {
                success: true,
                mode: 'tools',
                answer: toolsRun.finalText || 'Unable to process request - please check your query and try again.',
                searchResults: [],
                metadata: { 
                    tools: true,
                    totalCost: toolsRun.costSummary?.totalCost || 0,
                    totalTokens: toolsRun.costSummary?.totalTokens || 0,
                    costBreakdown: toolsRun.costSummary?.steps || []
                }
            };
        } catch (e) {
            const originalError = e?.message || String(e);
            
            // Check if this is a quota/rate limit error
            if (isQuotaLimitError(originalError)) {
                const waitTime = parseWaitTimeFromMessage(originalError);
                console.log(`🔄 Rate limit hit during tools flow, triggering continuation with ${waitTime}s wait`);
                
                stream.writeEvent('quota_exceeded', {
                    error: originalError,
                    waitTime,
                    timestamp: new Date().toISOString(),
                    continuationState: {
                        toolCallCycles: [],
                        llmCalls: [],
                        searchResults: [],
                        currentIteration: 0,
                        totalCost: 0,
                        totalTokens: 0,
                        researchPlan: null
                    }
                });
                
                // Return early for quota errors - don't send complete event
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    },
                    body: ''
                };
            } else {
                stream.writeEvent('error', {
                    error: originalError,
                    timestamp: new Date().toISOString()
                });
            }
            
            finalResult = {
                success: false,
                mode: 'tools',
                answer: `Error from LLM provider: ${originalError}`,
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
        let limit, fetchContent, timeout, model, accessSecret, apiKey;
        
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
        const googleToken = body.google_token || body.googleToken || null;
        
        // Check if this is a continuation request
        const isContinuation = body.continuation === true;
        const continuationContext = body.continuationContext || null;
        
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
        
        // Use tools-based approach with planning
        let finalResult;
        try {
            // Execute planning phase for non-streaming requests to optimize research
            console.log('🔧 Executing planning phase for non-streaming request...');
            
            const toolsRun = await runToolLoop({
                model,
                apiKey: apiKey || (allowEnvFallback ? (process.env[parseProviderModel(model).provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'] || '') : ''),
                userQuery: query,
                systemPrompt: COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT,
                stream: null,
                continuationState: continuationContext?.workState || null
            });
            
            finalResult = {
                query,
                searches: [],
                searchResults: toolsRun.searchResults || [],
                response: toolsRun.finalText || 'Unable to process request - please check your query and try again.',
                metadata: { 
                    finalModel: model, 
                    mode: 'tools',
                    ...toolsRun.metadata
                },
                // Enhanced tracking data for comprehensive UI display
                toolCallCycles: toolsRun.toolCallCycles || [],
                llmCalls: toolsRun.llmCalls || [],
                costSummary: toolsRun.costSummary || {
                    totalCost: 0,
                    totalTokens: 0,
                    modelName: model,
                    steps: []
                },
                researchPlan: toolsRun.researchPlan || null
            };
        } catch (e) {
            console.error('Tools flow failed:', e?.message || e);
            const originalError = e?.message || String(e);
            
            // Check if this is a quota/rate limit error in non-streaming mode
            if (isQuotaLimitError(originalError)) {
                const waitTime = parseWaitTimeFromMessage(originalError);
                console.log(`🔄 Rate limit hit during non-streaming tools flow, wait time: ${waitTime}s`);
                // For non-streaming mode, include quota info in response
                finalResult = {
                    query,
                    searches: [],
                    searchResults: [],
                    response: `Rate limit reached. Please wait ${waitTime} seconds and try again.`,
                    metadata: { finalModel: model, mode: 'tools', error: true, quotaError: true, waitTime }
                };
            } else {
                finalResult = {
                    query,
                    searches: [],
                    searchResults: [],
                    response: `Error from LLM provider: ${originalError}`,
                    metadata: { finalModel: model, mode: 'tools', error: true }
                };
            }
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

// Export the handler for Lambda and additional functions for testing
module.exports = {
    handler: exports.handler,
    handleNonStreamingRequest
};
