/**
 * Search Endpoint
 * Takes a query, uses DuckDuckGo search, loads page content, extracts content
 * Returns array with link, description, content, and score
 */

const { DuckDuckGoSearcher } = require('../search');
const { SimpleHTMLParser } = require('../html-parser');
const { verifyGoogleToken, getAllowedEmails } = require('../auth');
const https = require('https');
const http = require('http');

/**
 * Fetch and extract content from a URL
 * @param {string} url - URL to fetch
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {Promise<string>} Extracted content
 */
async function fetchContent(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SearchBot/1.0)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: timeoutMs
            };
            
            const req = protocol.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                    // Limit data size to prevent memory issues
                    if (data.length > 1024 * 1024) { // 1MB limit
                        req.destroy();
                        reject(new Error('Response too large'));
                    }
                });
                
                res.on('end', () => {
                    try {
                        const parser = new SimpleHTMLParser();
                        const content = parser.extractText(data);
                        resolve(content);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse content: ${parseError.message}`));
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
            
            req.end();
            
        } catch (error) {
            reject(new Error(`Invalid URL or request error: ${error.message}`));
        }
    });
}

/**
 * Perform search and fetch content for all results
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of search results with content
 */
async function searchWithContent(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Query parameter is required and must be a non-empty string');
    }
    
    const maxResults = options.maxResults || 5;
    const fetchTimeout = options.fetchTimeout || 10000;
    const includeContent = options.includeContent !== false; // Default to true
    
    // Perform DuckDuckGo search
    const searcher = new DuckDuckGoSearcher();
    const searchResults = await searcher.search(query, maxResults);
    
    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
        return [];
    }
    
    // Fetch content for each result if requested
    const resultsWithContent = await Promise.all(
        searchResults.results.map(async (result, index) => {
            let content = '';
            let contentError = null;
            
            if (includeContent) {
                try {
                    content = await fetchContent(result.url, fetchTimeout);
                } catch (error) {
                    console.error(`Failed to fetch content for ${result.url}:`, error.message);
                    contentError = error.message;
                }
            }
            
            return {
                url: result.url,
                title: result.title,
                description: result.description || '',
                content: content,
                score: result.score || (searchResults.results.length - index) / searchResults.results.length, // Higher score for higher ranked results
                contentError: contentError
            };
        })
    );
    
    return resultsWithContent;
}

/**
 * Perform multiple searches in parallel
 * @param {Array<string>} queries - Array of search queries
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of search result objects
 */
async function searchMultiple(queries, options = {}) {
    if (!Array.isArray(queries) || queries.length === 0) {
        throw new Error('Queries must be a non-empty array');
    }
    
    // Validate all queries are strings
    for (let i = 0; i < queries.length; i++) {
        if (!queries[i] || typeof queries[i] !== 'string' || queries[i].trim().length === 0) {
            throw new Error(`Query at index ${i} must be a non-empty string`);
        }
    }
    
    // Execute all searches in parallel
    const searchPromises = queries.map(query => 
        searchWithContent(query, options)
            .then(results => ({
                query: query,
                results: results,
                count: results.length,
                error: null
            }))
            .catch(error => ({
                query: query,
                results: [],
                count: 0,
                error: error.message
            }))
    );
    
    return await Promise.all(searchPromises);
}

/**
 * Handler for the search endpoint
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} Lambda response
 */
async function handler(event) {
    try {
        // Get authorization header
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        
        // Extract token (support both "Bearer token" and just "token")
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;
        
        // Verify JWT token (async - cryptographically verified)
        const verifiedUser = token ? await verifyGoogleToken(token) : null;
        
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
        
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const query = body.query || body.queries || '';
        const maxResults = body.maxResults || 5;
        const includeContent = body.includeContent !== false;
        const fetchTimeout = body.fetchTimeout || 10000;
        
        // Check if we have an array of queries or a single query
        const isMultipleQueries = Array.isArray(query);
        
        // Validate inputs
        if (!query || (Array.isArray(query) && query.length === 0)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Query or queries parameter is required'
                })
            };
        }
        
        if (maxResults < 1 || maxResults > 20) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'maxResults must be between 1 and 20'
                })
            };
        }
        
        const options = {
            maxResults,
            includeContent,
            fetchTimeout
        };
        
        // Perform search(es)
        let responseBody;
        
        if (isMultipleQueries) {
            // Multiple queries - execute in parallel
            const searches = await searchMultiple(query, options);
            responseBody = {
                searches: searches,
                totalSearches: searches.length,
                totalResults: searches.reduce((sum, s) => sum + s.count, 0)
            };
        } else {
            // Single query - backward compatible response
            const results = await searchWithContent(query, options);
            responseBody = {
                query: query,
                count: results.length,
                results: results
            };
        }
        
        // Return success response
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(responseBody)
        };
        
    } catch (error) {
        console.error('Search endpoint error:', error);
        
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
    searchWithContent,
    searchMultiple,
    fetchContent
};
