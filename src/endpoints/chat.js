/**
 * Chat Endpoint with Streaming and Tool Execution
 * Handles OpenAI-compatible chat completions with automatic tool calling
 * Streams responses via SSE with real-time updates
 */

const https = require('https');
const http = require('http');
const { verifyGoogleToken, getAllowedEmails } = require('../auth');
const { callFunction, compressSearchResultsForLLM } = require('../tools');
const { createSSEStreamAdapter } = require('../streaming/sse-writer');
const { parseProviderModel } = require('../providers');
const { createProgressEmitter } = require('../utils/progress-emitter');

/**
 * Format tool result for LLM consumption
 * Compresses search results into minimal markdown format
 * @param {string} toolName - Name of the tool
 * @param {Object} parsedArgs - Parsed tool arguments
 * @param {string} result - Tool result (JSON string)
 * @returns {string} Formatted result
 */
function formatToolResultForLLM(toolName, parsedArgs, result) {
    // Only compress search_web results
    if (toolName !== 'search_web') {
        return result;
    }
    
    try {
        const resultObj = JSON.parse(result);
        
        // Check if this is a search result with the expected structure
        if (resultObj && resultObj.results && Array.isArray(resultObj.results)) {
            const query = parsedArgs.query || 'Search Results';
            const compressed = compressSearchResultsForLLM(query, resultObj.results);
            console.log(`📦 Compressed search results: ${result.length} chars → ${compressed.length} chars (${Math.round((1 - compressed.length / result.length) * 100)}% reduction)`);
            return compressed;
        }
    } catch (e) {
        console.error('Failed to compress search results:', e.message);
    }
    
    return result;
}

/**
 * Filter messages to only include tool outputs from the current query cycle
 * Removes ALL tool messages from previous query cycles (before the most recent user message)
 * Also removes tool_calls from assistant messages and empty assistant messages before last user
 * This prevents context bloat in multi-turn conversations while preserving assistant summaries
 * @param {Array} messages - Array of message objects
 * @param {boolean} isInitialRequest - True if this is the first iteration (messages from client)
 * @returns {Array} Filtered messages
 */
function filterToolMessagesForCurrentCycle(messages, isInitialRequest = false) {
    if (!messages || messages.length === 0) return messages;
    
    // On initial request from client, we need to filter old tool messages
    // In subsequent iterations within the same request cycle, keep all messages (they're from current cycle)
    if (!isInitialRequest) {
        // Within the same request cycle - keep all messages
        return messages;
    }
    
    // INITIAL REQUEST: Filter aggressively to ensure clean conversation history
    // Even though UI should send clean messages, add defense-in-depth filtering
    // Remove ALL tool messages and tool_calls from the history (they're from previous queries)
    
    const filtered = [];
    let toolMessagesFiltered = 0;
    let toolCallsStripped = 0;
    let emptyAssistantsFiltered = 0;
    
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        
        // Remove ALL tool messages (defense against buggy clients)
        if (msg.role === 'tool') {
            toolMessagesFiltered++;
            continue;
        }
        
        // For assistant messages: strip tool_calls and filter if empty
        if (msg.role === 'assistant') {
            const hasContent = msg.content && msg.content.trim().length > 0;
            const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
            
            if (hasContent) {
                // Keep assistant with content, but strip tool_calls
                const cleanMsg = { ...msg };
                if (hasToolCalls) {
                    delete cleanMsg.tool_calls;
                    toolCallsStripped++;
                }
                filtered.push(cleanMsg);
            } else if (!hasToolCalls) {
                // Keep empty assistant if it has no tool_calls
                filtered.push(msg);
            } else {
                // Remove assistant with only tool_calls (no text response)
                emptyAssistantsFiltered++;
            }
            continue;
        }
        
        // Keep user and system messages as-is
        filtered.push(msg);
    }
    
    if (toolMessagesFiltered > 0 || toolCallsStripped > 0 || emptyAssistantsFiltered > 0) {
        console.log(`🧹 Filtered from previous cycles: ${toolMessagesFiltered} tool messages, ${toolCallsStripped} tool_calls stripped, ${emptyAssistantsFiltered} empty assistants removed`);
        console.log(`   Kept ${filtered.length} messages (user + assistant summaries + current cycle)`);
    }
    
    return filtered;
}

/**
 * Verify authentication token
 * @param {string} authHeader - Authorization header
 * @returns {Promise<Object|null>} Verified user or null
 */
async function verifyAuthToken(authHeader) {
    if (!authHeader) {
        return null;
    }
    
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;
    
    const verifiedUser = await verifyGoogleToken(token);
    
    if (!verifiedUser) {
        return null;
    }
    
    const allowedEmails = getAllowedEmails();
    if (!allowedEmails || !allowedEmails.includes(verifiedUser.email)) {
        return null;
    }
    
    return verifiedUser;
}

/**
 * Parse OpenAI-compatible SSE stream
 * @param {Object} response - HTTP response object
 * @param {Function} onChunk - Callback for each parsed chunk
 * @returns {Promise<void>}
 */
async function parseOpenAIStream(response, onChunk) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        
        response.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === ': ping') continue;
                
                if (trimmed.startsWith('data: ')) {
                    const data = trimmed.substring(6);
                    if (data === '[DONE]') {
                        resolve();
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        onChunk(parsed);
                    } catch (error) {
                        console.error('Failed to parse SSE chunk:', error, 'Data:', data);
                    }
                }
            }
        });
        
        response.on('end', () => resolve());
        response.on('error', (error) => reject(error));
    });
}

/**
 * Make streaming request to OpenAI-compatible API
 * @param {string} targetUrl - Target API URL
 * @param {string} apiKey - API key
 * @param {Object} requestBody - Request body
 * @returns {Promise<Object>} HTTP response object
 */
async function makeStreamingRequest(targetUrl, apiKey, requestBody) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(targetUrl);
            const protocol = url.protocol === 'https:' ? https : http;
            
            const body = JSON.stringify({
                ...requestBody,
                stream: true
            });
            
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'Authorization': `Bearer ${apiKey}`,
                    'User-Agent': 'LambdaLLMProxy/1.0',
                    'Accept': 'text/event-stream'
                },
                timeout: 120000 // 2 minute timeout for tool-heavy requests
            };
            
            const req = protocol.request(options, (res) => {
                // Capture HTTP response headers for spending tracking
                const httpHeaders = res.headers;
                const httpStatus = res.statusCode;
                
                console.log('📋 HTTP Response Headers captured:', JSON.stringify(httpHeaders, null, 2));
                console.log('📊 HTTP Status:', httpStatus);
                
                if (res.statusCode !== 200) {
                    let errorData = '';
                    res.on('data', (chunk) => errorData += chunk);
                    res.on('end', () => {
                        try {
                            const error = JSON.parse(errorData);
                            reject(new Error(error.error?.message || 'API request failed'));
                        } catch (e) {
                            reject(new Error(`API returned ${res.statusCode}: ${errorData}`));
                        }
                    });
                    return;
                }
                
                // Attach headers to response object for later use
                res.httpHeaders = httpHeaders;
                res.httpStatus = httpStatus;
                
                resolve(res);
            });
            
            req.on('error', (error) => reject(error));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            req.write(body);
            req.end();
            
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Execute tool calls and return results
 * @param {Array} toolCalls - Array of tool calls from LLM
 * @param {Object} context - Execution context (user, model, apiKey, etc.)
 * @param {Object} sseWriter - SSE writer for progress updates
 * @returns {Promise<Array>} Array of tool result messages
 */
async function executeToolCalls(toolCalls, context, sseWriter) {
    const results = [];
    
    for (const toolCall of toolCalls) {
        const { id, function: { name, arguments: args } } = toolCall;
        
        try {
            sseWriter.writeEvent('tool_call_start', {
                id,
                name,
                arguments: args
            });
            
            sseWriter.writeEvent('tool_call_progress', {
                id,
                name,
                status: 'executing'
            });
            
            // Parse arguments
            const parsedArgs = JSON.parse(args);
            
            // Create tool context with event writer
            const toolContext = {
                ...context,
                writeEvent: (type, data) => {
                    sseWriter.writeEvent(type, data);
                }
            };
            
            // Set up progress emitter for transcription tool
            if (name === 'transcribe_url' && sseWriter.writeEvent) {
                toolContext.onProgress = createProgressEmitter(sseWriter.writeEvent, id, 'transcribe_url');
            }
            
            // Execute tool
            const result = await callFunction(name, parsedArgs, toolContext);
            
            // Format result for LLM (compress search results)
            const formattedResult = formatToolResultForLLM(name, parsedArgs, result);
            
            sseWriter.writeEvent('tool_call_result', {
                id,
                name,
                content: result // Send full result to UI
            });
            
            // Build tool result message with formatted (compressed) content for LLM
            results.push({
                tool_call_id: id,
                role: 'tool',
                name: name,
                content: formattedResult // Use compressed format for LLM
            });
            
        } catch (error) {
            console.error(`Tool execution error [${name}]:`, error);
            
            const errorResult = JSON.stringify({
                error: error.message || 'Tool execution failed'
            });
            
            sseWriter.writeEvent('tool_call_result', {
                id,
                name,
                content: errorResult,
                error: true
            });
            
            results.push({
                tool_call_id: id,
                role: 'tool',
                name: name,
                content: errorResult
            });
        }
    }
    
    return results;
}

/**
 * Handler for the chat endpoint with streaming and tool execution
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Lambda response stream
 * @returns {Promise<void>}
 */
async function handler(event, responseStream) {
    let sseWriter = null;
    let lastRequestBody = null; // Track last request for error reporting (moved to function scope)
    
    try {
        // Initialize SSE stream with proper headers
        // Note: CORS headers are handled by Lambda Function URL configuration
        const metadata = {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        };
        
        // Set up response stream with metadata (awslambda is a global in Lambda runtime)
        if (typeof awslambda !== 'undefined' && awslambda.HttpResponseStream) {
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        }
        
        sseWriter = createSSEStreamAdapter(responseStream);
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { messages, model, tools } = body;
        const tavilyApiKey = body.tavilyApiKey || '';
        
        // Apply defaults for parameters that optimize for comprehensive, verbose responses
        const temperature = body.temperature !== undefined ? body.temperature : 0.8;
        const max_tokens = body.max_tokens !== undefined ? body.max_tokens : 4096;
        const top_p = body.top_p !== undefined ? body.top_p : 0.95;
        const frequency_penalty = body.frequency_penalty !== undefined ? body.frequency_penalty : 0.3;
        const presence_penalty = body.presence_penalty !== undefined ? body.presence_penalty : 0.4;
        
        // Verify authentication
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const verifiedUser = await verifyAuthToken(authHeader);
        
        if (!verifiedUser) {
            sseWriter.writeEvent('error', {
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            });
            responseStream.end();
            return;
        }
        
        // Extract Google OAuth token from Authorization header for API calls
        let googleToken = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            googleToken = authHeader.substring(7);
        }
        
        // Validate required fields
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            sseWriter.writeEvent('error', {
                error: 'messages field is required and must be a non-empty array',
                code: 'INVALID_REQUEST'
            });
            responseStream.end();
            return;
        }
        
        if (!model || typeof model !== 'string') {
            sseWriter.writeEvent('error', {
                error: 'model field is required and must be a string',
                code: 'INVALID_REQUEST'
            });
            responseStream.end();
            return;
        }
        
        // Determine target URL and API key based on provider
        const { provider: detectedProvider } = parseProviderModel(model);
        const provider = body.provider || detectedProvider;
        const apiKey = provider === 'groq' 
            ? process.env.GROQ_API_KEY 
            : process.env.OPENAI_API_KEY;
        
        if (!apiKey) {
            sseWriter.writeEvent('error', {
                error: `API key not configured for provider: ${provider}`,
                code: 'CONFIGURATION_ERROR'
            });
            responseStream.end();
            return;
        }
        
        const targetUrl = body.targetUrl || 
            (provider === 'groq' 
                ? 'https://api.groq.com/openai/v1/chat/completions'
                : process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions');
        
        // Build tool context
        const toolContext = {
            user: verifiedUser.email,
            model,
            apiKey,
            googleToken,
            tavilyApiKey,
            timestamp: new Date().toISOString()
        };
        
        // Send status event
        sseWriter.writeEvent('status', {
            status: 'processing',
            model,
            provider,
            hasTools: tools && tools.length > 0
        });
        
        let currentMessages = [...messages];
        let iterationCount = 0;
        const maxIterations = parseInt(process.env.MAX_TOOL_ITERATIONS) || 20;
        
        // Tool calling loop
        while (iterationCount < maxIterations) {
            iterationCount++;
            
            // Build request
            // Filter out tool messages from previous query cycles (token optimization)
            // Only apply filtering on first iteration (initial messages from client)
            // Subsequent iterations contain tool calls/results from current cycle
            const isInitialRequest = (iterationCount === 1);
            
            // Debug: Log message roles before filtering
            if (iterationCount === 1) {
                const beforeRoles = currentMessages.map((m, i) => `${i}:${m.role}`).join(', ');
                console.log(`🔍 Messages BEFORE filtering (iteration ${iterationCount}): ${beforeRoles}`);
            }
            
            const filteredMessages = filterToolMessagesForCurrentCycle(currentMessages, isInitialRequest);
            
            // Debug: Log message roles after filtering
            const afterRoles = filteredMessages.map((m, i) => `${i}:${m.role}`).join(', ');
            console.log(`🔍 Messages AFTER filtering (iteration ${iterationCount}): ${afterRoles}`);
            
            // Clean messages by removing UI-specific properties before sending to LLM
            const cleanMessages = filteredMessages.map(msg => {
                const { isStreaming, ...cleanMsg } = msg;
                return cleanMsg;
            });
            
            // Debug: Count tool messages being sent to LLM
            const toolCount = cleanMessages.filter(m => m.role === 'tool').length;
            if (toolCount > 0) {
                console.log(`⚠️ WARNING: Sending ${toolCount} tool messages to LLM (iteration ${iterationCount})`);
                cleanMessages.forEach((m, i) => {
                    if (m.role === 'tool') {
                        console.log(`   Tool message ${i}: name=${m.name}, tool_call_id=${m.tool_call_id}, content_length=${m.content?.length || 0}`);
                    }
                });
            }
            
            const requestBody = {
                model,
                messages: cleanMessages,
                temperature,
                max_tokens,
                top_p,
                frequency_penalty,
                presence_penalty
            };
            
            // Add tools only if provided
            if (tools && tools.length > 0) {
                requestBody.tools = tools;
            }
            
            // Store request body for error reporting
            lastRequestBody = {
                provider,
                model,
                request: requestBody,
                iteration: iterationCount
            };
            
            // Emit LLM request event
            sseWriter.writeEvent('llm_request', {
                phase: 'chat_iteration',
                iteration: iterationCount,
                provider,
                model,
                request: requestBody,
                timestamp: new Date().toISOString()
            });
            
            // Make streaming request
            const response = await makeStreamingRequest(targetUrl, apiKey, requestBody);
            
            // Capture HTTP headers from response
            const httpHeaders = response.httpHeaders || {};
            const httpStatus = response.httpStatus;
            
            console.log('📋 DEBUG chat endpoint - httpHeaders:', JSON.stringify(httpHeaders, null, 2));
            console.log('📊 DEBUG chat endpoint - httpStatus:', httpStatus);
            
            // Parse streaming response
            let assistantMessage = { role: 'assistant', content: '' };
            let currentToolCalls = [];
            let hasToolCalls = false;
            let finishReason = null;
            
            await parseOpenAIStream(response, (chunk) => {
                const delta = chunk.choices?.[0]?.delta;
                const choice = chunk.choices?.[0];
                
                if (!delta && !choice) return;
                
                // Capture finish_reason
                if (choice?.finish_reason) {
                    finishReason = choice.finish_reason;
                }
                
                // Handle text content
                if (delta.content) {
                    assistantMessage.content += delta.content;
                    sseWriter.writeEvent('delta', {
                        content: delta.content
                    });
                }
                
                // Handle tool calls
                if (delta.tool_calls) {
                    hasToolCalls = true;
                    
                    for (const tc of delta.tool_calls) {
                        const index = tc.index;
                        
                        // Initialize tool call if needed
                        if (!currentToolCalls[index]) {
                            currentToolCalls[index] = {
                                id: tc.id || '',
                                type: 'function',
                                function: { name: '', arguments: '' }
                            };
                        }
                        
                        // Accumulate tool call data
                        if (tc.id) {
                            currentToolCalls[index].id = tc.id;
                        }
                        if (tc.function?.name) {
                            currentToolCalls[index].function.name += tc.function.name;
                        }
                        if (tc.function?.arguments) {
                            currentToolCalls[index].function.arguments += tc.function.arguments;
                        }
                    }
                }
            });
            
            // Emit LLM response event with HTTP headers
            const eventData = {
                phase: 'chat_iteration',
                iteration: iterationCount,
                provider,
                model,
                response: {
                    content: assistantMessage.content,
                    tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined
                },
                httpHeaders: httpHeaders || {},
                httpStatus: httpStatus
            };
            
            console.log('🔧 DEBUG chat endpoint - Event data to send:', JSON.stringify(eventData, null, 2));
            
            eventData.timestamp = new Date().toISOString();
            sseWriter.writeEvent('llm_response', eventData);
            
            // Check if we should execute tool calls or treat this as final response
            // We should STOP executing tools if:
            // 1. finish_reason is 'stop' (LLM explicitly done)
            // 2. No tool calls present
            // 3. LLM provided a substantive answer (>200 chars) even with tool_calls
            //    (this catches cases where LLM gives answer but suggests optional follow-up)
            // 4. We've already done 8+ iterations (safety limit for tool-heavy workflows)
            const hasSubstantiveAnswer = assistantMessage.content.trim().length > 200; // Full answer threshold
            const tooManyIterations = iterationCount >= 8; // Safety limit (increased from 5)
            const shouldExecuteTools = hasToolCalls && 
                                      currentToolCalls.length > 0 && 
                                      finishReason !== 'stop' &&  // LLM wants to continue
                                      !hasSubstantiveAnswer &&     // No complete answer yet
                                      !tooManyIterations;          // Safety limit
            
            console.log(`🔍 Tool execution decision: iteration=${iterationCount}, hasToolCalls=${hasToolCalls}, finishReason=${finishReason}, contentLength=${assistantMessage.content.length}, hasSubstantiveAnswer=${hasSubstantiveAnswer}, tooManyIterations=${tooManyIterations}, shouldExecuteTools=${shouldExecuteTools}`);
            
            // If tool calls detected and should execute
            if (shouldExecuteTools) {
                // Filter out empty tool calls
                const validToolCalls = currentToolCalls.filter(tc => tc.id && tc.function.name);
                
                if (validToolCalls.length > 0) {
                    assistantMessage.tool_calls = validToolCalls;
                    
                    // Send message_complete with tool_calls included
                    // This allows the frontend to display both content and tool calls
                    sseWriter.writeEvent('message_complete', {
                        role: 'assistant',
                        content: assistantMessage.content,
                        tool_calls: validToolCalls
                    });
                    
                    currentMessages.push(assistantMessage);
                    
                    // Execute tools
                    const toolResults = await executeToolCalls(validToolCalls, toolContext, sseWriter);
                    
                    // Add tool results to messages
                    currentMessages.push(...toolResults);
                    
                    // Continue loop to get final response
                    continue;
                }
            }
            
            // If LLM provided substantive content, treat as final answer even if tool_calls present
            if (hasSubstantiveAnswer && hasToolCalls) {
                console.log(`✅ Treating response as final due to substantive answer (${assistantMessage.content.length} chars) - ignoring suggested tool_calls`);
                // Remove tool_calls from message since we're not executing them
                delete assistantMessage.tool_calls;
            } else if (tooManyIterations && hasToolCalls) {
                console.log(`⚠️ Safety limit reached after ${iterationCount} iterations - stopping tool execution`);
                console.log(`   Tool calls present: ${currentToolCalls.map(tc => tc.function?.name).join(', ')}`);
                console.log(`   Content length: ${assistantMessage.content.length} chars`);
                
                // If LLM provided ANY content, use it. Otherwise we need to fail gracefully
                if (assistantMessage.content.trim().length === 0) {
                    // Check if we have any tool results in the conversation to reference
                    const hasToolResults = currentMessages.some(m => m.role === 'tool');
                    if (hasToolResults) {
                        assistantMessage.content = 'I apologize, but I wasn\'t able to synthesize a complete response. However, you can see the search results and tool outputs above.';
                    } else {
                        assistantMessage.content = 'I apologize, but I encountered difficulty processing your request. Please try rephrasing your question.';
                    }
                    console.log(`⚠️ No content from LLM after ${iterationCount} iterations - using fallback message`);
                }
                delete assistantMessage.tool_calls; // Don't execute more tools
            } else if (finishReason === 'stop') {
                console.log(`✅ Treating response as final due to finish_reason=stop`);
            } else if (!hasToolCalls) {
                console.log(`✅ Treating response as final - no tool calls`);
            } else {
                console.log(`✅ Treating response as final (iteration ${iterationCount}/${maxIterations})`);
            }
            
            // SAFETY CHECK: If we somehow got here with completely empty content and no prior tool results
            if (assistantMessage.content.trim().length === 0 && !hasToolCalls) {
                console.log(`⚠️ WARNING: Empty response detected with no tool calls`);
                console.log(`   Iteration: ${iterationCount}, finishReason: ${finishReason}`);
                console.log(`   Total messages: ${currentMessages.length}`);
                
                // Check if there are any tool results in the conversation
                const toolMessages = currentMessages.filter(m => m.role === 'tool');
                if (toolMessages.length > 0) {
                    assistantMessage.content = 'Based on the search results above, I found the information you requested.';
                    console.log(`   Using fallback message (${toolMessages.length} tool results present)`);
                } else {
                    assistantMessage.content = 'I apologize, but I was unable to generate a response. Please try rephrasing your question or starting a new conversation.';
                    console.log(`   Using error fallback (no tool results)`);
                }
            }
            
            // No tool calls or final response - send completion
            currentMessages.push(assistantMessage);
            
            console.log(`📤 Sending final response: ${assistantMessage.content.length} chars`);
            console.log(`📤 Preview: ${assistantMessage.content.substring(0, 100)}...`);
            
            // Send message_complete with content only (no tool_calls)
            sseWriter.writeEvent('message_complete', {
                role: 'assistant',
                content: assistantMessage.content
                // Note: NOT including tool_calls - they're already sent via tool_call_* events
            });
            
            console.log(`✅ Completing request after ${iterationCount} iterations`);
            
            sseWriter.writeEvent('complete', {
                status: 'success',
                messages: currentMessages,
                iterations: iterationCount
            });
            
            responseStream.end();
            return;
        }
        
        // Max iterations reached with tools still being called
        sseWriter.writeEvent('error', {
            error: 'Maximum tool execution iterations reached',
            code: 'MAX_ITERATIONS',
            iterations: iterationCount
        });
        responseStream.end();
        
    } catch (error) {
        console.error('Chat endpoint error:', error);
        
        // Build error event with request info if available
        const errorEvent = {
            error: error.message || 'Internal server error',
            code: 'ERROR',
            timestamp: new Date().toISOString()
        };
        
        // Include the last request that triggered the error
        if (lastRequestBody) {
            errorEvent.llmRequest = lastRequestBody;
            console.log('🚨 Error occurred during request:', JSON.stringify({
                provider: lastRequestBody.provider,
                model: lastRequestBody.model,
                iteration: lastRequestBody.iteration,
                messageCount: lastRequestBody.request.messages.length,
                hasTools: !!lastRequestBody.request.tools
            }, null, 2));
        }
        
        // Only use sseWriter if it was initialized
        if (sseWriter) {
            sseWriter.writeEvent('error', errorEvent);
        } else {
            // If sseWriter wasn't created, write error directly to stream
            try {
                responseStream.write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
            } catch (streamError) {
                console.error('Failed to write error to stream:', streamError);
            }
        }
        responseStream.end();
    }
}

module.exports = {
    handler,
    verifyAuthToken,
    parseOpenAIStream,
    makeStreamingRequest,
    executeToolCalls
};
