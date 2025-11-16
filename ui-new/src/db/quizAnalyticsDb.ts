/**
 * Quiz Analytics IndexedDB for comprehensive performance tracking
 * Stores detailed quiz analytics, topic performance, achievements, and study streaks
 */

const ANALYTICS_DB_NAME = 'quiz_analytics';
const ANALYTICS_DB_VERSION = 1;

// Store names
const QUIZ_RESULTS_STORE = 'quizResults';
const TOPIC_PERFORMANCE_STORE = 'topicPerformance';
const ACHIEVEMENTS_STORE = 'achievements';
const STUDY_STREAK_STORE = 'studyStreak';

// ============== TypeScript Interfaces ==============

export interface QuestionStat {
  questionId: string;            // unique ID for the question
  questionText: string;          // the question itself
  correct: boolean;              // true if answered correctly
  timeSpent: number;             // milliseconds spent on this question
  attempts: number;              // 1 (if retry disabled) or multiple
  selectedAnswer: string;        // user's answer
  correctAnswer: string;         // the correct answer
  topic?: string;                // extracted topic for this question
}

export interface QuizAnalytics {
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

export interface TopicPerformance {
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

export interface Achievement {
  id: string;                    // achievement ID
  name: string;                  // "Quiz Master"
  description: string;           // "Complete 50 quizzes"
  icon: string;                  // emoji or icon name
  unlocked: boolean;             // true if achieved
  progress: number;              // current progress (e.g., 25/50)
  target: number;                // target value (e.g., 50)
  dateUnlocked?: number;         // timestamp when unlocked
}

export interface StudyStreak {
  id: number;                    // always 1 (singleton record)
  currentStreak: number;         // days in a row
  longestStreak: number;         // all-time best streak
  lastQuizDate: number;          // last quiz completion date (Unix timestamp, midnight UTC)
  streakDates: number[];         // array of dates with quizzes (Unix timestamps, midnight UTC)
}

// ============== Database Class ==============

class QuizAnalyticsDatabase {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize Quiz Analytics IndexedDB
   */
  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported');
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(ANALYTICS_DB_NAME, ANALYTICS_DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open quiz analytics database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ Quiz analytics database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create quizResults store
        if (!db.objectStoreNames.contains(QUIZ_RESULTS_STORE)) {
          const quizStore = db.createObjectStore(QUIZ_RESULTS_STORE, { keyPath: 'id' });
          quizStore.createIndex('timestamp', 'timestamp', { unique: false });
          quizStore.createIndex('sourceSnippetId', 'sourceSnippetId', { unique: false });
          quizStore.createIndex('sourceFeedItemId', 'sourceFeedItemId', { unique: false });
          quizStore.createIndex('topics', 'topics', { unique: false, multiEntry: true });
          quizStore.createIndex('synced', 'synced', { unique: false });
          console.log('✅ Quiz results store created');
        }

        // Create topicPerformance store
        if (!db.objectStoreNames.contains(TOPIC_PERFORMANCE_STORE)) {
          const topicStore = db.createObjectStore(TOPIC_PERFORMANCE_STORE, { keyPath: 'topic' });
          topicStore.createIndex('lastQuizDate', 'lastQuizDate', { unique: false });
          topicStore.createIndex('averageScore', 'averageScore', { unique: false });
          console.log('✅ Topic performance store created');
        }

        // Create achievements store
        if (!db.objectStoreNames.contains(ACHIEVEMENTS_STORE)) {
          const achievementStore = db.createObjectStore(ACHIEVEMENTS_STORE, { keyPath: 'id' });
          achievementStore.createIndex('unlocked', 'unlocked', { unique: false });
          console.log('✅ Achievements store created');
        }

        // Create studyStreak store (singleton)
        if (!db.objectStoreNames.contains(STUDY_STREAK_STORE)) {
          db.createObjectStore(STUDY_STREAK_STORE, { keyPath: 'id' });
          console.log('✅ Study streak store created');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Get midnight UTC timestamp for a given date
   */
  private getMidnightUTC(timestamp: number): number {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }

  /**
   * Extract topics from quiz title and question text
   * Simple keyword-based extraction (can be enhanced with NLP)
   */
  private extractTopics(title: string, questions: QuestionStat[]): string[] {
    const topics = new Set<string>();
    
    // Common topic keywords to look for
    const topicKeywords = [
      'machine learning', 'ai', 'artificial intelligence', 'deep learning',
      'python', 'javascript', 'typescript', 'java', 'c++', 'sql',
      'react', 'angular', 'vue', 'node', 'express',
      'aws', 'azure', 'cloud', 'docker', 'kubernetes',
      'database', 'api', 'rest', 'graphql',
      'algorithms', 'data structures', 'security', 'testing',
      'frontend', 'backend', 'fullstack', 'devops'
    ];

    const text = (title + ' ' + questions.map(q => q.questionText).join(' ')).toLowerCase();

    for (const keyword of topicKeywords) {
      if (text.includes(keyword)) {
        // Capitalize first letter of each word
        const capitalized = keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        topics.add(capitalized);
      }
    }

    // If no topics found, use "General Knowledge"
    if (topics.size === 0) {
      topics.add('General Knowledge');
    }

    return Array.from(topics);
  }

  /**
   * Calculate performance trend (improving/declining/stable)
   */
  private calculateTrend(quizzes: QuizAnalytics[], topic: string): 'improving' | 'declining' | 'stable' {
    const topicQuizzes = quizzes
      .filter(q => q.topics.includes(topic))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (topicQuizzes.length < 3) {
      return 'stable'; // Not enough data
    }

    // Compare recent 1/3 vs older 2/3
    const splitPoint = Math.floor(topicQuizzes.length * 2 / 3);
    const olderQuizzes = topicQuizzes.slice(0, splitPoint);
    const recentQuizzes = topicQuizzes.slice(splitPoint);

    const olderAvg = olderQuizzes.reduce((sum, q) => sum + q.score, 0) / olderQuizzes.length;
    const recentAvg = recentQuizzes.reduce((sum, q) => sum + q.score, 0) / recentQuizzes.length;

    const diff = recentAvg - olderAvg;

    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  /**
   * Update study streak after quiz completion
   */
  async updateStreak(quizTimestamp: number): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const today = this.getMidnightUTC(quizTimestamp);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STUDY_STREAK_STORE], 'readwrite');
      const store = transaction.objectStore(STUDY_STREAK_STORE);
      const getRequest = store.get(1);

      getRequest.onsuccess = () => {
        const streak: StudyStreak = getRequest.result || {
          id: 1,
          currentStreak: 0,
          longestStreak: 0,
          lastQuizDate: 0,
          streakDates: []
        };

        // Add today to streak dates if not already present
        if (!streak.streakDates.includes(today)) {
          streak.streakDates.push(today);
          streak.streakDates.sort((a, b) => a - b); // Sort ascending
        }

        // Calculate current streak (consecutive days from end)
        let currentStreak = 0;
        const sortedDates = [...streak.streakDates].sort((a, b) => b - a); // Sort descending
        
        for (let i = 0; i < sortedDates.length; i++) {
          const expectedDate = today - (i * 24 * 60 * 60 * 1000);
          if (sortedDates[i] === expectedDate) {
            currentStreak++;
          } else {
            break;
          }
        }

        streak.currentStreak = currentStreak;
        streak.longestStreak = Math.max(streak.longestStreak, currentStreak);
        streak.lastQuizDate = today;

        const putRequest = store.put(streak);
        
        putRequest.onsuccess = () => {
          console.log(`✅ Streak updated: ${currentStreak} days`);
          resolve();
        };

        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Update topic performance after quiz completion
   */
  async updateTopicPerformance(quiz: QuizAnalytics): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const allQuizzes = await this.getQuizResults();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([TOPIC_PERFORMANCE_STORE], 'readwrite');
      const store = transaction.objectStore(TOPIC_PERFORMANCE_STORE);
      
      let completed = 0;
      let hasError = false;

      for (const topic of quiz.topics) {
        const getRequest = store.get(topic);

        getRequest.onsuccess = () => {
          // Calculate stats for this topic
          const topicQuizzes = allQuizzes.filter(q => q.topics.includes(topic));
          const questionStats = topicQuizzes.flatMap(q => 
            q.questionStats.filter(qs => qs.topic === topic || q.topics.includes(topic))
          );

          const performance: TopicPerformance = {
            topic,
            quizzesTaken: topicQuizzes.length,
            questionsSeen: questionStats.length,
            questionsCorrect: questionStats.filter(q => q.correct).length,
            averageScore: topicQuizzes.length > 0
              ? topicQuizzes.reduce((sum, q) => sum + q.score, 0) / topicQuizzes.length
              : 0,
            bestScore: topicQuizzes.length > 0
              ? Math.max(...topicQuizzes.map(q => q.score))
              : 0,
            worstScore: topicQuizzes.length > 0
              ? Math.min(...topicQuizzes.map(q => q.score))
              : 0,
            lastQuizDate: quiz.timestamp,
            totalTimeSpent: topicQuizzes.reduce((sum, q) => sum + q.timeSpent, 0),
            trend: this.calculateTrend(allQuizzes, topic)
          };

          const putRequest = store.put(performance);

          putRequest.onsuccess = () => {
            completed++;
            if (completed === quiz.topics.length && !hasError) {
              resolve();
            }
          };

          putRequest.onerror = () => {
            if (!hasError) {
              hasError = true;
              reject(putRequest.error);
            }
          };
        };

        getRequest.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(getRequest.error);
          }
        };
      }
    });
  }

  /**
   * Save quiz analytics result
   */
  async saveQuizResult(
    result: Omit<QuizAnalytics, 'id' | 'topics' | 'synced'>
  ): Promise<string> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const id = this.generateUUID();
    
    // Extract topics from title and questions
    const topics = this.extractTopics(result.title, result.questionStats);
    
    // Assign topics to individual questions
    const questionStatsWithTopics = result.questionStats.map(q => ({
      ...q,
      topic: topics[0] // For simplicity, assign first topic to all questions
    }));

    const fullResult: QuizAnalytics = {
      ...result,
      id,
      topics,
      questionStats: questionStatsWithTopics,
      synced: false
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUIZ_RESULTS_STORE], 'readwrite');
      const store = transaction.objectStore(QUIZ_RESULTS_STORE);
      const request = store.add(fullResult);

      request.onsuccess = async () => {
        console.log('✅ Quiz analytics saved:', id);
        
        // Update topic performance and streak
        await this.updateTopicPerformance(fullResult);
        await this.updateStreak(fullResult.timestamp);
        
        resolve(id);
      };

      request.onerror = () => {
        console.error('Failed to save quiz analytics:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all quiz results
   */
  async getQuizResults(limit?: number): Promise<QuizAnalytics[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUIZ_RESULTS_STORE], 'readonly');
      const store = transaction.objectStore(QUIZ_RESULTS_STORE);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // Descending order
      
      const results: QuizAnalytics[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && (!limit || results.length < limit)) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get topic performance data
   */
  async getTopicPerformance(): Promise<TopicPerformance[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([TOPIC_PERFORMANCE_STORE], 'readonly');
      const store = transaction.objectStore(TOPIC_PERFORMANCE_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get study streak
   */
  async getStudyStreak(): Promise<StudyStreak | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STUDY_STREAK_STORE], 'readonly');
      const store = transaction.objectStore(STUDY_STREAK_STORE);
      const request = store.get(1);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get achievements
   */
  async getAchievements(): Promise<Achievement[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ACHIEVEMENTS_STORE], 'readonly');
      const store = transaction.objectStore(ACHIEVEMENTS_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save achievements
   */
  async saveAchievements(achievements: Achievement[]): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ACHIEVEMENTS_STORE], 'readwrite');
      const store = transaction.objectStore(ACHIEVEMENTS_STORE);

      let completed = 0;
      let hasError = false;

      for (const achievement of achievements) {
        const request = store.put(achievement);

        request.onsuccess = () => {
          completed++;
          if (completed === achievements.length && !hasError) {
            resolve();
          }
        };

        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(request.error);
          }
        };
      }

      if (achievements.length === 0) {
        resolve();
      }
    });
  }

  /**
   * Clear all analytics data
   */
  async clearAllData(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const stores = [
      QUIZ_RESULTS_STORE,
      TOPIC_PERFORMANCE_STORE,
      ACHIEVEMENTS_STORE,
      STUDY_STREAK_STORE
    ];

    for (const storeName of stores) {
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    console.log('✅ All quiz analytics data cleared');
  }

  /**
   * Export all quiz data as CSV
   */
  async exportToCSV(): Promise<string> {
    const quizzes = await this.getQuizResults();
    
    // CSV headers
    const headers = [
      'Quiz ID',
      'Timestamp',
      'Title',
      'Topics',
      'Total Questions',
      'Correct Answers',
      'Score (%)',
      'Time Spent (s)',
      'Start Time',
      'End Time'
    ];

    // CSV rows
    const rows = quizzes.map(quiz => [
      quiz.id,
      new Date(quiz.timestamp).toISOString(),
      quiz.title,
      quiz.topics.join('; '),
      quiz.totalQuestions.toString(),
      quiz.correctAnswers.toString(),
      quiz.score.toString(),
      Math.round(quiz.timeSpent / 1000).toString(),
      new Date(quiz.startTime).toISOString(),
      new Date(quiz.endTime).toISOString()
    ]);

    // Combine headers and rows
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csv;
  }
}

// Export singleton instance
export const quizAnalyticsDb = new QuizAnalyticsDatabase();
