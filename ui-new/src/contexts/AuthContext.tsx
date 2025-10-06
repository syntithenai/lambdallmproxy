import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { 
  loadAuthState, 
  saveAuthState, 
  clearAuthState, 
  decodeJWT, 
  isTokenExpiringSoon,
  getValidToken 
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
    if (!authState.accessToken) {
      return false;
    }

    const newToken = await getValidToken(authState.accessToken);
    
    if (newToken && newToken !== authState.accessToken) {
      const decoded = decodeJWT(newToken);
      if (decoded) {
        const user: GoogleUser = {
          email: decoded.email,
          name: decoded.name,
          picture: decoded.picture,
          sub: decoded.sub
        };
        
        saveAuthState(user, newToken);
        setAuthState({
          user,
          accessToken: newToken,
          isAuthenticated: true
        });
        
        console.log('Token refreshed successfully');
        return true;
      }
    } else if (newToken === authState.accessToken) {
      // Token is still valid
      return true;
    }
    
    // Token refresh failed, log user out
    console.log('Token refresh failed, logging out');
    logout();
    return false;
  }, [authState.accessToken, logout]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!authState.accessToken) {
      return null;
    }

    // Check if token needs refresh
    if (isTokenExpiringSoon(authState.accessToken)) {
      const success = await refreshToken();
      if (!success) {
        return null;
      }
      // Return the newly refreshed token from state
      const newState = loadAuthState();
      return newState.accessToken;
    }

    return authState.accessToken;
  }, [authState.accessToken, refreshToken]);

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
        console.log('Saved token expiring, attempting silent refresh...');
        const newToken = await getValidToken(savedState.accessToken);
        
        if (newToken) {
          // Successfully refreshed, login with new token
          login(newToken);
          console.log('Auto-login successful via token refresh');
        } else {
          // Failed to refresh, clear invalid state
          console.log('Auto-login failed: could not refresh token');
          clearAuthState();
        }
      } else {
        // Token is still valid, restore auth state
        setAuthState(savedState);
        console.log('Auto-login successful with existing token');
      }
    };

    attemptAutoLogin();
  }, [hasAttemptedAutoLogin, authState.isAuthenticated, login]);

  // Auto-refresh token periodically when authenticated
  useEffect(() => {
    if (!authState.isAuthenticated || !authState.accessToken) {
      return;
    }

    // Check token immediately on mount
    const checkToken = async () => {
      if (isTokenExpiringSoon(authState.accessToken!)) {
        console.log('Token expiring soon, refreshing...');
        await refreshToken();
      }
    };

    checkToken();

    // Check token every 5 minutes
    const interval = setInterval(() => {
      if (authState.accessToken && isTokenExpiringSoon(authState.accessToken)) {
        console.log('Token expiring soon, refreshing...');
        refreshToken();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [authState.isAuthenticated, authState.accessToken, refreshToken]);

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, refreshToken, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};
