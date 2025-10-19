/**
 * Billing Endpoint
 * Provides access to user's billing data from their personal billing sheet
 * Supports reading transactions and clearing data with various filters
 */

const { authenticateRequest } = require('../auth');
const { readBillingData, clearBillingData } = require('../services/user-billing-sheet');

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
        dateRange: {
            start: transactions.length > 0 ? transactions[0].timestamp : null,
            end: transactions.length > 0 ? transactions[transactions.length - 1].timestamp : null
        }
    };

    // Calculate totals
    for (const t of transactions) {
        totals.totalCost += t.cost || 0;
        totals.totalTokens += t.totalTokens || 0;

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

    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);

        if (!authResult.authenticated) {
            const metadata = {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }

        // Extract OAuth token
        let accessToken = null;
        if (authHeader.startsWith('Bearer ')) {
            accessToken = authHeader.substring(7);
        }

        if (!accessToken) {
            const metadata = {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'OAuth token required',
                code: 'TOKEN_REQUIRED'
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

        // Read billing data from user's sheet
        const transactions = await readBillingData(accessToken, userEmail, filters);

        // Calculate aggregated totals
        const totals = calculateTotals(transactions);

        // Return success response
        const metadata = {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            success: true,
            transactions,
            totals,
            count: transactions.length
        }));
        responseStream.end();

    } catch (error) {
        console.error('❌ Error reading billing data:', error);

        const metadata = {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(JSON.stringify({
            error: 'Failed to read billing data',
            message: error.message,
            code: 'READ_ERROR'
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
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            }));
            responseStream.end();
            return;
        }

        // Extract OAuth token
        let accessToken = null;
        if (authHeader.startsWith('Bearer ')) {
            accessToken = authHeader.substring(7);
        }

        if (!accessToken) {
            const metadata = {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'OAuth token required',
                code: 'TOKEN_REQUIRED'
            }));
            responseStream.end();
            return;
        }

        const userEmail = authResult.email || 'unknown';

        // Parse query parameters for clear mode
        const params = event.queryStringParameters || {};
        const mode = params.mode || 'all'; // all, provider, dateRange

        const options = { mode };

        if (mode === 'provider') {
            if (!params.provider) {
                const metadata = {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json' }
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
                    headers: { 'Content-Type': 'application/json' }
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
            headers: { 'Content-Type': 'application/json' }
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
            headers: { 'Content-Type': 'application/json' }
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
 * Main billing endpoint handler
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Response stream
 * @param {Object} context - Lambda context
 */
async function handler(event, responseStream, context) {
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;

    console.log(`📊 Billing endpoint: ${method} ${path}`);

    // GET /billing - Read billing data
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
        headers: { 'Content-Type': 'application/json' }
    };
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
    responseStream.write(JSON.stringify({
        error: 'Not found',
        code: 'NOT_FOUND'
    }));
    responseStream.end();
}

module.exports = { handler };
