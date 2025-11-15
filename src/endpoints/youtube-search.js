/**
 * YouTube Search Endpoint
 * Direct YouTube Data API search without LLM overhead
 */

const https = require('https');
const querystring = require('querystring');

/**
 * Handle YouTube search requests
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Lambda response stream
 * @param {Object} context - Lambda context
 */
async function handler(event, responseStream, context) {
    const requestId = context?.requestId || 'unknown';
    
    try {
        // Parse request body
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (e) {
            throw new Error('Invalid JSON in request body');
        }

        const { query, limit = 10, order = 'relevance' } = body;

        // Validate query
        if (!query || typeof query !== 'string' || !query.trim()) {
            throw new Error('query parameter is required');
        }

        // Clamp limit between 1 and 50
        const maxResults = Math.min(Math.max(parseInt(limit) || 10, 1), 50);

        // Map order parameter to YouTube API order values
        const orderMap = {
            'relevance': 'relevance',
            'date': 'date',
            'viewCount': 'viewCount',
            'rating': 'rating'
        };
        const apiOrder = orderMap[order] || 'relevance';

        console.log(`[${requestId}] YouTube search: "${query}" (limit: ${maxResults}, order: ${apiOrder})`);

        // Get YouTube API key from environment
        const apiKey = process.env.YT_K;
        if (!apiKey) {
            throw new Error('YouTube API key not configured');
        }

        // Build YouTube Data API v3 URL
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?${querystring.stringify({
            part: 'snippet',
            q: query.trim(),
            type: 'video',
            maxResults,
            order: apiOrder,
            key: apiKey
        })}`;

        // Fetch from YouTube API
        const apiResponse = await new Promise((resolve, reject) => {
            const requestOptions = {
                headers: {
                    'Accept': 'application/json',
                    'Referer': 'https://lambdallmproxy.pages.dev/'
                }
            };

            https.get(apiUrl, requestOptions, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(data);
                    } else {
                        reject(new Error(`YouTube API returned status ${res.statusCode}: ${data}`));
                    }
                });
            }).on('error', reject);
        });

        const apiData = JSON.parse(apiResponse);

        // Transform results to our format
        const videos = (apiData.items || []).map(item => {
            const videoId = item.id.videoId;
            
            // Safely extract and truncate description
            let description = item.snippet.description || '';
            if (description.length > 500) {
                description = description.substring(0, 500) + '...';
            }

            return {
                videoId,
                url: `https://www.youtube.com/watch?v=${videoId}`,
                title: item.snippet.title || 'Untitled',
                description,
                channel: item.snippet.channelTitle || 'Unknown',
                thumbnail: item.snippet.thumbnails?.medium?.url || 
                          item.snippet.thumbnails?.default?.url || ''
            };
        });

        console.log(`[${requestId}] YouTube search found ${videos.length} videos`);

        // Build response
        const result = {
            query: query.trim(),
            count: videos.length,
            order: apiOrder,
            videos
        };

        // Send JSON response
        const origin = event.headers?.origin || event.headers?.Origin || '*';
        const responseMetadata = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        };

        responseStream = awslambda.HttpResponseStream.from(responseStream, responseMetadata);
        responseStream.write(JSON.stringify(result));
        responseStream.end();

    } catch (error) {
        console.error(`[${requestId}] YouTube search error:`, error);

        const errorResponse = {
            error: error.message || 'YouTube search failed',
            code: error.code || 'YOUTUBE_SEARCH_ERROR'
        };

        const origin = event.headers?.origin || event.headers?.Origin || '*';
        const responseMetadata = {
            statusCode: error.message.includes('not configured') ? 503 : 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        };

        responseStream = awslambda.HttpResponseStream.from(responseStream, responseMetadata);
        responseStream.write(JSON.stringify(errorResponse));
        responseStream.end();
    }
}

module.exports = { handler };
