import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { quizDB, type QuizStatistic } from '../db/quizDb';
import { Trophy, Brain, Clock, TrendingUp, Calendar, ArrowLeft, Trash2, Share2 } from 'lucide-react';
import { useToast } from './ToastManager';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import { QuizCard } from './QuizCard';
import { syncSingleQuizStatistic } from '../utils/quizSync';
import { googleDriveSync } from '../services/googleDriveSync';
import { useSwag } from '../contexts/SwagContext';
import { useSettings } from '../contexts/SettingsContext';
import { generateQuizStreaming } from '../utils/api';
import QuizShareDialog from './QuizShareDialog';

export default function QuizPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showSuccess, showError, showWarning } = useToast();
  const { getToken } = useAuth();
  const { getCurrentProjectId, currentProject } = useProject();
  const { snippets } = useSwag();
  const { settings } = useSettings();
  
  const [allStatistics, setAllStatistics] = useState<QuizStatistic[]>([]);
  
  // Filter statistics by current project
  const statistics = useMemo(() => {
    const currentProjectId = currentProject?.id || null;
    if (!currentProjectId) {
      // No project selected - show all quizzes
      return allStatistics;
    }
    // Filter by current project
    return allStatistics.filter(quiz => quiz.projectId === currentProjectId);
  }, [allStatistics, currentProject]);
  const [summary, setSummary] = useState<{
    totalQuizzes: number;
    averageScore: number;
    averagePercentage: number;
    highestScore: number;
    lowestScore: number;
    totalQuestionsAnswered: number;
    totalCorrectAnswers: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastQuizSave, setLastQuizSave] = useState<number>(0);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  
  // Quiz modal state
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState<any | null>(null);
  const [quizMetadata, setQuizMetadata] = useState<{
    snippetIds: string[];
    startTime: number;
    enrichment: boolean;
    quizId?: string;
  } | null>(null);
  
  // Quiz sharing state
  const [shareQuiz, setShareQuiz] = useState<{ quiz: any; enrichment: boolean } | null>(null);

  useEffect(() => {
    loadStatistics();
    
    // Listen for new quiz saves from other pages (e.g., Feed page)
    const handleQuizSaved = () => {
      console.log('🔔 Quiz saved event received, reloading statistics');
      loadStatistics();
    };
    
    window.addEventListener('quiz-saved', handleQuizSaved);
    
    return () => {
      window.removeEventListener('quiz-saved', handleQuizSaved);
    };
  }, []);

  // Sync quiz progress to Google Drive (debounced 10 seconds)
  useEffect(() => {
    if (lastQuizSave === 0) return;

    const isSyncEnabled = () => {
      const token = localStorage.getItem('google_drive_access_token');
      const autoSync = localStorage.getItem('auto_sync_enabled') === 'true';
      return token && token.length > 0 && autoSync;
    };

    if (!isSyncEnabled()) return;

    const syncTimeout = setTimeout(async () => {
      try {
        const result = await googleDriveSync.syncQuizProgress();
        if (result.success) {
          console.log('✅ Quiz progress synced to Google Drive');
        }
      } catch (error) {
        console.error('❌ Failed to sync quiz progress:', error);
      }
    }, 10000); // 10 second debounce

    return () => clearTimeout(syncTimeout);
  }, [lastQuizSave]);

  // Reload statistics when page becomes visible (e.g., after completing a quiz)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Quiz page visible - reloading statistics');
        loadStatistics();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', loadStatistics);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', loadStatistics);
    };
  }, []);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      const [stats, summaryData] = await Promise.all([
        quizDB.getQuizStatistics(20), // Get last 20 quizzes
        quizDB.getStatisticsSummary()
      ]);
      
      console.log('📊 Loaded quiz statistics:', {
        totalQuizzes: stats.length,
        completed: stats.filter(s => s.completed).length,
        incomplete: stats.filter(s => !s.completed).length,
        quizzes: stats.map(s => ({
          id: s.id.substring(0, 8),
          title: s.quizTitle,
          completed: s.completed,
          hasQuizData: !!s.quizData
        }))
      });
      
      setAllStatistics(stats);
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to load quiz statistics:', error);
      showError(t('quiz.errorLoadingStats'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuiz = async (id: string, title: string) => {
    if (!confirm(t('quiz.confirmDelete', { title }))) {
      return;
    }

    try {
      await quizDB.deleteQuizStatistic(id);
      showSuccess(t('quiz.quizDeleted'));
      await loadStatistics();
    } catch (error) {
      console.error('Failed to delete quiz:', error);
      showError(t('quiz.errorDeletingQuiz'));
    }
  };

  const handleRestartQuiz = async (stat: QuizStatistic) => {
    // If quiz data exists, start immediately
    if (stat.quizData) {
      console.log('✅ Using stored quiz data:', stat.quizTitle);
      
      setQuizMetadata({
        snippetIds: stat.snippetIds,
        startTime: Date.now(),
        enrichment: stat.enrichment,
        quizId: stat.id
      });
      
      setCurrentQuiz(stat.quizData);
      setShowQuizModal(true);
      return;
    }
    
    // Quiz data not available - show error instead of regenerating
    // This prevents repeated API calls when providers are rate-limited
    console.log('⚠️ Quiz data not available for:', stat.quizTitle);
    showError('Quiz data not available. Please generate a new quiz instead.');
  };

  const handleCreateNewQuiz = async () => {
    if (snippets.length === 0) {
      showWarning('No snippets available. Please add some snippets first.');
      return;
    }

    try {
      setIsGeneratingQuiz(true);
      const token = await getToken();
      if (!token) {
        showError('Authentication required. Please sign in.');
        return;
      }
      
      const enabledProviders = settings.providers.filter(p => p.enabled !== false);
      
      if (enabledProviders.length === 0) {
        showError('No LLM providers enabled. Please enable at least one provider in Settings.');
        return;
      }

      // Combine all snippet content
      const content = snippets
        .map(s => `## ${s.title || 'Untitled'}\n\n${s.content}`)
        .join('\n\n');
      
      if (content.trim().length === 0) {
        showWarning('All snippets are empty. Please add content to your snippets.');
        return;
      }

      console.log(`🎯 Generating quiz from ${snippets.length} snippet(s), ${content.length} characters`);

      const enrichment = true;
      const startTime = Date.now();
      
      // Initialize quiz with empty questions array
      const quiz = {
        title: `Quiz: ${snippets[0]?.title || 'Untitled'}${snippets.length > 1 ? ` +${snippets.length - 1}` : ''}`,
        questions: []
      };
      
      // Save placeholder quiz immediately
      const quizId = await quizDB.saveGeneratedQuiz(
        quiz.title,
        snippets.map(s => s.id),
        0,
        enrichment,
        quiz
      );
      
      console.log('💾 Placeholder quiz saved to database:', quizId);
      
      // Store metadata for updating on completion
      setQuizMetadata({
        snippetIds: snippets.map(s => s.id),
        startTime,
        enrichment,
        quizId
      });
      
      // Set initial quiz state
      setCurrentQuiz(quiz);
      setShowQuizModal(true);
      
      // Generate quiz with streaming - questions will appear progressively
      await generateQuizStreaming(
        content,
        enrichment,
        enabledProviders,
        token,
        // onQuestion callback
        (question, index, total) => {
          console.log(`✅ Question ${index + 1}/${total} received:`, question.prompt);
          
          // Add question to quiz
          setCurrentQuiz((prevQuiz: any) => {
            if (!prevQuiz) return prevQuiz;
            
            const updatedQuiz = {
              ...prevQuiz,
              questions: [...prevQuiz.questions, question]
            };
            
            // Update database with new question
            quizDB.saveGeneratedQuiz(
              updatedQuiz.title,
              snippets.map(s => s.id),
              updatedQuiz.questions.length,
              enrichment,
              updatedQuiz
            ).catch(err => console.error('Failed to update quiz in DB:', err));
            
            return updatedQuiz;
          });
        },
        // onComplete callback
        (questionsGenerated, duration) => {
          console.log(`✅ Quiz complete: ${questionsGenerated} questions in ${duration}ms`);
          showSuccess(`Quiz ready with ${questionsGenerated} questions!`);
          setIsGeneratingQuiz(false);
        },
        // onError callback
        (error) => {
          console.error('Quiz generation error:', error);
          showError(error);
          setIsGeneratingQuiz(false);
          setShowQuizModal(false);
          setCurrentQuiz(null);
        }
      );
      
      console.log('🎯 Streaming quiz generation started');
      
    } catch (error) {
      console.error('Failed to generate quiz:', error);
      showError(error instanceof Error ? error.message : 'Failed to generate quiz. Please try again.');
      setIsGeneratingQuiz(false);
    }
  };

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return t('quiz.today');
    if (days === 1) return t('quiz.yesterday');
    if (days < 7) return t('quiz.daysAgo', { days });
    
    return date.toLocaleDateString();
  };

  const getScoreColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-green-600 dark:text-green-400';
    if (percentage >= 70) return 'text-blue-600 dark:text-blue-400';
    if (percentage >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBg = (percentage: number): string => {
    if (percentage >= 90) return 'bg-green-100 dark:bg-green-900/30';
    if (percentage >= 70) return 'bg-blue-100 dark:bg-blue-900/30';
    if (percentage >= 50) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">{t('quiz.loadingStats')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 pb-24">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={t('quiz.backToChat')}
            >
              <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2 quiz-page-header" data-testid="quiz-page-title">
                <Brain className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                {t('quiz.title')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {t('quiz.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={handleCreateNewQuiz}
            disabled={isGeneratingQuiz || snippets.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            title={snippets.length === 0 ? 'No snippets available' : 'Generate quiz from all snippets'}
          >
            <Brain className="w-5 h-5" />
            {isGeneratingQuiz ? 'Generating...' : t('quiz.createNewQuiz')}
          </button>
        </div>

        {/* Summary Cards */}
        {summary && summary.totalQuizzes > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t('quiz.totalQuizzes')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{summary.totalQuizzes}</p>
                </div>
                <Trophy className="w-12 h-12 text-yellow-500" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t('quiz.averageScore')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {summary.averagePercentage.toFixed(0)}%
                  </p>
                </div>
                <TrendingUp className="w-12 h-12 text-blue-500" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t('quiz.highestScore')}</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {summary.highestScore.toFixed(0)}%
                  </p>
                </div>
                <Trophy className="w-12 h-12 text-green-500" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t('quiz.questionsAnswered')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {summary.totalQuestionsAnswered}
                  </p>
                </div>
                <Brain className="w-12 h-12 text-indigo-500" />
              </div>
            </div>
          </div>
        )}

        {/* Quiz List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('quiz.recentQuizzes')}</h2>
          </div>

          {statistics.length === 0 ? (
            <div className="p-12 text-center">
              <Brain className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {t('quiz.noQuizzesYet')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {t('quiz.noQuizzesDescription')}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 max-w-md mx-auto">
                💡 {t('quiz.quizMeHelp')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {statistics.map((stat) => (
                <div
                  key={stat.id}
                  className={`p-6 transition-colors cursor-pointer ${
                    stat.completed 
                      ? 'hover:bg-gray-50 dark:hover:bg-gray-750' 
                      : 'bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 border-l-4 border-yellow-500'
                  }`}
                  onClick={() => handleRestartQuiz(stat)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {stat.quizTitle}
                        </h3>
                        {!stat.completed ? (
                          <span className="px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200">
                            {t('quiz.clickToRestart')}
                          </span>
                        ) : (
                          <>
                            <span
                              className={`px-3 py-1 rounded-full text-sm font-semibold ${getScoreBg(stat.percentage)} ${getScoreColor(stat.percentage)}`}
                            >
                              {stat.score}/{stat.totalQuestions} ({stat.percentage}%)
                            </span>
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                              {t('quiz.clickToRetake') || 'Click to Retake'}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(stat.completedAt)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDuration(stat.timeTaken)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Brain className="w-4 h-4" />
                          {t('quiz.snippetCount', { count: stat.snippetIds.length })}
                        </div>
                        {stat.enrichment && (
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
                            {t('quiz.enriched')}
                          </span>
                        )}
                        {!stat.synced && (
                          <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs font-medium">
                            {t('quiz.notSynced')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {stat.quizData && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShareQuiz({ quiz: stat.quizData, enrichment: stat.enrichment || false });
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title={t('quiz.shareQuiz') || 'Share Quiz'}
                        >
                          <Share2 className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuiz(stat.id, stat.quizTitle);
                        }}
                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title={t('quiz.deleteQuiz')}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Expandable answer details - could be added later */}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quiz Modal */}
      {showQuizModal && currentQuiz && quizMetadata && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <QuizCard
            quiz={currentQuiz}
            onClose={() => {
              console.log('❌ Quiz modal closed without completion');
              console.log('📝 Quiz should remain in database as incomplete');
              setShowQuizModal(false);
              setCurrentQuiz(null);
              setQuizMetadata(null);
              // Reload statistics to ensure the incomplete quiz is visible
              loadStatistics();
            }}
            onComplete={async (score, total, answers) => {
              const percentage = Math.round((score / total) * 100);
              const timeTaken = Date.now() - quizMetadata.startTime;
              
              try {
                // Update the generated quiz with completion data
                if (quizMetadata.quizId) {
                  await quizDB.updateQuizCompletion(quizMetadata.quizId, score, timeTaken, answers);
                  
                  // Sync to Google Sheets (async, don't block UI)
                  const token = await getToken();
                  if (token) {
                    syncSingleQuizStatistic(quizMetadata.quizId, token)
                      .then(synced => {
                        if (synced) {
                          console.log('✅ Quiz statistic synced to Google Sheets');
                          // Reload statistics to reflect synced status
                          loadStatistics();
                        }
                      })
                      .catch(error => {
                        console.error('Failed to sync quiz statistic:', error);
                        // Will retry on next background sync
                      });
                  }
                } else {
                  // Fallback to old method if quizId is not available
                  console.warn('No quizId found, using fallback save method');
                  const currentProjectId = getCurrentProjectId();
                  await quizDB.saveQuizStatistic({
                    quizTitle: currentQuiz.title,
                    snippetIds: quizMetadata.snippetIds,
                    score,
                    totalQuestions: total,
                    timeTaken,
                    completedAt: new Date().toISOString(),
                    answers,
                    enrichment: quizMetadata.enrichment,
                    completed: true,
                    projectId: currentProjectId || undefined  // Auto-tag with current project
                  });
                }
                
                showSuccess(`Quiz completed! Score: ${score}/${total} (${percentage}%)`);
                
                // Reload statistics to show the completed quiz
                await loadStatistics();
                
                // Trigger Google Drive sync (debounced)
                setLastQuizSave(Date.now());
              } catch (error) {
                console.error('Failed to save quiz statistic:', error);
                showWarning(`Quiz completed! Score: ${score}/${total} (${percentage}%) - Statistics not saved`);
              }
            }}
          />
        </div>
      )}

      {/* Quiz Share Dialog */}
      {shareQuiz && (
        <QuizShareDialog
          quiz={shareQuiz.quiz}
          enrichment={shareQuiz.enrichment}
          onClose={() => setShareQuiz(null)}
        />
      )}
    </div>
  );
};
