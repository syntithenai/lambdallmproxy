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
     * Extract all images from HTML
     * @returns {Array} Array of {src, alt, title, context} objects
     */
    extractImages() {
        const images = [];
        const imgRegex = /<img[^>]*>/gi;
        let match;

        while ((match = imgRegex.exec(this.html)) !== null) {
            const imgTag = match[0];
            
            // Extract src attribute
            const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
            if (!srcMatch) continue;
            const src = srcMatch[1];
            
            // Skip if src is empty, data URI, or tracking pixel
            if (!src || src.startsWith('data:') || src.includes('pixel') || src.includes('track')) continue;
            if (src.match(/1x1|tracking|beacon|analytics/i)) continue;
            
            // Extract alt attribute
            const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
            const alt = altMatch ? altMatch[1] : '';
            
            // Extract title attribute
            const titleMatch = imgTag.match(/title=["']([^"']*)["']/i);
            const title = titleMatch ? titleMatch[1] : '';
            
            // Get context around the image
            const imgStart = match.index;
            const contextStart = Math.max(0, imgStart - 200);
            const contextEnd = Math.min(this.html.length, imgStart + match[0].length + 200);
            const context = this.stripHtml(this.html.substring(contextStart, contextEnd)).trim();
            
            images.push({
                src: src,
                alt: alt || '',
                title: title || '',
                context: context
            });
        }

        return images;
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

module.exports = {
    SimpleHTMLParser
};