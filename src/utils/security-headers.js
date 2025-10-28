/**
 * Security Headers Utility
 * 
 * Provides Content Security Policy (CSP) and other security headers
 * for API responses and static file serving.
 * 
 * ⚠️ IMPORTANT CSP IMPLICATIONS:
 * 
 * 1. **Inline Scripts/Styles**: 
 *    - CSP blocks inline <script> and <style> by default
 *    - Use 'unsafe-inline' directive as fallback (less secure)
 *    - Better: Use script-src nonce or hash (requires build-time generation)
 * 
 * 2. **External Resources**:
 *    - Only whitelisted CDNs can load scripts/styles
 *    - Add new CDNs to script-src/style-src as needed
 * 
 * 3. **Eval and Dynamic Code**:
 *    - 'unsafe-eval' needed for some libraries (e.g., math parsers, TF-IDF)
 *    - Remove 'unsafe-eval' if not using dynamic code execution
 * 
 * 4. **Images**:
 *    - 'data:' allows base64-encoded images
 *    - 'blob:' allows object URLs (e.g., generated images)
 * 
 * 5. **Frames**:
 *    - 'frame-ancestors' prevents clickjacking
 *    - 'frame-src' controls what sites can be embedded
 */

/**
 * Get Content Security Policy header value
 * 
 * This CSP is designed for a React SPA with:
 * - Vite build system (may use eval in dev mode)
 * - External CDNs (jsdelivr for libraries)
 * - Image upload/generation (data: and blob: URIs)
 * - No third-party frames/iframes
 * 
 * @returns {string} CSP directive
 */
function getContentSecurityPolicy() {
    const directives = [
        // Default fallback for all resource types
        "default-src 'self'",
        
        // Scripts: Allow self, inline scripts (for React), and specific CDNs
        // ⚠️ 'unsafe-inline' and 'unsafe-eval' reduce security but needed for:
        //    - Vite's HMR in dev mode
        //    - Inline event handlers (onclick, etc.)
        //    - Dynamic code execution (eval, Function constructor)
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://accounts.google.com https://www.gstatic.com",
        
        // Styles: Allow self, inline styles, and CDNs
        // ⚠️ 'unsafe-inline' needed for styled-components and Tailwind CSS
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
        
        // Images: Allow all sources (self, data URIs, blob URIs, HTTPS)
        // data: needed for base64 images (user uploads, generated content)
        // blob: needed for object URLs (file readers, canvas exports)
        "img-src 'self' data: blob: https:",
        
        // Fonts: Allow self and Google Fonts
        "font-src 'self' https://fonts.gstatic.com data:",
        
        // AJAX/Fetch: Allow self and specific API endpoints
        // Add Lambda Function URL and any external APIs here
        "connect-src 'self' https://*.lambda-url.us-east-1.on.aws https://*.openai.com https://*.anthropic.com https://*.googleapis.com https://accounts.google.com https://oauth2.googleapis.com wss://cast.google.com wss://*.gvt1.com",
        
        // Media: Allow self, data URIs, and blob URIs
        "media-src 'self' data: blob: https:",
        
        // Objects/Plugins: Block all (Flash, Java, etc.)
        "object-src 'none'",
        
        // Frames: Block embedding this site in iframes (clickjacking protection)
        "frame-ancestors 'none'",
        
        // Frames (this site loading others): Block all iframes
        "frame-src 'none'",
        
        // Forms: Only allow form submissions to self
        "form-action 'self'",
        
        // Prefetch: Allow DNS prefetch, preconnect from any source
        // (Not a security risk, just performance optimization)
        // "prefetch-src 'self'", // Not widely supported yet
        
        // Worker: Allow web workers from self
        "worker-src 'self' blob:",
        
        // Manifest: Allow PWA manifest from self
        "manifest-src 'self'",
        
        // Base URI: Restrict document base URL
        "base-uri 'self'",
        
        // Upgrade HTTP to HTTPS automatically
        "upgrade-insecure-requests"
    ];
    
    return directives.join('; ');
}

/**
 * Get all security headers for API responses
 * 
 * Includes:
 * - Content Security Policy (CSP)
 * - X-Frame-Options (clickjacking protection)
 * - X-Content-Type-Options (MIME sniffing protection)
 * - X-XSS-Protection (XSS filter for older browsers)
 * - Referrer-Policy (control referrer information)
 * - Permissions-Policy (control browser features)
 * 
 * @returns {Object} Headers object to merge into response metadata
 */
function getSecurityHeaders() {
    return {
        // Content Security Policy (primary XSS defense)
        'Content-Security-Policy': getContentSecurityPolicy(),
        
        // Block page from being framed (clickjacking protection)
        // Note: Redundant with CSP frame-ancestors, but kept for older browsers
        'X-Frame-Options': 'DENY',
        
        // Prevent MIME type sniffing (force browser to respect Content-Type)
        'X-Content-Type-Options': 'nosniff',
        
        // Enable XSS filter in older browsers (mostly deprecated, modern browsers use CSP)
        'X-XSS-Protection': '1; mode=block',
        
        // Control how much referrer information is sent
        // 'strict-origin-when-cross-origin' is a good balance (send origin on cross-origin, full URL on same-origin)
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        
        // Control browser features (disable unused features to reduce attack surface)
        'Permissions-Policy': 'geolocation=(self), microphone=(self), camera=(self), payment=(), usb=()'
    };
}

/**
 * Get security headers suitable for static file serving (HTML, JS, CSS)
 * 
 * Same as API headers but without certain streaming-specific headers
 * 
 * @returns {Object} Headers object
 */
function getStaticSecurityHeaders() {
    return getSecurityHeaders();
}

/**
 * Log CSP warnings to console
 * 
 * Inform developers about CSP restrictions and potential issues
 */
function logCSPWarnings() {
    console.warn('⚠️ Content Security Policy (CSP) enabled:');
    console.warn('   - Inline scripts/styles allowed (unsafe-inline) - consider using nonces for better security');
    console.warn('   - Eval allowed (unsafe-eval) - needed for some libraries but reduces security');
    console.warn('   - External CDNs whitelisted: jsdelivr.net, googleapis.com, gstatic.com');
    console.warn('   - Frames blocked (frame-ancestors: none) - cannot embed in iframes');
    console.warn('   - If external resources fail to load, add their domains to CSP directives');
    console.warn('   - To disable CSP for testing, comment out CSP header in src/utils/security-headers.js');
}

module.exports = {
    getContentSecurityPolicy,
    getSecurityHeaders,
    getStaticSecurityHeaders,
    logCSPWarnings
};
