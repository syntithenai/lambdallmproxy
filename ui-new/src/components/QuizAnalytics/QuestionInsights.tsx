import { useEffect, useState } from 'react';
import { quizAnalyticsDb } from '../../db/quizAnalyticsDb';
import './QuestionInsights.css';

interface QuestionDifficulty {
  questionText: string;
  topic: string;
  attempts: number;
  successRate: number;
  avgTimeSpent: number;
}

export function QuestionInsights() {
  const [difficultQuestions, setDifficultQuestions] = useState<QuestionDifficulty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInsights();
  }, []);

  async function loadInsights() {
    try {
      const quizzes = await quizAnalyticsDb.getQuizResults();
      
      // Aggregate question statistics
      const questionMap = new Map<string, QuestionDifficulty>();

      quizzes.forEach(quiz => {
        quiz.questionStats.forEach(q => {
          const existing = questionMap.get(q.questionText);
          
          if (existing) {
            existing.attempts++;
            existing.successRate = ((existing.successRate * (existing.attempts - 1)) + (q.correct ? 1 : 0)) / existing.attempts;
            existing.avgTimeSpent = ((existing.avgTimeSpent * (existing.attempts - 1)) + q.timeSpent) / existing.attempts;
          } else {
            questionMap.set(q.questionText, {
              questionText: q.questionText,
              topic: q.topic || 'Unknown',
              attempts: 1,
              successRate: q.correct ? 1 : 0,
              avgTimeSpent: q.timeSpent
            });
          }
        });
      });

      // Sort by success rate (ascending) to find most difficult
      const sorted = Array.from(questionMap.values())
        .filter(q => q.attempts >= 2) // Only questions seen multiple times
        .sort((a, b) => a.successRate - b.successRate)
        .slice(0, 10);

      setDifficultQuestions(sorted);
    } catch (error) {
      console.error('Failed to load question insights:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="question-insights loading">Loading question insights...</div>;
  }

  if (difficultQuestions.length === 0) {
    return (
      <div className="question-insights empty">
        <p>Take more quizzes to see challenging questions!</p>
      </div>
    );
  }

  return (
    <div className="question-insights">
      <h2>Most Challenging Questions</h2>
      <p className="subtitle">Questions you struggle with the most</p>

      <table className="insights-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Topic</th>
            <th>Attempts</th>
            <th>Success Rate</th>
            <th>Avg Time</th>
          </tr>
        </thead>
        <tbody>
          {difficultQuestions.map((q, idx) => (
            <tr key={idx}>
              <td className="question-text">{q.questionText}</td>
              <td><span className="topic-badge">{q.topic}</span></td>
              <td>{q.attempts}</td>
              <td>
                <span className={`success-rate ${q.successRate < 0.5 ? 'poor' : 'ok'}`}>
                  {Math.round(q.successRate * 100)}%
                </span>
              </td>
              <td>{Math.round(q.avgTimeSpent / 1000)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
