/**
 * PayPal Integration Endpoints
 * Handles credit purchases via PayPal
 */

const { verifyGoogleToken } = require('../auth');
const paypal = require('@paypal/checkout-server-sdk');
const { logToGoogleSheets } = require('../services/google-sheets-logger');
const { invalidateCreditCache } = require('../utils/credit-cache');

/**
 * Get PayPal client configured for sandbox or live environment
 */
function getPayPalClient() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const mode = process.env.PAYPAL_MODE || 'sandbox';
    
    if (!clientId || !clientSecret) {
        throw new Error('PayPal credentials not configured');
    }
    
    const environment = mode === 'live'
        ? new paypal.core.LiveEnvironment(clientId, clientSecret)
        : new paypal.core.SandboxEnvironment(clientId, clientSecret);
    
    return new paypal.core.PayPalHttpClient(environment);
}

/**
 * Get CORS headers for response
 */
function getCorsHeaders(event) {
    const origin = event.headers?.origin || event.headers?.Origin || '*';
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

/**
 * Create PayPal order for credit purchase
 * POST /paypal/create-order
 * Body: { amount: 5.00 }
 */
async function handleCreateOrder(event) {
    try {
        console.log('💳 PayPal create order request');
        
        // Authenticate user
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: getCorsHeaders(event),
                body: JSON.stringify({ error: 'Missing or invalid authorization header' })
            };
        }
        
        const token = authHeader.substring(7);
        const decodedToken = await verifyGoogleToken(token);
        
        if (!decodedToken || !decodedToken.email) {
            return {
                statusCode: 401,
                headers: getCorsHeaders(event),
                body: JSON.stringify({ error: 'Invalid or expired token' })
            };
        }
        
        const email = decodedToken.email;
        console.log(`✅ Authenticated user: ${email}`);
        
        // Parse request body
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const { amount } = body;
        
        // Validate amount
        const minPurchase = parseFloat(process.env.MIN_CREDIT_PURCHASE || '5.00');
        const purchaseAmount = parseFloat(amount);
        
        if (isNaN(purchaseAmount) || purchaseAmount < minPurchase) {
            return {
                statusCode: 400,
                headers: getCorsHeaders(event),
                body: JSON.stringify({
                    error: `Minimum purchase is $${minPurchase.toFixed(2)}`
                })
            };
        }
        
        console.log(`💰 Creating PayPal order: $${purchaseAmount.toFixed(2)} for ${email}`);
        
        // Create PayPal order
        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: 'USD',
                    value: purchaseAmount.toFixed(2)
                },
                description: `AI Credits - ${email}`,
                custom_id: email  // Store email for capture
            }],
            application_context: {
                brand_name: 'Syntithenai AI',
                user_action: 'PAY_NOW',
                return_url: process.env.PAYPAL_SUCCESS_URL,
                cancel_url: process.env.PAYPAL_CANCEL_URL
            }
        });
        
        const paypalClient = getPayPalClient();
        const order = await paypalClient.execute(request);
        
        console.log(`✅ PayPal order created: ${order.result.id}`);
        
        // Find approve URL
        const approveUrl = order.result.links.find(l => l.rel === 'approve')?.href;
        
        return {
            statusCode: 200,
            headers: getCorsHeaders(event),
            body: JSON.stringify({
                orderId: order.result.id,
                approveUrl: approveUrl
            })
        };
        
    } catch (error) {
        console.error('❌ PayPal order creation failed:', error);
        return {
            statusCode: 500,
            headers: getCorsHeaders(event),
            body: JSON.stringify({
                error: 'Failed to create payment order',
                details: error.message
            })
        };
    }
}

/**
 * Capture PayPal payment and add credit to user's account
 * POST /paypal/capture-order
 * Body: { orderId: "PAYPAL_ORDER_ID" }
 */
async function handleCaptureOrder(event) {
    try {
        console.log('💳 PayPal capture order request');
        
        // Authenticate user
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: getCorsHeaders(event),
                body: JSON.stringify({ error: 'Missing or invalid authorization header' })
            };
        }
        
        const token = authHeader.substring(7);
        const decodedToken = await verifyGoogleToken(token);
        
        if (!decodedToken || !decodedToken.email) {
            return {
                statusCode: 401,
                headers: getCorsHeaders(event),
                body: JSON.stringify({ error: 'Invalid or expired token' })
            };
        }
        
        const email = decodedToken.email;
        console.log(`✅ Authenticated user: ${email}`);
        
        // Parse request body
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const { orderId } = body;
        
        if (!orderId) {
            return {
                statusCode: 400,
                headers: getCorsHeaders(event),
                body: JSON.stringify({ error: 'orderId is required' })
            };
        }
        
        console.log(`💰 Capturing PayPal order: ${orderId}`);
        
        // Capture PayPal order
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});
        
        const paypalClient = getPayPalClient();
        const capture = await paypalClient.execute(request);
        
        console.log(`📦 PayPal capture response status: ${capture.result.status}`);
        
        // Verify payment success
        if (capture.result.status !== 'COMPLETED') {
            return {
                statusCode: 400,
                headers: getCorsHeaders(event),
                body: JSON.stringify({
                    error: 'Payment not completed',
                    status: capture.result.status
                })
            };
        }
        
        // Extract payment details
        const amount = parseFloat(capture.result.purchase_units[0].amount.value);
        const paypalEmail = capture.result.payer?.email_address || 'unknown';
        const transactionId = capture.result.purchase_units[0].payments.captures[0].id;
        
        console.log(`✅ Payment completed: $${amount} from ${paypalEmail} (Transaction: ${transactionId})`);
        
        // Log credit addition to Google Sheets (negative cost = credit added)
        await logToGoogleSheets({
            userEmail: email,
            provider: 'paypal',
            model: 'credit_purchase',
            type: 'credit_added',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            cost: -amount,  // Negative = credit added
            durationMs: 0,
            timestamp: new Date().toISOString(),
            requestId: `paypal-${transactionId}`,
            memoryLimitMB: 0,
            memoryUsedMB: 0,
            hostname: 'paypal',
            metadata: {
                transactionId: transactionId,
                paypalEmail: paypalEmail,
                orderId: orderId
            }
        });
        
        console.log(`📊 Logged credit purchase to Google Sheets: ${email} +$${amount}`);
        
        // Invalidate credit cache to force fresh balance fetch
        invalidateCreditCache(email);
        console.log(`🔄 Invalidated credit cache for ${email}`);
        
        return {
            statusCode: 200,
            headers: getCorsHeaders(event),
            body: JSON.stringify({
                success: true,
                creditAdded: amount,
                transactionId: transactionId,
                message: `Successfully added $${amount.toFixed(2)} to your account`
            })
        };
        
    } catch (error) {
        console.error('❌ PayPal capture failed:', error);
        return {
            statusCode: 500,
            headers: getCorsHeaders(event),
            body: JSON.stringify({
                error: 'Failed to process payment',
                details: error.message
            })
        };
    }
}

module.exports = {
    handleCreateOrder,
    handleCaptureOrder
};
