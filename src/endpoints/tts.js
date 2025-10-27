/**
 * TTS Endpoint
 * Proxies text-to-speech requests through Lambda for comprehensive logging
 * Supports: OpenAI TTS, Google Cloud TTS, Groq TTS, ElevenLabs
 */

const { authenticateRequest } = require('../auth');
const https = require('https');
const http = require('http');

/**
 * Get CORS headers for TTS endpoint
 */
function getCorsHeaders() {
    return {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
    };
}

/**
 * Calculate TTS cost based on provider and usage
 */
function calculateTTSCost(provider, text, voice, model) {
    const charCount = text.length;
    
    // Pricing per 1M characters (as of October 2025)
    const pricing = {
        'openai': {
            'tts-1': 15.00,      // $15 per 1M characters
            'tts-1-hd': 30.00     // $30 per 1M characters
        },
        'google': {
            'Neural2': 16.00,     // $16 per 1M characters
            'Wavenet': 16.00,     // $16 per 1M characters
            'Standard': 4.00      // $4 per 1M characters
        },
        'groq': {
            'playai': 0.00        // Free tier
        },
        'elevenlabs': {
            'default': 0.30       // $0.30 per 1K characters = $300 per 1M
        }
    };

    let costPerMillion = 0;

    switch (provider) {
        case 'openai':
            costPerMillion = pricing.openai[model] || pricing.openai['tts-1'];
            break;
        case 'google':
        case 'gemini':
            // Determine voice tier from voice name
            if (voice && voice.includes('Neural2')) {
                costPerMillion = pricing.google.Neural2;
            } else if (voice && voice.includes('Wavenet')) {
                costPerMillion = pricing.google.Wavenet;
            } else {
                costPerMillion = pricing.google.Standard;
            }
            break;
        case 'groq':
            costPerMillion = pricing.groq.playai;
            break;
        case 'elevenlabs':
            costPerMillion = pricing.elevenlabs.default;
            break;
        default:
            costPerMillion = 0;
    }

    return (charCount / 1000000) * costPerMillion;
}

/**
 * Make HTTPS request with promise
 */
function makeHttpsRequest(url, options, body = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'POST',
            headers: options.headers || {}
        };

        const req = protocol.request(requestOptions, (res) => {
            const chunks = [];
            
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ statusCode: res.statusCode, body: buffer, headers: res.headers });
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString()}`));
                }
            });
        });

        req.on('error', reject);
        
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        
        req.end();
    });
}

/**
 * Call OpenAI TTS API
 */
async function callOpenAITTS(text, voice, rate, apiKey, model = 'tts-1') {
    const url = 'https://api.openai.com/v1/audio/speech';
    
    const response = await makeHttpsRequest(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    }, {
        model,
        input: text,
        voice: voice || 'alloy',
        speed: rate || 1.0
    });

    return response.body;
}

/**
 * Call Google Cloud TTS API
 */
async function callGoogleTTS(text, voice, rate, pitch, apiKey) {
    const url = 'https://texttospeech.googleapis.com/v1/text:synthesize';
    
    const response = await makeHttpsRequest(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey
        }
    }, {
        input: { text },
        voice: {
            languageCode: 'en-US',
            name: voice || 'en-US-Neural2-A'
        },
        audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: rate || 1.0,
            pitch: ((pitch || 1.0) - 1.0) * 20 // Convert 0.5-2.0 to -10 to +20
        }
    });

    // Google returns base64-encoded audio
    const responseData = JSON.parse(response.body.toString());
    return Buffer.from(responseData.audioContent, 'base64');
}

/**
 * Call Groq TTS API
 */
async function callGroqTTS(text, voice, rate, apiKey) {
    const url = 'https://api.groq.com/openai/v1/audio/speech';
    
    const response = await makeHttpsRequest(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
    }, {
        model: 'playai-tts',
        input: text,
        voice: voice || 'Aaliyah-PlayAI',
        speed: rate || 1.0
    });

    return response.body;
}

/**
 * Call ElevenLabs TTS API
 */
async function callElevenLabsTTS(text, voice, apiKey, stability = 0.5, similarityBoost = 0.75) {
    const voiceId = voice || '21m00Tcm4TlvDq8ikWAM'; // Default voice: Rachel
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    
    const response = await makeHttpsRequest(url, {
        method: 'POST',
        headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json'
        }
    }, {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
            stability,
            similarity_boost: similarityBoost
        }
    });

    return response.body;
}

/**
 * Handle POST /tts - Generate speech from text
 */
async function handleTTS(event, responseStream, context) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    const startTime = Date.now();

    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);

        if (!authResult.authenticated) {
            const metadata = {
                statusCode: 401,
                headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }

        const userEmail = authResult.email || 'unknown';

        // Parse request body
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (parseError) {
            const metadata = {
                statusCode: 400,
                headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Invalid JSON in request body',
                code: 'INVALID_JSON'
            }));
            responseStream.end();
            return;
        }

        const { provider, text, voice, rate, pitch, model, apiKey: clientApiKey } = body;

        if (!provider || !text) {
            const metadata = {
                statusCode: 400,
                headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Missing required fields: provider, text',
                code: 'MISSING_FIELDS'
            }));
            responseStream.end();
            return;
        }

        console.log(`🎙️ TTS request from ${userEmail}: provider=${provider}, voice=${voice}, textLength=${text.length}`);
        
        // ✅ CREDIT SYSTEM: Check credit balance before processing request
        const { checkCreditBalance, estimateTTSCost } = require('../utils/credit-check');
        const estimatedCost = estimateTTSCost(text, model || 'tts-1');
        const creditCheck = await checkCreditBalance(userEmail, estimatedCost, 'tts');
        
        if (!creditCheck.allowed) {
            console.log(`💳 Insufficient credit for ${userEmail}: balance=$${creditCheck.balance.toFixed(4)}, estimated=$${estimatedCost.toFixed(4)}`);
            const metadata = {
                statusCode: creditCheck.error.statusCode,
                headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify(creditCheck.error));
            responseStream.end();
            return;
        }
        
        console.log(`💳 Credit check passed for ${userEmail}: balance=$${creditCheck.balance.toFixed(4)}, estimated=$${estimatedCost.toFixed(4)}`);

        // Get API key from environment or client
        let apiKey;
        switch (provider) {
            case 'openai':
                apiKey = clientApiKey || process.env.OPENAI_KEY;
                break;
            case 'google':
            case 'gemini':
                apiKey = clientApiKey || process.env.GEMINI_KEY;
                break;
            case 'groq':
                apiKey = clientApiKey || process.env.GROQ_KEY;
                break;
            case 'elevenlabs':
                apiKey = clientApiKey || process.env.ELEVENLABS_KEY;
                break;
            default:
                const metadata = {
                    statusCode: 400,
                    headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({
                    error: `Unsupported provider: ${provider}`,
                    code: 'UNSUPPORTED_PROVIDER'
                }));
                responseStream.end();
                return;
        }

        if (!apiKey) {
            const metadata = {
                statusCode: 500,
                headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: `API key not configured for provider: ${provider}`,
                code: 'API_KEY_MISSING'
            }));
            responseStream.end();
            return;
        }

        // Call appropriate TTS provider
        let audioBuffer;
        switch (provider) {
            case 'openai':
                audioBuffer = await callOpenAITTS(text, voice, rate, apiKey, model);
                break;
            case 'google':
            case 'gemini':
                audioBuffer = await callGoogleTTS(text, voice, rate, pitch, apiKey);
                break;
            case 'groq':
                audioBuffer = await callGroqTTS(text, voice, rate, apiKey);
                break;
            case 'elevenlabs':
                audioBuffer = await callElevenLabsTTS(text, voice, apiKey);
                break;
        }

        const duration = Date.now() - startTime;

        // Calculate cost
        const cost = calculateTTSCost(provider, text, voice, model);

        // Log to Google Sheets (async, don't block response)
        try {
            const { logToGoogleSheets } = require('../services/google-sheets-logger');
            const os = require('os');
            
            const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const memoryLimitMB = context?.memoryLimitInMB || parseInt(process.env.AWS_MEM) || 0;
            const memoryUsedMB = memoryLimitMB > 0 ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 0;
            
            const logData = {
                userEmail,
                provider,
                model: model || voice || 'default',
                type: 'tts', // New type for text-to-speech
                promptTokens: 0, // TTS doesn't use tokens
                completionTokens: 0,
                totalTokens: 0,
                cost,
                durationMs: duration,
                timestamp: new Date().toISOString(),
                requestId,
                memoryLimitMB,
                memoryUsedMB,
                hostname: os.hostname(),
                errorCode: '',
                errorMessage: ''
            };
            
            // Log to centralized service account sheet
            logToGoogleSheets(logData).catch(err => {
                console.error('Failed to log TTS to service account sheet:', err);
            });
        } catch (logError) {
            console.error('Error setting up Google Sheets logging:', logError);
        }
        
        // ✅ CREDIT SYSTEM: Optimistically deduct actual cost from cache
        const { deductCreditFromCache } = require('../utils/credit-check');
        await deductCreditFromCache(userEmail, cost, 'tts');

        console.log(`✅ TTS generated: ${text.length} chars, $${cost.toFixed(6)}, ${duration}ms`);

        // Return audio
        const metadata = {
            statusCode: 200,
            headers: getCorsHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(audioBuffer);
        responseStream.end();

    } catch (error) {
        console.error('❌ TTS error:', error);

        const metadata = {
            statusCode: 500,
            headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            error: 'TTS generation failed',
            message: error.message,
            code: 'TTS_ERROR'
        }));
        responseStream.end();
    }
}

/**
 * Main TTS endpoint handler
 */
async function handler(event, responseStream, context) {
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;

    console.log(`🎙️ TTS endpoint: ${method} ${path}`);

    // Handle OPTIONS (CORS preflight)
    if (method === 'OPTIONS') {
        const awslambda = (typeof globalThis.awslambda !== 'undefined') 
            ? globalThis.awslambda 
            : require('aws-lambda');
        
        const metadata = {
            statusCode: 200,
            headers: getCorsHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.end();
        return;
    }

    // POST /tts - Generate speech
    if (path === '/tts' && method === 'POST') {
        return await handleTTS(event, responseStream, context);
    }

    // Unknown route
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    const metadata = {
        statusCode: 404,
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }
    };
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
    responseStream.write(JSON.stringify({
        error: 'Not found',
        code: 'NOT_FOUND'
    }));
    responseStream.end();
}

module.exports = { handler };
