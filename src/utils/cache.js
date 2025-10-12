/**
 * Lambda /tmp File-Based Cache System
 * 
 * Provides caching for expensive API calls (search, transcriptions, scrapes)
 * using Lambda's ephemeral /tmp storage with LRU eviction and TTL expiration.
 * 
 * Architecture:
 * - Cache location: /tmp/cache/{type}/
 * - File naming: {md5_hash}.{extension}
 * - Metadata: {md5_hash}.meta.json
 * - Capacity: 512 MB default (80% threshold = 410 MB)
 * - Eviction: LRU (Least Recently Used)
 * - TTL: Configurable by type
 * 
 * @module src/utils/cache
 */

const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const CACHE_CONFIG = {
  // Base directory for all cache data
  baseDir: '/tmp/cache',
  
  // Cache capacity (512 MB default Lambda /tmp)
  capacity: 512 * 1024 * 1024, // 512 MB in bytes
  
  // Eviction threshold (80% of capacity)
  threshold: 410 * 1024 * 1024, // 410 MB in bytes
  
  // Target size after cleanup (70% to provide buffer)
  targetSize: 0.70 * 512 * 1024 * 1024, // ~358 MB
  
  // TTL by cache type (seconds)
  ttl: {
    search: parseInt(process.env.CACHE_TTL_SEARCH || '3600'), // 1 hour
    transcriptions: parseInt(process.env.CACHE_TTL_TRANSCRIPTIONS || '86400'), // 24 hours
    scrapes: parseInt(process.env.CACHE_TTL_SCRAPES || '3600'), // 1 hour
  },
  
  // Cache subdirectories by type
  types: ['search', 'transcriptions', 'scrapes'],
  
  // File extensions by type
  extensions: {
    search: 'json',
    transcriptions: 'json',
    scrapes: 'html', // Can be 'html' or 'text'
  },
  
  // Metadata schema version
  metadataVersion: '1.0',
};

// ============================================================================
// Statistics Tracking
// ============================================================================

const cacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  evictions: 0,
  readErrors: 0,
  writeErrors: 0,
  startTime: Date.now(),
  
  get hitRate() {
    const total = this.hits + this.misses;
    return total > 0 ? (this.hits / total) * 100 : 0;
  },
  
  get missRate() {
    const total = this.hits + this.misses;
    return total > 0 ? (this.misses / total) * 100 : 0;
  },
  
  reset() {
    this.hits = 0;
    this.misses = 0;
    this.writes = 0;
    this.evictions = 0;
    this.readErrors = 0;
    this.writeErrors = 0;
    this.startTime = Date.now();
  }
};

// ============================================================================
// Cache Initialization
// ============================================================================

/**
 * Initialize cache directory structure
 * Creates /tmp/cache and subdirectories for each cache type
 * 
 * @returns {Promise<void>}
 */
async function initializeCache() {
  try {
    // Create base directory
    await fs.mkdir(CACHE_CONFIG.baseDir, { recursive: true });
    
    // Create subdirectories for each cache type
    for (const type of CACHE_CONFIG.types) {
      const typeDir = path.join(CACHE_CONFIG.baseDir, type);
      await fs.mkdir(typeDir, { recursive: true });
    }
    
    console.log('Cache initialized:', CACHE_CONFIG.baseDir);
  } catch (error) {
    console.error('Failed to initialize cache:', error);
    throw error;
  }
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate MD5 cache key from parameters
 * 
 * @param {string} type - Cache type (search, transcriptions, scrapes)
 * @param {object} params - Parameters to hash
 * @returns {string} MD5 hash
 * 
 * @example
 * getCacheKey('search', { query: 'lambda', service: 'duckduckgo', maxResults: 5 })
 * // Returns: 'a3d5f89e2b7c1d6e4f8a9b2c3d4e5f67'
 */
function getCacheKey(type, params) {
  // Normalize parameters for consistent hashing
  const normalized = normalizeParams(type, params);
  
  // Create stable string representation
  const keyString = JSON.stringify(normalized);
  
  // Generate MD5 hash
  const hash = crypto.createHash('md5').update(keyString).digest('hex');
  
  return hash;
}

/**
 * Normalize parameters for consistent cache key generation
 * 
 * @param {string} type - Cache type
 * @param {object} params - Parameters to normalize
 * @returns {object} Normalized parameters
 * @private
 */
function normalizeParams(type, params) {
  const normalized = { type };
  
  switch (type) {
    case 'search':
      // Sort keys and normalize strings
      normalized.query = (params.query || '').toLowerCase().trim();
      normalized.service = (params.service || 'duckduckgo').toLowerCase();
      normalized.maxResults = parseInt(params.maxResults || 10);
      if (params.region) {
        normalized.region = params.region.toLowerCase();
      }
      break;
      
    case 'transcriptions':
      // Audio hash is already normalized
      normalized.audioHash = params.audioHash;
      if (params.language) {
        normalized.language = params.language.toLowerCase();
      }
      if (params.model) {
        normalized.model = params.model.toLowerCase();
      }
      break;
      
    case 'scrapes':
      // Normalize URL
      normalized.url = normalizeUrl(params.url);
      normalized.method = (params.method || 'GET').toUpperCase();
      if (params.includeText !== undefined) {
        normalized.includeText = Boolean(params.includeText);
      }
      break;
      
    default:
      // Generic normalization
      Object.keys(params).sort().forEach(key => {
        normalized[key] = params[key];
      });
  }
  
  return normalized;
}

/**
 * Normalize URL for consistent caching
 * 
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 * @private
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    
    // Convert to lowercase
    parsed.hostname = parsed.hostname.toLowerCase();
    
    // Remove trailing slash
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    
    // Sort query parameters
    const params = Array.from(parsed.searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b));
    parsed.search = '';
    params.forEach(([key, value]) => {
      parsed.searchParams.append(key, value);
    });
    
    // Remove fragment
    parsed.hash = '';
    
    return parsed.toString();
  } catch (error) {
    // Invalid URL - return as-is
    console.warn('Invalid URL for normalization:', url);
    return url;
  }
}

// ============================================================================
// Cache Read Operations
// ============================================================================

/**
 * Get cached data if available and not expired
 * 
 * @param {string} type - Cache type (search, transcriptions, scrapes)
 * @param {string} cacheKey - MD5 cache key
 * @returns {Promise<object|null>} Cached data or null if miss/expired
 * 
 * @example
 * const data = await getFromCache('search', cacheKey);
 * if (data) {
 *   console.log('Cache hit!', data);
 * } else {
 *   console.log('Cache miss - fetch from API');
 * }
 */
async function getFromCache(type, cacheKey) {
  try {
    // Validate type
    if (!CACHE_CONFIG.types.includes(type)) {
      throw new Error(`Invalid cache type: ${type}`);
    }
    
    const typeDir = path.join(CACHE_CONFIG.baseDir, type);
    const metadataFile = path.join(typeDir, `${cacheKey}.meta.json`);
    const dataFile = path.join(typeDir, `${cacheKey}.${CACHE_CONFIG.extensions[type]}`);
    
    // Read metadata first
    const metadataContent = await fs.readFile(metadataFile, 'utf8');
    const metadata = JSON.parse(metadataContent);
    
    // Check expiration
    if (isExpired(metadata)) {
      console.log(`Cache EXPIRED: ${type}/${cacheKey}`);
      // Delete expired entry asynchronously
      deleteCache(cacheKey, type).catch(err => {
        console.warn('Failed to delete expired cache entry:', err);
      });
      cacheStats.misses++;
      return null;
    }
    
    // Read data file
    const dataContent = await fs.readFile(dataFile, 'utf8');
    const data = JSON.parse(dataContent);
    
    // Update access time asynchronously (non-blocking)
    updateAccessTime(type, cacheKey, metadata).catch(err => {
      console.warn('Failed to update access time:', err);
    });
    
    cacheStats.hits++;
    console.log(`Cache HIT: ${type}/${cacheKey} (age: ${getAge(metadata)}s, hits: ${metadata.hitCount + 1})`);
    
    return data;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File not found - cache miss (expected)
      cacheStats.misses++;
      return null;
    }
    
    // Other errors - log but don't throw
    console.warn(`Cache read error for ${type}/${cacheKey}:`, error.message);
    cacheStats.readErrors++;
    return null;
  }
}

/**
 * Check if cache entry is expired
 * 
 * @param {object} metadata - Cache metadata
 * @returns {boolean} True if expired
 * @private
 */
function isExpired(metadata) {
  const now = Date.now();
  return now > metadata.expiresAt;
}

/**
 * Get age of cache entry in seconds
 * 
 * @param {object} metadata - Cache metadata
 * @returns {number} Age in seconds
 * @private
 */
function getAge(metadata) {
  const now = Date.now();
  return Math.floor((now - metadata.created) / 1000);
}

/**
 * Update access time and hit count for cache entry
 * 
 * @param {string} type - Cache type
 * @param {string} cacheKey - MD5 cache key
 * @param {object} metadata - Current metadata
 * @returns {Promise<void>}
 * @private
 */
async function updateAccessTime(type, cacheKey, metadata) {
  try {
    const typeDir = path.join(CACHE_CONFIG.baseDir, type);
    const metadataFile = path.join(typeDir, `${cacheKey}.meta.json`);
    
    // Update fields
    metadata.accessed = Date.now();
    metadata.hitCount = (metadata.hitCount || 0) + 1;
    
    // Write atomically
    const tempFile = `${metadataFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(metadata, null, 2));
    await fs.rename(tempFile, metadataFile);
    
  } catch (error) {
    // Non-critical - just log
    console.warn('Failed to update access time:', error.message);
  }
}

// ============================================================================
// Cache Write Operations
// ============================================================================

/**
 * Save data to cache with TTL and metadata
 * 
 * @param {string} type - Cache type (search, transcriptions, scrapes)
 * @param {string} cacheKey - MD5 cache key
 * @param {object} data - Data to cache
 * @param {number} [ttl] - Time-to-live in seconds (optional, uses default if not provided)
 * @returns {Promise<boolean>} True if saved successfully
 * 
 * @example
 * const success = await saveToCache('search', cacheKey, results, 3600);
 * if (success) {
 *   console.log('Cached successfully');
 * }
 */
async function saveToCache(type, cacheKey, data, ttl = null) {
  try {
    // Validate type
    if (!CACHE_CONFIG.types.includes(type)) {
      throw new Error(`Invalid cache type: ${type}`);
    }
    
    // Use default TTL if not provided
    if (!ttl) {
      ttl = CACHE_CONFIG.ttl[type];
    }
    
    const typeDir = path.join(CACHE_CONFIG.baseDir, type);
    const dataFile = path.join(typeDir, `${cacheKey}.${CACHE_CONFIG.extensions[type]}`);
    const metadataFile = path.join(typeDir, `${cacheKey}.meta.json`);
    const tempDataFile = `${dataFile}.tmp`;
    
    // Check if cleanup needed before writing
    const stats = await getCacheStats();
    if (stats.totalSize > CACHE_CONFIG.threshold) {
      console.log(`Cache size (${Math.round(stats.totalSize / 1024 / 1024)}MB) exceeds threshold, triggering cleanup...`);
      await cleanupCache();
    }
    
    // Serialize data
    const dataContent = JSON.stringify(data, null, 2);
    const dataSize = Buffer.byteLength(dataContent, 'utf8');
    
    // Create metadata
    const now = Date.now();
    const metadata = {
      cacheKey,
      type,
      created: now,
      accessed: now,
      ttl,
      expiresAt: now + (ttl * 1000),
      size: dataSize,
      contentType: 'application/json',
      params: {}, // Could be populated by caller for validation
      hitCount: 0,
      version: CACHE_CONFIG.metadataVersion,
    };
    
    // Write data file atomically (temp file + rename)
    await fs.writeFile(tempDataFile, dataContent);
    
    // Write metadata file
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    
    // Atomic rename (overwrites if exists)
    await fs.rename(tempDataFile, dataFile);
    
    cacheStats.writes++;
    console.log(`Cache WRITE: ${type}/${cacheKey} (size: ${Math.round(dataSize / 1024)}KB, ttl: ${ttl}s)`);
    
    return true;
    
  } catch (error) {
    console.error(`Cache write error for ${type}/${cacheKey}:`, error.message);
    cacheStats.writeErrors++;
    
    // Cleanup temp file if it exists
    try {
      const typeDir = path.join(CACHE_CONFIG.baseDir, type);
      const tempFile = path.join(typeDir, `${cacheKey}.${CACHE_CONFIG.extensions[type]}.tmp`);
      await fs.unlink(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    return false;
  }
}

// ============================================================================
// Cache Delete Operations
// ============================================================================

/**
 * Delete cache entry (data + metadata)
 * 
 * @param {string} cacheKey - MD5 cache key
 * @param {string} type - Cache type
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteCache(cacheKey, type) {
  try {
    const typeDir = path.join(CACHE_CONFIG.baseDir, type);
    const dataFile = path.join(typeDir, `${cacheKey}.${CACHE_CONFIG.extensions[type]}`);
    const metadataFile = path.join(typeDir, `${cacheKey}.meta.json`);
    
    // Delete both files
    await Promise.all([
      fs.unlink(dataFile).catch(() => {}), // Ignore if not exists
      fs.unlink(metadataFile).catch(() => {}),
    ]);
    
    return true;
    
  } catch (error) {
    console.warn(`Failed to delete cache entry ${type}/${cacheKey}:`, error.message);
    return false;
  }
}

// ============================================================================
// Cache Statistics
// ============================================================================

/**
 * Get cache statistics (size, file count, usage)
 * 
 * @returns {Promise<object>} Cache statistics
 * 
 * @example
 * const stats = await getCacheStats();
 * console.log(`Cache size: ${stats.totalSize} bytes`);
 * console.log(`Files: ${stats.fileCount}`);
 * console.log(`Usage: ${stats.percentUsed.toFixed(1)}%`);
 */
async function getCacheStats() {
  const stats = {
    totalSize: 0,
    fileCount: 0,
    byType: {},
    capacity: CACHE_CONFIG.capacity,
    threshold: CACHE_CONFIG.threshold,
    percentUsed: 0,
  };
  
  // Initialize type stats
  for (const type of CACHE_CONFIG.types) {
    stats.byType[type] = { size: 0, count: 0 };
  }
  
  try {
    // Scan each cache type directory
    for (const type of CACHE_CONFIG.types) {
      const typeDir = path.join(CACHE_CONFIG.baseDir, type);
      
      try {
        const files = await fs.readdir(typeDir);
        
        for (const file of files) {
          // Skip metadata files in count (count only data files)
          if (file.endsWith('.meta.json')) {
            continue;
          }
          
          // Skip temp files
          if (file.endsWith('.tmp')) {
            continue;
          }
          
          const filePath = path.join(typeDir, file);
          const stat = await fs.stat(filePath);
          
          stats.totalSize += stat.size;
          stats.fileCount++;
          stats.byType[type].size += stat.size;
          stats.byType[type].count++;
        }
      } catch (error) {
        // Directory doesn't exist or can't be read
        console.warn(`Failed to read cache directory ${type}:`, error.message);
      }
    }
    
    // Calculate percentage used
    stats.percentUsed = (stats.totalSize / stats.capacity) * 100;
    
  } catch (error) {
    console.error('Failed to get cache stats:', error);
  }
  
  return stats;
}

/**
 * Get cache statistics including runtime stats
 * 
 * @returns {Promise<object>} Complete statistics
 */
async function getFullStats() {
  const storageStats = await getCacheStats();
  
  return {
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - cacheStats.startTime) / 1000),
    statistics: {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: parseFloat(cacheStats.hitRate.toFixed(2)),
      missRate: parseFloat(cacheStats.missRate.toFixed(2)),
      writes: cacheStats.writes,
      evictions: cacheStats.evictions,
      readErrors: cacheStats.readErrors,
      writeErrors: cacheStats.writeErrors,
    },
    storage: {
      totalSize: storageStats.totalSize,
      capacity: storageStats.capacity,
      percentUsed: parseFloat(storageStats.percentUsed.toFixed(2)),
      fileCount: storageStats.fileCount,
      threshold: storageStats.threshold,
      byType: storageStats.byType,
    },
  };
}

// ============================================================================
// Cache Cleanup (LRU Eviction)
// ============================================================================

/**
 * Cleanup cache using LRU (Least Recently Used) eviction
 * Removes oldest entries until size is below target
 * 
 * @param {string} [type] - Cache type to clean (optional, cleans all if not specified)
 * @returns {Promise<object>} Cleanup results
 * 
 * @example
 * const result = await cleanupCache();
 * console.log(`Evicted ${result.deleted.length} entries, freed ${result.freedBytes} bytes`);
 */
async function cleanupCache(type = null) {
  try {
    const stats = await getCacheStats();
    
    // Check if cleanup needed
    if (stats.totalSize < CACHE_CONFIG.threshold) {
      console.log(`Cache size (${Math.round(stats.totalSize / 1024 / 1024)}MB) below threshold, no cleanup needed`);
      return { deleted: [], freedBytes: 0 };
    }
    
    console.log(`Cache cleanup started: size=${Math.round(stats.totalSize / 1024 / 1024)}MB, threshold=${Math.round(CACHE_CONFIG.threshold / 1024 / 1024)}MB`);
    
    // Get all cache entries with metadata
    const entries = await getAllCacheEntries(type);
    
    // Sort by last accessed (oldest first)
    entries.sort((a, b) => a.accessed - b.accessed);
    
    // Calculate target size (70% to provide buffer)
    const targetSize = CACHE_CONFIG.targetSize;
    
    let currentSize = stats.totalSize;
    const deleted = [];
    
    for (const entry of entries) {
      if (currentSize <= targetSize) {
        break;
      }
      
      // Delete entry
      const success = await deleteCache(entry.cacheKey, entry.type);
      if (success) {
        currentSize -= entry.size;
        deleted.push(entry);
      }
    }
    
    const freedBytes = stats.totalSize - currentSize;
    cacheStats.evictions += deleted.length;
    
    console.log(`Cache cleanup complete: evicted ${deleted.length} entries, freed ${Math.round(freedBytes / 1024 / 1024)}MB`);
    
    return { deleted, freedBytes };
    
  } catch (error) {
    console.error('Cache cleanup failed:', error);
    return { deleted: [], freedBytes: 0, error: error.message };
  }
}

/**
 * Get all cache entries with metadata
 * 
 * @param {string} [type] - Cache type (optional, gets all if not specified)
 * @returns {Promise<Array>} Array of cache entries with metadata
 * @private
 */
async function getAllCacheEntries(type = null) {
  const entries = [];
  const types = type ? [type] : CACHE_CONFIG.types;
  
  for (const cacheType of types) {
    const typeDir = path.join(CACHE_CONFIG.baseDir, cacheType);
    
    try {
      const files = await fs.readdir(typeDir);
      
      // Filter for metadata files
      const metadataFiles = files.filter(f => f.endsWith('.meta.json'));
      
      for (const metaFile of metadataFiles) {
        try {
          const metadataPath = path.join(typeDir, metaFile);
          const content = await fs.readFile(metadataPath, 'utf8');
          const metadata = JSON.parse(content);
          
          entries.push(metadata);
        } catch (error) {
          // Skip corrupted metadata files
          console.warn(`Failed to read metadata file ${metaFile}:`, error.message);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
      console.warn(`Failed to read cache directory ${cacheType}:`, error.message);
    }
  }
  
  return entries;
}

// ============================================================================
// High-Level Cache Wrapper
// ============================================================================

/**
 * Get cached data or fetch from API if not cached
 * Wrapper that handles cache logic and fallback
 * 
 * @param {string} type - Cache type
 * @param {object} params - Parameters for cache key generation
 * @param {Function} fetchFunction - Async function to fetch data on cache miss
 * @returns {Promise<object>} Data (cached or fetched)
 * 
 * @example
 * const results = await getCachedOrFetch('search', 
 *   { query: 'lambda', service: 'duckduckgo', maxResults: 5 },
 *   async (params) => {
 *     return await searchAPI(params);
 *   }
 * );
 */
async function getCachedOrFetch(type, params, fetchFunction) {
  let cacheKey;
  
  try {
    // Try cache
    cacheKey = getCacheKey(type, params);
    const cached = await getFromCache(type, cacheKey);
    
    if (cached) {
      console.log(`Cache HIT: ${type}/${cacheKey}`);
      return { ...cached, _cached: true, _cacheKey: cacheKey };
    }
  } catch (error) {
    // Cache read error - log and continue
    console.warn(`Cache read error for ${type}:`, error.message);
  }
  
  // Cache miss or error - fetch from API
  console.log(`Cache MISS: ${type}/${cacheKey}`);
  
  const result = await fetchFunction(params);
  
  // Try to cache result (non-blocking)
  if (cacheKey && result) {
    const ttl = CACHE_CONFIG.ttl[type];
    saveToCache(type, cacheKey, result, ttl)
      .then(() => {
        console.log(`Cache WRITE: ${type}/${cacheKey}`);
      })
      .catch(error => {
        console.warn(`Cache write error for ${type}:`, error.message);
      });
  }
  
  return { ...result, _cached: false, _cacheKey: cacheKey };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Initialization
  initializeCache,
  
  // Core operations
  getCacheKey,
  getFromCache,
  saveToCache,
  deleteCache,
  
  // Statistics
  getCacheStats,
  getFullStats,
  
  // Cleanup
  cleanupCache,
  
  // High-level wrapper
  getCachedOrFetch,
  
  // Configuration (for testing)
  CACHE_CONFIG,
  cacheStats,
};
