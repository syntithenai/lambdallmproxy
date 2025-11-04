// Google OAuth types and constants
// Use environment variable - configured in ui-new/.env
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GGL_CID;

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

export interface AuthState {
  user: GoogleUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

// Initialize Google OAuth
export const initializeGoogleOAuth = (callback: (response: any) => void) => {
  if (typeof google !== 'undefined' && google.accounts) {
    if (!GOOGLE_CLIENT_ID) {
      console.error('❌ VITE_GGL_CID not configured in ui-new/.env');
      return;
    }
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: callback
    });
  }
};

// Render Google Sign-In button
export const renderGoogleButton = (elementId: string) => {
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.renderButton(
      document.getElementById(elementId)!,
      {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular'
      }
    );
  }
};

// Save auth state to localStorage
export const saveAuthState = (user: GoogleUser, token: string, refreshToken?: string, expiresIn?: number) => {
  // Sanitize tokens: remove whitespace and newlines before storing
  const sanitizedToken = token.trim().replace(/[\r\n]/g, '');
  const sanitizedRefreshToken = refreshToken?.trim().replace(/[\r\n]/g, '');
  
  localStorage.setItem('google_user', JSON.stringify(user));
  localStorage.setItem('google_access_token', sanitizedToken);
  if (sanitizedRefreshToken) {
    localStorage.setItem('google_refresh_token', sanitizedRefreshToken);
  }
  
  // Store expiration time if provided (for access tokens)
  if (expiresIn) {
    const expirationTime = Date.now() + (expiresIn * 1000);
    localStorage.setItem('google_token_expiration', expirationTime.toString());
  } else {
    // Try to extract from JWT (for ID tokens)
    try {
      const decoded = decodeJWT(sanitizedToken);
      if (decoded?.exp) {
        localStorage.setItem('google_token_expiration', (decoded.exp * 1000).toString());
      }
    } catch (e) {
      // If we can't decode, set a default expiration (1 hour)
      const defaultExpiration = Date.now() + (60 * 60 * 1000);
      localStorage.setItem('google_token_expiration', defaultExpiration.toString());
    }
  }
};

// Load auth state from localStorage
export const loadAuthState = (): AuthState & { refreshToken?: string } => {
  const savedUser = localStorage.getItem('google_user');
  const savedToken = localStorage.getItem('google_access_token');
  const savedRefreshToken = localStorage.getItem('google_refresh_token');
  
  if (savedUser && savedToken) {
    return {
      user: JSON.parse(savedUser),
      accessToken: savedToken,
      isAuthenticated: true,
      refreshToken: savedRefreshToken || undefined
    };
  }
  
  return {
    user: null,
    accessToken: null,
    isAuthenticated: false
  };
};

// Clear auth state
export const clearAuthState = () => {
  localStorage.removeItem('google_user');
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_refresh_token');
  localStorage.removeItem('google_token_expiration');
  localStorage.removeItem('last_token_refresh');
};

// Decode JWT token (for displaying user info)
// NOTE: This only works for JWT tokens (like Google ID tokens), not opaque access tokens
export const decodeJWT = (token: string): any => {
  try {
    // Check if token looks like a JWT (has 3 parts separated by dots)
    if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
      console.warn('Token is not a valid JWT format');
      return null;
    }
    
    const base64Url = token.split('.')[1];
    if (!base64Url) {
      return null;
    }
    
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.warn('Failed to decode JWT (token may be an access token, not an ID token):', e);
    return null;
  }
};

// Get time until token expires (in milliseconds)
export const getTokenTimeRemaining = (token: string): number => {
  try {
    // First check if we have stored expiration time (works for both JWT and access tokens)
    const storedExpiration = localStorage.getItem('google_token_expiration');
    if (storedExpiration) {
      const expirationTime = parseInt(storedExpiration, 10);
      const remaining = expirationTime - Date.now();
      return Math.max(0, remaining);
    }
    
    // Fallback: try to decode as JWT
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      return 0;
    }
    
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const remaining = expirationTime - currentTime;
    
    return Math.max(0, remaining);
  } catch (e) {
    console.error('Failed to get token time remaining:', e);
    return 0;
  }
};

// Check if token is expired or will expire soon (within 5 minutes)
export const isTokenExpiringSoon = (token: string): boolean => {
  try {
    // First check if we have stored expiration time (works for both JWT and access tokens)
    const storedExpiration = localStorage.getItem('google_token_expiration');
    if (storedExpiration) {
      const expirationTime = parseInt(storedExpiration, 10);
      const currentTime = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      const remaining = expirationTime - currentTime;
      return remaining < fiveMinutes;
    }
    
    // Fallback: try to decode as JWT
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      // If we can't determine expiration, assume token is still valid
      // This prevents spurious logouts for access tokens
      console.warn('Cannot determine token expiration, assuming valid');
      return false;
    }
    
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    const remaining = expirationTime - currentTime;
    
    // Log warning if expiring within 10 minutes
    if (remaining > 0 && remaining < 10 * 60 * 1000 && remaining >= fiveMinutes) {
      const minutesRemaining = Math.floor(remaining / 60000);
      console.warn(`⚠️ Token expires in ${minutesRemaining} minutes`);
    }
    
    return remaining < fiveMinutes;
  } catch (e) {
    console.error('Failed to check token expiration:', e);
    return true;
  }
};

// Check if token should be proactively refreshed (within 15 minutes of expiry)
export const shouldRefreshToken = (token: string): boolean => {
  try {
    // First check if we have stored expiration time (works for both JWT and access tokens)
    const storedExpiration = localStorage.getItem('google_token_expiration');
    if (storedExpiration) {
      const expirationTime = parseInt(storedExpiration, 10);
      const currentTime = Date.now();
      const fifteenMinutes = 15 * 60 * 1000;
      const remaining = expirationTime - currentTime;
      return remaining < fifteenMinutes;
    }
    
    // Fallback: try to decode as JWT
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      // If we can't determine expiration, don't trigger a refresh
      // This prevents spurious refresh attempts for access tokens
      console.warn('Cannot determine token expiration for refresh check, assuming no refresh needed');
      return false;
    }
    
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    
    const remaining = expirationTime - currentTime;
    
    // Refresh if less than 15 minutes remaining
    return remaining < fifteenMinutes;
  } catch (e) {
    console.error('Failed to check if token should refresh:', e);
    return false; // Changed from true to false - don't trigger refresh on error
  }
};

// Request a new token using refresh token via backend OAuth endpoint
export const refreshGoogleToken = async (currentAccessToken: string): Promise<{accessToken: string, refreshToken?: string} | null> => {
  try {
    // First, check if we have a refresh token
    const refreshToken = localStorage.getItem('google_refresh_token');
    
    if (refreshToken) {
      // Use backend OAuth refresh endpoint
      console.log('🔄 Refreshing token via OAuth refresh endpoint...');
      
      const API_BASE = import.meta.env.VITE_API || 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';
      const response = await fetch(`${API_BASE}/oauth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentAccessToken}` // JWT for auth
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Token refreshed successfully via OAuth');
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || refreshToken // Backend returns new refresh token or keep old one
        };
      } else {
        console.log('OAuth refresh failed:', response.status);
        return null;
      }
    }
    
    // No refresh token available
    console.log('ℹ️ No refresh token available for silent refresh');
    return null;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
};

// Get valid token (no refresh - ID tokens cannot be refreshed)
export const getValidToken = async (currentToken: string | null): Promise<string | null> => {
  if (!currentToken) {
    console.warn('No token available');
    return null;
  }

  // Ensure we have an ID token (JWT), not an OAuth access token
  if (!currentToken.startsWith('eyJ')) {
    console.error('❌ Token is not a valid JWT ID token');
    clearAuthState();
    return null;
  }

  // Check if token is still valid
  if (!isTokenExpiringSoon(currentToken)) {
    console.log('ID token is still valid');
    return currentToken;
  }

  // ⚠️ IMPORTANT: Google ID tokens cannot be refreshed
  // User must re-authenticate when token expires (typically 1 hour)
  console.warn('⚠️ ID token expired - user must re-authenticate');
  clearAuthState();
  return null;
};

// Welcome Wizard State Management
// These functions track whether a user has seen the welcome wizard

/**
 * Check if user has already completed the welcome wizard
 * @returns true if user has seen the wizard, false otherwise
 */
export const hasSeenWelcomeWizard = (): boolean => {
  try {
    const completed = localStorage.getItem('has_completed_welcome_wizard');
    return completed === 'true';
  } catch (e) {
    console.error('Failed to check welcome wizard status:', e);
    return false; // Show wizard if we can't determine status
  }
};

/**
 * Mark the welcome wizard as completed
 * Stores timestamp for analytics/debugging
 */
export const markWelcomeWizardComplete = (): void => {
  try {
    localStorage.setItem('has_completed_welcome_wizard', 'true');
    localStorage.setItem('welcome_wizard_completed_at', new Date().toISOString());
  } catch (e) {
    console.error('Failed to mark welcome wizard as complete:', e);
  }
};

/**
 * Reset welcome wizard state (for testing)
 */
export const resetWelcomeWizard = (): void => {
  try {
    localStorage.removeItem('has_completed_welcome_wizard');
    localStorage.removeItem('welcome_wizard_completed_at');
  } catch (e) {
    console.error('Failed to reset welcome wizard:', e);
  }
};

/**
 * Trigger the welcome wizard to show
 */
export const triggerWelcomeWizard = (): void => {
  try {
    console.log('🎓 Triggering welcome wizard...');
    
    // Reset the wizard state
    resetWelcomeWizard();
    console.log('🎓 Reset wizard state');
    
    // Dispatch a custom event to trigger the wizard
    const event = new CustomEvent('show-welcome-wizard');
    console.log('🎓 About to dispatch event:', event);
    console.log('🎓 Current event listeners on window:', window);
    
    const result = window.dispatchEvent(event);
    console.log('🎓 Event dispatch result:', result);
    console.log('🎓 Event dispatched successfully');
    
    // Also try a delayed dispatch in case of timing issues
    setTimeout(() => {
      console.log('🎓 Trying delayed dispatch...');
      const delayedEvent = new CustomEvent('show-welcome-wizard');
      window.dispatchEvent(delayedEvent);
    }, 100);
    
  } catch (e) {
    console.error('Failed to trigger welcome wizard:', e);
  }
};

/**
 * Check if welcome wizard should be shown
 * @param isAuthenticated - Whether user is logged in
 * @returns true if wizard should be displayed
 */
export const shouldShowWelcomeWizard = (isAuthenticated: boolean): boolean => {
  // Only show if:
  // 1. User is authenticated
  // 2. User hasn't seen the wizard before
  return isAuthenticated && !hasSeenWelcomeWizard();
};
