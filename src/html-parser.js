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
        
        // YouTube video detection - must have a valid video ID
        // Valid patterns: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
        // Invalid: youtube.com/playlist, youtube.com/channel, youtube.com/user, youtube.com/c/, youtube.com/@
        if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
            const videoIdPatterns = [
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
                /youtube\.com\/shorts\/([^&\n?#]+)/
            ];
            
            for (const pattern of videoIdPatterns) {
                const match = url.match(pattern);
                if (match && match[1]) {
                    return 'youtube';
                }
            }
            // If it's a YouTube URL but doesn't match video patterns, it's not a video
            return null;
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
     * Check if link should be filtered out (navigation, ads, footer, etc.)
     * @param {string} href - The link URL
     * @param {string} text - The link text
     * @param {string} linkTag - The full <a> tag HTML
     * @param {number} position - Position in HTML (for detecting header/footer)
     * @returns {boolean} True if link should be filtered out
     */
    shouldFilterLink(href, text, linkTag, position) {
        // Filter by URL patterns
        const navPatterns = [
            '/page/', '/edit/', '/user/', '/admin/', '/login/', '/signup/', '/register/',
            'javascript:', '#', 'mailto:', '/search?', '/tag/', '/category/',
            '/privacy', '/terms', '/about', '/contact', '/sitemap', '/rss',
            '/cookie', '/disclaimer', '/advertise', '/careers', '/jobs',
            '?share=', '?utm_', '/share/', '/print/', '/pdf/'
        ];
        
        // Ad and tracking domains
        const adDomains = [
            'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
            'ads.yahoo.com', 'advertising.com', 'adnxs.com', 'criteo.com',
            'outbrain.com', 'taboola.com', 'revcontent.com', 'mgid.com',
            'zergnet.com', 'disqus.com', 'spot.im', 'facebook.com/sharer',
            'twitter.com/intent', 'linkedin.com/share', 'pinterest.com/pin'
        ];
        
        // Common navigation text patterns (case-insensitive)
        const navTextPatterns = [
            /^home$/i, /^about$/i, /^contact$/i, /^privacy$/i, /^terms$/i,
            /^login$/i, /^sign in$/i, /^sign up$/i, /^register$/i, /^subscribe$/i,
            /^menu$/i, /^nav/i, /^skip to/i, /^back to top$/i, /^top$/i,
            /^next$/i, /^previous$/i, /^prev$/i, /^more$/i, /^view all$/i,
            /^share$/i, /^print$/i, /^email$/i, /^follow us$/i, /^social$/i,
            /^copyright/i, /^all rights reserved/i, /^\d{4}$/i, // Years
            /^←$/i, /^→$/i, /^«$/i, /^»$/i // Navigation arrows
        ];
        
        // Check URL patterns
        const hrefLower = href.toLowerCase();
        if (navPatterns.some(pattern => hrefLower.includes(pattern))) {
            return true;
        }
        
        // Check ad domains
        if (adDomains.some(domain => hrefLower.includes(domain))) {
            return true;
        }
        
        // Check link text patterns
        const textLower = text.toLowerCase().trim();
        if (textLower.length === 0 || textLower.length > 150) {
            return true; // Empty or extremely long text
        }
        if (navTextPatterns.some(pattern => pattern.test(textLower))) {
            return true;
        }
        
        // Check for parent element context (header, footer, nav, aside)
        const contextStart = Math.max(0, position - 500);
        const contextHtml = this.html.substring(contextStart, position);
        const parentMatch = contextHtml.match(/<(header|footer|nav|aside)[^>]*>(?:(?!<\/\1>).)*$/is);
        if (parentMatch) {
            return true; // Link is inside header/footer/nav/aside
        }
        
        // Check for ad-related classes/ids in the link tag
        const adClassPatterns = /class=["'][^"']*(?:ad|advertisement|sponsored|promo|banner|sidebar|widget|footer|header|nav)[^"']*["']/i;
        const adIdPatterns = /id=["'][^"']*(?:ad|advertisement|sponsored|promo|banner|sidebar|widget|footer|header|nav)[^"']*["']/i;
        if (adClassPatterns.test(linkTag) || adIdPatterns.test(linkTag)) {
            return true;
        }
        
        // Filter very short links (likely navigation)
        if (text.length < 3 && !/\d/.test(text)) {
            return true; // Single/double char non-numeric text
        }
        
        return false;
    }

    /**
     * Extract all links from HTML with caption and relevance
     * @param {number} maxLinks - Maximum number of links to return (default: 50)
     * @returns {Array} Array of {href, text, caption, context, relevance} objects, sorted by relevance
     */
    extractLinks(maxLinks = 50) {
        const links = [];
        const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
        let match;

        while ((match = linkRegex.exec(this.html)) !== null) {
            const href = match[1];
            const innerHTML = match[2];
            const text = this.stripHtml(innerHTML).trim();
            const linkTag = match[0];
            const linkStart = match.index;
            
            // Filter out unwanted links
            if (!href || !text || this.shouldFilterLink(href, text, linkTag, linkStart)) {
                continue;
            }
            
            // Must be an absolute or relative URL (not anchor-only or javascript)
            if (!href.startsWith('http') && !href.startsWith('/') && !href.startsWith('./')) {
                continue;
            }
            
            // Get context around the link (smaller range for performance)
            const contextStart = Math.max(0, linkStart - 150);
            const contextEnd = Math.min(this.html.length, linkStart + match[0].length + 150);
            const context = this.stripHtml(this.html.substring(contextStart, contextEnd)).trim();
            
            // Check for caption in title attribute or aria-label
            const titleMatch = linkTag.match(/title=["']([^"']*)["']/i);
            const ariaMatch = linkTag.match(/aria-label=["']([^"']*)["']/i);
            const caption = (titleMatch && titleMatch[1]) || (ariaMatch && ariaMatch[1]) || '';
            
            // Calculate relevance with boost for content-heavy links
            const combinedText = `${text} ${caption} ${context}`;
            let relevance = this.calculateRelevance(combinedText);
            
            // Boost links with substantial text (likely articles/content)
            if (text.length > 20 && text.length < 100) {
                relevance += 0.2;
            }
            
            // Boost links with descriptive context
            if (context.length > 50) {
                relevance += 0.1;
            }
            
            // Penalize links at page edges (likely header/footer even if not detected)
            const pagePosition = linkStart / this.html.length;
            if (pagePosition < 0.1 || pagePosition > 0.9) {
                relevance -= 0.3;
            }
            
            // Detect media type
            const mediaType = this.getMediaType(href);
            
            links.push({
                href,
                text,
                caption,
                context,
                relevance: Math.max(0, Math.min(1, relevance)), // Clamp to 0-1
                mediaType
            });
        }

        // Sort by relevance (descending) and limit to maxLinks
        return links
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, maxLinks);
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