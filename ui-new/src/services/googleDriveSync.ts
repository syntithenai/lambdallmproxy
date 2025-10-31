/**
 * Google Drive Sync Service
 * 
 * Syncs saved plans and playlists to Google Drive for cross-device access and backup
 * Uses existing Google OAuth from googleDocs.ts
 */

import { requestGoogleAuth } from '../utils/googleDocs';
import { getAllCachedPlans, saveCachedPlan, clearAllCachedPlans } from '../utils/planningCache';
import type { CachedPlan } from '../utils/planningCache';
import { playlistDB } from '../utils/playlistDB';
import { storage } from '../utils/storage';
import { ragDB } from '../utils/ragDB';
import type { ContentSnippet } from '../contexts/SwagContext';

/**
 * Sync result for a single operation
 */
export interface SyncResult {
  success: boolean;
  action: 'uploaded' | 'downloaded' | 'no-change' | 'conflict' | 'error';
  timestamp: number;
  itemCount: number;
  error?: string;
  conflictDetails?: {
    localTimestamp: number;
    remoteTimestamp: number;
    localCount: number;
    remoteCount: number;
  };
}

/**
 * Sync metadata tracking
 */
export interface SyncMetadata {
  lastSyncTime: number;
  lastPlansSync: number;
  lastPlaylistsSync: number;
  lastSnippetsSync: number;
  lastEmbeddingsSync: number;
  plansCount: number;
  playlistsCount: number;
  snippetsCount: number;
  embeddingsCount: number;
}

/**
 * Saved playlist structure for sync
 */
export interface SavedPlaylist {
  id: number;
  name: string;
  tracks: any[];
  createdAt: number;
  updatedAt: number;
}

const APP_FOLDER_NAME = 'LLM Proxy App Data';
const PLANS_FILENAME = 'saved_plans.json';
const PLAYLISTS_FILENAME = 'saved_playlists.json';
const SNIPPETS_FILENAME = 'saved_snippets.json';
const EMBEDDINGS_FILENAME = 'saved_embeddings.json';
const METADATA_FILENAME = 'sync_metadata.json';

// Cache folder ID to avoid repeated lookups
let appFolderIdCache: string | null = null;

/**
 * Google Drive Sync Service
 */
class GoogleDriveSync {
  
  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      // Check if we have a cached token
      const cachedToken = localStorage.getItem('google_access_token');
      if (cachedToken) {
        // Verify token is still valid by making a simple API call
        const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: {
            'Authorization': `Bearer ${cachedToken}`
          }
        });
        return response.ok;
      }
      return false;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }

  /**
   * Get or create the app folder in Google Drive
   */
  private async getAppFolder(): Promise<string> {
    // Return cached folder ID if available
    if (appFolderIdCache) {
      return appFolderIdCache;
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
      throw new Error('Failed to search for app folder');
    }

    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
      // Folder exists
      appFolderIdCache = searchData.files[0].id;
      return searchData.files[0].id;
    }

    // Create folder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: APP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (!createResponse.ok) {
      throw new Error('Failed to create app folder');
    }

    const createData = await createResponse.json();
    appFolderIdCache = createData.id;
    return createData.id;
  }

  /**
   * Upload a file to Google Drive (creates or updates)
   */
  private async uploadFile(filename: string, content: string): Promise<void> {
    const token = await requestGoogleAuth();
    const folderId = await this.getAppFolder();

    // Check if file already exists
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and '${folderId}' in parents and trashed=false`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!searchResponse.ok) {
      throw new Error(`Failed to search for file: ${filename}`);
    }

    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
      // Update existing file
      const fileId = searchData.files[0].id;
      const updateResponse = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: content
        }
      );

      if (!updateResponse.ok) {
        throw new Error(`Failed to update file: ${filename}`);
      }
    } else {
      // Create new file
      const metadata = {
        name: filename,
        parents: [folderId]
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([content], { type: 'application/json' }));

      const createResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: form
        }
      );

      if (!createResponse.ok) {
        throw new Error(`Failed to create file: ${filename}`);
      }
    }
  }

  /**
   * Download a file from Google Drive
   */
  private async downloadFile(filename: string): Promise<string | null> {
    try {
      const token = await requestGoogleAuth();
      const folderId = await this.getAppFolder();

      // Search for file
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and '${folderId}' in parents and trashed=false`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!searchResponse.ok) {
        throw new Error(`Failed to search for file: ${filename}`);
      }

      const searchData = await searchResponse.json();

      if (!searchData.files || searchData.files.length === 0) {
        // File doesn't exist yet
        return null;
      }

      // Download file content
      const fileId = searchData.files[0].id;
      const downloadResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!downloadResponse.ok) {
        throw new Error(`Failed to download file: ${filename}`);
      }

      return await downloadResponse.text();
    } catch (error) {
      console.error(`Error downloading file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Sync plans to/from Google Drive
   */
  async syncPlans(): Promise<SyncResult> {
    try {
      const localPlans = await getAllCachedPlans();
      const localTimestamp = localPlans.length > 0 
        ? Math.max(...localPlans.map(p => p.timestamp))
        : 0;

      // Download remote plans
      const remoteContent = await this.downloadFile(PLANS_FILENAME);
      
      if (!remoteContent) {
        // No remote file - upload local plans
        if (localPlans.length > 0) {
          await this.uploadPlans(localPlans);
          await this.updateSyncMetadata('plans', localPlans.length);
          return {
            success: true,
            action: 'uploaded',
            timestamp: Date.now(),
            itemCount: localPlans.length
          };
        } else {
          return {
            success: true,
            action: 'no-change',
            timestamp: Date.now(),
            itemCount: 0
          };
        }
      }

      // Parse remote plans
      const remotePlans: CachedPlan[] = JSON.parse(remoteContent);
      const remoteTimestamp = remotePlans.length > 0
        ? Math.max(...remotePlans.map(p => p.timestamp))
        : 0;

      // Determine sync action
      if (remoteTimestamp > localTimestamp) {
        // Remote is newer - download and merge
        await this.mergePlans(remotePlans);
        await this.updateSyncMetadata('plans', remotePlans.length);
        return {
          success: true,
          action: 'downloaded',
          timestamp: Date.now(),
          itemCount: remotePlans.length
        };
      } else if (localTimestamp > remoteTimestamp) {
        // Local is newer - upload
        await this.uploadPlans(localPlans);
        await this.updateSyncMetadata('plans', localPlans.length);
        return {
          success: true,
          action: 'uploaded',
          timestamp: Date.now(),
          itemCount: localPlans.length
        };
      } else {
        // Same timestamp - no change
        return {
          success: true,
          action: 'no-change',
          timestamp: Date.now(),
          itemCount: localPlans.length
        };
      }
    } catch (error) {
      console.error('Error syncing plans:', error);
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Upload plans to Google Drive
   */
  async uploadPlans(plans: CachedPlan[]): Promise<void> {
    const content = JSON.stringify(plans, null, 2);
    await this.uploadFile(PLANS_FILENAME, content);
  }

  /**
   * Download plans from Google Drive
   */
  async downloadPlans(): Promise<CachedPlan[]> {
    const content = await this.downloadFile(PLANS_FILENAME);
    if (!content) return [];
    return JSON.parse(content);
  }

  /**
   * Merge remote plans into local storage
   * Deduplicates by query (case-insensitive), keeps newer timestamp
   */
  private async mergePlans(remotePlans: CachedPlan[]): Promise<void> {
    const localPlans = await getAllCachedPlans();
    const mergedMap = new Map<string, CachedPlan>();

    // Add local plans to map
    localPlans.forEach(plan => {
      const key = plan.query.trim().toLowerCase();
      mergedMap.set(key, plan);
    });

    // Merge remote plans (replace if newer)
    remotePlans.forEach(remotePlan => {
      const key = remotePlan.query.trim().toLowerCase();
      const existingPlan = mergedMap.get(key);
      
      if (!existingPlan || remotePlan.timestamp > existingPlan.timestamp) {
        mergedMap.set(key, remotePlan);
      }
    });

    // Convert back to array and sort by timestamp (newest first)
    const mergedPlans = Array.from(mergedMap.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50); // Limit to 50 most recent

    // Clear and repopulate local storage
    await clearAllCachedPlans();
    for (const plan of mergedPlans) {
      await saveCachedPlan(plan.query, plan.plan, plan.systemPrompt, plan.userPrompt);
    }
  }

  /**
   * Sync playlists to/from Google Drive
   */
  async syncPlaylists(): Promise<SyncResult> {
    try {
      // Get local playlists
      await playlistDB.init();
      const localPlaylists = await playlistDB.exportAllPlaylists();
      const localTimestamp = localPlaylists.length > 0
        ? Math.max(...localPlaylists.map((p: SavedPlaylist) => p.updatedAt))
        : 0;

      // Download remote playlists
      const remoteContent = await this.downloadFile(PLAYLISTS_FILENAME);

      if (!remoteContent) {
        // No remote file - upload local playlists
        if (localPlaylists.length > 0) {
          await this.uploadPlaylists(localPlaylists);
          await this.updateSyncMetadata('playlists', localPlaylists.length);
          return {
            success: true,
            action: 'uploaded',
            timestamp: Date.now(),
            itemCount: localPlaylists.length
          };
        } else {
          return {
            success: true,
            action: 'no-change',
            timestamp: Date.now(),
            itemCount: 0
          };
        }
      }

      // Parse remote playlists
      const remotePlaylists: SavedPlaylist[] = JSON.parse(remoteContent);
      const remoteTimestamp = remotePlaylists.length > 0
        ? Math.max(...remotePlaylists.map(p => p.updatedAt))
        : 0;

      // Determine sync action
      if (remoteTimestamp > localTimestamp) {
        // Remote is newer - download and merge
        const importedCount = await playlistDB.importAndMergePlaylists(remotePlaylists);
        await this.updateSyncMetadata('playlists', importedCount);
        return {
          success: true,
          action: 'downloaded',
          timestamp: Date.now(),
          itemCount: importedCount
        };
      } else if (localTimestamp > remoteTimestamp) {
        // Local is newer - upload
        await this.uploadPlaylists(localPlaylists);
        await this.updateSyncMetadata('playlists', localPlaylists.length);
        return {
          success: true,
          action: 'uploaded',
          timestamp: Date.now(),
          itemCount: localPlaylists.length
        };
      } else {
        // Same timestamp - no change
        return {
          success: true,
          action: 'no-change',
          timestamp: Date.now(),
          itemCount: localPlaylists.length
        };
      }
    } catch (error) {
      console.error('Error syncing playlists:', error);
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Upload playlists to Google Drive
   */
  async uploadPlaylists(playlists: SavedPlaylist[]): Promise<void> {
    const content = JSON.stringify(playlists, null, 2);
    await this.uploadFile(PLAYLISTS_FILENAME, content);
  }

  /**
   * Download playlists from Google Drive
   */
  async downloadPlaylists(): Promise<SavedPlaylist[]> {
    const content = await this.downloadFile(PLAYLISTS_FILENAME);
    if (!content) return [];
    return JSON.parse(content);
  }

  /**
   * Sync snippets (SWAG content)
   */
  async syncSnippets(): Promise<SyncResult> {
    try {
      // Get local snippets from storage
      const localSnippets = await storage.getItem<ContentSnippet[]>('swag-snippets') || [];
      
      // Get remote snippets from Drive
      const remoteSnippets = await this.downloadSnippets();
      
      if (localSnippets.length === 0 && remoteSnippets.length === 0) {
        return {
          success: true,
          action: 'no-change',
          timestamp: Date.now(),
          itemCount: 0
        };
      }
      
      // Get last modification times
      const localTimestamp = localSnippets.length > 0
        ? Math.max(...localSnippets.map(s => s.updateDate || s.timestamp))
        : 0;
      const remoteTimestamp = remoteSnippets.length > 0
        ? Math.max(...remoteSnippets.map(s => s.updateDate || s.timestamp))
        : 0;
      
      // Determine action based on Last-Write-Wins
      if (localSnippets.length === 0) {
        // Download from remote
        await storage.setItem('swag-snippets', remoteSnippets);
        await this.updateSyncMetadata('snippets', remoteSnippets.length);
        return {
          success: true,
          action: 'downloaded',
          timestamp: Date.now(),
          itemCount: remoteSnippets.length
        };
      } else if (remoteSnippets.length === 0) {
        // Upload to remote
        await this.uploadSnippets(localSnippets);
        await this.updateSyncMetadata('snippets', localSnippets.length);
        return {
          success: true,
          action: 'uploaded',
          timestamp: Date.now(),
          itemCount: localSnippets.length
        };
      } else if (localTimestamp > remoteTimestamp) {
        // Local is newer, upload
        await this.uploadSnippets(localSnippets);
        await this.updateSyncMetadata('snippets', localSnippets.length);
        return {
          success: true,
          action: 'uploaded',
          timestamp: Date.now(),
          itemCount: localSnippets.length
        };
      } else if (remoteTimestamp > localTimestamp) {
        // Remote is newer, download
        await storage.setItem('swag-snippets', remoteSnippets);
        await this.updateSyncMetadata('snippets', remoteSnippets.length);
        return {
          success: true,
          action: 'downloaded',
          timestamp: Date.now(),
          itemCount: remoteSnippets.length
        };
      } else {
        // Same timestamp, no change needed
        await this.updateSyncMetadata('snippets', localSnippets.length);
        return {
          success: true,
          action: 'no-change',
          timestamp: Date.now(),
          itemCount: localSnippets.length
        };
      }
    } catch (error) {
      console.error('Error syncing snippets:', error);
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Sync embeddings (RAG database)
   */
  async syncEmbeddings(): Promise<SyncResult> {
    try {
      // Get all local chunks from ragDB
      const localChunks = await ragDB.getAllChunks();
      
      // Get remote embeddings from Drive
      const remoteChunks = await this.downloadEmbeddings();
      
      if (localChunks.length === 0 && remoteChunks.length === 0) {
        return {
          success: true,
          action: 'no-change',
          timestamp: Date.now(),
          itemCount: 0
        };
      }
      
      // Get last modification times (convert ISO strings to timestamps)
      const localTimestamp = localChunks.length > 0
        ? Math.max(...localChunks.map(c => new Date(c.created_at).getTime()))
        : 0;
      const remoteTimestamp = remoteChunks.length > 0
        ? Math.max(...remoteChunks.map(c => new Date(c.created_at).getTime()))
        : 0;
      
      // Determine action based on Last-Write-Wins
      if (localChunks.length === 0) {
        // Download from remote
        await ragDB.saveChunks(remoteChunks);
        await this.updateSyncMetadata('embeddings', remoteChunks.length);
        return {
          success: true,
          action: 'downloaded',
          timestamp: Date.now(),
          itemCount: remoteChunks.length
        };
      } else if (remoteChunks.length === 0) {
        // Upload to remote
        await this.uploadEmbeddings(localChunks);
        await this.updateSyncMetadata('embeddings', localChunks.length);
        return {
          success: true,
          action: 'uploaded',
          timestamp: Date.now(),
          itemCount: localChunks.length
        };
      } else if (localTimestamp > remoteTimestamp) {
        // Local is newer, upload
        await this.uploadEmbeddings(localChunks);
        await this.updateSyncMetadata('embeddings', localChunks.length);
        return {
          success: true,
          action: 'uploaded',
          timestamp: Date.now(),
          itemCount: localChunks.length
        };
      } else if (remoteTimestamp > localTimestamp) {
        // Remote is newer, download
        await ragDB.saveChunks(remoteChunks);
        await this.updateSyncMetadata('embeddings', remoteChunks.length);
        return {
          success: true,
          action: 'downloaded',
          timestamp: Date.now(),
          itemCount: remoteChunks.length
        };
      } else {
        // Same timestamp, no change needed
        await this.updateSyncMetadata('embeddings', localChunks.length);
        return {
          success: true,
          action: 'no-change',
          timestamp: Date.now(),
          itemCount: localChunks.length
        };
      }
    } catch (error) {
      console.error('Error syncing embeddings:', error);
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Upload snippets to Google Drive
   */
  async uploadSnippets(snippets: ContentSnippet[]): Promise<void> {
    const content = JSON.stringify(snippets, null, 2);
    await this.uploadFile(SNIPPETS_FILENAME, content);
  }

  /**
   * Download snippets from Google Drive
   */
  async downloadSnippets(): Promise<ContentSnippet[]> {
    const content = await this.downloadFile(SNIPPETS_FILENAME);
    if (!content) return [];
    return JSON.parse(content);
  }

  /**
   * Upload embeddings to Google Drive
   */
  async uploadEmbeddings(chunks: any[]): Promise<void> {
    const content = JSON.stringify(chunks, null, 2);
    await this.uploadFile(EMBEDDINGS_FILENAME, content);
  }

  /**
   * Download embeddings from Google Drive
   */
  async downloadEmbeddings(): Promise<any[]> {
    const content = await this.downloadFile(EMBEDDINGS_FILENAME);
    if (!content) return [];
    return JSON.parse(content);
  }

  /**
   * Sync all data: plans, playlists, snippets, and embeddings
   */
  async syncAll(): Promise<{ plans: SyncResult, playlists: SyncResult, snippets: SyncResult, embeddings: SyncResult }> {
    const [plans, playlists, snippets, embeddings] = await Promise.all([
      this.syncPlans(),
      this.syncPlaylists(),
      this.syncSnippets(),
      this.syncEmbeddings()
    ]);

    return { plans, playlists, snippets, embeddings };
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<number> {
    const metadata = await this.getSyncMetadata();
    return metadata.lastSyncTime;
  }

  /**
   * Get sync metadata
   */
  async getSyncMetadata(): Promise<SyncMetadata> {
    const content = await this.downloadFile(METADATA_FILENAME);
    
    if (!content) {
      return {
        lastSyncTime: 0,
        lastPlansSync: 0,
        lastPlaylistsSync: 0,
        lastSnippetsSync: 0,
        lastEmbeddingsSync: 0,
        plansCount: 0,
        playlistsCount: 0,
        snippetsCount: 0,
        embeddingsCount: 0
      };
    }

    const parsed = JSON.parse(content);
    // Ensure all fields exist (backward compatibility)
    return {
      lastSyncTime: parsed.lastSyncTime || 0,
      lastPlansSync: parsed.lastPlansSync || 0,
      lastPlaylistsSync: parsed.lastPlaylistsSync || 0,
      lastSnippetsSync: parsed.lastSnippetsSync || 0,
      lastEmbeddingsSync: parsed.lastEmbeddingsSync || 0,
      plansCount: parsed.plansCount || 0,
      playlistsCount: parsed.playlistsCount || 0,
      snippetsCount: parsed.snippetsCount || 0,
      embeddingsCount: parsed.embeddingsCount || 0
    };
  }

  /**
   * Update sync metadata
   */
  private async updateSyncMetadata(type: 'plans' | 'playlists' | 'snippets' | 'embeddings', itemCount: number): Promise<void> {
    const metadata = await this.getSyncMetadata();
    
    metadata.lastSyncTime = Date.now();
    
    if (type === 'plans') {
      metadata.lastPlansSync = Date.now();
      metadata.plansCount = itemCount;
    } else if (type === 'playlists') {
      metadata.lastPlaylistsSync = Date.now();
      metadata.playlistsCount = itemCount;
    } else if (type === 'snippets') {
      metadata.lastSnippetsSync = Date.now();
      metadata.snippetsCount = itemCount;
    } else {
      metadata.lastEmbeddingsSync = Date.now();
      metadata.embeddingsCount = itemCount;
    }

    const content = JSON.stringify(metadata, null, 2);
    await this.uploadFile(METADATA_FILENAME, content);
  }
}

// Export singleton instance
export const googleDriveSync = new GoogleDriveSync();
