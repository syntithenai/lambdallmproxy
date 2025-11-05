/**
 * Google Sheets Sync Adapter
 * Integrates quizzes, feed items, snippets, config, and embeddings with unified sync system
 * Syncs between IndexedDB (local) and Google Sheets (remote) via DIRECT Google Sheets API calls
 * 
 * Uses OAuth2 token from browser to access user's own Google Drive/Sheets (no backend proxy needed)
 */

import type { SyncAdapter } from '../unifiedSync';
import { quizDB } from '../../db/quizDb';
import { feedDB } from '../../db/feedDb';
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
 * Calls Google Sheets Data API directly from browser (no backend proxy)
 */
export class GoogleSheetsAdapter implements SyncAdapter {
  name = 'google-sheets';
  enabled = true;
  
  private spreadsheetId: string | null = null;
  private readonly SPREADSHEET_NAME = 'Research Agent Swag';
  private readonly SHEETS_API_BASE = 'https://sheets.googleapis.com/v4';
  private readonly DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

  /**
   * Pull data from Google Sheets using direct API calls
   */
  async pull(): Promise<SyncData> {
    try {
      // Get local data first (always available)
      const localQuizzes = await quizDB.getQuizStatistics();
      const localFeedItems = await feedDB.getItems(1000);
      
      const { storage } = await import('../../utils/storage');
      const localSnippets = await storage.getItem<any[]>('swag-snippets') || [];

      // Try to get OAuth token (may fail if user not authenticated)
      let token: string;
      try {
        token = await requestGoogleAuth();
      } catch (authError) {
        // User not authenticated - this is normal on login page, no error needed
        // Just return local data silently
        return {
          quizzes: localQuizzes,
          feedItems: localFeedItems,
          snippets: localSnippets,
          config: null,
          embeddings: [],
          lastModified: Date.now()
        };
      }

      // Ensure spreadsheet exists
      await this.ensureSpreadsheetExists(token);

      if (!this.spreadsheetId) {
        console.warn('⚠️ Google Sheets sync: Failed to find or create spreadsheet, returning local data');
        return {
          quizzes: localQuizzes,
          feedItems: localFeedItems,
          snippets: localSnippets,
          config: null,
          embeddings: [],
          lastModified: Date.now()
        };
      }

      // Pull remote data from all sheets
      const [remoteSnippets, remoteFeedItems] = await Promise.all([
        this.pullSnippets(token),
        this.pullFeedItems(token),
        // TODO: Add quizzes, config, embeddings
      ]);

      // Merge local and remote data (client-side merge logic)
      const mergedSnippets = this.mergeSnippets(localSnippets, remoteSnippets);
      const mergedFeedItems = this.mergeFeedItems(localFeedItems, remoteFeedItems);

      // Push any local-only items to remote
      await this.pushNewItems(token, localSnippets, remoteSnippets, localFeedItems, remoteFeedItems);

      console.log('✅ Google Sheets sync complete:', {
        snippets: mergedSnippets.length,
        feedItems: mergedFeedItems.length
      });

      return {
        quizzes: localQuizzes, // TODO: Implement quiz sync
        feedItems: mergedFeedItems,
        snippets: mergedSnippets,
        config: null, // TODO: Implement config sync
        embeddings: [], // TODO: Implement embeddings sync
        lastModified: Date.now()
      };
    } catch (error) {
      console.error('❌ Google Sheets sync error:', error);
      // On any error, return local data so app still works
      const localQuizzes = await quizDB.getQuizStatistics();
      const localFeedItems = await feedDB.getItems(1000);
      const { storage } = await import('../../utils/storage');
      const localSnippets = await storage.getItem<any[]>('swag-snippets') || [];
      
      return {
        quizzes: localQuizzes,
        feedItems: localFeedItems,
        snippets: localSnippets,
        config: null,
        embeddings: [],
        lastModified: Date.now()
      };
    }
  }

  /**
   * Push local data to Google Sheets
   * Note: Push is handled during pull() to minimize API calls
   */
  async push(_data: SyncData): Promise<void> {
    // Push logic is integrated into pull() to avoid duplicate API calls
    console.log('GoogleSheetsAdapter: Push handled during bidirectional pull operation');
  }

  /**
   * Ensure the "Research Agent Swag" spreadsheet exists in user's Drive
   */
  private async ensureSpreadsheetExists(token: string): Promise<void> {
    if (this.spreadsheetId) return;

    // Check localStorage cache first
    const cached = localStorage.getItem('google_sheets_spreadsheet_id');
    if (cached) {
      this.spreadsheetId = cached;
      return;
    }

    // Search for existing spreadsheet
    const searchUrl = `${this.DRIVE_API_BASE}/files?q=name='${this.SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!searchResponse.ok) {
      throw new Error(`Failed to search for spreadsheet: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    
    if (searchData.files && searchData.files.length > 0) {
      this.spreadsheetId = searchData.files[0].id;
      if (this.spreadsheetId) {
        localStorage.setItem('google_sheets_spreadsheet_id', this.spreadsheetId);
      }
      console.log('✓ Found existing spreadsheet:', this.spreadsheetId);
      return;
    }

    // Create new spreadsheet if not found
    console.log('Creating new spreadsheet...');
    await this.createSpreadsheet(token);
  }

  /**
   * Create new "Research Agent Swag" spreadsheet with proper schema
   */
  private async createSpreadsheet(token: string): Promise<void> {
    const createUrl = `${this.SHEETS_API_BASE}/spreadsheets`;
    
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: { title: this.SPREADSHEET_NAME },
        sheets: [
          {
            properties: { title: 'Snippets' },
            data: [{
              startRow: 0,
              startColumn: 0,
              rowData: [{
                values: [
                  { userEnteredValue: { stringValue: 'id' } },
                  { userEnteredValue: { stringValue: 'user_email' } },
                  { userEnteredValue: { stringValue: 'project_id' } },
                  { userEnteredValue: { stringValue: 'created_at' } },
                  { userEnteredValue: { stringValue: 'updated_at' } },
                  { userEnteredValue: { stringValue: 'title' } },
                  { userEnteredValue: { stringValue: 'content' } },
                  { userEnteredValue: { stringValue: 'tags' } },
                  { userEnteredValue: { stringValue: 'source' } },
                  { userEnteredValue: { stringValue: 'url' } }
                ]
              }]
            }]
          },
          {
            properties: { title: 'Feed' },
            data: [{
              startRow: 0,
              startColumn: 0,
              rowData: [{
                values: [
                  { userEnteredValue: { stringValue: 'id' } },
                  { userEnteredValue: { stringValue: 'user_email' } },
                  { userEnteredValue: { stringValue: 'project_id' } },
                  { userEnteredValue: { stringValue: 'created_at' } },
                  { userEnteredValue: { stringValue: 'updated_at' } },
                  { userEnteredValue: { stringValue: 'title' } },
                  { userEnteredValue: { stringValue: 'content' } },
                  { userEnteredValue: { stringValue: 'url' } },
                  { userEnteredValue: { stringValue: 'source' } },
                  { userEnteredValue: { stringValue: 'topics' } },
                  { userEnteredValue: { stringValue: 'upvote_count' } },
                  { userEnteredValue: { stringValue: 'downvote_count' } },
                  { userEnteredValue: { stringValue: 'user_vote' } },
                  { userEnteredValue: { stringValue: 'is_blocked' } },
                  { userEnteredValue: { stringValue: 'imageBase64' } }
                ]
              }]
            }]
          }
        ]
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create spreadsheet: ${createResponse.statusText}`);
    }

    const createData = await createResponse.json();
    this.spreadsheetId = createData.spreadsheetId;
    if (this.spreadsheetId) {
      localStorage.setItem('google_sheets_spreadsheet_id', this.spreadsheetId);
    }
    console.log('✓ Created new spreadsheet:', this.spreadsheetId);
  }

  /**
   * Pull snippets from Google Sheets
   */
  private async pullSnippets(token: string): Promise<any[]> {
    const range = 'Snippets!A2:J'; // Skip header row
    const url = `${this.SHEETS_API_BASE}/spreadsheets/${this.spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      if (response.status === 404) return []; // Sheet doesn't exist yet
      throw new Error(`Failed to pull snippets: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.values || data.values.length === 0) return [];

    // Convert rows to objects
    return data.values.map((row: any[]) => ({
      id: row[0] || '',
      user_email: row[1] || '',
      project_id: row[2] || '',
      created_at: row[3] || new Date().toISOString(),
      updated_at: row[4] || new Date().toISOString(),
      title: row[5] || '',
      content: row[6] || '',
      tags: row[7] || '',
      source: row[8] || 'manual',
      url: row[9] || ''
    }));
  }

  /**
   * Pull feed items from Google Sheets
   */
  private async pullFeedItems(token: string): Promise<any[]> {
    const range = 'Feed!A2:O'; // Skip header row
    const url = `${this.SHEETS_API_BASE}/spreadsheets/${this.spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      if (response.status === 404) return []; // Sheet doesn't exist yet
      throw new Error(`Failed to pull feed items: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.values || data.values.length === 0) return [];

    // Convert rows to objects
    return data.values.map((row: any[]) => ({
      id: row[0] || '',
      user_email: row[1] || '',
      project_id: row[2] || '',
      created_at: row[3] || new Date().toISOString(),
      updated_at: row[4] || new Date().toISOString(),
      title: row[5] || '',
      content: row[6] || '',
      url: row[7] || '',
      source: row[8] || 'ai_generated',
      topics: row[9] ? row[9].split(',').map((t: string) => t.trim()) : [],
      upvote_count: parseInt(row[10]) || 0,
      downvote_count: parseInt(row[11]) || 0,
      user_vote: row[12] || '',
      is_blocked: row[13] === 'true',
      imageBase64: row[14] || ''
    }));
  }

  /**
   * Merge local and remote snippets (local-first strategy)
   */
  private mergeSnippets(local: any[], remote: any[]): any[] {
    const remoteMap = new Map(remote.map(item => [item.id, item]));
    const merged = [...remote];

    // Add local-only items or update if local is newer
    for (const localItem of local) {
      const remoteItem = remoteMap.get(localItem.id);
      
      if (!remoteItem) {
        // Local-only item, will be pushed
        merged.push(localItem);
      } else if (new Date(localItem.updated_at) > new Date(remoteItem.updated_at)) {
        // Local is newer - replace remote version
        const idx = merged.findIndex(item => item.id === localItem.id);
        if (idx !== -1) merged[idx] = localItem;
      }
    }

    return merged;
  }

  /**
   * Merge local and remote feed items (local-first strategy)
   */
  private mergeFeedItems(local: any[], remote: any[]): any[] {
    const remoteMap = new Map(remote.map(item => [item.id, item]));
    const merged = [...remote];

    // Add local-only items or update if local is newer
    for (const localItem of local) {
      const remoteItem = remoteMap.get(localItem.id);
      
      if (!remoteItem) {
        // Local-only item, will be pushed
        merged.push(localItem);
      } else if (new Date(localItem.updated_at) > new Date(remoteItem.updated_at)) {
        // Local is newer - replace remote version
        const idx = merged.findIndex(item => item.id === localItem.id);
        if (idx !== -1) merged[idx] = localItem;
      }
    }

    return merged;
  }

  /**
   * Push local-only items to Google Sheets
   */
  private async pushNewItems(
    token: string,
    localSnippets: any[],
    remoteSnippets: any[],
    localFeedItems: any[],
    remoteFeedItems: any[]
  ): Promise<void> {
    const remoteSnippetIds = new Set(remoteSnippets.map(s => s.id));
    const remoteFeedIds = new Set(remoteFeedItems.map(f => f.id));

    // Find local-only snippets
    const newSnippets = localSnippets.filter(s => !remoteSnippetIds.has(s.id));
    
    // Find local-only feed items
    const newFeedItems = localFeedItems.filter(f => !remoteFeedIds.has(f.id));

    const promises: Promise<any>[] = [];

    // Batch append snippets
    if (newSnippets.length > 0) {
      promises.push(this.appendSnippets(token, newSnippets));
    }

    // Batch append feed items
    if (newFeedItems.length > 0) {
      promises.push(this.appendFeedItems(token, newFeedItems));
    }

    await Promise.all(promises);
  }

  /**
   * Append snippets to Google Sheets
   */
  private async appendSnippets(token: string, snippets: any[]): Promise<void> {
    const range = 'Snippets!A:J';
    // eslint-disable-next-line no-secrets/no-secrets
    const url = `${this.SHEETS_API_BASE}/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    
    const rows = snippets.map(s => [
      s.id,
      s.user_email || '',
      s.project_id || '',
      s.created_at || new Date().toISOString(),
      s.updated_at || new Date().toISOString(),
      s.title || '',
      s.content || '',
      s.tags || '',
      s.source || 'manual',
      s.url || ''
    ]);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: rows })
    });

    if (!response.ok) {
      throw new Error(`Failed to append snippets: ${response.statusText}`);
    }

    console.log(`✓ Pushed ${snippets.length} new snippets to Google Sheets`);
  }

  /**
   * Append feed items to Google Sheets
   */
  private async appendFeedItems(token: string, items: any[]): Promise<void> {
    const range = 'Feed!A:O';
    const encodedRange = encodeURIComponent(range);
    const url = `${this.SHEETS_API_BASE}/spreadsheets/${this.spreadsheetId}/values/${encodedRange}:append?valueInputOption=RAW`;
    
    const rows = items.map(f => [
      f.id,
      f.user_email || '',
      f.project_id || '',
      f.created_at || new Date().toISOString(),
      f.updated_at || new Date().toISOString(),
      f.title || '',
      f.content || '',
      f.url || '',
      f.source || 'ai_generated',
      Array.isArray(f.topics) ? f.topics.join(',') : (f.topics || ''),
      f.upvote_count || 0,
      f.downvote_count || 0,
      f.user_vote || '',
      f.is_blocked ? 'true' : 'false',
      f.imageBase64 || ''
    ]);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: rows })
    });

    if (!response.ok) {
      throw new Error(`Failed to append feed items: ${response.statusText}`);
    }

    console.log(`✓ Pushed ${items.length} new feed items to Google Sheets`);
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
