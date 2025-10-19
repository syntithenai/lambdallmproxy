/**
 * RAG (Retrieval Augmented Generation) Endpoints
 * Handles document ingestion, embedding generation, and search
 */

const { chunker, embeddings } = require('../rag');
const { generateUUID } = require('../rag/utils');

/**
 * Main RAG endpoint handler
 */
exports.handler = async (event, responseStream) => {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    
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
            return await handleEmbedSnippets(body, writeEvent, responseStream);
        }

        // POST /rag/embed-query - Generate embedding for search query
        if (path === '/rag/embed-query' && method === 'POST') {
            return await handleEmbedQuery(body, responseStream);
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
async function handleEmbedSnippets(body, writeEvent, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    
    const { snippets, force = false } = body;
    
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
        
        const results = [];
        
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
                
                // Step 2: Generate embeddings
                const embeddingModel = 'text-embedding-3-small';
                const embeddingProvider = 'openai';
                const apiKey = process.env.OPENAI_API_KEY;
                
                if (!apiKey) {
                    throw new Error('OPENAI_API_KEY not configured');
                }
                
                const chunkTexts = chunks.map(c => c.chunk_text);
                const embeddingResults = await embeddings.batchGenerateEmbeddings(
                    chunkTexts,
                    embeddingModel,
                    embeddingProvider,
                    apiKey
                );
                
                console.log(`Generated ${embeddingResults.length} embeddings for snippet ${snippet.id}`);
                console.log('🔍 First embedding result:', {
                    hasEmbedding: !!embeddingResults[0]?.embedding,
                    embeddingType: embeddingResults[0]?.embedding?.constructor?.name,
                    embeddingLength: embeddingResults[0]?.embedding?.length,
                    embeddingFirst5: embeddingResults[0]?.embedding?.slice?.(0, 5) || Array.from(embeddingResults[0]?.embedding || []).slice(0, 5)
                });
                
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
async function handleEmbedQuery(body, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') ? globalThis.awslambda : require('aws-lambda');
    
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
        const result = await embeddings.generateEmbedding(
            query,
            'text-embedding-3-small',
            'openai',
            process.env.OPENAI_API_KEY
        );
        
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
            tokens: result.tokens
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
