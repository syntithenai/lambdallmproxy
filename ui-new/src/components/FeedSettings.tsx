/**
 * Feed Settings Component - Manage Search Terms and Preferences
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeed } from '../contexts/FeedContext';
import { X, Brain, Trash2, TrendingUp } from 'lucide-react';
import { feedDB, type UserPreferences, type TopicWeight } from '../db/feedDb';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export default function FeedSettings() {
  const { t } = useTranslation();
  const { preferences } = useFeed();
  
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicStats, setTopicStats] = useState<Map<string, { month: string; count: number }[]>>(new Map());
  const [topTopics, setTopTopics] = useState<Array<{ topic: string; count: number }>>([]);

  // Load user preferences and statistics
  useEffect(() => {
    loadFeedStatistics();
  }, []);

  const loadFeedStatistics = async () => {
    setLoading(true);
    try {
      // Load user preferences
      let prefs = await feedDB.getUserPreferences('default');
      if (!prefs) {
        prefs = await feedDB.initializeUserPreferences('default');
      }
      setUserPreferences(prefs);

      // Load topic statistics
      const stats = await feedDB.getTopicStatistics(6);
      setTopicStats(stats);

      // Get top 5 topics
      const top = await feedDB.getTopTopics(5);
      setTopTopics(top);
    } catch (error) {
      console.error('Failed to load feed statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Remove avoided topic
   */
  const handleRemoveAvoidTopic = async (topic: string) => {
    try {
      await feedDB.removeAvoidTopic('default', topic);
      await loadFeedStatistics();
    } catch (error) {
      console.error('Failed to remove avoided topic:', error);
    }
  };

  /**
   * Clear all blocked topics
   */
  const handleClearAllBlocks = async () => {
    if (!confirm('Are you sure you want to clear all blocked topics? This cannot be undone.')) {
      return;
    }
    try {
      await feedDB.clearAvoidTopics('default');
      await loadFeedStatistics();
    } catch (error) {
      console.error('Failed to clear avoided topics:', error);
    }
  };

  /**
   * Prepare chart data for topic trends
   */
  const prepareChartData = () => {
    if (topTopics.length === 0 || topicStats.size === 0) return [];

    // Get all unique months from top topics
    const allMonths = new Set<string>();
    for (const { topic } of topTopics) {
      const monthData = topicStats.get(topic);
      if (monthData) {
        monthData.forEach(({ month }) => allMonths.add(month));
      }
    }

    // Sort months chronologically
    const sortedMonths = Array.from(allMonths).sort();

    // Build chart data
    const chartData = sortedMonths.map(month => {
      const dataPoint: any = { month };
      for (const { topic } of topTopics) {
        const monthData = topicStats.get(topic);
        const monthCount = monthData?.find(m => m.month === month);
        dataPoint[topic] = monthCount ? monthCount.count : 0;
      }
      return dataPoint;
    });

    return chartData;
  };

  const chartData = prepareChartData();
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading feed settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Blocked Topics Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <X className="h-5 w-5 text-red-500" />
            Blocked Topics
          </h3>
          {userPreferences && userPreferences.avoidTopics.length > 0 && (
            <button
              onClick={handleClearAllBlocks}
              className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </button>
          )}
        </div>

        {userPreferences && userPreferences.avoidTopics.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-3">
              These topics are filtered from your feed. Click the X to unblock a topic.
            </p>
            <div className="flex flex-wrap gap-2">
              {userPreferences.avoidTopics.map((topic) => (
                <div
                  key={topic}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-sm"
                >
                  <span className="text-red-900">{topic}</span>
                  <button
                    onClick={() => handleRemoveAvoidTopic(topic)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    title="Remove block"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <X className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No blocked topics yet</p>
            <p className="text-sm mt-1">
              Click the "Block" button on feed items to filter out topics you don't want to see.
            </p>
          </div>
        )}
      </div>

      {/* ML-Learned Topics Section */}
      {userPreferences && userPreferences.learnedTopics.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Brain className="h-5 w-5 text-purple-500" />
            ML-Learned Interests
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            These topics are learned from your interactions using machine learning.
          </p>
          <div className="flex flex-wrap gap-2">
            {userPreferences.learnedTopics
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 20)
              .map((topicWeight: TopicWeight) => (
                <div
                  key={topicWeight.topic}
                  className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-sm"
                >
                  <span className="text-purple-900">{topicWeight.topic}</span>
                  <span className="text-purple-600 text-xs font-medium">
                    {Math.round(topicWeight.weight * 100)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Topic Statistics Chart */}
      {chartData.length > 0 && topTopics.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Topic Trends (Last 6 Months)
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Your top {topTopics.length} topics based on feed interactions
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {topTopics.map(({ topic }, index) => (
                <Line
                  key={topic}
                  type="monotone"
                  dataKey={topic}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Top Topics Summary */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Top Topics Overall</h4>
            <div className="space-y-2">
              {topTopics.map(({ topic, count }, index) => (
                <div key={topic} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <span className="text-gray-900">{topic}</span>
                  </div>
                  <span className="text-gray-600">{count} interactions</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Activity Summary Stats */}
      {userPreferences && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {userPreferences.interactionCount || 0}
              </div>
              <div className="text-sm text-gray-600">Total Interactions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {userPreferences.learnedTopics.length}
              </div>
              <div className="text-sm text-gray-600">Learned Topics</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {userPreferences.avoidTopics.length}
              </div>
              <div className="text-sm text-gray-600">Blocked Topics</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {userPreferences.quizEngagementCount || 0}
              </div>
              <div className="text-sm text-gray-600">Quizzes Generated</div>
            </div>
          </div>
        </div>
      )}

      {/* Content Maturity Level */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          🎓 Content Maturity Level
        </h3>
        
        <p className="text-sm text-gray-600 mb-4">
          Choose the appropriate content level for your feed. This affects language complexity, topic selection, and tone.
        </p>

        <select
          value={preferences.maturityLevel || 'adult'}
          onChange={async (e) => {
            const level = e.target.value as 'child' | 'youth' | 'adult' | 'academic';
            await feedDB.setMaturityLevel(level);
            // Force a re-render
            window.dispatchEvent(new Event('feed-maturity-changed'));
            // Reload statistics to reflect changes
            await loadFeedStatistics();
          }}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="child">Child (Ages 6-12) - Simple language, educational content</option>
          <option value="youth">Youth (Ages 13-17) - Age-appropriate topics, moderate complexity</option>
          <option value="adult">Adult (18+) - General audience, varied complexity</option>
          <option value="academic">Academic - Advanced topics, research-focused, technical</option>
        </select>

        <p className="text-xs text-gray-500 mt-2">
          This setting helps tailor content to your comprehension level and interests.
        </p>
      </div>

      {/* Learned Preferences from Feed Gestures */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            {t('feed.learnedPreferences')}
          </h3>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          {t('feed.learnedPreferencesDescription')}
        </p>

        {/* Liked topics */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            {t('feed.likedTopics', { count: preferences.likedTopics.length })}
          </h4>
          
          {preferences.likedTopics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {preferences.likedTopics.map((topic, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">
              {t('feed.stashToLearn')}
            </p>
          )}
        </div>

        {/* Disliked topics */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            {t('feed.dislikedTopics', { count: preferences.dislikedTopics.length })}
          </h4>
          
          {preferences.dislikedTopics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {preferences.dislikedTopics.map((topic, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">
              {t('feed.trashToLearn')}
            </p>
          )}
        </div>
      </div>

      {/* Usage hints */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">
          {t('feed.tipsTitle')}
        </h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• {t('feed.tip1')}</li>
          <li>• {t('feed.tip2')}</li>
          <li>• {t('feed.tip3')}</li>
          <li>• {t('feed.tip4')}</li>
        </ul>
      </div>
    </div>
  );
}
