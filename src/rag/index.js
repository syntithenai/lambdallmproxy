/**
 * RAG System - Main Index
 * 
 * Retrieval-Augmented Generation system for LambdaLLMProxy
 * Enables semantic search over user snippets with embeddings.
 */

// Core modules
const chunker = require('./chunker');
const embeddings = require('./embeddings');
const storage = require('./indexeddb-storage');
// const search = require('./search'); // Not used in browser-first architecture
// const ragIntegration = require('./rag-integration'); // Not used - depends on search.js
// const sheetsStorage = require('./sheets-storage'); // Not used by rag.js endpoints - used directly by rag-sync.js

/**
 * Initialize RAG system
 * @returns {Promise<void>}
 */
async function initializeRAG() {
  await storage.initRAGDatabase();
  console.log('RAG system initialized');
}

/**
 * Complete workflow: Chunk → Embed → Store
 * @param {object} snippet - Snippet to process
 * @param {object} apiKeys - API keys for embedding generation
 * @param {object} options - Processing options
 * @returns {Promise<object>} Processing results
 */
async function processSnippet(snippet, apiKeys, options = {}) {
  const config = await storage.getRAGConfig();
  
  // Step 1: Chunk the text
  const chunks = chunker.chunkText(snippet.text || snippet.content, {
    chunkSize: options.chunkSize || config.chunkSize,
    chunkOverlap: options.chunkOverlap || config.chunkOverlap,
  });
  
  console.log(`Generated ${chunks.length} chunks for snippet ${snippet.id}`);
  
  // Step 2: Generate embeddings
  const model = options.embeddingModel || config.embeddingModel;
  const provider = options.embeddingProvider || config.embeddingProvider;
  const apiKey = apiKeys[provider];
  
  if (!apiKey) {
    throw new Error(`No API key for provider: ${provider}`);
  }
  
  const chunkTexts = chunks.map(c => c.chunk_text);
  const embeddingResults = await embeddings.batchGenerateEmbeddings(
    chunkTexts,
    model,
    provider,
    apiKey,
    {
      onProgress: options.onProgress,
    }
  );
  
  console.log(`Generated ${embeddingResults.length} embeddings`);
  
  // Step 3: Combine chunks with embeddings
  const { generateUUID } = require('./utils');
  const chunksWithEmbeddings = chunks.map((chunk, index) => ({
    id: generateUUID(),
    snippet_id: snippet.id,
    snippet_name: snippet.name || snippet.title,
    chunk_index: chunk.chunk_index,
    chunk_text: chunk.chunk_text,
    embedding: embeddingResults[index].embedding,
    embedding_model: model,
    embedding_provider: provider,
    embedding_dimensions: embeddingResults[index].dimensions,
    token_count: embeddingResults[index].tokens,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  
  // Step 4: Save to IndexedDB
  await storage.saveChunks(chunksWithEmbeddings);
  console.log(`Saved ${chunksWithEmbeddings.length} chunks to IndexedDB`);
  
  // Step 5: Optionally sync to Google Sheets
  if (config.sheetsBackupEnabled && options.sheetsClient && options.spreadsheetId) {
    await sheetsStorage.syncChunksToSheets(
      options.sheetsClient,
      options.spreadsheetId,
      chunksWithEmbeddings
    );
    console.log('Synced to Google Sheets');
  }
  
  // Calculate totals
  const totalCost = embeddings.calculateTotalCost(embeddingResults);
  const totalTokens = embeddings.calculateTotalTokens(embeddingResults);
  
  return {
    chunks: chunksWithEmbeddings,
    totalChunks: chunks.length,
    totalCost,
    totalTokens,
    model,
    provider,
  };
}

/**
 * Search workflow: Query → Embed → Search → Format
 * NOT USED - Vector search done in browser with ragDB.vectorSearch()
 * Keeping for reference but commented out
 */
/*
async function searchSnippets(query, apiKeys, options = {}) {
  const config = await storage.getRAGConfig();
  
  if (!config.enabled) {
    return {
      results: [],
      query,
      ragEnabled: false,
    };
  }
  
  // Generate embedding for query
  const model = options.embeddingModel || config.embeddingModel;
  const provider = options.embeddingProvider || config.embeddingProvider;
  const apiKey = apiKeys[provider];
  
  if (!apiKey) {
    throw new Error(`No API key for provider: ${provider}`);
  }
  
  const embeddingResult = await embeddings.generateEmbedding(
    query,
    model,
    provider,
    apiKey
  );
  
  // Search for similar chunks
  const searchResults = await search.searchChunks(embeddingResult.embedding, {
    topK: options.topK || config.topK,
    threshold: options.similarityThreshold || config.similarityThreshold,
    diversityFilter: true,
  });
  
  // Format results
  const formattedResults = search.formatSearchResults(searchResults, {
    includeScores: true,
    includeSnippetNames: true,
  });
  
  return {
    results: searchResults,
    formatted: formattedResults,
    stats: search.getSearchStats(searchResults),
    query,
    embeddingCost: embeddingResult.cost,
    embeddingTokens: embeddingResult.tokens,
    ragEnabled: true,
  };
}
*/

/**
 * Sync with Google Sheets
 * NOT USED - Handled by /rag/sync-embeddings endpoint
 */
/*
async function syncWithGoogleSheets(sheetsClient, spreadsheetId) {
  return sheetsStorage.bidirectionalSync(sheetsClient, spreadsheetId);
}
*/

/**
 * Get comprehensive RAG system status
 * @returns {Promise<object>} System status
 */
async function getSystemStatus() {
  const config = await storage.getRAGConfig();
  const stats = await storage.getDBStats();
  
  return {
    enabled: config.enabled,
    autoEmbed: config.autoEmbed,
    embeddingModel: config.embeddingModel,
    embeddingProvider: config.embeddingProvider,
    totalChunks: stats.totalChunks,
    uniqueSnippets: stats.uniqueSnippets,
    totalEmbeddings: stats.totalEmbeddings,
    embeddingModels: stats.embeddingModels,
    estimatedSizeMB: stats.estimatedSizeMB,
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    topK: config.topK,
    similarityThreshold: config.similarityThreshold,
    sheetsBackupEnabled: config.sheetsBackupEnabled,
  };
}

/**
 * Estimate cost for processing all snippets
 * @param {Array} snippets - Array of snippets
 * @param {string} model - Embedding model
 * @param {string} provider - Provider
 * @returns {number} Estimated cost in USD
 */
function estimateBatchCost(snippets, model, provider) {
  const modelInfo = embeddings.getModelInfo(model, provider);
  if (!modelInfo) {
    return 0;
  }
  
  let totalTokens = 0;
  for (const snippet of snippets) {
    const text = snippet.text || snippet.content || '';
    totalTokens += chunker.estimateTokenCount(text);
  }
  
  return (totalTokens / 1000000) * modelInfo.pricePerMillionTokens;
}

// Export everything
module.exports = {
  // Core modules
  chunker,
  embeddings,
  storage,
  // search, // Not used in browser-first architecture
  // ragIntegration, // Not used - depends on search.js
  // sheetsStorage, // Not used by rag.js endpoints
  
  // High-level workflows
  initializeRAG,
  processSnippet,
  // searchSnippets, // Not used - vector search done in browser
  // syncWithGoogleSheets, // Not used - handled by rag-sync.js endpoint
  getSystemStatus,
  estimateBatchCost,
  
  // Direct function exports for convenience
  chunkText: chunker.chunkText,
  generateEmbedding: embeddings.generateEmbedding,
  batchGenerateEmbeddings: embeddings.batchGenerateEmbeddings,
  // searchChunks: search.searchChunks, // Not used
  // enhanceQueryWithRAG: ragIntegration.enhanceQueryWithRAG, // Not used
  // autoEmbedSnippet: ragIntegration.autoEmbedSnippet, // Not used
  
  // Import from libsql-storage (for Lambda backend) - NOT USED in browser-first architecture
  // ingestDocument: require('./ingest').ingestDocument,
  // hasEmbedding: require('./libsql-storage').hasEmbedding,
  // getEmbeddingDetails: require('./libsql-storage').getEmbeddingDetails,
};
