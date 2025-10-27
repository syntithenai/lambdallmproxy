/**
 * Storage utility with IndexedDB for large data and localStorage fallback
 * Provides much higher capacity than localStorage (250MB+ vs 5MB)
 */

const DB_NAME = 'lambdallmproxy';
const DB_VERSION = 1;
const STORE_NAME = 'app_data';

// Storage size limits (approximate)
const LOCALSTORAGE_LIMIT = 5 * 1024 * 1024; // 5MB
const INDEXEDDB_LIMIT = 250 * 1024 * 1024; // 250MB

export class StorageError extends Error {
  code: 'QUOTA_EXCEEDED' | 'DB_ERROR' | 'NOT_SUPPORTED' | 'UNKNOWN';
  estimatedSize?: number;
  limit?: number;

  constructor(
    message: string,
    code: 'QUOTA_EXCEEDED' | 'DB_ERROR' | 'NOT_SUPPORTED' | 'UNKNOWN',
    estimatedSize?: number,
    limit?: number
  ) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.estimatedSize = estimatedSize;
    this.limit = limit;
  }
}

class StorageManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private useIndexedDB = true;

  /**
   * Initialize IndexedDB
   */
  private async initDB(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, falling back to localStorage');
        this.useIndexedDB = false;
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        this.useIndexedDB = false;
        resolve(); // Don't reject, fall back to localStorage
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.useIndexedDB = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Get estimated size of data in bytes
   */
  private getDataSize(data: unknown): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch (e) {
      // Fallback estimation
      return JSON.stringify(data).length * 2;
    }
  }

  /**
   * Get item from storage
   */
  async getItem<T = unknown>(key: string): Promise<T | null> {
    await this.initDB();

    // Try IndexedDB first
    if (this.useIndexedDB && this.db) {
      try {
        return await this.getFromIndexedDB<T>(key);
      } catch (error) {
        console.warn('IndexedDB read failed, trying localStorage:', error);
      }
    }

    // Fallback to localStorage
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Failed to read from localStorage:', error);
      return null;
    }
  }

  /**
   * Set item in storage
   */
  async setItem<T = unknown>(key: string, value: T): Promise<void> {
    await this.initDB();

    const dataSize = this.getDataSize(value);

    // Try IndexedDB first
    if (this.useIndexedDB && this.db) {
      try {
        // Check size limit for IndexedDB
        if (dataSize > INDEXEDDB_LIMIT) {
          throw new StorageError(
            `Data size (${this.formatBytes(dataSize)}) exceeds IndexedDB limit (${this.formatBytes(INDEXEDDB_LIMIT)}). Consider reducing the amount of stored data.`,
            'QUOTA_EXCEEDED',
            dataSize,
            INDEXEDDB_LIMIT
          );
        }

        await this.setToIndexedDB(key, value);
        return;
      } catch (error) {
        if (error instanceof StorageError) {
          throw error;
        }
        console.warn('IndexedDB write failed, trying localStorage:', error);
        this.useIndexedDB = false;
      }
    }

    // Fallback to localStorage
    try {
      // Check size limit for localStorage
      if (dataSize > LOCALSTORAGE_LIMIT) {
        throw new StorageError(
          `Data size (${this.formatBytes(dataSize)}) exceeds localStorage limit (${this.formatBytes(LOCALSTORAGE_LIMIT)}). Try using fewer or smaller snippets, or clear old data.`,
          'QUOTA_EXCEEDED',
          dataSize,
          LOCALSTORAGE_LIMIT
        );
      }

      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }

      // Check if it's a quota error
      if (error instanceof DOMException && 
          (error.name === 'QuotaExceededError' || error.code === 22)) {
        throw new StorageError(
          `Storage quota exceeded (${this.formatBytes(dataSize)}). Please delete some snippets to free up space.`,
          'QUOTA_EXCEEDED',
          dataSize,
          LOCALSTORAGE_LIMIT
        );
      }

      throw new StorageError(
        `Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNKNOWN'
      );
    }
  }

  /**
   * Remove item from storage
   */
  async removeItem(key: string): Promise<void> {
    await this.initDB();

    // Remove from both storages
    if (this.useIndexedDB && this.db) {
      try {
        await this.removeFromIndexedDB(key);
      } catch (error) {
        console.warn('Failed to remove from IndexedDB:', error);
      }
    }

    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  }

  /**
   * Clear all data from storage
   */
  async clear(): Promise<void> {
    await this.initDB();

    if (this.useIndexedDB && this.db) {
      try {
        await this.clearIndexedDB();
      } catch (error) {
        console.warn('Failed to clear IndexedDB:', error);
      }
    }

    try {
      localStorage.clear();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    type: 'indexeddb' | 'localstorage';
    keys: string[];
    totalSize: number;
    limit: number;
    percentUsed: number;
  }> {
    await this.initDB();

    const keys: string[] = [];
    let totalSize = 0;

    if (this.useIndexedDB && this.db) {
      // Get from IndexedDB
      const allKeys = await this.getAllKeysFromIndexedDB();
      for (const key of allKeys) {
        const value = await this.getFromIndexedDB(key);
        keys.push(key);
        totalSize += this.getDataSize(value);
      }

      return {
        type: 'indexeddb',
        keys,
        totalSize,
        limit: INDEXEDDB_LIMIT,
        percentUsed: (totalSize / INDEXEDDB_LIMIT) * 100
      };
    } else {
      // Get from localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          keys.push(key);
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += this.getDataSize(value);
          }
        }
      }

      return {
        type: 'localstorage',
        keys,
        totalSize,
        limit: LOCALSTORAGE_LIMIT,
        percentUsed: (totalSize / LOCALSTORAGE_LIMIT) * 100
      };
    }
  }

  // IndexedDB operations
  private getFromIndexedDB<T>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ?? null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private setToIndexedDB<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private removeFromIndexedDB(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private clearIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private getAllKeysFromIndexedDB(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result as string[]);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}

// Export singleton instance
export const storage = new StorageManager();

// Convenience functions for backward compatibility
export const getItem = <T = unknown>(key: string): Promise<T | null> => 
  storage.getItem<T>(key);

export const setItem = <T = unknown>(key: string, value: T): Promise<void> => 
  storage.setItem<T>(key, value);

export const removeItem = (key: string): Promise<void> => 
  storage.removeItem(key);

export const clear = (): Promise<void> => 
  storage.clear();

export const getStats = () => 
  storage.getStats();
