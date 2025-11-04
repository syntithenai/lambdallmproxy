/**
 * Pricing scraper and cache management for OpenAI and Groq API pricing
 * Scrapes pricing information from provider websites and caches it for cost calculations
 */

const fs = require('fs');
const path = require('path');
const { SimpleHTMLParser } = require('./html-parser');

// Cache configuration
const CACHE_DIR = '/tmp';
const OPENAI_CACHE_FILE = path.join(CACHE_DIR, 'openai_pricing.json');
const GROQ_CACHE_FILE = path.join(CACHE_DIR, 'groq_pricing.json');
const CACHE_EXPIRY_HOURS = 24; // Cache for 24 hours

// Provider URLs
const OPENAI_PRICING_URL = 'https://openai.com/pricing';
const GROQ_PRICING_URL = 'https://groq.com/pricing/';

/**
 * Fetch content from URL with timeout
 * @param {string} url - URL to fetch
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<string>} - Response content
 */
async function fetchUrl(url, timeout = 15000) {
    const https = require('https');
    const http = require('http');
    // In tests, avoid real network calls; return empty content
    if (process.env.DISABLE_NETWORK === '1') {
        return '';
    }

    return new Promise((resolve, reject) => {
        const client = url.startsWith('https:') ? https : http;
        const timeoutId = setTimeout(() => {
            reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);
        if (typeof timeoutId.unref === 'function') timeoutId.unref();
        
        const agent = url.startsWith('https:')
            ? new (require('https').Agent)({ keepAlive: false })
            : new (require('http').Agent)({ keepAlive: false });
        const req = client.get(url, { 
            agent,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (compatible; LambdaLLMProxy/1.0)' 
            } 
        }, (res) => {
            clearTimeout(timeoutId);
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.setTimeout?.(timeout, () => {
            clearTimeout(timeoutId);
            req.destroy(new Error(`Request timeout after ${timeout}ms`));
        });
        
        req.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}

/**
 * Check if cache file is valid and not expired
 * @param {string} filePath - Path to cache file
 * @returns {boolean} - True if cache is valid
 */
function isCacheValid(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
        return ageHours < CACHE_EXPIRY_HOURS;
    } catch (error) {
        return false;
    }
}

/**
 * Load pricing data from cache file
 * @param {string} filePath - Path to cache file
 * @returns {Object|null} - Cached pricing data or null
 */
function loadCache(filePath) {
    try {
        if (isCacheValid(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn(`Failed to load cache from ${filePath}:`, error.message);
    }
    return null;
}

/**
 * Save pricing data to cache file
 * @param {string} filePath - Path to cache file
 * @param {Object} data - Pricing data to cache
 */
function saveCache(filePath, data) {
    try {
        const cacheData = {
            timestamp: Date.now(),
            data: data
        };
        fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2));
        console.log(`Pricing data cached to ${filePath}`);
    } catch (error) {
        console.warn(`Failed to save cache to ${filePath}:`, error.message);
    }
}

/**
 * Parse OpenAI pricing from HTML content
 * @param {string} html - HTML content from OpenAI pricing page
 * @returns {Object} - Parsed pricing data
 */
function parseOpenAIPricing(html) {
    const parser = new SimpleHTMLParser(html);
    const text = parser.convertToText(html);
    
    // Extract pricing information using patterns
    const pricing = {
        models: {},
        lastUpdated: new Date().toISOString()
    };
    
    // Common OpenAI model patterns and pricing extraction
    const modelPatterns = [
        // GPT-4 models
        { pattern: /gpt-4o[^$]*\$([0-9.]+)[^$]*input[^$]*\$([0-9.]+)[^$]*output/i, model: 'gpt-4o' },
        { pattern: /gpt-4o-mini[^$]*\$([0-9.]+)[^$]*input[^$]*\$([0-9.]+)[^$]*output/i, model: 'gpt-4o-mini' },
        { pattern: /gpt-4-turbo[^$]*\$([0-9.]+)[^$]*input[^$]*\$([0-9.]+)[^$]*output/i, model: 'gpt-4-turbo' },
        { pattern: /gpt-4[^-][^$]*\$([0-9.]+)[^$]*input[^$]*\$([0-9.]+)[^$]*output/i, model: 'gpt-4' },
        // GPT-3.5 models
        { pattern: /gpt-3\.5-turbo[^$]*\$([0-9.]+)[^$]*input[^$]*\$([0-9.]+)[^$]*output/i, model: 'gpt-3.5-turbo' },
    ];
    
    for (const { pattern, model } of modelPatterns) {
        const match = text.match(pattern);
        if (match) {
            pricing.models[model] = {
                input: parseFloat(match[1]) / 1000000, // Convert to per-token cost
                output: parseFloat(match[2]) / 1000000
            };
        }
    }
    
    // Fallback default pricing if scraping fails
    if (Object.keys(pricing.models).length === 0) {
        console.warn('Failed to parse OpenAI pricing, using fallback values');
        pricing.models = {
            'gpt-4o': { input: 0.000005, output: 0.000015 },
            'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
            'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
            'gpt-4': { input: 0.00003, output: 0.00006 },
            'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 }
        };
    }
    
    return pricing;
}

/**
 * Parse Groq pricing from HTML content
 * @param {string} html - HTML content from Groq pricing page
 * @returns {Object} - Parsed pricing data
 */
function parseGroqPricing(html) {
    const parser = new SimpleHTMLParser(html);
    const text = parser.convertToText(html);
    
    // Extract pricing information using patterns
    const pricing = {
        models: {},
        lastUpdated: new Date().toISOString()
    };
    
    // Common Groq model patterns and pricing extraction
    const modelPatterns = [
        { pattern: /llama-3\.3-70b[^$]*\$([0-9.]+)[^$]*input[^$]*\$([0-9.]+)[^$]*output/i, model: 'llama-3.3-70b-versatile' },
        { pattern: /llama-3\.1-8b[^$]*\$([0-9.]+)[^$]*input[^$]*\$([0-9.]+)[^$]*output/i, model: 'llama-3.1-8b-instant' },
        { pattern: /mixtral-8x7b[^$]*\$([0-9.]+)[^$]*input[^$]*\$([0-9.]+)[^$]*output/i, model: 'mixtral-8x7b-32768' }
    ];
    
    for (const { pattern, model } of modelPatterns) {
        const match = text.match(pattern);
        if (match) {
            pricing.models[model] = {
                input: parseFloat(match[1]) / 1000000, // Convert to per-token cost
                output: parseFloat(match[2]) / 1000000
            };
        }
    }
    
    // Fallback default pricing if scraping fails
    if (Object.keys(pricing.models).length === 0) {
        console.warn('Failed to parse Groq pricing, using fallback values');
        pricing.models = {
            'llama-3.3-70b-versatile': { input: 0.00000059, output: 0.00000079 },
            'llama-3.1-8b-instant': { input: 0.00000005, output: 0.00000008 },
            'mixtral-8x7b-32768': { input: 0.00000024, output: 0.00000024 }
        };
    }
    
    return pricing;
}

/**
 * Scrape OpenAI pricing
 * @returns {Promise<Object>} - OpenAI pricing data
 */
async function scrapeOpenAIPricing() {
    try {
        console.log('Scraping OpenAI pricing...');
        const html = await fetchUrl(OPENAI_PRICING_URL);
        const pricing = parseOpenAIPricing(html);
        saveCache(OPENAI_CACHE_FILE, pricing);
        return pricing;
    } catch (error) {
        console.error('Failed to scrape OpenAI pricing:', error.message);
        // Try to load from cache as fallback
        const cached = loadCache(OPENAI_CACHE_FILE);
        if (cached) {
            console.log('Using cached OpenAI pricing');
            return cached.data;
        }
        // Return default pricing as last resort
        return parseOpenAIPricing(''); // Will use fallback values
    }
}

/**
 * Scrape Groq pricing
 * @returns {Promise<Object>} - Groq pricing data
 */
async function scrapeGroqPricing() {
    try {
        console.log('Scraping Groq pricing...');
        const html = await fetchUrl(GROQ_PRICING_URL);
        const pricing = parseGroqPricing(html);
        saveCache(GROQ_CACHE_FILE, pricing);
        return pricing;
    } catch (error) {
        console.error('Failed to scrape Groq pricing:', error.message);
        // Try to load from cache as fallback
        const cached = loadCache(GROQ_CACHE_FILE);
        if (cached) {
            console.log('Using cached Groq pricing');
            return cached.data;
        }
        // Return default pricing as last resort
        return parseGroqPricing(''); // Will use fallback values
    }
}

/**
 * Load all pricing data (from cache or by scraping)
 * @returns {Promise<Object>} - Combined pricing data for all providers
 */
async function loadAllPricing() {
    const [openaiPricing, groqPricing] = await Promise.all([
        // Try cache first, scrape if needed
        loadCache(OPENAI_CACHE_FILE)?.data || scrapeOpenAIPricing(),
        loadCache(GROQ_CACHE_FILE)?.data || scrapeGroqPricing()
    ]);
    
    return {
        openai: openaiPricing,
        groq: groqPricing,
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Calculate LLM cost based on token usage and pricing data
 * @param {string} provider - Provider name (openai, groq)
 * @param {string} model - Model name
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {Object} pricingData - Pricing data object
 * @returns {Object} - Cost calculation details
 */
function calculateLLMCost(provider, model, inputTokens, outputTokens, pricingData) {
    try {
        const providerPricing = pricingData[provider.toLowerCase()];
        if (!providerPricing || !providerPricing.models) {
            return { error: `No pricing data for provider: ${provider}` };
        }
        
        const modelPricing = providerPricing.models[model];
        if (!modelPricing) {
            return { error: `No pricing data for model: ${model}` };
        }
        
        const inputCost = inputTokens * modelPricing.input;
        const outputCost = outputTokens * modelPricing.output;
        const totalCost = inputCost + outputCost;
        
        return {
            provider,
            model,
            inputTokens,
            outputTokens,
            inputCost,
            outputCost,
            totalCost,
            costPerInputToken: modelPricing.input,
            costPerOutputToken: modelPricing.output
        };
    } catch (error) {
        return { error: `Cost calculation failed: ${error.message}` };
    }
}

module.exports = {
    loadAllPricing,
    calculateLLMCost,
    scrapeOpenAIPricing,
    scrapeGroqPricing,
    loadCache,
    saveCache,
    isCacheValid
};