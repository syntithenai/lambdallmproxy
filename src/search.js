/**
 * DuckDuckGo search functionality for web search integration
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { TokenAwareMemoryTracker } = require('./memory-tracker');
const { SimpleHTMLParser } = require('./html-parser');
const { extractContent } = require('./html-content-extractor');

/**
 * Integrated DuckDuckGo scraper for search functionality
 */
class DuckDuckGoSearcher {
    constructor(proxyUsername = null, proxyPassword = null) {
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
        
        // Proxy configuration
        this.proxyAgent = null;
        if (proxyUsername && proxyPassword) {
            try {
                const { HttpsProxyAgent } = require('https-proxy-agent');
                const proxyUrl = `http://${proxyUsername}-rotate:${proxyPassword}@p.webshare.io:80/`;
                this.proxyAgent = new HttpsProxyAgent(proxyUrl);
                console.log(`🔧 DuckDuckGo search - Proxy: ENABLED (${proxyUsername}-rotate@p.webshare.io)`);
            } catch (error) {
                console.error('Failed to create proxy agent for DuckDuckGo:', error);
            }
        } else {
            console.log('🔧 DuckDuckGo search - Proxy: DISABLED');
        }
        
        // Enhanced anti-blocking session management
        this.requestHistory = [];
        this.lastRequestTime = 0;
        this.failureCount = 0;
        this.circuitBreakerOpen = false;
        this.circuitBreakerOpenTime = 0;
        this.minRequestInterval = 2000; // Minimum 2 seconds between requests
        this.maxRequestInterval = 8000; // Maximum 8 seconds for backoff
        this.circuitBreakerTimeout = 60000; // 1 minute timeout for circuit breaker
        this.maxFailures = 3; // Circuit breaker triggers after 3 failures
    }

    /**
     * Enhanced request spacing to avoid burst patterns that trigger rate limiting
     * @returns {Promise<void>} - Resolves after appropriate delay
     */
    async ensureRequestSpacing() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        // Check circuit breaker status
        if (this.circuitBreakerOpen) {
            if (now - this.circuitBreakerOpenTime > this.circuitBreakerTimeout) {
                console.log('🔧 Circuit breaker timeout expired, attempting to close');
                this.circuitBreakerOpen = false;
                this.failureCount = 0;
            } else {
                const timeLeft = Math.ceil((this.circuitBreakerTimeout - (now - this.circuitBreakerOpenTime)) / 1000);
                throw new Error(`Search temporarily disabled due to repeated failures. Retry in ${timeLeft} seconds.`);
            }
        }
        
        // Calculate appropriate delay based on failure count (exponential backoff)
        const baseDelay = this.minRequestInterval;
        const backoffMultiplier = Math.min(Math.pow(2, this.failureCount), 4); // Cap at 4x
        const adaptiveDelay = baseDelay * backoffMultiplier;
        const requiredDelay = Math.min(adaptiveDelay, this.maxRequestInterval);
        
        // Add some randomization to avoid predictable patterns
        const jitter = Math.random() * 1000; // 0-1000ms jitter
        const totalDelay = requiredDelay + jitter;
        
        if (timeSinceLastRequest < totalDelay) {
            const waitTime = totalDelay - timeSinceLastRequest;
            console.log(`⏱️ Request spacing: waiting ${Math.round(waitTime)}ms (failures: ${this.failureCount})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }
    
    /**
     * Track request success/failure for circuit breaker pattern
     * @param {boolean} success - Whether the request was successful
     * @param {string} error - Error message if failed
     */
    trackRequestResult(success, error = null) {
        const now = Date.now();
        
        // Add to request history (keep last 10 requests)
        this.requestHistory.push({
            timestamp: now,
            success: success,
            error: error
        });
        
        if (this.requestHistory.length > 10) {
            this.requestHistory.shift();
        }
        
        if (success) {
            this.failureCount = Math.max(0, this.failureCount - 1); // Reduce failure count on success
            if (this.circuitBreakerOpen && this.failureCount === 0) {
                console.log('✅ Search recovered, closing circuit breaker');
                this.circuitBreakerOpen = false;
            }
        } else {
            this.failureCount++;
            console.log(`❌ Request failed (${this.failureCount}/${this.maxFailures}): ${error}`);
            
            // Open circuit breaker if too many failures
            if (this.failureCount >= this.maxFailures && !this.circuitBreakerOpen) {
                console.log('🚫 Opening circuit breaker due to repeated failures');
                this.circuitBreakerOpen = true;
                this.circuitBreakerOpenTime = now;
            }
        }
    }

    /**
     * Execute search query with intelligent result processing
     * @param {string} query - Search query
     * @param {number} limit - Maximum number of results (default 10)
     * @param {boolean} fetchContent - Whether to fetch full content (default false)
     * @param {number} timeout - Timeout in seconds (default 10)
     * @returns {Promise<Object>} Search results
     */
    async search(query, limit = 10, fetchContent = false, timeout = 10, progressCallback = null) {
        // Apply enhanced request spacing before any search attempt
        await this.ensureRequestSpacing();
        
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
                    
                    // Check for CAPTCHA or error pages - treat as failure for circuit breaker
                    if (html.includes('anomaly') || html.includes('captcha') || html.includes('challenge') || 
                        html.includes('blocked') || html.includes('rate limit') || html.includes('too many requests')) {
                        console.log('⚠️ Bot detection or rate limiting detected');
                        this.trackRequestResult(false, 'CAPTCHA or bot detection triggered');
                        // Don't throw here, let the method complete but with tracking
                    }
                    
                    results = this.extractSearchResults(html, query, limit);
                    console.log(`🔍 Fallback HTML search → ${results.length} results`);
                } catch (fallbackError) {
                    console.log(`❌ HTML search failed: ${fallbackError.message}`);
                }
            }
            
            // Filter results by quality score and exclude DuckDuckGo URLs
            const qualityThreshold = 20; // Minimum score threshold
            const qualityResults = results.filter(result => {
                // Exclude DuckDuckGo URLs - they're not useful to scrape
                if (result.url && result.url.includes('duckduckgo.com')) {
                    return false;
                }
                return result.score >= qualityThreshold;
            });
            
            // Limit processing to top results for efficiency (increased for 32K tokens)
            const maxProcessingLimit = Math.min(8, limit);
            const sortedResults = qualityResults
                .sort((a, b) => b.score - a.score)
                .slice(0, maxProcessingLimit);
            
            console.log(`📊 Results: ${sortedResults.length}/${results.length} selected (quality filtered)`);
            
            const contentTime = Date.now();
            // Fetch content depending on flag; prefer parallel to speed up
            if (sortedResults.length > 0 && fetchContent) {
                await this.fetchContentForResultsParallel(sortedResults, timeout, progressCallback);
            }
            
            // Return the processed results
            const finalResults = sortedResults;
            const totalTime = Date.now() - searchStartTime;
            
            // Track successful request
            this.trackRequestResult(true);
            
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
            
            // Track failed request with specific error context
            const errorMessage = error.message || 'Unknown error';
            this.trackRequestResult(false, errorMessage);
            
            throw new Error(`Search failed: ${errorMessage}`);
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
            '/page/', '/edit/', '/user/', '/admin/', '/login/', '/signup/',
            'javascript:', '#', 'mailto:', '/search?', '/tag/', '/category/',
            '/privacy', '/terms', '/about-us', '/contact', '/sitemap',
            '?share=', '?utm_', '/share/', '/print/', '/pdf/',
            '/cookie-policy', '/disclaimer', '/advertise'
        ];
        
        // Ad and tracking patterns
        const adPatterns = [
            'doubleclick.', 'googlesyndication.', 'googleadservices.',
            'advertising.', 'outbrain.', 'taboola.', 'criteo.',
            '/ad/', '/ads/', '/banner/', '/promo/'
        ];
        
        const urlLower = url.toLowerCase();
        return navPatterns.some(pattern => urlLower.includes(pattern)) ||
               adPatterns.some(pattern => urlLower.includes(pattern));
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
     * Calculate relevance score for a search result using multiple weighted techniques
     * @param {string} title - Result title
     * @param {string} description - Result description
     * @param {string} url - Result URL
     * @param {string} query - Original search query
     * @param {number|null} duckduckgoScore - Original duckduckgo score
     * @returns {number} Calculated relevance score
     */
    calculateRelevanceScore(title, description, url, query, duckduckgoScore) {
        let score = 0;
        
        // Start with duckduckgo's native score if available (heavily weighted - 40% of base)
        if (duckduckgoScore !== null && duckduckgoScore !== undefined) {
            score += duckduckgoScore * 1.2; // Boost DDG score by 20%
        }
        
        // Tokenize query for matching
        const queryTokens = this.tokenizeQuery(query);
        const titleLower = title.toLowerCase();
        const descLower = description.toLowerCase();
        const urlLower = url.toLowerCase();
        
        // 1. EXACT PHRASE MATCHING (highest priority)
        const queryLower = query.toLowerCase();
        if (titleLower.includes(queryLower)) {
            score += 80; // Full query phrase in title
        }
        if (descLower.includes(queryLower)) {
            score += 40; // Full query phrase in description
        }
        
        // 2. TERM FREQUENCY AND POSITION SCORING
        const titleTermFreq = this.calculateTermFrequency(titleLower, queryTokens);
        const descTermFreq = this.calculateTermFrequency(descLower, queryTokens);
        
        // Title term frequency (high weight)
        score += titleTermFreq * 15;
        
        // Description term frequency (medium weight)
        score += descTermFreq * 8;
        
        // 3. POSITION-BASED SCORING (earlier mentions = higher relevance)
        score += this.calculatePositionScore(titleLower, queryTokens, 30); // Title position weight
        score += this.calculatePositionScore(descLower, queryTokens, 15); // Description position weight
        
        // 4. INDIVIDUAL TERM MATCHING (word boundary matching)
        let titleMatches = 0;
        let descMatches = 0;
        
        for (const token of queryTokens) {
            if (token.length > 2) { // Skip very short tokens
                const wordBoundaryRegex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                
                if (wordBoundaryRegex.test(titleLower)) {
                    score += 25; // Exact word match in title
                    titleMatches++;
                }
                
                if (wordBoundaryRegex.test(descLower)) {
                    score += 12; // Exact word match in description
                    descMatches++;
                }
                
                // URL path matching (for technical content)
                if (wordBoundaryRegex.test(urlLower)) {
                    score += 8; // Word match in URL path
                }
            }
        }
        
        // 5. COVERAGE BONUS (percentage of query terms found)
        const totalTokens = queryTokens.filter(t => t.length > 2).length;
        if (totalTokens > 0) {
            const titleCoverage = titleMatches / totalTokens;
            const descCoverage = descMatches / totalTokens;
            
            score += titleCoverage * 50; // Title coverage bonus
            score += descCoverage * 25;  // Description coverage bonus
            
            // Extra bonus for complete coverage
            if (titleCoverage >= 0.8) score += 30;
            if (descCoverage >= 0.8) score += 15;
        }
        
        // 6. TERM PROXIMITY SCORING (terms appearing close together)
        score += this.calculateProximityScore(titleLower, queryTokens, 20);
        score += this.calculateProximityScore(descLower, queryTokens, 10);
        
        // 7. URL QUALITY INDICATORS - heavily weighted toward authoritative sources
        // Domain authority scoring with recency and freshness factors
        const domainScore = this.calculateDomainAuthorityScore(urlLower);
        score += domainScore;
        
        // 8. URL STRUCTURE QUALITY
        score += this.calculateUrlStructureScore(urlLower, queryTokens);
        
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
     * Calculate term frequency for given tokens in text
     * @param {string} text - Text to analyze
     * @param {Array<string>} tokens - Tokens to count
     * @returns {number} Total frequency score
     */
    calculateTermFrequency(text, tokens) {
        let totalFreq = 0;
        for (const token of tokens) {
            if (token.length > 2) {
                const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                const matches = text.match(regex);
                if (matches) {
                    totalFreq += matches.length;
                }
            }
        }
        return totalFreq;
    }

    /**
     * Calculate position-based scoring (earlier = better)
     * @param {string} text - Text to analyze
     * @param {Array<string>} tokens - Tokens to find
     * @param {number} weight - Weight multiplier
     * @returns {number} Position score
     */
    calculatePositionScore(text, tokens, weight) {
        let positionScore = 0;
        const textLength = text.length;
        
        for (const token of tokens) {
            if (token.length > 2) {
                const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                const match = regex.exec(text);
                if (match) {
                    // Earlier positions get higher scores (inverse of position percentage)
                    const position = match.index / textLength;
                    positionScore += weight * (1 - position);
                }
            }
        }
        return positionScore;
    }

    /**
     * Calculate proximity score for terms appearing close together
     * @param {string} text - Text to analyze
     * @param {Array<string>} tokens - Tokens to find
     * @param {number} weight - Weight multiplier
     * @returns {number} Proximity score
     */
    calculateProximityScore(text, tokens, weight) {
        if (tokens.length < 2) return 0;
        
        let proximityScore = 0;
        const positions = [];
        
        // Find positions of all tokens
        for (const token of tokens) {
            if (token.length > 2) {
                const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                let match;
                while ((match = regex.exec(text)) !== null) {
                    positions.push({ token, position: match.index });
                }
            }
        }
        
        // Calculate proximity bonuses for terms appearing within 50 characters
        for (let i = 0; i < positions.length - 1; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                if (positions[i].token !== positions[j].token) {
                    const distance = Math.abs(positions[i].position - positions[j].position);
                    if (distance <= 50) {
                        proximityScore += weight * (50 - distance) / 50;
                    }
                }
            }
        }
        
        return proximityScore;
    }

    /**
     * Calculate domain authority score based on URL
     * @param {string} urlLower - Lowercase URL
     * @returns {number} Domain authority score
     */
    calculateDomainAuthorityScore(urlLower) {
        let domainScore = 0;
        
        // TLD quality scoring
        if (urlLower.includes('.edu')) domainScore += 120;
        else if (urlLower.includes('.gov')) domainScore += 110;
        else if (urlLower.includes('.org')) domainScore += 60;
        else if (urlLower.includes('.mil')) domainScore += 100;
        else if (urlLower.includes('.ac.uk')) domainScore += 120;
        else if (urlLower.includes('.com')) domainScore += 20;
        else if (urlLower.includes('.net')) domainScore += 15;
        
        // Subdomain penalties (often lower quality)
        const subdomainCount = (urlLower.match(/\./g) || []).length;
        if (subdomainCount > 2) {
            domainScore -= (subdomainCount - 2) * 5;
        }
        
        return domainScore;
    }

    /**
     * Calculate URL structure quality score
     * @param {string} urlLower - Lowercase URL
     * @param {Array<string>} queryTokens - Query tokens
     * @returns {number} URL structure score
     */
    calculateUrlStructureScore(urlLower, queryTokens) {
        let structureScore = 0;
        
        // Penalize very long URLs (often low quality)
        if (urlLower.length > 100) {
            structureScore -= 10;
        }
        
        // Bonus for clean URL structure
        if (!urlLower.includes('?') && !urlLower.includes('&')) {
            structureScore += 5;
        }
        
        // Penalize URLs with suspicious patterns
        const suspiciousPatterns = ['redirect', 'proxy', 'cache', 'amp'];
        for (const pattern of suspiciousPatterns) {
            if (urlLower.includes(pattern)) {
                structureScore -= 15;
            }
        }
        
        // Bonus for query terms in URL path
        for (const token of queryTokens) {
            if (token.length > 2 && urlLower.includes(token)) {
                structureScore += 8;
            }
        }
        
        return structureScore;
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
    async fetchContentForResultsParallel(results, timeout, progressCallback = null) {
        if (!results || results.length === 0) return;

        console.log(`Starting parallel content fetch for ${results.length} results. ${this.memoryTracker.getMemorySummary()}`);

        const tasks = results.map((result, idx) => (async () => {
            const memoryCheck = this.memoryTracker.checkMemoryLimit(0);
            if (!memoryCheck.allowed) {
                result.contentError = `Skipped due to memory limit (${memoryCheck.reason})`;
                return;
            }
            await this.fetchContentForSingleResult(result, idx, results.length, timeout, progressCallback);
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
     * @param {Function} progressCallback - Optional callback to report progress
     */
    async fetchContentForSingleResult(result, index, total, timeout, progressCallback = null) {
        const startTime = Date.now();
        
        try {
            console.log(`[${index + 1}/${total}] Fetching content from: ${result.url}`);
            
            // Emit progress event when starting to fetch this result
            if (progressCallback) {
                progressCallback({
                    phase: 'fetching_result',
                    result_index: index + 1,
                    result_total: total,
                    url: result.url,
                    title: result.title || result.url
                });
            }
            
            const rawContent = await this.fetchUrl(result.url, timeout * 1000);
            
            // Store raw HTML for image and link extraction
            result.rawHtml = rawContent;
            
            // Extract images, videos, and media from HTML
            try {
                const htmlParser = new SimpleHTMLParser(rawContent, query, result.url);
                const images = htmlParser.extractImages(10); // Get up to 10 images
                const links = htmlParser.extractLinks(30); // Get top 30 most relevant links
                const categorized = htmlParser.categorizeLinks(links);
                
                // Transform images to expected format (extractImages returns {src, alt, title, caption, ...})
                const formattedImages = (images || []).map(img => ({
                    src: img.src,
                    alt: img.alt || img.title || img.caption || 'Image',
                    title: img.title || img.alt
                }));
                
                // Transform video links to expected format (links have {href, text, caption, ...})
                const formattedYouTube = (categorized.youtube || []).map(link => ({
                    src: link.href,
                    title: link.text || link.caption || 'YouTube Video'
                }));
                
                const formattedVideos = (categorized.video || []).map(link => ({
                    src: link.href,
                    title: link.text || link.caption || 'Video'
                }));
                
                // Transform media links to expected format
                const formattedMedia = [
                    ...(categorized.audio || []).map(link => ({
                        src: link.href,
                        type: 'audio',
                        title: link.text || link.caption || 'Audio'
                    })),
                    ...(categorized.media || []).map(link => ({
                        src: link.href,
                        type: 'media',
                        title: link.text || link.caption || 'Media'
                    }))
                ];
                
                // Transform regular links for UI
                const formattedLinks = (categorized.regular || []).map(link => ({
                    href: link.href,
                    text: link.text || link.caption || link.href,
                    title: link.caption || link.text,
                    relevance: link.relevance || 0
                }));
                
                // Store in page_content for UI extraction
                result.page_content = {
                    images: formattedImages,
                    videos: [...formattedYouTube, ...formattedVideos],
                    media: formattedMedia,
                    links: formattedLinks // Add all regular links
                };
                
                console.log(`[${index + 1}/${total}] Extracted ${formattedImages.length} images, ${formattedYouTube.length} YouTube + ${formattedVideos.length} videos, ${formattedMedia.length} media, ${formattedLinks.length} links`);
                console.log(`[${index + 1}/${total}] DEBUG: result.page_content set:`, JSON.stringify(result.page_content).substring(0, 200));
            } catch (parseError) {
                console.log(`[${index + 1}/${total}] Failed to extract media: ${parseError.message}`);
                result.page_content = { images: [], videos: [], media: [] };
            }
            
            // Use new HTML content extractor to convert to Markdown (preferred) or plain text
            const extracted = extractContent(rawContent);
            
            console.log(`[${index + 1}/${total}] Extracted ${extracted.format} content: ${extracted.originalLength} → ${extracted.extractedLength} chars (${extracted.compressionRatio}x compression)`);
            
            let optimizedContent = extracted.content;
            
            // Store extraction metadata
            result.contentFormat = extracted.format;
            result.originalContentLength = extracted.originalLength;
            result.compressionRatio = extracted.compressionRatio;
            
            if (extracted.warning) {
                console.log(`[${index + 1}/${total}] Warning: ${extracted.warning}`);
            }
            
            // If extraction yielded very little content, fall back to old method
            if (optimizedContent.length < 200) {
                console.log(`[${index + 1}/${total}] Extracted content too short, trying fallback extraction...`);
                optimizedContent = this.memoryTracker.extractMeaningfulContent(rawContent);
                
                if (optimizedContent.length < 200) {
                    const parser = new SimpleHTMLParser(rawContent);
                    const textContent = parser.convertToText(rawContent);
                    optimizedContent = this.memoryTracker.cleanContent(textContent);
                }
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
                console.log(`[${index + 1}/${total}] Content loaded: ${Math.round(contentSize / 1024)}KB (${result.contentFormat} format). ${this.memoryTracker.getMemorySummary()}`);
            }
            
            result.fetchTimeMs = Date.now() - startTime;
            
            // Emit progress event when result fetch is complete
            if (progressCallback) {
                progressCallback({
                    phase: 'result_loaded',
                    result_index: index + 1,
                    result_total: total,
                    url: result.url,
                    title: result.title || result.url,
                    content_size: result.contentLength || 0,
                    fetch_time_ms: result.fetchTimeMs
                });
            }
            
        } catch (error) {
            result.contentError = error.message;
            result.fetchTimeMs = Date.now() - startTime;
            console.log(`[${index + 1}/${total}] Error fetching content: ${error.message}`);
            
            // Emit progress event for failed fetch
            if (progressCallback) {
                progressCallback({
                    phase: 'result_failed',
                    result_index: index + 1,
                    result_total: total,
                    url: result.url,
                    title: result.title || result.url,
                    error: error.message
                });
            }
        }
    }

    /**
     * Fetch URL with timeout and redirects
     * Automatically falls back to direct connection if proxy fails
     * @param {string} url - URL to fetch
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<string>} Response body
     */
    async fetchUrl(url, timeoutMs = 10000) {
        return new Promise(async (resolve, reject) => {
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
                
                // Add proxy agent if available (will fallback to direct if proxy fails)
                const usingProxy = this.proxyAgent && isHttps;
                if (usingProxy) {
                    options.agent = this.proxyAgent;
                }

                const req = client.request(options, (res) => {
                    // Handle redirects (301, 302, 303, 307, 308)
                    if ((res.statusCode >= 300 && res.statusCode < 400) || res.statusCode === 308) {
                        const location = res.headers.location || res.headers.Location;
                        if (location) {
                            console.log(`Redirecting from ${requestUrl} to: ${location} (${res.statusCode})`);
                            // Handle relative URLs in redirects
                            let redirectUrl;
                            try {
                                // Support both absolute and relative redirect URLs
                                if (location.startsWith('http://') || location.startsWith('https://')) {
                                    redirectUrl = location;
                                } else if (location.startsWith('//')) {
                                    redirectUrl = parsedUrl.protocol + location;
                                } else if (location.startsWith('/')) {
                                    redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${location}`;
                                } else {
                                    // Relative to current path
                                    const basePath = parsedUrl.pathname.substring(0, parsedUrl.pathname.lastIndexOf('/') + 1);
                                    redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${basePath}${location}`;
                                }
                            } catch (err) {
                                console.log(`Invalid redirect URL: ${location}`);
                                clearTimeout(timeout);
                                reject(new Error(`Invalid redirect URL: ${location}`));
                                return;
                            }
                            
                            // Drain the response body before following redirect
                            res.resume();
                            makeRequest(redirectUrl, redirectCount + 1);
                            return;
                        }
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
                    // Mark proxy-related errors for fallback handling
                    if (usingProxy && (err.message.includes('proxy') || err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT') || err.code === 'ECONNRESET' || err.code === 'ENOTFOUND')) {
                        reject(new Error(`PROXY_FAILED:${err.message}`));
                    } else {
                        reject(new Error(`Failed to fetch ${requestUrl}: ${err.message}`));
                    }
                });

                req.on('timeout', () => {
                    req.destroy();
                    clearTimeout(timeout);
                    if (usingProxy) {
                        reject(new Error(`PROXY_FAILED:Request timeout after ${timeoutMs}ms`));
                    } else {
                        reject(new Error(`Request timeout after ${timeoutMs}ms`));
                    }
                });

                req.end();
            };

            // Try with proxy first, fallback to direct if proxy fails
            try {
                await makeRequest(url);
            } catch (error) {
                if (this.proxyAgent && error.message.startsWith('PROXY_FAILED:')) {
                    const originalError = error.message.replace('PROXY_FAILED:', '');
                    console.log(`⚠️ Proxy failed (${originalError}), retrying direct connection...`);
                    // Temporarily disable proxy for retry
                    const originalProxyAgent = this.proxyAgent;
                    this.proxyAgent = null;
                    try {
                        await makeRequest(url);
                        console.log(`✅ Direct connection successful`);
                    } catch (retryError) {
                        // Restore proxy agent
                        this.proxyAgent = originalProxyAgent;
                        clearTimeout(timeout);
                        reject(new Error(`Both proxy and direct connection failed: ${retryError.message}`));
                        return;
                    }
                    // Restore proxy agent
                    this.proxyAgent = originalProxyAgent;
                } else {
                    clearTimeout(timeout);
                    reject(error);
                    return;
                }
            }
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

                // Enhanced browser fingerprint pool with matched headers for better legitimacy
                const browserFingerprints = [
                    // Chrome on Windows
                    {
                        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        acceptLanguage: 'en-US,en;q=0.9',
                        platform: 'Win32'
                    },
                    {
                        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                        acceptLanguage: 'en-US,en;q=0.9,es;q=0.8',
                        platform: 'Win32'
                    },
                    {
                        userAgent: 'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        acceptLanguage: 'en-US,en;q=0.9',
                        platform: 'Win32'
                    },
                    // Chrome on macOS
                    {
                        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        acceptLanguage: 'en-US,en;q=0.9',
                        platform: 'MacIntel'
                    },
                    {
                        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                        acceptLanguage: 'en-US,en;q=0.9,fr;q=0.8',
                        platform: 'MacIntel'
                    },
                    // Firefox on Windows
                    {
                        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
                        acceptLanguage: 'en-US,en;q=0.5',
                        platform: 'Win32'
                    },
                    {
                        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0',
                        acceptLanguage: 'en-US,en;q=0.5',
                        platform: 'Win32'
                    },
                    // Firefox on macOS
                    {
                        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
                        acceptLanguage: 'en-US,en;q=0.5',
                        platform: 'MacIntel'
                    },
                    // Safari on macOS
                    {
                        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
                        acceptLanguage: 'en-US,en;q=0.9',
                        platform: 'MacIntel'
                    },
                    {
                        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
                        acceptLanguage: 'en-US,en;q=0.9',
                        platform: 'MacIntel'
                    },
                    // Chrome on Linux
                    {
                        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        acceptLanguage: 'en-US,en;q=0.9',
                        platform: 'Linux x86_64'
                    },
                    {
                        userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
                        acceptLanguage: 'en-US,en;q=0.5',
                        platform: 'Linux x86_64'
                    },
                    // Edge on Windows
                    {
                        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
                        acceptLanguage: 'en-US,en;q=0.9',
                        platform: 'Win32'
                    },
                    // Mobile browsers for variety
                    {
                        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
                        acceptLanguage: 'en-US,en;q=0.9',
                        platform: 'iPhone'
                    },
                    {
                        userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0',
                        acceptLanguage: 'en-US,en;q=0.5',
                        platform: 'Linux armv7l'
                    }
                ];

                const randomFingerprint = browserFingerprints[Math.floor(Math.random() * browserFingerprints.length)];
                
                // Randomized Accept-Encoding to vary compression preferences
                const acceptEncodings = [
                    'gzip, deflate, br',
                    'gzip, deflate, br, zstd',
                    'gzip, deflate',
                    'br, gzip, deflate'
                ];
                
                // Randomized DNT header (some users have it, some don't)
                const dntValue = Math.random() > 0.3 ? '1' : undefined;
                
                // Enhanced headers with randomized fingerprinting
                const headers = {
                    'User-Agent': randomFingerprint.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': randomFingerprint.acceptLanguage,
                    'Accept-Encoding': acceptEncodings[Math.floor(Math.random() * acceptEncodings.length)],
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': Math.random() > 0.5 ? 'max-age=0' : 'no-cache'
                };
                
                // Conditionally add DNT header (not all browsers send it)
                if (dntValue) {
                    headers['DNT'] = dntValue;
                }
                
                // Add randomized viewport hints for Chrome-based browsers
                if (randomFingerprint.userAgent.includes('Chrome') && Math.random() > 0.7) {
                    headers['Sec-CH-UA-Platform'] = `"${randomFingerprint.platform}"`;
                    headers['Sec-CH-UA'] = '"Not_A Brand";v="8", "Chromium";v="120"';
                    headers['Sec-CH-UA-Mobile'] = randomFingerprint.platform === 'iPhone' ? '?1' : '?0';
                }

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