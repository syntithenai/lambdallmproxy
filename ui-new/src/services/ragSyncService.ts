/**
 * RAG Sync Service
 * 
 * Handles bidirectional synchronization between local IndexedDB/localStorage
 * and Google Sheets for RAG snippets and embeddings.
 */

import type { ContentSnippet } from '../contexts/SwagContext';

export interface SyncConfig {
  enabled: boolean;
  autoSync: boolean; // Sync on every change
  syncInterval: number; // Background sync interval (ms)
  batchSize: number; // Number of items to sync at once
  retryAttempts: number;
  deviceId: string; // Unique device identifier
}

export interface SyncStatus {
  inProgress: boolean;
  lastSync: number | null;
  lastError: string | null;
  pendingChanges: number;
  conflictsResolved: number;
}

export interface SyncResult {
  snippetsPushed: number;
  snippetsPulled: number;
  embeddingsPushed: number;
  embeddingsPulled: number;
  conflicts: number;
  errors: string[];
}

interface SyncOperation {
  type: 'push-snippet' | 'push-embedding' | 'delete-snippet';
  data: any;
  userEmail: string;
  timestamp: number;
}

type SyncEventCallback = (result?: SyncResult, error?: Error) => void;

class RAGSyncService {
  private config: SyncConfig | null = null;
  private status: SyncStatus = {
    inProgress: false,
    lastSync: null,
    lastError: null,
    pendingChanges: 0,
    conflictsResolved: 0,
  };
  private syncQueue: SyncOperation[] = [];
  private syncInterval: NodeJS.Timeout | null = null;
  private apiUrl: string;
  private eventCallbacks: {
    onStart: SyncEventCallback[];
    onComplete: SyncEventCallback[];
    onError: SyncEventCallback[];
  } = {
    onStart: [],
    onComplete: [],
    onError: [],
  };

  constructor() {
    // Get API URL from environment or default to localhost
    this.apiUrl = typeof process !== 'undefined' && process.env?.REACT_APP_LAMBDA_URL
      ? process.env.REACT_APP_LAMBDA_URL
      : 'http://localhost:3000';
    
    // Load device ID or create new one
    this.initializeDeviceId();
    
    // Load queued operations from localStorage
    this.loadQueueFromStorage();
  }

  /**
   * Initialize or get device ID
   */
  private initializeDeviceId(): void {
    let deviceId = localStorage.getItem('rag_device_id');
    if (!deviceId) {
      deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('rag_device_id', deviceId);
    }
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return localStorage.getItem('rag_device_id') || 'unknown';
  }

  /**
   * Initialize sync service
   */
  async initialize(config: SyncConfig): Promise<void> {
    this.config = {
      ...config,
      deviceId: this.getDeviceId(),
    };
    
    // Save config to localStorage
    localStorage.setItem('rag_sync_config', JSON.stringify(this.config));
    
    console.log('🔄 RAG Sync Service initialized:', this.config);
    
    // Start auto-sync if enabled
    if (config.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Push snippets to Google Sheets
   */
  async pushSnippets(snippets: ContentSnippet[], userEmail: string): Promise<void> {
    if (!this.config) {
      throw new Error('Sync service not initialized');
    }

    try {
      console.log(`📤 Pushing ${snippets.length} snippets to Sheets...`);
      
      const response = await fetch(`${this.apiUrl}/rag/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'push-snippets',
          userEmail,
          deviceId: this.config.deviceId,
          data: snippets,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to push snippets');
      }

      const result = await response.json();
      console.log(`✅ Pushed ${result.count || snippets.length} snippets`);
      
    } catch (error) {
      console.error('❌ Error pushing snippets:', error);
      throw error;
    }
  }

  /**
   * Pull snippets from Google Sheets
   */
  async pullSnippets(userEmail: string): Promise<ContentSnippet[]> {
    if (!this.config) {
      throw new Error('Sync service not initialized');
    }

    try {
      console.log('📥 Pulling snippets from Sheets...');
      
      const response = await fetch(`${this.apiUrl}/rag/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'pull-snippets',
          userEmail,
          deviceId: this.config.deviceId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to pull snippets');
      }

      const result = await response.json();
      const snippets = result.snippets || [];
      
      console.log(`✅ Pulled ${snippets.length} snippets`);
      return snippets;
      
    } catch (error) {
      console.error('❌ Error pulling snippets:', error);
      throw error;
    }
  }

  /**
   * Full bidirectional sync
   */
  async fullSync(userEmail: string, localSnippets: ContentSnippet[]): Promise<SyncResult> {
    if (!this.config) {
      throw new Error('Sync service not initialized');
    }

    this.status.inProgress = true;
    this.notifyStart();
    
    const result: SyncResult = {
      snippetsPushed: 0,
      snippetsPulled: 0,
      embeddingsPushed: 0,
      embeddingsPulled: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      console.log('🔄 Starting full sync...');
      
      // Get remote snippets
      const remoteSnippets = await this.pullSnippets(userEmail);
      
      // Merge local and remote (detect conflicts)
      const { toUpload, toDownload, conflicts } = this.mergeSnippets(localSnippets, remoteSnippets);
      
      result.conflicts = conflicts.length;
      this.status.conflictsResolved += conflicts.length;
      
      // Push new/updated local snippets
      if (toUpload.length > 0) {
        await this.pushSnippets(toUpload, userEmail);
        result.snippetsPushed = toUpload.length;
      }
      
      // Return snippets to download
      result.snippetsPulled = toDownload.length;
      
      // Update last sync timestamp
      this.status.lastSync = Date.now();
      this.status.lastError = null;
      localStorage.setItem('rag_last_sync', this.status.lastSync.toString());
      
      console.log('✅ Full sync complete:', result);
      this.notifyComplete(result);
      
      return result;
      
    } catch (error: any) {
      console.error('❌ Full sync failed:', error);
      this.status.lastError = error.message;
      result.errors.push(error.message);
      this.notifyError(error);
      throw error;
    } finally {
      this.status.inProgress = false;
    }
  }

  /**
   * Merge local and remote snippets to determine what to sync
   */
  private mergeSnippets(
    local: ContentSnippet[],
    remote: ContentSnippet[]
  ): { toUpload: ContentSnippet[]; toDownload: ContentSnippet[]; conflicts: ContentSnippet[] } {
    const localMap = new Map(local.map(s => [s.id, s]));
    const remoteMap = new Map(remote.map(s => [s.id, s]));
    
    const toUpload: ContentSnippet[] = [];
    const toDownload: ContentSnippet[] = [];
    const conflicts: ContentSnippet[] = [];
    
    // Check local snippets
    for (const snippet of local) {
      const remoteSnippet = remoteMap.get(snippet.id);
      
      if (!remoteSnippet) {
        // New local snippet - upload it
        toUpload.push(snippet);
      } else {
        // Exists in both - check for conflicts
        const localTime = snippet.updateDate || snippet.timestamp;
        const remoteTime = (remoteSnippet as any).updateDate || (remoteSnippet as any).timestamp;
        
        if (localTime > remoteTime) {
          // Local is newer - upload
          toUpload.push(snippet);
        } else if (remoteTime > localTime) {
          // Remote is newer - download
          toDownload.push(remoteSnippet);
        }
        // If equal, no sync needed
      }
    }
    
    // Check remote snippets for new ones
    for (const snippet of remote) {
      if (!localMap.has(snippet.id)) {
        // New remote snippet - download it
        toDownload.push(snippet);
      }
    }
    
    console.log(`📊 Merge result: ${toUpload.length} to upload, ${toDownload.length} to download, ${conflicts.length} conflicts`);
    
    return { toUpload, toDownload, conflicts };
  }

  /**
   * Queue a sync operation for later processing
   */
  queueSync(operation: Omit<SyncOperation, 'timestamp'>): void {
    const op: SyncOperation = {
      ...operation,
      timestamp: Date.now(),
    };
    
    this.syncQueue.push(op);
    this.status.pendingChanges = this.syncQueue.length;
    
    // Save queue to localStorage
    this.saveQueueToStorage();
    
    console.log(`📝 Queued ${operation.type} operation (${this.syncQueue.length} pending)`);
    
    // Process queue if auto-sync is enabled
    if (this.config?.autoSync && !this.status.inProgress) {
      // Debounce: process after 2 seconds of no new operations
      setTimeout(() => {
        if (this.syncQueue.length > 0 && !this.status.inProgress) {
          this.processSyncQueue().catch(console.error);
        }
      }, 2000);
    }
  }

  /**
   * Process queued sync operations
   */
  private async processSyncQueue(): Promise<void> {
    if (!this.config || this.syncQueue.length === 0) {
      return;
    }

    console.log(`🔄 Processing ${this.syncQueue.length} queued operations...`);
    
    this.status.inProgress = true;
    
    try {
      // Group operations by type
      const snippetOps = this.syncQueue.filter(op => op.type === 'push-snippet');
      
      if (snippetOps.length > 0) {
        const snippets = snippetOps.map(op => op.data);
        const userEmail = snippetOps[0].userEmail;
        
        await this.pushSnippets(snippets, userEmail);
        
        // Remove processed operations
        this.syncQueue = this.syncQueue.filter(op => op.type !== 'push-snippet');
      }
      
      this.status.pendingChanges = this.syncQueue.length;
      this.saveQueueToStorage();
      
      console.log(`✅ Queue processed, ${this.syncQueue.length} remaining`);
      
    } catch (error) {
      console.error('❌ Error processing queue:', error);
      // Keep failed operations in queue for retry
    } finally {
      this.status.inProgress = false;
    }
  }

  /**
   * Start automatic background sync
   */
  startAutoSync(): void {
    if (this.syncInterval) {
      return; // Already running
    }

    if (!this.config) {
      console.warn('Cannot start auto-sync: service not initialized');
      return;
    }

    console.log(`🔄 Starting auto-sync (interval: ${this.config.syncInterval}ms)`);
    
    this.syncInterval = setInterval(() => {
      if (!this.status.inProgress && this.syncQueue.length > 0) {
        this.processSyncQueue().catch(console.error);
      }
    }, this.config.syncInterval);
  }

  /**
   * Stop automatic background sync
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ Auto-sync stopped');
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveQueueToStorage(): void {
    try {
      localStorage.setItem('rag_sync_queue', JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadQueueFromStorage(): void {
    try {
      const saved = localStorage.getItem('rag_sync_queue');
      if (saved) {
        this.syncQueue = JSON.parse(saved);
        this.status.pendingChanges = this.syncQueue.length;
        console.log(`📝 Loaded ${this.syncQueue.length} queued operations from storage`);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  }

  /**
   * Event listeners
   */
  onSyncStart(callback: SyncEventCallback): void {
    this.eventCallbacks.onStart.push(callback);
  }

  onSyncComplete(callback: SyncEventCallback): void {
    this.eventCallbacks.onComplete.push(callback);
  }

  onSyncError(callback: SyncEventCallback): void {
    this.eventCallbacks.onError.push(callback);
  }

  /**
   * Notify event listeners
   */
  private notifyStart(): void {
    this.eventCallbacks.onStart.forEach(cb => cb());
  }

  private notifyComplete(result: SyncResult): void {
    this.eventCallbacks.onComplete.forEach(cb => cb(result));
  }

  private notifyError(error: Error): void {
    this.eventCallbacks.onError.forEach(cb => cb(undefined, error));
  }

  /**
   * Clear all data (for testing/debugging)
   */
  clear(): void {
    this.syncQueue = [];
    this.status = {
      inProgress: false,
      lastSync: null,
      lastError: null,
      pendingChanges: 0,
      conflictsResolved: 0,
    };
    localStorage.removeItem('rag_sync_queue');
    localStorage.removeItem('rag_last_sync');
    console.log('🗑️ Sync service cleared');
  }
}

// Export singleton instance
export const ragSyncService = new RAGSyncService();
