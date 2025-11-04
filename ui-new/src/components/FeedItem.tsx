/**
 * Feed Item Card - Individual Feed Item with Swipe Gestures
 */

import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useFeed } from '../contexts/FeedContext';
import { useSwag } from '../contexts/SwagContext';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { useToast } from './ToastManager';
import { ReadButton } from './ReadButton';
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
  Hand,
  MessageSquare,
  ThumbsDown,
  Share2
} from 'lucide-react';

interface FeedItemCardProps {
  item: FeedItem;
}

export default function FeedItemCard({ item }: FeedItemCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { stashItem, trashItem, markViewed, startQuiz, generatingQuizForItem } = useFeed();
  const { addSnippet } = useSwag();
  const { showSuccess } = useToast();
  
  // Check if THIS specific item is generating a quiz
  const isGeneratingQuiz = generatingQuizForItem === item.id;
  
  const cardRef = useRef<HTMLDivElement>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [_showActions, _setShowActions] = useState(false); // Prefixed to suppress unused warning
  const viewStartTime = useRef<number>(Date.now());
  
  // Helper to use the show actions state (suppresses TS warning)
  const setShowActions = _setShowActions;

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

  // Attach swipe listeners only on mobile devices
  useEffect(() => {
    // Check if device is mobile (touch-capable with small screen)
    const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
    
    if (cardRef.current && isMobile) {
      attachListeners(cardRef.current);
    }

    return () => {
      if (isMobile) {
        detachListeners();
      }
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
    
    // Include short summary
    content += `${item.content}\n\n`;
    
    // Include expanded content (long description) if available
    if (item.expandedContent && item.expandedContent !== item.content) {
      content += `---\n\n`;
      content += `**Detailed Information:**\n\n${item.expandedContent}\n\n`;
    }
    
    // Add mnemonic if available
    if (item.mnemonic) {
      content += `---\n\n`;
      content += `**Memory Aid:** ${item.mnemonic}\n\n`;
    }
    
    content += `**Topics:** ${item.topics.join(', ')}`;
    
    // Add sources if available
    if (item.sources && item.sources.length > 0) {
      content += `\n\n**Sources:**\n`;
      item.sources.forEach((source, idx) => {
        content += `${idx + 1}. ${source}\n`;
      });
    }

    // Pass feed item topics as tags to the snippet + admin:feed tag to identify source
    const tagsWithFeedMarker = [...(item.topics || []), 'admin:feed'];
    await addSnippet(content, 'tool', item.title, tagsWithFeedMarker);

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
   * Handle "Chat" button click
   */
  const handleChat = async () => {
    // Track interaction
    await trackInteraction('skip'); // Using 'skip' as general engagement

    // Generate a chat query that expands on the article
    const query = `Can you explain more about ${item.title}? ${item.topics.length > 0 ? `I'm particularly interested in ${item.topics.slice(0, 2).join(' and ')}.` : ''} Please provide detailed information and examples.`;

    // Navigate to chat with query in state
    navigate('/chat', { 
      state: { 
        initialQuery: query,
        autoSubmit: true,
        clearChat: true // Clear existing chat before starting new conversation
      } 
    });
  };

  /**
   * Handle "Share" button click
   */
  const handleShare = () => {
    setShowShareDialog(true);
  };

  /**
   * Generate share URL for this feed item
   */
  const generateShareUrl = () => {
    let baseUrl = window.location.origin;
    
    // Use production domain for social sharing unless on localhost
    if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
      baseUrl = 'https://ai.syntithenai.com';
    }
    
    // Create a shareable URL with feed item data encoded
    const shareData = {
      type: 'feed_item',
      title: item.title,
      content: item.content,
      topics: item.topics,
      image: item.image,
      sources: item.sources,
      expandedContent: item.expandedContent, // Include deep dive content
      mnemonic: item.mnemonic // Include memory aid
    };
    const encoded = btoa(JSON.stringify(shareData));
    return `${baseUrl}/feed/share/${encoded}`;
  };

  /**
   * Share to Facebook
   */
  const handleFacebookShare = () => {
    const shareUrl = generateShareUrl();
    const url = encodeURIComponent(shareUrl);
    // Facebook requires the full URL with protocol
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  };

  /**
   * Share to Bluesky
   */
  const handleBlueskyShare = () => {
    const shareUrl = generateShareUrl();
    // Bluesky expects text with URL embedded - don't double encode the URL
    const text = encodeURIComponent(`Check out this interesting article: ${item.title}\n\n${shareUrl}`);
    window.open(`https://bsky.app/intent/compose?text=${text}`, '_blank');
  };

  /**
   * Share to Twitter
   */
  const handleTwitterShare = () => {
    const shareUrl = generateShareUrl();
    const text = encodeURIComponent(`Check out this interesting article: ${item.title}`);
    const url = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

  /**
   * Share to Reddit
   */
  const handleRedditShare = () => {
    const shareUrl = generateShareUrl();
    const url = encodeURIComponent(shareUrl);
    const title = encodeURIComponent(item.title);
    window.open(`https://reddit.com/submit?url=${url}&title=${title}`, '_blank');
  };

  /**
   * Share to Quora
   */
  const handleQuoraShare = () => {
    const shareUrl = generateShareUrl();
    const url = encodeURIComponent(shareUrl);
    // Quora's share endpoint - may need to be a public URL to work
    window.open(`https://www.quora.com/share?url=${url}`, '_blank');
  };

  /**
   * Share via Gmail
   */
  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Check out: ${item.title}`);
    const body = encodeURIComponent(`I thought you might find this interesting:\n\n${item.title}\n\n${generateShareUrl()}`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
  };

  /**
   * Copy share link
   */
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(generateShareUrl());
      showSuccess('Link copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
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
      className="bg-white sm:rounded-lg shadow-sm overflow-hidden transition-all hover:shadow-md cursor-pointer relative"
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
          className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors"
          title="Click to read full article"
        >
          <p className="text-gray-700 mb-3 line-clamp-3">
            {typeof item.content === 'string' ? item.content : (item.content as any)?.summary || 'No content available'}
          </p>

          {/* Mnemonic - Always visible */}
          {item.mnemonic && (
            <div className="bg-purple-50 border-l-4 border-purple-400 p-3 mb-3 rounded">
              <p className="text-sm font-medium text-purple-900">
                💡 {typeof item.mnemonic === 'string' ? item.mnemonic : JSON.stringify(item.mnemonic)}
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
              {item.topics.slice(0, 3).map((topic, idx) => (
                <span key={idx}>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(topic)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-700 hover:text-blue-600 hover:underline"
                    title={`Search Google for "${topic}"`}
                  >
                    {topic}
                  </a>
                  {idx < Math.min(item.topics.length, 3) - 1 && <span className="text-gray-500">, </span>}
                </span>
              ))}
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



        {/* Large Action Buttons Row */}
        <div className="border-t border-gray-200 pt-3 grid grid-cols-5 gap-2">
          <button
            onClick={handleTrash}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors"
            title="Downvote - Hide similar content"
          >
            <ThumbsDown className="h-6 w-6" />
            <span className="text-xs font-medium">Block</span>
          </button>

          <button
            onClick={handleStash}
            disabled={item.stashed}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save to Swag"
          >
            <Hand className="h-6 w-6" />
            <span className="text-xs font-medium">{item.stashed ? 'Saved' : 'Save'}</span>
          </button>

          <button
            onClick={handleQuiz}
            disabled={isGeneratingQuiz}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Generate Quiz"
          >
            {isGeneratingQuiz ? (
              <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <Brain className="h-6 w-6" />
            )}
            <span className="text-xs font-medium">Quiz</span>
          </button>

          <button
            onClick={handleChat}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
            title="Discuss in Chat"
          >
            <MessageSquare className="h-6 w-6" />
            <span className="text-xs font-medium">Chat</span>
          </button>

          <button
            onClick={handleShare}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
            title="Share this article"
          >
            <Share2 className="h-6 w-6" />
            <span className="text-xs font-medium">Share</span>
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

              {/* Mnemonic with Searchable Tags */}
              {item.mnemonic && (
                <div className="bg-purple-50 border-l-4 border-purple-400 p-4 mb-4 rounded">
                  <p className="text-sm font-medium text-purple-900 mb-2">
                    💡 {item.mnemonic}
                  </p>
                  {item.topics.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap text-xs">
                      <span className="text-gray-600">Topics:</span>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(item.topics.join(' '))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 hover:underline"
                        title={`Search Google for "${item.topics.join(', ')}"`}
                      >
                        {item.topics.join(', ')}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Expanded Content */}
              {item.expandedContent && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">📖 Deep Dive</h3>
                    <ReadButton 
                      text={typeof item.expandedContent === 'string' ? item.expandedContent : JSON.stringify(item.expandedContent, null, 2)}
                      variant="icon"
                      shouldSummarize={false}
                    />
                  </div>
                  <div className="text-gray-700 leading-relaxed space-y-3 whitespace-pre-line">
                    {typeof item.expandedContent === 'string' ? item.expandedContent : JSON.stringify(item.expandedContent, null, 2)}
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
                  <div className="flex items-center gap-1 flex-wrap">
                    <Tag className="h-4 w-4" />
                    {item.topics.slice(0, 3).map((topic, idx) => (
                      <span key={idx}>
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(topic)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-700 hover:text-blue-600 hover:underline"
                          title={`Search Google for "${topic}"`}
                        >
                          {topic}
                        </a>
                        {idx < Math.min(item.topics.length, 3) - 1 && <span className="text-gray-500">, </span>}
                      </span>
                    ))}
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

      {/* Share Dialog */}
      {showShareDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowShareDialog(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Share Article</h3>
                <button
                  onClick={() => setShowShareDialog(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{item.title}</p>

              <div className="space-y-2">
                <button
                  onClick={handleCopyLink}
                  className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <Share2 className="h-5 w-5" />
                  Copy Link
                </button>

                <button
                  onClick={handleTwitterShare}
                  className="w-full px-4 py-3 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  X (Twitter)
                </button>

                <button
                  onClick={handleRedditShare}
                  className="w-full px-4 py-3 bg-[#FF4500] hover:bg-[#e03d00] text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                  </svg>
                  Reddit
                </button>

                <button
                  onClick={handleFacebookShare}
                  className="w-full px-4 py-3 bg-[#1877F2] hover:bg-[#166fe5] text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </button>

                <button
                  onClick={handleBlueskyShare}
                  className="w-full px-4 py-3 bg-[#0085ff] hover:bg-[#0073e6] text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/>
                  </svg>
                  Bluesky
                </button>

                <button
                  onClick={handleQuoraShare}
                  className="w-full px-4 py-3 bg-[#B92B27] hover:bg-[#a02522] text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.738 18.701c-.831-1.635-1.805-3.287-3.708-3.287-.362 0-.727.061-1.059.209l-.704-1.403c.498-.166 1.023-.25 1.561-.25 2.944 0 4.424 2.587 5.429 4.734l1.904-.003c.271-.928.406-1.895.406-2.888C16.567 8.283 14.284 6 11.754 6c-2.529 0-4.812 2.283-4.812 5.813s2.283 5.813 4.812 5.813c.367 0 .724-.043 1.076-.126.035-.009.068-.021.102-.031l.806 1.585c-.413.116-.843.177-1.284.177C8.704 19.231 6 16.529 6 12.779 6 9.03 8.704 6.328 12.454 6.328c3.75 0 6.451 2.702 6.451 6.451 0 1.488-.403 2.884-1.106 4.086l.03.062-1.599.003c.377-.641.661-1.334.842-2.054h-1.334c-.271.771-.659 1.479-1.137 2.102l-1.863.003c.377-.641.661-1.334.842-2.054z"/>
                  </svg>
                  Quora
                </button>

                <button
                  onClick={handleEmailShare}
                  className="w-full px-4 py-3 bg-[#EA4335] hover:bg-[#d33426] text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                  </svg>
                  Gmail
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
