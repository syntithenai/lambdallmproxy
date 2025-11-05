/**
 * SharedQuizViewer Component
 * 
 * Renders a shared quiz loaded from URL without requiring authentication.
 * Allows users to take the quiz and see results, but doesn't save to backend.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// Header buttons removed for public shared pages; show single Login button instead
import { getQuizShareDataFromUrl, type SharedQuiz } from '../utils/quizShareUtils';
import { QuizCard } from './QuizCard';
import type { Quiz } from '../utils/api';

export default function SharedQuizViewer() {
  const navigate = useNavigate();
  const [sharedQuiz, setSharedQuiz] = useState<SharedQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [quizStartTime, setQuizStartTime] = useState<number>(0);

  useEffect(() => {
    // Extract quiz data from URL
    const data = getQuizShareDataFromUrl();
    
    if (!data) {
      setError('Invalid or missing quiz data in URL');
      setLoading(false);
      return;
    }

    setSharedQuiz(data);
    setCurrentQuiz(data.quiz);
    setQuizStartTime(Date.now());
    setLoading(false);
  }, []);

  const handleQuizComplete = (score: number, totalQuestions: number) => {
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
              <button
                onClick={() => navigate('/login?redirect=' + encodeURIComponent(window.location.href))}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
              >
                Login
              </button>
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
          onClose={() => navigate('/')}
          onComplete={handleQuizComplete}
        />
      </div>
    </div>
  );
}
