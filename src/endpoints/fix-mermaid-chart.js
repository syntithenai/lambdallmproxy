/**
 * Fix Mermaid Chart Endpoint
 * Accepts a Mermaid chart with syntax errors and uses LLM to fix it
 * Tracks token usage and cost for transparency
 */

const { authenticateRequest } = require('../auth');
const { llmResponsesWithTools } = require('../llm_tools_adapter');
const { buildProviderPool } = require('../credential-pool');
const { getOrEstimateUsage } = require('../utils/token-estimation');
const { logToGoogleSheets } = require('../services/google-sheets-logger');

/**
 * Fix Mermaid chart syntax errors using LLM
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} - Fixed chart and usage info
 */
async function handler(event) {
    try {
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { chart, error, providers: userProviders } = body;

        // Validate required fields
        if (!chart || typeof chart !== 'string') {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-YouTube-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'chart field is required and must be a string'
                })
            };
        }

        if (!error || typeof error !== 'string') {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-YouTube-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'error field is required and must be a string'
                })
            };
        }

        // Authenticate request
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const authResult = await authenticateRequest(authHeader);

        if (!authResult.authenticated) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-YouTube-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Authentication required'
                })
            };
        }

        // Build provider pool
        const providerPool = buildProviderPool(userProviders, authResult.authorized);
        
        if (providerPool.length === 0) {
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-YouTube-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'No LLM providers configured'
                })
            };
        }

        // Select fastest provider (prefer Groq for quick fixes)
        const groqProviders = providerPool.filter(p => p.type === 'groq');
        const selectedProvider = groqProviders[0] || providerPool[0];

        console.log(`🔧 Fixing Mermaid chart with ${selectedProvider.type} provider`);
        console.log(`📊 Chart length: ${chart.length} chars`);
        console.log(`❌ Error: ${error.substring(0, 200)}`);

        // Construct system prompt for chart fixing
        const systemPrompt = `You are an expert in Mermaid diagram syntax. Your job is to fix syntax errors in Mermaid charts.

Rules:
1. Return ONLY the corrected Mermaid chart code, nothing else
2. Do NOT wrap the output in markdown code blocks or any other formatting
3. Fix the syntax error described in the user's message
4. Preserve the original intent and structure as much as possible
5. Common Mermaid syntax issues:
   - Missing or incorrect quotes around labels with special characters
   - Invalid node IDs (use alphanumeric and underscores only)
   - Incorrect arrow syntax (use --> for flowcharts, ->> for sequence diagrams)
   - Missing semicolons or line breaks between statements
   - Invalid chart type declarations
   - Unescaped special characters in labels (wrap in quotes)

Return only valid Mermaid syntax that will render without errors.`;

        const userPrompt = `Fix this Mermaid chart that has a syntax error:

**Error Message:**
${error}

**Current Chart:**
${chart}

Return ONLY the corrected Mermaid chart code (no markdown, no explanations, just the raw chart code).`;

        // Make LLM call to fix chart
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        const startTime = Date.now();
        
        const result = await llmResponsesWithTools({
            messages,
            provider: selectedProvider,
            temperature: 0.1, // Low temperature for deterministic fixes
            max_tokens: 2000,
            tools: [],
            enabledTools: {},
            verifiedUser: authResult.user,
            userEmail: authResult.email
        });

        const duration = Date.now() - startTime;

        // Extract fixed chart from response
        const fixedChart = result.content.trim();

        // Get or estimate token usage
        const usage = getOrEstimateUsage(
            result.usage,
            messages,
            fixedChart,
            selectedProvider.type === 'groq' ? 'groq' : selectedProvider.type
        );

        console.log(`✅ Chart fixed in ${duration}ms`);
        console.log(`📊 Token usage: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`);
        console.log(`💰 Cost: $${usage.cost?.toFixed(6) || '0.000000'}`);

        // Create llmApiCall object for transparency
        const llmApiCall = {
            phase: 'mermaid_fix',
            provider: selectedProvider.type,
            model: result.model || 'unknown',
            type: 'mermaid_fix',
            timestamp: new Date().toISOString(),
            durationMs: duration,
            cost: usage.cost || 0,
            success: true,
            request: {
                chartLength: chart.length,
                errorMessage: error.substring(0, 200)
            },
            response: {
                usage: {
                    prompt_tokens: usage.prompt_tokens,
                    completion_tokens: usage.completion_tokens,
                    total_tokens: usage.total_tokens
                },
                fixedChartLength: fixedChart.length
            },
            metadata: {
                temperature: 0.1,
                max_tokens: 2000
            }
        };

        // Log to Google Sheets
        const logData = {
            timestamp: new Date().toISOString(),
            email: authResult.email || 'unknown',
            type: 'mermaid_fix',
            model: result.model || selectedProvider.type,
            provider: selectedProvider.type,
            tokensIn: usage.prompt_tokens,
            tokensOut: usage.completion_tokens,
            cost: usage.cost || 0,
            durationMs: duration,
            status: 'SUCCESS',
            metadata: {
                chartLength: chart.length,
                fixedChartLength: fixedChart.length,
                errorMessage: error.substring(0, 200)
            }
        };

        // Log asynchronously (don't block response)
        logToGoogleSheets(logData).catch(err => {
            console.error('Failed to log Mermaid fix to Google Sheets:', err);
        });

        // Return fixed chart and usage info
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-YouTube-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({
                fixedChart,
                usage: {
                    prompt_tokens: usage.prompt_tokens,
                    completion_tokens: usage.completion_tokens,
                    total_tokens: usage.total_tokens,
                    cost: usage.cost || 0,
                    provider: selectedProvider.type,
                    model: result.model || 'unknown',
                    duration_ms: duration
                },
                original_error: error,
                llmApiCall: llmApiCall
            })
        };

    } catch (error) {
        console.error('Error fixing Mermaid chart:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-YouTube-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({
                error: 'Failed to fix chart',
                message: error.message
            })
        };
    }
}

module.exports = {
    handler
};
