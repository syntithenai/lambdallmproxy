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
import { downloadFileContent } from '../utils/googleDocs';
import { useSwag } from '../contexts/SwagContext';
import { googleAuth } from '../services/googleAuth';
import { useToast } from './ToastManager';

/**
 * Convert image URLs in HTML to base64 data URLs
 * This ensures images are embedded and preserved when saving
 */
async function convertImagesToBase64(html: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const images = doc.querySelectorAll('img');
  
  console.log(`🖼️ Found ${images.length} images to convert to base64`);
  
  for (const img of Array.from(images)) {
    const src = img.getAttribute('src');
    if (!src) {
      console.log('⏭️ Skipping image with no src');
      continue;
    }
    
    if (src.startsWith('data:')) {
      console.log('⏭️ Image already base64:', src.substring(0, 50) + '...');
      continue; // Already base64
    }
    
    try {
      console.log(`📥 Fetching image: ${src.substring(0, 100)}...`);
      
      // For Google Drive images, we might need to use a proxy or different approach
      // Google Drive images often require authentication
      let blob: Blob;
      
      if (src.includes('googleusercontent.com') || src.includes('drive.google.com')) {
        console.log('🔐 Google Drive image detected, may need authentication');
        // Try to fetch with credentials
        const response = await fetch(src, { 
          mode: 'cors',
          credentials: 'include'
        });
        
        if (!response.ok) {
          console.error(`❌ Failed to fetch Google Drive image: ${response.status} ${response.statusText}`);
          console.log('⚠️ Keeping original URL, image may not display after save');
          continue; // Keep original URL if fetch fails
        }
        
        blob = await response.blob();
      } else {
        // Regular image
        const response = await fetch(src);
        if (!response.ok) {
          console.error(`❌ Failed to fetch image: ${response.status} ${response.statusText}`);
          continue;
        }
        blob = await response.blob();
      }
      
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      console.log(`✅ Converted image to base64 (${(base64.length / 1024).toFixed(1)} KB)`);
      img.setAttribute('src', base64);
    } catch (error) {
      console.error(`❌ Failed to convert image ${src}:`, error);
      console.log('⚠️ Keeping original URL, image may not display after save');
      // Keep original URL if conversion fails
    }
  }
  
  const result = doc.body.innerHTML;
  console.log(`📦 Converted HTML length: ${result.length}`);
  return result;
}

export const SharedSnippetViewer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, getToken } = useAuth();
  const { addSnippet } = useSwag();
  const { showSuccess } = useToast();
  const [snippet, setSnippet] = useState<SharedSnippet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingFailed, setLoadingFailed] = useState(false); // Track if loading actually failed
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [requiresDrivePermission, setRequiresDrivePermission] = useState(false); // Track if Drive permission needed
  const [docId, setDocId] = useState<string | null>(null); // Track Google Doc ID

  useEffect(() => {
    // Try to load snippet from URL
    const loadSnippet = async () => {
      try {
        // Check if this is a Google Docs share (has docId param)
        // For hash routing, params are in the hash: #/snippet/shared?docId=xxx
        let extractedDocId = searchParams.get('docId');
        
        // If not found in regular search params, check the hash
        if (!extractedDocId && window.location.hash.includes('?')) {
          const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
          extractedDocId = hashParams.get('docId');
        }
        
        console.log('🔍 SharedSnippetViewer loading with params:', { docId: extractedDocId, hash: window.location.hash, isAuthenticated });
        
        if (extractedDocId) {
          // Store the docId for later use (duplicate prevention, saving)
          setDocId(extractedDocId);
          
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
          console.log('📄 Loading shared snippet from Google Docs:', extractedDocId);
          
          try {
            let htmlContent: string;
            
            // First, try to download as a public file via our proxy (requires user auth for billing)
            try {
              console.log('🌐 Attempting public download via authenticated proxy');
              htmlContent = await downloadFileContent(extractedDocId, ''); // Empty string = no Drive API token, uses proxy
              console.log('✅ Successfully downloaded as public file');
            } catch (publicError) {
              console.log('⚠️ Public download failed, trying with Drive API authentication');
              
              // Public download failed - try with Drive API permissions
              // Check if user has Drive access, request if needed
              if (!googleAuth.hasDriveAccess()) {
                console.log('📁 Drive permissions needed');
                // Show UI to request Drive permissions (must be user-initiated)
                setRequiresDrivePermission(true);
                setLoading(false);
                return;
              }
              
              // Get access token for authenticated download
              const accessToken = await getToken();
              console.log('🔑 Got access token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'null');
              if (!accessToken) {
                throw new Error('Failed to get access token');
              }

              // Download file content from Google Drive using user's auth
              htmlContent = await downloadFileContent(extractedDocId, accessToken);
            }
            
            // Parse HTML content to extract snippet data
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            // Extract title from h1
            const titleElement = doc.querySelector('h1');
            const title = titleElement?.textContent || 'Shared Snippet';
            
            // Extract tags from .tag elements
            const tagElements = doc.querySelectorAll('.tag');
            const tags = Array.from(tagElements).map(el => el.textContent || '').filter(t => t.length > 0);
            
            // Extract main content from .content div
            const contentElement = doc.querySelector('.content');
            let snippetContent = contentElement?.innerHTML || '';
            
            // Fallback: If .content is empty or missing, try to get all content from body
            if (!snippetContent || snippetContent.trim().length === 0) {
              console.log('⚠️ .content element empty or missing, using full body HTML');
              // Remove h1 and .tag elements from body copy
              const bodyClone = doc.body.cloneNode(true) as HTMLElement;
              const h1 = bodyClone.querySelector('h1');
              if (h1) h1.remove();
              const tagEls = bodyClone.querySelectorAll('.tag');
              tagEls.forEach(el => el.remove());
              snippetContent = bodyClone.innerHTML;
            }
            
            // Log the raw HTML to debug image handling
            console.log('📝 Raw content HTML length:', snippetContent.length);
            const imgTags = snippetContent.match(/<img[^>]*>/gi);
            console.log('🖼️ Found img tags in extracted content:', imgTags ? imgTags.length : 0);
            if (imgTags && imgTags.length > 0) {
              console.log('🖼️ First img tag:', imgTags[0].substring(0, 200));
            }
            
            // Also log full HTML structure to debug
            console.log('📄 Full HTML structure:', {
              hasContentDiv: !!contentElement,
              bodyChildrenCount: doc.body.children.length,
              bodyHTML: doc.body.innerHTML.substring(0, 500)
            });
            
            // Convert any image URLs to base64 so they're preserved when saving
            console.log('🖼️ Converting images to base64...');
            const contentBeforeConversion = snippetContent;
            snippetContent = await convertImagesToBase64(snippetContent);
            console.log('✅ Images converted to base64');
            console.log('📝 Final content HTML length:', snippetContent.length);
            
            // Check if conversion changed anything
            if (contentBeforeConversion === snippetContent) {
              console.log('ℹ️ No changes made during image conversion (images may already be base64)');
            } else {
              console.log('✨ Content modified during image conversion');
            }
            
            // Create snippet object from Google Docs content
            setSnippet({
              version: 1,
              timestamp: Date.now(),
              shareType: 'snippet',
              id: extractedDocId, // Use Google Docs file ID as snippet ID
              content: snippetContent,
              title,
              tags,
              metadata: {
                compressed: false,
                originalSize: htmlContent.length
              }
            });
            
            console.log('✅ Loaded snippet from Google Docs:', title);
          } catch (error) {
            console.error('Failed to load Google Docs content:', error);
            
            // Provide specific error messages based on the error
            if (error instanceof Error && error.message.includes('404')) {
              setError('This shared document was not found. It may have been deleted or is not shared with you. Please ask the owner to re-share it.');
            } else if (error instanceof Error && error.message.includes('403')) {
              setError('You do not have permission to access this document. Please ask the owner to share it with you.');
            } else if (error instanceof Error && error.message.includes('401')) {
              setError('Your Google Drive authentication has expired. Please log out and log back in.');
            } else {
              setError(`Failed to load shared document: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        } else {
          // Load from compressed URL data
          const data = getSnippetShareDataFromUrl();
          if (data) {
            setSnippet(data);
            console.log('📄 Loaded shared snippet from URL:', data.title || 'Untitled');
          } else {
            setError('Invalid or missing snippet data in URL');
          }
        }
      } catch (err) {
        console.error('Failed to load shared snippet:', err);
        setError('Failed to decode snippet data');
        setLoadingFailed(true); // Mark that loading actually failed
      } finally {
        setLoading(false);
      }
    };
    
    loadSnippet();
  }, [searchParams, isAuthenticated]); // Re-run when authentication changes

  // Auto-save shared snippet to user's collection and navigate to single view
  useEffect(() => {
    const autoSaveSnippet = async () => {
      if (!snippet || !isAuthenticated || autoSaved || isSaving) return;
      
      console.log('💾 Auto-saving shared snippet to collection...');
      setAutoSaved(true);
      setIsSaving(true);
      
      try {
        // Log content before saving to debug image handling
        console.log('📝 Content being saved, length:', snippet.content.length);
        const imgInContent = snippet.content.match(/<img[^>]*>/gi);
        console.log('🖼️ Images in content being saved:', imgInContent ? imgInContent.length : 0);
        if (imgInContent && imgInContent.length > 0) {
          console.log('🖼️ First img in save:', imgInContent[0].substring(0, 150) + '...');
        }
        
        // Add snippet to user's swag collection, passing Google Doc ID if available
        const savedSnippet = await addSnippet(
          snippet.content,
          snippet.sourceType || 'user',
          snippet.title,
          snippet.tags || [],
          docId || undefined // Pass Google Doc ID to prevent duplicates
        );
        
        console.log('✅ Auto-saved snippet to collection');
        
        // Show toast notification instead of button state
        showSuccess('Content saved to your collection!');
        
        // Navigate to the saved snippet's single view page after a brief delay
        if (savedSnippet) {
          setTimeout(() => {
            navigate(`/snippet/${savedSnippet.id}`);
          }, 1000);
        }
      } catch (error) {
        console.error('Failed to auto-save snippet:', error);
        setAutoSaved(false); // Allow retry
      } finally {
        setIsSaving(false);
      }
    };
    
    autoSaveSnippet();
  }, [snippet, isAuthenticated, autoSaved, isSaving, addSnippet, navigate, docId, showSuccess]);

  const handleGrantDriveAccess = async () => {
    try {
      setLoading(true);
      console.log('📁 Requesting Drive permissions (user-initiated)...');
      const granted = await googleAuth.requestDriveAccess();
      
      if (granted) {
        console.log('✅ Drive permissions granted, reloading page...');
        // Reload the page to trigger the data loading with new permissions
        window.location.reload();
      } else {
        setError('Drive permissions are required to view this shared document');
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

  const handleBackToChat = () => {
    if (isAuthenticated) {
      navigate('/');
    } else {
      // Redirect to login, then to chat
      navigate('/login?redirect=/');
    }
  };

  const handleSaveToCollection = async () => {
    if (!snippet || !isAuthenticated) return;
    
    setIsSaving(true);
    try {
      // Add snippet to user's swag collection
      await addSnippet(
        snippet.content,
        snippet.sourceType || 'user',
        snippet.title,
        snippet.tags || []
      );
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      
      console.log('✅ Saved snippet to collection');
    } catch (error) {
      console.error('Failed to save snippet:', error);
      alert('Failed to save snippet to your collection. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      // Store current URL for redirect after login
      sessionStorage.setItem('auth_redirect', window.location.hash.slice(1) || '/');
      
      // Trigger Google OAuth directly (no redirect to /login page)
      await googleAuth.signIn();
      
      // Note: Auto-save will trigger automatically via useEffect when isAuthenticated becomes true
      // The useEffect will show the toast notification and redirect to saved snippet view
    } catch (error) {
      console.error('❌ Sign-in failed:', error);
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

  if (requiresAuth) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 text-center">
          <div className="text-blue-500 text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Login Required
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This shared snippet is stored in Google Drive and requires you to sign in to view it.
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
            This shared snippet is stored in Google Drive. Please grant access to your Google Drive to view it.
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

  if (error && loadingFailed) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Unable to Load Snippet
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error}
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

  if (!snippet) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading snippet...</div>
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
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Shared Snippet</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">View only • No login required</p>
            </div>
          </div>
          <div>
            {/* Only show Login button when not authenticated */}
            {!isAuthenticated && (
              <button
                onClick={handleGoogleLogin}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Login with Google
              </button>
            )}
          </div>
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
                    <span> Login to create an account and start using chat features.</span>
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
