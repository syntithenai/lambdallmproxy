/**
 * Main Lambda Router
 * Routes requests to appropriate endpoints based on path
 * 
 * Endpoints:
 * - POST /planning - Generate research plan using Groq reasoning model
 * - POST /search - Perform DuckDuckGo search with content extraction
 * - POST /proxy - Forward requests to OpenAI-compatible endpoints
 * - POST /image-edit - Process images with resize, rotate, flip, format, filter operations
 * - POST /parse-image-command - Parse natural language image editing commands using LLM
 * - GET /* - Serve static files from docs directory
 * 
 * Uses AWS Lambda Response Streaming for Server-Sent Events (SSE)
 */

// ============================================================================
// GLOBAL ERROR HANDLERS
// ============================================================================
// These handlers prevent crashes from unhandled async errors
// and provide visibility into production issues via CloudWatch logs

/**
 * Handle unhandled promise rejections
 * Prevents Lambda crashes from async errors
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED PROMISE REJECTION:');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  
  // Log stack trace if available
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
  }
  
  // In Lambda, don't exit process - let current request complete
  // Lambda will recycle container automatically on next invocation
  // This prevents cascading failures
});

/**
 * Handle uncaught exceptions
 * Last resort error handling for synchronous errors
 */
process.on('uncaughtException', (error) => {
  console.error('🚨 UNCAUGHT EXCEPTION:');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  
  // In Lambda, allow current request to complete
  // Don't call process.exit() as Lambda manages lifecycle
});

// ============================================================================
// MODULE IMPORTS
// ============================================================================

// Note: awslambda is a global object provided by Lambda runtime when using Response Streaming
// No import needed - it's automatically available

const planningEndpoint = require('./endpoints/planning');
const searchEndpoint = require('./endpoints/search');
const proxyEndpoint = require('./endpoints/proxy');
const chatEndpoint = require('./endpoints/chat');
const staticEndpoint = require('./endpoints/static');
const stopTranscriptionEndpoint = require('./endpoints/stop-transcription');
const transcribeEndpoint = require('./endpoints/transcribe');
const proxyImageEndpoint = require('./endpoints/proxy-image');
const imageEditEndpoint = require('./endpoints/image-edit');
const parseImageCommandEndpoint = require('./endpoints/parse-image-command');
// Lazy-load convert endpoint (requires heavy dependencies like mammoth)
// const convertEndpoint = require('./endpoints/convert');
// Lazy-load rag-sync endpoint (requires googleapis)
// const ragSyncEndpoint = require('./endpoints/rag-sync');
const ragEndpoint = require('./endpoints/rag');
const billingEndpoint = require('./endpoints/billing');
const ttsEndpoint = require('./endpoints/tts');
const { oauthCallbackEndpoint, oauthRefreshEndpoint, oauthRevokeEndpoint } = require('./endpoints/oauth');
const { handleCacheStats } = require('./endpoints/cache-stats');
const { CREDIT_LIMIT } = require('./endpoints/usage'); // Keep CREDIT_LIMIT export for backward compatibility
const { resetMemoryTracker } = require('./utils/memory-tracker');
const { handleGenerateImage } = require('./endpoints/generate-image');
const { handleCreateOrder, handleCaptureOrder } = require('./endpoints/paypal');
const fixMermaidChartEndpoint = require('./endpoints/fix-mermaid-chart');
const { getProviderHealthStatus } = require('./utils/provider-health');
const { initializeCache, getFullStats } = require('./utils/cache');

// Initialize cache on cold start
let cacheInitialized = false;
async function ensureCacheInitialized() {
    if (!cacheInitialized) {
        try {
            await initializeCache();
            cacheInitialized = true;
            console.log('✅ Cache initialized successfully');
        } catch (error) {
            console.warn('⚠️ Cache initialization failed (will work without cache):', error.message);
        }
    }
}

/**
 * Handle CORS preflight requests
 * Returns proper CORS headers for all origins
 * @param {Object} event - Lambda event
 * @returns {Object} Lambda response
 */
function handleCORS(event) {
    const origin = event.headers?.origin || event.headers?.Origin || '*';
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,X-Google-OAuth-Token,X-YouTube-OAuth-Token',
            'Access-Control-Max-Age': '86400'
        },
        body: JSON.stringify({ message: 'CORS preflight response' })
    };
}

/**
 * Main Lambda handler with routing and streaming support
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Lambda response stream (for SSE)
 * @param {Object} context - Lambda context
 * @returns {Promise<void>} Streams response via responseStream
 */
exports.handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    // Generate consistent request ID for grouping all logs from this request
    const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store requestId in context for endpoint handlers to use
    if (context) {
        context.requestId = requestId;
        context.awsRequestId = requestId;
    }
    
    console.log('🆔 Lambda Invocation Request ID:', requestId);
    
    // Initialize cache on first invocation (non-blocking)
    ensureCacheInitialized().catch(err => {
        console.warn('Cache initialization failed in background:', err.message);
    });
    
    // Initialize memory tracking for this invocation
    const memoryTracker = resetMemoryTracker();
    memoryTracker.snapshot('handler-start');
    
    try {
        console.log('Incoming request:', {
            path: event.path || event.rawPath,
            method: event.httpMethod || event.requestContext?.http?.method,
            headers: event.headers
        });
        
        // Get HTTP method and path
        const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
        const path = event.path || event.rawPath || '/';
        
        // Track memory after initial setup
        memoryTracker.snapshot('routing-setup');
        
        // Handle CORS preflight
        if (method === 'OPTIONS') {
            const corsResponse = handleCORS(event);
            const metadata = {
                statusCode: corsResponse.statusCode,
                headers: corsResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(corsResponse.body);
            responseStream.end();
            return;
        }
        
        // Route to appropriate endpoint with responseStream
        
        if (method === 'POST' && path === '/planning') {
            console.log('Routing to planning endpoint');
            await planningEndpoint.handler(event, responseStream, context);
            return;
        }
        
        if (method === 'POST' && path === '/search') {
            console.log('Routing to search endpoint');
            await searchEndpoint.handler(event, responseStream, context);
            return;
        }
        
        if (method === 'POST' && path === '/chat') {
            console.log('Routing to chat endpoint');
            await chatEndpoint.handler(event, responseStream, context);
            return;
        }
        
        if (method === 'POST' && path === '/convert-to-markdown') {
            console.log('Routing to convert-to-markdown endpoint');
            // Lazy-load convert endpoint
            const convertEndpoint = require('./endpoints/convert');
            await convertEndpoint.handler(event, responseStream);
            return;
        }
        
        if (method === 'POST' && path === '/rag/sync') {
            console.log('Routing to rag-sync endpoint');
            // Lazy-load rag-sync endpoint
            const ragSyncEndpoint = require('./endpoints/rag-sync');
            await ragSyncEndpoint.handler(event, responseStream);
            return;
        }

        // RAG endpoints OPTIONS handler
        if (method === 'OPTIONS' && path.startsWith('/rag/')) {
            console.log('Handling CORS preflight for RAG endpoint');
            const origin = event.headers?.origin || event.headers?.Origin || '*';
            const metadata = {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
                    'Access-Control-Max-Age': '86400'
                }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ message: 'CORS preflight OK' }));
            responseStream.end();
            return;
        }

        // RAG endpoints (embed-snippets, embed-query, user-spreadsheet, sync-embeddings, ingest, embedding-status, embedding-details)
        if (method === 'POST' && (path === '/rag/embed-snippets' || path === '/rag/embed-query' || path === '/rag/ingest' || path === '/rag/embedding-details')) {
            console.log(`Routing to rag endpoint: ${path}`);
            await ragEndpoint.handler(event, responseStream, context);
            return;
        }

        if (method === 'GET' && (path === '/rag/user-spreadsheet' || path.startsWith('/rag/embedding-status/'))) {
            console.log(`Routing to rag endpoint: ${path}`);
            await ragEndpoint.handler(event, responseStream, context);
            return;
        }
        
        if (method === 'POST' && path === '/rag/sync-embeddings') {
            console.log(`Routing to rag endpoint: ${path}`);
            await ragEndpoint.handler(event, responseStream, context);
            return;
        }
        
        // Billing endpoints
        if (path === '/billing' || path === '/billing/clear') {
            if (method === 'OPTIONS') {
                console.log('Handling CORS preflight for billing endpoint');
                const metadata = {
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Google-Access-Token',
                        'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS'
                    }
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({ message: 'CORS preflight OK' }));
                responseStream.end();
                return;
            }
        }
        
        if (method === 'GET' && path === '/billing') {
            console.log('Routing to billing endpoint: GET /billing');
            await billingEndpoint.handler(event, responseStream, context);
            return;
        }
        
        if (method === 'DELETE' && path === '/billing/clear') {
            console.log('Routing to billing endpoint: DELETE /billing/clear');
            await billingEndpoint.handler(event, responseStream, context);
            return;
        }
        
        // Report error endpoint (for user feedback on bad LLM responses)
        if (method === 'POST' && path === '/report-error') {
            console.log('Routing to report-error endpoint');
            const { verifyGoogleToken } = require('./auth');
            const { logErrorReport } = require('./services/error-reporter');
            
            try {
                // Parse request body
                const body = JSON.parse(event.body || '{}');
                
                // Validate required fields (explanation optional for positive feedback)
                if (!body.userEmail || !body.messageData || !body.feedbackType) {
                    const errorResponse = {
                        statusCode: 400,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        body: JSON.stringify({
                            error: 'Missing required fields: userEmail, messageData, feedbackType'
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
                
                // Validate feedbackType
                if (!['positive', 'negative'].includes(body.feedbackType)) {
                    const errorResponse = {
                        statusCode: 400,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        body: JSON.stringify({
                            error: 'feedbackType must be "positive" or "negative"'
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
                
                // Get OAuth token from Authorization header
                const authHeader = event.headers.authorization || event.headers.Authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    const errorResponse = {
                        statusCode: 401,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        body: JSON.stringify({ error: 'Missing or invalid authorization' })
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
                
                const accessToken = authHeader.substring(7);
                
                // Verify token
                const userData = await verifyGoogleToken(accessToken);
                
                // Ensure user email matches (prevent spoofing)
                if (userData.email !== body.userEmail) {
                    const errorResponse = {
                        statusCode: 403,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        body: JSON.stringify({ error: 'User email mismatch' })
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
                
                // Log to Google Sheets
                await logErrorReport(body, accessToken);
                
                const successResponse = {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        success: true,
                        message: 'Error report logged successfully'
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
                console.error('Error logging report:', error);
                const errorResponse = {
                    statusCode: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        error: 'Failed to log error report',
                        details: error.message
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
            return;
        }
        
        // Cache stats endpoint (for monitoring credit cache performance)
        if (method === 'GET' && path === '/cache-stats') {
            console.log('Routing to cache-stats endpoint');
            const cacheStatsResponse = await handleCacheStats(event);
            const metadata = {
                statusCode: cacheStatsResponse.statusCode,
                headers: cacheStatsResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(cacheStatsResponse.body);
            responseStream.end();
            return;
        }
        
        // TTS endpoint
        if (method === 'POST' && path === '/tts') {
            console.log('Routing to TTS endpoint');
            await ttsEndpoint.handler(event, responseStream, context);
            return;
        }
        
        if (method === 'OPTIONS' && path === '/tts') {
            console.log('Handling CORS preflight for TTS endpoint');
            const metadata = {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ message: 'CORS preflight OK' }));
            responseStream.end();
            return;
        }
        
        if (method === 'POST' && path === '/proxy') {
            console.log('Routing to proxy endpoint (buffered)');
            // Note: Proxy endpoint returns standard response, not streaming
            const proxyResponse = await proxyEndpoint.handler(event, context);
            responseStream.write(JSON.stringify(proxyResponse));
            responseStream.end();
            return;
        }
        
        if (method === 'POST' && path === '/stop-transcription') {
            console.log('Routing to stop-transcription endpoint');
            // Note: Stop endpoint returns standard response, not streaming
            const stopResponse = await stopTranscriptionEndpoint.handler(event, context);
            const metadata = {
                statusCode: stopResponse.statusCode,
                headers: stopResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(stopResponse.body);
            responseStream.end();
            return;
        }
        
        // Handle CORS preflight for transcribe endpoint
        if (method === 'OPTIONS' && path === '/transcribe') {
            console.log('Handling CORS preflight for transcribe endpoint');
            const origin = event.headers?.origin || event.headers?.Origin || '*';
            const metadata = {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
                    'Access-Control-Max-Age': '86400'
                }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ message: 'CORS preflight OK' }));
            responseStream.end();
            return;
        }
        
        if (method === 'POST' && path === '/transcribe') {
            console.log('Routing to transcribe endpoint');
            console.log('Request body type:', typeof event.body);
            console.log('Request body length:', event.body ? event.body.length : 0);
            console.log('Is base64:', event.isBase64Encoded);
            
            // Note: Transcribe endpoint returns standard response, not streaming  
            const transcribeResponse = await transcribeEndpoint.handler(event, context);
            console.log('Transcribe response status:', transcribeResponse.statusCode);
            console.log('Transcribe response headers:', transcribeResponse.headers);
            
            const metadata = {
                statusCode: transcribeResponse.statusCode,
                headers: transcribeResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(transcribeResponse.body);
            responseStream.end();
            return;
        }
        
        // OAuth2 endpoints (buffered responses)
        if (method === 'GET' && path === '/oauth/callback') {
            console.log('Routing to OAuth callback endpoint');
            const oauthResponse = await oauthCallbackEndpoint(event);
            const metadata = {
                statusCode: oauthResponse.statusCode,
                headers: oauthResponse.headers
            };
            const httpResponseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            httpResponseStream.write(oauthResponse.body);
            httpResponseStream.end();
            console.log('OAuth callback response sent');
            return;
        }
        
        if (method === 'POST' && path === '/oauth/refresh') {
            console.log('Routing to OAuth refresh endpoint');
            const refreshResponse = await oauthRefreshEndpoint(event);
            const metadata = {
                statusCode: refreshResponse.statusCode,
                headers: refreshResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(refreshResponse.body);
            responseStream.end();
            return;
        }
        
        if (method === 'POST' && path === '/oauth/revoke') {
            console.log('Routing to OAuth revoke endpoint');
            const revokeResponse = await oauthRevokeEndpoint(event);
            const metadata = {
                statusCode: revokeResponse.statusCode,
                headers: revokeResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(revokeResponse.body);
            responseStream.end();
            return;
        }
        
        // Image generation endpoint (buffered response)
        if (method === 'POST' && path === '/generate-image') {
            console.log('Routing to generate-image endpoint');
            const imageResponse = await handleGenerateImage(event);
            const metadata = {
                statusCode: imageResponse.statusCode,
                headers: imageResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(imageResponse.body);
            responseStream.end();
            return;
        }
        
        // Image editing endpoint (SSE streaming response)
        if (method === 'POST' && path === '/image-edit') {
            console.log('Routing to image-edit endpoint');
            await imageEditEndpoint.handler(event, responseStream, context);
            return;
        }
        
        // Parse image command endpoint (LLM-based natural language parsing)
        if (method === 'POST' && path === '/parse-image-command') {
            console.log('Routing to parse-image-command endpoint');
            await parseImageCommandEndpoint.handler(event, responseStream, context);
            return;
        }
        
        // PayPal endpoints (buffered responses)
        if (path === '/paypal/create-order' || path === '/paypal/capture-order') {
            // Handle CORS preflight for PayPal endpoints
            if (method === 'OPTIONS') {
                console.log('Handling CORS preflight for PayPal endpoint');
                const origin = event.headers?.origin || event.headers?.Origin || '*';
                const metadata = {
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': origin,
                        'Access-Control-Allow-Credentials': 'true',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                    }
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({ message: 'CORS preflight OK' }));
                responseStream.end();
                return;
            }
        }
        
        if (method === 'POST' && path === '/paypal/create-order') {
            console.log('Routing to PayPal create-order endpoint');
            const paypalResponse = await handleCreateOrder(event);
            const metadata = {
                statusCode: paypalResponse.statusCode,
                headers: paypalResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(paypalResponse.body);
            responseStream.end();
            return;
        }
        
        if (method === 'POST' && path === '/paypal/capture-order') {
            console.log('Routing to PayPal capture-order endpoint');
            const paypalResponse = await handleCaptureOrder(event);
            const metadata = {
                statusCode: paypalResponse.statusCode,
                headers: paypalResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(paypalResponse.body);
            responseStream.end();
            return;
        }
        
        // Fix Mermaid chart endpoint (buffered response)
        if (method === 'POST' && path === '/fix-mermaid-chart') {
            console.log('Routing to fix-mermaid-chart endpoint');
            const fixResponse = await fixMermaidChartEndpoint.handler(event, context);
            const metadata = {
                statusCode: fixResponse.statusCode,
                headers: fixResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(fixResponse.body);
            responseStream.end();
            return;
        }
        
        // Proxy image endpoint (buffered response)
        if (method === 'POST' && path === '/proxy-image') {
            console.log('Routing to proxy-image endpoint');
            const imageResponse = await proxyImageEndpoint.handler(event, context);
            const metadata = {
                statusCode: imageResponse.statusCode,
                headers: imageResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(imageResponse.body);
            responseStream.end();
            return;
        }
        
        // Provider health check endpoint (buffered response)
        if (method === 'GET' && path === '/health-check/image-providers') {
            console.log('Routing to image provider health check endpoint');
            try {
                const healthStatus = await getProviderHealthStatus();
                const healthResponse = {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': event.headers?.origin || event.headers?.Origin || '*',
                        'Access-Control-Allow-Credentials': 'true'
                    },
                    body: JSON.stringify(healthStatus)
                };
                const metadata = {
                    statusCode: healthResponse.statusCode,
                    headers: healthResponse.headers
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(healthResponse.body);
                responseStream.end();
            } catch (error) {
                console.error('Health check error:', error);
                const errorResponse = {
                    statusCode: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': event.headers?.origin || event.headers?.Origin || '*'
                    },
                    body: JSON.stringify({ error: error.message })
                };
                const metadata = {
                    statusCode: errorResponse.statusCode,
                    headers: errorResponse.headers
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(errorResponse.body);
                responseStream.end();
            }
            return;
        }
        
        // Cache statistics endpoint (buffered response)
        if (method === 'GET' && path === '/cache-stats') {
            console.log('Routing to cache-stats endpoint');
            try {
                const cacheStats = await getFullStats();
                const statsResponse = {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': event.headers?.origin || event.headers?.Origin || '*',
                        'Access-Control-Allow-Credentials': 'true'
                    },
                    body: JSON.stringify(cacheStats)
                };
                const metadata = {
                    statusCode: statsResponse.statusCode,
                    headers: statsResponse.headers
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(statsResponse.body);
                responseStream.end();
            } catch (error) {
                console.error('Cache stats error:', error);
                const errorResponse = {
                    statusCode: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': event.headers?.origin || event.headers?.Origin || '*'
                    },
                    body: JSON.stringify({ error: error.message })
                };
                const metadata = {
                    statusCode: errorResponse.statusCode,
                    headers: errorResponse.headers
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(errorResponse.body);
                responseStream.end();
            }
            return;
        }
        
        // Default: serve static files (non-streaming)
        if (method === 'GET') {
            console.log('Routing to static file server');
            const staticResponse = await staticEndpoint.handler(event, context);
            responseStream.write(JSON.stringify(staticResponse));
            responseStream.end();
            return;
        }
        
        // Method not allowed
        // Note: CORS headers handled by Lambda Function URL configuration
        const errorResponse = {
            statusCode: 405,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Method not allowed',
                allowedMethods: ['GET', 'POST', 'OPTIONS']
            })
        };
        responseStream.write(JSON.stringify(errorResponse));
        responseStream.end();
        
    } catch (error) {
        console.error('Router error:', error);
        
        // Track memory at error point
        memoryTracker.snapshot('error');
        console.error('Memory at error:', memoryTracker.getSummary());
        
        // Note: CORS headers handled by Lambda Function URL configuration
        const errorResponse = {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message || 'Internal server error'
            })
        };
        responseStream.write(JSON.stringify(errorResponse));
        responseStream.end();
    } finally {
        // Final memory snapshot and logging
        memoryTracker.snapshot('handler-end');
        console.log('📊 ' + memoryTracker.getSummary());
        
        // Log detailed breakdown for analysis
        const stats = memoryTracker.getStatistics();
        console.log('Memory recommendation:', stats.recommendation);
        
        // Log Lambda invocation to Google Sheets for billing
        try {
            const { logLambdaInvocation } = require('./services/google-sheets-logger');
            const { verifyGoogleToken } = require('./auth');
            
            // Extract user email from auth token if present
            let userEmail = 'unknown';
            try {
                const authHeader = event.headers?.authorization || event.headers?.Authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.substring(7);
                    const decoded = await verifyGoogleToken(token);
                    if (decoded && decoded.email) {
                        userEmail = decoded.email;
                    }
                }
            } catch (authError) {
                // Ignore auth errors for logging purposes
            }
            
            // Get path from event
            const path = event.path || event.rawPath || '/';
            
            // Get Lambda context info
            const memoryLimitMB = context.memoryLimitInMB || 
                                 parseInt(process.env.AWS_MEM) || 
                                 256;
            const memoryUsedMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
            // Use the same requestId that was generated at the start
            // (already stored in context at handler start)
            
            // Log the Lambda invocation
            await logLambdaInvocation({
                userEmail,
                endpoint: path,
                memoryLimitMB,
                memoryUsedMB,
                durationMs: stats.durationMs,
                requestId,
                timestamp: new Date().toISOString()
            });
        } catch (logError) {
            console.error('Failed to log Lambda invocation:', logError.message);
        }
    }
});

// Export individual endpoint handlers for testing
module.exports = {
    handler: exports.handler,
    planningEndpoint,
    searchEndpoint,
    chatEndpoint,
    proxyEndpoint,
    staticEndpoint,
    transcribeEndpoint
};