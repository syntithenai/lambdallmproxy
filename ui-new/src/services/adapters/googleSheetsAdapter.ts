/**
 * Google Sheets Sync Adapter
 * Integrates quizzes, feed items, snippets, config, and embeddings with unified sync system
 * Syncs between IndexedDB (local) and Google Sheets (remote) via /sync endpoint
 */

import type { SyncAdapter } from '../unifiedSync';
import { quizDB } from '../../db/quizDb';
import { feedDB } from '../../db/feedDb';
import { getCachedApiBase, buildApiHeaders } from '../../utils/api';
import { requestGoogleAuth } from '../../utils/googleDocs';

interface SyncData {
  quizzes?: any[];
  feedItems?: any[];
  snippets?: any[];
  config?: any;
  embeddings?: any[];
  lastModified?: number;
}

/**
 * Google Sheets Sync Adapter for Unified Sync
 * Uses the backend /sync endpoint to synchronize all data types at once
 */
export class GoogleSheetsAdapter implements SyncAdapter {
  name = 'google-sheets';
  enabled = true;

  /**
   * Pull data from Google Sheets backend
   */
  async pull(): Promise<SyncData> {
    const apiBase = await getCachedApiBase();
    const driveToken = await requestGoogleAuth();
    const headers = buildApiHeaders(driveToken);

    // Get local data to compare with remote
    const localQuizzes = await quizDB.getQuizStatistics();
    const localFeedItems = await feedDB.getItems(1000);
    
    // Get local snippets from storage
    const { storage } = await import('../../utils/storage');
    const localSnippets = await storage.getItem<any[]>('swag-snippets') || [];

    const response = await fetch(`${apiBase}/sync`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'X-Drive-Token': driveToken
      },
      body: JSON.stringify({
        quizzes: { local: localQuizzes },
        feedItems: { local: localFeedItems },
        snippets: { local: localSnippets },
        config: { local: null }, // TODO: Add config local data
        embeddings: { local: [] } // TODO: Add embeddings local data
      })
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Extract merged data from response
    return {
      quizzes: result.quizzes?.merged || [],
      feedItems: result.feedItems?.merged || [],
      snippets: result.snippets?.merged || [],
      config: result.config?.merged || null,
      embeddings: result.embeddings?.merged || [],
      lastModified: result.syncTime
    };
  }

  /**
   * Push local data to Google Sheets backend
   * Note: The /sync endpoint handles push automatically during pull
   */
  async push(_data: SyncData): Promise<void> {
    // The /sync endpoint is bidirectional - it pushes and pulls in one operation
    // This method is called by the unified sync framework but we don't need
    // separate push logic since pull() already handles both directions
    console.log('GoogleSheetsAdapter: Push handled by bidirectional /sync endpoint');
  }

  /**
   * Get the local data for comparison
   */
  async getLocalData(): Promise<SyncData> {
    const quizzes = await quizDB.getQuizStatistics();
    const feedItems = await feedDB.getItems(1000);
    
    // Get local snippets from storage
    const { storage } = await import('../../utils/storage');
    const snippets = await storage.getItem<any[]>('swag-snippets') || [];
    
    return {
      quizzes,
      feedItems,
      snippets,
      config: null, // TODO: Add config local storage
      embeddings: [] // TODO: Add embeddings local storage
    };
  }

  /**
   * Save merged data to IndexedDB
   */
  async setLocalData(data: SyncData): Promise<void> {
    const updates: Promise<any>[] = [];

    // Update quizzes
    if (data.quizzes && data.quizzes.length > 0) {
      // Clear existing quizzes
      const existingQuizzes = await quizDB.getQuizStatistics();
      for (const quiz of existingQuizzes) {
        updates.push(quizDB.deleteQuizStatistic(quiz.id));
      }

      // Save merged quizzes
      for (const quiz of data.quizzes) {
        updates.push(quizDB.saveQuizStatistic(quiz));
      }
    }

    // Update feed items
    if (data.feedItems && data.feedItems.length > 0) {
      // Clear existing feed items
      const existingItems = await feedDB.getItems(1000);
      for (const item of existingItems) {
        updates.push(feedDB.deleteItem(item.id));
      }

      // Save merged feed items
      updates.push(feedDB.saveItems(data.feedItems));
    }

    // Update snippets
    if (data.snippets && data.snippets.length > 0) {
      const { storage } = await import('../../utils/storage');
      updates.push(storage.setItem('swag-snippets', data.snippets));
    }

    // TODO: Update config, embeddings when implemented

    await Promise.all(updates);
    console.log('✓ Google Sheets sync: Local data updated');
  }

  /**
   * Get last modified timestamp from local data
   */
  async getLastModified(): Promise<number> {
    const [quizzes, feedItems] = await Promise.all([
      quizDB.getQuizStatistics(),
      feedDB.getItems(1000)
    ]);

    let lastModified = 0;

    // Find most recent quiz update
    quizzes.forEach((q: any) => {
      const timestamp = new Date(q.updated_at || q.created_at).getTime();
      if (timestamp > lastModified) {
        lastModified = timestamp;
      }
    });

    // Find most recent feed item update
    feedItems.forEach((f: any) => {
      const timestamp = new Date(f.updated_at || f.created_at).getTime();
      if (timestamp > lastModified) {
        lastModified = timestamp;
      }
    });

    return lastModified;
  }

  /**
   * Check if sync is needed
   * Compares local last modified time with last sync time
   */
  async shouldSync(): Promise<boolean> {
    const lastSyncTime = this.getLastSyncTime();
    const lastModified = await this.getLastModified();

    // Sync if we've never synced or if local data is newer
    return lastSyncTime === 0 || lastModified > lastSyncTime;
  }

  /**
   * Custom merge logic (optional)
   * The /sync endpoint handles merging, but this can be used for additional client-side merging
   */
  mergeData(_local: SyncData, remote: SyncData): SyncData {
    // Backend handles the merge, but we can do additional client-side merging here if needed
    return remote; // Use remote as source of truth (already merged by backend)
  }

  /**
   * Get last sync time from localStorage
   */
  private getLastSyncTime(): number {
    const lastSync = localStorage.getItem('google_sheets_last_sync');
    return lastSync ? parseInt(lastSync, 10) : 0;
  }
}

// Export singleton instance
export const googleSheetsAdapter = new GoogleSheetsAdapter();
