import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { AuthState, GoogleUser } from '../utils/auth';
import { setCurrentUser, clearUserStorage, migrateToUserScoped, USER_SCOPED_KEYS } from '../utils/userStorage';
import { googleAuth } from '../services/googleAuth';

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
    // Initialize from googleAuth service
    const isAuth = googleAuth.isAuthenticated();
    const profile = googleAuth.getUserProfile();
    const token = googleAuth.getAccessToken();

    console.log('🔐 AuthProvider initializing with state from googleAuth:', {
      isAuthenticated: isAuth,
      hasToken: !!token,
      userEmail: profile?.email,
      tokenLength: token?.length
    });

    // If we have a token but not authenticated, it might be expired
    if (token && !isAuth) {
      console.warn('⚠️ Token exists but isAuthenticated returned false - token may be expired, will attempt refresh');
    }

    return {
      user: profile ? {
        email: profile.email,
        name: profile.name || '',
        picture: profile.picture || '',
        sub: profile.sub || ''
      } : null,
      accessToken: token,
      isAuthenticated: isAuth
    };
  });

  // CRITICAL: Set current user BEFORE first render of children
  // useLayoutEffect runs synchronously after AuthProvider mounts but before children mount
  // This ensures TTSProvider and other child providers can read user-scoped localStorage
  useLayoutEffect(() => {
    if (authState.user?.email) {
      setCurrentUser(authState.user.email);
      console.log('🔐 Set current user scope:', authState.user.email);
    } else {
      setCurrentUser(null);
      console.log('🔐 Set current user scope: anonymous');
    }
  }, []); // Empty deps - only run once on mount
  
  // Check authentication state after token refresh completes
  useEffect(() => {
    const handleInitComplete = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { hasToken, refreshed } = customEvent.detail;
      
      console.log('🔄 GoogleAuth init complete:', { hasToken, refreshed });
      
      if (hasToken) {
        const isAuth = googleAuth.isAuthenticated();
        const profile = googleAuth.getUserProfile();
        const token = googleAuth.getAccessToken();
        
        console.log('🔄 Checking auth state after init:', {
          isAuthenticated: isAuth,
          hasToken: !!token,
          userEmail: profile?.email
        });
        
        if (isAuth && profile && token) {
          const user: GoogleUser = {
            email: profile.email,
            name: profile.name || '',
            picture: profile.picture || '',
            sub: profile.sub || ''
          };

          setAuthState({
            user,
            accessToken: token,
            isAuthenticated: true
          });

          // SECURITY: Set current user for scoped storage
          setCurrentUser(user.email);

          // Migrate existing non-scoped localStorage keys to user-scoped
          migrateToUserScoped(user.email, [...USER_SCOPED_KEYS]);

          console.log('✅ AuthContext restored session for:', user.email);
        }
      }
    };
    
    window.addEventListener('google-auth-init-complete', handleInitComplete);
    
    return () => window.removeEventListener('google-auth-init-complete', handleInitComplete);
  }, []);

  // Listen for authentication changes from googleAuth service
  useEffect(() => {
    const handleAuthSuccess = () => {
      const profile = googleAuth.getUserProfile();
      const token = googleAuth.getAccessToken();
      
      if (profile && token) {
        const user: GoogleUser = {
          email: profile.email,
          name: profile.name || '',
          picture: profile.picture || '',
          sub: profile.sub || ''
        };

        setAuthState({
          user,
          accessToken: token,
          isAuthenticated: true
        });

        // SECURITY: Set current user for scoped storage
        setCurrentUser(user.email);

        // Migrate existing non-scoped localStorage keys to user-scoped
        migrateToUserScoped(user.email, [...USER_SCOPED_KEYS]);

        console.log('✅ AuthContext updated from googleAuth success event:', user.email);
      }
    };

    const handleAuthSignOut = () => {
      // SECURITY: Clear user-scoped storage before logging out
      clearUserStorage();

      setAuthState({
        user: null,
        accessToken: null,
        isAuthenticated: false
      });

      // Reset to anonymous storage scope
      setCurrentUser(null);

      console.log('✅ AuthContext updated from googleAuth signout event');
    };

    window.addEventListener('google-auth-success', handleAuthSuccess);
    window.addEventListener('google-auth-signout', handleAuthSignOut);

    return () => {
      window.removeEventListener('google-auth-success', handleAuthSuccess);
      window.removeEventListener('google-auth-signout', handleAuthSignOut);
    };
  }, []);

  const login = useCallback((credential: string) => {
    // This is called by LoginScreen with a JWT credential from One Tap
    // Store it using googleAuth and trigger the auth-success event
    try {
      // Parse the JWT to extract user info
      const parts = credential.split('.');
      if (parts.length !== 3) {
        console.error('❌ Invalid JWT format');
        return;
      }

      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      
      if (!payload.email) {
        console.error('❌ Invalid token: missing email');
        return;
      }

      const user: GoogleUser = {
        email: payload.email,
        name: payload.name || '',
        picture: payload.picture || '',
        sub: payload.sub || ''
      };

      // Calculate expiration (JWT exp is in seconds, convert to milliseconds)
      const expiration = payload.exp ? payload.exp * 1000 : Date.now() + 3600000; // 1 hour default

      // Store in localStorage using googleAuth keys
      localStorage.setItem('google_access_token', credential);
      localStorage.setItem('google_token_expiration', expiration.toString());
      localStorage.setItem('user_email', user.email);
      localStorage.setItem('user_name', user.name);
      if (user.picture) {
        localStorage.setItem('user_picture', user.picture);
      }

      // ⚠️ CRITICAL: Reload googleAuth cached token after JWT login
      googleAuth.reloadToken();

      // Update state
      setAuthState({
        user,
        accessToken: credential,
        isAuthenticated: true
      });

      // SECURITY: Set current user for scoped storage
      setCurrentUser(user.email);

      // Migrate existing non-scoped localStorage keys to user-scoped
      migrateToUserScoped(user.email, [...USER_SCOPED_KEYS]);

      console.log('✅ User logged in via JWT credential:', user.email);
    } catch (error) {
      console.error('❌ Login failed:', error);
    }
  }, []);

  const logout = useCallback(() => {
    googleAuth.signOut();
    // The signout event listener will handle the rest
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    // OAuth2 access tokens cannot be refreshed without refresh_token
    // which we don't currently have from the OAuth2 flow
    console.log('ℹ️ Token refresh not implemented - user must re-authenticate when token expires');
    return false;
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    const token = await googleAuth.ensureValidToken();
    
    if (!token && authState.isAuthenticated) {
      // Token expired, trigger logout
      console.log('⚠️ Token expired, logging out');
      logout();
      return null;
    }

    return token;
  }, [authState.isAuthenticated, logout]);

  // Cancel Google One Tap when authenticated to prevent popup spam
  useEffect(() => {
    if (authState.isAuthenticated && typeof google !== 'undefined' && google?.accounts?.id) {
      try {
        (google.accounts.id as any).cancel();
        console.log('✅ Cancelled any pending Google One Tap prompts (user authenticated)');
      } catch (error) {
        console.log('No Google One Tap prompt to cancel');
      }
    }
  }, [authState.isAuthenticated]);

  // Auto-refresh token aggressively to keep user logged in
  // Check every 30 seconds if token needs refresh
  useEffect(() => {
    if (!authState.isAuthenticated || !authState.accessToken) {
      return;
    }

    console.log('🔄 Starting aggressive token refresh monitor (check every 30s)');

    // Check immediately on mount
    const checkAndRefresh = async () => {
      const token = await googleAuth.ensureValidToken();
      
      if (!token) {
        console.warn('⚠️ Token validation failed, logging out');
        logout();
      } else {
        // Update state with fresh token if it changed
        const currentToken = googleAuth.getAccessToken();
        if (currentToken !== authState.accessToken) {
          const profile = googleAuth.getUserProfile();
          if (profile) {
            console.log('✅ Token refreshed, updating state');
            setAuthState(prev => ({
              ...prev,
              accessToken: currentToken
            }));
          }
        }
      }
    };

    // Check immediately
    checkAndRefresh();

    // Check every 30 seconds for aggressive refresh
    const interval = setInterval(checkAndRefresh, 30 * 1000); // 30 seconds

    return () => {
      console.log('🛑 Stopping token refresh monitor');
      clearInterval(interval);
    };
  }, [authState.isAuthenticated, authState.accessToken, logout]);

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, refreshToken, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};
