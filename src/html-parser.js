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

module.exports = {
    SimpleHTMLParser
};