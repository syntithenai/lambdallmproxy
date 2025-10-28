/**
 * Web Search Tool
 * Simplified wrapper around DuckDuckGo search for quiz and feed enrichment
 */

const { DuckDuckGoSearcher } = require('../search');

/**
 * Search the web using DuckDuckGo
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results to return (default: 5)
 * @returns {Promise<Array>} Array of search results with title, url, and snippet
 */
async function searchWeb(query, maxResults = 5) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        console.warn('⚠️ Invalid search query, returning empty results');
        return [];
    }

    try {
        console.log(`🔍 Searching web for: "${query}" (max: ${maxResults} results)`);
        
        const searcher = new DuckDuckGoSearcher(null, null); // No proxy
        const results = await searcher.search(query);
        
        if (!results || results.length === 0) {
            console.log('⚠️ No search results found');
            return [];
        }

        // Format results and limit to maxResults
        const formattedResults = results
            .slice(0, maxResults)
            .map(r => ({
                title: r.title || 'Untitled',
                url: r.url || '',
                snippet: r.description || r.snippet || ''
            }));

        console.log(`✅ Found ${formattedResults.length} search results`);
        return formattedResults;

    } catch (error) {
        console.error('❌ Web search error:', error.message);
        return [];
    }
}

module.exports = {
    searchWeb,
    performDuckDuckGoSearch: searchWeb // Alias for feed endpoint
};
