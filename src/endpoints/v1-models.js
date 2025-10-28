/**
 * OpenAI-Compatible Models Endpoint
 * GET /v1/models - List available models
 * 
 * Returns all available chat models from PROVIDER_CATALOG.json
 * in OpenAI API format.
 * 
 * Requires: Authorization: Bearer <api_key>
 */

const { loadProviderCatalog } = require('../utils/catalog-loader');
const { validateAPIKey } = require('../services/api-key-manager');

/**
 * Extract Bearer token from Authorization header
 * 
 * @param {Object} headers - Request headers
 * @returns {string|null} API key or null
 */
function extractAPIKey(headers) {
    const authHeader = headers?.authorization || headers?.Authorization;
    
    if (!authHeader) {
        return null;
    }
    
    // Format: "Bearer sk-..."
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}

/**
 * Handle GET /v1/models request
 * 
 * @param {Object} event - Lambda event object
 * @returns {Object} Response with models list
 */
async function handler(event) {
    try {
        // Extract and validate API key
        const apiKey = extractAPIKey(event.headers);
        
        if (!apiKey) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: {
                        message: 'Missing API key. Please provide a valid API key in the Authorization header (Bearer <api_key>).',
                        type: 'invalid_request_error',
                        code: 'missing_api_key'
                    }
                })
            };
        }
        
        // Validate API key
        const keyValidation = await validateAPIKey(apiKey);
        
        if (!keyValidation.valid) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: {
                        message: keyValidation.error || 'Invalid API key',
                        type: 'invalid_request_error',
                        code: 'invalid_api_key'
                    }
                })
            };
        }
        
        console.log(`✅ /v1/models request authenticated for: ${keyValidation.userEmail}`);
        // Load provider catalog
        const catalog = loadProviderCatalog();
        
        if (!catalog || !catalog.chat || !catalog.chat.providers) {
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: {
                        message: 'Provider catalog not available',
                        type: 'server_error'
                    }
                })
            };
        }
        
        // Extract all models from all providers
        const models = [];
        const now = Math.floor(Date.now() / 1000);
        
        for (const [providerType, providerInfo] of Object.entries(catalog.chat.providers)) {
            if (!providerInfo.models) continue;
            
            for (const [modelId, modelInfo] of Object.entries(providerInfo.models)) {
                // Skip models that are excluded from chat or deprecated
                if (modelInfo.excludeFromChat || modelInfo.deprecated || !modelInfo.available) {
                    continue;
                }
                
                // Format model ID as provider/model (e.g., groq/llama-3.3-70b-versatile)
                const fullModelId = `${providerType}/${modelId}`;
                
                models.push({
                    id: fullModelId,
                    object: 'model',
                    created: now,
                    owned_by: providerInfo.name || providerType,
                    permission: [],
                    root: fullModelId,
                    parent: null
                });
            }
        }
        
        // Sort models alphabetically
        models.sort((a, b) => a.id.localeCompare(b.id));
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                object: 'list',
                data: models
            })
        };
    } catch (error) {
        console.error('❌ /v1/models error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: {
                    message: error.message || 'Internal server error',
                    type: 'server_error'
                }
            })
        };
    }
}

module.exports = { handler };
