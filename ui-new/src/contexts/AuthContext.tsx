import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { loadAuthState, saveAuthState, clearAuthState, decodeJWT } from '../utils/auth';
import type { AuthState, GoogleUser } from '../utils/auth';

interface AuthContextType extends AuthState {
  login: (credential: string) => void;
  logout: () => void;
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

  const login = (credential: string) => {
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
  };

  const logout = () => {
    clearAuthState();
    setAuthState({
      user: null,
      accessToken: null,
      isAuthenticated: false
    });
    console.log('User logged out');
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
