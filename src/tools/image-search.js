/**
 * Image Search Tool - Search for images using Unsplash and Pexels APIs
 * 
 * Unsplash API Guidelines Compliance:
 * 1. Hotlink photos to original Unsplash URLs
 * 2. Trigger download endpoint when photo is used
 * 3. Proper attribution with photographer name and Unsplash link
 * 4. Don't use Unsplash logo or similar naming
 * 
 * Pexels API Guidelines Compliance:
 * 1. Attribute photographer and Pexels
 * 2. Use provided image URLs
 */

const https = require('https');

// In-memory cache for search results (1 hour TTL)
const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds
const RATE_LIMIT_COOLDOWN = 3600000; // 1 hour cooldown after rate limit

// Load balancing state - alternates between providers with rate limit tracking
let providerRotation = 0; // 0 = Unsplash, 1 = Pexels
let unsplashRateLimitUntil = 0;
let pexelsRateLimitUntil = 0;

/**
 * Make HTTPS request
 */
function makeRequest(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Search Unsplash for images
 * 
 * @param {string} query - Search query
 * @param {number} count - Number of images to return (default: 1)
 * @param {string} maturityLevel - Content maturity: 'child', 'youth', 'adult', 'academic' (default: 'adult')
 * @returns {Promise<Array>} Array of image objects
 */
async function searchUnsplash(query, count = 1, maturityLevel = 'adult') {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  
  if (!accessKey) {
    console.warn('⚠️  UNSPLASH_ACCESS_KEY not configured');
    return [];
  }

  try {
    // Map maturity levels to Unsplash content_filter
    // Unsplash content_filter: low (default), high (safe for work)
    const contentFilter = (maturityLevel === 'child' || maturityLevel === 'youth') ? 'high' : 'low';
    
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&content_filter=${contentFilter}`;
    
    console.log(`🔍 Searching Unsplash for: "${query}" (maturity: ${maturityLevel}, filter: ${contentFilter})`);
    
    const data = await makeRequest(url, {
      'Authorization': `Client-ID ${accessKey}`
    });

    if (!data.results || data.results.length === 0) {
      console.log(`ℹ️  No Unsplash results for: "${query}"`);
      return [];
    }

    const results = data.results.slice(0, count).map(img => ({
      url: img.urls.regular,          // Full-size image URL
      thumb: img.urls.small,           // Thumbnail URL
      width: img.width,
      height: img.height,
      photographer: img.user.name,     // Required for attribution
      photographerUrl: img.user.links.html, // Link to photographer profile
      downloadUrl: img.links.download_location, // Required: trigger download tracking
      source: 'unsplash',
      attribution: `Photo by ${img.user.name} on Unsplash`,
      attributionHtml: `Photo by <a href="${img.user.links.html}?utm_source=research_agent&utm_medium=referral" target="_blank" rel="noopener noreferrer">${img.user.name}</a> on <a href="https://unsplash.com?utm_source=research_agent&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a>`
    }));

    console.log(`✅ Found ${results.length} Unsplash image(s) for: "${query}"`);
    return results;

  } catch (error) {
    console.error(`❌ Unsplash search error for "${query}":`, error.message);
    return [];
  }
}

/**
 * Trigger Unsplash download tracking (required by API guidelines)
 * This must be called when a photo is actually used/displayed
 * 
 * @param {string} downloadUrl - Download location URL from search result
 */
async function trackUnsplashDownload(downloadUrl) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  
  if (!accessKey || !downloadUrl) {
    return;
  }

  try {
    await makeRequest(downloadUrl, {
      'Authorization': `Client-ID ${accessKey}`
    });
    console.log('📊 Unsplash download tracked');
  } catch (error) {
    console.error('❌ Failed to track Unsplash download:', error.message);
  }
}

/**
 * Search Pexels for images (fallback provider)
 * 
 * @param {string} query - Search query
 * @param {number} count - Number of images to return (default: 1)
 * @param {string} maturityLevel - Content maturity: 'child', 'youth', 'adult', 'academic' (default: 'adult')
 * @returns {Promise<Array>} Array of image objects
 */
async function searchPexels(query, count = 1, maturityLevel = 'adult') {
  const apiKey = process.env.PEXELS_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️  PEXELS_API_KEY not configured');
    return [];
  }

  try {
    // Pexels doesn't have explicit content filtering in API
    // Modify query for child-safe content
    const safeQuery = (maturityLevel === 'child' || maturityLevel === 'youth')
      ? `${query} safe for kids family-friendly`
      : query;
    
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(safeQuery)}&per_page=${count}&orientation=landscape`;
    
    console.log(`🔍 Searching Pexels for: "${safeQuery}" (maturity: ${maturityLevel})`);
    
    const data = await makeRequest(url, {
      'Authorization': apiKey
    });

    if (!data.photos || data.photos.length === 0) {
      console.log(`ℹ️  No Pexels results for: "${safeQuery}"`);
      return [];
    }

    const results = data.photos.slice(0, count).map(img => ({
      url: img.src.large,              // Full-size image URL
      thumb: img.src.medium,           // Thumbnail URL
      width: img.width,
      height: img.height,
      photographer: img.photographer,  // Required for attribution
      photographerUrl: img.photographer_url, // Link to photographer profile
      source: 'pexels',
      attribution: `Photo by ${img.photographer} on Pexels`,
      attributionHtml: `Photo by <a href="${img.photographer_url}" target="_blank" rel="noopener noreferrer">${img.photographer}</a> on <a href="${img.url}" target="_blank" rel="noopener noreferrer">Pexels</a>`
    }));

    console.log(`✅ Found ${results.length} Pexels image(s) for: "${safeQuery}"`);
    return results;

  } catch (error) {
    console.error(`❌ Pexels search error for "${safeQuery}":`, error.message);
    return [];
  }
}

/**
 * Search for images using Unsplash or Pexels API
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} options.count - Number of images (default: 1)
 * @param {string} options.provider - Preferred provider: 'unsplash', 'pexels', 'auto' (default: 'auto')
 * @param {string} options.maturityLevel - Content maturity: 'child', 'youth', 'adult', 'academic' (default: 'adult')
 * @returns {Promise<Object|null>} Image object or null if no results
 */
async function searchImage(query, options = {}) {
  const { count = 1, provider = 'auto', maturityLevel = 'adult' } = options;  if (!query || typeof query !== 'string') {
    console.warn('⚠️  Invalid image search query:', query);
    return null;
  }

  // Check cache first
  const cacheKey = `${query}-${provider}-${count}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`💾 Using cached image for: "${query}"`);
    return cached.result;
  }

  const now = Date.now();
  let results = [];

  // Handle explicit provider selection
  if (provider === 'unsplash') {
    if (now < unsplashRateLimitUntil) {
      console.warn(`⏱️  Unsplash rate-limited until ${new Date(unsplashRateLimitUntil).toISOString()}`);
      return null;
    }
    try {
      results = await searchUnsplash(query, count, maturityLevel);
    } catch (error) {
      if (error.message?.includes('403') || error.message?.includes('rate limit')) {
        unsplashRateLimitUntil = now + RATE_LIMIT_COOLDOWN;
        console.warn(`⏱️  Unsplash rate limit detected. Cooldown for 1 hour.`);
      }
    }
  } else if (provider === 'pexels') {
    if (now < pexelsRateLimitUntil) {
      console.warn(`⏱️  Pexels rate-limited until ${new Date(pexelsRateLimitUntil).toISOString()}`);
      return null;
    }
    try {
      results = await searchPexels(query, count, maturityLevel);
    } catch (error) {
      if (error.message?.includes('403') || error.message?.includes('rate limit')) {
        pexelsRateLimitUntil = now + RATE_LIMIT_COOLDOWN;
        console.warn(`⏱️  Pexels rate limit detected. Cooldown for 1 hour.`);
      }
    }
  } else if (provider === 'auto') {
    // Auto mode: Load balance with failover
    const primaryProvider = providerRotation % 2 === 0 ? 'unsplash' : 'pexels';
    const fallbackProvider = primaryProvider === 'unsplash' ? 'pexels' : 'unsplash';
    
    // Try primary provider
    let primaryAvailable = true;
    if (primaryProvider === 'unsplash' && now < unsplashRateLimitUntil) {
      console.log(`⏭️  Skipping Unsplash (rate-limited), trying Pexels`);
      primaryAvailable = false;
    } else if (primaryProvider === 'pexels' && now < pexelsRateLimitUntil) {
      console.log(`⏭️  Skipping Pexels (rate-limited), trying Unsplash`);
      primaryAvailable = false;
    }

    if (primaryAvailable) {
      try {
        console.log(`🔄 Load balancing: Trying ${primaryProvider} first (rotation: ${providerRotation})`);
        results = primaryProvider === 'unsplash' 
          ? await searchUnsplash(query, count, maturityLevel)
          : await searchPexels(query, count, maturityLevel);
      } catch (error) {
        if (error.message?.includes('403') || error.message?.includes('rate limit')) {
          if (primaryProvider === 'unsplash') {
            unsplashRateLimitUntil = now + RATE_LIMIT_COOLDOWN;
            console.warn(`⏱️  Unsplash rate limit detected. Cooldown for 1 hour.`);
          } else {
            pexelsRateLimitUntil = now + RATE_LIMIT_COOLDOWN;
            console.warn(`⏱️  Pexels rate limit detected. Cooldown for 1 hour.`);
          }
        }
      }
    }

    // Fallback to secondary provider if needed
    if (results.length === 0) {
      const fallbackAvailable = fallbackProvider === 'unsplash' 
        ? now >= unsplashRateLimitUntil
        : now >= pexelsRateLimitUntil;

      if (fallbackAvailable) {
        try {
          console.log(`🔀 Failover to ${fallbackProvider}`);
          results = fallbackProvider === 'unsplash'
            ? await searchUnsplash(query, count, maturityLevel)
            : await searchPexels(query, count, maturityLevel);
        } catch (error) {
          if (error.message?.includes('403') || error.message?.includes('rate limit')) {
            if (fallbackProvider === 'unsplash') {
              unsplashRateLimitUntil = now + RATE_LIMIT_COOLDOWN;
              console.warn(`⏱️  Unsplash rate limit detected. Cooldown for 1 hour.`);
            } else {
              pexelsRateLimitUntil = now + RATE_LIMIT_COOLDOWN;
              console.warn(`⏱️  Pexels rate limit detected. Cooldown for 1 hour.`);
            }
          }
        }
      } else {
        console.warn(`⚠️  Both providers rate-limited`);
      }
    }

    // Rotate for next call
    providerRotation++;
  }

  // Return first result (or null if none found)
  const result = results.length > 0 ? results[0] : null;

  // Cache the result
  cache.set(cacheKey, {
    result,
    timestamp: Date.now()
  });

  // Clean old cache entries periodically
  if (cache.size > 100) {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        cache.delete(key);
      }
    }
  }

  return result;
}

/**
 * Search for multiple images with different queries
 * Useful for feed generation where we want diverse images
 * 
 * @param {Array<string>} queries - Array of search queries
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of image objects (same length as queries)
 */
async function searchMultipleImages(queries, options = {}) {
  if (!Array.isArray(queries) || queries.length === 0) {
    return [];
  }

  // Search all queries in parallel
  const promises = queries.map(query => searchImage(query, options));
  const results = await Promise.all(promises);

  return results; // May contain nulls if some queries failed
}

/**
 * Clear image search cache
 * Useful for testing or forcing fresh results
 */
function clearCache() {
  cache.clear();
  console.log('🗑️  Image search cache cleared');
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;

  for (const [, value] of cache.entries()) {
    if (now - value.timestamp < CACHE_TTL) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }

  return {
    totalEntries: cache.size,
    validEntries,
    expiredEntries,
    cacheTTL: CACHE_TTL
  };
}

module.exports = {
  searchImage,
  searchMultipleImages,
  searchUnsplash,
  searchPexels,
  trackUnsplashDownload,
  clearCache,
  getCacheStats
};
