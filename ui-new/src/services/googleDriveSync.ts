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
import { chatHistoryDB } from '../utils/chatHistoryDB';
import type { ChatHistoryEntry } from '../utils/chatHistoryDB';
import { quizDB } from '../db/quizDb';
import type { QuizStatistic } from '../db/quizDb';
import { imageStorage } from '../utils/imageStorage';
import type { ImageMetadata } from '../utils/imageStorage';

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
  lastChatHistorySync: number;
  lastQuizProgressSync: number;
  lastSettingsSync: number;
  lastImagesSync: number;
  plansCount: number;
  playlistsCount: number;
  snippetsCount: number;
  embeddingsCount: number;
  chatHistoryCount: number;
  quizProgressCount: number;
  settingsCount: number;
  imagesCount: number;
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

const APP_FOLDER_NAME = 'Research Agent'; // UPDATED: Unified with Google Sheets sync
const PLANS_FILENAME = 'saved_plans.json';
const PLAYLISTS_FILENAME = 'saved_playlists.json';
const SNIPPETS_FILENAME = 'saved_snippets.json';
const EMBEDDINGS_FILENAME = 'saved_embeddings.json';
const CHAT_HISTORY_FILENAME = 'chat_history.json';
const QUIZ_PROGRESS_FILENAME = 'quiz_progress.json';
const SETTINGS_FILENAME = 'settings.json';
const IMAGES_FILENAME = 'saved_images.json';
const METADATA_FILENAME = 'sync_metadata.json';

// Cache folder ID to avoid repeated lookups
let appFolderIdCache: string | null = null;

/**
 * Google Drive Sync Service
 */
class GoogleDriveSync {
  private autoSyncTimer: NodeJS.Timeout | null = null;
  private readonly AUTO_SYNC_DEBOUNCE_MS = 10000; // 10 seconds
  private syncInProgress = false;
  private currentSyncOperation: string | null = null;
  private syncProgress = 0;
  private syncTotal = 0;
  
  /**
   * Check if sync is currently in progress
   */
  isSyncInProgress(): boolean {
    return this.syncInProgress;
  }
  
  /**
   * Get current sync status
   */
  getSyncStatus(): { inProgress: boolean; operation: string | null; progress: number; total: number } {
    return {
      inProgress: this.syncInProgress,
      operation: this.currentSyncOperation,
      progress: this.syncProgress,
      total: this.syncTotal
    };
  }
  
  /**
   * Update sync progress
   */
  private updateSyncProgress(operation: string, progress: number, total: number) {
    this.currentSyncOperation = operation;
    this.syncProgress = progress;
    this.syncTotal = total;
    
    // Log progress to console
    console.log(`🔄 Sync progress: ${operation} (${progress}/${total})`);
    
    // Dispatch event for UI to listen to
    window.dispatchEvent(new CustomEvent('sync-progress', {
      detail: { operation, progress, total }
    }));
  }
  
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
   * Note: Trashed folders are ignored and new ones are created
   * If multiple folders exist, uses the most recently modified one
   */
  private async getAppFolder(): Promise<string> {
    // Return cached folder ID if available
    if (appFolderIdCache) {
      return appFolderIdCache;
    }

    const token = await requestGoogleAuth();

    // Search for existing folders (excluding trashed folders)
    // Request modifiedTime to find the most recent one
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
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
      // Use the most recently modified folder
      const folder = searchData.files[0];
      
      // Warn if multiple folders exist
      if (searchData.files.length > 1) {
        console.warn(`⚠️ Found ${searchData.files.length} folders named "${APP_FOLDER_NAME}". Using the most recent one (ID: ${folder.id}). Consider deleting duplicate folders in Google Drive.`);
        console.warn('📋 Duplicate folder IDs:', searchData.files.map((f: any) => f.id).join(', '));
      } else {
        console.log(`📁 Using existing Drive folder: ${APP_FOLDER_NAME} (ID: ${folder.id})`);
      }
      
      appFolderIdCache = folder.id;
      return folder.id;
    }

    // Create folder (no existing folder found or folder was trashed)
    console.log(`📁 Creating new Drive folder: ${APP_FOLDER_NAME} (trashed folders are ignored)`);
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
   * Note: Trashed files are ignored and new files are created instead
   */
  private async uploadFile(filename: string, content: string): Promise<void> {
    const token = await requestGoogleAuth();
    const folderId = await this.getAppFolder();

    // Check if file already exists (excluding trashed files)
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
      console.log(`📝 Updating existing file: ${filename}`);
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
      // Create new file (no existing file found or file was trashed)
      console.log(`📄 Creating new file: ${filename} (trashed files are ignored)`);
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
   * Returns null if file doesn't exist or is in trash
   */
  private async downloadFile(filename: string): Promise<string | null> {
    try {
      const token = await requestGoogleAuth();
      const folderId = await this.getAppFolder();

      // Search for file (excluding trashed files)
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
        // File doesn't exist or is in trash - return null to use local data
        console.log(`📭 File not found in Drive (may be trashed): ${filename}`);
        return null;
      }

      // Download file content
      const fileId = searchData.files[0].id;
      console.log(`📥 Downloading file from Drive: ${filename}`);
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
   * Sync chat history (Last-Write-Wins strategy)
   */
  async syncChatHistory(): Promise<SyncResult> {
    try {
      // Get local chat history from IndexedDB (init happens automatically in getAllChats)
      const localChats = await chatHistoryDB.getAllChats();
      
      // Get remote chat history from Google Drive
      const remoteContent = await this.downloadFile(CHAT_HISTORY_FILENAME);
      const remoteChats: ChatHistoryEntry[] = remoteContent ? JSON.parse(remoteContent) : [];
      
      // Find max timestamps
      const localTimestamp = localChats.length > 0 ? Math.max(...localChats.map(c => c.timestamp)) : 0;
      const remoteTimestamp = remoteChats.length > 0 ? Math.max(...remoteChats.map(c => c.timestamp)) : 0;
      
      let action: SyncResult['action'] = 'no-change';
      let itemCount = localChats.length;
      
      // Sync logic: Last-Write-Wins
      if (localChats.length === 0 && remoteChats.length > 0) {
        // Download remote → local
        console.log(`📥 Downloading ${remoteChats.length} chat(s) from Google Drive...`);
        for (const chat of remoteChats) {
          await chatHistoryDB.saveChat(
            chat.id,
            chat.messages,
            chat.title,
            {
              systemPrompt: chat.systemPrompt,
              planningQuery: chat.planningQuery,
              generatedSystemPrompt: chat.generatedSystemPrompt,
              generatedUserQuery: chat.generatedUserQuery,
              selectedSnippetIds: chat.selectedSnippetIds,
              todosState: chat.todosState
            }
          );
        }
        action = 'downloaded';
        itemCount = remoteChats.length;
      } else if (remoteChats.length === 0 && localChats.length > 0) {
        // Upload local → remote
        console.log(`📤 Uploading ${localChats.length} chat(s) to Google Drive...`);
        await this.uploadChatHistory(localChats);
        action = 'uploaded';
      } else if (localTimestamp > remoteTimestamp) {
        // Local is newer → upload
        console.log(`📤 Uploading ${localChats.length} chat(s) (local newer)...`);
        await this.uploadChatHistory(localChats);
        action = 'uploaded';
      } else if (remoteTimestamp > localTimestamp) {
        // Remote is newer → download
        console.log(`📥 Downloading ${remoteChats.length} chat(s) (remote newer)...`);
        // Clear local and restore from remote
        const allLocalChats = await chatHistoryDB.getAllChats();
        for (const chat of allLocalChats) {
          await chatHistoryDB.deleteChat(chat.id);
        }
        for (const chat of remoteChats) {
          await chatHistoryDB.saveChat(
            chat.id,
            chat.messages,
            chat.title,
            {
              systemPrompt: chat.systemPrompt,
              planningQuery: chat.planningQuery,
              generatedSystemPrompt: chat.generatedSystemPrompt,
              generatedUserQuery: chat.generatedUserQuery,
              selectedSnippetIds: chat.selectedSnippetIds,
              todosState: chat.todosState
            }
          );
        }
        action = 'downloaded';
        itemCount = remoteChats.length;
      }
      
      // Update metadata
      if (action !== 'no-change') {
        await this.updateSyncMetadata('chatHistory', itemCount);
      }
      
      return {
        success: true,
        action,
        timestamp: Date.now(),
        itemCount
      };
      
    } catch (error: any) {
      console.error('Failed to sync chat history:', error);
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Upload chat history to Google Drive
   */
  async uploadChatHistory(chats: ChatHistoryEntry[]): Promise<void> {
    const content = JSON.stringify(chats, null, 2);
    await this.uploadFile(CHAT_HISTORY_FILENAME, content);
  }

  /**
   * Download chat history from Google Drive
   */
  async downloadChatHistory(): Promise<ChatHistoryEntry[]> {
    const content = await this.downloadFile(CHAT_HISTORY_FILENAME);
    if (!content) return [];
    return JSON.parse(content);
  }

  /**
   * Sync quiz progress/statistics (Last-Write-Wins strategy)
   */
  async syncQuizProgress(): Promise<SyncResult> {
    try {
      // Get local quiz statistics from IndexedDB
      await quizDB.init();
      const localStats = await quizDB.getQuizStatistics(); // Returns all statistics
      
      // Get remote quiz progress from Google Drive
      const remoteContent = await this.downloadFile(QUIZ_PROGRESS_FILENAME);
      const remoteStats: QuizStatistic[] = remoteContent ? JSON.parse(remoteContent) : [];
      
      // Find max timestamps (completedAt is ISO string)
      const localTimestamp = localStats.length > 0 
        ? Math.max(...localStats.map(s => new Date(s.completedAt).getTime())) 
        : 0;
      const remoteTimestamp = remoteStats.length > 0 
        ? Math.max(...remoteStats.map(s => new Date(s.completedAt).getTime())) 
        : 0;
      
      let action: SyncResult['action'] = 'no-change';
      let itemCount = localStats.length;
      
      // Sync logic: Last-Write-Wins
      if (localStats.length === 0 && remoteStats.length > 0) {
        // Download remote → local
        console.log(`📥 Downloading ${remoteStats.length} quiz statistic(s) from Google Drive...`);
        for (const stat of remoteStats) {
          await quizDB.saveQuizStatistic({
            quizTitle: stat.quizTitle,
            snippetIds: stat.snippetIds,
            score: stat.score,
            totalQuestions: stat.totalQuestions,
            timeTaken: stat.timeTaken,
            completedAt: stat.completedAt,
            answers: stat.answers,
            enrichment: stat.enrichment,
            completed: stat.completed,
            quizData: stat.quizData
          });
        }
        action = 'downloaded';
        itemCount = remoteStats.length;
      } else if (remoteStats.length === 0 && localStats.length > 0) {
        // Upload local → remote
        console.log(`📤 Uploading ${localStats.length} quiz statistic(s) to Google Drive...`);
        await this.uploadQuizProgress(localStats);
        action = 'uploaded';
      } else if (localTimestamp > remoteTimestamp) {
        // Local is newer → upload
        console.log(`📤 Uploading ${localStats.length} quiz statistic(s) (local newer)...`);
        await this.uploadQuizProgress(localStats);
        action = 'uploaded';
      } else if (remoteTimestamp > localTimestamp) {
        // Remote is newer → download
        console.log(`📥 Downloading ${remoteStats.length} quiz statistic(s) (remote newer)...`);
        // Clear local and restore from remote
        await quizDB.clearAllStatistics();
        for (const stat of remoteStats) {
          await quizDB.saveQuizStatistic({
            quizTitle: stat.quizTitle,
            snippetIds: stat.snippetIds,
            score: stat.score,
            totalQuestions: stat.totalQuestions,
            timeTaken: stat.timeTaken,
            completedAt: stat.completedAt,
            answers: stat.answers,
            enrichment: stat.enrichment,
            completed: stat.completed,
            quizData: stat.quizData
          });
        }
        action = 'downloaded';
        itemCount = remoteStats.length;
      }
      
      // Update metadata
      if (action !== 'no-change') {
        await this.updateSyncMetadata('quizProgress', itemCount);
      }
      
      return {
        success: true,
        action,
        timestamp: Date.now(),
        itemCount
      };
      
    } catch (error: any) {
      console.error('Failed to sync quiz progress:', error);
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Upload quiz progress to Google Drive
   */
  async uploadQuizProgress(stats: QuizStatistic[]): Promise<void> {
    const content = JSON.stringify(stats, null, 2);
    await this.uploadFile(QUIZ_PROGRESS_FILENAME, content);
  }

  /**
   * Download quiz progress from Google Drive
   */
  async downloadQuizProgress(): Promise<QuizStatistic[]> {
    const content = await this.downloadFile(QUIZ_PROGRESS_FILENAME);
    if (!content) return [];
    return JSON.parse(content);
  }

  /**
   * Sync settings (Last-Write-Wins strategy)
   */
  async syncSettings(): Promise<SyncResult> {
    try {
      // Get local settings from localStorage (specific user preference keys)
      // Exclude auth tokens, sync metadata, and data storage keys
      const settingsKeys = [
        'auto_sync_enabled', 'proxy_settings', 'rag_config', 
        'playbackRate', 'volume', 'repeatMode', 'shuffleMode', 'videoQuality',
        'user_location', 'has_completed_welcome_wizard'
      ];
      
      const localSettings: Record<string, string> = {};
      settingsKeys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) {
          localSettings[key] = value;
        }
      });
      
      const hasLocalSettings = Object.keys(localSettings).length > 0;
      const localTimestamp = Date.now(); // Settings don't have timestamp, use current
      
      // Get remote settings from Google Drive
      const remoteContent = await this.downloadFile(SETTINGS_FILENAME);
      const remoteData = remoteContent ? JSON.parse(remoteContent) : null;
      const remoteSettings = remoteData?.settings || null;
      const remoteTimestamp = remoteData?.timestamp || 0;
      
      let action: SyncResult['action'] = 'no-change';
      let itemCount = hasLocalSettings ? Object.keys(localSettings).length : 0;
      
      // Sync logic: Last-Write-Wins
      if (!hasLocalSettings && remoteSettings) {
        // Download remote → local
        console.log(`📥 Downloading settings from Google Drive...`);
        // Restore settings to localStorage
        Object.keys(remoteSettings).forEach(key => {
          localStorage.setItem(key, remoteSettings[key]);
        });
        action = 'downloaded';
        itemCount = Object.keys(remoteSettings).length;
      } else if (hasLocalSettings && !remoteSettings) {
        // Upload local → remote
        console.log(`📤 Uploading ${Object.keys(localSettings).length} setting(s) to Google Drive...`);
        await this.uploadSettings(localSettings);
        action = 'uploaded';
      } else if (hasLocalSettings && remoteSettings && localTimestamp > remoteTimestamp) {
        // Local is newer → upload
        console.log(`📤 Uploading ${Object.keys(localSettings).length} setting(s) (local newer)...`);
        await this.uploadSettings(localSettings);
        action = 'uploaded';
      } else if (remoteSettings && remoteTimestamp > localTimestamp) {
        // Remote is newer → download
        console.log(`📥 Downloading ${Object.keys(remoteSettings).length} setting(s) (remote newer)...`);
        Object.keys(remoteSettings).forEach(key => {
          localStorage.setItem(key, remoteSettings[key]);
        });
        action = 'downloaded';
        itemCount = Object.keys(remoteSettings).length;
      }
      
      // Update metadata
      if (action !== 'no-change') {
        await this.updateSyncMetadata('settings', itemCount);
      }
      
      return {
        success: true,
        action,
        timestamp: Date.now(),
        itemCount
      };
      
    } catch (error: any) {
      console.error('Failed to sync settings:', error);
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Upload settings to Google Drive
   */
  async uploadSettings(settings: any): Promise<void> {
    const data = {
      settings,
      timestamp: Date.now()
    };
    const content = JSON.stringify(data, null, 2);
    await this.uploadFile(SETTINGS_FILENAME, content);
  }

  /**
   * Download settings from Google Drive
   */
  async downloadSettings(): Promise<any | null> {
    const content = await this.downloadFile(SETTINGS_FILENAME);
    if (!content) return null;
    const data = JSON.parse(content);
    return data.settings || null;
  }

  /**
   * Sync images from IndexedDB to Google Drive as actual image files
   * Includes garbage collection - removes images not referenced by any snippet
   * NOTE: Garbage collection happens AFTER syncing to ensure newly downloaded
   * snippets are included in the reference check
   */
  async syncImages(): Promise<SyncResult> {
    try {
      // Get local images from IndexedDB
      const localImages = await imageStorage.getAllImages();
      
      // Get or create Images folder in Drive
      const imagesFolderId = await this.getOrCreateImagesFolder();
      
      // Get list of image files in Drive
      const remoteImageFiles = await this.listImagesInDrive(imagesFolderId);
      const remoteImageIds = new Set(remoteImageFiles.map(f => f.name.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '')));
      
      let uploaded = 0;
      let downloaded = 0;
      
      // Upload local images that don't exist in Drive
      for (const imageMetadata of localImages) {
        if (!remoteImageIds.has(imageMetadata.id)) {
          console.log(`📤 Uploading image: ${imageMetadata.id}`);
          await this.uploadImageFile(imagesFolderId, imageMetadata);
          uploaded++;
        }
      }
      
      // Download remote images that don't exist locally
      const localImageIds = new Set(localImages.map(img => img.id));
      for (const remoteFile of remoteImageFiles) {
        const imageId = remoteFile.name.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
        if (!localImageIds.has(imageId)) {
          console.log(`📥 Downloading image: ${imageId}`);
          await this.downloadImageFile(remoteFile.id, imageId, remoteFile.name);
          downloaded++;
        }
      }
      
      let action: SyncResult['action'] = 'no-change';
      let itemCount = localImages.length;
      
      if (uploaded > 0 && downloaded === 0) {
        action = 'uploaded';
      } else if (downloaded > 0 && uploaded === 0) {
        action = 'downloaded';
        itemCount = localImages.length + downloaded;
      } else if (uploaded > 0 || downloaded > 0) {
        action = 'uploaded'; // Mixed operation, report as uploaded
      }
      
      // Update metadata
      if (action !== 'no-change') {
        await this.updateSyncMetadata('images', itemCount);
      }
      
      return {
        success: true,
        action,
        timestamp: Date.now(),
        itemCount
      };
      
    } catch (error: any) {
      console.error('Failed to sync images:', error);
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Perform garbage collection on images
   * Removes images that are not referenced by any snippet
   * Should be called AFTER snippets are synced
   */
  async garbageCollectImages(): Promise<{ deletedLocal: number; deletedDrive: number }> {
    try {
      console.log('🗑️ Starting image garbage collection...');
      
      // Get all snippets and check which images are referenced
      const snippetsData = await storage.getItem('swag-snippets');
      const snippets: ContentSnippet[] = snippetsData && typeof snippetsData === 'string' ? JSON.parse(snippetsData) : [];
      const allSnippetContents = snippets.map(s => s.content);
      
      // Garbage collect orphaned images locally
      const deletedLocalCount = await imageStorage.garbageCollect(allSnippetContents);
      if (deletedLocalCount > 0) {
        console.log(`🗑️ Garbage collected ${deletedLocalCount} orphaned images from IndexedDB`);
      }
      
      // Get remaining images (the ones that are referenced)
      const localImages = await imageStorage.getAllImages();
      const referencedImageIds = new Set(localImages.map(img => img.id));
      
      // Get or create Images folder in Drive
      const imagesFolderId = await this.getOrCreateImagesFolder();
      
      // Get list of image files in Drive
      const remoteImageFiles = await this.listImagesInDrive(imagesFolderId);
      
      // Garbage collect orphaned images from Drive
      let deletedDriveCount = 0;
      for (const remoteFile of remoteImageFiles) {
        const imageId = remoteFile.name.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
        if (!referencedImageIds.has(imageId)) {
          console.log(`🗑️ Deleting orphaned image from Drive: ${imageId}`);
          await this.deleteImageFile(remoteFile.id);
          deletedDriveCount++;
        }
      }
      
      if (deletedDriveCount > 0) {
        console.log(`🗑️ Garbage collected ${deletedDriveCount} orphaned images from Google Drive`);
      }
      
      return { deletedLocal: deletedLocalCount, deletedDrive: deletedDriveCount };
      
    } catch (error: any) {
      console.error('Failed to garbage collect images:', error);
      return { deletedLocal: 0, deletedDrive: 0 };
    }
  }

  /**
   * Get or create Images folder inside app folder
   */
  private async getOrCreateImagesFolder(): Promise<string> {
    const appFolderId = await this.getAppFolder();
    const token = localStorage.getItem('google_access_token');
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Search for Images folder
    const query = `name='Images' and '${appFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!searchResponse.ok) {
      throw new Error(`Failed to search for Images folder: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // Create Images folder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Images',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [appFolderId]
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create Images folder: ${createResponse.statusText}`);
    }

    const folderData = await createResponse.json();
    console.log('📁 Created Images folder in Google Drive');
    return folderData.id;
  }

  /**
   * List all image files in the Images folder
   */
  private async listImagesInDrive(folderId: string): Promise<Array<{ id: string; name: string }>> {
    const token = localStorage.getItem('google_access_token');
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    const query = `'${folderId}' in parents and trashed=false and (mimeType contains 'image/')`;
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list images: ${response.statusText}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  /**
   * Upload image file to Google Drive
   */
  private async uploadImageFile(folderId: string, imageMetadata: ImageMetadata): Promise<void> {
    const token = localStorage.getItem('google_access_token');
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Convert base64 to blob (not needed for multipart upload, but validates the data)
    const base64Data = imageMetadata.data.split(',')[1];
    const mimeType = imageMetadata.mimeType || 'image/png';

    // Determine file extension
    const ext = mimeType.split('/')[1] || 'png';
    const filename = `${imageMetadata.id}.${ext}`;

    // Create metadata
    const metadata = {
      name: filename,
      parents: [folderId],
      mimeType: mimeType
    };

    // Use multipart upload
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: ' + mimeType + '\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      close_delim;

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!response.ok) {
      throw new Error(`Failed to upload image: ${response.statusText}`);
    }

    console.log(`✅ Uploaded image file: ${filename}`);
  }

  /**
   * Download image file from Google Drive and save to IndexedDB
   */
  private async downloadImageFile(fileId: string, imageId: string, filename: string): Promise<void> {
    const token = localStorage.getItem('google_access_token');
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Download the file
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const blob = await response.blob();
    
    // Convert to base64
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Determine dimensions
    let width = 0;
    let height = 0;
    try {
      const img = new Image();
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = base64Data;
      });
      width = dimensions.width;
      height = dimensions.height;
    } catch (e) {
      console.warn('Could not determine image dimensions:', e);
    }

    // Save to IndexedDB directly (preserving original ID)
    const metadata: ImageMetadata = {
      id: imageId,
      data: base64Data,
      size: base64Data.length,
      mimeType: blob.type,
      width,
      height,
      createdAt: Date.now()
    };

    await this.saveImageDirectly(metadata);
    console.log(`✅ Downloaded and saved image: ${filename}`);
  }

  /**
   * Delete image file from Google Drive
   */
  private async deleteImageFile(fileId: string): Promise<void> {
    const token = localStorage.getItem('google_access_token');
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete image: ${response.statusText}`);
    }

    console.log(`✅ Deleted image file from Drive: ${fileId}`);
  }

  /**
   * Upload images to Google Drive (DEPRECATED - kept for backward compatibility)
   */
  async uploadImages(images: ImageMetadata[]): Promise<void> {
    // This method is deprecated but kept for backward compatibility
    // New code should use uploadImageFile instead
    const data = {
      images,
      timestamp: Date.now()
    };
    const content = JSON.stringify(data, null, 2);
    await this.uploadFile(IMAGES_FILENAME, content);
  }

  /**
   * Download images to IndexedDB (DEPRECATED - kept for backward compatibility)
   */
  async downloadImagesToIndexedDB(images: ImageMetadata[]): Promise<void> {
    // Clear existing images first to avoid duplicates
    await imageStorage.clearAll();
    
    // Save all images to IndexedDB
    for (const imageData of images) {
      // The image data already has the full base64 data
      // We need to save it using the saveImage method which will create a new reference
      // But we want to preserve the original ID
      try {
        // Directly insert the metadata into IndexedDB to preserve IDs
        await this.saveImageDirectly(imageData);
      } catch (error) {
        console.warn(`⚠️ Failed to restore image ${imageData.id}:`, error);
      }
    }
  }

  /**
   * Save image directly to IndexedDB (bypasses imageStorage.saveImage to preserve IDs)
   */
  private async saveImageDirectly(metadata: ImageMetadata): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('swag-images', 1);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['images'], 'readwrite');
        const objectStore = transaction.objectStore('images');
        const putRequest = objectStore.put(metadata);
        
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
        
        transaction.oncomplete = () => db.close();
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Sync all data: plans, playlists, snippets, embeddings, chat history, quiz progress, settings, and images
   * NOTE: Images must be synced BEFORE snippets because snippets contain swag-image:// references
   */
  async syncAll(): Promise<{ 
    plans: SyncResult, 
    playlists: SyncResult, 
    snippets: SyncResult,
    embeddings: SyncResult,
    chatHistory: SyncResult,
    quizProgress: SyncResult,
    settings: SyncResult,
    images: SyncResult
  }> {
    // Prevent concurrent sync operations
    if (this.syncInProgress) {
      console.log('⏸️ Sync already in progress, skipping duplicate request');
      throw new Error('Sync operation already in progress');
    }

    try {
      this.syncInProgress = true;
      this.updateSyncProgress('Starting sync...', 0, 8);
      
      // Dispatch toast notification that sync started
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: '🔄 Syncing data to Google Drive...', type: 'info', persistent: true, id: 'cloud-sync' }
      }));

      // Sync images first (snippets reference them via swag-image:// URLs)
      // NOTE: This uploads/downloads images but does NOT perform garbage collection yet
      this.updateSyncProgress('Syncing images', 1, 8);
      const images = await this.syncImages();
      
      // Then sync everything else in parallel
      this.updateSyncProgress('Syncing data', 2, 8);
      const [plans, playlists, snippets, embeddings, chatHistory, quizProgress, settings] = await Promise.all([
        this.syncPlans(),
        this.syncPlaylists(),
        this.syncSnippets(),
        this.syncEmbeddings(),
        this.syncChatHistory(),
        this.syncQuizProgress(),
        this.syncSettings()
      ]);

      // IMPORTANT: Perform image garbage collection AFTER snippets are synced
      // This ensures that newly downloaded snippets are included when checking image references
      this.updateSyncProgress('Cleaning up orphaned images', 7, 8);
      await this.garbageCollectImages();

      this.updateSyncProgress('Sync complete', 8, 8);
      
      console.log('✅ Sync completed successfully:', {
        plans: plans.action,
        playlists: playlists.action,
        snippets: snippets.action,
        embeddings: embeddings.action,
        chatHistory: chatHistory.action,
        quizProgress: quizProgress.action,
        settings: settings.action,
        images: images.action
      });
      
      // Dispatch toast notification that sync completed
      window.dispatchEvent(new CustomEvent('remove-toast', {
        detail: { id: 'cloud-sync' }
      }));
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: '✅ Sync complete!', type: 'success', duration: 3000 }
      }));
      
      return { plans, playlists, snippets, embeddings, chatHistory, quizProgress, settings, images };
    } catch (error) {
      // Remove syncing toast and show error
      window.dispatchEvent(new CustomEvent('remove-toast', {
        detail: { id: 'cloud-sync' }
      }));
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: { message: `❌ Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`, type: 'error', duration: 7000 }
      }));
      throw error;
    } finally {
      this.syncInProgress = false;
      this.currentSyncOperation = null;
      this.syncProgress = 0;
      this.syncTotal = 0;
      
      // Dispatch completion event
      window.dispatchEvent(new CustomEvent('sync-complete'));
    }
  }  /**
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
        lastChatHistorySync: 0,
        lastQuizProgressSync: 0,
        lastSettingsSync: 0,
        lastImagesSync: 0,
        plansCount: 0,
        playlistsCount: 0,
        snippetsCount: 0,
        embeddingsCount: 0,
        chatHistoryCount: 0,
        quizProgressCount: 0,
        settingsCount: 0,
        imagesCount: 0
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
      lastChatHistorySync: parsed.lastChatHistorySync || 0,
      lastQuizProgressSync: parsed.lastQuizProgressSync || 0,
      lastSettingsSync: parsed.lastSettingsSync || 0,
      lastImagesSync: parsed.lastImagesSync || 0,
      plansCount: parsed.plansCount || 0,
      playlistsCount: parsed.playlistsCount || 0,
      snippetsCount: parsed.snippetsCount || 0,
      embeddingsCount: parsed.embeddingsCount || 0,
      chatHistoryCount: parsed.chatHistoryCount || 0,
      quizProgressCount: parsed.quizProgressCount || 0,
      settingsCount: parsed.settingsCount || 0,
      imagesCount: parsed.imagesCount || 0
    };
  }

  /**
   * Update sync metadata
   */
  private async updateSyncMetadata(
    type: 'plans' | 'playlists' | 'snippets' | 'embeddings' | 'chatHistory' | 'quizProgress' | 'settings' | 'images', 
    itemCount: number
  ): Promise<void> {
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
    } else if (type === 'embeddings') {
      metadata.lastEmbeddingsSync = Date.now();
      metadata.embeddingsCount = itemCount;
    } else if (type === 'chatHistory') {
      metadata.lastChatHistorySync = Date.now();
      metadata.chatHistoryCount = itemCount;
    } else if (type === 'quizProgress') {
      metadata.lastQuizProgressSync = Date.now();
      metadata.quizProgressCount = itemCount;
    } else if (type === 'settings') {
      metadata.lastSettingsSync = Date.now();
      metadata.settingsCount = itemCount;
    } else if (type === 'images') {
      metadata.lastImagesSync = Date.now();
      metadata.imagesCount = itemCount;
    }

    const content = JSON.stringify(metadata, null, 2);
    await this.uploadFile(METADATA_FILENAME, content);
  }

  /**
   * Trigger auto-sync with debounce
   * Multiple calls within 20 seconds will be batched into a single sync
   */
  triggerAutoSync(): void {
    // Check if auto-sync is enabled
    const autoSyncEnabled = localStorage.getItem('auto_sync_enabled');
    if (autoSyncEnabled !== 'true') {
      return;
    }

    // Clear existing timer
    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
    }

    // Set new timer
    this.autoSyncTimer = setTimeout(async () => {
      try {
        console.log('🔄 Auto-sync triggered (debounced 10s)');
        const isAuth = await this.isAuthenticated();
        if (!isAuth) {
          console.log('⏭️ Auto-sync skipped: Not authenticated');
          return;
        }
        
        await this.syncAll();
        console.log('✅ Auto-sync completed');
      } catch (error) {
        console.error('❌ Auto-sync failed:', error);
      }
    }, this.AUTO_SYNC_DEBOUNCE_MS);
  }

  /**
   * Trigger auto-sync specifically for settings changes
   * Can be called from anywhere settings are modified
   */
  triggerSettingsSync(): void {
    this.triggerAutoSync();
  }

  /**
   * Trigger immediate sync (no debounce)
   * Used for login events and enabling cloud sync
   */
  async triggerImmediateSync(): Promise<void> {
    try {
      console.log('🔄 Immediate sync triggered');
      const isAuth = await this.isAuthenticated();
      if (!isAuth) {
        console.log('⏭️ Immediate sync skipped: Not authenticated');
        return;
      }
      
      const autoSyncEnabled = localStorage.getItem('auto_sync_enabled');
      if (autoSyncEnabled !== 'true') {
        console.log('⏭️ Immediate sync skipped: Auto-sync not enabled');
        return;
      }
      
      await this.syncAll();
      console.log('✅ Immediate sync completed');
    } catch (error) {
      console.error('❌ Immediate sync failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const googleDriveSync = new GoogleDriveSync();
