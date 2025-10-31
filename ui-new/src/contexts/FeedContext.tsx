/**
 * Feed Context - Global State Management for Feed Feature
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { FeedItem, FeedPreferences, FeedQuiz } from '../types/feed';
import { feedDB } from '../db/feedDb';
import { generateFeedItems, generateFeedQuiz } from '../services/feedGenerator';
import { useAuth } from './AuthContext';
import { useSwag } from './SwagContext';
import { useToast } from '../components/ToastManager';
import { googleDriveSync } from '../services/googleDriveSync';

interface FeedContextValue {
  // State
  items: FeedItem[];
  preferences: FeedPreferences;
  currentQuiz: FeedQuiz | null;
  isLoading: boolean;
  isGenerating: boolean;
  isGeneratingQuiz: boolean; // NEW: Quiz generation indicator
  generationStatus: string; // Current status message during generation
  error: string | null;
  selectedTags: string[]; // Tags to filter Swag content for feed generation
  
  // Actions
  generateMore: () => Promise<void>;
  stashItem: (itemId: string) => Promise<void>;
  trashItem: (itemId: string) => Promise<void>;
  markViewed: (itemId: string) => Promise<void>;
  startQuiz: (itemId: string) => Promise<void>;
  closeQuiz: () => void;
  updateSearchTerms: (terms: string[]) => Promise<void>;
  updateSelectedTags: (tags: string[]) => void;
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
  const { showSuccess, showWarning, showError } = useToast();
  
  const [items, setItems] = useState<FeedItem[]>([]);
  const [preferences, setPreferences] = useState<FeedPreferences>({
    searchTerms: ['latest world news'],
    likedTopics: [],
    dislikedTopics: [],
    lastGenerated: new Date().toISOString()
  });
  const [currentQuiz, setCurrentQuiz] = useState<FeedQuiz | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as true, set to false after initial load
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>(''); // Status message during generation
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // Filter Swag by these tags

  // Use refs to access latest values without causing re-renders
  const snippetsRef = useRef(snippets);
  const preferencesRef = useRef(preferences);
  const isGeneratingRef = useRef(isGenerating);
  
  // Keep refs in sync with state
  useEffect(() => {
    snippetsRef.current = snippets;
  }, [snippets]);
  
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);
  
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  /**
   * Load initial data from IndexedDB
   */
  useEffect(() => {
    const loadData = async () => {
      console.log('📂 FeedContext: Starting initial data load...');
      try {
        setIsLoading(true);
        
        console.log('📂 Initializing feedDB...');
        await feedDB.init();
        console.log('✅ FeedDB initialized');
        
        // Load preferences
        console.log('📂 Loading preferences...');
        const prefs = await feedDB.getPreferences();
        console.log('✅ Loaded preferences');
        setPreferences(prefs);
        
        // Load items (first 10)
        console.log('📂 Loading items from DB...');
        const loadedItems = await feedDB.getItems(10, 0);
        console.log('✅ Loaded items from DB:', loadedItems.length);
        setItems(loadedItems);
        
        console.log('✅ Initial data load complete');
      } catch (err) {
        console.error('❌ Failed to load feed data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load feed');
      } finally {
        console.log('📂 Setting isLoading to false');
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  /**
   * Generate more feed items
   */
  const generateMore = useCallback(async () => {
    console.log('🎯 generateMore called');
    
    const token = await getToken();
    console.log('🔑 Token retrieved:', token ? `${token.substring(0, 20)}...` : 'NULL');
    
    if (!token) {
      console.log('❌ No token, aborting');
      setError('Please sign in to generate feed items');
      showError('Please sign in to generate feed items');
      return;
    }
    
    // Check isGenerating via ref to avoid it being a dependency
    if (isGeneratingRef.current) {
      console.log('⏸️ Already generating, skipping');
      return;
    }

    try {
      console.log('🚀 Starting feed generation...');
      setIsGenerating(true);
      setError(null);
      setGenerationStatus('Preparing to generate feed...');

      // Get Swag content - filter by selected tags if any
      let filteredSnippets = snippetsRef.current;
      
      // Apply tag filter if tags are selected
      if (selectedTags.length > 0) {
        filteredSnippets = filteredSnippets.filter(snippet => 
          snippet.tags && snippet.tags.some(tag => selectedTags.includes(tag))
        );
        console.log(`🏷️ Filtered by tags [${selectedTags.join(', ')}]: ${filteredSnippets.length} snippets`);
      }
      
      // Get last 20 snippets from filtered set
      const swagContent = filteredSnippets.slice(-20).map(s => s.content || '');
      console.log('📚 Swag items:', swagContent.length);

      // Track generated items as they arrive
      const generatedItems: FeedItem[] = [];

      // Generate new items via backend - use ref to avoid dependency
      console.log('🔍 Calling generateFeedItems with preferences:', preferencesRef.current);
      const newItems = await generateFeedItems(
        token,
        swagContent,
        preferencesRef.current,
        10,
        // Progress callback - update UI as items arrive
        (event) => {
          console.log('📨 Feed event:', event.type, event);
          
          if (event.type === 'item_generated' && event.item) {
            console.log('✨ New item generated:', event.item.title);
            generatedItems.push(event.item);
            
            // Save item to IndexedDB immediately (fire-and-forget, non-blocking)
            feedDB.saveItems([event.item])
              .then(() => {
                console.log('💾 Saved item to DB:', event.item!.id, event.item!.title);
              })
              .catch(dbError => {
                console.error('❌ Failed to save item to DB:', event.item!.id, dbError);
              });
            
            // Update status with item count
            setGenerationStatus(`Generated ${generatedItems.length} of 10 items...`);
            
            // Immediately update UI with new item (append to bottom of list)
            setItems(prev => {
              // Append new item to end
              const updated = [...prev, event.item!];
              
              // Prune oldest items if exceeding 30 items (keep newest 30)
              const pruned = updated.length > 30 ? updated.slice(-30) : updated;
              
              console.log('📊 Items in state after adding:', pruned.length, 'items');
              return pruned;
            });
          } else if (event.type === 'status' && event.message) {
            console.log('📊 Status:', event.message);
            setGenerationStatus(event.message); // Update UI with status message
          } else if (event.type === 'search_complete') {
            console.log('🔍 Search complete:', event.searchResults, 'results');
            setGenerationStatus(`Search complete - found ${event.searchResults || 0} results`);
          } else if (event.type === 'complete' && event.cost !== undefined) {
            console.log('💰 Total cost:', event.cost);
            if (event.cost > 0) {
              setGenerationStatus(`Complete! Cost: $${event.cost.toFixed(6)}`);
            }
          } else if (event.type === 'error') {
            console.error('❌ Generation error:', event.error);
            setError(event.error || 'Generation failed');
            setGenerationStatus('Generation failed');
          }
        }
      );
      
      console.log('✅ Generated items:', newItems.length);
      console.log('✅ Items via events:', generatedItems.length);
      console.log('📄 Items preview:', newItems.map(i => ({ id: i.title })));

      // Note: Items already added to UI AND saved to DB via event callback
      // Just need to update lastGenerated timestamp
      
      // Update lastGenerated timestamp
      await feedDB.updatePreferences({
        lastGenerated: new Date().toISOString()
      });
      
      // Sync feed items to Google Drive (immediate, fire-and-forget)
      const isSyncEnabled = () => {
        const token = localStorage.getItem('google_drive_access_token');
        const autoSync = localStorage.getItem('auto_sync_enabled') === 'true';
        return token && token.length > 0 && autoSync;
      };
      
      if (isSyncEnabled()) {
        (async () => {
          try {
            const result = await googleDriveSync.syncFeedItems();
            if (result.success) {
              console.log('✅ Feed items synced to Google Drive');
            }
          } catch (error) {
            console.error('❌ Failed to sync feed items:', error);
          }
        })();
      }
    } catch (err) {
      console.error('❌ Failed to generate feed items:', err);
      if (err instanceof Error) {
        console.error('Error message:', err.message);
        console.error('Error stack:', err.stack);
      }
      setError(err instanceof Error ? err.message : 'Failed to generate feed');
    } finally {
      setIsGenerating(false);
      setGenerationStatus(''); // Clear status message
    }
  }, [getToken]);
  // Note: isGenerating, snippets, and preferences accessed via state/refs but NOT in deps to prevent infinite loops

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
        // Generate new quiz - show toast as this takes time
        showWarning('🧠 Generating quiz... this may take 30-60 seconds. Please wait.');
        setIsGeneratingQuiz(true);
        
        const item = items.find(i => i.id === itemId);
        if (!item) {
          throw new Error('Item not found');
        }

        quiz = await generateFeedQuiz(token, item);
        
        // Save to cache
        await feedDB.saveQuiz(quiz);
        showSuccess('✅ Quiz ready!');
      }

      setCurrentQuiz(quiz);
    } catch (err) {
      console.error('Failed to start quiz:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to load quiz';
      setError(errorMsg);
      showError(`❌ ${errorMsg}`);
    } finally {
      setIsLoading(false);
      setIsGeneratingQuiz(false);
    }
  }, [getToken, items, showWarning, showSuccess, showError]);

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
   * Update selected tags for filtering Swag content
   */
  const updateSelectedTags = useCallback((tags: string[]) => {
    setSelectedTags(tags);
    console.log(`🏷️ Tag filter updated: ${tags.length} tags selected`);
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
    isGeneratingQuiz,
    generationStatus,
    error,
    selectedTags,
    generateMore,
    stashItem,
    trashItem,
    markViewed,
    startQuiz,
    closeQuiz,
    updateSearchTerms,
    updateSelectedTags,
    refresh
  };

  return (
    <FeedContext.Provider value={value}>
      {children}
    </FeedContext.Provider>
  );
}
