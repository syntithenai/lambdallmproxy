/**
 * QuizShareDialog Component
 * 
 * Modal dialog for sharing quizzes via compressed URLs.
 * Shared quizzes can be taken without authentication or backend calls.
 */

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FileText, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { createQuizShareData, generateQuizShareUrl } from '../utils/quizShareUtils';
import { createPublicShareQuiz, requestGoogleAuth, removePublicSharing } from '../utils/googleDocs';
import { useToast } from './ToastManager';
import { 
  getSharedDocument, 
  saveSharedDocument, 
  removeSharedDocument,
  type SharedDocument 
} from '../utils/sharedDocuments';
import type { Quiz } from '../utils/api';

interface QuizShareDialogProps {
  quiz: Quiz;
  onClose: () => void;
  enrichment?: boolean;
  sharedBy?: string;
}

const QuizShareDialog: React.FC<QuizShareDialogProps> = ({
  quiz,
  onClose,
  enrichment,
  sharedBy
}) => {
  const [shareUrl, setShareUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeMode, setActiveMode] = useState<'url' | 'google-docs'>('url');
  const [googleDocsUrl, setGoogleDocsUrl] = useState<string>('');
  const [googleDocsViewUrl, setGoogleDocsViewUrl] = useState<string>(''); // For "Open Document" button
  const [creatingGoogleDoc, setCreatingGoogleDoc] = useState(false);
  const [sharedDoc, setSharedDoc] = useState<SharedDocument | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const { showSuccess, showError } = useToast();

  // Load existing shared document on mount
  useEffect(() => {
    const quizId = quiz.title; // Use quiz title as identifier
    const existing = getSharedDocument('quiz', quizId);
    if (existing) {
      setSharedDoc(existing);
      setGoogleDocsUrl(existing.webViewLink);
      // Generate Google Docs view URL from document ID
      if (existing.documentId) {
        setGoogleDocsViewUrl(`https://drive.google.com/file/d/${existing.documentId}/view`);
      }
    }
  }, [quiz.title]);

  useEffect(() => {
    // Generate share URL
    try {
      const compressed = createQuizShareData(quiz, { sharedBy, enrichment });
      const url = generateQuizShareUrl(compressed);
      setShareUrl(url);
    } catch (error) {
      console.error('Failed to generate quiz share URL:', error);
    } finally {
      setLoading(false);
    }
  }, [quiz, sharedBy, enrichment]);

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
    const text = `Test your knowledge: ${quiz.title}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(urlToShare)}`;
    window.open(twitterUrl, '_blank');
  };

  const handleRedditShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const redditUrl = `https://reddit.com/submit?url=${encodeURIComponent(urlToShare)}&title=${encodeURIComponent(quiz.title)}`;
    window.open(redditUrl, '_blank');
  };

  const handleFacebookShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(urlToShare)}`;
    window.open(facebookUrl, '_blank');
  };

  const handleEmailShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const subject = encodeURIComponent(`Quiz: ${quiz.title}`);
    const body = encodeURIComponent(`Test your knowledge with this quiz:\n\n${urlToShare}`);
    // Use Gmail web interface for better UX
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
  };

  const handleBlueskyShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const text = encodeURIComponent(`Test your knowledge: ${quiz.title}\n\n${urlToShare}`);
    window.open(`https://bsky.app/intent/compose?text=${text}`, '_blank');
  };

  const handleQuoraShare = () => {
    const urlToShare = activeMode === 'google-docs' ? googleDocsUrl : shareUrl;
    const url = encodeURIComponent(urlToShare);
    window.open(`https://www.quora.com/share?url=${url}`, '_blank');
  };

  const handleCreateGoogleDoc = async () => {
    if (googleDocsUrl || creatingGoogleDoc) return;
    
    setCreatingGoogleDoc(true);
    try {
      const accessToken = await requestGoogleAuth();
      if (!accessToken) {
        throw new Error('Please sign in to create Google Docs');
      }
      
      const { documentId } = await createPublicShareQuiz(
        quiz.title,
        quiz,
        accessToken
      );
      
      // Use current origin for dev (localhost:8081), production URL otherwise
      const baseUrl = window.location.hostname === 'localhost' 
        ? window.location.origin 
        : 'https://ai.syntithenai.com';
      
      // Generate preview URL for sharing (our site)
      const previewUrl = `${baseUrl}/#/quiz/shared?docId=${documentId}`;
      
      // Generate Google Drive view URL for "Open Document" button (JSON file)
      const docsViewUrl = `https://drive.google.com/file/d/${documentId}/view`;
      
      setGoogleDocsUrl(previewUrl);
      setGoogleDocsViewUrl(docsViewUrl);
      setActiveMode('google-docs');
      
      // Save shared document tracking
      const quizId = quiz.title; // Use quiz title as identifier
      saveSharedDocument('quiz', quizId, documentId, previewUrl);
      setSharedDoc({ 
        documentId, 
        webViewLink: previewUrl, 
        sharedAt: new Date().toISOString(), 
        contentType: 'quiz' 
      });
      
      console.log(`✅ Created shared quiz document: ${documentId}`);
      console.log(`📄 Preview URL: ${previewUrl}`);
      console.log(`📄 Google Drive URL: ${docsViewUrl}`);
    } catch (error) {
      console.error('Failed to create Google Doc:', error);
      alert('Failed to create Google Doc. Please try again.');
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
      const quizId = quiz.title; // Use quiz title as identifier
      removeSharedDocument('quiz', quizId);
      
      // Clear state
      setSharedDoc(null);
      setGoogleDocsUrl('');
      
      console.log(`✅ Stopped sharing quiz: ${quizId}`);
      showSuccess('Document sharing stopped successfully');
    } catch (error) {
      console.error('Failed to stop sharing:', error);
      showError('Failed to stop sharing. Please try again.');
    } finally {
      setIsStopping(false);
    }
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
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Share Quiz
          </h2>
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
          {/* Quiz Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              {quiz.title}
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              📝 {quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}
              {enrichment && ' • ✨ AI-enriched'}
            </p>
          </div>

          {/* Mode Switcher */}
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

          {/* URL Section */}
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
                onClick={(e) => e.currentTarget.select()}
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

          {/* QR Code - Only show if URL is short enough */}
          <div className="flex flex-col items-center">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Scan with Mobile Device
            </label>
            {shareUrl.length > 2000 ? (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg text-center">
                <svg className="w-12 h-12 mx-auto mb-2 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                  URL too long for QR code
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  Use the "Copy" button above to share the link
                </p>
              </div>
            ) : (
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <QRCodeSVG value={shareUrl} size={200} level="L" />
              </div>
            )}
          </div>

          {/* Share Buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Share On
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleTwitterShare}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1DA1F2] text-white rounded-md hover:bg-[#1a8cd8] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                X
              </button>
              
              <button
                onClick={handleRedditShare}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#FF4500] text-white rounded-md hover:bg-[#e03d00] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                </svg>
                Reddit
              </button>
              
              <button
                onClick={handleFacebookShare}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1877F2] text-white rounded-md hover:bg-[#166fe5] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Facebook
              </button>
              
              <button
                onClick={handleEmailShare}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#EA4335] text-white rounded-md hover:bg-[#d33426] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
                </svg>
                Email
              </button>

              <button
                onClick={handleBlueskyShare}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0085FF] text-white rounded-md hover:bg-[#0073e6] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.038.416-.054-3.912.448-6.327 1.282-6.327 3.444 0 2.162 2.556 3.06 6.524 3.06C11.395 20.061 12 24 12 24s.605-3.939 4.38-3.939c3.968 0 6.524-.898 6.524-3.06 0-2.162-2.415-2.996-6.327-3.444.14.016.28.034.416.054 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.788.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/>
                </svg>
                Bluesky
              </button>

              <button
                onClick={handleQuoraShare}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#B92B27] text-white rounded-md hover:bg-[#a02623] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.275 15.844a4.64 4.64 0 01-.213-.4c-.328-.666-.524-1.363-.524-2.118 0-2.647 2.08-4.907 4.826-4.907 2.746 0 4.826 2.26 4.826 4.907 0 .755-.196 1.452-.524 2.118a5.127 5.127 0 01-.213.4c.213.08.427.12.64.12 1.15 0 2.12-.87 2.72-1.882.6-1.012.86-2.144.86-3.296 0-1.192-.28-2.344-.86-3.356-.58-1.012-1.57-1.862-2.72-1.862-.213 0-.427.04-.64.12.066-.12.132-.26.213-.4.328-.666.524-1.363.524-2.118 0-2.647-2.08-4.907-4.826-4.907-2.746 0-4.826 2.26-4.826 4.907 0 .755.196 1.452.524 2.118.065.14.147.28.213.4a2.51 2.51 0 00-.64-.12c-1.15 0-2.12.87-2.72 1.882-.6 1.012-.86 2.144-.86 3.296 0 1.192.28 2.344.86 3.356.58 1.012 1.57 1.862 2.72 1.862.213 0 .427-.04.64-.12z"/>
                </svg>
                Quora
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>💡 Anyone with this URL can take the quiz</p>
            <p>🔒 Quiz data is compressed and encoded in the URL (no server storage)</p>
            <p>⏱️ Links never expire and work offline once loaded</p>
            <p>📊 Results are only stored locally (not synced back to you)</p>
          </div>
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
                    Create a publicly accessible Google Document with quiz data as JSON
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
                    Google Docs Link
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
                  <div className="mt-3 flex gap-2">
                    <a
                      href={googleDocsViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-center inline-flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in Google Drive
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
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={handleTwitterShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1DA1F2] text-white rounded-md hover:bg-[#1a8cd8] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        X
                      </button>
                      
                      <button
                        onClick={handleRedditShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#FF4500] text-white rounded-md hover:bg-[#e03d00] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                        </svg>
                        Reddit
                      </button>
                      
                      <button
                        onClick={handleFacebookShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1877F2] text-white rounded-md hover:bg-[#166fe5] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        Facebook
                      </button>
                      
                      <button
                        onClick={handleEmailShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#EA4335] text-white rounded-md hover:bg-[#d33426] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
                        </svg>
                        Email
                      </button>

                      <button
                        onClick={handleBlueskyShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0085FF] text-white rounded-md hover:bg-[#0073e6] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.038.416-.054-3.912.448-6.327 1.282-6.327 3.444 0 2.162 2.556 3.06 6.524 3.06C11.395 20.061 12 24 12 24s.605-3.939 4.38-3.939c3.968 0 6.524-.898 6.524-3.06 0-2.162-2.415-2.996-6.327-3.444.14.016.28.034.416.054 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.788.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/>
                        </svg>
                        Bluesky
                      </button>

                      <button
                        onClick={handleQuoraShare}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#B92B27] text-white rounded-md hover:bg-[#a02623] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8.275 15.844a4.64 4.64 0 01-.213-.4c-.328-.666-.524-1.363-.524-2.118 0-2.647 2.08-4.907 4.826-4.907 2.746 0 4.826 2.26 4.826 4.907 0 .755-.196 1.452-.524 2.118a5.127 5.127 0 01-.213.4c.213.08.427.12.64.12 1.15 0 2.12-.87 2.72-1.882.6-1.012.86-2.144.86-3.296 0-1.192-.28-2.344-.86-3.356-.58-1.012-1.57-1.862-2.72-1.862-.213 0-.427.04-.64.12.066-.12.132-.26.213-.4.328-.666.524-1.363.524-2.118 0-2.647-2.08-4.907-4.826-4.907-2.746 0-4.826 2.26-4.826 4.907 0 .755.196 1.452.524 2.118.065.14.147.28.213.4a2.51 2.51 0 00-.64-.12c-1.15 0-2.12.87-2.72 1.882-.6 1.012-.86 2.144-.86 3.296 0 1.192.28 2.344.86 3.356.58 1.012 1.57 1.862 2.72 1.862.213 0 .427-.04.64-.12z"/>
                        </svg>
                        Quora
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}
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

export default QuizShareDialog;
