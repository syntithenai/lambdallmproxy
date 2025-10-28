# Plan: Quiz Analytics & Performance Tracking

**Date**: 2025-10-28  
**Status**: 📋 PLANNING  
**Priority**: HIGH (High value, medium complexity)  
**Estimated Implementation Time**: 16 hours

## Executive Summary

Provide detailed performance insights to help users track learning progress across topics and over time. This includes an analytics dashboard with topic performance tracking, score trends, question-level insights, achievements/milestones, and data export functionality.

## Current State Analysis

### Existing Quiz Implementation

**Quiz Generation** (`ui-new/src/components/QuizPage.tsx`):
- Generates 10 multiple-choice questions from snippets/feed items
- Immediate feedback on correct/incorrect answers
- Basic scoring (percentage correct)
- Results stored in IndexedDB locally

**Quiz Storage** (`ui-new/src/db/quizDb.ts`):
```typescript
interface QuizResult {
  id: string;
  timestamp: number;
  score: number;           // 0-100
  totalQuestions: number;  // 10
  correctAnswers: number;  // 0-10
  title?: string;
}
```

**Limitations**:
- ❌ No historical tracking or trends
- ❌ No topic-based performance analysis
- ❌ No question-level statistics
- ❌ No recommendations or insights
- ❌ No visualization (charts, graphs)
- ❌ No export functionality
- ❌ No streak tracking or achievements

## Requirements

### Functional Requirements

1. **Comprehensive Data Collection**:
   - Track all quiz attempts with full details
   - Store question-level performance (correct/incorrect, time spent)
   - Extract and store topics/keywords from quiz content
   - Link quizzes to source (snippet ID, feed item ID)

2. **Analytics Dashboard**:
   - Overview stats (total quizzes, average score, study streak)
   - Performance by topic (bar chart, table)
   - Score trends over time (line chart with filters)
   - Question-level insights (most difficult questions)
   - Recommended topics for improvement

3. **Achievements System**:
   - Milestones (10 quizzes, 50 quizzes, 100% score)
   - Streak tracking (days in a row)
   - Badges display
   - Progress towards next achievement

4. **Data Export**:
   - CSV export of all quiz results
   - Optional: Sync to Google Sheets
   - Privacy controls (clear history)

5. **Insights & Recommendations**:
   - Identify weak topics (< 70% average score)
   - Suggest re-taking specific quizzes
   - Generate new quizzes for weak topics
   - Trend analysis (improving/declining)

### Non-Functional Requirements

1. **Performance**:
   - Analytics load time < 500ms
   - Dashboard rendering < 100ms
   - Data export < 2 seconds

2. **Storage**:
   - IndexedDB storage < 50MB
   - Data retention policy (archive old data)
   - Efficient query performance

3. **Privacy**:
   - All data stored locally (IndexedDB)
   - Optional cloud sync (user consent)
   - Easy data deletion

## Enhanced Data Model

### QuizAnalytics (IndexedDB + Google Sheets Sync)

```typescript
interface QuizAnalytics {
  id: string;                    // quiz ID (UUID)
  timestamp: number;             // completion time (Unix timestamp)
  sourceSnippetId?: string;      // if generated from snippet
  sourceFeedItemId?: string;     // if generated from feed
  title: string;                 // quiz title
  topics: string[];              // extracted topics/keywords
  totalQuestions: number;        // 10
  correctAnswers: number;        // 0-10
  score: number;                 // percentage 0-100
  timeSpent: number;             // total milliseconds
  startTime: number;             // quiz start timestamp
  endTime: number;               // quiz end timestamp
  questionStats: QuestionStat[]; // detailed per-question stats
  synced: boolean;               // synced to Google Sheets?
  syncedAt?: number;             // when synced
}

interface QuestionStat {
  questionId: string;            // unique ID for the question
  questionText: string;          // the question itself
  correct: boolean;              // true if answered correctly
  timeSpent: number;             // milliseconds spent on this question
  attempts: number;              // 1 (if retry disabled) or multiple
  selectedAnswer: string;        // user's answer
  correctAnswer: string;         // the correct answer
  topic?: string;                // extracted topic for this question
}

interface TopicPerformance {
  topic: string;                 // topic name (e.g., "Machine Learning")
  quizzesTaken: number;          // total quizzes for this topic
  questionsSeen: number;         // total questions for this topic
  questionsCorrect: number;      // correct answers for this topic
  averageScore: number;          // average score percentage
  bestScore: number;             // highest score achieved
  worstScore: number;            // lowest score achieved
  lastQuizDate: number;          // most recent quiz timestamp
  totalTimeSpent: number;        // total milliseconds studying this topic
  trend: 'improving' | 'declining' | 'stable'; // performance trend
}

interface Achievement {
  id: string;                    // achievement ID
  name: string;                  // "Quiz Master"
  description: string;           // "Complete 50 quizzes"
  icon: string;                  // emoji or icon name
  unlocked: boolean;             // true if achieved
  progress: number;              // current progress (e.g., 25/50)
  target: number;                // target value (e.g., 50)
  dateUnlocked?: number;         // timestamp when unlocked
}

interface StudyStreak {
  currentStreak: number;         // days in a row
  longestStreak: number;         // all-time best streak
  lastQuizDate: number;          // last quiz completion date (Unix timestamp, midnight UTC)
  streakDates: number[];         // array of dates with quizzes (Unix timestamps, midnight UTC)
}
```

### Data Verification for Statistics

**Required Data Available**: ✅ All statistics can be calculated from existing schema

| Statistic | Data Source | Calculation |
|-----------|-------------|-------------|
| **Total Quizzes** | `quizResults.length` | Simple count |
| **Average Score** | `quizResults[].score` | `sum(scores) / count` |
| **Total Questions** | `quizResults[].totalQuestions` | `sum(totalQuestions)` |
| **Total Time** | `quizResults[].timeSpent` | `sum(timeSpent)` |
| **Current Streak** | `studyStreak.currentStreak` | Days in a row with quizzes |
| **Longest Streak** | `studyStreak.longestStreak` | Max consecutive days |
| **Topic Performance** | `quizResults[].topics`, `questionStats[].topic` | Aggregate by topic |
| **Topic Avg Score** | `questionStats[].correct` filtered by topic | `correct / total` per topic |
| **Topic Trend** | `quizResults` sorted by timestamp, filtered by topic | Compare recent vs older scores |
| **Best/Worst Score** | `quizResults[].score` grouped by topic | `max(scores)`, `min(scores)` per topic |
| **Questions Answered** | `quizResults[].questionStats.length` | `sum(questionStats.length)` |
| **Most Difficult Questions** | `questionStats[]` aggregated across quizzes | Track `questionText` → success rate |
| **Achievement Progress** | Derived from quiz counts, scores, streaks | Compare to target values |
| **Time Spent per Topic** | `quizResults[].timeSpent` filtered by topic | `sum(timeSpent)` per topic |
| **Success Rate per Question** | `questionStats[].correct` grouped by `questionText` | `correct_count / total_attempts` |

**Verification**:
- ✅ All charts can be generated from existing data
- ✅ No missing fields needed for planned statistics
- ✅ Aggregation can happen client-side (IndexedDB queries)
- ✅ Streak calculation works with Unix timestamps

### Google Sheets Sync

**Sheet Name**: `Quiz Analytics - <user_email>`

**Columns**:
```
| A: Quiz ID | B: Timestamp | C: Title | D: Topics | E: Total Questions | F: Correct | G: Score | H: Time Spent | I: Question Details |
```

**Sync Strategy**:
- **Trigger**: After each quiz completion
- **Method**: Append row to user's quiz analytics sheet
- **Conflict Resolution**: IndexedDB is source of truth (no bi-directional sync)
- **Privacy**: User-controlled (opt-in sync in settings)

**Implementation**:

```typescript
// ui-new/src/services/quiz-sync.ts
import { quizAnalyticsDb } from '../db/quizAnalyticsDb';

/**
 * Sync quiz result to Google Sheets
 */
async function syncQuizToGoogleSheets(quiz: QuizAnalytics): Promise<void> {
  try {
    const response = await fetch('/api/quiz/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      body: JSON.stringify({
        quizId: quiz.id,
        timestamp: new Date(quiz.timestamp).toISOString(),
        title: quiz.title,
        topics: quiz.topics.join(', '),
        totalQuestions: quiz.totalQuestions,
        correctAnswers: quiz.correctAnswers,
        score: quiz.score,
        timeSpent: Math.round(quiz.timeSpent / 1000), // Convert to seconds
        questionDetails: JSON.stringify(quiz.questionStats.map(q => ({
          question: q.questionText.slice(0, 100), // Truncate for readability
          correct: q.correct,
          timeSpent: Math.round(q.timeSpent / 1000),
          topic: q.topic
        })))
      })
    });

    if (response.ok) {
      // Mark as synced in IndexedDB
      await quizAnalyticsDb.quizResults.update(quiz.id, {
        synced: true,
        syncedAt: Date.now()
      });
      
      console.log(`✅ Synced quiz ${quiz.id} to Google Sheets`);
    } else {
      console.error('Failed to sync quiz:', await response.text());
    }
  } catch (error) {
    console.error('Quiz sync error:', error);
    // Don't throw - sync is optional
  }
}

/**
 * Batch sync all unsynced quizzes
 */
async function syncAllUnsynced(): Promise<number> {
  const unsyncedQuizzes = await quizAnalyticsDb.quizResults
    .where('synced')
    .equals(false)
    .toArray();
  
  let syncedCount = 0;
  
  for (const quiz of unsyncedQuizzes) {
    await syncQuizToGoogleSheets(quiz);
    syncedCount++;
    
    // Rate limit: 1 request per 100ms (max 10/sec)
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return syncedCount;
}
```

**Backend Endpoint** (`src/endpoints/quiz-sync.js`):

```javascript
const { logToGoogleSheets } = require('../services/google-sheets-logger');

/**
 * POST /api/quiz/sync - Sync quiz result to Google Sheets
 */
async function handleQuizSync(req, res) {
  const { email } = req.user; // From auth middleware
  const { quizId, timestamp, title, topics, totalQuestions, correctAnswers, score, timeSpent, questionDetails } = req.body;
  
  try {
    // Sheet name: "Quiz Analytics - <email>"
    const sheetName = `Quiz Analytics - ${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    // Prepare row
    const row = [
      quizId,
      timestamp,
      title,
      topics,
      totalQuestions,
      correctAnswers,
      `${score}%`,
      `${timeSpent}s`,
      questionDetails
    ];
    
    // Log to Google Sheets
    await logToGoogleSheets({
      email,
      sheetName,
      row,
      headers: ['Quiz ID', 'Timestamp', 'Title', 'Topics', 'Total Questions', 'Correct Answers', 'Score', 'Time Spent', 'Question Details']
    });
    
    res.json({ success: true, message: 'Quiz synced to Google Sheets' });
    
  } catch (error) {
    console.error('Quiz sync error:', error);
    res.status(500).json({ error: 'Failed to sync quiz' });
  }
}

module.exports = { handleQuizSync };
```

**Settings Panel** (Enable/Disable Sync):

```tsx
// ui-new/src/components/QuizSettings.tsx
function QuizSettings() {
  const [syncEnabled, setSyncEnabled] = useState(
    localStorage.getItem('quiz_sync_enabled') === 'true'
  );
  
  async function toggleSync(enabled: boolean) {
    setSyncEnabled(enabled);
    localStorage.setItem('quiz_sync_enabled', enabled.toString());
    
    if (enabled) {
      // Sync all unsynced quizzes
      const count = await syncAllUnsynced();
      toast.success(`Synced ${count} quiz results to Google Sheets`);
    }
  }
  
  return (
    <div className="quiz-settings">
      <label>
        <input
          type="checkbox"
          checked={syncEnabled}
          onChange={(e) => toggleSync(e.target.checked)}
        />
        Sync quiz results to Google Sheets
      </label>
      <p className="hint">
        Your quiz performance data will be backed up to Google Sheets for long-term storage and analysis.
      </p>
    </div>
  );
}
```

### IndexedDB Schema

```typescript
// db/quizAnalyticsDb.ts
import Dexie, { Table } from 'dexie';

class QuizAnalyticsDB extends Dexie {
  quizResults!: Table<QuizAnalytics, string>;
  topicPerformance!: Table<TopicPerformance, string>;
  achievements!: Table<Achievement, string>;
  studyStreak!: Table<StudyStreak, number>; // single record

  constructor() {
    super('QuizAnalyticsDB');
    
    this.version(1).stores({
      quizResults: 'id, timestamp, sourceSnippetId, sourceFeedItemId, *topics',
      topicPerformance: 'topic, lastQuizDate',
      achievements: 'id, unlocked',
      studyStreak: 'id'
    });
  }
}

export const quizAnalyticsDb = new QuizAnalyticsDB();
```

## Analytics Dashboard Components

### 1. Overview Stats Component

**File**: `ui-new/src/components/QuizAnalytics/OverviewStats.tsx`

```tsx
import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const quizzes = await quizAnalyticsDb.quizResults.toArray();
    const streak = await quizAnalyticsDb.studyStreak.get(1);

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
  }

  function formatTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  if (!stats) return <div>Loading...</div>;

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
        <div className="stat-icon">��</div>
        <div className="stat-value">{stats.longestStreak}</div>
        <div className="stat-label">Longest Streak</div>
      </div>
    </div>
  );
}
```

**CSS**: `ui-new/src/components/QuizAnalytics/OverviewStats.css`

```css
.overview-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: #333;
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.875rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

### 2. Topic Performance Component

**File**: `ui-new/src/components/QuizAnalytics/TopicPerformance.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { quizAnalyticsDb } from '../../db/quizAnalyticsDb';
import './TopicPerformance.css';

export function TopicPerformance() {
  const [topics, setTopics] = useState<TopicPerformance[]>([]);
  const [sortBy, setSortBy] = useState<'score' | 'quizzes'>('score');

  useEffect(() => {
    loadTopics();
  }, []);

  async function loadTopics() {
    const topicData = await quizAnalyticsDb.topicPerformance.toArray();
    setTopics(topicData.sort((a, b) => b.averageScore - a.averageScore));
  }

  const chartData = topics.slice(0, 10).map(topic => ({
    name: topic.topic.length > 15 ? topic.topic.slice(0, 15) + '...' : topic.topic,
    score: Math.round(topic.averageScore),
    quizzes: topic.quizzesTaken
  }));

  return (
    <div className="topic-performance">
      <h2>Performance by Topic</h2>

      <div className="sort-controls">
        <button
          className={sortBy === 'score' ? 'active' : ''}
          onClick={() => {
            setSortBy('score');
            setTopics([...topics].sort((a, b) => b.averageScore - a.averageScore));
          }}
        >
          Sort by Score
        </button>
        <button
          className={sortBy === 'quizzes' ? 'active' : ''}
          onClick={() => {
            setSortBy('quizzes');
            setTopics([...topics].sort((a, b) => b.quizzesTaken - a.quizzesTaken));
          }}
        >
          Sort by Quizzes
        </button>
      </div>

      {/* Bar Chart */}
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Bar dataKey="score" fill="#4CAF50" />
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
            <th>Actions</th>
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
              <td>
                <button className="btn-small">Practice</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 3. Score Trends Component

**File**: `ui-new/src/components/QuizAnalytics/ScoreTrends.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { quizAnalyticsDb } from '../../db/quizAnalyticsDb';
import './ScoreTrends.css';

type TimeRange = '7days' | '30days' | 'all';

export function ScoreTrends() {
  const [quizzes, setQuizzes] = useState<QuizAnalytics[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');

  useEffect(() => {
    loadQuizzes();
  }, [timeRange]);

  async function loadQuizzes() {
    let quizData = await quizAnalyticsDb.quizResults.orderBy('timestamp').toArray();

    // Filter by time range
    const now = Date.now();
    const cutoff = {
      '7days': now - 7 * 24 * 60 * 60 * 1000,
      '30days': now - 30 * 24 * 60 * 60 * 1000,
      'all': 0
    }[timeRange];

    quizData = quizData.filter(q => q.timestamp >= cutoff);
    setQuizzes(quizData);
  }

  const chartData = quizzes.map(quiz => ({
    date: new Date(quiz.timestamp).toLocaleDateString(),
    score: quiz.score,
    questions: quiz.correctAnswers
  }));

  // Calculate moving average (5-quiz window)
  const movingAvg = chartData.map((item, idx) => {
    const window = chartData.slice(Math.max(0, idx - 4), idx + 1);
    const avg = window.reduce((sum, q) => sum + q.score, 0) / window.length;
    return { ...item, movingAverage: Math.round(avg) };
  });

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

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={movingAvg}>
          <XAxis dataKey="date" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="score" stroke="#2196F3" name="Quiz Score" />
          <Line type="monotone" dataKey="movingAverage" stroke="#FF9800" name="Moving Average (5)" strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>

      {movingAvg.length > 1 && (
        <div className="trend-insight">
          {movingAvg[movingAvg.length - 1].movingAverage > movingAvg[0].movingAverage ? (
            <span className="improving">📈 You're improving! Keep it up!</span>
          ) : (
            <span className="declining">📉 Consider reviewing past topics</span>
          )}
        </div>
      )}
    </div>
  );
}
```

### 4. Question Insights Component

**File**: `ui-new/src/components/QuizAnalytics/QuestionInsights.tsx`

```tsx
import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    loadInsights();
  }, []);

  async function loadInsights() {
    const quizzes = await quizAnalyticsDb.quizResults.toArray();
    
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

      {difficultQuestions.length === 0 && (
        <div className="no-data">
          Take more quizzes to see challenging questions!
        </div>
      )}
    </div>
  );
}
```

### 5. Achievements Component

**File**: `ui-new/src/components/QuizAnalytics/Achievements.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { quizAnalyticsDb } from '../../db/quizAnalyticsDb';
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

export function Achievements() {
  const [achievements, setAchievements] = useState<Achievement[]>(ACHIEVEMENT_DEFINITIONS);

  useEffect(() => {
    updateAchievements();
  }, []);

  async function updateAchievements() {
    const quizzes = await quizAnalyticsDb.quizResults.toArray();
    const streak = await quizAnalyticsDb.studyStreak.get(1);

    const totalQuizzes = quizzes.length;
    const avgScore = totalQuizzes > 0 
      ? quizzes.reduce((sum, q) => sum + q.score, 0) / totalQuizzes 
      : 0;
    const hasPerfectScore = quizzes.some(q => q.score === 100);
    const currentStreak = streak?.currentStreak || 0;

    const updated = achievements.map(ach => {
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
    await quizAnalyticsDb.achievements.bulkPut(updated);
  }

  const unlockedCount = achievements.filter(a => a.unlocked).length;

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
```

## Implementation Plan

### Phase 1: Data Collection & Storage (3 hours)

**Deliverables**:
- [ ] Create `QuizAnalyticsDB` schema in `db/quizAnalyticsDb.ts`
- [ ] Update `QuizPage.tsx` to track:
  - Quiz start/end time
  - Time spent per question
  - Extract topics from quiz content
  - Store detailed analytics after quiz completion
- [ ] Implement topic extraction (simple keyword detection)
- [ ] Add streak calculation logic

**Testing**:
- Complete 5 quizzes and verify data is stored correctly
- Check IndexedDB via browser DevTools

### Phase 2: Analytics Dashboard UI (6 hours)

**Deliverables**:
- [ ] Create `QuizAnalytics.tsx` main component
- [ ] Build 5 sub-components:
  - OverviewStats
  - TopicPerformance (with bar chart)
  - ScoreTrends (with line chart)
  - QuestionInsights
  - Achievements
- [ ] Install `recharts` library for charts
- [ ] Add navigation tab in `QuizPage.tsx`

**Testing**:
- Verify all charts render correctly
- Test with different data sets (0 quizzes, 1 quiz, 100 quizzes)

### Phase 3: Insights & Recommendations (4 hours)

**Deliverables**:
- [ ] Create recommendation engine:
  - Identify weak topics (< 70% score)
  - Suggest re-taking specific quizzes
  - Generate practice quiz for weak topics
- [ ] Add insights panel:
  - "You're improving in X"
  - "Consider reviewing Y"
  - "Your best topic is Z"
- [ ] Implement trend calculation (improving/declining/stable)

**Testing**:
- Verify recommendations are relevant
- Test edge cases (all perfect scores, all failing scores)

### Phase 4: Export & Data Management (3 hours)

**Deliverables**:
- [ ] CSV export functionality
- [ ] Optional: Google Sheets sync
- [ ] Data privacy controls:
  - Clear all data
  - Clear specific topic data
  - Export before delete
- [ ] Data retention policy (archive quizzes > 1 year old)

**Testing**:
- Export quiz data and verify CSV format
- Test data deletion (ensure complete removal)

## Success Metrics

### Adoption
- **Target**: 60% of users view analytics
- **Metric**: Users viewing analytics / total quiz takers

### Engagement
- **Target**: 30% of users act on recommendations
- **Metric**: Quizzes taken from recommendations / total recommendations shown

### Performance
- **Target**: Analytics load < 500ms
- **Metric**: Time from Analytics tab click to dashboard render

### Data Quality
- **Target**: 100% of quizzes have topic data
- **Metric**: Quizzes with topics / total quizzes

## Future Enhancements

### Phase 2: Advanced Analytics
- [ ] Spaced repetition scheduling
- [ ] AI-generated study plans
- [ ] Time-of-day performance analysis
- [ ] Comparison with anonymous aggregated data

### Phase 3: Social Features
- [ ] Compare with friends (opt-in)
- [ ] Leaderboards
- [ ] Shared achievements
- [ ] Study groups

### Phase 4: Integration
- [ ] Export to Anki (spaced repetition flashcards)
- [ ] Sync with external study tools
- [ ] API for third-party integrations

---

**Status**: Ready for implementation  
**Next Step**: Create QuizAnalyticsDB schema  
**Estimated Launch**: 2-3 weeks from start

**Dependencies**:
- `recharts`: ^2.10.0 (for charts)
- `dexie`: ^3.2.0 (already installed for IndexedDB)
