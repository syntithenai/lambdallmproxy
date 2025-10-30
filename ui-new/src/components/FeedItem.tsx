/**
 * Feed Item Card - Individual Feed Item with Swipe Gestures
 */

import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeed } from '../contexts/FeedContext';
import { useSwag } from '../contexts/SwagContext';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import type { FeedItem } from '../types/feed';
import { feedDB } from '../db/feedDb';
import { 
  Bookmark, 
  Trash2, 
  Brain, 
  ExternalLink,
  Tag,
  Calendar,
  X,
  Search,
  Hand
} from 'lucide-react';

interface FeedItemCardProps {
  item: FeedItem;
}

export default function FeedItemCard({ item }: FeedItemCardProps) {
  const { t } = useTranslation();
  const { stashItem, trashItem, markViewed, startQuiz, isGeneratingQuiz } = useFeed();
  const { addSnippet } = useSwag();
  
  const cardRef = useRef<HTMLDivElement>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const viewStartTime = useRef<number>(Date.now());

  const { swipeState, attachListeners, detachListeners } = useSwipeGesture({
    threshold: 100,
    onSwipeEnd: (direction) => {
      if (direction === 'right') {
        handleStash();
      } else if (direction === 'left') {
        handleTrash();
      }
    }
  });

  // Attach swipe listeners
  useEffect(() => {
    if (cardRef.current) {
      attachListeners(cardRef.current);
    }

    return () => {
      detachListeners();
    };
  }, [attachListeners, detachListeners]);

  // Mark as viewed when card is visible
  useEffect(() => {
    if (!item.viewed) {
      const timeout = setTimeout(() => {
        markViewed(item.id);
        
        // Track view interaction
        trackInteraction('view');
      }, 1000); // Mark as viewed after 1 second

      return () => clearTimeout(timeout);
    }
  }, [item.id, item.viewed, markViewed]);

  /**
   * Track user interaction with feed item
   */
  const trackInteraction = async (action: 'stash' | 'trash' | 'view' | 'quiz' | 'skip') => {
    const timeSpent = Date.now() - viewStartTime.current;
    
    // Convert FeedItemType to interaction type
    const itemType = item.type === 'did-you-know' ? 'didYouKnow' : 'questionAnswer';
    
    await feedDB.saveInteraction({
      feedItemId: item.id,
      action,
      timeSpent,
      itemType,
      topics: item.topics || [],
      source: item.sources?.[0] || 'unknown',
      content: item.content || ''
      // Quiz engagement fields not available on FeedItem yet
      // Will be added when quiz is generated/completed
    });
  };

  /**
   * Handle grab action (save to Swag)
   */
  const handleStash = async () => {
    // Track interaction
    await trackInteraction('stash');

    // Build content with image if available
    let content = `**${item.title}**\n\n`;
    
    // Include image with attribution if available
    if (item.image) {
      content += `![${item.title}](${item.image})\n\n`;
      if (item.imageAttribution) {
        content += `*Image: ${item.imageAttribution}*\n\n`;
      }
    }
    
    content += `${item.content}\n\n`;
    content += `**Topics:** ${item.topics.join(', ')}`;
    
    // Add sources if available
    if (item.sources && item.sources.length > 0) {
      content += `\n\n**Sources:**\n`;
      item.sources.forEach((source, idx) => {
        content += `${idx + 1}. ${source}\n`;
      });
    }

    await addSnippet(content, 'tool', item.title);

    // Mark as stashed
    await stashItem(item.id);
  };

  /**
   * Handle trash action
   */
  const handleTrash = async () => {
    // Track interaction
    await trackInteraction('trash');

    await trashItem(item.id);
  };

  /**
   * Handle quiz action
   */
  const handleQuiz = async () => {
    // Track interaction (will be updated with quiz results later)
    await trackInteraction('quiz');

    await startQuiz(item.id);
  };

  /**
   * Calculate swipe transform
   */
  const getSwipeTransform = () => {
    if (!swipeState.isSwiping) return '';

    const { progress, direction } = swipeState;
    const distance = progress * 100; // Max 100px
    const translateX = direction === 'right' ? distance : -distance;

    return `translateX(${translateX}px)`;
  };

  /**
   * Get swipe background color
   */
  const getSwipeBackgroundColor = () => {
    if (!swipeState.isSwiping) return 'transparent';

    const { progress, direction } = swipeState;
    const opacity = Math.min(progress * 0.3, 0.3);

    if (direction === 'right') {
      return `rgba(34, 197, 94, ${opacity})`; // Green for stash
    } else {
      return `rgba(239, 68, 68, ${opacity})`; // Red for trash
    }
  };

  return (
    <div
      ref={cardRef}
      className="bg-white rounded-lg shadow-sm overflow-hidden transition-all hover:shadow-md cursor-pointer relative"
      style={{
        transform: getSwipeTransform(),
        backgroundColor: getSwipeBackgroundColor(),
        transition: swipeState.isSwiping ? 'none' : 'all 0.2s ease',
        display: 'block', // Ensure visibility
        visibility: 'visible', // Ensure visibility
        minHeight: '100px' // Ensure card takes up space
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Swipe indicators */}
      {swipeState.isSwiping && (
        <>
          {swipeState.direction === 'right' && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-green-600 flex items-center gap-2">
              <Bookmark className="h-6 w-6" />
              <span className="font-semibold">{t('feed.stash')}</span>
            </div>
          )}
          {swipeState.direction === 'left' && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-red-600 flex items-center gap-2">
              <span className="font-semibold">{t('feed.trash')}</span>
              <Trash2 className="h-6 w-6" />
            </div>
          )}
        </>
      )}

      {/* Card content */}
      <div className="p-4">
        {/* Type badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-1 text-xs font-semibold rounded ${
            item.type === 'did-you-know' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-purple-100 text-purple-700'
          }`}>
            {item.type === 'did-you-know' ? t('feed.didYouKnow') : t('feed.questionAnswer')}
          </span>
          
          {item.stashed && (
            <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-700">
              {t('feed.stashed')}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {item.title}
        </h3>

        {/* Image */}
        {item.image && (
          <div className="mb-3 rounded-lg overflow-hidden">
            <img 
              src={item.image} 
              alt={item.title}
              className="w-full h-48 object-cover"
            />
            {item.imageAttribution && (
              <div 
                className="text-xs text-gray-500 mt-1 bg-gray-50 p-2 rounded"
                dangerouslySetInnerHTML={{ __html: item.imageAttributionHtml || item.imageAttribution }}
              />
            )}
          </div>
        )}

        {/* Content - Click to expand */}
        <div 
          onClick={() => setShowDialog(true)}
          className="cursor-pointer"
        >
          <p className="text-gray-700 mb-3 line-clamp-3">
            {item.content}
          </p>

          {/* Mnemonic - Always visible */}
          {item.mnemonic && (
            <div className="bg-purple-50 border-l-4 border-purple-400 p-3 mb-3 rounded">
              <p className="text-sm font-medium text-purple-900">
                💡 {item.mnemonic}
              </p>
            </div>
          )}

          {/* Click hint */}
          {item.expandedContent && (
            <p className="text-xs text-blue-600 hover:text-blue-700 font-medium mb-3">
              Click to read more...
            </p>
          )}
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-3">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>
              {(() => {
                try {
                  const date = new Date(item.createdAt);
                  return isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString();
                } catch {
                  return 'Recently';
                }
              })()}
            </span>
          </div>
          
          {item.topics.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Tag className="h-4 w-4" />
              <span className="text-gray-700">
                {item.topics.slice(0, 3).join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Sources */}
        {item.sources.length > 0 && (
          <div className="border-t border-gray-200 pt-3 mb-3">
            <p className="text-xs text-gray-500 mb-1 font-semibold">{t('feed.sources')}:</p>
            <div className="space-y-1">
              {item.sources.slice(0, 2).map((source, idx) => (
                <a
                  key={idx}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate">{source}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Search Terms - Clickable Google Search Links */}
        {item.searchTerms && item.searchTerms.length > 0 && (
          <div className="border-t border-gray-200 pt-3 mb-3">
            <p className="text-xs text-gray-500 font-semibold inline">Search: </p>
            {item.searchTerms.map((term, idx) => (
              <span key={idx}>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(term)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  title={`Search Google for "${term}"`}
                >
                  {term}
                </a>
                {idx < (item.searchTerms?.length || 0) - 1 && <span className="text-xs text-gray-500">, </span>}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className={`flex gap-2 transition-opacity ${
          showActions || swipeState.isSwiping ? 'opacity-100' : 'opacity-0 md:opacity-100'
        }`}>
          <button
            onClick={handleStash}
            disabled={item.stashed}
            className="flex-1 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm flex items-center justify-center gap-2"
          >
            <Hand className="h-4 w-4" />
            {item.stashed ? t('feed.stashed') : t('feed.stash')}
          </button>

          <button
            onClick={handleQuiz}
            className="flex-1 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors font-medium text-sm flex items-center justify-center gap-2"
          >
            <Brain className="h-4 w-4" />
            {t('feed.quiz')}
          </button>

          <button
            onClick={handleTrash}
            className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm flex items-center justify-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Full-Screen Detail Dialog */}
      {showDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowDialog(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-start">
              <div className="flex-1 pr-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded ${
                  item.type === 'did-you-know' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {item.type === 'did-you-know' ? t('feed.didYouKnow') : t('feed.questionAnswer')}
                </span>
                <h2 className="text-2xl font-bold text-gray-900 mt-2">
                  {item.title}
                </h2>
              </div>
              <button
                onClick={() => setShowDialog(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="h-6 w-6 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Image */}
              {item.image && (
                <div className="mb-4 rounded-lg overflow-hidden">
                  <img 
                    src={item.image} 
                    alt={item.title}
                    className="w-full h-64 object-cover"
                  />
                  {item.imageAttribution && (
                    <div 
                      className="text-xs text-gray-500 mt-2 bg-gray-50 p-2 rounded"
                      dangerouslySetInnerHTML={{ __html: item.imageAttributionHtml || item.imageAttribution }}
                    />
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Summary</h3>
                <p className="text-gray-700 leading-relaxed">
                  {item.content}
                </p>
              </div>

              {/* Mnemonic with Google Search Link */}
              {item.mnemonic && (
                <div className="bg-purple-50 border-l-4 border-purple-400 p-4 mb-4 rounded">
                  <p className="text-sm font-medium text-purple-900 mb-2">
                    💡 {item.mnemonic}
                  </p>
                  {item.topics.length > 0 && (
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(item.topics.join(' '))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      <Search className="h-3 w-3" />
                      Search more about this
                    </a>
                  )}
                </div>
              )}

              {/* Expanded Content */}
              {item.expandedContent && (
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900 mb-3">📖 Deep Dive</h3>
                  <div className="text-gray-700 leading-relaxed space-y-3 whitespace-pre-line">
                    {item.expandedContent}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {(() => {
                      try {
                        const date = new Date(item.createdAt);
                        return isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString();
                      } catch {
                        return 'Recently';
                      }
                    })()}
                  </span>
                </div>
                
                {item.topics.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Tag className="h-4 w-4" />
                    <span>{item.topics.slice(0, 3).join(', ')}</span>
                  </div>
                )}
              </div>

              {/* Sources */}
              {item.sources.length > 0 && (
                <div className="border-t border-gray-200 pt-4 mb-4">
                  <p className="text-sm text-gray-700 mb-2 font-semibold">{t('feed.sources')}:</p>
                  <div className="space-y-2">
                    {item.sources.map((source, idx) => (
                      <a
                        key={idx}
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span className="truncate">{source}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Terms */}
              {item.searchTerms && item.searchTerms.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm text-gray-700 font-semibold inline">Search: </p>
                  {item.searchTerms.map((term, idx) => (
                    <span key={idx}>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(term)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                        title={`Search Google for "${term}"`}
                      >
                        {term}
                      </a>
                      {idx < (item.searchTerms?.length || 0) - 1 && <span className="text-sm text-gray-500">, </span>}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 flex gap-3">
              <button
                onClick={async () => {
                  await handleStash();
                  setShowDialog(false);
                }}
                className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                  item.stashed
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Bookmark className="h-5 w-5" />
                {item.stashed ? t('feed.stashed') : t('feed.stash')}
              </button>

              <button
                onClick={async () => {
                  await handleQuiz();
                  setShowDialog(false);
                }}
                disabled={isGeneratingQuiz}
                className={`flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm flex items-center justify-center gap-2 ${
                  isGeneratingQuiz ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isGeneratingQuiz ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('quiz.generating')}
                  </>
                ) : (
                  <>
                    <Brain className="h-5 w-5" />
                    {t('feed.quiz')}
                  </>
                )}
              </button>

              <button
                onClick={async () => {
                  await handleTrash();
                  setShowDialog(false);
                }}
                className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm flex items-center justify-center gap-2"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
