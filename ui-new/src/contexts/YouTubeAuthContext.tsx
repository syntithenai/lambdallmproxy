/**
 * YouTube OAuth Authentication Context
 * 
 * Manages YouTube OAuth2 tokens and authentication flow for YouTube Transcript API access.
 * Provides methods to initiate OAuth flow, refresh tokens, and disconnect.
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface YouTubeTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;  // Unix timestamp in milliseconds
  scope: string;
  token_type: string;
}

interface YouTubeAuthContextValue {
  isConnected: boolean;
  isLoading: boolean;
  tokens: YouTubeTokens | null;
  error: string | null;
  
  // Actions
  initiateOAuthFlow: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  
  // Utility
  getAccessToken: () => Promise<string | null>;
}

const YouTubeAuthContext = createContext<YouTubeAuthContextValue | undefined>(undefined);

// OAuth configuration
// Uses VITE_GGL_CID from ui-new/.env
const OAUTH_CONFIG = {
  clientId: import.meta.env.VITE_GGL_CID,
  redirectUri: `${import.meta.env.VITE_API}/oauth/callback`,
  scope: 'https://www.googleapis.com/auth/youtube.readonly', // Read-only access to YouTube data
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth'
};

export const YouTubeAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tokens, setTokens] = useLocalStorage<YouTubeTokens | null>('youtube_oauth_tokens', null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if tokens are valid (not expired)
  const isConnected = useMemo(() => {
    if (!tokens) return false;
    // Consider expired if less than 5 minutes remaining
    return Date.now() < tokens.expires_at - 300000;
  }, [tokens]);

  // Auto-refresh tokens when they're close to expiry
  useEffect(() => {
    if (!tokens || !isConnected) return;

    const timeUntilExpiry = tokens.expires_at - Date.now();
    const refreshTime = Math.max(0, timeUntilExpiry - 600000); // Refresh 10 min before expiry

    if (refreshTime <= 0) {
      // Already expired or expiring soon, refresh now
      refreshTokens();
      return;
    }

    // Schedule refresh
    const timer = setTimeout(() => {
      refreshTokens();
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [tokens, isConnected]);

  // Get JWT token from auth context for authenticated requests
  const getJwtToken = useCallback((): string | null => {
    // Get JWT from Google One Tap or auth context
    // This should be integrated with your existing auth system
    const authData = localStorage.getItem('auth');
    if (!authData) return null;
    
    try {
      const parsed = JSON.parse(authData);
      return parsed.token || null;
    } catch {
      return null;
    }
  }, []);

  // Initiate OAuth flow
  const initiateOAuthFlow = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Generate state for CSRF protection
      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);

      // Build OAuth URL
      const params = new URLSearchParams({
        client_id: OAUTH_CONFIG.clientId,
        redirect_uri: OAUTH_CONFIG.redirectUri,
        response_type: 'code',
        scope: OAUTH_CONFIG.scope,
        access_type: 'offline',  // To get refresh token
        prompt: 'consent',       // Force consent to ensure refresh token
        state: state
      });

      const authUrl = `${OAUTH_CONFIG.authUrl}?${params}`;

      // Open popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        authUrl, 
        'oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Listen for postMessage from callback
      const handleMessage = (event: MessageEvent) => {
        // Validate origin for security
        const expectedOrigin = new URL(OAUTH_CONFIG.redirectUri).origin;
        if (event.origin !== expectedOrigin) {
          console.warn('Ignoring message from unexpected origin:', event.origin);
          return;
        }

        if (event.data.type === 'oauth_success') {
          // Validate state
          const savedState = sessionStorage.getItem('oauth_state');
          if (event.data.data.state !== savedState) {
            setError('Invalid state parameter - possible CSRF attack');
            setIsLoading(false);
            return;
          }

          // Save tokens
          const newTokens: YouTubeTokens = {
            access_token: event.data.data.tokens.access_token,
            refresh_token: event.data.data.tokens.refresh_token,
            expires_at: event.data.data.tokens.expires_at,
            scope: event.data.data.tokens.scope,
            token_type: event.data.data.tokens.token_type
          };
          
          console.log('Successfully obtained YouTube OAuth tokens');
          setTokens(newTokens);
          setIsLoading(false);
          sessionStorage.removeItem('oauth_state');
          window.removeEventListener('message', handleMessage);
        } else if (event.data.type === 'oauth_error') {
          console.error('OAuth error:', event.data.data.error);
          setError(event.data.data.message || event.data.data.error || 'Authorization failed');
          setIsLoading(false);
          sessionStorage.removeItem('oauth_state');
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);

      // Check if popup was closed without completing auth
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setIsLoading(false);
          window.removeEventListener('message', handleMessage);
          
          // Only set error if we haven't received a message
          const savedState = sessionStorage.getItem('oauth_state');
          if (savedState) {
            setError('Authorization cancelled');
            sessionStorage.removeItem('oauth_state');
          }
        }
      }, 500);

    } catch (err) {
      console.error('OAuth flow error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initiate OAuth flow');
      setIsLoading(false);
    }
  }, [setTokens]);

  // Refresh tokens
  const refreshTokens = useCallback(async () => {
    if (!tokens?.refresh_token) {
      console.warn('No refresh token available');
      return;
    }

    try {
      const jwtToken = getJwtToken();
      if (!jwtToken) {
        console.log('Cannot refresh YouTube tokens: JWT authentication not available');
        return;
      }

      const apiEndpoint = import.meta.env.VITE_EP || 
        'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

      console.log('Refreshing YouTube OAuth tokens...');
      const response = await fetch(`${apiEndpoint}/oauth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ refresh_token: tokens.refresh_token })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Token refresh failed: ${response.status}`);
      }

      const newTokens = await response.json();
      
      setTokens({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: newTokens.expires_at,
        scope: newTokens.scope,
        token_type: newTokens.token_type
      });
      
      console.log('Successfully refreshed YouTube OAuth tokens');
      setError(null);
    } catch (err) {
      console.error('Token refresh error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Token refresh failed';
      
      // If refresh fails with invalid_grant, clear tokens
      if (errorMessage.includes('invalid_grant')) {
        console.warn('Refresh token invalid, clearing tokens');
        setTokens(null);
        setError('YouTube access expired. Please reconnect.');
      } else {
        setError(errorMessage);
      }
    }
  }, [tokens, setTokens, getJwtToken]);

  // Get valid access token (auto-refresh if needed)
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!tokens) return null;

    // Check if expired or expiring soon (5 min buffer)
    if (Date.now() >= tokens.expires_at - 300000) {
      console.log('Access token expired or expiring soon, refreshing...');
      await refreshTokens();
      
      // Get updated tokens from storage
      const storedTokens = localStorage.getItem('youtube_oauth_tokens');
      if (storedTokens) {
        try {
          const parsed = JSON.parse(storedTokens);
          return parsed.access_token;
        } catch {
          return null;
        }
      }
      return null;
    }

    return tokens.access_token;
  }, [tokens, refreshTokens]);

  // Disconnect (revoke + clear)
  const disconnect = useCallback(async () => {
    if (!tokens) return;

    try {
      const jwtToken = getJwtToken();
      if (jwtToken) {
        const apiEndpoint = import.meta.env.VITE_EP || 
          'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

        console.log('Revoking YouTube OAuth tokens...');
        await fetch(`${apiEndpoint}/oauth/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`
          },
          body: JSON.stringify({ token: tokens.access_token })
        });
      }
    } catch (err) {
      console.error('Revoke error:', err);
      // Continue with local cleanup even if revoke fails
    } finally {
      setTokens(null);
      setError(null);
      console.log('YouTube OAuth tokens cleared');
    }
  }, [tokens, setTokens, getJwtToken]);

  return (
    <YouTubeAuthContext.Provider
      value={{
        isConnected,
        isLoading,
        tokens,
        error,
        initiateOAuthFlow,
        disconnect,
        refreshTokens,
        getAccessToken
      }}
    >
      {children}
    </YouTubeAuthContext.Provider>
  );
};

export const useYouTubeAuth = () => {
  const context = useContext(YouTubeAuthContext);
  if (!context) {
    throw new Error('useYouTubeAuth must be used within a YouTubeAuthProvider');
  }
  return context;
};
