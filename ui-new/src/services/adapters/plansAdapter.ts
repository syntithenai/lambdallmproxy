/**
 * Plans Sync Adapter
 * Integrates research plans with unified sync system
 * Syncs between IndexedDB (local) and Google Drive (remote)
 */

import type { SyncAdapter } from '../unifiedSync';
import type { CachedPlan } from '../../utils/planningCache';
import { planningDB } from '../../utils/planningDB';
import { requestGoogleAuth } from '../../utils/googleDocs';

// UPDATED: Use same folder as Google Sheets sync for consistency
const APP_FOLDER_NAME = 'Research Agent';
const PLANS_FILENAME = 'saved_plans.json';

// Cache folder ID to avoid repeated lookups
let appFolderIdCache: string | null = null;

/**
 * Plans Sync Adapter for Unified Sync
 */
export class PlansAdapter implements SyncAdapter {
  name = 'plans';
  enabled = true;

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
   * Get file ID for plans file in Google Drive
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
   * Pull plans from Google Drive
   */
  async pull(): Promise<CachedPlan[] | null> {
    try {
      const fileId = await this.getFileId(PLANS_FILENAME);
      
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
        throw new Error(`Failed to download plans: ${response.statusText}`);
      }

      const content = await response.text();
      const plans: CachedPlan[] = JSON.parse(content);
      
      return plans;
      
    } catch (error) {
      console.error('Error pulling plans from Google Drive:', error);
      throw error;
    }
  }

  /**
   * Push plans to Google Drive
   */
  async push(data: CachedPlan[]): Promise<void> {
    try {
      const token = await requestGoogleAuth();
      const folderId = await this.getAppFolder();
      const fileId = await this.getFileId(PLANS_FILENAME);

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
          throw new Error(`Failed to update plans file: ${response.statusText}`);
        }
        
      } else {
        // Create new file
        const metadata = {
          name: PLANS_FILENAME,
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
          throw new Error(`Failed to create plans file: ${response.statusText}`);
        }
      }
      
      console.log(`✓ Pushed ${data.length} plans to Google Drive`);
      
    } catch (error) {
      console.error('Error pushing plans to Google Drive:', error);
      throw error;
    }
  }

  /**
   * Get local plans from IndexedDB
   */
  async getLocalData(): Promise<CachedPlan[]> {
    return await planningDB.getAllPlans();
  }

  /**
   * Set local plans in IndexedDB
   */
  async setLocalData(data: CachedPlan[]): Promise<void> {
    await planningDB.replacePlans(data);
  }

  /**
   * Get timestamp of most recently modified plan
   */
  async getLastModified(): Promise<number> {
    const plans = await this.getLocalData();
    if (plans.length === 0) return 0;
    return Math.max(...plans.map(p => p.timestamp));
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
      console.error('Error checking if plans should sync:', error);
      return false;
    }
  }

  /**
   * Merge local and remote plans
   * Deduplicates by query (case-insensitive), keeps newer timestamp
   */
  mergeData(local: CachedPlan[], remote: CachedPlan[]): CachedPlan[] {
    return planningDB.mergePlans(local, remote);
  }
}

// Export singleton instance
export const plansAdapter = new PlansAdapter();
