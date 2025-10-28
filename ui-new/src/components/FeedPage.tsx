/**
 * Feed Page - Main Feed Feature Component
 */

import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeed } from '../contexts/FeedContext';
import { useAuth } from '../contexts/AuthContext';
import FeedItemCard from './FeedItem';
import FeedQuizOverlay from './FeedQuiz';
import { Loader2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';

export default function FeedPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const {
    items,
    currentQuiz,
    isLoading,
    isGenerating,
    error,
    generateMore,
    refresh,
    closeQuiz
  } = useFeed();

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

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
        
        // Load more when sentinel is visible and not already loading
        if (entry.isIntersecting && !isLoading && !isGenerating) {
          generateMore();
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
  }, [isAuthenticated, isLoading, isGenerating, generateMore]);

  /**
   * Initial load - generate items if feed is empty
   */
  useEffect(() => {
    if (isAuthenticated && items.length === 0 && !isLoading && !isGenerating) {
      generateMore();
    }
  }, [isAuthenticated, items.length, isLoading, isGenerating, generateMore]);

  /**
   * Handle manual refresh
   */
  const handleRefresh = useCallback(async () => {
    await refresh();
    await generateMore();
  }, [refresh, generateMore]);

  // Show authentication message
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <Sparkles className="mx-auto h-12 w-12 text-blue-500 mb-4" />
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
      className="min-h-screen bg-gray-50 pb-20"
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-500" />
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
      </div>

      {/* Error message */}
      {error && (
        <div className="max-w-2xl mx-auto px-4 py-4">
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

      {/* Feed items */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {items.map((item) => (
          <FeedItemCard key={item.id} item={item} />
        ))}

        {/* Empty state */}
        {items.length === 0 && !isLoading && !isGenerating && (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Sparkles className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t('feed.noItems')}
            </h3>
            <p className="text-gray-600 mb-6">
              {t('feed.emptyMessage')}
              <br />
              {t('feed.emptySubMessage')}
            </p>
            <button
              onClick={generateMore}
              disabled={isGenerating}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isGenerating ? t('feed.generating') : t('feed.generateFeed')}
            </button>
          </div>
        )}

        {/* Loading indicator */}
        {(isLoading || isGenerating) && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <span className="ml-3 text-gray-600">
              {isGenerating ? t('feed.generating') : t('common.loading')}
            </span>
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />
      </div>

      {/* Quiz overlay */}
      {currentQuiz && (
        <FeedQuizOverlay quiz={currentQuiz} onClose={closeQuiz} />
      )}
    </div>
  );
}
