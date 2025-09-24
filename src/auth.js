/**
 * Authentication utilities for Google OAuth and email validation
 */

// Google OAuth configuration: derive allowed emails from env on-demand, so warm containers pick up changes
function getAllowedEmails() {
    const raw = process.env.ALLOWED_EMAILS || '';
    return raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Verify Google JWT token and extract user information
 * @param {string} token - Google JWT token
 * @returns {Object} - User information or null if invalid
 */
function verifyGoogleToken(token) {
    try {
        console.log(`Debug: Verifying Google token (length: ${token?.length})`);
        
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
        console.log(`Debug: Token payload parsed, email: ${payload.email}, exp: ${payload.exp}`);
        
        // Basic validation
        if (!payload.email || !payload.exp) {
            console.log('Invalid token: missing email or expiration');
            return null;
        }
        
        // Check if token is expired
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            const expiredMinutesAgo = Math.floor((now - payload.exp) / 60);
            console.log(`Token expired: ${payload.exp} < ${now} (expired ${expiredMinutesAgo} minutes ago)`);
            return null; // Return null for expired tokens - let caller handle the error message
        }
        
        // Check if email is in whitelist (read from env dynamically)
        const allowed = getAllowedEmails();
        console.log(`Debug: Allowed emails: [${allowed.join(', ')}], checking: ${payload.email}`);
        if (!allowed.includes(payload.email)) {
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

module.exports = {
    getAllowedEmails,
    verifyGoogleToken
};