/**
 * RAG IndexedDB utility for storing and retrieving embeddings locally
 * This stores embeddings in the browser for offline vector search
 */

const RAG_DB_NAME = 'rag_embeddings';
const RAG_DB_VERSION = 2; // Updated to add search_cache store
const CHUNKS_STORE = 'chunks';
const METADATA_STORE = 'metadata';
const SEARCH_CACHE_STORE = 'search_cache';

interface EmbeddingChunk {
  id: string; // Changed from chunk_id for consistency
  snippet_id: string;
  chunk_text: string; // Changed from content
  embedding: number[];
  chunk_index: number;
  embedding_model: string;
  created_at: string; // ISO string
}

interface ChunkMetadata {
  snippet_id: string;
  title?: string;
  source_type?: string;
  tags?: string[];
  created_at: number;
  updated_at: number;
}

interface QueryCache {
  query: string;
  embedding: number[];
  model: string;
  created_at: number;
}

interface SearchResult {
  snippet_id: string;
  chunk_id: string;
  chunk_text: string;
  score: number;
  chunk_index: number;
}

class RAGDatabase {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize RAG IndexedDB
   */
  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported');
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(RAG_DB_NAME, RAG_DB_VERSION);

      request.onerror = () => {
        console.error('RAG IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('RAG IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        
        // Create chunks object store
        if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
          const chunksStore = db.createObjectStore(CHUNKS_STORE, { keyPath: 'id' });
          chunksStore.createIndex('snippet_id', 'snippet_id', { unique: false });
          chunksStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Create metadata object store
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'snippet_id' });
        }

        // Create search cache store (added in v2)
        if (oldVersion < 2 && !db.objectStoreNames.contains(SEARCH_CACHE_STORE)) {
          const cacheStore = db.createObjectStore(SEARCH_CACHE_STORE, { keyPath: 'query' });
          cacheStore.createIndex('created_at', 'created_at', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Check if a snippet has embeddings
   */
  async hasEmbedding(snippetId: string): Promise<boolean> {
    await this.init();
    
    if (!this.db) {
      return false;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CHUNKS_STORE], 'readonly');
      const store = transaction.objectStore(CHUNKS_STORE);
      const index = store.index('snippet_id');
      const request = index.count(IDBKeyRange.only(snippetId));

      request.onsuccess = () => {
        resolve(request.result > 0);
      };

      request.onerror = () => {
        console.error('Error checking embedding:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get embedding details for a snippet
   */
  async getEmbeddingDetails(snippetId: string): Promise<{
    hasEmbedding: boolean;
    chunkCount: number;
    chunks: EmbeddingChunk[];
    metadata?: ChunkMetadata;
  }> {
    await this.init();
    
    if (!this.db) {
      return { hasEmbedding: false, chunkCount: 0, chunks: [] };
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CHUNKS_STORE, METADATA_STORE], 'readonly');
      
      // Get chunks
      const chunksStore = transaction.objectStore(CHUNKS_STORE);
      const chunksIndex = chunksStore.index('snippet_id');
      const chunksRequest = chunksIndex.getAll(IDBKeyRange.only(snippetId));

      // Get metadata
      const metadataStore = transaction.objectStore(METADATA_STORE);
      const metadataRequest = metadataStore.get(snippetId);

      transaction.oncomplete = () => {
        const chunks = chunksRequest.result as EmbeddingChunk[];
        const metadata = metadataRequest.result as ChunkMetadata | undefined;

        resolve({
          hasEmbedding: chunks.length > 0,
          chunkCount: chunks.length,
          chunks: chunks.sort((a, b) => a.chunk_index - b.chunk_index),
          metadata
        });
      };

      transaction.onerror = () => {
        console.error('Error getting embedding details:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Get embedding status for multiple snippets (batch)
   */
  async bulkCheckEmbeddings(snippetIds: string[]): Promise<Record<string, boolean>> {
    await this.init();
    
    if (!this.db) {
      return {};
    }

    const results: Record<string, boolean> = {};

    for (const snippetId of snippetIds) {
      try {
        results[snippetId] = await this.hasEmbedding(snippetId);
      } catch (error) {
        console.error(`Error checking embedding for ${snippetId}:`, error);
        results[snippetId] = false;
      }
    }

    return results;
  }

  /**
   * Save chunks to IndexedDB (called after embedding generation)
   * If chunks already exist for this snippet_id, they will be replaced (not duplicated)
   */
  async saveChunks(chunks: EmbeddingChunk[], metadata?: ChunkMetadata): Promise<void> {
    await this.init();
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Debug: Log chunk structure with detailed inspection
    console.log('💾 saveChunks called with:', {
      chunkCount: chunks.length,
      firstChunk: chunks[0],
      firstChunkKeys: chunks[0] ? Object.keys(chunks[0]) : [],
      hasId: chunks[0]?.id !== undefined,
      idValue: chunks[0]?.id,
      idType: typeof chunks[0]?.id,
      chunkStringified: JSON.stringify(chunks[0], null, 2)
    });

    return new Promise(async (resolve, reject) => {
      // Step 1: Delete existing chunks for this snippet (to prevent duplicates on re-embed)
      const snippetId = chunks[0]?.snippet_id || metadata?.snippet_id;
      if (snippetId) {
        try {
          console.log(`🗑️ Deleting old chunks for snippet: ${snippetId}`);
          await this.deleteChunks(snippetId);
          console.log(`✅ Deleted old chunks for snippet`);
        } catch (deleteError) {
          console.warn('⚠️ Failed to delete old chunks:', deleteError);
          // Continue anyway - put() will update if IDs match
        }
      }

      // Step 2: Save new chunks
      const transaction = this.db!.transaction([CHUNKS_STORE, METADATA_STORE], 'readwrite');
      
      // Save chunks
      const chunksStore = transaction.objectStore(CHUNKS_STORE);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          // Generate ID if missing (backend doesn't always provide it)
          // Use snippet_id + chunk_index for deterministic IDs
          const chunkId = chunk.id || `${chunk.snippet_id || metadata?.snippet_id || 'unknown'}_chunk_${chunk.chunk_index ?? i}`;
          
          // Ensure embedding is a plain array, not Float32Array or other typed array
          const normalizedChunk = {
            ...chunk,
            id: chunkId, // Ensure id exists
            embedding: Array.isArray(chunk.embedding) 
              ? chunk.embedding 
              : Array.from(chunk.embedding || [])
          };
          
          console.log('🔍 Putting chunk:', {
            hasId: normalizedChunk.id !== undefined,
            idValue: normalizedChunk.id,
            snippetId: normalizedChunk.snippet_id,
            chunkIndex: normalizedChunk.chunk_index,
            embeddingLength: normalizedChunk.embedding.length,
            embeddingType: normalizedChunk.embedding.constructor.name,
            allKeys: Object.keys(normalizedChunk),
            chunkPreview: JSON.stringify(normalizedChunk, (key, value) => {
              if (key === 'embedding') return `[Array(${value?.length})]`;
              return value;
            })
          });
          
          const putRequest = chunksStore.put(normalizedChunk);
          
          putRequest.onerror = () => {
            console.error('❌ PUT request failed:', {
              chunk: normalizedChunk,
              error: putRequest.error,
              errorName: putRequest.error?.name,
              errorMessage: putRequest.error?.message
            });
          };
          
        } catch (putError) {
          console.error('❌ Error putting chunk:', { chunk, error: putError });
          throw putError;
        }
      }

      // Save metadata if provided
      if (metadata) {
        const metadataStore = transaction.objectStore(METADATA_STORE);
        metadataStore.put(metadata);
      }

      transaction.oncomplete = () => {
        console.log(`Saved ${chunks.length} chunks to IndexedDB`);
        resolve();
      };

      transaction.onerror = () => {
        console.error('Error saving chunks:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Delete chunks for a snippet
   */
  async deleteChunks(snippetId: string): Promise<void> {
    await this.init();
    
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CHUNKS_STORE, METADATA_STORE], 'readwrite');
      
      // Delete chunks
      const chunksStore = transaction.objectStore(CHUNKS_STORE);
      const chunksIndex = chunksStore.index('snippet_id');
      const chunksRequest = chunksIndex.openCursor(IDBKeyRange.only(snippetId));

      chunksRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete metadata
      const metadataStore = transaction.objectStore(METADATA_STORE);
      metadataStore.delete(snippetId);

      transaction.oncomplete = () => {
        console.log(`Deleted chunks for snippet ${snippetId}`);
        resolve();
      };

      transaction.onerror = () => {
        console.error('Error deleting chunks:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Get all snippets that have embeddings
   */
  async getAllEmbeddedSnippetIds(): Promise<string[]> {
    await this.init();
    
    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result as string[]);
      };

      request.onerror = () => {
        console.error('Error getting embedded snippet IDs:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Cache a query embedding for faster future searches
   */
  async cacheQueryEmbedding(query: string, embedding: number[], model: string): Promise<void> {
    await this.init();
    
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SEARCH_CACHE_STORE], 'readwrite');
      const store = transaction.objectStore(SEARCH_CACHE_STORE);
      
      const cache: QueryCache = {
        query,
        embedding,
        model,
        created_at: Date.now()
      };
      
      store.put(cache);

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        console.error('Error caching query embedding:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Get cached query embedding
   */
  async getCachedQueryEmbedding(query: string): Promise<{ embedding: number[]; model: string } | null> {
    await this.init();
    
    if (!this.db) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SEARCH_CACHE_STORE], 'readonly');
      const store = transaction.objectStore(SEARCH_CACHE_STORE);
      const request = store.get(query);

      request.onsuccess = () => {
        const result = request.result as QueryCache | undefined;
        if (result) {
          resolve({
            embedding: result.embedding,
            model: result.model
          });
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('Error getting cached query:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Perform vector search across all chunks
   * @param queryEmbedding - The query vector (1536 dimensions)
   * @param topK - Number of top results to return
   * @param threshold - Minimum similarity score (0-1)
   */
  async vectorSearch(
    queryEmbedding: number[],
    topK: number = 5,
    threshold: number = 0.5 // Lowered from 0.7 for better recall
  ): Promise<SearchResult[]> {
    await this.init();
    
    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CHUNKS_STORE], 'readonly');
      const store = transaction.objectStore(CHUNKS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const chunks = request.result as EmbeddingChunk[];
        
        // Calculate similarity scores
        const scores = chunks.map(chunk => ({
          snippet_id: chunk.snippet_id,
          chunk_id: chunk.id,
          chunk_text: chunk.chunk_text,
          chunk_index: chunk.chunk_index,
          score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
        }));

        // Filter by threshold and sort by score descending
        const filtered = scores
          .filter(s => s.score >= threshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        resolve(filtered);
      };

      request.onerror = () => {
        console.error('Error performing vector search:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all chunks (for backup/sync purposes)
   */
  async getAllChunks(): Promise<EmbeddingChunk[]> {
    await this.init();
    
    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CHUNKS_STORE], 'readonly');
      const store = transaction.objectStore(CHUNKS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as EmbeddingChunk[]);
      };

      request.onerror = () => {
        console.error('Error getting all chunks:', request.error);
        reject(request.error);
      };
    });
  }
}

// Export singleton instance
export const ragDB = new RAGDatabase();

// Export types
export type { EmbeddingChunk, ChunkMetadata, QueryCache, SearchResult };