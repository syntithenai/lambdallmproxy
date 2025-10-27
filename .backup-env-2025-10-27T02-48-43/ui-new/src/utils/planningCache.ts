/**
 * Planning Cache Utility
 * Caches completed planning requests in localStorage
 */

export interface CachedPlan {
  id: string;
  query: string;
  plan: any;
  systemPrompt?: string;
  userPrompt?: string;
  timestamp: number;
}

const PLANNING_CACHE_KEY = 'llm_proxy_planning_cache';

/**
 * Generate a unique ID for a plan
 */
function generatePlanId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all cached plans
 */
export function getAllCachedPlans(): CachedPlan[] {
  try {
    const cached = localStorage.getItem(PLANNING_CACHE_KEY);
    if (!cached) return [];
    
    const plans = JSON.parse(cached);
    return Array.isArray(plans) ? plans : [];
  } catch (error) {
    console.error('Error reading planning cache:', error);
    return [];
  }
}

/**
 * Save a new plan to the cache
 * Avoids duplicates by replacing any existing plan with the same query
 */
export function saveCachedPlan(query: string, plan: any, systemPrompt?: string, userPrompt?: string): void {
  try {
    const plans = getAllCachedPlans();
    const normalizedQuery = query.trim().toLowerCase();
    
    // Remove any existing plans with the same query (case-insensitive)
    const filteredPlans = plans.filter(p => p.query.trim().toLowerCase() !== normalizedQuery);
    
    const newPlan: CachedPlan = {
      id: generatePlanId(),
      query: query.trim(),
      plan,
      systemPrompt,
      userPrompt,
      timestamp: Date.now()
    };
    
    // Add to beginning of array (most recent first)
    filteredPlans.unshift(newPlan);
    
    // Limit to 50 most recent plans
    const limitedPlans = filteredPlans.slice(0, 50);
    
    localStorage.setItem(PLANNING_CACHE_KEY, JSON.stringify(limitedPlans));
    console.log(`Plan saved (${filteredPlans.length > plans.length ? 'new' : 'replaced duplicate'}):`, query.trim());
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
export function deleteCachedPlan(planId: string): void {
  try {
    const plans = getAllCachedPlans();
    const filtered = plans.filter(p => p.id !== planId);
    localStorage.setItem(PLANNING_CACHE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting cached plan:', error);
  }
}

/**
 * Get a specific cached plan by ID
 */
export function getCachedPlan(planId: string): CachedPlan | null {
  const plans = getAllCachedPlans();
  return plans.find(p => p.id === planId) || null;
}

/**
 * Clear all cached plans
 */
export function clearAllCachedPlans(): void {
  try {
    localStorage.removeItem(PLANNING_CACHE_KEY);
  } catch (error) {
    console.error('Error clearing planning cache:', error);
  }
}

/**
 * Replace all plans (used for sync from cloud)
 */
export function replacePlans(plans: CachedPlan[]): void {
  try {
    localStorage.setItem(PLANNING_CACHE_KEY, JSON.stringify(plans));
    console.log(`Replaced all plans with ${plans.length} items from sync`);
  } catch (error) {
    console.error('Error replacing plans:', error);
    throw error;
  }
}

/**
 * Get plans modified after timestamp
 */
export function getPlansModifiedSince(timestamp: number): CachedPlan[] {
  const allPlans = getAllCachedPlans();
  return allPlans.filter(p => p.timestamp > timestamp);
}

/**
 * Merge local and remote plans (deduplicates by query, keeps newer timestamp)
 */
export function mergePlans(local: CachedPlan[], remote: CachedPlan[]): CachedPlan[] {
  const mergedMap = new Map<string, CachedPlan>();

  // Add local plans to map
  local.forEach(plan => {
    const key = plan.query.trim().toLowerCase();
    mergedMap.set(key, plan);
  });

  // Merge remote plans (replace if newer)
  remote.forEach(remotePlan => {
    const key = remotePlan.query.trim().toLowerCase();
    const existingPlan = mergedMap.get(key);
    
    if (!existingPlan || remotePlan.timestamp > existingPlan.timestamp) {
      mergedMap.set(key, remotePlan);
    }
  });

  // Convert back to array and sort by timestamp (newest first)
  return Array.from(mergedMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50); // Limit to 50 most recent
}

/**
 * Request persistent storage to prevent automatic eviction
 * Returns true if persistent storage is granted
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        console.log('Persistent storage request:', granted ? 'granted' : 'denied');
        return granted;
      }
      console.log('Storage is already persistent');
      return true;
    } catch (error) {
      console.error('Error requesting persistent storage:', error);
      return false;
    }
  }
  console.warn('Persistent storage API not available');
  return false;
}

/**
 * Check storage usage and estimate
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number; percentage: number } | null> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;
      
      return {
        usage,
        quota,
        percentage
      };
    } catch (error) {
      console.error('Error getting storage estimate:', error);
      return null;
    }
  }
  return null;
}
