/**
 * ShareDialog Component
 * 
 * Displays share options for chat conversations:
 * - Copy shareable URL to clipboard
 * - QR code for mobile sharing
 * - Social media sharing buttons
 * - Truncation warnings if conversation was compressed
 */

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createShareData, decodeShareData, generateShareUrl } from '../utils/shareUtils';
import type { ShareMessage } from '../utils/shareUtils';

interface ShareDialogProps {
  messages: ShareMessage[];
  onClose: () => void;
  title?: string;
  plan?: any;
}

const ShareDialog: React.FC<ShareDialogProps> = ({ messages, onClose, title, plan }) => {
  const [shareUrl, setShareUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [messageCount, setMessageCount] = useState({ original: 0, included: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Generate share URL
    try {
      const compressed = createShareData(messages, { title, plan });
      let url = generateShareUrl(compressed);
      
      // Only force production domain if NOT in local development
      if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
        url = url.replace(window.location.origin, 'https://ai.syntithenai.com');
      }
      
      setShareUrl(url);

      // Check if truncated
      const decoded = decodeShareData(compressed);
      if (decoded?.metadata.truncated) {
        setTruncated(true);
        setMessageCount({
          original: decoded.metadata.originalMessageCount,
          included: decoded.metadata.includedMessageCount
        });
      }
    } catch (error) {
      console.error('Failed to generate share URL:', error);
    } finally {
      setLoading(false);
    }
  }, [messages, title, plan]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleTwitterShare = () => {
    const text = encodeURIComponent(`Check out this AI conversation: ${title || 'Untitled Chat'}`);
    const url = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

  const handleRedditShare = () => {
    const url = encodeURIComponent(shareUrl);
    // Leave title empty so user can customize it
    window.open(`https://www.reddit.com/submit?url=${url}`, '_blank');
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`AI Conversation: ${title || 'Untitled Chat'}`);
    const body = encodeURIComponent(`Check out this AI conversation:\n\n${shareUrl}`);
    // Use Gmail web interface for better UX
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
  };

  const handleFacebookShare = () => {
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  };

  const handleBlueskyShare = () => {
    const text = encodeURIComponent(`Check out this AI conversation: ${title || 'Untitled Chat'}\n\n${shareUrl}`);
    window.open(`https://bsky.app/intent/compose?text=${text}`, '_blank');
  };

  const handleQuoraShare = () => {
    const url = encodeURIComponent(shareUrl);
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Share Conversation</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Truncation Warning */}
        {truncated && (
          <div className="m-6 p-4 bg-yellow-50 dark:bg-yellow-900 border-l-4 border-yellow-400 dark:border-yellow-600">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Conversation Truncated
                </h3>
                <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                  <p>
                    Due to URL length limits, this share link includes {messageCount.included} of {messageCount.original} messages.
                    The first and last messages are always preserved.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* URL Section */}
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

          {/* QR Code */}
          <div className="flex flex-col items-center">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Scan with Mobile Device
            </label>
            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <QRCodeSVG value={shareUrl} size={200} level="M" />
            </div>
          </div>

          {/* Social Share Buttons */}
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

          {/* Info */}
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>💡 Anyone with this URL can view the conversation</p>
            <p>🔒 Share data is compressed and encoded in the URL itself (no server storage)</p>
            <p>⏱️ Links never expire and work offline once loaded</p>
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

export default ShareDialog;
