/**
 * Unified Sync Service
 * Consolidates all cloud synchronization mechanisms into one coordinated system
 * 
 * Features:
 * - Modular adapter pattern for different data types
 * - Centralized scheduling and batching
 * - Consistent conflict resolution
 * - Global sync status tracking
 * - Debouncing and rate limiting
 */

export type SyncAction = 'uploaded' | 'downloaded' | 'no-change' | 'merged';
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';
export type SyncPriority = 'high' | 'normal';

export interface SyncResult {
  success: boolean;
  action: SyncAction;
  timestamp: number;
  itemCount: number;
  error?: string;
}

export interface SyncAdapter {
  name: string;
  enabled: boolean;
  
  // Core operations
  pull(): Promise<any>;  // Download from cloud
  push(data: any): Promise<void>;  // Upload to cloud
  getLocalData(): Promise<any>;  // Read from local storage
  setLocalData(data: any): Promise<void>;  // Write to local storage
  getLastModified(): Promise<number>;  // Get local timestamp
  shouldSync(): Promise<boolean>;  // Check if sync needed
  
  // Optional: Custom merge logic
  mergeData?(local: any, remote: any): any;
}

export interface AdapterStatus {
  name: string;
  enabled: boolean;
  status: SyncStatus;
  lastSync: number | null;
  nextSync: number | null;
  itemCount: number;
  error: string | null;
}

export interface GlobalSyncStatus {
  syncing: boolean;
  lastSyncTime: number | null;
  nextSyncTime: number | null;
  adapterStatuses: Record<string, AdapterStatus>;
}

interface SyncOperation {
  adapterName: string;
  priority: SyncPriority;
  timestamp: number;
}

/**
 * Sync Scheduler
 * Manages debouncing and batching of sync operations
 */
class SyncScheduler {
  private queue: SyncOperation[] = [];
  private batchInterval: number = 30000; // 30 seconds default debounce
  private batchTimer: NodeJS.Timeout | null = null;
  private onExecute: (adapters: string[]) => Promise<void>;

  constructor(onExecute: (adapters: string[]) => Promise<void>) {
    this.onExecute = onExecute;
  }

  /**
   * Queue a sync operation (debounced)
   */
  queueSync(adapterName: string, priority: SyncPriority = 'normal'): void {
    this.queue.push({ adapterName, priority, timestamp: Date.now() });
    
    if (priority === 'high') {
      // Execute immediately for high priority
      this.executeBatch();
    } else {
      // Debounce for normal priority
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }
      this.batchTimer = setTimeout(() => {
        this.executeBatch();
      }, this.batchInterval);
    }
  }

  /**
   * Execute all queued syncs in a single batch
   */
  private async executeBatch(): Promise<void> {
    if (this.queue.length === 0) return;
    
    // Deduplicate queue (keep most recent entry per adapter)
    const uniqueAdapters = [...new Set(this.queue.map(op => op.adapterName))];
    this.queue = [];
    
    console.log(`🔄 Executing batch sync for: ${uniqueAdapters.join(', ')}`);
    
    try {
      await this.onExecute(uniqueAdapters);
    } catch (error) {
      console.error('❌ Batch sync failed:', error);
    }
  }

  /**
   * Clear all queued operations
   */
  clear(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.queue = [];
  }

  /**
   * Set debounce interval
   */
  setBatchInterval(ms: number): void {
    this.batchInterval = ms;
  }
}

/**
 * Unified Sync Service
 * Central coordinator for all sync operations
 */
class UnifiedSyncService {
  private adapters: Map<string, SyncAdapter> = new Map();
  private scheduler: SyncScheduler;
  private syncStatus: GlobalSyncStatus = {
    syncing: false,
    lastSyncTime: null,
    nextSyncTime: null,
    adapterStatuses: {}
  };
  private syncInterval: number = 5 * 60 * 1000; // 5 minutes default
  private syncTimer: NodeJS.Timeout | null = null;
  private enabled: boolean = false;
  private statusListeners: Array<(status: GlobalSyncStatus) => void> = [];

  constructor() {
    this.scheduler = new SyncScheduler((adapters) => this.executeBatchSync(adapters));
  }

  /**
   * Register a sync adapter
   */
  registerAdapter(adapter: SyncAdapter): void {
    this.adapters.set(adapter.name, adapter);
    this.syncStatus.adapterStatuses[adapter.name] = {
      name: adapter.name,
      enabled: adapter.enabled,
      status: 'idle',
      lastSync: null,
      nextSync: null,
      itemCount: 0,
      error: null
    };
    console.log(`✓ Registered sync adapter: ${adapter.name}`);
  }

  /**
   * Unregister a sync adapter
   */
  unregisterAdapter(name: string): void {
    this.adapters.delete(name);
    delete this.syncStatus.adapterStatuses[name];
    console.log(`✓ Unregistered sync adapter: ${name}`);
  }

  /**
   * Enable/disable a specific adapter
   */
  setAdapterEnabled(name: string, enabled: boolean): void {
    const adapter = this.adapters.get(name);
    if (adapter) {
      adapter.enabled = enabled;
      if (this.syncStatus.adapterStatuses[name]) {
        this.syncStatus.adapterStatuses[name].enabled = enabled;
      }
      console.log(`${enabled ? '✓' : '✗'} Adapter ${name} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Queue a sync operation for a specific adapter
   */
  queueSync(adapterName: string, priority: SyncPriority = 'normal'): void {
    if (!this.enabled) {
      console.log(`⚠️ Unified sync is disabled, skipping: ${adapterName}`);
      return;
    }

    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      console.warn(`⚠️ Adapter not found: ${adapterName}`);
      return;
    }

    if (!adapter.enabled) {
      console.log(`⚠️ Adapter ${adapterName} is disabled, skipping sync`);
      return;
    }

    this.scheduler.queueSync(adapterName, priority);
  }

  /**
   * Sync a specific adapter immediately
   */
  async syncAdapter(adapterName: string): Promise<SyncResult> {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterName}`);
    }

    if (!adapter.enabled) {
      return {
        success: false,
        action: 'no-change',
        timestamp: Date.now(),
        itemCount: 0,
        error: `Adapter ${adapterName} is disabled`
      };
    }

    return await this._syncAdapter(adapter);
  }

  /**
   * Internal sync adapter logic
   */
  private async _syncAdapter(adapter: SyncAdapter): Promise<SyncResult> {
    const adapterStatus = this.syncStatus.adapterStatuses[adapter.name];
    
    try {
      // Update status to syncing
      adapterStatus.status = 'syncing';
      this.notifyStatusChange();

      // Check if sync is needed
      const shouldSync = await adapter.shouldSync();
      if (!shouldSync) {
        adapterStatus.status = 'idle';
        this.notifyStatusChange();
        return {
          success: true,
          action: 'no-change',
          timestamp: Date.now(),
          itemCount: 0
        };
      }

      // Get local data and timestamp
      const localData = await adapter.getLocalData();
      const localTimestamp = await adapter.getLastModified();

      // Pull remote data
      const remoteData = await adapter.pull();
      
      if (!remoteData || remoteData.length === 0) {
        // No remote data - upload local
        if (localData && (Array.isArray(localData) ? localData.length > 0 : Object.keys(localData).length > 0)) {
          await adapter.push(localData);
          adapterStatus.status = 'success';
          adapterStatus.lastSync = Date.now();
          adapterStatus.itemCount = Array.isArray(localData) ? localData.length : 1;
          adapterStatus.error = null;
          this.notifyStatusChange();
          
          return {
            success: true,
            action: 'uploaded',
            timestamp: Date.now(),
            itemCount: adapterStatus.itemCount
          };
        } else {
          adapterStatus.status = 'idle';
          this.notifyStatusChange();
          return {
            success: true,
            action: 'no-change',
            timestamp: Date.now(),
            itemCount: 0
          };
        }
      }

      // Determine remote timestamp
      const remoteTimestamp = Array.isArray(remoteData) && remoteData.length > 0
        ? Math.max(...remoteData.map((item: any) => item.timestamp || 0))
        : (remoteData.timestamp || 0);

      // Decide sync action
      if (remoteTimestamp > localTimestamp) {
        // Remote is newer - download
        if (adapter.mergeData) {
          const merged = adapter.mergeData(localData, remoteData);
          await adapter.setLocalData(merged);
        } else {
          await adapter.setLocalData(remoteData);
        }
        
        adapterStatus.status = 'success';
        adapterStatus.lastSync = Date.now();
        adapterStatus.itemCount = Array.isArray(remoteData) ? remoteData.length : 1;
        adapterStatus.error = null;
        this.notifyStatusChange();
        
        return {
          success: true,
          action: 'downloaded',
          timestamp: Date.now(),
          itemCount: adapterStatus.itemCount
        };
        
      } else if (localTimestamp > remoteTimestamp) {
        // Local is newer - upload
        await adapter.push(localData);
        
        adapterStatus.status = 'success';
        adapterStatus.lastSync = Date.now();
        adapterStatus.itemCount = Array.isArray(localData) ? localData.length : 1;
        adapterStatus.error = null;
        this.notifyStatusChange();
        
        return {
          success: true,
          action: 'uploaded',
          timestamp: Date.now(),
          itemCount: adapterStatus.itemCount
        };
        
      } else {
        // Same timestamp - no change needed
        adapterStatus.status = 'success';
        adapterStatus.lastSync = Date.now();
        adapterStatus.error = null;
        this.notifyStatusChange();
        
        return {
          success: true,
          action: 'no-change',
          timestamp: Date.now(),
          itemCount: 0
        };
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error syncing ${adapter.name}:`, errorMsg);
      
      adapterStatus.status = 'error';
      adapterStatus.error = errorMsg;
      this.notifyStatusChange();
      
      return {
        success: false,
        action: 'no-change',
        timestamp: Date.now(),
        itemCount: 0,
        error: errorMsg
      };
    }
  }

  /**
   * Execute batch sync for multiple adapters
   */
  private async executeBatchSync(adapterNames: string[]): Promise<void> {
    this.syncStatus.syncing = true;
    this.notifyStatusChange();

    const results = await Promise.allSettled(
      adapterNames.map(name => {
        const adapter = this.adapters.get(name);
        return adapter ? this._syncAdapter(adapter) : Promise.reject(`Adapter not found: ${name}`);
      })
    );

    // Log results
    results.forEach((result, i) => {
      const name = adapterNames[i];
      if (result.status === 'fulfilled') {
        const syncResult = result.value;
        if (syncResult.success && syncResult.action !== 'no-change') {
          console.log(`✅ ${name}: ${syncResult.action} (${syncResult.itemCount} items)`);
        }
      } else {
        console.error(`❌ ${name}: ${result.reason}`);
      }
    });

    this.syncStatus.syncing = false;
    this.syncStatus.lastSyncTime = Date.now();
    this.notifyStatusChange();
  }

  /**
   * Sync all registered and enabled adapters
   */
  async syncAll(): Promise<Record<string, SyncResult>> {
    const results: Record<string, SyncResult> = {};
    
    this.syncStatus.syncing = true;
    this.notifyStatusChange();

    for (const [name, adapter] of this.adapters) {
      if (adapter.enabled) {
        results[name] = await this._syncAdapter(adapter);
      }
    }

    this.syncStatus.syncing = false;
    this.syncStatus.lastSyncTime = Date.now();
    this.notifyStatusChange();

    return results;
  }

  /**
   * Start automatic periodic sync
   */
  start(intervalMs?: number): void {
    if (intervalMs) {
      this.syncInterval = intervalMs;
    }

    this.enabled = true;
    
    // Initial sync
    this.syncAll().then(() => {
      console.log('✅ Initial unified sync complete');
    });

    // Periodic sync
    this.syncTimer = setInterval(() => {
      this.syncAll();
    }, this.syncInterval);

    console.log(`✅ Unified sync started (interval: ${this.syncInterval / 1000 / 60} minutes)`);
  }

  /**
   * Stop automatic periodic sync
   */
  stop(): void {
    this.enabled = false;
    
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    this.scheduler.clear();
    console.log('✓ Unified sync stopped');
  }

  /**
   * Check if unified sync is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current sync status
   */
  getStatus(): GlobalSyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(listener: (status: GlobalSyncStatus) => void): () => void {
    this.statusListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.statusListeners.indexOf(listener);
      if (index > -1) {
        this.statusListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of status change
   */
  private notifyStatusChange(): void {
    const status = this.getStatus();
    this.statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in status listener:', error);
      }
    });
  }

  /**
   * Set debounce interval for batch operations
   */
  setDebounceInterval(ms: number): void {
    this.scheduler.setBatchInterval(ms);
  }

  /**
   * Set global sync interval
   */
  setSyncInterval(ms: number): void {
    this.syncInterval = ms;
    
    // Restart timer if already running
    if (this.syncTimer) {
      this.stop();
      this.start();
    }
  }
}

// Export singleton instance
export const unifiedSync = new UnifiedSyncService();
