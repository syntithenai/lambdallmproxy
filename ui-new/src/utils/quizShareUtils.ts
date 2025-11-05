/**
 * Quiz Share Utilities
 * 
 * Handles compression, encoding, and sharing of quizzes via URL.
 * Allows quizzes to be shared and taken without backend calls or authentication.
 */

import LZString from 'lz-string';
import type { Quiz } from './api';

const CHROME_URL_LIMIT = 32000;
const VERSION = 1;

export interface SharedQuiz {
  version: number;
  timestamp: number;
  shareType: 'quiz';
  quiz: Quiz;
  metadata?: {
    compressed: boolean;
    originalSize: number;
    compressedSize?: number;
    sharedBy?: string;
    enrichment?: boolean;
  };
}

/**
 * Encode quiz data for URL sharing
 */
export function encodeQuizData(data: SharedQuiz): string {
  const json = JSON.stringify(data);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decode quiz data from URL
 */
export function decodeQuizData(encoded: string): SharedQuiz | null {
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) return null;
    
    const data = JSON.parse(decompressed) as SharedQuiz;
    
    // Validate structure
    if (!data.version || data.shareType !== 'quiz' || !data.quiz) {
      console.error('Invalid quiz share data structure');
      return null;
    }
    
    // Validate quiz structure
    if (!data.quiz.title || !Array.isArray(data.quiz.questions)) {
      console.error('Invalid quiz structure');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to decode quiz data:', error);
    return null;
  }
}

/**
 * Create shareable quiz data
 */
export function createQuizShareData(
  quiz: Quiz,
  options?: {
    sharedBy?: string;
    enrichment?: boolean;
  }
): string {
  const json = JSON.stringify(quiz);
  const originalSize = json.length;
  
  const sharedQuiz: SharedQuiz = {
    version: VERSION,
    timestamp: Date.now(),
    shareType: 'quiz',
    quiz,
    metadata: {
      compressed: true,
      originalSize,
      sharedBy: options?.sharedBy,
      enrichment: options?.enrichment
    }
  };
  
  const compressed = encodeQuizData(sharedQuiz);
  
  if (sharedQuiz.metadata) {
    sharedQuiz.metadata.compressedSize = compressed.length;
  }
  
  // Check URL length
  const testUrl = `${window.location.origin}${window.location.pathname}#/quiz/shared?data=${compressed}`;
  if (testUrl.length > CHROME_URL_LIMIT) {
    console.warn(`Quiz share URL exceeds Chrome limit: ${testUrl.length} > ${CHROME_URL_LIMIT}`);
  }
  
  return compressed;
}

/**
 * Generate full share URL for quiz
 */
export function generateQuizShareUrl(compressed: string): string {
  // Use VITE_SHARE_BASE_URL if defined, otherwise use current origin
  const shareBaseUrl = import.meta.env.VITE_SHARE_BASE_URL;
  const baseUrl = shareBaseUrl 
    ? shareBaseUrl + window.location.pathname
    : window.location.origin + window.location.pathname;
  return `${baseUrl}#/quiz/shared?data=${compressed}`;
}

/**
 * Check if current URL has quiz share data
 */
export function hasQuizShareData(): boolean {
  const hash = window.location.hash;
  return hash.includes('/quiz/shared?data=');
}

/**
 * Extract quiz share data from current URL
 */
export function getQuizShareDataFromUrl(): SharedQuiz | null {
  // Check hash-based routing (e.g., #/quiz/shared?data=...)
  const hash = window.location.hash;
  if (hash.includes('/quiz/shared?data=')) {
    const match = hash.match(/data=([^&]+)/);
    if (match) {
      return decodeQuizData(match[1]);
    }
  }
  
  return null;
}

/**
 * Validate quiz data structure
 */
export function isValidQuiz(quiz: any): quiz is Quiz {
  if (!quiz || typeof quiz !== 'object') return false;
  if (typeof quiz.title !== 'string' || !quiz.title) return false;
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) return false;
  
  // Validate each question
  return quiz.questions.every((q: any) => {
    if (!q || typeof q !== 'object') return false;
    if (typeof q.id !== 'string' || !q.id) return false;
    if (typeof q.prompt !== 'string' || !q.prompt) return false;
    if (typeof q.answerId !== 'string' || !q.answerId) return false;
    if (!Array.isArray(q.choices) || q.choices.length === 0) return false;
    
    // Validate choices
    return q.choices.every((c: any) => {
      return c && typeof c === 'object' && 
             typeof c.id === 'string' && c.id &&
             typeof c.text === 'string' && c.text;
    });
  });
}
