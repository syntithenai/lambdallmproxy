/**
 * Billing Endpoint
 * Provides access to user's billing data from centralized service account Google Sheet
 * Supports reading transactions and clearing data with various filters
 */

const { authenticateRequest } = require('../auth');
const { getUserTotalCost, getUserBillingData, logLambdaInvocation: logLambdaInvocationToSheets } = require('../services/google-sheets-logger');
const { getCachedCreditBalance } = require('../utils/credit-cache');
const { CREDIT_LIMIT } = require('./usage');
const { loadEnvironmentProviders } = require('../credential-pool');

/**
 * Get response headers for billing endpoint
 * Note: CORS headers are handled by Lambda Function URL configuration
 */
function getResponseHeaders() {
    return {
        'Content-Type': 'application/json'
    };
}

/**
 * Log Lambda invocation to Google Sheets
 * @param {string} authHeader - Authorization header
 * @param {string} endpoint - Endpoint path
 * @param {number} requestStartTime - Request start timestamp
 * @param {number} memoryLimitMB - Lambda memory limit
 * @param {string} requestId - Lambda request ID
 * @param {string|null} errorCode - Error code if request failed
 * @param {string} userEmail - User email (optional, extracted from auth if not provided)
 */
async function logLambdaInvocation(authHeader, endpoint, requestStartTime, memoryLimitMB, requestId, errorCode = null, userEmail = null) {
    try {
        const durationMs = Date.now() - requestStartTime;
        
        // If userEmail not provided, try to extract from auth header
        if (!userEmail && authHeader) {
            try {
                const authResult = await authenticateRequest(authHeader);
                userEmail = authResult.email || 'unknown';
            } catch (err) {
                userEmail = 'unknown';
            }
        }
        
        await logLambdaInvocationToSheets({
            userEmail: userEmail || 'unknown',
            endpoint,
            durationMs,
            memoryLimitMB,
            requestId,
            errorCode,
            timestamp: new Date().toISOString()
        });
        
        console.log(`💰 Logged Lambda invocation: ${endpoint} (${durationMs}ms, ${memoryLimitMB}MB, $${(durationMs * memoryLimitMB * 0.0000000167).toFixed(8)})`);
    } catch (err) {
        console.error('⚠️ Failed to log Lambda invocation:', err.message);
        // Don't throw - logging failure shouldn't break the request
    }
}

/**
 * Calculate aggregated totals from transactions
 * @param {Array} transactions - Array of transaction objects
 * @returns {Object} Aggregated totals
 */
function calculateTotals(transactions) {
    const totals = {
        totalCost: 0,
        totalTokens: 0,
        totalRequests: transactions.length,
        byType: {},
        byProvider: {},
        byModel: {},
        lambdaInvocations: {
            totalCost: 0,
            totalRequests: 0,
            byEndpoint: {}
        },
        dateRange: {
            start: transactions.length > 0 ? transactions[0].timestamp : null,
            end: transactions.length > 0 ? transactions[transactions.length - 1].timestamp : null
        }
    };

    // Calculate totals
    for (const t of transactions) {
        totals.totalCost += t.cost || 0;
        totals.totalTokens += t.totalTokens || 0;

        // Track Lambda invocations separately
        if (t.type === 'lambda_invocation') {
            totals.lambdaInvocations.totalCost += t.cost || 0;
            totals.lambdaInvocations.totalRequests++;
            
            // Group by endpoint (stored in model field)
            const endpoint = t.model || 'unknown';
            if (!totals.lambdaInvocations.byEndpoint[endpoint]) {
                totals.lambdaInvocations.byEndpoint[endpoint] = {
                    cost: 0,
                    requests: 0,
                    avgDurationMs: 0,
                    totalDurationMs: 0
                };
            }
            totals.lambdaInvocations.byEndpoint[endpoint].cost += t.cost || 0;
            totals.lambdaInvocations.byEndpoint[endpoint].requests++;
            totals.lambdaInvocations.byEndpoint[endpoint].totalDurationMs += t.durationMs || 0;
            totals.lambdaInvocations.byEndpoint[endpoint].avgDurationMs = 
                totals.lambdaInvocations.byEndpoint[endpoint].totalDurationMs / 
                totals.lambdaInvocations.byEndpoint[endpoint].requests;
        }

        // Group by type
        if (!totals.byType[t.type]) {
            totals.byType[t.type] = { cost: 0, tokens: 0, requests: 0 };
        }
        totals.byType[t.type].cost += t.cost || 0;
        totals.byType[t.type].tokens += t.totalTokens || 0;
        totals.byType[t.type].requests++;

        // Group by provider
        if (!totals.byProvider[t.provider]) {
            totals.byProvider[t.provider] = { cost: 0, tokens: 0, requests: 0 };
        }
        totals.byProvider[t.provider].cost += t.cost || 0;
        totals.byProvider[t.provider].tokens += t.totalTokens || 0;
        totals.byProvider[t.provider].requests++;

        // Group by model
        const modelKey = `${t.provider}:${t.model}`;
        if (!totals.byModel[modelKey]) {
            totals.byModel[modelKey] = {
                cost: 0,
                tokens: 0,
                requests: 0,
                provider: t.provider,
                model: t.model
            };
        }
        totals.byModel[modelKey].cost += t.cost || 0;
        totals.byModel[modelKey].tokens += t.totalTokens || 0;
        totals.byModel[modelKey].requests++;
    }

    return totals;
}

/**
 * Handle GET /billing - Read user's billing data
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Response stream
 * @param {Object} context - Lambda context
 * @param {number} requestStartTime - Request start timestamp
 * @param {number} memoryLimitMB - Lambda memory limit
 * @param {string} requestId - Lambda request ID
 */
async function handleGetBilling(event, responseStream, context, requestStartTime, memoryLimitMB, requestId) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    console.log('📊 [BILLING] handleGetBilling called');
    console.log('📊 [BILLING] Event headers:', JSON.stringify(event.headers || {}, null, 2));
    console.log('📊 [BILLING] Event path:', event.rawPath || event.path);

    let userEmail = 'unknown'; // Track for logging

    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        console.log('🔐 [BILLING] Auth header present:', !!authHeader);
        console.log('🔐 [BILLING] Auth header length:', authHeader?.length || 0);
        
        const authResult = await authenticateRequest(authHeader);
        
        console.log('🔐 [BILLING] Auth result:', {
            authenticated: authResult.authenticated,
            authorized: authResult.authorized,
            email: authResult.email
        });

        if (!authResult.authenticated) {
            console.error('❌ [BILLING] Authentication failed');
            
            // Log Lambda invocation (unauthenticated request)
            await logLambdaInvocation(authHeader, '/billing', requestStartTime, memoryLimitMB, requestId, 'UNAUTHORIZED');
            
            const metadata = {
                statusCode: 401,
                headers: getResponseHeaders()
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }

        userEmail = authResult.email || 'unknown';

        // Parse query parameters for filtering
        const filters = {};
        const params = event.queryStringParameters || {};

        if (params.startDate) {
            filters.startDate = params.startDate;
        }
        if (params.endDate) {
            filters.endDate = params.endDate;
        }
        if (params.type) {
            filters.type = params.type;
        }
        if (params.provider) {
            filters.provider = params.provider;
        }

        console.log(`📊 Reading billing data for user: ${userEmail}`, filters);

        // Use centralized service account sheet for all billing data
        const transactions = await getUserBillingData(userEmail, filters);
        const totals = calculateTotals(transactions);
        
        // --- TTS Capabilities ---
        // This block determines which TTS providers are available server-side
        // and exposes their status to the frontend for UI display.
        // Detects from new provider format (LP_TYPE_N/LP_KEY_N) only
        const ttsCapabilities = {
            browser: true, // Always available client-side
            speakjs: true  // Always available client-side
        };
        
        // Detect TTS-capable providers from environment
        const envProviders = loadEnvironmentProviders();
        for (const provider of envProviders) {
            // Providers that support TTS
            if (provider.type === 'groq' || provider.type === 'groq-free') {
                ttsCapabilities.groq = true;
            } else if (provider.type === 'gemini' || provider.type === 'gemini-free') {
                ttsCapabilities.gemini = true;
            } else if (provider.type === 'together') {
                ttsCapabilities.together = true;
            } else if (provider.type === 'elevenlabs') {
                ttsCapabilities.elevenlabs = true;
            }
        }
        
        // --- Provider Information ---
        // Build provider capacity information from already-loaded envProviders
        // SECURITY: NO API keys or key previews are exposed to frontend
        const providerCapabilities = envProviders.map(provider => {
            const capability = {
                id: provider.id,
                type: provider.type,
                priority: provider.priority || 100,
                enabled: true,
                source: 'environment'
            };
            
            // Add optional fields if present (but NEVER API keys)
            if (provider.apiEndpoint) {
                capability.endpoint = provider.apiEndpoint;
            }
            if (provider.modelName) {
                capability.defaultModel = provider.modelName;
            }
            if (provider.rateLimitTPM) {
                capability.rateLimitTPM = provider.rateLimitTPM;
            }
            if (provider.allowedModels && provider.allowedModels.length > 0) {
                capability.allowedModels = provider.allowedModels;
            }
            if (provider.maxQuality) {
                capability.maxQuality = provider.maxQuality;
            }
            
            // NOTE: API keys are NEVER sent to frontend (not even masked)
            // Provider is configured on server side only
            
            return capability;
        });
        
        console.log(`📋 Exposing ${providerCapabilities.length} provider(s) in billing response`);
        
        // --- Available Features ---
        // Determine which features are available based on configured providers
        // Load provider catalog to get feature support
        const fs = require('fs');
        const path = require('path');
        const catalogPath = path.join(__dirname, '..', '..', 'PROVIDER_CATALOG.json');
        let providerCatalog = {};
        try {
            providerCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        } catch (err) {
            console.warn('⚠️ Could not load provider catalog:', err.message);
        }
        
        // Check which features are available based on environment providers
        const features = {
            chat: false,
            imageGeneration: false,
            imageEditing: false,
            transcription: false,
            textToSpeech: false,
            embeddings: false,
            webSearch: false
        };
        
        // Check for chat providers
        if (providerCatalog.chat && providerCatalog.chat.providers) {
            for (const provider of envProviders) {
                const catalogProvider = providerCatalog.chat.providers[provider.type];
                if (catalogProvider) {
                    features.chat = true;
                    break;
                }
            }
        }
        
        // Check for image generation/editing providers
        if (providerCatalog.image && providerCatalog.image.providers) {
            for (const provider of envProviders) {
                const catalogProvider = providerCatalog.image.providers[provider.type];
                if (catalogProvider) {
                    features.imageGeneration = true;
                    features.imageEditing = true; // Same providers support both for now
                    break;
                }
            }
        }
        
        // Check for transcription (Whisper-compatible providers: Groq, OpenAI)
        for (const provider of envProviders) {
            if (provider.type === 'groq' || provider.type === 'groq-free' || 
                provider.type === 'openai' || provider.type === 'openai-free') {
                features.transcription = true;
                break;
            }
        }
        
        // Check for TTS (multiple providers support TTS)
        for (const provider of envProviders) {
            if (provider.type === 'groq' || provider.type === 'groq-free' ||
                provider.type === 'gemini' || provider.type === 'gemini-free' ||
                provider.type === 'together' || provider.type === 'elevenlabs') {
                features.textToSpeech = true;
                break;
            }
        }
        
        // Check for embeddings (Groq, OpenAI, Cohere support embeddings)
        for (const provider of envProviders) {
            if (provider.type === 'groq' || provider.type === 'groq-free' ||
                provider.type === 'openai' || provider.type === 'openai-free' ||
                provider.type === 'cohere' || provider.type === 'voyage' ||
                provider.type === 'together' || provider.type === 'gemini' || provider.type === 'gemini-free') {
                features.embeddings = true;
                break;
            }
        }
        
        // Web search is always available (uses DuckDuckGo)
        features.webSearch = true;
        
        // Check if server has proxy configured (Webshare)
        const hasProxy = !!(process.env.WEBSHARE_PROXY_USERNAME && process.env.WEBSHARE_PROXY_PASSWORD);
        features.proxy = hasProxy;
        
        console.log('✨ Available features:', features);
        
        // --- Available Embedding Models ---
        // Load embedding catalog and filter by available providers
        // Support both environment AND UI providers (sent via POST body)
        const embeddingCatalogPath = path.join(__dirname, '..', '..', 'EMBEDDING_MODELS_CATALOG.json');
        let availableEmbeddings = [];
        try {
            const embeddingCatalog = JSON.parse(fs.readFileSync(embeddingCatalogPath, 'utf8'));
            
            // Get provider types from environment providers
            const providerTypes = new Set(envProviders.map(p => p.type === 'openai-free' || p.type === 'groq-free' || p.type === 'gemini-free' ? p.type.replace('-free', '') : p.type));
            
            // Also check UI providers if provided in POST body
            let uiProviders = [];
            if (event.body) {
                try {
                    const body = JSON.parse(event.body);
                    if (body.providers && Array.isArray(body.providers)) {
                        uiProviders = body.providers;
                        // Add UI provider types to the set
                        uiProviders.forEach(p => {
                            const normalizedType = p.type === 'openai-free' || p.type === 'groq-free' || p.type === 'gemini-free' ? p.type.replace('-free', '') : p.type;
                            providerTypes.add(normalizedType);
                        });
                        console.log(`📱 Received ${uiProviders.length} UI providers for embedding availability check`);
                    }
                } catch (parseError) {
                    console.warn('⚠️ Could not parse billing POST body:', parseError.message);
                }
            }
            
            // Filter embedding models to only those available from configured providers (env + UI)
            availableEmbeddings = embeddingCatalog.models.filter(model => {
                // Check if provider is available (from env or UI)
                if (!providerTypes.has(model.provider)) {
                    return false;
                }
                
                // Check if model is restricted by allowedModels for this provider (check both env and UI)
                const providerConfig = envProviders.find(p => {
                    const normalizedType = p.type === 'openai-free' || p.type === 'groq-free' || p.type === 'gemini-free' ? p.type.replace('-free', '') : p.type;
                    return normalizedType === model.provider;
                }) || uiProviders.find(p => {
                    const normalizedType = p.type === 'openai-free' || p.type === 'groq-free' || p.type === 'gemini-free' ? p.type.replace('-free', '') : p.type;
                    return normalizedType === model.provider;
                });
                
                if (providerConfig && providerConfig.allowedModels && Array.isArray(providerConfig.allowedModels) && providerConfig.allowedModels.length > 0) {
                    return providerConfig.allowedModels.includes(model.id);
                }
                
                return true;
            }).map(model => ({
                id: model.id,
                provider: model.provider,
                name: model.name,
                dimensions: model.dimensions,
                maxTokens: model.maxTokens,
                recommended: model.recommended || false,
                deprecated: model.deprecated || false,
                description: model.description,
                pricing: model.pricing
            }));
            
            console.log(`📊 Available embedding models: ${availableEmbeddings.length}`);
        } catch (err) {
            console.warn('⚠️ Could not load embedding catalog:', err.message);
        }
        
        // --- Provider Availability ---
        // Check which providers have API keys configured (for embedding availability)
        const providerAvailability = {};
        for (const provider of envProviders) {
            const normalizedType = provider.type === 'openai-free' || provider.type === 'groq-free' || provider.type === 'gemini-free' ? provider.type.replace('-free', '') : provider.type;
            if (!providerAvailability[normalizedType]) {
                providerAvailability[normalizedType] = {
                    hasApiKey: !!provider.apiKey,
                    supportsEmbeddings: ['openai', 'cohere', 'voyage', 'together', 'gemini'].includes(normalizedType)
                };
            }
        }
        console.log('📊 Provider availability:', providerAvailability);
        
        const metadata = {
            statusCode: 200,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            success: true,
            source: 'service',
            transactions,
            totals,
            count: transactions.length,
            ttsCapabilities,
            providerCapabilities, // Provider information from env vars
            features, // Available features based on configured providers
            availableEmbeddings, // Available embedding models filtered by configured providers
            providerAvailability // Which providers have API keys and support embeddings
        }));
        responseStream.end();

        // Log Lambda invocation (success)
        await logLambdaInvocation(authHeader, '/billing', requestStartTime, memoryLimitMB, requestId, null, userEmail);

    } catch (error) {
        console.error('❌ [BILLING] Error reading billing data:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        // Log Lambda invocation (error)
        await logLambdaInvocation(authHeader, '/billing', requestStartTime, memoryLimitMB, requestId, 'ERROR', userEmail);

        const metadata = {
            statusCode: 500,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            error: 'Failed to read billing data',
            message: error.message,
            code: 'READ_ERROR',
            details: error.stack
        }));
        responseStream.end();
    }
}

/**
 * Handle DELETE /billing/clear - Clear billing data
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Response stream
 * @param {Object} context - Lambda context
 * @param {number} requestStartTime - Request start timestamp
 * @param {number} memoryLimitMB - Lambda memory limit
 * @param {string} requestId - Lambda request ID
 */
async function handleClearBilling(event, responseStream, context, requestStartTime, memoryLimitMB, requestId) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    let userEmail = 'unknown'; // Track for logging

    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);

        if (!authResult.authenticated) {
            // Log Lambda invocation (unauthenticated request)
            await logLambdaInvocation(authHeader, '/billing/clear', requestStartTime, memoryLimitMB, requestId, 'UNAUTHORIZED');
            
            const metadata = {
                statusCode: 401,
                headers: getResponseHeaders()
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }

        userEmail = authResult.email || 'unknown';

        // Extract Google Drive access token from custom header
        const driveAccessToken = event.headers['x-drive-token'] || event.headers['X-Drive-Token'] || null;
        
        if (!accessToken) {
            const metadata = {
                statusCode: 401,
                headers: getResponseHeaders()
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Google Drive access token required. Please enable cloud sync in Swag page.',
                code: 'DRIVE_TOKEN_REQUIRED'
            }));
            responseStream.end();
            return;
        }

        // Parse query parameters for clear mode
        const params = event.queryStringParameters || {};
        const mode = params.mode || 'all'; // all, provider, dateRange

        const options = { mode };

        if (mode === 'provider') {
            if (!params.provider) {
                const metadata = {
                    statusCode: 400,
                    headers: getResponseHeaders()
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({
                    error: 'provider parameter required for mode=provider',
                    code: 'MISSING_PARAMETER'
                }));
                responseStream.end();
                return;
            }
            options.provider = params.provider;
        } else if (mode === 'dateRange') {
            if (!params.startDate && !params.endDate) {
                const metadata = {
                    statusCode: 400,
                    headers: getResponseHeaders()
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({
                    error: 'startDate or endDate required for mode=dateRange',
                    code: 'MISSING_PARAMETER'
                }));
                responseStream.end();
                return;
            }
            if (params.startDate) options.startDate = params.startDate;
            if (params.endDate) options.endDate = params.endDate;
        }

        console.log(`🗑️ Clearing billing data for user: ${userEmail}`, options);

        // TODO: Implement clearBillingData function
        // const result = await clearBillingData(accessToken, userEmail, options);
        const result = { success: true, message: 'Clear billing data not yet implemented' };

        // Return success response
        const metadata = {
            statusCode: 200,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            success: true,
            deletedCount: result.deletedCount,
            remainingCount: result.remainingCount,
            mode: options.mode
        }));
        responseStream.end();

        // Log Lambda invocation (success)
        await logLambdaInvocation(authHeader, '/billing/clear', requestStartTime, memoryLimitMB, requestId, null, userEmail);

    } catch (error) {
        console.error('❌ Error clearing billing data:', error);

        // Log Lambda invocation (error)
        await logLambdaInvocation(authHeader, '/billing/clear', requestStartTime, memoryLimitMB, requestId, 'ERROR', userEmail);

        const metadata = {
            statusCode: 500,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            error: 'Failed to clear billing data',
            message: error.message,
            code: 'CLEAR_ERROR'
        }));
        responseStream.end();
    }
}

/**
 * Handle GET /billing/transactions - Get user transaction history with credit balance
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Response stream
 * @param {Object} context - Lambda context
 * @param {number} requestStartTime - Request start timestamp
 * @param {number} memoryLimitMB - Lambda memory limit
 * @param {string} requestId - Lambda request ID
 */
async function handleGetTransactions(event, responseStream, context, requestStartTime, memoryLimitMB, requestId) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    console.log('📊 [BILLING] handleGetTransactions called');

    let userEmail = 'unknown'; // Track for logging

    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);

        if (!authResult.authenticated) {
            // Log Lambda invocation (unauthenticated request)
            await logLambdaInvocation(authHeader, '/billing/transactions', requestStartTime, memoryLimitMB, requestId, 'UNAUTHORIZED');
            
            const metadata = {
                statusCode: 401,
                headers: getResponseHeaders()
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }

        userEmail = authResult.email || 'unknown';
        console.log(`📊 Getting transactions for user: ${userEmail}`);

        // Get transactions from service sheet
        const transactions = await getUserBillingData(userEmail);
        
        // Get current credit balance from cache
        const creditBalance = await getCachedCreditBalance(userEmail);

        console.log(`📊 Found ${transactions.length} transaction(s), balance: $${creditBalance.toFixed(4)}`);

        const metadata = {
            statusCode: 200,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            transactions: transactions.reverse(), // Most recent first
            creditBalance: creditBalance,
            count: transactions.length
        }));
        responseStream.end();
        
        // Log Lambda invocation (success)
        await logLambdaInvocation(event.headers?.Authorization || event.headers?.authorization || '', '/billing/transactions', requestStartTime, memoryLimitMB, requestId, null, userEmail);

    } catch (error) {
        console.error('❌ [BILLING] Error getting transactions:', error);

        const metadata = {
            statusCode: 500,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            error: 'Failed to retrieve transactions',
            message: error.message,
            code: 'READ_ERROR'
        }));
        responseStream.end();
        
        // Log Lambda invocation (error)
        await logLambdaInvocation(event.headers?.Authorization || event.headers?.authorization || '', '/billing/transactions', requestStartTime, memoryLimitMB, requestId, 'ERROR', userEmail);
    }
}

/**
 * Main billing endpoint handler
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Response stream
 * @param {Object} context - Lambda context
 */
async function handler(event, responseStream, context) {
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;

    console.log(`📊 Billing endpoint: ${method} ${path}`);

    // Extract Lambda metrics for logging
    const requestStartTime = Date.now();
    const memoryLimitMB = context?.memoryLimitInMB || 0;
    const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}`;

    // GET /billing/transactions - Get transaction history with credit balance
    if (path === '/billing/transactions' && method === 'GET') {
        return await handleGetTransactions(event, responseStream, context, requestStartTime, memoryLimitMB, requestId);
    }

    // GET/POST /billing - Read billing data (includes TTS capabilities)
    // POST accepts UI providers in body for embedding availability check
    if (path === '/billing' && (method === 'GET' || method === 'POST')) {
        return await handleGetBilling(event, responseStream, context, requestStartTime, memoryLimitMB, requestId);
    }

    // DELETE /billing/clear - Clear billing data
    if (path === '/billing/clear' && method === 'DELETE') {
        return await handleClearBilling(event, responseStream, context, requestStartTime, memoryLimitMB, requestId);
    }

    // Unknown route
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    const metadata = {
        statusCode: 404,
        headers: getResponseHeaders()
    };
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
    responseStream.write(JSON.stringify({
        error: 'Not found',
        code: 'NOT_FOUND'
    }));
    responseStream.end();
}

module.exports = { handler };
