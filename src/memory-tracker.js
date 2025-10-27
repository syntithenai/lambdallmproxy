/**
 * Memory tracking utilities for Lambda function optimization
 */

// Memory management constants
// Infer memory limit from environment when possible
const LAMBDA_MEMORY_LIMIT_MB = (process.env.AWS_MEM && parseInt(process.env.AWS_MEM, 10))
    || (process.env.LAM_MEM && parseInt(process.env.LAM_MEM, 10))
    || 128;
const MEMORY_SAFETY_BUFFER_MB = 16; // Reserve 16MB for other operations
const MAX_CONTENT_SIZE_MB = LAMBDA_MEMORY_LIMIT_MB - MEMORY_SAFETY_BUFFER_MB;
const BYTES_PER_MB = 1024 * 1024;

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

module.exports = {
    LAMBDA_MEMORY_LIMIT_MB,
    MEMORY_SAFETY_BUFFER_MB,
    MAX_CONTENT_SIZE_MB,
    BYTES_PER_MB,
    MemoryTracker,
    TokenAwareMemoryTracker
};