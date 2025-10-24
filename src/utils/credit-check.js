/**
 * Credit Balance Enforcement
 * 
 * ✅ CREDIT SYSTEM: Centralized credit checking before processing requests
 * 
 * This module provides a unified way to check if users have sufficient credit
 * before processing expensive operations (LLM calls, image generation, etc.)
 */

const { getCachedCreditBalance, deductFromCache } = require('./credit-cache');

/**
 * Check if user has sufficient credit for operation
 * 
 * @param {string} userEmail - User's email address
 * @param {number} estimatedCost - Estimated cost of operation (optional, default: $0.01)
 * @param {string} operationType - Type of operation (for logging)
 * @returns {Promise<{allowed: boolean, balance: number, error?: object}>}
 */
async function checkCreditBalance(userEmail, estimatedCost = 0.01, operationType = 'operation') {
    try {
        // Get current balance (from cache)
        const balance = await getCachedCreditBalance(userEmail);
        
        // Check if sufficient
        if (balance < estimatedCost) {
            console.log(`❌ Insufficient credit for ${operationType}: ${userEmail} has $${balance.toFixed(4)}, needs $${estimatedCost.toFixed(4)}`);
            
            return {
                allowed: false,
                balance,
                error: {
                    statusCode: 402,
                    error: 'Insufficient credit',
                    message: `Credit balance: $${balance.toFixed(2)}. Estimated cost: $${estimatedCost.toFixed(2)}. Please add credit to continue.`,
                    creditBalance: parseFloat(balance.toFixed(4)),
                    estimatedCost: parseFloat(estimatedCost.toFixed(4)),
                    shortfall: parseFloat((estimatedCost - balance).toFixed(4)),
                    addCreditUrl: 'https://ai.syntithenai.com/#billing'
                }
            };
        }
        
        console.log(`✅ Credit check passed for ${operationType}: ${userEmail} has $${balance.toFixed(4)}, needs $${estimatedCost.toFixed(4)}`);
        
        return {
            allowed: true,
            balance
        };
        
    } catch (error) {
        console.error('❌ Credit check failed:', error);
        
        // Fail-safe: allow the request if credit check fails
        // This prevents service disruption due to billing system errors
        console.warn('⚠️ FAIL-SAFE: Allowing request despite credit check error');
        
        return {
            allowed: true,
            balance: 0,
            warning: 'Credit check failed, request allowed as fail-safe'
        };
    }
}

/**
 * Deduct cost from user's cached balance (optimistic update)
 * Call this after successfully processing a request
 * 
 * @param {string} userEmail - User's email address
 * @param {number} actualCost - Actual cost incurred
 * @param {string} operationType - Type of operation (for logging)
 */
function deductCreditFromCache(userEmail, actualCost, operationType = 'operation') {
    try {
        deductFromCache(userEmail, actualCost);
        console.log(`💳 Deducted $${actualCost.toFixed(4)} from ${userEmail} cache (${operationType})`);
    } catch (error) {
        console.error('❌ Failed to deduct from cache:', error);
        // Non-critical error, don't throw
    }
}

/**
 * Estimate cost for chat request
 * 
 * @param {Array} messages - Chat messages
 * @param {string} model - Model name
 * @returns {number} Estimated cost
 */
function estimateChatCost(messages, model) {
    // Rough token estimation (4 chars per token)
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const estimatedTokens = Math.ceil(totalChars / 4);
    
    // Conservative estimate: assume equal input/output tokens
    const estimatedInputTokens = estimatedTokens;
    const estimatedOutputTokens = estimatedTokens;
    
    // LLM cost (pass-through pricing from PRICING table)
    // Using average prices for common models as fallback
    const modelPricing = {
        // Groq models (free tier has rate limits, but we still estimate cost)
        'llama-3.1-8b-instant': { input: 0.05, output: 0.08 }, // per 1M tokens
        'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
        'llama-3.1-405b-reasoning': { input: 2.78, output: 4.20 },
        // OpenAI models
        'gpt-4o': { input: 2.50, output: 10.00 },
        'gpt-4o-mini': { input: 0.15, output: 0.60 },
        'gpt-4-turbo': { input: 10.00, output: 30.00 },
        // Gemini models
        'gemini-1.5-flash': { input: 0.075, output: 0.30 },
        'gemini-1.5-pro': { input: 1.25, output: 5.00 }
    };
    
    const pricing = modelPricing[model] || { input: 1.00, output: 2.00 }; // Default conservative estimate
    const llmCost = (estimatedInputTokens / 1000000) * pricing.input + 
                    (estimatedOutputTokens / 1000000) * pricing.output;
    
    // Lambda cost (4x markup)
    const LAMBDA_PROFIT_MARGIN = parseFloat(process.env.LAMBDA_PROFIT_MARGIN) || 4;
    const memoryGB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '256') / 1024;
    const estimatedDuration = 3000; // 3 seconds conservative estimate
    const lambdaCost = (memoryGB * (estimatedDuration / 1000) * 0.0000166667) + 0.0000002;
    const lambdaCostWithMargin = lambdaCost * LAMBDA_PROFIT_MARGIN;
    
    return llmCost + lambdaCostWithMargin;
}

/**
 * Estimate cost for image generation
 * 
 * @param {string} model - Model name (e.g., 'dall-e-3')
 * @param {string} quality - Image quality ('standard' or 'hd')
 * @param {string} size - Image size (e.g., '1024x1024')
 * @returns {number} Estimated cost
 */
function estimateImageCost(model, quality = 'standard', size = '1024x1024') {
    // DALL-E pricing (pass-through)
    const pricing = {
        'dall-e-3': {
            'standard': {
                '1024x1024': 0.040,
                '1024x1792': 0.080,
                '1792x1024': 0.080
            },
            'hd': {
                '1024x1024': 0.080,
                '1024x1792': 0.120,
                '1792x1024': 0.120
            }
        },
        'dall-e-2': {
            '1024x1024': 0.020,
            '512x512': 0.018,
            '256x256': 0.016
        }
    };
    
    let llmCost = 0.040; // Default
    
    if (model === 'dall-e-3') {
        llmCost = pricing['dall-e-3'][quality]?.[size] || 0.040;
    } else if (model === 'dall-e-2') {
        llmCost = pricing['dall-e-2'][size] || 0.020;
    }
    
    // Lambda cost (4x markup)
    const LAMBDA_PROFIT_MARGIN = parseFloat(process.env.LAMBDA_PROFIT_MARGIN) || 4;
    const memoryGB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '256') / 1024;
    const estimatedDuration = 10000; // 10 seconds for image generation
    const lambdaCost = (memoryGB * (estimatedDuration / 1000) * 0.0000166667) + 0.0000002;
    const lambdaCostWithMargin = lambdaCost * LAMBDA_PROFIT_MARGIN;
    
    return llmCost + lambdaCostWithMargin;
}

/**
 * Estimate cost for TTS request
 * 
 * @param {string} text - Text to synthesize
 * @param {string} model - TTS model (e.g., 'tts-1', 'tts-1-hd')
 * @returns {number} Estimated cost
 */
function estimateTTSCost(text, model = 'tts-1') {
    // OpenAI TTS pricing: $15 per 1M characters (pass-through)
    const charCount = text.length;
    const llmCost = (charCount / 1000000) * 15.00;
    
    // Lambda cost (4x markup)
    const LAMBDA_PROFIT_MARGIN = parseFloat(process.env.LAMBDA_PROFIT_MARGIN) || 4;
    const memoryGB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '256') / 1024;
    const estimatedDuration = 5000; // 5 seconds
    const lambdaCost = (memoryGB * (estimatedDuration / 1000) * 0.0000166667) + 0.0000002;
    const lambdaCostWithMargin = lambdaCost * LAMBDA_PROFIT_MARGIN;
    
    return llmCost + lambdaCostWithMargin;
}

/**
 * Estimate cost for transcription
 * 
 * @param {number} durationMinutes - Audio duration in minutes
 * @returns {number} Estimated cost
 */
function estimateTranscriptionCost(durationMinutes) {
    // Whisper pricing: $0.006 per minute (pass-through)
    const llmCost = durationMinutes * 0.006;
    
    // Lambda cost (4x markup)
    const LAMBDA_PROFIT_MARGIN = parseFloat(process.env.LAMBDA_PROFIT_MARGIN) || 4;
    const memoryGB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '256') / 1024;
    const estimatedDuration = durationMinutes * 60 * 1000; // Duration in ms
    const lambdaCost = (memoryGB * (estimatedDuration / 1000) * 0.0000166667) + 0.0000002;
    const lambdaCostWithMargin = lambdaCost * LAMBDA_PROFIT_MARGIN;
    
    return llmCost + lambdaCostWithMargin;
}

/**
 * Estimate cost for embedding request
 * 
 * @param {number} tokenCount - Number of tokens to embed
 * @param {string} model - Embedding model (e.g., 'text-embedding-3-small')
 * @returns {number} Estimated cost
 */
function estimateEmbeddingCost(tokenCount, model = 'text-embedding-3-small') {
    // OpenAI embedding pricing (pass-through)
    const pricing = {
        'text-embedding-3-small': 0.020, // per 1M tokens
        'text-embedding-3-large': 0.130,
        'text-embedding-ada-002': 0.100
    };
    
    const pricePerMillion = pricing[model] || 0.020;
    const llmCost = (tokenCount / 1000000) * pricePerMillion;
    
    // Lambda cost (4x markup)
    const LAMBDA_PROFIT_MARGIN = parseFloat(process.env.LAMBDA_PROFIT_MARGIN) || 4;
    const memoryGB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '256') / 1024;
    const estimatedDuration = 2000; // 2 seconds
    const lambdaCost = (memoryGB * (estimatedDuration / 1000) * 0.0000166667) + 0.0000002;
    const lambdaCostWithMargin = lambdaCost * LAMBDA_PROFIT_MARGIN;
    
    return llmCost + lambdaCostWithMargin;
}

module.exports = {
    checkCreditBalance,
    deductCreditFromCache,
    estimateChatCost,
    estimateImageCost,
    estimateTTSCost,
    estimateTranscriptionCost,
    estimateEmbeddingCost
};
