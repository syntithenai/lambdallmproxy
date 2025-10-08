/**
 * Simple HTML parser for extracting links and text
 */
class SimpleHTMLParser {
    constructor(html, query = '') {
        this.html = html;
        this.query = query.toLowerCase();
        this.queryWords = query ? query.toLowerCase().split(/\s+/).filter(w => w.length > 2) : [];
    }

    /**
     * Calculate relevance score for text based on query
     * @param {string} text - Text to score
     * @returns {number} Relevance score (0-1)
     */
    calculateRelevance(text) {
        if (!text || !this.queryWords.length) return 0;
        
        const lowerText = text.toLowerCase();
        let score = 0;
        
        // Count query word matches
        for (const word of this.queryWords) {
            const matches = (lowerText.match(new RegExp(word, 'g')) || []).length;
            score += matches * 0.3;
        }
        
        // Bonus for title/heading context
        if (text.length < 100 && text.match(/^[A-Z]/)) {
            score += 0.2;
        }
        
        // Normalize to 0-1
        return Math.min(score, 1);
    }

    /**
     * Extract media URL type
     * @param {string} url - URL to check
     * @returns {string|null} Media type: 'youtube', 'video', 'audio', or null
     */
    getMediaType(url) {
        if (!url) return null;
        
        const lower = url.toLowerCase();
        
        // YouTube detection
        if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
            return 'youtube';
        }
        
        // Video file extensions
        if (lower.match(/\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|m4v)(\?|$)/i)) {
            return 'video';
        }
        
        // Audio file extensions
        if (lower.match(/\.(mp3|wav|ogg|m4a|aac|flac|wma|opus)(\?|$)/i)) {
            return 'audio';
        }
        
        // Streaming services
        if (lower.match(/vimeo\.com|dailymotion\.com|twitch\.tv|soundcloud\.com|spotify\.com/)) {
            return 'media';
        }
        
        return null;
    }

    /**
     * Extract caption/alt text for image from surrounding context
     * @param {string} imgTag - Full img tag
     * @param {number} position - Position in HTML
     * @returns {string} Best caption found
     */
    extractImageCaption(imgTag, position) {
        // Try alt text first
        const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
        if (altMatch && altMatch[1].trim()) return altMatch[1].trim();
        
        // Try title attribute
        const titleMatch = imgTag.match(/title=["']([^"']*)["']/i);
        if (titleMatch && titleMatch[1].trim()) return titleMatch[1].trim();
        
        // Look for figcaption nearby
        const contextStart = Math.max(0, position - 500);
        const contextEnd = Math.min(this.html.length, position + 500);
        const context = this.html.substring(contextStart, contextEnd);
        
        const captionMatch = context.match(/<figcaption[^>]*>(.*?)<\/figcaption>/is);
        if (captionMatch) {
            return this.stripHtml(captionMatch[1]).trim();
        }
        
        // Look for nearby paragraph or span with caption-like class
        const nearbyText = context.match(/<(?:p|span|div)[^>]*class="[^"]*caption[^"]*"[^>]*>(.*?)<\/(?:p|span|div)>/is);
        if (nearbyText) {
            return this.stripHtml(nearbyText[1]).trim();
        }
        
        return '';
    }

    /**
     * Extract all links from HTML with caption and relevance
     * @returns {Array} Array of {href, text, caption, context, relevance} objects, sorted by relevance
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
                
                // Check for caption in title attribute or aria-label
                const linkTag = match[0];
                const titleMatch = linkTag.match(/title=["']([^"']*)["']/i);
                const ariaMatch = linkTag.match(/aria-label=["']([^"']*)["']/i);
                const caption = (titleMatch && titleMatch[1]) || (ariaMatch && ariaMatch[1]) || '';
                
                // Calculate relevance
                const combinedText = `${text} ${caption} ${context}`;
                const relevance = this.calculateRelevance(combinedText);
                
                // Detect media type
                const mediaType = this.getMediaType(href);
                
                links.push({
                    href,
                    text,
                    caption,
                    context,
                    relevance,
                    mediaType
                });
            }
        }

        // Sort by relevance (descending)
        return links.sort((a, b) => b.relevance - a.relevance);
    }

    /**
     * Extract all images from HTML with captions and relevance scoring
     * @param {number} limit - Maximum number of images to return (default: 3)
     * @returns {Array} Array of {src, alt, title, caption, context, relevance} objects, limited to most relevant
     */
    extractImages(limit = 3) {
        const images = [];
        const imgRegex = /<img[^>]*>/gi;
        let match;

        while ((match = imgRegex.exec(this.html)) !== null) {
            const imgTag = match[0];
            const imgStart = match.index;
            
            // Extract src attribute
            const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
            if (!srcMatch) continue;
            const src = srcMatch[1];
            
            // Skip if src is empty, data URI, or tracking pixel
            if (!src || src.startsWith('data:') || src.includes('pixel') || src.includes('track')) continue;
            if (src.match(/1x1|tracking|beacon|analytics|icon|logo|avatar|badge/i)) continue;
            
            // Extract alt attribute
            const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
            const alt = altMatch ? altMatch[1] : '';
            
            // Extract title attribute
            const titleMatch = imgTag.match(/title=["']([^"']*)["']/i);
            const title = titleMatch ? titleMatch[1] : '';
            
            // Extract comprehensive caption from surrounding context
            const caption = this.extractImageCaption(imgTag, imgStart);
            
            // Get context around the image
            const contextStart = Math.max(0, imgStart - 200);
            const contextEnd = Math.min(this.html.length, imgStart + match[0].length + 200);
            const context = this.stripHtml(this.html.substring(contextStart, contextEnd)).trim();
            
            // Calculate relevance score
            const combinedText = `${alt} ${title} ${caption} ${context}`;
            const relevance = this.calculateRelevance(combinedText);
            
            // Extract dimensions if available for quality scoring
            const widthMatch = imgTag.match(/width=["']?(\d+)/i);
            const heightMatch = imgTag.match(/height=["']?(\d+)/i);
            const width = widthMatch ? parseInt(widthMatch[1]) : 0;
            const height = heightMatch ? parseInt(heightMatch[1]) : 0;
            
            // Quality bonus for larger images (likely content images vs icons)
            let qualityScore = relevance;
            if (width > 300 || height > 300) {
                qualityScore += 0.2;
            }
            if (width < 100 && height < 100) {
                qualityScore -= 0.3; // Penalty for small images (likely icons)
            }
            
            images.push({
                src,
                alt: alt || '',
                title: title || '',
                caption,
                context,
                relevance: Math.max(0, qualityScore),
                width,
                height
            });
        }

        // Sort by relevance (descending) and return top N
        return images
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, limit);
    }
    
    /**
     * Categorize extracted links by media type
     * @param {Array} links - Array of link objects from extractLinks()
     * @returns {Object} Object with youtube, audio, video, media, and regular arrays
     */
    categorizeLinks(links) {
        const categorized = {
            youtube: [],
            video: [],
            audio: [],
            media: [],
            regular: []
        };
        
        for (const link of links) {
            if (link.mediaType === 'youtube') {
                categorized.youtube.push(link);
            } else if (link.mediaType === 'video') {
                categorized.video.push(link);
            } else if (link.mediaType === 'audio') {
                categorized.audio.push(link);
            } else if (link.mediaType === 'media') {
                categorized.media.push(link);
            } else {
                categorized.regular.push(link);
            }
        }
        
        return categorized;
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