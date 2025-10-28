import { useEffect, useState } from 'react';
import { quizAnalyticsDb, type Achievement } from '../../db/quizAnalyticsDb';
import './Achievements.css';

const ACHIEVEMENT_DEFINITIONS: Achievement[] = [
  { id: 'first_quiz', name: 'Getting Started', description: 'Complete your first quiz', icon: '🎓', unlocked: false, progress: 0, target: 1 },
  { id: 'quiz_10', name: 'Quiz Enthusiast', description: 'Complete 10 quizzes', icon: '📚', unlocked: false, progress: 0, target: 10 },
  { id: 'quiz_50', name: 'Quiz Master', description: 'Complete 50 quizzes', icon: '🏆', unlocked: false, progress: 0, target: 50 },
  { id: 'quiz_100', name: 'Century Club', description: 'Complete 100 quizzes', icon: '💯', unlocked: false, progress: 0, target: 100 },
  { id: 'perfect_score', name: 'Perfectionist', description: 'Score 100% on a quiz', icon: '⭐', unlocked: false, progress: 0, target: 1 },
  { id: 'streak_7', name: 'Week Warrior', description: '7-day study streak', icon: '🔥', unlocked: false, progress: 0, target: 7 },
  { id: 'streak_30', name: 'Month Marathoner', description: '30-day study streak', icon: '🚀', unlocked: false, progress: 0, target: 30 },
  { id: 'avg_80', name: 'High Achiever', description: 'Average score above 80%', icon: '🎯', unlocked: false, progress: 0, target: 80 },
];

export function AchievementsComponent() {
  const [achievements, setAchievements] = useState<Achievement[]>(ACHIEVEMENT_DEFINITIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    updateAchievements();
  }, []);

  async function updateAchievements() {
    try {
      const quizzes = await quizAnalyticsDb.getQuizResults();
      const streak = await quizAnalyticsDb.getStudyStreak();

      const totalQuizzes = quizzes.length;
      const avgScore = totalQuizzes > 0 
        ? quizzes.reduce((sum, q) => sum + q.score, 0) / totalQuizzes 
        : 0;
      const hasPerfectScore = quizzes.some(q => q.score === 100);
      const currentStreak = streak?.currentStreak || 0;

      const updated = ACHIEVEMENT_DEFINITIONS.map(ach => {
        let progress = 0;
        let unlocked = false;

        switch (ach.id) {
          case 'first_quiz':
          case 'quiz_10':
          case 'quiz_50':
          case 'quiz_100':
            progress = totalQuizzes;
            unlocked = totalQuizzes >= ach.target;
            break;
          case 'perfect_score':
            progress = hasPerfectScore ? 1 : 0;
            unlocked = hasPerfectScore;
            break;
          case 'streak_7':
          case 'streak_30':
            progress = currentStreak;
            unlocked = currentStreak >= ach.target;
            break;
          case 'avg_80':
            progress = Math.round(avgScore);
            unlocked = avgScore >= 80;
            break;
        }

        return { ...ach, progress, unlocked };
      });

      setAchievements(updated);
      
      // Save to database
      await quizAnalyticsDb.saveAchievements(updated);
    } catch (error) {
      console.error('Failed to update achievements:', error);
    } finally {
      setLoading(false);
    }
  }

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  if (loading) {
    return <div className="achievements loading">Loading achievements...</div>;
  }

  return (
    <div className="achievements">
      <div className="header">
        <h2>Achievements</h2>
        <div className="achievement-progress">
          {unlockedCount} / {achievements.length} unlocked
        </div>
      </div>

      <div className="achievement-grid">
        {achievements.map(ach => (
          <div key={ach.id} className={`achievement-card ${ach.unlocked ? 'unlocked' : 'locked'}`}>
            <div className="achievement-icon">{ach.icon}</div>
            <div className="achievement-name">{ach.name}</div>
            <div className="achievement-description">{ach.description}</div>
            <div className="achievement-progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${Math.min(100, (ach.progress / ach.target) * 100)}%` }}
              />
            </div>
            <div className="achievement-status">
              {ach.unlocked ? (
                <span className="unlocked-text">✓ Unlocked</span>
              ) : (
                <span className="progress-text">{ach.progress} / {ach.target}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
