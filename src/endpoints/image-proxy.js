/**
 * Image Proxy Endpoint
 * Downloads images from external URLs and converts to base64
 * Prevents CORS issues and provides caching
 */

const http = require('http');
const https = require('https');
const { authenticateRequest } = require('../auth');

/**
 * Download image from URL and convert to base64
 * @param {string} imageUrl - URL of image to download
 * @returns {Promise<{base64: string, contentType: string}>}
 */
async function downloadImage(imageUrl) {
    return new Promise((resolve, reject) => {
        const protocol = imageUrl.startsWith('https:') ? https : http;
        
        const request = protocol.get(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FeedBot/1.0)',
                'Accept': 'image/*'
            },
            timeout: 10000 // 10 second timeout
        }, (response) => {
            // Check status code
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }
            
            // Get content type
            const contentType = response.headers['content-type'] || 'image/jpeg';
            
            // Validate it's an image
            if (!contentType.startsWith('image/')) {
                reject(new Error(`Invalid content type: ${contentType}`));
                return;
            }
            
            // Collect chunks
            const chunks = [];
            let totalSize = 0;
            const maxSize = 5 * 1024 * 1024; // 5MB limit
            
            response.on('data', (chunk) => {
                totalSize += chunk.length;
                if (totalSize > maxSize) {
                    response.destroy();
                    reject(new Error('Image too large (max 5MB)'));
                    return;
                }
                chunks.push(chunk);
            });
            
            response.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;
                    resolve({ base64, contentType });
                } catch (error) {
                    reject(error);
                }
            });
            
            response.on('error', (error) => {
                reject(error);
            });
        });
        
        request.on('error', (error) => {
            reject(error);
        });
        
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Handler for the image proxy endpoint
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Lambda response stream
 * @returns {Promise<void>}
 */
async function handler(event, responseStream) {
    try {
        // Authenticate request
        const verifiedUser = await authenticateRequest(event);
        if (!verifiedUser || !verifiedUser.email) {
            const metadata = {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ error: 'Authentication required' }));
            responseStream.end();
            return;
        }
        
        // Get image URL from query parameters
        const imageUrl = event.queryStringParameters?.url || '';
        
        if (!imageUrl) {
            const metadata = {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ error: 'Missing url parameter' }));
            responseStream.end();
            return;
        }
        
        // Validate URL
        let parsedUrl;
        try {
            parsedUrl = new URL(imageUrl);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new Error('Invalid protocol');
            }
        } catch (error) {
            const metadata = {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({ error: 'Invalid URL' }));
            responseStream.end();
            return;
        }
        
        console.log(`📷 Downloading image: ${imageUrl.substring(0, 100)}...`);
        
        // Download and convert image
        const { base64, contentType } = await downloadImage(imageUrl);
        
        console.log(`✅ Image downloaded: ${contentType}, ${Math.round(base64.length / 1024)}KB`);
        
        // Send response
        const metadata = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
            }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            success: true,
            base64,
            contentType,
            sourceUrl: imageUrl
        }));
        responseStream.end();
        
    } catch (error) {
        console.error('Image proxy error:', error);
        
        const metadata = {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            success: false,
            error: error.message || 'Failed to download image'
        }));
        responseStream.end();
    }
}

module.exports = {
    handler,
    downloadImage
};
