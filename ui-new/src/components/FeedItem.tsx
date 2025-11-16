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
import FeedShareDialog from './FeedShareDialog';
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
  Save,
  MessageSquare,
  Share2
} from 'lucide-react';

interface FeedItemCardProps {
  item: FeedItem;
}

export default function FeedItemCard({ item }: FeedItemCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { stashItem, markViewed, startQuiz, generatingQuizForItem, generateMore } = useFeed();
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
      }
      // Left swipe removed - block button removed
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
      // Check if image is a data URI (base64) or HTTP URL
      const isDataUri = item.image.startsWith('data:');
      const isHttpUrl = item.image.startsWith('http://') || item.image.startsWith('https://');
      const imageSize = item.image.length;
      
      console.log(`📸 Stashing item with image:`, {
        isDataUri,
        isHttpUrl,
        imageSize,
        imageSource: item.imageSource,
        imageProvider: item.imageProvider,
        imageUrl: isDataUri ? `data:... (${(imageSize / 1024).toFixed(1)} KB)` : item.image
      });
      
      // Convert all images to base64 and save to IndexedDB
      let imageRef = item.image;
      if (isDataUri) {
        // Data URI - save directly to IndexedDB
        try {
          const { imageStorage } = await import('../utils/imageStorage');
          imageRef = await imageStorage.saveImage(item.image);
          console.log(`✅ Saved data URI image to IndexedDB: ${imageRef} (${(imageSize / 1024).toFixed(1)} KB)`);
        } catch (error) {
          console.error('❌ Failed to save image to IndexedDB, using data URI:', error);
          // Fall back to data URI if save fails
        }
      } else if (isHttpUrl) {
        // HTTP URL - fetch, convert to base64, then save to IndexedDB
        try {
          console.log(`🌐 Fetching HTTP image from: ${item.image}`);
          const response = await fetch(item.image);
          const blob = await response.blob();
          
          // Convert blob to base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          console.log(`✅ Converted HTTP image to base64 (${(base64.length / 1024).toFixed(1)} KB)`);
          
          // Save to IndexedDB
          const { imageStorage } = await import('../utils/imageStorage');
          imageRef = await imageStorage.saveImage(base64);
          console.log(`✅ Saved HTTP image to IndexedDB: ${imageRef}`);
        } catch (error) {
          console.error('❌ Failed to fetch/convert HTTP image, using original URL:', error);
          // Fall back to original URL if conversion fails
        }
      }
      
      content += `![${item.title}](${imageRef})\n\n`;
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

    // Create system message with feed item context
    const systemMessage = `You are a helpful AI assistant. The user is asking questions about the following article:

Title: ${item.title}

Content:
${item.expandedContent}

${item.topics.length > 0 ? `Topics: ${item.topics.join(', ')}` : ''}

Please use this article as context to answer the user's questions. You can provide additional information beyond what's in the article, but reference the article content when relevant.`;

    // Navigate to chat with query and system message in state
    navigate('/chat', { 
      state: { 
        initialQuery: query,
        systemMessage: systemMessage,
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
   * Handle tag click - regenerate feed with this tag as search term
   */
  const handleTagClick = async (e: React.MouseEvent, topic: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🏷️ Tag clicked, regenerating feed with topic:', topic);
    
    // Scroll to top of page
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Show toast notification
    showSuccess(`🔍 Generating feed items about "${topic}"`);
    
    // Close dialog if open
    setShowDialog(false);
    
    // Generate feed with this topic
    await generateMore([topic]);
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
        <h3 
          onClick={() => setShowDialog(true)}
          className="text-lg font-bold text-gray-900 mb-2 cursor-pointer hover:text-blue-600 transition-colors"
        >
          {item.title}
        </h3>

        {/* Image */}
        {item.image && (
          <div className="mb-3 rounded-lg overflow-hidden">
            <img 
              src={item.image} 
              alt={item.title}
              onClick={() => setShowDialog(true)}
              className="w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
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
                  <button
                    onClick={(e) => handleTagClick(e, topic)}
                    className="text-gray-700 hover:text-blue-600 hover:underline cursor-pointer bg-transparent border-0 p-0"
                    title={`Generate feed items about "${topic}"`}
                  >
                    {topic}
                  </button>
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
        <div className="border-t border-gray-200 pt-3 grid grid-cols-4 gap-2">
          <button
            onClick={handleStash}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors"
            title="Save to Swag"
          >
            <Save className="h-6 w-6" />
            <span className="text-xs font-medium">Save</span>
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
            className="bg-white rounded-lg shadow-xl w-[90%] max-h-[90vh] overflow-y-auto"
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
                      <button
                        onClick={(e) => handleTagClick(e, item.topics.join(' '))}
                        className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer bg-transparent border-0 p-0"
                        title={`Generate feed items about "${item.topics.join(', ')}"`}
                      >
                        {item.topics.join(', ')}
                      </button>
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
                        <button
                          onClick={(e) => handleTagClick(e, topic)}
                          className="text-gray-700 hover:text-blue-600 hover:underline cursor-pointer bg-transparent border-0 p-0"
                          title={`Generate feed items about "${topic}"`}
                        >
                          {topic}
                        </button>
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
                className="flex-1 px-4 py-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="h-5 w-5" />
                Save
              </button>

              <button
                onClick={async () => {
                  await handleQuiz();
                  setShowDialog(false);
                }}
                disabled={isGeneratingQuiz}
                className="flex-1 px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  await handleChat();
                  setShowDialog(false);
                }}
                className="flex-1 px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <MessageSquare className="h-5 w-5" />
                Chat
              </button>

              <button
                onClick={() => {
                  handleShare();
                  setShowDialog(false);
                }}
                className="flex-1 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Share2 className="h-5 w-5" />
                Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Dialog */}
      <FeedShareDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        item={item}
      />
    </div>
  );
}
