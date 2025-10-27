/**
 * Background Sync Hook
 * 
 * Provides automatic background synchronization of plans and playlists to Google Drive
 * Features:
 * - Interval-based sync (every 5 minutes)
 * - Debounced sync on changes (30 seconds)
 * - Pauses when tab is hidden
 * - Shows notifications on sync events
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { googleDriveSync } from '../services/googleDriveSync';
import type { SyncResult } from '../services/googleDriveSync';

export interface BackgroundSyncOptions {
  enabled?: boolean;
  intervalMs?: number;  // Default: 5 minutes
  debounceMs?: number;  // Default: 30 seconds
  onSyncComplete?: (result: { plans: SyncResult; playlists: SyncResult }) => void;
  onSyncError?: (error: Error) => void;
}

export interface BackgroundSyncState {
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncTime: number;
  error: string | null;
  triggerSync: () => void;
}

/**
 * Hook for automatic background sync
 */
export function useBackgroundSync(options: BackgroundSyncOptions = {}): BackgroundSyncState {
  const {
    enabled = true,
    intervalMs = 5 * 60 * 1000,  // 5 minutes
    debounceMs = 30 * 1000,       // 30 seconds
    onSyncComplete,
    onSyncError
  } = options;

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);

  /**
   * Perform sync operation
   */
  const performSync = useCallback(async () => {
    // Prevent concurrent syncs
    if (isSyncingRef.current) {
      console.log('⏩ Sync already in progress, skipping');
      return;
    }

    // Check if authenticated
    const isAuth = await googleDriveSync.isAuthenticated();
    if (!isAuth) {
      console.log('⏩ Not authenticated, skipping background sync');
      return;
    }

    try {
      isSyncingRef.current = true;
      setSyncStatus('syncing');
      setError(null);

      console.log('🔄 Background sync started...');
      const result = await googleDriveSync.syncAll();

      setLastSyncTime(Date.now());
      setSyncStatus('success');

      // Log sync results
      if (result.plans.action !== 'no-change') {
        console.log(`✅ Plans: ${result.plans.action} (${result.plans.itemCount} items)`);
      }
      if (result.playlists.action !== 'no-change') {
        console.log(`✅ Playlists: ${result.playlists.action} (${result.playlists.itemCount} items)`);
      }

      // Call success callback
      if (onSyncComplete) {
        onSyncComplete(result);
      }

      // Reset to idle after 3 seconds
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err: any) {
      console.error('❌ Background sync failed:', err);
      setError(err.message || 'Sync failed');
      setSyncStatus('error');

      if (onSyncError) {
        onSyncError(err);
      }

      // Reset to idle after 5 seconds
      setTimeout(() => setSyncStatus('idle'), 5000);
    } finally {
      isSyncingRef.current = false;
    }
  }, [onSyncComplete, onSyncError]);

  /**
   * Manual sync trigger
   */
  const triggerSync = useCallback(() => {
    console.log('🔄 Manual sync triggered');
    performSync();
  }, [performSync]);

  /**
   * Debounced sync (triggered by local changes)
   */
  const debouncedSync = useCallback(() => {
    if (!enabled) return;

    // Clear existing debounce timer
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    // Set new debounce timer
    debounceRef.current = window.setTimeout(() => {
      console.log('🔄 Debounced sync triggered (30s after change)');
      performSync();
    }, debounceMs);
  }, [enabled, debounceMs, performSync]);

  /**
   * Setup interval-based sync
   */
  useEffect(() => {
    if (!enabled) {
      console.log('⏸️ Background sync disabled');
      return;
    }

    console.log(`🔄 Background sync enabled (interval: ${intervalMs / 60000} minutes)`);

    // Perform initial sync after 10 seconds
    const initialSyncTimeout = setTimeout(() => {
      performSync();
    }, 10000);

    // Setup interval for periodic sync
    intervalRef.current = window.setInterval(() => {
      // Only sync if tab is visible
      if (document.hidden) {
        console.log('⏩ Tab hidden, skipping interval sync');
        return;
      }

      console.log('🔄 Interval sync triggered');
      performSync();
    }, intervalMs);

    // Cleanup
    return () => {
      clearTimeout(initialSyncTimeout);
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [enabled, intervalMs, performSync]);

  /**
   * Pause sync when tab is hidden
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('👋 Tab hidden, pausing background sync');
      } else {
        console.log('👁️ Tab visible, resuming background sync');
        // Trigger sync when tab becomes visible again
        if (enabled) {
          debouncedSync();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, debouncedSync]);

  /**
   * Listen for local storage changes (plans saved)
   */
  useEffect(() => {
    if (!enabled) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'llm_proxy_planning_cache') {
        console.log('📝 Plans changed, scheduling debounced sync');
        debouncedSync();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [enabled, debouncedSync]);

  return {
    syncStatus,
    lastSyncTime,
    error,
    triggerSync
  };
}
