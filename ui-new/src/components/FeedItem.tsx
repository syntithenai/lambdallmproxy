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
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface FeedItemCardProps {
  item: FeedItem;
}

export default function FeedItemCard({ item }: FeedItemCardProps) {
  const { t } = useTranslation();
  const { stashItem, trashItem, markViewed, startQuiz } = useFeed();
  const { addSnippet } = useSwag();
  
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
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
   * Handle stash action
   */
  const handleStash = async () => {
    // Track interaction
    await trackInteraction('stash');

    // Add to Swag
    const content = `**${item.title}**\n\n${item.content}\n\nTopics: ${item.topics.join(', ')}`;
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
        transition: swipeState.isSwiping ? 'none' : 'all 0.2s ease'
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
            {item.type === 'did-you-know' ? t('feed.didYouKnow') : t('feed.qAndA')}
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

        {/* Content */}
        <p className={`text-gray-700 mb-3 ${!isExpanded ? 'line-clamp-3' : ''}`}>
          {item.content}
        </p>

        {/* Expand/Collapse */}
        {item.content.length > 200 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mb-3"
          >
            {isExpanded ? (
              <>{t('feed.showLess')} <ChevronUp className="h-4 w-4" /></>
            ) : (
              <>{t('feed.showMore')} <ChevronDown className="h-4 w-4" /></>
            )}
          </button>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-3">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
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

        {/* Action buttons */}
        <div className={`flex gap-2 transition-opacity ${
          showActions || swipeState.isSwiping ? 'opacity-100' : 'opacity-0 md:opacity-100'
        }`}>
          <button
            onClick={handleStash}
            disabled={item.stashed}
            className="flex-1 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm flex items-center justify-center gap-2"
          >
            <Bookmark className="h-4 w-4" />
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
    </div>
  );
}
