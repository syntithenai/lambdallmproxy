/**
 * Transcribe Endpoint
 * 
 * Handles audio transcription using OpenAI Whisper API.
 * 
 * POST /transcribe
 * Content-Type: multipart/form-data
 * Body: FormData with 'audio' field containing audio file
 * 
 * Returns: { text: string }
 */

const { verifyGoogleToken } = require('../auth');
const { loadEnvironmentProviders } = require('../credential-pool');
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
 * Call OpenAI Whisper API for transcription using fetch (Node 18+)
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} filename - Original filename
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<string>} Transcribed text
 */
async function callWhisperAPI(audioBuffer, filename, apiKey) {
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        
        formData.append('file', audioBuffer, {
            filename: filename || 'recording.webm',
            contentType: 'audio/webm'
        });
        formData.append('model', 'whisper-1');

        console.log('🎤 Calling Whisper API...');
        console.log('API Key present:', !!apiKey);
        console.log('API Key prefix:', apiKey ? apiKey.substring(0, 10) + '...' : 'none');
        console.log('Audio buffer size:', audioBuffer.length);
        console.log('Filename:', filename);

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.openai.com',
                path: '/v1/audio/transcriptions',
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

        // Get OpenAI API key from environment providers
        const envProviders = loadEnvironmentProviders();
        const openaiProvider = envProviders.find(p => p.type === 'openai');
        const openaiApiKey = openaiProvider?.apiKey;
        
        if (!openaiApiKey) {
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    error: 'OpenAI API key not configured. Please add an OpenAI provider with type="openai" in environment variables.'
                })
            };
        }

        // Call Whisper API
        let transcribedText;
        try {
            transcribedText = await callWhisperAPI(audioPart.data, audioPart.filename, openaiApiKey);
            console.log(`✅ Transcription successful: ${transcribedText.length} characters`);
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

        // Return transcribed text
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: transcribedText
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
