import { useEffect, useState } from 'react';
import { quizAnalyticsDb } from '../../db/quizAnalyticsDb';
import './OverviewStats.css';

interface OverviewData {
  totalQuizzes: number;
  averageScore: number;
  totalQuestions: number;
  totalTimeSpent: number;
  currentStreak: number;
  longestStreak: number;
}

export function OverviewStats() {
  const [stats, setStats] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const quizzes = await quizAnalyticsDb.getQuizResults();
      const streak = await quizAnalyticsDb.getStudyStreak();

      const totalQuizzes = quizzes.length;
      const totalQuestions = quizzes.reduce((sum, q) => sum + q.totalQuestions, 0);
      const averageScore = totalQuizzes > 0
        ? quizzes.reduce((sum, q) => sum + q.score, 0) / totalQuizzes
        : 0;
      const totalTimeSpent = quizzes.reduce((sum, q) => sum + q.timeSpent, 0);

      setStats({
        totalQuizzes,
        averageScore: Math.round(averageScore),
        totalQuestions,
        totalTimeSpent,
        currentStreak: streak?.currentStreak || 0,
        longestStreak: streak?.longestStreak || 0
      });
    } catch (error) {
      console.error('Failed to load overview stats:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  if (loading) {
    return <div className="overview-stats loading">Loading statistics...</div>;
  }

  if (!stats) {
    return <div className="overview-stats error">Failed to load statistics</div>;
  }

  return (
    <div className="overview-stats">
      <div className="stat-card">
        <div className="stat-icon">📊</div>
        <div className="stat-value">{stats.totalQuizzes}</div>
        <div className="stat-label">Quizzes Taken</div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">🎯</div>
        <div className="stat-value">{stats.averageScore}%</div>
        <div className="stat-label">Average Score</div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">❓</div>
        <div className="stat-value">{stats.totalQuestions}</div>
        <div className="stat-label">Questions Answered</div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">⏱️</div>
        <div className="stat-value">{formatTime(stats.totalTimeSpent)}</div>
        <div className="stat-label">Time Spent</div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">🔥</div>
        <div className="stat-value">{stats.currentStreak}</div>
        <div className="stat-label">Current Streak</div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">👑</div>
        <div className="stat-value">{stats.longestStreak}</div>
        <div className="stat-label">Longest Streak</div>
      </div>
    </div>
  );
}
