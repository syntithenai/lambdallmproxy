/**
 * SnippetShareDialog Component
 * 
 * Modal dialog for sharing individual snippets via compressed URLs or Google Docs.
 * For large content (>80% of URL limit), offers Google Docs as alternative.
 * For very large content (>100%), Google Docs is automatically used.
 */

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FileText, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { createSnippetShareData, generateSnippetShareUrl } from '../utils/snippetShareUtils';
import { estimateCompressedSize } from '../utils/shareUtils';
import { createPublicShareDocument, requestGoogleAuth, removePublicSharing } from '../utils/googleDocs';
import { useSwag } from '../contexts/SwagContext';
import { useToast } from './ToastManager';
import { 
  getSharedDocument, 
  saveSharedDocument, 
  removeSharedDocument,
  type SharedDocument 
} from '../utils/sharedDocuments';

interface SnippetShareDialogProps {
  snippetId: string;
  content: string;
  title?: string;
  tags?: string[];
  sourceType?: 'user' | 'assistant' | 'tool';
  timestamp?: number;
  sharedGoogleDocId?: string;  // Existing Google Doc ID if previously shared
  sharedGoogleDocUrl?: string; // Existing Google Doc URL if previously shared
  onClose: () => void;
}

// Error boundary class to catch QR code render errors (some payloads are too large)
class QRRenderErrorBoundary extends React.Component<{children: React.ReactNode, fallback?: React.ReactNode}, {hasError: boolean}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    // Log to console for diagnostics
    console.error('An error occurred in the <QRCodeSVG> component.', error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">QR code cannot be generated for this content.</p>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

const SnippetShareDialog: React.FC<SnippetShareDialogProps> = ({
  snippetId,
  content,
  title,
  tags,
  sourceType,
  timestamp,
  sharedGoogleDocId,
  sharedGoogleDocUrl,
  onClose
}) => {
  const [shareUrl, setShareUrl] = useState<string>('');
  const [googleDocsUrl, setGoogleDocsUrl] = useState<string>(sharedGoogleDocUrl || '');
  const [googleDocsViewUrl, setGoogleDocsViewUrl] = useState<string>(''); // For "Open Document" button
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatingGoogleDoc, setCreatingGoogleDoc] = useState(false);
  const [sizeEstimate, setSizeEstimate] = useState<ReturnType<typeof estimateCompressedSize> | null>(null);
  const [activeMode, setActiveMode] = useState<'url' | 'google-docs'>('url');
  const [sharedDoc, setSharedDoc] = useState<SharedDocument | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const { updateSnippet } = useSwag();
  const { showSuccess, showError } = useToast();

  // Error boundary class to catch QR code render errors (some payloads are too large)
  class QRRenderErrorBoundary extends React.Component<{children: React.ReactNode, fallback?: React.ReactNode}, {hasError: boolean}> {
    constructor(props: any) {
      super(props);
      this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
      return { hasError: true };
    }
    componentDidCatch(error: any, info: any) {
      // Log to console for diagnostics
      console.error('An error occurred in the <QRCodeSVG> component.', error, info);
    }
    render() {
      if (this.state.hasError) {
        return this.props.fallback || (
          <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">QR code cannot be generated for this content.</p>
          </div>
        );
      }
      return this.props.children as React.ReactElement;
    }
  }

  // Load existing shared document on mount
  useEffect(() => {
    const existing = getSharedDocument('snippet', snippetId);
    if (existing) {
      setSharedDoc(existing);
      setGoogleDocsUrl(existing.webViewLink);
      // Generate Google Drive view URL for HTML files
      if (existing.documentId) {
        setGoogleDocsViewUrl(`https://drive.google.com/file/d/${existing.documentId}/view`);
      }
    }
  }, [snippetId]);

  useEffect(() => {
    // Generate share URL and estimate size
    const generateShareData = async () => {
      try {
        // Process images first to get the actual size with embedded base64
        const { imageStorage } = await import('../utils/imageStorage');
        const contentWithImages = await imageStorage.processContentForDisplay(content);
        
        // Create compressed share data WITH embedded images (preserves full fidelity)
        const compressed = await createSnippetShareData(snippetId, content, title, tags, sourceType, true);
        const url = generateSnippetShareUrl(compressed);
        setShareUrl(url);
        
        // Estimate size using content WITH embedded images
        const estimate = estimateCompressedSize(contentWithImages);
        setSizeEstimate(estimate);
        
        // Auto-select mode based on size
        if (estimate.shouldForceGoogleDocs) {
          setActiveMode('google-docs');
        } else if (estimate.compressedSize > 8200) {
          // Force Google Docs mode if too large for URL sharing (GitHub Pages limit)
          setActiveMode('google-docs');
        }
      } catch (error) {
        console.error('Failed to generate snippet share URL:', error);
      } finally {
        setLoading(false);
      }
    };
    
    generateShareData();
  }, [snippetId, content, title, tags, sourceType]);

  // Utility: decide if it's safe to render a QR code for the given shareUrl
  const isSafeForQRCode = (url: string | null | undefined) => {
    if (!url) return false;
    try {
      // Quick checks to avoid rendering QR codes for embedded/base64 images or very large payloads
      const lower = url.toLowerCase();
      const hasEmbeddedImage = lower.includes('data:image') || lower.includes('base64,') || lower.includes('/samples/') || lower.includes('swag-image');
      if (hasEmbeddedImage) return false;

      // Use byte size (Blob) instead of character length for a conservative estimate
      const bytes = new Blob([url]).size;
      const QR_MAX_BYTES = 1200; // conservative limit to avoid qrcode lib failures
      return bytes <= QR_MAX_BYTES;
    } catch (err) {
      // If anything goes wrong, be conservative and avoid rendering QR
      return false;
    }
  };

  // Determine QR safety once per render
  const canRenderQR = isSafeForQRCode(shareUrl);

  const handleCreateGoogleDoc = async () => {
    if (googleDocsUrl || creatingGoogleDoc) return;
    
    setCreatingGoogleDoc(true);
    try {
      // Request Google Drive access token (will show consent popup if needed)
      const accessToken = await requestGoogleAuth();
      if (!accessToken) {
        throw new Error('Please sign in to create Google Docs');
      }
      
      // Embed images before creating Google Doc
      const { imageStorage } = await import('../utils/imageStorage');
      const contentWithImages = await imageStorage.processContentForDisplay(content);
      
      const snippetData = {
        title: title || 'Untitled Snippet',
        content: contentWithImages, // Use content with embedded base64 images
        swags: tags,
        timestamp: timestamp || Date.now(),
      };
      
      const { documentId } = await createPublicShareDocument(
        title || 'Shared Snippet',
        snippetData,
        'snippet',
        accessToken
      );
      
      // Use current origin for dev (localhost:8081), production URL otherwise
      const baseUrl = window.location.hostname === 'localhost' 
        ? window.location.origin 
        : 'https://ai.syntithenai.com';
      
      // Generate preview URL for sharing (our site)
      const previewUrl = `${baseUrl}/#/snippet/shared?docId=${documentId}`;
      
      // Generate Google Drive view URL for "Open Document" button (HTML files)
      const docsViewUrl = `https://drive.google.com/file/d/${documentId}/view`;
      
      setGoogleDocsUrl(previewUrl);
      setGoogleDocsViewUrl(docsViewUrl);
      setActiveMode('google-docs');
      
      // Save shared document tracking
      saveSharedDocument('snippet', snippetId, documentId, previewUrl);
      setSharedDoc({ 
        documentId, 
        webViewLink: previewUrl, 
        sharedAt: new Date().toISOString(), 
        contentType: 'snippet' 
      });
      
      // Save the Google Doc ID to the snippet
      await updateSnippet(snippetId, {
        sharedGoogleDocId: documentId,
        sharedGoogleDocUrl: previewUrl,
      });
      
      console.log(`✅ Saved Google Doc ID to snippet: ${documentId}`);
      console.log(`📄 Preview URL: ${previewUrl}`);
      console.log(`📄 Google Docs URL: ${docsViewUrl}`);
      showSuccess('Snippet shared via Google Docs!');
    } catch (error) {
      console.error('Failed to create Google Doc:', error);
      showError('Failed to create Google Doc. Please try again.');
    } finally {
      setCreatingGoogleDoc(false);
    }
  };

  const handleStopSharing = async () => {
    if (!sharedDoc) return;
    
    setIsStopping(true);
    try {
      const accessToken = await requestGoogleAuth();
      if (!accessToken) {
        throw new Error('Please sign in to stop sharing');
      }
      
      // Remove public permissions from Google Drive file
      await removePublicSharing(sharedDoc.documentId, accessToken);
      
      // Remove from tracking system
      removeSharedDocument('snippet', snippetId);
      
      // Clear state
      setSharedDoc(null);
      setGoogleDocsUrl('');
      
      // Update snippet to clear shared doc info
      await updateSnippet(snippetId, {
        sharedGoogleDocId: undefined,
        sharedGoogleDocUrl: undefined,
      });
      
      console.log(`✅ Stopped sharing snippet: ${snippetId}`);
      showSuccess('Document sharing stopped successfully');
    } catch (error) {
      console.error('Failed to stop sharing:', error);
      showError('Failed to stop sharing. Please try again.');
    } finally {
      setIsStopping(false);
    }
  };

  const handleCopy = async () => {
    const urlToCopy = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleTwitterShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const text = title ? `Check out this snippet: ${title}` : 'Check out this snippet';
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(urlToShare)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  const handleRedditShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const redditTitle = title || 'Shared Snippet';
    const redditUrl = `https://reddit.com/submit?url=${encodeURIComponent(urlToShare)}&title=${encodeURIComponent(redditTitle)}`;
    window.open(redditUrl, '_blank');
  };

  const handleEmailShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const subject = title ? `Shared Snippet: ${title}` : 'Shared Snippet';
    const body = `Check out this snippet:\n\n${urlToShare}`;
    // Use Gmail web interface for better UX
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  };

  const handleFacebookShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const url = encodeURIComponent(urlToShare);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  };

  const handleBlueskyShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const text = encodeURIComponent(`Check out this snippet${title ? `: ${title}` : ''}\n\n${urlToShare}`);
    window.open(`https://bsky.app/intent/compose?text=${text}`, '_blank');
  };

  const handleQuoraShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const url = encodeURIComponent(urlToShare);
    window.open(`https://www.quora.com/share?url=${url}`, '_blank');
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3">Generating share link...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Share Snippet</h2>
            {sizeEstimate && sizeEstimate.compressedSize > 8200 && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                ⚠️ Too large for URL sharing.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Mode Switcher (only show if not forced to Google Docs and not too large for URL) */}
          {sizeEstimate && !sizeEstimate.shouldForceGoogleDocs && sizeEstimate.compressedSize <= 8200 && (
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <button
                onClick={() => setActiveMode('url')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  activeMode === 'url'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <LinkIcon className="w-4 h-4" />
                URL Share
              </button>
              <button
                onClick={() => setActiveMode('google-docs')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${
                  activeMode === 'google-docs'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                Google Docs
              </button>
            </div>
          )}
          {/* Snippet Preview */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              {title || 'Untitled Snippet'}
            </h3>
            {tags && tags.length > 0 && (
              <div className="flex gap-1 mb-2 flex-wrap">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
              {content}
            </p>
          </div>

          {/* URL Section (only show in URL mode or when Google Docs not available) */}
          {activeMode === 'url' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Shareable URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={handleCopy}
                    className={`px-4 py-2 rounded-md font-medium transition-colors ${
                      copied
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {copied ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </span>
                    ) : (
                      'Copy'
                    )}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  URL length: {shareUrl.length.toLocaleString()} characters
                </p>
              </div>

              {/* QR Code - render only when it's safe (not embedded images and not too large) */}
              {shareUrl && shareUrl.length > 0 && (
                canRenderQR ? (
                  <QRRenderErrorBoundary
                    fallback={(
                      <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">QR code could not be generated for this content.</p>
                      </div>
                    )}
                  >
                    <div className="flex flex-col items-center">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Scan with Mobile Device
                      </label>
                      <div className="p-4 bg-white rounded-lg border border-gray-200">
                        <QRCodeSVG value={shareUrl} size={200} level="M" />
                      </div>
                    </div>
                  </QRRenderErrorBoundary>
                ) : (
                  <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      URL is too long or contains embedded images and cannot be represented as a QR code ({shareUrl.length.toLocaleString()} characters). Use the copy button or social sharing instead.
                    </p>
                  </div>
                )
              )}
            </>
          )}

          {/* Google Docs Section */}
          {activeMode === 'google-docs' && (
            <div>
              {!googleDocsUrl ? (
                <div className="text-center p-6 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-blue-600" />
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                    Create Google Doc
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Create a publicly accessible Google Document with rich text formatting
                  </p>
                  <button
                    onClick={handleCreateGoogleDoc}
                    disabled={creatingGoogleDoc}
                    className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {creatingGoogleDoc ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Creating Document...
                      </span>
                    ) : (
                      'Create Google Doc'
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {sharedGoogleDocId ? 'Previously Shared Document' : 'Google Docs Link'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={googleDocsUrl}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={handleCopy}
                      className={`px-4 py-2 rounded-md font-medium transition-colors ${
                        copied
                          ? 'bg-green-600 text-white'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {copied ? (
                        <span className="flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied!
                        </span>
                      ) : (
                        'Copy'
                      )}
                    </button>
                  </div>
                  {sharedGoogleDocId && (
                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        ℹ️ This snippet was previously shared. The document may contain older content.
                      </p>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <a
                      href={googleDocsViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-center inline-flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in Google Docs
                    </a>
                    {sharedDoc && (
                      <button
                        onClick={handleStopSharing}
                        disabled={isStopping}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
                      >
                        {isStopping ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Stopping...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Stop Sharing
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    ✅ Document is publicly accessible (anyone with link can view)
                  </p>
                  
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
                        onClick={handleQuoraShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#B92B27] text-white rounded-md hover:bg-[#a02522] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12.738 18.701c-.831-1.635-1.805-3.287-3.708-3.287-.362 0-.727.061-1.059.209l-.704-1.403c.498-.166 1.023-.25 1.561-.25 2.944 0 4.424 2.587 5.429 4.734l1.904-.003c.271-.928.406-1.895.406-2.888C16.567 8.283 14.284 6 11.754 6c-2.529 0-4.812 2.283-4.812 5.813s2.283 5.813 4.812 5.813c.367 0 .724-.043 1.076-.126.035-.009.068-.021.102-.031l.806 1.585c-.413.116-.843.177-1.284.177C8.704 19.231 6 16.529 6 12.779 6 9.03 8.704 6.328 12.454 6.328c3.75 0 6.451 2.702 6.451 6.451 0 1.488-.403 2.884-1.106 4.086l.03.062-1.599.003c.377-.641.661-1.334.842-2.054h-1.334c-.271.771-.659 1.479-1.137 2.102l-1.863.003c.377-.641.661-1.334.842-2.054z"/>
                        </svg>
                        Quora
                      </button>
                      
                      <button
                        onClick={handleEmailShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#EA4335] text-white rounded-md hover:bg-[#d33426] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                        </svg>
                        Gmail
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Social Share Buttons (only for URL mode) */}
          {activeMode === 'url' && (
            <div>
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
                onClick={handleQuoraShare}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#B92B27] text-white rounded-md hover:bg-[#a02522] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.738 18.701c-.831-1.635-1.805-3.287-3.708-3.287-.362 0-.727.061-1.059.209l-.704-1.403c.498-.166 1.023-.25 1.561-.25 2.944 0 4.424 2.587 5.429 4.734l1.904-.003c.271-.928.406-1.895.406-2.888C16.567 8.283 14.284 6 11.754 6c-2.529 0-4.812 2.283-4.812 5.813s2.283 5.813 4.812 5.813c.367 0 .724-.043 1.076-.126.035-.009.068-.021.102-.031l.806 1.585c-.413.116-.843.177-1.284.177C8.704 19.231 6 16.529 6 12.779 6 9.03 8.704 6.328 12.454 6.328c3.75 0 6.451 2.702 6.451 6.451 0 1.488-.403 2.884-1.106 4.086l.03.062-1.599.003c.377-.641.661-1.334.842-2.054h-1.334c-.271.771-.659 1.479-1.137 2.102l-1.863.003c.377-.641.661-1.334.842-2.054z"/>
                </svg>
                Quora
              </button>
              
              <button
                onClick={handleEmailShare}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#EA4335] text-white rounded-md hover:bg-[#d33426] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                </svg>
                Gmail
              </button>
            </div>
          </div>
          )}

          {/* Info */}
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            {activeMode === 'url' ? (
              <>
                <p>💡 Anyone with this URL can view the snippet</p>
                <p>🔒 Snippet data is compressed and encoded in the URL itself (no server storage)</p>
                <p>⏱️ Links never expire and work offline once loaded</p>
                <p>🌐 No login required to view shared snippets</p>
              </>
            ) : (
              <>
                <p>📄 Document created in Research Agent/shares folder</p>
                <p>🌍 Publicly accessible - anyone with the link can view</p>
                <p>✨ Rich text formatting preserved</p>
                <p>🔗 Permanent link - won't expire</p>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SnippetShareDialog;
