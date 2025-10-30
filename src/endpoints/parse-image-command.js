/**
 * Parse Image Command Endpoint
 * Uses LLM to parse natural language image editing commands into structured operations
 * 
 * Endpoint: POST /parse-image-command
 * 
 * Request Body:
 * {
 *   command: string (e.g., "make it smaller and rotate right")
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   operations: Array<BulkOperation>,
 *   explanation: string
 * }
 */

const { verifyGoogleToken } = require('../auth');

// Force module reload to bypass Node.js require cache
delete require.cache[require.resolve('../tools/image-edit-tools')];
const { imageEditTools, parseImageEditCommand } = require('../tools/image-edit-tools');

const { logToGoogleSheets } = require('../services/google-sheets-logger');
const { getOrEstimateUsage } = require('../utils/token-estimation');
const { buildProviderPool } = require('../credential-pool');
const { llmResponsesWithTools } = require('../llm_tools_adapter');
const { selectModel, RoundRobinSelector, SelectionStrategy } = require('../model-selection/selector');
const { RateLimitTracker } = require('../model-selection/rate-limit-tracker');
const { loadProviderCatalog } = require('../utils/catalog-loader');
const { GROQ_RATE_LIMITS } = require('../groq-rate-limits');
const { GEMINI_RATE_LIMITS } = require('../gemini-rate-limits');

// Load and enrich provider catalog (same as chat.js)
let providerCatalog = loadProviderCatalog();

// Enrich catalog with rate limits
function enrichCatalogWithRateLimits(catalog) {
    if (!catalog || !catalog.chat || !catalog.chat.providers) {
        return catalog;
    }
    
    // Groq models
    if (catalog.chat.providers['groq'] && catalog.chat.providers['groq'].models) {
        for (const [modelId, modelInfo] of Object.entries(catalog.chat.providers['groq'].models)) {
            const limits = GROQ_RATE_LIMITS[modelId];
            if (limits) {
                modelInfo.rateLimits = {
                    requestsPerMinute: limits.requestsPerMinute || limits.rpm,
                    tokensPerMinute: limits.tokensPerMinute || limits.tpm
                };
            }
        }
    }
    
    // Gemini models
    if (catalog.chat.providers['gemini'] && catalog.chat.providers['gemini'].models) {
        for (const [modelId, modelInfo] of Object.entries(catalog.chat.providers['gemini'].models)) {
            const limits = GEMINI_RATE_LIMITS[modelId];
            if (limits) {
                modelInfo.rateLimits = {
                    requestsPerMinute: limits.requestsPerMinute || limits.rpm,
                    tokensPerMinute: limits.tokensPerMinute || limits.tpm
                };
            }
        }
    }
    
    return catalog;
}

providerCatalog = enrichCatalogWithRateLimits(providerCatalog);

// Build runtime catalog filtered to available providers
function buildRuntimeCatalog(baseCatalog, availableProviders) {
    const catalog = JSON.parse(JSON.stringify(baseCatalog));
    
    if (!catalog.chat || !catalog.chat.providers) {
        return catalog;
    }
    
    const availableTypes = new Set(availableProviders.map(p => p.type));
    const filteredProviders = {};
    for (const [type, info] of Object.entries(catalog.chat.providers)) {
        if (availableTypes.has(type)) {
            filteredProviders[type] = info;
        }
    }
    
    catalog.chat.providers = filteredProviders;
    catalog.providers = filteredProviders;
    
    return catalog;
}

/**
 * Call LLM for image command parsing using model selection logic
 * @param {Array} messages - Chat messages
 * @param {Array} tools - Tool definitions
 * @param {Array} providerPool - Available providers
 * @param {RateLimitTracker} rateLimitTracker - Rate limit tracker instance
 * @returns {Promise<Object>} { response, providerType, modelUsed }
 */
async function callLLMForParsing(messages, tools, providerPool, rateLimitTracker) {
    // Filter to only chat-enabled providers
    const chatEnabledProviders = providerPool.filter(p => p.supportsChat !== false);
    
    if (chatEnabledProviders.length === 0) {
        throw new Error('No chat-enabled LLM providers available. Please configure at least one provider (Groq, OpenAI, etc.)');
    }
    
    // Build runtime catalog with only chat-enabled providers
    const runtimeCatalog = buildRuntimeCatalog(providerCatalog, chatEnabledProviders);
    
    // Use model selection with preference for cheap/fast models (image parsing is simple)
    const selection = selectModel({
        messages,
        tools,
        catalog: runtimeCatalog,
        rateLimitTracker,
        preferences: {
            strategy: SelectionStrategy.FREE_TIER,  // Prefer free tier for simple parsing
            preferFree: true,
            maxCostPerMillion: Infinity
        },
        roundRobinSelector: new RoundRobinSelector(),
        max_tokens: 500
    });
    
    // selectModel returns { model: { id, category, ... }, ... }
    // Extract model ID and provider type from the selection object
    const modelUsed = selection.model?.id || selection.model;
    const providerType = selection.model?.providerType;
    
    console.log(`🤖 [Image Parser] Selected: ${providerType}/${modelUsed} (${selection.category})`);
    
    // Find the actual provider instance from the pool to get the API key
    const selectedProvider = chatEnabledProviders.find(p => 
        p.type === providerType && 
        (p.model === modelUsed || p.modelName === modelUsed || !p.model)
    ) || chatEnabledProviders.find(p => p.type === providerType) || chatEnabledProviders[0];
    
    // Make the LLM call using llmResponsesWithTools (new signature)
    const response = await llmResponsesWithTools({
        model: `${providerType}:${modelUsed}`,
        input: messages,
        tools: tools,
        options: {
            apiKey: selectedProvider?.apiKey,
            temperature: 0.1,
            max_tokens: 500,
            tool_choice: 'auto'
        }
    });
    
    return {
        response,
        providerType,
        modelUsed
    };
}

/**
 * Main handler for parse-image-command endpoint
 */
async function handler(event, responseStream, context) {
    const origin = event.headers?.origin || event.headers?.Origin || '*';
    
    try {
        // Parse request body
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const { command } = body;
        
        if (!command || typeof command !== 'string') {
            const errorResponse = {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Google-OAuth-Token'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Command is required and must be a string'
                })
            };
            
            const metadata = {
                statusCode: errorResponse.statusCode,
                headers: errorResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(errorResponse.body);
            responseStream.end();
            return;
        }
        
        // Verify authentication (optional but recommended)
        const googleToken = event.headers?.['x-google-oauth-token'] || event.headers?.['X-Google-OAuth-Token'];
        let userEmail = 'anonymous';
        let isAuthorized = false;
        if (googleToken) {
            try {
                // Try JWT verification first (for ID tokens)
                let payload = await verifyGoogleToken(googleToken);
                
                // If JWT verification fails, try OAuth2 access token verification
                if (!payload && googleToken.startsWith('ya29.')) {
                    const { verifyGoogleOAuthToken } = require('../auth');
                    payload = await verifyGoogleOAuthToken(googleToken);
                }
                
                if (payload) {
                    userEmail = payload.email || 'anonymous';
                    isAuthorized = true;
                    console.log('✅ Google OAuth token verified for:', userEmail);
                } else {
                    console.warn('⚠️ Token verification returned null');
                }
            } catch (error) {
                console.warn('⚠️ Google OAuth verification failed:', error.message);
            }
        }
        
        // Build provider pool from user settings and environment
        const userProviders = body.providers || [];
        
        // For local development or when no user providers, allow environment providers even without auth
        const allowEnvironmentProviders = isAuthorized || (userProviders.length === 0 && process.env.ALLOW_ENVIRONMENT_PROVIDERS !== 'false');
        const providerPool = buildProviderPool(userProviders, allowEnvironmentProviders);
        
        if (providerPool.length === 0) {
            throw new Error('No LLM providers configured. Please add at least one provider in Settings.');
        }
        
        // Initialize rate limit tracker for model selection
        const rateLimitTracker = new RateLimitTracker();
        
        // Call LLM to parse command
        console.log('🤖 Parsing image command with LLM:', command);
        const startTime = Date.now();
        
        let llmResponse, usedProviderType, modelUsed;
        let operations = [];
        let explanation = '';
        
        try {
            const result = await callLLMForParsing(
                [
                    {
                        role: 'system',
                        content: 'You are an image editing command parser. Convert natural language image editing requests into structured operations. Be precise and literal - only generate operations that are explicitly requested.'
                    },
                    {
                        role: 'user',
                        content: `Parse this image editing command: "${command}"\n\nRespond with the appropriate image operations.`
                    }
                ],
                imageEditTools,
                providerPool,
                rateLimitTracker
            );
            
            llmResponse = result.response;
            usedProviderType = result.providerType;
            modelUsed = result.modelUsed;
            
            // Extract tool calls from response
            // llmResponsesWithTools returns normalized format: {output, text, rawResponse, ...}
            // Tool calls are in the output array, not choices[0].message.tool_calls
            console.log('🔍 DEBUG: llmResponse structure:', JSON.stringify({
                hasOutput: !!llmResponse.output,
                outputLength: llmResponse.output?.length,
                hasRawResponse: !!llmResponse.rawResponse,
                text: llmResponse.text?.substring(0, 100)
            }, null, 2));
            
            if (llmResponse.output && llmResponse.output.length > 0) {
                const toolCall = llmResponse.output[0];
                console.log('🔍 Tool call received:', JSON.stringify(toolCall, null, 2));
                if (toolCall.name === 'edit_images') {
                    const parsed = parseImageEditCommand(toolCall);
                    console.log('🔍 Parse result:', parsed);
                    if (parsed.success) {
                        operations = parsed.operations;
                        explanation = `Parsed "${command}" into ${operations.length} operation(s)`;
                    } else {
                        explanation = `Failed to parse: ${parsed.error}`;
                    }
                }
            } else if (llmResponse.text) {
                // Fallback: LLM explained but didn't use tool
                explanation = llmResponse.text;
            }
        } catch (llmError) {
            // Handle LLM HTTP errors (e.g., tool validation failures)
            console.warn('⚠️ LLM parsing error:', llmError.message);
            
            // Check if it's a tool validation error (HTTP 400)
            if (llmError.httpStatus === 400 && llmError.responseBody) {
                try {
                    const errorBody = typeof llmError.responseBody === 'string' 
                        ? JSON.parse(llmError.responseBody) 
                        : llmError.responseBody;
                    
                    if (errorBody.error?.message?.includes('tool call validation failed')) {
                        // Extract the specific validation error
                        const message = errorBody.error.message;
                        
                        // Common unsupported operation messages
                        if (message.includes('degrees') && message.includes('must be one of')) {
                            explanation = `⚠️ Arbitrary rotation angles aren't supported yet. Only 90°, 180°, and 270° rotations are available. Try: "rotate left" (270°), "rotate right" (90°), or "rotate 180".`;
                        } else if (message.includes('filter')) {
                            explanation = `⚠️ That filter isn't supported. Available filters: grayscale, sepia, blur, sharpen. Try: "make black and white", "add sepia tone", "blur the image".`;
                        } else {
                            explanation = `⚠️ Command not supported: ${message}. Try simpler commands like: "rotate left", "flip horizontally", "make smaller", "convert to png".`;
                        }
                        
                        operations = [];
                    }
                } catch (parseError) {
                    console.error('Failed to parse LLM error body:', parseError);
                    explanation = `⚠️ Unsupported command. Try: "rotate left/right", "flip horizontally/vertically", "make smaller/bigger", "convert to jpg/png", "make grayscale".`;
                }
            } else {
                // Other LLM errors
                throw llmError;  // Re-throw to be caught by outer catch
            }
        }
        
        // If no operations parsed, provide helpful response
        if (operations.length === 0 && !explanation) {
            explanation = 'Could not parse command. Try commands like: "make smaller", "rotate right", "convert to jpg", "make black and white"';
        }
        
        console.log('✅ Parsed operations:', operations);
        
        const duration = Date.now() - startTime;
        
        // Calculate usage and cost (only if we got an LLM response)
        let usage = null;
        if (llmResponse) {
            const messages = [
                {
                    role: 'system',
                    content: 'You are an image editing command parser. Convert natural language image editing requests into structured operations. Be precise and literal - only generate operations that are explicitly requested.'
                },
                {
                    role: 'user',
                    content: `Parse this image editing command: "${command}"\n\nRespond with the appropriate image operations.`
                }
            ];
            
            const responseText = explanation;
            usage = getOrEstimateUsage(
                llmResponse.usage,
                messages,
                responseText,
                usedProviderType
            );
        }
        
        // Log to Google Sheets (only if we got usage data)
        if (usage) {
            const logData = {
                timestamp: new Date().toISOString(),
                email: userEmail,
                type: 'parse_image_command',
                model: `${usedProviderType}/${modelUsed}`,
                provider: usedProviderType,
                tokensIn: usage.prompt_tokens,
                tokensOut: usage.completion_tokens,
                cost: usage.cost || 0,
                durationMs: duration,
                status: 'SUCCESS',
                metadata: {
                    command: command.substring(0, 200),
                    operationsCount: operations.length
                }
            };
        
            // Log asynchronously (don't block response)
            logToGoogleSheets(logData).catch(err => {
                console.error('Failed to log parse-image-command to Google Sheets:', err);
            });
        }
        
        // Return successful response
        const successResponse = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Google-OAuth-Token'
            },
            body: JSON.stringify({
                success: operations.length > 0,
                operations,
                explanation,
                original_command: command
            })
        };
        
        const metadata = {
            statusCode: successResponse.statusCode,
            headers: successResponse.headers
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(successResponse.body);
        responseStream.end();
        
    } catch (error) {
        console.error('Parse image command error:', error);
        
        const errorResponse = {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Google-OAuth-Token'
            },
            body: JSON.stringify({
                success: false,
                error: error.message,
                operations: []
            })
        };
        
        const metadata = {
            statusCode: errorResponse.statusCode,
            headers: errorResponse.headers
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(errorResponse.body);
        responseStream.end();
    }
}

module.exports = { handler };
