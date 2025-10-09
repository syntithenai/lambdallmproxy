#!/usr/bin/env node
/**
 * Provider Data Collection Script
 * 
 * Fetches live model information from various LLM provider APIs
 * and generates a comprehensive PROVIDER_CATALOG.json
 * 
 * Usage: node scripts/collect-provider-data.js
 * 
 * Environment variables required:
 * - GROQ_API_KEY (optional)
 * - OPENAI_API_KEY (optional)
 * - GEMINI_API_KEY (optional)
 * - COHERE_API_KEY (optional)
 * - MISTRAL_API_KEY (optional)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Make HTTPS request and return parsed JSON
 */
function httpsRequest(hostname, path, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            path,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

/**
 * Fetch Groq models
 */
async function fetchGroqModels() {
    console.log('📡 Fetching Groq models...');
    
    if (!process.env.GROQ_API_KEY) {
        console.log('⚠️  GROQ_API_KEY not set, using static data');
        return getStaticGroqData();
    }

    try {
        const response = await httpsRequest(
            'api.groq.com',
            '/openai/v1/models',
            { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
        );

        if (response.data && Array.isArray(response.data)) {
            console.log(`✅ Fetched ${response.data.length} Groq models`);
            return enrichGroqModels(response.data);
        }
    } catch (error) {
        console.error('❌ Failed to fetch Groq models:', error.message);
    }

    return getStaticGroqData();
}

/**
 * Enrich Groq model data with pricing and categorization
 */
function enrichGroqModels(models) {
    const enrichedModels = {};

    // Pricing data from https://groq.com/pricing/ (as of Oct 2025)
    const pricingMap = {
        'llama-3.1-8b-instant': { input: 0.05, output: 0.08, category: 'small' },
        'llama-3.3-70b-versatile': { input: 0.59, output: 0.79, category: 'large' },
        'llama-3.3-70b-specdec': { input: 0.59, output: 0.99, category: 'large' },
        'mixtral-8x7b-32768': { input: 0.24, output: 0.24, category: 'large' },
        'gemma2-9b-it': { input: 0.20, output: 0.20, category: 'small' },
        'gemma-7b-it': { input: 0.07, output: 0.07, category: 'small' },
        'llama-3.1-70b-versatile': { input: 0.59, output: 0.79, category: 'large' },
        'llama-3.2-1b-preview': { input: 0.04, output: 0.04, category: 'small' },
        'llama-3.2-3b-preview': { input: 0.06, output: 0.06, category: 'small' },
        'llama-3.2-11b-vision-preview': { input: 0.18, output: 0.18, category: 'large' },
        'llama-3.2-90b-vision-preview': { input: 0.90, output: 1.20, category: 'large' },
        'llama-guard-3-8b': { input: 0.20, output: 0.20, category: 'small' },
        'llava-v1.5-7b-4096-preview': { input: 0.20, output: 0.20, category: 'small' },
    };

    // Additional models from Groq with prefixes
    const prefixedModels = {
        'openai/gpt-oss-20b': { input: 0.10, output: 0.10, category: 'large' },
        'openai/gpt-oss-120b': { input: 0.50, output: 0.50, category: 'reasoning' },
        'qwen/qwen3-32b': { input: 0.30, output: 0.30, category: 'large' },
        'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.10, output: 0.15, category: 'large' },
        'meta-llama/llama-4-maverick-17b-128e-instruct': { input: 0.10, output: 0.15, category: 'large' },
        'moonshotai/kimi-k2-instruct-0905': { input: 0.40, output: 0.40, category: 'large' },
    };

    const allPricing = { ...pricingMap, ...prefixedModels };

    models.forEach(model => {
        const pricing = allPricing[model.id] || { input: 0.10, output: 0.10, category: 'large' };
        
        enrichedModels[model.id] = {
            id: model.id,
            category: pricing.category,
            contextWindow: model.context_window || 131072,
            maxOutput: 8192,
            pricing: {
                input: pricing.input,
                output: pricing.output,
                unit: 'per_million_tokens'
            },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: model.active !== false
        };
    });

    return enrichedModels;
}

/**
 * Static Groq data as fallback
 */
function getStaticGroqData() {
    return {
        'llama-3.1-8b-instant': {
            id: 'llama-3.1-8b-instant',
            category: 'small',
            contextWindow: 131072,
            maxOutput: 8192,
            pricing: { input: 0.05, output: 0.08, unit: 'per_million_tokens' },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: true
        },
        'meta-llama/llama-4-scout-17b-16e-instruct': {
            id: 'meta-llama/llama-4-scout-17b-16e-instruct',
            category: 'large',
            contextWindow: 131072,
            maxOutput: 32768,
            pricing: { input: 0.10, output: 0.15, unit: 'per_million_tokens' },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: true
        },
        'llama-3.3-70b-versatile': {
            id: 'llama-3.3-70b-versatile',
            category: 'large',
            contextWindow: 131072,
            maxOutput: 32768,
            pricing: { input: 0.59, output: 0.79, unit: 'per_million_tokens' },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: true
        },
        'mixtral-8x7b-32768': {
            id: 'mixtral-8x7b-32768',
            category: 'large',
            contextWindow: 32768,
            maxOutput: 32768,
            pricing: { input: 0.24, output: 0.24, unit: 'per_million_tokens' },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: true
        },
        'openai/gpt-oss-120b': {
            id: 'openai/gpt-oss-120b',
            category: 'reasoning',
            contextWindow: 131072,
            maxOutput: 65536,
            pricing: { input: 0.50, output: 0.50, unit: 'per_million_tokens' },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: true
        }
    };
}

/**
 * Fetch OpenAI models
 */
async function fetchOpenAIModels() {
    console.log('📡 Fetching OpenAI models...');
    
    if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️  OPENAI_API_KEY not set, using static data');
        return getStaticOpenAIData();
    }

    try {
        const response = await httpsRequest(
            'api.openai.com',
            '/v1/models',
            { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
        );

        if (response.data && Array.isArray(response.data)) {
            console.log(`✅ Fetched ${response.data.length} OpenAI models`);
            return enrichOpenAIModels(response.data);
        }
    } catch (error) {
        console.error('❌ Failed to fetch OpenAI models:', error.message);
    }

    return getStaticOpenAIData();
}

/**
 * Enrich OpenAI model data
 */
function enrichOpenAIModels(models) {
    const enrichedModels = {};

    // Pricing from https://openai.com/api/pricing/ (as of Oct 2025)
    const pricingMap = {
        'gpt-4o': { input: 2.50, output: 10.00, category: 'large', context: 128000 },
        'gpt-4o-mini': { input: 0.15, output: 0.60, category: 'small', context: 128000 },
        'gpt-4-turbo': { input: 10.00, output: 30.00, category: 'large', context: 128000 },
        'gpt-4': { input: 30.00, output: 60.00, category: 'large', context: 8192 },
        'gpt-3.5-turbo': { input: 0.50, output: 1.50, category: 'small', context: 16385 },
        'o1-preview': { input: 15.00, output: 60.00, category: 'reasoning', context: 128000 },
        'o1-mini': { input: 3.00, output: 12.00, category: 'reasoning', context: 128000 },
    };

    const relevantModels = models.filter(m => 
        m.id.startsWith('gpt-') || m.id.startsWith('o1-')
    );

    relevantModels.forEach(model => {
        const pricing = pricingMap[model.id];
        if (pricing) {
            enrichedModels[model.id] = {
                id: model.id,
                category: pricing.category,
                contextWindow: pricing.context,
                maxOutput: 16384,
                pricing: {
                    input: pricing.input,
                    output: pricing.output,
                    unit: 'per_million_tokens'
                },
                capabilities: ['chat', 'tools', 'vision'],
                deprecated: false,
                available: true
            };
        }
    });

    return enrichedModels;
}

/**
 * Static OpenAI data
 */
function getStaticOpenAIData() {
    return {
        'gpt-4o-mini': {
            id: 'gpt-4o-mini',
            category: 'small',
            contextWindow: 128000,
            maxOutput: 16384,
            pricing: { input: 0.15, output: 0.60, unit: 'per_million_tokens' },
            capabilities: ['chat', 'tools', 'vision'],
            deprecated: false,
            available: true
        },
        'gpt-4o': {
            id: 'gpt-4o',
            category: 'large',
            contextWindow: 128000,
            maxOutput: 16384,
            pricing: { input: 2.50, output: 10.00, unit: 'per_million_tokens' },
            capabilities: ['chat', 'tools', 'vision'],
            deprecated: false,
            available: true
        },
        'o1-preview': {
            id: 'o1-preview',
            category: 'reasoning',
            contextWindow: 128000,
            maxOutput: 32768,
            pricing: { input: 15.00, output: 60.00, unit: 'per_million_tokens' },
            capabilities: ['chat', 'reasoning'],
            deprecated: false,
            available: true
        },
        'o1-mini': {
            id: 'o1-mini',
            category: 'reasoning',
            contextWindow: 128000,
            maxOutput: 65536,
            pricing: { input: 3.00, output: 12.00, unit: 'per_million_tokens' },
            capabilities: ['chat', 'reasoning'],
            deprecated: false,
            available: true
        }
    };
}

/**
 * Get static Gemini data (API requires complex auth)
 */
function getGeminiData() {
    console.log('📡 Loading Gemini data (static)...');
    
    // Data from https://ai.google.dev/pricing and https://ai.google.dev/gemini-api/docs/models
    return {
        'gemini-1.5-flash': {
            id: 'gemini-1.5-flash',
            category: 'small',
            contextWindow: 1000000,
            maxOutput: 8192,
            pricing: {
                input: 0.00,
                output: 0.00,
                unit: 'per_million_tokens',
                free: true,
                paidInput: 0.075,
                paidOutput: 0.30
            },
            capabilities: ['chat', 'tools', 'vision'],
            deprecated: false,
            available: true
        },
        'gemini-1.5-pro': {
            id: 'gemini-1.5-pro',
            category: 'large',
            contextWindow: 2000000,
            maxOutput: 8192,
            pricing: {
                input: 0.00,
                output: 0.00,
                unit: 'per_million_tokens',
                free: true,
                paidInput: 1.25,
                paidOutput: 5.00
            },
            capabilities: ['chat', 'tools', 'vision'],
            deprecated: false,
            available: true
        },
        'gemini-2.0-flash-exp': {
            id: 'gemini-2.0-flash-exp',
            category: 'large',
            contextWindow: 1000000,
            maxOutput: 8192,
            pricing: {
                input: 0.00,
                output: 0.00,
                unit: 'per_million_tokens',
                free: true
            },
            capabilities: ['chat', 'tools', 'vision', 'multimodal'],
            deprecated: false,
            available: true
        }
    };
}

/**
 * Get static Cohere data
 */
function getCohereData() {
    console.log('📡 Loading Cohere data (static)...');
    
    // Data from https://cohere.com/pricing
    return {
        'command-r': {
            id: 'command-r',
            category: 'large',
            contextWindow: 128000,
            maxOutput: 4096,
            pricing: {
                input: 0.15,
                output: 0.60,
                unit: 'per_million_tokens'
            },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: true
        },
        'command-r-plus': {
            id: 'command-r-plus',
            category: 'large',
            contextWindow: 128000,
            maxOutput: 4096,
            pricing: {
                input: 2.50,
                output: 10.00,
                unit: 'per_million_tokens'
            },
            capabilities: ['chat', 'tools', 'reasoning'],
            deprecated: false,
            available: true
        },
        'command-light': {
            id: 'command-light',
            category: 'small',
            contextWindow: 4096,
            maxOutput: 4096,
            pricing: {
                input: 0.30,
                output: 0.60,
                unit: 'per_million_tokens'
            },
            capabilities: ['chat'],
            deprecated: false,
            available: true
        }
    };
}

/**
 * Get static Mistral data
 */
function getMistralData() {
    console.log('📡 Loading Mistral data (static)...');
    
    // Data from https://mistral.ai/technology/#pricing
    return {
        'mistral-large-latest': {
            id: 'mistral-large-latest',
            category: 'large',
            contextWindow: 128000,
            maxOutput: 8192,
            pricing: {
                input: 2.00,
                output: 6.00,
                unit: 'per_million_tokens'
            },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: true
        },
        'mistral-small-latest': {
            id: 'mistral-small-latest',
            category: 'small',
            contextWindow: 32000,
            maxOutput: 8192,
            pricing: {
                input: 0.20,
                output: 0.60,
                unit: 'per_million_tokens'
            },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: true
        },
        'mistral-medium-latest': {
            id: 'mistral-medium-latest',
            category: 'large',
            contextWindow: 32000,
            maxOutput: 8192,
            pricing: {
                input: 0.70,
                output: 2.10,
                unit: 'per_million_tokens'
            },
            capabilities: ['chat', 'tools'],
            deprecated: false,
            available: true
        }
    };
}

/**
 * Get OpenAI-compatible endpoints list
 */
function getOpenAICompatibleEndpoints() {
    return [
        {
            name: 'Together AI',
            endpoint: 'https://api.together.xyz/v1',
            description: 'Access to 100+ open-source models',
            supported: ['chat', 'tools', 'streaming']
        },
        {
            name: 'Anyscale Endpoints',
            endpoint: 'https://api.endpoints.anyscale.com/v1',
            description: 'Ray-powered serverless LLM inference',
            supported: ['chat', 'tools', 'streaming']
        },
        {
            name: 'Perplexity AI',
            endpoint: 'https://api.perplexity.ai',
            description: 'Search-augmented language models',
            supported: ['chat', 'streaming']
        },
        {
            name: 'DeepInfra',
            endpoint: 'https://api.deepinfra.com/v1/openai',
            description: 'Fast inference for popular models',
            supported: ['chat', 'tools', 'streaming']
        },
        {
            name: 'Fireworks AI',
            endpoint: 'https://api.fireworks.ai/inference/v1',
            description: 'Production-ready LLM platform',
            supported: ['chat', 'tools', 'streaming']
        },
        {
            name: 'Ollama (Local)',
            endpoint: 'http://localhost:11434/v1',
            description: 'Run models locally on your machine',
            supported: ['chat', 'streaming']
        },
        {
            name: 'LocalAI (Local)',
            endpoint: 'http://localhost:8080/v1',
            description: 'Local OpenAI-compatible API',
            supported: ['chat', 'tools', 'streaming']
        }
    ];
}

/**
 * Build complete provider catalog
 */
async function buildProviderCatalog() {
    console.log('🔨 Building provider catalog...\n');

    const groqModels = await fetchGroqModels();
    const openaiModels = await fetchOpenAIModels();
    const geminiModels = getGeminiData();
    const cohereModels = getCohereData();
    const mistralModels = getMistralData();
    const openaiCompatible = getOpenAICompatibleEndpoints();

    const catalog = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString().split('T')[0],
        providers: {
            groq: {
                name: 'Groq',
                type: 'groq',
                apiBase: 'https://api.groq.com/openai/v1',
                supportsStreaming: true,
                supportsTools: true,
                freeTier: {
                    available: true,
                    limits: {
                        requestsPerMinute: 7000,
                        requestsPerDay: 14400,
                        tokensPerMinute: 30000,
                        tokensPerDay: null
                    }
                },
                rateLimitHeaders: {
                    format: 'standard',
                    prefix: 'x-ratelimit-'
                },
                models: groqModels
            },
            openai: {
                name: 'OpenAI',
                type: 'openai',
                apiBase: 'https://api.openai.com/v1',
                supportsStreaming: true,
                supportsTools: true,
                supportsVision: true,
                freeTier: {
                    available: false
                },
                rateLimitHeaders: {
                    format: 'standard',
                    prefix: 'x-ratelimit-'
                },
                models: openaiModels
            },
            gemini: {
                name: 'Google Gemini',
                type: 'gemini',
                apiBase: 'https://generativelanguage.googleapis.com/v1beta',
                supportsStreaming: true,
                supportsTools: true,
                supportsVision: true,
                freeTier: {
                    available: true,
                    limits: {
                        requestsPerMinute: 15,
                        requestsPerDay: 1500,
                        tokensPerMinute: 32000,
                        tokensPerDay: 50000000
                    }
                },
                rateLimitHeaders: {
                    format: 'custom',
                    note: 'May not expose all limits in headers'
                },
                models: geminiModels
            },
            cohere: {
                name: 'Cohere',
                type: 'cohere',
                apiBase: 'https://api.cohere.ai/v1',
                supportsStreaming: true,
                supportsTools: true,
                freeTier: {
                    available: true,
                    limits: {
                        note: 'Trial credits available, check dashboard for limits'
                    }
                },
                rateLimitHeaders: {
                    format: 'custom'
                },
                models: cohereModels
            },
            mistral: {
                name: 'Mistral AI',
                type: 'mistral',
                apiBase: 'https://api.mistral.ai/v1',
                supportsStreaming: true,
                supportsTools: true,
                freeTier: {
                    available: false
                },
                rateLimitHeaders: {
                    format: 'standard',
                    prefix: 'x-ratelimit-'
                },
                models: mistralModels
            }
        },
        openaiCompatibleEndpoints: openaiCompatible,
        whisperSupport: {
            openai: {
                available: true,
                model: 'whisper-1',
                endpoint: '/v1/audio/transcriptions'
            },
            groq: {
                available: true,
                model: 'whisper-large-v3',
                endpoint: '/openai/v1/audio/transcriptions'
            }
        },
        modelCategories: {
            small: {
                description: 'Fast, cost-effective models for simple tasks',
                useCases: ['summarization', 'quick responses', 'simple queries'],
                maxCost: 0.50
            },
            large: {
                description: 'General-purpose models for most tasks',
                useCases: ['chat', 'complex queries', 'tool usage'],
                maxCost: 5.00
            },
            reasoning: {
                description: 'Optimized for multi-step reasoning and analysis',
                useCases: ['planning', 'analysis', 'complex problem solving'],
                maxCost: 20.00
            }
        }
    };

    return catalog;
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 Provider Data Collection Tool\n');
    console.log('================================================\n');

    try {
        const catalog = await buildProviderCatalog();

        // Write to file
        const outputPath = path.join(__dirname, '..', 'PROVIDER_CATALOG.json');
        fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));

        console.log('\n================================================');
        console.log(`✅ Provider catalog written to: ${outputPath}`);
        console.log(`\n📊 Summary:`);
        console.log(`   - Providers: ${Object.keys(catalog.providers).length}`);
        
        let totalModels = 0;
        let freeProviders = 0;
        
        Object.values(catalog.providers).forEach(provider => {
            const modelCount = Object.keys(provider.models).length;
            totalModels += modelCount;
            if (provider.freeTier.available) freeProviders++;
            console.log(`   - ${provider.name}: ${modelCount} models`);
        });
        
        console.log(`   - Total models: ${totalModels}`);
        console.log(`   - Free tier providers: ${freeProviders}`);
        console.log(`   - OpenAI-compatible endpoints: ${catalog.openaiCompatibleEndpoints.length}`);
        console.log('\n✨ Done!\n');

    } catch (error) {
        console.error('\n❌ Error building catalog:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { buildProviderCatalog };
