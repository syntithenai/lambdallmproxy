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
