/**
 * Search Cache Utility
 * Caches search results in localStorage indexed by lowercase query
 */

export interface CachedSearchResult {
  query: string;
  results: any[];
  timestamp: number;
}

const SEARCH_CACHE_KEY = 'llm_proxy_search_cache';
const CURRENT_SEARCHES_KEY = 'llm_proxy_current_searches';
const CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days

/**
 * Get all cached search results
 */
export function getAllCachedSearches(): Record<string, CachedSearchResult> {
  try {
    const cached = localStorage.getItem(SEARCH_CACHE_KEY);
    if (!cached) return {};
    
    const cache = JSON.parse(cached);
    const now = Date.now();
    const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    // Filter out expired entries
    const validCache: Record<string, CachedSearchResult> = {};
    for (const [key, value] of Object.entries(cache)) {
      const result = value as CachedSearchResult;
      if (now - result.timestamp < expiryTime) {
        validCache[key] = result;
      }
    }
    
    // Update cache if we removed expired entries
    if (Object.keys(validCache).length !== Object.keys(cache).length) {
      localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(validCache));
    }
    
    return validCache;
  } catch (error) {
    console.error('Error reading search cache:', error);
    return {};
  }
}

/**
 * Get cached results for a specific query
 */
export function getCachedSearch(query: string): CachedSearchResult | null {
  const cache = getAllCachedSearches();
  const key = query.toLowerCase().trim();
  return cache[key] || null;
}

/**
 * Save search results to cache
 */
export function saveCachedSearch(query: string, results: any[]): void {
  try {
    const cache = getAllCachedSearches();
    const key = query.toLowerCase().trim();
    
    cache[key] = {
      query: query.trim(),
      results,
      timestamp: Date.now()
    };
    
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error saving search to cache:', error);
  }
}

/**
 * Delete a cached search
 */
export function deleteCachedSearch(query: string): void {
  try {
    const cache = getAllCachedSearches();
    const key = query.toLowerCase().trim();
    delete cache[key];
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error deleting cached search:', error);
  }
}

/**
 * Get all cached query strings (for autocomplete)
 */
export function getCachedQueryStrings(): string[] {
  const cache = getAllCachedSearches();
  return Object.values(cache)
    .map(c => c.query)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Save current searches to localStorage
 */
export function saveCurrentSearches(searches: string[]): void {
  try {
    localStorage.setItem(CURRENT_SEARCHES_KEY, JSON.stringify(searches));
  } catch (error) {
    console.error('Error saving current searches:', error);
  }
}

/**
 * Load current searches from localStorage
 */
export function loadCurrentSearches(): string[] {
  try {
    const saved = localStorage.getItem(CURRENT_SEARCHES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Error loading current searches:', error);
    return [];
  }
}

/**
 * Clear all current searches
 */
export function clearCurrentSearches(): void {
  try {
    localStorage.removeItem(CURRENT_SEARCHES_KEY);
  } catch (error) {
    console.error('Error clearing current searches:', error);
  }
}

/**
 * Extract and save search results from chat tool call result
 * @param toolCallName - Name of the tool that was called
 * @param toolCallResult - Result content from the tool call
 * @returns SearchResult object if it was a search tool call, null otherwise
 */
export function extractAndSaveSearchResult(toolCallName: string, toolCallResult: string): any | null {
  if (toolCallName !== 'search_web') {
    return null;
  }

  try {
    // Parse the tool result
    const result = JSON.parse(toolCallResult);
    
    // Check if it has the expected search result structure
    if (result.query && Array.isArray(result.results)) {
      // Save to cache
      saveCachedSearch(result.query, result.results);
      
      return {
        query: result.query,
        results: result.results
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting search result from tool call:', error);
    return null;
  }
}
