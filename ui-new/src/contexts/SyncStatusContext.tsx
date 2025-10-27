/**
 * Global Sync Status Context
 * Provides unified sync status to all components
 */

import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { unifiedSync } from '../services/unifiedSync';
import type { GlobalSyncStatus } from '../services/unifiedSync';

interface SyncStatusContextValue {
  syncStatus: GlobalSyncStatus;
  manualSync: () => Promise<void>;
  enableAdapter: (name: string) => void;
  disableAdapter: (name: string) => void;
}

const SyncStatusContext = createContext<SyncStatusContextValue | undefined>(undefined);

export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const [syncStatus, setSyncStatus] = useState<GlobalSyncStatus>(unifiedSync.getStatus());

  useEffect(() => {
    // Subscribe to sync status changes
    const unsubscribe = unifiedSync.onStatusChange((status) => {
      setSyncStatus(status);
    });

    // Cleanup
    return () => {
      unsubscribe();
    };
  }, []);

  const manualSync = async () => {
    await unifiedSync.syncAll();
  };

  const enableAdapter = (name: string) => {
    unifiedSync.setAdapterEnabled(name, true);
  };

  const disableAdapter = (name: string) => {
    unifiedSync.setAdapterEnabled(name, false);
  };

  return (
    <SyncStatusContext.Provider value={{ syncStatus, manualSync, enableAdapter, disableAdapter }}>
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus() {
  const context = useContext(SyncStatusContext);
  if (!context) {
    throw new Error('useSyncStatus must be used within SyncStatusProvider');
  }
  return context;
}
