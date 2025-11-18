/**
 * Feed Page - Main Feed Feature Component
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeed } from '../contexts/FeedContext';
import { useAuth } from '../contexts/AuthContext';
import { useSwag } from '../contexts/SwagContext';
import FeedItemCard from './FeedItem';
import FeedQuizOverlay from './FeedQuiz';
import { Loader2, AlertCircle, RefreshCw, Rss, Search, X, ArrowUp } from 'lucide-react';
import { feedDB } from '../db/feedDb';

export default function FeedPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { snippets = [] } = useSwag() || { snippets: [] }; // Add fallback for safety
  const [interestsInput, setInterestsInput] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [maturityLevel, setMaturityLevel] = useState<'child' | 'youth' | 'adult' | 'academic'>('adult');
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // Track selected tags
  const {
    items,
    currentQuiz,
    isLoading,
    isGenerating,
    generationStatus,
    error,
    generateMore,
    refresh,
    closeQuiz,
    clearAllItems,
    stopGeneration,
    lastSearchCriteria
  } = useFeed();

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  
  // Refs for infinite scroll to avoid stale closures
  const isGeneratingRef = useRef(isGenerating);
  const isLoadingRef = useRef(isLoading);
  const generateMoreRef = useRef(generateMore);
  const lastSearchCriteriaRef = useRef(lastSearchCriteria);
  
  // Keep refs in sync with latest values
  useEffect(() => {
    console.log('🔄 FeedPage: isGenerating changed:', isGenerating);
    console.log('🔄 FeedPage: generationStatus:', generationStatus);
    isGeneratingRef.current = isGenerating;
    isLoadingRef.current = isLoading;
    generateMoreRef.current = generateMore;
    lastSearchCriteriaRef.current = lastSearchCriteria;
  }, [isGenerating, isLoading, generateMore, generationStatus, lastSearchCriteria]);

  /**
   * Calculate top 10 tags from snippets
   */
  const top10Tags = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    
    snippets.forEach(snippet => {
      snippet.tags?.forEach(tag => {
        if (!tag.startsWith('admin:')) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      });
    });
    
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [snippets]);

  /**
   * Handle interests search - combine user input with selected tags and regenerate
   */
  const handleSearchInterests = useCallback(async () => {
    const trimmed = interestsInput.trim();
    
    // Combine user interests input with selected tags
    const searchCriteria = [...selectedTags];
    if (trimmed) {
      searchCriteria.push(trimmed);
    }
    
    if (searchCriteria.length === 0) return;
    
    console.log('🔍 Searching with criteria:', searchCriteria);
    await clearAllItems();
    await generateMore(searchCriteria);
    setInterestsInput(''); // Clear input after search
  }, [interestsInput, selectedTags, clearAllItems, generateMore]);

  /**
   * Handle tag click - toggle selection instead of immediate search
   */
  const handleTagClick = useCallback((tag: string) => {
    setSelectedTags(prev => {
      const isSelected = prev.includes(tag);
      if (isSelected) {
        console.log('🏷️ Deselecting tag:', tag);
        return prev.filter(t => t !== tag);
      } else {
        console.log('🏷️ Selecting tag:', tag);
        return [...prev, tag];
      }
    });
  }, []);

  /**
   * Select all tags
   */
  const handleSelectAllTags = useCallback(() => {
    console.log('🏷️ Selecting all tags');
    setSelectedTags(top10Tags);
  }, [top10Tags]);

  /**
   * Deselect all tags
   */
  const handleSelectNoneTags = useCallback(() => {
    console.log('🏷️ Deselecting all tags');
    setSelectedTags([]);
  }, []);

  /**
   * Debug: Log items whenever they change
   */
  useEffect(() => {
    console.log('🎯 FeedPage: items changed:', items.length, 'items');
    console.log('🎯 Item titles:', items.map(i => i.title));
    console.log('🎯 Item IDs:', items.map(i => i.id));
  }, [items]);

  /**
   * Load maturity level on mount
   */
  useEffect(() => {
    const loadMaturityLevel = async () => {
      const level = await feedDB.getMaturityLevel();
      setMaturityLevel(level);
    };
    loadMaturityLevel();
  }, []);

  /**
   * Handle feed generation request from SwagPage (via localStorage)
   */
  useEffect(() => {
    const handleFeedRequest = async () => {
      const feedRequest = localStorage.getItem('feed_generation_request');
      if (!feedRequest) return;
      
      try {
        const { searchTerms, clearExisting, fromSnippet } = JSON.parse(feedRequest);
        console.log('🎯 Feed generation request from snippet:', { searchTerms, clearExisting, fromSnippet });
        
        // Clear existing items if requested
        if (clearExisting) {
          await clearAllItems();
        }
        
        // Generate feed items with search terms
        if (searchTerms && searchTerms.length > 0) {
          await generateMore(searchTerms);
        }
        
        // Clean up the request
        localStorage.removeItem('feed_generation_request');
      } catch (error) {
        console.error('❌ Failed to process feed generation request:', error);
        localStorage.removeItem('feed_generation_request');
      }
    };
    
    handleFeedRequest();
  }, []); // Run once on mount

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
        
        // ⚡ Read current value from ref to avoid stale closure
        const currentLastSearchCriteria = lastSearchCriteriaRef.current;
        
        console.log('👁️ IntersectionObserver fired:', {
          isIntersecting: entry.isIntersecting,
          itemsLength: items.length,
          lastSearchCriteria: currentLastSearchCriteria
        });
        
        // Allow infinite scroll if:
        // 1. We have existing items (they were generated with search criteria), OR
        // 2. We have active search criteria (from user input or tag click)
        const hasActiveSearchCriteria = currentLastSearchCriteria && currentLastSearchCriteria.length > 0;
        const hasExistingItems = items.length > 0;
        const shouldAllowInfiniteScroll = hasExistingItems || hasActiveSearchCriteria;
        
        // ⚡ Use refs to avoid stale closure - always read current state
        const currentIsLoading = isLoadingRef.current;
        const currentIsGenerating = isGeneratingRef.current;
        const currentGenerateMore = generateMoreRef.current;
        
        console.log('🔍 Infinite scroll check:', {
          isIntersecting: entry.isIntersecting,
          currentIsLoading,
          currentIsGenerating,
          shouldAllowInfiniteScroll,
          hasActiveSearchCriteria,
          hasExistingItems,
          itemsLength: items.length
        });
        
        // Load more when sentinel is visible and not already loading
        if (entry.isIntersecting && !currentIsLoading && !currentIsGenerating && shouldAllowInfiniteScroll) {
          console.log('📜 Infinite scroll triggered - generating more items...');
          console.log('📜 Reason: hasExistingItems=' + hasExistingItems + ', hasActiveSearchCriteria=' + hasActiveSearchCriteria);
          currentGenerateMore();
        } else if (entry.isIntersecting && !shouldAllowInfiniteScroll) {
          console.log('📜 Infinite scroll blocked: no items and no active search criteria (need user interests input or clicked tag)');
          console.log('📜 Debug: itemsLength=' + items.length + ', lastSearchCriteria=' + (currentLastSearchCriteria ? currentLastSearchCriteria.join(', ') : 'null'));
        } else if (entry.isIntersecting && (currentIsLoading || currentIsGenerating)) {
          console.log('📜 Infinite scroll blocked: already generating/loading');
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
   * Scroll to top button visibility
   */
  useEffect(() => {
    const handleScroll = () => {
      // Show button when scrolled down more than 300px
      setShowScrollTop(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /**
   * Scroll to top handler
   */
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /**
   * Handle manual refresh - reuses last search criteria
   */
  const handleRefresh = useCallback(async () => {
    // refresh() already clears all items and calls generateMore()
    // which will use lastSearchCriteriaRef.current (same as infinite scroll)
    await refresh();
  }, [refresh]);

  // Debug: Log render state
  console.log('🎨 FeedPage render:', {
    isAuthenticated,
    isLoading,
    isGenerating,
    itemsCount: items.length,
    hasError: !!error
  });

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
        {/* Generation progress banner - shows at very top */}
        {isGenerating && (
          <div className="bg-blue-50 border-b border-blue-200 px-2 sm:px-4 py-2">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                <span className="text-sm text-blue-800 font-medium">
                  {generationStatus || 'Generating feed items...'}
                </span>
              </div>
              <button
                onClick={(e) => {
                  console.log('🔴 Stop button clicked!', e);
                  stopGeneration();
                }}
                className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center gap-1.5 text-sm font-medium shadow-md hover:shadow-lg"
                title="Stop feed generation"
              >
                <X className="h-4 w-4" />
                Stop
              </button>
            </div>
          </div>
        )}
        
        <div className="max-w-2xl mx-auto px-2 sm:px-4 py-4">
          {/* Title and refresh button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Rss className="h-6 w-6 text-blue-500" />
              <h1 className="text-2xl font-bold text-gray-900">{t('feed.title')}</h1>
            </div>
            
            <div className="flex items-center gap-2">
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
          </div>

          {/* Always-visible Manual Feed Controls */}
          <div className="space-y-4">
            {/* Content Maturity Level */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                🎓 Content Maturity Level
              </label>
              <select
                value={maturityLevel}
                onChange={async (e) => {
                  const level = e.target.value as 'child' | 'youth' | 'adult' | 'academic';
                  setMaturityLevel(level);
                  await feedDB.setMaturityLevel(level);
                  window.dispatchEvent(new Event('feed-maturity-changed'));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="child">Child (Ages 6-12) - Simple language, educational content</option>
                <option value="youth">Youth (Ages 13-17) - Age-appropriate topics, moderate complexity</option>
                <option value="adult">Adult (18+) - General audience, varied complexity</option>
                <option value="academic">Academic - Advanced topics, research-focused, technical</option>
              </select>
            </div>

            {/* Interests Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                What are your interests?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={interestsInput}
                  onChange={(e) => setInterestsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (interestsInput.trim() || selectedTags.length > 0) && !isGenerating) {
                      handleSearchInterests();
                    }
                  }}
                  placeholder="e.g., artificial intelligence, space exploration, history..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isGenerating}
                />
                <button
                  onClick={handleSearchInterests}
                  disabled={(!interestsInput.trim() && selectedTags.length === 0) || isGenerating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </div>
            </div>

            {/* Top 10 Tag Buttons */}
            {top10Tags.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Select tags to include in search:
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSelectAllTags}
                      className="text-xs px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={handleSelectNoneTags}
                      className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                    >
                      Select None
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {top10Tags.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => handleTagClick(tag)}
                        disabled={isGenerating}
                        className={`px-3 py-1.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium ${
                          isSelected
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                {selectedTags.length > 0 && (
                  <p className="text-xs text-blue-600">
                    {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            )}

            {top10Tags.length === 0 && (
              <p className="text-xs text-gray-500">
                Add some interests above or save content with tags in Swag to see tag suggestions here.
              </p>
            )}
          </div>
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

      {/* Feed items - always show */}
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
              Use the search or tag buttons above to generate your personalized feed
            </p>
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
            {isGenerating && (
              <button
                onClick={(e) => {
                  console.log('🔴 Bottom stop button clicked!', e);
                  stopGeneration();
                }}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center gap-2 text-sm font-medium shadow-md hover:shadow-lg"
                title="Stop feed generation"
              >
                <X className="h-4 w-4" />
                Stop Generation
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scroll indicator for first-time users */}
      {items.length > 2 && (
        <div className="text-center py-4 text-gray-500 text-sm">
          ↓ Scroll down to see more items ({items.length} total) ↓
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 transition-all duration-300 hover:scale-110 z-50"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-6 w-6" />
        </button>
      )}

      {/* Quiz overlay */}
      {currentQuiz && (
        <FeedQuizOverlay quiz={currentQuiz} onClose={closeQuiz} />
      )}
    </div>
  );
}
