/**
 * Usage Tracking Endpoint
 * 
 * Provides per-user cost tracking by reading from Google Sheets logging
 * Returns current credit balance (credits - spending) for authenticated users
 * 
 * ✅ CREDIT SYSTEM: Replaced hard $3 limit with dynamic credit balance
 */

const { verifyGoogleToken } = require('../auth');
const { getUserTotalCost } = require('../services/google-sheets-logger');
const { getCachedCreditBalance } = require('../utils/credit-cache');

const CREDIT_LIMIT = 3.00; // $3 credit limit per user (DEPRECATED - kept for backward compatibility)

/**
 * GET /usage - Get user's credit balance and spending
 * 
 * ✅ CREDIT SYSTEM: Returns credit balance instead of hard limit
 * Reads from Google Sheets log and calculates:
 * - totalSpent: Sum of all usage costs
 * - creditBalance: Sum of credits added - total spent
 * - exceeded: true if balance <= 0
 * 
 * Requires: Authorization: Bearer <google_token>
 */
async function handleUsageRequest(event) {
    try {
        // Extract and verify Google OAuth token
        const authHeader = event.headers?.authorization || event.headers?.Authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                    // Note: CORS headers handled by AWS Lambda Function URL configuration
                },
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Missing or invalid authorization header'
                })
            };
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        // Verify Google token
        let userEmail;
        try {
            const payload = await verifyGoogleToken(token);
            userEmail = payload.email;
            
            if (!userEmail) {
                throw new Error('Email not found in token');
            }
        } catch (err) {
            console.error('Token verification failed:', err.message);
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                    // Note: CORS headers handled by AWS Lambda Function URL configuration
                },
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Invalid or expired token'
                })
            };
        }

        console.log(`📊 Fetching usage for: ${userEmail}`);

        // Get total spending and credit balance (cached for performance)
        const totalSpent = await getUserTotalCost(userEmail);
        const creditBalance = await getCachedCreditBalance(userEmail);
        
        // User has exceeded limit if balance is zero or negative
        const exceeded = creditBalance <= 0;


        // --- TTS Capabilities ---
        // This block determines which TTS providers are available server-side
        // and exposes their status to the frontend for UI display.
        // This is a minimal, static implementation. For dynamic config, read from env or provider catalog.
        const ttsCapabilities = {
            openai: !!process.env.OPENAI_KEY,
            groq: !!process.env.GROQ_KEY,
            gemini: !!process.env.GEMINI_KEY,
            together: !!process.env.TOGETHER_KEY,
            elevenlabs: !!process.env.ELEVENLABS_KEY,
            browser: true, // Always available client-side
            speakjs: true  // Always available client-side
        };

        const response = {
            userEmail,
            totalSpent: parseFloat(totalSpent.toFixed(4)),
            creditBalance: parseFloat(creditBalance.toFixed(4)),
            creditLimit: CREDIT_LIMIT, // Deprecated, kept for backward compatibility
            remaining: parseFloat(creditBalance.toFixed(4)), // Alias for creditBalance
            exceeded,
            timestamp: new Date().toISOString(),
            ttsCapabilities
        };

        console.log(`💰 Usage for ${userEmail}: $${totalSpent.toFixed(4)} spent, $${creditBalance.toFixed(4)} remaining (${exceeded ? 'EXCEEDED' : 'OK'})`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
                // Note: CORS headers handled by AWS Lambda Function URL configuration
            },
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('❌ Usage endpoint error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
                // Note: CORS headers handled by AWS Lambda Function URL configuration
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            })
        };
    }
}

module.exports = { handleUsageRequest, CREDIT_LIMIT };
