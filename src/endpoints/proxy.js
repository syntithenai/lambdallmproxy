/**
 * Proxy Endpoint
 * Forwards requests to OpenAI-compatible endpoints with optional JWT auth injection
 * Validates request parameters against destination API requirements
 */

const https = require('https');
const http = require('http');
const { verifyGoogleToken, getAllowedEmails } = require('../auth');

/**
 * Validate OpenAI-compatible API request parameters
 * @param {Object} body - Request body
 * @returns {Object} Validation result with isValid and errors
 */
function validateOpenAIRequest(body) {
    const errors = [];
    
    // Required fields
    if (!body.model || typeof body.model !== 'string') {
        errors.push('model field is required and must be a string');
    }
    
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        errors.push('messages field is required and must be a non-empty array');
    } else {
        // Validate message format
        for (let i = 0; i < body.messages.length; i++) {
            const msg = body.messages[i];
            if (!msg.role || !msg.content) {
                errors.push(`messages[${i}] must have 'role' and 'content' fields`);
            }
            if (!['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
                errors.push(`messages[${i}].role must be one of: system, user, assistant, tool`);
            }
        }
    }
    
    // Optional fields validation
    if (body.temperature !== undefined) {
        if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) {
            errors.push('temperature must be a number between 0 and 2');
        }
    }
    
    if (body.max_tokens !== undefined) {
        if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1) {
            errors.push('max_tokens must be a positive integer');
        }
    }
    
    if (body.top_p !== undefined) {
        if (typeof body.top_p !== 'number' || body.top_p < 0 || body.top_p > 1) {
            errors.push('top_p must be a number between 0 and 1');
        }
    }
    
    if (body.frequency_penalty !== undefined) {
        if (typeof body.frequency_penalty !== 'number' || body.frequency_penalty < -2 || body.frequency_penalty > 2) {
            errors.push('frequency_penalty must be a number between -2 and 2');
        }
    }
    
    if (body.presence_penalty !== undefined) {
        if (typeof body.presence_penalty !== 'number' || body.presence_penalty < -2 || body.presence_penalty > 2) {
            errors.push('presence_penalty must be a number between -2 and 2');
        }
    }
    
    if (body.stream !== undefined && typeof body.stream !== 'boolean') {
        errors.push('stream must be a boolean');
    }
    
    if (body.tools !== undefined) {
        if (!Array.isArray(body.tools)) {
            errors.push('tools must be an array');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Extract and verify JWT token from authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {Promise<Object|null>} Verified user object or null
 */
async function verifyAuthToken(authHeader) {
    if (!authHeader) {
        return null;
    }
    
    // Support both "Bearer <token>" and just "<token>"
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;
    
    // Verify the JWT token (async - cryptographically verified)
    const verifiedUser = await verifyGoogleToken(token);
    
    // Check if user is in allowed list
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
 * Forward request to OpenAI-compatible endpoint
 * @param {string} targetUrl - Target API URL
 * @param {string} apiKey - API key for the target service
 * @param {Object} body - Request body
 * @param {boolean} stream - Whether to stream the response
 * @returns {Promise<Object>} Response from target API
 */
async function forwardRequest(targetUrl, apiKey, body, stream = false) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(targetUrl);
            const protocol = url.protocol === 'https:' ? https : http;
            
            const requestBody = JSON.stringify(body);
            
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestBody),
                    'Authorization': `Bearer ${apiKey}`,
                    'User-Agent': 'LambdaLLMProxy/1.0'
                },
                timeout: 60000
            };
            
            const req = protocol.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = {
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: data
                        };
                        
                        // Try to parse as JSON
                        try {
                            response.json = JSON.parse(data);
                        } catch (e) {
                            // Not JSON, keep as string
                        }
                        
                        resolve(response);
                    } catch (error) {
                        reject(new Error(`Failed to process response: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            req.write(requestBody);
            req.end();
            
        } catch (error) {
            reject(new Error(`Invalid request: ${error.message}`));
        }
    });
}

/**
 * Handler for the proxy endpoint
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} Lambda response
 */
async function handler(event) {
    try {
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        
        // Get authorization header
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        
        // Verify JWT token (required - async cryptographic verification)
        const verifiedUser = await verifyAuthToken(authHeader);
        
        // Require authentication
        if (!verifiedUser) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Authentication required. Please provide a valid JWT token in the Authorization header.',
                    code: 'UNAUTHORIZED'
                })
            };
        }
        
        // Determine API key to use (prefer env vars for authenticated users)
        const targetProvider = body.provider || 'openai'; // Default to OpenAI
        const envApiKey = targetProvider === 'groq' 
            ? process.env.GROQ_API_KEY 
            : process.env.OPENAI_API_KEY;
        
        const apiKey = envApiKey || body.apiKey || '';
        
        if (envApiKey) {
            console.log(`Using environment API key for verified user: ${verifiedUser.email}`);
        }
        
        // Validate API key
        if (!apiKey) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'API key is required. Set environment variables or provide apiKey in request body.'
                })
            };
        }
        
        // Validate request parameters
        const validation = validateOpenAIRequest(body);
        if (!validation.isValid) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Invalid request parameters',
                    details: validation.errors
                })
            };
        }
        
        // Determine target URL
        const targetUrl = body.targetUrl || process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
        
        // Forward request to target API
        const response = await forwardRequest(targetUrl, apiKey, body, body.stream || false);
        
        // Return response
        return {
            statusCode: response.statusCode || 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                ...response.headers
            },
            body: response.body
        };
        
    } catch (error) {
        console.error('Proxy endpoint error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: error.message || 'Internal server error'
            })
        };
    }
}

module.exports = {
    handler,
    validateOpenAIRequest,
    verifyAuthToken,
    forwardRequest
};
