/**
 * Playlists Sync Adapter
 * Integrates audio playlists with unified sync system
 * Syncs between IndexedDB (local) and Google Drive (remote)
 */

import type { SyncAdapter } from '../unifiedSync';
import { playlistDB } from '../../utils/playlistDB';
import { requestGoogleAuth } from '../../utils/googleDocs';

// Define SavedPlaylist type based on playlistDB schema
interface SavedPlaylist {
  id: number;
  name: string;
  tracks: any[];
  createdAt: number;
  updatedAt: number;
}

// UPDATED: Use same folder as Google Sheets sync for consistency
const APP_FOLDER_NAME = 'Research Agent';
const PLAYLISTS_FILENAME = 'saved_playlists.json';

// Cache folder ID to avoid repeated lookups
let appFolderIdCache: string | null = null;

/**
 * Playlists Sync Adapter for Unified Sync
 */
export class PlaylistsAdapter implements SyncAdapter {
  name = 'playlists';
  enabled = true;

  /**
   * Get or create the app folder in Google Drive
   */
  private async getAppFolder(): Promise<string> {
    // Return cached folder ID if available
    if (appFolderIdCache) {
      return appFolderIdCache!;
    }

    const token = await requestGoogleAuth();

    // Search for existing folder
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!searchResponse.ok) {
      throw new Error(`Failed to search for app folder: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
      // Folder exists
      appFolderIdCache = searchData.files[0].id;
      return appFolderIdCache!;
    }

    // Create folder
    const createResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: APP_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder'
        })
      }
    );

    if (!createResponse.ok) {
      throw new Error(`Failed to create app folder: ${createResponse.statusText}`);
    }

    const createData = await createResponse.json();
    appFolderIdCache = createData.id;
    return appFolderIdCache!;
  }

  /**
   * Get file ID for playlists file in Google Drive
   */
  private async getFileId(filename: string): Promise<string | null> {
    const token = await requestGoogleAuth();
    const folderId = await this.getAppFolder();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and '${folderId}' in parents and trashed=false`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to search for file: ${response.statusText}`);
    }

    const data = await response.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  }

  /**
   * Pull playlists from Google Drive
   */
  async pull(): Promise<SavedPlaylist[] | null> {
    try {
      const fileId = await this.getFileId(PLAYLISTS_FILENAME);
      
      if (!fileId) {
        // No remote file exists
        return null;
      }

      const token = await requestGoogleAuth();
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to download playlists: ${response.statusText}`);
      }

      const content = await response.text();
      const playlists: SavedPlaylist[] = JSON.parse(content);
      
      return playlists;
      
    } catch (error) {
      console.error('Error pulling playlists from Google Drive:', error);
      throw error;
    }
  }

  /**
   * Push playlists to Google Drive
   */
  async push(data: SavedPlaylist[]): Promise<void> {
    try {
      const token = await requestGoogleAuth();
      const folderId = await this.getAppFolder();
      const fileId = await this.getFileId(PLAYLISTS_FILENAME);

      const content = JSON.stringify(data, null, 2);
      const blob = new Blob([content], { type: 'application/json' });

      if (fileId) {
        // Update existing file
        const response = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: blob
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to update playlists file: ${response.statusText}`);
        }
        
      } else {
        // Create new file
        const metadata = {
          name: PLAYLISTS_FILENAME,
          parents: [folderId],
          mimeType: 'application/json'
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const response = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: form
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to create playlists file: ${response.statusText}`);
        }
      }
      
      console.log(`✓ Pushed ${data.length} playlists to Google Drive`);
      
    } catch (error) {
      console.error('Error pushing playlists to Google Drive:', error);
      throw error;
    }
  }

  /**
   * Get local playlists from IndexedDB
   */
  async getLocalData(): Promise<SavedPlaylist[]> {
    await playlistDB.init();
    return await playlistDB.exportAllPlaylists();
  }

  /**
   * Set local playlists in IndexedDB
   */
  async setLocalData(data: SavedPlaylist[]): Promise<void> {
    await playlistDB.init();
    await playlistDB.importAndMergePlaylists(data);
  }

  /**
   * Get timestamp of most recently modified playlist
   */
  async getLastModified(): Promise<number> {
    const playlists = await this.getLocalData();
    if (playlists.length === 0) return 0;
    return Math.max(...playlists.map(p => p.updatedAt || p.createdAt || 0));
  }

  /**
   * Check if sync should run
   */
  async shouldSync(): Promise<boolean> {
    try {
      // Check if user is authenticated with Google
      const cachedToken = localStorage.getItem('google_access_token');
      if (!cachedToken) {
        return false;
      }

      // Verify token is still valid
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          'Authorization': `Bearer ${cachedToken}`
        }
      });

      return response.ok;
      
    } catch (error) {
      console.error('Error checking if playlists should sync:', error);
      return false;
    }
  }

  /**
   * Merge local and remote playlists
   * Deduplicates by name, keeps newer updatedAt timestamp
   */
  mergeData(local: SavedPlaylist[], remote: SavedPlaylist[]): SavedPlaylist[] {
    const mergedMap = new Map<string, SavedPlaylist>();

    // Add local playlists to map
    local.forEach(playlist => {
      const key = playlist.name.trim().toLowerCase();
      mergedMap.set(key, playlist);
    });

    // Merge remote playlists (replace if newer)
    remote.forEach(remotePlaylist => {
      const key = remotePlaylist.name.trim().toLowerCase();
      const existingPlaylist = mergedMap.get(key);
      
      const remoteTime = remotePlaylist.updatedAt || remotePlaylist.createdAt || 0;
      const existingTime = existingPlaylist 
        ? (existingPlaylist.updatedAt || existingPlaylist.createdAt || 0)
        : 0;
      
      if (!existingPlaylist || remoteTime > existingTime) {
        mergedMap.set(key, remotePlaylist);
      }
    });

    // Convert back to array
    return Array.from(mergedMap.values());
  }
}

// Export singleton instance
export const playlistsAdapter = new PlaylistsAdapter();
