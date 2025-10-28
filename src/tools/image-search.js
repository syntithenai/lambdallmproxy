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
 * @returns {Promise<Array>} Array of image objects
 */
async function searchUnsplash(query, count = 1) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  
  if (!accessKey) {
    console.warn('⚠️  UNSPLASH_ACCESS_KEY not configured');
    return [];
  }

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`;
    
    console.log(`🔍 Searching Unsplash for: "${query}"`);
    
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
 * @returns {Promise<Array>} Array of image objects
 */
async function searchPexels(query, count = 1) {
  const apiKey = process.env.PEXELS_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️  PEXELS_API_KEY not configured');
    return [];
  }

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`;
    
    console.log(`🔍 Searching Pexels for: "${query}"`);
    
    const data = await makeRequest(url, {
      'Authorization': apiKey
    });

    if (!data.photos || data.photos.length === 0) {
      console.log(`ℹ️  No Pexels results for: "${query}"`);
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

    console.log(`✅ Found ${results.length} Pexels image(s) for: "${query}"`);
    return results;

  } catch (error) {
    console.error(`❌ Pexels search error for "${query}":`, error.message);
    return [];
  }
}

/**
 * Search for images using multiple providers with fallback
 * 
 * Strategy:
 * 1. Try Unsplash first (higher quality, curated)
 * 2. Fall back to Pexels if Unsplash fails or no results
 * 
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} options.count - Number of images (default: 1)
 * @param {string} options.provider - Preferred provider: 'unsplash', 'pexels', 'auto' (default: 'auto')
 * @returns {Promise<Object|null>} Image object or null if no results
 */
async function searchImage(query, options = {}) {
  const { count = 1, provider = 'auto' } = options;
  
  if (!query || typeof query !== 'string') {
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

  let results = [];

  // Try preferred provider or auto-select
  if (provider === 'unsplash' || provider === 'auto') {
    results = await searchUnsplash(query, count);
  }

  // Fallback to Pexels if no Unsplash results
  if (results.length === 0 && (provider === 'pexels' || provider === 'auto')) {
    results = await searchPexels(query, count);
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
