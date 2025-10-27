/**
 * SharedSnippetViewer Component
 * 
 * Full-screen viewer for shared snippets accessed via URL.
 * No login required - publicly accessible.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MarkdownRenderer } from './MarkdownRenderer';
import { getSnippetShareDataFromUrl } from '../utils/snippetShareUtils';
import type { SharedSnippet } from '../utils/snippetShareUtils';
import { useAuth } from '../contexts/AuthContext';

export const SharedSnippetViewer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [snippet, setSnippet] = useState<SharedSnippet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try to load snippet from URL
    try {
      const data = getSnippetShareDataFromUrl();
      if (data) {
        setSnippet(data);
        console.log('📄 Loaded shared snippet:', data.title || 'Untitled');
      } else {
        setError('Invalid or missing snippet data in URL');
      }
    } catch (err) {
      console.error('Failed to load shared snippet:', err);
      setError('Failed to decode snippet data');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  const handleBackToChat = () => {
    if (isAuthenticated) {
      navigate('/');
    } else {
      // Redirect to login, then to chat
      navigate('/login?redirect=/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading shared snippet...</p>
        </div>
      </div>
    );
  }

  if (error || !snippet) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Unable to Load Snippet
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error || 'The shared snippet could not be found or loaded.'}
          </p>
          <button
            onClick={handleBackToChat}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {isAuthenticated ? 'Go to Chat' : 'Go to Login'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Fixed Header with Back Button */}
      <div className="fixed top-0 right-0 left-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📄</div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Shared Snippet
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                View only • No login required
              </p>
            </div>
          </div>
          <button
            onClick={handleBackToChat}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>{isAuthenticated ? 'Back to Chat' : 'Login & Chat'}</span>
          </button>
        </div>
      </div>

      {/* Content Area (with top padding for fixed header) */}
      <div className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Snippet Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                {snippet.title || 'Untitled Snippet'}
              </h2>
              
              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {new Date(snippet.timestamp).toLocaleString()}
                </div>
                
                {snippet.sourceType && (
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    snippet.sourceType === 'user' ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' :
                    snippet.sourceType === 'assistant' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                    'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
                  }`}>
                    {snippet.sourceType}
                  </span>
                )}
                
                {snippet.metadata && (
                  <div className="flex items-center gap-1 text-xs">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {snippet.metadata.originalSize.toLocaleString()} chars
                    {snippet.metadata.compressedSize && (
                      <span className="text-gray-400">
                        ({((1 - snippet.metadata.compressedSize / snippet.metadata.originalSize) * 100).toFixed(0)}% compressed)
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Tags */}
              {snippet.tags && snippet.tags.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-3">
                  {snippet.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            {/* Content */}
            <div className="p-6">
              <div className="prose dark:prose-invert max-w-none">
                <MarkdownRenderer content={snippet.content} />
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-1">
                  This is a shared snippet
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  Someone shared this content with you. No login is required to view it. 
                  {!isAuthenticated && (
                    <span> Click "Login & Chat" to create an account and start using the chat features.</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
