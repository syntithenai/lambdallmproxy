/**
 * Feed Context - Global State Management for Feed Feature
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { FeedItem, FeedPreferences, FeedQuiz } from '../types/feed';
import { feedDB } from '../db/feedDb';
import { generateFeedItems, generateFeedQuiz } from '../services/feedGenerator';
import { useAuth } from './AuthContext';
import { useSwag } from './SwagContext';

interface FeedContextValue {
  // State
  items: FeedItem[];
  preferences: FeedPreferences;
  currentQuiz: FeedQuiz | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  
  // Actions
  generateMore: () => Promise<void>;
  stashItem: (itemId: string) => Promise<void>;
  trashItem: (itemId: string) => Promise<void>;
  markViewed: (itemId: string) => Promise<void>;
  startQuiz: (itemId: string) => Promise<void>;
  closeQuiz: () => void;
  updateSearchTerms: (terms: string[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const FeedContext = createContext<FeedContextValue | null>(null);

export function useFeed() {
  const context = useContext(FeedContext);
  if (!context) {
    throw new Error('useFeed must be used within FeedProvider');
  }
  return context;
}

interface FeedProviderProps {
  children: ReactNode;
}

export function FeedProvider({ children }: FeedProviderProps) {
  const { getToken } = useAuth();
  const { snippets } = useSwag();
  
  const [items, setItems] = useState<FeedItem[]>([]);
  const [preferences, setPreferences] = useState<FeedPreferences>({
    searchTerms: ['latest world news'],
    likedTopics: [],
    dislikedTopics: [],
    lastGenerated: new Date().toISOString()
  });
  const [currentQuiz, setCurrentQuiz] = useState<FeedQuiz | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load initial data from IndexedDB
   */
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        await feedDB.init();
        
        // Load preferences
        const prefs = await feedDB.getPreferences();
        setPreferences(prefs);
        
        // Load items (first 10)
        const loadedItems = await feedDB.getItems(10, 0);
        setItems(loadedItems);
      } catch (err) {
        console.error('Failed to load feed data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load feed');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  /**
   * Generate more feed items
   */
  const generateMore = useCallback(async () => {
    const token = await getToken();
    if (!token || isGenerating) return;

    try {
      setIsGenerating(true);
      setError(null);

      // Get Swag content (last 20 snippets)
      const swagContent = snippets.slice(-20).map(s => s.content || '');

      // Generate new items via backend
      const newItems = await generateFeedItems(
        token,
        swagContent,
        preferences,
        10,
        (event) => {
          // Log progress events
          console.log('Feed generation event:', event);
        }
      );

      // Fetch images for items with imageSearchTerms
      const itemsWithImages = await Promise.all(
        newItems.map(async (item) => {
          // Skip if already has image or no search terms
          if (item.image || !('imageSearchTerms' in item)) {
            return item;
          }

          try {
            // Search for image via DuckDuckGo (handled by backend)
            // For now, we'll skip image fetching in the initial implementation
            // This can be enhanced later with image search API
            return item;
          } catch (err) {
            console.warn('Failed to fetch image for item:', item.id, err);
            return item;
          }
        })
      );

      // Save to IndexedDB
      await feedDB.saveItems(itemsWithImages);

      // Update state (prepend new items)
      setItems(prev => [...itemsWithImages, ...prev]);

      // Update lastGenerated timestamp
      await feedDB.updatePreferences({
        lastGenerated: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to generate feed items:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate feed');
    } finally {
      setIsGenerating(false);
    }
  }, [getToken, snippets, preferences, isGenerating]);

  /**
   * Stash item to Swag
   */
  const stashItem = useCallback(async (itemId: string) => {
    try {
      // Update database
      await feedDB.updateItem(itemId, { stashed: true });

      // Update state
      setItems(prev => 
        prev.map(item => 
          item.id === itemId ? { ...item, stashed: true } : item
        )
      );

      // Extract topics for preferences
      const item = items.find(i => i.id === itemId);
      if (item) {
        for (const topic of item.topics) {
          await feedDB.addLikedTopic(topic);
        }
        
        // Reload preferences
        const updatedPrefs = await feedDB.getPreferences();
        setPreferences(updatedPrefs);
      }
    } catch (err) {
      console.error('Failed to stash item:', err);
      setError(err instanceof Error ? err.message : 'Failed to stash item');
    }
  }, [items]);

  /**
   * Trash item (remove from feed)
   */
  const trashItem = useCallback(async (itemId: string) => {
    try {
      // Update database
      await feedDB.updateItem(itemId, { trashed: true });

      // Update state (remove from list)
      setItems(prev => prev.filter(item => item.id !== itemId));

      // Extract topics for preferences (disliked)
      const item = items.find(i => i.id === itemId);
      if (item) {
        for (const topic of item.topics) {
          await feedDB.addDislikedTopic(topic);
        }
        
        // Reload preferences
        const updatedPrefs = await feedDB.getPreferences();
        setPreferences(updatedPrefs);
      }
    } catch (err) {
      console.error('Failed to trash item:', err);
      setError(err instanceof Error ? err.message : 'Failed to trash item');
    }
  }, [items]);

  /**
   * Mark item as viewed
   */
  const markViewed = useCallback(async (itemId: string) => {
    try {
      await feedDB.updateItem(itemId, { viewed: true });
      
      setItems(prev => 
        prev.map(item => 
          item.id === itemId ? { ...item, viewed: true } : item
        )
      );
    } catch (err) {
      console.error('Failed to mark item as viewed:', err);
    }
  }, []);

  /**
   * Start quiz for an item
   */
  const startQuiz = useCallback(async (itemId: string) => {
    const token = await getToken();
    if (!token) return;

    try {
      setIsLoading(true);
      setError(null);

      // Check if quiz already exists in cache
      let quiz = await feedDB.getQuiz(itemId);

      if (!quiz) {
        // Generate new quiz
        const item = items.find(i => i.id === itemId);
        if (!item) {
          throw new Error('Item not found');
        }

        quiz = await generateFeedQuiz(token, item);
        
        // Save to cache
        await feedDB.saveQuiz(quiz);
      }

      setCurrentQuiz(quiz);
    } catch (err) {
      console.error('Failed to start quiz:', err);
      setError(err instanceof Error ? err.message : 'Failed to load quiz');
    } finally {
      setIsLoading(false);
    }
  }, [getToken, items]);

  /**
   * Close quiz overlay
   */
  const closeQuiz = useCallback(() => {
    setCurrentQuiz(null);
  }, []);

  /**
   * Update search terms
   */
  const updateSearchTerms = useCallback(async (terms: string[]) => {
    try {
      await feedDB.updatePreferences({ searchTerms: terms });
      
      const updatedPrefs = await feedDB.getPreferences();
      setPreferences(updatedPrefs);
    } catch (err) {
      console.error('Failed to update search terms:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  }, []);

  /**
   * Refresh feed (reload from database)
   */
  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const loadedItems = await feedDB.getItems(10, 0);
      setItems(loadedItems);
    } catch (err) {
      console.error('Failed to refresh feed:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: FeedContextValue = {
    items,
    preferences,
    currentQuiz,
    isLoading,
    isGenerating,
    error,
    generateMore,
    stashItem,
    trashItem,
    markViewed,
    startQuiz,
    closeQuiz,
    updateSearchTerms,
    refresh
  };

  return (
    <FeedContext.Provider value={value}>
      {children}
    </FeedContext.Provider>
  );
}
