import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { quizDB, type QuizStatistic } from '../db/quizDb';
import { Trophy, Brain, Clock, TrendingUp, Calendar, ArrowLeft, Trash2, Share2, Edit } from 'lucide-react';
import { useToast } from './ToastManager';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import { QuizCard } from './QuizCard';
import { syncSingleQuizStatistic } from '../utils/quizSync';
import { googleDriveSync } from '../services/googleDriveSync';
import QuizShareDialog from './QuizShareDialog';
import QuizEditorDialog from './QuizEditorDialog';
import type { Quiz } from './QuizCard';

export default function QuizPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showSuccess, showError, showWarning } = useToast();
  const { getToken } = useAuth();
  const { getCurrentProjectId, currentProject } = useProject();
  
  const [allStatistics, setAllStatistics] = useState<QuizStatistic[]>([]);
  
  // Filter statistics by current project
  const statistics = useMemo(() => {
    const currentProjectId = currentProject?.id || null;
    if (!currentProjectId) {
      // No project selected - show only quizzes without a project (default project)
      return allStatistics.filter(quiz => !quiz.projectId);
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
  
  // Quiz editing state
  const [editingQuiz, setEditingQuiz] = useState<{ quiz: Quiz; statId: string } | null>(null);

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
          hasQuizData: !!s.quizData,
          firstQuestionAnswerId: s.quizData?.questions?.[0]?.answerId
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

  const handleEditQuiz = (stat: QuizStatistic) => {
    if (!stat.quizData) {
      showError('Quiz data not available for editing');
      return;
    }
    setEditingQuiz({ quiz: stat.quizData, statId: stat.id });
  };

  const handleSaveEditedQuiz = async (updatedQuiz: Quiz) => {
    if (!editingQuiz) return;
    try {
      console.log('💾 Saving edited quiz:', {
        statId: editingQuiz.statId,
        title: updatedQuiz.title,
        questionCount: updatedQuiz.questions.length,
        firstQuestionAnswerId: updatedQuiz.questions[0]?.answerId
      });
      
      await quizDB.updateQuizData(editingQuiz.statId, updatedQuiz);
      showSuccess('Quiz updated successfully');
      setEditingQuiz(null);
      
      // Reload statistics to get the updated quiz data
      await loadStatistics();
      
      console.log('✅ Quiz saved and statistics reloaded');
    } catch (error) {
      showError('Failed to update quiz');
      console.error('Quiz update error:', error);
    }
  };

  const handleRestartQuiz = async (stat: QuizStatistic) => {
    // Always fetch fresh data from database to ensure we have latest edits
    try {
      const freshStat = await quizDB.getQuizStatistic(stat.id);
      
      if (!freshStat) {
        showError('Quiz not found');
        return;
      }
      
      if (!freshStat.quizData) {
        console.log('⚠️ Quiz data not available for:', freshStat.quizTitle);
        showError('Quiz data not available. Please generate a new quiz instead.');
        return;
      }
      
      console.log('🎮 Starting quiz (fresh from DB):', {
        title: freshStat.quizTitle,
        statId: freshStat.id,
        questionCount: freshStat.quizData?.questions?.length,
        firstQuestionAnswerId: freshStat.quizData?.questions?.[0]?.answerId
      });
      
      setQuizMetadata({
        snippetIds: freshStat.snippetIds,
        startTime: Date.now(),
        enrichment: freshStat.enrichment,
        quizId: freshStat.id
      });
      
      console.log('📦 Setting currentQuiz state:', {
        title: freshStat.quizData.title,
        questionCount: freshStat.quizData.questions.length,
        firstQuestion: {
          id: freshStat.quizData.questions[0].id,
          answerId: freshStat.quizData.questions[0].answerId,
          correctChoiceId: freshStat.quizData.questions[0].correctChoiceId
        }
      });
      
      setCurrentQuiz(freshStat.quizData);
      setShowQuizModal(true);
    } catch (error) {
      console.error('Failed to load quiz:', error);
      showError('Failed to load quiz');
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
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditQuiz(stat);
                            }}
                            className="p-2 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                            title="Edit Quiz"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
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
                        </>
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
            key={quizMetadata.quizId || Date.now()} // Force re-render when quiz changes
            quiz={(() => {
              const mappedQuiz = {
                title: currentQuiz.title,
                questions: currentQuiz.questions.map((q: any) => ({
                  id: q.id,
                  prompt: q.prompt,
                  choices: q.choices,
                  answerId: q.answerId || q.correctChoiceId, // Prefer answerId (from editor) over correctChoiceId (from backend)
                  explanation: q.explanation
                }))
              };
              console.log('🎯 Passing quiz to QuizCard:', {
                title: mappedQuiz.title,
                questionCount: mappedQuiz.questions.length,
                firstQuestion: {
                  id: mappedQuiz.questions[0].id,
                  answerId: mappedQuiz.questions[0].answerId,
                  originalAnswerId: currentQuiz.questions[0].answerId,
                  originalCorrectChoiceId: currentQuiz.questions[0].correctChoiceId
                }
              });
              return mappedQuiz;
            })()}
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

      {/* Quiz Editor Dialog */}
      {editingQuiz && (
        <QuizEditorDialog
          quiz={editingQuiz.quiz}
          onSave={handleSaveEditedQuiz}
          onClose={() => setEditingQuiz(null)}
        />
      )}
    </div>
  );
};
