/**
 * Batch Image Fetch Endpoint
 * Fetches multiple images in one request and returns them as base64-encoded data
 * Supports Unsplash, Pexels, and AI-generated images
 */

const { searchImage, trackUnsplashDownload } = require('../tools/image-search');
const { authenticateRequest } = require('../auth');

/**
 * Convert image URL to base64
 * @param {string} url - Image URL to fetch and convert
 * @returns {Promise<string>} Base64-encoded image data with data URI prefix
 */
async function urlToBase64(url) {
    try {
        const https = require('https');
        const http = require('http');
        
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            
            protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to fetch image: ${response.statusCode}`));
                    return;
                }
                
                const chunks = [];
                
                response.on('data', (chunk) => chunks.push(chunk));
                
                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    const base64 = buffer.toString('base64');
                    
                    // Determine mime type from content-type header or URL extension
                    const contentType = response.headers['content-type'] || 'image/jpeg';
                    const dataUri = `data:${contentType};base64,${base64}`;
                    
                    resolve(dataUri);
                });
                
                response.on('error', reject);
            }).on('error', reject);
        });
    } catch (error) {
        console.error('Failed to convert URL to base64:', error);
        throw error;
    }
}

/**
 * Fetch and encode a single image
 * @param {Object} imageRequest - Image request object
 * @param {string} imageRequest.searchTerms - Search terms for image
 * @param {string} imageRequest.itemId - ID of the item this image is for
 * @param {string} imageRequest.source - Preferred source (unsplash, pexels, ai, auto)
 * @returns {Promise<Object>} Image data with base64 encoding
 */
async function fetchSingleImage(imageRequest) {
    const { searchTerms, itemId, source = 'auto' } = imageRequest;
    
    try {
        console.log(`🖼️ Fetching image for "${searchTerms}" (source: ${source})`);
        
        // Search for image using existing image search tools
        const imageData = await searchImage(searchTerms, { provider: source });
        
        if (!imageData || !imageData.url) {
            console.warn(`⚠️ No image found for "${searchTerms}"`);
            return {
                itemId,
                success: false,
                error: 'No image found'
            };
        }
        
        // Track Unsplash download if applicable
        if (imageData.source === 'unsplash' && imageData.downloadUrl) {
            trackUnsplashDownload(imageData.downloadUrl).catch(err => 
                console.error('Failed to track Unsplash download:', err)
            );
        }
        
        // Convert image URL to base64
        console.log(`🔄 Converting image to base64: ${imageData.url.substring(0, 80)}...`);
        const base64Data = await urlToBase64(imageData.url);
        
        console.log(`✅ Image fetched and encoded: ${base64Data.length} bytes`);
        
        return {
            itemId,
            success: true,
            image: base64Data,
            thumb: base64Data, // Same for base64
            source: imageData.source,
            photographer: imageData.photographer,
            photographerUrl: imageData.photographerUrl,
            attribution: imageData.attribution,
            attributionHtml: imageData.attributionHtml
        };
        
    } catch (error) {
        console.error(`❌ Failed to fetch image for "${searchTerms}":`, error);
        return {
            itemId,
            success: false,
            error: error.message || 'Image fetch failed'
        };
    }
}

/**
 * Handler for batch image fetching
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} Response with all fetched images
 */
async function handler(event) {
    const startTime = Date.now();
    
    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);
        
        if (!authResult || !authResult.email) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }
        
        // Parse request body
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (parseError) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Invalid JSON in request body' })
            };
        }
        
        const { images = [] } = body;
        
        if (!Array.isArray(images) || images.length === 0) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Invalid request: images array required',
                    example: {
                        images: [
                            { itemId: 'item-1', searchTerms: 'mountain sunset', source: 'auto' },
                            { itemId: 'item-2', searchTerms: 'ocean waves', source: 'unsplash' }
                        ]
                    }
                })
            };
        }
        
        console.log(`🎯 Batch image fetch: ${images.length} images requested by ${authResult.email}`);
        
        // Fetch all images in parallel (with reasonable concurrency limit)
        const BATCH_SIZE = 5; // Process 5 at a time to avoid overwhelming APIs
        const results = [];
        
        for (let i = 0; i < images.length; i += BATCH_SIZE) {
            const batch = images.slice(i, i + BATCH_SIZE);
            console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(images.length / BATCH_SIZE)} (${batch.length} images)`);
            
            const batchResults = await Promise.all(
                batch.map(imageRequest => fetchSingleImage(imageRequest))
            );
            
            results.push(...batchResults);
        }
        
        const successCount = results.filter(r => r.success).length;
        const failedCount = results.length - successCount;
        const duration = Date.now() - startTime;
        
        console.log(`✅ Batch image fetch complete: ${successCount} succeeded, ${failedCount} failed (${duration}ms)`);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: JSON.stringify({
                success: true,
                images: results,
                stats: {
                    total: results.length,
                    succeeded: successCount,
                    failed: failedCount,
                    duration
                }
            })
        };
        
    } catch (error) {
        console.error('❌ Batch image fetch error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Batch image fetch failed',
                message: error.message
            })
        };
    }
}

module.exports = {
    handler,
    fetchSingleImage,
    urlToBase64
};
