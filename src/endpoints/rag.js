/**
 * RAG (Retrieval Augmented Generation) Endpoints
 * Handles document ingestion, embedding generation, and search
 */

const { chunker, embeddings } = require('../rag');
const { generateUUID } = require('../rag/utils');
const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');
const { authenticateRequest } = require('../auth');
const { buildProviderPool } = require('../credential-pool');

/**
 * Log transaction to service account sheet
 * @param {string} accessToken - User's OAuth access token (unused, for backward compatibility)
 * @param {object} logData - Transaction data
 */
async function logToBothSheets(accessToken, logData) {
    // Always log to service account sheet (centralized tracking)
    try {
        await logToGoogleSheets(logData);
    } catch (error) {
        console.error('⚠️ Failed to log to service account sheet:', error.message);
    }
}

/**
 * Select an embedding provider from the available pool
 * Prefers requested model, then cheapest models first, then falls back to quality
 * @param {Array} providerPool - Available providers
 * @param {string|null} requestedModel - Optional specific embedding model to use (e.g., 'text-embedding-3-small')
 * @returns {Object|null} Selected provider with { provider, model, apiKey, providerConfig } or null if none available
 */
function selectEmbeddingProvider(providerPool, requestedModel = null) {
    // Load embedding catalog to know which providers support embeddings
    let embeddingCatalog;
    try {
        embeddingCatalog = require('../../EMBEDDING_MODELS_CATALOG.json');
    } catch (e) {
        embeddingCatalog = require('../EMBEDDING_MODELS_CATALOG.json');
    }
    
    // Get all embedding providers from catalog
    const embeddingProviders = [...new Set(embeddingCatalog.models.map(m => m.provider))];
    console.log(`📚 Embedding providers in catalog: ${embeddingProviders.join(', ')}`);
    
    // If a specific model was requested, try to find it first
    if (requestedModel) {
        console.log(`🎯 Requested specific embedding model: ${requestedModel}`);
        
        for (const provider of providerPool) {
            const providerType = provider.type === 'openai-compatible' ? 'openai' : provider.type;
            
            // Find the requested model in catalog
            const requestedModelInfo = embeddingCatalog.models.find(m => 
                m.id === requestedModel && m.provider === providerType
            );
            
            if (requestedModelInfo) {
                // Check if model is in allowedModels restriction (if set)
                if (provider.allowedModels && Array.isArray(provider.allowedModels) && provider.allowedModels.length > 0) {
                    const isAllowed = provider.allowedModels.includes(requestedModel);
                    if (!isAllowed) {
                        console.log(`   ⛔ Requested model "${requestedModel}" blocked by allowedModels filter for provider ${providerType}`);
                        continue;
                    }
                }
                
                console.log(`✅ Using requested embedding model: ${providerType}:${requestedModel} ($${requestedModelInfo.pricing?.perMillionTokens || requestedModelInfo.pricePerMillionTokens}/M tokens)`);
                
                return {
                    provider: providerType,
                    model: requestedModel,
                    apiKey: provider.apiKey,
                    providerConfig: provider
                };
            }
        }
        
        console.warn(`⚠️ Requested embedding model "${requestedModel}" not found in available providers. Falling back to automatic selection...`);
    }
    
    // Build list of all available models with their pricing
    const availableOptions = [];
    
    for (const provider of providerPool) {
        // Find matching provider type in catalog
        const providerType = provider.type === 'openai-compatible' ? 'openai' : provider.type;
        
        // Get all models for this provider
        const modelsForProvider = embeddingCatalog.models.filter(m => {
            // Match provider
            if (m.provider !== providerType) return false;
            
            // Check if model is in allowedModels restriction (if set)
            if (provider.allowedModels && Array.isArray(provider.allowedModels) && provider.allowedModels.length > 0) {
                const isAllowed = provider.allowedModels.includes(m.id);
                if (!isAllowed) {
                    console.log(`   ⛔ Embedding model "${m.id}" blocked by allowedModels filter`);
                    return false;
                }
            }
            
            return true;
        });
        
        // Add each available model to our options
        for (const model of modelsForProvider) {
            availableOptions.push({
                provider: providerType,
                model: model.id,
                modelInfo: model,
                apiKey: provider.apiKey,
                providerConfig: provider,
                pricePerMillion: model.pricing?.perMillionTokens || model.pricePerMillionTokens || Infinity
            });
        }
    }
    
    if (availableOptions.length === 0) {
        console.error('❌ No embedding models available in pool');
        return null;
    }
    
    // Sort by price (cheapest first), then by recommended status
    availableOptions.sort((a, b) => {
        // First compare price
        if (a.pricePerMillion !== b.pricePerMillion) {
            return a.pricePerMillion - b.pricePerMillion;
        }
        // If same price, prefer recommended models
        if (a.modelInfo.recommended && !b.modelInfo.recommended) return -1;
        if (!a.modelInfo.recommended && b.modelInfo.recommended) return 1;
        return 0;
    });
    
    // Select the cheapest option
    const selected = availableOptions[0];
    
    console.log(`✅ Selected cheapest embedding model: ${selected.provider}:${selected.model} ($${selected.pricePerMillion}/M tokens)`);
    if (availableOptions.length > 1) {
        console.log(`   💰 Other options available: ${availableOptions.slice(1, 3).map(o => `${o.provider}:${o.model} ($${o.pricePerMillion}/M)`).join(', ')}${availableOptions.length > 3 ? ` and ${availableOptions.length - 3} more` : ''}`);
    }
    
    return {
        provider: selected.provider,
        model: selected.model,
        apiKey: selected.apiKey,
        providerConfig: selected.providerConfig
    };
}

/**
 * Main RAG endpoint handler
 */
exports.handler = async (event, responseStream, context) => {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    
    // Extract Lambda metrics
    const memoryLimitMB = context?.memoryLimitInMB || 0;
    const requestId = context?.requestId || '';
    const memoryUsedMB = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
    
    // Helper to write SSE events
    const writeEvent = (type, data) => {
        const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        responseStream.write(event);
    };

    try {
        const path = event.rawPath || event.path;
        const method = event.requestContext?.http?.method || event.httpMethod;
        const body = JSON.parse(event.body || '{}');

        // GET /rag/user-spreadsheet - Get or create user's RAG spreadsheet
        if (path === '/rag/user-spreadsheet' && method === 'GET') {
            return await handleGetUserSpreadsheet(event, responseStream);
        }

        // POST /rag/embed-snippets - Generate embeddings for SWAG snippets
        if (path === '/rag/embed-snippets' && method === 'POST') {
            return await handleEmbedSnippets(event, body, writeEvent, responseStream, { memoryLimitMB, memoryUsedMB, requestId });
        }

        // POST /rag/embed-query - Generate embedding for search query
        if (path === '/rag/embed-query' && method === 'POST') {
            return await handleEmbedQuery(event, body, responseStream);
        }

        // POST /rag/sync-embeddings - Sync embeddings to/from Google Sheets
        if (path === '/rag/sync-embeddings' && method === 'POST') {
            return await handleSyncEmbeddings(event, body, responseStream);
        }

        // POST /rag/ingest - Ingest document/URL
        // TODO: Implement ingest functionality
        // if (path === '/rag/ingest' && method === 'POST') {
        //     return await handleIngest(body, writeEvent, responseStream);
        // }

        // GET /rag/embedding-status/:snippetId - Check embedding status
        if (path.startsWith('/rag/embedding-status/') && method === 'GET') {
            const snippetId = path.replace('/rag/embedding-status/', '');
            return await handleEmbeddingStatus(snippetId, responseStream);
        }

        // POST /rag/embedding-details - Get embedding details for snippets
        if (path === '/rag/embedding-details' && method === 'POST') {
            return await handleEmbeddingDetails(body, responseStream);
        }

        // If no route matched
        const metadata = {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ error: 'Not found' }));
        responseStream.end();

    } catch (error) {
        console.error('RAG endpoint error:', error);
        const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
        const metadata = {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ error: error.message }));
        responseStream.end();
    }
};

/**
 * Handle embed-snippets endpoint
 * Returns JSON response with full chunks and embeddings
 * Client is responsible for saving to IndexedDB and syncing to Google Sheets
 */
async function handleEmbedSnippets(event, body, writeEvent, responseStream, lambdaMetrics) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    
    const { snippets, force = false, providers: userProviders = [], embeddingModel: requestedModel = null } = body;
    
    // Authenticate user - REQUIRED
    let userEmail = 'unknown';
    let googleToken = null;
    let isAuthorized = false;
    
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) {
        const metadata = {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            success: false,
            error: 'Authentication required',
            code: 'UNAUTHORIZED'
        }));
        responseStream.end();
        return;
    }
    
    try {
        const authResult = await authenticateRequest(authHeader);
        if (!authResult.success) {
            const metadata = {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ 
                success: false,
                error: authResult.error || 'Authentication failed',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }
        
        userEmail = authResult.email || 'unknown';
        isAuthorized = authResult.authorized || false;
        
        // Extract OAuth token
        if (authHeader.startsWith('Bearer ')) {
            googleToken = authHeader.substring(7);
        }
    } catch (authError) {
        console.error('❌ Authentication error:', authError.message);
        const metadata = {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            success: false,
            error: 'Authentication failed',
            code: 'UNAUTHORIZED',
            details: authError.message
        }));
        responseStream.end();
        return;
    }
    
    if (!Array.isArray(snippets) || snippets.length === 0) {
        const metadata = {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            success: false,
            error: 'snippets array is required' 
        }));
        responseStream.end();
        return;
    }

    try {
        console.log(`Processing ${snippets.length} snippets...`);
        
        // Build provider pool (UI providers + environment providers if authorized)
        const providerPool = buildProviderPool(userProviders, isAuthorized);
        console.log(`📦 Provider pool size: ${providerPool.length}`);
        
        // Determine which embedding model to use
        // Priority: 1. UI request, 2. Environment variable, 3. Automatic selection
        const embeddingModelToUse = requestedModel || process.env.RAG_EMBEDDING_MODEL || null;
        if (embeddingModelToUse) {
            console.log(`🎯 Embedding model preference: ${embeddingModelToUse} (source: ${requestedModel ? 'UI request' : 'environment variable'})`);
        } else {
            console.log(`🎯 No specific embedding model requested, will auto-select cheapest available`);
        }
        
        // Select embedding provider from pool
        const embeddingSelection = selectEmbeddingProvider(providerPool, embeddingModelToUse);
        if (!embeddingSelection) {
            const metadata = {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ 
                success: false,
                error: 'No embedding provider available. Swag embeddings require a provider with embedding capabilities.',
                hint: 'Go to Settings → Providers → Add a provider (OpenAI, Together.AI, Cohere, or Voyage) and ensure the "🔗 Embeddings" capability is enabled. Swag embeddings work independently of the RAG system - you only need an embedding-capable provider configured.',
                requiredAction: 'CONFIGURE_EMBEDDING_PROVIDER'
            }));
            responseStream.end();
            return;
        }
        
        const { provider: embeddingProvider, model: embeddingModel, apiKey, providerConfig } = embeddingSelection;
        
        // Extract isServerSideKey flag for cost calculation
        const isUserProvidedKey = !embeddingSelection.isServerSideKey;
        
        const results = [];
        const startTime = Date.now();
        
        for (const snippet of snippets) {
            try {
                // Check if snippet has content
                if (!snippet.content || snippet.content.trim().length === 0) {
                    results.push({
                        id: snippet.id,
                        status: 'failed',
                        error: 'Snippet has no content',
                        chunks: []
                    });
                    continue;
                }
                
                // Step 1: Chunk the text
                const chunks = chunker.chunkText(snippet.content, {
                    chunkSize: 512,
                    chunkOverlap: 50
                });
                
                console.log(`Generated ${chunks.length} chunks for snippet ${snippet.id}`);
                
                if (chunks.length === 0) {
                    results.push({
                        id: snippet.id,
                        status: 'failed',
                        error: 'No chunks generated (content too short or empty)',
                        chunks: []
                    });
                    continue;
                }
                
                // Prepend title and tags to each chunk for embedding
                // This allows vector search to match on title and tag keywords
                const metadataPrefix = [];
                if (snippet.title) {
                    metadataPrefix.push(`Title: ${snippet.title}`);
                }
                if (snippet.tags && snippet.tags.length > 0) {
                    metadataPrefix.push(`Tags: ${snippet.tags.join(', ')}`);
                }
                const metadataText = metadataPrefix.length > 0 ? metadataPrefix.join('\n') + '\n\n' : '';
                
                const chunkTexts = chunks.map(c => metadataText + c.chunk_text);
                const embeddingResults = await embeddings.batchGenerateEmbeddings(
                    chunkTexts,
                    embeddingModel,
                    embeddingProvider,
                    apiKey,
                    { providerConfig } // Pass provider config for allowedModels validation
                );
                
                console.log(`Generated ${embeddingResults.length} embeddings for snippet ${snippet.id}`);
                console.log('🔍 First embedding result:', {
                    hasEmbedding: !!embeddingResults[0]?.embedding,
                    embeddingType: embeddingResults[0]?.embedding?.constructor?.name,
                    embeddingLength: embeddingResults[0]?.embedding?.length,
                    embeddingFirst5: embeddingResults[0]?.embedding?.slice?.(0, 5) || Array.from(embeddingResults[0]?.embedding || []).slice(0, 5)
                });
                
                // Log embedding generation to Google Sheets
                try {
                    const totalTokens = embeddingResults.reduce((sum, result) => sum + (result.tokens || 0), 0);
                    const totalCost = calculateCost(embeddingModel, totalTokens, 0, null, isUserProvidedKey); // Embeddings have 0 output tokens
                    const duration = Date.now() - startTime;
                    
                    await logToBothSheets(googleToken, {
                        userEmail,
                        provider: embeddingProvider,
                        model: embeddingModel,
                        promptTokens: totalTokens,
                        completionTokens: 0,
                        totalTokens,
                        cost: totalCost,
                        duration: duration / 1000, // Convert ms to seconds
                        type: 'embedding',
                        memoryLimitMB: lambdaMetrics.memoryLimitMB,
                        memoryUsedMB: lambdaMetrics.memoryUsedMB,
                        requestId: lambdaMetrics.requestId,
                        error: null,
                        metadata: {
                            snippetId: snippet.id,
                            chunksGenerated: embeddingResults.length
                        }
                    });
                    console.log(`✅ Logged embedding generation: ${embeddingResults.length} chunks, ${totalTokens} tokens, $${totalCost.toFixed(6)}`);
                } catch (logError) {
                    console.error('⚠️ Failed to log embedding to sheets:', logError.message);
                }
                
                // Step 3: Combine chunks with embeddings (return to client)
                const chunksWithEmbeddings = chunks.map((chunk, index) => ({
                    id: generateUUID(),
                    snippet_id: snippet.id,
                    snippet_name: snippet.title || 'Untitled',
                    chunk_text: chunk.chunk_text,
                    // Convert Float32Array to regular array for JSON serialization
                    embedding: Array.from(embeddingResults[index].embedding),
                    chunk_index: chunk.chunk_index,
                    embedding_model: embeddingModel,
                    embedding_provider: embeddingProvider,
                    embedding_dimensions: embeddingResults[index].embedding.length,
                    source_type: 'text',
                    created_at: new Date().toISOString()
                }));
                
                results.push({
                    id: snippet.id,
                    status: 'success',
                    chunks: chunksWithEmbeddings // Include full chunks with embeddings
                });
                
            } catch (error) {
                console.error(`Failed to process snippet ${snippet.id}:`, error);
                results.push({
                    id: snippet.id,
                    status: 'failed',
                    error: error.message,
                    chunks: []
                });
            }
        }
        
        // Return JSON response with all chunks
        const metadata = {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            success: true,
            results
        }));
        responseStream.end();
        
    } catch (error) {
        console.error('Error embedding snippets:', error);
        const metadata = {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            success: false,
            error: error.message
        }));
        responseStream.end();
    }
}

/**
 * Handle ingest endpoint
 */
async function handleIngest(body, writeEvent, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    
    const { content, url, sourceType, title, metadata } = body;
    
    if (!content && !url) {
        const responseMeta = {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, responseMeta);
        writeEvent('error', { error: 'Either content or url is required' });
        responseStream.end();
        return;
    }

    const responseMeta = {
        statusCode: 200,
        headers: { 
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    };
    responseStream = awslambda.HttpResponseStream.from(responseStream, responseMeta);

    try {
        writeEvent('log', { message: 'Starting ingestion...' });
        
        const result = await ingestDocument(content || url, {
            sourceType: sourceType || (url ? 'url' : 'text'),
            title: title || 'Untitled',
            metadata: metadata || {}
        });
        
        writeEvent('complete', { result });
        responseStream.end();
        
    } catch (error) {
        console.error('Ingestion failed:', error);
        writeEvent('error', { error: error.message });
        responseStream.end();
    }
}

/**
 * Handle embedding status check for a single snippet
 */
async function handleEmbeddingStatus(snippetId, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    
    try {
        const status = await hasEmbedding(snippetId);
        
        const metadata = {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            snippetId,
            hasEmbedding: status 
        }));
        responseStream.end();
    } catch (error) {
        console.error('Error checking embedding status:', error);
        const metadata = {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            error: error.message,
            hasEmbedding: false 
        }));
        responseStream.end();
    }
}

/**
 * Handle embedding details request (batch)
 */
async function handleEmbeddingDetails(body, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    
    try {
        const { snippetIds } = body;
        
        if (!snippetIds || !Array.isArray(snippetIds)) {
            const metadata = {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ 
                error: 'snippetIds array is required' 
            }));
            responseStream.end();
            return;
        }

        const details = await getEmbeddingDetails(snippetIds);
        
        const metadata = {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify(details));
        responseStream.end();
    } catch (error) {
        console.error('Error getting embedding details:', error);
        const metadata = {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            error: error.message 
        }));
        responseStream.end();
    }
}

/**
 * Handle get/create user spreadsheet request
 * Searches user's Google Drive for "Research Agent Swag" spreadsheet
 * Creates one if it doesn't exist
 */
async function handleGetUserSpreadsheet(event, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    const { getUserSpreadsheet } = require('../rag/user-spreadsheet');
    
    try {
        // Get user's OAuth token from headers
        const authHeader = event.headers?.authorization || event.headers?.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            const metadata = {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ 
                error: 'Authorization required' 
            }));
            responseStream.end();
            return;
        }
        
        const userAccessToken = authHeader.substring(7); // Remove 'Bearer '
        
        // Get or create spreadsheet
        const result = await getUserSpreadsheet(userAccessToken);
        
        const metadata = {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify(result));
        responseStream.end();
    } catch (error) {
        console.error('❌ Error getting user spreadsheet:', error);
        console.error('Error stack:', error.stack);
        const metadata = {
            statusCode: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            error: error.message,
            details: error.stack
        }));
        responseStream.end();
    }
}

/**
 * Handle embed query request
 * Generates embedding for a search query
 */
async function handleEmbedQuery(event, body, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    
    // Authenticate user - REQUIRED
    let userEmail = 'unknown';
    let googleToken = null;
    
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) {
        const metadata = {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            error: 'Authentication required',
            code: 'UNAUTHORIZED'
        }));
        responseStream.end();
        return;
    }
    
    try {
        const authResult = await authenticateRequest(authHeader);
        if (!authResult.success) {
            const metadata = {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ 
                error: authResult.error || 'Authentication failed',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }
        
        userEmail = authResult.email || 'unknown';
        
        // Extract OAuth token
        if (authHeader.startsWith('Bearer ')) {
            googleToken = authHeader.substring(7);
        }
    } catch (authError) {
        console.error('❌ Authentication error:', authError.message);
        const metadata = {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            error: 'Authentication failed',
            code: 'UNAUTHORIZED',
            details: authError.message
        }));
        responseStream.end();
        return;
    }
    
    try {
        const { query } = body;
        
        if (!query || typeof query !== 'string') {
            const metadata = {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ 
                error: 'query string is required' 
            }));
            responseStream.end();
            return;
        }
        
        // Generate embedding for query
        const startTime = Date.now();
        const result = await embeddings.generateEmbedding(
            query,
            'text-embedding-3-small',
            'openai',
            process.env.OPENAI_API_KEY
        );
        const duration = Date.now() - startTime;
        
        // Log to Google Sheets
        try {
            const totalCost = calculateCost('text-embedding-3-small', result.tokens || 0, 0, null, false); // Server-side OpenAI key
            
            await logToBothSheets(googleToken, {
                userEmail,
                provider: 'openai',
                model: 'text-embedding-3-small',
                promptTokens: result.tokens || 0,
                completionTokens: 0,
                totalTokens: result.tokens || 0,
                cost: totalCost,
                duration: duration / 1000, // Convert ms to seconds
                type: 'embedding',
                metadata: {
                    queryLength: query.length,
                    embeddingDimensions: result.embedding?.length || 0
                }
            });
            console.log(`✅ Logged query embedding: ${result.tokens} tokens, $${totalCost.toFixed(6)}`);
        } catch (logError) {
            console.error('⚠️ Failed to log query embedding to sheets:', logError.message);
        }
        
        // Create llmApiCall object for transparency
        const llmApiCall = {
            phase: 'embedding',
            provider: 'openai',
            model: 'text-embedding-3-small',
            type: 'embedding',
            timestamp: new Date().toISOString(),
            durationMs: duration,
            cost: result.cost || 0,
            success: true,
            request: {
                query: query,
                queryLength: query.length
            },
            response: {
                usage: {
                    prompt_tokens: result.tokens || 0,
                    total_tokens: result.tokens || 0
                },
                embeddingDimensions: result.embedding?.length || 0
            },
            metadata: {
                cached: false
            }
        };
        
        const metadata = {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            query,
            embedding: Array.from(result.embedding), // Ensure it's a regular array
            model: 'text-embedding-3-small',
            cached: false,
            cost: result.cost,
            tokens: result.tokens,
            llmApiCall: llmApiCall
        }));
        responseStream.end();
    } catch (error) {
        console.error('Error generating query embedding:', error);
        const metadata = {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            error: error.message 
        }));
        responseStream.end();
    }
}

/**
 * Handle sync embeddings request
 * Pushes or pulls embeddings to/from Google Sheets
 */
async function handleSyncEmbeddings(event, body, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    const { saveEmbeddingsToSheets, getEmbeddingsFromSheets } = require('../rag/sheets-embedding-storage');
    
    try {
        const { operation, spreadsheetId, chunks, snippetIds } = body;
        
        if (!operation || !spreadsheetId) {
            const metadata = {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ 
                error: 'operation and spreadsheetId are required' 
            }));
            responseStream.end();
            return;
        }

        // Get user's OAuth token from headers
        const authHeader = event.headers?.authorization || event.headers?.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            const metadata = {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ 
                error: 'Authorization required' 
            }));
            responseStream.end();
            return;
        }
        
        const userAccessToken = authHeader.substring(7);
        
        if (operation === 'push') {
            if (!chunks || !Array.isArray(chunks)) {
                const metadata = {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json' }
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({ 
                    error: 'chunks array is required for push operation' 
                }));
                responseStream.end();
                return;
            }
            
            await saveEmbeddingsToSheets(userAccessToken, spreadsheetId, chunks);
            
            const metadata = {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                success: true,
                pushed: chunks.length
            }));
            responseStream.end();
            
        } else if (operation === 'pull') {
            const retrievedChunks = await getEmbeddingsFromSheets(
                userAccessToken,
                spreadsheetId,
                snippetIds
            );
            
            const metadata = {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                success: true,
                chunks: retrievedChunks
            }));
            responseStream.end();
            
        } else {
            const metadata = {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ 
                error: 'Invalid operation. Must be "push" or "pull"' 
            }));
            responseStream.end();
        }
        
    } catch (error) {
        console.error('Error syncing embeddings:', error);
        const metadata = {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({ 
            error: error.message 
        }));
        responseStream.end();
    }
}
