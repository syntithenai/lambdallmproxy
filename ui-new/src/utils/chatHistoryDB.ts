/**
 * IndexedDB utility for storing chat history
 * Migrates from localStorage to eliminate quota issues
 */

const DB_NAME = 'ChatHistoryDB';
const DB_VERSION = 1;
const STORE_NAME = 'chats';

export interface ChatHistoryEntry {
  id: string;
  messages: any[];
  timestamp: number;
  title?: string;
}

class ChatHistoryDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  private async init(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('Created chat history object store');
        }
      };
    });

    return this.initPromise;
  }

  async saveChat(id: string, messages: any[], title?: string): Promise<void> {
    try {
      const db = await this.init();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const entry: ChatHistoryEntry = {
        id,
        messages,
        timestamp: Date.now(),
        title
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log(`Saved chat ${id} to IndexedDB`);
    } catch (error) {
      console.error('Error saving chat to IndexedDB:', error);
      throw error;
    }
  }

  async getChat(id: string): Promise<any[] | null> {
    try {
      const db = await this.init();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => {
          const entry = request.result as ChatHistoryEntry | undefined;
          resolve(entry ? entry.messages : null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting chat from IndexedDB:', error);
      return null;
    }
  }

  async getAllChats(): Promise<ChatHistoryEntry[]> {
    try {
      const db = await this.init();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting all chats from IndexedDB:', error);
      return [];
    }
  }

  async deleteChat(id: string): Promise<void> {
    try {
      const db = await this.init();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log(`Deleted chat ${id} from IndexedDB`);
    } catch (error) {
      console.error('Error deleting chat from IndexedDB:', error);
      throw error;
    }
  }

  async getOldestChats(count: number): Promise<ChatHistoryEntry[]> {
    try {
      const db = await this.init();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');

      return new Promise((resolve, reject) => {
        const request = index.openCursor();
        const results: ChatHistoryEntry[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor && results.length < count) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting oldest chats:', error);
      return [];
    }
  }

  async getCount(): Promise<number> {
    try {
      const db = await this.init();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting chat count:', error);
      return 0;
    }
  }

  async cleanupOldChats(keepCount: number): Promise<number> {
    try {
      const allChats = await this.getAllChats();
      if (allChats.length <= keepCount) {
        return 0;
      }

      // Sort by timestamp (oldest first)
      const sortedChats = allChats.sort((a, b) => a.timestamp - b.timestamp);
      const chatsToDelete = sortedChats.slice(0, allChats.length - keepCount);

      const db = await this.init();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      for (const chat of chatsToDelete) {
        store.delete(chat.id);
      }

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      console.log(`Cleaned up ${chatsToDelete.length} old chats`);
      return chatsToDelete.length;
    } catch (error) {
      console.error('Error cleaning up old chats:', error);
      return 0;
    }
  }

  async migrateFromLocalStorage(): Promise<number> {
    try {
      let migratedCount = 0;
      const keys = Object.keys(localStorage).filter(key => key.startsWith('chat_history_'));

      for (const key of keys) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const messages = JSON.parse(data);
            const id = key.replace('chat_history_', '');
            await this.saveChat(id, messages);
            localStorage.removeItem(key);
            migratedCount++;
          }
        } catch (error) {
          console.error(`Error migrating ${key}:`, error);
        }
      }

      if (migratedCount > 0) {
        console.log(`Migrated ${migratedCount} chat histories from localStorage to IndexedDB`);
      }

      return migratedCount;
    } catch (error) {
      console.error('Error during migration:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const chatHistoryDB = new ChatHistoryDB();
