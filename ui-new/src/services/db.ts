/**
 * IndexedDB Database Schema
 * 
 * This file defines the IndexedDB schema using Dexie.js
 * All tables include userId for user-scoped data
 */

import Dexie from 'dexie';
import type { Table } from 'dexie';
import type {
  Settings,
  Snippet,
  FeedItem,
  RAGData,
  Quiz,
  QuizProgress,
  QuizAnalytics,
  Plan,
  Playlist,
  Project,
  ChatMessage,
  ImageRecord,
  UIStateRecentTags,
  UIStateLastActiveChat,
  UIStateImageEditor,
  UIStateScrollPosition,
} from '../types/persistence';

/**
 * Unified Database
 * All user data stored in IndexedDB with user-scoping
 */
export class UnifiedDB extends Dexie {
  // Synchronized tables
  settings!: Table<Settings, string>;
  snippets!: Table<Snippet, string>;
  ragData!: Table<RAGData, string>;
  quizzes!: Table<Quiz, string>;
  quizProgress!: Table<QuizProgress, string>;
  quizAnalytics!: Table<QuizAnalytics, string>;
  plans!: Table<Plan, string>;
  playlists!: Table<Playlist, string>;
  projects!: Table<Project, string>;
  chatHistory!: Table<ChatMessage, string>;
  images!: Table<ImageRecord, string>;
  
  // Local-only tables
  feedItems!: Table<FeedItem, string>;
  
  // UI State tables (user-scoped, not synced)
  uiState_recentTags!: Table<UIStateRecentTags, string>;
  uiState_lastActiveChat!: Table<UIStateLastActiveChat, string>;
  uiState_imageEditor!: Table<UIStateImageEditor, string>;
  uiState_scrollPosition!: Table<UIStateScrollPosition, string>;

  constructor() {
    super('UnifiedDB');
    
    // Version 1: Initial schema
    this.version(1).stores({
      // Synchronized tables
      settings: 'userId',
      snippets: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId], [userId+createdAt]',
      ragData: 'id, userId, createdAt, updatedAt, [userId+createdAt]',
      quizzes: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId], [userId+createdAt]',
      quizProgress: 'id, userId, quizId, updatedAt, [userId+quizId], [userId+updatedAt]',
      quizAnalytics: 'id, userId, quizId, createdAt, [userId+quizId], [userId+createdAt]',
      plans: 'id, userId, createdAt, updatedAt, projectId, status, [userId+projectId], [userId+status], [userId+createdAt]',
      playlists: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId], [userId+createdAt]',
      projects: 'id, userId, createdAt, updatedAt, [userId+createdAt]',
      chatHistory: 'id, userId, createdAt, projectId, conversationId, [userId+projectId], [userId+conversationId], [userId+createdAt]',
      images: 'id, userId, createdAt, source, [userId+source], [userId+createdAt]',
      
      // Local-only tables
      feedItems: 'id, userId, createdAt, updatedAt, projectId, [userId+createdAt]',
      
      // UI State tables
      uiState_recentTags: 'userId',
      uiState_lastActiveChat: 'userId',
      uiState_imageEditor: 'userId',
      uiState_scrollPosition: 'userId',
    });
  }
}

// Export singleton instance
export const db = new UnifiedDB();

// Export helper to check if database is ready
export async function isDatabaseReady(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch (error) {
    console.error('[DB] Failed to open database:', error);
    return false;
  }
}

// Export helper to clear all user data (for sign out)
export async function clearUserData(userId: string): Promise<void> {
  console.log('[DB] Clearing all data for user:', userId);
  
  await db.transaction('rw', [
    db.settings,
    db.snippets,
    db.feedItems,
    db.ragData,
    db.quizzes,
    db.quizProgress,
    db.quizAnalytics,
    db.plans,
    db.playlists,
    db.projects,
    db.chatHistory,
    db.images,
    db.uiState_recentTags,
    db.uiState_lastActiveChat,
    db.uiState_imageEditor,
    db.uiState_scrollPosition,
  ], async () => {
    // Clear settings
    await db.settings.where('userId').equals(userId).delete();
    
    // Clear all user records
    await db.snippets.where('userId').equals(userId).delete();
    await db.feedItems.where('userId').equals(userId).delete();
    await db.ragData.where('userId').equals(userId).delete();
    await db.quizzes.where('userId').equals(userId).delete();
    await db.quizProgress.where('userId').equals(userId).delete();
    await db.quizAnalytics.where('userId').equals(userId).delete();
    await db.plans.where('userId').equals(userId).delete();
    await db.playlists.where('userId').equals(userId).delete();
    await db.projects.where('userId').equals(userId).delete();
    await db.chatHistory.where('userId').equals(userId).delete();
    await db.images.where('userId').equals(userId).delete();
    
    // Clear UI state
    await db.uiState_recentTags.where('userId').equals(userId).delete();
    await db.uiState_lastActiveChat.where('userId').equals(userId).delete();
    await db.uiState_imageEditor.where('userId').equals(userId).delete();
    await db.uiState_scrollPosition.where('userId').equals(userId).delete();
  });
  
  console.log('[DB] User data cleared successfully');
}

// Export helper to get database statistics
export async function getDatabaseStats(userId: string): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  
  stats.snippets = await db.snippets.where('userId').equals(userId).count();
  stats.feedItems = await db.feedItems.where('userId').equals(userId).count();
  stats.ragData = await db.ragData.where('userId').equals(userId).count();
  stats.quizzes = await db.quizzes.where('userId').equals(userId).count();
  stats.quizProgress = await db.quizProgress.where('userId').equals(userId).count();
  stats.quizAnalytics = await db.quizAnalytics.where('userId').equals(userId).count();
  stats.plans = await db.plans.where('userId').equals(userId).count();
  stats.playlists = await db.playlists.where('userId').equals(userId).count();
  stats.projects = await db.projects.where('userId').equals(userId).count();
  stats.chatHistory = await db.chatHistory.where('userId').equals(userId).count();
  stats.images = await db.images.where('userId').equals(userId).count();
  
  return stats;
}
