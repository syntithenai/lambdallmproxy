/**
 * Web Search Tool
 * Priority: Brave Search (Selenium) → Tavily API → DuckDuckGo → Wikipedia
 */

const { DuckDuckGoSearcher } = require('../search');
const { logToGoogleSheets } = require('../services/google-sheets-logger');
const { tavilySearch } = require('../tavily-search');
const { performBraveSearch } = require('./brave-search');

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
 * Search the web using multi-tier fallback:
 * Priority 1: Tavily API (if UI key provided) - User is paying, use their preferred service
 * Priority 2: Brave Search (Selenium) - FREE, on-demand WebDriver (localhost only)
 * Priority 3: Tavily API (if env key available) - PAID ($0.008/search, basic depth)
 * Priority 4: DuckDuckGo - FREE
 * Priority 5: Wikipedia - FREE fallback
 * 
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results to return (default: 5)
 * @param {string} userEmail - User email for billing (optional)
 * @param {string} tavilyKey - Tavily API key from UI settings (takes priority over env var)
 * @returns {Promise<Object>} Object with results array and provider name: { results: [...], provider: 'brave'|'tavily'|'duckduckgo'|'wikipedia' }
 */
async function searchWeb(query, maxResults = 5, userEmail = null, tavilyKey = null) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        console.warn('⚠️ Invalid search query, returning empty results');
        return { results: [], provider: 'none' };
    }

    console.log(`🔍 Starting web search for: "${query}" (max: ${maxResults} results)`);

    // 1️⃣ PRIORITY 1: Tavily API with UI-provided key (user is paying, honor their choice)
    const hasUITavilyKey = tavilyKey && tavilyKey.trim().length > 0;
    
    if (hasUITavilyKey) {
        try {
            console.log(`🔵 [Search Priority 1] User provided Tavily key - using Tavily API first...`);
            const tavilyResults = await tavilySearch(query, {
                apiKey: tavilyKey,
                maxResults: maxResults,
                includeAnswer: false,
                includeRawContent: false,
                searchDepth: 'basic'
            });

            if (tavilyResults && tavilyResults.length > 0) {
                const formattedResults = tavilyResults.map(r => ({
                    title: r.title || 'Untitled',
                    url: r.url || '',
                    snippet: r.snippet || r.description || r.content || ''
                }));

                console.log(`✅ [Search Priority 1] Tavily (UI key) succeeded with ${formattedResults.length} results`);

                // Log billing entry for Tavily search - NO COST (user-provided key)
                try {
                    await logToGoogleSheets({
                        timestamp: new Date().toISOString(),
                        email: userEmail || 'system',
                        provider: 'tavily',
                        model: 'basic-search',
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: 0,
                        cost: 0.00, // User-provided key = $0 cost
                        type: 'search',
                        metadata: JSON.stringify({ 
                            query: query, 
                            results: formattedResults.length,
                            service: 'tavily',
                            keySource: 'ui'
                        })
                    });
                    console.log(`💰 [Search Priority 1] Logged Tavily billing: $0.00 (user-provided key)`);
                } catch (logError) {
                    console.error('❌ [Search Priority 1] Failed to log Tavily billing:', logError.message);
                }

                return { results: formattedResults, provider: 'tavily' };
            }
            
            console.log('⚠️ [Search Priority 1] Tavily (UI key) returned no results, falling back...');
        } catch (tavilyError) {
            console.error('❌ [Search Priority 1] Tavily (UI key) failed:', tavilyError.message);
            console.log('🔄 Falling back to Brave Search...');
        }
    }

    // 2️⃣ PRIORITY 2: Brave Search via Selenium (FREE, localhost only)
    try {
        console.log(`🦁 [Search Priority 2] Trying Brave Search (Selenium)...`);
        console.log(`🔍 [Search Priority 2] IS_LAMBDA: ${!!process.env.AWS_LAMBDA_FUNCTION_NAME}`);
        const braveResults = await performBraveSearch(query, maxResults, userEmail);
        console.log(`🔍 [Search Priority 2] Brave Search returned:`, braveResults ? `${braveResults.length} results` : 'null');
        
        if (braveResults && braveResults.length > 0) {
            console.log(`✅ [Search Priority 2] Brave Search succeeded with ${braveResults.length} results`);
            return { results: braveResults, provider: 'brave' };
        }
        
        console.log(`⚠️ [Search Priority 2] Brave Search returned no results, falling back...`);
    } catch (braveError) {
        console.log(`⚠️ [Search Priority 2] Brave Search failed: ${braveError.message}`);
        console.log(`⚠️ [Search Priority 2] Error stack:`, braveError.stack);
        console.log(`🔄 Falling back to Tavily (env key)...`);
    }

    // 3️⃣ PRIORITY 3: Tavily API with environment key (server-side, billed)
    const envTavilyKey = process.env.TV_K;
    const hasEnvTavilyKey = envTavilyKey && envTavilyKey.trim().length > 0;

    if (hasEnvTavilyKey && !hasUITavilyKey) { // Only use env key if no UI key was provided
        try {
            console.log(`🔍 [Search Priority 3] Trying Tavily API (env key)...`);
            const tavilyResults = await tavilySearch(query, {
                apiKey: envTavilyKey,
                maxResults: maxResults,
                includeAnswer: false,
                includeRawContent: false,
                searchDepth: 'basic'
            });

            if (tavilyResults && tavilyResults.length > 0) {
                const formattedResults = tavilyResults.map(r => ({
                    title: r.title || 'Untitled',
                    url: r.url || '',
                    snippet: r.snippet || r.description || r.content || ''
                }));

                console.log(`✅ [Search Priority 3] Tavily (env key) succeeded with ${formattedResults.length} results`);

                // Log billing entry for Tavily search - BILLED (server-side key)
                try {
                    await logToGoogleSheets({
                        timestamp: new Date().toISOString(),
                        email: userEmail || 'system',
                        provider: 'tavily',
                        model: 'basic-search',
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: 0,
                        cost: 0.008, // Server-side key = charged
                        type: 'search',
                        metadata: JSON.stringify({ 
                            query: query, 
                            results: formattedResults.length,
                            service: 'tavily',
                            keySource: 'env'
                        })
                    });
                    console.log(`💰 [Search Priority 3] Logged Tavily billing: $0.008 (env key)`);
                } catch (logError) {
                    console.error('❌ [Search Priority 3] Failed to log Tavily billing:', logError.message);
                }

                return { results: formattedResults, provider: 'tavily' };
            }
            
            console.log('⚠️ [Search Priority 3] Tavily (env key) returned no results, falling back...');
        } catch (tavilyError) {
            console.error('❌ [Search Priority 3] Tavily (env key) failed:', tavilyError.message);
            console.log('🔄 Falling back to DuckDuckGo...');
        }
    } else if (hasEnvTavilyKey) {
        console.log(`⚠️ [Search Priority 3] Skipping env Tavily key (UI key already tried)`);
    } else if (hasEnvTavilyKey) {
        console.log(`⚠️ [Search Priority 3] Skipping env Tavily key (UI key already tried)`);
    } else {
        console.log(`⚠️ [Search Priority 3] No Tavily env key available, skipping...`);
    }

    // 4️⃣ PRIORITY 4: DuckDuckGo (FREE)
    try {
        console.log(`🦆 [Search Priority 4] Trying DuckDuckGo...`);
        const queryVariations = getSpellingVariations(query);
        
        for (const queryVariant of queryVariations) {
            if (queryVariant !== query) {
                console.log(`🔄 Trying spelling variation: "${queryVariant}"`);
            }
            
            const searcher = new DuckDuckGoSearcher(null, null);
            const results = await searcher.search(queryVariant);
            
            if (results && results.length > 0) {
                const formattedResults = results
                    .slice(0, maxResults)
                    .map(r => ({
                        title: r.title || 'Untitled',
                        url: r.url || '',
                        snippet: r.description || r.snippet || ''
                    }));

                console.log(`✅ [Search Priority 4] DuckDuckGo succeeded with ${formattedResults.length} results`);
                return { results: formattedResults, provider: 'duckduckgo' };
            }
        }
        
        console.log('⚠️ [Search Priority 4] DuckDuckGo returned no results for any spelling variation');
    } catch (ddgError) {
        console.error('❌ [Search Priority 4] DuckDuckGo failed:', ddgError.message);
    }
    
    // 5️⃣ PRIORITY 5: Wikipedia (FREE - final fallback)
    try {
        console.log(`📚 [Search Priority 5] Trying Wikipedia as final fallback...`);
        const wikiResults = await searchWikipedia(query);
        if (wikiResults.length > 0) {
            console.log('✅ [Search Priority 5] Wikipedia fallback succeeded');
            return { results: wikiResults, provider: 'wikipedia' };
        }
        console.log('⚠️ [Search Priority 5] Wikipedia returned no results');
    } catch (wikiError) {
        console.error('❌ [Search Priority 5] Wikipedia failed:', wikiError.message);
    }
    
    console.log('❌ All search methods exhausted, returning empty results');
    return { results: [], provider: 'none' };
}

module.exports = {
    searchWeb,
    performDuckDuckGoSearch: searchWeb // Alias for feed endpoint
};
