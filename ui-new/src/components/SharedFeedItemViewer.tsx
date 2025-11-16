/**
 * SharedFeedItemViewer Component
 * 
 * Full-screen viewer for shared feed items accessed via URL.
 * Supports both compressed URL data and Google Docs downloads.
 * No login required - publicly accessible.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useAuth } from '../contexts/AuthContext';
import { decompressFromEncodedURIComponent } from 'lz-string';
import { downloadFileContent } from '../utils/googleDocs';
import { feedDB } from '../db/feedDb';
import { useProject } from '../contexts/ProjectContext';
import { useSwag } from '../contexts/SwagContext';
import { googleAuth } from '../services/googleAuth';

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
  const { isAuthenticated, getToken } = useAuth();
  const { getCurrentProjectId } = useProject();
  const { addSnippet } = useSwag();
  const [feedItem, setFeedItem] = useState<SharedFeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false); // Track if we already auto-saved
  const [requiresDrivePermission, setRequiresDrivePermission] = useState(false);

  useEffect(() => {
    // Try to load feed item from URL or Google Docs
    const loadFeedItem = async () => {
      try {
        // Check if this is a Google Docs share (has docId param)
        // For hash routing, params are in the hash: #/feed/shared?docId=xxx
        let docId = searchParams.get('docId');
        
        // If not found in regular search params, check the hash
        if (!docId && window.location.hash.includes('?')) {
          const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
          docId = hashParams.get('docId');
        }
        
        console.log('🔍 SharedFeedItemViewer loading with params:', { docId, hash: window.location.hash, isAuthenticated });
        
        if (docId) {
          // Google Docs shares require authentication for billing and tracking
          if (!isAuthenticated) {
            console.log('🔒 Authentication required to view Google Docs share');
            setRequiresAuth(true);
            setLoading(false);
            return;
          }
          
          // User is authenticated - reset requiresAuth flag
          setRequiresAuth(false);

          // Try to load from Google Docs - first attempt public download via proxy (requires auth for billing)
          console.log('📝 Loading shared feed item from Google Docs:', docId);
          
          try {
            let htmlContent: string;
            
            // First, try to download as a public file via our proxy (requires user auth for billing)
            try {
              console.log('🌐 Attempting public download via authenticated proxy');
              htmlContent = await downloadFileContent(docId, ''); // Empty string = no Drive API token, uses proxy
              console.log('✅ Successfully downloaded as public file');
            } catch (publicError) {
              console.log('⚠️ Public download failed, trying with Drive API authentication');
              
              // Public download failed - try with Drive API permissions
              // Check if user has Drive access, request if needed
              if (!googleAuth.hasDriveAccess()) {
                console.log('📁 Drive permissions required - showing permission UI...');
                setRequiresDrivePermission(true);
                setLoading(false);
                return;
              }
              
              // Download HTML content from Google Drive using user's access token
              const accessToken = await getToken();
              if (!accessToken) {
                throw new Error('Failed to get access token');
              }
              htmlContent = await downloadFileContent(docId, accessToken);
            }
            
            // Parse HTML to extract feed item data
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            // Extract title
            const title = doc.querySelector('h1')?.textContent || 'Shared Feed Item';
            
            // Extract topics (from paragraph with "Topics:" label)
            const topicsPara = Array.from(doc.querySelectorAll('p'))
              .find(p => p.textContent?.startsWith('Topics:'));
            const topics = topicsPara 
              ? topicsPara.textContent!.replace('Topics:', '').split(',').map(t => t.trim())
              : [];
            
            // Extract image
            const image = doc.querySelector('img')?.getAttribute('src') || undefined;
            
            // Extract content (first div after metadata)
            const contentDiv = doc.querySelectorAll('div')[0];
            const content = contentDiv?.textContent || '';
            
            // Extract expanded content (div with h2 "Full Content")
            const fullContentH2 = Array.from(doc.querySelectorAll('h2'))
              .find(h => h.textContent?.includes('Full Content'));
            const expandedContent = fullContentH2?.nextElementSibling?.textContent || undefined;
            
            // Extract sources (from ul list under "Sources" h2)
            const sourcesH2 = Array.from(doc.querySelectorAll('h2'))
              .find(h => h.textContent?.includes('Sources'));
            const sourcesList = sourcesH2?.nextElementSibling;
            const sources: string[] = [];
            if (sourcesList) {
              sourcesList.querySelectorAll('a').forEach(link => {
                sources.push(link.getAttribute('href') || '');
              });
            }
            
            // Create shared feed item from Google Docs content
            const feedItemData: SharedFeedItem = {
              type: 'feed_item',
              title,
              content,
              topics,
              image,
              sources,
              expandedContent
            };
            
            setFeedItem(feedItemData);
            console.log('✅ Loaded feed item from Google Docs');
          } catch (error) {
            console.error('Failed to load Google Docs content:', error);
            
            // Provide specific error messages based on the error
            if (error instanceof Error && error.message.includes('404')) {
              setError('This shared feed item was not found. It may have been deleted or is not shared with you.');
            } else if (error instanceof Error && error.message.includes('403')) {
              setError('You do not have permission to access this feed item. Please ask the owner to share it with you.');
            } else if (error instanceof Error && error.message.includes('401')) {
              setError('Your Google Drive authentication has expired. Please log out and log back in.');
            } else {
              setError(`Failed to load shared feed item: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        } else {
          // Load from compressed URL data
          const data = getFeedItemDataFromUrl();
          if (data) {
            setFeedItem(data);
            console.log('📰 Loaded shared feed item:', data.title || 'Untitled');
          } else {
            setError('Invalid or missing feed item data in URL');
          }
        }
      } catch (err) {
        console.error('Failed to load shared feed item:', err);
        setError('Failed to decode feed item data');
      } finally {
        setLoading(false);
      }
    };
    
    loadFeedItem();
  }, [searchParams, isAuthenticated]); // Re-run when authentication changes

  // Auto-save feed item when loaded and user is authenticated, then navigate to single view
  useEffect(() => {
    const autoSaveFeedItem = async () => {
      if (!feedItem || !isAuthenticated || autoSaved || isSaving) return;
      
      console.log('💾 Auto-saving shared feed item to collection...');
      setAutoSaved(true);
      setIsSaving(true);
      
      try {
        // Save feed item as snippet using SwagContext
        const savedSnippet = await addSnippet(
          feedItem.content,
          'user', // Source type
          feedItem.title,
          feedItem.topics || []
        );
        
        console.log('✅ Auto-saved feed item to collection');
        setSaved(true); // Show "Saved" indicator
        
        // Navigate to the saved snippet's single view page after a brief delay
        if (savedSnippet) {
          setTimeout(() => {
            navigate(`/snippet/${savedSnippet.id}`);
          }, 1000);
        }
      } catch (error) {
        console.error('Failed to auto-save feed item:', error);
        setAutoSaved(false); // Allow retry
      } finally {
        setIsSaving(false);
      }
    };
    
    autoSaveFeedItem();
  }, [feedItem, isAuthenticated, autoSaved, isSaving, addSnippet, navigate]);

  const handleGrantDriveAccess = async () => {
    try {
      setLoading(true);
      console.log('📁 Requesting Drive permissions (user-initiated)...');
      const granted = await googleAuth.requestDriveAccess();
      
      if (granted) {
        console.log('✅ Drive permissions granted, reloading page...');
        window.location.reload();
      } else {
        setError('Drive permissions are required to view this shared feed item');
        setLoading(false);
        setRequiresDrivePermission(false);
      }
    } catch (error) {
      console.error('Failed to request Drive access:', error);
      setError('Failed to request Drive permissions. Please try again.');
      setLoading(false);
      setRequiresDrivePermission(false);
    }
  };

  const handleSaveToCollection = async () => {
    if (!feedItem || !isAuthenticated) return;
    
    setIsSaving(true);
    try {
      // Create a new feed item in the database
      const newFeedItem = {
        id: `shared-${Date.now()}`,
        type: 'did-you-know' as const,
        title: feedItem.title,
        content: feedItem.content,
        expandedContent: feedItem.expandedContent,
        mnemonic: feedItem.mnemonic,
        image: feedItem.image,
        topics: feedItem.topics || [],
        sources: feedItem.sources?.map(s => typeof s === 'string' ? s : s.url) || [],
        createdAt: new Date().toISOString(),
        viewed: false,
        stashed: true, // Save as stashed
        trashed: false,
        projectId: getCurrentProjectId() || undefined
      };
      
      await feedDB.saveItems([newFeedItem]);
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000); // Reset after 3 seconds
    } catch (error) {
      console.error('Failed to save feed item:', error);
    } finally {
      setIsSaving(false);
    }
  };

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

  if (requiresAuth) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 text-center">
          <div className="text-blue-500 text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Login Required
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This shared feed item is stored in Google Drive and requires you to sign in to view it.
          </p>
          <button
            onClick={() => {
              // Store current location for post-login redirect
              sessionStorage.setItem('auth_redirect', window.location.hash);
              // Flag that we need Drive access for Google Docs shares
              sessionStorage.setItem('request_drive_access', 'true');
              navigate('/login');
            }}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mb-3"
          >
            Sign In with Google Drive
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            You'll be asked to grant Google Drive access to view this shared content
          </p>
        </div>
      </div>
    );
  }

  if (requiresDrivePermission) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 text-center">
          <div className="text-green-500 text-5xl mb-4">📁</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Drive Access Required
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This shared feed item is stored in Google Drive. Please grant access to your Google Drive to view it.
          </p>
          <button
            onClick={handleGrantDriveAccess}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors mb-3"
          >
            Grant Drive Access
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            You'll see a Google permission popup. This only needs to be done once.
          </p>
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
            {isAuthenticated ? (
              <button
                onClick={handleSaveToCollection}
                disabled={isSaving || saved}
                className={`px-4 py-2 rounded-md transition-colors text-sm font-medium flex items-center gap-2 ${
                  saved
                    ? 'bg-green-600 text-white'
                    : isSaving
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {saved ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved!
                  </>
                ) : isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  'Save to Collection'
                )}
              </button>
            ) : (
              <button
                onClick={() => navigate('/login?redirect=' + encodeURIComponent(window.location.href))}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              >
                Login
              </button>
            )}
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
