/**
 * Authentication utilities for Google OAuth and email validation
 */

const { OAuth2Client } = require('google-auth-library');

// Google OAuth configuration: derive allowed emails from env on-demand, so warm containers pick up changes
function getAllowedEmails() {
    const raw = process.env.ALLOW_EM || '';
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
        const clientId = process.env.GGL_CID;
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
        
        // ✅ CREDIT SYSTEM: All authenticated Google users are allowed
        // Whitelist check removed - access control is now via credit balance
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

/**
 * Verify Google OAuth2 access token by calling Google's tokeninfo endpoint
 * This works for access tokens (ya29.*) unlike verifyIdToken which only works for JWTs
 * @param {string} accessToken - Google OAuth2 access token
 * @returns {Promise<Object|null>} - User information or null if invalid
 */
async function verifyGoogleOAuthToken(accessToken) {
    try {
        console.log(`🔒 Verifying Google OAuth2 access token (length: ${accessToken?.length})`);
        
        const https = require('https');
        
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'oauth2.googleapis.com',
                path: `/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
                method: 'GET'
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const tokenInfo = JSON.parse(data);
                        
                        // Check if token is valid
                        if (res.statusCode !== 200 || tokenInfo.error) {
                            console.error('❌ OAuth token validation failed:', tokenInfo.error || 'Invalid token');
                            resolve(null);
                            return;
                        }
                        
                        // Check expiration
                        if (tokenInfo.expires_in && tokenInfo.expires_in <= 0) {
                            console.error('❌ OAuth token expired');
                            resolve(null);
                            return;
                        }
                        
                        // ✅ CREDIT SYSTEM: All authenticated Google users are allowed
                        // Whitelist check removed - access control is now via credit balance
                        console.log(`✅ OAuth token verified for: ${tokenInfo.email}`);
                        
                        resolve({
                            email: tokenInfo.email,
                            name: tokenInfo.email, // OAuth tokeninfo doesn't include name
                            picture: null,
                            email_verified: tokenInfo.verified_email || true,
                            sub: tokenInfo.user_id || tokenInfo.sub
                        });
                    } catch (parseError) {
                        console.error('❌ Failed to parse tokeninfo response:', parseError.message);
                        resolve(null);
                    }
                });
            });
            
            req.on('error', (error) => {
                console.error('❌ OAuth token verification request failed:', error.message);
                resolve(null);
            });
            
            req.end();
        });
    } catch (error) {
        console.error('❌ OAuth token verification failed:', error.message);
        return null;
    }
}

/**
 * Authenticate and authorize a request
 * Returns authentication status, authorization status, and user info
 * @param {string} authHeader - Authorization header (Bearer token)
 * @returns {Promise<Object>} - {authenticated: boolean, authorized: boolean, email: string|null, user: Object|null}
 */
async function authenticateRequest(authHeader) {
    // No auth header means anonymous request
    if (!authHeader) {
        return {
            authenticated: false,
            authorized: false,
            email: null,
            user: null
        };
    }
    
    // Extract token from Bearer scheme and trim whitespace/newlines
    const token = (authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader).trim().replace(/[\r\n]/g, '');
    
    // Try to verify as JWT ID token first
    let user = await verifyGoogleToken(token);
    
    // If JWT verification failed, try OAuth2 access token verification
    if (!user && token.startsWith('ya29.')) {
        console.log('🔄 JWT verification failed, trying OAuth2 access token verification...');
        user = await verifyGoogleOAuthToken(token);
    }
    
    if (!user) {
        // Invalid token or expired
        return {
            authenticated: false,
            authorized: false,
            email: null,
            user: null
        };
    }
    
    // Token is valid and verified
    // ✅ CREDIT SYSTEM: All authenticated users are authorized
    // Authorization is now controlled by credit balance, not email whitelist
    const isAuthorized = true; // All authenticated users are authorized
    
    console.log(`🔐 Request authenticated: ${user.email}, authorized: ${isAuthorized}`);
    
    return {
        authenticated: true,
        authorized: isAuthorized,
        email: user.email,
        user: user
    };
}

module.exports = {
    getAllowedEmails,
    verifyGoogleToken,
    verifyGoogleOAuthToken,
    authenticateRequest
};