/**
 * Feed Context - Global State Management for Feed Feature
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { FeedItem, FeedPreferences, FeedQuiz } from '../types/feed';
import { feedDB } from '../db/feedDb';
import { quizDB } from '../db/quizDb';
import { generateFeedItems, generateFeedQuiz } from '../services/feedGenerator';
// Images now embedded in SSE stream - no separate fetch needed
// import { fetchImagesBase64 } from '../utils/api';
import { useAuth } from './AuthContext';
import { useSwag } from './SwagContext';
import { useProject } from './ProjectContext';
import { useToast } from '../components/ToastManager';
import { feedSyncService } from '../services/feedSyncService';

interface FeedContextValue {
  // State
  items: FeedItem[];
  preferences: FeedPreferences;
  currentQuiz: FeedQuiz | null;
  isLoading: boolean;
  isGenerating: boolean;
  generatingQuizForItem: string | null; // Track which specific item is generating a quiz (itemId)
  generationStatus: string; // Current status message during generation
  error: string | null;
  selectedTags: string[]; // Tags to filter Swag content for feed generation
  
  // Actions
  generateMore: (userInterests?: string[]) => Promise<void>;
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
  const { getCurrentProjectId, currentProject } = useProject();
  const { showSuccess, showWarning, showError } = useToast();
  
  const [allItems, setAllItems] = useState<FeedItem[]>([]);
  
  // Filter items by current project
  const items = useMemo(() => {
    const currentProjectId = currentProject?.id || null;
    if (!currentProjectId) {
      // No project selected - show all items
      return allItems;
    }
    // Filter by current project
    return allItems.filter(item => item.projectId === currentProjectId);
  }, [allItems, currentProject]);
  const [preferences, setPreferences] = useState<FeedPreferences>({
    searchTerms: [],
    likedTopics: [],
    dislikedTopics: [],
    lastGenerated: new Date().toISOString()
  });
  const [currentQuiz, setCurrentQuiz] = useState<FeedQuiz | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as true, set to false after initial load
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingQuizForItem, setGeneratingQuizForItem] = useState<string | null>(null); // Track which item is generating a quiz
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
   * Load initial data from IndexedDB and sync with Google Sheets
   */
  useEffect(() => {
    const loadData = async () => {
      console.log('📂 FeedContext: Starting initial data load...');
      try {
        setIsLoading(true);
        setError(null); // Clear any previous errors on mount
        
        console.log('📂 Initializing feedDB...');
        await feedDB.init();
        console.log('✅ FeedDB initialized');
        
        // Load preferences
        console.log('📂 Loading preferences...');
        const prefs = await feedDB.getPreferences();
        console.log('✅ Loaded preferences');
        setPreferences(prefs);
        
        // Load items from local IndexedDB first (fast)
        console.log('📂 Loading items from DB...');
        const loadedItems = await feedDB.getItems(10, 0);
        console.log('✅ Loaded items from DB:', loadedItems.length);
        setAllItems(loadedItems);
        
        // Sync with Google Sheets in background (if enabled)
        const token = localStorage.getItem('google_access_token');
        const autoSync = localStorage.getItem('auto_sync_enabled') === 'true';
        
        if (token && autoSync) {
          console.log('🔄 Syncing with Google Sheets in background...');
          feedSyncService.fullSync()
            .then(async (result) => {
              if (result.success) {
                console.log('✅ Background sync complete:', result.action, result.itemCount, 'items');
                
                // Reload items if sync downloaded or merged new items
                if (result.action === 'downloaded' || result.action === 'merged') {
                  const syncedItems = await feedDB.getItems(100, 0);
                  setAllItems(syncedItems);
                  console.log('✅ Reloaded items after sync:', syncedItems.length);
                }
              }
            })
            .catch((error) => {
              console.error('❌ Background sync failed:', error);
              // Don't show error to user - feed still works from local DB
            });
        }
        
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
   * @param userInterests - Optional user interests to use instead of preferences (for immediate generation after user input)
   */
  const generateMore = useCallback(async (userInterests?: string[]) => {
    console.log('🎯 generateMore called', userInterests ? `with user interests: ${userInterests}` : '');
    
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

      // Extract all tags from snippets (excluding admin: and blocked tags)
      const allTags = new Set<string>();
      filteredSnippets.forEach(snippet => {
        if (snippet.tags) {
          snippet.tags.forEach(tag => {
            // Exclude admin tags and blocked tags
            if (!tag.startsWith('admin:') && !preferencesRef.current.dislikedTopics.includes(tag)) {
              allTags.add(tag);
            }
          });
        }
      });
      const snippetTags = Array.from(allTags);
      console.log('🏷️ Extracted tags from snippets:', snippetTags);

      // Priority order for search terms:
      // 1. User-provided interests (from prompt) - highest priority
      // 2. Snippet tags - second priority
      // 3. Saved preferences - fallback
      console.log('🎯 SEARCH TERM PRIORITY CHECK:');
      console.log('   1️⃣ userInterests parameter:', userInterests);
      console.log('   2️⃣ snippetTags:', snippetTags);
      console.log('   3️⃣ saved preferences:', preferencesRef.current.searchTerms);
      
      let searchTermsForGeneration: string[];
      if (userInterests && userInterests.length > 0) {
        searchTermsForGeneration = userInterests;
        console.log('✨ DECISION: Using user-provided interests from prompt:', searchTermsForGeneration);
      } else if (snippetTags.length > 0) {
        searchTermsForGeneration = snippetTags;
        console.log('🏷️ DECISION: Using snippet tags as search terms:', searchTermsForGeneration);
      } else {
        searchTermsForGeneration = preferencesRef.current.searchTerms;
        console.log('💾 DECISION: Using saved preferences as search terms:', searchTermsForGeneration);
      }
      console.log('🔍 FINAL search terms for generation:', searchTermsForGeneration);

      // Track generated items as they arrive
      const generatedItems: FeedItem[] = [];

      // Get maturity level from preferences
      const maturityLevel = preferencesRef.current.maturityLevel || 'adult';
      console.log('🎓 Using maturity level:', maturityLevel);

      // Generate new items via backend - use ref to avoid dependency
      // Use snippet tags instead of preferences.searchTerms
      const preferencesWithTags = {
        ...preferencesRef.current,
        searchTerms: searchTermsForGeneration
      };
      console.log('🔍 Calling generateFeedItems with preferences:', preferencesWithTags);
      const newItems = await generateFeedItems(
        token,
        swagContent,
        preferencesWithTags,
        10,
        maturityLevel,
        // Progress callback - update UI as items arrive
        (event) => {
          console.log('📨 Feed event:', event.type, event);
          
          // Context preparation event
          if (event.type === 'context_prepared') {
            console.log('📦 Context:', {
              swagItems: event.swagCount,
              searchTerms: event.searchTermsCount,
              likedTopics: event.likedTopicsCount,
              dislikedTopics: event.dislikedTopicsCount
            });
            setGenerationStatus(`Using ${event.swagCount} saved items and ${event.searchTermsCount} search terms`);
          }
          
          // Search starting event
          else if (event.type === 'search_starting') {
            console.log('🔍 Starting search for:', event.terms);
            if (event.message) setGenerationStatus(event.message);
          }
          
          // Individual search term event
          else if (event.type === 'search_term') {
            console.log('🔎 Searching:', event.term);
          }
          
          // Search term complete event
          else if (event.type === 'search_term_complete') {
            console.log(`✅ Found ${event.resultsCount} results for "${event.term}"`);
            if (event.results && event.results.length > 0) {
              console.log('   Top results:', event.results);
            }
          }
          
          // Search term error event
          else if (event.type === 'search_term_error') {
            console.warn('⚠️ Search error:', event.term, event.error);
          }
          
          // Search complete event
          else if (event.type === 'search_complete') {
            console.log('🔍 Search complete:', {
              totalResults: event.resultsCount,
              terms: event.terms
            });
            if (event.topResults && event.topResults.length > 0) {
              console.log('   Top 5 results:');
              event.topResults.forEach((result, idx) => {
                console.log(`   ${idx + 1}. ${result.title}`);
                console.log(`      ${result.url}`);
                if (result.snippet) {
                  console.log(`      ${result.snippet}...`);
                }
              });
            }
            setGenerationStatus(`Found ${event.resultsCount} results, generating content...`);
          }
          
          // Item generated event
          else if (event.type === 'item_generated' && event.item) {
            console.log('✨ New item generated:', event.item.title);
            // Auto-tag with current project
            const currentProjectId = getCurrentProjectId();
            const itemWithProject = {
              ...event.item,
              projectId: currentProjectId || undefined
            };
            generatedItems.push(itemWithProject);
            
            // Save item to IndexedDB immediately (fire-and-forget, non-blocking)
            feedDB.saveItems([itemWithProject])
              .then(() => {
                console.log('💾 Saved item to DB:', itemWithProject.id, itemWithProject.title);
              })
              .catch(dbError => {
                console.error('❌ Failed to save item to DB:', itemWithProject.id, dbError);
              });
            
            // Update status with item count
            setGenerationStatus(`Generated ${generatedItems.length} items...`);
            
            // ⚡ CRITICAL: Immediately update UI with new item (one at a time for streaming effect)
            // Force synchronous update using functional state setter with unique key
            setAllItems(prev => {
              // Check if item already exists (prevent duplicates)
              const exists = prev.some(existing => existing.id === itemWithProject.id);
              if (exists) {
                console.log('⚠️  Item already exists in state:', itemWithProject.id);
                return prev;
              }
              
              // Append new item to END of list (appears at bottom)
              const updated = [...prev, itemWithProject];
              
              // Prune oldest items if exceeding 30 items (keep newest 30)
              const pruned = updated.length > 30 ? updated.slice(-30) : updated;
              
              console.log('📊 Items in state after adding:', pruned.length, 'items (latest:', itemWithProject.title.substring(0, 50), '...)');
              return pruned;
            });
          }
          
          // Item updated event (e.g., when images load)
          else if (event.type === 'item_updated' && event.item) {
            console.log('🖼️ Item updated:', event.item?.title, 'field:', event.field);
            
            // Update the existing item in state with new data (e.g., image)
            setAllItems(prev => {
              return prev.map(existing => {
                if (event.item && existing.id === event.item.id) {
                  console.log('✨ Updating item with new data:', existing.id, event.field);
                  const updatedItem = { ...existing, ...event.item };
                  
                  // Save updated item to IndexedDB so images persist on reload
                  feedDB.saveItems([updatedItem]).catch(err => {
                    console.error('❌ Failed to save updated item to DB:', err);
                  });
                  
                  return updatedItem;
                }
                return existing;
              });
            });
          }
          
          // Status event
          else if (event.type === 'status' && event.message) {
            console.log('📊 Status:', event.message);
            // Filter out model failure messages - don't show to users
            const isModelFailure = event.message.toLowerCase().includes('unavailable') || 
                                  event.message.toLowerCase().includes('trying alternative');
            if (!isModelFailure) {
              setGenerationStatus(event.message); // Update UI with status message
            }
          }
          
          // Complete event
          else if (event.type === 'complete' && event.cost !== undefined) {
            console.log('💰 Total cost:', event.cost);
            if (event.cost !== undefined) {
              setGenerationStatus(`Complete! Cost: $${event.cost.toFixed(6)}`);
            }
          }
          
          // Error event
          else if (event.type === 'error') {
            console.error('❌ Generation error:', event.error);
            setError(event.error || 'Generation failed');
            setGenerationStatus('Generation failed');
          }
        }
      );
      
      console.log('✅ Generated items:', newItems.length);
      console.log('✅ Items via events:', generatedItems.length);
      console.log('📄 Items preview:', newItems.map(i => ({ id: i.title })));

      // Images are now included in the SSE stream from backend (base64 embedded)
      // No need for batch image fetching - items already have images from generation
      // Items were already saved to DB and added to UI via event callback above
      console.log('✅ Feed generation complete with embedded images from backend');

      // Note: Items already added to UI AND saved to DB via event callback
      // Just need to update lastGenerated timestamp
      
      // Update lastGenerated timestamp
      await feedDB.updatePreferences({
        lastGenerated: new Date().toISOString()
      });
      
      // Sync feed items to Google Sheets (immediate, fire-and-forget)
      const isSyncEnabled = () => {
        const token = localStorage.getItem('google_access_token');
        const autoSync = localStorage.getItem('auto_sync_enabled') === 'true';
        return token && token.length > 0 && autoSync;
      };
      
      if (isSyncEnabled()) {
        (async () => {
          try {
            console.log('🔄 Syncing feed items to Google Sheets...');
            const result = await feedSyncService.fullSync();
            if (result.success) {
              console.log('✅ Feed items synced to Google Sheets:', result.action, result.itemCount, 'items');
              
              // Reload items from DB after sync (may have new items from remote)
              const syncedItems = await feedDB.getItems(100, 0);
              setAllItems(syncedItems);
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
      setAllItems(prev => 
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
        
        // Show success toast
        showSuccess(`✅ Saved "${item.title}" to Swag!`);
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
      setAllItems(prev => prev.filter(item => item.id !== itemId));

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
      
      setAllItems(prev => 
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
        setGeneratingQuizForItem(itemId); // Mark THIS specific item as generating
        
        const item = items.find(i => i.id === itemId);
        if (!item) {
          throw new Error('Item not found');
        }

        quiz = await generateFeedQuiz(token, item);
        
        // Save to feedDB cache
        await feedDB.saveQuiz(quiz);
        
        // Also save to quizDB so it appears in Quiz page
        const currentProjectId = getCurrentProjectId();
        const quizStatistic = {
          id: `feed-quiz-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          quizTitle: quiz.title,
          snippetIds: [itemId], // Use feed item ID
          score: 0,
          totalQuestions: quiz.questions.length,
          percentage: 0,
          timeTaken: 0,
          completedAt: new Date().toISOString(),
          answers: [],
          enrichment: false,
          synced: false,
          completed: false, // Mark as not completed yet
          quizData: quiz, // Store the full quiz for restarting
          projectId: currentProjectId || undefined
        };
        await quizDB.saveQuizStatistic(quizStatistic);
        
        // Sync quiz to Google Sheets if enabled
        const spreadsheetId = localStorage.getItem('rag_spreadsheet_id');
        const googleLinked = localStorage.getItem('rag_google_linked') === 'true';
        if (spreadsheetId && googleLinked) {
          try {
            const { syncQuizzesToSheets, isGoogleIdentityAvailable } = await import('../services/googleSheetsClient');
            if (isGoogleIdentityAvailable()) {
              console.log('📤 Syncing quiz to Google Sheets (client-side)...');
              await syncQuizzesToSheets(spreadsheetId, [quizStatistic]);
            }
          } catch (syncError) {
            console.error('❌ Failed to sync quiz to Sheets:', syncError);
            // Non-blocking - quiz is still saved locally
          }
        }
        
        // Notify Quiz page to refresh
        window.dispatchEvent(new Event('quiz-saved'));
        
        showSuccess('✅ Quiz ready!');
      } else {
        // Quiz already exists - just show it
        console.log('📚 Loading existing quiz from cache');
      }

      setCurrentQuiz(quiz);
    } catch (err) {
      console.error('Failed to start quiz:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to load quiz';
      setError(errorMsg);
      showError(`❌ ${errorMsg}`);
    } finally {
      setIsLoading(false);
      setGeneratingQuizForItem(null); // Clear generating state
    }
  }, [getToken, items, showWarning, showSuccess, showError, getCurrentProjectId]);

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
    console.log('🔄 Refresh triggered - clearing all items and generating fresh feed');
    try {
      setIsLoading(true);
      
      // Clear all existing items from DB
      await feedDB.clearAll();
      
      // Clear items in state
      setAllItems([]);
      
      // Generate fresh items
      await generateMore();
      
      console.log('✅ Feed refreshed successfully');
    } catch (err) {
      console.error('Failed to refresh feed:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setIsLoading(false);
    }
  }, [generateMore]);

  const value: FeedContextValue = {
    items,
    preferences,
    currentQuiz,
    isLoading,
    isGenerating,
    generatingQuizForItem,
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
