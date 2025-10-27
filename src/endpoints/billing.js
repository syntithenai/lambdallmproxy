/**
 * Billing Endpoint
 * Provides access to user's billing data from centralized service account Google Sheet
 * Supports reading transactions and clearing data with various filters
 */

const { authenticateRequest } = require('../auth');
const { getUserTotalCost, getUserBillingData } = require('../services/google-sheets-logger');
const { getCachedCreditBalance } = require('../utils/credit-cache');
const { CREDIT_LIMIT } = require('./usage');

/**
 * Get response headers for billing endpoint
 * Note: CORS headers are handled by Lambda Function URL configuration
 */
function getResponseHeaders() {
    return {
        'Content-Type': 'application/json'
    };
}

/**
 * Calculate aggregated totals from transactions
 * @param {Array} transactions - Array of transaction objects
 * @returns {Object} Aggregated totals
 */
function calculateTotals(transactions) {
    const totals = {
        totalCost: 0,
        totalTokens: 0,
        totalRequests: transactions.length,
        byType: {},
        byProvider: {},
        byModel: {},
        lambdaInvocations: {
            totalCost: 0,
            totalRequests: 0,
            byEndpoint: {}
        },
        dateRange: {
            start: transactions.length > 0 ? transactions[0].timestamp : null,
            end: transactions.length > 0 ? transactions[transactions.length - 1].timestamp : null
        }
    };

    // Calculate totals
    for (const t of transactions) {
        totals.totalCost += t.cost || 0;
        totals.totalTokens += t.totalTokens || 0;

        // Track Lambda invocations separately
        if (t.type === 'lambda_invocation') {
            totals.lambdaInvocations.totalCost += t.cost || 0;
            totals.lambdaInvocations.totalRequests++;
            
            // Group by endpoint (stored in model field)
            const endpoint = t.model || 'unknown';
            if (!totals.lambdaInvocations.byEndpoint[endpoint]) {
                totals.lambdaInvocations.byEndpoint[endpoint] = {
                    cost: 0,
                    requests: 0,
                    avgDurationMs: 0,
                    totalDurationMs: 0
                };
            }
            totals.lambdaInvocations.byEndpoint[endpoint].cost += t.cost || 0;
            totals.lambdaInvocations.byEndpoint[endpoint].requests++;
            totals.lambdaInvocations.byEndpoint[endpoint].totalDurationMs += t.durationMs || 0;
            totals.lambdaInvocations.byEndpoint[endpoint].avgDurationMs = 
                totals.lambdaInvocations.byEndpoint[endpoint].totalDurationMs / 
                totals.lambdaInvocations.byEndpoint[endpoint].requests;
        }

        // Group by type
        if (!totals.byType[t.type]) {
            totals.byType[t.type] = { cost: 0, tokens: 0, requests: 0 };
        }
        totals.byType[t.type].cost += t.cost || 0;
        totals.byType[t.type].tokens += t.totalTokens || 0;
        totals.byType[t.type].requests++;

        // Group by provider
        if (!totals.byProvider[t.provider]) {
            totals.byProvider[t.provider] = { cost: 0, tokens: 0, requests: 0 };
        }
        totals.byProvider[t.provider].cost += t.cost || 0;
        totals.byProvider[t.provider].tokens += t.totalTokens || 0;
        totals.byProvider[t.provider].requests++;

        // Group by model
        const modelKey = `${t.provider}:${t.model}`;
        if (!totals.byModel[modelKey]) {
            totals.byModel[modelKey] = {
                cost: 0,
                tokens: 0,
                requests: 0,
                provider: t.provider,
                model: t.model
            };
        }
        totals.byModel[modelKey].cost += t.cost || 0;
        totals.byModel[modelKey].tokens += t.totalTokens || 0;
        totals.byModel[modelKey].requests++;
    }

    return totals;
}

/**
 * Handle GET /billing - Read user's billing data
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Response stream
 */
async function handleGetBilling(event, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    console.log('📊 [BILLING] handleGetBilling called');
    console.log('📊 [BILLING] Event headers:', JSON.stringify(event.headers || {}, null, 2));
    console.log('📊 [BILLING] Event path:', event.rawPath || event.path);

    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        console.log('🔐 [BILLING] Auth header present:', !!authHeader);
        console.log('🔐 [BILLING] Auth header length:', authHeader?.length || 0);
        
        const authResult = await authenticateRequest(authHeader);
        
        console.log('🔐 [BILLING] Auth result:', {
            authenticated: authResult.authenticated,
            authorized: authResult.authorized,
            email: authResult.email
        });

        if (!authResult.authenticated) {
            console.error('❌ [BILLING] Authentication failed');
            const metadata = {
                statusCode: 401,
                headers: getResponseHeaders()
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }

        const userEmail = authResult.email || 'unknown';

        // Parse query parameters for filtering
        const filters = {};
        const params = event.queryStringParameters || {};

        if (params.startDate) {
            filters.startDate = params.startDate;
        }
        if (params.endDate) {
            filters.endDate = params.endDate;
        }
        if (params.type) {
            filters.type = params.type;
        }
        if (params.provider) {
            filters.provider = params.provider;
        }

        console.log(`📊 Reading billing data for user: ${userEmail}`, filters);

        // Use centralized service account sheet for all billing data
        const transactions = await getUserBillingData(userEmail, filters);
        const totals = calculateTotals(transactions);
        
        // --- TTS Capabilities ---
        // This block determines which TTS providers are available server-side
        // and exposes their status to the frontend for UI display.
        // NOTE: OPENAI_KEY is for RAG embeddings only, NOT for TTS/chat
        const ttsCapabilities = {
            // openai: Disabled - OPENAI_KEY is reserved for RAG embeddings only
            groq: !!process.env.GROQ_KEY,
            gemini: !!process.env.GEMINI_KEY,
            together: !!process.env.TOGETHER_KEY,
            elevenlabs: !!process.env.ELEVENLABS_KEY,
            browser: true, // Always available client-side
            speakjs: true  // Always available client-side
        };
        
        const metadata = {
            statusCode: 200,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            success: true,
            source: 'service',
            transactions,
            totals,
            count: transactions.length,
            ttsCapabilities
        }));
        responseStream.end();

    } catch (error) {
        console.error('❌ [BILLING] Error reading billing data:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        const metadata = {
            statusCode: 500,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            error: 'Failed to read billing data',
            message: error.message,
            code: 'READ_ERROR',
            details: error.stack
        }));
        responseStream.end();
    }
}

/**
 * Handle DELETE /billing/clear - Clear billing data
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Response stream
 */
async function handleClearBilling(event, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);

        if (!authResult.authenticated) {
            const metadata = {
                statusCode: 401,
                headers: getResponseHeaders()
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }

        const userEmail = authResult.email || 'unknown';

        // Extract Google Drive access token from custom header (for Sheets API access)
        let accessToken = event.headers?.['X-Google-Access-Token'] || event.headers?.['x-google-access-token'];
        
        if (!accessToken) {
            const metadata = {
                statusCode: 401,
                headers: getResponseHeaders()
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Google Drive access token required. Please enable cloud sync in Swag page.',
                code: 'DRIVE_TOKEN_REQUIRED'
            }));
            responseStream.end();
            return;
        }

        // Parse query parameters for clear mode
        const params = event.queryStringParameters || {};
        const mode = params.mode || 'all'; // all, provider, dateRange

        const options = { mode };

        if (mode === 'provider') {
            if (!params.provider) {
                const metadata = {
                    statusCode: 400,
                    headers: getResponseHeaders()
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({
                    error: 'provider parameter required for mode=provider',
                    code: 'MISSING_PARAMETER'
                }));
                responseStream.end();
                return;
            }
            options.provider = params.provider;
        } else if (mode === 'dateRange') {
            if (!params.startDate && !params.endDate) {
                const metadata = {
                    statusCode: 400,
                    headers: getResponseHeaders()
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({
                    error: 'startDate or endDate required for mode=dateRange',
                    code: 'MISSING_PARAMETER'
                }));
                responseStream.end();
                return;
            }
            if (params.startDate) options.startDate = params.startDate;
            if (params.endDate) options.endDate = params.endDate;
        }

        console.log(`🗑️ Clearing billing data for user: ${userEmail}`, options);

        // Clear billing data from user's sheet
        const result = await clearBillingData(accessToken, userEmail, options);

        // Return success response
        const metadata = {
            statusCode: 200,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            success: true,
            deletedCount: result.deletedCount,
            remainingCount: result.remainingCount,
            mode: options.mode
        }));
        responseStream.end();

    } catch (error) {
        console.error('❌ Error clearing billing data:', error);

        const metadata = {
            statusCode: 500,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            error: 'Failed to clear billing data',
            message: error.message,
            code: 'CLEAR_ERROR'
        }));
        responseStream.end();
    }
}

/**
 * Handle GET /billing/transactions - Get user transaction history with credit balance
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Response stream
 */
async function handleGetTransactions(event, responseStream) {
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    console.log('📊 [BILLING] handleGetTransactions called');

    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);

        if (!authResult.authenticated) {
            const metadata = {
                statusCode: 401,
                headers: getResponseHeaders()
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }

        const userEmail = authResult.email || 'unknown';
        console.log(`📊 Getting transactions for user: ${userEmail}`);

        // Get transactions from service sheet
        const transactions = await getUserBillingData(userEmail);
        
        // Get current credit balance from cache
        const creditBalance = await getCachedCreditBalance(userEmail);

        console.log(`📊 Found ${transactions.length} transaction(s), balance: $${creditBalance.toFixed(4)}`);

        const metadata = {
            statusCode: 200,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            transactions: transactions.reverse(), // Most recent first
            creditBalance: creditBalance,
            count: transactions.length
        }));
        responseStream.end();

    } catch (error) {
        console.error('❌ [BILLING] Error getting transactions:', error);

        const metadata = {
            statusCode: 500,
            headers: getResponseHeaders()
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            error: 'Failed to retrieve transactions',
            message: error.message,
            code: 'READ_ERROR'
        }));
        responseStream.end();
    }
}

/**
 * Main billing endpoint handler
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Response stream
 * @param {Object} context - Lambda context
 */
async function handler(event, responseStream, context) {
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;

    console.log(`📊 Billing endpoint: ${method} ${path}`);

    // GET /billing/transactions - Get transaction history with credit balance
    if (path === '/billing/transactions' && method === 'GET') {
        return await handleGetTransactions(event, responseStream);
    }

    // GET /billing - Read billing data (includes TTS capabilities)
    if (path === '/billing' && method === 'GET') {
        return await handleGetBilling(event, responseStream);
    }

    // DELETE /billing/clear - Clear billing data
    if (path === '/billing/clear' && method === 'DELETE') {
        return await handleClearBilling(event, responseStream);
    }

    // Unknown route
    const awslambda = (typeof globalThis.awslambda !== 'undefined') 
        ? globalThis.awslambda 
        : require('aws-lambda');

    const metadata = {
        statusCode: 404,
        headers: getResponseHeaders()
    };
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
    responseStream.write(JSON.stringify({
        error: 'Not found',
        code: 'NOT_FOUND'
    }));
    responseStream.end();
}

module.exports = { handler };
