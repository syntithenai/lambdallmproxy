/**
 * Google Drive Proxy Endpoint
 * Fetches publicly shared Google Drive files and serves them to the frontend
 * This bypasses CORS restrictions that prevent direct browser access
 * Requires authentication for billing and usage tracking
 */

const { verifyGoogleOAuthToken } = require('../auth');

/**
 * Handle GET requests to fetch Google Drive file content
 * @param {Object} event - Lambda event object
 * @returns {Object} Response with file content or error
 */
const handleDriveProxy = async (event) => {
  console.log(`📥 Drive proxy request`);

  try {
    // Verify authentication
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) {
      console.error('❌ No authorization header provided');
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
        body: JSON.stringify({ error: 'Authentication required' }),
      };
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const authResult = await verifyGoogleOAuthToken(token);
    
    if (!authResult || !authResult.email) {
      console.error('❌ Invalid or expired token');
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invalid or expired token' }),
      };
    }

    console.log(`🔐 Request authenticated: ${authResult.email}`);

    // Extract fileId from query parameters
    const fileId = event.queryStringParameters?.fileId;
    
    if (!fileId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
        body: JSON.stringify({ error: 'Missing fileId parameter' }),
      };
    }

    console.log(`📄 Fetching file: ${fileId} for user: ${authResult.email}`);

    // Try to fetch the file from Google Drive using public download URL
    const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    const response = await fetch(driveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ResearchAgent/1.0)',
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to fetch file: ${response.status} ${response.statusText}`);
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ 
          error: `Failed to fetch file: ${response.status} ${response.statusText}`,
          fileId,
        }),
      };
    }

    // Get the content
    const content = await response.text();
    console.log(`✅ Fetched file content (${content.length} bytes) for ${authResult.email}`);

    // Determine content type based on file content or default to HTML
    let contentType = 'text/html';
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      contentType = 'application/json';
    } else if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
      contentType = 'text/html';
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
      body: content,
    };
  } catch (error) {
    console.error('❌ Drive proxy error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
};

module.exports = {
  handleDriveProxy,
};
