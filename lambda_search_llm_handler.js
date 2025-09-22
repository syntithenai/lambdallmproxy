/**
 * AWS Lambda handler for intelligent search + LLM response
 * Combines DuckDuckGo search functionality with LLM processing to provide
 * comprehensive answers with citations and source references
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

// Provider configuration
const PROVIDERS = {
    openai: {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        envKey: 'OPENAI_API_KEY',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    groq: {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        envKey: 'GROQ_API_KEY',
        models: ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'gemma-7b-it']
    }
};

// Helper function to parse provider and model from model string
function parseProviderModel(modelString) {
    if (modelString.includes(':')) {
        const [provider, model] = modelString.split(':', 2);
        return { provider, model };
    }
    // Fallback for backward compatibility
    return { provider: 'groq', model: modelString };
}

// Helper function to get API configuration for a provider
function getProviderConfig(provider) {
    const config = PROVIDERS[provider];
    if (!config) {
        throw new Error(`Unsupported provider: ${provider}`);
    }
    return config;
}

// Memory management constants
const LAMBDA_MEMORY_LIMIT_MB = 128;
const MEMORY_SAFETY_BUFFER_MB = 16; // Reserve 16MB for other operations
const MAX_CONTENT_SIZE_MB = LAMBDA_MEMORY_LIMIT_MB - MEMORY_SAFETY_BUFFER_MB;
const BYTES_PER_MB = 1024 * 1024;

// System prompt configurations - can be overridden via POST request
const DEFAULT_SYSTEM_PROMPTS = {
    decision: 'You are a helpful assistant that determines whether a question can be answered directly or requires web search for fact-checking. Always respond with valid JSON only.',
    direct: 'You are a helpful assistant. Answer the user\'s question directly based on your knowledge. Be comprehensive and informative.',
    search: 'You are a helpful research assistant. Use the provided search results to answer questions comprehensively. Always cite specific sources using the URLs provided when making factual claims. Format your response in a clear, organized manner.'
};

const DEFAULT_DECISION_TEMPLATE = `Analyze this question and determine if you can answer it directly or if it requires web search for fact-checking.

IMPORTANT: Respond ONLY with valid JSON in one of these formats:

For questions you can answer directly (general knowledge, explanations, creative tasks, personal advice):
{"response": "Your complete answer here"}

For questions requiring current facts, recent events, specific data, or verification:
{"search_terms": "optimized search terms here"}

Guidelines:
- Use "response" for: general knowledge, how-to questions, explanations, creative writing, personal advice
- Use "search_terms" for: current events, recent data, specific facts, company information, recent research
- If using search_terms, optimize them for web search (remove question words, focus on key terms)

Question: "{{QUERY}}"

JSON Response:`;

const DEFAULT_SEARCH_TEMPLATE = `Please answer the following question using the search results provided below. 

IMPORTANT INSTRUCTIONS:
- Provide a comprehensive, well-structured answer
- Reference specific sources by including the URLs in your response
- When stating facts, cite the relevant sources using phrases like "According to [URL]" or "As noted in [URL]"
- If multiple sources confirm the same information, mention that
- If sources contradict each other, acknowledge the different perspectives
- Be clear about what information comes from which source
- If the search results don't fully answer the question, indicate what's missing

QUESTION: {{QUERY}}

SEARCH RESULTS:
{{SEARCH_CONTEXT}}

Please provide your answer:`;

/**
 * Memory tracking utility for Lambda function
 */
class MemoryTracker {
    constructor() {
        this.totalContentSize = 0;
        this.maxAllowedSize = MAX_CONTENT_SIZE_MB * BYTES_PER_MB;
    }

    /**
     * Get current memory usage
     * @returns {Object} Memory usage statistics
     */
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: usage.rss,
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external,
            rssMB: Math.round(usage.rss / BYTES_PER_MB * 100) / 100,
            heapUsedMB: Math.round(usage.heapUsed / BYTES_PER_MB * 100) / 100,
            contentSizeMB: Math.round(this.totalContentSize / BYTES_PER_MB * 100) / 100
        };
    }

    /**
     * Check if adding content would exceed memory limits
     * @param {number} additionalSize - Size of content to add in bytes
     * @returns {Object} Check result with allowed status and details
     */
    checkMemoryLimit(additionalSize) {
        const currentUsage = this.getMemoryUsage();
        const newContentSize = this.totalContentSize + additionalSize;
        const newContentSizeMB = newContentSize / BYTES_PER_MB;
        
        const wouldExceedContentLimit = newContentSize > this.maxAllowedSize;
        const wouldExceedHeapLimit = (currentUsage.heapUsed + additionalSize) > (LAMBDA_MEMORY_LIMIT_MB * BYTES_PER_MB * 0.8);
        
        return {
            allowed: !wouldExceedContentLimit && !wouldExceedHeapLimit,
            currentContentSizeMB: Math.round(this.totalContentSize / BYTES_PER_MB * 100) / 100,
            additionalSizeMB: Math.round(additionalSize / BYTES_PER_MB * 100) / 100,
            newContentSizeMB: Math.round(newContentSizeMB * 100) / 100,
            maxAllowedMB: MAX_CONTENT_SIZE_MB,
            currentHeapUsedMB: currentUsage.heapUsedMB,
            reason: wouldExceedContentLimit ? 'Content size limit exceeded' : 
                   wouldExceedHeapLimit ? 'Heap memory limit would be exceeded' : 'OK'
        };
    }

    /**
     * Add content size to tracking
     * @param {number} size - Size in bytes
     */
    addContentSize(size) {
        this.totalContentSize += size;
    }

    /**
     * Get memory usage summary for logging
     * @returns {string} Formatted memory usage string
     */
    getMemorySummary() {
        const usage = this.getMemoryUsage();
        return `Memory: RSS=${usage.rssMB}MB, Heap=${usage.heapUsedMB}MB, Content=${usage.contentSizeMB}MB`;
    }
}

/**
 * Simple HTML parser for extracting links and text
 */
class SimpleHTMLParser {
    constructor(html) {
        this.html = html;
    }

    /**
     * Extract all links from HTML
     * @returns {Array} Array of {href, text, context} objects
     */
    extractLinks() {
        const links = [];
        const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
        let match;

        while ((match = linkRegex.exec(this.html)) !== null) {
            const href = match[1];
            const innerHTML = match[2];
            const text = this.stripHtml(innerHTML).trim();
            
            if (href && text) {
                // Get context around the link
                const linkStart = match.index;
                const contextStart = Math.max(0, linkStart - 200);
                const contextEnd = Math.min(this.html.length, linkStart + match[0].length + 200);
                const context = this.stripHtml(this.html.substring(contextStart, contextEnd)).trim();
                
                links.push({
                    href: href,
                    text: text,
                    context: context
                });
            }
        }

        return links;
    }

    /**
     * Convert HTML to plain text
     * @param {string} html - HTML content
     * @returns {string} Plain text content
     */
    convertToText(html) {
        if (!html) return '';

        let text = html;

        // Extract content from main content areas first
        const mainContentPatterns = [
            /<main[^>]*>(.*?)<\/main>/is,
            /<article[^>]*>(.*?)<\/article>/is,
            /<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/is,
            /<div[^>]*id="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/is,
        ];

        let mainContent = '';
        for (const pattern of mainContentPatterns) {
            const match = text.match(pattern);
            if (match) {
                mainContent = match[1];
                break;
            }
        }

        // Use main content if found, otherwise use full page
        text = mainContent || text;

        // Remove script and style elements
        text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        
        // Remove navigation and sidebar elements
        text = text.replace(/<nav\b[^>]*>.*?<\/nav>/gis, '');
        text = text.replace(/<aside\b[^>]*>.*?<\/aside>/gis, '');
        text = text.replace(/<header\b[^>]*>.*?<\/header>/gis, '');
        text = text.replace(/<footer\b[^>]*>.*?<\/footer>/gis, '');

        // Remove all remaining HTML tags
        text = text.replace(/<[^>]*>/g, ' ');
        
        // Clean up whitespace
        text = text.replace(/\s+/g, ' ').trim();
        
        return text;
    }

    /**
     * Strip HTML tags from string
     * @param {string} html - HTML string
     * @returns {string} Plain text
     */
    stripHtml(html) {
        return html ? html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
    }
}

/**
 * Integrated DuckDuckGo scraper for search functionality
 */
class DuckDuckGoSearcher {
    constructor() {
        this.baseUrl = 'https://duckduckgo.com/';
        this.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        this.memoryTracker = new MemoryTracker();
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
            // Use HTML version of DuckDuckGo for consistent parsing
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            
            const searchTime = Date.now();
            const html = await this.fetchUrl(searchUrl, timeout * 1000);
            const parseTime = Date.now();
            
            const results = this.extractSearchResults(html, query, limit);
            
            // Sort by score and take only the requested limit for final processing
            const sortedResults = results
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
            
            const contentTime = Date.now();
            // Always fetch content for LLM processing (required for quality responses)
            if (sortedResults.length > 0) {
                await this.fetchContentForResults(sortedResults, timeout);
            }
            
            // Return only the requested number of results
            const finalResults = sortedResults.slice(0, limit);
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
        
        // Look for DuckDuckGo specific result structure
        // HTML version uses table-based results
        const resultPatterns = [
            /<table[^>]*class="[^"]*result[^"]*"[^>]*>(.*?)<\/table>/gs,
            /<div[^>]*class="[^"]*result[^"]*"[^>]*>(.*?)<\/div>/gs,
            /<div[^>]*class="[^"]*web-result[^"]*"[^>]*>(.*?)<\/div>/gs
        ];
        
        let foundResults = false;
        for (const pattern of resultPatterns) {
            let match;
            while ((match = pattern.exec(parser.html)) !== null) {
                const resultHtml = match[1];
                const result = this.extractSingleResultFromHtml(resultHtml, query);
                if (result) {
                    results.push(result);
                    foundResults = true;
                }
            }
            if (foundResults) break;
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
            // Extract data from hidden input fields first (these contain the canonical data)
            let url = '';
            let title = '';
            let description = '';
            let score = null;
            let state = '';
            
            // Extract URL from hidden input
            const urlMatch = /<input[^>]*name=["']url["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
            if (urlMatch) {
                url = urlMatch[1];
            }
            
            // Extract title from hidden input
            const titleMatch = /<input[^>]*name=["']title["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
            if (titleMatch) {
                title = this.decodeHtmlEntities(titleMatch[1]).trim();
            }
            
            // Extract description from hidden input
            const extractMatch = /<input[^>]*name=["']extract["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
            if (extractMatch) {
                description = this.decodeHtmlEntities(extractMatch[1]).trim();
            }
            
            // Extract score from hidden input
            const scoreMatch = /<input[^>]*name=["']score["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
            if (scoreMatch) {
                const scoreValue = scoreMatch[1];
                if (scoreValue !== 'None' && scoreValue !== '') {
                    score = parseFloat(scoreValue);
                }
            }
            
            // Extract state from hidden input  
            const stateMatch = /<input[^>]*name=["']state["'][^>]*value=["']([^"']*)["']/s.exec(resultHtml);
            if (stateMatch) {
                state = stateMatch[1];
            }
            
            // If we didn't get URL from hidden input, try to extract from link
            if (!url) {
                const linkMatch = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/s.exec(resultHtml);
                if (!linkMatch) return null;
                url = linkMatch[1];
            }
            
            if (!url || !url.startsWith('http')) return null;
            
            // If we didn't get title from hidden input, try to extract from visible elements
            if (!title) {
                const visibleTitleMatch = /<p[^>]*class=['"]title['"][^>]*>(.*?)<\/p>/s.exec(resultHtml);
                if (visibleTitleMatch) {
                    title = this.stripHtml(visibleTitleMatch[1]).trim();
                }
            }
            
            // If we didn't get description from hidden input, try to extract from visible elements
            if (!description) {
                const visibleExtractMatch = /<p[^>]*class=['"]extract['"][^>]*>(.*?)<\/p>/s.exec(resultHtml);
                if (visibleExtractMatch) {
                    description = this.stripHtml(visibleExtractMatch[1]).trim();
                }
            }
            
            // If no description found, try to get text from the result
            if (!description || description.length < 10) {
                description = this.stripHtml(resultHtml)
                    .replace(title, '')
                    .replace(url, '')
                    .trim();
            }
            
            // Calculate a composite score if duckduckgo score is not available
            let finalScore = score;
            if (finalScore === null || isNaN(finalScore)) {
                finalScore = this.calculateRelevanceScore(title, description, url, query);
            }
            
            return {
                title: title.substring(0, 200) || url,
                url: url,
                description: (description.substring(0, 500) || "No description available"),
                score: finalScore,
                duckduckgoScore: score, // Keep original duckduckgo score for reference
                state: state
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
            
            const content = await this.fetchUrl(result.url, timeout * 1000);
            const parser = new SimpleHTMLParser(content);
            const textContent = parser.convertToText(content);
            
            // Check memory limit before storing content
            const contentSize = Buffer.byteLength(textContent, 'utf8');
            const memoryCheck = this.memoryTracker.checkMemoryLimit(contentSize);
            
            if (!memoryCheck.allowed) {
                console.log(`[${index + 1}/${total}] Content too large, truncating. ${memoryCheck.reason}. Size: ${memoryCheck.additionalSizeMB}MB, Current: ${memoryCheck.currentContentSizeMB}MB`);
                
                // Truncate content to fit within memory limits
                const availableBytes = this.memoryTracker.maxAllowedSize - this.memoryTracker.totalContentSize;
                const maxContentLength = Math.floor(availableBytes / 2); // Use UTF-8 safe estimate
                
                if (maxContentLength > 1000) {
                    const truncatedContent = textContent.substring(0, maxContentLength);
                    result.content = truncatedContent + '\n\n[Content truncated due to memory limits]';
                    result.contentLength = result.content.length;
                    result.truncated = true;
                    result.originalLength = textContent.length;
                    this.memoryTracker.addContentSize(Buffer.byteLength(result.content, 'utf8'));
                } else {
                    result.contentError = `Content skipped - insufficient memory remaining (${Math.round(availableBytes / 1024)}KB available)`;
                }
            } else {
                result.content = textContent;
                result.contentLength = textContent.length;
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
                        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'identity',
                        'Connection': 'close'
                    },
                    timeout: timeoutMs
                };

                const req = client.request(options, (res) => {
                    // Handle redirects
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        console.log(`Redirecting to: ${res.headers.location}`);
                        makeRequest(res.headers.location, redirectCount + 1);
                        return;
                    }

                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        clearTimeout(timeout);
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                        return;
                    }

                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
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
}

/**
 * LLM API client for processing search results
 */
class LLMClient {
    constructor(apiKey, systemPrompts = {}, templates = {}) {
        this.accessSecret = process.env.ACCESS_SECRET;
        this.apiKey = apiKey;
        this.systemPrompts = {
            ...DEFAULT_SYSTEM_PROMPTS,
            ...systemPrompts
        };
        this.decisionTemplate = templates.decision || DEFAULT_DECISION_TEMPLATE;
        this.searchTemplate = templates.search || DEFAULT_SEARCH_TEMPLATE;
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000, // Start with 1 second
            maxDelay: 10000, // Max 10 seconds
            backoffMultiplier: 2,
            retryableErrors: ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE']
        };
    }

    /**
     * Determines if an error is retryable
     * @param {Error} error - The error to check
     * @returns {boolean} Whether the error should trigger a retry
     */
    isRetryableError(error) {
        // Network errors that might be transient
        if (this.retryConfig.retryableErrors.some(code => error.message.includes(code))) {
            return true;
        }
        
        // Rate limit errors (HTTP 429)
        if (error.message.includes('429')) {
            return true;
        }
        
        // Server errors (5xx) that might be temporary
        if (error.message.includes('500') || error.message.includes('502') || 
            error.message.includes('503') || error.message.includes('504')) {
            return true;
        }
        
        // Timeout errors
        if (error.message.toLowerCase().includes('timeout')) {
            return true;
        }
        
        return false;
    }

    /**
     * Calculate delay for retry with exponential backoff
     * @param {number} attemptNumber - Current attempt number (0-based)
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attemptNumber) {
        const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attemptNumber);
        return Math.min(delay, this.retryConfig.maxDelay);
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Promise that resolves after delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Process initial decision - whether to search or respond directly
     * @param {string} query - User's original question
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} Decision response with either 'response' or 'search_terms'
     */
    async processInitialDecision(query, options = {}) {
        const startTime = Date.now();
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            // Use the provided API key (from request body)
            const apiKey = this.apiKey;
            if (!apiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }

            // Create the decision prompt using the template
            const prompt = this.decisionTemplate.replace('{{QUERY}}', query);
            
            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: this.systemPrompts.decision
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };

            const postData = JSON.stringify(requestBody);
            const requestOptions = {
                hostname: providerConfig.hostname,
                port: 443,
                path: providerConfig.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                const requestTimeout = setTimeout(() => {
                    reject(new Error(`Initial decision timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    let data = '';
                    const statusCode = res.statusCode;
                    
                    res.on('data', chunk => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        clearTimeout(requestTimeout);
                        const responseTime = Date.now() - startTime;
                        
                        try {
                            if (statusCode !== 200) {
                                const errorData = data ? JSON.parse(data) : {};
                                const errorMessage = errorData.error?.message || `HTTP ${statusCode}: ${data}`;
                                reject(new Error(`OpenAI API error (${statusCode}): ${errorMessage}`));
                                return;
                            }
                            
                            const response = JSON.parse(data);
                            
                            if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
                                reject(new Error('Invalid OpenAI response: missing or empty choices array'));
                                return;
                            }
                            
                            const content = response.choices[0]?.message?.content;
                            if (!content) {
                                reject(new Error('No content in OpenAI response'));
                                return;
                            }

                            // Parse the JSON response
                            let decision;
                            try {
                                decision = JSON.parse(content);
                            } catch (parseError) {
                                // Fallback: assume search is needed
                                decision = { search_terms: query };
                            }

                            // Add usage information
                            decision.usage = response.usage;
                            
                            resolve(decision);
                            
                        } catch (parseError) {
                            reject(new Error(`Failed to parse initial decision response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Initial decision network error: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    clearTimeout(requestTimeout);
                    reject(new Error(`Initial decision socket timeout after ${timeout}ms`));
                });

                req.setTimeout(timeout);
                req.write(postData);
                req.end();
            });
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Build the decision prompt for initial LLM query
     * @param {string} query - User's original question
     * @returns {string} Formatted decision prompt
     */
    /**
     * Generate response directly without search
     * @param {string} query - User's question
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} LLM response with content and metadata
     */
    async generateResponseWithoutSearch(query, options = {}) {
        const startTime = Date.now();
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            // Use the provided API key (from request body)
            const apiKey = this.apiKey;
            if (!apiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: this.systemPrompts.direct
                    },
                    {
                        role: 'user',
                        content: query
                    }
                ]
            };

            const postData = JSON.stringify(requestBody);
            const requestOptions = {
                hostname: providerConfig.hostname,
                port: 443,
                path: providerConfig.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                const requestTimeout = setTimeout(() => {
                    reject(new Error(`Direct response timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    let data = '';
                    const statusCode = res.statusCode;
                    
                    res.on('data', chunk => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        clearTimeout(requestTimeout);
                        const responseTime = Date.now() - startTime;
                        
                        try {
                            if (statusCode !== 200) {
                                const errorData = data ? JSON.parse(data) : {};
                                const errorMessage = errorData.error?.message || `HTTP ${statusCode}: ${data}`;
                                reject(new Error(`OpenAI API error (${statusCode}): ${errorMessage}`));
                                return;
                            }
                            
                            const response = JSON.parse(data);
                            
                            if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
                                reject(new Error('Invalid OpenAI response: missing or empty choices array'));
                                return;
                            }
                            
                            const content = response.choices[0]?.message?.content;
                            if (!content) {
                                reject(new Error('No content in OpenAI response'));
                                return;
                            }

                            resolve({
                                content: content,
                                usage: response.usage,
                                processingTime: responseTime
                            });
                            
                        } catch (parseError) {
                            reject(new Error(`Failed to parse direct response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Direct response network error: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    clearTimeout(requestTimeout);
                    reject(new Error(`Direct response socket timeout after ${timeout}ms`));
                });

                req.setTimeout(timeout);
                req.write(postData);
                req.end();
            });
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Process with LLM with automatic retry logic
     * @param {string} originalQuery - User's original question
     * @param {Array} searchResults - Search results to process
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} LLM response
     */
    async processWithLLMWithRetry(originalQuery, searchResults, options = {}) {
        const startTime = Date.now();
        let lastError = null;
        
        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                const result = await this.processWithLLM(originalQuery, searchResults, options);
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // If this is the last attempt, throw the error
                if (attempt === this.retryConfig.maxRetries) {
                    throw error;
                }
                
                // Check if error is retryable
                if (!this.isRetryableError(error)) {
                    throw error;
                }
                
                // Calculate delay and wait before retry
                const delay = this.calculateRetryDelay(attempt);
                await this.sleep(delay);
            }
        }
        
        // This should never be reached, but just in case
        throw lastError || new Error('Unknown error in retry logic');
    }

    /**
     * Send query and search results to LLM for processing
     * @param {string} originalQuery - The user's original question
     * @param {Array} searchResults - Array of search results
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} LLM response
     */
    async processWithLLM(originalQuery, searchResults, options = {}) {
        const startTime = Date.now();
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000 // 30 second timeout for LLM requests
        } = options;

        console.log('🤖 LLM Processing Started:', {
            query: originalQuery.substring(0, 100) + (originalQuery.length > 100 ? '...' : ''),
            model,
            timeout,
            searchResultsCount: searchResults?.length || 0,
            timestamp: new Date().toISOString()
        });

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            // Use the provided API key (from request body)
            const apiKey = this.apiKey;
            if (!apiKey || typeof apiKey !== 'string') {
                throw new Error(`Invalid or missing API key for provider: ${provider}`);
            }
            
            if (!originalQuery || typeof originalQuery !== 'string') {
                throw new Error('Invalid or missing query');
            }
            
            if (!Array.isArray(searchResults)) {
                throw new Error('Invalid search results format');
            }

            // Create the prompt with search context
            const prompt = this.buildPrompt(originalQuery, searchResults);
            
            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: this.systemPrompts.search
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };

            // Note: access_secret is not sent to OpenAI API - it's used for Lambda authorization only
            const postData = JSON.stringify(requestBody);
            const requestOptions = {
                hostname: providerConfig.hostname,
                port: 443,
                path: providerConfig.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve, reject) => {
                // Set up timeout for the request
                const requestTimeout = setTimeout(() => {
                    reject(new Error(`LLM API request timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    let data = '';
                    const statusCode = res.statusCode;
                    
                    res.on('data', chunk => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        clearTimeout(requestTimeout);
                        const responseTime = Date.now() - startTime;
                        
                        try {
                            if (statusCode !== 200) {
                                const errorData = data ? JSON.parse(data) : {};
                                const errorMessage = errorData.error?.message || `HTTP ${statusCode}: ${data}`;
                                reject(new Error(`OpenAI API error (${statusCode}): ${errorMessage}`));
                                return;
                            }
                            
                            const response = JSON.parse(data);
                            
                            if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
                                reject(new Error('Invalid OpenAI response: missing or empty choices array'));
                                return;
                            }
                            
                            const content = response.choices[0]?.message?.content;
                            if (!content) {
                                reject(new Error('No content in OpenAI response'));
                                return;
                            }

                            resolve({
                                choices: response.choices,
                                usage: response.usage,
                                model: response.model,
                                processingTime: responseTime
                            });
                            
                        } catch (parseError) {
                            reject(new Error(`Failed to parse LLM response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Network error during LLM request: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    clearTimeout(requestTimeout);
                    reject(new Error(`LLM request socket timeout after ${timeout}ms`));
                });

                req.setTimeout(timeout);
                
                try {
                    req.write(postData);
                    req.end();
                } catch (writeError) {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Failed to send request data: ${writeError.message}`));
                }
            });
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Build the prompt for the LLM with search context
     * @param {string} originalQuery - User's original question
     * @param {Array} searchResults - Search results to include
     * @returns {string} Formatted prompt
     */
    buildPrompt(originalQuery, searchResults) {
        const searchContext = searchResults
            .slice(0, 10) // Limit to top 10 results to avoid token limits
            .map((result, index) => {
                const content = result.content ? 
                    `\n   Content: ${result.content.substring(0, 1000)}${result.content.length > 1000 ? '...' : ''}` : '';
                
                return `${index + 1}. Title: ${result.title}
   URL: ${result.url}
   Description: ${result.description}${content}`;
            })
            .join('\n\n');

        return this.searchTemplate
            .replace('{{QUERY}}', originalQuery)
            .replace('{{SEARCH_CONTEXT}}', searchContext);
    }
}

/**
 * Main Lambda handler function
 */
export const handler = async (event, context) => {
    const startTime = Date.now();
    
    try {
        const initialMemory = process.memoryUsage();
        console.log(`Lambda handler started. Initial memory: RSS=${Math.round(initialMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(initialMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB`);
    } catch (memoryError) {
        console.log(`Lambda handler started. Memory logging error: ${memoryError.message}`);
    }
    
    // Initialize query variable for error handling
    let query = '';
    
    // Standard response headers (let AWS handle CORS)
    const headers = {
        'Content-Type': 'application/json'
    };

    try {
        // Extract parameters from request (POST only)
        let limit, fetchContent, timeout, model, accessSecret, apiKey, searchMode;
        let systemPrompts, decisionTemplate, searchTemplate;
        
        console.log(`Processing ${event.requestContext.http.method} request`);
        
        if (event.requestContext.http.method === 'POST') {
            console.log(`Body received, isBase64Encoded: ${event.isBase64Encoded}`);
            
            // Check if the body is Base64 encoded and decode if necessary
            const decodedBody = event.isBase64Encoded
                ? Buffer.from(event.body, 'base64').toString('utf-8')
                : event.body;
            
            console.log(`Body decoded, parsing JSON...`);
            const body = JSON.parse(decodedBody || '{}');
            
            console.log(`JSON parsed successfully`);
            query = body.query;
            limit = body.limit || 5;
            fetchContent = body.content;
            timeout = body.timeout || 10;
            // Use provider:model format with Groq as default
            model = body.model || 'groq:llama-3.1-8b-instant';
            accessSecret = body.access_secret;
            apiKey = body.api_key;
            searchMode = body.search_mode || 'auto';
            
            console.log(`Basic parameters extracted`);
            
            // Extract system prompt overrides
            systemPrompts = {};
            if (body.system_prompt_decision) systemPrompts.decision = body.system_prompt_decision;
            if (body.system_prompt_direct) systemPrompts.direct = body.system_prompt_direct;
            if (body.system_prompt_search) systemPrompts.search = body.system_prompt_search;
            
            console.log(`System prompts extracted`);
            
            decisionTemplate = body.decision_template || DEFAULT_DECISION_TEMPLATE;
            searchTemplate = body.search_template || DEFAULT_SEARCH_TEMPLATE;
            
            console.log(`Templates assigned`);
        } else {
            return {
                statusCode: 405,
                headers: headers,
                body: JSON.stringify({ error: 'Method not allowed', allowed: ['POST'] })
            };
        }

        console.log(`About to validate parameters...`);

        // Validate required parameters
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({
                    error: 'Missing or invalid query parameter',
                    message: 'Query parameter is required and must be a non-empty string'
                })
            };
        }

        // Validate API key
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({
                    error: 'Missing or invalid api_key parameter',
                    message: 'API key parameter is required and must be a non-empty string'
                })
            };
        }

        // Check access secret if required
        const requiredSecret = process.env.ACCESS_SECRET;
        if (requiredSecret && accessSecret !== requiredSecret) {
            return {
                statusCode: 401,
                headers: headers,
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Invalid or missing access_secret'
                })
            };
        }

        console.log(`Parameters validated successfully. Query: "${query}", Search mode: ${searchMode}`);

        // Initialize LLM client for all operations
        const llmClient = new LLMClient(apiKey, systemPrompts, {
            decision: decisionTemplate,
            search: searchTemplate
        });

        console.log(`LLM client initialized successfully`);

        let shouldSearch = false;
        let searchTerms = query;
        let directResponse = null;

        // Determine search behavior based on search mode
        if (searchMode === 'direct') {
            // Skip search mode - answer directly without searching
            shouldSearch = false;
        } else if (searchMode === 'search') {
            // Force search mode - always search
            shouldSearch = true;
            searchTerms = query; // Use original query as search terms
        } else {
            // Auto mode - let LLM decide
            const initialDecision = await llmClient.processInitialDecision(query, { model, timeout: 30000 });
            
            if (initialDecision.response) {
                directResponse = initialDecision.response;
                shouldSearch = false;
            } else {
                shouldSearch = true;
                searchTerms = initialDecision.search_terms || query;
            }
        }

        // If we have a direct response (from auto mode), return it
        if (!shouldSearch && directResponse) {
            const response = {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    query: query,
                    answer: directResponse,
                    searchResults: null,
                    llmResponse: {
                        model: model,
                        usage: {},
                        processingTime: 'direct response'
                    },
                    processingTimeMs: Date.now() - startTime,
                    timestamp: new Date().toISOString(),
                    mode: 'direct'
                })
            };

            return response;
        }

        // If we're in direct mode but don't have a direct response, generate one
        if (!shouldSearch && !directResponse) {
            const response = await llmClient.generateResponseWithoutSearch(query, { model, timeout: 30000 });
            
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    query: query,
                    answer: response.content,
                    searchResults: null,
                    llmResponse: {
                        model: model,
                        usage: response.usage || {},
                        processingTime: response.processingTime || 'unknown'
                    },
                    processingTimeMs: Date.now() - startTime,
                    timestamp: new Date().toISOString(),
                    mode: 'direct'
                })
            };
        }

        // Step 2: Perform search (if needed)
        const searcher = new DuckDuckGoSearcher();
        const searchResults = await searcher.search(searchTerms, limit, fetchContent, timeout);
        
        if (!searchResults.success || searchResults.results.length === 0) {
            // Prepare the no results response
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    query: query,
                    llmResponse: null,
                    answer: 'No search results found. Unable to provide an answer based on search data.',
                    processingTimeMs: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Step 3: Process with LLM using search results
        const llmResponse = await llmClient.processWithLLMWithRetry(query, searchResults.results, {
            model,
            timeout: 30000 // 30 second timeout for LLM API calls
        });

        const answer = llmResponse.choices?.[0]?.message?.content || 'No response generated';

        // Prepare the final response
        const finalResponse = {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                success: true,
                query: query,
                searchTerms: searchTerms !== query ? searchTerms : undefined,
                answer: answer,
                llmResponse: {
                    model: llmResponse.model,
                    usage: llmResponse.usage,
                    processingTime: llmResponse.usage?.total_tokens ? `${llmResponse.usage.total_tokens} tokens` : 'unknown'
                },
                processingTimeMs: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                mode: 'search'
            })
        };

        // Return combined results
        const finalMemory = process.memoryUsage();
        console.log(`Lambda handler completed successfully. Final memory: RSS=${Math.round(finalMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(finalMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB, Duration: ${Date.now() - startTime}ms`);
        
        return finalResponse;

    } catch (error) {
        console.error('Handler error:', error.message);
        const errorTime = Date.now() - startTime;
        
        // Determine error type and provide appropriate user message
        let statusCode = 500;
        let userMessage = 'Internal server error';
        let errorType = 'INTERNAL_ERROR';
        
        // API key related errors
        if (error.message.includes('Invalid or missing API key') || 
            error.message.includes('Unauthorized') || 
            error.message.includes('401')) {
            statusCode = 401;
            userMessage = 'Invalid API key. Please check your OpenAI API key.';
            errorType = 'INVALID_API_KEY';
        }
        // Rate limiting errors
        else if (error.message.includes('429') || error.message.includes('rate limit')) {
            statusCode = 429;
            userMessage = 'Rate limit exceeded. Please wait before making another request.';
            errorType = 'RATE_LIMITED';
        }
        // Quota/billing errors
        else if (error.message.includes('quota') || error.message.includes('billing')) {
            statusCode = 402;
            userMessage = 'API quota exceeded or billing issue. Please check your OpenAI account.';
            errorType = 'QUOTA_EXCEEDED';
        }
        // Network/timeout errors
        else if (error.message.toLowerCase().includes('timeout') || 
                 error.message.includes('ENOTFOUND') || 
                 error.message.includes('ECONNREFUSED')) {
            statusCode = 503;
            userMessage = 'Service temporarily unavailable. Please try again in a moment.';
            errorType = 'SERVICE_UNAVAILABLE';
        }
        // Input validation errors
        else if (error.message.includes('Invalid or missing query') || 
                 error.message.includes('Invalid search results')) {
            statusCode = 400;
            userMessage = 'Invalid request parameters. Please check your input.';
            errorType = 'INVALID_INPUT';
        }
        // Search service errors
        else if (error.message.includes('Search failed') || 
                 error.message.includes('DuckDuckGo')) {
            statusCode = 503;
            userMessage = 'Search service temporarily unavailable. Please try again.';
            errorType = 'SEARCH_SERVICE_ERROR';
        }
        
        
        // Prepare the error response
        const errorResponse = {
            statusCode,
            headers: headers,
            body: JSON.stringify({
                success: false,
                error: userMessage,
                errorType,
                details: process.env.NODE_ENV === 'development' ? {
                    originalError: error.message,
                    processingTimeMs: errorTime
                } : undefined,
                timestamp: new Date().toISOString(),
                processingTimeMs: errorTime
            })
        };
        
        const finalMemory = process.memoryUsage();
        console.log(`Lambda handler completed with error. Final memory: RSS=${Math.round(finalMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(finalMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB, Duration: ${errorTime}ms`);
        
        return errorResponse;
    }
};

