/**
 * Unified Storage Service
 * 
 * Provides a consistent API for all persistence operations
 * All operations require authentication and are user-scoped
 */

import { db } from './db';
import type { BaseUserRecord } from '../types/persistence';

class UnifiedStorage {
  private currentUserId: string | null = null;

  /**
   * Set the current user ID (called by AuthContext)
   */
  setUserId(userId: string | null): void {
    this.currentUserId = userId;
    console.log('[UnifiedStorage] User ID set:', userId);
  }

  /**
   * Get current user ID
   * @throws Error if user not authenticated
   */
  private getCurrentUserId(): string {
    if (!this.currentUserId) {
      throw new Error('Authentication required for all persistence operations');
    }
    return this.currentUserId;
  }

  /**
   * Save or update a record
   */
  async save<T extends BaseUserRecord>(dataType: string, record: Partial<T>): Promise<void> {
    const userId = this.getCurrentUserId();
    
    const fullRecord: any = {
      ...record,
      userId,
      updatedAt: Date.now(),
    };
    
    // Set createdAt if new record
    if (!record.createdAt) {
      fullRecord.createdAt = Date.now();
    }
    
    // Ensure ID exists
    if (!fullRecord.id) {
      fullRecord.id = crypto.randomUUID();
    }
    
    const table = (db as any)[dataType];
    if (!table) {
      throw new Error(`Unknown data type: ${dataType}`);
    }
    
    await table.put(fullRecord);
    console.log(`[UnifiedStorage] Saved ${dataType}:`, fullRecord.id);
  }

  /**
   * Get a single record by ID
   */
  async get<T extends BaseUserRecord>(dataType: string, id: string): Promise<T | null> {
    const userId = this.getCurrentUserId();
    
    const table = (db as any)[dataType];
    if (!table) {
      throw new Error(`Unknown data type: ${dataType}`);
    }
    
    const record = await table.get(id);
    
    // Verify ownership
    if (record && record.userId !== userId) {
      console.warn(`[UnifiedStorage] Access denied to ${dataType}:${id} (owned by ${record.userId})`);
      return null;
    }
    
    return record || null;
  }

  /**
   * Query records with filters
   */
  async query<T extends BaseUserRecord>(
    dataType: string,
    filters?: {
      projectId?: string;
      status?: string;
      conversationId?: string;
      source?: string;
      quizId?: string;
    }
  ): Promise<T[]> {
    const userId = this.getCurrentUserId();
    
    const table = (db as any)[dataType];
    if (!table) {
      throw new Error(`Unknown data type: ${dataType}`);
    }
    
    let collection;
    
    // Use compound indexes when available
    if (filters?.projectId) {
      collection = table.where('[userId+projectId]').equals([userId, filters.projectId]);
    } else if (filters?.status && dataType === 'plans') {
      collection = table.where('[userId+status]').equals([userId, filters.status]);
    } else if (filters?.conversationId && dataType === 'chatHistory') {
      collection = table.where('[userId+conversationId]').equals([userId, filters.conversationId]);
    } else if (filters?.source && dataType === 'images') {
      collection = table.where('[userId+source]').equals([userId, filters.source]);
    } else if (filters?.quizId && (dataType === 'quizProgress' || dataType === 'quizAnalytics')) {
      collection = table.where('[userId+quizId]').equals([userId, filters.quizId]);
    } else {
      // Default: filter by userId only
      collection = table.where('userId').equals(userId);
    }
    
    return await collection.toArray();
  }

  /**
   * Delete a record
   */
  async delete(dataType: string, id: string): Promise<void> {
    const userId = this.getCurrentUserId();
    
    const table = (db as any)[dataType];
    if (!table) {
      throw new Error(`Unknown data type: ${dataType}`);
    }
    
    const record = await table.get(id);
    
    // Verify ownership
    if (record && record.userId !== userId) {
      throw new Error(`Cannot delete record owned by another user`);
    }
    
    await table.delete(id);
    console.log(`[UnifiedStorage] Deleted ${dataType}:`, id);
  }

  /**
   * Bulk delete records
   */
  async bulkDelete(dataType: string, ids: string[]): Promise<void> {
    const userId = this.getCurrentUserId();
    
    const table = (db as any)[dataType];
    if (!table) {
      throw new Error(`Unknown data type: ${dataType}`);
    }
    
    // Verify ownership of all records
    const records = await table.bulkGet(ids);
    for (const record of records) {
      if (record && record.userId !== userId) {
        throw new Error(`Cannot delete records owned by another user`);
      }
    }
    
    await table.bulkDelete(ids);
    console.log(`[UnifiedStorage] Bulk deleted ${ids.length} ${dataType} records`);
  }

  /**
   * Save UI state (user-scoped, not synced)
   */
  async saveUIState(stateType: string, data: any): Promise<void> {
    const userId = this.getCurrentUserId();
    const tableName = `uiState_${stateType}`;
    
    const table = (db as any)[tableName];
    if (!table) {
      throw new Error(`Unknown UI state type: ${stateType}`);
    }
    
    await table.put({
      userId,
      ...data,
      updatedAt: Date.now(),
    });
    
    console.log(`[UnifiedStorage] Saved UI state:`, stateType);
  }

  /**
   * Get UI state
   */
  async getUIState(stateType: string): Promise<any | null> {
    const userId = this.getCurrentUserId();
    const tableName = `uiState_${stateType}`;
    
    const table = (db as any)[tableName];
    if (!table) {
      throw new Error(`Unknown UI state type: ${stateType}`);
    }
    
    return await table.get(userId);
  }

  /**
   * Clean up old feed items (keep most recent 100 per user)
   */
  async cleanupOldFeedItems(): Promise<void> {
    const userId = this.getCurrentUserId();
    
    const items = await db.feedItems
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('createdAt');
    
    if (items.length > 100) {
      const toDelete = items.slice(100);
      const ids = toDelete.map(item => item.id);
      await db.feedItems.bulkDelete(ids);
      console.log(`[UnifiedStorage] Cleaned up ${ids.length} old feed items`);
    }
  }

  /**
   * Check if an image is orphaned (not referenced by any content)
   */
  async isImageOrphaned(imageId: string): Promise<boolean> {
    const userId = this.getCurrentUserId();
    
    // Check snippets
    const snippetsWithImage = await db.snippets
      .where('userId')
      .equals(userId)
      .filter(s => s.content.includes(imageId))
      .count();
    
    if (snippetsWithImage > 0) return false;
    
    // Check feed items
    const feedItemsWithImage = await db.feedItems
      .where('userId')
      .equals(userId)
      .filter(f => f.image?.includes(imageId) ?? false)
      .count();
    
    if (feedItemsWithImage > 0) return false;
    
    // Check chat history
    const chatWithImage = await db.chatHistory
      .where('userId')
      .equals(userId)
      .filter(c => c.content.includes(imageId))
      .count();
    
    return chatWithImage === 0;
  }

  /**
   * Clean up orphaned images
   */
  async cleanupOrphanedImages(): Promise<void> {
    const userId = this.getCurrentUserId();
    
    const images = await db.images.where('userId').equals(userId).toArray();
    
    for (const image of images) {
      if (await this.isImageOrphaned(image.id)) {
        await db.images.delete(image.id);
        console.log(`[UnifiedStorage] Deleted orphaned image:`, image.id);
      }
    }
  }
}

// Export singleton instance
export const unifiedStorage = new UnifiedStorage();
