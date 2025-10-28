import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { quizAnalyticsDb, type QuizAnalytics } from '../../db/quizAnalyticsDb';
import './ScoreTrends.css';

type TimeRange = '7days' | '30days' | 'all';

export function ScoreTrends() {
  const [quizzes, setQuizzes] = useState<QuizAnalytics[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuizzes();
  }, [timeRange]);

  async function loadQuizzes() {
    try {
      let quizData = await quizAnalyticsDb.getQuizResults();

      // Filter by time range
      const now = Date.now();
      const cutoff = {
        '7days': now - 7 * 24 * 60 * 60 * 1000,
        '30days': now - 30 * 24 * 60 * 60 * 1000,
        'all': 0
      }[timeRange];

      quizData = quizData.filter(q => q.timestamp >= cutoff);
      setQuizzes(quizData);
    } catch (error) {
      console.error('Failed to load quiz trends:', error);
    } finally {
      setLoading(false);
    }
  }

  const chartData = quizzes
    .sort((a, b) => a.timestamp - b.timestamp) // Sort by time ascending for chart
    .map(quiz => ({
      date: new Date(quiz.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: quiz.score,
      questions: quiz.correctAnswers
    }));

  // Calculate moving average (5-quiz window)
  const movingAvg = chartData.map((item, idx) => {
    const window = chartData.slice(Math.max(0, idx - 4), idx + 1);
    const avg = window.reduce((sum, q) => sum + q.score, 0) / window.length;
    return { ...item, movingAverage: Math.round(avg) };
  });

  if (loading) {
    return <div className="score-trends loading">Loading score trends...</div>;
  }

  if (movingAvg.length === 0) {
    return (
      <div className="score-trends empty">
        <p>No quiz data available for this time range. Complete more quizzes to see trends!</p>
      </div>
    );
  }

  const trendDirection = movingAvg.length > 1 
    ? movingAvg[movingAvg.length - 1].movingAverage > movingAvg[0].movingAverage
    : null;

  return (
    <div className="score-trends">
      <div className="header">
        <h2>Score Trends</h2>
        <div className="time-range-selector">
          <button
            className={timeRange === '7days' ? 'active' : ''}
            onClick={() => setTimeRange('7days')}
          >
            Last 7 Days
          </button>
          <button
            className={timeRange === '30days' ? 'active' : ''}
            onClick={() => setTimeRange('30days')}
          >
            Last 30 Days
          </button>
          <button
            className={timeRange === 'all' ? 'active' : ''}
            onClick={() => setTimeRange('all')}
          >
            All Time
          </button>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={movingAvg}>
            <XAxis dataKey="date" fontSize={12} />
            <YAxis domain={[0, 100]} fontSize={12} />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="score" 
              stroke="#2196F3" 
              name="Quiz Score" 
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="movingAverage" 
              stroke="#FF9800" 
              name="Moving Average (5)" 
              strokeDasharray="5 5" 
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {trendDirection !== null && movingAvg.length > 1 && (
        <div className="trend-insight">
          {trendDirection ? (
            <span className="improving">📈 You're improving! Keep it up!</span>
          ) : (
            <span className="declining">📉 Consider reviewing past topics</span>
          )}
        </div>
      )}
    </div>
  );
}
