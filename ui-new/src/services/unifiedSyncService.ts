/**
 * Unified Sync Service
 * Handles bidirectional sync between IndexedDB and backend Google Sheets
 * Single endpoint syncs all data types: quizzes, snippets, feed items, config, embeddings
 */

import { feedDB } from '../db/feedDb';
import { quizDB } from '../db/quizDb';
import { getCachedApiBase, buildApiHeaders } from '../utils/api';

interface SyncResult<T> {
  remote: T[];
  merged: T[];
  conflicts: Array<{ id: string; reason: string; error: string }>;
  error?: string;
}

interface UnifiedSyncResponse {
  syncTime: string;
  quizzes: SyncResult<any> | null;
  snippets: SyncResult<any> | null;
  feedItems: SyncResult<any> | null;
  config: { remote: any; merged: any; note?: string } | null;
  embeddings: SyncResult<any> | null;
}

interface UnifiedSyncRequest {
  quizzes?: { local: any[] };
  snippets?: { local: any[] };
  feedItems?: { local: any[] };
  config?: { local: any };
  embeddings?: { local: any[] };
}

/**
 * Perform unified sync - syncs all data types in one request
 * @param options - What to sync (defaults to all)
 * @returns Sync results for each data type
 */
export async function performUnifiedSync(options: {
  syncQuizzes?: boolean;
  syncSnippets?: boolean;
  syncFeedItems?: boolean;
  syncConfig?: boolean;
  syncEmbeddings?: boolean;
} = {}): Promise<UnifiedSyncResponse> {
  const {
    syncQuizzes = true,
    syncSnippets = false, // Snippets managed separately via tools
    syncFeedItems = true,
    syncConfig = false,
    syncEmbeddings = false
  } = options;

  console.log('🔄 Starting unified sync...', { syncQuizzes, syncSnippets, syncFeedItems, syncConfig, syncEmbeddings });

  try {
    const endpoint = await getCachedApiBase();
    const token = localStorage.getItem('googleToken');
    const driveToken = localStorage.getItem('driveAccessToken');

    if (!token) {
      throw new Error('Authentication required - please sign in');
    }

    if (!driveToken) {
      throw new Error('Google Drive connection required - please connect in Settings');
    }

    // Prepare request body with local data
    const requestBody: UnifiedSyncRequest = {};

    // Gather quizzes from IndexedDB
    if (syncQuizzes) {
      try {
        const localQuizzes = await quizDB.getQuizStatistics();
        requestBody.quizzes = { local: localQuizzes };
        console.log(`📦 Prepared ${localQuizzes.length} local quizzes for sync`);
      } catch (error) {
        console.error('Failed to load local quizzes:', error);
        requestBody.quizzes = { local: [] };
      }
    }

    // Gather feed items from IndexedDB
    if (syncFeedItems) {
      try {
        const localFeedItems = await feedDB.getItems(1000); // Get up to 1000 items
        requestBody.feedItems = { local: localFeedItems };
        console.log(`📦 Prepared ${localFeedItems.length} local feed items for sync`);
      } catch (error) {
        console.error('Failed to load local feed items:', error);
        requestBody.feedItems = { local: [] };
      }
    }

    // Config sync (placeholder)
    if (syncConfig) {
      requestBody.config = { local: {} };
    }

    // Embeddings sync (placeholder)
    if (syncEmbeddings) {
      requestBody.embeddings = { local: [] };
    }

    // Send sync request
    console.log('📤 Sending unified sync request...');
    const response = await fetch(`${endpoint}/sync`, {
      method: 'POST',
      headers: buildApiHeaders(token, {
        'Content-Type': 'application/json',
        'X-Drive-Token': driveToken
      }),
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Sync failed with status ${response.status}`);
    }

    const result: UnifiedSyncResponse = await response.json();
    console.log('✅ Unified sync response received:', {
      syncTime: result.syncTime,
      quizzes: result.quizzes ? `${result.quizzes.merged.length} merged` : 'skipped',
      feedItems: result.feedItems ? `${result.feedItems.merged.length} merged` : 'skipped',
      snippets: result.snippets ? `${result.snippets.merged.length} merged` : 'skipped'
    });

    // Update IndexedDB with merged results
    await applyMergedData(result, { syncQuizzes, syncFeedItems });

    return result;
  } catch (error) {
    console.error('❌ Unified sync failed:', error);
    throw error;
  }
}

/**
 * Apply merged data back to IndexedDB
 */
async function applyMergedData(
  result: UnifiedSyncResponse,
  options: { syncQuizzes?: boolean; syncFeedItems?: boolean }
): Promise<void> {
  const { syncQuizzes, syncFeedItems } = options;

  // Update quizzes
  if (syncQuizzes && result.quizzes && result.quizzes.merged.length > 0) {
    try {
      console.log(`💾 Saving ${result.quizzes.merged.length} merged quizzes to IndexedDB...`);
      
      // Get existing quiz IDs and remove them
      const existing = await quizDB.getQuizStatistics();
      for (const quiz of existing) {
        await quizDB.deleteQuizStatistic(quiz.id);
      }
      
      // Add merged quizzes
      for (const quiz of result.quizzes.merged) {
        await quizDB.saveQuizStatistic(quiz);
      }
      
      console.log('✅ Quizzes updated in IndexedDB');
      
      if (result.quizzes.conflicts.length > 0) {
        console.warn(`⚠️ ${result.quizzes.conflicts.length} quiz conflicts:`, result.quizzes.conflicts);
      }
    } catch (error) {
      console.error('Failed to update quizzes in IndexedDB:', error);
    }
  }

  // Update feed items
  if (syncFeedItems && result.feedItems && result.feedItems.merged.length > 0) {
    try {
      console.log(`💾 Saving ${result.feedItems.merged.length} merged feed items to IndexedDB...`);
      
      // Clear existing feed items
      const existing = await feedDB.getItems(1000);
      for (const item of existing) {
        await feedDB.deleteItem(item.id);
      }
      
      // Save merged items (batch save for efficiency)
      await feedDB.saveItems(result.feedItems.merged);
      
      console.log('✅ Feed items updated in IndexedDB');
      
      if (result.feedItems.conflicts.length > 0) {
        console.warn(`⚠️ ${result.feedItems.conflicts.length} feed item conflicts:`, result.feedItems.conflicts);
      }
    } catch (error) {
      console.error('Failed to update feed items in IndexedDB:', error);
    }
  }
}

/**
 * Sync only quizzes (convenience function)
 */
export async function syncQuizzes(): Promise<SyncResult<any> | null> {
  const result = await performUnifiedSync({
    syncQuizzes: true,
    syncSnippets: false,
    syncFeedItems: false,
    syncConfig: false,
    syncEmbeddings: false
  });
  return result.quizzes;
}

/**
 * Sync only feed items (convenience function)
 */
export async function syncFeedItems(): Promise<SyncResult<any> | null> {
  const result = await performUnifiedSync({
    syncQuizzes: false,
    syncSnippets: false,
    syncFeedItems: true,
    syncConfig: false,
    syncEmbeddings: false
  });
  return result.feedItems;
}

/**
 * Sync everything (convenience function)
 */
export async function syncAll(): Promise<UnifiedSyncResponse> {
  return performUnifiedSync({
    syncQuizzes: true,
    syncSnippets: false, // Managed separately
    syncFeedItems: true,
    syncConfig: false,
    syncEmbeddings: false
  });
}

/**
 * Check if sync is needed (compares last sync time with local changes)
 */
export async function isSyncNeeded(): Promise<boolean> {
  try {
    const lastSyncTime = localStorage.getItem('lastUnifiedSyncTime');
    
    if (!lastSyncTime) {
      return true; // Never synced
    }

    // Check if any local data was modified after last sync
    const quizzes = await quizDB.getQuizStatistics();
    const feedItems = await feedDB.getItems(1000);

    const lastSync = new Date(lastSyncTime);
    
    const hasNewQuizzes = quizzes.some((q: any) => 
      q.updated_at && new Date(q.updated_at) > lastSync
    );
    
    const hasNewFeedItems = feedItems.some((f: any) => 
      f.updated_at && new Date(f.updated_at) > lastSync
    );

    return hasNewQuizzes || hasNewFeedItems;
  } catch (error) {
    console.error('Failed to check sync status:', error);
    return true; // Assume sync needed on error
  }
}

/**
 * Get last sync time
 */
export function getLastSyncTime(): string | null {
  return localStorage.getItem('lastUnifiedSyncTime');
}

/**
 * Update last sync time
 */
export function updateLastSyncTime(time?: string): void {
  const syncTime = time || new Date().toISOString();
  localStorage.setItem('lastUnifiedSyncTime', syncTime);
}

/**
 * Auto-sync on app load (non-blocking)
 */
export async function autoSyncOnLoad(): Promise<void> {
  try {
    const needed = await isSyncNeeded();
    
    if (!needed) {
      console.log('✅ Data is up to date, skipping sync');
      return;
    }

    console.log('🔄 Auto-syncing on load...');
    const result = await syncAll();
    updateLastSyncTime(result.syncTime);
    console.log('✅ Auto-sync complete');
  } catch (error) {
    console.warn('⚠️ Auto-sync failed (non-critical):', error);
    // Don't throw - auto-sync failure shouldn't block app startup
  }
}
