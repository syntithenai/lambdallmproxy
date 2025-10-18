/**
 * Vector Search Module
 * 
 * Performs similarity search using cosine similarity on embeddings.
 * Supports both IndexedDB (client-side) and libSQL (server-side) storage.
 * 
 * Auto-detects environment:
 * - Browser: Uses IndexedDB
 * - Node.js with LIBSQL_URL: Uses libSQL
 * - Node.js without LIBSQL_URL: Fallback to IndexedDB
 */

// Detect environment and storage backend
const isNode = typeof window === 'undefined';
const useLibSQL = isNode && (process.env.LIBSQL_URL || process.env.USE_LIBSQL === 'true');

let storageBackend;
let libsqlClient = null;
let initPromise = null;

if (useLibSQL) {
  console.log('RAG Search: Using libSQL storage backend');
  storageBackend = require('./libsql-storage');
  // Initialize libSQL client singleton
  libsqlClient = storageBackend.createLibsqlClient({
    url: process.env.LIBSQL_URL,
    authToken: process.env.LIBSQL_AUTH_TOKEN,
  });
  
  // Initialize database schema (create tables if they don't exist)
  initPromise = storageBackend.initDatabase(libsqlClient).then(() => {
    console.log('RAG database initialized successfully');
  }).catch(err => {
    console.error('Failed to initialize RAG database:', err);
    throw err;
  });
} else {
  console.log('RAG Search: Using IndexedDB storage backend');
  storageBackend = require('./indexeddb-storage');
  // No initialization needed for IndexedDB (handled in browser)
  initPromise = Promise.resolve();
}

/**
 * Unified getAllChunks interface that works with both backends
 * @param {object} options - Optional filters
 * @returns {Promise<Array>} Array of chunks
 */
async function getAllChunks(options = {}) {
  // Wait for database initialization to complete
  if (initPromise) {
    await initPromise;
  }
  
  if (useLibSQL) {
    return storageBackend.getAllChunks(libsqlClient, options);
  } else {
    return storageBackend.getAllChunks(options);
  }
}

/**
 * Optimized search using libSQL's native vector search
 * @param {Float32Array|Array} queryEmbedding - Query embedding vector
 * @param {object} options - Search options
 * @returns {Promise<Array>} Array of results with similarity scores
 */
async function searchChunksLibSQL(queryEmbedding, options = {}) {
  // Wait for database initialization to complete
  if (initPromise) {
    await initPromise;
  }
  
  const {
    topK = 5,
    threshold = 0.7,
    snippetId = null,
    diversityFilter = true,
    recencyBoost = 0.0,
    maxPerSnippet = 2,
    source_type = null,
  } = options;
  
  // Use libSQL's searchChunks function which does cosine similarity in the query
  const rawResults = await storageBackend.searchChunks(libsqlClient, queryEmbedding, {
    topK: diversityFilter ? topK * 3 : topK, // Get more results if diversity filtering
    threshold,
    snippetId,
    source_type,
  });
  
  // Apply recency boost if needed
  let results = rawResults.map(result => {
    let finalScore = result.similarity;
    
    if (recencyBoost > 0 && result.created_at) {
      const ageInDays = (Date.now() - new Date(result.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const recencyFactor = 1 / (1 + ageInDays * 0.1);
      finalScore = result.similarity * (1 + recencyBoost * recencyFactor);
    }
    
    return {
      ...result,
      score: finalScore,
      chunk: result, // For compatibility with existing code
      chunk_text: result.chunk_text,
      chunk_index: result.chunk_index,
    };
  });
  
  // Re-sort by score if recency boost was applied
  if (recencyBoost > 0) {
    results.sort((a, b) => b.score - a.score);
  }
  
  // Apply diversity filter if enabled
  if (diversityFilter && maxPerSnippet > 0) {
    results = applyDiversityFilter(results, maxPerSnippet);
  }
  
  // Return top K results
  return results.slice(0, topK);
}

/**
 * Calculate cosine similarity between two vectors
 * @param {Float32Array|Array} vecA - First vector
 * @param {Float32Array|Array} vecB - Second vector
 * @returns {number} Similarity score between -1 and 1 (higher is more similar)
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

/**
 * Search for similar chunks using vector similarity
 * @param {Float32Array|Array} queryEmbedding - Query embedding vector
 * @param {object} options - Search options
 * @returns {Promise<Array>} Array of results with similarity scores
 */
async function searchChunks(queryEmbedding, options = {}) {
  const {
    topK = 5,
    threshold = 0.7,
    snippetId = null, // Filter by specific snippet
    diversityFilter = true, // Avoid too many results from same snippet
    recencyBoost = 0.0, // Boost newer content (0.0 = disabled, 0.1 = 10% boost)
    maxPerSnippet = 2, // Max results from same snippet (if diversityFilter enabled)
    source_type = null, // Filter by source type ('file', 'url', 'text')
  } = options;
  
  // Use optimized libSQL vector search if available
  if (useLibSQL && libsqlClient) {
    return await searchChunksLibSQL(queryEmbedding, {
      topK,
      threshold,
      snippetId,
      diversityFilter,
      recencyBoost,
      maxPerSnippet,
      source_type,
    });
  }
  
  // Fallback to IndexedDB (load all chunks)
  const allChunks = await getAllChunks();
  
  // Filter by snippet if specified
  const chunks = snippetId 
    ? allChunks.filter(chunk => chunk.snippet_id === snippetId)
    : allChunks;
  
  if (chunks.length === 0) {
    console.warn('No chunks available for search');
    return [];
  }
  
  // Calculate similarity for each chunk
  const results = chunks.map(chunk => {
    // Skip chunks without embeddings
    if (!chunk.embedding) {
      return null;
    }
    
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    
    // Apply recency boost if enabled
    let finalScore = similarity;
    if (recencyBoost > 0 && chunk.created_at) {
      const ageInDays = (Date.now() - new Date(chunk.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const recencyFactor = 1 / (1 + ageInDays * 0.1); // Decay factor
      finalScore = similarity * (1 + recencyBoost * recencyFactor);
    }
    
    return {
      chunk,
      similarity,
      score: finalScore,
      snippet_id: chunk.snippet_id,
      chunk_text: chunk.chunk_text,
      chunk_index: chunk.chunk_index,
      embedding_model: chunk.embedding_model,
      created_at: chunk.created_at,
    };
  }).filter(result => result !== null);
  
  // Filter by threshold
  const filteredResults = results.filter(result => result.similarity >= threshold);
  
  // Sort by score (descending)
  filteredResults.sort((a, b) => b.score - a.score);
  
  // Apply diversity filter if enabled
  let finalResults = filteredResults;
  if (diversityFilter && maxPerSnippet > 0) {
    finalResults = applyDiversityFilter(filteredResults, maxPerSnippet);
  }
  
  // Return top K results
  return finalResults.slice(0, topK);
}

/**
 * Apply diversity filter to avoid too many results from the same snippet
 * @param {Array} results - Search results
 * @param {number} maxPerSnippet - Maximum results per snippet
 * @returns {Array} Filtered results
 */
function applyDiversityFilter(results, maxPerSnippet) {
  const snippetCounts = {};
  const filtered = [];
  
  for (const result of results) {
    const snippetId = result.snippet_id;
    snippetCounts[snippetId] = (snippetCounts[snippetId] || 0);
    
    if (snippetCounts[snippetId] < maxPerSnippet) {
      filtered.push(result);
      snippetCounts[snippetId]++;
    }
  }
  
  return filtered;
}

/**
 * Search with query text (generates embedding first)
 * Requires embedding generation function to be passed in
 * @param {string} queryText - Query text
 * @param {Function} generateEmbeddingFn - Function to generate embedding
 * @param {object} options - Search options
 * @returns {Promise<Array>} Search results
 */
async function searchWithText(queryText, generateEmbeddingFn, options = {}) {
  // Generate embedding for query
  const embeddingResult = await generateEmbeddingFn(queryText);
  
  // Search with embedding
  return searchChunks(embeddingResult.embedding, options);
}

/**
 * Get context snippet for a result (include surrounding chunks)
 * @param {object} result - Search result
 * @param {number} contextSize - Number of chunks before/after to include
 * @returns {Promise<string>} Context text
 */
async function getResultContext(result, contextSize = 1) {
  const allChunks = await getAllChunks();
  
  // Find chunks from same snippet
  const snippetChunks = allChunks
    .filter(chunk => chunk.snippet_id === result.snippet_id)
    .sort((a, b) => a.chunk_index - b.chunk_index);
  
  // Find current chunk index
  const currentIndex = snippetChunks.findIndex(chunk => chunk.id === result.chunk.id);
  
  if (currentIndex === -1) {
    return result.chunk_text;
  }
  
  // Get surrounding chunks
  const startIndex = Math.max(0, currentIndex - contextSize);
  const endIndex = Math.min(snippetChunks.length - 1, currentIndex + contextSize);
  
  const contextChunks = snippetChunks.slice(startIndex, endIndex + 1);
  
  return contextChunks.map(chunk => chunk.chunk_text).join('\n\n');
}

/**
 * Format search results in compact markdown with source links
 * (Similar to web search results)
 * @param {Array} results - Search results
 * @param {object} options - Formatting options
 * @returns {string} Formatted markdown text
 */
function formatSearchResultsCompact(results, options = {}) {
  const {
    includeScores = true,
    maxExcerptLength = 200,
    baseUrl = 'https://lambdallmproxy.pages.dev',
  } = options;
  
  if (results.length === 0) {
    return '## Search Results (0 found)\n\nNo relevant documents found.';
  }
  
  const header = `## Search Results (${results.length} found)\n\n`;
  
  const formattedResults = results.map((result, index) => {
    // Determine source icon and link
    const sourceIcon = result.chunk?.source_type === 'url' ? '🔗' : '📄';
    const sourceLink = result.chunk?.source_url || `${baseUrl}/file/${result.snippet_id}`;
    const sourceName = result.chunk?.source_file_name || result.chunk?.source_url || 'Unknown Source';
    
    // Create title with link
    const snippetName = result.chunk?.snippet_name || `Document ${index + 1}`;
    const title = `### ${index + 1}. ${snippetName} [${sourceIcon}](${sourceLink})`;
    
    // Create metadata line
    const similarityText = includeScores ? ` | **Similarity:** ${result.similarity.toFixed(2)}` : '';
    const meta = `**Source:** ${sourceName}${similarityText}`;
    
    // Create excerpt
    const chunkText = result.chunk_text || '';
    const excerpt = chunkText.length > maxExcerptLength
      ? chunkText.substring(0, maxExcerptLength) + '...'
      : chunkText;
    
    // Create "read full" link
    const fullLink = `[Read full document →](${sourceLink})`;
    
    return `${title}\n${meta}\n\n${excerpt}\n\n${fullLink}\n\n---`;
  }).join('\n\n');
  
  return header + formattedResults;
}

/**
 * Format search results for display or LLM context
 * @param {Array} results - Search results
 * @param {object} options - Formatting options
 * @returns {string} Formatted text
 */
function formatSearchResults(results, options = {}) {
  const {
    includeScores = true,
    includeSnippetNames = true,
    maxLength = null, // Max total length
    separator = '\n\n---\n\n',
  } = options;
  
  if (results.length === 0) {
    return '';
  }
  
  let formatted = results.map((result, index) => {
    let text = `[${index + 1}]`;
    
    if (includeScores) {
      text += ` (Similarity: ${result.similarity.toFixed(2)})`;
    }
    
    text += '\n' + result.chunk_text;
    
    if (includeSnippetNames && result.snippet_id) {
      text += `\n(Source: ${result.snippet_id})`;
    }
    
    return text;
  }).join(separator);
  
  // Truncate if too long
  if (maxLength && formatted.length > maxLength) {
    formatted = formatted.substring(0, maxLength) + '\n...(truncated)';
  }
  
  return formatted;
}

/**
 * Calculate search statistics
 * @param {Array} results - Search results
 * @returns {object} Statistics
 */
function getSearchStats(results) {
  if (results.length === 0) {
    return {
      count: 0,
      avgSimilarity: 0,
      minSimilarity: 0,
      maxSimilarity: 0,
      uniqueSnippets: 0,
    };
  }
  
  const similarities = results.map(r => r.similarity);
  const uniqueSnippets = new Set(results.map(r => r.snippet_id)).size;
  
  return {
    count: results.length,
    avgSimilarity: similarities.reduce((sum, s) => sum + s, 0) / results.length,
    minSimilarity: Math.min(...similarities),
    maxSimilarity: Math.max(...similarities),
    uniqueSnippets,
  };
}

/**
 * Find duplicate or near-duplicate chunks
 * @param {number} threshold - Similarity threshold (default 0.95 for near-duplicates)
 * @returns {Promise<Array>} Array of duplicate pairs
 */
async function findDuplicates(threshold = 0.95) {
  const allChunks = await getAllChunks();
  const duplicates = [];
  
  for (let i = 0; i < allChunks.length; i++) {
    for (let j = i + 1; j < allChunks.length; j++) {
      const chunkA = allChunks[i];
      const chunkB = allChunks[j];
      
      if (!chunkA.embedding || !chunkB.embedding) {
        continue;
      }
      
      const similarity = cosineSimilarity(chunkA.embedding, chunkB.embedding);
      
      if (similarity >= threshold) {
        duplicates.push({
          chunkA: { id: chunkA.id, text: chunkA.chunk_text, snippet_id: chunkA.snippet_id },
          chunkB: { id: chunkB.id, text: chunkB.chunk_text, snippet_id: chunkB.snippet_id },
          similarity,
        });
      }
    }
  }
  
  return duplicates;
}

/**
 * Cluster chunks by similarity
 * Simple greedy clustering algorithm
 * @param {number} threshold - Similarity threshold for clustering
 * @returns {Promise<Array>} Array of clusters
 */
async function clusterChunks(threshold = 0.8) {
  const allChunks = await getAllChunks();
  const clusters = [];
  const assigned = new Set();
  
  for (const chunk of allChunks) {
    if (!chunk.embedding || assigned.has(chunk.id)) {
      continue;
    }
    
    // Start new cluster
    const cluster = [chunk];
    assigned.add(chunk.id);
    
    // Find similar chunks
    for (const otherChunk of allChunks) {
      if (!otherChunk.embedding || assigned.has(otherChunk.id)) {
        continue;
      }
      
      // Check similarity with any chunk in cluster
      for (const clusterChunk of cluster) {
        const similarity = cosineSimilarity(chunk.embedding, otherChunk.embedding);
        
        if (similarity >= threshold) {
          cluster.push(otherChunk);
          assigned.add(otherChunk.id);
          break;
        }
      }
    }
    
    clusters.push({
      size: cluster.length,
      chunks: cluster,
      centroid: calculateCentroid(cluster.map(c => c.embedding)),
    });
  }
  
  return clusters.sort((a, b) => b.size - a.size);
}

/**
 * Calculate centroid of embeddings
 * @param {Array} embeddings - Array of embedding vectors
 * @returns {Float32Array} Centroid vector
 */
function calculateCentroid(embeddings) {
  if (embeddings.length === 0) {
    return new Float32Array();
  }
  
  const dimensions = embeddings[0].length;
  const centroid = new Float32Array(dimensions);
  
  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }
  
  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }
  
  return centroid;
}

module.exports = {
  cosineSimilarity,
  searchChunks,
  searchWithText,
  getResultContext,
  formatSearchResults,
  formatSearchResultsCompact,
  getSearchStats,
  findDuplicates,
  clusterChunks,
  calculateCentroid,
};
