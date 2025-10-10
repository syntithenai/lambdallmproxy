// Google OAuth types and constants
export const GOOGLE_CLIENT_ID = '927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com';

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
export const saveAuthState = (user: GoogleUser, token: string) => {
  localStorage.setItem('google_user', JSON.stringify(user));
  localStorage.setItem('google_access_token', token);
};

// Load auth state from localStorage
export const loadAuthState = (): AuthState => {
  const savedUser = localStorage.getItem('google_user');
  const savedToken = localStorage.getItem('google_access_token');
  
  if (savedUser && savedToken) {
    return {
      user: JSON.parse(savedUser),
      accessToken: savedToken,
      isAuthenticated: true
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
  localStorage.removeItem('last_token_refresh');
};

// Decode JWT token (for displaying user info)
export const decodeJWT = (token: string): any => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to decode JWT:', e);
    return null;
  }
};

// Get time until token expires (in milliseconds)
export const getTokenTimeRemaining = (token: string): number => {
  try {
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
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      return true;
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

// Request a new token from Google
export const refreshGoogleToken = async (): Promise<string | null> => {
  try {
    // Use silent sign-in without popup
    return new Promise((resolve) => {
      if (typeof google === 'undefined' || !google.accounts) {
        console.error('Google API not loaded');
        resolve(null);
        return;
      }

      let hasResolved = false;
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          console.log('Silent token refresh timed out');
          resolve(null);
        }
      }, 5000);

      // Initialize with auto_select for silent refresh
      (google.accounts.id.initialize as any)({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: any) => {
          if (!hasResolved && response.credential) {
            hasResolved = true;
            clearTimeout(timeout);
            console.log('Token silently refreshed');
            resolve(response.credential);
          }
        },
        // CRITICAL: Enable automatic sign-in for returning users
        auto_select: true,
        // Don't show UI if auto-select fails
        cancel_on_tap_outside: true
      });

      // Attempt silent sign-in (won't show popup if auto_select works)
      // DO NOT call prompt() as it can show "Cannot continue with Google" popup
      // Instead, rely on auto_select in initialize() for silent refresh
      // If auto_select works, the callback will be triggered automatically
      // If it fails, we just time out gracefully without showing any UI
    });
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
};

// Get valid token (refresh if needed)
export const getValidToken = async (currentToken: string | null): Promise<string | null> => {
  if (!currentToken) {
    console.warn('No token available');
    return null;
  }

  // Check if token is still valid
  if (!isTokenExpiringSoon(currentToken)) {
    console.log('Token is still valid');
    return currentToken;
  }

  console.warn('Token expiring soon or expired, attempting refresh...');
  
  // Try to refresh the token
  const newToken = await refreshGoogleToken();
  
  if (newToken) {
    // Update stored token
    const decoded = decodeJWT(newToken);
    if (decoded) {
      const user: GoogleUser = {
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        sub: decoded.sub
      };
      saveAuthState(user, newToken);
      console.log('Token refreshed and saved');
    }
    return newToken;
  }
  
  // If refresh failed, clear auth state and return null
  console.error('Token refresh failed, clearing auth state');
  clearAuthState();
  return null;
};
