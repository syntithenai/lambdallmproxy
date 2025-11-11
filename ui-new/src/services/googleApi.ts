/**
 * Google API Service
 * 
 * Handles initialization and authentication for Google Drive and Sheets APIs
 */

/// <reference types="gapi" />
/// <reference types="gapi.auth2" />

import { loadScript } from '../utils/scriptLoader';

// Google API configuration
const GAPI_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GAPI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
  'https://sheets.googleapis.com/$discovery/rest?version=v4'
];
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets'
].join(' ');

let isInitialized = false;
let isSignedIn = false;
let authInstance: any = null;

/**
 * Initialize Google API client
 */
export async function initGoogleApi(): Promise<void> {
  if (isInitialized) {
    console.log('Google API already initialized');
    return;
  }

  console.log('Initializing Google API...');

  // Load gapi script
  await loadScript('https://apis.google.com/js/api.js');

  return new Promise((resolve, reject) => {
    gapi.load('client:auth2', async () => {
      try {
        await gapi.client.init({
          apiKey: GAPI_API_KEY,
          clientId: GAPI_CLIENT_ID,
          discoveryDocs: DISCOVERY_DOCS,
          scope: SCOPES
        });

        authInstance = gapi.auth2.getAuthInstance();
        
        // Safely check if signed in
        if (authInstance && authInstance.isSignedIn) {
          isSignedIn = authInstance.isSignedIn.get();
        } else {
          isSignedIn = false;
        }
        
        isInitialized = true;

        console.log('✅ Google API initialized', { isSignedIn });
        resolve();
      } catch (error) {
        console.error('Failed to initialize Google API:', error);
        reject(error);
      }
    });
  });
}

/**
 * Sign in to Google
 */
export async function signInToGoogle(): Promise<void> {
  if (!isInitialized) {
    await initGoogleApi();
  }

  if (!authInstance) {
    throw new Error('Google Auth not initialized');
  }

  if (isSignedIn) {
    console.log('Already signed in to Google');
    return;
  }

  try {
    await authInstance.signIn();
    isSignedIn = true;
    console.log('✅ Signed in to Google');
  } catch (error) {
    console.error('Failed to sign in to Google:', error);
    throw error;
  }
}

/**
 * Sign out from Google
 */
export async function signOutFromGoogle(): Promise<void> {
  if (!authInstance) {
    console.log('Not signed in');
    return;
  }

  try {
    await authInstance.signOut();
    isSignedIn = false;
    console.log('✅ Signed out from Google');
  } catch (error) {
    console.error('Failed to sign out:', error);
    throw error;
  }
}

/**
 * Get current access token
 */
export function getAccessToken(): string | null {
  if (!authInstance || !isSignedIn) {
    return null;
  }

  const user = authInstance.currentUser.get();
  const authResponse = user.getAuthResponse();
  return authResponse.access_token;
}

/**
 * Check if user is signed in
 */
export function isUserSignedIn(): boolean {
  return isSignedIn;
}

/**
 * Get user email
 */
export function getUserEmail(): string | null {
  if (!authInstance || !isSignedIn) {
    return null;
  }

  const user = authInstance.currentUser.get();
  const profile = user.getBasicProfile();
  return profile.getEmail();
}

/**
 * Listen to sign-in state changes
 */
export function onSignInChange(callback: (isSignedIn: boolean) => void): void {
  if (!authInstance) {
    console.warn('Auth instance not initialized');
    return;
  }

  authInstance.isSignedIn.listen(callback);
}
