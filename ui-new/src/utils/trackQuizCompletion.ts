/**
 * Quiz Completion Tracking Utility
 * 
 * Tracks quiz completion events with engagement data for feed recommendations.
 * This provides the strongest positive signal for user interest:
 * - Quiz generation: 2x weight (user invested time to create quiz)
 * - High quiz scores (>80%): 3x weight (mastery indicates deep interest)
 */

import { feedDB } from '../db/feedDb';

export interface QuizCompletionData {
  feedItemId: string;
  quizId: string;
  score: number;              // 0.0 to 1.0
  topics: string[];           // Quiz topics
  content: string;            // Quiz content/context
  timeSpent: number;          // Time in milliseconds
}

/**
 * Track quiz completion as a high-value interaction
 */
export async function trackQuizCompletion(data: QuizCompletionData): Promise<void> {
  try {
    await feedDB.saveInteraction({
      feedItemId: data.feedItemId,
      action: 'quiz',
      timeSpent: data.timeSpent,
      itemType: 'didYouKnow', // Most quizzes are from did-you-know items
      topics: data.topics,
      source: 'quiz-generated',
      content: data.content,
      // Quiz engagement fields (strong signal)
      quizGenerated: true,
      quizId: data.quizId,
      quizScore: data.score,
      quizTopics: data.topics
    });

    console.log(`[FeedRecommender] Tracked quiz completion: ${data.quizId}, score: ${(data.score * 100).toFixed(0)}%`);
  } catch (error) {
    console.error('[FeedRecommender] Failed to track quiz completion:', error);
  }
}

/**
 * Track quiz generation (without completion yet)
 */
export async function trackQuizGeneration(
  feedItemId: string,
  quizId: string,
  topics: string[],
  content: string
): Promise<void> {
  try {
    await feedDB.saveInteraction({
      feedItemId,
      action: 'quiz',
      timeSpent: 0, // Will be updated on completion
      itemType: 'didYouKnow',
      topics,
      source: 'quiz-generated',
      content,
      quizGenerated: true,
      quizId,
      quizTopics: topics
    });

    console.log(`[FeedRecommender] Tracked quiz generation: ${quizId}`);
  } catch (error) {
    console.error('[FeedRecommender] Failed to track quiz generation:', error);
  }
}
