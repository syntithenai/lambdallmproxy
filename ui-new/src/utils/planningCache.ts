/**
 * Planning Cache Utility
 * Now using IndexedDB via planningDB module for better capacity
 * This file maintains backward-compatible API
 */

import { planningDB, generatePlanId as dbGeneratePlanId } from './planningDB';
import { unifiedSync } from '../services/unifiedSync';

export interface CachedPlan {
  id: string;
  query: string;
  plan: any;
  systemPrompt?: string;
  userPrompt?: string;
  timestamp: number;
}

/**
 * Generate a unique ID for a plan
 */
function generatePlanId(): string {
  return dbGeneratePlanId();
}

/**
 * Get all cached plans
 * Now reads from IndexedDB instead of localStorage
 */
export async function getAllCachedPlans(): Promise<CachedPlan[]> {
  try {
    return await planningDB.getAllPlans();
  } catch (error) {
    console.error('Error reading planning cache:', error);
    return [];
  }
}

/**
 * Save a new plan to the cache
 * Avoids duplicates by replacing any existing plan with the same query
 * Now saves to IndexedDB instead of localStorage
 */
export async function saveCachedPlan(query: string, plan: any, systemPrompt?: string, userPrompt?: string): Promise<void> {
  try {
    const plans = await getAllCachedPlans();
    const normalizedQuery = query.trim().toLowerCase();
    
    // Check if plan with same query already exists
    const existingPlan = plans.find(p => p.query.trim().toLowerCase() === normalizedQuery);
    
    const newPlan: CachedPlan = {
      id: existingPlan?.id || generatePlanId(), // Reuse ID if updating existing plan
      query: query.trim(),
      plan,
      systemPrompt,
      userPrompt,
      timestamp: Date.now()
    };
    
    await planningDB.savePlan(newPlan);
    
    console.log(`Plan saved ${existingPlan ? '(replaced duplicate)' : '(new)'}:`, query.trim());
    
    // Trigger immediate sync if unified sync is enabled
    if (unifiedSync.isEnabled()) {
      unifiedSync.queueSync('plans', 'high');
    }
    
  } catch (error) {
    console.error('Error saving plan to cache:', error);
    
    // Check if it's a quota error and provide helpful message
    if (error instanceof DOMException && 
        (error.name === 'QuotaExceededError' || (error as any).code === 22)) {
      console.error('Storage quota exceeded. Consider:', 
        '\n1. Deleting old saved plans',
        '\n2. Clearing browser data',
        '\n3. Using persistent storage (navigator.storage.persist())');
      throw new Error('Storage quota exceeded. Please delete some old plans to free up space, or clear your browser cache.');
    }
    throw error;
  }
}

/**
 * Delete a cached plan by ID
 */
export async function deleteCachedPlan(planId: string): Promise<void> {
  try {
    await planningDB.deletePlan(planId);
    
    // Trigger immediate sync if unified sync is enabled
    if (unifiedSync.isEnabled()) {
      unifiedSync.queueSync('plans', 'high');
    }
  } catch (error) {
    console.error('Error deleting cached plan:', error);
    throw error;
  }
}

/**
 * Get a specific cached plan by ID
 */
export async function getCachedPlan(planId: string): Promise<CachedPlan | null> {
  try {
    const plan = await planningDB.getPlan(planId);
    return plan || null;
  } catch (error) {
    console.error('Error getting cached plan:', error);
    return null;
  }
}

/**
 * Clear all cached plans
 */
export async function clearAllCachedPlans(): Promise<void> {
  try {
    await planningDB.clear();
  } catch (error) {
    console.error('Error clearing planning cache:', error);
    throw error;
  }
}

/**
 * Replace all plans (used for sync from cloud)
 */
export async function replacePlans(plans: CachedPlan[]): Promise<void> {
  try {
    await planningDB.replacePlans(plans);
    console.log(`Replaced all plans with ${plans.length} items from sync`);
  } catch (error) {
    console.error('Error replacing plans:', error);
    throw error;
  }
}

/**
 * Get plans modified after timestamp
 */
export async function getPlansModifiedSince(timestamp: number): Promise<CachedPlan[]> {
  try {
    return await planningDB.getPlansModifiedSince(timestamp);
  } catch (error) {
    console.error('Error getting modified plans:', error);
    return [];
  }
}

/**
 * Merge local and remote plans (deduplicates by query, keeps newer timestamp)
 */
export function mergePlans(local: CachedPlan[], remote: CachedPlan[]): CachedPlan[] {
  return planningDB.mergePlans(local, remote);
}

/**
 * Request persistent storage to prevent automatic eviction
 * Returns true if persistent storage is granted
 */
export async function requestPersistentStorage(): Promise<boolean> {
  return await planningDB.requestPersistentStorage();
}

/**
 * Check storage usage and estimate
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number; percentage: number } | null> {
  return await planningDB.getStorageEstimate();
}
