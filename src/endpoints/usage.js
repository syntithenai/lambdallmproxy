/**
 * Usage Tracking Endpoint
 * 
 * Provides per-user cost tracking by reading from Google Sheets logging
 * Returns total cost and credit limit for authenticated users
 */

const { verifyGoogleToken } = require('../auth');
const { getUserTotalCost } = require('../services/google-sheets-logger');

const CREDIT_LIMIT = 3.00; // $3 credit limit per user

/**
 * GET /usage - Get user's total LLM usage cost
 * 
 * Reads from Google Sheets log and aggregates cost by user email
 * Returns { totalCost, creditLimit, remaining, exceeded }
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
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
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
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Invalid or expired token'
                })
            };
        }

        console.log(`📊 Fetching usage for: ${userEmail}`);

        // Get total cost from Google Sheets
        const totalCost = await getUserTotalCost(userEmail);
        
        // Calculate remaining credit
        const remaining = Math.max(0, CREDIT_LIMIT - totalCost);
        const exceeded = totalCost >= CREDIT_LIMIT;

        const response = {
            userEmail,
            totalCost: parseFloat(totalCost.toFixed(4)),
            creditLimit: CREDIT_LIMIT,
            remaining: parseFloat(remaining.toFixed(4)),
            exceeded,
            timestamp: new Date().toISOString()
        };

        console.log(`💰 Usage for ${userEmail}: $${totalCost.toFixed(4)} / $${CREDIT_LIMIT} (${exceeded ? 'EXCEEDED' : 'OK'})`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            },
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('❌ Usage endpoint error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            })
        };
    }
}

module.exports = { handleUsageRequest, CREDIT_LIMIT };
