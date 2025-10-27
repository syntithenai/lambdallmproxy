/**
 * Quiz Statistics Sync Utility
 * Syncs quiz statistics from IndexedDB to Google Sheets via Lambda backend
 */

import { quizDB } from '../db/quizDb';
import { getCachedApiBase } from './api';

/**
 * Sync quiz statistics to Google Sheets
 * This is called after quiz completion or periodically for unsynced statistics
 */
export async function syncQuizStatistics(token: string): Promise<{
  synced: number;
  failed: number;
}> {
  try {
    // Get unsynced statistics from IndexedDB
    const unsyncedStats = await quizDB.getUnsyncedStatistics();
    
    if (unsyncedStats.length === 0) {
      console.log('✅ No quiz statistics to sync');
      return { synced: 0, failed: 0 };
    }

    console.log(`📤 Syncing ${unsyncedStats.length} quiz statistics to Google Sheets...`);

    const apiBase = await getCachedApiBase();
    let synced = 0;
    let failed = 0;
    const syncedIds: string[] = [];

    // Sync each statistic individually (could be batched in future)
    for (const stat of unsyncedStats) {
      try {
        const response = await fetch(`${apiBase}/quiz/sync-statistics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            statistics: [stat] // Send as array for future batch support
          }),
          credentials: 'include'
        });

        if (response.ok) {
          syncedIds.push(stat.id);
          synced++;
        } else {
          console.error(`Failed to sync quiz ${stat.id}:`, await response.text());
          failed++;
        }
      } catch (error) {
        console.error(`Error syncing quiz ${stat.id}:`, error);
        failed++;
      }
    }

    // Mark successfully synced statistics
    if (syncedIds.length > 0) {
      await quizDB.markAsSynced(syncedIds);
      console.log(`✅ Marked ${syncedIds.length} quiz statistics as synced`);
    }

    return { synced, failed };
  } catch (error) {
    console.error('Error syncing quiz statistics:', error);
    throw error;
  }
}

/**
 * Sync a single quiz statistic immediately after completion
 */
export async function syncSingleQuizStatistic(
  statisticId: string,
  token: string
): Promise<boolean> {
  try {
    const statistic = await quizDB.getQuizStatistic(statisticId);
    
    if (!statistic) {
      console.error('Quiz statistic not found:', statisticId);
      return false;
    }

    if (statistic.synced) {
      console.log('Quiz statistic already synced:', statisticId);
      return true;
    }

    const apiBase = await getCachedApiBase();
    
    const response = await fetch(`${apiBase}/quiz/sync-statistics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        statistics: [statistic]
      }),
      credentials: 'include'
    });

    if (response.ok) {
      await quizDB.markAsSynced([statisticId]);
      console.log('✅ Quiz statistic synced:', statisticId);
      return true;
    } else {
      console.error('Failed to sync quiz statistic:', await response.text());
      return false;
    }
  } catch (error) {
    console.error('Error syncing quiz statistic:', error);
    return false;
  }
}

/**
 * Background sync function - call periodically or on app load
 */
export async function backgroundSyncQuizStatistics(token: string): Promise<void> {
  try {
    const result = await syncQuizStatistics(token);
    if (result.synced > 0) {
      console.log(`🔄 Background sync: ${result.synced} synced, ${result.failed} failed`);
    }
  } catch (error) {
    // Silently fail background sync - will retry later
    console.debug('Background quiz sync failed:', error);
  }
}
