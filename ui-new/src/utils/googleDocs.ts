// Google Docs API integration for Swag feature with comprehensive debugging

import { googleDriveSync } from '../services/googleDriveSync';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GGL_CID;

// Google OAuth scopes - request necessary permissions
// drive.file: Only access files created or opened by this app (not all Drive files)
// Note: We create HTML files in Drive instead of Google Docs to avoid needing documents scope
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export interface GoogleDoc {
  id: string;
  name: string;
  modifiedTime: string;
}

/**
 * Escape HTML special characters to prevent XSS
 */
const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Convert HTTP URL to base64 data URI
 */
const fetchImageAsBase64 = async (url: string): Promise<string> => {
  try {
    console.log(`🌐 Fetching image from URL: ${url.substring(0, 100)}...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const blob = await response.blob();
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    console.log(`✅ Converted to base64 (${(base64.length / 1024).toFixed(1)} KB)`);
    return base64;
  } catch (error) {
    console.error(`❌ Failed to fetch image from ${url}:`, error);
    throw error;
  }
};

/**
 * Prepare content for HTML export by converting all images to base64
 * Handles:
 * - swag-image:// references (load from IndexedDB)
 * - HTTP/HTTPS URLs (fetch and convert)
 * - data: URLs (already base64, keep as-is)
 */
const prepareContentWithBase64Images = async (content: string): Promise<string> => {
  let processedContent = content;
  
  // Step 1: Convert swag-image:// references to base64
  const swagImageRegex = /swag-image:\/\/[A-Za-z0-9_]+/g;
  const swagImageMatches = content.match(swagImageRegex) || [];
  
  if (swagImageMatches.length > 0) {
    console.log(`📦 Found ${swagImageMatches.length} swag-image references, loading from IndexedDB...`);
    const { imageStorage } = await import('./imageStorage');
    processedContent = await imageStorage.processContentForDisplay(processedContent);
    console.log(`✅ Loaded swag-image references from IndexedDB`);
  }
  
  // Step 2: Find and convert HTTP/HTTPS URLs in markdown images
  const httpImageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
  const httpMatches = [...processedContent.matchAll(httpImageRegex)];
  
  if (httpMatches.length > 0) {
    console.log(`🌐 Found ${httpMatches.length} HTTP image URLs, fetching and converting to base64...`);
    
    // Process each unique URL
    const urlMap = new Map<string, string>();
    
    for (const match of httpMatches) {
      const [, , url] = match;
      
      // Skip if already processed
      if (urlMap.has(url)) {
        continue;
      }
      
      try {
        const base64 = await fetchImageAsBase64(url);
        urlMap.set(url, base64);
      } catch (error) {
        console.warn(`⚠️ Skipping image that failed to fetch: ${url}`);
        // Leave the URL as-is if fetch fails
        urlMap.set(url, url);
      }
    }
    
    // Replace all HTTP URLs with base64
    urlMap.forEach((base64, url) => {
      const urlRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
      processedContent = processedContent.replace(urlRegex, `![$1](${base64})`);
    });
    
    console.log(`✅ Converted ${urlMap.size} HTTP image URLs to base64`);
  }
  
  return processedContent;
};

/**
 * Format content as HTML, preserving line breaks and basic formatting
 */
const formatContentAsHtml = (content: string): string => {
  // First, extract and replace base64 images with placeholders
  const imageMap = new Map<string, { alt: string; dataUrl: string }>();
  let imageCounter = 0;
  
  // Match markdown image syntax with base64 data URLs: ![alt](data:image/...)
  let html = content.replace(/!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^\)]+)\)/g, (_match, alt, dataUrl) => {
    const placeholder = `__IMAGE_PLACEHOLDER_${imageCounter++}__`;
    imageMap.set(placeholder, { alt, dataUrl });
    return placeholder;
  });
  
  // Also match plain base64 data URLs (without markdown syntax)
  html = html.replace(/(data:image\/[^;]+;base64,[^\s<"']+)/g, (match) => {
    const placeholder = `__IMAGE_PLACEHOLDER_${imageCounter++}__`;
    imageMap.set(placeholder, { alt: 'Image', dataUrl: match });
    return placeholder;
  });
  
  // Escape HTML for security (but images are already extracted)
  html = escapeHtml(html);
  
  // Convert markdown-style code blocks to HTML
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  
  // Convert inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Convert **bold** to <strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Convert *italic* to <em>
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // Convert URLs to links (but not data URLs)
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Convert line breaks to <br>
  html = html.replace(/\n/g, '<br>');
  
  // Now restore images as proper HTML img tags with unescaped data URLs
  imageMap.forEach((img, placeholder) => {
    // Don't escape the data URL - it needs to remain intact with special characters
    html = html.replace(placeholder, `<img src="${img.dataUrl}" alt="${escapeHtml(img.alt)}" />`);
  });
  
  return html;
};

let tokenClient: any = null;
let accessToken: string | null = null;

// Token storage key - use a SEPARATE key from main auth to avoid conflicts
// Main app uses 'google_access_token' for CloudSync/Playlists (drive.file scope)
// Google Docs sharing uses separate token with drive + documents scopes
const TOKEN_STORAGE_KEY = 'google_docs_access_token';
const TOKEN_EXPIRATION_KEY = 'google_docs_token_expiration';

// Load token from localStorage on module initialization
accessToken = localStorage.getItem(TOKEN_STORAGE_KEY);

// Initialize Google Identity Services
export const initGoogleAuth = () => {
  return new Promise((resolve, reject) => {
    console.log('🔐 Initializing Google Auth...');
    console.log('📋 Client ID configured:', GOOGLE_CLIENT_ID ? 'YES' : 'NO');
    console.log('📋 Client ID value:', GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'MISSING');
    
    if (!GOOGLE_CLIENT_ID) {
      const error = 'Google Client ID not configured. Please set VITE_GGL_CID in ui-new/.env';
      console.error('❌', error);
      reject(new Error(error));
      return;
    }

    // Check if library already loaded
    // @ts-ignore
    if (typeof google !== 'undefined' && google.accounts) {
      console.log('✅ Google Identity Services already loaded');
      if (!tokenClient) {
        // @ts-ignore
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          callback: (response: any) => {
            console.log('🎫 Token callback received:', { 
              hasToken: !!response.access_token, 
              expiresIn: response.expires_in,
              error: response.error 
            });
            if (response.access_token) {
              // Sanitize token: remove whitespace and newlines before storing
              const sanitizedToken = response.access_token.trim().replace(/[\r\n]/g, '');
              accessToken = sanitizedToken;
              localStorage.setItem(TOKEN_STORAGE_KEY, sanitizedToken);
              
              // Store expiration time if provided
              if (response.expires_in) {
                const expirationTime = Date.now() + (response.expires_in * 1000);
                localStorage.setItem(TOKEN_EXPIRATION_KEY, expirationTime.toString());
              }
              
              console.log('✅ Access token received and stored:', sanitizedToken.substring(0, 20) + '...');
              
              // Trigger immediate sync after successful login (if cloud sync is enabled)
              googleDriveSync.triggerImmediateSync().catch(err => {
                console.warn('⚠️ Post-login sync failed:', err);
              });
              
              resolve(sanitizedToken);
            } else {
              console.error('❌ No access token in response:', response);
              reject(new Error('Failed to get access token'));
            }
          }
        });
      }
      resolve(tokenClient);
      return;
    }

    // Load the Google Identity Services library
    console.log('📥 Loading Google Identity Services library...');
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => {
      console.log('✅ Google Identity Services library loaded');
      // @ts-ignore
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          console.log('🎫 Token callback received:', { 
            hasToken: !!response.access_token, 
            expiresIn: response.expires_in,
            error: response.error 
          });
          if (response.access_token) {
            // Sanitize token: remove whitespace and newlines before storing
            const sanitizedToken = response.access_token.trim().replace(/[\r\n]/g, '');
            accessToken = sanitizedToken;
            localStorage.setItem(TOKEN_STORAGE_KEY, sanitizedToken);
            
            // Store expiration time if provided
            if (response.expires_in) {
              const expirationTime = Date.now() + (response.expires_in * 1000);
              localStorage.setItem(TOKEN_EXPIRATION_KEY, expirationTime.toString());
            }
            
            console.log('✅ Access token received and stored:', sanitizedToken.substring(0, 20) + '...');
            
            // Trigger immediate sync after successful login (if cloud sync is enabled)
            googleDriveSync.triggerImmediateSync().catch(err => {
              console.warn('⚠️ Post-login sync failed:', err);
            });
            
            resolve(sanitizedToken);
          } else {
            console.error('❌ No access token in response:', response);
            reject(new Error('Failed to get access token'));
          }
        }
      });
      console.log('✅ Token client initialized');
      resolve(tokenClient);
    };
    script.onerror = () => {
      console.error('❌ Failed to load Google Identity Services library');
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(script);
  });
};

// Request access token
export const requestGoogleAuth = async (): Promise<string> => {
  console.log('🔑 Requesting Google Auth...');
  console.log('� Call stack:', new Error().stack);
  console.log('�📋 Current token:', accessToken ? accessToken.substring(0, 20) + '...' : 'NONE');
  
  if (accessToken) {
    // Verify token is still valid by testing it
    console.log('🔍 Validating existing token...');
    try {
      const testResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      });
      if (testResponse.ok) {
        console.log('✅ Token is still valid');
        return accessToken;
      }
      console.warn('⚠️ Token invalid, clearing...');
      // Token expired, clear it
      accessToken = null;
    } catch (e) {
      console.error('❌ Token validation failed:', e);
      accessToken = null;
    }
  }

  if (!tokenClient) {
    console.log('🔧 Token client not initialized, initializing...');
    await initGoogleAuth();
  }

  return new Promise((resolve, reject) => {
    try {
      console.log('🎫 Setting up token callback...');
      tokenClient.callback = (response: any) => {
        console.log('📨 Token callback triggered:', { 
          hasToken: !!response.access_token, 
          error: response.error,
          errorDescription: response.error_description 
        });
        
        if (response.error) {
          const errorMsg = 'Authentication failed: ' + response.error + (response.error_description ? ' - ' + response.error_description : '') + '. Please grant permissions and try again.';
          console.error('❌', errorMsg);
          reject(new Error(errorMsg));
          return;
        }
        if (response.access_token) {
          accessToken = response.access_token;
          localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
          console.log('✅ New access token received and stored:', response.access_token.substring(0, 20) + '...');
          
          // Trigger immediate sync after successful login (if cloud sync is enabled)
          googleDriveSync.triggerImmediateSync().catch(err => {
            console.warn('⚠️ Post-login sync failed:', err);
          });
          
          resolve(response.access_token);
        } else {
          console.error('❌ No access token in response');
          reject(new Error('No access token received. Please grant permissions and try again.'));
        }
      };
      
      console.log('🚀 Requesting access token from Google...');
      console.log('📋 Scopes requested:', SCOPES);
      console.log('📋 Using Client ID:', GOOGLE_CLIENT_ID?.substring(0, 30) + '...');
      console.log('📋 Current origin:', window.location.origin);
      
      // Request with proper configuration
      tokenClient.requestAccessToken({ 
        prompt: ''  // Empty string for default behavior (select account + consent)
      });
      console.log('⏳ Waiting for user to grant permissions...');
    } catch (error) {
      console.error('❌ Failed to request access token:', error);
      reject(new Error('Failed to request access token. Please grant permissions and try again.'));
    }
  });
};

// Create a new Google Doc
export const createGoogleDoc = async (title: string): Promise<GoogleDoc> => {
  console.log('📄 Creating Google Doc:', title);
  const token = await requestGoogleAuth();
  console.log('🔑 Using token:', token.substring(0, 20) + '...');

  console.log('🚀 Making API request to Google Docs...');
  const response = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title
    })
  });
  
  console.log('📩 Response status:', response.status, response.statusText);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('❌ API Error:', errorData);
    const errorMessage = errorData.error?.message || response.statusText;
    const fullError = 'Failed to create document: ' + errorMessage + '. Please grant permissions and try again.';
    console.error('❌', fullError);
    throw new Error(fullError);
  }
  
  console.log('✅ Document created successfully');

  const doc = await response.json();
  const documentId = doc.documentId;
  
  // Add app metadata to the document so we can filter it later
  try {
    console.log('🏷️  Adding app metadata to document...');
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${documentId}?addParents=&removeParents=&fields=id`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            createdByApp: 'LambdaLLMProxy-Swag',
            appVersion: '1.0'
          },
          description: 'Created by LLM Proxy Swag feature'
        })
      }
    );
    
    if (metadataResponse.ok) {
      console.log('✅ Metadata added successfully');
    } else {
      console.warn('⚠️ Could not add metadata (document still created)');
    }
  } catch (metaError) {
    console.warn('⚠️ Could not add metadata:', metaError);
  }
  
  return {
    id: documentId,
    name: title,
    modifiedTime: new Date().toISOString()
  };
};

// List Google Docs created by this app
export const listGoogleDocs = async (): Promise<GoogleDoc[]> => {
  console.log('📝 Listing Google Docs...');
  const token = await requestGoogleAuth();
  console.log('🔑 Using token:', token.substring(0, 20) + '...');

  // Query for SPREADSHEET with EXACT name "Research Agent Swag"
  // If user renames it, we'll create a new one with the correct name
  const query = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name='Research Agent Swag'";
  console.log('🔍 Query:', query);
  console.log('🚀 Making API request to Google Drive...');
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query) + '&fields=files(id,name,modifiedTime,properties,description)&orderBy=modifiedTime desc',
    {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    }
  );
  
  console.log('📩 Response status:', response.status, response.statusText);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('❌ API Error:', errorData);
    const errorMessage = errorData.error?.message || response.statusText;
    const fullError = 'Failed to list documents: ' + errorMessage + '. Please grant permissions and try again.';
    console.error('❌', fullError);
    throw new Error(fullError);
  }
  
  const data = await response.json();
  console.log('✅ Documents retrieved:', data.files?.length || 0);
  
  // Only accept documents named EXACTLY "Research Agent Swag"
  // This ensures if user renames it, we'll create a fresh one
  const filtered = data.files.filter((file: any) => 
    file.name === 'Research Agent Swag'
  );
  console.log('✅ Documents with exact name "Research Agent Swag":', filtered.length);

  return filtered.map((file: any) => ({
    id: file.id,
    name: file.name,
    modifiedTime: file.modifiedTime
  }));
};

// Append content to a Google Doc
export const appendToGoogleDoc = async (documentId: string, content: string): Promise<void> => {
  console.log('➕ Appending to Google Doc:', documentId);
  const token = await requestGoogleAuth();
  console.log('🔑 Using token:', token.substring(0, 20) + '...');

  // First, get the document to find the end index
  console.log('📖 Getting document details...');
  const docResponse = await fetch('https://docs.googleapis.com/v1/documents/' + documentId, {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  });

  if (!docResponse.ok) {
    const errorData = await docResponse.json().catch(() => ({}));
    console.error('❌ API Error:', errorData);
    const errorMessage = errorData.error?.message || docResponse.statusText;
    const fullError = 'Failed to get document: ' + errorMessage + '. Please grant permissions and try again.';
    console.error('❌', fullError);
    throw new Error(fullError);
  }

  const doc = await docResponse.json();
  const endIndex = doc.body.content[doc.body.content.length - 1].endIndex - 1;
  console.log('📍 End index:', endIndex);

  // Append the content
  console.log('✍️ Appending content...');
  const response = await fetch('https://docs.googleapis.com/v1/documents/' + documentId + ':batchUpdate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: {
              index: endIndex
            },
            text: '\n\n' + content + '\n'
          }
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('❌ API Error:', errorData);
    const errorMessage = errorData.error?.message || response.statusText;
    const fullError = 'Failed to append to document: ' + errorMessage + '. Please grant permissions and try again.';
    console.error('❌', fullError);
    throw new Error(fullError);
  }
  
  console.log('✅ Content appended successfully');
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  return !!accessToken;
};

// Revoke access token
export const revokeGoogleAuth = () => {
  if (accessToken) {
    console.log('🔓 Revoking Google Auth...');
    // @ts-ignore
    google.accounts.oauth2.revoke(accessToken, () => {
      accessToken = null;
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      console.log('✅ Access token revoked and cleared from storage');
    });
  }
};

// ============================================================================
// FOLDER AND SETTINGS MANAGEMENT
// ============================================================================

const RESEARCH_AGENT_FOLDER_NAME = 'Research Agent';
const SETTINGS_FILE_NAME = 'Research Agent Settings';

/**
 * Find or create the "Research Agent" folder
 */
export const findOrCreateResearchAgentFolder = async (): Promise<string> => {
  console.log('📁 Finding or creating Research Agent folder...');
  const token = await requestGoogleAuth();

  // Search for existing folder
  const searchQuery = `mimeType='application/vnd.google-apps.folder' and name='${RESEARCH_AGENT_FOLDER_NAME}' and trashed=false`;
  console.log('🔍 Searching for folder:', searchQuery);

  const searchResponse = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(searchQuery) + '&fields=files(id,name)',
    {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    }
  );

  if (!searchResponse.ok) {
    const errorData = await searchResponse.json().catch(() => ({}));
    throw new Error('Failed to search for folder: ' + (errorData.error?.message || searchResponse.statusText));
  }

  const searchData = await searchResponse.json();
  
  if (searchData.files && searchData.files.length > 0) {
    const folderId = searchData.files[0].id;
    console.log('✅ Found existing folder:', folderId);
    return folderId;
  }

  // Create new folder
  console.log('📁 Creating new folder...');
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: RESEARCH_AGENT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Storage for Research Agent settings and snippets'
    })
  });

  if (!createResponse.ok) {
    const errorData = await createResponse.json().catch(() => ({}));
    throw new Error('Failed to create folder: ' + (errorData.error?.message || createResponse.statusText));
  }

  const folderData = await createResponse.json();
  console.log('✅ Created new folder:', folderData.id);
  return folderData.id;
};

/**
 * Find settings file in the Research Agent folder
 */
export const findSettingsFile = async (folderId: string): Promise<string | null> => {
  console.log('📄 Searching for settings file in folder:', folderId);
  const token = await requestGoogleAuth();

  const searchQuery = `name='${SETTINGS_FILE_NAME}' and '${folderId}' in parents and trashed=false`;
  console.log('🔍 Query:', searchQuery);

  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(searchQuery) + '&fields=files(id,name)',
    {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error('Failed to search for settings file: ' + (errorData.error?.message || response.statusText));
  }

  const data = await response.json();
  
  if (data.files && data.files.length > 0) {
    console.log('✅ Found settings file:', data.files[0].id);
    return data.files[0].id;
  }

  console.log('ℹ️  No settings file found');
  return null;
};

/**
 * Create settings file in the Research Agent folder
 */
export const createSettingsFile = async (folderId: string, settingsJson: string): Promise<string> => {
  console.log('📄 Creating settings file in folder:', folderId);
  const token = await requestGoogleAuth();

  // Create as a text file with JSON content
  const boundary = '-------314159265358979323846';
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelim = '\r\n--' + boundary + '--';

  const metadata = {
    name: SETTINGS_FILE_NAME,
    mimeType: 'text/plain',
    parents: [folderId],
    description: 'Research Agent Settings - Contains API keys and provider configuration'
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: text/plain\r\n\r\n' +
    settingsJson +
    closeDelim;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body: multipartRequestBody
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error('Failed to create settings file: ' + (errorData.error?.message || response.statusText));
  }

  const fileData = await response.json();
  console.log('✅ Settings file created:', fileData.id);
  return fileData.id;
};

/**
 * Update existing settings file content
 */
export const updateSettingsFile = async (fileId: string, settingsJson: string): Promise<void> => {
  console.log('📝 Updating settings file:', fileId);
  const token = await requestGoogleAuth();

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media', {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'text/plain'
    },
    body: settingsJson
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error('Failed to update settings file: ' + (errorData.error?.message || response.statusText));
  }

  console.log('✅ Settings file updated');
};

/**
 * Check if settings exist in Google Drive (without loading them)
 * Useful for showing the "Load" button when settings are available
 */
export const hasSettingsInDrive = async (): Promise<boolean> => {
  try {
    console.log('🔍 Checking if settings exist in Google Drive...');
    console.log('🔐 Authentication status:', isAuthenticated());
    
    if (!isAuthenticated()) {
      console.log('ℹ️  Not authenticated - assuming settings might exist (will prompt on load)');
      // Return true to show the Load button even when not authenticated
      // The loadSettingsFromDrive function will handle authentication
      return true;
    }
    
    console.log('� Finding Research Agent folder...');
    const folderId = await findOrCreateResearchAgentFolder();
    console.log('📁 Folder ID:', folderId);
    
    console.log('📄 Searching for settings file...');
    const fileId = await findSettingsFile(folderId);
    console.log('📄 File ID:', fileId || 'null');
    
    const exists = fileId !== null;
    console.log(exists ? '✅ Settings file EXISTS in Google Drive' : 'ℹ️  No settings file found in Google Drive');
    return exists;
  } catch (error) {
    console.error('❌ Failed to check for settings in Google Drive:', error);
    // Return true on error to give users the option to try loading
    return true;
  }
};

/**
 * Load settings from Google Drive
 */
export const loadSettingsFromDrive = async (): Promise<string | null> => {
  try {
    console.log('📥 Loading settings from Google Drive...');
    const folderId = await findOrCreateResearchAgentFolder();
    const fileId = await findSettingsFile(folderId);

    if (!fileId) {
      console.log('ℹ️  No settings file found in Google Drive');
      return null;
    }

    const token = await requestGoogleAuth();
    const response = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    if (!response.ok) {
      throw new Error('Failed to download settings: ' + response.statusText);
    }

    const content = await response.text();
    console.log('✅ Settings loaded from Google Drive');
    return content;
  } catch (error) {
    console.error('❌ Failed to load settings from Google Drive:', error);
    throw error;
  }
};

/**
 * Save settings to Google Drive
 */
export const saveSettingsToDrive = async (settingsJson: string): Promise<void> => {
  try {
    console.log('💾 Saving settings to Google Drive...');
    const folderId = await findOrCreateResearchAgentFolder();
    const fileId = await findSettingsFile(folderId);

    if (fileId) {
      await updateSettingsFile(fileId, settingsJson);
    } else {
      await createSettingsFile(folderId, settingsJson);
    }

    console.log('✅ Settings saved to Google Drive');
  } catch (error) {
    console.error('❌ Failed to save settings to Google Drive:', error);
    throw error;
  }
};

/**
 * Update createGoogleDoc to use the Research Agent folder
 */
export const createGoogleDocInFolder = async (title: string): Promise<GoogleDoc> => {
  console.log('📄 Creating Google Doc in Research Agent folder:', title);
  const token = await requestGoogleAuth();
  const folderId = await findOrCreateResearchAgentFolder();

  console.log('🚀 Making API request to Google Docs...');
  const response = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title
    })
  });
  
  console.log('📩 Response status:', response.status, response.statusText);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || response.statusText;
    const fullError = 'Failed to create document: ' + errorMessage + '. Please grant permissions and try again.';
    console.error('❌', fullError);
    throw new Error(fullError);
  }
  
  const doc = await response.json();
  const documentId = doc.documentId;
  
  // Move document to Research Agent folder
  try {
    console.log('📁 Moving document to Research Agent folder...');
    const moveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${documentId}?addParents=${folderId}&fields=id,parents`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + token
        }
      }
    );
    
    if (moveResponse.ok) {
      console.log('✅ Document moved to folder');
    } else {
      console.warn('⚠️ Could not move document to folder (document still created)');
    }
  } catch (moveError) {
    console.warn('⚠️ Could not move document to folder:', moveError);
  }

  // Add app metadata
  try {
    console.log('🏷️  Adding app metadata to document...');
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${documentId}?fields=id`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            createdByApp: 'LambdaLLMProxy-Swag',
            appVersion: '1.0'
          },
          description: 'Created by LLM Proxy Swag feature'
        })
      }
    );
    
    if (metadataResponse.ok) {
      console.log('✅ Metadata added successfully');
    } else {
      console.warn('⚠️ Could not add metadata (document still created)');
    }
  } catch (metaError) {
    console.warn('⚠️ Could not add metadata:', metaError);
  }
  
  return {
    id: documentId,
    name: title,
    modifiedTime: new Date().toISOString()
  };
};

/**
 * Find or create "shares" subfolder within "Research Agent" folder
 */
export const findOrCreateSharesFolder = async (accessToken: string): Promise<string> => {
  const baseFolder = await findOrCreateResearchAgentFolder();
  
  // Search for "shares" folder within Research Agent folder
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='shares' and '${baseFolder}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!searchResponse.ok) {
    throw new Error(`Failed to search for shares folder: ${searchResponse.statusText}`);
  }

  const searchData = await searchResponse.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create "shares" folder
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'shares',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [baseFolder],
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create shares folder: ${createResponse.statusText}`);
  }

  const createData = await createResponse.json();
  return createData.id;
};

/**
 * Make a Google Document publicly accessible (anyone with link can view)
 * Returns the public web view link
 */
export const makeDocumentPublic = async (documentId: string, accessToken: string): Promise<string> => {
  // Set public permissions
  const permissionResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${documentId}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    }
  );

  if (!permissionResponse.ok) {
    throw new Error(`Failed to set public permissions: ${permissionResponse.statusText}`);
  }

  // Get the webViewLink
  const fileResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${documentId}?fields=webViewLink`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!fileResponse.ok) {
    throw new Error(`Failed to get document link: ${fileResponse.statusText}`);
  }

  const fileData = await fileResponse.json();
  return fileData.webViewLink;
};

/**
 * Convert markdown-style content to Google Docs API format requests
 * Handles: headers (###), bold (**text**), italic (*text*), links, code blocks, lists
 */
export const convertToGoogleDocsFormat = (content: string, startIndex: number = 1): any[] => {
  const requests: any[] = [];
  let currentIndex = startIndex;

  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (!line.trim()) {
      // Empty line - add newline
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: '\n',
        },
      });
      currentIndex += 1;
      continue;
    }

    // Header detection (### Header)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2] + '\n';
      
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: headerText,
        },
      });
      
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: currentIndex,
            endIndex: currentIndex + headerText.length - 1,
          },
          paragraphStyle: {
            namedStyleType: `HEADING_${Math.min(level, 6)}`,
          },
          fields: 'namedStyleType',
        },
      });
      
      currentIndex += headerText.length;
      continue;
    }

    // List detection (- item or * item)
    const listMatch = line.match(/^[\-\*]\s+(.+)$/);
    if (listMatch) {
      const listText = '• ' + listMatch[1] + '\n';
      
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: listText,
        },
      });
      
      currentIndex += listText.length;
      continue;
    }

    // Code block detection (```code```)
    const codeBlockMatch = line.match(/^```(.*)$/);
    if (codeBlockMatch) {
      // Find closing ```
      let codeContent = '';
      let j = i + 1;
      while (j < lines.length && !lines[j].match(/^```$/)) {
        codeContent += lines[j] + '\n';
        j++;
      }
      
      if (j < lines.length) {
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: codeContent,
          },
        });
        
        requests.push({
          updateTextStyle: {
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + codeContent.length,
            },
            textStyle: {
              fontFamily: 'Courier New',
              fontSize: { magnitude: 10, unit: 'PT' },
            },
            fields: 'fontFamily,fontSize',
          },
        });
        
        currentIndex += codeContent.length;
        i = j; // Skip processed lines
        continue;
      }
    }

    // Regular text with inline formatting
    let processedLine = line + '\n';
    const textStartIndex = currentIndex;
    
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: processedLine,
      },
    });
    
    currentIndex += processedLine.length;

    // Apply inline formatting (bold, italic, links)
    // Bold (**text**)
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    let offset = 0;
    
    while ((match = boldRegex.exec(line)) !== null) {
      const matchStart = textStartIndex + match.index - offset;
      const matchEnd = matchStart + match[1].length;
      
      requests.push({
        updateTextStyle: {
          range: {
            startIndex: matchStart,
            endIndex: matchEnd,
          },
          textStyle: { bold: true },
          fields: 'bold',
        },
      });
      
      // Remove markdown syntax
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: matchEnd,
            endIndex: matchEnd + 2, // **
          },
        },
      });
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: matchStart - 2,
            endIndex: matchStart,
          },
        },
      });
      
      offset += 4; // Account for removed **
    }

    // Italic (*text*)
    const italicRegex = /\*(.+?)\*/g;
    offset = 0;
    
    while ((match = italicRegex.exec(line)) !== null) {
      const matchStart = textStartIndex + match.index - offset;
      const matchEnd = matchStart + match[1].length;
      
      requests.push({
        updateTextStyle: {
          range: {
            startIndex: matchStart,
            endIndex: matchEnd,
          },
          textStyle: { italic: true },
          fields: 'italic',
        },
      });
      
      // Remove markdown syntax
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: matchEnd,
            endIndex: matchEnd + 1, // *
          },
        },
      });
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: matchStart - 1,
            endIndex: matchStart,
          },
        },
      });
      
      offset += 2; // Account for removed *
    }

    // Links [text](url)
    const linkRegex = /\[(.+?)\]\((.+?)\)/g;
    offset = 0;
    
    while ((match = linkRegex.exec(line)) !== null) {
      const matchStart = textStartIndex + match.index - offset;
      const matchEnd = matchStart + match[1].length;
      
      requests.push({
        updateTextStyle: {
          range: {
            startIndex: matchStart,
            endIndex: matchEnd,
          },
          textStyle: {
            link: { url: match[2] },
          },
          fields: 'link',
        },
      });
      
      // Remove markdown syntax [text](url) -> text
      const urlPartLength = match[2].length + 3; // ](url)
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: matchEnd,
            endIndex: matchEnd + urlPartLength,
          },
        },
      });
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: matchStart - 1,
            endIndex: matchStart,
          },
        },
      });
      
      offset += urlPartLength + 1; // Account for removed []()
    }
  }

  return requests;
};

/**
 * Format Feed item with rich text
 * Includes: title header, image, description, swags, sources
 */
export const formatFeedItem = (item: any, startIndex: number = 1): any[] => {
  const requests: any[] = [];
  let currentIndex = startIndex;

  // Title as Heading 1
  const titleText = item.title + '\n';
  requests.push({
    insertText: {
      location: { index: currentIndex },
      text: titleText,
    },
  });
  requests.push({
    updateParagraphStyle: {
      range: {
        startIndex: currentIndex,
        endIndex: currentIndex + titleText.length - 1,
      },
      paragraphStyle: {
        namedStyleType: 'HEADING_1',
      },
      fields: 'namedStyleType',
    },
  });
  currentIndex += titleText.length;

  // Image (if available)
  if (item.imageUrl) {
    // Note: Google Docs API requires image to be uploaded first
    // For now, we'll insert the image URL as a link
    const imageText = '[View Image]\n\n';
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: imageText,
      },
    });
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: currentIndex,
          endIndex: currentIndex + imageText.length - 3,
        },
        textStyle: {
          link: { url: item.imageUrl },
          foregroundColor: {
            color: {
              rgbColor: { red: 0.2, green: 0.5, blue: 0.8 },
            },
          },
        },
        fields: 'link,foregroundColor',
      },
    });
    currentIndex += imageText.length;
  }

  // Description
  if (item.description) {
    const descText = item.description + '\n\n';
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: descText,
      },
    });
    currentIndex += descText.length;
  }

  // Swags (as bullet list)
  if (item.swags && item.swags.length > 0) {
    const swagsHeader = 'Tags:\n';
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: swagsHeader,
      },
    });
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: currentIndex,
          endIndex: currentIndex + swagsHeader.length - 1,
        },
        textStyle: { bold: true },
        fields: 'bold',
      },
    });
    currentIndex += swagsHeader.length;

    for (const swag of item.swags) {
      const swagText = `• ${swag}\n`;
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: swagText,
        },
      });
      currentIndex += swagText.length;
    }
    currentIndex += 1; // Extra newline
  }

  // Sources (as numbered list with links)
  if (item.sources && item.sources.length > 0) {
    const sourcesHeader = '\nSources:\n';
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: sourcesHeader,
      },
    });
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: currentIndex + 1,
          endIndex: currentIndex + sourcesHeader.length - 1,
        },
        textStyle: { bold: true },
        fields: 'bold',
      },
    });
    currentIndex += sourcesHeader.length;

    for (let i = 0; i < item.sources.length; i++) {
      const source = item.sources[i];
      const sourceText = `${i + 1}. ${source.title || source.url}\n`;
      
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: sourceText,
        },
      });
      
      if (source.url) {
        requests.push({
          updateTextStyle: {
            range: {
              startIndex: currentIndex + 3, // After "1. "
              endIndex: currentIndex + sourceText.length - 1,
            },
            textStyle: {
              link: { url: source.url },
            },
            fields: 'link',
          },
        });
      }
      
      currentIndex += sourceText.length;
    }
  }

  return requests;
};

/**
 * Format Snippet with rich text
 * Includes: metadata bar (date, swags), title, content
 */
export const formatSnippet = (snippet: any, startIndex: number = 1): any[] => {
  const requests: any[] = [];
  let currentIndex = startIndex;

  // Metadata bar (date + swags)
  const date = new Date(snippet.timestamp).toLocaleDateString();
  const swagsList = snippet.swags?.length > 0 ? ` • Tags: ${snippet.swags.join(', ')}` : '';
  const metadataText = `${date}${swagsList}\n\n`;
  
  requests.push({
    insertText: {
      location: { index: currentIndex },
      text: metadataText,
    },
  });
  requests.push({
    updateTextStyle: {
      range: {
        startIndex: currentIndex,
        endIndex: currentIndex + metadataText.length - 2,
      },
      textStyle: {
        italic: true,
        fontSize: { magnitude: 10, unit: 'PT' },
        foregroundColor: {
          color: {
            rgbColor: { red: 0.5, green: 0.5, blue: 0.5 },
          },
        },
      },
      fields: 'italic,fontSize,foregroundColor',
    },
  });
  currentIndex += metadataText.length;

  // Title as Heading 2
  if (snippet.title) {
    const titleText = snippet.title + '\n';
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: titleText,
      },
    });
    requests.push({
      updateParagraphStyle: {
        range: {
          startIndex: currentIndex,
          endIndex: currentIndex + titleText.length - 1,
        },
        paragraphStyle: {
          namedStyleType: 'HEADING_2',
        },
        fields: 'namedStyleType',
      },
    });
    currentIndex += titleText.length;
  }

  // Content (preserve formatting with convertToGoogleDocsFormat)
  if (snippet.content) {
    const contentRequests = convertToGoogleDocsFormat(snippet.content, currentIndex);
    requests.push(...contentRequests);
  }

  return requests;
};

/**
 * Create a publicly shared HTML file in Google Drive with formatted content
 * @param title Document title
 * @param content Plain content or structured object (Feed/Snippet)
 * @param contentType 'feed' | 'snippet' | 'plain'
 * @returns { documentId, webViewLink }
 */
export const createPublicShareDocument = async (
  title: string,
  content: any,
  contentType: 'feed' | 'snippet' | 'plain',
  accessToken: string
): Promise<{ documentId: string; webViewLink: string }> => {
  // Create HTML content based on type
  let htmlContent = '';
  
  if (contentType === 'feed') {
    const feed = content;
    
    // Convert description to base64 images if needed
    const descriptionWithBase64 = feed.description 
      ? await prepareContentWithBase64Images(feed.description)
      : '';
    
    // Convert image URL to base64 if it's an HTTP URL
    let imageWithBase64 = feed.imageUrl || '';
    if (imageWithBase64 && (imageWithBase64.startsWith('http://') || imageWithBase64.startsWith('https://'))) {
      try {
        imageWithBase64 = await fetchImageAsBase64(imageWithBase64);
        console.log(`✅ Converted feed image URL to base64`);
      } catch (error) {
        console.warn(`⚠️ Could not convert feed image URL, using original:`, error);
        // Keep original URL if conversion fails
      }
    }
    
    htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(feed.title || 'Shared Feed Item')}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
    h1 { color: #1a1a1a; border-bottom: 3px solid #4285f4; padding-bottom: 10px; }
    .metadata { color: #666; font-size: 0.9em; font-style: italic; margin: 10px 0; }
    .tags { margin: 20px 0; }
    .tag { display: inline-block; background: #e8f0fe; color: #1967d2; padding: 4px 12px; margin: 4px; border-radius: 12px; font-size: 0.85em; }
    .description { margin: 20px 0; white-space: pre-wrap; }
    .sources { margin: 20px 0; }
    .sources h2 { color: #1a1a1a; font-size: 1.2em; margin-top: 30px; }
    .sources ol { padding-left: 20px; }
    .sources li { margin: 8px 0; }
    a { color: #1967d2; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; height: auto; margin: 20px 0; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(feed.title || 'Untitled')}</h1>
  ${imageWithBase64 ? `<img src="${imageWithBase64.startsWith('data:') ? imageWithBase64 : escapeHtml(imageWithBase64)}" alt="${escapeHtml(feed.title || 'Feed image')}" />` : ''}
  <div class="metadata">Shared from Research Agent • ${new Date(feed.timestamp || Date.now()).toLocaleDateString()}</div>
  ${feed.swags && feed.swags.length > 0 ? `
  <div class="tags">
    ${feed.swags.map((tag: string) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
  </div>
  ` : ''}
  <div class="description">${formatContentAsHtml(descriptionWithBase64)}</div>
  ${feed.sources && feed.sources.length > 0 ? `
  <div class="sources">
    <h2>Sources</h2>
    <ol>
      ${feed.sources.map((source: any) => `
        <li><a href="${escapeHtml(source.url || source.link || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || source.url || 'Source')}</a></li>
      `).join('')}
    </ol>
  </div>
  ` : ''}
</body>
</html>`;
  } else if (contentType === 'snippet') {
    const snippet = content;
    
    // Convert content to base64 images before formatting
    const contentWithBase64 = snippet.content 
      ? await prepareContentWithBase64Images(snippet.content)
      : '';
    
    htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(snippet.title || 'Shared Snippet')}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
    h1 { color: #1a1a1a; border-bottom: 3px solid #4285f4; padding-bottom: 10px; }
    .metadata { color: #666; font-size: 0.9em; font-style: italic; margin: 10px 0; }
    .tags { margin: 20px 0; }
    .tag { display: inline-block; background: #e8f0fe; color: #1967d2; padding: 4px 12px; margin: 4px; border-radius: 12px; font-size: 0.85em; }
    .content { margin: 20px 0; white-space: pre-wrap; }
    code { background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; }
    pre { background: #f1f3f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    img { max-width: 100%; height: auto; margin: 20px 0; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(snippet.title || 'Untitled Snippet')}</h1>
  <div class="metadata">Shared from Research Agent • ${new Date(snippet.timestamp || Date.now()).toLocaleDateString()}</div>
  ${snippet.swags && snippet.swags.length > 0 ? `
  <div class="tags">
    ${snippet.swags.map((tag: string) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
  </div>
  ` : ''}
  <div class="content">${formatContentAsHtml(contentWithBase64)}</div>
</body>
</html>`;
  } else {
    // Plain text
    htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
    h1 { color: #1a1a1a; border-bottom: 3px solid #4285f4; padding-bottom: 10px; }
    .content { margin: 20px 0; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="content">${formatContentAsHtml(content)}</div>
</body>
</html>`;
  }

  // Create HTML file in "shares" subfolder
  const sharesFolder = await findOrCreateSharesFolder(accessToken);
  
  const metadata = {
    name: `${title}.html`,
    mimeType: 'text/html',
    parents: [sharesFolder]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([htmlContent], { type: 'text/html' }));

  const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create HTML file: ${createResponse.statusText}`);
  }

  const createData = await createResponse.json();
  const documentId = createData.id;

  // Make document public and get link
  const webViewLink = await makeDocumentPublic(documentId, accessToken);

  return { documentId, webViewLink };
};

/**
 * Create a publicly shared Quiz JSON file in Google Drive
 * @param title Quiz title
 * @param quiz Quiz object with questions and answers
 * @param accessToken Google OAuth access token
 * @returns { documentId, webViewLink }
 */
export const createPublicShareQuiz = async (
  title: string,
  quiz: any,
  accessToken: string
): Promise<{ documentId: string; webViewLink: string }> => {
  // Create quiz JSON content
  const quizData = {
    type: 'quiz',
    title: quiz.title || title,
    description: quiz.description || '',
    questions: quiz.questions || [],
    timestamp: quiz.timestamp || Date.now(),
    swags: quiz.swags || [],
    createdBy: 'Research Agent',
    sharedAt: new Date().toISOString()
  };

  const jsonContent = JSON.stringify(quizData, null, 2);

  // Create JSON file in "shares" subfolder
  const sharesFolder = await findOrCreateSharesFolder(accessToken);
  
  const metadata = {
    name: `${title}.json`,
    mimeType: 'application/json',
    parents: [sharesFolder]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([jsonContent], { type: 'application/json' }));

  const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create quiz JSON file: ${createResponse.statusText}`);
  }

  const createData = await createResponse.json();
  const documentId = createData.id;

  // Make document public and get link
  const webViewLink = await makeDocumentPublic(documentId, accessToken);

  return { documentId, webViewLink };
};

/**
 * Remove public sharing permissions from a document by deleting it
 * @param documentId Google Drive file ID
 * @param accessToken Google OAuth access token
 */
export const removePublicSharing = async (
  documentId: string,
  accessToken: string
): Promise<void> => {
  console.log(`�️ Deleting shared document: ${documentId}`);

  // Delete the file from Google Drive
  const deleteResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${documentId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!deleteResponse.ok) {
    throw new Error(`Failed to delete file: ${deleteResponse.statusText}`);
  }

  console.log(`✅ Successfully deleted shared document`);
};

/**
 * Download file content from Google Drive
 * @param fileId Google Drive file ID
 * @param accessToken Google OAuth access token (empty string for public files)
 * @returns File content as string
 */
export const downloadFileContent = async (
  fileId: string,
  accessToken: string
): Promise<string> => {
  console.log(`📥 Downloading file content: ${fileId}`, accessToken ? '(authenticated)' : '(public)');

  // Determine API base URL (localhost or production)
  const { getCurrentApiBase } = await import('./api');
  const apiBaseUrl = await getCurrentApiBase();

  // Get user's Google auth token for billing/tracking
  const { googleAuth } = await import('../services/googleAuth');
  const userToken = googleAuth.getAccessToken();
  
  if (!userToken) {
    throw new Error('Authentication required to view shared content. Please sign in with Google.');
  }

  // For public files (no Drive API access token), use our backend proxy to bypass CORS
  // The proxy still requires user authentication for billing and usage tracking
  if (!accessToken) {
    const proxyUrl = `${apiBaseUrl}/drive-proxy?fileId=${fileId}`;
    console.log(`🔗 Fetching via proxy: ${proxyUrl}`);
    
    const response = await fetch(proxyUrl, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
      },
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`❌ Failed to download file via proxy:`, {
        status: response.status,
        statusText: response.statusText,
        url: proxyUrl,
        errorBody: errorBody.substring(0, 500)
      });
      
      if (response.status === 401) {
        throw new Error('Authentication required. Please sign in with Google.');
      }
      
      throw new Error(`Failed to download file: ${response.status} ${response.statusText || 'Unknown error'}`);
    }

    const content = await response.text();
    console.log(`✅ Downloaded file content via proxy (${content.length} bytes)`);
    return content;
  }

  // For authenticated requests with Drive API access, use Google Drive API directly
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`
  };

  console.log(`🔗 Fetching from: ${url}`);

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`❌ Failed to download file:`, {
      status: response.status,
      statusText: response.statusText,
      url,
      hasAuth: !!accessToken,
      errorBody: errorBody.substring(0, 500) // First 500 chars of error
    });
    throw new Error(`Failed to download file: ${response.status} ${response.statusText || 'Unknown error'}`);
  }

  const content = await response.text();
  console.log(`✅ Downloaded file content (${content.length} bytes)`);
  
  return content;
};

/**
 * Get file metadata from Google Drive
 * @param fileId Google Drive file ID
 * @param accessToken Google OAuth access token
 * @returns File metadata
 */
export const getFileMetadata = async (
  fileId: string,
  accessToken: string
): Promise<any> => {
  console.log(`📄 Getting file metadata: ${fileId}`);

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink,createdTime,modifiedTime`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get file metadata: ${response.statusText}`);
  }

  const metadata = await response.json();
  console.log(`✅ Got file metadata: ${metadata.name}`);
  
  return metadata;
};
