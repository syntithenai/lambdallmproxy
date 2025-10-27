/**
 * OAuth2 Authentication Endpoints
 * 
 * Handles OAuth2 flow for YouTube Transcript API access:
 * - /oauth/callback: Receives authorization code from Google, exchanges for tokens
 * - /oauth/refresh: Refreshes expired access tokens
 * - /oauth/revoke: Revokes OAuth tokens
 * 
 * All endpoints (except callback) require JWT authentication.
 */

const { OAuth2Client } = require('google-auth-library');
const { authenticateRequest } = require('../auth');

/**
 * OAuth2 Callback Endpoint
 * Handles the redirect from Google OAuth consent screen
 * Exchanges authorization code for access/refresh tokens
 * Returns tokens to client via postMessage
 */
async function oauthCallbackEndpoint(event) {
  try {
    // Extract query parameters
    const params = event.queryStringParameters || {};
    const code = params.code;
    const state = params.state;
    const error = params.error;

    console.log('OAuth callback received:', { 
      hasCode: !!code, 
      hasState: !!state, 
      error: error || 'none' 
    });

    // Handle user denial or OAuth errors
    if (error) {
      console.warn('OAuth error:', error);
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store'
        },
        body: generatePostMessageHTML('oauth_error', { error })
      };
    }

    // Validate required parameters
    if (!code) {
      console.error('Missing authorization code');
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store'
        },
        body: generatePostMessageHTML('oauth_error', { 
          error: 'missing_code',
          message: 'Authorization code not received'
        })
      };
    }

    // Exchange authorization code for tokens
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );

    console.log('Exchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('Successfully obtained tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expiry_date
    });

    // Return tokens to client via postMessage
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store'
      },
      body: generatePostMessageHTML('oauth_success', { 
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
          expires_at: tokens.expiry_date || (Date.now() + 3600000),
          scope: tokens.scope,
          token_type: tokens.token_type || 'Bearer'
        },
        state
      })
    };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store'
      },
      body: generatePostMessageHTML('oauth_error', { 
        error: 'exchange_failed',
        message: error.message 
      })
    };
  }
}

/**
 * OAuth2 Token Refresh Endpoint
 * Uses refresh token to obtain new access token
 * Requires JWT authentication
 */
async function oauthRefreshEndpoint(event) {
  try {
    // Authenticate request with JWT (required)
    const auth = await authenticateRequest(event);
    if (!auth.authorized) {
      console.warn('Unauthorized refresh attempt');
      return {
        statusCode: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Unauthorized', message: 'JWT authentication required' })
      };
    }

    // Parse refresh token from body
    const body = JSON.parse(event.body || '{}');
    const refreshToken = body.refresh_token;

    if (!refreshToken) {
      console.warn('Missing refresh token');
      return {
        statusCode: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Bad Request', message: 'refresh_token required' })
      };
    }

    // Use OAuth2Client to refresh tokens
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    console.log('Refreshing access token for user:', auth.email);
    const { credentials } = await oauth2Client.refreshAccessToken();

    console.log('Successfully refreshed tokens:', {
      hasAccessToken: !!credentials.access_token,
      expiresAt: credentials.expiry_date
    });

    // Return new tokens
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date,
        expires_in: credentials.expiry_date ? Math.floor((credentials.expiry_date - Date.now()) / 1000) : 3600,
        refresh_token: credentials.refresh_token || refreshToken, // Some refreshes don't return new refresh token
        scope: credentials.scope,
        token_type: credentials.token_type || 'Bearer'
      })
    };
  } catch (error) {
    console.error('OAuth refresh error:', error);
    
    // Determine if this is an invalid grant error
    const isInvalidGrant = error.message?.includes('invalid_grant');
    const statusCode = isInvalidGrant ? 401 : 500;
    
    return {
      statusCode,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ 
        error: isInvalidGrant ? 'invalid_grant' : 'refresh_failed',
        message: error.message,
        details: 'Token refresh failed. Please reconnect.'
      })
    };
  }
}

/**
 * OAuth2 Token Revoke Endpoint
 * Revokes OAuth access/refresh tokens with Google
 * Requires JWT authentication
 */
async function oauthRevokeEndpoint(event) {
  try {
    // Authenticate request with JWT
    const auth = await authenticateRequest(event);
    if (!auth.authorized) {
      console.warn('Unauthorized revoke attempt');
      return {
        statusCode: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Unauthorized', message: 'JWT authentication required' })
      };
    }

    // Parse token from body
    const body = JSON.parse(event.body || '{}');
    const token = body.token;

    if (!token) {
      console.warn('Missing token to revoke');
      return {
        statusCode: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Bad Request', message: 'token required' })
      };
    }

    // Revoke token with Google
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );

    console.log('Revoking token for user:', auth.email);
    await oauth2Client.revokeToken(token);

    console.log('Successfully revoked token');
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ success: true, message: 'Token revoked successfully' })
    };
  } catch (error) {
    console.error('OAuth revoke error:', error);
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ 
        error: 'revoke_failed',
        message: error.message,
        details: 'Token revocation failed'
      })
    };
  }
}

/**
 * Helper function to generate HTML with postMessage script
 * Used to send OAuth results back to the parent window
 */
function generatePostMessageHTML(type, data) {
  const safeData = JSON.stringify(data).replace(/</g, '\\x3c').replace(/>/g, '\\x3e');
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>OAuth ${type === 'oauth_success' ? 'Success' : 'Error'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: ${type === 'oauth_success' ? '#f0f9ff' : '#fef2f2'};
    }
    .message {
      text-align: center;
      padding: 2rem;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    .text {
      font-size: 1.25rem;
      color: ${type === 'oauth_success' ? '#059669' : '#dc2626'};
    }
  </style>
</head>
<body>
  <div class="message">
    <div class="icon">${type === 'oauth_success' ? '✅' : '❌'}</div>
    <div class="text">
      ${type === 'oauth_success' ? 'Authorization successful!' : 'Authorization failed'}
    </div>
    <div style="margin-top: 1rem; font-size: 0.875rem; color: #6b7280;">
      This window will close automatically...
    </div>
  </div>
  <script>
    (function() {
      try {
        // Send message to opener
        if (window.opener) {
          window.opener.postMessage(
            {
              type: '${type}',
              data: ${safeData}
            },
            '*'
          );
          console.log('Message sent to opener');
        }
        
        // Close window after short delay
        setTimeout(function() {
          window.close();
        }, 1500);
      } catch (err) {
        console.error('PostMessage error:', err);
      }
    })();
  </script>
</body>
</html>`;
}

module.exports = {
  oauthCallbackEndpoint,
  oauthRefreshEndpoint,
  oauthRevokeEndpoint
};
