/**
 * Aggressive Caching Service
 * 
 * Implements client-side caching for:
 * - LLM chat responses
 * - Web search results
 * - Tool execution outputs
 * 
 * Storage: IndexedDB (5GB+ limit)
 * Pattern: Cache-aside with TTL-based expiration
 * Eviction: LRU (Least Recently Used) when storage limit reached
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

interface CacheSchema extends DBSchema {
  llm_responses: {
    key: string; // SHA-256 hash
    value: {
      messageHash: string;
      messages: any[]; // Original messages for debugging
      response: {
        role: string;
        content: string;
        tool_calls?: any[];
      };
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model?: string;
      timestamp: number;
      ttl: number; // milliseconds
      version: string; // app version
    };
    indexes: { timestamp: number };
  };
  search_results: {
    key: string; // query string
    value: {
      query: string;
      results: any[];
      timestamp: number;
      ttl: number;
    };
    indexes: { timestamp: number };
  };
  tool_outputs: {
    key: string; // tool name + params hash
    value: {
      tool: string;
      paramsHash: string;
      output: any;
      timestamp: number;
      ttl: number;
    };
    indexes: { timestamp: number };
  };
}

interface CacheStats {
  llmResponses: number;
  searchResults: number;
  toolOutputs: number;
  storageUsage: number;
  storageQuota: number;
  enabled: boolean;
}

class AggressiveCache {
  private db: IDBPDatabase<CacheSchema> | null = null;
  private readonly version = '1.0.0'; // App version
  private readonly defaultTTL = 4 * 60 * 60 * 1000; // 4 hours
  private readonly maxStorageBytes = 100 * 1024 * 1024; // 100MB
  private enabled = true;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Initialize cache on construction (async)
    this.initPromise = this.init();
  }

  /**
   * Initialize IndexedDB
   */
  private async init(): Promise<void> {
    try {
      // Check if caching is disabled in settings
      const cachingDisabled = localStorage.getItem('caching_disabled') === 'true';
      if (cachingDisabled) {
        console.log('⚠️ Caching disabled by user preference');
        this.enabled = false;
        return;
      }

      this.db = await openDB<CacheSchema>('ResearchAgentCache', 1, {
        upgrade(db) {
          // LLM responses store
          if (!db.objectStoreNames.contains('llm_responses')) {
            const llmStore = db.createObjectStore('llm_responses', { keyPath: 'messageHash' });
            llmStore.createIndex('timestamp', 'timestamp');
          }

          // Search results store
          if (!db.objectStoreNames.contains('search_results')) {
            const searchStore = db.createObjectStore('search_results', { keyPath: 'query' });
            searchStore.createIndex('timestamp', 'timestamp');
          }

          // Tool outputs store
          if (!db.objectStoreNames.contains('tool_outputs')) {
            const toolStore = db.createObjectStore('tool_outputs', { keyPath: 'paramsHash' });
            toolStore.createIndex('timestamp', 'timestamp');
          }
        },
      });

      console.log('✅ Cache initialized successfully');

      // Cleanup expired entries on init
      this.cleanup().catch(err => console.error('Cleanup failed:', err));
      
      // Periodic cleanup every hour
      setInterval(() => {
        this.cleanup().catch(err => console.error('Periodic cleanup failed:', err));
      }, 60 * 60 * 1000);

    } catch (error) {
      console.error('❌ Failed to initialize IndexedDB cache:', error);
      this.enabled = false;
    }
  }

  /**
   * Wait for initialization to complete
   */
  private async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Generate SHA-256 hash from messages array
   */
  private async hashMessages(messages: any[]): Promise<string> {
    const json = JSON.stringify(messages);
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Generate hash from object (for tool params)
   */
  private async hashObject(obj: any): Promise<string> {
    const json = JSON.stringify(obj);
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Get cached LLM response
   */
  async getLLMResponse(messages: any[]): Promise<any | null> {
    await this.waitForInit();
    
    if (!this.enabled || !this.db) return null;

    try {
      const hash = await this.hashMessages(messages);
      const cached = await this.db.get('llm_responses', hash);

      if (!cached) {
        console.log('❌ Cache miss for LLM response');
        return null;
      }

      // Check if expired
      if (Date.now() - cached.timestamp > cached.ttl) {
        console.log('⏰ Cache expired for LLM response');
        await this.db.delete('llm_responses', hash);
        return null;
      }

      // Check version mismatch (invalidate on app update)
      if (cached.version !== this.version) {
        console.log('🔄 Cache version mismatch, invalidating');
        await this.db.delete('llm_responses', hash);
        return null;
      }

      console.log('✅ Cache HIT for LLM response');
      return {
        ...cached.response,
        usage: cached.usage,
        model: cached.model,
        cached: true
      };
    } catch (error) {
      console.error('Error getting cached LLM response:', error);
      return null;
    }
  }

  /**
   * Store LLM response in cache
   */
  async setLLMResponse(messages: any[], response: any, usage?: any, model?: string): Promise<void> {
    await this.waitForInit();
    
    if (!this.enabled || !this.db) return;

    try {
      const hash = await this.hashMessages(messages);

      await this.db.put('llm_responses', {
        messageHash: hash,
        messages: messages.map(m => ({ role: m.role, content: m.content?.substring(0, 200) })), // Store truncated for debugging
        response,
        usage,
        model,
        timestamp: Date.now(),
        ttl: this.defaultTTL,
        version: this.version,
      });

      console.log('💾 Cached LLM response');

      // Check storage limit (async, don't block)
      this.enforceStorageLimit().catch(err => console.error('Storage limit enforcement failed:', err));
    } catch (error) {
      console.error('Error caching LLM response:', error);
    }
  }

  /**
   * Get cached search results
   */
  async getSearchResults(query: string): Promise<any[] | null> {
    await this.waitForInit();
    
    if (!this.enabled || !this.db) return null;

    try {
      const cached = await this.db.get('search_results', query);

      if (!cached) {
        console.log('❌ Cache miss for search results');
        return null;
      }

      if (Date.now() - cached.timestamp > cached.ttl) {
        console.log('⏰ Cache expired for search results');
        await this.db.delete('search_results', query);
        return null;
      }

      console.log('✅ Cache HIT for search results');
      return cached.results;
    } catch (error) {
      console.error('Error getting cached search results:', error);
      return null;
    }
  }

  /**
   * Store search results in cache
   */
  async setSearchResults(query: string, results: any[]): Promise<void> {
    await this.waitForInit();
    
    if (!this.enabled || !this.db) return;

    try {
      await this.db.put('search_results', {
        query,
        results,
        timestamp: Date.now(),
        ttl: this.defaultTTL,
      });

      console.log('💾 Cached search results');
    } catch (error) {
      console.error('Error caching search results:', error);
    }
  }

  /**
   * Get cached tool output
   */
  async getToolOutput(toolName: string, params: any): Promise<any | null> {
    await this.waitForInit();
    
    if (!this.enabled || !this.db) return null;

    try {
      const hash = await this.hashObject({ tool: toolName, params });
      const cached = await this.db.get('tool_outputs', hash);

      if (!cached) {
        console.log('❌ Cache miss for tool output');
        return null;
      }

      if (Date.now() - cached.timestamp > cached.ttl) {
        console.log('⏰ Cache expired for tool output');
        await this.db.delete('tool_outputs', hash);
        return null;
      }

      console.log('✅ Cache HIT for tool output');
      return cached.output;
    } catch (error) {
      console.error('Error getting cached tool output:', error);
      return null;
    }
  }

  /**
   * Store tool output in cache
   */
  async setToolOutput(toolName: string, params: any, output: any, ttl?: number): Promise<void> {
    await this.waitForInit();
    
    if (!this.enabled || !this.db) return;

    try {
      const hash = await this.hashObject({ tool: toolName, params });

      await this.db.put('tool_outputs', {
        tool: toolName,
        paramsHash: hash,
        output,
        timestamp: Date.now(),
        ttl: ttl || this.defaultTTL,
      });

      console.log('💾 Cached tool output');
    } catch (error) {
      console.error('Error caching tool output:', error);
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<void> {
    await this.waitForInit();
    
    if (!this.db) return;

    try {
      const now = Date.now();
      const stores = ['llm_responses', 'search_results', 'tool_outputs'] as const;
      let totalDeleted = 0;

      for (const storeName of stores) {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const index = store.index('timestamp');

        let cursor = await index.openCursor();
        while (cursor) {
          const entry = cursor.value as any;
          if (now - entry.timestamp > entry.ttl) {
            await cursor.delete();
            totalDeleted++;
          }
          cursor = await cursor.continue();
        }
        await tx.done;
      }

      if (totalDeleted > 0) {
        console.log(`🧹 Cleaned up ${totalDeleted} expired cache entries`);
      }
    } catch (error) {
      console.error('Error during cache cleanup:', error);
    }
  }

  /**
   * Enforce storage limit (LRU eviction)
   */
  async enforceStorageLimit(): Promise<void> {
    await this.waitForInit();
    
    if (!this.db) return;

    try {
      // Estimate storage size
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;

        if (usage > this.maxStorageBytes) {
          console.warn(`⚠️ Cache storage limit exceeded (${(usage / 1024 / 1024).toFixed(2)}MB), evicting oldest entries`);

          const stores = ['llm_responses', 'search_results', 'tool_outputs'] as const;

          for (const storeName of stores) {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const index = store.index('timestamp');

            const allKeys = await index.getAllKeys();
            const toDelete = Math.ceil(allKeys.length * 0.1); // Delete oldest 10%

            if (toDelete > 0) {
              const oldestKeys = allKeys.slice(0, toDelete);
              for (const key of oldestKeys) {
                await store.delete(key);
              }
              console.log(`🗑️ Evicted ${toDelete} entries from ${storeName}`);
            }
            await tx.done;
          }
        }
      }
    } catch (error) {
      console.error('Error enforcing storage limit:', error);
    }
  }

  /**
   * Clear all cache entries
   */
  async clearAll(): Promise<void> {
    await this.waitForInit();
    
    if (!this.db) return;

    try {
      await this.db.clear('llm_responses');
      await this.db.clear('search_results');
      await this.db.clear('tool_outputs');
      console.log('🗑️ All cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    await this.waitForInit();
    
    const stats: CacheStats = {
      llmResponses: 0,
      searchResults: 0,
      toolOutputs: 0,
      storageUsage: 0,
      storageQuota: 0,
      enabled: this.enabled
    };

    if (!this.db) return stats;

    try {
      stats.llmResponses = await this.db.count('llm_responses');
      stats.searchResults = await this.db.count('search_results');
      stats.toolOutputs = await this.db.count('tool_outputs');

      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        stats.storageUsage = estimate.usage || 0;
        stats.storageQuota = estimate.quota || 0;
      }
    } catch (error) {
      console.error('Error getting cache stats:', error);
    }

    return stats;
  }

  /**
   * Enable/disable caching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    localStorage.setItem('caching_disabled', enabled ? 'false' : 'true');
    console.log(`🔧 Caching ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Export singleton instance
export const cache = new AggressiveCache();
