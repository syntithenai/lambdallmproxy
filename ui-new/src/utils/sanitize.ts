import DOMPurify from 'dompurify';

/**
 * Sanitize HTML to prevent XSS attacks
 * Removes scripts, event handlers, and dangerous attributes
 * 
 * @param dirty - Untrusted HTML string
 * @returns Sanitized HTML safe for rendering
 * 
 * @example
 * const safe = sanitizeHTML('<p>Hello</p><script>alert("XSS")</script>');
 * // Returns: '<p>Hello</p>'
 */
export function sanitizeHTML(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'a', 'p', 'br', 
      'span', 'div', 'mark', 'code', 'pre', 'h1', 'h2', 'h3',
      'ul', 'ol', 'li', 'blockquote'
    ],
    ALLOWED_ATTR: ['href', 'title', 'class', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false
  });
}

/**
 * Highlight keywords in text safely
 * Escapes HTML first, then wraps keywords in <mark> tags
 * 
 * @param text - Text to highlight
 * @param keywords - Keywords to highlight
 * @returns Safe HTML with highlighted keywords
 * 
 * @example
 * const highlighted = highlightKeywordsSafe('Hello world', ['world']);
 * // Returns: 'Hello <mark class="bg-yellow-200">world</mark>'
 */
export function highlightKeywordsSafe(text: string, keywords: string[]): string {
  if (!text) return '';
  
  // First escape all HTML
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  // Then highlight keywords (now safe since HTML is escaped)
  let result = escaped;
  keywords.forEach(keyword => {
    if (!keyword || !keyword.trim()) return;
    const regex = new RegExp(`(${escapeRegex(keyword)})`, 'gi');
    result = result.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
  });
  
  return result;
}

/**
 * Escape special regex characters
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate that a string is a data URL (for images)
 * @param url - URL to validate
 * @returns true if valid data URL
 * 
 * @example
 * isDataURL('data:image/png;base64,iVBORw0KGgo...'); // true
 * isDataURL('https://example.com/image.png'); // false
 */
export function isDataURL(url: string): boolean {
  return /^data:image\/(png|jpg|jpeg|gif|webp|svg\+xml);base64,/.test(url);
}

/**
 * Sanitize SVG content for safe rendering
 * Removes scripts and event handlers while preserving SVG structure
 * 
 * @param svgString - SVG content to sanitize
 * @returns Sanitized SVG safe for rendering
 */
export function sanitizeSVG(svgString: string): string {
  return DOMPurify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOWED_TAGS: [
      'svg', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
      'text', 'tspan', 'g', 'defs', 'clipPath', 'marker', 'symbol', 'use',
      'linearGradient', 'radialGradient', 'stop', 'pattern', 'filter', 'feGaussianBlur',
      'feOffset', 'feMerge', 'feMergeNode', 'feColorMatrix', 'feBlend'
    ],
    ALLOWED_ATTR: [
      'xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry',
      'd', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform', 'class', 'id',
      'x1', 'x2', 'y1', 'y2', 'offset', 'stop-color', 'stop-opacity', 'font-size',
      'font-family', 'text-anchor', 'style', 'preserveAspectRatio'
    ],
    ALLOW_DATA_ATTR: false
  });
}
