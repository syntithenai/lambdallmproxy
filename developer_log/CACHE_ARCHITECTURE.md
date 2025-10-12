# Lambda /tmp Cache System Architecture

## Overview

This document defines the architecture for a file-based caching system using AWS Lambda's `/tmp` directory to cache expensive external API calls for search results, audio transcriptions, and web scrapes.

**Version**: 1.0  
**Date**: 2025-10-12  
**Status**: Design Phase

---

## 1. Goals and Requirements

### Primary Goals
1. **Reduce API Costs**: Cache expensive API calls (search, transcription, scrape)
2. **Improve Response Time**: Serve cached results in <10ms vs seconds for API calls
3. **Respect Lambda Limits**: Stay within 512 MB /tmp default (configurable to 10 GB)
4. **Handle Ephemeral Storage**: Cache survives across invocations on same instance
5. **Graceful Degradation**: System works normally if cache unavailable

### Non-Goals
- Distributed cache across Lambda instances (each instance has isolated /tmp)
- Persistent storage beyond Lambda instance lifetime
- Cross-region cache replication

### Success Metrics
- **Cache Hit Rate**: >50% for search queries
- **Cost Reduction**: 30-50% reduction in search/scrape API costs
- **Latency Improvement**: <10ms cache reads vs 500-2000ms API calls
- **Storage Efficiency**: <80% of /tmp capacity used

---

## 2. Lambda /tmp Storage Characteristics

### Key Properties

| Property | Value | Impact |
|----------|-------|--------|
| **Default Size** | 512 MB | Must stay below 410 MB (80% threshold) |
| **Max Size** | 10 GB (configurable) | Can increase if needed |
| **Lifetime** | Lambda instance duration | Cleared on cold start |
| **Isolation** | Per-instance | No sharing between instances |
| **Performance** | Local filesystem | Very fast (<1ms reads) |
| **Persistence** | Ephemeral | Lost on instance termination |

### Implications

✅ **Advantages**:
- Very fast local filesystem access
- No network latency
- Free (included in Lambda pricing)
- Simple file-based operations

⚠️ **Limitations**:
- Limited capacity (512 MB default)
- No persistence guarantee
- No cross-instance sharing
- Cleared on cold starts

**Design Strategy**: Treat as opportunistic cache with graceful degradation. Never assume cache exists.

---

## 3. Directory Structure

### Root Layout

```
/tmp/
└── cache/
    ├── search/
    │   ├── {md5_hash}.json
    │   ├── {md5_hash}.meta.json
    │   └── ...
    ├── transcriptions/
    │   ├── {md5_hash}.json
    │   ├── {md5_hash}.meta.json
    │   └── ...
    └── scrapes/
        ├── {md5_hash}.html
        ├── {md5_hash}.text
        ├── {md5_hash}.meta.json
        └── ...
```

### Cache Types

| Type | Directory | Content Format | Extensions |
|------|-----------|----------------|------------|
| Search | `/tmp/cache/search/` | JSON | `.json`, `.meta.json` |
| Transcriptions | `/tmp/cache/transcriptions/` | JSON | `.json`, `.meta.json` |
| Scrapes | `/tmp/cache/scrapes/` | HTML/Text | `.html`, `.text`, `.meta.json` |

### File Naming Convention

**Format**: `{md5_hash_of_cache_key}.{extension}`

**Examples**:
- `a3d5f89e2b7c1d6e4f8a9b2c3d4e5f67.json` - Search results
- `a3d5f89e2b7c1d6e4f8a9b2c3d4e5f67.meta.json` - Metadata for search results
- `b4e6g90f3c8d2e7f5g9a0c3d4e5f6g78.html` - Scraped HTML
- `b4e6g90f3c8d2e7f5g9a0c3d4e5f6g78.text` - Extracted text from scrape

---

## 4. Cache Key Generation

### Algorithm

```javascript
// Pseudo-code
function getCacheKey(type, params) {
  // 1. Extract relevant parameters
  const keyComponents = extractKeyComponents(type, params);
  
  // 2. Normalize (lowercase, trim, sort)
  const normalized = normalize(keyComponents);
  
  // 3. Generate stable string representation
  const keyString = JSON.stringify(normalized);
  
  // 4. Hash with MD5
  const hash = md5(keyString);
  
  return hash;
}
```

### Key Components by Type

#### Search Results
```javascript
{
  type: 'search',
  query: string (lowercased, trimmed),
  service: string ('duckduckgo' | 'tavily'),
  maxResults: number,
  region: string (optional)
}
```

**Example**:
```javascript
// Input
query: "Lambda caching strategies"
service: "duckduckgo"
maxResults: 5

// Key String
'{"maxResults":5,"query":"lambda caching strategies","service":"duckduckgo","type":"search"}'

// MD5 Hash
'a3d5f89e2b7c1d6e4f8a9b2c3d4e5f67'
```

#### Transcriptions
```javascript
{
  type: 'transcriptions',
  audioHash: string (MD5 of audio file content),
  language: string (optional),
  model: string (optional)
}
```

**Example**:
```javascript
// Input
audioHash: "abc123..." (MD5 of audio bytes)
language: "en"

// Key String
'{"audioHash":"abc123...","language":"en","type":"transcriptions"}'

// MD5 Hash
'b4e6g90f3c8d2e7f5g9a0c3d4e5f6g78'
```

#### Web Scrapes
```javascript
{
  type: 'scrapes',
  url: string (normalized URL),
  method: string ('GET'),
  includeText: boolean
}
```

**URL Normalization**:
1. Convert to lowercase
2. Remove trailing slashes
3. Sort query parameters
4. Remove fragments (#)
5. Handle redirects (cache final URL)

**Example**:
```javascript
// Input
url: "https://Example.com/Page?b=2&a=1#section"

// Normalized
url: "https://example.com/page?a=1&b=2"

// Key String
'{"method":"GET","type":"scrapes","url":"https://example.com/page?a=1&b=2"}'

// MD5 Hash
'c5f7h01g4d9e3f8g6h0b1d4e5f6g7h89'
```

### Collision Handling

- **MD5 Collisions**: Statistically negligible for this use case (~10^15 cache entries needed)
- **Key Conflicts**: Prevent by including all distinguishing parameters
- **Verification**: Store original params in metadata for validation

---

## 5. Metadata Format

### Metadata File Structure

Each cached item has an associated `.meta.json` file containing:

```json
{
  "cacheKey": "a3d5f89e2b7c1d6e4f8a9b2c3d4e5f67",
  "type": "search",
  "created": 1697097600000,
  "accessed": 1697097600000,
  "ttl": 3600,
  "expiresAt": 1697101200000,
  "size": 15234,
  "contentType": "application/json",
  "params": {
    "query": "lambda caching strategies",
    "service": "duckduckgo",
    "maxResults": 5
  },
  "hitCount": 3,
  "version": "1.0"
}
```

### Field Definitions

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `cacheKey` | string | MD5 hash | Yes |
| `type` | string | Cache type (search/transcriptions/scrapes) | Yes |
| `created` | number | Unix timestamp (ms) when cached | Yes |
| `accessed` | number | Unix timestamp (ms) last access | Yes |
| `ttl` | number | Time-to-live in seconds | Yes |
| `expiresAt` | number | Unix timestamp (ms) when expires | Yes |
| `size` | number | File size in bytes | Yes |
| `contentType` | string | MIME type | Yes |
| `params` | object | Original parameters for validation | Yes |
| `hitCount` | number | Number of cache hits | Yes |
| `version` | string | Metadata schema version | Yes |

### Metadata Updates

**On Cache Write**:
- Set `created`, `accessed` to current time
- Calculate `expiresAt` = `created` + (`ttl` * 1000)
- Set `hitCount` = 0

**On Cache Read**:
- Update `accessed` to current time
- Increment `hitCount`
- Atomic write to prevent race conditions

---

## 6. TTL Strategy

### Time-to-Live by Cache Type

| Type | TTL (seconds) | TTL (human) | Rationale |
|------|---------------|-------------|-----------|
| **Search Results** | 3600 | 1 hour | Queries change frequently, search results update often |
| **Transcriptions** | 86400 | 24 hours | Audio files are stable, transcriptions don't change |
| **Web Scrapes** | 3600 | 1 hour | Web content changes frequently |

### TTL Configuration

Environment variables for tuning:

```bash
CACHE_TTL_SEARCH=3600           # Search results (1 hour)
CACHE_TTL_TRANSCRIPTIONS=86400  # Transcriptions (24 hours)
CACHE_TTL_SCRAPES=3600          # Web scrapes (1 hour)
```

### Expiration Checking

**On Read**:
```javascript
function isExpired(metadata) {
  const now = Date.now();
  return now > metadata.expiresAt;
}

// Usage
const metadata = readMetadata(cacheKey);
if (isExpired(metadata)) {
  // Delete expired entry
  deleteCache(cacheKey);
  return null; // Cache miss
}
```

**Background Cleanup** (optional):
- Run periodic sweep to delete expired entries
- Trigger: On Lambda init or every N requests
- Prevents stale data accumulation

---

## 7. Size Management

### Capacity Limits

| Metric | Default | Threshold | Action |
|--------|---------|-----------|--------|
| **Total Size** | 512 MB | 410 MB (80%) | Trigger LRU eviction |
| **File Count** | Unlimited | N/A | Limited by size |
| **Single File** | No limit | 100 MB (soft) | Log warning |

### Size Monitoring

```javascript
function getCacheStats() {
  const stats = {
    totalSize: 0,        // Total bytes used
    fileCount: 0,        // Total files
    byType: {
      search: { size: 0, count: 0 },
      transcriptions: { size: 0, count: 0 },
      scrapes: { size: 0, count: 0 }
    },
    capacity: 512 * 1024 * 1024,  // 512 MB
    threshold: 410 * 1024 * 1024,  // 410 MB (80%)
    percentUsed: 0
  };
  
  // Scan /tmp/cache and calculate
  // ...
  
  return stats;
}
```

### Eviction Strategy: LRU (Least Recently Used)

**Algorithm**:
1. Check if total size > threshold (410 MB)
2. If yes, collect all metadata files
3. Sort by `accessed` timestamp (oldest first)
4. Delete oldest entries until size < threshold
5. Log eviction events

**Implementation**:
```javascript
async function cleanupCache(type = null) {
  const stats = getCacheStats();
  
  if (stats.totalSize < stats.threshold) {
    return; // No cleanup needed
  }
  
  // Get all cache entries with metadata
  const entries = await getAllCacheEntries(type);
  
  // Sort by last accessed (oldest first)
  entries.sort((a, b) => a.accessed - b.accessed);
  
  // Calculate target size (70% to give buffer)
  const targetSize = 0.70 * stats.capacity;
  
  let currentSize = stats.totalSize;
  const deleted = [];
  
  for (const entry of entries) {
    if (currentSize <= targetSize) break;
    
    await deleteCache(entry.cacheKey, entry.type);
    currentSize -= entry.size;
    deleted.push(entry);
  }
  
  console.log(`Cache cleanup: evicted ${deleted.length} entries, freed ${stats.totalSize - currentSize} bytes`);
  
  return { deleted, freedBytes: stats.totalSize - currentSize };
}
```

### Preemptive Cleanup

**Triggers**:
1. **On Write**: Before saving new cache entry
2. **On Lambda Init**: Check size on cold start
3. **Periodic**: Every 100 requests (optional)

**Strategy**: Aim for 70% utilization after cleanup to reduce frequency

---

## 8. Atomic Operations

### Race Condition Scenarios

1. **Concurrent Reads**: Multiple requests read same cache entry
   - ✅ **Safe**: Read-only operations
   - Action: Update `accessed` time atomically

2. **Concurrent Writes**: Multiple requests try to cache same result
   - ⚠️ **Risk**: Last write wins, but not critical
   - Action: Use file locking or accept last-write-wins

3. **Read During Write**: Request reads while entry is being written
   - ⚠️ **Risk**: Partial/corrupted data read
   - Action: Write to temp file, then atomic rename

4. **Cleanup During Read**: Eviction deletes entry while being read
   - ⚠️ **Risk**: File not found error
   - Action: Catch errors, treat as cache miss

### Atomic Write Pattern

```javascript
async function saveToCache(type, cacheKey, data, ttl) {
  const tempFile = `/tmp/cache/${type}/${cacheKey}.tmp`;
  const finalFile = `/tmp/cache/${type}/${cacheKey}.json`;
  
  try {
    // 1. Write to temporary file
    await fs.promises.writeFile(tempFile, JSON.stringify(data));
    
    // 2. Write metadata
    const metadata = createMetadata(type, cacheKey, data, ttl);
    await fs.promises.writeFile(
      `/tmp/cache/${type}/${cacheKey}.meta.json`,
      JSON.stringify(metadata)
    );
    
    // 3. Atomic rename (overwrites if exists)
    await fs.promises.rename(tempFile, finalFile);
    
    return true;
  } catch (error) {
    // Cleanup temp file on error
    try {
      await fs.promises.unlink(tempFile);
    } catch (e) {
      // Ignore
    }
    throw error;
  }
}
```

### Read Error Handling

```javascript
async function getFromCache(type, cacheKey) {
  try {
    // 1. Read metadata first
    const metadataFile = `/tmp/cache/${type}/${cacheKey}.meta.json`;
    const metadata = JSON.parse(
      await fs.promises.readFile(metadataFile, 'utf8')
    );
    
    // 2. Check expiration
    if (isExpired(metadata)) {
      await deleteCache(cacheKey, type);
      return null;
    }
    
    // 3. Read data file
    const dataFile = `/tmp/cache/${type}/${cacheKey}.json`;
    const data = JSON.parse(
      await fs.promises.readFile(dataFile, 'utf8')
    );
    
    // 4. Update access time (non-blocking)
    updateAccessTime(type, cacheKey).catch(err => {
      console.warn('Failed to update access time:', err);
    });
    
    return data;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File not found - cache miss
      return null;
    }
    // Other errors - log but don't throw
    console.warn('Cache read error:', error);
    return null;
  }
}
```

---

## 9. Cache Statistics and Monitoring

### Metrics to Track

| Metric | Type | Description | CloudWatch? |
|--------|------|-------------|-------------|
| **Hit Rate** | Percentage | `hits / (hits + misses)` | Yes |
| **Miss Rate** | Percentage | `misses / (hits + misses)` | Yes |
| **Total Requests** | Counter | Total cache lookups | Yes |
| **Cache Size** | Gauge | Total bytes used | Yes |
| **File Count** | Gauge | Total cached files | Yes |
| **Eviction Count** | Counter | LRU evictions triggered | Yes |
| **Write Errors** | Counter | Failed cache writes | Yes |
| **Read Errors** | Counter | Failed cache reads | Yes |
| **Avg Read Time** | Histogram | Cache read latency | Optional |
| **Avg Write Time** | Histogram | Cache write latency | Optional |

### Statistics Storage

Store in-memory counters (reset on cold start):

```javascript
const cacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  evictions: 0,
  readErrors: 0,
  writeErrors: 0,
  startTime: Date.now(),
  
  // Calculated properties
  get hitRate() {
    const total = this.hits + this.misses;
    return total > 0 ? (this.hits / total) * 100 : 0;
  },
  
  get missRate() {
    const total = this.hits + this.misses;
    return total > 0 ? (this.misses / total) * 100 : 0;
  }
};
```

### CloudWatch Integration

```javascript
// Log cache metrics to CloudWatch
function logCacheMetrics() {
  const stats = getCacheStats();
  
  console.log(JSON.stringify({
    metric: 'CacheMetrics',
    hitRate: cacheStats.hitRate,
    missRate: cacheStats.missRate,
    totalSize: stats.totalSize,
    fileCount: stats.fileCount,
    percentUsed: stats.percentUsed,
    evictions: cacheStats.evictions
  }));
}

// Call periodically or on request
```

### Admin Endpoint: `/cache-stats`

```javascript
// GET /cache-stats
{
  "timestamp": "2025-10-12T10:30:00.000Z",
  "uptime": 3600,
  "statistics": {
    "hits": 127,
    "misses": 43,
    "hitRate": 74.7,
    "missRate": 25.3,
    "writes": 43,
    "evictions": 2,
    "readErrors": 0,
    "writeErrors": 0
  },
  "storage": {
    "totalSize": 387654321,
    "capacity": 536870912,
    "percentUsed": 72.2,
    "fileCount": 156,
    "threshold": 429496729,
    "byType": {
      "search": { size: 125000000, count: 89 },
      "transcriptions": { size: 250000000, count: 45 },
      "scrapes": { size: 12654321, count: 22 }
    }
  },
  "performance": {
    "avgReadTime": 2.3,
    "avgWriteTime": 5.7
  }
}
```

---

## 10. Error Handling and Graceful Degradation

### Guiding Principles

1. **Never Fail the Request**: Cache errors should not break the main flow
2. **Log Everything**: All cache errors logged to CloudWatch
3. **Fallback to API**: On cache miss or error, call original API
4. **Graceful Degradation**: System works normally without cache

### Error Scenarios

| Scenario | Handling | User Impact |
|----------|----------|-------------|
| **Cache Miss** | Call API, attempt to cache result | None (expected) |
| **Expired Entry** | Delete, call API, cache new result | None |
| **Read Error** | Log warning, call API | None |
| **Write Error** | Log warning, return API result uncached | None |
| **Full Cache** | Trigger cleanup, retry write | None |
| **Cleanup Error** | Log error, continue without cleanup | Potential future capacity issue |
| **/tmp Unavailable** | Disable caching, log error | Increased latency/cost |

### Try-Catch Pattern

```javascript
async function getCachedOrFetch(type, params, fetchFunction) {
  let cacheKey;
  
  try {
    // Try cache
    cacheKey = getCacheKey(type, params);
    const cached = await getFromCache(type, cacheKey);
    
    if (cached) {
      cacheStats.hits++;
      console.log(`Cache HIT: ${type}/${cacheKey}`);
      return { ...cached, _cached: true };
    }
  } catch (error) {
    // Cache read error - log and continue
    console.warn(`Cache read error for ${type}:`, error);
    cacheStats.readErrors++;
  }
  
  // Cache miss or error - fetch from API
  cacheStats.misses++;
  console.log(`Cache MISS: ${type}/${cacheKey}`);
  
  const result = await fetchFunction(params);
  
  // Try to cache result (non-blocking)
  if (cacheKey) {
    saveToCache(type, cacheKey, result, getTTL(type))
      .then(() => {
        cacheStats.writes++;
        console.log(`Cache WRITE: ${type}/${cacheKey}`);
      })
      .catch(error => {
        console.warn(`Cache write error for ${type}:`, error);
        cacheStats.writeErrors++;
      });
  }
  
  return result;
}
```

---

## 11. Implementation Checklist

### Phase 1: Core Utilities (Task 5)
- [ ] Create `/tmp/cache` directory structure
- [ ] Implement `getCacheKey()` with MD5 hashing
- [ ] Implement `getFromCache()` with TTL checking
- [ ] Implement `saveToCache()` with atomic writes
- [ ] Implement `deleteCache()` for cleanup
- [ ] Implement `getCacheStats()` for monitoring
- [ ] Implement `cleanupCache()` with LRU eviction
- [ ] Add error handling and logging

### Phase 2: Integration (Tasks 6-8)
- [ ] Integrate cache into search endpoint
- [ ] Integrate cache into transcription endpoint
- [ ] Integrate cache into scrape endpoint
- [ ] Add cache hit/miss logging
- [ ] Test each integration

### Phase 3: Monitoring (Task 9)
- [ ] Create `/cache-stats` endpoint
- [ ] Add CloudWatch metrics logging
- [ ] Add cache statistics to health check
- [ ] Create dashboard/alerts (optional)

### Phase 4: Testing (Task 10)
- [ ] Test concurrent reads
- [ ] Test cache expiration
- [ ] Test LRU eviction
- [ ] Test size limit enforcement
- [ ] Measure performance impact
- [ ] Load testing

---

## 12. Performance Expectations

### Latency Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Cache Hit (read) | <10ms | Local filesystem read |
| Cache Miss + API | 500-2000ms | API call + cache write |
| Cache Write | <20ms | Async, non-blocking |
| Cleanup/Eviction | <100ms | LRU sort + delete |

### Cache Hit Rate Goals

| Cache Type | Target Hit Rate | Conservative | Optimistic |
|------------|-----------------|--------------|------------|
| Search | 50-70% | 30% | 80% |
| Transcriptions | 70-90% | 50% | 95% |
| Scrapes | 40-60% | 20% | 70% |

### Cost Savings Estimate

Assuming:
- 1000 search requests/day
- Average search cost: $0.001/request
- 50% cache hit rate

**Daily Savings**: 500 hits × $0.001 = **$0.50/day**  
**Monthly Savings**: **$15/month**  
**Annual Savings**: **$180/year**

Plus:
- Reduced latency (better UX)
- Reduced API rate limit risk
- Reduced network errors

---

## 13. Future Enhancements

### Potential Improvements

1. **Redis Integration** (if budget allows):
   - Distributed cache across Lambda instances
   - Persistence beyond instance lifetime
   - Higher capacity limits

2. **S3 Tiered Cache**:
   - /tmp for hot data (<1 hour old)
   - S3 for warm data (1-24 hours old)
   - Slower but persistent

3. **Compression**:
   - gzip cache files to save space
   - Trade CPU for storage

4. **Intelligent TTL**:
   - Adaptive TTL based on change frequency
   - Extend TTL for stable content

5. **Cache Prewarming**:
   - Predictive caching for common queries
   - Background refresh before expiration

6. **Distributed Lock**:
   - DynamoDB conditional writes
   - Prevent thundering herd on cache miss

---

## 14. References

### AWS Lambda Documentation
- [Lambda /tmp storage](https://docs.aws.amazon.com/lambda/latest/dg/configuration-function-common.html#configuration-ephemeral-storage)
- [Lambda execution context](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-context.html)

### Caching Patterns
- [Cache-aside pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
- [LRU eviction algorithm](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU))

### File System Operations
- [Node.js fs.promises API](https://nodejs.org/api/fs.html#promises-api)
- [Atomic file operations](https://nodejs.org/api/fs.html#fspromisesrenamepath-newpath)

---

## Conclusion

This architecture provides a robust, efficient caching layer for the Lambda function using local /tmp storage. Key design principles:

1. ✅ **Simplicity**: File-based cache, no external dependencies
2. ✅ **Performance**: <10ms reads, async writes
3. ✅ **Safety**: Graceful degradation, never fails requests
4. ✅ **Efficiency**: LRU eviction, TTL expiration
5. ✅ **Observability**: Comprehensive metrics and logging

**Next Steps**: Proceed to Task 5 (Implementation) to build `src/utils/cache.js` based on this design.

