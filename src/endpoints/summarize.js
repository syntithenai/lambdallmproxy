/**
 * Summarize Text Endpoint
 * Accepts long text and returns a concise summary suitable for voice output
 * Uses provider pool with rate limiting and failover
 * Optimized for small, fast models
 */

const { authenticateRequest } = require('../auth');
const { llmResponsesWithTools } = require('../llm_tools_adapter');
const { buildProviderPool } = require('../credential-pool');
const { getOrEstimateUsage } = require('../utils/token-estimation');
const { logToGoogleSheets } = require('../services/google-sheets-logger');
const { buildModelRotationSequence, estimateTokenRequirements } = require('../model-selector-v2');

/**
 * Summarize text for voice output
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} - Summary and usage info
 */
async function handler(event) {
    try {
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { text, maxWords = 100, purpose = 'voice', providers: userProviders } = body;

        // Validate required fields
        if (!text || typeof text !== 'string') {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-YouTube-Token',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'text field is required and must be a string'
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

        console.log(`📝 Summarizing text for ${purpose} (${text.length} chars, max ${maxWords} words)`);

        // Construct system prompt for summarization
        const systemPrompt = `You are an expert summarizer. Your job is to create concise, speakable summaries for voice output.

Rules:
1. Create a summary under ${maxWords} words
2. Focus on the main points and key takeaways
3. Use natural, conversational language suitable for speaking aloud
4. Remove technical jargon when possible, or explain it simply
5. Do NOT include phrases like "Here's a summary" or "In summary"
6. Return ONLY the summary text, nothing else`;

        const userPrompt = `Summarize this text in under ${maxWords} words:\n\n${text}`;

        // Make LLM call to summarize
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        const startTime = Date.now();
        
        // Build model sequence for summarization - convert providerPool to uiProviders format
        const uiProviders = providerPool.map(p => ({
            type: p.type,
            apiKey: p.apiKey,
            enabled: true
        })).filter(p => p.type && p.apiKey);
        
        const estimatedTokens = estimateTokenRequirements(messages, false);
        
        // Use cheap optimization for summarization - small models work fine
        const modelSequence = buildModelRotationSequence(uiProviders, {
            needsTools: false,
            needsVision: false,
            estimatedTokens,
            optimization: 'cheap' // Prefer fast, cheap models for summaries
        });

        if (!modelSequence || modelSequence.length === 0) {
            throw new Error('No suitable models available for summarization');
        }

        console.log(`🎯 Using model sequence: ${modelSequence.map(m => m.model).join(' → ')}`);

        // Call LLM with provider rotation and rate limiting
        const result = await llmResponsesWithTools(
            messages,
            {
                temperature: 0.3, // Lower temperature for consistent summaries
                max_tokens: maxWords * 2, // Rough estimate: ~2 tokens per word
                modelSequence,
                stream: false // Don't need streaming for summaries
            },
            null, // No tools needed
            null, // No state
            null  // No memory tracker
        );

        const duration = Date.now() - startTime;

        // Extract summary from response
        let summary = '';
        if (result.choices && result.choices.length > 0) {
            summary = result.choices[0].message?.content || '';
        }

        // Calculate token usage
        const usage = getOrEstimateUsage(result, messages, summary);

        console.log(`✅ Summary generated in ${duration}ms (${usage.totalTokens} tokens)`);
        console.log(`📊 Summary: "${summary.substring(0, 100)}..."`);

        // Log to Google Sheets for analytics
        try {
            await logToGoogleSheets({
                timestamp: new Date().toISOString(),
                endpoint: '/summarize',
                user: authResult.email || 'unknown',
                provider: result.provider || 'unknown',
                model: result.model || 'unknown',
                inputTokens: usage.promptTokens,
                outputTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
                cost: usage.estimatedCost || 0,
                duration,
                purpose,
                textLength: text.length,
                summaryLength: summary.length
            });
        } catch (logError) {
            console.warn('⚠️ Failed to log to Google Sheets:', logError.message);
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-YouTube-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({
                summary,
                usage: {
                    promptTokens: usage.promptTokens,
                    completionTokens: usage.completionTokens,
                    totalTokens: usage.totalTokens,
                    estimatedCost: usage.estimatedCost
                },
                provider: result.provider,
                model: result.model,
                duration
            })
        };

    } catch (error) {
        console.error('❌ Error in summarize endpoint:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-YouTube-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({
                error: 'Failed to summarize text',
                details: error.message
            })
        };
    }
}

module.exports = handler;
