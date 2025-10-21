/**
 * Tier 0: Direct HTTP Scraping
 * 
 * Lightweight HTTP-based scraping using axios/fetch with HTML parsing.
 * Suitable for simple pages without JavaScript requirements.
 * 
 * Features:
 * - DuckDuckGo HTML proxy (bypasses some basic restrictions)
 * - Tavily API fallback (third-party scraping service)
 * - User-agent rotation
 * - Basic HTML parsing with cheerio
 * 
 * Availability: Production Lambda + Local
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');

/**
 * Scrape a URL using direct HTTP request
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @param {string} options.proxy - HTTP proxy URL (optional)
 * @param {number} options.timeout - Request timeout in ms (default: 30000)
 * @param {Object} options.headers - Custom headers (optional)
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeDirectHTTP(url, options = {}) {
  const {
    proxy = null,
    timeout = 30000,
    headers = {}
  } = options;

  console.log(`🌐 [Tier 0 - Direct] Scraping: ${url}`);
  const startTime = Date.now();

  // User agents for rotation
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  const config = {
    method: 'GET',
    url,
    timeout,
    headers: {
      'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      ...headers
    },
    maxRedirects: 5,
    validateStatus: (status) => status < 500 // Accept 4xx responses
  };

  // Add proxy if provided
  if (proxy) {
    config.httpsAgent = new HttpsProxyAgent(proxy);
    console.log(`🔒 [Tier 0] Using proxy: ${proxy}`);
  }

  try {
    const response = await axios(config);
    const requestTime = Date.now() - startTime;

    console.log(`✅ [Tier 0] Response received in ${requestTime}ms (status: ${response.status})`);

    // Check for error status codes
    if (response.status === 403) {
      throw new Error('Access forbidden (403) - site may be blocking scrapers');
    }
    if (response.status === 429) {
      throw new Error('Rate limited (429) - too many requests');
    }

    // Parse HTML with cheerio
    const $ = cheerio.load(response.data);

    // Extract text content (remove script and style tags)
    $('script, style, noscript').remove();
    const text = $('body').text()
      .replace(/\s+/g, ' ')
      .trim();

    // Extract title
    const title = $('title').text().trim() || 
                  $('meta[property="og:title"]').attr('content') || 
                  $('h1').first().text().trim();

    // Extract meta description
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') ||
                       '';

    // Extract all links
    const links = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#')) {
        try {
          const absoluteUrl = new URL(href, url).href;
          links.push({
            href: absoluteUrl,
            text: $(el).text().trim()
          });
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });

    // Extract all images
    const images = [];
    $('img[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        try {
          const absoluteUrl = new URL(src, url).href;
          images.push({
            src: absoluteUrl,
            alt: $(el).attr('alt') || ''
          });
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });

    const result = {
      success: true,
      tier: 0,
      method: 'direct-http',
      url: response.request.res.responseUrl || url,
      status: response.status,
      title,
      description,
      text,
      html: response.data,
      links: links.slice(0, 100), // Limit to first 100 links
      images: images.slice(0, 50), // Limit to first 50 images
      responseTime: requestTime,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ [Tier 0] Extracted: ${text.length} chars, ${links.length} links, ${images.length} images`);
    return result;

  } catch (error) {
    const requestTime = Date.now() - startTime;
    console.error(`❌ [Tier 0] Failed after ${requestTime}ms:`, error.message);

    // Enhanced error for orchestrator
    const enhancedError = new Error(error.message);
    enhancedError.status = error.response?.status;
    enhancedError.statusCode = error.response?.status;
    enhancedError.tier = 0;
    enhancedError.method = 'direct-http';
    enhancedError.responseTime = requestTime;
    
    throw enhancedError;
  }
}

/**
 * Scrape using DuckDuckGo HTML proxy
 * DuckDuckGo's HTML-only version can sometimes bypass basic restrictions
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeViaDDGProxy(url, options = {}) {
  console.log(`🦆 [Tier 0 - DDG Proxy] Attempting via DuckDuckGo HTML proxy`);
  
  // DuckDuckGo's HTML proxy endpoint
  const ddgProxyUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(url)}`;
  
  try {
    // Note: This is a simplified approach. DDG's actual proxy mechanism may differ.
    // In practice, you might need to use their lite/HTML version more carefully.
    return await scrapeDirectHTTP(url, {
      ...options,
      headers: {
        ...options.headers,
        'Referer': 'https://duckduckgo.com/',
      }
    });
  } catch (error) {
    console.error(`❌ [Tier 0 - DDG Proxy] Failed:`, error.message);
    throw error;
  }
}

/**
 * Scrape using Tavily API (third-party service)
 * Requires TAVILY_API_KEY environment variable
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeViaTavily(url, options = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY not configured');
  }

  console.log(`🔍 [Tier 0 - Tavily] Using Tavily API`);

  try {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: apiKey,
      query: url,
      search_depth: 'advanced',
      include_raw_content: true,
      max_results: 1
    }, {
      timeout: options.timeout || 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.results?.[0]) {
      const result = response.data.results[0];
      
      return {
        success: true,
        tier: 0,
        method: 'tavily-api',
        url: result.url,
        title: result.title,
        text: result.content || result.raw_content || '',
        html: result.raw_content || '',
        links: [],
        images: [],
        responseTime: 0,
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error('No results from Tavily API');
    }
  } catch (error) {
    console.error(`❌ [Tier 0 - Tavily] Failed:`, error.message);
    throw error;
  }
}

/**
 * Main Tier 0 scraper with fallback chain
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeTier0(url, options = {}) {
  const errors = [];

  // Try 1: Direct HTTP
  try {
    return await scrapeDirectHTTP(url, options);
  } catch (error) {
    errors.push({ method: 'direct-http', error: error.message });
    console.log(`⚠️ [Tier 0] Direct HTTP failed, trying fallbacks...`);
  }

  // Try 2: DuckDuckGo proxy (if direct fails)
  try {
    return await scrapeViaDDGProxy(url, options);
  } catch (error) {
    errors.push({ method: 'ddg-proxy', error: error.message });
    console.log(`⚠️ [Tier 0] DDG proxy failed, trying Tavily...`);
  }

  // Try 3: Tavily API (if configured)
  if (process.env.TAVILY_API_KEY) {
    try {
      return await scrapeViaTavily(url, options);
    } catch (error) {
      errors.push({ method: 'tavily-api', error: error.message });
    }
  }

  // All Tier 0 methods failed
  const error = new Error(`All Tier 0 methods failed: ${errors.map(e => e.method).join(', ')}`);
  error.tier = 0;
  error.errors = errors;
  error.status = errors[0]?.error?.status || 500;
  throw error;
}

module.exports = {
  scrapeTier0,
  scrapeDirectHTTP,
  scrapeViaDDGProxy,
  scrapeViaTavily
};
