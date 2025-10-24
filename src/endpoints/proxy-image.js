/**
 * Proxy Image Endpoint
 * Fetches images through Webshare proxy to bypass CORS and IP restrictions
 * Used by frontend image conversion utilities for base64 storage in SWAG
 */

const https = require('https');
const http = require('http');
const { authenticateRequest } = require('../auth');

/**
 * Create Webshare proxy agent for image fetching
 * @param {string} username - Webshare proxy username
 * @param {string} password - Webshare proxy password
 * @returns {Object|null} HttpsProxyAgent or null if credentials missing
 */
function createProxyAgent(username, password) {
  if (!username || !password) {
    return null;
  }
  
  // Webshare proxy URL format: http://username-rotate:password@p.webshare.io:80/
  const proxyUrl = `http://${username}-rotate:${password}@p.webshare.io:80/`;
  
  console.log(`Using Webshare proxy: ${username}-rotate@p.webshare.io`);
  
  const { HttpsProxyAgent } = require('https-proxy-agent');
  return new HttpsProxyAgent(proxyUrl);
}

/**
 * Fetch image through proxy or direct
 * @param {string} imageUrl - Image URL to fetch
 * @param {Object} proxyAgent - Optional proxy agent
 * @returns {Promise<Object>} { data: Buffer, contentType: string }
 */
function fetchImage(imageUrl, proxyAgent) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(imageUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*'
      },
      timeout: 15000 // 15 second timeout
    };
    
    // Add proxy agent if available
    if (proxyAgent) {
      options.agent = proxyAgent;
    }
    
    console.log(`Fetching image: ${imageUrl} ${proxyAgent ? '(via proxy)' : '(direct)'}`);
    
    const req = protocol.request(options, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const redirectUrl = res.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location header'));
          return;
        }
        
        // Resolve relative redirects
        const absoluteRedirectUrl = redirectUrl.startsWith('http') 
          ? redirectUrl 
          : new URL(redirectUrl, imageUrl).toString();
        
        console.log(`Following redirect to: ${absoluteRedirectUrl}`);
        fetchImage(absoluteRedirectUrl, proxyAgent)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      // Check status code
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }
      
      const chunks = [];
      let totalSize = 0;
      const maxSize = 10 * 1024 * 1024; // 10MB limit
      
      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          req.destroy();
          reject(new Error('Image too large (>10MB)'));
          return;
        }
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        const data = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'image/jpeg';
        console.log(`Image fetched: ${totalSize} bytes, type: ${contentType}`);
        resolve({ data, contentType });
      });
    });
    
    req.on('error', (err) => {
      console.error(`Image fetch error: ${err.message}`);
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

/**
 * Handle proxy-image endpoint request
 * POST /proxy-image with { url: "https://..." }
 * Returns image data as base64 or binary
 * 
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} Lambda response with image data
 */
async function handler(event) {
  console.log('proxy-image endpoint called');
  
  try {
    // Authenticate request
    const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
    const authResult = await authenticateRequest(authHeader);
    
    if (!authResult.authenticated) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Authentication required. Please provide a valid token.',
          code: 'UNAUTHORIZED'
        })
      };
    }
    
    const userEmail = authResult.email || 'unknown';
    console.log(`✅ Authenticated proxy-image request from: ${userEmail}`);
    
    // Parse request body
    const body = typeof event.body === 'string' 
      ? JSON.parse(event.body) 
      : event.body;
    
    if (!body || !body.url) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing url parameter' })
      };
    }
    
    const imageUrl = body.url;
    const returnFormat = body.format || 'base64'; // 'base64' or 'binary'
    
    // Validate URL
    try {
      new URL(imageUrl);
    } catch (err) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid URL format' })
      };
    }
    
    // NOTE: Proxy disabled for image fetching to reduce costs
    // Only YouTube transcripts use proxy
    // Fetch directly without proxy
    console.log('ℹ️ Fetching image directly (proxy disabled)');
    const imageData = await fetchImage(imageUrl, null);
    console.log('✅ Image fetched successfully (direct)');
    
    // Return based on requested format
    if (returnFormat === 'binary') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': imageData.contentType,
          'Content-Length': imageData.data.length.toString(),
          'Cache-Control': 'public, max-age=3600'
        },
        isBase64Encoded: true,
        body: imageData.data.toString('base64')
      };
    } else {
      // Return as base64 data URI
      const base64Data = imageData.data.toString('base64');
      const dataUri = `data:${imageData.contentType};base64,${base64Data}`;
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600'
        },
        body: JSON.stringify({
          success: true,
          dataUri: dataUri,
          size: imageData.data.length,
          contentType: imageData.contentType,
          usedProxy: false // Proxy disabled for cost reduction
        })
      };
    }
    
  } catch (error) {
    console.error('proxy-image error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch image',
        message: error.message
      })
    };
  }
}

module.exports = { handler };
