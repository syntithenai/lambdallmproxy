/**
 * Global Sync Indicator
 * Shows sync status in the app header
 */

import { useState } from 'react';
import { useSyncStatus } from '../contexts/SyncStatusContext';

export function GlobalSyncIndicator() {
  const { syncStatus, manualSync } = useSyncStatus();
  const [showDetails, setShowDetails] = useState(false);

  // Don't show if no adapters registered
  if (Object.keys(syncStatus.adapterStatuses).length === 0) {
    return null;
  }

  // Format timestamp as relative time
  const formatTimeAgo = (timestamp: number | null): string => {
    if (!timestamp) return 'Never';
    
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // Determine overall status
  const hasError = Object.values(syncStatus.adapterStatuses).some(a => a.status === 'error');
  const isSyncing = syncStatus.syncing || Object.values(syncStatus.adapterStatuses).some(a => a.status === 'syncing');
  const allIdle = Object.values(syncStatus.adapterStatuses).every(a => a.status === 'idle' || a.status === 'success');

  return (
    <div className="relative">
      {/* Main indicator */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
          hasError
            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
            : isSyncing
            ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
            : allIdle
            ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
            : 'bg-gray-500/10 text-gray-400 hover:bg-gray-500/20'
        }`}
        title="Click for sync details"
      >
        {/* Status icon */}
        {isSyncing ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : hasError ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        
        {/* Status text */}
        <span className="hidden sm:inline">
          {isSyncing ? 'Syncing...' : hasError ? 'Sync Error' : 'Synced'}
        </span>
        
        {/* Last sync time */}
        {syncStatus.lastSyncTime && !isSyncing && (
          <span className="text-xs opacity-75 hidden md:inline">
            {formatTimeAgo(syncStatus.lastSyncTime)}
          </span>
        )}
      </button>

      {/* Details dropdown */}
      {showDetails && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDetails(false)}
          />
          
          {/* Details panel */}
          <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-white">Sync Status</h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  manualSync();
                }}
                className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                disabled={isSyncing}
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>

            {/* Adapters list */}
            <div className="max-h-96 overflow-y-auto">
              {Object.values(syncStatus.adapterStatuses).map((adapter) => (
                <div key={adapter.name} className="px-4 py-3 border-b border-gray-700/50 hover:bg-gray-700/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white capitalize">{adapter.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      adapter.status === 'error' ? 'bg-red-500/20 text-red-400' :
                      adapter.status === 'syncing' ? 'bg-blue-500/20 text-blue-400' :
                      adapter.status === 'success' ? 'bg-green-500/20 text-green-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {adapter.status}
                    </span>
                  </div>
                  
                  <div className="text-xs text-gray-400 space-y-1">
                    {adapter.lastSync && (
                      <div>Last sync: {formatTimeAgo(adapter.lastSync)}</div>
                    )}
                    {adapter.itemCount > 0 && (
                      <div>{adapter.itemCount} items</div>
                    )}
                    {adapter.error && (
                      <div className="text-red-400 mt-1">{adapter.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-gray-900/50 text-xs text-gray-400">
              Auto-sync every 5 minutes
            </div>
          </div>
        </>
      )}
    </div>
  );
}
