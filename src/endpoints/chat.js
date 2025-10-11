/**
 * Chat Endpoint with Streaming and Tool Execution
 * Handles OpenAI-compatible chat completions with automatic tool calling
 * Streams responses via SSE with real-time updates
 */

const https = require('https');
const http = require('http');
const { verifyGoogleToken, getAllowedEmails, authenticateRequest } = require('../auth');
const { callFunction, compressSearchResultsForLLM } = require('../tools');
const { createSSEStreamAdapter } = require('../streaming/sse-writer');
const { parseProviderModel } = require('../providers');
const { createProgressEmitter } = require('../utils/progress-emitter');
const { getOrEstimateUsage, providerReturnsUsage } = require('../utils/token-estimation');
const { buildProviderPool, hasAvailableProviders } = require('../credential-pool');

// NOTE: mixtral-8x7b-32768 was decommissioned by Groq in Oct 2025
// NOTE: llama-3.1-70b-versatile was decommissioned by Groq in Oct 2025
const GROQ_RATE_LIMIT_FALLBACK_MODELS = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile'
];

const JSON_TOOL_CALL_REMINDER_TEXT = 'You must answer with a tool call using valid JSON arguments and no extra text. Use the official OpenAI function-calling format.';
const LEGACY_TOOL_CALL_REGEX = /<\s*function\s*=\s*[^>]+>/i;
const MAX_JSON_TOOL_REMINDERS = 2;

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
                        console.error(`❌ API Error Response (${res.statusCode}):`, errorData);
                        try {
                            const error = JSON.parse(errorData);
                            console.error('❌ Parsed API Error:', JSON.stringify(error, null, 2));
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
    
    // Get memory tracker for monitoring tool execution
    const { getMemoryTracker } = require('../utils/memory-tracker');
    const memoryTracker = getMemoryTracker();
    
    for (const toolCall of toolCalls) {
        const { id, function: { name, arguments: args } } = toolCall;
        
        try {
            // Memory snapshot before tool execution
            memoryTracker.snapshot(`tool-start-${name}`);
            
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
            
            // Parse arguments with error handling for malformed JSON
            let parsedArgs = {};
            try {
                parsedArgs = JSON.parse(args);
            } catch (parseError) {
                console.error(`⚠️ Failed to parse tool arguments for ${name}:`, parseError.message);
                console.error(`⚠️ Raw arguments string: "${args}"`);
                
                // Try to fix common issues
                let fixedArgs = args.trim();
                
                // If it's just a partial JSON, try adding missing braces
                if (fixedArgs && !fixedArgs.startsWith('{')) {
                    fixedArgs = '{' + fixedArgs;
                }
                if (fixedArgs && !fixedArgs.endsWith('}')) {
                    fixedArgs = fixedArgs + '}';
                }
                
                try {
                    parsedArgs = JSON.parse(fixedArgs);
                    console.log(`✅ Fixed malformed JSON for ${name}`);
                } catch (retryError) {
                    console.error(`❌ Could not fix JSON for ${name}, using empty object`);
                    // Fall back to empty object - tool will use defaults
                    parsedArgs = {};
                }
            }
            
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
            
            // Memory snapshot after tool execution
            memoryTracker.snapshot(`tool-end-${name}`);
            const memUsage = memoryTracker.getCurrentUsage();
            console.log(`🔧 Tool ${name} memory: ${memUsage.heapUsedMB.toFixed(2)}MB heap, ${memUsage.rssMB.toFixed(2)}MB RSS`);
            
            // Format result for LLM (compress search results)
            const formattedResult = formatToolResultForLLM(name, parsedArgs, result);
            
            // Debug: Log formatted result for search_web to see what LLM receives
            if (name === 'search_web') {
                console.log(`🔍 DEBUG search_web formatted result for LLM:`);
                console.log(`🔍 Total length: ${formattedResult.length} chars`);
                console.log(`🔍 First 1000 chars:`, formattedResult.substring(0, 1000));
                console.log(`🔍 Last 1000 chars:`, formattedResult.substring(Math.max(0, formattedResult.length - 1000)));
                
                // Check if URL section is present
                if (formattedResult.includes('🚨 CRITICAL: YOU MUST COPY THESE URLS')) {
                    console.log(`✅ URL section IS present in formatted result`);
                } else {
                    console.log(`❌ URL section IS MISSING from formatted result!`);
                }
            }
            
            sseWriter.writeEvent('tool_call_result', {
                id,
                name,
                content: result // Send full result to UI
            });
            
            // Build tool result message with formatted (compressed) content for LLM
            // CRITICAL: Store BOTH the formatted content (for LLM) and raw result (for extraction)
            results.push({
                tool_call_id: id,
                role: 'tool',
                name: name,
                content: formattedResult, // Use compressed format for LLM
                rawResult: result // Keep raw JSON for image/video/media extraction
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
    const requestStartTime = Date.now(); // Track request start time for logging
    let sseWriter = null;
    let lastRequestBody = null; // Track last request for error reporting (moved to function scope)
    
    // Get memory tracker from parent handler
    const { getMemoryTracker } = require('../utils/memory-tracker');
    const memoryTracker = getMemoryTracker();
    memoryTracker.snapshot('chat-handler-start');
    
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
        let { messages, model, tools, providers: userProviders, isRetry, retryContext } = body;
        const tavilyApiKey = body.tavilyApiKey || '';
        
        // Handle retry requests - inject previous context
        if (isRetry && retryContext) {
            console.log('🔄 Retry request detected:', {
                attemptNumber: retryContext.attemptNumber,
                failureReason: retryContext.failureReason,
                previousToolResults: retryContext.previousToolResults?.length || 0,
                intermediateMessages: retryContext.intermediateMessages?.length || 0
            });
            
            // Inject previous tool results and intermediate messages back into conversation
            if (retryContext.previousToolResults && retryContext.previousToolResults.length > 0) {
                console.log(`   📦 Restoring ${retryContext.previousToolResults.length} tool result(s) to context`);
                // Insert tool results after the user message
                messages = [...messages, ...retryContext.previousToolResults];
            }
            
            if (retryContext.intermediateMessages && retryContext.intermediateMessages.length > 0) {
                console.log(`   💬 Restoring ${retryContext.intermediateMessages.length} intermediate message(s) to context`);
            }
            
            // Add retry system message to explain this is a retry
            const retrySystemMessage = {
                role: 'system',
                content: `This is retry attempt ${retryContext.attemptNumber || 1}. Previous attempt failed with: ${retryContext.failureReason || 'Unknown error'}. Please try to provide a complete and helpful response.`
            };
            messages = [retrySystemMessage, ...messages];
        }
        
        // Apply defaults for parameters that optimize for comprehensive, verbose responses
        const temperature = body.temperature !== undefined ? body.temperature : 0.8;
        // Default to longer responses (16384 tokens), will be adjusted per-model later
        let max_tokens = body.max_tokens !== undefined ? body.max_tokens : 16384;
        const top_p = body.top_p !== undefined ? body.top_p : 0.95;
        const frequency_penalty = body.frequency_penalty !== undefined ? body.frequency_penalty : 0.3;
        const presence_penalty = body.presence_penalty !== undefined ? body.presence_penalty : 0.4;
        
        // Authenticate and authorize request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);
        
        // Check authentication
        if (!authResult.authenticated) {
            sseWriter.writeEvent('error', {
                error: 'Authentication required',
                code: 'UNAUTHORIZED',
                statusCode: 401
            });
            responseStream.end();
            return;
        }
        
        // Check if user has available providers (user-provided OR environment if authorized)
        const hasProviders = hasAvailableProviders(userProviders, authResult.authorized);
        
        if (!hasProviders) {
            // User is authenticated but has no providers available
            // For unauthorized users, they MUST configure their own providers
            // For authorized users, this shouldn't happen (they get env providers)
            sseWriter.writeEvent('error', {
                error: 'No LLM providers configured. Please add at least one provider in settings.',
                code: 'FORBIDDEN',
                statusCode: 403,
                requiresProviderSetup: true,
                authorized: authResult.authorized
            });
            responseStream.end();
            return;
        }
        
        // Build provider pool (user + environment if authorized)
        const providerPool = buildProviderPool(userProviders, authResult.authorized);
        console.log(`🎯 Provider pool for ${authResult.email}: ${providerPool.length} provider(s) available`);
        
        // Extract Google OAuth token from Authorization header for API calls
        let googleToken = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            googleToken = authHeader.substring(7);
        }
        
        // Extract YouTube OAuth token from custom header (for YouTube Transcript API)
        const youtubeToken = event.headers['x-youtube-token'] || event.headers['X-YouTube-Token'] || null;
        if (youtubeToken) {
            console.log('YouTube OAuth token detected for transcript access');
        }
        
        // Set verified user from auth result
        const verifiedUser = authResult.user;
        const userEmail = verifiedUser?.email || authResult.email || 'unknown';
        
        // Validate required fields
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            sseWriter.writeEvent('error', {
                error: 'messages field is required and must be a non-empty array',
                code: 'INVALID_REQUEST'
            });
            responseStream.end();
            return;
        }
        
        // Model is now optional - if not provided, intelligent selection will choose the best model
        if (model && typeof model !== 'string') {
            sseWriter.writeEvent('error', {
                error: 'model field must be a string if provided',
                code: 'INVALID_REQUEST'
            });
            responseStream.end();
            return;
        }
        
        // Select provider from pool
        // Calculate estimated token count for context length determination
        const estimatedTokens = messages.reduce((sum, msg) => {
            const contentLength = typeof msg.content === 'string' ? msg.content.length : 0;
            return sum + Math.ceil(contentLength / 4); // Rough estimate: 4 chars ≈ 1 token
        }, 0);
        
        // Priority for large context (>100K tokens): gemini-free > gemini > groq-free > other (together, openai, atlascloud)
        // Priority for normal context: groq-free > other paid (openai, together, atlascloud) > groq > gemini-free > gemini
        // Note: Together AI and Atlas Cloud are PAID services (no free tier)
        const isLargeContext = estimatedTokens > 100000;
        
        let selectedProvider;
        if (isLargeContext) {
            // Large context: prefer Gemini (1M-2M token context window)
            console.log(`📏 Large context detected (${estimatedTokens} tokens), prioritizing Gemini models`);
            const geminiProviders = providerPool.filter(p => p.type === 'gemini-free' || p.type === 'gemini');
            const otherProviders = providerPool.filter(p => p.type !== 'gemini-free' && p.type !== 'gemini');
            selectedProvider = geminiProviders[0] || otherProviders[0];
        } else {
            // Normal context: prefer Groq over Gemini
            const groqProviders = providerPool.filter(p => p.type === 'groq-free' || p.type === 'groq');
            const otherProviders = providerPool.filter(p => p.type !== 'groq-free' && p.type !== 'groq');
            const geminiProviders = otherProviders.filter(p => p.type === 'gemini-free' || p.type === 'gemini');
            const nonGeminiOther = otherProviders.filter(p => p.type !== 'gemini-free' && p.type !== 'gemini');
            
            // Priority: groq > openai/other > gemini
            selectedProvider = groqProviders[0] || nonGeminiOther[0] || geminiProviders[0];
        }
        
        if (!selectedProvider) {
            sseWriter.writeEvent('error', {
                error: 'No providers available in pool (this should not happen)',
                code: 'CONFIGURATION_ERROR'
            });
            responseStream.end();
            return;
        }
        
        console.log(`🎯 Selected provider: ${selectedProvider.type} (source: ${selectedProvider.source})`);
        
        // Helper function to get endpoint URL for a provider
        const getEndpointUrl = (provider) => {
            if (provider.apiEndpoint) {
                const baseUrl = provider.apiEndpoint.replace(/\/$/, '');
                return baseUrl.endsWith('/chat/completions') 
                    ? baseUrl 
                    : `${baseUrl}/chat/completions`;
            } else if (provider.type === 'groq-free' || provider.type === 'groq') {
                return 'https://api.groq.com/openai/v1/chat/completions';
            } else if (provider.type === 'openai') {
                return 'https://api.openai.com/v1/chat/completions';
            } else if (provider.type === 'gemini-free' || provider.type === 'gemini') {
                return 'https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions';
            } else if (provider.type === 'together') {
                return 'https://api.together.xyz/v1/chat/completions';
            } else if (provider.type === 'atlascloud') {
                return 'https://api.atlascloud.ai/v1/chat/completions';
            }
            return null;
        };
        
        // Helper function to select appropriate model for a provider
        const selectModelForProvider = (provider, requestedModel, isComplex) => {
            if (provider.modelName) {
                return provider.modelName;
            } else if (provider.type === 'groq-free' || provider.type === 'groq') {
                const groqModels = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
                if (requestedModel && groqModels.includes(requestedModel)) {
                    return requestedModel;
                }
                return isComplex ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
            } else if (provider.type === 'openai') {
                const openaiModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
                if (requestedModel && openaiModels.includes(requestedModel)) {
                    return requestedModel;
                }
                return isComplex ? 'gpt-4o' : 'gpt-4o-mini';
            } else if (provider.type === 'gemini-free' || provider.type === 'gemini') {
                const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
                if (requestedModel && geminiModels.includes(requestedModel)) {
                    return requestedModel;
                }
                // Use gemini-2.5-flash for most requests (1M context)
                // Use gemini-2.0-flash for ultra-large context (2M context)
                return isComplex ? 'gemini-2.0-flash' : 'gemini-2.5-flash';
            } else if (provider.type === 'together') {
                // Together AI is a PAID service - Pricing as of Oct 2025:
                // - Llama 3.3 70B: $0.88/M tokens (input), $0.88/M tokens (output)
                // - Llama 3.1 8B: $0.18/M tokens (both input/output)
                const togetherModels = ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'];
                if (requestedModel && (requestedModel.includes('llama') || requestedModel.includes('deepseek'))) {
                    return requestedModel;
                }
                return isComplex ? 'meta-llama/Llama-3.3-70B-Instruct-Turbo' : 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
            } else if (provider.type === 'atlascloud') {
                // Atlas Cloud is a PAID service - provides access to various models
                const atlasModels = ['deepseek-ai/DeepSeek-R1', 'deepseek-ai/DeepSeek-V3', 'meta-llama/Llama-3.3-70B-Instruct-Turbo'];
                if (requestedModel && (requestedModel.includes('llama') || requestedModel.includes('deepseek') || requestedModel.includes('claude') || requestedModel.includes('gemini'))) {
                    return requestedModel;
                }
                // Prefer DeepSeek-R1 for complex tasks (cheaper and powerful)
                return isComplex ? 'deepseek-ai/DeepSeek-R1' : 'deepseek-ai/DeepSeek-V3';
            }
            return 'gpt-4o-mini'; // Safe default
        };
        
        // Determine API endpoint based on provider type
        let targetUrl = getEndpointUrl(selectedProvider);
        if (!targetUrl) {
            sseWriter.writeEvent('error', {
                error: `Unknown provider type: ${selectedProvider.type}`,
                code: 'CONFIGURATION_ERROR'
            });
            responseStream.end();
            return;
        }
        
        let apiKey = selectedProvider.apiKey;
        
        // Quick heuristic: check message complexity for model selection
        const totalLength = messages.reduce((sum, msg) => 
            sum + (typeof msg.content === 'string' ? msg.content.length : 0), 0
        );
        const hasTools = tools && tools.length > 0;
        const isComplex = totalLength > 1000 || messages.length > 5 || hasTools;
        
        // Validate/override model based on selected provider type
        // This ensures model compatibility regardless of what the UI sent
        const requestedModel = model; // Save original request
        
        model = selectModelForProvider(selectedProvider, model, isComplex);
        
        if (requestedModel && requestedModel !== model) {
            console.log(`⚠️ Model override: requested "${requestedModel}" incompatible with provider ${selectedProvider.type}, using "${model}" instead`);
        } else if (!requestedModel) {
            console.log(`🤖 Auto-selected model: ${model} (provider: ${selectedProvider.type}, complex: ${isComplex})`);
        } else {
            console.log(`✅ Using requested model: ${model} (provider: ${selectedProvider.type})`);
        }
        
        let provider = selectedProvider.type;
        
        // Adjust max_tokens based on model capabilities and rate limits
        // This ensures we use longer responses where supported, and constrain where necessary
        if (body.max_tokens === undefined) { // Only adjust if user didn't explicitly set it
            if (provider === 'gemini-free' || provider === 'gemini') {
                // Gemini models have large context windows (1-2M tokens) and high output limits
                max_tokens = 16384; // Allow very long responses
                console.log(`📏 Adjusted max_tokens for ${provider}: ${max_tokens} (large context model)`);
            } else if (provider === 'groq-free' || provider === 'groq') {
                // Groq has rate limits, but supports up to 8k output
                max_tokens = 8192; // Generous but rate-limit aware
                console.log(`📏 Adjusted max_tokens for ${provider}: ${max_tokens} (rate-limited model)`);
            } else if (provider === 'openai') {
                // OpenAI supports large outputs (16k+ for gpt-4)
                max_tokens = 16384; // Very generous
                console.log(`📏 Adjusted max_tokens for ${provider}: ${max_tokens} (high-capability model)`);
            } else if (provider === 'together' || provider === 'atlascloud') {
                // Together/Atlas support large outputs
                max_tokens = 16384;
                console.log(`📏 Adjusted max_tokens for ${provider}: ${max_tokens} (high-capability model)`);
            } else {
                // Unknown provider, use conservative default
                max_tokens = 4096;
                console.log(`📏 Adjusted max_tokens for ${provider}: ${max_tokens} (conservative default)`);
            }
        } else {
            console.log(`📏 Using user-specified max_tokens: ${max_tokens}`);
        }
        
        // Build tool context
        const toolContext = {
            user: verifiedUser.email,
            model,
            apiKey,
            googleToken,
            youtubeAccessToken: youtubeToken, // Pass YouTube OAuth token for transcript access
            tavilyApiKey,
            timestamp: new Date().toISOString()
        };
        
        const hasToolsConfigured = Array.isArray(tools) && tools.length > 0;

        // Send status event
        sseWriter.writeEvent('status', {
            status: 'processing',
            model,
            provider,
            hasTools: tools && tools.length > 0
        });
        
        let currentMessages = [...messages];
        let iterationCount = 0;
        const maxIterations = parseInt(process.env.MAX_TOOL_ITERATIONS) || 15;
        let jsonToolCallReminderCount = 0;
        
        // Track all LLM API calls across iterations
        const allLlmApiCalls = [];
        
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
            // CRITICAL: Remove extractedContent and rawResult - they're only for extraction, never for LLM
            const cleanMessages = filteredMessages.map(msg => {
                const { isStreaming, errorData, llmApiCalls, extractedContent, rawResult, ...cleanMsg } = msg;
                return cleanMsg;
            });
            
            // Debug: Count tool messages being sent to LLM
            const toolCount = cleanMessages.filter(m => m.role === 'tool').length;
            if (toolCount > 0) {
                console.log(`⚠️ WARNING: Sending ${toolCount} tool messages to LLM (iteration ${iterationCount})`);
                cleanMessages.forEach((m, i) => {
                    if (m.role === 'tool') {
                        console.log(`   Tool message ${i}: name=${m.name}, tool_call_id=${m.tool_call_id}, content_length=${m.content?.length || 0}`);
                        
                        // For search_web tool, check if URL section is in the content being sent to LLM
                        if (m.name === 'search_web' && m.content) {
                            if (m.content.includes('🚨 CRITICAL: YOU MUST COPY THESE URLS')) {
                                console.log(`   ✅ Tool message ${i} CONTAINS URL section`);
                                // Log the last 800 chars to see the URL section
                                const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                                console.log(`   📋 Last 800 chars of tool message:`, contentStr.substring(Math.max(0, contentStr.length - 800)));
                            } else {
                                console.log(`   ❌ Tool message ${i} MISSING URL section!`);
                                console.log(`   📋 Content preview:`, m.content.substring(0, 500));
                            }
                        }
                    }
                });
            }
            
            // Build base request body - Gemini has stricter parameter requirements
            const isGeminiProvider = selectedProvider.type === 'gemini-free' || selectedProvider.type === 'gemini';
            
            const requestBody = {
                model,
                messages: cleanMessages,
                temperature,
                max_tokens,
                top_p
            };
            
            // Only add frequency_penalty and presence_penalty for non-Gemini providers
            // Gemini's OpenAI-compatible API doesn't support these parameters
            if (!isGeminiProvider) {
                requestBody.frequency_penalty = frequency_penalty;
                requestBody.presence_penalty = presence_penalty;
            }
            
            // Add tools only if provided
            if (hasToolsConfigured) {
                requestBody.tools = tools;
                // Let LLM decide whether to use tools or respond directly
                // Explicitly set to 'auto' unless client specifies otherwise
                if (body.tool_choice !== undefined) {
                    requestBody.tool_choice = body.tool_choice;
                } else {
                    // Gemini doesn't support 'required' for tool_choice, use 'auto' instead
                    requestBody.tool_choice = 'auto'; // Explicitly set default
                }
                // 'auto' = LLM chooses whether to call tools or respond with text
                
                // CRITICAL: Cannot set response_format when using tools/function calling
                // This causes "json mode cannot be combined with tool/function calling" error
                // The API will return JSON for tool calls automatically
                
                // Enable parallel tool calls for efficiency (default behavior)
                if (body.parallel_tool_calls !== undefined) {
                    requestBody.parallel_tool_calls = body.parallel_tool_calls;
                }
                // Default is true (parallel calls enabled) - don't override unless requested
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
            
            // Make streaming request with smart retry logic
            let response, httpHeaders, httpStatus;
            let lastError = null;
            const maxRetries = 3;
            const attemptedModels = new Set([model]);
            const attemptedProviders = new Set([selectedProvider.id]);
            let sameModelRetries = 0;
            
            for (let retryAttempt = 0; retryAttempt < maxRetries; retryAttempt++) {
                try {
                    const currentRequestBody = {
                        ...requestBody,
                        model: requestBody.model || model
                    };
                    
                    console.log(`🔄 Attempt ${retryAttempt + 1}/${maxRetries}: provider=${provider}, model=${currentRequestBody.model}`);
                    
                    response = await makeStreamingRequest(targetUrl, apiKey, currentRequestBody);
                    
                    httpHeaders = response.httpHeaders || {};
                    httpStatus = response.httpStatus;
                    console.log(`✅ Request succeeded on attempt ${retryAttempt + 1}`);
                    break;
                    
                } catch (error) {
                    lastError = error;
                    console.error(`❌ Attempt ${retryAttempt + 1} failed:`, error.message);
                    console.log(`🔍 Error details: statusCode=${error.statusCode}, code=${error.code}, message=${error.message?.substring(0, 200)}`);
                    
                    const isRateLimitError = 
                        error.message?.includes('Rate limit') ||
                        error.message?.includes('rate limit') ||
                        error.message?.includes('rate_limit_exceeded') ||
                        error.message?.includes('tokens per day') ||
                        error.message?.includes('tokens per minute') ||
                        error.message?.includes('TPD') ||
                        error.message?.includes('TPM') ||
                        error.message?.includes('Request too large') ||
                        error.message?.includes('429') ||
                        error.statusCode === 429;
                    
                    const isNetworkError = 
                        error.code === 'ECONNRESET' ||
                        error.code === 'ETIMEDOUT' ||
                        error.code === 'ECONNREFUSED' ||
                        error.message?.includes('timeout') ||
                        error.message?.includes('network') ||
                        (error.statusCode >= 500 && error.statusCode < 600);
                    
                    const isLastAttempt = retryAttempt === maxRetries - 1;
                    
                    // Handle rate limit: try different models on same provider, then switch provider
                    if (isRateLimitError) {
                        console.log(`🔀 Rate limit hit on provider ${provider}, model ${model}`);
                        
                        // Define fallback models for each provider type
                        // NOTE: mixtral-8x7b-32768 was decommissioned by Groq in Oct 2025
                        // NOTE: llama-3.1-70b-versatile was decommissioned by Groq in Oct 2025
                        const providerModelFallbacks = {
                            'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
                            'openai-compatible': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
                            'groq': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
                            'groq-free': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
                        };
                        
                        // First, try other models on the same provider
                        const fallbackModels = providerModelFallbacks[selectedProvider.type] || [];
                        const nextModel = fallbackModels.find(m => !attemptedModels.has(m));
                        
                        if (nextModel) {
                            // Try different model on same provider
                            model = nextModel;
                            attemptedModels.add(model);
                            
                            // Update request body
                            requestBody.model = model;
                            if (lastRequestBody) {
                                lastRequestBody.model = model;
                                if (lastRequestBody.request) {
                                    lastRequestBody.request.model = model;
                                }
                            }
                            
                            console.log(`🔄 Trying different model on same provider: ${model} (${selectedProvider.type})`);
                            continue; // Retry with new model
                        }
                        
                        // All models exhausted on this provider, try next provider
                        console.log(`⚠️ All models exhausted on provider ${provider}`);
                        const nextProvider = providerPool.find(p => !attemptedProviders.has(p.id));
                        
                        if (nextProvider) {
                            // Switch to new provider
                            selectedProvider = nextProvider;
                            provider = selectedProvider.type;
                            apiKey = selectedProvider.apiKey;
                            targetUrl = getEndpointUrl(selectedProvider);
                            model = selectModelForProvider(selectedProvider, requestedModel, isComplex);
                            
                            attemptedProviders.add(selectedProvider.id);
                            attemptedModels.add(model);
                            
                            // Update request body
                            requestBody.model = model;
                            if (lastRequestBody) {
                                lastRequestBody.provider = provider;
                                lastRequestBody.model = model;
                                if (lastRequestBody.request) {
                                    lastRequestBody.request.model = model;
                                }
                            }
                            
                            console.log(`🚀 Switching to provider: ${provider}, model: ${model}`);
                            continue; // Retry with new provider
                        }
                        
                        // No more providers or models available
                        console.error(`🛑 Rate limit on all available providers and models (tried ${attemptedProviders.size} provider(s), ${attemptedModels.size} model(s))`);
                        console.log(`💡 Tip: Configure additional providers in your settings for better availability`);
                        throw error;
                    }
                    
                    // Handle network/server errors: retry same model with backoff
                    if (isNetworkError) {
                        sameModelRetries++;
                        
                        if (sameModelRetries >= 3 || isLastAttempt) {
                            console.error(`🛑 Network error persists after ${sameModelRetries} retries`);
                            throw error;
                        }
                        
                        const backoffDelay = Math.min(1000 * Math.pow(2, sameModelRetries - 1), 5000);
                        console.log(`⏳ Network error, retrying same model in ${backoffDelay}ms (attempt ${sameModelRetries}/3)...`);
                        await new Promise(resolve => setTimeout(resolve, backoffDelay));
                        continue;
                    }
                    
                    // Other errors: fail immediately
                    console.error(`🛑 Non-retryable error: ${error.message}`);
                    throw error;
                }
            }
            
            if (!response) {
                throw lastError || new Error('Request failed after all retries');
            }
            
            console.log('📋 DEBUG chat endpoint - httpHeaders:', JSON.stringify(httpHeaders, null, 2));
            console.log('📊 DEBUG chat endpoint - httpStatus:', httpStatus);
            
            // Parse streaming response
            let assistantMessage = { role: 'assistant', content: '' };
            let assistantMessageRecorded = false;
            let currentToolCalls = [];
            let hasToolCalls = false;
            let finishReason = null;
            let usage = null; // Track token usage
            
            await parseOpenAIStream(response, (chunk) => {
                const delta = chunk.choices?.[0]?.delta;
                const choice = chunk.choices?.[0];
                
                // DEBUG: Log chunks with tool_calls or finish_reason
                if (delta?.tool_calls || choice?.finish_reason === 'tool_calls') {
                    console.log(`🔧 DEBUG Gemini chunk:`, JSON.stringify(chunk, null, 2));
                }
                
                if (!delta && !choice) {
                    // Check for usage data in non-choice chunks
                    if (chunk.usage) {
                        usage = chunk.usage;
                        console.log(`📊 Token usage received: ${JSON.stringify(usage)}`);
                    }
                    return;
                }
                
                // Capture finish_reason
                if (choice?.finish_reason) {
                    finishReason = choice.finish_reason;
                    console.log(`🏁 Finish reason: ${finishReason}`);
                }
                
                // Capture usage from choice (some providers send it here)
                if (chunk.usage) {
                    usage = chunk.usage;
                    console.log(`📊 Token usage received: ${JSON.stringify(usage)}`);
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
                    console.log(`🔧 Delta tool_calls received:`, JSON.stringify(delta.tool_calls));
                    
                    for (const tc of delta.tool_calls) {
                        // Gemini doesn't include 'index' property, it sends complete tool calls in one chunk
                        // Use the provided index if available, otherwise find by ID or append to end
                        let index = tc.index;
                        
                        if (index === undefined) {
                            // Gemini sends complete tool call without index
                            // Check if this tool call ID already exists
                            if (tc.id) {
                                index = currentToolCalls.findIndex(existing => existing?.id === tc.id);
                            }
                            // If not found or no ID, append to end
                            if (index === -1 || index === undefined) {
                                index = currentToolCalls.length;
                            }
                        }
                        
                        // Initialize tool call if needed
                        if (!currentToolCalls[index]) {
                            currentToolCalls[index] = {
                                id: tc.id || '',
                                type: tc.type || 'function',
                                function: { name: '', arguments: '' }
                            };
                        }
                        
                        // Accumulate tool call data (for streaming) or replace (for complete chunks)
                        if (tc.id) {
                            currentToolCalls[index].id = tc.id;
                        }
                        if (tc.function?.name) {
                            // If name is complete (Gemini style), replace instead of append
                            if (tc.function.name && !tc.index) {
                                currentToolCalls[index].function.name = tc.function.name;
                            } else {
                                currentToolCalls[index].function.name += tc.function.name;
                            }
                        }
                        if (tc.function?.arguments) {
                            // If arguments are complete (Gemini style), replace instead of append
                            if (tc.function.arguments && !tc.index) {
                                currentToolCalls[index].function.arguments = tc.function.arguments;
                            } else {
                                currentToolCalls[index].function.arguments += tc.function.arguments;
                            }
                        }
                    }
                }
            });
            
            // Get or estimate token usage
            // Some providers (Groq, OpenAI) return usage data, others don't
            const finalUsage = getOrEstimateUsage(usage, cleanMessages, assistantMessage.content);
            
            // Log whether we're using actual or estimated usage
            if (finalUsage.estimated) {
                console.log(`⚠️ Provider ${provider} did not return usage data - using estimates: ${JSON.stringify(finalUsage)}`);
            } else {
                console.log(`✅ Using actual usage data from ${provider}: ${JSON.stringify(finalUsage)}`);
            }
            
            // Create LLM API call tracking object
            // Structure: Top-level provider, model, phase for easy UI access
            const llmApiCall = {
                provider: provider,
                model: model,
                phase: 'chat_iteration',
                iteration: iterationCount,
                request: {
                    model: model, // Include model in request
                    messages: cleanMessages, // Full messages array for transparency
                    temperature: temperature,
                    max_tokens: max_tokens,
                    tools: requestBody.tools // Include tools if present
                },
                response: {
                    content: assistantMessage.content,
                    tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
                    finish_reason: finishReason,
                    usage: finalUsage // Use actual or estimated usage
                },
                httpHeaders: httpHeaders || {},
                httpStatus: httpStatus,
                timestamp: new Date().toISOString()
            };
            
            // Add llmApiCall to assistant message for tracking
            if (!assistantMessage.llmApiCalls) {
                assistantMessage.llmApiCalls = [];
            }
            assistantMessage.llmApiCalls.push(llmApiCall);
            
            // Accumulate across iterations
            allLlmApiCalls.push(...assistantMessage.llmApiCalls);
            
            // Emit LLM response event with HTTP headers and usage
            const eventData = {
                phase: 'chat_iteration',
                iteration: iterationCount,
                provider,
                model,
                response: {
                    content: assistantMessage.content,
                    tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
                    usage: usage
                },
                httpHeaders: httpHeaders || {},
                httpStatus: httpStatus,
                llmApiCall: llmApiCall // Include tracking data in event
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
            // 5. Previous iteration had successful execute_javascript (prevents endless calculation cycles)
            
            // Check if last iteration executed execute_javascript successfully
            let hasSuccessfulJsExecution = false;
            if (iterationCount > 1) {
                // Look at tool messages from current context
                const recentToolMessages = currentMessages.filter(m => m.role === 'tool');
                for (const toolMsg of recentToolMessages) {
                    if (toolMsg.name === 'execute_javascript' && toolMsg.content) {
                        try {
                            const result = JSON.parse(toolMsg.content);
                            // If result exists and no error, it's a successful execution
                            if (result.result !== undefined && !result.error) {
                                hasSuccessfulJsExecution = true;
                                break;
                            }
                        } catch (e) {
                            // Not JSON, skip
                        }
                    }
                }
            }
            
            const hasSubstantiveAnswer = assistantMessage.content.trim().length > 200; // Full answer threshold
            const tooManyIterations = iterationCount >= 8; // Safety limit (increased from 5)
            
            // Filter out undefined/empty tool calls (sparse array issue)
            const validToolCalls = currentToolCalls.filter(tc => tc && tc.function && tc.function.name);
            console.log(`🔧 DEBUG Tool calls: total=${currentToolCalls.length}, valid=${validToolCalls.length}, hasToolCalls=${hasToolCalls}`, JSON.stringify(validToolCalls));
            
            const shouldExecuteTools = hasToolCalls && 
                                      validToolCalls.length > 0 &&  // Use validToolCalls instead
                                      finishReason !== 'stop' &&  // LLM wants to continue
                                      !hasSubstantiveAnswer &&     // No complete answer yet
                                      !hasSuccessfulJsExecution && // No recent successful calculation
                                      !tooManyIterations;          // Safety limit
            
            console.log(`🔍 Tool execution decision: iteration=${iterationCount}, hasToolCalls=${hasToolCalls}, finishReason=${finishReason}, contentLength=${assistantMessage.content.length}, hasSubstantiveAnswer=${hasSubstantiveAnswer}, hasSuccessfulJsExecution=${hasSuccessfulJsExecution}, tooManyIterations=${tooManyIterations}, shouldExecuteTools=${shouldExecuteTools}`);
            
            const containsLegacyToolSyntax = LEGACY_TOOL_CALL_REGEX.test(assistantMessage.content || '');
            const missingStructuredToolCall = hasToolsConfigured && (!hasToolCalls || currentToolCalls.length === 0);

            if (missingStructuredToolCall && containsLegacyToolSyntax && jsonToolCallReminderCount < MAX_JSON_TOOL_REMINDERS) {
                jsonToolCallReminderCount++;
                assistantMessageRecorded = true;
                currentMessages.push(assistantMessage);

                const reminderPayload = `${JSON_TOOL_CALL_REMINDER_TEXT}\n\nYour previous reply contained unsupported syntax like "<function=...>". Call the appropriate tool with valid JSON arguments only.`;
                currentMessages.push({
                    role: 'user',
                    content: reminderPayload
                });

                sseWriter.writeEvent('status', {
                    status: 'retrying',
                    reason: 'json_tool_call_reminder',
                    reminderCount: jsonToolCallReminderCount,
                    timestamp: new Date().toISOString()
                });

                console.warn(`🔁 Reinforcing JSON tool call requirement (reminder ${jsonToolCallReminderCount}/${MAX_JSON_TOOL_REMINDERS})`);
                continue;
            }

            // If tool calls detected and should execute
            if (shouldExecuteTools) {
                // validToolCalls already computed above
                if (validToolCalls.length > 0) {
                    assistantMessage.tool_calls = validToolCalls;
                    
                    console.log(`📊 Sending tool-path message_complete with ${allLlmApiCalls.length} llmApiCalls`);
                    if (allLlmApiCalls.length > 0) {
                        console.log(`📊 First call tokens: ${JSON.stringify(allLlmApiCalls[0].response?.usage)}`);
                    }
                    
                    // Send message_complete with tool_calls included
                    // This allows the frontend to display both content and tool calls
                    sseWriter.writeEvent('message_complete', {
                        role: 'assistant',
                        content: assistantMessage.content,
                        tool_calls: validToolCalls,
                        llmApiCalls: allLlmApiCalls // Include all accumulated token usage data
                    });
                    
                    assistantMessageRecorded = true;
                    currentMessages.push(assistantMessage);
                    
                    // Execute tools
                    const toolResults = await executeToolCalls(validToolCalls, toolContext, sseWriter);
                    
                    // Add tool results to messages
                    currentMessages.push(...toolResults);
                    
                    // Continue loop to get final response
                    continue;
                }
            }
            
            // POST-PROCESSING: Extract comprehensive content from all tool calls
            // These will be sent as separate fields in the response, not appended to content
            // This keeps them out of LLM context while allowing UI to display them
            const toolMessages = currentMessages.filter(m => m.role === 'tool');
            
            let extractedContent = null;
            
            if (toolMessages.length > 0 && assistantMessage.content && assistantMessage.content.length > 0) {
                const allUrls = [];
                const allImages = [];
                const allVideos = [];
                const allMedia = [];
                
                // Process each tool result to extract content
                for (const toolMsg of toolMessages) {
                    // Use rawResult if available (contains unformatted JSON), otherwise fall back to content
                    const contentToProcess = toolMsg.rawResult || toolMsg.content;
                    if (!contentToProcess) continue;
                    
                    try {
                        // Try to parse as JSON first (for structured tool results)
                        const parsed = JSON.parse(contentToProcess);
                        
                        // Extract from search_web results
                        if (toolMsg.name === 'search_web' && parsed.results) {
                            console.log(`🔍 Processing search_web with ${parsed.results.length} results`);
                            for (const result of parsed.results) {
                                if (result.url) {
                                    allUrls.push({
                                        title: result.title || result.url,
                                        url: result.url,
                                        snippet: result.content?.substring(0, 150),
                                        isSearchResult: true // Mark as main search result
                                    });
                                }
                                
                                // Debug: Log what we're looking for
                                console.log(`  📄 Result: ${result.title || result.url}`);
                                console.log(`     page_content exists: ${!!result.page_content}`);
                                if (result.page_content) {
                                    console.log(`     - images: ${result.page_content.images?.length || 0}`);
                                    console.log(`     - videos: ${result.page_content.videos?.length || 0}`);
                                    console.log(`     - media: ${result.page_content.media?.length || 0}`);
                                    console.log(`     - links: ${result.page_content.links?.length || 0}`);
                                }
                                
                                // Extract ALL links from page_content (scraped from page)
                                if (result.page_content?.links) {
                                    for (const link of result.page_content.links) {
                                        allUrls.push({
                                            title: link.text || link.title || link.href,
                                            url: link.href || link.url,
                                            snippet: link.caption || null,
                                            source: result.url,
                                            isSearchResult: false // Mark as scraped link
                                        });
                                    }
                                }
                                
                                // Extract images from page_content
                                if (result.page_content?.images) {
                                    for (const img of result.page_content.images) {
                                        allImages.push({
                                            src: img.src,
                                            alt: img.alt || img.title || 'Image',
                                            source: result.url
                                        });
                                    }
                                }
                                
                                // Extract videos from page_content
                                if (result.page_content?.videos) {
                                    for (const video of result.page_content.videos) {
                                        allVideos.push({
                                            src: video.src,
                                            title: video.title || 'Video',
                                            source: result.url
                                        });
                                    }
                                }
                                
                                // Extract media from page_content
                                if (result.page_content?.media) {
                                    for (const media of result.page_content.media) {
                                        allMedia.push({
                                            src: media.src,
                                            type: media.type || 'unknown',
                                            source: result.url
                                        });
                                    }
                                }
                            }
                        }
                        
                        // Extract from scrape_url results
                        if (toolMsg.name === 'scrape_url') {
                            if (parsed.url) {
                                allUrls.push({
                                    title: parsed.title || parsed.url,
                                    url: parsed.url,
                                    snippet: parsed.content?.substring(0, 150)
                                });
                            }
                            
                            if (parsed.images) {
                                for (const img of parsed.images) {
                                    allImages.push({
                                        src: img.src,
                                        alt: img.alt || img.title || 'Image',
                                        source: parsed.url
                                    });
                                }
                            }
                            
                            if (parsed.videos) {
                                for (const video of parsed.videos) {
                                    allVideos.push({
                                        src: video.src,
                                        title: video.title || 'Video',
                                        source: parsed.url
                                    });
                                }
                            }
                            
                            if (parsed.media) {
                                for (const media of parsed.media) {
                                    allMedia.push({
                                        src: media.src,
                                        type: media.type || 'unknown',
                                        source: parsed.url
                                    });
                                }
                            }
                        }
                        
                    } catch (e) {
                        // Not JSON, check if it's compressed markdown format with URL section
                        if (toolMsg.name === 'search_web' && toolMsg.content.includes('🚨 CRITICAL: YOU MUST COPY THESE URLS')) {
                            // Extract URLs from compressed format
                            const urlSectionMatch = toolMsg.content.match(/🚨 CRITICAL:[\s\S]*?((?:\d+\.\s*\[.+?\]\(.+?\)\s*)+)/);
                            if (urlSectionMatch) {
                                const urlLines = urlSectionMatch[1].split('\n').filter(l => l.trim());
                                for (const line of urlLines) {
                                    const linkMatch = line.match(/\[(.+?)\]\((.+?)\)/);
                                    if (linkMatch) {
                                        allUrls.push({
                                            title: linkMatch[1],
                                            url: linkMatch[2],
                                            snippet: null
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Deduplicate by URL/src
                const uniqueUrls = Array.from(new Map(allUrls.map(u => [u.url, u])).values());
                const uniqueImages = Array.from(new Map(allImages.map(i => [i.src, i])).values());
                const uniqueVideos = Array.from(new Map(allVideos.map(v => [v.src, v])).values());
                const uniqueMedia = Array.from(new Map(allMedia.map(m => [m.src, m])).values());
                
                // Separate search result links from scraped page links
                const searchResultLinks = uniqueUrls.filter(u => u.isSearchResult);
                const scrapedLinks = uniqueUrls.filter(u => !u.isSearchResult);
                
                // Prioritize links: search results first, then top 5 most relevant scraped links
                const prioritizedLinks = [
                    ...searchResultLinks,
                    ...scrapedLinks.slice(0, 5) // Top 5 scraped links (reduced from 10)
                ];
                
                // Limit all links for expandable section (search results + top 20 scraped)
                const allLinks = [
                    ...searchResultLinks,
                    ...scrapedLinks.slice(0, 20) // Limit total scraped links
                ];
                
                // Separate YouTube videos from regular videos
                const youtubeVideos = uniqueVideos.filter(v => 
                    v.src && (v.src.includes('youtube.com') || v.src.includes('youtu.be'))
                );
                const otherVideos = uniqueVideos.filter(v => 
                    v.src && !(v.src.includes('youtube.com') || v.src.includes('youtu.be'))
                );
                
                // Prioritize top 3 images
                const prioritizedImages = uniqueImages.slice(0, 3);
                
                // Build structured extracted content for UI (not part of LLM context)
                // The UI will display this in expandable sections below the response
                extractedContent = {
                    // Prioritized content (shown inline, not expandable)
                    prioritizedLinks: prioritizedLinks.length > 0 ? prioritizedLinks : null,
                    prioritizedImages: prioritizedImages.length > 0 ? prioritizedImages : null,
                    
                    // Media sections (shown expanded by default)
                    youtubeVideos: youtubeVideos.length > 0 ? youtubeVideos : null,
                    otherVideos: otherVideos.length > 0 ? otherVideos : null,
                    media: uniqueMedia.length > 0 ? uniqueMedia : null,
                    
                    // Expandable sections (collapsed by default)
                    allLinks: allLinks.length > 0 ? allLinks : null,
                    allImages: uniqueImages.length > 0 ? uniqueImages : null,
                    
                    // Legacy field for backwards compatibility
                    sources: searchResultLinks.length > 0 ? searchResultLinks : null,
                    images: uniqueImages.length > 0 ? uniqueImages : null
                };
                
                console.log(`✅ Extracted content: ${allLinks.length} total links (${prioritizedLinks.length} prioritized), ${uniqueImages.length} images (${prioritizedImages.length} prioritized), ${youtubeVideos.length} YouTube videos, ${otherVideos.length} other videos, ${uniqueMedia.length} media items`);
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
            if (!assistantMessageRecorded) {
                currentMessages.push(assistantMessage);
                assistantMessageRecorded = true;
            }
            
            console.log(`📤 Sending final response: ${assistantMessage.content.length} chars`);
            console.log(`📤 Preview: ${assistantMessage.content.substring(0, 100)}...`);
            
            // Send message_complete with content and extracted content
            const messageCompleteData = {
                role: 'assistant',
                content: assistantMessage.content,
                llmApiCalls: allLlmApiCalls // Include all accumulated token usage data
                // Note: NOT including tool_calls - they're already sent via tool_call_* events
            };
            
            // Add tool results to the message for transparency (embedded in assistant message)
            const toolResultMessages = currentMessages.filter(m => m.role === 'tool');
            if (toolResultMessages.length > 0) {
                messageCompleteData.toolResults = toolResultMessages.map(tm => ({
                    role: 'tool',
                    content: tm.rawResult || tm.content, // Use full result for transparency
                    tool_call_id: tm.tool_call_id,
                    name: tm.name,
                    llmApiCalls: tm.llmApiCalls || [] // Include any nested LLM calls from tools
                }));
            }
            
            // Add extracted content if available (sources, images, videos, media)
            if (extractedContent) {
                messageCompleteData.extractedContent = extractedContent;
            }
            
            console.log(`📊 Sending final message_complete with ${allLlmApiCalls.length} llmApiCalls`);
            if (allLlmApiCalls.length > 0) {
                console.log(`📊 First call tokens: ${JSON.stringify(allLlmApiCalls[0].response?.usage)}`);
            }
            
            sseWriter.writeEvent('message_complete', messageCompleteData);
            
            console.log(`✅ Completing request after ${iterationCount} iterations`);
            
            // Log to Google Sheets (async, don't block response)
            try {
                const { logToGoogleSheets } = require('../services/google-sheets-logger');
                const requestEndTime = Date.now();
                const durationMs = requestStartTime ? (requestEndTime - requestStartTime) : 0;
                
                // Aggregate token usage across all LLM API calls
                let totalPromptTokens = 0;
                let totalCompletionTokens = 0;
                let totalTokens = 0;
                
                for (const apiCall of allLlmApiCalls) {
                    const usage = apiCall.response?.usage;
                    if (usage) {
                        totalPromptTokens += usage.prompt_tokens || 0;
                        totalCompletionTokens += usage.completion_tokens || 0;
                        totalTokens += usage.total_tokens || 0;
                    }
                }
                
                // Log the request (non-blocking)
                logToGoogleSheets({
                    userEmail: userEmail,
                    provider: provider || 'unknown',
                    model: model || 'unknown',
                    promptTokens: totalPromptTokens,
                    completionTokens: totalCompletionTokens,
                    totalTokens: totalTokens,
                    durationMs: durationMs,
                    timestamp: new Date().toISOString()
                }).catch(err => {
                    console.error('Failed to log to Google Sheets:', err.message);
                });
            } catch (err) {
                // Don't fail the request if logging fails
                console.error('Google Sheets logging error:', err.message);
            }
            
            // Add memory tracking snapshot before completing
            memoryTracker.snapshot('chat-complete');
            const memoryMetadata = memoryTracker.getResponseMetadata();
            
            // Calculate cost for this request
            const { calculateCost } = require('../services/google-sheets-logger');
            let requestCost = 0;
            for (const apiCall of allLlmApiCalls) {
                const usage = apiCall.response?.usage;
                if (usage && apiCall.model) {
                    const cost = calculateCost(
                        apiCall.model,
                        usage.prompt_tokens || 0,
                        usage.completion_tokens || 0
                    );
                    requestCost += cost;
                }
            }
            
            sseWriter.writeEvent('complete', {
                status: 'success',
                messages: currentMessages,
                iterations: iterationCount,
                extractedContent: extractedContent || undefined,
                cost: parseFloat(requestCost.toFixed(4)), // Cost for this request
                ...memoryMetadata
            });
            
            // Log memory summary
            console.log('📊 Chat endpoint ' + memoryTracker.getSummary());
            
            responseStream.end();
            return;
        }
        
        // Max iterations reached with tools still being called
        sseWriter.writeEvent('error', {
            error: 'Maximum tool execution iterations reached',
            code: 'MAX_ITERATIONS',
            iterations: iterationCount
        });
        
        // Log error to Google Sheets
        try {
            const { logToGoogleSheets } = require('../services/google-sheets-logger');
            const requestEndTime = Date.now();
            const durationMs = requestStartTime ? (requestEndTime - requestStartTime) : 0;
            
            logToGoogleSheets({
                userEmail: userEmail,
                provider: provider || 'unknown',
                model: model || 'unknown',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                durationMs: durationMs,
                timestamp: new Date().toISOString(),
                errorCode: 'MAX_ITERATIONS',
                errorMessage: `Maximum tool execution iterations reached (${iterationCount})`
            }).catch(err => console.error('Failed to log error to Google Sheets:', err.message));
        } catch (err) {
            console.error('Google Sheets error logging failed:', err.message);
        }
        
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
        
        // Log error to Google Sheets
        try {
            const { logToGoogleSheets } = require('../services/google-sheets-logger');
            const requestEndTime = Date.now();
            const durationMs = requestStartTime ? (requestEndTime - requestStartTime) : 0;
            
            // userEmail might not be defined if error occurs before auth
            const logUserEmail = (typeof userEmail !== 'undefined') ? userEmail : 'unknown';
            
            logToGoogleSheets({
                userEmail: logUserEmail,
                provider: provider || (lastRequestBody ? lastRequestBody.provider : 'unknown'),
                model: model || (lastRequestBody ? lastRequestBody.model : 'unknown'),
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                durationMs: durationMs,
                timestamp: new Date().toISOString(),
                errorCode: error.code || 'ERROR',
                errorMessage: error.message || 'Internal server error'
            }).catch(err => console.error('Failed to log error to Google Sheets:', err.message));
        } catch (err) {
            console.error('Google Sheets error logging failed:', err.message);
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
