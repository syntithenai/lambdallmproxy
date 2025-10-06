/**
 * Chat Endpoint with Streaming and Tool Execution
 * Handles OpenAI-compatible chat completions with automatic tool calling
 * Streams responses via SSE with real-time updates
 */

const https = require('https');
const http = require('http');
const { verifyGoogleToken, getAllowedEmails } = require('../auth');
const { callFunction } = require('../tools');
const { createSSEStreamAdapter } = require('../streaming/sse-writer');
const { parseProviderModel } = require('../providers');

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
            
            // Execute tool
            const result = await callFunction(name, parsedArgs, toolContext);
            
            sseWriter.writeEvent('tool_call_result', {
                id,
                name,
                content: result
            });
            
            // Build tool result message
            results.push({
                tool_call_id: id,
                role: 'tool',
                name: name,
                content: result
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
        const { messages, model, tools, temperature, max_tokens, top_p, frequency_penalty, presence_penalty } = body;
        
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
        const maxIterations = parseInt(process.env.MAX_TOOL_ITERATIONS) || 5;
        
        // Tool calling loop
        while (iterationCount < maxIterations) {
            iterationCount++;
            
            // Build request
            // Clean messages by removing UI-specific properties before sending to LLM
            const cleanMessages = currentMessages.map(msg => {
                const { isStreaming, ...cleanMsg } = msg;
                return cleanMsg;
            });
            
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
            
            // Make streaming request
            const response = await makeStreamingRequest(targetUrl, apiKey, requestBody);
            
            // Parse streaming response
            let assistantMessage = { role: 'assistant', content: '' };
            let currentToolCalls = [];
            let hasToolCalls = false;
            
            await parseOpenAIStream(response, (chunk) => {
                const delta = chunk.choices?.[0]?.delta;
                if (!delta) return;
                
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
            
            // If tool calls detected, execute them
            if (hasToolCalls && currentToolCalls.length > 0) {
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
            
            // No tool calls or max iterations reached - send final response
            currentMessages.push(assistantMessage);
            
            // Send message_complete with content only (no tool_calls)
            sseWriter.writeEvent('message_complete', {
                role: 'assistant',
                content: assistantMessage.content
                // Note: NOT including tool_calls - they're already sent via tool_call_* events
            });
            
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
        
        // Only use sseWriter if it was initialized
        if (sseWriter) {
            sseWriter.writeEvent('error', {
                error: error.message || 'Internal server error',
                code: 'ERROR'
            });
        } else {
            // If sseWriter wasn't created, write error directly to stream
            try {
                responseStream.write(`event: error\ndata: ${JSON.stringify({
                    error: error.message || 'Internal server error',
                    code: 'ERROR'
                })}\n\n`);
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
