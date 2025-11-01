/**
 * Quiz Statistics IndexedDB utility for storing quiz results locally
 * Syncs to Google Sheets for backup and cross-device access
 */

const QUIZ_DB_NAME = 'quiz_statistics';
const QUIZ_DB_VERSION = 1;
const STATISTICS_STORE = 'statistics';

export interface QuizAnswer {
  questionId: string;
  questionPrompt: string;
  selectedChoiceId: string;
  correctChoiceId: string;
  correct: boolean;
  explanation: string;
}

export interface QuizStatistic {
  id: string; // UUID
  quizTitle: string;
  snippetIds: string[];
  score: number;
  totalQuestions: number;
  percentage: number;
  timeTaken: number; // milliseconds
  completedAt: string; // ISO timestamp
  answers: QuizAnswer[];
  enrichment: boolean; // Whether web search enrichment was used
  synced: boolean; // Whether synced to Google Sheets
  completed: boolean; // Whether the quiz was actually completed (vs just generated)
  quizData?: any; // Store the actual quiz questions for restarting incomplete quizzes
  projectId?: string; // Associated project for filtering
}

class QuizDatabase {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize Quiz IndexedDB
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

      const request = indexedDB.open(QUIZ_DB_NAME, QUIZ_DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open quiz database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ Quiz database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create statistics store if it doesn't exist
        if (!db.objectStoreNames.contains(STATISTICS_STORE)) {
          const store = db.createObjectStore(STATISTICS_STORE, { keyPath: 'id' });
          
          // Create indexes for efficient queries
          store.createIndex('completedAt', 'completedAt', { unique: false });
          store.createIndex('score', 'score', { unique: false });
          store.createIndex('percentage', 'percentage', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
          
          console.log('✅ Quiz statistics store created');
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
   * Save a quiz statistic
   */
  async saveQuizStatistic(statistic: Omit<QuizStatistic, 'id' | 'synced' | 'percentage'>): Promise<string> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const id = this.generateUUID();
    const percentage = Math.round((statistic.score / statistic.totalQuestions) * 100);
    const fullStatistic: QuizStatistic = {
      ...statistic,
      id,
      synced: false,
      percentage,
      completed: statistic.completed ?? true // Default to completed if not specified
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readwrite');
      const store = transaction.objectStore(STATISTICS_STORE);
      const request = store.add(fullStatistic);

      request.onsuccess = () => {
        console.log('✅ Quiz statistic saved:', id);
        resolve(id);
      };

      request.onerror = () => {
        console.error('Failed to save quiz statistic:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Save a generated quiz (not yet completed)
   */
  async saveGeneratedQuiz(quizTitle: string, snippetIds: string[], totalQuestions: number, enrichment: boolean, quizData?: any): Promise<string> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const id = this.generateUUID();
    const generatedQuiz: QuizStatistic = {
      id,
      quizTitle,
      snippetIds,
      score: 0,
      totalQuestions,
      percentage: 0,
      timeTaken: 0,
      completedAt: '', // Empty until quiz is completed
      answers: [],
      enrichment,
      synced: false,
      completed: false,
      quizData
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readwrite');
      const store = transaction.objectStore(STATISTICS_STORE);
      const request = store.add(generatedQuiz);

      request.onsuccess = () => {
        console.log('✅ Generated quiz saved:', id);
        resolve(id);
      };

      request.onerror = () => {
        console.error('Failed to save generated quiz:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Update quiz data (for regenerated quizzes)
   */
  async updateQuizData(id: string, quizData: any): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readwrite');
      const store = transaction.objectStore(STATISTICS_STORE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const quiz = getRequest.result;
        if (!quiz) {
          reject(new Error('Quiz not found'));
          return;
        }

        const updatedQuiz: QuizStatistic = {
          ...quiz,
          quizData
        };

        const putRequest = store.put(updatedQuiz);

        putRequest.onsuccess = () => {
          console.log('✅ Quiz data updated:', id);
          resolve();
        };

        putRequest.onerror = () => {
          console.error('Failed to update quiz data:', putRequest.error);
          reject(putRequest.error);
        };
      };

      getRequest.onerror = () => {
        console.error('Failed to get quiz:', getRequest.error);
        reject(getRequest.error);
      };
    });
  }

  /**
   * Update a quiz statistic with completion data
   */
  async updateQuizCompletion(id: string, score: number, timeTaken: number, answers: QuizAnswer[]): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readwrite');
      const store = transaction.objectStore(STATISTICS_STORE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const quiz = getRequest.result;
        if (!quiz) {
          reject(new Error('Quiz not found'));
          return;
        }

        const percentage = Math.round((score / quiz.totalQuestions) * 100);
        const updatedQuiz: QuizStatistic = {
          ...quiz,
          score,
          percentage,
          timeTaken,
          answers,
          completedAt: new Date().toISOString(),
          completed: true
        };

        const putRequest = store.put(updatedQuiz);

        putRequest.onsuccess = () => {
          console.log('✅ Quiz completion updated:', id);
          resolve();
        };

        putRequest.onerror = () => {
          console.error('Failed to update quiz completion:', putRequest.error);
          reject(putRequest.error);
        };
      };

      getRequest.onerror = () => {
        console.error('Failed to get quiz:', getRequest.error);
        reject(getRequest.error);
      };
    });
  }

  /**
   * Get all quiz statistics, sorted by completion date (newest first)
   */
  async getQuizStatistics(limit?: number): Promise<QuizStatistic[]> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readonly');
      const store = transaction.objectStore(STATISTICS_STORE);
      
      // Get ALL quizzes (completed and incomplete) and sort in memory
      // This ensures incomplete quizzes (with completedAt='') are included
      const request = store.getAll();

      request.onsuccess = () => {
        const allQuizzes = request.result as QuizStatistic[];
        
        // Sort by completedAt descending (most recent first)
        // Incomplete quizzes (completedAt='') will appear first
        const sorted = allQuizzes.sort((a, b) => {
          // Empty completedAt means incomplete - show at top
          if (!a.completedAt && !b.completedAt) return 0;
          if (!a.completedAt) return -1; // a is incomplete, comes first
          if (!b.completedAt) return 1;  // b is incomplete, comes first
          
          // Both completed - sort by date descending
          return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
        });
        
        // Apply limit if specified
        const results = limit ? sorted.slice(0, limit) : sorted;
        
        console.log('📊 getQuizStatistics results:', {
          total: allQuizzes.length,
          incomplete: allQuizzes.filter(q => !q.completedAt).length,
          completed: allQuizzes.filter(q => q.completedAt).length,
          returned: results.length
        });
        
        resolve(results);
      };

      request.onerror = () => {
        console.error('Failed to get quiz statistics:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a single quiz statistic by ID
   */
  async getQuizStatistic(id: string): Promise<QuizStatistic | null> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readonly');
      const store = transaction.objectStore(STATISTICS_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('Failed to get quiz statistic:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete a quiz statistic
   */
  async deleteQuizStatistic(id: string): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readwrite');
      const store = transaction.objectStore(STATISTICS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log('✅ Quiz statistic deleted:', id);
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to delete quiz statistic:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Mark quiz statistics as synced
   */
  async markAsSynced(ids: string[]): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readwrite');
      const store = transaction.objectStore(STATISTICS_STORE);
      
      let completed = 0;
      let hasError = false;

      for (const id of ids) {
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
          const statistic = getRequest.result;
          if (statistic) {
            statistic.synced = true;
            const updateRequest = store.put(statistic);
            
            updateRequest.onsuccess = () => {
              completed++;
              if (completed === ids.length && !hasError) {
                console.log(`✅ Marked ${ids.length} quiz statistics as synced`);
                resolve();
              }
            };
            
            updateRequest.onerror = () => {
              if (!hasError) {
                hasError = true;
                reject(updateRequest.error);
              }
            };
          } else {
            completed++;
            if (completed === ids.length && !hasError) {
              resolve();
            }
          }
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
   * Get unsynced quiz statistics
   */
  async getUnsyncedStatistics(): Promise<QuizStatistic[]> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readonly');
      const store = transaction.objectStore(STATISTICS_STORE);
      const index = store.index('synced');
      const request = index.openCursor(IDBKeyRange.only(false));
      
      const results: QuizStatistic[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        console.error('Failed to get unsynced statistics:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get quiz statistics summary
   */
  async getStatisticsSummary(): Promise<{
    totalQuizzes: number;
    averageScore: number;
    averagePercentage: number;
    highestScore: number;
    lowestScore: number;
    totalQuestionsAnswered: number;
    totalCorrectAnswers: number;
  }> {
    const allStatistics = await this.getQuizStatistics();
    
    // Only count completed quizzes in summary statistics
    const statistics = allStatistics.filter(stat => stat.completed);
    
    if (statistics.length === 0) {
      return {
        totalQuizzes: 0,
        averageScore: 0,
        averagePercentage: 0,
        highestScore: 0,
        lowestScore: 0,
        totalQuestionsAnswered: 0,
        totalCorrectAnswers: 0
      };
    }

    const totalScore = statistics.reduce((sum, stat) => sum + stat.score, 0);
    const totalQuestions = statistics.reduce((sum, stat) => sum + stat.totalQuestions, 0);
    const totalCorrect = statistics.reduce((sum, stat) => sum + stat.score, 0);
    const percentages = statistics.map(stat => stat.percentage);

    return {
      totalQuizzes: statistics.length,
      averageScore: totalScore / statistics.length,
      averagePercentage: percentages.reduce((sum, p) => sum + p, 0) / statistics.length,
      highestScore: Math.max(...percentages),
      lowestScore: Math.min(...percentages),
      totalQuestionsAnswered: totalQuestions,
      totalCorrectAnswers: totalCorrect
    };
  }

  /**
   * Clear all quiz statistics (use with caution!)
   */
  async clearAllStatistics(): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STATISTICS_STORE], 'readwrite');
      const store = transaction.objectStore(STATISTICS_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('✅ All quiz statistics cleared');
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to clear quiz statistics:', request.error);
        reject(request.error);
      };
    });
  }
}

// Export singleton instance
export const quizDB = new QuizDatabase();
