/**
 * Planning Cache Utility
 * Caches completed planning requests in localStorage
 */

export interface CachedPlan {
  id: string;
  query: string;
  plan: any;
  systemPrompt?: string;
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
 */
export function saveCachedPlan(query: string, plan: any, systemPrompt?: string): void {
  try {
    const plans = getAllCachedPlans();
    
    const newPlan: CachedPlan = {
      id: generatePlanId(),
      query: query.trim(),
      plan,
      systemPrompt,
      timestamp: Date.now()
    };
    
    // Add to beginning of array (most recent first)
    plans.unshift(newPlan);
    
    // Limit to 50 most recent plans
    const limitedPlans = plans.slice(0, 50);
    
    localStorage.setItem(PLANNING_CACHE_KEY, JSON.stringify(limitedPlans));
  } catch (error) {
    console.error('Error saving plan to cache:', error);
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
