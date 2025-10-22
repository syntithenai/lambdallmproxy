/**
 * Embedding Generation Module
 * 
 * Generates embeddings using multiple providers (OpenAI, Cohere, Together AI)
 * with automatic retry logic, rate limiting, and cost tracking.
 */

// Try both paths (local dev vs Lambda deployment)
let embeddingCatalog;
try {
  embeddingCatalog = require('../../EMBEDDING_MODELS_CATALOG.json');
} catch (e) {
  embeddingCatalog = require('../EMBEDDING_MODELS_CATALOG.json');
}

// Provider-specific API endpoints
const PROVIDER_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/embeddings',
  cohere: 'https://api.cohere.ai/v1/embed',
  together: 'https://api.together.xyz/v1/embeddings',
};

// Default configuration
const DEFAULT_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // milliseconds
  batchSize: 100, // texts per batch
  timeoutMs: 30000,
};

/**
 * Generate embedding for a single text using specified provider and model
 * @param {string} text - The text to embed
 * @param {string} model - Model name (e.g., 'text-embedding-3-small')
 * @param {string} provider - Provider name ('openai', 'cohere', 'together')
 * @param {string} apiKey - API key for the provider
 * @param {object} options - Additional options (retries, timeout, etc.)
 * @returns {Promise<{embedding: Float32Array, dimensions: number, tokens: number, cost: number}>}
 */
async function generateEmbedding(text, model, provider, apiKey, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  
  // Validate inputs
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }
  
  if (!apiKey) {
    throw new Error(`API key required for provider: ${provider}`);
  }
  
  // Get model info from catalog
  const modelInfo = embeddingCatalog.models.find(m => m.id === model && m.provider === provider);
  if (!modelInfo) {
    throw new Error(`Model ${model} not found for provider ${provider}`);
  }
  
  // Estimate tokens
  const estimatedTokens = Math.ceil(text.length / 4);
  if (estimatedTokens > modelInfo.maxTokens) {
    throw new Error(`Text exceeds max tokens (${estimatedTokens} > ${modelInfo.maxTokens})`);
  }
  
  let lastError;
  
  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const result = await generateEmbeddingWithProvider(
        text,
        model,
        provider,
        apiKey,
        config.timeoutMs
      );
      
      // Calculate cost (0 if running locally)
      const isLocal = process.env.LOCAL_LAMBDA === 'true' || 
                     process.env.NODE_ENV === 'development' ||
                     process.env.AWS_EXECUTION_ENV === undefined;
      const cost = isLocal ? 0 : (result.tokens / 1000000) * modelInfo.pricePerMillionTokens;
      
      return {
        embedding: new Float32Array(result.embedding),
        dimensions: result.embedding.length,
        tokens: result.tokens,
        cost,
        model,
        provider,
      };
      
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (400s except 429)
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw error;
      }
      
      // Wait before retry with exponential backoff
      if (attempt < config.maxRetries - 1) {
        const delay = config.retryDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1} after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Failed to generate embedding after ${config.maxRetries} attempts: ${lastError.message}`);
}

/**
 * Generate embeddings for multiple texts in batches
 * @param {string[]} texts - Array of texts to embed
 * @param {string} model - Model name
 * @param {string} provider - Provider name
 * @param {string} apiKey - API key
 * @param {object} options - Options including onProgress callback
 * @returns {Promise<Array<{embedding: Float32Array, dimensions: number, tokens: number, cost: number}>>}
 */
async function batchGenerateEmbeddings(texts, model, provider, apiKey, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const onProgress = options.onProgress || (() => {});
  
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Texts must be a non-empty array');
  }
  
  const results = [];
  const batchSize = config.batchSize;
  const totalBatches = Math.ceil(texts.length / batchSize);
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} texts)`);
    
    // Process batch based on provider capabilities
    if (provider === 'openai') {
      // OpenAI supports batch embedding
      const batchResult = await generateBatchEmbeddingOpenAI(batch, model, apiKey, config.timeoutMs);
      results.push(...batchResult);
    } else {
      // Other providers: process individually
      for (let j = 0; j < batch.length; j++) {
        const result = await generateEmbedding(batch[j], model, provider, apiKey, config);
        results.push(result);
      }
    }
    
    // Report progress
    onProgress({
      completed: Math.min(i + batchSize, texts.length),
      total: texts.length,
      batch: batchNum,
      totalBatches,
    });
    
    // Rate limiting: small delay between batches
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Provider-specific implementation for OpenAI
 */
async function generateEmbeddingWithProvider(text, model, provider, apiKey, timeoutMs) {
  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  let requestBody;
  let headers;
  
  switch (provider) {
    case 'openai':
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      requestBody = {
        input: text,
        model: model,
        encoding_format: 'float',
      };
      break;
      
    case 'cohere':
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      requestBody = {
        texts: [text],
        model: model,
        input_type: 'search_document',
        truncate: 'END',
      };
      break;
      
    case 'together':
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      requestBody = {
        input: text,
        model: model,
      };
      break;
      
    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`API error: ${response.status} ${errorText}`);
      error.status = response.status;
      throw error;
    }
    
    const data = await response.json();
    
    // Parse response based on provider
    return parseEmbeddingResponse(data, provider);
    
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * OpenAI batch embedding (supports up to 2048 texts per request)
 */
async function generateBatchEmbeddingOpenAI(texts, model, apiKey, timeoutMs) {
  const endpoint = PROVIDER_ENDPOINTS.openai;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  
  const requestBody = {
    input: texts,
    model: model,
    encoding_format: 'float',
  };
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    
    // Get model info for cost calculation
    const modelInfo = embeddingCatalog.models.find(m => m.id === model && m.provider === 'openai');
    
    // Parse response
    const results = data.data.map((item, index) => {
      const tokens = Math.ceil(texts[index].length / 4); // Estimate
      const cost = modelInfo ? (tokens / 1000000) * modelInfo.pricing.perMillionTokens : 0;
      
      return {
        embedding: new Float32Array(item.embedding),
        dimensions: item.embedding.length,
        tokens,
        cost,
        model,
        provider: 'openai',
      };
    });
    
    return results;
    
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Parse embedding response from different providers
 */
function parseEmbeddingResponse(data, provider) {
  switch (provider) {
    case 'openai':
      return {
        embedding: data.data[0].embedding,
        tokens: data.usage?.total_tokens || Math.ceil(data.data[0].embedding.length / 4),
      };
      
    case 'cohere':
      return {
        embedding: data.embeddings[0],
        tokens: data.meta?.billed_units?.input_tokens || Math.ceil(data.embeddings[0].length / 4),
      };
      
    case 'together':
      return {
        embedding: data.data[0].embedding,
        tokens: data.usage?.total_tokens || Math.ceil(data.data[0].embedding.length / 4),
      };
      
    default:
      throw new Error(`Response parsing not implemented for provider: ${provider}`);
  }
}

/**
 * Get default embedding model from catalog
 */
function getDefaultModel() {
  return embeddingCatalog.defaultModel;
}

/**
 * Get fallback chain for embedding models
 */
function getFallbackChain() {
  return embeddingCatalog.fallbackChain;
}

/**
 * Get model info from catalog
 */
function getModelInfo(modelName, provider) {
  return embeddingCatalog.models.find(m => m.name === modelName && m.provider === provider);
}

/**
 * Calculate total cost for embedding generation
 */
function calculateTotalCost(results) {
  return results.reduce((sum, result) => sum + result.cost, 0);
}

/**
 * Calculate total tokens used
 */
function calculateTotalTokens(results) {
  return results.reduce((sum, result) => sum + result.tokens, 0);
}

module.exports = {
  generateEmbedding,
  batchGenerateEmbeddings,
  getDefaultModel,
  getFallbackChain,
  getModelInfo,
  calculateTotalCost,
  calculateTotalTokens,
};
