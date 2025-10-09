import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { 
  loadAuthState, 
  saveAuthState, 
  clearAuthState, 
  decodeJWT, 
  isTokenExpiringSoon
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
    // Token refresh is disabled - user must re-login
    console.log('Token refresh requested, but automatic refresh is disabled');
    console.log('User will need to sign in again when token expires');
    return false;
  }, []);

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

  // Check for token expiration periodically and logout if expired
  useEffect(() => {
    if (!authState.isAuthenticated || !authState.accessToken) {
      return;
    }

    // Immediate check on mount
    if (isTokenExpiringSoon(authState.accessToken)) {
      console.warn('⚠️ Token expired on mount, logging out...');
      // Removed toast warning - just log out silently
      logout();
      return;
    }

    // Check token every 30 seconds for expiration
    const interval = setInterval(() => {
      if (!authState.accessToken) return;
      
      // Logout when expired (within 5 minutes) - removed warnings
      if (isTokenExpiringSoon(authState.accessToken)) {
        console.warn('⚠️ Token expired, logging out...');
        // Removed toast warning - just log out silently
        logout();
      }
    }, 30 * 1000); // 30 seconds

    return () => clearInterval(interval);
  }, [authState.isAuthenticated, authState.accessToken, logout]);

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, refreshToken, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};
