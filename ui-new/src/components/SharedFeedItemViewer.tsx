/**
 * SharedFeedItemViewer Component
 * 
 * Full-screen viewer for shared feed items accessed via URL.
 * No login required - publicly accessible.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useAuth } from '../contexts/AuthContext';
import { decompressFromEncodedURIComponent } from 'lz-string';

interface SharedFeedItem {
  type: 'feed_item';
  title: string;
  content: string;
  topics: string[];
  image?: string;
  sources?: Array<string | { url: string; title: string }>; // Support both formats
  expandedContent?: string; // Deep dive content (truncated preview in shared URLs)
  mnemonic?: string; // Memory aid (may be excluded from shared URLs)
}

const getFeedItemDataFromUrl = (): SharedFeedItem | null => {
  try {
    // Check path-based format: /feed/share/compressed_data
    const path = window.location.pathname;
    const match = path.match(/\/feed\/share\/(.+)/);
    if (match && match[1]) {
      // Use lz-string decompression
      const compressed = match[1];
      const decompressed = decompressFromEncodedURIComponent(compressed);
      if (!decompressed) {
        console.error('Failed to decompress feed item data');
        return null;
      }
      return JSON.parse(decompressed) as SharedFeedItem;
    }
    return null;
  } catch (error) {
    console.error('Error decoding feed item data:', error);
    return null;
  }
};

export const SharedFeedItemViewer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [feedItem, setFeedItem] = useState<SharedFeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try to load feed item from URL
    try {
      const data = getFeedItemDataFromUrl();
      if (data) {
        setFeedItem(data);
        console.log('📰 Loaded shared feed item:', data.title || 'Untitled');
      } else {
        setError('Invalid or missing feed item data in URL');
      }
    } catch (err) {
      console.error('Failed to load shared feed item:', err);
      setError('Failed to decode feed item data');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  const handleBackToFeed = () => {
    if (isAuthenticated) {
      navigate('/?tab=feed');
    } else {
      // Redirect to login, then to feed
      navigate('/login?redirect=/?tab=feed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading shared feed item...</p>
        </div>
      </div>
    );
  }

  if (error || !feedItem) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Unable to Load Feed Item
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error || 'The shared feed item could not be found or loaded.'}
          </p>
          <button
            onClick={handleBackToFeed}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {isAuthenticated ? 'Go to Feed' : 'Go to Login'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Shared Feed Item</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Read-only preview</p>
          </div>
          <div>
            <button
              onClick={() => navigate('/login?redirect=' + encodeURIComponent(window.location.href))}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              Login
            </button>
          </div>
        </div>
      </div>

      {/* Feed Item Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Image */}
          {feedItem.image && (
            <div className="w-full h-64 bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <img
                src={feedItem.image}
                alt={feedItem.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          <div className="p-6">
            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {feedItem.title}
            </h2>

            {/* Topics */}
            {feedItem.topics && feedItem.topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {feedItem.topics.map((topic, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-full"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}

            {/* Summary Content */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Summary
              </h3>
              <div className="prose dark:prose-invert max-w-none">
                <MarkdownRenderer content={feedItem.content} />
              </div>
            </div>

            {/* Mnemonic */}
            {feedItem.mnemonic && (
              <div className="mb-6 bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-400 dark:border-purple-600 p-4 rounded">
                <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                  💡 {feedItem.mnemonic}
                </p>
              </div>
            )}

            {/* Expanded Content (Deep Dive) */}
            {feedItem.expandedContent && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  📖 Deep Dive
                </h3>
                <div className="prose dark:prose-invert max-w-none whitespace-pre-line text-gray-700 dark:text-gray-300 leading-relaxed">
                  {feedItem.expandedContent}
                </div>
              </div>
            )}

            {/* Sources */}
            {feedItem.sources && feedItem.sources.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  📚 Sources
                </h3>
                <ul className="space-y-2">
                  {feedItem.sources.map((source, index) => {
                    const url = typeof source === 'string' ? source : source.url;
                    const title = typeof source === 'string' ? source : (source.title || source.url);
                    return (
                      <li key={index}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline break-all text-sm"
                        >
                          {title}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Call to Action (login via top-right button) */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Want to explore more AI-curated content? Login using the button at the top-right to continue.
          </p>
        </div>
      </div>
    </div>
  );
};
