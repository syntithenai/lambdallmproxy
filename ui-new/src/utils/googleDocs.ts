// Google Docs API integration for Swag feature with comprehensive debugging

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Minimal scopes for privacy:
// - documents: Create and edit Google Docs
// - drive.file: ONLY access files created by this app (not all user files)
const SCOPES = 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file';

export interface GoogleDoc {
  id: string;
  name: string;
  modifiedTime: string;
}

let tokenClient: any = null;
let accessToken: string | null = null;

// Initialize Google Identity Services
export const initGoogleAuth = () => {
  return new Promise((resolve, reject) => {
    console.log('🔐 Initializing Google Auth...');
    console.log('📋 Client ID configured:', GOOGLE_CLIENT_ID ? 'YES' : 'NO');
    console.log('📋 Client ID value:', GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'MISSING');
    
    if (!GOOGLE_CLIENT_ID) {
      const error = 'Google Client ID not configured. Please set VITE_GOOGLE_CLIENT_ID in ui-new/.env';
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
            console.log('🎫 Token callback received:', { hasToken: !!response.access_token, error: response.error });
            if (response.access_token) {
              accessToken = response.access_token;
              console.log('✅ Access token received:', response.access_token.substring(0, 20) + '...');
              resolve(response.access_token);
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
          console.log('🎫 Token callback received:', { hasToken: !!response.access_token, error: response.error });
          if (response.access_token) {
            accessToken = response.access_token;
            console.log('✅ Access token received:', response.access_token.substring(0, 20) + '...');
            resolve(response.access_token);
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
  console.log('📋 Current token:', accessToken ? accessToken.substring(0, 20) + '...' : 'NONE');
  
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
          console.log('✅ New access token received:', response.access_token.substring(0, 20) + '...');
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

  // Query for documents created by this app with metadata
  // Using properties to filter only documents created by this specific app
  const query = "mimeType='application/vnd.google-apps.document' and trashed=false and properties has { key='createdByApp' and value='LambdaLLMProxy-Swag' }";
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
  
  // Double-check filtering on client side for extra safety
  const filtered = data.files.filter((file: any) => 
    file.properties?.createdByApp === 'LambdaLLMProxy-Swag' ||
    file.description?.includes('Created by LLM Proxy Swag feature')
  );
  console.log('✅ App-created documents:', filtered.length);

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
      console.log('✅ Access token revoked');
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
