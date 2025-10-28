import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { quizAnalyticsDb, type TopicPerformance } from '../../db/quizAnalyticsDb';
import './TopicPerformance.css';

export function TopicPerformanceComponent() {
  const [topics, setTopics] = useState<TopicPerformance[]>([]);
  const [sortBy, setSortBy] = useState<'score' | 'quizzes'>('score');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTopics();
  }, []);

  async function loadTopics() {
    try {
      const topicData = await quizAnalyticsDb.getTopicPerformance();
      setTopics(topicData.sort((a, b) => b.averageScore - a.averageScore));
    } catch (error) {
      console.error('Failed to load topic performance:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleSort(sortType: 'score' | 'quizzes') {
    setSortBy(sortType);
    if (sortType === 'score') {
      setTopics([...topics].sort((a, b) => b.averageScore - a.averageScore));
    } else {
      setTopics([...topics].sort((a, b) => b.quizzesTaken - a.quizzesTaken));
    }
  }

  const chartData = topics.slice(0, 10).map(topic => ({
    name: topic.topic.length > 15 ? topic.topic.slice(0, 15) + '...' : topic.topic,
    score: Math.round(topic.averageScore),
    quizzes: topic.quizzesTaken
  }));

  const getBarColor = (score: number): string => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#2196F3';
    if (score >= 40) return '#FF9800';
    return '#F44336';
  };

  if (loading) {
    return <div className="topic-performance loading">Loading topic performance...</div>;
  }

  if (topics.length === 0) {
    return (
      <div className="topic-performance empty">
        <p>No topic data available yet. Complete more quizzes to see topic performance!</p>
      </div>
    );
  }

  return (
    <div className="topic-performance">
      <div className="header">
        <h2>Performance by Topic</h2>
        <div className="sort-controls">
          <button
            className={sortBy === 'score' ? 'active' : ''}
            onClick={() => handleSort('score')}
          >
            Sort by Score
          </button>
          <button
            className={sortBy === 'quizzes' ? 'active' : ''}
            onClick={() => handleSort('quizzes')}
          >
            Sort by Quizzes
          </button>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis 
              dataKey="name" 
              angle={-45} 
              textAnchor="end" 
              height={100}
              fontSize={12}
            />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Bar dataKey="score" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Table */}
      <table className="topic-table">
        <thead>
          <tr>
            <th>Topic</th>
            <th>Quizzes</th>
            <th>Avg Score</th>
            <th>Best</th>
            <th>Worst</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {topics.map(topic => (
            <tr key={topic.topic}>
              <td><strong>{topic.topic}</strong></td>
              <td>{topic.quizzesTaken}</td>
              <td>
                <span className={`score ${topic.averageScore >= 80 ? 'good' : topic.averageScore >= 60 ? 'ok' : 'poor'}`}>
                  {Math.round(topic.averageScore)}%
                </span>
              </td>
              <td>{Math.round(topic.bestScore)}%</td>
              <td>{Math.round(topic.worstScore)}%</td>
              <td>
                <span className={`trend ${topic.trend}`}>
                  {topic.trend === 'improving' && '📈'}
                  {topic.trend === 'declining' && '📉'}
                  {topic.trend === 'stable' && '➡️'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
