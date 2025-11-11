/**
 * Google Drive Service
 * 
 * Handles sync of settings and data to Google Drive
 * 
 * NOTE: Requires gapi library and OAuth setup
 */

/// <reference types="gapi" />
/// <reference types="gapi.client.drive" />

import type { Settings, Plan, Playlist, Project, ChatMessage, ImageRecord } from '../types/persistence';
import { getAccessToken } from './googleApi';

/**
 * Root folder name in Google Drive
 */
const ROOT_FOLDER_NAME = 'Research Agent';

/**
 * Subfolder names
 */
const FOLDERS = {
  PLANS: 'plans',
  PLAYLISTS: 'playlists',
  CHAT: 'chat',
  IMAGES: 'images',
};

/**
 * Find a folder by name and parent
 */
async function findFolder(name: string, parentId?: string): Promise<string | null> {
  const query = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const response = await gapi.client.drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  const files = response.result.files;
  return files && files.length > 0 ? files[0].id! : null;
}

/**
 * Create a folder
 */
async function createFolder(name: string, parentId?: string): Promise<string> {
  const metadata: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentId) {
    metadata.parents = [parentId];
  }

  const response = await gapi.client.drive.files.create({
    resource: metadata,
    fields: 'id'
  });

  return response.result.id!;
}

/**
 * Find or create the Research Agent root folder
 * 
 * @returns Folder ID
 */
export async function ensureRootFolder(): Promise<string> {
  console.log('[GoogleDrive] Ensuring root folder...');
  
  let folderId = await findFolder(ROOT_FOLDER_NAME);
  
  if (!folderId) {
    console.log('[GoogleDrive] Creating root folder...');
    folderId = await createFolder(ROOT_FOLDER_NAME);
  }
  
  console.log('[GoogleDrive] Root folder ID:', folderId);
  return folderId;
}

/**
 * Find or create a subfolder within the root folder
 * 
 * @param folderName - Name of the subfolder
 * @param parentFolderId - Parent folder ID (root folder)
 * @returns Folder ID
 */
export async function ensureSubfolder(folderName: string, parentFolderId: string): Promise<string> {
  console.log(`[GoogleDrive] Ensuring subfolder: ${folderName}...`);
  
  let folderId = await findFolder(folderName, parentFolderId);
  
  if (!folderId) {
    console.log(`[GoogleDrive] Creating subfolder: ${folderName}...`);
    folderId = await createFolder(folderName, parentFolderId);
  }
  
  console.log(`[GoogleDrive] Subfolder ID: ${folderId}`);
  return folderId;
}

/**
 * Find a file by name and parent
 */
async function findFile(name: string, parentId?: string): Promise<string | null> {
  const query = parentId
    ? `name='${name}' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and trashed=false`;

  const response = await gapi.client.drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  const files = response.result.files;
  return files && files.length > 0 ? files[0].id! : null;
}

/**
 * Upload JSON file to Google Drive
 * 
 * @param fileName - Name of the file
 * @param data - Data to upload
 * @param folderId - Parent folder ID (optional)
 * @returns File ID
 */
export async function uploadJSON(fileName: string, data: any, folderId?: string): Promise<string> {
  console.log(`[GoogleDrive] Uploading ${fileName}...`);
  
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  
  // Check if file exists
  const existingFileId = await findFile(fileName, folderId);
  
  if (existingFileId) {
    // Update existing file
    console.log(`[GoogleDrive] Updating existing file: ${existingFileId}`);
    
    const accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error('Not signed in to Google');
    }
    
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: blob
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to update file: ${response.statusText}`);
    }
    
    return existingFileId;
  } else {
    // Create new file
    console.log(`[GoogleDrive] Creating new file`);
    
    const metadata: any = {
      name: fileName,
      mimeType: 'application/json'
    };
    
    if (folderId) {
      metadata.parents = [folderId];
    }
    
    const accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error('Not signed in to Google');
    }
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: form
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to create file: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.id;
  }
}

/**
 * Download JSON file from Google Drive
 * 
 * @param fileName - Name of the file
 * @param folderId - Parent folder ID (optional)
 * @returns Parsed JSON data or null if not found
 */
export async function downloadJSON(fileName: string, folderId?: string): Promise<any | null> {
  console.log(`[GoogleDrive] Downloading ${fileName}...`);
  
  const fileId = await findFile(fileName, folderId);
  
  if (!fileId) {
    console.log(`[GoogleDrive] File not found: ${fileName}`);
    return null;
  }
  
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('Not signed in to Google');
  }
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  
  const text = await response.text();
  return JSON.parse(text);
}

/**
 * Upload blob (image, audio, etc.) to Google Drive
 * 
 * @param fileName - Name of the file
 * @param blob - Blob data
 * @param mimeType - MIME type
 * @param folderId - Parent folder ID (optional)
 * @returns File ID
 */
export async function uploadBlob(
  fileName: string,
  blob: Blob,
  mimeType: string,
  folderId?: string
): Promise<string> {
  console.log(`[GoogleDrive] Uploading blob ${fileName} (${mimeType})...`);
  
  // Check if file exists
  const existingFileId = await findFile(fileName, folderId);
  
  if (existingFileId) {
    // Update existing file
    console.log(`[GoogleDrive] Updating existing blob: ${existingFileId}`);
    
    const accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error('Not signed in to Google');
    }
    
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': mimeType
        },
        body: blob
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to update blob: ${response.statusText}`);
    }
    
    return existingFileId;
  } else {
    // Create new file
    console.log(`[GoogleDrive] Creating new blob`);
    
    const metadata: any = {
      name: fileName,
      mimeType
    };
    
    if (folderId) {
      metadata.parents = [folderId];
    }
    
    const accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error('Not signed in to Google');
    }
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: form
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to create blob: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.id;
  }
}

/**
 * Download blob from Google Drive
 * 
 * @param fileId - Google Drive file ID
 * @returns Blob or null if not found
 */
export async function downloadBlob(fileId: string): Promise<Blob | null> {
  console.log(`[GoogleDrive] Downloading blob ${fileId}...`);
  
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('Not signed in to Google');
  }
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to download blob: ${response.statusText}`);
  }
  
  return await response.blob();
}

/**
 * Delete file from Google Drive
 * 
 * @param fileId - Google Drive file ID
 */
export async function deleteFile(fileId: string): Promise<void> {
  console.log(`[GoogleDrive] Deleting file ${fileId}...`);
  
  await gapi.client.drive.files.delete({
    fileId
  });
  
  console.log(`[GoogleDrive] File deleted: ${fileId}`);
}

// ============================================================================
// Settings Sync
// ============================================================================

/**
 * Upload settings to Google Drive (settings.json)
 * 
 * @param settings - Settings object to upload
 * @returns File ID
 */
export async function uploadSettingsToDrive(settings: Settings): Promise<string> {
  console.log('[GoogleDrive] Uploading settings...');
  
  // Strip userId before upload (not needed in user's own Drive)
  const { userId, ...settingsWithoutUserId } = settings;
  
  const rootFolderId = await ensureRootFolder();
  return await uploadJSON('settings.json', settingsWithoutUserId, rootFolderId);
}

/**
 * Load settings from Google Drive (settings.json)
 * 
 * @param userId - User's email address (restored after download)
 * @returns Settings object or null if not found
 */
export async function loadSettingsFromDrive(userId: string): Promise<Settings | null> {
  console.log('[GoogleDrive] Loading settings...');
  
  const rootFolderId = await ensureRootFolder();
  const data = await downloadJSON('settings.json', rootFolderId);
  
  if (!data) return null;
  
  // Restore userId
  return {
    ...data,
    userId,
  };
}

// ============================================================================
// Plans Sync
// ============================================================================

/**
 * Upload plan to Google Drive
 * 
 * @param plan - Plan object
 * @returns File ID
 */
export async function uploadPlanToDrive(plan: Plan): Promise<string> {
  const { userId, ...planWithoutUserId } = plan;
  
  const rootFolderId = await ensureRootFolder();
  const plansFolderId = await ensureSubfolder(FOLDERS.PLANS, rootFolderId);
  
  return await uploadJSON(`${plan.id}.json`, planWithoutUserId, plansFolderId);
}

/**
 * Load plan from Google Drive
 * 
 * @param planId - Plan ID
 * @param userId - User's email
 * @returns Plan object or null if not found
 */
export async function loadPlanFromDrive(planId: string, userId: string): Promise<Plan | null> {
  const rootFolderId = await ensureRootFolder();
  const plansFolderId = await ensureSubfolder(FOLDERS.PLANS, rootFolderId);
  
  const data = await downloadJSON(`${planId}.json`, plansFolderId);
  
  if (!data) return null;
  
  return { ...data, userId };
}

// ============================================================================
// Playlists Sync
// ============================================================================

/**
 * Upload playlist to Google Drive
 * 
 * @param playlist - Playlist object
 * @returns File ID
 */
export async function uploadPlaylistToDrive(playlist: Playlist): Promise<string> {
  const { userId, ...playlistWithoutUserId } = playlist;
  
  const rootFolderId = await ensureRootFolder();
  const playlistsFolderId = await ensureSubfolder(FOLDERS.PLAYLISTS, rootFolderId);
  
  return await uploadJSON(`${playlist.id}.json`, playlistWithoutUserId, playlistsFolderId);
}

/**
 * Load playlist from Google Drive
 * 
 * @param playlistId - Playlist ID
 * @param userId - User's email
 * @returns Playlist object or null if not found
 */
export async function loadPlaylistFromDrive(playlistId: string, userId: string): Promise<Playlist | null> {
  const rootFolderId = await ensureRootFolder();
  const playlistsFolderId = await ensureSubfolder(FOLDERS.PLAYLISTS, rootFolderId);
  
  const data = await downloadJSON(`${playlistId}.json`, playlistsFolderId);
  
  if (!data) return null;
  
  return { ...data, userId };
}

// ============================================================================
// Projects Sync
// ============================================================================

/**
 * Upload all projects to Google Drive (projects.json)
 * 
 * @param projects - Array of projects
 * @returns File ID
 */
export async function uploadProjectsToDrive(projects: Project[]): Promise<string> {
  const projectsWithoutUserId = projects.map(({ userId, ...project }) => project);
  
  const rootFolderId = await ensureRootFolder();
  return await uploadJSON('projects.json', projectsWithoutUserId, rootFolderId);
}

/**
 * Load all projects from Google Drive (projects.json)
 * 
 * @param userId - User's email
 * @returns Array of projects
 */
export async function loadProjectsFromDrive(userId: string): Promise<Project[]> {
  const rootFolderId = await ensureRootFolder();
  const data = await downloadJSON('projects.json', rootFolderId);
  
  if (!data || !Array.isArray(data)) return [];
  
  return data.map(project => ({ ...project, userId }));
}

// ============================================================================
// Chat History Sync
// ============================================================================

/**
 * Upload chat conversation to Google Drive
 * 
 * @param conversationId - Conversation ID
 * @param messages - Array of chat messages
 * @returns File ID
 */
export async function uploadChatToDrive(conversationId: string, messages: ChatMessage[]): Promise<string> {
  const messagesWithoutUserId = messages.map(({ userId, ...message }) => message);
  
  const rootFolderId = await ensureRootFolder();
  const chatFolderId = await ensureSubfolder(FOLDERS.CHAT, rootFolderId);
  
  return await uploadJSON(`${conversationId}.json`, messagesWithoutUserId, chatFolderId);
}

/**
 * Load chat conversation from Google Drive
 * 
 * @param conversationId - Conversation ID
 * @param userId - User's email
 * @returns Array of chat messages
 */
export async function loadChatFromDrive(conversationId: string, userId: string): Promise<ChatMessage[]> {
  const rootFolderId = await ensureRootFolder();
  const chatFolderId = await ensureSubfolder(FOLDERS.CHAT, rootFolderId);
  
  const data = await downloadJSON(`${conversationId}.json`, chatFolderId);
  
  if (!data || !Array.isArray(data)) return [];
  
  return data.map(message => ({ ...message, userId }));
}

// ============================================================================
// Images Sync
// ============================================================================

/**
 * Upload image to Google Drive
 * 
 * @param image - Image record (includes blob data)
 * @returns File ID
 */
export async function uploadImageToDrive(image: ImageRecord): Promise<string> {
  if (!image.blob) {
    throw new Error('Image blob is required for upload');
  }
  
  // Extract extension from MIME type
  const ext = image.blob.type.split('/')[1]; // 'image/jpeg' → 'jpeg'
  const fileName = `${image.id}.${ext}`;
  
  const rootFolderId = await ensureRootFolder();
  const imagesFolderId = await ensureSubfolder(FOLDERS.IMAGES, rootFolderId);
  
  return await uploadBlob(fileName, image.blob, image.blob.type, imagesFolderId);
}

/**
 * Load image from Google Drive
 * 
 * @param imageId - Image ID
 * @param _userId - User's email
 * @returns Image record with blob or null if not found
 */
export async function loadImageFromDrive(imageId: string, _userId: string): Promise<ImageRecord | null> {
  // TODO: Need to find file by imageId pattern
  // This requires listing files in images folder
  console.log(`[GoogleDrive] loadImageFromDrive(${imageId}) - NOT YET IMPLEMENTED`);
  throw new Error('Google Drive sync not yet implemented');
}
