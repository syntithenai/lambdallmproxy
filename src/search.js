/**
 * DuckDuckGo search functionality for web search integration
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { TokenAwareMemoryTracker } = require('./memory-tracker');
const { SimpleHTMLParser } = require('./html-parser');

/**
 * Integrated DuckDuckGo scraper for search functionality
 */
class DuckDuckGoSearcher {
    constructor() {
        this.baseUrl = 'https://duckduckgo.com/';
        this.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        this.memoryTracker = new TokenAwareMemoryTracker();
        this.stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'among', 'is', 'are',
            'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
            'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can'
        ]);
    }

    /**
     * Perform search on DuckDuckGo
     * @param {string} query - Search query
     * @param {number} limit - Maximum number of results to return (default 10)
     * @param {boolean} fetchContent - Whether to fetch full content (default false)
     * @param {number} timeout - Timeout in seconds (default 10)
     * @returns {Promise<Object>} Search results
     */
    async search(query, limit = 10, fetchContent = false, timeout = 10) {
        const searchStartTime = Date.now();
        
        try {
            // Try DuckDuckGo instant answer API first, fall back to HTML scraping
            const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
            
            const searchTime = Date.now();
            const response = await this.fetchUrl(searchUrl, timeout * 1000);
            const parseTime = Date.now();
            
            // Try to parse as JSON first (from API), fall back to HTML parsing
            let results = [];
            try {
                const jsonData = JSON.parse(response);
                results = this.extractFromDuckDuckGoAPI(jsonData, query, limit);
                console.log(`🔍 Search "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}" → ${results.length} results from API`);
            } catch (e) {
                // Fall back to HTML parsing if JSON parsing fails
                results = this.extractSearchResults(response, query, limit);
                console.log(`🔍 Search "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}" → ${results.length} results from HTML (API failed)`);
            }
            
            // If API didn't return web results, try HTML scraping as fallback with enhanced bot avoidance
            if (results.length === 0) {
                const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
                try {
                    const html = await this.fetchUrlWithBotAvoidance(htmlUrl, timeout * 1000);
                    
                    // Check for CAPTCHA or error pages
                    if (html.includes('anomaly') || html.includes('captcha') || html.includes('challenge')) {
                        console.log('⚠️ CAPTCHA detected, search may be limited');
                    }
                    
                    results = this.extractSearchResults(html, query, limit);
                    console.log(`🔍 Fallback HTML search → ${results.length} results`);
                } catch (fallbackError) {
                    console.log(`❌ HTML search failed: ${fallbackError.message}`);
                }
            }
            
            // Filter results by quality score (only keep results with decent relevance)
            const qualityThreshold = 20; // Minimum score threshold
            const qualityResults = results.filter(result => result.score >= qualityThreshold);
            
            // Limit processing to top results for efficiency (increased for 32K tokens)
            const maxProcessingLimit = Math.min(8, limit);
            const sortedResults = qualityResults
                .sort((a, b) => b.score - a.score)
                .slice(0, maxProcessingLimit);
            
            console.log(`📊 Results: ${sortedResults.length}/${results.length} selected (quality filtered)`);
            
            const contentTime = Date.now();
            // Fetch content depending on flag; prefer parallel to speed up
            if (sortedResults.length > 0 && fetchContent) {
                await this.fetchContentForResultsParallel(sortedResults, timeout);
            }
            
            // Return the processed results
            const finalResults = sortedResults;
            const totalTime = Date.now() - searchStartTime;
            
            return {
                success: true,
                query: query,
                totalFound: results.length,
                returned: finalResults.length,
                limit: limit,
                fetchContent: fetchContent,
                timeout: timeout,
                processingTimeMs: totalTime,
                timestamp: new Date().toISOString(),
                results: finalResults,
                metadata: {
                    query: query,
                    totalResults: results.length,
                    searchTime: parseTime - searchTime,
                    parseTime: contentTime - parseTime,
                    contentTime: Date.now() - contentTime,
                    totalTime: totalTime,
                    timeoutMs: timeout * 1000,
                    timestamp: new Date().toISOString(),
                    memory: this.memoryTracker.getMemoryUsage()
                }
            };
            
        } catch (error) {
            console.error('Search error:', error);
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    /**
     * Extract search results from DuckDuckGo API JSON response
     * @param {Object} jsonData - JSON response from DuckDuckGo API
     * @param {string} query - Original search query
     * @param {number} limit - Maximum results to return
     * @returns {Array} Array of search results
     */
    extractFromDuckDuckGoAPI(jsonData, query, limit = 10) {
        const results = [];
        
        // Check for RelatedTopics which often contain useful links
        if (jsonData.RelatedTopics && Array.isArray(jsonData.RelatedTopics)) {
            jsonData.RelatedTopics.forEach(topic => {
                if (topic.FirstURL && topic.Text) {
                    const result = {
                        title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 100),
                        url: topic.FirstURL,
                        description: topic.Text,
                        score: this.calculateRelevanceScore(topic.Text, topic.Text, topic.FirstURL, query, 50),
                        duckduckgoScore: 50,
                        state: '',
                        content: null,
                        contentLength: 0,
                        fetchTimeMs: 0
                    };
                    results.push(result);
                }
            });
        }
        
        // Check for Results array
        if (jsonData.Results && Array.isArray(jsonData.Results)) {
            jsonData.Results.forEach(result => {
                if (result.FirstURL && result.Text) {
                    const resultObj = {
                        title: result.Text.split(' - ')[0] || result.Text.substring(0, 100),
                        url: result.FirstURL,
                        description: result.Text,
                        score: this.calculateRelevanceScore(result.Text, result.Text, result.FirstURL, query, 60),
                        duckduckgoScore: 60,
                        state: '',
                        content: null,
                        contentLength: 0,
                        fetchTimeMs: 0
                    };
                    results.push(resultObj);
                }
            });
        }
        
        // Check for Abstract if it has useful links
        if (jsonData.AbstractURL && jsonData.Abstract) {
            const abstractResult = {
                title: jsonData.AbstractSource || 'Abstract',
                url: jsonData.AbstractURL,
                description: jsonData.Abstract,
                score: this.calculateRelevanceScore(jsonData.Abstract, jsonData.Abstract, jsonData.AbstractURL, query, 70),
                duckduckgoScore: 70,
                state: '',
                content: null,
                contentLength: 0,
                fetchTimeMs: 0
            };
            results.push(abstractResult);
        }
        
        // Sort by score and limit results
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Extract search results from DuckDuckGo HTML
     * @param {string} html - HTML content from DuckDuckGo
     * @param {string} query - Original search query for relevance scoring
     * @param {number} finalLimit - Final number of results wanted
     * @returns {Array} Array of search results with scoring
     */
    extractSearchResults(html, query, finalLimit = 10) {
        const parser = new SimpleHTMLParser(html);
        // Extract 10x the final limit for better scoring and selection
        const extractLimit = Math.min(finalLimit * 10, 100); // Max 100 to avoid excessive processing
        return this.extractResults(parser, extractLimit, query);
    }

    /**
     * Extract search results from the parsed HTML (using DuckDuckGo structure)
     * @param {SimpleHTMLParser} parser - HTML parser instance
     * @param {number} requestedLimit - Number of results ultimately wanted
     * @param {string} query - Original search query for token matching
     * @returns {Array} Array of result objects, sorted by score
     */
    extractResults(parser, requestedLimit = 10, query = '') {
        const results = [];
        
        // First, robustly match anchor blocks: <h2 class="result__title"><a class="result__a" ...>Title</a></h2>
        // We then take a generous slice of following HTML so snippet extraction can work.
        const titleAnchorPattern = /<h2[^>]*class=['"][^'\"]*result__title[^'\"]*['"][^>]*>[\s\S]*?<a[^>]*class=['"][^'\"]*result__a[^'\"]*['"][^>]*href=['"][^'\"]+['"][^>]*>[\s\S]*?<\/a>[\s\S]*?<\/h2>/g;
        let titleMatches = 0;
        let m;
        while ((m = titleAnchorPattern.exec(parser.html)) !== null) {
            titleMatches++;
            const start = m.index;
            const slice = parser.html.substring(start, Math.min(start + 3000, parser.html.length));
            const result = this.extractSingleResultFromHtml(slice, query);
            if (result) {
                results.push(result);
                if (results.length >= requestedLimit * 2) break;
            }
        }
        // Pattern matching completed

        // If none captured via anchor blocks, fall back to broader container patterns
        if (results.length === 0) {
            // Look for DuckDuckGo specific result structure
            // HTML version uses result__body class in modern version
            const resultPatterns = [
                /<div[^>]*class="[^"]*result__body[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
                /<table[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/table>/g,
                /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
                /<div[^>]*class="[^"]*web-result[^"]*"[^>]*>([\s\S]*?)<\/div>/g
            ];
            
            // Attempting pattern-based extraction
            
            let foundResults = false;
            for (let i = 0; i < resultPatterns.length; i++) {
                const pattern = resultPatterns[i];
                
                let matchCount = 0;
                let match;
                while ((match = pattern.exec(parser.html)) !== null) {
                    matchCount++;
                    const resultHtml = match[1];
                    const result = this.extractSingleResultFromHtml(resultHtml, query);
                    if (result) {
                        results.push(result);
                        foundResults = true;
                    }
                    
                    // Stop once we have enough results for good scoring
                    if (results.length >= requestedLimit * 2) break;
                }
                
                // If we found results with this pattern, stop trying other patterns
                if (foundResults) {
                    break;
                }
            }
        }
        
        // If no results found with specific pattern, fall back to generic link extraction
        if (results.length === 0) {
            const links = parser.extractLinks();
            
            for (const link of links) {
                const href = link.href;
                const text = link.text;
                
                // Filter out navigation links and keep actual results
                if (href.startsWith('http') && 
                    text && 
                    text.length > 10 &&
                    !this.isNavigationLink(href)) {
                    
                    // Extract description from context
                    const description = this.extractDescription(link.context, text);
                    
                    // Calculate score for generic results
                    const score = this.calculateRelevanceScore(text, description, href, query);
                    
                    results.push({
                        title: text.substring(0, 200), // Limit title length
                        url: href,
                        description: description.substring(0, 500), // Limit description length
                        score: score,
                        duckduckgoScore: null,
                        state: ''
                    });
                }
            }
        }
        
        // Remove duplicates based on URL
        const uniqueResults = [];
        const seenUrls = new Set();
        
        for (const result of results) {
            if (!seenUrls.has(result.url)) {
                seenUrls.add(result.url);
                uniqueResults.push(result);
            }
        }
        
        // Sort by score (highest first)
        uniqueResults.sort((a, b) => b.score - a.score);
        
        return uniqueResults.slice(0, requestedLimit);
    }

    /**
     * Check if a URL is a navigation link (should be filtered out)
     * @param {string} url - URL to check
     * @returns {boolean} True if this is a navigation link
     */
    isNavigationLink(url) {
        const navPatterns = [
            '/page/',
            '/edit/',
            '/user/',
            '/admin/',
            'javascript:',
            '#',
            'mailto:',
            '/search?',
            '/tag/',
            '/category/'
        ];
        
        return navPatterns.some(pattern => url.includes(pattern));
    }

    /**
     * Extract description from context text
     * @param {string} context - Context text around the link
     * @param {string} linkText - The link text to remove from context
     * @returns {string} Extracted description
     */
    extractDescription(context, linkText) {
        if (!context) return '';
        
        // Remove the link text from context to get description
        let description = context.replace(linkText, '').trim();
        
        // Clean up the description
        description = description.replace(/\s+/g, ' ');
        
        // If description is very short, return context as-is
        if (description.length < 20) {
            description = context;
        }
        
        return description.substring(0, 300); // Limit length
    }

    /**
     * Extract a single result from result HTML (from working search handler)
     * @param {string} resultHtml - HTML content of a single result
     * @param {string} query - Original search query for token matching
     * @returns {Object|null} Result object or null
     */
    extractSingleResultFromHtml(resultHtml, query = '') {
        try {
            // Skip ads
            if (resultHtml.includes('result--ad') || resultHtml.includes('badge--ad')) {
                return null;
            }

            let url = '';
            let title = '';
            let description = '';
            let score = null;
            let state = '';

            // 1) Try modern DDG structure: <h2 class="result__title"><a class="result__a" href="...">Title</a></h2>
            const modernLinkMatch = /<h2[^>]*class=["'][^"']*result__title[^"']*["'][^>]*>\s*<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/s.exec(resultHtml);
            if (modernLinkMatch) {
                url = modernLinkMatch[1];
                title = this.stripHtml(this.decodeHtmlEntities(modernLinkMatch[2])).trim();
            }

            // Decode DuckDuckGo redirect links (uddg param) and normalize URLs
            if (url) {
                const uddg = /uddg=([^&]+)/.exec(url);
                if (uddg) {
                    try {
                        url = decodeURIComponent(uddg[1]);
                    } catch {}
                } else if (url.startsWith('//')) {
                    url = 'https:' + url;
                }
            }

            // 2) Description from modern snippet element if available
            const snippetMatch = /<[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/s.exec(resultHtml);
            if (snippetMatch) {
                description = this.stripHtml(this.decodeHtmlEntities(snippetMatch[1])).trim();
            }

            // 3) Fallbacks: legacy hidden inputs sometimes appear on older DDG HTML
            if (!url || !title) {
                const urlMatch = /<input[^>]*name=["']url["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
                if (urlMatch && !url) url = urlMatch[1];
                const titleMatch = /<input[^>]*name=["']title["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
                if (titleMatch && !title) title = this.decodeHtmlEntities(titleMatch[1]).trim();
                const extractMatch = /<input[^>]*name=["']extract["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
                if (extractMatch && !description) description = this.decodeHtmlEntities(extractMatch[1]).trim();
                const scoreMatch = /<input[^>]*name=["']score["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
                if (scoreMatch) {
                    const v = scoreMatch[1];
                    if (v !== 'None' && v !== '') score = parseFloat(v);
                }
                const stateMatch = /<input[^>]*name=["']state["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
                if (stateMatch) state = stateMatch[1];
            }

            // 4) Generic anchor fallback (prefer result__a if present)
            if (!url) {
                const aMatch = /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/s.exec(resultHtml)
                           || /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/s.exec(resultHtml);
                if (aMatch) {
                    url = aMatch[1];
                    if (!title) title = this.stripHtml(this.decodeHtmlEntities(aMatch[2] || '')).trim();
                    const uddg = /uddg=([^&]+)/.exec(url);
                    if (uddg) {
                        try { url = decodeURIComponent(uddg[1]); } catch {}
                    } else if (url.startsWith('//')) {
                        url = 'https:' + url;
                    }
                }
            }

            // Basic validity
            if (!url || !title) return null;
            if (this.isNavigationLink(url)) return null;

            if (!description || description.length < 10) {
                description = this.stripHtml(resultHtml).replace(title, '').replace(url, '').trim();
            }

            let finalScore = score;
            if (finalScore === null || isNaN(finalScore)) {
                finalScore = this.calculateRelevanceScore(title, description, url, query);
            }

            return {
                title: title.substring(0, 200) || url,
                url,
                description: (description.substring(0, 500) || 'No description available'),
                score: finalScore,
                duckduckgoScore: score,
                state,
                content: null,
                contentLength: 0,
                fetchTimeMs: 0
            };

        } catch (error) {
            console.error(`Error extracting single result: ${error.message}`);
            return null;
        }
    }

    /**
     * Decode HTML entities in text
     * @param {string} text - Text with HTML entities
     * @returns {string} Decoded text
     */
    decodeHtmlEntities(text) {
        if (!text) return '';
        
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&#x27;': "'",
            '&#x2F;': '/',
            '&#x60;': '`',
            '&#x3D;': '='
        };
        
        return text.replace(/&[#\w]+;/g, (entity) => {
            return entities[entity] || entity;
        });
    }

    /**
     * Strip HTML tags from string
     * @param {string} html - HTML string
     * @returns {string} Plain text
     */
    stripHtml(html) {
        return html ? html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
    }

    /**
     * Calculate relevance score for a search result
     * @param {string} title - Result title
     * @param {string} description - Result description
     * @param {string} url - Result URL
     * @param {string} query - Original search query
     * @param {number|null} duckduckgoScore - Original duckduckgo score
     * @returns {number} Calculated relevance score
     */
    calculateRelevanceScore(title, description, url, query, duckduckgoScore) {
        let score = 0;
        
        // Start with duckduckgo's native score if available (highly weighted)
        if (duckduckgoScore !== null && duckduckgoScore !== undefined) {
            score += duckduckgoScore;
        }
        
        // Tokenize query for matching
        const queryTokens = this.tokenizeQuery(query);
        
        // Title relevance (high weight)
        const titleLower = title.toLowerCase();
        for (const token of queryTokens) {
            if (token.length > 2) { // Skip very short tokens
                const wordBoundaryRegex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (wordBoundaryRegex.test(titleLower)) {
                    score += 25; // Exact word match in title
                }
            }
        }
        
        // Bonus for multiple token matches in title
        const titleMatches = queryTokens.filter(token => 
            token.length > 2 && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(titleLower)
        ).length;
        if (titleMatches > 1) {
            score += titleMatches * 10; // Bonus for multiple matches
        }
        
        // Description relevance (medium weight)
        const descLower = description.toLowerCase();
        for (const token of queryTokens) {
            if (token.length > 2) {
                const wordBoundaryRegex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (wordBoundaryRegex.test(descLower)) {
                    score += 10; // Exact word match in description
                }
            }
        }
        
        // URL quality indicators - heavily weighted toward authoritative sources
        const urlLower = url.toLowerCase();
        
        // Wikipedia and major wikis (highest priority)
        if (urlLower.includes('wikipedia.org')) score += 200;
        if (urlLower.includes('wikimedia.org')) score += 180;
        if (urlLower.includes('wikidata.org')) score += 150;
        if (urlLower.includes('wiktionary.org')) score += 140;
        if (urlLower.includes('wikisource.org')) score += 130;
        if (urlLower.includes('wikinews.org')) score += 120;
        if (urlLower.includes('fandom.com')) score += 100; // Wikia/Fandom wikis
        
        // Other encyclopedias and reference sites
        if (urlLower.includes('britannica.com')) score += 180;
        if (urlLower.includes('scholarpedia.org')) score += 160;
        if (urlLower.includes('citizendium.org')) score += 140;
        if (urlLower.includes('knowledia.com')) score += 120;
        if (urlLower.includes('infoplease.com')) score += 110;
        if (urlLower.includes('reference.com')) score += 100;
        if (urlLower.includes('dictionary.com')) score += 100;
        if (urlLower.includes('merriam-webster.com')) score += 100;
        
        // Major news organizations
        if (urlLower.includes('bbc.com') || urlLower.includes('bbc.co.uk')) score += 150;
        if (urlLower.includes('cnn.com')) score += 140;
        if (urlLower.includes('reuters.com')) score += 140;
        if (urlLower.includes('apnews.com')) score += 140;
        if (urlLower.includes('npr.org')) score += 130;
        if (urlLower.includes('theguardian.com')) score += 130;
        if (urlLower.includes('nytimes.com')) score += 130;
        if (urlLower.includes('washingtonpost.com')) score += 130;
        if (urlLower.includes('wsj.com')) score += 130;
        if (urlLower.includes('economist.com')) score += 130;
        if (urlLower.includes('time.com')) score += 120;
        if (urlLower.includes('newsweek.com')) score += 120;
        if (urlLower.includes('usatoday.com')) score += 120;
        if (urlLower.includes('latimes.com')) score += 120;
        if (urlLower.includes('cbsnews.com')) score += 120;
        if (urlLower.includes('abcnews.go.com')) score += 120;
        if (urlLower.includes('nbcnews.com')) score += 120;
        if (urlLower.includes('foxnews.com')) score += 110;
        if (urlLower.includes('politico.com')) score += 110;
        if (urlLower.includes('axios.com')) score += 110;
        if (urlLower.includes('vox.com')) score += 110;
        
        // International news sources
        if (urlLower.includes('aljazeera.com')) score += 130;
        if (urlLower.includes('dw.com')) score += 120; // Deutsche Welle
        if (urlLower.includes('france24.com')) score += 120;
        if (urlLower.includes('rt.com')) score += 100;
        if (urlLower.includes('sputniknews.com')) score += 100;
        if (urlLower.includes('xinhuanet.com')) score += 100;
        if (urlLower.includes('tass.com')) score += 100;
        
        // Academic and educational domains
        if (urlLower.includes('.edu')) score += 120;
        if (urlLower.includes('.ac.uk')) score += 120; // UK academic
        if (urlLower.includes('scholar.google.com')) score += 140;
        if (urlLower.includes('jstor.org')) score += 130;
        if (urlLower.includes('pubmed.ncbi.nlm.nih.gov')) score += 130;
        if (urlLower.includes('arxiv.org')) score += 120;
        if (urlLower.includes('researchgate.net')) score += 110;
        if (urlLower.includes('academia.edu')) score += 100;
        
        // Government and official sources
        if (urlLower.includes('.gov')) score += 110;
        if (urlLower.includes('.mil')) score += 100;
        if (urlLower.includes('un.org')) score += 120;
        if (urlLower.includes('who.int')) score += 120;
        if (urlLower.includes('europa.eu')) score += 110;
        
        // Technology documentation and reputable tech sites
        if (urlLower.includes('stackoverflow.com')) score += 100;
        if (urlLower.includes('github.com')) score += 80;
        if (urlLower.includes('gitlab.com')) score += 70;
        if (urlLower.includes('docs.microsoft.com')) score += 90;
        if (urlLower.includes('developer.mozilla.org')) score += 90;
        if (urlLower.includes('techcrunch.com')) score += 80;
        if (urlLower.includes('arstechnica.com')) score += 80;
        if (urlLower.includes('wired.com')) score += 80;
        if (urlLower.includes('theverge.com')) score += 80;
        
        // General quality domains (lower scores)
        if (urlLower.includes('.org')) score += 40;
        if (urlLower.includes('.net')) score += 20;
        
        return Math.round(score);
    }

    /**
     * Tokenize query for relevance matching
     * @param {string} query - Search query
     * @returns {Array<string>} Array of tokens
     */
    tokenizeQuery(query) {
        return query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
            .split(/\s+/)
            .filter(token => token.length > 0 && !this.stopWords.has(token));
    }

    /**
     * Fetch content for all results in parallel
     * @param {Array} results - Array of search results
     * @param {number} timeout - Timeout in seconds
     */
    async fetchContentForResults(results, timeout) {
        if (!results || results.length === 0) return;
        
        console.log(`Starting content fetch for ${results.length} results. ${this.memoryTracker.getMemorySummary()}`);
        
        // Process results sequentially to monitor memory usage
        let processedCount = 0;
        let skippedCount = 0;
        
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const memoryCheck = this.memoryTracker.checkMemoryLimit(0); // Initial check
            
            if (!memoryCheck.allowed) {
                console.log(`Skipping remaining ${results.length - i} results due to memory limits. ${this.memoryTracker.getMemorySummary()}`);
                for (let j = i; j < results.length; j++) {
                    results[j].contentError = `Skipped due to memory limit (${memoryCheck.reason})`;
                    skippedCount++;
                }
                break;
            }
            
            await this.fetchContentForSingleResult(result, i, results.length, timeout);
            processedCount++;
        }
        
        console.log(`Content fetch completed: ${processedCount} processed, ${skippedCount} skipped. ${this.memoryTracker.getMemorySummary()}`);
    }

    /**
     * Fetch content for all results in parallel with basic memory checks
     * @param {Array} results - Array of search results
     * @param {number} timeout - Timeout in seconds
     */
    async fetchContentForResultsParallel(results, timeout) {
        if (!results || results.length === 0) return;

        console.log(`Starting parallel content fetch for ${results.length} results. ${this.memoryTracker.getMemorySummary()}`);

        const tasks = results.map((result, idx) => (async () => {
            const memoryCheck = this.memoryTracker.checkMemoryLimit(0);
            if (!memoryCheck.allowed) {
                result.contentError = `Skipped due to memory limit (${memoryCheck.reason})`;
                return;
            }
            await this.fetchContentForSingleResult(result, idx, results.length, timeout);
        })());

        await Promise.allSettled(tasks);

        console.log(`Parallel content fetch completed. ${this.memoryTracker.getMemorySummary()}`);
    }

    /**
     * Fetch content for a single result
     * @param {Object} result - Search result object
     * @param {number} index - Index for logging
     * @param {number} total - Total count for logging
     * @param {number} timeout - Timeout in seconds
     */
    async fetchContentForSingleResult(result, index, total, timeout) {
        const startTime = Date.now();
        
        try {
            console.log(`[${index + 1}/${total}] Fetching content from: ${result.url}`);
            
            const rawContent = await this.fetchUrl(result.url, timeout * 1000);
            
            // First try to extract meaningful content from HTML
            let optimizedContent = this.memoryTracker.extractMeaningfulContent(rawContent);
            
            // If meaningful extraction didn't work well, fall back to text conversion
            if (optimizedContent.length < 200) {
                const parser = new SimpleHTMLParser(rawContent);
                const textContent = parser.convertToText(rawContent);
                optimizedContent = this.memoryTracker.cleanContent(textContent);
            }
            
            // Apply content summarization for very long content (increased threshold for 32K)
            if (optimizedContent.length > 5000 && index < 5) { // Increased length threshold and more results
                console.log(`[${index + 1}/${total}] Content is long (${optimizedContent.length} chars), applying summarization...`);
                optimizedContent = await this.summarizeContent(optimizedContent, result.title || result.url);
            }
            
            // Apply token-aware content management
            const finalContent = this.memoryTracker.addContent(optimizedContent);
            
            // Check memory limit for the final content
            const contentSize = Buffer.byteLength(finalContent, 'utf8');
            const memoryCheck = this.memoryTracker.checkMemoryLimit(contentSize);
            
            if (!memoryCheck.allowed && finalContent.length > 500) {
                // Additional truncation if still too large
                const availableBytes = this.memoryTracker.maxAllowedSize - this.memoryTracker.totalContentSize;
                const maxContentLength = Math.max(500, Math.floor(availableBytes / 2));
                
                result.content = finalContent.substring(0, maxContentLength) + '\n\n[Content optimized for token efficiency]';
                result.contentLength = result.content.length;
                result.truncated = true;
                result.originalLength = optimizedContent.length;
                this.memoryTracker.addContentSize(Buffer.byteLength(result.content, 'utf8'));
            } else {
                result.content = finalContent;
                result.contentLength = finalContent.length;
                this.memoryTracker.addContentSize(contentSize);
                console.log(`[${index + 1}/${total}] Content loaded: ${Math.round(contentSize / 1024)}KB. ${this.memoryTracker.getMemorySummary()}`);
            }
            
            result.fetchTimeMs = Date.now() - startTime;
            
        } catch (error) {
            result.contentError = error.message;
            result.fetchTimeMs = Date.now() - startTime;
            console.log(`[${index + 1}/${total}] Error fetching content: ${error.message}`);
        }
    }

    /**
     * Fetch URL with timeout and redirects
     * @param {string} url - URL to fetch
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<string>} Response body
     */
    async fetchUrl(url, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Request timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            const makeRequest = (requestUrl, redirectCount = 0) => {
                if (redirectCount > 5) {
                    clearTimeout(timeout);
                    reject(new Error('Too many redirects'));
                    return;
                }

                const parsedUrl = new URL(requestUrl);
                const isHttps = parsedUrl.protocol === 'https:';
                const client = isHttps ? https : http;
                
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (isHttps ? 443 : 80),
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'identity',
                        'DNT': '1',
                        'Connection': 'close',
                        'Upgrade-Insecure-Requests': '1',
                        'Cache-Control': 'max-age=0'
                    },
                    timeout: timeoutMs
                };

                const req = client.request(options, (res) => {
                    // Handle redirects
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        console.log(`Redirecting to: ${res.headers.location}`);
                        // Handle relative URLs in redirects
                        let redirectUrl;
                        try {
                            redirectUrl = new URL(res.headers.location, requestUrl).toString();
                        } catch (err) {
                            console.log(`Invalid redirect URL: ${res.headers.location}`);
                            clearTimeout(timeout);
                            reject(new Error(`Invalid redirect URL: ${res.headers.location}`));
                            return;
                        }
                        makeRequest(redirectUrl, redirectCount + 1);
                        return;
                    }

                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        clearTimeout(timeout);
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                        return;
                    }

                    let data = '';
                    // Handle compression if any (defensive even though we request identity)
                    let responseStream = res;
                    const encoding = (res.headers['content-encoding'] || '').toLowerCase();
                    try {
                        if (encoding === 'gzip') {
                            const zlib = require('zlib');
                            responseStream = res.pipe(zlib.createGunzip());
                        } else if (encoding === 'deflate') {
                            const zlib = require('zlib');
                            responseStream = res.pipe(zlib.createInflate());
                        } else if (encoding === 'br') {
                            const zlib = require('zlib');
                            if (zlib.createBrotliDecompress) {
                                responseStream = res.pipe(zlib.createBrotliDecompress());
                            }
                        }
                    } catch (e) {
                        // If decompression setup fails, fall back to raw stream
                        responseStream = res;
                    }

                    responseStream.on('data', chunk => data += chunk);
                    responseStream.on('end', () => {
                        clearTimeout(timeout);
                        resolve(data);
                    });
                });

                req.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(new Error(`Failed to fetch ${requestUrl}: ${err.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    clearTimeout(timeout);
                    reject(new Error(`Request timeout after ${timeoutMs}ms`));
                });

                req.end();
            };

            makeRequest(url);
        });
    }

    /**
     * Enhanced fetch method with sophisticated bot detection avoidance for search engines
     * @param {string} url - URL to fetch
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<string>} Response content
     */
    async fetchUrlWithBotAvoidance(url, timeoutMs = 10000) {
        // Add random delay to mimic human behavior
        const delay = Math.floor(Math.random() * 1000) + 500; // 500-1500ms delay
        await new Promise(resolve => setTimeout(resolve, delay));

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Request timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            const makeRequest = (requestUrl, redirectCount = 0) => {
                if (redirectCount > 5) {
                    clearTimeout(timeout);
                    reject(new Error('Too many redirects'));
                    return;
                }

                const parsedUrl = new URL(requestUrl);
                const isHttps = parsedUrl.protocol === 'https:';
                const client = isHttps ? https : http;

                // Randomize user agents and other headers to appear more human
                const userAgents = [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0'
                ];

                const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
                
                // Enhanced headers to mimic real browser behavior
                const headers = {
                    'User-Agent': randomUserAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0'
                };

                // Add referer for search pages to appear as if coming from the search engine's homepage
                if (requestUrl.includes('duckduckgo.com')) {
                    headers['Referer'] = 'https://duckduckgo.com/';
                }

                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (isHttps ? 443 : 80),
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: 'GET',
                    headers: headers,
                    timeout: timeoutMs
                };

                const req = client.request(options, (res) => {
                    // Handle redirects
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        console.log(`Redirecting to: ${res.headers.location}`);
                        let redirectUrl;
                        try {
                            redirectUrl = new URL(res.headers.location, requestUrl).toString();
                        } catch (e) {
                            console.log(`Invalid redirect URL: ${res.headers.location}`);
                            clearTimeout(timeout);
                            reject(new Error(`Invalid redirect URL: ${res.headers.location}`));
                            return;
                        }
                        makeRequest(redirectUrl, redirectCount + 1);
                        return;
                    }

                    let data = '';
                    
                    // Handle compression (gzip/deflate/brotli)
                    let responseStream = res;
                    const encoding = (res.headers['content-encoding'] || '').toLowerCase();
                    try {
                        const zlib = require('zlib');
                        if (encoding === 'gzip') {
                            responseStream = res.pipe(zlib.createGunzip());
                        } else if (encoding === 'deflate') {
                            responseStream = res.pipe(zlib.createInflate());
                        } else if (encoding === 'br' && zlib.createBrotliDecompress) {
                            responseStream = res.pipe(zlib.createBrotliDecompress());
                        }
                    } catch (e) {
                        // If decompression setup fails, stick to raw stream
                        responseStream = res;
                    }

                    responseStream.on('data', chunk => data += chunk);
                    responseStream.on('end', () => {
                        clearTimeout(timeout);
                        resolve(data);
                    });
                });

                req.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(new Error(`Failed to fetch ${requestUrl}: ${err.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    clearTimeout(timeout);
                    reject(new Error(`Request timeout after ${timeoutMs}ms`));
                });

                req.end();
            };

            makeRequest(url);
        });
    }

    // Stub method - this would need to be implemented or removed
    async summarizeContent(content, title) {
        // For now, return the content truncated to avoid errors
        // This method would need LLM integration to work properly
        return content.substring(0, 5000);
    }
}

module.exports = {
    DuckDuckGoSearcher
};