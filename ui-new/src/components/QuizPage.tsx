import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quizDB, type QuizStatistic } from '../db/quizDb';
import { Trophy, Brain, Clock, TrendingUp, Calendar, ArrowLeft, Trash2 } from 'lucide-react';
import { useToast } from './ToastManager';

export const QuizPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [statistics, setStatistics] = useState<QuizStatistic[]>([]);
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

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      const [stats, summaryData] = await Promise.all([
        quizDB.getQuizStatistics(20), // Get last 20 quizzes
        quizDB.getStatisticsSummary()
      ]);
      setStatistics(stats);
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to load quiz statistics:', error);
      showError('Failed to load quiz statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuiz = async (id: string, title: string) => {
    if (!confirm(`Delete quiz "${title}"?`)) {
      return;
    }

    try {
      await quizDB.deleteQuizStatistic(id);
      showSuccess('Quiz deleted');
      await loadStatistics();
    } catch (error) {
      console.error('Failed to delete quiz:', error);
      showError('Failed to delete quiz');
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
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    
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
        <div className="text-gray-600 dark:text-gray-400">Loading quiz statistics...</div>
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
              title="Back to Chat"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Brain className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                Quiz Statistics
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Track your learning progress and quiz performance
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/swag')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Brain className="w-5 h-5" />
            Create New Quiz
          </button>
        </div>

        {/* Summary Cards */}
        {summary && summary.totalQuizzes > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Quizzes</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{summary.totalQuizzes}</p>
                </div>
                <Trophy className="w-12 h-12 text-yellow-500" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Average Score</p>
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
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Highest Score</p>
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
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Questions Answered</p>
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
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recent Quizzes</h2>
          </div>

          {statistics.length === 0 ? (
            <div className="p-12 text-center">
              <Brain className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No Quizzes Yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create your first quiz from the Swag page by selecting snippets and pressing Ctrl+Q
              </p>
              <button
                onClick={() => navigate('/swag')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <Brain className="w-5 h-5" />
                Go to Swag Page
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {statistics.map((stat) => (
                <div
                  key={stat.id}
                  className="p-6 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {stat.quizTitle}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${getScoreBg(stat.percentage)} ${getScoreColor(stat.percentage)}`}
                        >
                          {stat.score}/{stat.totalQuestions} ({stat.percentage}%)
                        </span>
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
                          {stat.snippetIds.length} snippet{stat.snippetIds.length !== 1 ? 's' : ''}
                        </div>
                        {stat.enrichment && (
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
                            Enriched
                          </span>
                        )}
                        {!stat.synced && (
                          <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs font-medium">
                            Not synced
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteQuiz(stat.id, stat.quizTitle)}
                      className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Delete quiz"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Expandable answer details - could be added later */}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
