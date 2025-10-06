/**
 * HTML Content Extraction and Conversion
 * Extracts readable content from HTML and converts to Markdown or plain text
 */

/**
 * Convert HTML to Markdown-like format
 * @param {string} html - Raw HTML content
 * @returns {string} Markdown-formatted text
 */
function htmlToMarkdown(html) {
    if (!html || typeof html !== 'string') return '';
    
    let text = html;
    
    // Remove script, style, and other non-content tags with their content
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
    
    // Remove navigation, header, footer, aside elements
    text = text.replace(/<(header|nav|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, '');
    text = text.replace(/<div[^>]*class="[^"]*(?:nav|menu|sidebar|footer|header|ad|advertisement|cookie|banner)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
    text = text.replace(/<div[^>]*id="[^"]*(?:nav|menu|sidebar|footer|header|ad|advertisement|cookie|banner)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
    
    // Convert headings to Markdown
    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n\n# $1\n\n');
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n\n## $1\n\n');
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n\n### $1\n\n');
    text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n\n#### $1\n\n');
    text = text.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n\n##### $1\n\n');
    text = text.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n\n###### $1\n\n');
    
    // Convert code blocks
    text = text.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '\n```\n$1\n```\n');
    text = text.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '\n```\n$1\n```\n');
    text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    
    // Convert links to Markdown FIRST (before other conversions that might strip nested tags)
    text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gis, '[$2]($1)');
    
    // Convert emphasis
    text = text.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**');
    text = text.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*');
    
    // Convert lists to Markdown
    text = text.replace(/<ul[^>]*>/gi, '\n');
    text = text.replace(/<\/ul>/gi, '\n');
    text = text.replace(/<ol[^>]*>/gi, '\n');
    text = text.replace(/<\/ol>/gi, '\n');
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n');
    
    // Convert blockquotes
    text = text.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '\n> $1\n');
    
    // Convert horizontal rules
    text = text.replace(/<hr\s*\/?>/gi, '\n---\n');
    
    // Convert paragraphs and breaks with better spacing
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<p[^>]*>/gi, '');
    text = text.replace(/<br\s*\/?>/gi, '  \n'); // Two spaces + newline for proper markdown line break
    text = text.replace(/<\/div>/gi, '\n');
    
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');
    
    // Decode HTML entities
    text = decodeHtmlEntities(text);
    
    // Clean up whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Max 2 consecutive newlines
    text = text.replace(/[ \t]+/g, ' '); // Multiple spaces to single space
    text = text.replace(/^\s+|\s+$/gm, ''); // Trim lines
    
    return text.trim();
}

/**
 * Decode HTML entities
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
    if (!text) return '';
    
    const entities = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&cent;': '¢',
        '&pound;': '£',
        '&yen;': '¥',
        '&euro;': '€',
        '&copy;': '©',
        '&reg;': '®',
        '&trade;': '™'
    };
    
    // Replace named entities
    for (const [entity, char] of Object.entries(entities)) {
        text = text.replace(new RegExp(entity, 'g'), char);
    }
    
    // Replace numeric entities (decimal)
    text = text.replace(/&#(\d+);/g, (match, dec) => {
        try {
            return String.fromCharCode(parseInt(dec, 10));
        } catch (e) {
            return match;
        }
    });
    
    // Replace numeric entities (hex)
    text = text.replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
        try {
            return String.fromCharCode(parseInt(hex, 16));
        } catch (e) {
            return match;
        }
    });
    
    return text;
}

/**
 * Extract main content from HTML using simple heuristics
 * @param {string} html - Raw HTML content
 * @returns {string} Main content HTML
 */
function extractMainContent(html) {
    if (!html || typeof html !== 'string') return '';
    
    // Try to find main content areas in order of preference
    const contentPatterns = [
        // Semantic HTML5 main/article tags (capture group 1)
        { pattern: /<main[^>]*>([\s\S]*?)<\/main>/i, group: 1 },
        { pattern: /<article[^>]*>([\s\S]*?)<\/article>/i, group: 1 },
        
        // Common content container classes/ids (capture group 2 because group 1 is the class name)
        { pattern: /<div[^>]*class="[^"]*\b(main-content|article|post-content|entry-content|page-content|content-body)\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i, group: 2 },
        { pattern: /<div[^>]*id="[^"]*\b(main-content|article|post-content|entry-content|page-content|content-body)\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i, group: 2 },
        
        // Generic content containers (capture group 1)
        { pattern: /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i, group: 1 },
        { pattern: /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i, group: 1 },
        
        // Body tag as last resort (capture group 1)
        { pattern: /<body[^>]*>([\s\S]*?)<\/body>/i, group: 1 }
    ];
    
    for (const { pattern, group } of contentPatterns) {
        const match = html.match(pattern);
        if (match && match[group]) {
            const content = match[group];
            // Only use if it's substantial content (lowered threshold for better extraction)
            if (content.length > 50) {
                return content;
            }
        }
    }
    
    // If no main content found, return full HTML (will be filtered anyway)
    return html;
}

/**
 * Simple plain text extraction (fallback)
 * @param {string} html - Raw HTML content
 * @returns {string} Plain text
 */
function htmlToText(html) {
    if (!html || typeof html !== 'string') return '';
    
    let text = html;
    
    // Remove unwanted elements
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/<(header|nav|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, '');
    
    // Convert structural elements to newlines
    text = text.replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    
    // Decode entities
    text = decodeHtmlEntities(text);
    
    // Clean up whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/^\s+|\s+$/gm, '');
    
    return text.trim();
}

/**
 * Extract and convert HTML content to readable format
 * Tries Markdown first, falls back to plain text
 * @param {string} html - Raw HTML content
 * @param {Object} options - Extraction options
 * @returns {Object} Extracted content with metadata
 */
function extractContent(html, options = {}) {
    if (!html || typeof html !== 'string') {
        return {
            content: '',
            format: 'none',
            originalLength: 0,
            extractedLength: 0,
            error: 'No HTML content provided'
        };
    }
    
    const originalLength = html.length;
    
    try {
        // Step 1: Extract main content area
        const mainContent = extractMainContent(html);
        
        // Step 2: Try Markdown conversion (preferred)
        const markdown = htmlToMarkdown(mainContent);
        
        // Step 3: Validate Markdown output (lowered threshold for tests and short content)
        if (markdown && markdown.length > 10) {
            return {
                content: markdown,
                format: 'markdown',
                originalLength,
                extractedLength: markdown.length,
                compressionRatio: (markdown.length / originalLength).toFixed(2)
            };
        }
        
        // Step 4: Fallback to plain text
        const plainText = htmlToText(mainContent);
        
        if (plainText && plainText.length > 10) {
            return {
                content: plainText,
                format: 'text',
                originalLength,
                extractedLength: plainText.length,
                compressionRatio: (plainText.length / originalLength).toFixed(2)
            };
        }
        
        // Step 5: Last resort - basic text extraction from full HTML
        const basicText = htmlToText(html);
        
        return {
            content: basicText,
            format: 'text',
            originalLength,
            extractedLength: basicText.length,
            compressionRatio: (basicText.length / originalLength).toFixed(2),
            warning: 'Fallback extraction used'
        };
        
    } catch (error) {
        console.error('Content extraction error:', error);
        
        // Emergency fallback - strip all HTML
        const emergency = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        
        return {
            content: emergency,
            format: 'text',
            originalLength,
            extractedLength: emergency.length,
            error: error.message,
            warning: 'Emergency fallback used'
        };
    }
}

module.exports = {
    extractContent,
    htmlToMarkdown,
    htmlToText,
    extractMainContent,
    decodeHtmlEntities
};
