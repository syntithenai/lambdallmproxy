/**
 * Feed Sync Service
 * 
 * Syncs feed items between local IndexedDB and backend Google Sheets
 * Uses the backend /feed/items endpoints for storage
 */

import { feedDB } from '../db/feedDb';
import type { FeedItem } from '../types/feed';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface FeedSyncResult {
  success: boolean;
  action: 'uploaded' | 'downloaded' | 'merged' | 'no-change' | 'error';
  timestamp: number;
  itemCount: number;
  error?: string;
}

/**
 * Feed Sync Service
 */
class FeedSyncService {
  private syncing = false;
  private lastSyncTime = 0;

  /**
   * Check if sync is in progress
   */
  isSyncing(): boolean {
    return this.syncing;
  }

  /**
   * Get last sync timestamp
   */
  getLastSyncTime(): number {
    return this.lastSyncTime;
  }

  /**
   * Get backend API endpoint (auto-detect local vs remote)
   */
  private async getApiEndpoint(): Promise<string> {
    // Check if local server is running
    try {
      const localUrl = 'http://localhost:3000';
      const response = await fetch(`${localUrl}/health`, { method: 'HEAD' });
      if (response.ok) {
        console.log('🏠 Using local Lambda server for feed sync');
        return localUrl;
      }
    } catch {
      // Local server not available, fall through to remote
    }

    // Use remote Lambda
    if (API_BASE_URL) {
      console.log('☁️ Using remote Lambda for feed sync');
      return API_BASE_URL;
    }

    throw new Error('No API endpoint available');
  }

  /**
   * Get authentication token from localStorage
   */
  private async getAuthToken(): Promise<string> {
    const token = localStorage.getItem('google_access_token');
    if (!token) {
      throw new Error('Not authenticated - please sign in to sync feed items');
    }
    return token;
  }

  /**
   * Get current project ID from localStorage
   */
  private getProjectId(): string | null {
    return localStorage.getItem('currentProjectId');
  }

  /**
   * Download feed items from backend (Google Sheets)
   */
  async downloadFeedItems(): Promise<FeedItem[]> {
    const apiEndpoint = await this.getApiEndpoint();
    const token = await this.getAuthToken();
    const projectId = this.getProjectId();

    const headers: HeadersInit = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    if (projectId) {
      headers['X-Project-ID'] = projectId;
    }

    const response = await fetch(`${apiEndpoint}/feed/items`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Failed to download feed items: ${error.error || response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Upload feed item to backend (Google Sheets)
   */
  async uploadFeedItem(item: FeedItem): Promise<FeedItem> {
    const apiEndpoint = await this.getApiEndpoint();
    const token = await this.getAuthToken();
    const projectId = this.getProjectId();

    const headers: HeadersInit = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    if (projectId) {
      headers['X-Project-ID'] = projectId;
    }

    const response = await fetch(`${apiEndpoint}/feed/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify(item)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Failed to upload feed item: ${error.error || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Vote on a feed item (updates backend)
   */
  async voteFeedItem(itemId: string, vote: 'up' | 'down' | ''): Promise<FeedItem> {
    const apiEndpoint = await this.getApiEndpoint();
    const token = await this.getAuthToken();
    const projectId = this.getProjectId();

    const headers: HeadersInit = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    if (projectId) {
      headers['X-Project-ID'] = projectId;
    }

    const response = await fetch(`${apiEndpoint}/feed/vote`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ itemId, vote })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Failed to vote on feed item: ${error.error || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Delete feed item from backend
   */
  async deleteFeedItem(itemId: string): Promise<void> {
    const apiEndpoint = await this.getApiEndpoint();
    const token = await this.getAuthToken();
    const projectId = this.getProjectId();

    const headers: HeadersInit = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    if (projectId) {
      headers['X-Project-ID'] = projectId;
    }

    const response = await fetch(`${apiEndpoint}/feed/items/${itemId}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Failed to delete feed item: ${error.error || response.statusText}`);
    }
  }

  /**
   * Full sync: Merge local IndexedDB with backend Google Sheets
   * 
   * Strategy:
   * 1. Download all feed items from backend
   * 2. Get all local items from IndexedDB
   * 3. Merge: Keep backend as source of truth, add any local-only items
   * 4. Update local IndexedDB with merged data
   */
  async fullSync(): Promise<FeedSyncResult> {
    if (this.syncing) {
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: 'Sync already in progress'
      };
    }

    this.syncing = true;

    try {
      console.log('🔄 Starting feed items sync...');

      // Initialize IndexedDB
      await feedDB.init();

      // Get local items
      const localItems = await feedDB.getItems(10000, 0); // Get all local items
      console.log(`📱 Found ${localItems.length} local feed items`);

      // Get remote items from backend (Google Sheets)
      const remoteItems = await this.downloadFeedItems();
      console.log(`☁️ Found ${remoteItems.length} remote feed items`);

      if (localItems.length === 0 && remoteItems.length === 0) {
        this.lastSyncTime = Date.now();
        return {
          success: true,
          action: 'no-change',
          timestamp: Date.now(),
          itemCount: 0
        };
      }

      // Create a map of remote items by ID
      const remoteMap = new Map<string, FeedItem>();
      for (const item of remoteItems) {
        remoteMap.set(item.id, item);
      }

      // Merge strategy:
      // - Backend (Google Sheets) is source of truth
      // - Keep all remote items
      // - Add local items that don't exist remotely (upload them)
      const itemsToUpload: FeedItem[] = [];
      const localMap = new Map<string, FeedItem>();

      for (const localItem of localItems) {
        localMap.set(localItem.id, localItem);

        // If item doesn't exist remotely, upload it
        if (!remoteMap.has(localItem.id)) {
          itemsToUpload.push(localItem);
        }
      }

      // Upload local-only items to backend
      let uploadedCount = 0;
      for (const item of itemsToUpload) {
        try {
          const uploadedItem = await this.uploadFeedItem(item);
          // Add to remote map so it's included in final merge
          remoteMap.set(uploadedItem.id, uploadedItem);
          uploadedCount++;
          console.log(`✅ Uploaded local feed item: ${item.title}`);
        } catch (error) {
          console.error(`❌ Failed to upload feed item ${item.id}:`, error);
        }
      }

      // Save all remote items (including newly uploaded) to local IndexedDB
      const allItems = Array.from(remoteMap.values());
      await feedDB.saveItems(allItems);

      this.lastSyncTime = Date.now();

      // Determine action
      let action: FeedSyncResult['action'] = 'no-change';
      if (uploadedCount > 0 && remoteItems.length > 0) {
        action = 'merged';
      } else if (uploadedCount > 0) {
        action = 'uploaded';
      } else if (remoteItems.length > localItems.length) {
        action = 'downloaded';
      }

      console.log(`✅ Feed sync complete: ${allItems.length} items (${uploadedCount} uploaded)`);

      return {
        success: true,
        action,
        timestamp: Date.now(),
        itemCount: allItems.length
      };

    } catch (error) {
      console.error('❌ Feed sync failed:', error);
      return {
        success: false,
        action: 'error',
        timestamp: Date.now(),
        itemCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Save a newly generated feed item
   * Saves to both local IndexedDB and backend Google Sheets
   */
  async saveFeedItem(item: FeedItem): Promise<FeedItem> {
    // Save to local IndexedDB
    await feedDB.init();
    await feedDB.saveItems([item]);

    // Upload to backend (Google Sheets)
    try {
      const uploadedItem = await this.uploadFeedItem(item);
      console.log(`✅ Saved feed item to backend: ${item.title}`);
      
      // Update local with backend response (may have server-assigned fields)
      await feedDB.saveItems([uploadedItem]);
      
      return uploadedItem;
    } catch (error) {
      console.error('❌ Failed to upload feed item to backend:', error);
      // Item is still saved locally, sync will pick it up later
      throw error;
    }
  }

  /**
   * Save multiple generated feed items (batch operation)
   */
  async saveFeedItems(items: FeedItem[]): Promise<FeedItem[]> {
    const savedItems: FeedItem[] = [];

    for (const item of items) {
      try {
        const savedItem = await this.saveFeedItem(item);
        savedItems.push(savedItem);
      } catch (error) {
        console.error(`Failed to save feed item ${item.id}:`, error);
        // Continue with other items
      }
    }

    return savedItems;
  }

  /**
   * Update vote on a feed item
   * Updates both local and remote
   */
  async updateVote(itemId: string, vote: 'up' | 'down' | ''): Promise<void> {
    // Update locally first
    await feedDB.init();
    const items = await feedDB.getItems(10000, 0);
    const item = items.find(i => i.id === itemId);

    if (!item) {
      throw new Error('Feed item not found');
    }

    // Update local vote counts
    const previousVote = item.userVote;
    
    // Remove previous vote
    if (previousVote === 'up') {
      item.upvoteCount = Math.max(0, (item.upvoteCount || 0) - 1);
    } else if (previousVote === 'down') {
      item.downvoteCount = Math.max(0, (item.downvoteCount || 0) - 1);
    }

    // Apply new vote
    if (vote === 'up') {
      item.upvoteCount = (item.upvoteCount || 0) + 1;
    } else if (vote === 'down') {
      item.downvoteCount = (item.downvoteCount || 0) + 1;
    }

    item.userVote = vote;

    // Save locally
    await feedDB.saveItems([item]);

    // Update backend
    try {
      const updatedItem = await this.voteFeedItem(itemId, vote);
      // Sync backend response back to local
      await feedDB.saveItems([updatedItem]);
      console.log(`✅ Updated vote for feed item: ${itemId}`);
    } catch (error) {
      console.error('❌ Failed to update vote on backend:', error);
      // Vote is saved locally, will sync later
      throw error;
    }
  }

  /**
   * Delete a feed item
   * Deletes from both local and remote
   */
  async deleteItem(itemId: string): Promise<void> {
    // Delete locally
    await feedDB.init();
    await feedDB.deleteItem(itemId);

    // Delete from backend
    try {
      await this.deleteFeedItem(itemId);
      console.log(`✅ Deleted feed item: ${itemId}`);
    } catch (error) {
      console.error('❌ Failed to delete feed item from backend:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const feedSyncService = new FeedSyncService();
