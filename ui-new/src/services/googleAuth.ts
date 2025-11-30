/**
 * Unified Google OAuth2 Authentication Service
 * 
 * Consolidates all Google authentication into a single OAuth2 flow
 * Replaces the dual JWT + OAuth2 system with a simpler, more secure approach
 */

import { getItem as getScopedItem } from '../utils/storage';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GGL_CID;

// Basic OAuth2 scopes - only what we need for login
// - openid: Required for OpenID Connect
// - email: User's email address
// - profile: Basic profile information (name, picture)
const BASIC_SCOPES = [
  'openid',
  'email',
  'profile'
].join(' ');

// Extended scopes for Google Drive integration (only requested when needed)
// 
// Scopes requested:
// - drive.file: Per-file access to files created or opened by the app
//   This allows us to create and manage Google Sheets in the user's Drive
//   WITHOUT requesting access to all their existing files
// 
// Note: Google's permission dialog may show "See, edit, create, and delete only
// the specific Google Drive files you use with this app" - this is correct and
// is the minimal permission needed for snippets and cloud sync features.
const DRIVE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

// Token storage keys - consolidated to single set
const TOKEN_KEYS = {
  ACCESS_TOKEN: 'google_access_token',
  REFRESH_TOKEN: 'google_refresh_token',
  TOKEN_EXPIRATION: 'google_token_expiration',
  GRANTED_SCOPES: 'google_granted_scopes', // Track which scopes were granted
  USER_EMAIL: 'user_email',
  USER_NAME: 'user_name',
  USER_PICTURE: 'user_picture',
  USER_SUB: 'user_sub' // Google user ID
};

/**
 * User profile information from OAuth2
 */
export interface UserProfile {
  email: string;
  name?: string;
  picture?: string;
  sub?: string; // Google user ID
}

/**
 * OAuth2 token response
 */
interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
  refresh_token?: string;
}

class GoogleAuthService {
  private tokenClient: any = null;
  private accessToken: string | null = null;
  private authCallbacks: ((authenticated: boolean) => void)[] = [];
  private currentScopes: string = BASIC_SCOPES; // Start with basic scopes

  constructor() {
    // MIGRATION: Move tokens from user-scoped storage back to global storage
    // This fixes the issue where tokens were incorrectly migrated to user-scoped storage
    this.migrateTokensToGlobal();
    
    // Load token from localStorage on initialization
    this.accessToken = localStorage.getItem(TOKEN_KEYS.ACCESS_TOKEN);
    this.currentScopes = localStorage.getItem(TOKEN_KEYS.GRANTED_SCOPES) || BASIC_SCOPES;
    
    console.log('🔐 [GoogleAuth Constructor] Initialized:', {
      hasToken: !!this.accessToken,
      tokenLength: this.accessToken?.length,
      currentScopes: this.currentScopes
    });
  }
  
  /**
   * One-time migration: Move tokens from user-scoped storage back to global
   * This fixes the bug where auth tokens were incorrectly scoped per-user
   */
  private migrateTokensToGlobal() {
    const userEmail = localStorage.getItem('user_email');
    if (!userEmail) return; // No user logged in, nothing to migrate
    
    const scopedPrefix = `user:${userEmail}:`;
    const tokenKeys = [
      TOKEN_KEYS.ACCESS_TOKEN,
      TOKEN_KEYS.REFRESH_TOKEN,
      TOKEN_KEYS.TOKEN_EXPIRATION,
      TOKEN_KEYS.GRANTED_SCOPES,
      TOKEN_KEYS.USER_NAME,
      TOKEN_KEYS.USER_PICTURE,
      TOKEN_KEYS.USER_SUB
    ];
    
    let migrated = false;
    tokenKeys.forEach(key => {
      const scopedKey = `${scopedPrefix}${key}`;
      const scopedValue = localStorage.getItem(scopedKey);
      const globalValue = localStorage.getItem(key);
      
      // If value exists in scoped storage but not in global, migrate it
      if (scopedValue && !globalValue) {
        localStorage.setItem(key, scopedValue);
        localStorage.removeItem(scopedKey); // Clean up scoped version
        migrated = true;
      }
    });
    
    if (migrated) {
      console.log('✅ Migrated auth tokens from user-scoped to global storage');
    }
  }

  /**
   * Register callback for authentication state changes
   */
  onAuthChange(callback: (authenticated: boolean) => void) {
    this.authCallbacks.push(callback);
    // Immediately call with current state
    callback(this.isAuthenticated());
  }

  /**
   * Notify all callbacks of auth state change
   */
  private notifyAuthChange(authenticated: boolean) {
    this.authCallbacks.forEach(cb => {
      try {
        cb(authenticated);
      } catch (error) {
        console.error('Auth callback error:', error);
      }
    });
  }

  /**
   * Initialize Google Identity Services
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔐 Initializing Google OAuth2...');
      
      if (!GOOGLE_CLIENT_ID) {
        const error = 'Google Client ID not configured. Please set VITE_GGL_CID in .env';
        console.error('❌', error);
        reject(new Error(error));
        return;
      }

      // Check if library already loaded
      // @ts-ignore
      if (typeof google !== 'undefined' && google.accounts) {
        console.log('✅ Google Identity Services already loaded');
        this.initializeTokenClient();
        this.checkAndRefreshToken(); // Check if token needs refresh on init
        resolve();
        return;
      }

      // Load the Google Identity Services library
      console.log('📥 Loading Google Identity Services library...');
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        console.log('✅ Google Identity Services library loaded');
        this.initializeTokenClient();
        this.checkAndRefreshToken(); // Check if token needs refresh on init
        resolve();
      };
      script.onerror = () => {
        const error = 'Failed to load Google Identity Services library';
        console.error('❌', error);
        reject(new Error(error));
      };
      document.head.appendChild(script);
    });
  }
  
  /**
   * Check if token exists and needs refresh on initialization
   */
  private checkAndRefreshToken() {
    const token = this.getAccessToken();
    if (!token) {
      console.log('🔍 No existing token found');
      // Dispatch init complete event even if no token
      window.dispatchEvent(new CustomEvent('google-auth-init-complete', {
        detail: { hasToken: false }
      }));
      return;
    }
    
    const expirationStr = localStorage.getItem(TOKEN_KEYS.TOKEN_EXPIRATION);
    if (!expirationStr) {
      console.log('⚠️ Token exists but no expiration - keeping as-is');
      // Dispatch init complete - token exists and is assumed valid
      window.dispatchEvent(new CustomEvent('google-auth-init-complete', {
        detail: { hasToken: true, refreshed: false }
      }));
      return;
    }
    
    const expiration = parseInt(expirationStr, 10);
    const now = Date.now();
    const timeUntilExpiry = expiration - now;
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);
    
    console.log(`🔍 Found existing token, expires in ${minutesUntilExpiry} minutes`);
    
    // CHANGED: Don't auto-refresh tokens on page load
    // Google's OAuth doesn't support truly silent refresh - it always shows a dialog
    // Instead, let tokens expire naturally and only refresh when we get a 401 error
    if (timeUntilExpiry < 5 * 60 * 1000) {
      console.log('⚠️ Token expiring soon but skipping auto-refresh to avoid popup');
      console.log('💡 Token will be used until it expires, then user will need to reconnect');
    }
    
    console.log('✅ Using existing token (no auto-refresh)');
    // Dispatch init complete - token exists
    window.dispatchEvent(new CustomEvent('google-auth-init-complete', {
      detail: { hasToken: true, refreshed: false }
    }));
  }

  /**
   * Initialize the token client
   */
  private initializeTokenClient() {
    // @ts-ignore
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: this.currentScopes, // Use current scopes (basic by default)
      callback: (response: TokenResponse) => {
        // Call async handler without awaiting (fire and forget)
        this.handleTokenResponse(response).catch(error => {
          console.error('❌ Token response handler error:', error);
          this.notifyAuthChange(false);
          // Dispatch init complete on error
          window.dispatchEvent(new CustomEvent('google-auth-init-complete', {
            detail: { hasToken: false, refreshed: false, error: true }
          }));
        });
      },
      error_callback: (error: any) => {
        console.error('❌ OAuth2 error:', error);
        this.notifyAuthChange(false);
        // Dispatch init complete on error
        window.dispatchEvent(new CustomEvent('google-auth-init-complete', {
          detail: { hasToken: false, refreshed: false, error: true }
        }));
      }
    });
  }

  /**
   * Handle token response from Google
   */
  private async handleTokenResponse(response: TokenResponse) {
    console.log('🎫 OAuth2 token received:', { 
      hasToken: !!response.access_token,
      expiresIn: response.expires_in,
      hasRefreshToken: !!response.refresh_token,
      hasIdToken: !!response.id_token,
      scope: response.scope
    });

    if (response.access_token) {
      // Sanitize and store access token
      const sanitizedToken = response.access_token.trim().replace(/[\r\n]/g, '');
      this.accessToken = sanitizedToken;
      localStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, sanitizedToken);

      // Store granted scopes
      if (response.scope) {
        this.currentScopes = response.scope;
        localStorage.setItem(TOKEN_KEYS.GRANTED_SCOPES, response.scope);
        console.log('✅ Granted scopes:', response.scope);
      }

      // Store expiration time
      if (response.expires_in) {
        const expirationTime = Date.now() + (response.expires_in * 1000);
        localStorage.setItem(TOKEN_KEYS.TOKEN_EXPIRATION, expirationTime.toString());
      }

      // Store refresh token if provided
      if (response.refresh_token) {
        localStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, response.refresh_token);
      }

      // Extract user info from ID token if present, otherwise fetch from API
      if (response.id_token) {
        console.log('📝 Extracting user info from ID token');
        this.extractUserProfile(response.id_token);
      } else {
        console.log('📝 No ID token, fetching user info from Google API');
        await this.fetchUserInfo(sanitizedToken);
      }

      // Also store in legacy key for backward compatibility during migration
      localStorage.setItem('google_drive_access_token', sanitizedToken);
      if (response.expires_in) {
        const expirationTime = Date.now() + (response.expires_in * 1000);
        localStorage.setItem('google_drive_token_expiration', expirationTime.toString());
      }

      console.log('✅ Google authentication successful');
      this.notifyAuthChange(true);

      // Dispatch event for other parts of the app
      window.dispatchEvent(new CustomEvent('google-auth-success', {
        detail: { accessToken: sanitizedToken }
      }));
      
      // Dispatch init complete event if this was a silent refresh during initialization
      window.dispatchEvent(new CustomEvent('google-auth-init-complete', {
        detail: { hasToken: true, refreshed: true }
      }));
    }
  }

  /**
   * Fetch user info from Google's UserInfo endpoint
   */
  private async fetchUserInfo(accessToken: string) {
    try {
      console.log('🌐 Fetching user info from Google API...');
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const userInfo = await response.json();
      console.log('✅ User info fetched:', {
        email: userInfo.email,
        name: userInfo.name
      });

      // Store user info
      if (userInfo.email) {
        localStorage.setItem(TOKEN_KEYS.USER_EMAIL, userInfo.email);
      }
      if (userInfo.name) {
        localStorage.setItem(TOKEN_KEYS.USER_NAME, userInfo.name);
      }
      if (userInfo.picture) {
        localStorage.setItem(TOKEN_KEYS.USER_PICTURE, userInfo.picture);
      }
      if (userInfo.id) {
        localStorage.setItem(TOKEN_KEYS.USER_SUB, userInfo.id);
      }
    } catch (error) {
      console.error('❌ Failed to fetch user info:', error);
      // Don't fail the auth flow, just log the error
    }
  }

  /**
   * Extract user profile from ID token
   */
  private extractUserProfile(idToken: string) {
    try {
      const base64Url = idToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);

      if (payload.email) {
        localStorage.setItem(TOKEN_KEYS.USER_EMAIL, payload.email);
      }
      if (payload.name) {
        localStorage.setItem(TOKEN_KEYS.USER_NAME, payload.name);
      }
      if (payload.picture) {
        localStorage.setItem(TOKEN_KEYS.USER_PICTURE, payload.picture);
      }
      if (payload.sub) {
        localStorage.setItem(TOKEN_KEYS.USER_SUB, payload.sub);
      }

      console.log('✅ User profile extracted:', {
        email: payload.email,
        name: payload.name
      });
    } catch (error) {
      console.error('Failed to extract user profile from ID token:', error);
    }
  }

  /**
   * Sign in with Google
   */
  async signIn(): Promise<void> {
    if (!this.tokenClient) {
      await this.init();
    }

    console.log('🔐 Requesting Google sign-in with scopes:', this.currentScopes);
    
    // Use prompt: '' (empty string) for existing users to silently refresh
    // Use prompt: 'consent' only if no existing token
    const hasExistingToken = !!localStorage.getItem(TOKEN_KEYS.ACCESS_TOKEN);
    const prompt = hasExistingToken ? '' : 'consent';
    
    console.log(`🔐 Sign-in mode: ${prompt || 'silent'} (hasExistingToken: ${hasExistingToken})`);
    
    this.tokenClient.requestAccessToken({ 
      prompt // Use silent refresh if user already logged in before
    });
  }

  /**
   * Sign in with Google Drive access (for Google Docs shares)
   * This requests Drive permissions immediately during sign-in
   */
  async signInWithDriveAccess(): Promise<void> {
    if (!this.tokenClient) {
      await this.init();
    }

    console.log('🔐 Requesting Google sign-in WITH Drive access...');
    
    // Update scopes to include Drive
    this.currentScopes = DRIVE_SCOPES;
    
    // Re-initialize token client with Drive scopes
    this.initializeTokenClient();
    
    // Request access token with Drive permissions
    this.tokenClient.requestAccessToken({ 
      prompt: 'consent' // Always show consent for Drive access
    });
  }

  /**
   * Sign out
   */
  signOut() {
    console.log('👋 Signing out...');
    
    // Revoke token with Google
    const token = this.getAccessToken();
    if (token) {
      this.revokeToken(token).catch(err => 
        console.warn('Failed to revoke token with Google:', err)
      );
    }
    
    // Clear all stored tokens
    Object.values(TOKEN_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    
    // Clear legacy keys
    localStorage.removeItem('google_drive_access_token');
    localStorage.removeItem('google_drive_token_expiration');

    this.accessToken = null;
    this.currentScopes = BASIC_SCOPES;
    this.notifyAuthChange(false);

    // Dispatch event
    window.dispatchEvent(new CustomEvent('google-auth-signout'));
  }

  /**
   * Request Google Drive permissions (only when user needs it)
   */
  async requestDriveAccess(): Promise<boolean> {
    try {
      console.log('📁 Requesting Google Drive permissions...');
      
      // Update scopes to include Drive
      this.currentScopes = DRIVE_SCOPES;
      
      // Re-initialize token client with new scopes
      if (!this.tokenClient) {
        await this.init();
      } else {
        this.initializeTokenClient();
      }
      
      // Request new token with Drive permissions
      return new Promise((resolve) => {
        const originalCallback = this.tokenClient.callback;
        
        this.tokenClient.callback = async (response: TokenResponse) => {
          // Call original handler
          await this.handleTokenResponse(response);
          
          // Restore original callback
          this.tokenClient.callback = originalCallback;
          
          // Check if we got Drive scope
          const hasDriveScope = response.scope?.includes('drive.file');
          resolve(hasDriveScope || false);
        };
        
        this.tokenClient.requestAccessToken({ 
          prompt: 'consent' // Show consent screen for new permissions
        });
      });
    } catch (error) {
      console.error('❌ Failed to request Drive access:', error);
      return false;
    }
  }

  /**
   * Revoke Google Drive permissions (remove Drive scope only, keep basic auth)
   * Used when user clicks "Disconnect" in Cloud Sync settings
   */
  async revokeDriveAccess(): Promise<boolean> {
    try {
      console.log('📁 Removing Google Drive permissions (keeping basic auth)...');
      
      // Update stored scopes to basic only
      this.currentScopes = BASIC_SCOPES;
      localStorage.setItem(TOKEN_KEYS.GRANTED_SCOPES, BASIC_SCOPES);
      
      // Clear legacy Drive keys
      localStorage.removeItem('google_drive_access_token');
      localStorage.removeItem('google_drive_token_expiration');
      
      // Reinitialize token client with basic scopes
      this.initializeTokenClient();
      
      // Dispatch a custom event for Drive disconnect (not full sign-out)
      window.dispatchEvent(new CustomEvent('google-drive-disconnected'));
      
      console.log('✅ Drive permissions removed, basic auth retained');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to revoke Drive access:', error);
      return false;
    }
  }

  /**
   * Revoke token with Google
   */
  private async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (response.ok) {
        console.log('✅ Token revoked with Google');
      } else {
        console.warn('⚠️ Token revocation returned:', response.status);
      }
    } catch (error) {
      console.error('❌ Failed to revoke token:', error);
      throw error;
    }
  }

  /**
   * Check if user has granted Drive permissions
   */
  hasDriveAccess(): boolean {
    const grantedScopes = localStorage.getItem(TOKEN_KEYS.GRANTED_SCOPES) || '';
    const hasDrive = grantedScopes.includes('drive.file');
    console.log('🔍 Checking Drive access:', { 
      grantedScopes: grantedScopes.substring(0, 100) + '...', 
      hasDrive 
    });
    return hasDrive;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    if (!token) {
      console.log('🔴 [isAuthenticated] No token found');
      return false;
    }

    // Check if token is expired
    const expirationStr = localStorage.getItem(TOKEN_KEYS.TOKEN_EXPIRATION);
    if (expirationStr) {
      const expiration = parseInt(expirationStr, 10);
      const now = Date.now();
      const isExpired = now >= expiration;
      const timeUntilExpiry = expiration - now;
      const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);
      
      console.log('🔐 [isAuthenticated] Token check:', {
        hasToken: true,
        expirationStr,
        expiration: new Date(expiration).toISOString(),
        now: new Date(now).toISOString(),
        minutesUntilExpiry,
        isExpired
      });
      
      if (isExpired) {
        console.log('🔴 Token expired - user needs to re-authenticate or wait for automatic refresh');
        return false;
      }
      
      // Note: Proactive refresh happens in checkAndRefreshToken(), not here
      // to avoid confusing synchronous checks with asynchronous refresh attempts
    } else {
      console.log('⚠️ [isAuthenticated] No expiration found, assuming valid');
    }

    console.log('✅ [isAuthenticated] Token is valid');
    return true;
  }
  
  /**
   * Attempt to silently refresh the token
   */
  private attemptSilentRefresh() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 attemptSilentRefresh() called');
    console.log('Stack trace:', new Error().stack);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (!this.tokenClient) {
      console.warn('⚠️ Cannot refresh: token client not initialized');
      // Dispatch init complete even if refresh fails
      window.dispatchEvent(new CustomEvent('google-auth-init-complete', {
        detail: { hasToken: false, refreshed: false }
      }));
      return;
    }
    
    // Check if scopes match before attempting refresh
    const grantedScopes = localStorage.getItem(TOKEN_KEYS.GRANTED_SCOPES) || '';
    const currentScopes = this.currentScopes;
    
    console.log('📊 Scope comparison:');
    console.log('  Granted:', grantedScopes);
    console.log('  Current:', currentScopes);
    
    // Compare scope sets (order-independent)
    const grantedSet = new Set(grantedScopes.split(' ').filter(s => s));
    const requiredSet = new Set(currentScopes.split(' ').filter(s => s));
    const scopesMatch = grantedSet.size === requiredSet.size && 
                       [...requiredSet].every(scope => grantedSet.has(scope));
    
    console.log('  Match:', scopesMatch);
    
    if (!scopesMatch) {
      console.log('⚠️ Scopes changed - skipping silent refresh to prevent unwanted auth dialog');
      console.log('📝 Granted:', grantedScopes);
      console.log('📝 Current:', currentScopes);
      // Dispatch init complete without refreshing
      window.dispatchEvent(new CustomEvent('google-auth-init-complete', {
        detail: { hasToken: true, refreshed: false, scopesMismatch: true }
      }));
      return;
    }
    
    console.log('⚠️ ⚠️ ⚠️  CALLING requestAccessToken() - AUTH DIALOG MAY APPEAR  ⚠️ ⚠️ ⚠️');
    console.log('🔄 Attempting silent token refresh (scopes match)...');
    try {
      // Try silent refresh first (no consent screen)
      this.tokenClient.requestAccessToken({ 
        prompt: '' // Silent refresh - no consent screen
      });
    } catch (error) {
      console.error('❌ Silent refresh failed:', error);
      // Dispatch init complete on failure
      window.dispatchEvent(new CustomEvent('google-auth-init-complete', {
        detail: { hasToken: false, refreshed: false }
      }));
    }
  }

  /**
   * Reload token from localStorage (call after external token updates)
   */
  reloadToken(): void {
    this.accessToken = localStorage.getItem(TOKEN_KEYS.ACCESS_TOKEN);
    console.log('🔄 Token reloaded from localStorage:', this.accessToken ? 'present' : 'missing');
  }

  /**
   * Clear cached access token (forces re-read from localStorage on next getAccessToken call)
   */
  clearAccessToken(): void {
    this.accessToken = null;
    console.log('🧹 Cleared cached access token');
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    if (!this.accessToken) {
      this.accessToken = localStorage.getItem(TOKEN_KEYS.ACCESS_TOKEN);
    }
    return this.accessToken;
  }

  /**
   * Get user profile
   */
  getUserProfile(): UserProfile | null {
    // Try scoped storage first (new system), then fall back to non-scoped (legacy)
    let email = localStorage.getItem(TOKEN_KEYS.USER_EMAIL);
    
    // If not found in non-scoped, try to get from scoped storage synchronously
    // The scoped storage uses format: "user:{email}:user_email"
    if (!email) {
      // Find any scoped user_email key
      const scopedKey = Object.keys(localStorage).find(k => k.endsWith(':user_email'));
      if (scopedKey) {
        email = localStorage.getItem(scopedKey);
      }
    }
    
    if (!email) return null;

    return {
      email,
      name: localStorage.getItem(TOKEN_KEYS.USER_NAME) || undefined,
      picture: localStorage.getItem(TOKEN_KEYS.USER_PICTURE) || undefined,
      sub: localStorage.getItem(TOKEN_KEYS.USER_SUB) || undefined
    };
  }

  /**
   * Check if token is expiring soon (within 10 minutes for aggressive refresh)
   */
  isTokenExpiringSoon(): boolean {
    const expirationStr = localStorage.getItem(TOKEN_KEYS.TOKEN_EXPIRATION);
    if (!expirationStr) return true; // Assume expiring if no expiration stored

    const expiration = parseInt(expirationStr, 10);
    const tenMinutes = 10 * 60 * 1000; // Refresh when 10 minutes left (more aggressive)
    return Date.now() >= (expiration - tenMinutes);
  }

  /**
   * Refresh access token (if refresh token available)
   * Uses silent refresh to avoid disrupting the user
   */
  async refreshToken(): Promise<boolean> {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 refreshToken() called');
    console.log('Stack trace:', new Error().stack);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check if scopes match before attempting refresh
    const grantedScopes = localStorage.getItem(TOKEN_KEYS.GRANTED_SCOPES) || '';
    const currentScopes = this.currentScopes;
    
    console.log('📊 Scope comparison in refreshToken:');
    console.log('  Granted:', grantedScopes);
    console.log('  Current:', currentScopes);
    
    // Compare scope sets (order-independent)
    const grantedSet = new Set(grantedScopes.split(' ').filter(s => s));
    const requiredSet = new Set(currentScopes.split(' ').filter(s => s));
    const scopesMatch = grantedSet.size === requiredSet.size && 
                       [...requiredSet].every(scope => grantedSet.has(scope));
    
    console.log('  Match:', scopesMatch);
    
    if (!scopesMatch) {
      console.log('⚠️ Scopes changed - skipping refresh to prevent unwanted auth dialog');
      return false;
    }
    
    console.log('🔄 Scopes match - proceeding with silent refresh...');
    
    try {
      if (!this.tokenClient) {
        console.warn('⚠️ Token client not initialized');
        return false;
      }

      // Return a promise that resolves when token is refreshed
      return new Promise((resolve) => {
        // Store original callback
        const originalCallback = this.tokenClient.callback;
        
        // Override callback temporarily to handle refresh
        this.tokenClient.callback = (response: TokenResponse) => {
          // Call the original handler
          this.handleTokenResponse(response).then(() => {
            console.log('✅ Token refreshed silently');
            resolve(true);
          }).catch((error) => {
            console.error('❌ Token refresh failed:', error);
            resolve(false);
          }).finally(() => {
            // Restore original callback
            this.tokenClient.callback = originalCallback;
          });
        };
        
        console.log('⚠️ ⚠️ ⚠️  CALLING requestAccessToken() from refreshToken() - AUTH DIALOG MAY APPEAR  ⚠️ ⚠️ ⚠️');
        // Request new token silently (no user interaction)
        this.tokenClient.requestAccessToken({ 
          prompt: '' // Empty string = silent refresh
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
          console.warn('⚠️ Token refresh timeout');
          this.tokenClient.callback = originalCallback;
          resolve(false);
        }, 10000);
      });
    } catch (error) {
      console.error('❌ Token refresh error:', error);
      return false;
    }
  }

  /**
   * Ensure we have a valid token, refresh if needed
   */
  async ensureValidToken(): Promise<string | null> {
    if (!this.isAuthenticated()) {
      console.log('🔴 Not authenticated');
      return null;
    }

    // TEMPORARY: Disable auto-refresh to prevent auth dialogs
    // Just return the existing token - it's valid for 37+ minutes
    console.log('✅ Returning existing token without refresh check');
    return this.getAccessToken();
  }
}

// Export singleton instance
export const googleAuth = new GoogleAuthService();
