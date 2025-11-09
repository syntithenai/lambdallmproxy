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
   * Delete and recreate the database (for debugging/fixing corruption)
   */
  async resetDatabase(): Promise<void> {
    console.log('🗑️ Deleting and recreating RAG database...');
    
    // Close existing connection
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initPromise = null;
    
    // Delete the database
    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(RAG_DB_NAME);
      
      deleteRequest.onsuccess = () => {
        console.log('✅ Database deleted successfully');
        resolve();
      };
      
      deleteRequest.onerror = () => {
        console.error('❌ Failed to delete database:', deleteRequest.error);
        reject(deleteRequest.error);
      };
      
      deleteRequest.onblocked = () => {
        console.warn('⚠️ Database deletion blocked - close all tabs using this database');
      };
    });
    
    // Reinitialize
    await this.init();
    console.log('✅ Database recreated successfully');
  }

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

    return new Promise((resolve) => {
      try {
        // Check if database connection is still valid before creating transaction
        if (!this.db || this.db.name === undefined) {
          resolve({ hasEmbedding: false, chunkCount: 0, chunks: [] });
          return;
        }

        const transaction = this.db!.transaction([CHUNKS_STORE, METADATA_STORE], 'readonly');
        
        // Handle transaction errors
        transaction.onerror = () => {
          console.warn('Transaction error in getEmbeddingDetails:', transaction.error);
          resolve({ hasEmbedding: false, chunkCount: 0, chunks: [] });
        };
        
        transaction.onabort = () => {
          console.warn('Transaction aborted in getEmbeddingDetails');
          resolve({ hasEmbedding: false, chunkCount: 0, chunks: [] });
        };
        
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
      } catch (error) {
        // Catch any synchronous errors (like InvalidStateError when DB is closing)
        console.warn('Error in getEmbeddingDetails:', error);
        resolve({ hasEmbedding: false, chunkCount: 0, chunks: [] });
      }
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
      
      // Debug: Check the store's keyPath
      console.log('🔍 IndexedDB Store Info:', {
        storeName: chunksStore.name,
        keyPath: chunksStore.keyPath,
        autoIncrement: chunksStore.autoIncrement,
        indexNames: Array.from(chunksStore.indexNames)
      });
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          // Generate ID if missing (backend doesn't always provide it)
          // Use snippet_id + chunk_index for deterministic IDs
          const snippetId = chunk.snippet_id || metadata?.snippet_id || 'unknown';
          const chunkIndex = chunk.chunk_index ?? i;
          const chunkId = chunk.id || `${snippetId}_chunk_${chunkIndex}`;
          
          // Ensure we have a valid ID
          if (!chunkId || chunkId === 'undefined_chunk_0' || chunkId === '_chunk_0') {
            console.error('❌ Invalid chunk ID generated:', {
              chunkId,
              snippetId,
              chunkIndex,
              chunk
            });
            throw new Error(`Invalid chunk ID: ${chunkId}`);
          }
          
          // Ensure embedding is a plain array, not Float32Array or other typed array
          const embeddingArray = Array.isArray(chunk.embedding) 
            ? [...chunk.embedding] // Create a new copy
            : Array.from(chunk.embedding || []);
          
          // Create a completely plain object without TypeScript typing interference
          const normalizedChunk = {
            id: chunkId,
            snippet_id: snippetId,
            chunk_text: chunk.chunk_text || '',
            embedding: embeddingArray,
            chunk_index: chunkIndex,
            embedding_model: chunk.embedding_model || 'text-embedding-3-small',
            created_at: chunk.created_at || new Date().toISOString()
          };
          
          // Verify the object structure before saving
          if (!normalizedChunk.id) {
            throw new Error(`Chunk missing id property after normalization: ${JSON.stringify(Object.keys(normalizedChunk))}`);
          }
          
          // Verify id is accessible via property access
          const testId = normalizedChunk['id'];
          if (!testId) {
            throw new Error(`Cannot access id property via bracket notation: ${testId}`);
          }
          
          // Verify the object is truly plain
          const proto = Object.getPrototypeOf(normalizedChunk);
          if (proto !== Object.prototype) {
            throw new Error(`Chunk has non-plain prototype: ${proto?.constructor?.name}`);
          }
          
          console.log('🔍 Putting chunk:', {
            id: normalizedChunk.id,
            snippetId: normalizedChunk.snippet_id,
            chunkIndex: normalizedChunk.chunk_index,
            embeddingLength: normalizedChunk.embedding.length,
            embeddingType: normalizedChunk.embedding.constructor.name,
            allKeys: Object.keys(normalizedChunk),
            idDescriptor: Object.getOwnPropertyDescriptor(normalizedChunk, 'id'),
            objectType: typeof normalizedChunk,
            prototypeChainDepth: (() => {
              let depth = 0;
              let p = normalizedChunk;
              while (p && depth < 10) {
                p = Object.getPrototypeOf(p);
                depth++;
              }
              return depth;
            })()
          });
          
          // Try serializing and deserializing to ensure it's truly plain
          const serializedTest = JSON.stringify(normalizedChunk);
          const deserializedTest = JSON.parse(serializedTest);
          
          if (!deserializedTest.id) {
            throw new Error(`Chunk id lost during JSON serialization! Original: ${normalizedChunk.id}`);
          }
          
          console.log('✅ Chunk survived JSON round-trip with id:', deserializedTest.id);
          
          // Await the put operation properly - use the deserialized version
          await new Promise<void>((resolve, reject) => {
            const putRequest = chunksStore.put(deserializedTest);
            
            putRequest.onsuccess = () => {
              resolve();
            };
            
            putRequest.onerror = () => {
              console.error('❌ PUT request failed:', {
                chunk: normalizedChunk,
                error: putRequest.error,
                errorName: putRequest.error?.name,
                errorMessage: putRequest.error?.message,
                chunkKeys: Object.keys(normalizedChunk),
                hasIdProperty: 'id' in normalizedChunk,
                idValue: normalizedChunk.id
              });
              reject(putRequest.error);
            };
          });
          
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

        // Sort all scores to see what we have
        const sortedScores = [...scores].sort((a, b) => b.score - a.score);
        
        // Log top scores for debugging
        console.log(`🎯 Vector search - Top 10 scores (threshold: ${threshold}):`, 
          sortedScores.slice(0, 10).map(s => ({
            score: s.score.toFixed(4),
            snippet_id: s.snippet_id,
            chunk_preview: s.chunk_text.substring(0, 100) + '...'
          }))
        );

        // Filter by threshold and sort by score descending
        const filtered = scores
          .filter(s => s.score >= threshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        console.log(`✅ Returning ${filtered.length} results above threshold ${threshold}`);
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