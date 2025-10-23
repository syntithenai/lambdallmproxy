/**
 * RAG Integration Module
 * 
 * Integrates Retrieval-Augmented Generation into chat and planning flows.
 * Enhances queries with relevant context from embeddings.
 */

const { generateEmbedding } = require('./embeddings');
const { searchChunks, formatSearchResults, getSearchStats } = require('./search');
const { getRAGConfig } = require('./indexeddb-storage');

/**
 * Enhance a query with RAG context
 * @param {string} query - User query
 * @param {object} apiKeys - API keys for embedding generation
 * @param {object} options - RAG options (overrides config)
 * @returns {Promise<{enhancedQuery: string, context: Array, stats: object, tokensUsed: number}>}
 */
async function enhanceQueryWithRAG(query, apiKeys = {}, options = {}) {
  // Get RAG configuration
  const config = await getRAGConfig();
  
  // Check if RAG is enabled
  if (!config.enabled && !options.forceEnabled) {
    return {
      enhancedQuery: query,
      context: [],
      stats: { count: 0 },
      tokensUsed: 0,
      ragEnabled: false,
    };
  }
  
  // Merge options with config
  const settings = {
    embeddingModel: options.embeddingModel || config.embeddingModel,
    embeddingProvider: options.embeddingProvider || config.embeddingProvider,
    topK: options.topK || config.topK,
    similarityThreshold: options.similarityThreshold || config.similarityThreshold,
  };
  
  // Get API key for provider
  const apiKey = apiKeys[settings.embeddingProvider];
  if (!apiKey) {
    console.warn(`No API key for provider: ${settings.embeddingProvider}`);
    return {
      enhancedQuery: query,
      context: [],
      stats: { count: 0 },
      tokensUsed: 0,
      ragEnabled: true,
      error: 'Missing API key',
    };
  }
  
  try {
    // Generate embedding for query
    const embeddingResult = await generateEmbedding(
      query,
      settings.embeddingModel,
      settings.embeddingProvider,
      apiKey
    );
    
    // Search for relevant chunks
    const searchResults = await searchChunks(embeddingResult.embedding, {
      topK: settings.topK,
      threshold: settings.similarityThreshold,
      diversityFilter: true,
      maxPerSnippet: 2,
    });
    
    // Calculate stats
    const stats = getSearchStats(searchResults);
    
    // Format context
    const contextText = formatSearchResults(searchResults, {
      includeScores: true,
      includeSnippetNames: true,
      maxLength: 4000, // Limit context size
    });
    
    // Build enhanced query
    let enhancedQuery = query;
    if (contextText) {
      enhancedQuery = `Relevant context from your saved snippets:\n\n${contextText}\n\n---\n\nUser Query: ${query}`;
    }
    
    return {
      enhancedQuery,
      context: searchResults,
      stats,
      tokensUsed: embeddingResult.tokens,
      embeddingCost: embeddingResult.cost,
      ragEnabled: true,
    };
    
  } catch (error) {
    console.error('RAG enhancement failed:', error);
    return {
      enhancedQuery: query,
      context: [],
      stats: { count: 0 },
      tokensUsed: 0,
      ragEnabled: true,
      error: error.message,
    };
  }
}

/**
 * Format RAG context for system message
 * @param {Array} searchResults - Search results
 * @returns {string} Formatted system message
 */
function formatRAGSystemMessage(searchResults) {
  if (searchResults.length === 0) {
    return '';
  }
  
  const contextText = formatSearchResults(searchResults, {
    includeScores: false,
    includeSnippetNames: true,
  });
  
  return `You have access to the following relevant information from the user's saved snippets:\n\n${contextText}\n\nUse this information to provide more accurate and personalized responses.`;
}

/**
 * Format RAG context for user message prefix
 * @param {Array} searchResults - Search results
 * @returns {string} Formatted context
 */
function formatRAGUserPrefix(searchResults) {
  if (searchResults.length === 0) {
    return '';
  }
  
  const contextText = formatSearchResults(searchResults, {
    includeScores: true,
    includeSnippetNames: true,
    maxLength: 3000,
  });
  
  return `[Context from your saved snippets]\n\n${contextText}\n\n---\n\n`;
}

/**
 * Check if RAG should be applied to a query
 * @param {string} query - User query
 * @param {object} config - RAG configuration
 * @returns {boolean}
 */
function shouldApplyRAG(query, config) {
  if (!config.enabled) {
    return false;
  }
  
  // Skip very short queries
  if (query.length < 10) {
    return false;
  }
  
  // Skip system commands or special queries
  if (query.startsWith('/') || query.startsWith('!')) {
    return false;
  }
  
  return true;
}

/**
 * Extract snippets to embed automatically
 * Called when a snippet is saved with auto-embed enabled
 * @param {object} snippet - Snippet object
 * @param {object} apiKeys - API keys
 * @returns {Promise<{chunks: Array, cost: number, tokens: number}>}
 */
async function autoEmbedSnippet(snippet, apiKeys = {}) {
  const { chunkText } = require('./chunker');
  const { saveChunks, getRAGConfig } = require('./indexeddb-storage');
  const { generateUUID } = require('./utils');
  
  // Get RAG configuration
  const config = await getRAGConfig();
  
  if (!config.autoEmbed) {
    return {
      chunks: [],
      cost: 0,
      tokens: 0,
      skipped: true,
    };
  }
  
  // Get API key
  const apiKey = apiKeys[config.embeddingProvider];
  if (!apiKey) {
    throw new Error(`No API key for provider: ${config.embeddingProvider}`);
  }
  
  // Chunk the snippet text
  const chunks = chunkText(snippet.text || snippet.content, {
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
  });
  
  // Generate embeddings for chunks
  const { batchGenerateEmbeddings, calculateTotalCost, calculateTotalTokens } = require('./embeddings');
  
  // Prepend title and tags to each chunk for embedding
  // This allows vector search to match on title and tag keywords
  const metadataPrefix = [];
  if (snippet.title || snippet.name) {
    metadataPrefix.push(`Title: ${snippet.title || snippet.name}`);
  }
  if (snippet.tags && snippet.tags.length > 0) {
    metadataPrefix.push(`Tags: ${snippet.tags.join(', ')}`);
  }
  const metadataText = metadataPrefix.length > 0 ? metadataPrefix.join('\n') + '\n\n' : '';
  
  const chunkTexts = chunks.map(c => metadataText + c.chunk_text);
  const embeddings = await batchGenerateEmbeddings(
    chunkTexts,
    config.embeddingModel,
    config.embeddingProvider,
    apiKey
  );
  
  // Combine chunks with embeddings
  const chunksWithEmbeddings = chunks.map((chunk, index) => ({
    id: generateUUID(),
    snippet_id: snippet.id,
    snippet_name: snippet.name || snippet.title,
    chunk_index: chunk.chunk_index,
    chunk_text: chunk.chunk_text,
    embedding: embeddings[index].embedding,
    embedding_model: config.embeddingModel,
    embedding_provider: config.embeddingProvider,
    embedding_dimensions: embeddings[index].dimensions,
    token_count: embeddings[index].tokens,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  
  // Save to IndexedDB
  await saveChunks(chunksWithEmbeddings);
  
  const totalCost = calculateTotalCost(embeddings);
  const totalTokens = calculateTotalTokens(embeddings);
  
  return {
    chunks: chunksWithEmbeddings,
    cost: totalCost,
    tokens: totalTokens,
    skipped: false,
  };
}

/**
 * Re-embed a snippet (force regeneration)
 * @param {string} snippetId - Snippet ID
 * @param {object} snippet - Snippet object
 * @param {object} apiKeys - API keys
 * @returns {Promise<object>}
 */
async function reEmbedSnippet(snippetId, snippet, apiKeys = {}) {
  const { deleteChunks } = require('./indexeddb-storage');
  
  // Delete existing chunks
  await deleteChunks(snippetId);
  
  // Generate new embeddings
  return autoEmbedSnippet(snippet, apiKeys);
}

/**
 * Calculate estimated cost for embedding a text
 * @param {string} text - Text to embed
 * @param {string} model - Embedding model
 * @param {string} provider - Provider
 * @returns {number} Estimated cost in USD
 */
function estimateEmbeddingCost(text, model, provider) {
  const { getModelInfo } = require('./embeddings');
  const { estimateTokenCount } = require('./chunker');
  
  const modelInfo = getModelInfo(model, provider);
  if (!modelInfo) {
    return 0;
  }
  
  const tokens = estimateTokenCount(text);
  return (tokens / 1000000) * modelInfo.pricePerMillionTokens;
}

/**
 * Get RAG statistics
 * @returns {Promise<object>}
 */
async function getRAGStats() {
  const { getDBStats } = require('./indexeddb-storage');
  return getDBStats();
}

module.exports = {
  enhanceQueryWithRAG,
  formatRAGSystemMessage,
  formatRAGUserPrefix,
  shouldApplyRAG,
  autoEmbedSnippet,
  reEmbedSnippet,
  estimateEmbeddingCost,
  getRAGStats,
};
