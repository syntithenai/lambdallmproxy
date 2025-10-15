/**
 * Transcribe Endpoint
 * 
 * Handles audio transcription using Whisper API.
 * Prefers Groq (FREE) over OpenAI (PAID).
 * 
 * POST /transcribe
 * Content-Type: multipart/form-data
 * Body: FormData with 'audio' field containing audio file
 * 
 * Returns: { text: string, provider: 'groq'|'openai', cached: boolean }
 */

const { verifyGoogleToken } = require('../auth');
const { loadEnvironmentProviders } = require('../credential-pool');
const { getCacheKey, getFromCache, saveToCache } = require('../utils/cache');
const crypto = require('crypto');
const FormData = require('form-data');
const https = require('https');

/**
 * Parse multipart/form-data from Lambda event
 * @param {Object} event - Lambda event with base64 encoded body
 * @returns {Object} Parsed form data with audio buffer
 */
function parseMultipartFormData(event) {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
        throw new Error('Content-Type must be multipart/form-data');
    }

    // Extract boundary from content-type header
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
        throw new Error('No boundary found in Content-Type header');
    }
    const boundary = boundaryMatch[1];

    // Decode base64 body
    const body = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf-8');

    // Parse multipart data manually
    const parts = [];
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    let position = 0;

    while (position < body.length) {
        // Find next boundary
        const boundaryIndex = body.indexOf(boundaryBuffer, position);
        if (boundaryIndex === -1) break;

        // Skip to content after boundary
        position = boundaryIndex + boundaryBuffer.length;

        // Check for end boundary
        if (body[position] === 0x2D && body[position + 1] === 0x2D) {
            break; // End of multipart data
        }

        // Skip CRLF after boundary
        if (body[position] === 0x0D && body[position + 1] === 0x0A) {
            position += 2;
        }

        // Find end of headers (double CRLF)
        const headerEndIndex = body.indexOf(Buffer.from('\r\n\r\n'), position);
        if (headerEndIndex === -1) break;

        // Extract headers
        const headersStr = body.slice(position, headerEndIndex).toString();
        position = headerEndIndex + 4; // Skip \r\n\r\n

        // Find next boundary to get content
        const nextBoundaryIndex = body.indexOf(boundaryBuffer, position);
        if (nextBoundaryIndex === -1) break;

        // Extract content (trim trailing CRLF)
        let content = body.slice(position, nextBoundaryIndex - 2);

        // Parse Content-Disposition header
        const dispositionMatch = headersStr.match(/Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)")?/i);
        if (dispositionMatch) {
            const fieldName = dispositionMatch[1];
            const filename = dispositionMatch[2];

            // Parse Content-Type if present
            const contentTypeMatch = headersStr.match(/Content-Type: ([^\r\n]+)/i);
            const fieldContentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';

            parts.push({
                name: fieldName,
                filename: filename,
                contentType: fieldContentType,
                data: content
            });
        }

        position = nextBoundaryIndex;
    }

    return parts;
}

/**
 * Call Whisper API for transcription (Groq or OpenAI)
 * Prefers Groq (FREE) over OpenAI (PAID)
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} filename - Original filename
 * @param {string} apiKey - API key (Groq or OpenAI)
 * @param {string} provider - Provider type ('groq' or 'openai')
 * @returns {Promise<string>} Transcribed text
 */
async function callWhisperAPI(audioBuffer, filename, apiKey, provider = 'openai') {
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        
        formData.append('file', audioBuffer, {
            filename: filename || 'recording.webm',
            contentType: 'audio/webm'
        });
        
        // Select model and endpoint based on provider
        const isGroq = provider === 'groq';
        const model = isGroq ? 'whisper-large-v3-turbo' : 'whisper-1';
        const hostname = isGroq ? 'api.groq.com' : 'api.openai.com';
        const path = isGroq ? '/openai/v1/audio/transcriptions' : '/v1/audio/transcriptions';
        
        formData.append('model', model);

        console.log(`🎤 Calling ${provider.toUpperCase()} Whisper API...`);
        console.log(`   Model: ${model}`);
        console.log(`   ${isGroq ? 'FREE' : 'PAID ($0.006/min)'} transcription`);
        console.log('   API Key present:', !!apiKey);
        console.log('   API Key prefix:', apiKey ? apiKey.substring(0, 10) + '...' : 'none');
        console.log('   Audio buffer size:', audioBuffer.length);
        console.log('   Filename:', filename);

        return new Promise((resolve, reject) => {
            const options = {
                hostname: hostname,
                path: path,
                method: 'POST',
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${apiKey}`
                }
            };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log(`Whisper API response: ${res.statusCode}`);
                console.log(`Response data: ${data.substring(0, 500)}`);
                
                if (res.statusCode === 200) {
                    try {
                        const result = JSON.parse(data);
                        resolve(result.text);
                    } catch (e) {
                        console.error('Failed to parse Whisper response:', e);
                        reject(new Error('Failed to parse Whisper API response'));
                    }
                } else {
                    console.error(`Whisper API error ${res.statusCode}:`, data);
                    reject(new Error(`Whisper API error: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error('Whisper API request error:', error);
            reject(new Error(`Whisper API request failed: ${error.message}`));
        });

            formData.pipe(req);
        });
    } catch (error) {
        console.error('Error in callWhisperAPI:', error);
        throw new Error(`Whisper API call failed: ${error.message}`);
    }
}

/**
 * Handle transcription request
 * 
 * @param {Object} event - AWS Lambda event
 * @returns {Object} Response object
 */
async function handler(event) {
    try {
        console.log('📝 Transcription request received');
        console.log('Request headers:', JSON.stringify(event.headers, null, 2));
        console.log('Body is base64:', event.isBase64Encoded);
        console.log('Body length:', event.body ? event.body.length : 0);

        // Verify authentication
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('❌ Missing or invalid auth header');
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Missing or invalid authorization header'
                })
            };
        }

        const token = authHeader.substring(7);
        console.log('Token present:', !!token);
        
        const decodedToken = await verifyGoogleToken(token);
        
        if (!decodedToken || !decodedToken.email) {
            console.log('❌ Token verification failed');
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Invalid or expired token'
                })
            };
        }

        console.log(`✅ Authenticated user: ${decodedToken.email}`);

        // Parse multipart form data
        let parts;
        try {
            console.log('Parsing multipart form data...');
            parts = parseMultipartFormData(event);
            console.log(`✅ Parsed ${parts.length} parts`);
            parts.forEach((p, i) => {
                console.log(`Part ${i}: name=${p.name}, filename=${p.filename}, size=${p.data.length}`);
            });
        } catch (e) {
            console.error('❌ Failed to parse form data:', e);
            console.error('Error stack:', e.stack);
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    error: `Failed to parse form data: ${e.message}`
                })
            };
        }

        // Find audio field
        const audioPart = parts.find(p => p.name === 'audio');
        if (!audioPart) {
            console.error('❌ No audio field found in parts');
            console.error('Available parts:', parts.map(p => p.name));
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    error: 'No audio file provided'
                })
            };
        }

        console.log(`🎤 Audio file received: ${audioPart.filename}, ${audioPart.data.length} bytes`);

        // Generate hash of audio content for caching
        const audioHash = crypto.createHash('md5').update(audioPart.data).digest('hex');
        console.log(`🔑 Audio hash: ${audioHash}`);

        // Get Whisper API key from environment providers
        // Priority: Groq (FREE) > OpenAI (PAID)
        const envProviders = loadEnvironmentProviders();
        let whisperApiKey = null;
        let whisperProvider = null;
        
        // Check for Groq providers first (FREE transcription)
        const groqProvider = envProviders.find(p => p.type === 'groq' || p.type === 'groq-free');
        if (groqProvider?.apiKey) {
            whisperApiKey = groqProvider.apiKey;
            whisperProvider = 'groq';
            console.log('🎤 Using Groq Whisper (FREE transcription)');
        } else {
            // Fallback to OpenAI (PAID transcription)
            const openaiProvider = envProviders.find(p => p.type === 'openai');
            if (openaiProvider?.apiKey) {
                whisperApiKey = openaiProvider.apiKey;
                whisperProvider = 'openai';
                console.log('🎤 Using OpenAI Whisper (PAID transcription - $0.006/min)');
            }
        }
        
        if (!whisperApiKey) {
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    error: 'Whisper API key not configured. Please add a Groq (groq-free/groq) or OpenAI (openai) provider in environment variables. Groq provides FREE transcription.'
                })
            };
        }

        // Try to get transcription from cache
        let transcribedText;
        let fromCache = false;
        
        try {
            const cacheKey = getCacheKey('transcriptions', { audioHash });
            const cachedResult = await getFromCache('transcriptions', cacheKey);
            
            if (cachedResult && cachedResult.text) {
                transcribedText = cachedResult.text;
                fromCache = true;
                console.log(`💾 Cache HIT for transcription: ${audioHash} (${transcribedText.length} characters)`);
            }
        } catch (error) {
            console.warn(`Cache read error for transcription:`, error.message);
        }

        // If not in cache, call Whisper API
        if (!transcribedText) {
            try {
                transcribedText = await callWhisperAPI(audioPart.data, audioPart.filename, whisperApiKey, whisperProvider);
                console.log(`✅ Transcription successful: ${transcribedText.length} characters (via ${whisperProvider})`);
                
                // Save to cache (non-blocking) - TTL 24 hours for transcriptions
                const cacheKey = getCacheKey('transcriptions', { audioHash });
                saveToCache('transcriptions', cacheKey, { 
                    text: transcribedText, 
                    filename: audioPart.filename,
                    provider: whisperProvider 
                }, 86400)
                    .then(() => {
                        console.log(`💾 Cached transcription: ${audioHash} (${whisperProvider})`);
                    })
                    .catch(error => {
                        console.warn(`Cache write error for transcription:`, error.message);
                    });
            } catch (e) {
                console.error('Whisper API error:', e);
                return {
                    statusCode: 500,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        error: `Transcription failed: ${e.message}`
                    })
                };
            }
        }

        // Return transcribed text
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: transcribedText,
                cached: fromCache,
                audioHash: audioHash,
                provider: whisperProvider // Include provider info in response
            })
        };

    } catch (error) {
        console.error('Transcription endpoint error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                error: error.message || 'Internal server error'
            })
        };
    }
}

module.exports = { handler };
