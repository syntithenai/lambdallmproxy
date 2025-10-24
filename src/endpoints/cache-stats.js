/**
 * Cache Statistics Endpoint
 * 
 * ✅ CREDIT SYSTEM: Monitor credit balance cache performance
 * 
 * GET /cache-stats - Get credit cache statistics
 */

const { verifyGoogleToken } = require('../auth');
const { getCreditCacheStats } = require('../utils/credit-cache');

/**
 * GET /cache-stats - Get credit balance cache statistics
 * 
 * Returns cache size, hit rates, and entry details
 * Requires: Authorization: Bearer <google_token>
 */
async function handleCacheStats(event) {
    try {
        // Extract and verify Google OAuth token
        const authHeader = event.headers?.authorization || event.headers?.Authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Missing or invalid authorization header'
                })
            };
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        // Verify Google token
        try {
            const payload = await verifyGoogleToken(token);
            const userEmail = payload.email;
            
            if (!userEmail) {
                throw new Error('Email not found in token');
            }
            
            console.log(`📊 Cache stats requested by: ${userEmail}`);
        } catch (err) {
            console.error('Token verification failed:', err.message);
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Invalid or expired token'
                })
            };
        }

        // Get cache statistics
        const stats = getCreditCacheStats();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            },
            body: JSON.stringify({
                ...stats,
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('❌ Cache stats endpoint error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            })
        };
    }
}

module.exports = { handleCacheStats };
