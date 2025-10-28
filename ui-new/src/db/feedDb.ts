/**
 * Feed Database - IndexedDB for Feed Items, Preferences, and Interactions
 */

import type { FeedItem, FeedPreferences, FeedQuiz } from '../types/feed';

// Interaction tracking types
export type FeedAction = 'stash' | 'trash' | 'view' | 'quiz' | 'skip';

export interface UserInteraction {
  id: string;                     // interaction ID (UUID)
  timestamp: number;              // interaction time
  feedItemId: string;             // which feed item
  action: FeedAction;             // stash, trash, view, quiz, skip
  timeSpent: number;              // milliseconds viewing item
  itemType: 'didYouKnow' | 'questionAnswer';
  topics: string[];               // extracted topics
  source: string;                 // search result, swag snippet, etc.
  content: string;                // item text (for TF-IDF)
  
  // Quiz engagement tracking
  quizGenerated?: boolean;        // true if quiz was created from this item
  quizId?: string;                // reference to quiz if generated
  quizScore?: number;             // quiz score (0-100) if completed
  quizTopics?: string[];          // topics extracted from quiz questions
}

export interface TopicWeight {
  topic: string;
  weight: number;                 // calculated weight
  frequency: number;              // how many times seen
  recency: number;                // timestamp of last interaction
  quizEngagement: boolean;        // true if quiz was generated
  quizScore?: number;             // average quiz score for this topic
  quizCount?: number;             // number of quizzes for this topic
}

export interface KeywordWeight {
  keyword: string;
  tfidf: number;                  // TF-IDF score
  frequency: number;              // appearances in stashed items
  quizFrequency: number;          // appearances in quiz-generated items
}

export interface UserPreferences {
  userId: string;
  learnedTopics: TopicWeight[];   // automatically learned
  learnedKeywords: KeywordWeight[]; // TF-IDF keywords
  avoidTopics: string[];          // trashed topics
  lastUpdated: number;            // last preference update
  interactionCount: number;       // total interactions
  quizEngagementCount: number;    // total quizzes generated from feed
}

class FeedDatabase {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'feed_data';
  private readonly dbVersion = 2; // Incremented for new stores

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    if (this.db) return; // Already initialized

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ Feed database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        const oldVersion = event.oldVersion;

        // Feed items store
        if (!db.objectStoreNames.contains('items')) {
          const itemStore = db.createObjectStore('items', { keyPath: 'id' });
          itemStore.createIndex('createdAt', 'createdAt', { unique: false });
          itemStore.createIndex('viewed', 'viewed', { unique: false });
          itemStore.createIndex('stashed', 'stashed', { unique: false });
          itemStore.createIndex('trashed', 'trashed', { unique: false });
          itemStore.createIndex('topics', 'topics', { unique: false, multiEntry: true });
        }

        // Preferences store (single record with id='default')
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'id' });
        }

        // Quizzes store
        if (!db.objectStoreNames.contains('quizzes')) {
          const quizStore = db.createObjectStore('quizzes', { keyPath: 'itemId' });
          quizStore.createIndex('generatedAt', 'generatedAt', { unique: false });
        }

        // Interactions store (v2)
        if (oldVersion < 2 && !db.objectStoreNames.contains('interactions')) {
          const interactionStore = db.createObjectStore('interactions', { keyPath: 'id' });
          interactionStore.createIndex('timestamp', 'timestamp', { unique: false });
          interactionStore.createIndex('feedItemId', 'feedItemId', { unique: false });
          interactionStore.createIndex('action', 'action', { unique: false });
          interactionStore.createIndex('topics', 'topics', { unique: false, multiEntry: true });
          interactionStore.createIndex('quizGenerated', 'quizGenerated', { unique: false });
        }

        // User preferences store (v2) - for ML-learned preferences
        if (oldVersion < 2 && !db.objectStoreNames.contains('userPreferences')) {
          const userPrefStore = db.createObjectStore('userPreferences', { keyPath: 'userId' });
          userPrefStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }
      };
    });
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Save feed items to database
   */
  async saveItems(items: FeedItem[]): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');

      for (const item of items) {
        // Ensure item has required fields
        const itemToSave: FeedItem = {
          ...item,
          id: item.id || this.generateUUID(),
          createdAt: item.createdAt || new Date().toISOString(),
          viewed: item.viewed !== undefined ? item.viewed : false,
          stashed: item.stashed !== undefined ? item.stashed : false,
          trashed: item.trashed !== undefined ? item.trashed : false
        };

        store.put(itemToSave);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get feed items with pagination
   * @param limit - Number of items to return
   * @param offset - Number of items to skip
   * @returns Array of feed items, sorted by createdAt descending
   */
  async getItems(limit: number = 10, offset: number = 0): Promise<FeedItem[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['items'], 'readonly');
      const store = transaction.objectStore('items');
      const index = store.index('createdAt');

      const items: FeedItem[] = [];
      let skipped = 0;

      // Open cursor in reverse order (newest first)
      const request = index.openCursor(null, 'prev');

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

        if (cursor) {
          const item = cursor.value as FeedItem;

          // Skip trashed items
          if (!item.trashed) {
            if (skipped < offset) {
              skipped++;
            } else if (items.length < limit) {
              items.push(item);
            }
          }

          if (items.length < limit) {
            cursor.continue();
          }
        }
      };

      transaction.oncomplete = () => resolve(items);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get a single feed item by ID
   */
  async getItemById(id: string): Promise<FeedItem | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['items'], 'readonly');
      const store = transaction.objectStore('items');
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update a feed item
   */
  async updateItem(id: string, updates: Partial<FeedItem>): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');

      // Get existing item
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const existingItem = getRequest.result;
        if (!existingItem) {
          reject(new Error('Item not found'));
          return;
        }

        // Merge updates
        const updatedItem = { ...existingItem, ...updates };

        // Save updated item
        const putRequest = store.put(updatedItem);

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Delete a feed item
   */
  async deleteItem(id: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all trashed items
   */
  async clearTrashed(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');
      const index = store.index('trashed');

      const request = index.openCursor(IDBKeyRange.only(true));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get preferences
   */
  async getPreferences(): Promise<FeedPreferences> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['preferences'], 'readonly');
      const store = transaction.objectStore('preferences');
      const request = store.get('default');

      request.onsuccess = () => {
        const prefs = request.result || {
          id: 'default',
          searchTerms: ['latest world news'],
          likedTopics: [],
          dislikedTopics: [],
          lastGenerated: new Date().toISOString()
        };
        resolve(prefs);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update preferences
   */
  async updatePreferences(updates: Partial<FeedPreferences>): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['preferences'], 'readwrite');
      const store = transaction.objectStore('preferences');

      // Get existing preferences
      const getRequest = store.get('default');

      getRequest.onsuccess = () => {
        const existing = getRequest.result || {
          id: 'default',
          searchTerms: ['latest world news'],
          likedTopics: [],
          dislikedTopics: [],
          lastGenerated: new Date().toISOString()
        };

        // Merge updates
        const updated = { ...existing, ...updates };

        // Save
        const putRequest = store.put(updated);

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Add a liked topic
   */
  async addLikedTopic(topic: string): Promise<void> {
    const prefs = await this.getPreferences();
    const likedTopics = new Set(prefs.likedTopics);
    likedTopics.add(topic);

    // Remove from disliked if present
    const dislikedTopics = prefs.dislikedTopics.filter(t => t !== topic);

    await this.updatePreferences({
      likedTopics: Array.from(likedTopics),
      dislikedTopics
    });
  }

  /**
   * Add a disliked topic
   */
  async addDislikedTopic(topic: string): Promise<void> {
    const prefs = await this.getPreferences();
    const dislikedTopics = new Set(prefs.dislikedTopics);
    dislikedTopics.add(topic);

    // Remove from liked if present
    const likedTopics = prefs.likedTopics.filter(t => t !== topic);

    await this.updatePreferences({
      likedTopics,
      dislikedTopics: Array.from(dislikedTopics)
    });
  }

  /**
   * Save a quiz
   */
  async saveQuiz(quiz: FeedQuiz): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['quizzes'], 'readwrite');
      const store = transaction.objectStore('quizzes');
      const request = store.put(quiz);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a quiz by item ID
   */
  async getQuiz(itemId: string): Promise<FeedQuiz | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['quizzes'], 'readonly');
      const store = transaction.objectStore('quizzes');
      const request = store.get(itemId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a quiz
   */
  async deleteQuiz(itemId: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['quizzes'], 'readwrite');
      const store = transaction.objectStore('quizzes');
      const request = store.delete(itemId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== Interaction Tracking Methods ====================

  /**
   * Save user interaction (stash, trash, view, quiz, skip)
   */
  async saveInteraction(interaction: Omit<UserInteraction, 'id' | 'timestamp'>): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const fullInteraction: UserInteraction = {
      ...interaction,
      id: `interaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['interactions'], 'readwrite');
      const store = transaction.objectStore('interactions');
      const request = store.add(fullInteraction);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get recent interactions (default: last 1000)
   */
  async getInteractions(limit: number = 1000): Promise<UserInteraction[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['interactions'], 'readonly');
      const store = transaction.objectStore('interactions');
      const index = store.index('timestamp');
      const request = index.getAll();

      request.onsuccess = () => {
        const interactions = request.result as UserInteraction[];
        resolve(interactions.reverse().slice(0, limit));
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get interactions by action type
   */
  async getInteractionsByAction(action: FeedAction, limit: number = 500): Promise<UserInteraction[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['interactions'], 'readonly');
      const store = transaction.objectStore('interactions');
      const index = store.index('action');
      const request = index.getAll(action);

      request.onsuccess = () => {
        const interactions = request.result as UserInteraction[];
        resolve(interactions.reverse().slice(0, limit));
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get quiz-generated interactions only
   */
  async getQuizInteractions(limit: number = 500): Promise<UserInteraction[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['interactions'], 'readonly');
      const store = transaction.objectStore('interactions');
      const index = store.index('quizGenerated');
      const request = index.getAll(true);

      request.onsuccess = () => {
        const interactions = request.result as UserInteraction[];
        resolve(interactions.reverse().slice(0, limit));
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ==================== User Preferences Methods ====================

  /**
   * Get user preferences (ML-learned)
   */
  async getUserPreferences(userId: string = 'default'): Promise<UserPreferences | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['userPreferences'], 'readonly');
      const store = transaction.objectStore('userPreferences');
      const request = store.get(userId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update user preferences (typically called by feed-recommender service)
   */
  async updateUserPreferences(preferences: UserPreferences): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['userPreferences'], 'readwrite');
      const store = transaction.objectStore('userPreferences');
      const request = store.put(preferences);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Initialize default user preferences
   */
  async initializeUserPreferences(userId: string = 'default'): Promise<UserPreferences> {
    const defaultPrefs: UserPreferences = {
      userId,
      learnedTopics: [],
      learnedKeywords: [],
      avoidTopics: [],
      lastUpdated: Date.now(),
      interactionCount: 0,
      quizEngagementCount: 0
    };

    await this.updateUserPreferences(defaultPrefs);
    return defaultPrefs;
  }

  /**
   * Delete all interactions (for testing/privacy)
   */
  async clearInteractions(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['interactions'], 'readwrite');
      const store = transaction.objectStore('interactions');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete user preferences (for testing/privacy)
   */
  async clearUserPreferences(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['userPreferences'], 'readwrite');
      const store = transaction.objectStore('userPreferences');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Export singleton instance
export const feedDB = new FeedDatabase();
