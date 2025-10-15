/**
 * IndexedDB Storage Layer for RAG System
 * 
 * Manages local storage of embeddings, chunks, and sync metadata
 * using IndexedDB for fast vector search.
 */

const DB_NAME = 'lambdallmproxy_rag';
const DB_VERSION = 1;

const STORES = {
  CHUNKS: 'chunks',
  SYNC_METADATA: 'sync_metadata',
  EMBEDDING_CONFIG: 'embedding_config',
};

let dbInstance = null;

/**
 * Initialize and open the RAG database
 * @returns {Promise<IDBDatabase>}
 */
async function initRAGDatabase() {
  if (dbInstance) {
    return dbInstance;
  }
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('RAG database opened successfully');
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create chunks object store
      if (!db.objectStoreNames.contains(STORES.CHUNKS)) {
        const chunksStore = db.createObjectStore(STORES.CHUNKS, { keyPath: 'id' });
        chunksStore.createIndex('snippet_id', 'snippet_id', { unique: false });
        chunksStore.createIndex('created_at', 'created_at', { unique: false });
        chunksStore.createIndex('embedding_model', 'embedding_model', { unique: false });
        console.log('Created chunks object store');
      }
      
      // Create sync_metadata object store
      if (!db.objectStoreNames.contains(STORES.SYNC_METADATA)) {
        db.createObjectStore(STORES.SYNC_METADATA, { keyPath: 'key' });
        console.log('Created sync_metadata object store');
      }
      
      // Create embedding_config object store
      if (!db.objectStoreNames.contains(STORES.EMBEDDING_CONFIG)) {
        db.createObjectStore(STORES.EMBEDDING_CONFIG, { keyPath: 'key' });
        console.log('Created embedding_config object store');
      }
    };
  });
}

/**
 * Save chunks to IndexedDB
 * @param {Array} chunks - Array of chunk objects with embeddings
 * @returns {Promise<void>}
 */
async function saveChunks(chunks) {
  const db = await initRAGDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CHUNKS], 'readwrite');
    const store = transaction.objectStore(STORES.CHUNKS);
    
    let completed = 0;
    const total = chunks.length;
    
    chunks.forEach(chunk => {
      // Ensure embedding is Float32Array
      if (!(chunk.embedding instanceof Float32Array)) {
        chunk.embedding = new Float32Array(chunk.embedding);
      }
      
      const request = store.put(chunk);
      
      request.onsuccess = () => {
        completed++;
        if (completed === total) {
          console.log(`Saved ${total} chunks to IndexedDB`);
        }
      };
      
      request.onerror = () => {
        console.error('Error saving chunk:', request.error);
      };
    });
    
    transaction.oncomplete = () => {
      resolve();
    };
    
    transaction.onerror = () => {
      reject(new Error(`Transaction failed: ${transaction.error}`));
    };
  });
}

/**
 * Load chunks from IndexedDB
 * @param {string} snippetId - Optional snippet ID to filter by
 * @returns {Promise<Array>}
 */
async function loadChunks(snippetId = null) {
  const db = await initRAGDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CHUNKS], 'readonly');
    const store = transaction.objectStore(STORES.CHUNKS);
    
    let request;
    
    if (snippetId) {
      // Load chunks for specific snippet
      const index = store.index('snippet_id');
      request = index.getAll(snippetId);
    } else {
      // Load all chunks
      request = store.getAll();
    }
    
    request.onsuccess = () => {
      const chunks = request.result;
      console.log(`Loaded ${chunks.length} chunks from IndexedDB`);
      resolve(chunks);
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to load chunks: ${request.error}`));
    };
  });
}

/**
 * Delete chunks from IndexedDB
 * @param {string} snippetId - Snippet ID to delete chunks for
 * @returns {Promise<number>} Number of chunks deleted
 */
async function deleteChunks(snippetId) {
  const db = await initRAGDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CHUNKS], 'readwrite');
    const store = transaction.objectStore(STORES.CHUNKS);
    const index = store.index('snippet_id');
    
    const request = index.openCursor(IDBKeyRange.only(snippetId));
    let deletedCount = 0;
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      }
    };
    
    transaction.oncomplete = () => {
      console.log(`Deleted ${deletedCount} chunks for snippet ${snippetId}`);
      resolve(deletedCount);
    };
    
    transaction.onerror = () => {
      reject(new Error(`Failed to delete chunks: ${transaction.error}`));
    };
  });
}

/**
 * Get all chunks (for vector search)
 * @returns {Promise<Array>}
 */
async function getAllChunks() {
  return loadChunks();
}

/**
 * Count total chunks in database
 * @returns {Promise<number>}
 */
async function countChunks() {
  const db = await initRAGDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CHUNKS], 'readonly');
    const store = transaction.objectStore(STORES.CHUNKS);
    const request = store.count();
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to count chunks: ${request.error}`));
    };
  });
}

/**
 * Get RAG configuration from IndexedDB
 * @returns {Promise<object>}
 */
async function getRAGConfig() {
  const db = await initRAGDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.EMBEDDING_CONFIG], 'readonly');
    const store = transaction.objectStore(STORES.EMBEDDING_CONFIG);
    const request = store.get('rag_config');
    
    request.onsuccess = () => {
      const config = request.result?.value || getDefaultRAGConfig();
      resolve(config);
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to get RAG config: ${request.error}`));
    };
  });
}

/**
 * Set RAG configuration in IndexedDB
 * @param {object} config - Configuration object
 * @returns {Promise<void>}
 */
async function setRAGConfig(config) {
  const db = await initRAGDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.EMBEDDING_CONFIG], 'readwrite');
    const store = transaction.objectStore(STORES.EMBEDDING_CONFIG);
    
    const request = store.put({
      key: 'rag_config',
      value: config,
      updated_at: new Date().toISOString(),
    });
    
    request.onsuccess = () => {
      console.log('RAG config saved');
      resolve();
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to save RAG config: ${request.error}`));
    };
  });
}

/**
 * Get sync metadata
 * @param {string} key - Metadata key
 * @returns {Promise<any>}
 */
async function getSyncMetadata(key) {
  const db = await initRAGDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_METADATA], 'readonly');
    const store = transaction.objectStore(STORES.SYNC_METADATA);
    const request = store.get(key);
    
    request.onsuccess = () => {
      resolve(request.result?.value || null);
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to get sync metadata: ${request.error}`));
    };
  });
}

/**
 * Set sync metadata
 * @param {string} key - Metadata key
 * @param {any} value - Metadata value
 * @returns {Promise<void>}
 */
async function setSyncMetadata(key, value) {
  const db = await initRAGDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_METADATA], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_METADATA);
    
    const request = store.put({
      key,
      value,
      updated_at: new Date().toISOString(),
    });
    
    request.onsuccess = () => {
      resolve();
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to save sync metadata: ${request.error}`));
    };
  });
}

/**
 * Clear all chunks (useful for re-embedding)
 * @returns {Promise<void>}
 */
async function clearAllChunks() {
  const db = await initRAGDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CHUNKS], 'readwrite');
    const store = transaction.objectStore(STORES.CHUNKS);
    const request = store.clear();
    
    request.onsuccess = () => {
      console.log('All chunks cleared from IndexedDB');
      resolve();
    };
    
    request.onerror = () => {
      reject(new Error(`Failed to clear chunks: ${request.error}`));
    };
  });
}

/**
 * Get database statistics
 * @returns {Promise<object>}
 */
async function getDBStats() {
  const db = await initRAGDatabase();
  
  const chunks = await getAllChunks();
  const uniqueSnippets = new Set(chunks.map(c => c.snippet_id)).size;
  const totalEmbeddings = chunks.filter(c => c.embedding).length;
  const models = new Set(chunks.map(c => c.embedding_model)).size;
  
  // Calculate storage size estimate
  const estimatedSizeBytes = chunks.reduce((sum, chunk) => {
    const embeddingSize = chunk.embedding ? chunk.embedding.length * 4 : 0; // Float32 = 4 bytes
    const textSize = chunk.chunk_text ? chunk.chunk_text.length * 2 : 0; // UTF-16 = 2 bytes per char
    return sum + embeddingSize + textSize + 100; // +100 for metadata
  }, 0);
  
  return {
    totalChunks: chunks.length,
    uniqueSnippets,
    totalEmbeddings,
    embeddingModels: models,
    estimatedSizeMB: (estimatedSizeBytes / 1024 / 1024).toFixed(2),
    oldestChunk: chunks.length > 0 ? Math.min(...chunks.map(c => new Date(c.created_at).getTime())) : null,
    newestChunk: chunks.length > 0 ? Math.max(...chunks.map(c => new Date(c.created_at).getTime())) : null,
  };
}

/**
 * Get default RAG configuration
 */
function getDefaultRAGConfig() {
  return {
    enabled: false,
    autoEmbed: false,
    embeddingModel: 'text-embedding-3-small',
    embeddingProvider: 'openai',
    chunkSize: 1000,
    chunkOverlap: 200,
    topK: 5,
    similarityThreshold: 0.7,
    useGoogleSheets: true,
    sheetsBackupEnabled: true,
  };
}

/**
 * Export database (for backup or debugging)
 * @returns {Promise<object>}
 */
async function exportDatabase() {
  const chunks = await getAllChunks();
  const config = await getRAGConfig();
  const lastSync = await getSyncMetadata('last_sync');
  
  return {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    config,
    lastSync,
    chunks: chunks.map(chunk => ({
      ...chunk,
      embedding: Array.from(chunk.embedding), // Convert Float32Array to regular array for JSON
    })),
  };
}

/**
 * Import database (from backup)
 * @param {object} data - Exported database data
 * @returns {Promise<void>}
 */
async function importDatabase(data) {
  if (!data || !data.chunks) {
    throw new Error('Invalid import data');
  }
  
  // Clear existing data
  await clearAllChunks();
  
  // Import chunks
  const chunks = data.chunks.map(chunk => ({
    ...chunk,
    embedding: new Float32Array(chunk.embedding), // Convert back to Float32Array
  }));
  
  await saveChunks(chunks);
  
  // Import config
  if (data.config) {
    await setRAGConfig(data.config);
  }
  
  // Import sync metadata
  if (data.lastSync) {
    await setSyncMetadata('last_sync', data.lastSync);
  }
  
  console.log(`Imported ${chunks.length} chunks`);
}

module.exports = {
  initRAGDatabase,
  saveChunks,
  loadChunks,
  deleteChunks,
  getAllChunks,
  countChunks,
  getRAGConfig,
  setRAGConfig,
  getSyncMetadata,
  setSyncMetadata,
  clearAllChunks,
  getDBStats,
  exportDatabase,
  importDatabase,
  getDefaultRAGConfig,
};
