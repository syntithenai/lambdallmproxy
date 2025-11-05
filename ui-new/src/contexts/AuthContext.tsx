import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { 
  loadAuthState, 
  saveAuthState, 
  clearAuthState, 
  decodeJWT, 
  isTokenExpiringSoon,
  shouldRefreshToken,
  getTokenTimeRemaining
} from '../utils/auth';
import type { AuthState, GoogleUser } from '../utils/auth';
import { setCurrentUser, clearUserStorage, migrateToUserScoped, USER_SCOPED_KEYS } from '../utils/userStorage';

interface AuthContextType extends AuthState {
  login: (credential: string) => void;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const loaded = loadAuthState();
    console.log('🔐 AuthProvider initializing with state from localStorage:', {
      isAuthenticated: loaded.isAuthenticated,
      hasToken: !!loaded.accessToken,
      tokenLength: loaded.accessToken?.length,
      userEmail: loaded.user?.email
    });
    return loaded;
  });
  const [hasAttemptedAutoLogin, setHasAttemptedAutoLogin] = useState(false);

  const login = useCallback((credential: string) => {
    try {
      const decoded = decodeJWT(credential);
      if (!decoded || !decoded.email) {
        console.error('Login failed: Invalid token or missing user info');
        return;
      }
      
      const user: GoogleUser = {
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        sub: decoded.sub
      };
      
      saveAuthState(user, credential);
      setAuthState({
        user,
        accessToken: credential,
        isAuthenticated: true
      });
      
      // SECURITY: Set current user for scoped storage
      setCurrentUser(user.email);
      
      // Migrate existing non-scoped localStorage keys to user-scoped
      migrateToUserScoped(user.email, [...USER_SCOPED_KEYS]);
      
      console.log('User logged in:', user.email);
    } catch (error) {
      console.error('Login failed:', error);
    }
  }, []);

  const logout = useCallback(() => {
    // SECURITY: Clear user-scoped storage before logging out
    clearUserStorage();
    
    clearAuthState();
    setAuthState({
      user: null,
      accessToken: null,
      isAuthenticated: false
    });
    
    // Reset to anonymous storage scope
    setCurrentUser(null);
    
    console.log('User logged out');
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    // ⚠️ IMPORTANT: Google ID tokens (JWT) cannot be refreshed
    // They expire after 1 hour and require user to re-authenticate
    // The /oauth/refresh endpoint only refreshes OAuth access tokens (ya29.*)
    // for Google APIs (YouTube, Sheets), NOT ID tokens for authentication
    
    console.log('ℹ️ ID token refresh not supported - user must re-authenticate when token expires');
    return false;
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!authState.accessToken) {
      return null;
    }

    // Check if token is ACTUALLY expired (not just "expiring soon")
    const timeRemaining = getTokenTimeRemaining(authState.accessToken);
    const minutesRemaining = Math.floor(timeRemaining / 60000);
    console.log(`🔍 getToken() checking validity: ${minutesRemaining} minutes remaining`);
    
    if (timeRemaining <= 0) {
      console.log('⚠️ ID token has expired (timeRemaining <= 0) - user must re-authenticate - LOGOUT #3: getToken() CHECK');
      logout();
      return null;
    }

    // Warn if token is expiring soon (< 5 minutes) but still allow usage
    if (timeRemaining < 5 * 60 * 1000) {
      const minutesRemaining = Math.floor(timeRemaining / 60000);
      console.warn(`⚠️ Token expires in ${minutesRemaining} minutes - user will need to re-authenticate soon`);
    }

    // Both JWT ID tokens (start with "eyJ") and OAuth access tokens (start with "ya29.") are valid
    // No need to enforce JWT format - access tokens work fine for authentication
    return authState.accessToken;
  }, [authState.accessToken, logout]);

  // Initialize user storage scope on mount
  useEffect(() => {
    if (authState.user?.email) {
      setCurrentUser(authState.user.email);
    } else {
      setCurrentUser(null);
    }
  }, [authState.user]);

  // Attempt auto-login on mount for returning users
  useEffect(() => {
    const attemptAutoLogin = async () => {
      if (hasAttemptedAutoLogin) {
        return; // Only try once
      }

      setHasAttemptedAutoLogin(true);

      // If user is already authenticated (loaded from localStorage on mount), verify token validity
      if (authState.isAuthenticated && authState.accessToken) {
        console.log('🔑 User already authenticated from localStorage:', authState.user?.email);
        
        // Check if token is ACTUALLY expired (not just "expiring soon")
        // This allows users to keep their session until the token truly expires
        const timeRemaining = getTokenTimeRemaining(authState.accessToken);
        const minutesRemaining = Math.floor(timeRemaining / 60000);
        console.log(`🔍 Checking token validity: ${minutesRemaining} minutes remaining`);
        
        if (timeRemaining <= 0) {
          console.log('⚠️ Token has expired (timeRemaining <= 0), clearing auth state - LOGOUT #1: AUTO-LOGIN CHECK');
          clearAuthState();
          setAuthState({
            user: null,
            accessToken: null,
            isAuthenticated: false
          });
        } else {
          console.log(`✅ Token still valid (${minutesRemaining} minutes remaining), user remains authenticated`);
        }
        return;
      }

      // Not authenticated - check if we have saved auth state that wasn't loaded
      const savedState = loadAuthState();
      if (!savedState.accessToken || !savedState.user) {
        console.log('ℹ️ No saved auth state found');
        return;
      }

      console.log('🔑 Attempting auto-login for:', savedState.user.email);

      // Check if token is ACTUALLY expired (not just "expiring soon")
      const timeRemaining = getTokenTimeRemaining(savedState.accessToken);
      const minutesRemaining = Math.floor(timeRemaining / 60000);
      console.log(`🔍 Checking saved token validity: ${minutesRemaining} minutes remaining`);
      
      if (timeRemaining <= 0) {
        console.log('⚠️ Token has expired (timeRemaining <= 0), clearing auth state - LOGOUT #2: SAVED STATE CHECK');
        clearAuthState();
      } else {
        // Token is still valid, restore auth state
        console.log(`✅ Auto-login successful with existing token (${minutesRemaining} minutes remaining)`);
        setAuthState(savedState);
      }
    };

    attemptAutoLogin();
  }, [hasAttemptedAutoLogin, authState.isAuthenticated, authState.accessToken, authState.user]);

  // Cancel Google One Tap when authenticated to prevent popup spam
  useEffect(() => {
    if (authState.isAuthenticated && typeof google !== 'undefined' && google?.accounts?.id) {
      // Cancel any pending One Tap prompts
      try {
        (google.accounts.id as any).cancel();
        console.log('✅ Cancelled any pending Google One Tap prompts (user authenticated)');
      } catch (error) {
        console.log('No Google One Tap prompt to cancel');
      }
    }
  }, [authState.isAuthenticated]);

  // Automatic token refresh before expiration
  useEffect(() => {
    if (!authState.isAuthenticated || !authState.accessToken) {
      return;
    }

    const currentToken = authState.accessToken;

    // Immediate check on mount
    if (shouldRefreshToken(currentToken)) {
      console.log('🔄 Token should be refreshed on mount (less than 15 min remaining)');
      refreshToken().then((success) => {
        if (!success && isTokenExpiringSoon(currentToken)) {
          // Only logout if token is actually expiring soon (< 5 min)
          console.warn('⚠️ Token refresh failed and token expiring soon, logging out... - LOGOUT #4: REFRESH ON MOUNT FAILED');
          logout();
        }
      });
    } else if (isTokenExpiringSoon(currentToken)) {
      // Token is critically close to expiring (< 5 min), must refresh or logout
      console.warn('⚠️ Token critically close to expiring on mount, attempting refresh...');
      refreshToken().then((success) => {
        if (!success) {
          console.warn('⚠️ Critical token refresh failed on mount, logging out... - LOGOUT #5: CRITICAL REFRESH ON MOUNT FAILED');
          logout();
        }
      });
    }

    // Check token every 2 minutes for proactive refresh
    const interval = setInterval(async () => {
      if (!authState.accessToken) return;
      
      const currentToken = authState.accessToken;
      
      // Proactively refresh when within 15 minutes of expiry
      if (shouldRefreshToken(currentToken)) {
        const timeRemaining = getTokenTimeRemaining(currentToken);
        const minutesRemaining = Math.floor(timeRemaining / 60000);
        
        console.log(`ℹ️ Token expires in ${minutesRemaining} minutes, attempting proactive refresh...`);
        
        const success = await refreshToken();
        
        if (!success && isTokenExpiringSoon(currentToken)) {
          // Only logout if refresh failed AND token is critically close to expiring (< 5 min)
          console.warn('⚠️ Token expiring soon and refresh unavailable. Please re-authenticate. - LOGOUT #6: INTERVAL CHECK FAILED');
          logout();
        } else if (!success) {
          console.log(`ℹ️ Silent refresh not available, but token still valid for ${minutesRemaining} minutes`);
        }
      }
    }, 2 * 60 * 1000); // Check every 2 minutes

    return () => clearInterval(interval);
  }, [authState.isAuthenticated, authState.accessToken, logout, refreshToken]);

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, refreshToken, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};
