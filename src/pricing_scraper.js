/**
 * Model Pricing and Context Scraper
 * Scrapes pricing and context information from OpenAI and Groq pricing pages
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Cache file path in Lambda's writable /tmp directory
const CACHE_FILE_PATH = '/tmp/model_pricing_cache.json';
const CACHE_EXPIRY_HOURS = 24; // Refresh pricing data every 24 hours

// Fallback pricing data in case scraping fails
const FALLBACK_PRICING_DATA = {
    lastUpdated: new Date().toISOString(),
    models: {
        'gpt-4o': {
            provider: 'openai',
            inputPricePerMillion: 2.50,
            outputPricePerMillion: 10.00,
            maxTokens: 128000,
            name: 'GPT-4o'
        },
        'gpt-4o-mini': {
            provider: 'openai',
            inputPricePerMillion: 0.15,
            outputPricePerMillion: 0.60,
            maxTokens: 128000,
            name: 'GPT-4o Mini'
        },
        'gpt-4': {
            provider: 'openai',
            inputPricePerMillion: 30.00,
            outputPricePerMillion: 60.00,
            maxTokens: 8192,
            name: 'GPT-4'
        },
        'gpt-3.5-turbo': {
            provider: 'openai',
            inputPricePerMillion: 0.50,
            outputPricePerMillion: 1.50,
            maxTokens: 16385,
            name: 'GPT-3.5 Turbo'
        },
        'llama-3.1-8b-instant': {
            provider: 'groq',
            inputPricePerMillion: 0.05,
            outputPricePerMillion: 0.08,
            maxTokens: 131072,
            name: 'Llama 3.1 8B Instant'
        },
        'llama-3.3-70b-versatile': {
            provider: 'groq',
            inputPricePerMillion: 0.59,
            outputPricePerMillion: 0.79,
            maxTokens: 131072,
            name: 'Llama 3.3 70B Versatile'
        },
        'llama-3.1-405b-reasoning': {
            provider: 'groq',
            inputPricePerMillion: 0.00,
            outputPricePerMillion: 0.00,
            maxTokens: 131072,
            name: 'Llama 3.1 405B Reasoning'
        },
        'mixtral-8x7b-32768': {
            provider: 'groq',
            inputPricePerMillion: 0.24,
            outputPricePerMillion: 0.24,
            maxTokens: 32768,
            name: 'Mixtral 8x7B'
        }
    }
};

/**
 * Simple token counting utility
 * @param {string} text - Text to count tokens for
 * @returns {number} Estimated token count
 */
function countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    // Rough approximation: 4 characters per token for English text
    // This is a simplified approach, real tokenizers are more complex
    return Math.ceil(text.length / 4);
}

/**
 * Make HTTP request and return response data
 * @param {string} url - URL to fetch
 * @param {number} timeout - Request timeout in ms
 * @returns {Promise<string>} Response text
 */
function httpRequest(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LambdaPricingScraper/1.0)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

/**
 * Parse OpenAI pricing page for model information
 * @param {string} html - HTML content from OpenAI pricing page
 * @returns {Object} Parsed pricing data
 */
function parseOpenAIPricing(html) {
    const models = {};
    
    try {
        // Look for pricing patterns in the HTML
        // This is a simplified parser - real implementation would be more robust
        
        // GPT-4o patterns
        if (html.includes('gpt-4o') && html.includes('$2.50')) {
            models['gpt-4o'] = {
                provider: 'openai',
                inputPricePerMillion: 2.50,
                outputPricePerMillion: 10.00,
                maxTokens: 128000,
                name: 'GPT-4o'
            };
        }
        
        // GPT-4o Mini patterns
        if (html.includes('gpt-4o-mini') && html.includes('$0.15')) {
            models['gpt-4o-mini'] = {
                provider: 'openai',
                inputPricePerMillion: 0.15,
                outputPricePerMillion: 0.60,
                maxTokens: 128000,
                name: 'GPT-4o Mini'
            };
        }

        console.log('🏷️ Parsed OpenAI pricing data:', Object.keys(models).length, 'models');
        return models;
    } catch (error) {
        console.warn('⚠️ Error parsing OpenAI pricing:', error.message);
        return {};
    }
}

/**
 * Parse Groq pricing page for model information
 * @param {string} html - HTML content from Groq pricing page
 * @returns {Object} Parsed pricing data
 */
function parseGroqPricing(html) {
    const models = {};
    
    try {
        // Look for pricing patterns in the HTML
        // Groq often has different pricing structures
        
        // Llama models are often free or very low cost
        if (html.includes('llama') || html.includes('Llama')) {
            models['llama-3.1-8b-instant'] = {
                provider: 'groq',
                inputPricePerMillion: 0.05,
                outputPricePerMillion: 0.08,
                maxTokens: 131072,
                name: 'Llama 3.1 8B Instant'
            };
            
            models['llama-3.3-70b-versatile'] = {
                provider: 'groq',
                inputPricePerMillion: 0.59,
                outputPricePerMillion: 0.79,
                maxTokens: 131072,
                name: 'Llama 3.3 70B Versatile'
            };
        }

        console.log('🏷️ Parsed Groq pricing data:', Object.keys(models).length, 'models');
        return models;
    } catch (error) {
        console.warn('⚠️ Error parsing Groq pricing:', error.message);
        return {};
    }
}

/**
 * Scrape pricing data from provider websites
 * @returns {Promise<Object>} Combined pricing data
 */
async function scrapePricingData() {
    console.log('🔍 Scraping pricing data from provider websites...');
    
    const scrapedModels = {};
    
    try {
        // Scrape OpenAI pricing
        console.log('📄 Fetching OpenAI pricing page...');
        const openaiHtml = await httpRequest('https://openai.com/pricing');
        const openaiModels = parseOpenAIPricing(openaiHtml);
        Object.assign(scrapedModels, openaiModels);
    } catch (error) {
        console.warn('⚠️ Failed to scrape OpenAI pricing:', error.message);
    }
    
    try {
        // Scrape Groq pricing
        console.log('📄 Fetching Groq pricing page...');
        const groqHtml = await httpRequest('https://groq.com/pricing');
        const groqModels = parseGroqPricing(groqHtml);
        Object.assign(scrapedModels, groqModels);
    } catch (error) {
        console.warn('⚠️ Failed to scrape Groq pricing:', error.message);
    }

    // Merge with fallback data for any missing models
    const fallbackModels = FALLBACK_PRICING_DATA.models;
    for (const [modelId, modelData] of Object.entries(fallbackModels)) {
        if (!scrapedModels[modelId]) {
            console.log(`📋 Using fallback data for ${modelId}`);
            scrapedModels[modelId] = modelData;
        }
    }

    return {
        lastUpdated: new Date().toISOString(),
        models: scrapedModels,
        source: 'scraped_with_fallback'
    };
}

/**
 * Load cached pricing data if available and not expired
 * @returns {Object|null} Cached pricing data or null if expired/missing
 */
function loadCachedPricingData() {
    try {
        if (!fs.existsSync(CACHE_FILE_PATH)) {
            console.log('📁 No pricing cache file found');
            return null;
        }

        const cached = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
        const lastUpdated = new Date(cached.lastUpdated);
        const expiryTime = new Date(lastUpdated.getTime() + (CACHE_EXPIRY_HOURS * 60 * 60 * 1000));
        
        if (new Date() > expiryTime) {
            console.log('⏰ Pricing cache has expired');
            return null;
        }

        console.log(`💾 Loaded pricing data from cache (${Object.keys(cached.models).length} models)`);
        return cached;
    } catch (error) {
        console.warn('⚠️ Error loading cached pricing data:', error.message);
        return null;
    }
}

/**
 * Save pricing data to cache file
 * @param {Object} pricingData - Pricing data to cache
 */
function savePricingDataToCache(pricingData) {
    try {
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(pricingData, null, 2));
        console.log(`💾 Saved pricing data to cache (${Object.keys(pricingData.models).length} models)`);
    } catch (error) {
        console.warn('⚠️ Error saving pricing data to cache:', error.message);
    }
}

/**
 * Get current pricing data (cached or freshly scraped)
 * @returns {Promise<Object>} Pricing data
 */
async function getPricingData() {
    // Try to load from cache first
    let pricingData = loadCachedPricingData();
    
    if (!pricingData) {
        // Cache miss or expired - scrape fresh data
        console.log('🔄 Refreshing pricing data...');
        try {
            pricingData = await scrapePricingData();
            savePricingDataToCache(pricingData);
        } catch (error) {
            console.error('❌ Failed to scrape pricing data, using fallback:', error.message);
            pricingData = FALLBACK_PRICING_DATA;
        }
    }

    return pricingData;
}

/**
 * Calculate cost for a model request
 * @param {string} modelId - Model identifier
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {Object} pricingData - Pricing data object
 * @returns {Object} Cost calculation result
 */
function calculateCost(modelId, inputTokens, outputTokens, pricingData) {
    const model = pricingData.models[modelId];
    if (!model) {
        return {
            modelId,
            inputTokens,
            outputTokens,
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
            error: 'Model not found in pricing data'
        };
    }

    const inputCost = (inputTokens / 1000000) * model.inputPricePerMillion;
    const outputCost = (outputTokens / 1000000) * model.outputPricePerMillion;
    const totalCost = inputCost + outputCost;

    return {
        modelId,
        modelName: model.name,
        provider: model.provider,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost,
        outputCost,
        totalCost,
        inputPricePerMillion: model.inputPricePerMillion,
        outputPricePerMillion: model.outputPricePerMillion,
        maxTokens: model.maxTokens
    };
}

/**
 * Validate if a request fits within model's context limits
 * @param {string} modelId - Model identifier
 * @param {number} estimatedTokens - Estimated tokens for the request
 * @param {Object} pricingData - Pricing data object
 * @returns {Object} Validation result
 */
function validateContextSize(modelId, estimatedTokens, pricingData) {
    const model = pricingData.models[modelId];
    if (!model) {
        return {
            valid: false,
            error: 'Model not found in pricing data',
            maxTokens: 0,
            estimatedTokens
        };
    }

    const valid = estimatedTokens <= model.maxTokens;
    return {
        valid,
        maxTokens: model.maxTokens,
        estimatedTokens,
        remainingTokens: model.maxTokens - estimatedTokens,
        utilizationPercent: (estimatedTokens / model.maxTokens) * 100,
        modelName: model.name
    };
}

module.exports = {
    getPricingData,
    calculateCost,
    validateContextSize,
    countTokens,
    CACHE_FILE_PATH
};