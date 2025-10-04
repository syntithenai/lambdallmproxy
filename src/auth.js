/**
 * Authentication utilities for Google OAuth and email validation
 */

const { OAuth2Client } = require('google-auth-library');

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
 * SECURE: Cryptographically verifies token signature against Google's public keys
 * @param {string} token - Google JWT token
 * @returns {Promise<Object|null>} - User information or null if invalid
 */
async function verifyGoogleToken(token) {
    try {
        console.log(`🔒 Verifying Google token with signature verification (length: ${token?.length})`);
        
        // Get Google Client ID from environment
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            console.error('❌ GOOGLE_CLIENT_ID not set in environment variables');
            return null;
        }
        
        // Create OAuth2 client for token verification
        const client = new OAuth2Client(clientId);
        
        // ✅ SECURE: Verify token signature against Google's public keys
        // This ensures the token was actually issued by Google and hasn't been tampered with
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: clientId
        });
        
        // Extract verified payload
        const payload = ticket.getPayload();
        console.log(`✅ Token signature verified, email: ${payload.email}`);
        
        // Token expiration is already checked by verifyIdToken
        // Additional expiration check for logging
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            const expiredMinutesAgo = Math.floor((now - payload.exp) / 60);
            console.log(`❌ Token expired: ${payload.exp} < ${now} (expired ${expiredMinutesAgo} minutes ago)`);
            return null;
        }
        
        // Check if email is in whitelist (read from env dynamically)
        const allowed = getAllowedEmails();
        console.log(`🔍 Checking email against whitelist: [${allowed.join(', ')}]`);
        if (!allowed.includes(payload.email)) {
            console.log(`❌ Email not in whitelist: ${payload.email}`);
            return null;
        }
        
        console.log(`✅ Authentication successful for: ${payload.email}`);
        return {
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
            // Additional verified fields
            email_verified: payload.email_verified,
            sub: payload.sub // Google user ID
        };
        
    } catch (error) {
        // Log specific error types for debugging
        if (error.message?.includes('Token used too early')) {
            console.error('❌ Token not yet valid (nbf claim)');
        } else if (error.message?.includes('Token used too late')) {
            console.error('❌ Token expired');
        } else if (error.message?.includes('Invalid token signature')) {
            console.error('❌ Invalid token signature - possible forgery attempt');
        } else if (error.message?.includes('No pem found')) {
            console.error('❌ Unable to fetch Google public keys');
        } else {
            console.error('❌ Token verification failed:', error.message);
        }
        return null;
    }
}

module.exports = {
    getAllowedEmails,
    verifyGoogleToken
};