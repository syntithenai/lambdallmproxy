/**
 * Billing Endpoint
 * Provides access to user's billing data from their personal billing sheet
 * Supports reading transactions and clearing data with various filters
 */

const { authenticateRequest } = require('../auth');
const { readBillingData, clearBillingData } = require('../services/user-billing-sheet');
const { getUserTotalCost, getUserBillingData } = require('../services/google-sheets-logger');

/**
 * Get CORS headers for billing endpoint
 * Includes X-Google-Access-Token for Google Sheets API access
 * Includes X-Billing-Sync for billing sync preference
 */
function getCorsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Google-Access-Token,X-Billing-Sync',
        'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS'
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

    try {
        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);

        if (!authResult.authenticated) {
            const metadata = {
                statusCode: 401,
                headers: getCorsHeaders()
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

        // Extract Google Drive access token from custom header (for Sheets API access)
        let accessToken = event.headers?.['X-Google-Access-Token'] || event.headers?.['x-google-access-token'];
        
        // Check if billing sync is enabled (cloud_sync_billing preference)
        const billingSyncEnabled = event.headers?.['X-Billing-Sync'] || event.headers?.['x-billing-sync'];
        
        console.log('🔐 Backend: Access token present:', !!accessToken);
        console.log('🔐 Backend: Token length:', accessToken?.length || 0);
        console.log('🔐 Backend: Billing sync enabled:', billingSyncEnabled);
        console.log('🔐 Backend: Headers received:', Object.keys(event.headers || {}).join(', '));
        
        // Determine data source: personal sheet (if enabled and token present) or service key sheet (fallback)
        const usePersonalSheet = billingSyncEnabled === 'true' && accessToken;
        
        if (usePersonalSheet) {
            console.log('📊 Using personal Google Sheet for billing data');
            
            try {
                // Read billing data from user's personal sheet
                const transactions = await readBillingData(accessToken, userEmail, filters);

                // Check if personal sheet is empty (newly enabled)
                if (transactions.length === 0) {
                    console.log('📋 Personal sheet is empty, user just enabled billing sync');
                    
                    // Get service data as reference
                    const serviceTransactions = await getUserBillingData(userEmail, filters);
                    const serviceTotals = calculateTotals(serviceTransactions);
                    
                    // Return service data with a message about personal sheet being new
                    const metadata = {
                        statusCode: 200,
                        headers: getCorsHeaders()
                    };
                    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                    responseStream.write(JSON.stringify({
                        success: true,
                        source: 'service',
                        personalSheetEmpty: true,
                        transactions: serviceTransactions,
                        totals: serviceTotals,
                        count: serviceTransactions.length,
                        message: 'Personal Billing Sheet is empty. New transactions will be logged to your sheet. Historical data shown from service logs.'
                    }));
                    responseStream.end();
                    return;
                }

                // Calculate aggregated totals
                const totals = calculateTotals(transactions);

                // Return success response
                const metadata = {
                    statusCode: 200,
                    headers: getCorsHeaders()
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({
                    success: true,
                    source: 'personal',
                    transactions,
                    totals,
                    count: transactions.length
                }));
                responseStream.end();
            } catch (personalSheetError) {
                console.error('❌ Error reading from personal sheet, falling back to service key:', personalSheetError.message);
                
                // Fallback to service key sheet if personal sheet fails
                const transactions = await getUserBillingData(userEmail, filters);
                const totals = calculateTotals(transactions);
                
                const metadata = {
                    statusCode: 200,
                    headers: getCorsHeaders()
                };
                responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
                responseStream.write(JSON.stringify({
                    success: true,
                    source: 'service',
                    fallback: true,
                    fallbackReason: 'Personal sheet access failed',
                    transactions,
                    totals,
                    count: transactions.length,
                    message: 'Displaying data from central service logs (personal sheet unavailable). All usage data is logged to the centralized service.'
                }));
                responseStream.end();
            }
        } else {
            console.log('📊 Using service key Google Sheet for billing data (billing sync disabled or no token)');
            
            // Use service key sheet - centralized logging
            const transactions = await getUserBillingData(userEmail, filters);
            const totals = calculateTotals(transactions);
            
            const metadata = {
                statusCode: 200,
                headers: getCorsHeaders()
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                success: true,
                source: 'service',
                transactions,
                totals,
                count: transactions.length,
                message: 'Displaying data from central service logs. All API usage is automatically logged here. Enable "Personal Billing Sheet" in Cloud Sync settings to also sync to your own Google Sheet for backup and export.'
            }));
            responseStream.end();
        }

    } catch (error) {
        console.error('❌ Error reading billing data:', error);

        const metadata = {
            statusCode: 500,
            headers: getCorsHeaders()
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
                headers: getCorsHeaders()
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
                headers: getCorsHeaders()
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
                    headers: getCorsHeaders()
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
                    headers: getCorsHeaders()
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
            headers: getCorsHeaders()
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
            headers: getCorsHeaders()
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
        headers: getCorsHeaders()
    };
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
    responseStream.write(JSON.stringify({
        error: 'Not found',
        code: 'NOT_FOUND'
    }));
    responseStream.end();
}

module.exports = { handler };
