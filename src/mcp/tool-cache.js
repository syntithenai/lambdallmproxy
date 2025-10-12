/**
 * MCP Tool Cache
 * 
 * Caches discovered tools from MCP servers to avoid repeated discovery calls.
 * Tools are cached per server URL with a configurable TTL (default 5 minutes).
 * 
 * Cache invalidation:
 * - Automatic expiration after TTL
 * - Manual invalidation via clearCache()
 * - Per-server or global clearing
 */

const { discoverTools } = require('./client');

/**
 * Cache entry structure:
 * {
 *   tools: Array<Object>,      // Tool definitions
 *   timestamp: number,          // Cache entry creation time
 *   serverUrl: string           // MCP server URL
 * }
 */
const toolCache = new Map();

// Default cache TTL: 5 minutes
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Get tools from an MCP server (with caching)
 * 
 * Retrieves tools from cache if available and not expired.
 * Otherwise, discovers tools from the server and caches them.
 * 
 * @param {string} serverUrl - Full URL of the MCP server
 * @param {number} maxAge - Maximum cache age in milliseconds (default: 5 minutes)
 * @returns {Promise<Array>} Array of tool definitions
 * @throws {Error} On discovery failures
 */
async function getTools(serverUrl, maxAge = DEFAULT_CACHE_TTL) {
  const now = Date.now();
  
  // Check cache
  if (toolCache.has(serverUrl)) {
    const cached = toolCache.get(serverUrl);
    const age = now - cached.timestamp;
    
    // Return cached tools if not expired
    if (age < maxAge) {
      console.log(`[MCP Cache] Hit for ${serverUrl} (age: ${Math.round(age / 1000)}s)`);
      return cached.tools;
    }
    
    // Cache expired
    console.log(`[MCP Cache] Expired for ${serverUrl} (age: ${Math.round(age / 1000)}s)`);
    toolCache.delete(serverUrl);
  }
  
  // Cache miss - discover tools
  console.log(`[MCP Cache] Miss for ${serverUrl}, discovering tools...`);
  try {
    const tools = await discoverTools(serverUrl);
    
    // Cache the tools
    toolCache.set(serverUrl, {
      tools: tools,
      timestamp: now,
      serverUrl: serverUrl
    });
    
    console.log(`[MCP Cache] Cached ${tools.length} tools from ${serverUrl}`);
    return tools;
  } catch (error) {
    console.error(`[MCP Cache] Discovery failed for ${serverUrl}:`, error.message);
    throw error;
  }
}

/**
 * Clear cached tools for a specific server or all servers
 * 
 * @param {string} [serverUrl] - Server URL to clear (optional, clears all if omitted)
 */
function clearCache(serverUrl = null) {
  if (serverUrl) {
    if (toolCache.has(serverUrl)) {
      toolCache.delete(serverUrl);
      console.log(`[MCP Cache] Cleared cache for ${serverUrl}`);
    }
  } else {
    const count = toolCache.size;
    toolCache.clear();
    console.log(`[MCP Cache] Cleared all cached entries (${count} servers)`);
  }
}

/**
 * Get cache statistics
 * 
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
  const now = Date.now();
  const entries = Array.from(toolCache.entries()).map(([url, entry]) => ({
    serverUrl: url,
    toolCount: entry.tools.length,
    age: Math.round((now - entry.timestamp) / 1000), // Age in seconds
    timestamp: entry.timestamp
  }));
  
  return {
    totalServers: toolCache.size,
    totalTools: entries.reduce((sum, e) => sum + e.toolCount, 0),
    entries: entries
  };
}

/**
 * Check if tools are cached for a server
 * 
 * @param {string} serverUrl - Server URL to check
 * @param {number} maxAge - Maximum acceptable age in milliseconds
 * @returns {boolean} True if cached and not expired
 */
function isCached(serverUrl, maxAge = DEFAULT_CACHE_TTL) {
  if (!toolCache.has(serverUrl)) {
    return false;
  }
  
  const cached = toolCache.get(serverUrl);
  const age = Date.now() - cached.timestamp;
  return age < maxAge;
}

/**
 * Preload tools from multiple servers
 * 
 * Useful for warming the cache at Lambda cold start.
 * Continues even if some servers fail.
 * 
 * @param {Array<string>} serverUrls - Array of server URLs
 * @param {number} timeout - Per-server timeout in milliseconds
 * @returns {Promise<Object>} Results per server
 */
async function preloadTools(serverUrls, timeout = 10000) {
  const results = {};
  
  const promises = serverUrls.map(async (serverUrl) => {
    try {
      const tools = await Promise.race([
        getTools(serverUrl),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Preload timeout')), timeout)
        )
      ]);
      
      results[serverUrl] = {
        success: true,
        toolCount: tools.length
      };
    } catch (error) {
      results[serverUrl] = {
        success: false,
        error: error.message
      };
    }
  });
  
  await Promise.allSettled(promises);
  return results;
}

/**
 * Clean up expired cache entries
 * 
 * Removes all entries older than maxAge.
 * Useful for Lambda memory management.
 * 
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {number} Number of entries removed
 */
function cleanupExpired(maxAge = DEFAULT_CACHE_TTL) {
  const now = Date.now();
  let removed = 0;
  
  for (const [serverUrl, entry] of toolCache.entries()) {
    const age = now - entry.timestamp;
    if (age >= maxAge) {
      toolCache.delete(serverUrl);
      removed++;
    }
  }
  
  if (removed > 0) {
    console.log(`[MCP Cache] Cleaned up ${removed} expired entries`);
  }
  
  return removed;
}

module.exports = {
  getTools,
  clearCache,
  getCacheStats,
  isCached,
  preloadTools,
  cleanupExpired,
  DEFAULT_CACHE_TTL
};
