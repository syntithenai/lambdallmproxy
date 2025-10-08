/**
 * Chat history management utilities
 * Uses IndexedDB for large storage capacity (vs localStorage's 5-10MB limit)
 */

const DB_NAME = 'llmproxy_chat_history';
const DB_VERSION = 1;
const STORE_NAME = 'chats';

export interface ChatHistoryEntry {
  id: string;
  timestamp: number;
  firstUserPrompt: string;
  messages: any[]; // Full message array including tool calls and results
}

/**
 * Initialize IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('Created IndexedDB store for chat history');
      }
    };
  });
}

/**
 * Generate a unique ID for a chat session
 */
function generateChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all chat history entries from IndexedDB
 */
export async function getAllChatHistory(): Promise<ChatHistoryEntry[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      
      // Get all entries sorted by timestamp (descending)
      const request = index.openCursor(null, 'prev');
      const results: ChatHistoryEntry[] = [];
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error loading chat history from IndexedDB:', error);
    return [];
  }
}

/**
 * Save current chat session to IndexedDB
 * Automatically creates a new entry or updates if an ID is provided
 */
export async function saveChatToHistory(messages: any[], chatId?: string): Promise<string> {
  try {
    const db = await openDB();
    
    // Find first user message for the preview
    const firstUserMessage = messages.find(m => m.role === 'user');
    const firstUserPrompt = firstUserMessage 
      ? (firstUserMessage.content || 'Empty message').substring(0, 100)
      : 'New chat';
    
    if (!chatId) {
      // Check for recent duplicate (within last 5 seconds with same first prompt)
      const recent = await getAllChatHistory();
      const now = Date.now();
      const recentDuplicate = recent.find(h => 
        h.firstUserPrompt === firstUserPrompt && 
        (now - h.timestamp) < 5000
      );
      
      if (recentDuplicate) {
        chatId = recentDuplicate.id;
      } else {
        chatId = generateChatId();
      }
    }
    
    const entry: ChatHistoryEntry = {
      id: chatId,
      timestamp: Date.now(),
      firstUserPrompt,
      messages
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);
      
      request.onsuccess = () => {
        console.log(`Chat ${entry.id} saved to IndexedDB`);
        resolve(entry.id);
      };
      
      request.onerror = () => {
        console.error('Error saving chat to IndexedDB:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error saving chat to history:', error);
    return chatId || generateChatId();
  }
}

/**
 * Load a specific chat from IndexedDB
 */
export async function loadChatFromHistory(chatId: string): Promise<any[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(chatId);
      
      request.onsuccess = () => {
        const entry: ChatHistoryEntry | undefined = request.result;
        resolve(entry ? entry.messages : null);
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error loading chat from IndexedDB:', error);
    return null;
  }
}

/**
 * Delete a chat from IndexedDB
 */
export async function deleteChatFromHistory(chatId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(chatId);
      
      request.onsuccess = () => {
        console.log(`Chat ${chatId} deleted from IndexedDB`);
        resolve();
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error deleting chat from IndexedDB:', error);
  }
}

/**
 * Clear all chat history from IndexedDB
 */
export async function clearAllChatHistory(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => {
        console.log('All chat history cleared from IndexedDB');
        resolve();
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error clearing chat history from IndexedDB:', error);
  }
}
