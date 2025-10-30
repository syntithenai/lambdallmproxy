/**
 * Search Endpoint
 * Takes a query, uses DuckDuckGo search, loads page content, extracts content
 * Returns SSE stream with search results as they complete
 */

// Note: awslambda is a global object provided by Lambda runtime when using Response Streaming
// No import needed - it's automatically available

const { DuckDuckGoSearcher } = require('../search');
const { SimpleHTMLParser } = require('../html-parser');
const { authenticateRequest, getAllowedEmails } = require('../auth');

/**
 * Fetch and extract content from a URL using DuckDuckGoSearcher's fetchUrl
 * (includes redirect handling and bot avoidance)
 * @param {DuckDuckGoSearcher} searcher - DuckDuckGoSearcher instance
 * @param {string} url - URL to fetch
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {Promise<string>} Extracted content
 */
async function fetchContent(searcher, url, timeoutMs = 10000) {
    try {
        // Use DuckDuckGoSearcher's fetchUrl which handles redirects
        const rawHtml = await searcher.fetchUrl(url, timeoutMs);
        
        // Parse and extract text content
        const parser = new SimpleHTMLParser(rawHtml);
        const content = parser.convertToText(rawHtml);
        
        return content;
    } catch (error) {
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
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
                    // Pass searcher instance to fetchContent for redirect handling
                    content = await fetchContent(searcher, result.url, fetchTimeout);
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
 * Handler for the search endpoint (with SSE streaming)
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Lambda response stream
 * @returns {Promise<void>} Streams response via responseStream
 */
async function handler(event, responseStream) {
    // Set streaming headers
    // Note: CORS headers are handled by Lambda Function URL configuration
    const metadata = {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    };
    
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
    
    // Create SSE writer with disconnect detection
    const { createSSEStreamAdapter } = require('../streaming/sse-writer');
    const sseWriter = createSSEStreamAdapter(responseStream);
    
    try {
        // Get authorization header
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        
        // Verify authentication using unified auth function
        const authResult = await authenticateRequest(authHeader);
        
        // Require authentication
        if (!authResult.authenticated) {
            sseWriter.writeEvent('error', {
                error: 'Authentication required. Please provide a valid JWT token in the Authorization header.',
                code: 'UNAUTHORIZED'
            });
            responseStream.end();
            return;
        }
        
        const verifiedUser = authResult.user;
        
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
            sseWriter.writeEvent('error', {
                error: 'Query or queries parameter is required'
            });
            responseStream.end();
            return;
        }
        
        if (maxResults < 1 || maxResults > 20) {
            sseWriter.writeEvent('error', {
                error: 'maxResults must be between 1 and 20'
            });
            responseStream.end();
            return;
        }
        
        const options = {
            maxResults,
            includeContent,
            fetchTimeout
        };
        
        // Send status event
        sseWriter.writeEvent('status', {
            message: isMultipleQueries ? `Searching ${query.length} queries...` : 'Searching...'
        });
        
        // Perform search(es)
        if (isMultipleQueries) {
            // Multiple queries - stream results as they complete
            for (let i = 0; i < query.length; i++) {
                // Check for client disconnect before each search
                if (sseWriter.isDisconnected?.()) {
                    console.log('⚠️ Client disconnected, aborting search');
                    throw new Error('CLIENT_DISCONNECTED');
                }
                
                try {
                    sseWriter.writeEvent('search-start', {
                        query: query[i],
                        index: i
                    });
                    
                    const results = await searchWithContent(query[i], options);
                    
                    sseWriter.writeEvent('search-result', {
                        query: query[i],
                        index: i,
                        count: results.length,
                        results: results
                    });
                } catch (searchError) {
                    sseWriter.writeEvent('search-error', {
                        query: query[i],
                        index: i,
                        error: searchError.message
                    });
                }
            }
        } else {
            // Single query
            const results = await searchWithContent(query, options);
            sseWriter.writeEvent('result', {
                query: query,
                count: results.length,
                results: results
            });
        }
        
        // Send complete event
        sseWriter.writeEvent('complete', {
            success: true
        });
        
        responseStream.end();
        
    } catch (error) {
        console.error('Search endpoint error:', error);
        
        // Handle client disconnect gracefully
        if (error.message === 'CLIENT_DISCONNECTED') {
            console.log('🔴 Client disconnected during search, aborting handler');
            try {
                sseWriter.writeEvent('disconnect', {
                    reason: 'client_disconnected',
                    timestamp: Date.now()
                });
            } catch (disconnectErr) {
                console.log('Could not send disconnect event (client already gone)');
            }
            responseStream.end();
            return;
        }
        
        sseWriter.writeEvent('error', {
            error: error.message || 'Internal server error'
        });
        responseStream.end();
    }
}

module.exports = {
    handler,
    searchWithContent,
    searchMultiple,
    fetchContent
};
