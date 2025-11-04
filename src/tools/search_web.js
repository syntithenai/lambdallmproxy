/**
 * Web Search Tool
 * Wrapper around DuckDuckGo search with Wikipedia fallback for quiz and feed enrichment
 */

const { DuckDuckGoSearcher } = require('../search');

/**
 * Normalize British/American spelling for better search results
 * @param {string} query - Original query
 * @returns {string[]} Array of query variations to try
 */
function getSpellingVariations(query) {
    const variations = [query]; // Always try original first
    
    // British → American spelling conversions
    const spellingMap = {
        'isation': 'ization',
        'ise': 'ize',
        'colour': 'color',
        'favour': 'favor',
        'honour': 'honor',
        'labour': 'labor',
        'neighbour': 'neighbor',
        'centre': 'center',
        'fibre': 'fiber',
        'metre': 'meter',
        'theatre': 'theater',
        'defence': 'defense',
        'licence': 'license',
        'practise': 'practice',
        'organisation': 'organization',
        'colonisation': 'colonization',
        'globalisation': 'globalization'
    };
    
    // Try replacing British spellings with American
    const lowerQuery = query.toLowerCase();
    for (const [british, american] of Object.entries(spellingMap)) {
        if (lowerQuery.includes(british)) {
            const americanVariant = query.replace(new RegExp(british, 'gi'), american);
            if (americanVariant !== query) {
                variations.push(americanVariant);
            }
        }
    }
    
    return variations;
}

/**
 * Fetch Wikipedia summary as fallback when search fails
 * @param {string} topic - Topic to search on Wikipedia
 * @returns {Promise<Array>} Array with Wikipedia result or empty
 */
async function searchWikipedia(topic) {
    try {
        console.log(`📚 Trying Wikipedia fallback for: "${topic}"`);
        
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'LambdaLLMProxy/1.0',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.log(`⚠️ Wikipedia returned ${response.status} for "${topic}"`);
            return [];
        }
        
        const data = await response.json();
        
        if (data.type === 'standard') {
            console.log(`✅ Found Wikipedia article: "${data.title}"`);
            return [{
                title: data.title,
                url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(topic)}`,
                snippet: data.extract || data.description || 'Wikipedia article'
            }];
        }
        
        return [];
    } catch (error) {
        console.error(`❌ Wikipedia search error:`, error.message);
        return [];
    }
}

/**
 * Search the web using DuckDuckGo with automatic fallbacks
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
        
        // Get spelling variations to try
        const queryVariations = getSpellingVariations(query);
        
        // Try each spelling variation with DuckDuckGo
        for (const queryVariant of queryVariations) {
            if (queryVariant !== query) {
                console.log(`🔄 Trying spelling variation: "${queryVariant}"`);
            }
            
            const searcher = new DuckDuckGoSearcher(null, null); // No proxy
            const results = await searcher.search(queryVariant);
            
            if (results && results.length > 0) {
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
            }
        }
        
        console.log('⚠️ No DuckDuckGo results for any spelling variation');
        
        // Fallback: Try Wikipedia
        const wikiResults = await searchWikipedia(query);
        if (wikiResults.length > 0) {
            console.log('✅ Using Wikipedia fallback');
            return wikiResults;
        }
        
        console.log('⚠️ No results from any source');
        return [];

    } catch (error) {
        console.error('❌ Web search error:', error.message);
        
        // Last resort: Try Wikipedia on error
        try {
            const wikiResults = await searchWikipedia(query);
            if (wikiResults.length > 0) {
                console.log('✅ Using Wikipedia as error recovery');
                return wikiResults;
            }
        } catch (wikiError) {
            console.error('❌ Wikipedia fallback also failed:', wikiError.message);
        }
        
        return [];
    }
}

module.exports = {
    searchWeb,
    performDuckDuckGoSearch: searchWeb // Alias for feed endpoint
};
