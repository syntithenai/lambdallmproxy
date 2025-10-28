# Quiz Analytics - Part 2: Dashboard UI Components

**Feature**: Quiz Analytics Dashboard UI  
**Status**: PLANNING  
**Priority**: HIGH  
**Estimated Effort**: 8 hours  
**Prerequisites**: Part 1 (Data Layer) must be complete

---

## Table of Contents

1. [Dashboard Overview](#dashboard-overview)
2. [Component Architecture](#component-architecture)
3. [UI Components](#ui-components)
4. [Chart Implementations](#chart-implementations)
5. [Responsive Design](#responsive-design)
6. [Internationalization](#internationalization)
7. [Implementation Steps](#implementation-steps)

---

## Dashboard Overview

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Research Agent - Quiz Analytics                        [Export]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ 📊 Total     │  │ 🎯 Average   │  │ 🔥 Current   │         │
│  │ 127 Quizzes  │  │ 78% Score    │  │ 12 Day Streak│         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ ⏱️  Total     │  │ 💯 Perfect   │  │ 🏆 Achievements│       │
│  │ 6.2 Hours    │  │ 23 Scores    │  │ 8 / 12        │       │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Performance Trends (Last 30 Days)          [7D][30D][All]     │
│                                                                  │
│   100% ┤                          ●                             │
│    80% ┤        ●     ●      ●         ●                        │
│    60% ┤    ●            ●                  ●                   │
│    40% ┤                                                        │
│     0% └─────────────────────────────────────────              │
│         Oct 1    Oct 8    Oct 15   Oct 22   Oct 28            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Performance by Topic                                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────┐        │
│  │ JavaScript          ████████████░░ 85% (12 quizzes)│        │
│  │ Python              ███████░░░░░░░ 67% (8 quizzes) │ ⚠️      │
│  │ Web Development     ██████████████ 92% (15 quizzes)│        │
│  │ Algorithms          █████░░░░░░░░░ 58% (5 quizzes) │ ⚠️      │
│  │ Databases           ████████░░░░░░ 71% (9 quizzes) │        │
│  └────────────────────────────────────────────────────┘        │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Insights & Recommendations                                     │
│                                                                  │
│  🎉 You're improving! Your average score increased by 12%       │
│  ⚠️  Python needs attention (67% avg) - Consider reviewing      │
│  💪 You're doing great with Web Development (92% avg)!          │
│  📚 Suggested: Take more Algorithms quizzes to build mastery    │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Recent Achievements                        [View All]          │
│                                                                  │
│  🔥 Week Warrior - 7 day streak!           Unlocked 2 days ago  │
│  💯 Perfectionist - 100% score achieved!   Unlocked 5 days ago  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Component Hierarchy

```
QuizAnalyticsDashboard.tsx
├── OverviewStats.tsx
│   ├── StatCard.tsx (x6)
│   └── AchievementProgress.tsx
├── PerformanceTrendsChart.tsx
│   ├── TimeRangeSelector.tsx
│   └── LineChart (recharts)
├── TopicPerformanceList.tsx
│   ├── TopicPerformanceBar.tsx (x N topics)
│   └── TopicDetailsModal.tsx
├── InsightsPanel.tsx
│   └── InsightCard.tsx (x N insights)
└── RecentAchievements.tsx
    └── AchievementCard.tsx (x N achievements)
```

---

## UI Components

### 1. QuizAnalyticsDashboard.tsx (Main Component)

**File**: `ui-new/src/components/QuizAnalyticsDashboard.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { quizAnalyticsService } from '../services/QuizAnalyticsService';
import { UserStats, QuizSession, TopicPerformance, Achievement } from '../types/analytics';
import OverviewStats from './OverviewStats';
import PerformanceTrendsChart from './PerformanceTrendsChart';
import TopicPerformanceList from './TopicPerformanceList';
import InsightsPanel from './InsightsPanel';
import RecentAchievements from './RecentAchievements';

export default function QuizAnalyticsDashboard() {
  const { t } = useTranslation();
  
  // State
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [quizSessions, setQuizSessions] = useState<QuizSession[]>([]);
  const [topicPerformance, setTopicPerformance] = useState<TopicPerformance[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  
  // Load data
  useEffect(() => {
    loadAnalyticsData();
  }, []);
  
  const loadAnalyticsData = async () => {
    setLoading(true);
    try {
      const [stats, sessions, topics, achievements] = await Promise.all([
        quizAnalyticsService.getUserStats(),
        quizAnalyticsService.getQuizSessions(),
        quizAnalyticsService.getTopicPerformance(),
        quizAnalyticsService.getAchievements()
      ]);
      
      setUserStats(stats);
      setQuizSessions(sessions);
      setTopicPerformance(topics);
      setAchievements(achievements);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleExportCSV = async () => {
    try {
      const csv = await quizAnalyticsService.exportToCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export CSV:', error);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (!userStats || quizSessions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">
          {t('quiz.analytics.noData', 'No quiz data yet. Complete some quizzes to see analytics!')}
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t('quiz.analytics.title', 'Quiz Analytics')}
        </h1>
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          {t('quiz.analytics.export', 'Export CSV')}
        </button>
      </div>
      
      {/* Overview Stats */}
      <OverviewStats stats={userStats} />
      
      {/* Performance Trends Chart */}
      <PerformanceTrendsChart sessions={quizSessions} />
      
      {/* Topic Performance */}
      <TopicPerformanceList topics={topicPerformance} />
      
      {/* Insights & Recommendations */}
      <InsightsPanel 
        stats={userStats}
        topics={topicPerformance}
        sessions={quizSessions}
      />
      
      {/* Recent Achievements */}
      <RecentAchievements achievements={achievements} />
    </div>
  );
}
```

### 2. OverviewStats.tsx

**File**: `ui-new/src/components/OverviewStats.tsx`

```typescript
import React from 'react';
import { useTranslation } from 'react-i18next';
import { UserStats } from '../types/analytics';

interface Props {
  stats: UserStats;
}

export default function OverviewStats({ stats }: Props) {
  const { t } = useTranslation();
  
  const statCards = [
    {
      icon: '📊',
      label: t('quiz.stats.totalQuizzes', 'Total Quizzes'),
      value: stats.totalQuizzesTaken,
      color: 'bg-blue-50 dark:bg-blue-900/20'
    },
    {
      icon: '🎯',
      label: t('quiz.stats.averageScore', 'Average Score'),
      value: `${stats.averageScore.toFixed(1)}%`,
      color: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      icon: '🔥',
      label: t('quiz.stats.currentStreak', 'Current Streak'),
      value: `${stats.currentStreak} ${t('quiz.stats.days', 'days')}`,
      color: 'bg-orange-50 dark:bg-orange-900/20'
    },
    {
      icon: '⏱️',
      label: t('quiz.stats.totalTime', 'Total Time'),
      value: formatDuration(stats.totalTimeSpent),
      color: 'bg-purple-50 dark:bg-purple-900/20'
    },
    {
      icon: '💯',
      label: t('quiz.stats.perfectScores', 'Perfect Scores'),
      value: stats.perfectScores,
      color: 'bg-yellow-50 dark:bg-yellow-900/20'
    },
    {
      icon: '🏆',
      label: t('quiz.stats.achievements', 'Achievements'),
      value: `${stats.achievementsUnlocked} / ${stats.totalAchievements}`,
      color: 'bg-pink-50 dark:bg-pink-900/20'
    }
  ];
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {statCards.map((card, idx) => (
        <div
          key={idx}
          className={`${card.color} rounded-lg p-6 transition-transform hover:scale-105`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                {card.label}
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {card.value}
              </p>
            </div>
            <span className="text-4xl">{card.icon}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
```

### 3. PerformanceTrendsChart.tsx

**File**: `ui-new/src/components/PerformanceTrendsChart.tsx`

```typescript
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';
import { QuizSession } from '../types/analytics';

interface Props {
  sessions: QuizSession[];
}

type TimeRange = '7d' | '30d' | 'all';

export default function PerformanceTrendsChart({ sessions }: Props) {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  
  const chartData = useMemo(() => {
    // Filter by time range
    let filteredSessions = sessions;
    const now = Date.now();
    
    if (timeRange === '7d') {
      const sevenDaysAgo = subDays(now, 7).getTime();
      filteredSessions = sessions.filter(s => s.timestamp >= sevenDaysAgo);
    } else if (timeRange === '30d') {
      const thirtyDaysAgo = subDays(now, 30).getTime();
      filteredSessions = sessions.filter(s => s.timestamp >= thirtyDaysAgo);
    }
    
    // Sort by timestamp
    const sorted = [...filteredSessions].sort((a, b) => a.timestamp - b.timestamp);
    
    // Format for chart
    return sorted.map(s => ({
      date: format(new Date(s.timestamp), 'MMM d'),
      score: s.score,
      timestamp: s.timestamp
    }));
  }, [sessions, timeRange]);
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('quiz.analytics.performanceTrends', 'Performance Trends')}
        </h2>
        
        <div className="flex gap-2">
          {(['7d', '30d', 'all'] as TimeRange[]).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              {range === '7d' ? t('quiz.analytics.last7Days', 'Last 7 Days') :
               range === '30d' ? t('quiz.analytics.last30Days', 'Last 30 Days') :
               t('quiz.analytics.allTime', 'All Time')}
            </button>
          ))}
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="date" 
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#666"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Score']}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 4, fill: '#3b82f6' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### 4. TopicPerformanceList.tsx

**File**: `ui-new/src/components/TopicPerformanceList.tsx`

```typescript
import React from 'react';
import { useTranslation } from 'react-i18next';
import { TopicPerformance } from '../types/analytics';

interface Props {
  topics: TopicPerformance[];
}

export default function TopicPerformanceList({ topics }: Props) {
  const { t } = useTranslation();
  
  // Sort by average score descending
  const sortedTopics = [...topics].sort((a, b) => b.averageScore - a.averageScore);
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
        {t('quiz.analytics.topicPerformance', 'Performance by Topic')}
      </h2>
      
      <div className="space-y-4">
        {sortedTopics.map(topic => (
          <TopicPerformanceBar key={topic.topic} topic={topic} />
        ))}
      </div>
    </div>
  );
}

function TopicPerformanceBar({ topic }: { topic: TopicPerformance }) {
  const { t } = useTranslation();
  
  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 70) return 'bg-blue-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  const getMasteryBadge = (level: string) => {
    const badges = {
      'beginner': { icon: '🌱', color: 'text-yellow-600' },
      'intermediate': { icon: '🌿', color: 'text-blue-600' },
      'advanced': { icon: '🌳', color: 'text-green-600' }
    };
    return badges[level as keyof typeof badges] || badges.beginner;
  };
  
  const badge = getMasteryBadge(topic.masteryLevel);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xl ${badge.color}`}>{badge.icon}</span>
          <span className="font-medium text-gray-900 dark:text-white capitalize">
            {topic.topic}
          </span>
          {topic.needsImprovement && (
            <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
              {t('quiz.analytics.needsWork', 'Needs Work')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {topic.quizzesTaken} {t('quiz.analytics.quizzes', 'quizzes')}
          </span>
          <span className="font-bold text-gray-900 dark:text-white">
            {topic.averageScore.toFixed(1)}%
          </span>
        </div>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full ${getPerformanceColor(topic.averageScore)} transition-all duration-500`}
          style={{ width: `${topic.averageScore}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {t('quiz.analytics.best', 'Best')}: {topic.bestScore.toFixed(1)}%
        </span>
        <span>
          {t('quiz.analytics.recent', 'Recent')}: {topic.recentTrend === 'improving' ? '📈' : topic.recentTrend === 'declining' ? '📉' : '➡️'}
        </span>
      </div>
    </div>
  );
}
```

### 5. InsightsPanel.tsx

**File**: `ui-new/src/components/InsightsPanel.tsx`

```typescript
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { UserStats, TopicPerformance, QuizSession } from '../types/analytics';

interface Props {
  stats: UserStats;
  topics: TopicPerformance[];
  sessions: QuizSession[];
}

export default function InsightsPanel({ stats, topics, sessions }: Props) {
  const { t } = useTranslation();
  
  const insights = useMemo(() => {
    const insights: Array<{ type: string; message: string; icon: string }> = [];
    
    // Improvement trend
    if (sessions.length >= 5) {
      const recent5 = sessions.slice(-5);
      const older5 = sessions.slice(-10, -5);
      
      if (recent5.length > 0 && older5.length > 0) {
        const recentAvg = recent5.reduce((sum, s) => sum + s.score, 0) / recent5.length;
        const olderAvg = older5.reduce((sum, s) => sum + s.score, 0) / older5.length;
        
        if (recentAvg > olderAvg + 5) {
          insights.push({
            type: 'success',
            icon: '🎉',
            message: t('quiz.insights.improving', 
              `You're improving! Your average score increased by ${(recentAvg - olderAvg).toFixed(1)}%`)
          });
        } else if (recentAvg < olderAvg - 5) {
          insights.push({
            type: 'warning',
            icon: '📉',
            message: t('quiz.insights.declining',
              `Your scores have declined by ${(olderAvg - recentAvg).toFixed(1)}%. Consider reviewing basics.`)
          });
        }
      }
    }
    
    // Weak topics
    const weakTopics = topics.filter(t => t.needsImprovement && t.quizzesTaken >= 3);
    weakTopics.forEach(topic => {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        message: t('quiz.insights.weakTopic',
          `${topic.topic} needs attention (${topic.averageScore.toFixed(1)}% avg) - Consider reviewing`)
      });
    });
    
    // Strong topics
    const strongTopics = topics.filter(t => t.averageScore >= 90 && t.quizzesTaken >= 3);
    if (strongTopics.length > 0) {
      const best = strongTopics[0];
      insights.push({
        type: 'success',
        icon: '💪',
        message: t('quiz.insights.strongTopic',
          `You're doing great with ${best.topic} (${best.averageScore.toFixed(1)}% avg)!`)
      });
    }
    
    // Suggestions
    const underStudiedTopics = topics.filter(t => t.quizzesTaken < 3);
    if (underStudiedTopics.length > 0) {
      insights.push({
        type: 'info',
        icon: '📚',
        message: t('quiz.insights.suggestion',
          `Suggested: Take more ${underStudiedTopics[0].topic} quizzes to build mastery`)
      });
    }
    
    // Streak encouragement
    if (stats.currentStreak >= 7) {
      insights.push({
        type: 'success',
        icon: '🔥',
        message: t('quiz.insights.streak',
          `Amazing ${stats.currentStreak} day streak! Keep it going!`)
      });
    }
    
    return insights;
  }, [stats, topics, sessions, t]);
  
  if (insights.length === 0) {
    return null;
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
        {t('quiz.analytics.insights', 'Insights & Recommendations')}
      </h2>
      
      <div className="space-y-3">
        {insights.map((insight, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 p-4 rounded-lg ${
              insight.type === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
              insight.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20' :
              'bg-blue-50 dark:bg-blue-900/20'
            }`}
          >
            <span className="text-2xl">{insight.icon}</span>
            <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">
              {insight.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 6. RecentAchievements.tsx

**File**: `ui-new/src/components/RecentAchievements.tsx`

```typescript
import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Achievement } from '../types/analytics';

interface Props {
  achievements: Achievement[];
}

export default function RecentAchievements({ achievements }: Props) {
  const { t } = useTranslation();
  
  const unlockedAchievements = achievements
    .filter(a => a.isUnlocked)
    .sort((a, b) => (b.unlockedAt || 0) - (a.unlockedAt || 0))
    .slice(0, 5);  // Show 5 most recent
  
  if (unlockedAchievements.length === 0) {
    return null;
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('quiz.analytics.recentAchievements', 'Recent Achievements')}
        </h2>
        <button className="text-sm text-blue-500 hover:text-blue-600">
          {t('quiz.analytics.viewAll', 'View All')}
        </button>
      </div>
      
      <div className="space-y-3">
        {unlockedAchievements.map(achievement => (
          <div
            key={achievement.id}
            className="flex items-center gap-4 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg"
          >
            <span className="text-4xl">{achievement.icon}</span>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {achievement.name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {achievement.description}
              </p>
            </div>
            <span className="text-xs text-gray-500">
              {t('quiz.analytics.unlocked', 'Unlocked')} {formatDistanceToNow(new Date(achievement.unlockedAt || 0), { addSuffix: true })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Chart Implementations

### Chart Library: Recharts

**Why Recharts?**
- ✅ React-native, composable API
- ✅ Responsive and mobile-friendly
- ✅ Good TypeScript support
- ✅ Lightweight (~150KB gzipped)
- ✅ Active maintenance

**Alternative Considered**: Chart.js (more features, but heavier and less React-friendly)

### Chart Types Used

1. **Line Chart** - Performance trends over time
2. **Bar Chart** (horizontal) - Topic performance comparison
3. **Area Chart** (future) - Question difficulty distribution

---

## Responsive Design

### Breakpoints

```css
/* Mobile: < 768px */
- Single column layout
- Stacked stat cards (1 column)
- Charts full-width with reduced height (250px)
- Hide secondary insights

/* Tablet: 768px - 1024px */
- 2 column stat cards
- Charts full-width (300px height)
- Show all content

/* Desktop: > 1024px */
- 3 column stat cards
- Charts with optimal spacing (350px height)
- Side-by-side layouts where appropriate
```

### Mobile Optimizations

```typescript
// PerformanceTrendsChart.tsx - Mobile adjustments
const isMobile = window.innerWidth < 768;

<ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
  <LineChart data={chartData}>
    <XAxis 
      dataKey="date"
      angle={isMobile ? -45 : 0}  // Rotate labels on mobile
      textAnchor={isMobile ? "end" : "middle"}
      height={isMobile ? 60 : 30}
    />
    {/* ... */}
  </LineChart>
</ResponsiveContainer>
```

---

## Internationalization

### Translation Keys Required

**File**: `ui-new/public/locales/en/translation.json`

```json
{
  "quiz": {
    "analytics": {
      "title": "Quiz Analytics",
      "export": "Export CSV",
      "noData": "No quiz data yet. Complete some quizzes to see analytics!",
      "performanceTrends": "Performance Trends",
      "topicPerformance": "Performance by Topic",
      "insights": "Insights & Recommendations",
      "recentAchievements": "Recent Achievements",
      "last7Days": "Last 7 Days",
      "last30Days": "Last 30 Days",
      "allTime": "All Time",
      "viewAll": "View All",
      "unlocked": "Unlocked",
      "needsWork": "Needs Work",
      "quizzes": "quizzes",
      "best": "Best",
      "recent": "Recent"
    },
    "stats": {
      "totalQuizzes": "Total Quizzes",
      "averageScore": "Average Score",
      "currentStreak": "Current Streak",
      "totalTime": "Total Time",
      "perfectScores": "Perfect Scores",
      "achievements": "Achievements",
      "days": "days"
    },
    "insights": {
      "improving": "You're improving! Your average score increased by {{percent}}%",
      "declining": "Your scores have declined by {{percent}}%. Consider reviewing basics.",
      "weakTopic": "{{topic}} needs attention ({{score}}% avg) - Consider reviewing",
      "strongTopic": "You're doing great with {{topic}} ({{score}}% avg)!",
      "suggestion": "Suggested: Take more {{topic}} quizzes to build mastery",
      "streak": "Amazing {{days}} day streak! Keep it going!"
    }
  }
}
```

---

## Implementation Steps

### Step 1: Install Dependencies (30 min)

```bash
cd ui-new
npm install recharts date-fns
npm install --save-dev @types/recharts
```

### Step 2: Create Type Definitions (30 min)

Create `ui-new/src/types/analytics.ts` with all interfaces from Part 1.

### Step 3: Build Components (6 hours)

**Order of Implementation**:
1. ✅ `QuizAnalyticsDashboard.tsx` (skeleton) - 30 min
2. ✅ `OverviewStats.tsx` - 1 hour
3. ✅ `PerformanceTrendsChart.tsx` - 1.5 hours
4. ✅ `TopicPerformanceList.tsx` - 1.5 hours
5. ✅ `InsightsPanel.tsx` - 1 hour
6. ✅ `RecentAchievements.tsx` - 1 hour
7. ✅ Integration & polish - 1.5 hours

### Step 4: Add Translations (1 hour)

Add translation keys to all 9 language files.

### Step 5: Testing (30 min)

- Test with no data
- Test with 1 quiz
- Test with 100+ quizzes
- Test all time ranges
- Test mobile responsive design
- Test dark mode

---

## Performance Optimization

### Lazy Loading

```typescript
// QuizPage.tsx - Lazy load analytics dashboard
const QuizAnalyticsDashboard = lazy(() => import('../components/QuizAnalyticsDashboard'));

// In component
<Suspense fallback={<LoadingSpinner />}>
  {showAnalytics && <QuizAnalyticsDashboard />}
</Suspense>
```

### Memoization

```typescript
// Cache expensive calculations
const topicInsights = useMemo(() => 
  calculateTopicInsights(topics, sessions),
  [topics, sessions]
);
```

### Virtual Scrolling (for 100+ topics)

```typescript
// If > 20 topics, use react-window for virtualization
import { FixedSizeList } from 'react-window';
```

---

## Accessibility (a11y)

### Requirements

1. **Keyboard Navigation**: All interactive elements focusable
2. **Screen Reader Support**: ARIA labels on charts
3. **Color Contrast**: WCAG AA compliance (4.5:1 minimum)
4. **Alt Text**: All visual insights have text equivalents

### Implementation

```typescript
// Chart accessibility
<ResponsiveContainer width="100%" height={300}>
  <LineChart 
    data={chartData}
    aria-label="Performance trends over time chart"
    role="img"
  >
    {/* ... */}
  </LineChart>
</ResponsiveContainer>

// Add text alternative
<div className="sr-only">
  Your average score over the last 30 days is {averageScore}%. 
  Trend: {trend}.
</div>
```

---

## Next Steps

1. ✅ Review Part 1 (Data Layer) completion
2. ✅ Install dependencies
3. ✅ Create type definitions
4. ✅ Build components (6-8 hours)
5. ✅ Add translations
6. ✅ Test thoroughly
7. ✅ Deploy to production

---

**Document Status**: READY FOR IMPLEMENTATION  
**Last Updated**: October 28, 2025  
**Previous Document**: `IMPLEMENTATION_QUIZ_ANALYTICS.md` (Part 1 - Data Layer)  
**Next Document**: `IMPLEMENTATION_FEED_ANALYTICS.md` (Feed Usage Analytics)
