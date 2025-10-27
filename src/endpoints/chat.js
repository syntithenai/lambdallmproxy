/**
 * Chat Endpoint with Streaming and Tool Execution
 * Handles OpenAI-compatible chat completions with automatic tool calling
 * Streams responses via SSE with real-time updates
 */

const https = require('https');
const http = require('http');
const { verifyGoogleToken, getAllowedEmails, authenticateRequest } = require('../auth');
const { callFunction, compressSearchResultsForLLM, mergeTools} = require('../tools');
const { createSSEStreamAdapter } = require('../streaming/sse-writer');
const { parseProviderModel } = require('../providers');
const { createProgressEmitter } = require('../utils/progress-emitter');
const { getOrEstimateUsage, providerReturnsUsage } = require('../utils/token-estimation');
const { buildProviderPool, hasAvailableProviders } = require('../credential-pool');
const { RateLimitTracker } = require('../model-selection/rate-limit-tracker');
const { selectModel, selectWithFallback, RoundRobinSelector, SelectionStrategy } = require('../model-selection/selector');
const { loadGuardrailConfig } = require('../guardrails/config');
const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');

// Load provider catalog with fallback
let providerCatalog;
try {
    providerCatalog = require('../../PROVIDER_CATALOG.json');
} catch (error) {
    try {
        providerCatalog = require('/var/task/PROVIDER_CATALOG.json');
    } catch (error2) {
        const path = require('path');
        const catalogPath = path.join(__dirname, '..', '..', 'PROVIDER_CATALOG.json');
        const fs = require('fs');
        providerCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    }
}

// Enrich catalog with rate limit information from provider-specific modules
const { GROQ_RATE_LIMITS } = require('../groq-rate-limits');
const { GEMINI_RATE_LIMITS } = require('../gemini-rate-limits');

// Helper function to enrich catalog with rate limits
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
                    rpm: limits.rpm,
                    tpm: limits.tpm,
                    rpd: limits.rpd,
                    tpd: limits.tpd
                };
                modelInfo.tpm = limits.tpm; // Also add at top level for easy access
                modelInfo.rpm = limits.rpm;
            }
        }
    }
    
    // Groq-free models (same limits as groq)
    if (catalog.chat.providers['groq-free'] && catalog.chat.providers['groq-free'].models) {
        for (const [modelId, modelInfo] of Object.entries(catalog.chat.providers['groq-free'].models)) {
            const limits = GROQ_RATE_LIMITS[modelId];
            if (limits) {
                modelInfo.rateLimits = {
                    rpm: limits.rpm,
                    tpm: limits.tpm,
                    rpd: limits.rpd,
                    tpd: limits.tpd
                };
                modelInfo.tpm = limits.tpm;
                modelInfo.rpm = limits.rpm;
            }
        }
    }
    
    // Gemini models
    if (catalog.chat.providers['gemini'] && catalog.chat.providers['gemini'].models) {
        for (const [modelId, modelInfo] of Object.entries(catalog.chat.providers['gemini'].models)) {
            const limits = GEMINI_RATE_LIMITS[modelId];
            if (limits) {
                modelInfo.rateLimits = {
                    rpm: limits.rpm,
                    tpm: limits.tpm
                };
                modelInfo.tpm = limits.tpm;
                modelInfo.rpm = limits.rpm;
            }
        }
    }
    
    return catalog;
}

/**
 * Enrich catalog with priority information from provider pool
 * Priority is taken from LP_PRIORITY_X environment variables
 * @param {Object} catalog - Provider catalog
 * @param {Array} providerPool - Array of provider configurations from buildProviderPool
 * @returns {Object} Enriched catalog
 */
function enrichCatalogWithPriority(catalog, providerPool) {
    if (!catalog || !catalog.chat || !catalog.chat.providers || !providerPool) {
        return catalog;
    }
    
    // Build priority map and allowedModels filter: providerType -> { priority, allowedModels }
    const priorityMap = {};
    const allowedModelsMap = {};
    for (const provider of providerPool) {
        const priority = provider.priority !== undefined ? provider.priority : 100;
        const providerType = provider.type;
        
        // Use lowest priority number (highest priority) if multiple providers of same type
        if (priorityMap[providerType] === undefined || priority < priorityMap[providerType]) {
            priorityMap[providerType] = priority;
        }
        
        // Track allowedModels filter (if any provider of this type has a filter, use it)
        if (provider.allowedModels && !allowedModelsMap[providerType]) {
            allowedModelsMap[providerType] = provider.allowedModels;
        }
    }
    
    // Apply priorities and filter models by allowedModels
    for (const [providerType, providerInfo] of Object.entries(catalog.chat.providers)) {
        if (priorityMap[providerType] !== undefined && providerInfo.models) {
            const priority = priorityMap[providerType];
            const allowedModels = allowedModelsMap[providerType];
            
            // Filter models if allowedModels is set
            if (allowedModels && Array.isArray(allowedModels) && allowedModels.length > 0) {
                const originalCount = Object.keys(providerInfo.models).length;
                const filteredModels = {};
                
                for (const [modelId, modelInfo] of Object.entries(providerInfo.models)) {
                    // Check if model is in allowedModels list
                    if (allowedModels.includes(modelId) || allowedModels.includes(modelInfo.name)) {
                        filteredModels[modelId] = modelInfo;
                        filteredModels[modelId].priority = priority;
                    }
                }
                
                providerInfo.models = filteredModels;
                const filteredCount = Object.keys(filteredModels).length;
                
                if (filteredCount > 0) {
                    console.log(`   🔒 ${providerType}: Filtered ${originalCount} → ${filteredCount} models (allowed: ${allowedModels.join(', ')})`);
                    console.log(`   🎯 Applied priority ${priority} to ${providerType} models`);
                } else {
                    console.warn(`   ⚠️ ${providerType}: No models match allowedModels filter! All ${originalCount} models blocked.`);
                }
            } else {
                // No filter - apply priority to all models
                for (const [modelId, modelInfo] of Object.entries(providerInfo.models)) {
                    modelInfo.priority = priority;
                }
                
                if (Object.keys(providerInfo.models).length > 0) {
                    console.log(`   🎯 Applied priority ${priority} to ${providerType} models (no filter)`);
                }
            }
        }
    }
    
    return catalog;
}

// Enrich the catalog immediately after loading
providerCatalog = enrichCatalogWithRateLimits(providerCatalog);
console.log('✅ Provider catalog enriched with rate limit information');

const { createGuardrailValidator } = require('../guardrails/guardrail-factory');

// NOTE: mixtral-8x7b-32768 was decommissioned by Groq in Oct 2025
// NOTE: llama-3.1-70b-versatile was decommissioned by Groq in Oct 2025
const GROQ_RATE_LIMIT_FALLBACK_MODELS = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile'
];

const JSON_TOOL_CALL_REMINDER_TEXT = 'You must answer with a tool call using valid JSON arguments and no extra text. Use the official OpenAI function-calling format.';
const LEGACY_TOOL_CALL_REGEX = /<\s*function\s*=\s*[^>]+>/i;
const MAX_JSON_TOOL_REMINDERS = 2;

// Global singleton rate limit tracker (persists across Lambda warm starts)
let globalRateLimitTracker = null;

// Detect if running in local development mode
const isLocalDevelopment = () => {
    return process.env.LOCAL === 'true' || 
           process.env.ENV === 'development' ||
           process.env.AWS_EXEC === undefined;
};

// Calculate cost, but return 0 if running locally
// ✅ PRICING SYSTEM: Pass isUserProvidedKey flag to apply surcharge only for server keys
const calculateCostSafe = (model, promptTokens, completionTokens, provider = null) => {
    if (isLocalDevelopment()) {
        return 0;
    }
    // Determine if this is a user-provided key (no surcharge) or server key (surcharge applies)
    const isUserProvidedKey = provider ? !provider.isServerSideKey : false;
    return calculateCost(model, promptTokens, completionTokens, null, isUserProvidedKey);
};

/**
 * Get or create the global rate limit tracker
 * Singleton pattern ensures state persists across requests in same Lambda instance
 * @returns {RateLimitTracker} Global rate limit tracker instance
 */
function getRateLimitTracker() {
    if (!globalRateLimitTracker) {
        console.log('🔄 Initializing global RateLimitTracker...');
        globalRateLimitTracker = new RateLimitTracker({
            autoReset: true,
            persistence: null // In-memory for now
        });
        
        // Initialize from catalog
        initializeTrackerFromCatalog(globalRateLimitTracker, providerCatalog);
        console.log('✅ RateLimitTracker initialized');
    }
    return globalRateLimitTracker;
}

/**
 * Initialize rate limit tracker with limits from provider catalog
 * @param {RateLimitTracker} tracker - Rate limit tracker instance
 * @param {Object} catalog - Provider catalog
 */
function initializeTrackerFromCatalog(tracker, catalog) {
    if (!catalog || !catalog.chat || !catalog.chat.providers) {
        console.warn('⚠️ Invalid catalog structure, skipping tracker initialization');
        return;
    }
    
    let modelCount = 0;
    for (const [providerType, providerInfo] of Object.entries(catalog.chat.providers)) {
        if (!providerInfo.models) continue;
        
        // Handle both object and array formats
        const models = Array.isArray(providerInfo.models) 
            ? providerInfo.models 
            : Object.values(providerInfo.models);
        
        for (const model of models) {
            if (model.rateLimits) {
                tracker.getModelLimit(providerType, model.id, model.rateLimits);
                modelCount++;
            }
        }
    }
    
    console.log(`📊 Initialized rate limits for ${modelCount} models across ${Object.keys(catalog.chat.providers).length} providers`);
}

/**
 * Build runtime catalog filtered to available providers
 * @param {Object} baseCatalog - Base provider catalog
 * @param {Array} availableProviders - Provider pool
 * @returns {Object} Filtered catalog
 */
function buildRuntimeCatalog(baseCatalog, availableProviders) {
    // Deep clone catalog
    const catalog = JSON.parse(JSON.stringify(baseCatalog));
    
    if (!catalog.chat || !catalog.chat.providers) {
        return catalog;
    }
    
    // Get set of available provider types
    const availableTypes = new Set(availableProviders.map(p => p.type));
    
    // Filter to only include configured providers
    const filteredProviders = {};
    for (const [type, info] of Object.entries(catalog.chat.providers)) {
        if (availableTypes.has(type)) {
            filteredProviders[type] = info;
        }
    }
    
    catalog.chat.providers = filteredProviders;
    catalog.providers = filteredProviders; // For compatibility with selector
    
    return catalog;
}

/**
 * Log transaction to both service account sheet and user's personal billing sheet
 * @param {string} accessToken - User's OAuth access token (can be null)
 * @param {object} logData - Transaction data
 * @throws {Error} If sheet limit reached (error code: SHEET_LIMIT_REACHED)
 */
async function logToBothSheets(accessToken, logData) {
    console.log('📊 logToBothSheets called:', {
        hasAccessToken: !!accessToken,
        tokenLength: accessToken?.length || 0,
        userEmail: logData.userEmail,
        type: logData.type
    });
    
    // Always log to service account sheet (admin tracking)
    try {
        await logToGoogleSheets(logData);
        console.log('✅ Logged to service account sheet');
    } catch (error) {
        // Re-throw SHEET_LIMIT_REACHED errors - this is a critical system limit
        if (error.code === 'SHEET_LIMIT_REACHED') {
            console.error('❌ CRITICAL: Sheet limit reached - cannot accept new users');
            throw error; // Propagate to caller to return 503 error to user
        }
        
        // Log other errors but don't fail the request
        console.error('⚠️ Failed to log to service account sheet:', error.message);
    }
    

}

/**
 * Evaluate if the response comprehensively answers the user's query
 * Uses a minimal LLM call with just user prompts and assistant responses
 * @param {Array} messages - Conversation messages
 * @param {string} finalResponse - The final assistant response to evaluate
 * @param {string} model - Model to use for evaluation (cheap model)
 * @param {string} apiKey - API key
 * @param {string} provider - Provider name
 * @param {Object} providerConfig - Provider configuration (optional, for model filtering)
 * @returns {Promise<Object>} {isComprehensive: boolean, reason: string, usage: object}
 */
async function evaluateResponseComprehensiveness(messages, finalResponse, model, apiKey, provider, providerConfig) {
    try {
        // Build minimal evaluation context: only user prompts and assistant responses (no tool results, no media)
        const evaluationMessages = [];
        
        for (const msg of messages) {
            if (msg.role === 'user') {
                // Strip media attachments from user messages for evaluation
                let content = msg.content;
                if (typeof content === 'string') {
                    evaluationMessages.push({ role: 'user', content });
                } else if (Array.isArray(content)) {
                    // Extract only text parts, skip images/media
                    const textParts = content.filter(part => part.type === 'text');
                    if (textParts.length > 0) {
                        const textContent = textParts.map(part => part.text).join('\n');
                        evaluationMessages.push({ role: 'user', content: textContent });
                    }
                }
            } else if (msg.role === 'assistant' && msg.content) {
                // Extract content as string (handle both string and object formats)
                let contentStr = '';
                if (typeof msg.content === 'string') {
                    contentStr = msg.content;
                } else if (typeof msg.content === 'object') {
                    // Handle object format (e.g., Gemini might return {content: "text"})
                    contentStr = msg.content.content || JSON.stringify(msg.content);
                }
                
                // Include assistant responses if they have content (but not tool_calls)
                if (contentStr && contentStr.trim().length > 0) {
                    evaluationMessages.push({ role: 'assistant', content: contentStr });
                }
            }
            // Skip 'tool' and 'system' messages
        }
        
        // Add the final response we're evaluating
        evaluationMessages.push({ role: 'assistant', content: finalResponse });
        
        // Minimal system prompt for evaluation
        const evaluationSystemPrompt = `You are a response quality evaluator. Your job is to determine if the assistant's final response is acceptable.

Respond with ONLY a JSON object in this exact format:
{"comprehensive": true/false, "reason": "brief explanation"}

Mark as comprehensive (true) if:
- The response makes a reasonable attempt to answer the question
- It provides useful information or results
- It's a complete thought (not cut off mid-sentence)
- Any tool results or search results are present and explained

Mark as NOT comprehensive (false) ONLY if:
- The response is clearly cut off or truncated mid-sentence
- It has obvious syntax errors (unclosed brackets, etc.)
- It's extremely short (<30 chars) and doesn't answer anything
- It literally says "I will do X" but hasn't done X yet

Be LENIENT - assume the response is good unless there's an obvious problem.`;

        // Make minimal LLM call for evaluation
        const evalRequestBody = {
            model: model,
            messages: [
                { role: 'system', content: evaluationSystemPrompt },
                ...evaluationMessages
            ],
            temperature: 0.1, // Low temperature for consistent evaluation
            max_tokens: 200, // Just need a JSON response
            stream: false // Non-streaming for simpler parsing
        };
        
        console.log(`🔍 Evaluating response comprehensiveness with ${model}`);
        
        const { llmResponsesWithTools } = require('../llm_tools_adapter');
        
        // Convert messages to input format expected by llmResponsesWithTools
        const input = evalRequestBody.messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
        
        const evalResponse = await llmResponsesWithTools({
            model: model,
            input: input,
            tools: [], // No tools needed for evaluation
            options: {
                apiKey: apiKey,
                temperature: 0.1,
                max_tokens: 200,
                enforceJson: false,
                timeoutMs: 15000,
                providerConfig: providerConfig // Pass provider config for model filtering
            }
        });
        
        // Parse response
        let evalText = evalResponse.text || '';
        if (evalResponse.output && Array.isArray(evalResponse.output)) {
            const textOutput = evalResponse.output.find(item => item.type === 'text');
            if (textOutput) evalText = textOutput.text || '';
        }
        
        console.log(`🔍 Evaluation response: ${evalText.substring(0, 200)}`);
        console.log(`🔍 Evaluation rawResponse:`, evalResponse.rawResponse ? 'present' : 'MISSING');
        console.log(`🔍 Evaluation usage:`, evalResponse.rawResponse?.usage ? JSON.stringify(evalResponse.rawResponse.usage) : 'MISSING');
        
        // CRITICAL: Check for obviously incomplete responses using heuristics FIRST
        // This catches cases where the evaluation itself fails or gives wrong answers
        const isObviouslyIncomplete = 
            finalResponse.trim().length < 50 || // Too short
            finalResponse.trim().endsWith('...') || // Trailing ellipsis
            finalResponse.match(/\.\.\.$/) || // Ends with ...
            finalResponse.match(/[,;]\s*$/) || // Ends with comma or semicolon (mid-sentence)
            finalResponse.match(/\blet\s+\w+\s*=\s*$/) || // Ends with variable assignment (no value)
            finalResponse.match(/function\s+\w*\s*\([^)]*\)\s*\{\s*$/) || // Function with no body
            finalResponse.match(/\{\s*$/) || // Ends with opening brace
            finalResponse.match(/\[\s*$/) || // Ends with opening bracket
            finalResponse.match(/\(\s*$/) || // Ends with opening paren
            finalResponse.match(/[{[(]\s*$/) || // Ends with any opening delimiter
            finalResponse.includes('```javascript\n') && !finalResponse.match(/```javascript[\s\S]*```/) || // Unclosed code block
            finalResponse.includes('```\n') && (finalResponse.match(/```/g) || []).length % 2 !== 0; // Odd number of ```
        
        if (isObviouslyIncomplete) {
            console.log('🚨 Detected obviously incomplete response via heuristics');
            return {
                isComprehensive: false,
                reason: 'Response is obviously incomplete: ends abruptly, has unclosed delimiters, or is too short',
                usage: evalResponse.rawResponse?.usage || null,
                rawResponse: evalResponse.rawResponse || null,
                httpHeaders: evalResponse.httpHeaders || {},
                httpStatus: evalResponse.httpStatus,
                messages: []
            };
        }
        
        // Try to parse JSON from response
        // Default to comprehensive unless clearly wrong (fail-open approach)
        let evalResult = { comprehensive: true, reason: 'Evaluation parsing failed - assuming comprehensive by default' };
        try {
            // Extract JSON from response (may have markdown code blocks)
            const jsonMatch = evalText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                evalResult = JSON.parse(jsonMatch[0]);
            } else {
                // Fallback: If Gemini returns plain text instead of JSON, parse it
                console.log('⚠️ No JSON found in evaluation response, attempting text parsing');
                const lowerText = evalText.toLowerCase().trim();
                
                // IMPORTANT: Check negative indicators FIRST because "not comprehensive" contains "comprehensive"
                // Check for keywords indicating NOT comprehensive (more specific patterns first)
                const isNotComprehensive =
                    lowerText.includes('not comprehensive') ||
                    lowerText.includes('isn\'t comprehensive') ||
                    lowerText.includes('is not comprehensive') ||
                    lowerText.match(/\bnot\s+(enough|sufficient|complete)/i) ||
                    lowerText.includes('incomplete') ||
                    lowerText.includes('insufficient') ||
                    lowerText.includes('too brief') ||
                    lowerText.includes('too short') ||
                    lowerText.includes('lacks detail') ||
                    lowerText.includes('missing information') ||
                    // Check for "no" but not as part of other words (e.g., "know")
                    lowerText.match(/\bno\b/) ||
                    lowerText.match(/\bfalse\b/);
                    
                // Check for keywords indicating comprehensive (less specific, checked second)
                const isComprehensive = 
                    lowerText.includes('comprehensive') ||
                    lowerText.includes('complete') ||
                    lowerText.includes('sufficient') ||
                    lowerText.includes('adequate') ||
                    lowerText.includes('thorough') ||
                    lowerText.match(/\byes\b/) ||
                    lowerText.match(/\btrue\b/);
                
                // If we can determine comprehensiveness from text
                // Check negative FIRST (more important to catch "not comprehensive")
                if (isNotComprehensive) {
                    evalResult = { 
                        comprehensive: false, 
                        reason: `Text evaluation: ${evalText.substring(0, 150)}`
                    };
                } else if (isComprehensive) {
                    evalResult = { 
                        comprehensive: true, 
                        reason: `Text evaluation: ${evalText.substring(0, 150)}`
                    };
                } else {
                    // Can't determine - assume NOT comprehensive (fail-closed for safety)
                    // It's better to ask for more detail than to return an incomplete answer
                    evalResult = {
                        comprehensive: false,
                        reason: `Could not parse text evaluation, assuming NOT comprehensive for safety: ${evalText.substring(0, 150)}`
                    };
                }
                
                console.log(`✅ Parsed text evaluation: comprehensive=${evalResult.comprehensive}, reason: ${evalResult.reason}`);
            }
        } catch (parseError) {
            console.error('Failed to parse evaluation response:', parseError.message);
        }
        
        return {
            isComprehensive: evalResult.comprehensive === true,
            reason: evalResult.reason || 'No reason provided',
            usage: evalResponse.rawResponse?.usage || null,
            rawResponse: evalResponse.rawResponse || null,
            httpHeaders: evalResponse.httpHeaders || {},
            httpStatus: evalResponse.httpStatus,
            messages: [
                { role: 'system', content: evaluationSystemPrompt },
                ...evaluationMessages
            ] // Include the actual messages sent for transparency
        };
        
    } catch (error) {
        console.error('Response evaluation failed:', error.message);
        
        // Check if this is an auth/API key error
        const isAuthError = error.message?.includes('Invalid API Key') || 
                           error.message?.includes('401') ||
                           error.message?.includes('authentication') ||
                           error.message?.includes('unauthorized');
        
        if (isAuthError) {
            console.warn('⚠️ Evaluation skipped due to authentication error - proceeding without evaluation');
            return {
                isComprehensive: true,
                reason: 'Evaluation skipped - API authentication failed',
                usage: null,
                error: error.message,
                skipEvaluation: true, // Signal to skip further evaluation attempts
                messages: [] // No messages on error
            };
        }
        
        // For other errors, assume NOT comprehensive (fail-closed)
        // Better to retry than to return incomplete responses
        return {
            isComprehensive: false,
            reason: 'Evaluation failed - assuming NOT comprehensive for safety',
            usage: null,
            error: error.message,
            messages: [] // No messages on error
        };
    }
}

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
async function parseOpenAIStream(response, onChunk, sseWriter = null) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        let chunkCount = 0;
        const DISCONNECT_CHECK_INTERVAL = 10; // Check every 10 chunks
        
        response.on('data', (chunk) => {
            // Periodic disconnect check during streaming
            if (sseWriter && sseWriter.isDisconnected?.()) {
                chunkCount++;
                if (chunkCount % DISCONNECT_CHECK_INTERVAL === 0) {
                    console.log('⚠️ Client disconnected during LLM streaming, aborting');
                    response.destroy(); // Stop reading from upstream
                    reject(new Error('CLIENT_DISCONNECTED'));
                    return;
                }
            }
            
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
                            
                            // Try multiple error message paths to provide better error details
                            const errorMessage = 
                                error.error?.message || 
                                error.message || 
                                error.error || 
                                (error.details ? JSON.stringify(error.details) : null) ||
                                `API request failed (${res.statusCode})`;
                            
                            reject(new Error(errorMessage));
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
        // Check if client disconnected before processing next tool
        if (sseWriter.isConnected && !sseWriter.isConnected()) {
            console.log('⚠️ Client disconnected, stopping tool execution');
            throw new Error('CLIENT_DISCONNECTED');
        }
        
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
            
            // Create tool context with event writer and tool call ID
            const toolContext = {
                ...context,
                tool_call_id: id, // Pass tool call ID for event correlation
                writeEvent: (type, data) => {
                    sseWriter.writeEvent(type, data);
                }
            };
            
            // Set up progress emitter for tools that support it
            if (sseWriter.writeEvent) {
                if (name === 'transcribe_url') {
                    toolContext.onProgress = createProgressEmitter(sseWriter.writeEvent, id, 'transcribe_url');
                } else if (name === 'scrape_web_content') {
                    // Add progress support for Puppeteer scraping
                    toolContext.onProgress = createProgressEmitter(sseWriter.writeEvent, id, 'scrape_web_content');
                } else if (name === 'generate_image') {
                    // Emit progress event for image generation
                    sseWriter.writeEvent('image_generation_progress', {
                        id,
                        status: 'generating',
                        prompt: parsedArgs.prompt,
                        timestamp: new Date().toISOString()
                    });
                }
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
async function handler(event, responseStream, context) {
    const requestStartTime = Date.now(); // Track request start time for logging
    
    // Extract Lambda metrics
    const memoryLimitMB = context?.memoryLimitInMB || 0;
    
    // Check for custom request ID from headers (e.g., from voice transcription)
    const customRequestId = event.headers?.['x-request-id'] || event.headers?.['X-Request-Id'] || null;
    
    // Use request ID for grouping all logs from this request
    // Priority: custom header > context (set by index.js) > generated
    // Note: context.requestId was already set by index.js Lambda handler
    const requestId = customRequestId || context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    if (customRequestId) {
        console.log('🔗 Using custom request ID from header:', customRequestId);
    } else if (context?.requestId) {
        console.log('🔗 Using Lambda invocation request ID from context:', context.requestId);
    } else {
        console.log('🔗 Generated new request ID:', requestId);
    }
    
    const memoryUsedMB = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
    
    let sseWriter = null;
    let lastRequestBody = null; // Track last request for error reporting (moved to function scope)
    let googleToken = null; // Google OAuth token for API calls (moved to function scope)
    let driveAccessToken = null; // Google Drive access token for billing sheet logging (function scope)
    let userEmail = 'unknown'; // User email from auth (moved to function scope)
    let provider = null; // Selected provider (moved to function scope)
    let model = null; // Selected model (moved to function scope)
    let extractedContent = null; // Extracted media content (moved to function scope)
    let currentMessages = []; // Current message history with tool results (moved to function scope)
    let guardrailValidator = null; // Guardrail validator (initialized after auth)
    
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
        
        // Initialize TodosManager for backend-managed multi-step workflows
        const { TodosManager } = require('../utils/todos-manager');
        const todosManager = new TodosManager((type, data) => {
            try {
                sseWriter.writeEvent(type, data);
            } catch (err) {
                console.error(`Failed to emit todos event ${type}:`, err.message);
            }
        });
        console.log('✅ TodosManager initialized for chat session');
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        let { messages, tools, providers: userProviders, isRetry, retryContext, isContinuation, mcp_servers, location, language } = body;
        model = body.model; // Assign to function-scoped variable
        const tavilyApiKey = body.tavilyApiKey || '';
        
        // Extract user's preferred language for LLM responses
        const userLanguage = language || 'en';
        const { getLanguageInstruction } = require('../utils/languageInstructions');
        const languageInstruction = getLanguageInstruction(userLanguage);
        
        // INTELLIGENT MODEL ROUTING: Upgrade Together AI models based on query complexity
        // If user selected Together AI 8B model, analyze query and upgrade to 70B or 405B if needed
        if (model && messages && messages.length > 0) {
            const { getOptimalModel, analyzeQueryComplexity } = require('../utils/query-complexity');
            
            // Check if this is a Together AI model that should be routed
            const isTogether8B = model.includes('Meta-Llama-3.1-8B-Instruct-Turbo');
            const isTogetherModel = model.includes('together:') || 
                                   model.includes('meta-llama/') || 
                                   model.includes('Llama-3');
            
            if (isTogether8B || (isTogetherModel && !model.includes('405B') && !model.includes('70B'))) {
                // Extract user's latest query
                const userMessages = messages.filter(m => m.role === 'user');
                const latestQuery = userMessages.length > 0 
                    ? (typeof userMessages[userMessages.length - 1].content === 'string' 
                        ? userMessages[userMessages.length - 1].content 
                        : JSON.stringify(userMessages[userMessages.length - 1].content))
                    : '';
                
                // Analyze complexity and select optimal model
                const originalModel = model;
                const optimalModel = getOptimalModel(latestQuery, {
                    isCompression: false,
                    context: {
                        hasTools: tools && tools.length > 0,
                        conversationLength: messages.length,
                        requiresMultipleSteps: tools && tools.length > 3
                    },
                    provider: 'together'
                });
                
                // Update model if different
                if (optimalModel && optimalModel !== originalModel && !optimalModel.includes('8B')) {
                    model = optimalModel;
                    console.log(`🎯 Intelligent routing: ${originalModel} → ${model}`);
                    console.log(`📊 Query: "${latestQuery.substring(0, 100)}${latestQuery.length > 100 ? '...' : ''}"`);
                } else if (isTogether8B) {
                    // Even if complexity is simple, use 70B instead of 8B for better function calling
                    model = 'together:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';
                    console.log(`🎯 Upgraded 8B to 70B for better function calling: ${originalModel} → ${model}`);
                }
            }
        }
        
        // Store location data to be injected into system prompt later
        // (Don't prepend as separate system message - causes duplicate system messages)
        let locationContext = null;
        if (location && location.latitude && location.longitude) {
            const locationInfo = [];
            locationInfo.push(`User's Current Location:`);
            locationInfo.push(`- Coordinates: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)} (±${location.accuracy?.toFixed(0) || '?'}m)`);
            
            if (location.address) {
                const addr = location.address;
                if (addr.formatted) {
                    locationInfo.push(`- Address: ${addr.formatted}`);
                } else {
                    const parts = [];
                    if (addr.city) parts.push(addr.city);
                    if (addr.state) parts.push(addr.state);
                    if (addr.country) parts.push(addr.country);
                    if (parts.length > 0) {
                        locationInfo.push(`- Location: ${parts.join(', ')}`);
                    }
                }
            }
            
            locationInfo.push('');
            locationInfo.push('Please use this location information when answering location-specific queries such as:');
            locationInfo.push('- Weather and climate information');
            locationInfo.push('- Local businesses, restaurants, and services');
            locationInfo.push('- Directions and navigation');
            locationInfo.push('- Area-specific recommendations');
            locationInfo.push('- Time zones and local time');
            locationInfo.push('- Regional news or events');
            
            locationContext = '\n\n' + locationInfo.join('\n');
            
            console.log('📍 Location will be injected into system prompt:', 
                location.address?.city || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`);
        }
        
        // Merge all system messages and inject location context and language instruction
        // This prevents duplicate system messages which confuse the LLM
        if (messages && messages.length > 0) {
            // Find all system messages
            const systemMessages = messages.filter(m => m.role === 'system');
            const nonSystemMessages = messages.filter(m => m.role !== 'system');
            
            if (systemMessages.length > 0) {
                // Merge all system messages into one
                let mergedSystemContent = systemMessages.map(m => m.content).join('\n\n');
                
                // Add language instruction
                if (languageInstruction && userLanguage !== 'en') {
                    mergedSystemContent += `\n\n**LANGUAGE INSTRUCTION**: ${languageInstruction}`;
                }
                
                // Add location context if available
                const finalSystemContent = locationContext 
                    ? mergedSystemContent + locationContext 
                    : mergedSystemContent;
                
                // Reconstruct messages array with single system message at the start
                messages = [
                    { role: 'system', content: finalSystemContent },
                    ...nonSystemMessages
                ];
                
                console.log(`📍 Merged ${systemMessages.length} system message(s)` + 
                    (locationContext ? ' and added location context' : '') +
                    (userLanguage !== 'en' ? ` with ${userLanguage} language instruction` : ''));
            } else if (locationContext || userLanguage !== 'en') {
                // No system message exists, create one with location context and/or language instruction
                let systemContent = 'You are a helpful AI assistant with access to powerful tools. **MANDATORY TOOL USE**: (1) For calculations, math problems, or data processing, use execute_javascript. (2) For current events, news, recent information after your knowledge cutoff, facts needing citations, or any research query, use search_web. (3) For ANY diagrams, charts, flowcharts, or visualizations, use generate_chart - NEVER use execute_javascript for charts. **CRITICAL**: Always cite sources with URLs when using search_web. Use tools proactively - they provide better answers than relying solely on training data.';
                
                if (languageInstruction && userLanguage !== 'en') {
                    systemContent += `\n\n**LANGUAGE INSTRUCTION**: ${languageInstruction}`;
                }
                
                if (locationContext) {
                    systemContent += locationContext;
                }
                
                messages.unshift({
                    role: 'system',
                    content: systemContent
                });
                console.log('📍 Added system message' + 
                    (locationContext ? ' with location context' : '') +
                    (userLanguage !== 'en' ? ` and ${userLanguage} language instruction` : ''));
            } else {
                // No system message at all, add default with tool guidance
                messages.unshift({
                    role: 'system',
                    content: 'You are a helpful AI assistant with access to powerful tools. **MANDATORY TOOL USE**: (1) For calculations, math problems, or data processing, use execute_javascript. (2) For current events, news, recent information after your knowledge cutoff, facts needing citations, or any research query, use search_web. (3) For ANY diagrams, charts, flowcharts, or visualizations, use generate_chart - NEVER use execute_javascript for charts. **CRITICAL**: Always cite sources with URLs when using search_web. Use tools proactively - they provide better answers than relying solely on training data.'
                });
                console.log('✨ Added default system message with tool guidance');
            }
        }
        
        // Parse MCP servers if provided
        let mcpServers = [];
        if (mcp_servers) {
            try {
                // mcp_servers can be a JSON string or an array
                mcpServers = typeof mcp_servers === 'string' 
                    ? JSON.parse(mcp_servers) 
                    : mcp_servers;
                
                if (!Array.isArray(mcpServers)) {
                    console.warn('[MCP] mcp_servers must be an array, ignoring');
                    mcpServers = [];
                } else {
                    console.log(`[MCP] Received ${mcpServers.length} MCP server(s):`, mcpServers.map(s => s.name).join(', '));
                }
            } catch (error) {
                console.error('[MCP] Failed to parse mcp_servers:', error.message);
                mcpServers = [];
            }
        }
        
        // Merge MCP tools with built-in tools
        if (mcpServers.length > 0) {
            try {
                console.log('[MCP] Merging MCP tools with built-in tools...');
                tools = await mergeTools(tools || [], mcpServers);
                console.log(`[MCP] Merged tools: ${tools.length} total`);
            } catch (error) {
                console.error('[MCP] Failed to merge tools:', error.message);
                // Continue with built-in tools only
            }
        }
        
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
        
        // Handle continuation requests - allow tool results through
        if (isContinuation) {
            console.log('🔄 Continuation request detected - tool results will be preserved');
            // Messages already include tool results and full context from error/limit state
            // No need to filter aggressively
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
        
        // Enrich catalog with priority information from provider pool
        const enrichedCatalog = enrichCatalogWithPriority(providerCatalog, providerPool);
        
        // Extract Google OAuth token from Authorization header for API calls
        googleToken = null; // Reset to null first
        if (authHeader && authHeader.startsWith('Bearer ')) {
            googleToken = authHeader.substring(7);
        }
        
        // Extract YouTube OAuth token from custom header (for YouTube Transcript API)
        const youtubeToken = event.headers['x-youtube-token'] || event.headers['X-YouTube-Token'] || null;
        if (youtubeToken) {
            console.log('YouTube OAuth token detected for transcript access');
        }
        
        // Extract Google Drive access token from custom header (for billing sheet logging)
        driveAccessToken = event.headers['x-google-access-token'] || event.headers['X-Google-Access-Token'] || null;
        if (driveAccessToken) {
            console.log('Google Drive access token detected for billing sheet logging');
        }
        
        // Extract Google refresh token for automatic token refresh
        const googleRefreshToken = event.headers['x-google-refresh-token'] || event.headers['X-Google-Refresh-Token'] || null;
        if (googleRefreshToken) {
            console.log('Google refresh token detected for automatic token refresh');
        }
        
        // Set verified user from auth result
        const verifiedUser = authResult.user;
        userEmail = verifiedUser?.email || authResult.email || 'unknown';
        
        // Initialize guardrails if enabled (AFTER userEmail is set)
        try {
            // Build context with API keys for guardrail provider
            const guardrailContext = {
                ...body, // Include all request context (may have API keys)
                authorized: authResult.authorized,
                userEmail // Now available for logging
            };
            
            const guardrailConfig = loadGuardrailConfig(guardrailContext);
            if (guardrailConfig) {
                // Create validator (provider already validated during config load)
                guardrailValidator = createGuardrailValidator(guardrailConfig, guardrailContext);
                console.log('🛡️ Guardrails initialized for content filtering');
            }
        } catch (error) {
            console.error('🛡️ Guardrail initialization error:', error.message);
            sseWriter.writeEvent('error', {
                error: error.message,
                code: 'GUARDRAIL_CONFIG_ERROR',
                type: 'guardrail_configuration_error',
                statusCode: 500
            });
            responseStream.end();
            return;
        }
        
        // ✅ CREDIT SYSTEM: Check credit balance before processing request
        const { checkCreditBalance, estimateChatCost } = require('../utils/credit-check');
        const estimatedCost = estimateChatCost(messages, model);
        const creditCheck = await checkCreditBalance(userEmail, estimatedCost, 'chat');
        
        if (!creditCheck.allowed) {
            console.log(`💳 Insufficient credit for ${userEmail}: balance=$${creditCheck.balance.toFixed(4)}, estimated=$${estimatedCost.toFixed(4)}`);
            sseWriter.writeEvent('error', creditCheck.error);
            responseStream.end();
            return;
        }
        
        console.log(`💳 Credit check passed for ${userEmail}: balance=$${creditCheck.balance.toFixed(4)}, estimated=$${estimatedCost.toFixed(4)}`);
        
        // FILTER INPUT if guardrails enabled
        if (guardrailValidator && messages && messages.length > 0) {
            // Find the last user message to filter
            const lastUserMessageIndex = messages.map((m, i) => m.role === 'user' ? i : -1)
                .filter(i => i >= 0)
                .pop();
            
            if (lastUserMessageIndex !== undefined && lastUserMessageIndex >= 0) {
                const lastUserMessage = messages[lastUserMessageIndex];
                let userInputText = '';
                
                // Extract text content from message (may be string or array)
                if (typeof lastUserMessage.content === 'string') {
                    userInputText = lastUserMessage.content;
                } else if (Array.isArray(lastUserMessage.content)) {
                    // Extract text parts from multimodal content
                    userInputText = lastUserMessage.content
                        .filter(part => part.type === 'text')
                        .map(part => part.text)
                        .join('\n');
                }
                
                if (userInputText.trim().length > 0) {
                    console.log(`🛡️ Filtering user input (${userInputText.length} chars)...`);
                    
                    try{
                        const inputValidation = await guardrailValidator.validateInput(userInputText);
                        
                        // Track guardrail API call for cost transparency
                        const guardrailApiCall = {
                            phase: 'guardrail_input', // Use 'phase' instead of 'type' to prevent duplicate logging
                            type: 'guardrail_input',
                            model: inputValidation.tracking.model,
                            provider: inputValidation.tracking.provider,
                            request: {
                                messages: [{ role: 'user', content: '[FILTERED FOR GUARDRAIL CHECK]' }]
                            },
                            response: {
                                usage: {
                                    prompt_tokens: inputValidation.tracking.promptTokens || 0,
                                    completion_tokens: inputValidation.tracking.completionTokens || 0,
                                    total_tokens: (inputValidation.tracking.promptTokens || 0) + 
                                                 (inputValidation.tracking.completionTokens || 0)
                                }
                            },
                            totalTime: inputValidation.tracking.duration,
                            timestamp: new Date().toISOString()
                        };
                        
                        if (!inputValidation.safe) {
                            console.warn('🛡️ Input REJECTED:', inputValidation.reason);
                            
                            // Send error with cost tracking and suggested revision
                            sseWriter.writeEvent('error', {
                                error: 'Your input was flagged by our content moderation system.',
                                reason: inputValidation.reason,
                                violations: inputValidation.violations,
                                suggestedRevision: inputValidation.suggestedRevision,
                                type: 'input_moderation_error',
                                code: 'INPUT_FILTERED',
                                statusCode: 400,
                                llmApiCalls: [guardrailApiCall]
                            });
                            responseStream.end();
                            return;
                        }
                        
                        console.log('🛡️ Input validation PASSED');
                        
                        // NOTE: Guardrail API calls are logged DIRECTLY to sheets below
                        // Do NOT add to llmApiCalls array to avoid duplicate logging
                        
                        // Log guardrail input validation to Google Sheets
                        try {
                            const promptTokens = inputValidation.tracking.promptTokens || 0;
                            const completionTokens = inputValidation.tracking.completionTokens || 0;
                            const totalTokens = promptTokens + completionTokens;
                            const cost = calculateCostSafe(
                                inputValidation.tracking.model,
                                promptTokens,
                                completionTokens,
                                inputValidation.tracking.providerObj || null // Pass provider object if available
                            );
                            
                            await logToBothSheets(driveAccessToken, {
                                userEmail, // Now correctly set!
                                provider: inputValidation.tracking.provider,
                                model: inputValidation.tracking.model,
                                promptTokens,
                                completionTokens,
                                totalTokens,
                                cost,
                                duration: inputValidation.tracking.duration || 0,
                                type: 'guardrail_input',
                                memoryLimitMB,
                                memoryUsedMB,
                                requestId,
                                error: null
                            });
                            console.log(`✅ Logged guardrail input validation: ${inputValidation.tracking.model}, ${totalTokens} tokens, $${cost.toFixed(6)}`);
                        } catch (logError) {
                            console.error('⚠️ Failed to log guardrail input to Google Sheets:', logError.message);
                        }
                        
                    } catch (error) {
                        console.error('🛡️ Input validation error:', error.message);
                        // Fail safe: if guardrail check fails, block the request
                        sseWriter.writeEvent('error', {
                            error: 'Content moderation system error. Request blocked for safety.',
                            reason: error.message,
                            type: 'guardrail_system_error',
                            code: 'GUARDRAIL_ERROR',
                            statusCode: 500
                        });
                        responseStream.end();
                        return;
                    }
                }
            }
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
                return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
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
                const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-exp', 'gemini-exp-1206'];
                if (requestedModel && geminiModels.includes(requestedModel)) {
                    return requestedModel;
                }
                // Use gemini-2.5-flash for most requests (1M context)
                // Use gemini-2.0-flash-exp for experimental features
                return isComplex ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
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
        
        // Get optimization preference from request (default to 'cheap')
        const optimizationPreference = body.optimization || 'cheap';
        
        // Map optimization to selection strategy
        const strategyMap = {
            'cheap': SelectionStrategy.FREE_TIER,
            'balanced': SelectionStrategy.BALANCED,
            'powerful': SelectionStrategy.QUALITY_OPTIMIZED,
            'fastest': SelectionStrategy.SPEED_OPTIMIZED  // STEP 13: Use speed-optimized strategy
        };
        
        const strategy = strategyMap[optimizationPreference] || SelectionStrategy.BALANCED;
        
        // Get rate limit tracker
        const rateLimitTracker = getRateLimitTracker();
        
        // Filter providers by chat capability (default to enabled if undefined)
        const chatEnabledProviders = providerPool.filter(p => {
            // If capabilities not defined, assume chat is enabled (backward compatibility)
            if (!p.capabilities) return true;
            // Check if chat capability is explicitly enabled
            return p.capabilities.chat !== false;
        });
        
        console.log(`💬 Chat capability: ${chatEnabledProviders.length}/${providerPool.length} providers enabled for chat`);
        if (chatEnabledProviders.length === 0) {
            console.error('❌ No providers enabled for chat capability');
            sseWriter.writeEvent('error', {
                error: 'No providers are enabled for chat. Please enable chat capability for at least one provider in Settings.',
                code: 'NO_CHAT_PROVIDERS'
            });
            responseStream.end();
            return;
        }
        
        // Build runtime catalog with only chat-enabled providers
        const runtimeCatalog = buildRuntimeCatalog(enrichedCatalog, chatEnabledProviders);
        
        // Use sophisticated model selection
        let selection;
        let selectedModel = null;
        const requestedModel = model; // Save original request
        
        try {
            selection = selectModel({
                messages,
                tools,
                catalog: runtimeCatalog,
                rateLimitTracker,
                preferences: {
                    strategy,
                    preferFree: optimizationPreference === 'cheap',
                    maxCostPerMillion: Infinity // No limit for now
                },
                roundRobinSelector: new RoundRobinSelector(),
                max_tokens: body.max_tokens || null
            });
            
            selectedModel = selection.model;
            
            console.log('🎯 Model selected:', {
                model: selectedModel.name || selectedModel.id,
                provider: selectedModel.providerType,
                category: selection.category,
                requestType: selection.analysis.type,
                estimatedTokens: selection.totalTokens,
                strategy: strategy,
                optimization: optimizationPreference
            });
            
        } catch (error) {
            console.error('❌ Model selection failed:', error.message);
            
            // Try fallback
            try {
                selection = selectWithFallback({
                    messages,
                    tools,
                    catalog: runtimeCatalog,
                    rateLimitTracker,
                    preferences: { 
                        strategy, 
                        preferFree: optimizationPreference === 'cheap' 
                    }
                });
                selectedModel = selection.model;
                console.log('🔄 Fallback model selected:', selectedModel.name || selectedModel.id);
            } catch (fallbackError) {
                console.error('🛑 No models available:', fallbackError.message);
                
                // Final fallback to original simple selection
                console.log('⚠️ Falling back to simple model selection');
                const totalLength = messages.reduce((sum, msg) => 
                    sum + (typeof msg.content === 'string' ? msg.content.length : 0), 0
                );
                const isComplex = totalLength > 1000 || messages.length > 5 || (tools && tools.length > 0);
                model = selectModelForProvider(selectedProvider, requestedModel, isComplex);
                selectedModel = { name: model, providerType: selectedProvider.type };
            }
        }
        
        // Update variables based on selection
        if (selectedModel) {
            model = selectedModel.name || selectedModel.id;
            
            // Find provider that matches selected model (use chat-enabled providers)
            const matchingProvider = chatEnabledProviders.find(p => p.type === selectedModel.providerType);
            if (matchingProvider) {
                selectedProvider = matchingProvider;
                apiKey = selectedProvider.apiKey;
                targetUrl = getEndpointUrl(selectedProvider);
            }
        }
        
        provider = selectedProvider.type; // Assignment to function-scoped variable
        
        // Log model selection result
        if (requestedModel && requestedModel !== model) {
            console.log(`⚠️ Model override: requested "${requestedModel}", selected "${model}" (${provider})`);
        } else if (!requestedModel) {
            console.log(`🤖 Auto-selected model: ${model} (provider: ${provider})`);
        } else {
            console.log(`✅ Using requested model: ${model} (provider: ${provider})`);
        }
        
        // STEP 10: Dynamic max_tokens based on model, optimization, and constraints
        if (body.max_tokens === undefined) { // Only adjust if user didn't explicitly set it
            const { getOptimalMaxTokens } = require('../utils/content-optimizer');
            
            max_tokens = getOptimalMaxTokens({
                model: selectedModel,
                optimization: optimizationPreference,
                requestType: selection?.analysis?.type || 'SIMPLE',
                inputTokens: selection?.inputTokens || estimatedInputTokens,
                rateLimitTracker: rateLimitTracker,
                provider: provider
            });
            
            console.log(`📏 Dynamic max_tokens: ${max_tokens} (model: ${model}, optimization: ${optimizationPreference}, type: ${selection?.analysis?.type || 'SIMPLE'})`);
        } else {
            max_tokens = body.max_tokens;
            console.log(`📏 Using user-specified max_tokens: ${max_tokens}`);
        }
        
        // Build tool context with full provider pool for tools to select from
        // This allows tools to access ALL configured API keys, not just the first one
        const toolContext = {
            user: verifiedUser.email,
            userEmail: verifiedUser.email,
            model,
            apiKey,
            providerPool, // Pass full provider pool for tools to select from (supports multiple keys per type)
            googleToken,
            driveAccessToken, // Pass Google Sheets OAuth token for snippets/billing
            googleRefreshToken, // Pass Google refresh token for automatic token refresh
            youtubeAccessToken: youtubeToken, // Pass YouTube OAuth token for transcript access
            tavilyApiKey,
            mcpServers, // Pass MCP servers for tool routing
            timestamp: new Date().toISOString(),
            // STEP 11: Pass model context for content optimization
            selectedModel: selectedModel,
            optimization: optimizationPreference,
            inputTokens: selection?.inputTokens || estimatedInputTokens,
            // TodosManager for backend-managed multi-step workflows
            __todosManager: todosManager,
            writeEvent: (type, data) => sseWriter.writeEvent(type, data),
            // Pass conversation messages for tools that need context (e.g., generate_image reference images)
            messages: messages || [],
            // Pass provider configuration for model filtering in LLM calls
            providerConfig: selectedProvider,
            providers: providerPool // Pass full provider pool for tools that need access to multiple providers
        };
        
        const hasToolsConfigured = Array.isArray(tools) && tools.length > 0;

        // Send status event
        sseWriter.writeEvent('status', {
            status: 'processing',
            model,
            provider,
            hasTools: tools && tools.length > 0
        });
        
        currentMessages = [...messages]; // Assignment to function-scoped variable
        let iterationCount = 0;
        const maxIterations = parseInt(process.env.MAX_ITER) || 15;
        let jsonToolCallReminderCount = 0;
        
        // Todo auto-resubmission tracking
        let todoAutoIterations = 0;
        const MAX_TODO_AUTO_ITERATIONS = parseInt(process.env.MAX_TODO) || 5;
        
        // Track all LLM API calls across iterations
        const allLlmApiCalls = [];
        
        // Tool calling loop
        while (iterationCount < maxIterations) {
            iterationCount++;
            
            // Build request
            // Filter out tool messages from previous query cycles (token optimization)
            // Only apply filtering on first iteration (initial messages from client)
            // Subsequent iterations contain tool calls/results from current cycle
            // UNLESS this is a continuation request - then keep all tool results
            const isInitialRequest = (iterationCount === 1);
            const shouldFilter = isInitialRequest && !isContinuation;
            
            // Debug: Log message roles before filtering
            if (iterationCount === 1) {
                const beforeRoles = currentMessages.map((m, i) => `${i}:${m.role}`).join(', ');
                console.log(`🔍 Messages BEFORE filtering (iteration ${iterationCount}): ${beforeRoles}`);
                if (isContinuation) {
                    console.log(`🔄 Continuation mode: skipping tool message filtering`);
                }
            }
            
            const filteredMessages = shouldFilter 
                ? filterToolMessagesForCurrentCycle(currentMessages, isInitialRequest)
                : currentMessages;
            
            // Debug: Log message roles after filtering
            const afterRoles = filteredMessages.map((m, i) => `${i}:${m.role}`).join(', ');
            console.log(`🔍 Messages AFTER filtering (iteration ${iterationCount}): ${afterRoles}`);
            
            // Clean messages by removing UI-specific properties before sending to LLM
            // CRITICAL: Remove extractedContent, rawResult, evaluations - they're only for UI/extraction, never for LLM
            const cleanMessages = filteredMessages.map(msg => {
                const { isStreaming, errorData, llmApiCalls, extractedContent, rawResult, evaluations, ...cleanMsg } = msg;
                
                // CRITICAL: Clean malformed function calls from assistant messages
                // Some LLMs generate text-based function calls in various formats:
                // - <function=name> or <function=name>text</function>
                // - <function_name>{"param": "value"} </function>
                // - Other XML-style tags with function syntax
                // These are invalid and cause API errors. Remove them from content.
                if (cleanMsg.role === 'assistant' && cleanMsg.content && typeof cleanMsg.content === 'string') {
                    const originalContent = cleanMsg.content;
                    let content = cleanMsg.content;
                    
                    // Pattern 1: <function=name> syntax (with or without closing tag)
                    content = content.replace(/<function=[^>]+>(?:<\/function>)?/gi, '');
                    
                    // Pattern 2: <tag_name>{...json...} </tag_name>
                    content = content.replace(/<[^>]+>\s*\{[^}]*\}\s*<\/[^>]+>/g, '');
                    
                    // Pattern 3: Any remaining XML-style function/tool tags
                    content = content.replace(/<\/?(?:function|tool)[^>]*>/gi, '');
                    
                    cleanMsg.content = content.trim();
                    
                    if (originalContent !== cleanMsg.content) {
                        console.log('🧹 Cleaned malformed function call from assistant message');
                        console.log('   Original:', originalContent.substring(0, 200));
                        console.log('   Cleaned:', cleanMsg.content.substring(0, 200));
                    }
                }
                
                return cleanMsg;
            }).filter(msg => {
                // Remove assistant messages with empty content AND no tool_calls
                // These can cause API errors with some providers
                if (msg.role === 'assistant') {
                    const hasContent = msg.content && msg.content.trim().length > 0;
                    const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
                    if (!hasContent && !hasToolCalls) {
                        console.log('🧹 Filtered out empty assistant message with no tool_calls');
                        return false;
                    }
                }
                return true;
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
            
            // STEP 5: Proactive rate limit checking before making the request
            // Check if the selected model is available for this request
            const estimatedInputTokens = selection?.analysis?.estimatedTokens || 1000;
            // CRITICAL: Groq's rate limits apply to TOTAL tokens (input + output), not just input
            // Estimate total tokens by adding expected output (use max_tokens as worst case)
            const maxOutputTokens = requestBody.max_tokens || 2048;
            const estimatedTotalTokens = estimatedInputTokens + maxOutputTokens;
            const rateLimitTracker = getRateLimitTracker();
            
            if (!rateLimitTracker.isAvailable(provider, model, estimatedTotalTokens)) {
                console.log(`⚠️ Proactive rate limit check: ${provider}/${model} unavailable or rate-limited`);
                
                // Try to find an alternative model using selectWithFallback
                try {
                    const fallbackSelection = selectWithFallback({
                        messages,
                        tools,
                        catalog: runtimeCatalog,
                        rateLimitTracker,
                        preferences: { 
                            strategy, 
                            preferFree: optimizationPreference === 'cheap' 
                        },
                        excludeModels: [model]  // Don't select the same model again
                    });
                    
                    // Update to use fallback model
                    const fallbackModel = fallbackSelection.model;
                    model = fallbackModel.name || fallbackModel.id;
                    
                    // Find provider that matches fallback model
                    const matchingProvider = providerPool.find(p => p.type === fallbackModel.providerType);
                    if (matchingProvider) {
                        selectedProvider = matchingProvider;
                        apiKey = selectedProvider.apiKey;
                        targetUrl = getEndpointUrl(selectedProvider);
                        provider = selectedProvider.type;
                        
                        // Update request body with new model
                        requestBody.model = model;
                        
                        console.log(`🔄 Switched to fallback model: ${model} (${provider}) due to rate limits`);
                        
                        // Emit model switch event
                        sseWriter.writeEvent('model_switched', {
                            reason: 'rate_limit_proactive',
                            previousModel: requestBody.model,
                            newModel: model,
                            provider,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (fallbackError) {
                    console.log(`⚠️ No fallback available, proceeding with ${provider}/${model} (may hit rate limit)`);
                    // Continue with original model - reactive handling will catch 429 errors
                }
            } else {
                console.log(`✅ Proactive rate limit check: ${provider}/${model} available`);
            }
            
            // Make streaming request with smart retry logic
            let response, httpHeaders, httpStatus;
            let lastError = null;
            const maxRetries = 3;
            const maxProviderSwitches = 10; // Allow up to 10 provider/model switches total
            const attemptedModels = new Set([model]);
            const attemptedProviders = new Set([selectedProvider.id]);
            let sameModelRetries = 0;
            let totalAttempts = 0; // Total attempts across all providers
            
            // Calculate complexity for model selection during retries
            const totalLength = messages.reduce((sum, msg) => 
                sum + (typeof msg.content === 'string' ? msg.content.length : 0), 0
            );
            const isComplex = totalLength > 1000 || messages.length > 5 || (tools && tools.length > 0);
            
            // STEP 12: Track request timing for performance optimization
            let requestStartTime = null;
            let timeToFirstToken = null;
            let firstTokenReceived = false;
            
            // Use while loop to allow flexible retry logic when switching providers
            while (totalAttempts < maxProviderSwitches) {
                totalAttempts++;
                try {
                    const currentRequestBody = {
                        ...requestBody,
                        model: requestBody.model || model
                    };
                    
                    console.log(`🔄 Attempt ${totalAttempts}/${maxProviderSwitches}: provider=${provider}, model=${currentRequestBody.model}`);
                    
                    // STEP 12: Capture request start time
                    requestStartTime = Date.now();
                    
                    response = await makeStreamingRequest(targetUrl, apiKey, currentRequestBody);
                    
                    httpHeaders = response.httpHeaders || {};
                    httpStatus = response.httpStatus;
                    console.log(`✅ Request succeeded on attempt ${totalAttempts}`);
                    
                    // STEP 5: Update rate limit tracker from response headers
                    if (httpHeaders) {
                        rateLimitTracker.updateFromHeaders(provider, model, httpHeaders);
                        console.log(`📊 Updated rate limit state from response headers for ${provider}/${model}`);
                    }
                    
                    // STEP 14: Record successful request for health tracking
                    rateLimitTracker.recordSuccess(provider, model);
                    
                    break;
                    
                } catch (error) {
                    lastError = error;
                    console.error(`❌ Attempt ${totalAttempts} failed:`, error.message);
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
                        error.message?.includes('reduce the length') ||
                        error.message?.includes('reduce your message size') ||
                        error.message?.includes('context length') ||
                        error.message?.includes('429') ||
                        error.statusCode === 429;
                    
                    // Specifically detect TPM/capacity errors (need model with higher TPM/context)
                    const isCapacityError =
                        error.message?.includes('Request too large') ||
                        error.message?.includes('tokens per minute') ||
                        error.message?.includes('TPM') ||
                        error.message?.includes('reduce your message size') ||
                        error.message?.includes('context length');
                    
                    const isNetworkError = 
                        error.code === 'ECONNRESET' ||
                        error.code === 'ETIMEDOUT' ||
                        error.code === 'ECONNREFUSED' ||
                        error.message?.includes('timeout') ||
                        error.message?.includes('network') ||
                        (error.statusCode >= 500 && error.statusCode < 600);
                    
                    const isLastAttempt = totalAttempts >= maxProviderSwitches;
                    
                    // Handle rate limit: try different models on same provider, then switch provider
                    if (isRateLimitError) {
                        console.log(`🔀 Rate limit hit on provider ${provider}, model ${model}`);
                        
                        // STEP 5: Update rate limit tracker with 429 error
                        // Extract retry-after if available from error response
                        let retryAfter = null;
                        if (error.response?.headers) {
                            const retryAfterHeader = error.response.headers['retry-after'];
                            if (retryAfterHeader) {
                                retryAfter = parseInt(retryAfterHeader, 10);
                                if (isNaN(retryAfter)) {
                                    // Try parsing as date
                                    const retryDate = new Date(retryAfterHeader);
                                    if (!isNaN(retryDate.getTime())) {
                                        retryAfter = Math.ceil((retryDate.getTime() - Date.now()) / 1000);
                                    }
                                }
                            }
                        }
                        
                        rateLimitTracker.updateFrom429(provider, model, retryAfter);
                        console.log(`📊 Updated rate limit tracker with 429 error for ${provider}/${model}${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`);
                        
                        // STEP 14: Record error for health tracking
                        rateLimitTracker.recordError(provider, model);
                        
                        // For capacity errors (TPM/context), we need to switch to HIGH-CAPACITY models
                        // These models have much higher TPM limits (100K-1M instead of 6K)
                        const highCapacityModels = {
                            'groq': ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile'], // 30K, 12K TPM
                            'groq-free': ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile'], // 30K, 12K TPM
                            'gemini': ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'], // 1M TPM, 2M context
                            'gemini-free': ['gemini-2.0-flash-exp', 'gemini-1.5-flash'], // 1M TPM
                            'openai': ['gpt-4o', 'gpt-4o-mini'], // High TPM
                            'openai-compatible': ['gpt-4o', 'gpt-4o-mini']
                        };
                        
                        // Define fallback models for each provider type
                        // NOTE: mixtral-8x7b-32768 was decommissioned by Groq in Oct 2025
                        // NOTE: llama-3.1-70b-versatile was decommissioned by Groq in Oct 2025
                        const standardFallbackModels = {
                            'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
                            'openai-compatible': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
                            'groq': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
                            'groq-free': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
                        };
                        
                        // Choose appropriate fallback list based on error type
                        const providerModelFallbacks = isCapacityError 
                            ? (highCapacityModels[selectedProvider.type] || standardFallbackModels[selectedProvider.type] || [])
                            : (standardFallbackModels[selectedProvider.type] || []);
                        
                        console.log(`🔍 ${isCapacityError ? '⚡ CAPACITY ERROR' : '⏱️  Rate limit'} - using ${isCapacityError ? 'high-capacity' : 'standard'} fallback models`);
                        
                        // First, try other models on the same provider
                        const fallbackModels = providerModelFallbacks;
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
                        console.log(`⚠️ All models exhausted on provider ${provider} (ID: ${selectedProvider.id})`);
                        
                        // For capacity errors, prioritize HIGH-CAPACITY providers (Gemini with 1M TPM)
                        // For other rate limits, use standard priority order
                        const currentProviderType = selectedProvider.type;
                        const currentProviderId = selectedProvider.id;
                        const currentModel = model;
                        
                        let nextProvider = null;
                        
                        if (isCapacityError) {
                            console.log('⚡ CAPACITY ERROR - prioritizing high-capacity providers (Gemini 1M TPM)');
                            
                            // For capacity errors: Prioritize Gemini (free or paid) with massive TPM
                            nextProvider = chatEnabledProviders.find(p => 
                                !attemptedProviders.has(p.id) && 
                                (p.type === 'gemini-free' || p.type === 'gemini')
                            );
                            
                            if (nextProvider) {
                                console.log(`✅ Switching to high-capacity provider: ${nextProvider.type}`);
                            }
                            
                            // If no Gemini available, try OpenAI (also high TPM)
                            if (!nextProvider) {
                                nextProvider = chatEnabledProviders.find(p => 
                                    !attemptedProviders.has(p.id) && 
                                    p.type === 'openai'
                                );
                            }
                            
                            // Last resort for capacity: any provider except the failed one
                            if (!nextProvider) {
                                nextProvider = chatEnabledProviders.find(p => 
                                    !attemptedProviders.has(p.id) && 
                                    p.type !== currentProviderType
                                );
                            }
                        } else {
                            // Standard priority order for regular rate limits:
                            // 1. Same type but different model (e.g., other groq-free expanded instances)
                            // 2. Free providers (gemini-free)
                            // 3. Other paid providers
                            
                            // First priority: Try same provider type but different model/instance (expanded providers)
                            nextProvider = chatEnabledProviders.find(p => 
                                !attemptedProviders.has(p.id) && 
                                p.type === currentProviderType &&  // Same type (e.g., groq-free)
                                p.id !== currentProviderId &&       // Different instance ID
                                p.model !== currentModel            // Different model
                            );
                            
                            if (nextProvider) {
                                console.log(`🔄 Found another ${currentProviderType} instance: ${nextProvider.id} (model: ${nextProvider.model})`);
                            }
                            
                            // Second priority: Try free/alternative providers that are chat-enabled (different type)
                            // Include both gemini-free and gemini (paid) as fallback options
                            if (!nextProvider) {
                                nextProvider = chatEnabledProviders.find(p => 
                                    !attemptedProviders.has(p.id) && 
                                    p.type !== currentProviderType && 
                                    (p.type === 'gemini-free' || p.type === 'gemini')
                                );
                            }
                            
                            // Third priority: Try other provider types (excluding same type to force diversity)
                            if (!nextProvider) {
                                nextProvider = chatEnabledProviders.find(p => 
                                    !attemptedProviders.has(p.id) && 
                                    p.type !== currentProviderType
                                );
                            }
                        }
                        
                        // Last resort: Try any unattempted provider (even same type)
                        if (!nextProvider) {
                            nextProvider = chatEnabledProviders.find(p => !attemptedProviders.has(p.id));
                        }
                        
                        if (nextProvider) {
                            // Switch to new provider
                            selectedProvider = nextProvider;
                            provider = selectedProvider.type;
                            apiKey = selectedProvider.apiKey;
                            targetUrl = getEndpointUrl(selectedProvider);
                            
                            // For expanded providers, use the pre-assigned model
                            if (selectedProvider.model) {
                                model = selectedProvider.model;
                                console.log(`🎯 Using pre-assigned model from expanded provider: ${model}`);
                            } else {
                                model = selectModelForProvider(selectedProvider, requestedModel, isComplex);
                            }
                            
                            attemptedProviders.add(selectedProvider.id);
                            attemptedModels.add(model);
                            
                            // Reset same-model retries for new provider
                            sameModelRetries = 0;
                            
                            // Update request body for new provider
                            requestBody.model = model;
                            
                            // Handle provider-specific parameter compatibility
                            const isSwitchingToGemini = selectedProvider.type === 'gemini-free' || selectedProvider.type === 'gemini';
                            if (isSwitchingToGemini) {
                                // Gemini doesn't support frequency_penalty and presence_penalty
                                delete requestBody.frequency_penalty;
                                delete requestBody.presence_penalty;
                                console.log('🧹 Removed unsupported parameters for Gemini provider');
                            } else if (!requestBody.frequency_penalty && !requestBody.presence_penalty) {
                                // Switching back to a provider that supports penalties, add them back
                                requestBody.frequency_penalty = frequency_penalty;
                                requestBody.presence_penalty = presence_penalty;
                                console.log('✅ Restored penalty parameters for non-Gemini provider');
                            }
                            
                            if (lastRequestBody) {
                                lastRequestBody.provider = provider;
                                lastRequestBody.model = model;
                                if (lastRequestBody.request) {
                                    lastRequestBody.request.model = model;
                                    // Sync penalty parameters
                                    if (isSwitchingToGemini) {
                                        delete lastRequestBody.request.frequency_penalty;
                                        delete lastRequestBody.request.presence_penalty;
                                    } else {
                                        lastRequestBody.request.frequency_penalty = frequency_penalty;
                                        lastRequestBody.request.presence_penalty = presence_penalty;
                                    }
                                }
                            }
                            
                            console.log(`🚀 Switching to provider instance: ${selectedProvider.id} (type: ${provider}, model: ${model})`);
                            continue; // Retry with new provider
                        }
                        
                        // No more providers or models available
                        console.error(`🛑 Rate limit on all available providers and models (tried ${attemptedProviders.size} provider(s), ${attemptedModels.size} model(s))`);
                        console.log(`💡 Tip: Configure additional providers (OpenAI, Gemini, Anthropic) in your settings for automatic failover`);
                        console.log(`📊 Current providers configured: ${providerPool.map(p => p.type).join(', ')}`);
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
                    // STEP 12: Capture time to first token
                    if (!firstTokenReceived && requestStartTime) {
                        timeToFirstToken = Date.now() - requestStartTime;
                        firstTokenReceived = true;
                        console.log(`⏱️ Time to first token: ${timeToFirstToken}ms (provider: ${provider}, model: ${model})`);
                    }
                    
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
            }, sseWriter);
            
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
                timestamp: new Date().toISOString(),
                durationMs: requestStartTime ? (Date.now() - requestStartTime) : null
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
                llmApiCall: llmApiCall, // Include tracking data in event
                // STEP 12: Include performance metrics in transparency info
                performance: timeToFirstToken ? {
                    timeToFirstToken,
                    totalDuration: requestStartTime ? (Date.now() - requestStartTime) : null
                } : null
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
            
            // Check if we have computational tool calls that should execute even with substantive answers
            const hasComputationalToolCall = validToolCalls.some(tc => 
                tc.function.name === 'execute_javascript' || 
                tc.function.name === 'search_web' ||
                tc.function.name === 'scrape_web_content'
            );
            
            const shouldExecuteTools = hasToolCalls && 
                                      validToolCalls.length > 0 &&  // Use validToolCalls instead
                                      finishReason !== 'stop' &&  // LLM wants to continue
                                      (!hasSubstantiveAnswer || hasComputationalToolCall) && // Allow tools for computational tasks even with text
                                      !hasSuccessfulJsExecution && // No recent successful calculation
                                      !tooManyIterations;          // Safety limit
            
            console.log(`🔍 Tool execution decision: iteration=${iterationCount}, hasToolCalls=${hasToolCalls}, finishReason=${finishReason}, contentLength=${assistantMessage.content.length}, hasSubstantiveAnswer=${hasSubstantiveAnswer}, hasComputationalToolCall=${hasComputationalToolCall}, hasSuccessfulJsExecution=${hasSuccessfulJsExecution}, tooManyIterations=${tooManyIterations}, shouldExecuteTools=${shouldExecuteTools}`);
            
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
                    
                    // Update toolContext with current messages for tools that need conversation context
                    toolContext.messages = currentMessages;
                    
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
            console.log(`🔍 DEBUGGING: currentMessages before filtering for tool messages:`);
            console.log(`   - Total messages: ${currentMessages.length}`);
            console.log(`   - Message roles: ${currentMessages.map((m, i) => `${i}:${m.role}`).join(', ')}`);
            console.log(`   - Tool messages count: ${currentMessages.filter(m => m.role === 'tool').length}`);
            if (currentMessages.some(m => m.role === 'tool')) {
                console.log(`   - Tool message details:`, currentMessages.filter(m => m.role === 'tool').map(m => ({ name: m.name, tool_call_id: m.tool_call_id, hasRawResult: !!m.rawResult })));
            }
            
            const toolMessages = currentMessages.filter(m => m.role === 'tool');
            
            extractedContent = null; // Assignment to function-scoped variable
            const imageGenerations = []; // Collect image generation results (legacy UI confirmation flow)
            const generatedImages = []; // Collect auto-generated images for markdown injection
            
            // NEW: Track extraction metadata per tool (for inline transparency)
            const toolExtractionMetadata = {}; // Key: tool_call_id, Value: { summary, images, links, etc. }
            
            console.log(`🔍 POST-PROCESSING: toolMessages=${toolMessages.length}, assistantContent=${assistantMessage.content?.length || 0} chars`);
            console.log(`🔍 POST-PROCESSING CONDITIONS:`);
            console.log(`   - toolMessages.length > 0: ${toolMessages.length > 0} (length=${toolMessages.length})`);
            console.log(`   - assistantMessage.content exists: ${!!assistantMessage.content}`);
            console.log(`   - assistantMessage.content.length > 0: ${assistantMessage.content?.length > 0} (length=${assistantMessage.content?.length})`);
            console.log(`   - ALL CONDITIONS PASS: ${toolMessages.length > 0 && assistantMessage.content && assistantMessage.content.length > 0}`);
            
            if (toolMessages.length > 0 && assistantMessage.content && assistantMessage.content.length > 0) {
                console.log(`✅ Processing ${toolMessages.length} tool messages for extraction`);
                const allUrls = [];
                const allImages = []; // ALL images for "All Images" section
                const allVideos = [];
                const allMedia = [];
                
                // Process each tool result to extract content
                console.log(`📋 Processing ${toolMessages.length} tool messages`);
                for (const toolMsg of toolMessages) {
                    console.log(`   Tool: ${toolMsg.name}, has rawResult: ${!!toolMsg.rawResult}, has content: ${!!toolMsg.content}`);
                    // Use rawResult if available (contains unformatted JSON), otherwise fall back to content
                    const contentToProcess = toolMsg.rawResult || toolMsg.content;
                    if (!contentToProcess) {
                        console.log(`   ⚠️ Skipping ${toolMsg.name} - no content`);
                        continue;
                    }
                    
                    try {
                        // Try to parse as JSON first (for structured tool results)
                        const parsed = JSON.parse(contentToProcess);
                        console.log(`   ✅ Parsed JSON for ${toolMsg.name}`);
                        
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
                                    if (result.page_content.images && result.page_content.images.length > 0) {
                                        console.log(`     📸 Sample images:`, result.page_content.images.slice(0, 2).map(img => ({ src: img.src?.substring(0, 50), alt: img.alt })));
                                    }
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
                        
                        // Extract from scrape_web_content results
                        if (toolMsg.name === 'scrape_web_content') {
                            // Add the scraped URL as a source
                            if (parsed.url) {
                                allUrls.push({
                                    title: parsed.url.split('/')[2] || parsed.url, // Use domain as title
                                    url: parsed.url,
                                    snippet: parsed.content?.substring(0, 150),
                                    source: parsed.url,
                                    isSearchResult: false
                                });
                            }
                            
                            // Extract links from scraped content
                            if (parsed.links) {
                                for (const link of parsed.links) {
                                    allUrls.push({
                                        title: link.text || link.caption || link.href,
                                        url: link.href,
                                        snippet: link.caption || null,
                                        source: parsed.url,
                                        isSearchResult: false
                                    });
                                }
                            }
                            
                            // Extract ALL images (allImages contains everything, prioritization happens later)
                            if (parsed.allImages) {
                                for (const img of parsed.allImages) {
                                    allImages.push({
                                        src: img.src,
                                        alt: img.alt || img.title || 'Image',
                                        source: parsed.url,
                                        // Preserve relevance and placement scores for smart sorting later
                                        relevance: img.relevance,
                                        placementScore: img.placementScore
                                    });
                                }
                            } else if (parsed.images) {
                                // Fallback to images field if allImages not present (backwards compatibility)
                                for (const img of parsed.images) {
                                    allImages.push({
                                        src: img.src,
                                        alt: img.alt || img.title || 'Image',
                                        source: parsed.url,
                                        relevance: img.relevance,
                                        placementScore: img.placementScore
                                    });
                                }
                            }
                            
                            // Extract YouTube videos
                            if (parsed.youtube) {
                                for (const video of parsed.youtube) {
                                    allVideos.push({
                                        src: video.href || video.src,
                                        title: video.text || video.title || 'YouTube Video',
                                        source: parsed.url
                                    });
                                }
                            }
                            
                            // Extract other media
                            if (parsed.media) {
                                for (const media of parsed.media) {
                                    allMedia.push({
                                        src: media.href || media.src,
                                        type: media.type || 'unknown',
                                        source: parsed.url
                                    });
                                }
                            }
                        }
                        
                        // Extract from search_youtube results
                        if (toolMsg.name === 'search_youtube') {
                            console.log(`📺 Processing search_youtube tool result`);
                            if (parsed.videos && Array.isArray(parsed.videos)) {
                                for (const video of parsed.videos) {
                                    allVideos.push({
                                        src: video.url,
                                        title: video.title || 'YouTube Video',
                                        source: 'youtube_search'
                                    });
                                }
                                console.log(`✅ Extracted ${parsed.videos.length} YouTube videos from search results`);
                            }
                        }
                        
                        // Extract from generate_image results
                        if (toolMsg.name === 'generate_image') {
                            console.log(`🎨 Processing generate_image tool result`);
                            console.log(`   Tool result keys: ${Object.keys(parsed).join(', ')}`);
                            console.log(`   parsed.generated: ${parsed.generated}, parsed.url: ${parsed.url ? 'YES' : 'NO'}, parsed.base64: ${parsed.base64 ? 'YES' : 'NO'}`);
                            
                            // Check if image was actually generated (new behavior)
                            if (parsed.generated && (parsed.url || parsed.base64)) {
                                console.log(`✅ Image was generated directly by tool - adding to imageGenerations as complete`);
                                
                                // Determine the image URL (prefer base64 data URL over external URL)
                                let imageUrl = parsed.url;
                                if (parsed.base64 && !parsed.base64.startsWith('data:')) {
                                    imageUrl = `data:image/png;base64,${parsed.base64}`;
                                } else if (parsed.base64) {
                                    imageUrl = parsed.base64;
                                }
                                
                                // Add to imageGenerations with status 'complete' so it shows in GeneratedImageBlock
                                const imgGenId = toolMsg.tool_call_id || `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                imageGenerations.push({
                                    id: imgGenId,
                                    provider: parsed.provider || 'unknown',
                                    model: parsed.model || 'unknown',
                                    modelKey: parsed.modelKey || parsed.model,
                                    cost: parsed.cost || 0,
                                    prompt: parsed.prompt || '',
                                    size: parsed.size || '1024x1024',
                                    style: parsed.style || 'natural',
                                    qualityTier: parsed.qualityTier || 'standard',
                                    status: 'complete',
                                    imageUrl: imageUrl,
                                    ready: true,
                                    llmApiCall: parsed.llmApiCall // Include llmApiCall for transparency tracking
                                });
                                
                                // Add llmApiCall to the tracking array for LLM transparency dialog
                                if (parsed.llmApiCall) {
                                    if (!llmApiCalls) {
                                        llmApiCalls = [];
                                    }
                                    llmApiCalls.push(parsed.llmApiCall);
                                    console.log(`   Added image generation llmApiCall to tracking (total: ${llmApiCalls.length})`);
                                }
                                
                                console.log(`   Added to imageGenerations array as complete (total: ${imageGenerations.length})`);
                            } else {
                                // Old behavior: image not yet generated, needs UI confirmation
                                console.log(`⚠️ Image not generated - adding to imageGenerations for UI button`);
                                imageGenerations.push({
                                    id: toolMsg.tool_call_id || `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                    provider: parsed.provider || 'unknown',
                                    model: parsed.model || parsed.modelKey || 'unknown',
                                    modelKey: parsed.modelKey || parsed.model,
                                    cost: parsed.cost || 0,
                                    prompt: parsed.prompt || '',
                                    size: parsed.size || '1024x1024',
                                    style: parsed.style || 'natural',
                                    qualityTier: parsed.qualityTier || 'standard',
                                    constraints: parsed.constraints || {},
                                    availableAlternatives: parsed.availableAlternatives || [],
                                    status: 'pending',
                                    ready: parsed.ready || false,
                                    message: parsed.message || ''
                                });
                            }
                        }
                        
                        // Extract from get_youtube_transcript results
                        if (toolMsg.name === 'get_youtube_transcript') {
                            console.log(`🎬 Processing get_youtube_transcript tool result`);
                            // Initialize transcripts array if not exists
                            if (!extractedContent) {
                                extractedContent = {};
                            }
                            if (!extractedContent.transcripts) {
                                extractedContent.transcripts = [];
                            }
                            
                            // Add full transcript data for UI
                            extractedContent.transcripts.push({
                                videoId: parsed.videoId || parsed.video_id,
                                videoUrl: parsed.videoUrl || parsed.video_url || (parsed.videoId ? `https://youtube.com/watch?v=${parsed.videoId}` : null),
                                title: parsed.title || 'YouTube Video',
                                fullTranscript: parsed.transcript || parsed.text || '',
                                segments: parsed.segments || [],
                                duration: parsed.duration || 0,
                                thumbnail: parsed.thumbnail || (parsed.videoId ? `https://img.youtube.com/vi/${parsed.videoId}/maxresdefault.jpg` : null),
                                chapters: parsed.chapters || [],
                                language: parsed.language || 'en',
                                isAutoGenerated: parsed.isAutoGenerated || parsed.is_auto_generated || false
                            });
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
                
                // Smart image selection: combine placement score and relevance score
                const prioritizedImages = uniqueImages
                    .sort((a, b) => {
                        // Combine placement score (0.3-1.0) and relevance score (0-1.0)
                        // Weight placement slightly higher for better hero image selection
                        const scoreA = (a.placementScore || 0.5) * 0.6 + (a.relevance || 0.5) * 0.4;
                        const scoreB = (b.placementScore || 0.5) * 0.6 + (b.relevance || 0.5) * 0.4;
                        return scoreB - scoreA;
                    })
                    .slice(0, 3)
                    .map(img => ({
                        ...img,
                        // Add placement context for LLM
                        llmContext: {
                            placement: img.placement || 'unknown',
                            suggestedPosition: (img.placement === 'hero' || img.placement === 'above-fold') ? 'top' : 'inline'
                        }
                    }));
                
                // Calculate image placement distribution for metadata
                const imagePlacementStats = {};
                uniqueImages.forEach(img => {
                    const placement = img.placement || 'unknown';
                    imagePlacementStats[placement] = (imagePlacementStats[placement] || 0) + 1;
                });
                
                // Build extraction metadata for transparency
                const extractionMetadata = {
                    summary: {
                        totalImages: allImages.length,
                        uniqueImages: uniqueImages.length,
                        prioritizedImages: prioritizedImages.length,
                        totalLinks: allUrls.length,
                        uniqueLinks: uniqueUrls.length,
                        prioritizedLinks: prioritizedLinks.length,
                        youtubeVideos: youtubeVideos.length,
                        otherVideos: otherVideos.length
                    },
                    imagePlacement: imagePlacementStats,
                    topImages: prioritizedImages.map((img, idx) => ({
                        rank: idx + 1,
                        src: img.src,
                        placement: img.placement || 'unknown',
                        placementScore: img.placementScore || 0.5,
                        relevance: img.relevance || 0.5,
                        combinedScore: ((img.placementScore || 0.5) * 0.6 + (img.relevance || 0.5) * 0.4).toFixed(3),
                        selectionReason: `Placement: ${img.placement} (${img.placementScore}), Relevance: ${img.relevance}`
                    })),
                    linkCategories: {
                        searchResults: searchResultLinks.length,
                        scrapedLinks: scrapedLinks.length,
                        prioritizedFromScraped: Math.min(5, scrapedLinks.length)
                    }
                };
                
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
                    images: uniqueImages.length > 0 ? uniqueImages : null,
                    
                    // Phase 5: Transparency metadata for debugging and user visibility
                    metadata: extractionMetadata
                };
                
                console.log(`✅ Extracted content: ${allLinks.length} total links (${prioritizedLinks.length} prioritized), ${uniqueImages.length} images (${prioritizedImages.length} prioritized), ${youtubeVideos.length} YouTube videos, ${otherVideos.length} other videos, ${uniqueMedia.length} media items`);
                console.log(`📊 Metadata added to extractedContent:`, JSON.stringify(extractionMetadata, null, 2));
                console.log(`📋 EXTRACTION SUMMARY:`);
                console.log(`   - allImages array length: ${allImages.length}`);
                console.log(`   - uniqueImages length: ${uniqueImages.length}`);
                console.log(`   - allVideos array length: ${allVideos.length}`);
                console.log(`   - allUrls array length: ${allUrls.length}`);
                console.log(`   - allMedia array length: ${allMedia.length}`);
                if (uniqueImages.length > 0) {
                    console.log(`   - Sample images:`, uniqueImages.slice(0, 3).map(img => ({ src: img.src?.substring(0, 60), source: img.source })));
                }
            }
            
            // Inject generated images as markdown into assistant's response
            // Note: Generated images are now handled via imageGenerations array
            // and displayed using GeneratedImageBlock component, not as markdown injection
            if (generatedImages.length > 0) {
                console.log(`🖼️ Skipping markdown injection for ${generatedImages.length} generated image(s) - using GeneratedImageBlock instead`);
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
            
            // Ensure content is a string (handle Gemini and other providers that might return objects)
            if (typeof assistantMessage.content !== 'string') {
                console.warn(`⚠️ assistantMessage.content is not a string (type: ${typeof assistantMessage.content}), converting...`);
                if (typeof assistantMessage.content === 'object') {
                    // Handle object format
                    assistantMessage.content = assistantMessage.content.content || JSON.stringify(assistantMessage.content);
                } else {
                    assistantMessage.content = String(assistantMessage.content || '');
                }
                console.log(`   Converted to: ${assistantMessage.content.substring(0, 100)}...`);
            }
            
            console.log(`📤 Preparing final response: ${assistantMessage.content.length} chars`);
            console.log(`📤 Preview: ${assistantMessage.content.substring(0, 100)}...`);
            
            // Store content for later - assessment will run only once at the very end
            let finalContent = assistantMessage.content;
            let evaluationResults = []; // Track all evaluation attempts
            
            // Skip assessment for now - we'll do it once at the end after all iterations complete
            // This ensures we only assess the final response, not intermediate iterations
            
            // Placeholder while loop removed - assessment moved to after main loop
            const MAX_EVALUATION_RETRIES = 4; // Increased from 2 to 4 for better completion rate
            let evaluationRetries = 0;
            
            if (false) { // Disabled - moved to after main loop
                console.log(`🔍 Self-evaluation attempt ${evaluationRetries + 1}/${MAX_EVALUATION_RETRIES + 1}`);
                
                // SKIP ASSESSMENT if successful tool calls exist (especially image generation)
                // The assessor doesn't see tool results, so it incorrectly marks short responses as incomplete
                // when the actual content is in the tool result (e.g., generated image)
                // Use toolMessages (filter from currentMessages) instead of toolResults (out of scope)
                const toolMessagesForCheck = currentMessages.filter(m => m.role === 'tool');
                const hasSuccessfulTools = toolMessagesForCheck.length > 0 && toolMessagesForCheck.some(tm => {
                    try {
                        const contentToCheck = tm.rawResult || tm.content;
                        if (!contentToCheck) return false;
                        const result = JSON.parse(contentToCheck);
                        // Check for successful tool execution markers
                        return result.success === true || 
                               result.generated === true || // Image generation
                               result.url || // Has URL result
                               result.imageUrl || // Image URL
                               result.transcript || // Transcription result
                               result.content || // Scraped content
                               result.results; // Search results
                    } catch {
                        return false;
                    }
                });
                
                if (hasSuccessfulTools) {
                    console.log(`✅ Skipping assessment - successful tool results exist`);
                    break; // Skip assessment and return response as-is
                }
                
                // Evaluate current response
                const evaluation = await evaluateResponseComprehensiveness(
                    currentMessages.slice(0, -1), // All messages except the final assistant message we're evaluating
                    finalContent,
                    model, // Use same model for evaluation
                    apiKey,
                    provider,
                    selectedProvider // Pass provider config for model filtering
                );
                
                // Track evaluation call in LLM transparency
                console.log(`🔍 Checking evaluation tracking:`, {
                    hasUsage: !!evaluation.usage,
                    hasRawResponse: !!evaluation.rawResponse,
                    evaluationKeys: Object.keys(evaluation)
                });
                
                if (evaluation.usage || evaluation.rawResponse) {
                    const evalLlmCall = {
                        phase: 'assessment', // Changed from 'self_evaluation' to match UI
                        type: 'assessment',
                        iteration: evaluationRetries + 1,
                        model: model,
                        provider: provider,
                        request: {
                            messages: evaluation.messages || [], // Include actual messages sent for transparency
                            purpose: 'evaluate_response_comprehensiveness',
                            evaluation_attempt: evaluationRetries + 1,
                            temperature: 0.1,
                            max_tokens: 200
                        },
                        response: {
                            usage: evaluation.usage,
                            comprehensive: evaluation.isComprehensive,
                            reason: evaluation.reason,
                            text: evaluation.rawResponse?.text || evaluation.rawResponse?.content || ''
                        },
                        httpHeaders: evaluation.httpHeaders || {},
                        httpStatus: evaluation.httpStatus || 200,
                        timestamp: new Date().toISOString(),
                        cost: evaluation.usage ? calculateCostSafe(model, evaluation.usage.prompt_tokens || 0, evaluation.usage.completion_tokens || 0, selectedProvider) : 0,
                        durationMs: evaluation.rawResponse?.durationMs || 0
                    };
                    allLlmApiCalls.push(evalLlmCall);
                    console.log(`📊 Tracked self-evaluation LLM call #${evaluationRetries + 1}`, {
                        type: evalLlmCall.type,
                        phase: evalLlmCall.phase,
                        comprehensive: evaluation.isComprehensive
                    });
                } else {
                    // Log failed assessment (no usage data - likely Gemini empty response)
                    console.warn(`⚠️ Assessment attempt ${evaluationRetries + 1} returned no usage data (provider: ${provider}, model: ${model})`);
                    
                    // Log the failed assessment to Google Sheets for tracking
                    // Note: Using 'assessment' type with error details (consolidated with successful assessments)
                    try {
                        await logToBothSheets(driveAccessToken, {
                            userEmail,
                            provider: provider || 'unknown',
                            model: model || 'unknown',
                            promptTokens: 0,
                            completionTokens: 0,
                            totalTokens: 0,
                            cost: 0,
                            duration: 0,
                            type: 'assessment', // Consolidated: same type as successful assessments
                            memoryLimitMB,
                            memoryUsedMB,
                            requestId,
                            errorCode: 'NO_USAGE_DATA',
                            errorMessage: `Assessment returned no usage data - likely empty response from ${provider}`
                        });
                        console.log(`✅ Logged failed assessment attempt`);
                    } catch (logError) {
                        console.error('⚠️ Failed to log failed assessment:', logError.message);
                    }
                }
                
                evaluationResults.push({
                    attempt: evaluationRetries + 1,
                    comprehensive: evaluation.isComprehensive,
                    reason: evaluation.reason
                });
                
                // If evaluation should be skipped (e.g., auth error), exit evaluation loop but proceed with response
                if (evaluation.skipEvaluation) {
                    console.log(`⚠️ Evaluation skipped due to API error - proceeding with current response`);
                    // Break out of evaluation loop - we'll send the response as-is
                    break;
                }
                
                if (evaluation.isComprehensive) {
                    console.log(`✅ Response deemed comprehensive: ${evaluation.reason}`);
                    break;
                }
                
                console.log(`⚠️ Response not comprehensive: ${evaluation.reason}`);
                
                // Don't retry if we've hit max retries
                if (evaluationRetries >= MAX_EVALUATION_RETRIES) {
                    console.log(`⚠️ Max evaluation retries reached - proceeding with current response`);
                    break;
                }
                
                // Retry: Append encouragement and trigger continuation
                console.log(`🔄 Retrying with encouragement (attempt ${evaluationRetries + 1}/${MAX_EVALUATION_RETRIES})`);
                
                // Build retry request with encouragement
                const retryMessages = [...currentMessages];
                
                // Check why it's incomplete and tailor the retry message
                const hasIncompleteCode = evaluation.reason?.includes('incomplete') && 
                    (finalContent.includes('function') || finalContent.includes('let') || finalContent.includes('const'));
                
                let retryPrompt = 'Please provide a more comprehensive and complete answer. Think deeply about all aspects of the question and ensure you address everything thoroughly.';
                
                if (hasIncompleteCode) {
                    retryPrompt = 'Your previous response contained incomplete code that was cut off mid-statement. Please provide the COMPLETE solution by calling the execute_javascript tool with FULL, WORKING code. Do NOT show partial code snippets in your response - just call the tool with complete code and explain the results.';
                }
                
                // Add encouragement message to trigger more output
                retryMessages.push({
                    role: 'user',
                    content: retryPrompt
                });
                
                // Make retry request
                try {
                    const retryRequestBody = {
                        model: model,
                        messages: retryMessages,
                        temperature: requestBody.temperature || 0.7,
                        max_tokens: requestBody.max_tokens || undefined,
                        stream: false // Non-streaming for simpler retry
                    };
                    
                    console.log(`🔄 Sending retry request with ${retryMessages.length} messages`);
                    
                    const { llmResponsesWithTools } = require('../llm_tools_adapter');
                    
                    // Convert messages to input format expected by llmResponsesWithTools
                    const retryInput = retryMessages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    }));
                    
                    const retryResponse = await llmResponsesWithTools({
                        model: model,
                        input: retryInput,
                        tools: [],
                        options: {
                            apiKey: apiKey,
                            temperature: requestBody.temperature || 0.7,
                            max_tokens: requestBody.max_tokens || 4096,
                            enforceJson: false,
                            timeoutMs: 30000,
                            providerConfig: selectedProvider // Pass provider config for model filtering
                        }
                    });
                    
                    // Extract retry content
                    let retryContent = retryResponse.text || '';
                    if (retryResponse.output && Array.isArray(retryResponse.output)) {
                        const textOutput = retryResponse.output.find(item => item.type === 'text');
                        if (textOutput) retryContent = textOutput.text || '';
                    }
                    
                    // Track retry call in LLM transparency
                    if (retryResponse.rawResponse) {
                        const retryLlmCall = {
                            type: 'comprehensive_retry',
                            iteration: evaluationRetries + 1,
                            model: model,
                            provider: provider,
                            request: {
                                purpose: 'retry_for_comprehensiveness',
                                retry_attempt: evaluationRetries + 1,
                                messageCount: retryMessages.length
                            },
                            response: {
                                usage: retryResponse.rawResponse.usage
                            },
                            httpHeaders: retryResponse.httpHeaders || {},
                            httpStatus: retryResponse.httpStatus
                        };
                        allLlmApiCalls.push(retryLlmCall);
                        console.log(`📊 Tracked retry LLM call #${evaluationRetries + 1}`);
                    }
                    
                    if (retryContent && retryContent.trim().length > 0) {
                        // Update final content with retry response
                        finalContent = retryContent;
                        // Update assistant message in currentMessages
                        currentMessages[currentMessages.length - 1].content = retryContent;
                        console.log(`✅ Retry produced ${retryContent.length} chars`);
                    } else {
                        console.log(`⚠️ Retry produced empty response - keeping original`);
                        break;
                    }
                    
                } catch (retryError) {
                    console.error(`❌ Retry failed:`, retryError.message);
                    break; // Give up on retry errors
                }
                
                evaluationRetries++;
            } // End of disabled assessment while loop
            
            // Update final assistant message content
            assistantMessage.content = finalContent;
            currentMessages[currentMessages.length - 1].content = finalContent;
            
            console.log(`📤 Sending final response after ${evaluationResults.length} evaluations: ${finalContent.length} chars`);
            
            // FILTER OUTPUT if guardrails enabled
            if (guardrailValidator && finalContent && finalContent.trim().length > 0) {
                console.log(`🛡️ Filtering output (${finalContent.length} chars)...`);
                
                try {
                    const outputValidation = await guardrailValidator.validateOutput(finalContent);
                    
                    // Track guardrail API call for cost transparency
                    const guardrailApiCall = {
                        type: 'guardrail_output',
                        model: outputValidation.tracking.model,
                        provider: outputValidation.tracking.provider,
                        request: {
                            messages: [{ role: 'assistant', content: '[FILTERED FOR GUARDRAIL CHECK]' }]
                        },
                        response: {
                            usage: {
                                prompt_tokens: outputValidation.tracking.promptTokens || 0,
                                completion_tokens: outputValidation.tracking.completionTokens || 0,
                                total_tokens: (outputValidation.tracking.promptTokens || 0) + 
                                             (outputValidation.tracking.completionTokens || 0)
                            }
                        },
                        totalTime: outputValidation.tracking.duration,
                        timestamp: new Date().toISOString()
                    };
                    
                    // NOTE: Guardrail API calls are logged DIRECTLY to sheets below
                    // Do NOT add to allLlmApiCalls to avoid duplicate logging
                    
                    if (!outputValidation.safe) {
                        console.warn('🛡️ Output REJECTED:', outputValidation.reason);
                        
                        // Send error event with cost tracking
                        sseWriter.writeEvent('error', {
                            error: 'The generated response was flagged by our content moderation system and cannot be displayed.',
                            reason: outputValidation.reason,
                            violations: outputValidation.violations,
                            type: 'output_moderation_error',
                            code: 'OUTPUT_FILTERED',
                            statusCode: 500,
                            llmApiCalls: allLlmApiCalls // Include all costs (main LLM + guardrails)
                        });
                        responseStream.end();
                        return;
                    }
                    
                    console.log('🛡️ Output validation PASSED');
                    
                    // Log guardrail output validation to Google Sheets
                    try {
                        const promptTokens = outputValidation.tracking.promptTokens || 0;
                        const completionTokens = outputValidation.tracking.completionTokens || 0;
                        const totalTokens = promptTokens + completionTokens;
                        const cost = calculateCostSafe(
                            outputValidation.tracking.model,
                            promptTokens,
                            completionTokens,
                            outputValidation.tracking.providerObj || null // Pass provider object if available
                        );
                        
                        await logToBothSheets(driveAccessToken, {
                            userEmail,
                            provider: outputValidation.tracking.provider,
                            model: outputValidation.tracking.model,
                            promptTokens,
                            completionTokens,
                            totalTokens,
                            cost,
                            duration: outputValidation.tracking.duration || 0,
                            type: 'guardrail_output',
                            memoryLimitMB,
                            memoryUsedMB,
                            requestId,
                            error: null
                        });
                        console.log(`✅ Logged guardrail output validation: ${outputValidation.tracking.model}, ${totalTokens} tokens, $${cost.toFixed(6)}`);
                    } catch (logError) {
                        console.error('⚠️ Failed to log guardrail output to Google Sheets:', logError.message);
                    }
                    
                } catch (error) {
                    console.error('🛡️ Output validation error:', error.message);
                    // Fail safe: if guardrail check fails, block the output
                    
                    // Track error in guardrail call
                    const guardrailErrorCall = {
                        type: 'guardrail_output',
                        model: 'error',
                        provider: 'guardrail',
                        request: {},
                        response: {
                            usage: {
                                prompt_tokens: 0,
                                completion_tokens: 0,
                                total_tokens: 0
                            },
                            error: error.message
                        },
                        totalTime: 0,
                        timestamp: new Date().toISOString()
                    };
                    // NOTE: Error will be logged separately, no need to add to allLlmApiCalls
                    
                    sseWriter.writeEvent('error', {
                        error: 'Content moderation system error. Response blocked for safety.',
                        reason: error.message,
                        type: 'guardrail_system_error',
                        code: 'GUARDRAIL_ERROR',
                        statusCode: 500,
                        llmApiCalls: allLlmApiCalls
                    });
                    responseStream.end();
                    return;
                }
            }
            
            // Send message_complete with content and extracted content
            const messageCompleteData = {
                role: 'assistant',
                content: finalContent,
                llmApiCalls: allLlmApiCalls, // Include all accumulated token usage data (including evaluation calls)
                evaluations: evaluationResults.length > 0 ? evaluationResults : undefined // Include evaluation attempts
                // Note: NOT including tool_calls - they're already sent via tool_call_* events
            };
            
            // Add tool results to the message for transparency (embedded in assistant message)
            const toolResultMessages = currentMessages.filter(m => m.role === 'tool');
            if (toolResultMessages.length > 0) {
                console.log(`📦 Adding ${toolResultMessages.length} tool results with transparency data`);
                messageCompleteData.toolResults = toolResultMessages.map(tm => {
                    const toolResult = {
                        role: 'tool',
                        content: tm.rawResult || tm.content, // Use full result for transparency
                        tool_call_id: tm.tool_call_id,
                        name: tm.name,
                        llmApiCalls: tm.llmApiCalls || [], // Include any nested LLM calls from tools
                        rawResponse: tm.rawResult || tm.content // NEW: Full raw response for transparency
                    };
                    
                    console.log(`  📄 Tool ${tm.name}: rawResponse length = ${toolResult.rawResponse?.length || 0}`);
                    
                    // NEW: Add per-tool extraction metadata for transparency
                    if (toolExtractionMetadata && toolExtractionMetadata[tm.tool_call_id]) {
                        toolResult.extractionMetadata = toolExtractionMetadata[tm.tool_call_id];
                        console.log(`  📊 Added extraction metadata for ${tm.name}`);
                    }
                    
                    return toolResult;
                });
            }
            
            // Add extracted content if available (sources, images, videos, media)
            if (extractedContent) {
                messageCompleteData.extractedContent = extractedContent;
                console.log(`📦 Adding extractedContent to response. Has metadata: ${!!extractedContent.metadata}`);
                if (extractedContent.metadata) {
                    console.log(`📊 Metadata summary:`, {
                        totalImages: extractedContent.metadata.summary?.totalImages,
                        uniqueImages: extractedContent.metadata.summary?.uniqueImages,
                        prioritizedImages: extractedContent.metadata.summary?.prioritizedImages
                    });
                }
            } else {
                console.log(`⚠️ No extractedContent to include in response`);
            }
            
            // Add image generations if available
            if (imageGenerations.length > 0) {
                messageCompleteData.imageGenerations = imageGenerations;
                console.log(`🎨 Including ${imageGenerations.length} image generation(s) in response`);
            }
            
            console.log(`📊 Sending final message_complete with ${allLlmApiCalls.length} llmApiCalls (including ${evaluationResults.length} evaluations)`);
            if (allLlmApiCalls.length > 0) {
                console.log(`📊 First call tokens: ${JSON.stringify(allLlmApiCalls[0].response?.usage)}`);
            }
            
            sseWriter.writeEvent('message_complete', messageCompleteData);
            
            // TODOS AUTO-PROGRESSION: Check if we should continue with next todo
            // Simplified assessor: If we completed successfully (not an error), advance todos
            const hasError = !assistantMessage.content || assistantMessage.content.includes('I apologize');
            if (!hasError && todosManager.hasPending() && todoAutoIterations < MAX_TODO_AUTO_ITERATIONS) {
                const state = todosManager.completeCurrent();
                console.log(`✅ TodosManager: Completed current todo, ${state.remaining} remaining`);
                
                if (state.current && state.remaining > 0) {
                    todoAutoIterations++;
                    
                    // Emit resubmitting event
                    sseWriter.writeEvent('todos_resubmitting', {
                        next: state.current.description,
                        state: state,
                        iteration: todoAutoIterations,
                        maxIterations: MAX_TODO_AUTO_ITERATIONS
                    });
                    
                    console.log(`🔄 Auto-resubmitting for next todo (${todoAutoIterations}/${MAX_TODO_AUTO_ITERATIONS}): "${state.current.description}"`);
                    
                    // Add a small delay to ensure UI receives the event
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Append synthetic user message for next todo
                    const syntheticMessage = {
                        role: 'user',
                        content: `Continue with the next step: ${state.current.description}`
                    };
                    currentMessages.push(syntheticMessage);
                    
                    console.log(`📝 Added synthetic user message to continue with next todo`);
                    console.log(`🔄 Continuing loop for next todo (iteration ${iterationCount + 1})`);
                    
                    // Continue the loop - don't break!
                    continue;
                }
            } else if (!hasError && todosManager.hasPending() && todoAutoIterations >= MAX_TODO_AUTO_ITERATIONS) {
                // Hit the safety limit
                console.log(`⚠️ Todo auto-iteration limit reached (${MAX_TODO_AUTO_ITERATIONS}). Remaining todos: ${todosManager.getState().remaining}`);
                sseWriter.writeEvent('todos_limit_reached', {
                    message: `Auto-progression limit reached (${MAX_TODO_AUTO_ITERATIONS} iterations). Please continue manually.`,
                    remaining: todosManager.getState().remaining,
                    current: todosManager.getCurrent()
                });
            }
            
            console.log(`✅ Completing request after ${iterationCount} iterations (${todoAutoIterations} todo auto-iterations)`);
            
            // SELF-EVALUATION: Check if final response is comprehensive (runs ONCE at the end)
            // If not comprehensive, retry with encouragement message
            // Filter out tool messages - assessor only sees user and assistant messages
            const lastAssistantMessage = currentMessages[currentMessages.length - 1];
            
            let evaluation = null;
            if (lastAssistantMessage && lastAssistantMessage.role === 'assistant' && lastAssistantMessage.content) {
                // SKIP ASSESSMENT if successful tool calls exist (especially image generation)
                // The assessor doesn't see tool results, so it incorrectly marks short responses as incomplete
                // when the actual content is in the tool result (e.g., generated image)
                // Use toolMessages (already in scope) instead of toolResults (out of scope)
                const toolMessagesForCheck = currentMessages.filter(m => m.role === 'tool');
                const hasSuccessfulTools = toolMessagesForCheck.length > 0 && toolMessagesForCheck.some(tm => {
                    try {
                        const contentToCheck = tm.rawResult || tm.content;
                        if (!contentToCheck) return false;
                        const result = JSON.parse(contentToCheck);
                        // Check for successful tool execution markers
                        return result.success === true || 
                               result.generated === true || // Image generation
                               result.url || // Has URL result
                               result.imageUrl || // Image URL
                               result.transcript || // Transcription result
                               result.content || // Scraped content
                               result.results; // Search results
                    } catch {
                        return false;
                    }
                });
                
                if (hasSuccessfulTools) {
                    console.log(`✅ Skipping final assessment - successful tool results exist (${toolMessagesForCheck.length} tool(s))`);
                    // Skip assessment and return response as-is
                } else {
                    console.log(`🔍 Running comprehensive assessment on final response`);
                    
                    // Filter messages to only include user and assistant (no tool or tool_call messages)
                    const messagesForEvaluation = currentMessages
                        .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.tool_calls))
                        .slice(0, -1); // All messages except the final assistant message we're evaluating
                    
                    console.log(`📋 Evaluating with ${messagesForEvaluation.length} messages (filtered from ${currentMessages.length} total, excluding tool messages)`);
                    
                    evaluation = await evaluateResponseComprehensiveness(
                        messagesForEvaluation,
                        lastAssistantMessage.content,
                        model, // Use same model for evaluation
                        apiKey,
                        provider,
                        selectedProvider // Pass provider config for model filtering
                    );
                    
                    // Track evaluation call in LLM transparency
                    if (evaluation && (evaluation.usage || evaluation.rawResponse)) {
                        const evalLlmCall = {
                            phase: 'assessment',
                            type: 'assessment',
                            iteration: 1,
                            model: model,
                            provider: provider,
                            request: {
                                messages: evaluation.messages || [],
                                purpose: 'evaluate_final_response_comprehensiveness',
                                temperature: 0.1,
                                max_tokens: 200
                            },
                            response: {
                                usage: evaluation.usage,
                                comprehensive: evaluation.isComprehensive,
                                reason: evaluation.reason,
                                text: evaluation.rawResponse?.text || evaluation.rawResponse?.content || ''
                            },
                        httpHeaders: evaluation.httpHeaders || {},
                        httpStatus: evaluation.httpStatus || 200,
                        timestamp: new Date().toISOString(),
                        cost: evaluation.usage ? calculateCostSafe(model, evaluation.usage.prompt_tokens || 0, evaluation.usage.completion_tokens || 0, selectedProvider) : 0,
                        durationMs: evaluation.rawResponse?.durationMs || 0
                    };
                    allLlmApiCalls.push(evalLlmCall);
                    console.log(`📊 Tracked final assessment LLM call`, {
                        type: evalLlmCall.type,
                        phase: evalLlmCall.phase,
                        comprehensive: evaluation.isComprehensive
                    });
                } else {
                    console.warn(`⚠️ Final assessment returned no usage data (provider: ${provider}, model: ${model})`);
                }
                
                if (evaluation && evaluation.isComprehensive) {
                    console.log(`✅ Final response deemed comprehensive: ${evaluation.reason}`);
                } else if (evaluation) {
                    console.log(`⚠️ Final response not comprehensive: ${evaluation.reason}`);
                    
                    // Only retry if OBVIOUSLY incomplete (too short, syntax errors, etc.)
                    const isObviouslyBroken = 
                        evaluation.reason?.includes('obviously incomplete') ||
                        evaluation.reason?.includes('ends abruptly') ||
                        evaluation.reason?.includes('unclosed delimiters');
                    
                    if (isObviouslyBroken && !evaluation.skipEvaluation && iterationCount < maxIterations) {
                        console.log(`🔄 Response has obvious errors - retrying with encouragement`);
                        
                        currentMessages.push({
                            role: 'user',
                            content: 'Your previous response was incomplete or cut off. Please provide the COMPLETE answer.'
                        });
                        
                        continue;
                    } else {
                        console.log(`ℹ️ Response not perfect but acceptable - completing anyway`);
                    }
                } else if (evaluation && evaluation.skipEvaluation) {
                    console.log(`⚠️ Evaluation skipped due to API error - proceeding with current response`);
                } else {
                    console.log(`⚠️ Max iterations reached - proceeding with current response despite incomplete assessment`);
                }
                } // End of assessment else block
            } // End of lastAssistantMessage check
            
            // Add memory tracking snapshot before completing
            memoryTracker.snapshot('chat-complete');
            const finalMemoryMetadata = memoryTracker.getResponseMetadata();
            
            // Calculate cost for this request
            const { calculateCost } = require('../services/google-sheets-logger');
            let finalRequestCost = 0;
            for (const apiCall of allLlmApiCalls) {
                const usage = apiCall.response?.usage;
                if (usage && apiCall.model) {
                    const cost = calculateCostSafe(
                        apiCall.model,
                        usage.prompt_tokens || 0,
                        usage.completion_tokens || 0,
                        selectedProvider
                    );
                    finalRequestCost += cost;
                }
            }
            
            // Log all LLM API calls to Google Sheets
            console.log(`📊 Logging ${allLlmApiCalls.length} LLM API calls to Google Sheets...`);
            for (const apiCall of allLlmApiCalls) {
                const usage = apiCall.response?.usage;
                if (usage && apiCall.model) {
                    const cost = calculateCostSafe(
                        apiCall.model,
                        usage.prompt_tokens || 0,
                        usage.completion_tokens || 0,
                        selectedProvider
                    );
                    
                    try {
                        await logToBothSheets(driveAccessToken, {
                            userEmail,
                            provider: apiCall.provider || 'unknown',
                            model: apiCall.model,
                            promptTokens: usage.prompt_tokens || 0,
                            completionTokens: usage.completion_tokens || 0,
                            totalTokens: usage.total_tokens || 0,
                            cost,
                            duration: usage.total_time || 0,
                            type: apiCall.phase || 'chat',
                            memoryLimitMB,
                            memoryUsedMB,
                            requestId,
                            timestamp: apiCall.timestamp || new Date().toISOString()
                        });
                        console.log(`✅ Logged LLM call: ${apiCall.model} (${usage.total_tokens} tokens, $${cost.toFixed(6)})`);
                    } catch (logError) {
                        console.error('⚠️ Failed to log LLM call to Google Sheets:', logError.message);
                    }
                }
            }
            
            // Send final 'complete' event
            sseWriter.writeEvent('complete', {
                status: 'success',
                messages: currentMessages,
                iterations: iterationCount,
                extractedContent: extractedContent || undefined,
                cost: parseFloat(finalRequestCost.toFixed(4)), // Cost for this request
                ...finalMemoryMetadata
            });
            
            // ✅ CREDIT SYSTEM: Optimistically deduct actual cost from cache
            const { deductCreditFromCache } = require('../utils/credit-check');
            await deductCreditFromCache(userEmail, finalRequestCost, 'chat');
            
            // Log memory summary
            console.log('📊 Chat endpoint ' + memoryTracker.getSummary());
            
            // End the response stream
            responseStream.end();
            
            // Exit the function completely
            return;
        }
        
        // Check if we exited the loop due to hitting max iterations (not via break for completion)
        if (iterationCount >= maxIterations) {
            // Max iterations reached with tools still being called
            // Prepare continue context: include full message history with tool results for continuation
            const continueContext = {
            messages: currentMessages, // Full context including tool results
            lastUserMessage: messages[messages.length - 1], // Original user message with media
            provider: provider,
            model: model,
            extractedContent: extractedContent
        };
        
        console.log(`❌ MAX_ITERATIONS hit - iteration ${iterationCount}/${maxIterations}`);
        console.log(`   Current messages: ${currentMessages.length}`);
        console.log(`   Last 3 messages: ${currentMessages.slice(-3).map(m => m.role).join(', ')}`);
        console.log(`   Todo auto iterations: ${todoAutoIterations}/${MAX_TODO_AUTO_ITERATIONS}`);
        console.log(`   Todos pending: ${todosManager.hasPending()}`);
        
        sseWriter.writeEvent('error', {
            error: 'Maximum tool execution iterations reached',
            code: 'MAX_ITERATIONS',
            iterations: iterationCount,
            maxIterations: maxIterations,
            showContinueButton: true,
            continueContext: continueContext
        });
        
        // Log error to Google Sheets
        try {
            const requestEndTime = Date.now();
            const durationMs = requestStartTime ? (requestEndTime - requestStartTime) : 0;
            
            await logToBothSheets(driveAccessToken, {
                userEmail: userEmail,
                provider: provider || 'unknown',
                model: model || 'unknown',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                cost: 0,
                duration: durationMs / 1000,
                type: 'chat',
                memoryLimitMB,
                memoryUsedMB,
                requestId,
                timestamp: new Date().toISOString(),
                errorCode: 'MAX_ITERATIONS',
                errorMessage: `Maximum tool execution iterations reached (${iterationCount})`
            });
        } catch (err) {
            console.error('Failed to log error to sheets:', err.message);
        }
        
        responseStream.end();
        } // End of if (iterationCount >= maxIterations)
        
    } catch (error) {
        console.error('Chat endpoint error:', error);
        
        // Handle GOOGLE_SHEETS_LIMIT error (Google's hard 200-sheet limit reached)
        if (error.code === 'GOOGLE_SHEETS_LIMIT' || error.code === 'SHEET_LIMIT_REACHED') {
            console.error('❌ CRITICAL: Google Sheets hard limit reached - cannot create new user sheets');
            
            const capacityError = {
                error: error.userMessage || 'Google Sheets capacity limit reached. Contact administrator.',
                code: 'GOOGLE_SHEETS_LIMIT',
                timestamp: new Date().toISOString(),
                message: 'Google Sheets workbook has reached its 200-sheet limit. Contact administrator for capacity expansion.'
            };
            
            if (sseWriter) {
                sseWriter.writeEvent('error', capacityError);
            } else {
                try {
                    responseStream.write(`event: error\ndata: ${JSON.stringify(capacityError)}\n\n`);
                } catch (streamError) {
                    console.error('Failed to write capacity error to stream:', streamError);
                }
            }
            responseStream.end();
            return; // Don't try to log this to sheets (that's what caused the error!)
        }
        
        // Build error event with request info if available
        const errorEvent = {
            error: error.message || 'Internal server error',
            code: error.code || 'ERROR',
            timestamp: new Date().toISOString()
        };
        
        // Prepare continue context: include current conversation state for continuation
        // Only if we have message context available
        if (typeof currentMessages !== 'undefined' && currentMessages.length > 0) {
            const continueContext = {
                messages: currentMessages, // Full context including tool results
                lastUserMessage: currentMessages.find(m => m.role === 'user'), // Find last user message
                provider: provider,
                model: model
            };
            errorEvent.showContinueButton = true;
            errorEvent.continueContext = continueContext;
        }
        
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
        
        // Handle client disconnect gracefully (don't log as error, just abort)
        if (error.message === 'CLIENT_DISCONNECTED') {
            console.log('🔴 Client disconnected during request, aborting handler');
            if (sseWriter) {
                try {
                    sseWriter.writeEvent('disconnect', {
                        reason: 'client_disconnected',
                        timestamp: Date.now()
                    });
                } catch (disconnectErr) {
                    // If we can't write the disconnect event, client is definitely gone
                    console.log('Could not send disconnect event (client already gone)');
                }
            }
            responseStream.end();
            return; // Exit without further error logging
        }
        
        // Log error to Google Sheets
        try {
            const { logToGoogleSheets } = require('../services/google-sheets-logger');
            const requestEndTime = Date.now();
            const durationMs = requestStartTime ? (requestEndTime - requestStartTime) : 0;
            
            // userEmail might not be defined if error occurs before auth
            const logUserEmail = (typeof userEmail !== 'undefined') ? userEmail : 'unknown';
            
            await logToBothSheets(driveAccessToken, {
                userEmail: logUserEmail,
                provider: provider || (lastRequestBody ? lastRequestBody.provider : 'unknown'),
                model: model || (lastRequestBody ? lastRequestBody.model : 'unknown'),
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                cost: 0,
                duration: durationMs / 1000,
                type: 'chat',
                memoryLimitMB,
                memoryUsedMB,
                requestId,
                timestamp: new Date().toISOString(),
                errorCode: error.code || 'ERROR',
                errorMessage: error.message || 'Internal server error'
            });
        } catch (err) {
            // Don't mask SHEET_LIMIT_REACHED errors
            if (err.code === 'SHEET_LIMIT_REACHED') {
                throw err; // Re-throw to be handled by outer catch
            }
            console.error('Failed to log error to sheets:', err.message);
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
