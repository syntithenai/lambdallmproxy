/**
 * AWS Lambda handler for intelligent search + LLM response with streaming support
 * Combines DuckDuckGo search functionality with LLM processing to provide
 * comprehensive answers with citations and source references
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

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

// System prompt configurations - now loaded from environment variables with fallbacks
const DEFAULT_SYSTEM_PROMPTS = {
    decision: process.env.SYSTEM_PROMPT_DECISION || 'You are a thorough research analyst that determines whether a question can be answered directly or requires comprehensive web searches. CRITICAL: Always search for current information when questions involve time-sensitive data, current events, weather, location, or use words like "today", "now", "current", "latest". When searches are needed, you always plan for multiple, complementary search strategies to ensure complete coverage. Always respond with valid JSON only.',
    direct: process.env.SYSTEM_PROMPT_DIRECT || 'You are a knowledgeable assistant. Answer the user\'s question directly based on your knowledge. Be comprehensive, informative, and thorough in your explanations.',
    search: process.env.SYSTEM_PROMPT_SEARCH || 'You are a comprehensive research assistant. Use all provided search results to answer questions thoroughly and completely. Always cite specific sources using the URLs provided when making factual claims. Synthesize information from multiple sources to provide the most complete picture possible. Format your response in a clear, well-organized manner that covers all important aspects of the topic.'
};

const DEFAULT_DECISION_TEMPLATE = process.env.DECISION_TEMPLATE || `Analyze this question and determine if you can answer it directly or if it requires comprehensive web searches to gather all necessary information.

IMPORTANT: Respond ONLY with valid JSON in one of these formats:

For questions you can answer directly (general knowledge, explanations, creative tasks, personal advice):
{"response": "Your complete answer here"}

For questions requiring web searches (current events, recent data, specific facts, company information):
{"search_queries": ["broad search terms 1", "specific aspect 2", "related context 3"]}

Guidelines for COMPREHENSIVE search coverage:
- Use "response" for: basic general knowledge, simple how-to questions, creative writing, personal advice
- Use "search_queries" for: current events, recent data, specific facts, company information, complex topics, recent research
- ALWAYS provide 2-3 search queries to ensure comprehensive coverage - don't be conservative!
- Cover DIFFERENT ASPECTS: Start broad, then get specific, include related context/background

CRITICAL: Always search for current context when relevant:
- If answer depends on current date/time: Include "current date today" or "what time is it now"
- If answer depends on weather: Include "current weather [location]" or "weather forecast [location]"
- If answer depends on location: Include "current location" or "[specific location] information"
- If answer involves "today", "now", "current", "latest": Always search for current information
- If answer involves events, news, or time-sensitive information: Always search for recent updates
- Examples:
  * "What's the weather like?" → ["current weather today", "weather forecast today", "local weather conditions"]
  * "What time is it?" → ["current time now", "what time is it today", "current date and time"]
  * "What's happening today?" → ["current events today", "news today", "what's happening now"]
  * "Should I wear a coat?" → ["current weather today", "weather forecast today", "temperature today"]

- Examples of good comprehensive coverage:
  * Topic question: ["topic overview", "recent developments topic", "expert opinions topic"]
  * Company question: ["company name overview", "company name recent news", "company name financial performance"]
  * Technical question: ["technical term definition", "technical term applications", "technical term latest research"]
  * Time-sensitive question: ["current information topic", "latest updates topic", "recent news topic"]
- Each search query should be optimized for web search (remove question words, focus on key terms)
- Think: "What different angles do I need to fully understand and explain this topic?"
- Err on the side of MORE searches rather than fewer - thoroughness is key

Question: "{{QUERY}}"

JSON Response:`;

const DEFAULT_SEARCH_TEMPLATE = process.env.SEARCH_TEMPLATE || `Answer this question using the sources below. Cite URLs when stating facts.

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
            
            // Use the provided API key or fall back to environment variable
            const apiKey = this.apiKey || process.env[providerConfig.envKey];
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
            
            // Use the provided API key or fall back to environment variable
            const apiKey = this.apiKey || process.env[providerConfig.envKey];
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
            
            // Use the provided API key or fall back to environment variable
            const apiKey = this.apiKey || process.env[providerConfig.envKey];
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
            
            // Use the provided API key or fall back to environment variable
            const apiKey = this.apiKey || process.env[providerConfig.envKey];
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

            const digestPrompt = `Thoroughly analyze these search results for "${searchQuery}" in context of the question "${originalQuery}".

Extract ALL key information, facts, insights, and important details. Identify the most valuable and relevant findings that directly address the original question. Don't miss important nuances, data points, or perspectives.

Search Results:
${searchContext}

Provide a comprehensive summary (3-4 sentences) capturing the most important and relevant information found. Include specific details, numbers, dates, and key facts that would be valuable for answering the original question:`;

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a thorough research analyst that extracts comprehensive information from search results. Capture all important details, facts, and insights that are relevant to the user\'s question. Be thorough and don\'t miss key information that could be valuable for the final answer.'
                    },
                    {
                        role: 'user',
                        content: digestPrompt
                    }
                ],
                max_tokens: 300,
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
            
            // Use the provided API key or fall back to environment variable
            const apiKey = this.apiKey || process.env[providerConfig.envKey];
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

Analyze if additional targeted searches would significantly improve the comprehensiveness and quality of the final answer.

Respond ONLY with valid JSON in one of these formats:

If you have comprehensive information covering ALL important aspects:
{"continue": false, "reason": "Complete coverage achieved across all key areas"}

If additional searches would add significant value (RECOMMENDED - up to 2 more queries):
{"continue": true, "reason": "Could benefit from more depth on X or coverage of Y", "next_queries": ["targeted search 1", "targeted search 2"]}

BIAS TOWARD THOROUGHNESS - Consider these factors:
- Are there multiple perspectives or viewpoints to explore?
- Could more recent developments or data enhance the answer?
- Are there specific sub-topics or related areas that need deeper coverage?
- Would expert opinions, case studies, or detailed examples strengthen the response?
- Are there potential counterarguments or alternative approaches to explore?
- Could technical details, implementation specifics, or practical applications be useful?

Err on the side of gathering MORE information rather than less. Quality comprehensive answers require thorough research.

JSON Response:`;

            const requestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a thorough research strategist. Your job is to ensure no important information is missed. You should bias toward additional searches when they could meaningfully improve the comprehensiveness and quality of the final answer. Only stop when you are confident all key aspects are well-covered.'
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
            
            // Use the provided API key or fall back to environment variable
            const apiKey = this.apiKey || process.env[providerConfig.envKey];
            if (!apiKey) {
                throw new Error(`No API key provided for provider: ${provider}`);
            }

            // Combine all gathered information
            const allInformation = digestedResults.map((digest, index) => {
                const links = digest.links.map(link => `${link.title} (${link.url})`).join(', ');
                return `Research ${index + 1} - ${digest.searchQuery}:\n${digest.summary}\nSources: ${links}`;
            }).join('\n\n');

            const finalPrompt = `Based on comprehensive multi-search research, provide the most complete and authoritative answer possible to this question.

Question: "${originalQuery}"

Comprehensive Research Gathered from Multiple Sources:
${allInformation}

Please provide a thorough, expertly-crafted answer that:
1. COMPLETELY addresses the question from all important angles
2. Synthesizes information from ALL research sources intelligently
3. Includes specific facts, data, examples, and details from the research
4. Cites relevant sources with URLs when stating facts or claims
5. Covers different perspectives, approaches, or viewpoints where relevant
6. Is well-organized with clear structure and logical flow
7. Ensures no important aspects of the topic are left unaddressed
8. Provides depth and nuance appropriate to the complexity of the question

Create a comprehensive, authoritative response that demonstrates the full value of the extensive research conducted:`;

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
                max_tokens: 2000,
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
 * Main Lambda handler function with streaming support
 */
exports.handler = async (event, context) => {
    const startTime = Date.now();
    
    // Check if this is a streaming request
    const isStreamingRequest = event.headers?.['accept'] === 'text/event-stream' || 
                              event.queryStringParameters?.stream === 'true';
    
    if (isStreamingRequest) {
        // For streaming, we'll use Server-Sent Events format
        return await handleStreamingRequest(event, context, startTime);
    }
    
    // Fallback to non-streaming for compatibility
    return await handleNonStreamingRequest(event, context, startTime);
};

/**
 * Create a streaming response accumulator
 */
class StreamingResponse {
    constructor() {
        this.chunks = [];
    }
    
    write(data) {
        this.chunks.push(`data: ${JSON.stringify(data)}\n\n`);
    }
    
    writeEvent(type, data) {
        this.chunks.push(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    
    getResponse() {
        return this.chunks.join('');
    }
}

/**
 * Handle streaming requests with Server-Sent Events
 */
async function handleStreamingRequest(event, context, startTime) {
    const stream = new StreamingResponse();
    
    try {
        const initialMemory = process.memoryUsage();
        stream.writeEvent('log', {
            message: `Lambda handler started. Initial memory: RSS=${Math.round(initialMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(initialMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB`,
            timestamp: new Date().toISOString()
        });
    } catch (memoryError) {
        stream.writeEvent('log', {
            message: `Lambda handler started. Memory logging error: ${memoryError.message}`,
            timestamp: new Date().toISOString()
        });
    }
    
    // Initialize query variable for error handling
    let query = '';
    
    try {
        // Extract parameters from request (POST only)
        let limit, fetchContent, timeout, model, accessSecret, apiKey, searchMode;
        
        // Extract the HTTP method (support both API Gateway and Function URL formats)
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        
        if (httpMethod !== 'POST') {
            stream.writeEvent('error', {
                error: 'Method not allowed. Only POST requests are supported.',
                timestamp: new Date().toISOString()
            });
            
            return {
                statusCode: 405,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                body: stream.getResponse()
            };
        }
        
        const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        limit = parseInt(body.limit) || 10;
        fetchContent = body.fetchContent || false;
        timeout = parseInt(body.timeout) || 30000;
        model = body.model || 'groq:llama-3.1-8b-instant';
        accessSecret = body.accessSecret || '';
        apiKey = body.apiKey || '';
        searchMode = body.searchMode || 'web_search';
        
        stream.writeEvent('log', {
            message: `Processing request for query: "${query}" with model: ${model}`,
            timestamp: new Date().toISOString()
        });
        
        // Validate required parameters
        if (!query) {
            stream.writeEvent('error', {
                error: 'Query parameter is required',
                timestamp: new Date().toISOString()
            });
            
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                body: stream.getResponse()
            };
        }
        
        // Initialize streaming response data
        const streamingResults = {
            query: query,
            searches: [],
            finalResponse: null,
            metadata: {
                searchMode: searchMode,
                model: model,
                iterations: 0,
                maxIterations: 3,
                totalSearchResults: 0
            }
        };
        
        stream.writeEvent('init', streamingResults);
        
        // Start the multi-search process with streaming
        const finalResult = await executeMultiSearchWithStreaming(
            query, 
            limit, 
            fetchContent, 
            timeout, 
            model, 
            accessSecret, 
            apiKey, 
            searchMode,
            null, // No custom systemPrompts
            null, // No custom decisionTemplate  
            null, // No custom searchTemplate
            stream
        );
        
        // Send final completion event
        stream.writeEvent('complete', {
            result: finalResult,
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
        });
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            },
            body: stream.getResponse()
        };
        
    } catch (error) {
        stream.writeEvent('error', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            },
            body: stream.getResponse()
        };
    }
}

/**
 * Execute multi-search with streaming updates
 */
async function executeMultiSearchWithStreaming(
    query, 
    limit, 
    fetchContent, 
    timeout, 
    model, 
    accessSecret, 
    apiKey, 
    searchMode,
    systemPrompts,
    decisionTemplate,
    searchTemplate,
    stream
) {
    let allSearchResults = [];
    let searchesPerformed = [];
    const maxIterations = 3;
    
    try {
        // Process initial decision to get search terms
        if (stream) {
            stream.writeEvent('step', {
                type: 'initial_decision',
                message: 'Analyzing query to determine search strategy...',
                timestamp: new Date().toISOString()
            });
        }
        
        const initialDecision = await processInitialDecision(
            query, 
            model, 
            accessSecret, 
            apiKey, 
            systemPrompts, 
            decisionTemplate
        );
        
        if (stream) {
            stream.writeEvent('decision', {
                decision: initialDecision,
                timestamp: new Date().toISOString()
            });
        }
        
        // If direct response is possible, return it
        if (!initialDecision.needsSearch && initialDecision.directResponse) {
            if (stream) {
                stream.writeEvent('final_response', {
                    response: initialDecision.directResponse,
                    totalResults: 0,
                    searchIterations: 0,
                    timestamp: new Date().toISOString()
                });
            }
            
            return {
                query: query,
                searches: [],
                searchResults: [],
                response: initialDecision.directResponse,
                metadata: {
                    totalResults: 0,
                    searchIterations: 0,
                    finalModel: model,
                    searchMode: 'direct',
                    directResponse: true
                }
            };
        }
        
        // Perform iterative searches
        const searchTerms = initialDecision.searchTerms || [query];
        
        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            if (stream) {
                stream.writeEvent('step', {
                    type: 'search_iteration',
                    iteration: iteration,
                    message: `Starting search iteration ${iteration}/${maxIterations}...`,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Use initial search terms for first iteration
            const currentSearchTerms = iteration === 1 ? 
                searchTerms : 
                await generateAdditionalSearchTerms(query, allSearchResults, model, accessSecret, apiKey);
                
            for (let i = 0; i < currentSearchTerms.length; i++) {
                const searchTerm = currentSearchTerms[i];
                
                if (stream) {
                    stream.writeEvent('search', {
                        term: searchTerm,
                        iteration: iteration,
                        searchIndex: i + 1,
                        totalSearches: currentSearchTerms.length,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Perform the search
                const searchResults = await performSearch(
                    searchTerm, 
                    limit, 
                    fetchContent, 
                    timeout, 
                    searchMode
                );
                
                allSearchResults.push(...searchResults);
                searchesPerformed.push({
                    iteration: iteration,
                    query: searchTerm,
                    resultsCount: searchResults.length
                });
                
                if (stream) {
                    stream.writeEvent('search_results', {
                        term: searchTerm,
                        resultsCount: searchResults.length,
                        iteration: iteration,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            
            // Check if we should continue searching
            if (stream) {
                stream.writeEvent('step', {
                    type: 'continuation_check',
                    message: 'Evaluating if additional searches are needed...',
                    timestamp: new Date().toISOString()
                });
            }
            
            const shouldContinue = await shouldContinueSearching(
                query, 
                allSearchResults, 
                iteration, 
                maxIterations, 
                model, 
                accessSecret, 
                apiKey, 
                systemPrompts
            );
            
            if (stream) {
                stream.writeEvent('continuation', {
                    shouldContinue: shouldContinue.shouldContinue,
                    reasoning: shouldContinue.reasoning,
                    iteration: iteration,
                    timestamp: new Date().toISOString()
                });
            }
            
            if (!shouldContinue.shouldContinue) {
                if (stream) {
                    stream.writeEvent('step', {
                        type: 'search_complete',
                        message: `Search process completed after ${iteration} iterations`,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
            }
        }
        
        // Generate final response
        if (stream) {
            stream.writeEvent('step', {
                type: 'final_generation',
                message: 'Generating comprehensive response...',
                timestamp: new Date().toISOString()
            });
        }
        
        const finalResponse = await generateFinalResponse(
            query, 
            allSearchResults, 
            model, 
            accessSecret, 
            apiKey, 
            systemPrompts, 
            searchTemplate
        );
        
        // Prepare final result
        const result = {
            query: query,
            searches: searchesPerformed,
            searchResults: allSearchResults,
            response: finalResponse,
            metadata: {
                totalResults: allSearchResults.length,
                searchIterations: searchesPerformed.length,
                finalModel: model,
                searchMode: searchMode
            }
        };
        
        if (stream) {
            stream.writeEvent('final_response', {
                response: finalResponse,
                totalResults: allSearchResults.length,
                searchIterations: searchesPerformed.length,
                timestamp: new Date().toISOString(),
                searchResults: allSearchResults,
                searches: searchesPerformed
            });
        }
        
        return result;
        
    } catch (error) {
        if (stream) {
            stream.writeEvent('error', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        }
        throw error;
    }
}

/**
 * Generate additional search terms for subsequent iterations
 */
async function generateAdditionalSearchTerms(query, existingResults, model, accessSecret, apiKey) {
    // Simple implementation - could be enhanced with LLM-generated terms
    const baseTerms = query.split(' ').filter(term => term.length > 2);
    return baseTerms.map(term => `${term} additional information`).slice(0, 2);
}

/**
 * Process initial decision to determine search strategy
 */
async function processInitialDecision(query, model, accessSecret, apiKey, systemPrompts = null, decisionTemplate = null) {
    // Use default templates and prompts
    const llmClient = new LLMClient(apiKey, {}, {});
    
    try {
        const decision = await llmClient.processInitialDecision(query, { model });
        
        // Convert decision format to search terms
        if (decision.search_queries && Array.isArray(decision.search_queries)) {
            return {
                needsSearch: true,
                searchTerms: decision.search_queries,
                usage: decision.usage
            };
        } else if (decision.response) {
            return {
                needsSearch: false,
                directResponse: decision.response,
                usage: decision.usage
            };
        } else {
            // Fallback to search mode
            return {
                needsSearch: true,
                searchTerms: [query],
                usage: decision.usage
            };
        }
    } catch (error) {
        console.error('Initial decision error:', error);
        // Fallback to search mode
        return {
            needsSearch: true,
            searchTerms: [query]
        };
    }
}

/**
 * Perform search using DuckDuckGo
 */
async function performSearch(searchTerm, limit, fetchContent, timeout, searchMode) {
    try {
        const searcher = new DuckDuckGoSearcher();
        const searchResult = await searcher.search(searchTerm, limit, fetchContent, timeout);
        return searchResult.results || [];
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

/**
 * Check if we should continue searching
 */
async function shouldContinueSearching(query, allSearchResults, iteration, maxIterations, model, accessSecret, apiKey, systemPrompts = null) {
    // Simple logic for now - stop after 2 iterations or if we have enough results
    if (iteration >= 2 || allSearchResults.length >= 15) {
        return {
            shouldContinue: false,
            reasoning: `Stopping after ${iteration} iterations with ${allSearchResults.length} results`
        };
    }
    
    return {
        shouldContinue: true,
        reasoning: `Continuing search to gather more comprehensive information`
    };
}

/**
 * Generate final response from search results
 */
async function generateFinalResponse(query, allSearchResults, model, accessSecret, apiKey, systemPrompts = null, searchTemplate = null) {
    // Create LLMClient with proper system prompts and search template
    const llmClient = new LLMClient(apiKey, systemPrompts || {}, { search: searchTemplate });
    
    try {
        const response = await llmClient.processWithLLMWithRetry(query, allSearchResults, { model });
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Final response generation error:', error);
        
        // Fallback response
        const resultSummary = allSearchResults.slice(0, 5).map((result, index) => 
            `${index + 1}. ${result.title} (${result.url})\n${result.description || 'No description available'}`
        ).join('\n\n');
        
        return `Based on search results for "${query}":\n\n${resultSummary}\n\nNote: Full AI processing encountered an error, but these search results provide relevant information.`;
    }
}

/**
 * Handle non-streaming requests (original behavior)
 */
async function handleNonStreamingRequest(event, context, startTime) {
    const initialMemory = process.memoryUsage();
    console.log(`Lambda handler started. Initial memory: RSS=${Math.round(initialMemory.rss / BYTES_PER_MB * 100) / 100}MB, Heap=${Math.round(initialMemory.heapUsed / BYTES_PER_MB * 100) / 100}MB`);
    
    let query = '';
    
    try {
        // Extract parameters from request
        let limit, fetchContent, timeout, model, accessSecret, apiKey, searchMode;
        
        // Extract the HTTP method (support both API Gateway and Function URL formats)
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        
        if (httpMethod === 'OPTIONS') {
            // Let AWS Lambda Function URL handle CORS preflight
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: ''
            };
        }
        
        if (httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Method not allowed. Only POST requests are supported.',
                    timestamp: new Date().toISOString()
                })
            };
        }
        
        const body = JSON.parse(event.body || '{}');
        query = body.query || '';
        limit = parseInt(body.limit) || 10;
        fetchContent = body.fetchContent || false;
        timeout = parseInt(body.timeout) || 30000;
        model = body.model || 'groq:llama-3.1-8b-instant';
        accessSecret = body.accessSecret || '';
        apiKey = body.apiKey || '';
        searchMode = body.searchMode || 'web_search';
        
        console.log(`Processing non-streaming request for query: "${query}" with model: ${model}`);
        
        // Validate required parameters
        if (!query) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Query parameter is required',
                    timestamp: new Date().toISOString()
                })
            };
        }
        
        // Execute the multi-search process
        const finalResult = await executeMultiSearchWithStreaming(
            query, 
            limit, 
            fetchContent, 
            timeout, 
            model, 
            accessSecret, 
            apiKey, 
            searchMode,
            null, // No custom systemPrompts
            null, // No custom decisionTemplate
            null, // No custom searchTemplate
            null // No streaming for non-streaming requests
        );
        
        const processingTime = Date.now() - startTime;
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...finalResult,
                processingTime: processingTime,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Lambda handler error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message,
                query: query,
                timestamp: new Date().toISOString()
            })
        };
    }
}
