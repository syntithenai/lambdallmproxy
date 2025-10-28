# Quiz Analytics & Performance Tracking - Implementation Plan

**Feature**: Quiz Analytics Dashboard  
**Status**: PLANNING  
**Priority**: HIGH  
**Estimated Effort**: 16-20 hours  
**Target Completion**: November 2025

---

## Executive Summary

This plan details the implementation of a comprehensive quiz analytics system that tracks user performance, identifies learning patterns, and provides actionable insights for improvement. The system will be entirely client-side, storing data in IndexedDB for privacy and offline capability.

---

## Table of Contents

1. [Goals & Success Metrics](#goals--success-metrics)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture Overview](#architecture-overview)
4. [Data Models](#data-models)
5. [Implementation Phases](#implementation-phases)
6. [UI/UX Design](#uiux-design)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Plan](#deployment-plan)
9. [Future Enhancements](#future-enhancements)

---

## Goals & Success Metrics

### Primary Goals
1. **Track Performance**: Store detailed quiz results with question-level analytics
2. **Visualize Trends**: Show score trends over time with interactive charts
3. **Identify Patterns**: Highlight strong/weak topics and recommend focus areas
4. **Motivate Users**: Implement achievement badges and streak tracking

### Success Metrics
- ✅ Users can view their performance history in < 1 second
- ✅ Analytics identify weak topics with > 90% accuracy
- ✅ Chart rendering completes in < 500ms
- ✅ Data export (CSV) completes in < 2 seconds
- ✅ IndexedDB storage stays under 10MB for 1000+ quizzes
- ✅ 80%+ user satisfaction with insights quality

### Key Performance Indicators (KPIs)
- Average quiz completion rate
- Week-over-week score improvement
- Most studied topics
- User retention (days between quizzes)
- Achievement unlock rate

---

## Current State Analysis

### Existing Quiz System
**Location**: `ui-new/src/pages/QuizPage.tsx`

**Current Capabilities**:
- ✅ Quiz generation from content or feed items
- ✅ Multiple-choice question display
- ✅ Real-time answer validation
- ✅ Score calculation and display
- ✅ Quiz storage in IndexedDB (`savedQuizzes` store)
- ✅ Quiz replay from history

**Current Limitations**:
- ❌ No performance tracking across quizzes
- ❌ No topic/category extraction
- ❌ No time tracking (per question or total)
- ❌ No visualization of trends
- ❌ No identification of weak areas
- ❌ No achievement/gamification system
- ❌ Limited storage schema (just quiz content + timestamp)

### Existing Storage Schema
```typescript
// Current: ui-new/src/db/quizDb.ts
interface SavedQuiz {
  id: string;
  timestamp: number;
  quiz: {
    title: string;
    questions: Question[];
  };
}
```

**Database Structure**:
- Database: `QuizDatabase`
- Store: `savedQuizzes`
- No indexes on topics, scores, or dates

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     QuizPage.tsx                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Quiz Taking  │  │   History    │  │  Analytics   │     │
│  │   Component  │  │   Component  │  │  Dashboard   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │             │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│              QuizAnalyticsService.ts                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • Track quiz sessions                                 │  │
│  │ • Calculate performance metrics                       │  │
│  │ • Extract topics from content                         │  │
│  │ • Generate insights & recommendations                 │  │
│  │ • Manage achievements & streaks                       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              quizAnalyticsDb.ts (IndexedDB)                 │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ quiz_sessions    │  │ topic_performance│               │
│  │ ─────────────    │  │ ─────────────────│               │
│  │ • id             │  │ • topic          │               │
│  │ • timestamp      │  │ • quizzesTaken   │               │
│  │ • title          │  │ • avgScore       │               │
│  │ • topics[]       │  │ • bestScore      │               │
│  │ • score          │  │ • lastDate       │               │
│  │ • timeSpent      │  │ • totalTime      │               │
│  │ • questions[]    │  └──────────────────┘               │
│  └──────────────────┘                                      │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ achievements     │  │ user_stats       │               │
│  │ ─────────────    │  │ ─────────────────│               │
│  │ • id             │  │ • totalQuizzes   │               │
│  │ • type           │  │ • currentStreak  │               │
│  │ • unlockedAt     │  │ • longestStreak  │               │
│  │ • displayName    │  │ • totalTimeSpent │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│          Chart Components (recharts)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Score Trends │  │ Topic Radar  │  │ Time Series  │     │
│  │  Line Chart  │  │    Chart     │  │   Area Chart │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend**:
- React 18+ (existing)
- TypeScript (existing)
- TailwindCSS (existing)
- **NEW**: `recharts` v2.x - Data visualization library
- **NEW**: `date-fns` - Date manipulation and formatting

**Storage**:
- IndexedDB (existing via Dexie.js)
- Local-first architecture (no backend required)

**Analytics Engine**:
- Client-side TypeScript
- Topic extraction using keyword matching + TF-IDF
- Statistical calculations (mean, median, percentiles)

---

## Data Models

### 1. QuizSession Schema

```typescript
// Location: ui-new/src/types/analytics.ts

export interface QuizSession {
  // Identity
  id: string;                          // UUID v4
  timestamp: number;                   // Unix timestamp (ms)
  
  // Quiz Metadata
  title: string;                       // "JavaScript Fundamentals Quiz"
  sourceType: 'manual' | 'feed' | 'snippet' | 'url';
  sourceId?: string;                   // Feed item ID or snippet ID
  
  // Content Classification
  topics: string[];                    // ["javascript", "programming", "web development"]
  difficulty?: 'easy' | 'medium' | 'hard';  // Auto-detected or user-selected
  
  // Performance Metrics
  totalQuestions: number;              // 10
  correctAnswers: number;              // 7
  score: number;                       // 70.0 (percentage)
  
  // Time Tracking
  startTime: number;                   // Unix timestamp
  endTime: number;                     // Unix timestamp
  totalTimeSpent: number;              // Milliseconds
  
  // Question-Level Details
  questionStats: QuestionStat[];
  
  // User Context
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  completedFully: boolean;             // Did user finish all questions?
}

export interface QuestionStat {
  questionId: string;                  // UUID
  questionText: string;                // For later review
  topic: string;                       // Primary topic for this question
  
  // Performance
  selectedAnswer: string;              // User's answer
  correctAnswer: string;               // Correct answer
  isCorrect: boolean;
  
  // Timing
  timeSpent: number;                   // Milliseconds
  
  // Difficulty (inferred)
  difficultyScore?: number;            // 0-100 (based on avg user performance)
}
```

### 2. TopicPerformance Schema

```typescript
export interface TopicPerformance {
  topic: string;                       // "javascript"
  
  // Aggregate Stats
  quizzesTaken: number;                // 15
  questionsAnswered: number;           // 150
  correctAnswers: number;              // 105
  
  // Performance Metrics
  averageScore: number;                // 70.0
  medianScore: number;                 // 75.0
  bestScore: number;                   // 90.0
  worstScore: number;                  // 40.0
  
  // Trend Analysis
  lastQuizDate: number;                // Unix timestamp
  firstQuizDate: number;               // Unix timestamp
  recentTrend: 'improving' | 'declining' | 'stable';  // Last 5 quizzes
  
  // Time Investment
  totalTimeSpent: number;              // Milliseconds
  averageTimePerQuiz: number;          // Milliseconds
  
  // Recommendations
  needsImprovement: boolean;           // averageScore < 70
  masteryLevel: 'beginner' | 'intermediate' | 'advanced';
}
```

### 3. Achievement Schema

```typescript
export interface Achievement {
  id: string;                          // "first_quiz", "perfect_score", etc.
  type: 'milestone' | 'streak' | 'mastery' | 'special';
  
  // Display
  name: string;                        // "First Steps"
  description: string;                 // "Complete your first quiz"
  icon: string;                        // Emoji or icon name
  
  // Progress
  isUnlocked: boolean;
  unlockedAt?: number;                 // Unix timestamp
  progress?: number;                   // For multi-step achievements (0-100)
  
  // Criteria
  criteria: {
    type: 'count' | 'score' | 'streak' | 'topic';
    threshold: number;
    metric: string;                    // "totalQuizzes", "perfectScores", etc.
  };
}
```

### 4. UserStats Schema

```typescript
export interface UserStats {
  // Lifetime Stats
  totalQuizzesTaken: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  overallAccuracy: number;             // Percentage
  
  // Time Investment
  totalTimeSpent: number;              // Milliseconds
  averageQuizDuration: number;         // Milliseconds
  
  // Streaks
  currentStreak: number;               // Days in a row
  longestStreak: number;               // Days
  lastQuizDate: number;                // Unix timestamp
  
  // Performance
  averageScore: number;                // Across all quizzes
  bestScore: number;
  perfectScores: number;               // Number of 100% scores
  
  // Topic Distribution
  topTopics: { topic: string; count: number }[];  // Top 10
  
  // Achievements
  achievementsUnlocked: number;
  totalAchievements: number;
}
```

---

## Implementation Phases

### Phase 1: Data Layer & Tracking (6 hours)

#### 1.1 Create IndexedDB Schema

**File**: `ui-new/src/db/quizAnalyticsDb.ts`

```typescript
import Dexie, { Table } from 'dexie';
import { QuizSession, TopicPerformance, Achievement, UserStats } from '../types/analytics';

class QuizAnalyticsDatabase extends Dexie {
  quizSessions!: Table<QuizSession, string>;
  topicPerformance!: Table<TopicPerformance, string>;
  achievements!: Table<Achievement, string>;
  userStats!: Table<UserStats, string>;

  constructor() {
    super('QuizAnalyticsDB');
    
    this.version(1).stores({
      quizSessions: 'id, timestamp, *topics, score, sourceType',
      topicPerformance: 'topic, lastQuizDate, averageScore',
      achievements: 'id, type, isUnlocked, unlockedAt',
      userStats: 'id'  // Single record with id='global'
    });
  }
}

export const quizAnalyticsDb = new QuizAnalyticsDatabase();
```

**Indexes Explained**:
- `quizSessions`:
  - `id` - Primary key (UUID)
  - `timestamp` - Query quizzes by date range
  - `*topics` - Multi-entry index (one quiz can have multiple topics)
  - `score` - Filter by performance level
  - `sourceType` - Filter by source (manual, feed, etc.)
  
- `topicPerformance`:
  - `topic` - Primary key (topic name)
  - Computed/aggregated from quizSessions

#### 1.2 Create Analytics Service

**File**: `ui-new/src/services/QuizAnalyticsService.ts`

```typescript
import { quizAnalyticsDb } from '../db/quizAnalyticsDb';
import { QuizSession, TopicPerformance, Achievement, UserStats } from '../types/analytics';
import { v4 as uuidv4 } from 'uuid';

export class QuizAnalyticsService {
  
  /**
   * Track a completed quiz session
   */
  async trackQuizCompletion(quiz: {
    title: string;
    questions: any[];
    userAnswers: Record<string, string>;
    startTime: number;
    endTime: number;
    sourceType?: string;
    sourceId?: string;
  }): Promise<QuizSession> {
    
    // Extract topics from quiz content
    const topics = this.extractTopics(quiz.title, quiz.questions);
    
    // Calculate performance metrics
    const { correct, total } = this.calculateScore(quiz.questions, quiz.userAnswers);
    const score = (correct / total) * 100;
    
    // Build question stats
    const questionStats = quiz.questions.map((q, idx) => ({
      questionId: q.id || `q_${idx}`,
      questionText: q.question,
      topic: this.extractQuestionTopic(q.question),
      selectedAnswer: quiz.userAnswers[q.id || idx],
      correctAnswer: q.correctAnswer,
      isCorrect: quiz.userAnswers[q.id || idx] === q.correctAnswer,
      timeSpent: 0  // Will be tracked in Phase 2
    }));
    
    // Create session record
    const session: QuizSession = {
      id: uuidv4(),
      timestamp: Date.now(),
      title: quiz.title,
      sourceType: (quiz.sourceType as any) || 'manual',
      sourceId: quiz.sourceId,
      topics,
      totalQuestions: total,
      correctAnswers: correct,
      score,
      startTime: quiz.startTime,
      endTime: quiz.endTime,
      totalTimeSpent: quiz.endTime - quiz.startTime,
      questionStats,
      completedFully: true
    };
    
    // Save to IndexedDB
    await quizAnalyticsDb.quizSessions.add(session);
    
    // Update aggregates
    await this.updateTopicPerformance(topics, session);
    await this.updateUserStats(session);
    await this.checkAchievements(session);
    
    return session;
  }
  
  /**
   * Extract topics from quiz title and questions using keyword matching
   */
  private extractTopics(title: string, questions: any[]): string[] {
    const text = [title, ...questions.map(q => q.question)].join(' ').toLowerCase();
    
    // Topic keywords dictionary
    const topicKeywords: Record<string, string[]> = {
      'javascript': ['javascript', 'js', 'node', 'react', 'typescript'],
      'python': ['python', 'django', 'flask', 'pandas'],
      'web development': ['html', 'css', 'frontend', 'backend', 'web'],
      'data science': ['data', 'machine learning', 'ai', 'statistics'],
      'algorithms': ['algorithm', 'sort', 'search', 'complexity'],
      'databases': ['sql', 'database', 'query', 'nosql', 'mongodb'],
      'security': ['security', 'encryption', 'authentication', 'vulnerability'],
      'networking': ['network', 'tcp', 'http', 'protocol', 'api']
    };
    
    const matchedTopics: string[] = [];
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        matchedTopics.push(topic);
      }
    }
    
    // If no topics matched, extract from title
    if (matchedTopics.length === 0) {
      const titleWords = title.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4)  // Only longer words
        .slice(0, 3);  // Max 3 words
      matchedTopics.push(...titleWords);
    }
    
    return [...new Set(matchedTopics)];  // Remove duplicates
  }
  
  /**
   * Extract primary topic for a single question
   */
  private extractQuestionTopic(questionText: string): string {
    const topics = this.extractTopics(questionText, []);
    return topics[0] || 'general';
  }
  
  /**
   * Calculate correct answers
   */
  private calculateScore(questions: any[], userAnswers: Record<string, string>) {
    let correct = 0;
    questions.forEach((q, idx) => {
      const questionId = q.id || idx;
      if (userAnswers[questionId] === q.correctAnswer) {
        correct++;
      }
    });
    return { correct, total: questions.length };
  }
  
  /**
   * Update topic performance aggregates
   */
  private async updateTopicPerformance(topics: string[], session: QuizSession) {
    for (const topic of topics) {
      const existing = await quizAnalyticsDb.topicPerformance.get(topic);
      
      if (existing) {
        // Update existing topic
        const newQuizCount = existing.quizzesTaken + 1;
        const newAvg = (existing.averageScore * existing.quizzesTaken + session.score) / newQuizCount;
        
        await quizAnalyticsDb.topicPerformance.update(topic, {
          quizzesTaken: newQuizCount,
          questionsAnswered: existing.questionsAnswered + session.totalQuestions,
          correctAnswers: existing.correctAnswers + session.correctAnswers,
          averageScore: newAvg,
          medianScore: existing.medianScore,  // Will calculate properly in Phase 2
          bestScore: Math.max(existing.bestScore, session.score),
          worstScore: Math.min(existing.worstScore, session.score),
          lastQuizDate: session.timestamp,
          totalTimeSpent: existing.totalTimeSpent + session.totalTimeSpent,
          averageTimePerQuiz: (existing.totalTimeSpent + session.totalTimeSpent) / newQuizCount,
          needsImprovement: newAvg < 70,
          masteryLevel: newAvg >= 80 ? 'advanced' : newAvg >= 60 ? 'intermediate' : 'beginner',
          recentTrend: 'stable'  // Will calculate properly in Phase 2
        });
      } else {
        // Create new topic
        await quizAnalyticsDb.topicPerformance.add({
          topic,
          quizzesTaken: 1,
          questionsAnswered: session.totalQuestions,
          correctAnswers: session.correctAnswers,
          averageScore: session.score,
          medianScore: session.score,
          bestScore: session.score,
          worstScore: session.score,
          lastQuizDate: session.timestamp,
          firstQuizDate: session.timestamp,
          recentTrend: 'stable',
          totalTimeSpent: session.totalTimeSpent,
          averageTimePerQuiz: session.totalTimeSpent,
          needsImprovement: session.score < 70,
          masteryLevel: session.score >= 80 ? 'advanced' : session.score >= 60 ? 'intermediate' : 'beginner'
        });
      }
    }
  }
  
  /**
   * Update global user statistics
   */
  private async updateUserStats(session: QuizSession) {
    const stats = await quizAnalyticsDb.userStats.get('global');
    
    if (stats) {
      // Calculate streak
      const daysSinceLastQuiz = Math.floor((session.timestamp - stats.lastQuizDate) / (1000 * 60 * 60 * 24));
      const newStreak = daysSinceLastQuiz <= 1 ? stats.currentStreak + 1 : 1;
      
      await quizAnalyticsDb.userStats.update('global', {
        totalQuizzesTaken: stats.totalQuizzesTaken + 1,
        totalQuestionsAnswered: stats.totalQuestionsAnswered + session.totalQuestions,
        totalCorrectAnswers: stats.totalCorrectAnswers + session.correctAnswers,
        overallAccuracy: ((stats.totalCorrectAnswers + session.correctAnswers) / 
                         (stats.totalQuestionsAnswered + session.totalQuestions)) * 100,
        totalTimeSpent: stats.totalTimeSpent + session.totalTimeSpent,
        averageQuizDuration: (stats.totalTimeSpent + session.totalTimeSpent) / 
                            (stats.totalQuizzesTaken + 1),
        currentStreak: newStreak,
        longestStreak: Math.max(stats.longestStreak, newStreak),
        lastQuizDate: session.timestamp,
        averageScore: ((stats.averageScore * stats.totalQuizzesTaken) + session.score) / 
                     (stats.totalQuizzesTaken + 1),
        bestScore: Math.max(stats.bestScore, session.score),
        perfectScores: stats.perfectScores + (session.score === 100 ? 1 : 0)
      });
    } else {
      // Initialize user stats
      await quizAnalyticsDb.userStats.add({
        id: 'global',
        totalQuizzesTaken: 1,
        totalQuestionsAnswered: session.totalQuestions,
        totalCorrectAnswers: session.correctAnswers,
        overallAccuracy: (session.correctAnswers / session.totalQuestions) * 100,
        totalTimeSpent: session.totalTimeSpent,
        averageQuizDuration: session.totalTimeSpent,
        currentStreak: 1,
        longestStreak: 1,
        lastQuizDate: session.timestamp,
        averageScore: session.score,
        bestScore: session.score,
        perfectScores: session.score === 100 ? 1 : 0,
        topTopics: [],
        achievementsUnlocked: 0,
        totalAchievements: 0
      } as UserStats);
    }
  }
  
  /**
   * Check and unlock achievements
   */
  private async checkAchievements(session: QuizSession) {
    const stats = await quizAnalyticsDb.userStats.get('global');
    if (!stats) return;
    
    // Define achievements
    const achievementDefinitions = [
      {
        id: 'first_quiz',
        type: 'milestone',
        name: 'First Steps',
        description: 'Complete your first quiz',
        icon: '🎯',
        criteria: { type: 'count', threshold: 1, metric: 'totalQuizzesTaken' }
      },
      {
        id: 'quiz_streak_7',
        type: 'streak',
        name: 'Week Warrior',
        description: 'Complete quizzes 7 days in a row',
        icon: '🔥',
        criteria: { type: 'streak', threshold: 7, metric: 'currentStreak' }
      },
      {
        id: 'perfect_score',
        type: 'mastery',
        name: 'Perfectionist',
        description: 'Score 100% on a quiz',
        icon: '💯',
        criteria: { type: 'score', threshold: 100, metric: 'score' }
      },
      {
        id: 'quiz_master',
        type: 'milestone',
        name: 'Quiz Master',
        description: 'Complete 100 quizzes',
        icon: '👑',
        criteria: { type: 'count', threshold: 100, metric: 'totalQuizzesTaken' }
      }
    ];
    
    for (const def of achievementDefinitions) {
      const existing = await quizAnalyticsDb.achievements.get(def.id);
      
      if (!existing || !existing.isUnlocked) {
        let shouldUnlock = false;
        
        if (def.criteria.type === 'count') {
          shouldUnlock = (stats as any)[def.criteria.metric] >= def.criteria.threshold;
        } else if (def.criteria.type === 'streak') {
          shouldUnlock = stats.currentStreak >= def.criteria.threshold;
        } else if (def.criteria.type === 'score') {
          shouldUnlock = session.score >= def.criteria.threshold;
        }
        
        if (shouldUnlock) {
          if (existing) {
            await quizAnalyticsDb.achievements.update(def.id, {
              isUnlocked: true,
              unlockedAt: Date.now()
            });
          } else {
            await quizAnalyticsDb.achievements.add({
              ...def,
              isUnlocked: true,
              unlockedAt: Date.now()
            } as Achievement);
          }
        }
      }
    }
  }
  
  /**
   * Get user statistics
   */
  async getUserStats(): Promise<UserStats | null> {
    return await quizAnalyticsDb.userStats.get('global') || null;
  }
  
  /**
   * Get quiz sessions within date range
   */
  async getQuizSessions(startDate?: number, endDate?: number): Promise<QuizSession[]> {
    let query = quizAnalyticsDb.quizSessions.orderBy('timestamp').reverse();
    
    if (startDate && endDate) {
      return await query.filter(s => s.timestamp >= startDate && s.timestamp <= endDate).toArray();
    } else if (startDate) {
      return await query.filter(s => s.timestamp >= startDate).toArray();
    }
    
    return await query.toArray();
  }
  
  /**
   * Get performance by topic
   */
  async getTopicPerformance(): Promise<TopicPerformance[]> {
    return await quizAnalyticsDb.topicPerformance
      .orderBy('averageScore')
      .reverse()
      .toArray();
  }
  
  /**
   * Get achievements
   */
  async getAchievements(): Promise<Achievement[]> {
    return await quizAnalyticsDb.achievements.toArray();
  }
  
  /**
   * Export analytics data to CSV
   */
  async exportToCSV(): Promise<string> {
    const sessions = await this.getQuizSessions();
    
    const headers = ['Date', 'Title', 'Topics', 'Score', 'Time Spent (min)', 'Questions', 'Correct'];
    const rows = sessions.map(s => [
      new Date(s.timestamp).toISOString(),
      s.title,
      s.topics.join('; '),
      s.score.toFixed(1),
      (s.totalTimeSpent / 60000).toFixed(1),
      s.totalQuestions,
      s.correctAnswers
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

export const quizAnalyticsService = new QuizAnalyticsService();
```

#### 1.3 Integrate Tracking into QuizPage

**File**: `ui-new/src/pages/QuizPage.tsx` (modifications)

```typescript
// Add imports
import { quizAnalyticsService } from '../services/QuizAnalyticsService';

// Add state for tracking
const [quizStartTime, setQuizStartTime] = useState<number>(0);
const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});

// When quiz starts
useEffect(() => {
  if (currentQuiz && !quizStartTime) {
    setQuizStartTime(Date.now());
  }
}, [currentQuiz]);

// When quiz completes (existing handleFinishQuiz)
const handleFinishQuiz = async () => {
  if (!currentQuiz) return;
  
  const endTime = Date.now();
  
  // Track analytics
  await quizAnalyticsService.trackQuizCompletion({
    title: currentQuiz.title,
    questions: currentQuiz.questions,
    userAnswers: userAnswers,
    startTime: quizStartTime,
    endTime: endTime,
    sourceType: currentQuiz.sourceType || 'manual',
    sourceId: currentQuiz.sourceId
  });
  
  // Rest of existing logic...
  setShowResults(true);
};

// Update answer selection to track
const handleAnswerSelect = (questionId: string, answer: string) => {
  setUserAnswers(prev => ({
    ...prev,
    [questionId]: answer
  }));
  // Rest of existing logic...
};
```

**Testing Checklist for Phase 1**:
- ✅ Quiz completion creates QuizSession record
- ✅ Topics are extracted correctly
- ✅ TopicPerformance is updated
- ✅ UserStats are calculated correctly
- ✅ Achievements unlock properly
- ✅ Data persists across page refreshes

---

### Phase 2: Analytics Dashboard UI (8 hours)

See Part 2 of this plan: `IMPLEMENTATION_QUIZ_ANALYTICS_PART2.md`

---

## Dependencies & Prerequisites

### npm Packages to Install

```bash
cd ui-new

# Data visualization
npm install recharts

# Date utilities
npm install date-fns

# UUID generation (may already be installed)
npm install uuid
npm install --save-dev @types/uuid
```

### TypeScript Type Definitions

Create `ui-new/src/types/analytics.ts` with all the interfaces defined in the Data Models section.

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| IndexedDB storage limits (50-100MB) | High | Medium | Implement data retention policy, export old data |
| Performance degradation with 1000+ quizzes | Medium | Low | Add pagination, lazy loading, database indexes |
| Topic extraction accuracy | Medium | Medium | Allow manual topic editing, improve keyword dictionary |
| Cross-browser IndexedDB inconsistencies | Low | Low | Use Dexie.js (already in use), test on major browsers |

### UX Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Complex UI overwhelming users | Medium | Medium | Progressive disclosure, clear navigation, tooltips |
| Charts not rendering on mobile | Medium | Low | Responsive design, test on mobile devices |
| Slow chart rendering | Low | Low | Use virtualization, limit data points displayed |

---

## Performance Targets

- **Initial Load**: < 1 second to display dashboard
- **Chart Rendering**: < 500ms for any chart
- **Data Query**: < 100ms for any IndexedDB query
- **CSV Export**: < 2 seconds for 1000 quizzes
- **Storage**: < 10MB for 1000 quiz sessions

---

## Accessibility Requirements

- All charts must have text alternatives
- Keyboard navigation for all interactive elements
- Screen reader support for stats and insights
- Color-blind friendly chart colors
- ARIA labels for all dynamic content

---

## Next Steps

1. **Review & Approve**: Review this plan with stakeholders
2. **Setup Environment**: Install npm dependencies
3. **Create Types**: Define TypeScript interfaces in `analytics.ts`
4. **Phase 1 Implementation**: Build data layer (6 hours)
5. **Phase 2 Implementation**: Build UI components (see Part 2)
6. **Testing**: Comprehensive testing across browsers
7. **Deployment**: Deploy to production

---

**Document Status**: READY FOR IMPLEMENTATION  
**Last Updated**: October 28, 2025  
**Next Document**: `IMPLEMENTATION_QUIZ_ANALYTICS_PART2.md` (UI Components)

