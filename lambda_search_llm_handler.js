/**
 * AWS Lambda handler for intelligent search + LLM response
 * Combines DuckDuckGo search functionality with LLM processing to provide
 * comprehensive answers with citations and source references
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

// Google OAuth configuration
const ALLOWED_EMAILS = ['syntithenai@gmail.com'];

/**
 * Verify Google JWT token and extract user information
 * @param {string} token - Google JWT token
 * @returns {Object} - User information or null if invalid
 */
function verifyGoogleToken(token) {
    try {
        // Parse JWT token (basic parsing - in production you'd want to verify signature)
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            Buffer.from(base64, 'base64')
                .toString()
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        
        const payload = JSON.parse(jsonPayload);
        
        // Basic validation
        if (!payload.email || !payload.exp) {
            console.log('Invalid token: missing email or expiration');
            return null;
        }
        
        // Check if token is expired
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            console.log('Token expired');
            return null;
        }
        
        // Check if email is in whitelist
        if (!ALLOWED_EMAILS.includes(payload.email)) {
            console.log(`Email not allowed: ${payload.email}`);
            return null;
        }
        
        console.log(`Valid Google token for: ${payload.email}`);
        return {
            email: payload.email,
            name: payload.name,
            picture: payload.picture
        };
    } catch (error) {
        console.error('Error verifying Google token:', error);
        return null;
    }
}

// Provider configuration
const PROVIDERS = {
    openai: {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        envKey: 'OPENAI_API_KEY',
        models: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano']
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

const DEFAULT_DECISION_TEMPLATE = `Analyze this question and determine if you can answer it directly or if it requires web searches.

IMPORTANT: Respond ONLY with valid JSON in one of these formats:

For questions you can answer directly (general knowledge, explanations, creative tasks, personal advice):
{"response": "Your complete answer here"}

For questions requiring web searches (current events, recent data, specific facts, company information):
{"search_queries": ["search terms 1", "search terms 2", "search terms 3"]}

Guidelines:
- Use "response" for: general knowledge, how-to questions, explanations, creative writing, personal advice
- Use "search_queries" for: current events, recent data, specific facts, company information, recent research
- If using search_queries, provide 1-3 distinct search queries that cover different aspects of the question
- Each search query should be optimized for web search (remove question words, focus on key terms)
- Order search queries by importance/relevance

Question: "{{QUERY}}"

JSON Response:`;

const DEFAULT_SEARCH_TEMPLATE = `Answer this question using the sources below. Cite URLs when stating facts.

Question: {{QUERY}}

Sources:
{{SEARCH_CONTEXT}}

Answer:`;

const COMPACT_SEARCH_TEMPLATE = `Q: {{QUERY}}

Sources:
{{SEARCH_CONTEXT}}

A:`;

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
 * Token-aware memory tracker for optimizing LLM token usage
 */
class TokenAwareMemoryTracker extends MemoryTracker {
    constructor() {
        super();
        this.maxTokens = 32000; // Increased to 32K for more comprehensive responses
        this.currentTokens = 0;
        this.maxContentLengthPerPage = 4000; // Increased per page limit for 32K tokens
    }
    
    /**
     * Estimate tokens from text (rough approximation: 4 chars = 1 token)
     * @param {string} text - Text to estimate tokens for
     * @returns {number} Estimated token count
     */
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
    
    /**
     * Check if content can be added within token limits
     * @param {string} content - Content to check
     * @returns {boolean} Whether content can be added
     */
    canAddContent(content) {
        const estimatedTokens = this.estimateTokens(content);
        return (this.currentTokens + estimatedTokens) < this.maxTokens;
    }
    
    /**
     * Add content with token tracking and truncation if needed
     * @param {string} content - Content to add
     * @returns {string} Content (potentially truncated)
     */
    addContent(content) {
        if (this.canAddContent(content)) {
            this.currentTokens += this.estimateTokens(content);
            return content;
        }
        
        // Truncate to fit within token limit
        const availableTokens = this.maxTokens - this.currentTokens;
        const availableChars = Math.max(0, availableTokens * 4);
        const truncatedContent = content.slice(0, availableChars);
        this.currentTokens += this.estimateTokens(truncatedContent);
        return truncatedContent;
    }
    
    /**
     * Clean and optimize content for token efficiency
     * @param {string} content - Raw content to clean
     * @returns {string} Cleaned and optimized content
     */
    cleanContent(content) {
        if (!content || typeof content !== 'string') return '';
        
        // Remove extra whitespace and empty lines
        let cleaned = content
            .replace(/\n\s*\n\s*\n/g, '\n\n') // Reduce multiple empty lines to double
            .replace(/[ \t]+/g, ' ') // Normalize spaces and tabs
            .trim();
        
        // Filter out common boilerplate text
        const boilerplatePatterns = [
            /Copyright.*?\d{4}.*$/gmi,
            /Privacy Policy.*$/gmi,
            /Terms of Service.*$/gmi,
            /Subscribe to.*newsletter.*$/gmi,
            /Follow us on.*$/gmi,
            /Share this article.*$/gmi,
            /Cookie Policy.*$/gmi,
            /All rights reserved.*$/gmi,
            /Sign up for.*$/gmi,
            /Get the latest.*$/gmi,
            /Download our app.*$/gmi,
            /Advertisement.*$/gmi
        ];
        
        boilerplatePatterns.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });
        
        // Remove navigation-like content
        cleaned = cleaned.replace(/^\s*(Home|About|Contact|Menu|Navigation).*$/gmi, '');
        
        // Limit content length for token efficiency
        if (cleaned.length > this.maxContentLengthPerPage) {
            // Try to cut at sentence boundaries
            const truncated = cleaned.slice(0, this.maxContentLengthPerPage);
            const lastSentence = truncated.lastIndexOf('.');
            if (lastSentence > this.maxContentLengthPerPage * 0.8) {
                cleaned = truncated.slice(0, lastSentence + 1);
            } else {
                cleaned = truncated;
            }
        }
        
        return cleaned.trim();
    }
    
    /**
     * Extract meaningful content from HTML using targeted selectors
     * @param {string} html - HTML content to extract from
     * @returns {string} Meaningful text content
     */
    extractMeaningfulContent(html) {
        if (!html) return '';
        
        // Target main content areas with common CSS selectors
        const contentSelectors = [
            'article p',
            'main p', 
            '.content p',
            '.post-content p',
            '.entry-content p',
            '[role="main"] p',
            '.article-body p',
            '.story-body p',
            '#content p',
            '.page-content p'
        ];
        
        let meaningfulText = '';
        
        // Simple regex-based content extraction (avoiding heavy HTML parsing)
        contentSelectors.forEach(selector => {
            // Convert CSS selector to rough regex pattern
            let pattern;
            if (selector.includes('article p')) {
                pattern = /<article[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/article>/gi;
            } else if (selector.includes('main p')) {
                pattern = /<main[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/main>/gi;
            } else if (selector.includes('.content p')) {
                pattern = /<[^>]*class="[^"]*content[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
            } else {
                // Generic paragraph extraction
                pattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            }
            
            let match;
            while ((match = pattern.exec(html)) !== null && meaningfulText.length < 1200) {
                const text = this.stripHtml(match[1]).trim();
                if (text.length > 50 && !text.match(/^(Subscribe|Follow|Share|Copyright|Privacy)/i)) {
                    meaningfulText += text + '\n';
                }
            }
        });
        
        // If no structured content found, fall back to all paragraphs
        if (meaningfulText.length < 200) {
            const allParagraphs = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            let match;
            while ((match = allParagraphs.exec(html)) !== null && meaningfulText.length < 1000) {
                const text = this.stripHtml(match[1]).trim();
                if (text.length > 50 && !text.match(/^(Subscribe|Follow|Share|Copyright|Privacy|Advertisement)/i)) {
                    meaningfulText += text + '\n';
                }
            }
        }
        
        return this.cleanContent(meaningfulText);
    }
    
    /**
     * Strip HTML tags from text
     * @param {string} html - HTML to strip
     * @returns {string} Plain text
     */
    stripHtml(html) {
        if (!html) return '';
        return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
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
            // Use HTML version of DuckDuckGo for consistent parsing
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            
            const searchTime = Date.now();
            const html = await this.fetchUrl(searchUrl, timeout * 1000);
            const parseTime = Date.now();
            
            const results = this.extractSearchResults(html, query, limit);
            
            // Filter results by quality score (only keep results with decent relevance)
            const qualityThreshold = 20; // Minimum score threshold
            const qualityResults = results.filter(result => result.score >= qualityThreshold);
            
            // Limit processing to top results for efficiency (increased for 32K tokens)
            const maxProcessingLimit = Math.min(8, limit);
            const sortedResults = qualityResults
                .sort((a, b) => b.score - a.score)
                .slice(0, maxProcessingLimit);
            
            console.log(`Search results: ${results.length} found, ${qualityResults.length} above quality threshold, ${sortedResults.length} selected for processing`);
            
            const contentTime = Date.now();
            // Only fetch content for high-quality results to save tokens
            if (sortedResults.length > 0) {
                await this.fetchContentForResults(sortedResults, timeout);
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
     * @returns {Promise<Object>} Decision response with either 'response' or 'search_queries'
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
                                // Fallback: assume search is needed with original query
                                decision = { search_queries: [query] };
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
        // Use expanded format for higher token budget (32K)
        const searchContext = searchResults
            .slice(0, 8) // Increased to top 8 results for 32K token budget
            .map((result, index) => {
                // Progressive content loading - start with title and description
                let contextEntry = `${index + 1}. ${result.title}\n${result.url}`;
                
                // Add description if available (increased length for 32K tokens)
                if (result.description && result.description.length > 0) {
                    const shortDesc = result.description.slice(0, 300);
                    contextEntry += `\n${shortDesc}${result.description.length > 300 ? '...' : ''}`;
                }
                
                // Add content with higher token budget allowance
                if (result.content && result.content.length > 100) {
                    // Increased token estimation budget for 32K context
                    const estimatedTokens = Math.ceil((contextEntry + result.content).length / 4);
                    if (estimatedTokens < 25000) { // Leave 7K tokens for response
                        const shortContent = result.content.slice(0, 800); // Increased content length
                        contextEntry += `\nKey info: ${shortContent}${result.content.length > 800 ? '...' : ''}`;
                    }
                }
                
                return contextEntry;
            })
            .join('\n\n');

        // Use full template more often with 32K token budget, compact only for many results
        // But prioritize custom templates if they were provided
        let template;
        if (this.searchTemplate !== DEFAULT_SEARCH_TEMPLATE) {
            // Custom template provided, use it regardless of result count
            template = this.searchTemplate;
        } else {
            // Using default template, apply compact logic for efficiency
            template = searchResults.length > 6 ? COMPACT_SEARCH_TEMPLATE : this.searchTemplate;
        }
        return template
            .replace('{{QUERY}}', originalQuery)
            .replace('{{SEARCH_CONTEXT}}', searchContext);
    }

    /**
     * Pre-summarize long content before final LLM call
     * @param {string} content - Content to summarize
     * @param {string} query - Original query for context
     * @returns {Promise<string>} Summarized content
     */
    async summarizeContent(content, query) {
        if (!content || content.length < 3000) return content; // Increased threshold for 32K tokens
        
        try {
            // Allow longer summaries with 32K token budget
            const summaryPrompt = `Summarize this content relevant to "${query}" in under 300 words, focusing on key facts and details:\n\n${content.slice(0, 4000)}`;
            
            const summaryConfig = {
                provider: 'openai',
                model: 'gpt-5-mini', // Use smaller model for summarization
                messages: [{ role: 'user', content: summaryPrompt }],
                max_tokens: 400, // Increased for longer summaries
                temperature: 0.3
            };
            
            const summary = await this.callLLM(summaryConfig);
            return summary.choices[0].message.content;
        } catch (error) {
            console.log(`Content summarization failed: ${error.message}, using truncated original`);
            return content.slice(0, 2000); // Increased fallback length for 32K
        }
    }

    /**
     * Digest search results for a single search query
     * @param {string} searchQuery - The search query used
     * @param {Array} searchResults - Raw search results
     * @param {string} originalQuery - Original user question
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} Digested summary with key information
     */
    async digestSearchResults(searchQuery, searchResults, originalQuery, options = {}) {
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            const apiKey = this.apiKey;
            if (!apiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }

            // Format search results for digestion
            const searchContext = searchResults
                .slice(0, 5) // Focus on top 5 results
                .map((result, index) => {
                    let contextEntry = `${index + 1}. ${result.title}\n${result.url}`;
                    if (result.description) {
                        contextEntry += `\n${result.description.slice(0, 200)}`;
                    }
                    if (result.content) {
                        contextEntry += `\nContent: ${result.content.slice(0, 400)}`;
                    }
                    return contextEntry;
                })
                .join('\n\n');

            const digestPrompt = `Analyze these search results for "${searchQuery}" in context of the question "${originalQuery}".

Extract key information, facts, and insights. Create a concise summary (2-3 sentences) with the most relevant information.

Search Results:
${searchContext}

Provide a focused summary of the most relevant information found:`;

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a research assistant that extracts key information from search results. Focus on factual content relevant to the user\'s question.'
                    },
                    {
                        role: 'user',
                        content: digestPrompt
                    }
                ],
                max_tokens: 200,
                temperature: 0.3
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
                    reject(new Error(`Search digest timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    clearTimeout(requestTimeout);
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            const content = response.choices?.[0]?.message?.content || 'No summary available';
                            
                            // Extract top 2 links with titles
                            const links = searchResults.slice(0, 2).map(result => ({
                                title: result.title,
                                url: result.url,
                                snippet: result.description ? result.description.slice(0, 100) + '...' : ''
                            }));
                            
                            resolve({
                                searchQuery,
                                summary: content,
                                links,
                                rawResults: searchResults
                            });
                        } catch (parseError) {
                            reject(new Error(`Failed to parse digest response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Digest network error: ${error.message}`));
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
     * Determine if additional searches are needed based on current information
     * @param {string} originalQuery - Original user question
     * @param {Array} digestedResults - Array of digested search results
     * @param {number} currentIteration - Current search iteration (0-based)
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} Decision on whether to continue searching
     */
    async shouldContinueSearching(originalQuery, digestedResults, currentIteration, options = {}) {
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        // Always stop after 3 iterations
        if (currentIteration >= 3) {
            return { 
                continue: false, 
                reason: 'Maximum search iterations reached',
                nextQueries: []
            };
        }

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            const apiKey = this.apiKey;
            if (!apiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }

            // Format current knowledge
            const currentKnowledge = digestedResults.map((digest, index) => {
                return `Search ${index + 1} (${digest.searchQuery}): ${digest.summary}`;
            }).join('\n\n');

            const continuationPrompt = `Original Question: "${originalQuery}"

Current Information Gathered:
${currentKnowledge}

Based on the information gathered so far, determine if additional searches are needed to fully answer the question.

Respond ONLY with valid JSON in one of these formats:

If you have sufficient information to answer the question:
{"continue": false, "reason": "Sufficient information gathered"}

If additional searches are needed (max 2 more queries):
{"continue": true, "reason": "Need more specific information about X", "next_queries": ["search query 1", "search query 2"]}

Consider:
- Is the core question answered?
- Are there important gaps in the information?
- Would additional specific searches add significant value?

JSON Response:`;

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a research assistant that determines if sufficient information has been gathered to answer a question. Be conservative - only request additional searches if truly necessary.'
                    },
                    {
                        role: 'user',
                        content: continuationPrompt
                    }
                ],
                max_tokens: 150,
                temperature: 0.1
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
                    reject(new Error(`Continuation decision timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    clearTimeout(requestTimeout);
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            const content = response.choices?.[0]?.message?.content;
                            
                            let decision;
                            try {
                                decision = JSON.parse(content);
                            } catch (parseError) {
                                // Default to not continuing if parsing fails
                                decision = { 
                                    continue: false, 
                                    reason: 'Parse error - stopping search'
                                };
                            }
                            
                            resolve(decision);
                        } catch (parseError) {
                            reject(new Error(`Failed to parse continuation response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Continuation decision network error: ${error.message}`));
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
     * Generate final response using all gathered information
     * @param {string} originalQuery - Original user question
     * @param {Array} digestedResults - Array of digested search results
     * @param {Object} options - LLM options
     * @returns {Promise<Object>} Final comprehensive response
     */
    async generateFinalResponse(originalQuery, digestedResults, options = {}) {
        const {
            model = 'groq:llama-3.1-8b-instant',
            timeout = 30000
        } = options;

        try {
            // Parse provider and model
            const { provider, model: modelName } = parseProviderModel(model);
            const providerConfig = getProviderConfig(provider);
            
            const apiKey = this.apiKey;
            if (!apiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }

            // Combine all gathered information
            const allInformation = digestedResults.map((digest, index) => {
                const links = digest.links.map(link => `${link.title} (${link.url})`).join(', ');
                return `Research ${index + 1} - ${digest.searchQuery}:\n${digest.summary}\nSources: ${links}`;
            }).join('\n\n');

            const finalPrompt = `Based on comprehensive research, provide a complete answer to this question.

Question: "${originalQuery}"

Research Gathered:
${allInformation}

Please provide a comprehensive, well-structured answer that:
1. Directly addresses the question
2. Uses specific information from the research
3. Cites relevant sources by including URLs when stating facts
4. Is organized and easy to read

Answer:`;

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: this.systemPrompts.search
                    },
                    {
                        role: 'user',
                        content: finalPrompt
                    }
                ],
                max_tokens: 1500,
                temperature: 0.7
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
                    reject(new Error(`Final response timeout after ${timeout}ms`));
                }, timeout);

                const req = https.request(requestOptions, (res) => {
                    clearTimeout(requestTimeout);
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            resolve({
                                choices: response.choices,
                                usage: response.usage,
                                model: response.model
                            });
                        } catch (parseError) {
                            reject(new Error(`Failed to parse final response: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    clearTimeout(requestTimeout);
                    reject(new Error(`Final response network error: ${error.message}`));
                });

                req.setTimeout(timeout);
                req.write(postData);
                req.end();
            });
        } catch (error) {
            throw error;
        }
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
            
            // Extract and verify Google token
            const googleToken = body.google_token;
            if (!googleToken) {
                return {
                    statusCode: 401,
                    headers: headers,
                    body: JSON.stringify({
                        error: 'Unauthorized',
                        message: 'Google authentication required. Please sign in.'
                    })
                };
            }
            
            const googleUser = verifyGoogleToken(googleToken);
            if (!googleUser) {
                return {
                    statusCode: 401,
                    headers: headers,
                    body: JSON.stringify({
                        error: 'Unauthorized',
                        message: 'Invalid Google token or email not authorized.'
                    })
                };
            }
            
            console.log(`Google authentication successful for: ${googleUser.email}`);
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

        // Multi-Search Loop Implementation
        const searcher = new DuckDuckGoSearcher();
        const digestedResults = [];
        const allSearchResults = [];
        let searchQueries = [];
        
        // Handle initial search queries
        if (searchMode === 'search') {
            searchQueries = [query]; // Force search with original query
        } else {
            // Extract search queries from LLM decision
            const initialDecision = await llmClient.processInitialDecision(query, { model, timeout: 30000 });
            
            if (initialDecision.response) {
                // Direct response case
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({
                        success: true,
                        query: query,
                        answer: initialDecision.response,
                        searchResults: null,
                        searchSummaries: [],
                        links: [],
                        llmResponse: {
                            model: model,
                            usage: initialDecision.usage || {},
                            processingTime: 'direct response'
                        },
                        processingTimeMs: Date.now() - startTime,
                        timestamp: new Date().toISOString(),
                        mode: 'direct'
                    })
                };
            } else {
                // Extract search queries (support both old and new format)
                searchQueries = initialDecision.search_queries || 
                               (initialDecision.search_terms ? [initialDecision.search_terms] : [query]);
            }
        }

        // Execute multi-search loop
        let iteration = 0;
        const maxIterations = 3;
        
        while (iteration < maxIterations && searchQueries.length > 0) {
            console.log(`Search iteration ${iteration + 1}, queries: ${searchQueries.join(', ')}`);
            
            // Execute searches for current iteration
            for (const searchQuery of searchQueries) {
                try {
                    const searchResults = await searcher.search(searchQuery, limit, fetchContent, timeout);
                    
                    if (searchResults.success && searchResults.results.length > 0) {
                        // Digest the search results
                        const digestedResult = await llmClient.digestSearchResults(
                            searchQuery, 
                            searchResults.results, 
                            query, 
                            { model, timeout: 30000 }
                        );
                        
                        digestedResults.push(digestedResult);
                        allSearchResults.push(...searchResults.results);
                    } else {
                        console.log(`No results for search query: ${searchQuery}`);
                    }
                } catch (searchError) {
                    console.error(`Search failed for query "${searchQuery}": ${searchError.message}`);
                }
            }
            
            // Check if we should continue searching
            if (digestedResults.length === 0) {
                break; // No results found, exit loop
            }
            
            // Determine if additional searches are needed
            const continuationDecision = await llmClient.shouldContinueSearching(
                query, 
                digestedResults, 
                iteration, 
                { model, timeout: 30000 }
            );
            
            if (!continuationDecision.continue) {
                console.log(`Stopping search: ${continuationDecision.reason}`);
                break;
            }
            
            // Prepare next iteration
            searchQueries = continuationDecision.next_queries || [];
            iteration++;
        }
        
        // Handle case where no search results were found
        if (digestedResults.length === 0) {
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    query: query,
                    answer: 'No search results found. Unable to provide an answer based on search data.',
                    searchResults: [],
                    searchSummaries: [],
                    links: [],
                    llmResponse: null,
                    processingTimeMs: Date.now() - startTime,
                    timestamp: new Date().toISOString(),
                    mode: 'search'
                })
            };
        }
        
        // Generate final comprehensive response
        const finalResponse = await llmClient.generateFinalResponse(
            query, 
            digestedResults, 
            { model, timeout: 30000 }
        );
        
        const answer = finalResponse.choices?.[0]?.message?.content || 'No response generated';
        
        // Prepare search summaries and links for response
        const searchSummaries = digestedResults.map(digest => ({
            searchQuery: digest.searchQuery,
            summary: digest.summary
        }));
        
        const links = [];
        digestedResults.forEach(digest => {
            digest.links.forEach(link => {
                if (!links.find(existing => existing.url === link.url)) {
                    links.push(link);
                }
            });
        });
        
        // Prepare the enhanced final response
        const enhancedResponse = {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                success: true,
                query: query,
                answer: answer,
                searchSummaries: searchSummaries,
                links: links.slice(0, 10), // Limit to top 10 unique links
                searchResults: allSearchResults, // Full JSON of all search results
                llmResponse: {
                    model: finalResponse.model,
                    usage: finalResponse.usage,
                    processingTime: finalResponse.usage?.total_tokens ? `${finalResponse.usage.total_tokens} tokens` : 'unknown',
                    searchIterations: iteration + 1,
                    totalSearchQueries: digestedResults.length
                },
                processingTimeMs: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                mode: 'multi-search'
            })
        };

        // Return combined results
        const finalMemory = process.memoryUsage();
        console.log(`Lambda handler completed successfully. Final memory: RSS=${Math.round(finalMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(finalMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB, Duration: ${Date.now() - startTime}ms`);
        
        return enhancedResponse;

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

