# Plan: Aggressive Caching

**Date**: 2025-10-28  
**Status**: 📋 PLANNING  
**Priority**: MEDIUM (Performance optimization)  
**Estimated Implementation Time**: 2-3 weeks

## Executive Summary

This plan outlines the implementation of aggressive caching for LLM responses, search results, and tool outputs to reduce API costs, improve response times, and enable offline functionality. The caching system will use **IndexedDB for client-side storage** with a 4-hour TTL, message hashing for cache keys, and intelligent invalidation strategies. All caching happens in the browser - no server-side storage (DynamoDB, Redis) required.

## Current State Analysis

### Existing Caching

**RAG Embeddings** (`src/utils/rag-cache.js`):
- Caches embeddings in IndexedDB (client-side)
- Reduces embedding API calls
- ~90% cache hit rate

**Limitations**:
- ❌ No caching of LLM chat responses
- ❌ No caching of web search results
- ❌ No caching of tool execution outputs
- ❌ Repeated identical queries cost full API price
- ❌ No offline mode for previously-seen queries

### Cost Analysis (Without Caching)

**Example Usage** (100 users, 10 queries/user/day):
- Daily queries: 1,000
- Avg tokens per query: 2,000 (500 input + 1,500 output)
- Groq cost: $0.59/1M input + $0.79/1M output
- Daily cost: (1000 × 500 × $0.59/1M) + (1000 × 1500 × $0.79/1M) = $1.48/day
- **Monthly cost without caching**: ~$44

**With 50% cache hit rate**:
- Cached queries: 500/day (no API cost)
- Uncached queries: 500/day
- **Monthly cost with caching**: ~$22 (50% savings)

## Requirements

### Functional Requirements

1. **LLM Response Caching**:
   - Cache full chat completions
   - Key by conversation context + user message hash
   - Store: message content, tool calls, usage metadata
   - Support streaming (cache after complete)

2. **Search Results Caching**:
   - Cache DuckDuckGo search results
   - Key by search query + filters
   - TTL: 4 hours (web content changes)
   - Store: URLs, snippets, timestamps

3. **Tool Output Caching**:
   - Cache JavaScript execution results
   - Cache transcription results (by audio hash)
   - Cache image descriptions (by image hash)
   - Key by tool name + parameters hash

4. **Cache Management**:
   - Automatic expiration (TTL-based)
   - Manual clear button in UI
   - Storage limit: 100MB (auto-evict LRU)
   - Version-based invalidation (on app update)

### Non-Functional Requirements

1. **Performance**:
   - Cache lookup < 50ms
   - No blocking on cache writes
   - Background cache cleanup

2. **Storage**:
   - IndexedDB (5GB+ limit in modern browsers)
   - Fallback to in-memory cache if IndexedDB unavailable
   - Compression for large responses (gzip)

3. **Privacy**:
   - No caching of sensitive data (configurable)
   - User control over caching (enable/disable)
   - Clear cache on logout

4. **Reliability**:
   - Cache misses don't break functionality
   - Graceful degradation if cache is full
   - Error handling for corrupted cache entries

## Cache-Aside Pattern

### Architecture

```
User Query
    ↓
1. Generate cache key (hash of context + message)
    ↓
2. Check IndexedDB cache
    ↓
   ┌─────────────┐
   │ Cache Hit?  │
   └─────┬───────┘
         │
    ┌────┴────┐
    │   Yes   │ Return cached response (< 50ms)
    └─────────┘
         │
    ┌────┴────┐
    │    No   │ Call LLM API
    └────┬────┘
         │
         ├─> Store in cache (async, don't block)
         └─> Return fresh response
```

### Implementation

```typescript
// ui-new/src/utils/cache.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { createHash } from 'crypto';

interface CacheSchema extends DBSchema {
  llm_responses: {
    key: string; // SHA-256 hash
    value: {
      messageHash: string;
      response: {
        role: string;
        content: string;
        tool_calls?: any[];
      };
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      timestamp: number;
      ttl: number; // milliseconds
      version: string; // app version
    };
  };
  search_results: {
    key: string;
    value: {
      query: string;
      results: any[];
      timestamp: number;
      ttl: number;
    };
  };
  tool_outputs: {
    key: string;
    value: {
      tool: string;
      params: any;
      output: any;
      timestamp: number;
      ttl: number;
    };
  };
}

export class AggressiveCache {
  private db: IDBPDatabase<CacheSchema> | null = null;
  private readonly version = '1.0.0'; // App version
  private readonly defaultTTL = 4 * 60 * 60 * 1000; // 4 hours
  private readonly maxStorageBytes = 100 * 1024 * 1024; // 100MB

  async init() {
    try {
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
            const toolStore = db.createObjectStore('tool_outputs');
            toolStore.createIndex('timestamp', 'timestamp');
          }
        },
      });

      // Cleanup expired entries on init
      await this.cleanup();
    } catch (error) {
      console.error('Failed to initialize IndexedDB cache:', error);
      // Fallback to in-memory cache (not implemented here)
    }
  }

  /**
   * Generate cache key from conversation context + message
   */
  private hashMessages(messages: any[]): string {
    const json = JSON.stringify(messages);
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Get cached LLM response
   */
  async getLLMResponse(messages: any[]): Promise<any | null> {
    if (!this.db) return null;

    const hash = this.hashMessages(messages);
    const cached = await this.db.get('llm_responses', hash);

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > cached.ttl) {
      await this.db.delete('llm_responses', hash);
      return null;
    }

    // Check version mismatch (invalidate on app update)
    if (cached.version !== this.version) {
      await this.db.delete('llm_responses', hash);
      return null;
    }

    console.log('✅ Cache hit for LLM response');
    return cached.response;
  }

  /**
   * Store LLM response in cache
   */
  async setLLMResponse(messages: any[], response: any, usage: any): Promise<void> {
    if (!this.db) return;

    const hash = this.hashMessages(messages);

    await this.db.put('llm_responses', {
      messageHash: hash,
      response,
      usage,
      timestamp: Date.now(),
      ttl: this.defaultTTL,
      version: this.version,
    });

    console.log('💾 Cached LLM response');

    // Check storage limit
    await this.enforceStorageLimit();
  }

  /**
   * Get cached search results
   */
  async getSearchResults(query: string): Promise<any[] | null> {
    if (!this.db) return null;

    const cached = await this.db.get('search_results', query);

    if (!cached) return null;

    if (Date.now() - cached.timestamp > cached.ttl) {
      await this.db.delete('search_results', query);
      return null;
    }

    console.log('✅ Cache hit for search results');
    return cached.results;
  }

  /**
   * Store search results in cache
   */
  async setSearchResults(query: string, results: any[]): Promise<void> {
    if (!this.db) return;

    await this.db.put('search_results', {
      query,
      results,
      timestamp: Date.now(),
      ttl: this.defaultTTL,
    });

    console.log('💾 Cached search results');
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<void> {
    if (!this.db) return;

    const now = Date.now();
    const stores: Array<keyof CacheSchema> = ['llm_responses', 'search_results', 'tool_outputs'];

    for (const storeName of stores) {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const index = store.index('timestamp');

      let cursor = await index.openCursor();
      while (cursor) {
        const entry = cursor.value as any;
        if (now - entry.timestamp > entry.ttl) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }
    }

    console.log('🧹 Cleaned up expired cache entries');
  }

  /**
   * Enforce storage limit (LRU eviction)
   */
  async enforceStorageLimit(): Promise<void> {
    if (!this.db) return;

    // Estimate storage size (rough approximation)
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;

    if (usage > this.maxStorageBytes) {
      console.warn('⚠️ Cache storage limit exceeded, evicting oldest entries');

      // Evict oldest 10% of entries
      const stores: Array<keyof CacheSchema> = ['llm_responses', 'search_results', 'tool_outputs'];

      for (const storeName of stores) {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const index = store.index('timestamp');

        const allEntries = await index.getAll();
        const sortedEntries = allEntries.sort((a: any, b: any) => a.timestamp - b.timestamp);
        const toDelete = Math.ceil(sortedEntries.length * 0.1);

        for (let i = 0; i < toDelete; i++) {
          await store.delete((sortedEntries[i] as any).messageHash || (sortedEntries[i] as any).query);
        }
      }
    }
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    if (!this.db) return;

    const stores: Array<keyof CacheSchema> = ['llm_responses', 'search_results', 'tool_outputs'];
    for (const storeName of stores) {
      await this.db.clear(storeName);
    }

    console.log('🗑️ Cleared all cache');
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    llmCount: number;
    searchCount: number;
    toolCount: number;
    totalBytes: number;
  }> {
    if (!this.db) {
      return { llmCount: 0, searchCount: 0, toolCount: 0, totalBytes: 0 };
    }

    const llmCount = await this.db.count('llm_responses');
    const searchCount = await this.db.count('search_results');
    const toolCount = await this.db.count('tool_outputs');

    const estimate = await navigator.storage.estimate();
    const totalBytes = estimate.usage || 0;

    return { llmCount, searchCount, toolCount, totalBytes };
  }
}

// Singleton instance
export const cache = new AggressiveCache();
```

## Integration with Chat Endpoint

### Modified Chat Flow

```typescript
// ui-new/src/utils/api.ts
import { cache } from './cache';

export async function streamChat(messages: any[], tools: any[]) {
  // Check cache first
  const cachedResponse = await cache.getLLMResponse(messages);
  
  if (cachedResponse) {
    // Return cached response (simulate streaming)
    return simulateStreamingFromCache(cachedResponse);
  }

  // Cache miss - call API
  let fullResponse = '';
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, tools, stream: true }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        
        if (data.event === 'delta') {
          fullResponse += data.delta;
          yield data; // Stream to UI
        } else if (data.event === 'message_complete') {
          usage = data.usage || usage;
        }
      }
    }
  }

  // Cache the complete response (async, don't block)
  cache.setLLMResponse(messages, { role: 'assistant', content: fullResponse }, usage);

  return fullResponse;
}

function* simulateStreamingFromCache(cachedResponse: any) {
  // Simulate streaming by yielding cached content in chunks
  const content = cachedResponse.content;
  const chunkSize = 20; // characters per chunk

  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    yield { event: 'delta', delta: chunk };
  }

  yield { event: 'message_complete', usage: { cached: true } };
}
```

## UI Controls

### Settings Panel

Add cache controls to `SettingsModal.tsx`:

```tsx
// ui-new/src/components/SettingsModal.tsx
import { cache } from '../utils/cache';

function CacheSettings() {
  const [stats, setStats] = useState({ llmCount: 0, searchCount: 0, totalBytes: 0 });
  const [cacheEnabled, setCacheEnabled] = useState(true);

  useEffect(() => {
    cache.getStats().then(setStats);
  }, []);

  async function handleClearCache() {
    await cache.clearAll();
    setStats({ llmCount: 0, searchCount: 0, totalBytes: 0 });
    toast.success('Cache cleared successfully');
  }

  return (
    <div className="cache-settings">
      <h3>Cache Settings</h3>
      
      <div className="toggle">
        <label>
          <input
            type="checkbox"
            checked={cacheEnabled}
            onChange={(e) => setCacheEnabled(e.target.checked)}
          />
          Enable response caching
        </label>
        <p className="hint">Cache LLM responses to reduce costs and improve speed</p>
      </div>

      <div className="stats">
        <h4>Cache Statistics</h4>
        <ul>
          <li>Cached responses: {stats.llmCount}</li>
          <li>Cached searches: {stats.searchCount}</li>
          <li>Storage used: {(stats.totalBytes / 1024 / 1024).toFixed(2)} MB</li>
        </ul>
      </div>

      <button onClick={handleClearCache} className="btn-danger">
        Clear All Cache
      </button>
    </div>
  );
}
```

### Cache Indicator

Show cache hit indicator in chat messages:

```tsx
// ui-new/src/components/ChatTab.tsx
{message.usage?.cached && (
  <div className="cache-indicator">
    <span className="badge">⚡ Cached</span>
    <span className="hint">This response was served from cache (instant, no cost)</span>
  </div>
)}
```

## Cache Invalidation Strategies

### 1. TTL-Based Expiration

**Default TTL**: 4 hours

**Rationale**:
- Web content changes frequently
- LLM responses may become outdated
- Balance between cost savings and freshness

**Configurable per cache type**:
```typescript
const TTLs = {
  llm_responses: 4 * 60 * 60 * 1000,     // 4 hours
  search_results: 1 * 60 * 60 * 1000,    // 1 hour (more volatile)
  tool_outputs: 24 * 60 * 60 * 1000,     // 24 hours (stable)
};
```

### 2. Version-Based Invalidation

**Trigger**: App version change (e.g., 1.0.0 → 1.1.0)

**Implementation**:
- Store app version with each cache entry
- On app load, check version mismatch
- Clear cache if version changed

```typescript
const APP_VERSION = '1.1.0'; // Increment on breaking changes

if (cached.version !== APP_VERSION) {
  await cache.clearAll();
  localStorage.setItem('cache_version', APP_VERSION);
}
```

### 3. Manual Invalidation

**User-initiated**:
- "Clear Cache" button in settings
- Logout clears cache (privacy)
- Force refresh (Ctrl+Shift+R)

**Developer-initiated**:
```typescript
// Clear specific query
await cache.clearLLMResponse(messages);

// Clear all search results
await cache.db.clear('search_results');
```

### 4. Storage Limit Eviction (LRU)

**Trigger**: Storage exceeds 100MB

**Strategy**:
- Sort entries by timestamp (oldest first)
- Delete oldest 10% of entries
- Repeat until under limit

## Privacy Considerations

### Don't Cache Sensitive Data

**Blacklist keywords** in messages:
```typescript
const SENSITIVE_PATTERNS = [
  /password/i,
  /credit card/i,
  /ssn/i,
  /api[_\s]?key/i,
  /secret/i,
  /private[_\s]?key/i,
];

function containsSensitiveData(message: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
}

async function setLLMResponse(messages: any[], response: any) {
  // Skip caching if sensitive data detected
  if (messages.some(m => containsSensitiveData(m.content))) {
    console.warn('⚠️ Skipping cache for sensitive data');
    return;
  }

  // ... proceed with caching
}
```

### User Control

**Settings**:
- Toggle to disable caching entirely
- Clear cache on logout
- Cache statistics (transparency)

**Privacy Policy Update**:
> We cache LLM responses locally in your browser to improve performance and reduce costs. Cached data is stored in IndexedDB and never sent to our servers. You can clear the cache at any time from Settings.

## Implementation Plan

### Phase 1: Core Caching (Week 1)

**Deliverables**:
- [ ] IndexedDB setup with idb library
- [ ] AggressiveCache class (get/set methods)
- [ ] Message hashing for cache keys
- [ ] TTL-based expiration
- [ ] LLM response caching integration

**Testing**:
- Cache hit/miss works correctly
- TTL expiration triggers
- Storage limit eviction works

### Phase 2: Search & Tools (Week 2)

**Deliverables**:
- [ ] Search results caching
- [ ] Tool outputs caching
- [ ] Sensitive data detection
- [ ] User control toggle

**Testing**:
- Search cache hit rate > 30%
- Sensitive data not cached
- Toggle disables caching

### Phase 3: UI & Monitoring (Week 3)

**Deliverables**:
- [ ] Cache settings panel
- [ ] Cache statistics display
- [ ] Cache hit indicator in messages
- [ ] Clear cache button
- [ ] Version-based invalidation

**Testing**:
- UI shows accurate stats
- Clear cache works
- Version change clears cache

## Success Metrics

### Cost Savings
- **Target**: 50% reduction in LLM API costs
- **Metric**: Cached tokens / total tokens

### Performance
- **Target**: P95 response time < 100ms for cache hits
- **Metric**: Time from query to first token

### Cache Hit Rate
- **Target**: 40% cache hit rate
- **Metric**: Cache hits / total queries

### Storage Efficiency
- **Target**: < 50MB average storage per user
- **Metric**: IndexedDB storage usage

## Future Enhancements

### Phase 4: Advanced Caching
- [ ] Semantic caching (similar queries, not just exact matches)
- [ ] Distributed cache (Redis for server-side)
- [ ] Prefetching (anticipate next query)
- [ ] Compression (gzip cached responses)
- [ ] Cache warming (preload common queries)

### Phase 5: Analytics
- [ ] Cache hit rate dashboard
- [ ] Cost savings calculator
- [ ] Most cached queries report
- [ ] Cache performance monitoring

---

**Status**: Ready for implementation  
**Next Step**: Install idb library and create AggressiveCache class  
**Estimated Launch**: 2-3 weeks from start
