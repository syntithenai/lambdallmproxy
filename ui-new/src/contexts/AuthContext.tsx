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
  const [authState, setAuthState] = useState<AuthState>(() => loadAuthState());
  const [hasAttemptedAutoLogin, setHasAttemptedAutoLogin] = useState(false);

  const login = useCallback((credential: string) => {
    try {
      const decoded = decodeJWT(credential);
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
      
      console.log('User logged in:', user.email);
    } catch (error) {
      console.error('Login failed:', error);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthState();
    setAuthState({
      user: null,
      accessToken: null,
      isAuthenticated: false
    });
    console.log('User logged out');
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      if (!authState.accessToken) {
        console.log('No token to refresh');
        return false;
      }

      console.log('🔄 Attempting token refresh...');
      
      // Use the refreshGoogleToken function from auth utils
      const { refreshGoogleToken, decodeJWT, saveAuthState: saveAuthStateUtil } = await import('../utils/auth');
      const result = await refreshGoogleToken(authState.accessToken);
      
      if (result) {
        const decoded = decodeJWT(result.accessToken);
        if (decoded) {
          const user: GoogleUser = {
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture,
            sub: decoded.sub
          };
          
          // Save with the new refresh token if provided
          saveAuthStateUtil(user, result.accessToken, result.refreshToken);
          setAuthState({
            user,
            accessToken: result.accessToken,
            isAuthenticated: true
          });
          
          console.log('✅ Token refreshed successfully');
          return true;
        }
      }
      
      // Refresh failed - this is normal if refresh token expired or invalid
      console.log('ℹ️ Token refresh not available (user may need to re-authenticate manually)');
      return false;
    } catch (error) {
      console.log('ℹ️ Token refresh unavailable:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }, [authState.accessToken]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!authState.accessToken) {
      return null;
    }

    // Check if token is expired
    if (isTokenExpiringSoon(authState.accessToken)) {
      console.log('Token expired, logging out');
      logout();
      return null;
    }

    return authState.accessToken;
  }, [authState.accessToken, logout]);

  // Attempt auto-login on mount for returning users
  useEffect(() => {
    const attemptAutoLogin = async () => {
      if (hasAttemptedAutoLogin) {
        return; // Only try once
      }

      setHasAttemptedAutoLogin(true);

      // If user is already authenticated, nothing to do
      if (authState.isAuthenticated) {
        return;
      }

      // Check if we have saved auth state
      const savedState = loadAuthState();
      if (!savedState.accessToken || !savedState.user) {
        console.log('No saved auth state found');
        return;
      }

      console.log('Attempting auto-login for:', savedState.user.email);

      // Check if token is expired or expiring soon
      if (isTokenExpiringSoon(savedState.accessToken)) {
        console.log('Saved token expired, clearing auth state');
        clearAuthState();
      } else {
        // Token is still valid, restore auth state
        setAuthState(savedState);
        console.log('Auto-login successful with existing token');
      }
    };

    attemptAutoLogin();
  }, [hasAttemptedAutoLogin, authState.isAuthenticated, login]);

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
          console.warn('⚠️ Token refresh failed and token expiring soon, logging out...');
          logout();
        }
      });
    } else if (isTokenExpiringSoon(currentToken)) {
      // Token is critically close to expiring (< 5 min), must refresh or logout
      console.warn('⚠️ Token critically close to expiring on mount, attempting refresh...');
      refreshToken().then((success) => {
        if (!success) {
          console.warn('⚠️ Critical token refresh failed on mount, logging out...');
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
          console.warn('⚠️ Token expiring soon and refresh unavailable. Please re-authenticate.');
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
