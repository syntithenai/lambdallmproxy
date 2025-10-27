/**
 * Tavily API integration for web search and content extraction
 * https://tavily.com/
 */

const https = require('https');

/**
 * Make HTTPS request to Tavily API
 * @param {string} endpoint - API endpoint path
 * @param {Object} body - Request body
 * @param {string} apiKey - Tavily API key
 * @returns {Promise<Object>} API response
 */
function tavilyRequest(endpoint, body, apiKey) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            ...body,
            api_key: apiKey
        });

        const options = {
            hostname: 'api.tavily.com',
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 30000
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`Tavily API error: ${parsed.error || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Tavily response: ${e.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Tavily request failed: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Tavily request timeout'));
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Search the web using Tavily API
 * @param {string|string[]} query - Search query or array of queries
 * @param {Object} options - Search options
 * @param {string} options.apiKey - Tavily API key
 * @param {number} options.maxResults - Maximum results per query (default: 5)
 * @param {boolean} options.includeAnswer - Include AI-generated answer (default: false)
 * @param {boolean} options.includeRawContent - Include raw content (default: false)
 * @param {string} options.searchDepth - Search depth: 'basic' or 'advanced' (default: 'basic')
 * @returns {Promise<Object>} Search results
 */
async function tavilySearch(query, options = {}) {
    const {
        apiKey,
        maxResults = 5,
        includeAnswer = false,
        includeRawContent = false,
        searchDepth = 'basic'
    } = options;

    if (!apiKey) {
        throw new Error('Tavily API key is required');
    }

    const queries = Array.isArray(query) ? query : [query];
    const allResults = [];

    for (const q of queries) {
        try {
            const response = await tavilyRequest('/search', {
                query: q,
                max_results: maxResults,
                include_answer: includeAnswer,
                include_raw_content: includeRawContent,
                search_depth: searchDepth
            }, apiKey);

            // Transform Tavily results to match our expected format
            const results = (response.results || []).map((result, index) => {
                const content = includeRawContent ? (result.raw_content || null) : null;
                if (includeRawContent && !result.raw_content) {
                    console.warn(`⚠️ Tavily result ${index + 1} for "${q}" missing raw_content despite includeRawContent=true`);
                }
                return {
                    query: q,
                    title: result.title || '',
                    url: result.url || '',
                    description: result.content || '',
                    score: result.score || 0,
                    tavilyScore: result.score || 0,
                    content: content,
                    contentLength: content ? content.length : 0,
                    state: 'success'
                };
            });

            // Add answer if included
            if (includeAnswer && response.answer) {
                allResults.push({
                    query: q,
                    answer: response.answer,
                    results
                });
            } else {
                allResults.push(...results);
            }
        } catch (error) {
            console.error(`Tavily search failed for "${q}":`, error.message);
            // Return error result for this query
            allResults.push({
                query: q,
                error: error.message,
                state: 'error'
            });
        }
    }

    return allResults;
}

/**
 * Extract content from a URL using Tavily API
 * @param {string} url - URL to extract content from
 * @param {string} apiKey - Tavily API key
 * @returns {Promise<Object>} Extracted content
 */
async function tavilyExtract(url, apiKey) {
    if (!apiKey) {
        throw new Error('Tavily API key is required');
    }

    try {
        const response = await tavilyRequest('/extract', {
            urls: [url]
        }, apiKey);

        if (!response.results || response.results.length === 0) {
            throw new Error('No content extracted');
        }

        const result = response.results[0];
        
        return {
            url: result.url || url,
            content: result.raw_content || '',
            format: 'text',
            originalLength: result.raw_content ? result.raw_content.length : 0,
            extractedLength: result.raw_content ? result.raw_content.length : 0,
            compressionRatio: '1.00',
            source: 'tavily'
        };
    } catch (error) {
        throw new Error(`Tavily extract failed: ${error.message}`);
    }
}

module.exports = {
    tavilySearch,
    tavilyExtract
};
