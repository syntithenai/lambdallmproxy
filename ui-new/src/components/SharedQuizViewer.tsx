/**
 * SharedQuizViewer Component
 * 
 * Renders a shared quiz loaded from URL without requiring authentication.
 * Allows users to take the quiz and see results, but doesn't save to backend.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
// Header buttons removed for public shared pages; show single Login button instead
import { getQuizShareDataFromUrl, type SharedQuiz } from '../utils/quizShareUtils';
import { QuizCard } from './QuizCard';
import type { Quiz } from '../utils/api';
import { downloadFileContent } from '../utils/googleDocs';
import { quizDB } from '../db/quizDb';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import { googleAuth } from '../services/googleAuth';

export default function SharedQuizViewer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, getToken } = useAuth();
  const { getCurrentProjectId } = useProject();
  const [sharedQuiz, setSharedQuiz] = useState<SharedQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [quizStartTime, setQuizStartTime] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false); // Track if we already auto-saved
  const [requiresDrivePermission, setRequiresDrivePermission] = useState(false);

  useEffect(() => {
    // Load quiz from URL or Google Docs
    const loadQuiz = async () => {
      try {
        // Check if this is a Google Docs share (has docId param)
        // For hash routing, params are in the hash: #/quiz/shared?docId=xxx
        let docId = searchParams.get('docId');
        
        // If not found in regular search params, check the hash
        if (!docId && window.location.hash.includes('?')) {
          const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
          docId = hashParams.get('docId');
        }
        
        console.log('🔍 SharedQuizViewer loading with params:', { docId, hash: window.location.hash, isAuthenticated });
        
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
          console.log('📝 Loading shared quiz from Google Docs:', docId);
          
          try {
            let content: string;
            
            // First, try to download as a public file via our proxy (requires user auth for billing)
            try {
              console.log('🌐 Attempting public download via authenticated proxy');
              content = await downloadFileContent(docId, ''); // Empty string = no Drive API token, uses proxy
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
              
              // Get access token for authenticated download
              const accessToken = await getToken();
              if (!accessToken) {
                throw new Error('Failed to get access token');
              }

              // Download JSON file content from Google Drive using user's auth
              content = await downloadFileContent(docId, accessToken);
            }
            
            // Parse JSON content
            const quizData = JSON.parse(content);
            
            // Validate it's a quiz
            if (quizData.type !== 'quiz' || !quizData.questions) {
              setError('Invalid quiz data format');
              setLoading(false);
              return;
            }
            
            // Create shared quiz object from Google Docs content
            const sharedQuizData: SharedQuiz = {
              version: 1,
              timestamp: quizData.sharedAt ? new Date(quizData.sharedAt).getTime() : Date.now(),
              shareType: 'quiz',
              quiz: {
                title: quizData.title,
                questions: quizData.questions.map((q: any) => ({
                  id: q.id,
                  prompt: q.prompt,
                  choices: q.choices,
                  answerId: q.correctChoiceId || q.answerId, // Normalize field name
                  explanation: q.explanation
                }))
              },
              metadata: {
                compressed: false,
                originalSize: content.length,
                sharedBy: quizData.createdBy
              }
            };
            
            setSharedQuiz(sharedQuizData);
            setCurrentQuiz(sharedQuizData.quiz);
            setQuizStartTime(Date.now());
            
            console.log('✅ Loaded quiz from Google Docs');
          } catch (error) {
            console.error('Failed to load Google Docs content:', error);
            
            // Provide specific error messages based on the error
            if (error instanceof Error && error.message.includes('404')) {
              setError('This shared quiz was not found. It may have been deleted or is not shared with you.');
            } else if (error instanceof Error && error.message.includes('403')) {
              setError('You do not have permission to access this quiz. Please ask the owner to share it with you.');
            } else if (error instanceof Error && error.message.includes('401')) {
              setError('Your Google Drive authentication has expired. Please log out and log back in.');
            } else {
              setError(`Failed to load shared quiz: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        } else {
          // Load from compressed URL data
          const data = getQuizShareDataFromUrl();
          
          if (!data) {
            setError('Invalid or missing quiz data in URL');
            setLoading(false);
            return;
          }

          setSharedQuiz(data);
          setCurrentQuiz(data.quiz);
          setQuizStartTime(Date.now());
        }
      } catch (err) {
        console.error('Failed to load shared quiz:', err);
        setError('Failed to load quiz data');
      } finally {
        setLoading(false);
      }
    };
    
    loadQuiz();
  }, [searchParams, isAuthenticated]); // Re-run when authentication changes

  // Auto-save quiz when loaded and user is authenticated
  useEffect(() => {
    const autoSaveQuiz = async () => {
      if (!currentQuiz || !isAuthenticated || autoSaved || isSaving) return;
      
      console.log('💾 Auto-saving shared quiz to collection...');
      setAutoSaved(true);
      setIsSaving(true);
      
      try {
        const projectId = getCurrentProjectId();
        
        // Save quiz to database using saveGeneratedQuiz (with duplicate check)
        const quizId = await quizDB.saveGeneratedQuiz(
          currentQuiz.title,
          [], // No snippet IDs for shared quizzes
          currentQuiz.questions.length,
          false, // Not enriched
          currentQuiz, // Store the full quiz data
          projectId || undefined
        );
        
        if (quizId) {
          console.log('✅ Auto-saved quiz to collection');
          setSaved(true); // Show "Saved" indicator
          
          // Hide "Saved" indicator after 3 seconds
          setTimeout(() => {
            setSaved(false);
          }, 3000);
        } else {
          console.log('ℹ️ Quiz already exists in collection, skipping save');
          // Don't show saved indicator for duplicates
        }
      } catch (error) {
        console.error('Failed to auto-save quiz:', error);
        setAutoSaved(false); // Allow retry
      } finally {
        setIsSaving(false);
      }
    };
    
    autoSaveQuiz();
  }, [currentQuiz, isAuthenticated, autoSaved, isSaving, getCurrentProjectId]);

  const handleGrantDriveAccess = async () => {
    try {
      setLoading(true);
      console.log('📁 Requesting Drive permissions (user-initiated)...');
      const granted = await googleAuth.requestDriveAccess();
      
      if (granted) {
        console.log('✅ Drive permissions granted, reloading page...');
        window.location.reload();
      } else {
        setError('Drive permissions are required to view this shared quiz');
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

  const handleQuizComplete = (score: number, totalQuestions: number): void => {
    // Calculate duration
    const duration = Math.floor((Date.now() - quizStartTime) / 1000);
    
    console.log('Quiz completed (shared, not saved):', {
      score,
      totalQuestions,
      duration,
      quiz: currentQuiz?.title
    });
    
    // Quiz completion is handled by QuizCard component
    // Results are only stored locally, not synced
  };

  const handleSaveToCollection = async () => {
    if (!currentQuiz || !isAuthenticated) return;
    
    setIsSaving(true);
    try {
      const projectId = getCurrentProjectId();
      
      // Save the quiz using saveGeneratedQuiz (with duplicate check)
      const quizId = await quizDB.saveGeneratedQuiz(
        currentQuiz.title,
        [], // Shared quiz doesn't have snippet IDs
        currentQuiz.questions.length,
        sharedQuiz?.metadata?.enrichment || false,
        currentQuiz, // Store the full quiz data
        projectId || undefined
      );
      
      if (quizId) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000); // Reset after 3 seconds
      } else {
        console.log('ℹ️ Quiz already exists in collection');
        // Could show a toast message here if desired
      }
    } catch (error) {
      console.error('Failed to save quiz:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Note: sharing controls removed from header for public viewers - users can copy the URL from browser if needed

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="text-gray-700 dark:text-gray-300">Loading quiz...</span>
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
            This shared quiz is stored in Google Drive and requires you to sign in to view it.
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
            This shared quiz is stored in Google Drive. Please grant access to your Google Drive to view it.
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-semibold">Unable to Load Quiz</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!sharedQuiz || !currentQuiz) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">Shared Quiz</div>
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
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quiz Info Banner */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                Shared Quiz
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                This quiz was shared with you. Your results will only be stored locally on your device.
              </p>
              {sharedQuiz.metadata?.sharedBy && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Shared by: {sharedQuiz.metadata.sharedBy}
                </p>
              )}
              {sharedQuiz.metadata?.enrichment && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  ✨ This quiz includes AI-enriched questions
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quiz Card */}
        <QuizCard
          quiz={currentQuiz}
          onClose={() => navigate('/quiz')}
          onComplete={handleQuizComplete}
        />
      </div>
    </div>
  );
}
