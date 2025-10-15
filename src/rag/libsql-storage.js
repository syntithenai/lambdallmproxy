/**
 * libSQL Vector Storage for RAG
 * 
 * Server-side vector database using libSQL with vector similarity search.
 * Supports cosine similarity and pre-populated knowledge bases.
 * 
 * Benefits over IndexedDB:
 * - Server-side vector search (faster, more scalable)
 * - SQL queries for advanced filtering
 * - Pre-populated knowledge base in Lambda layer
 * - Persistent storage (not browser-dependent)
 * - Can scale to millions of vectors
 */

const { createClient } = require('@libsql/client');
const fs = require('fs').promises;
const path = require('path');

/**
 * Database schema for vector storage
 */
const SCHEMA_SQL = `
-- Main chunks table with embeddings
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  snippet_id TEXT NOT NULL,
  snippet_name TEXT,
  chunk_index INTEGER,
  chunk_text TEXT,
  embedding_vector BLOB,
  
  -- Source tracking
  source_type TEXT CHECK(source_type IN ('file', 'url', 'text')),
  source_url TEXT,
  source_file_path TEXT,
  source_file_name TEXT,
  source_mime_type TEXT,
  
  -- Metadata
  embedding_model TEXT,
  embedding_provider TEXT,
  embedding_dimensions INTEGER,
  token_count INTEGER,
  char_count INTEGER,
  
  -- Timestamps
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chunks_snippet_id ON chunks(snippet_id);
CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON chunks(created_at);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_model ON chunks(embedding_model);
CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON chunks(source_type);
CREATE INDEX IF NOT EXISTS idx_chunks_source_file_name ON chunks(source_file_name);

-- Snippets metadata table
CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT,
  tags TEXT, -- JSON array as string
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snippets_created_at ON snippets(created_at);

-- Database metadata
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

/**
 * Create libsql client
 * @param {Object} options - Client options
 * @param {string} options.url - Database URL or file path
 * @param {string} options.authToken - Auth token for remote database
 * @returns {Object} - libsql client
 */
function createLibsqlClient(options = {}) {
  const {
    url = process.env.LIBSQL_URL || 'file:///tmp/rag.db',
    authToken = process.env.LIBSQL_AUTH_TOKEN,
  } = options;

  return createClient({
    url,
    authToken,
  });
}

/**
 * Initialize database with schema
 * @param {Object} client - libsql client
 * @returns {Promise<void>}
 */
async function initDatabase(client) {
  // Execute schema SQL
  const statements = SCHEMA_SQL.split(';').filter(s => s.trim());
  
  for (const statement of statements) {
    if (statement.trim()) {
      await client.execute(statement.trim());
    }
  }

  // Set database version
  await client.execute({
    sql: 'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
    args: ['version', '1.0.0'],
  });

  console.log('✅ Database initialized successfully');
}

/**
 * Convert Float32Array to Blob for storage
 * @param {Float32Array} vector - Embedding vector
 * @returns {Buffer}
 */
function vectorToBlob(vector) {
  return Buffer.from(vector.buffer);
}

/**
 * Convert Blob to Float32Array for use
 * @param {Buffer} blob - Stored blob
 * @returns {Float32Array}
 */
function blobToVector(blob) {
  // Handle different blob types
  if (!blob) return new Float32Array(0);
  
  // If it's already a buffer or typed array
  if (Buffer.isBuffer(blob)) {
    return new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4);
  }
  
  // If it's a Uint8Array (from database)
  if (blob instanceof Uint8Array) {
    return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
  }
  
  // Fallback: convert to buffer first
  const buffer = Buffer.from(blob);
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
}

/**
 * Calculate cosine similarity between two vectors
 * @param {Float32Array} a - Vector A
 * @param {Float32Array} b - Vector B
 * @returns {number} - Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Save chunks to database
 * @param {Object} client - libsql client
 * @param {Array<Object>} chunks - Chunks with embeddings
 * @returns {Promise<void>}
 */
async function saveChunks(client, chunks) {
  const timestamp = new Date().toISOString();

  for (const chunk of chunks) {
    await client.execute({
      sql: `
        INSERT OR REPLACE INTO chunks (
          id, snippet_id, snippet_name, chunk_index, chunk_text, embedding_vector,
          source_type, source_url, source_file_path, source_file_name, source_mime_type,
          embedding_model, embedding_provider, embedding_dimensions, token_count, char_count,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        chunk.id,
        chunk.snippet_id,
        chunk.snippet_name || '',
        chunk.chunk_index || 0,
        chunk.chunk_text,
        (chunk.embedding_vector || chunk.embedding) ? vectorToBlob(chunk.embedding_vector || chunk.embedding) : null,
        chunk.source_type || 'text',
        chunk.source_url || null,
        chunk.source_file_path || null,
        chunk.source_file_name || null,
        chunk.source_mime_type || null,
        chunk.embedding_model || 'text-embedding-3-small',
        chunk.embedding_provider || 'openai',
        chunk.embedding_dimensions || 1536,
        chunk.token_count || 0,
        chunk.char_count || chunk.chunk_text.length,
        chunk.created_at || timestamp,
        timestamp,
      ],
    });
  }

  console.log(`✅ Saved ${chunks.length} chunks to database`);
}

/**
 * Search for similar chunks using vector similarity
 * @param {Object} client - libsql client
 * @param {Float32Array} queryEmbedding - Query embedding vector
 * @param {Object} options - Search options
 * @param {number} options.topK - Number of results to return
 * @param {number} options.threshold - Minimum similarity threshold (0-1)
 * @param {string} options.sourceType - Filter by source type ('file', 'url', 'text')
 * @returns {Promise<Array<Object>>} - Similar chunks with similarity scores
 */
async function searchChunks(client, queryEmbedding, options = {}) {
  const {
    topK = 5,
    threshold = 0.7,
    sourceType = null,
  } = options;

  // Get all chunks with embeddings
  let sql = 'SELECT * FROM chunks WHERE embedding_vector IS NOT NULL';
  const args = [];

  if (sourceType) {
    sql += ' AND source_type = ?';
    args.push(sourceType);
  }

  const result = await client.execute({ sql, args });
  const chunks = result.rows;

  // Calculate similarity for each chunk
  const similarities = chunks.map(chunk => {
    const chunkVector = blobToVector(chunk.embedding_vector);
    const similarity = cosineSimilarity(queryEmbedding, chunkVector);

    return {
      ...chunk,
      similarity,
      distance: 1 - similarity,
    };
  });

  // Filter by threshold and sort by similarity
  const filtered = similarities
    .filter(chunk => chunk.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return filtered;
}

/**
 * Get chunk by ID
 * @param {Object} client - libsql client
 * @param {string} chunkId - Chunk ID
 * @returns {Promise<Object|null>} - Chunk or null
 */
async function getChunk(client, chunkId) {
  const result = await client.execute({
    sql: 'SELECT * FROM chunks WHERE id = ?',
    args: [chunkId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Get all chunks from the database
 * @param {object} client - libSQL client
 * @param {object} options - Optional filters
 * @returns {Promise<Array>} Array of all chunks with embeddings
 */
async function getAllChunks(client, options = {}) {
  const {
    limit = null,
    offset = 0,
    source_type = null,
  } = options;

  let sql = `
    SELECT 
      id, snippet_id, snippet_name, chunk_index, chunk_text, embedding_vector,
      source_type, source_url, source_file_path, source_file_name, source_mime_type,
      embedding_model, embedding_provider, embedding_dimensions,
      token_count, char_count, created_at, updated_at
    FROM chunks
    WHERE embedding_vector IS NOT NULL
  `;
  
  const args = [];
  
  if (source_type) {
    sql += ' AND source_type = ?';
    args.push(source_type);
  }
  
  sql += ' ORDER BY created_at DESC';
  
  if (limit) {
    sql += ' LIMIT ? OFFSET ?';
    args.push(limit, offset);
  }

  const result = await client.execute({ sql, args });
  
  return result.rows.map(row => ({
    id: row.id,
    snippet_id: row.snippet_id,
    snippet_name: row.snippet_name,
    chunk_index: row.chunk_index,
    chunk_text: row.chunk_text,
    embedding: blobToVector(row.embedding_vector),
    source_type: row.source_type,
    source_url: row.source_url,
    source_file_path: row.source_file_path,
    source_file_name: row.source_file_name,
    source_mime_type: row.source_mime_type,
    embedding_model: row.embedding_model,
    embedding_provider: row.embedding_provider,
    embedding_dimensions: row.embedding_dimensions,
    token_count: row.token_count,
    char_count: row.char_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Get all chunks for a specific snippet
 * @param {object} client - libSQL client
 * @param {string} snippetId - Snippet ID
 * @returns {Promise<Array>} Array of chunks
 */
async function getChunksBySnippet(client, snippetId) {
  const result = await client.execute({
    sql: 'SELECT * FROM chunks WHERE snippet_id = ? ORDER BY chunk_index',
    args: [snippetId],
  });

  return result.rows;
}

/**
 * Delete chunks by snippet ID
 * @param {Object} client - libsql client
 * @param {string} snippetId - Snippet ID
 * @returns {Promise<void>}
 */
async function deleteChunksBySnippet(client, snippetId) {
  await client.execute({
    sql: 'DELETE FROM chunks WHERE snippet_id = ?',
    args: [snippetId],
  });

  console.log(`✅ Deleted chunks for snippet ${snippetId}`);
}

/**
 * Get database statistics
 * @param {Object} client - libsql client
 * @returns {Promise<Object>} - Statistics
 */
async function getDatabaseStats(client) {
  const chunkCount = await client.execute('SELECT COUNT(*) as count FROM chunks');
  const snippetCount = await client.execute('SELECT COUNT(*) as count FROM snippets');
  const chunkWithEmbeddings = await client.execute(
    'SELECT COUNT(*) as count FROM chunks WHERE embedding_vector IS NOT NULL'
  );
  
  const avgChunkSize = await client.execute(
    'SELECT AVG(char_count) as avg FROM chunks'
  );

  const modelDistribution = await client.execute(`
    SELECT embedding_model, COUNT(*) as count 
    FROM chunks 
    WHERE embedding_model IS NOT NULL
    GROUP BY embedding_model
  `);

  const sourceDistribution = await client.execute(`
    SELECT source_type, COUNT(*) as count 
    FROM chunks 
    WHERE source_type IS NOT NULL
    GROUP BY source_type
  `);

  return {
    totalChunks: chunkCount.rows[0].count,
    totalSnippets: snippetCount.rows[0].count,
    chunksWithEmbeddings: chunkWithEmbeddings.rows[0].count,
    avgChunkSize: Math.round(avgChunkSize.rows[0].avg || 0),
    modelDistribution: modelDistribution.rows,
    sourceDistribution: sourceDistribution.rows,
  };
}

/**
 * Export database to JSON
 * @param {Object} client - libsql client
 * @param {string} outputPath - Output file path
 * @returns {Promise<void>}
 */
async function exportDatabase(client, outputPath) {
  const chunks = await client.execute('SELECT * FROM chunks');
  const snippets = await client.execute('SELECT * FROM snippets');
  const metadata = await client.execute('SELECT * FROM metadata');

  const data = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    chunks: chunks.rows,
    snippets: snippets.rows,
    metadata: metadata.rows,
  };

  await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  console.log(`✅ Database exported to ${outputPath}`);
}

/**
 * Import database from JSON
 * @param {Object} client - libsql client
 * @param {string} inputPath - Input file path
 * @returns {Promise<void>}
 */
async function importDatabase(client, inputPath) {
  const data = JSON.parse(await fs.readFile(inputPath, 'utf-8'));

  // Clear existing data
  await client.execute('DELETE FROM chunks');
  await client.execute('DELETE FROM snippets');

  // Import chunks
  if (data.chunks && data.chunks.length > 0) {
    await saveChunks(client, data.chunks);
  }

  // Import snippets
  for (const snippet of data.snippets || []) {
    await client.execute({
      sql: `
        INSERT OR REPLACE INTO snippets (id, name, content, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        snippet.id,
        snippet.name,
        snippet.content,
        snippet.tags,
        snippet.created_at,
        snippet.updated_at,
      ],
    });
  }

  console.log(`✅ Database imported from ${inputPath}`);
}

module.exports = {
  createLibsqlClient,
  initDatabase,
  saveChunks,
  searchChunks,
  getAllChunks,
  getChunk,
  getChunksBySnippet,
  deleteChunksBySnippet,
  getDatabaseStats,
  exportDatabase,
  importDatabase,
  vectorToBlob,
  blobToVector,
  cosineSimilarity,
  SCHEMA_SQL,
};
