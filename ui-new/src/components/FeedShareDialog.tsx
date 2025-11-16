/**
 * FeedShareDialog Component
 * 
 * Provides sharing options for feed items with two modes:
 * 1. URL Mode - Compressed URL with all content (for short feeds)
 * 2. Google Docs Mode - Share via public Google Docs (for longer content)
 */

import { useState, useEffect } from 'react';
import { X, Share2 } from 'lucide-react';
import { compressToEncodedURIComponent } from 'lz-string';
import { 
  createPublicShareDocument, 
  removePublicSharing
} from '../utils/googleDocs';
import { 
  getSharedDocument, 
  saveSharedDocument, 
  removeSharedDocument,
  type SharedDocument 
} from '../utils/sharedDocuments';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastManager';
import type { FeedItem } from '../types/feed';

interface FeedShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: FeedItem;
}

export default function FeedShareDialog({ isOpen, onClose, item }: FeedShareDialogProps) {
  const { getToken } = useAuth();
  const { showSuccess, showError } = useToast();
  const [shareMode, setShareMode] = useState<'url' | 'gdocs'>('url');
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [googleDocsUrl, setGoogleDocsUrl] = useState<string>('');
  const [googleDocsViewUrl, setGoogleDocsViewUrl] = useState<string>('');
  const [existingShare, setExistingShare] = useState<SharedDocument | null>(null);
  const [hasGoogleToken, setHasGoogleToken] = useState(false);

  // Check for Google token availability
  useEffect(() => {
    const checkToken = async () => {
      const token = await getToken();
      setHasGoogleToken(!!token);
    };
    checkToken();
  }, [getToken]);

  // Check for existing Google Docs share
  useEffect(() => {
    if (!isOpen) return;
    
    const checkExistingShare = () => {
      const existing = getSharedDocument('feed', item.id);
      setExistingShare(existing || null);
      
      if (existing) {
        // Use current origin for dev (localhost:8081), production URL otherwise
        const baseUrl = window.location.hostname === 'localhost' 
          ? window.location.origin 
          : 'https://ai.syntithenai.com';
        
        // Set the preview URL (our site)
        setGoogleDocsUrl(`${baseUrl}/#/feed/shared?docId=${existing.documentId}`);
        // Set the Google Drive view URL (HTML files)
        setGoogleDocsViewUrl(`https://drive.google.com/file/d/${existing.documentId}/view`);
      }
    };
    
    checkExistingShare();
  }, [isOpen, item.id]);

  if (!isOpen) return null;

  /**
   * Generate compressed URL share
   */
  const generateShareUrl = () => {
    const baseUrl = import.meta.env.VITE_PUBLIC_URL || 'https://ai.syntithenai.com';
    
    // Truncate helper functions
    const truncateExpandedContent = (content: string | undefined) => {
      if (!content) return undefined;
      const maxLength = 150;
      if (content.length <= maxLength) return content;
      return content.slice(0, maxLength) + '...';
    };
    
    const truncateSources = (sources: any) => {
      if (!sources || !Array.isArray(sources)) return [];
      return sources.slice(0, 3).map(s => ({
        url: typeof s === 'string' ? s : s.url,
        title: typeof s === 'string' ? s : (s.title?.slice(0, 60) || s.url)
      }));
    };
    
    const shareData = {
      type: 'feed_item',
      title: item.title,
      content: item.content?.slice(0, 200),
      topics: item.topics?.slice(0, 5),
      image: item.image,
      sources: truncateSources(item.sources),
      expandedContent: truncateExpandedContent(item.expandedContent),
    };
    
    const jsonString = JSON.stringify(shareData);
    const compressed = compressToEncodedURIComponent(jsonString);
    return `${baseUrl}/feed/share/${compressed}`;
  };

  /**
   * Create Google Docs share
   */
  const handleCreateGoogleDocsShare = async () => {
    const accessToken = await getToken();
    if (!accessToken) {
      showError('Please connect Google Drive in Settings to use Google Docs sharing');
      return;
    }
    
    setIsCreatingShare(true);
    try {
      // Process images in content/expandedContent before creating Google Doc
      const { imageStorage } = await import('../utils/imageStorage');
      
      const contentWithImages = item.content 
        ? await imageStorage.processContentForDisplay(item.content)
        : item.content;
      
      const expandedContentWithImages = item.expandedContent
        ? await imageStorage.processContentForDisplay(item.expandedContent)
        : item.expandedContent;
      
      const imageWithBase64 = item.image
        ? await imageStorage.processContentForDisplay(item.image)
        : item.image;
      
      // Prepare feed data for Google Docs with embedded images
      const feedData = {
        title: item.title,
        description: expandedContentWithImages || contentWithImages,
        topics: item.topics,
        imageUrl: imageWithBase64,
        sources: item.sources
      };
      
      const { documentId, webViewLink } = await createPublicShareDocument(
        item.title,
        feedData,
        'feed',
        accessToken
      );
      
      // Use current origin for dev (localhost:8081), production URL otherwise
      const baseUrl = window.location.hostname === 'localhost' 
        ? window.location.origin 
        : 'https://ai.syntithenai.com';
      
      // Generate preview URL for sharing (our site)
      const previewUrl = `${baseUrl}/#/feed/shared?docId=${documentId}`;
      
      // Generate Google Drive view URL for "Open Document" button (HTML files)
      const docsViewUrl = `https://drive.google.com/file/d/${documentId}/view`;
      
      setGoogleDocsUrl(previewUrl);
      setGoogleDocsViewUrl(docsViewUrl);
      
      // Save shared document tracking
      saveSharedDocument('feed', item.id, documentId, webViewLink);
      setExistingShare({ 
        documentId, 
        webViewLink: previewUrl, 
        sharedAt: new Date().toISOString(), 
        contentType: 'feed' 
      });
      
      showSuccess('Feed item shared via Google Docs!');
    } catch (error) {
      console.error('Failed to create Google Docs share:', error);
      showError('Failed to create Google Docs share. Please try again.');
    } finally {
      setIsCreatingShare(false);
    }
  };

  /**
   * Stop sharing Google Docs document
   */
  const handleStopSharing = async () => {
    if (!existingShare) return;
    
    const accessToken = await getToken();
    if (!accessToken) {
      showError('Google Drive connection required');
      return;
    }
    
    setIsCreatingShare(true);
    try {
      await removePublicSharing(existingShare.documentId, accessToken);
      
      // Remove from tracking
      removeSharedDocument('feed', item.id);
      
      // Clear state
      setGoogleDocsUrl('');
      setGoogleDocsViewUrl('');
      setExistingShare(null);
      
      showSuccess('Stopped sharing document');
    } catch (error) {
      console.error('Failed to stop sharing:', error);
      showError('Failed to stop sharing. Please try again.');
    } finally {
      setIsCreatingShare(false);
    }
  };

  /**
   * Social media share handlers
   */
  const handleFacebookShare = () => {
    const shareUrl = shareMode === 'gdocs' && googleDocsUrl ? googleDocsUrl : generateShareUrl();
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  };

  const handleBlueskyShare = () => {
    const shareUrl = shareMode === 'gdocs' && googleDocsUrl ? googleDocsUrl : generateShareUrl();
    const text = encodeURIComponent(`Check out this interesting article: ${item.title}\n\n${shareUrl}`);
    window.open(`https://bsky.app/intent/compose?text=${text}`, '_blank');
  };

  const handleTwitterShare = () => {
    const shareUrl = shareMode === 'gdocs' && googleDocsUrl ? googleDocsUrl : generateShareUrl();
    const text = encodeURIComponent(`Check out this interesting article: ${item.title}`);
    const url = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

  const handleRedditShare = () => {
    const shareUrl = shareMode === 'gdocs' && googleDocsUrl ? googleDocsUrl : generateShareUrl();
    const url = encodeURIComponent(shareUrl);
    const title = encodeURIComponent(item.title);
    window.open(`https://reddit.com/submit?url=${url}&title=${title}`, '_blank');
  };

  const handleQuoraShare = () => {
    const shareUrl = shareMode === 'gdocs' && googleDocsUrl ? googleDocsUrl : generateShareUrl();
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.quora.com/share?url=${url}`, '_blank');
  };

  const handleLinkedInShare = () => {
    const shareUrl = shareMode === 'gdocs' && googleDocsUrl ? googleDocsUrl : generateShareUrl();
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
  };

  const handleEmailShare = () => {
    const shareUrl = shareMode === 'gdocs' && googleDocsUrl ? googleDocsUrl : generateShareUrl();
    const subject = encodeURIComponent(`Check out: ${item.title}`);
    const body = encodeURIComponent(`I thought you might find this interesting:\n\n${item.title}\n\n${shareUrl}`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
  };

  const handleCopyLink = async () => {
    try {
      const shareUrl = shareMode === 'gdocs' && googleDocsUrl ? googleDocsUrl : generateShareUrl();
      await navigator.clipboard.writeText(shareUrl);
      showSuccess('Link copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy link:', error);
      showError('Failed to copy link');
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Share Feed Item</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{item.title}</p>

          {/* Share Mode Selector */}
          {hasGoogleToken && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Share Method:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setShareMode('url')}
                  className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                    shareMode === 'url'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500'
                  }`}
                >
                  URL (Quick)
                </button>
                <button
                  onClick={() => setShareMode('gdocs')}
                  className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                    shareMode === 'gdocs'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500'
                  }`}
                >
                  Google Docs
                </button>
              </div>
            </div>
          )}

          {/* Google Docs Mode */}
          {shareMode === 'gdocs' && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                {existingShare 
                  ? '✅ This feed item is already shared via Google Docs'
                  : 'Create a public Google Docs document with full content'}
              </p>
              
              {!existingShare ? (
                <button
                  onClick={handleCreateGoogleDocsShare}
                  disabled={isCreatingShare || !hasGoogleToken}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isCreatingShare ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Google Docs Share'
                  )}
                </button>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={() => window.open(googleDocsViewUrl, '_blank')}
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in Google Docs
                  </button>
                  
                  {/* Social Share Buttons for Google Docs - only show after link is generated */}
                  {googleDocsViewUrl && (
                  <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Share On
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
                      <button
                        onClick={handleTwitterShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1DA1F2] text-white rounded-md hover:bg-[#1a8cd8] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        X
                      </button>
                      
                      <button
                        onClick={handleRedditShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#FF4500] text-white rounded-md hover:bg-[#e03d00] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                        </svg>
                        Reddit
                      </button>
                      
                      <button
                        onClick={handleFacebookShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1877F2] text-white rounded-md hover:bg-[#166fe5] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                        Facebook
                      </button>
                      
                      <button
                        onClick={handleBlueskyShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0085ff] text-white rounded-md hover:bg-[#0073e6] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/>
                        </svg>
                        Bluesky
                      </button>
                      
                      <button
                        onClick={handleLinkedInShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0A66C2] text-white rounded-md hover:bg-[#094d92] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                        </svg>
                        LinkedIn
                      </button>
                      
                      <button
                        onClick={handleEmailShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Email
                      </button>
                    </div>
                  </div>
                  )}
                  
                  <button
                    onClick={handleStopSharing}
                    disabled={isCreatingShare}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Stop Sharing
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Share Buttons */}
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
  );
}
