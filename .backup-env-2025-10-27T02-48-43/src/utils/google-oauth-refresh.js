/**
 * Google OAuth Token Refresh Utility
 * 
 * Handles automatic refresh of expired Google OAuth tokens
 * Works with tokens stored in frontend localStorage and sent via X-Google-Refresh-Token header
 */

const { google } = require('googleapis');

/**
 * Check if an error is an authentication error that might be fixed by token refresh
 * @param {Error} error - Error from Google API
 * @returns {boolean} True if error indicates expired/invalid token
 */
function isAuthError(error) {
  if (!error) return false;
  
  const message = error.message?.toLowerCase() || '';
  const code = error.code;
  
  // HTTP 401 or 403 status codes
  if (code === 401 || code === 403) return true;
  
  // Common authentication error messages
  const authErrorPatterns = [
    'invalid authentication credentials',
    'invalid credentials',
    'authentication failed',
    'token expired',
    'invalid token',
    'access token',
    'unauthorized',
    'unauthenticated'
  ];
  
  return authErrorPatterns.some(pattern => message.includes(pattern));
}

/**
 * Refresh Google OAuth access token using refresh token
 * @param {string} refreshToken - The refresh token from OAuth flow
 * @returns {Promise<{accessToken: string, expiresIn: number}>} New access token and expiry
 */
async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new Error('Refresh token is required');
  }
  
  console.log('🔄 Attempting to refresh Google OAuth token...');
  
  try {
    // Use Google's OAuth2 client to refresh the token
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
    );
    
    // Set the refresh token
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    
    // Request new access token
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (!credentials.access_token) {
      throw new Error('Failed to obtain new access token from refresh');
    }
    
    console.log('✅ Successfully refreshed Google OAuth token');
    console.log('   New token expires in:', credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : 'unknown');
    
    return {
      accessToken: credentials.access_token,
      expiresIn: credentials.expiry_date ? Math.floor((credentials.expiry_date - Date.now()) / 1000) : 3600
    };
  } catch (error) {
    console.error('❌ Failed to refresh Google OAuth token:', error.message);
    throw new Error(`Token refresh failed: ${error.message}`);
  }
}

/**
 * Execute a Google API operation with automatic token refresh on auth failure
 * @param {Function} operation - Async function that performs the Google API call
 * @param {string} accessToken - Current access token
 * @param {string} refreshToken - Refresh token (optional, if not provided, won't retry)
 * @returns {Promise<{result: any, newAccessToken?: string}>} Operation result and potentially new token
 */
async function executeWithTokenRefresh(operation, accessToken, refreshToken = null) {
  try {
    // First attempt with current token
    console.log('🔑 Executing operation with current access token');
    const result = await operation(accessToken);
    return { result, newAccessToken: null };
  } catch (error) {
    // Check if this is an auth error that might be fixed by refreshing
    if (!isAuthError(error)) {
      // Not an auth error, just rethrow
      console.log('❌ Operation failed with non-auth error:', error.message);
      throw error;
    }
    
    console.log('⚠️ Operation failed with auth error:', error.message);
    
    // If no refresh token, can't retry
    if (!refreshToken) {
      console.log('❌ No refresh token available, cannot retry');
      throw new Error('Authentication failed and no refresh token available. Please reconnect Google Drive in Settings → Cloud Sync.');
    }
    
    console.log('🔄 Attempting to refresh token and retry...');
    
    try {
      // Refresh the token
      const { accessToken: newAccessToken } = await refreshAccessToken(refreshToken);
      
      // Retry operation with new token
      console.log('🔁 Retrying operation with refreshed token');
      const result = await operation(newAccessToken);
      
      console.log('✅ Operation succeeded after token refresh');
      return { result, newAccessToken };
    } catch (refreshError) {
      console.error('❌ Token refresh or retry failed:', refreshError.message);
      throw new Error('Authentication failed. Please reconnect Google Drive in Settings → Cloud Sync.');
    }
  }
}

module.exports = {
  isAuthError,
  refreshAccessToken,
  executeWithTokenRefresh
};
