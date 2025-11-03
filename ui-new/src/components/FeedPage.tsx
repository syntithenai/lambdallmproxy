/**
 * Feed Page - Main Feed Feature Component
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeed } from '../contexts/FeedContext';
import { useAuth } from '../contexts/AuthContext';
import { useSwag } from '../contexts/SwagContext';
import { useProject } from '../contexts/ProjectContext';
import FeedItemCard from './FeedItem';
import FeedQuizOverlay from './FeedQuiz';
import TagSelector from './TagSelector';
import { Loader2, AlertCircle, RefreshCw, Rss } from 'lucide-react';

export default function FeedPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { getAllTags, snippets } = useSwag();
  const { getCurrentProjectId } = useProject();
  const [interestsInput, setInterestsInput] = useState('');
  const {
    items,
    preferences,
    currentQuiz,
    isLoading,
    isGenerating,
    generationStatus,
    error,
    selectedTags,
    generateMore,
    refresh,
    closeQuiz,
    updateSelectedTags,
    updateSearchTerms
  } = useFeed();

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  /**
   * Debug: Log items whenever they change
   */
  useEffect(() => {
    console.log('🎯 FeedPage: items changed:', items.length, 'items');
    console.log('🎯 Item titles:', items.map(i => i.title));
    console.log('🎯 Item IDs:', items.map(i => i.id));
  }, [items]);

  /**
   * Infinite scroll - load more when sentinel becomes visible
   */
  useEffect(() => {
    if (!sentinelRef.current || !isAuthenticated) return;

    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        
        // Only trigger if we have items OR have tags on snippets
        // This prevents infinite scroll from auto-generating when user has no content
        const hasSnippetTags = snippets.some(s => 
          s.tags && s.tags.some(tag => !tag.startsWith('admin:'))
        );
        const shouldAllowInfiniteScroll = items.length > 0 || hasSnippetTags;
        
        // Load more when sentinel is visible and not already loading
        if (entry.isIntersecting && !isLoading && !isGenerating && shouldAllowInfiniteScroll) {
          console.log('📜 Infinite scroll triggered');
          generateMore();
        } else if (entry.isIntersecting && !shouldAllowInfiniteScroll) {
          console.log('📜 Infinite scroll blocked: no items and no snippet tags');
        }
      },
      {
        root: null,
        rootMargin: '200px', // Start loading 200px before reaching bottom
        threshold: 0.1
      }
    );

    observerRef.current.observe(sentinelRef.current);

    // Cleanup
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
  // Note: generateMore, isLoading, isGenerating intentionally omitted to prevent re-creating observer

  /**
   * Initial load - generate items if feed is empty AND user has tags on snippets OR has submitted interests
   * Use ref to track if initial load has been attempted
   */
  const initialLoadAttempted = useRef(false);
  
  useEffect(() => {
    // Don't do anything if still loading initial data
    if (isLoading) {
      console.log('🎬 Initial load effect: still loading, skipping...');
      return;
    }
    
    // Don't do anything if already attempted
    if (initialLoadAttempted.current) {
      return;
    }
    
    const currentProjectId = getCurrentProjectId();
    
    console.log('🎬 Initial load effect triggered:', {
      isAuthenticated,
      itemsLength: items.length,
      initialLoadAttempted: initialLoadAttempted.current,
      isLoading,
      isGenerating,
      snippetsCount: snippets.length,
      currentProjectId: currentProjectId || 'All Projects'
    });
    
    // Check if user has tags on their snippets (excluding admin: tags)
    const snippetsWithTags = snippets.filter(s => 
      s.tags && s.tags.some(tag => !tag.startsWith('admin:'))
    );
    const hasSnippetTags = snippetsWithTags.length > 0;
    
    console.log('🏷️ Total snippets:', snippets.length);
    console.log('🏷️ Snippets with non-admin tags:', snippetsWithTags.length);
    if (snippetsWithTags.length > 0 && snippetsWithTags.length <= 5) {
      console.log('🏷️ Sample snippets with tags:', snippetsWithTags.slice(0, 5).map(s => ({
        id: s.id,
        title: s.title,
        tags: s.tags?.filter(t => !t.startsWith('admin:')),
        projectId: s.projectId || 'none'
      })));
    }
    console.log('🏷️ Has snippet tags:', hasSnippetTags);
    
    // Auto-generation logic:
    // ONLY auto-generate if user has tags on their VISIBLE snippets (filtered by current project)
    // If no tags, show interests input and wait for manual generation
    const shouldAutoGenerate = hasSnippetTags;
    
    if (isAuthenticated && items.length === 0 && shouldAutoGenerate) {
      console.log('🎬 Initial load: starting feed generation (user has snippet tags in current project)');
      initialLoadAttempted.current = true;
      generateMore();
    } else {
      console.log('⏸️ Initial load: skipping auto-generation', {
        isAuthenticated,
        hasItems: items.length > 0,
        hasSnippetTags,
        snippetCount: snippets.length,
        reason: !hasSnippetTags ? 'No snippet tags in current project - show interests input' : 'Already has items or not authenticated'
      });
      initialLoadAttempted.current = true; // Mark as attempted so we don't retry
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, items.length, isLoading, snippets, preferences.searchTerms.length]);
  // Note: Added items.length, isLoading, snippets, and preferences.searchTerms.length so we wait for DB load and check both tags and interests

  /**
   * Handle manual refresh
   */
  const handleRefresh = useCallback(async () => {
    await refresh();
    await generateMore();
  }, [refresh, generateMore]);
  
  /**
   * Handle generate button click
   */
  const handleGenerateClick = useCallback(async () => {
    console.log('📱 Generate Feed button clicked');
    console.log('🔍 generateMore function exists:', !!generateMore);
    console.log('🔍 generateMore type:', typeof generateMore);
    try {
      console.log('🚀 About to call generateMore()...');
      await generateMore();
      console.log('✅ generateMore() completed');
    } catch (err) {
      console.error('❌ Generate failed:', err);
    }
  }, [generateMore]);

  // Debug: Log render state
  console.log('🎨 FeedPage render:', {
    isAuthenticated,
    isLoading,
    isGenerating,
    itemsCount: items.length,
    hasError: !!error
  });

  // Check if any snippets have tags (excluding admin: tags)
  const hasSnippetTags = snippets.some(s => 
    s.tags && s.tags.some(tag => !tag.startsWith('admin:'))
  );
  
  // Show interests input only when:
  // 1. No snippet tags exist
  // 2. AND no feed items have been generated yet
  // 3. AND not currently generating (hide form as soon as generation starts)
  const showInterestsInput = !hasSnippetTags && items.length === 0 && !isGenerating;

  // Show authentication message
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <Rss className="mx-auto h-12 w-12 text-blue-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {t('feed.title')}
          </h2>
          <p className="text-gray-600 mb-4">
            {t('feed.emptyMessage')}
          </p>
          <p className="text-sm text-gray-500">
            {t('common.pleaseSignIn')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="bg-gray-50 pb-20"
      style={{ minHeight: '100vh' }}
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-2 sm:px-4 py-4">
          {/* Title and refresh button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Rss className="h-6 w-6 text-blue-500" />
              <h1 className="text-2xl font-bold text-gray-900">{t('feed.title')}</h1>
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={isLoading || isGenerating}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={t('feed.refresh')}
            >
              <RefreshCw 
                className={`h-5 w-5 text-gray-600 ${isLoading || isGenerating ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          {(() => {
            // Show tag filter only when interests input is NOT shown
            const showTagFilter = !showInterestsInput;

            return (
              <>
                {/* Tag filter - hidden when interests input is shown */}
                {showTagFilter && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                      Filter by Swag Tags
                    </label>
                    <TagSelector
                      availableTags={getAllTags()}
                      selectedTags={selectedTags}
                      onChange={updateSelectedTags}
                      placeholder="All tags (no filter)"
                    />
                    {selectedTags.length > 0 && (
                      <p className="text-xs text-gray-500">
                        Feed will use only Swag content tagged with: <span className="font-medium">{selectedTags.join(', ')}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Interests input - shown only when no snippet tags exist AND no feed items */}
                {showInterestsInput && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      What are your interests?
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={interestsInput}
                        onChange={(e) => setInterestsInput(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && interestsInput.trim() && !isGenerating) {
                            const userInterests = [interestsInput.trim()];
                            // Update search terms with user input (save for future use)
                            await updateSearchTerms(userInterests);
                            setInterestsInput('');
                            // Trigger generation with user interests immediately (don't wait for state update)
                            await generateMore(userInterests);
                          }
                        }}
                        placeholder="e.g., artificial intelligence, space exploration, history..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        onClick={async () => {
                          if (interestsInput.trim() && !isGenerating) {
                            const userInterests = [interestsInput.trim()];
                            // Update search terms with user input (save for future use)
                            await updateSearchTerms(userInterests);
                            setInterestsInput('');
                            // Trigger generation with user interests immediately (don't wait for state update)
                            await generateMore(userInterests);
                          }
                        }}
                        disabled={!interestsInput.trim() || isGenerating}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Generate
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Add some interests to start generating your personalized feed. You can also add Swag content with tags to automatically generate based on your saved knowledge.
                    </p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="max-w-2xl mx-auto px-2 sm:px-4 py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900 mb-1">
                {t('errors.error')}
              </h3>
              <p className="text-sm text-red-700">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feed items - hide when showing interests input (unless actively generating) */}
      {(!showInterestsInput || isGenerating) && (
        <div className="max-w-2xl mx-auto px-2 sm:px-4 py-4 space-y-4">
          {items.map((item, index) => {
            console.log(`🎴 Rendering FeedItemCard ${index + 1}/${items.length}:`, item.id, item.title);
            return <FeedItemCard key={item.id} item={item} />;
          })}

          {/* Empty state */}
          {items.length === 0 && !isLoading && !isGenerating && (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Rss className="mx-auto h-16 w-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t('feed.noItems')}
              </h3>
              <p className="text-gray-600 mb-6">
                {t('feed.emptyMessage')}
                <br />
                {t('feed.emptySubMessage')}
              </p>
              <button
                onClick={handleGenerateClick}
                disabled={isGenerating}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isGenerating ? t('feed.generating') : t('feed.generateFeed')}
              </button>
            </div>
          )}

          {/* Loading indicator with live status */}
          {(isLoading || isGenerating) && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <div className="text-center">
                <p className="text-gray-900 font-medium">
                  {isGenerating ? t('feed.generating') : t('common.loading')}
                </p>
                {generationStatus && (
                  <p className="text-sm text-gray-600 mt-1 animate-pulse">
                    {generationStatus}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

        {/* Scroll indicator for first-time users */}
        {items.length > 2 && (
          <div className="text-center py-4 text-gray-500 text-sm">
            ↓ Scroll down to see more items ({items.length} total) ↓
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />

      {/* Quiz overlay */}
      {currentQuiz && (
        <FeedQuizOverlay quiz={currentQuiz} onClose={closeQuiz} />
      )}
    </div>
  );
}
