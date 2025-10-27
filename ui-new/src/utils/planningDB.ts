/**
 * Planning Database (IndexedDB)
 * Migrates from localStorage to IndexedDB for better capacity and performance
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { CachedPlan } from './planningCache';

interface PlanningDBSchema extends DBSchema {
  plans: {
    key: string;
    value: CachedPlan;
    indexes: { 
      'by-timestamp': number;
      'by-query': string;
    };
  };
}

const DB_NAME = 'PlanningDB';
const DB_VERSION = 1;
const STORE_NAME = 'plans';
const MAX_PLANS = 50;

class PlanningDB {
  private db: IDBPDatabase<PlanningDBSchema> | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize database and perform one-time migration from localStorage
   */
  async init(): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    if (this.db) {
      return; // Already initialized
    }

    try {
      // Open database with schema
      this.db = await openDB<PlanningDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Create plans object store with indexes
          const planStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          planStore.createIndex('by-timestamp', 'timestamp');
          planStore.createIndex('by-query', 'query');
          
          console.log('✅ PlanningDB object store created');
        },
      });

      console.log('✅ PlanningDB initialized');

      // Perform one-time migration from localStorage
      await this.migrateFromLocalStorage();

    } catch (error) {
      console.error('❌ Error initializing PlanningDB:', error);
      throw error;
    }
  }

  /**
   * One-time migration from localStorage to IndexedDB
   * Only runs once per browser/device
   */
  private async migrateFromLocalStorage(): Promise<void> {
    // Check if migration already completed
    const migrated = localStorage.getItem('plans_migrated_to_idb');
    if (migrated === 'true') {
      console.log('✓ Plans already migrated to IndexedDB');
      return;
    }

    try {
      // Read old plans from localStorage
      const oldPlansStr = localStorage.getItem('llm_proxy_planning_cache');
      if (!oldPlansStr) {
        console.log('✓ No plans in localStorage to migrate');
        localStorage.setItem('plans_migrated_to_idb', 'true');
        return;
      }

      const oldPlans: CachedPlan[] = JSON.parse(oldPlansStr);
      
      if (!Array.isArray(oldPlans) || oldPlans.length === 0) {
        console.log('✓ No valid plans in localStorage to migrate');
        localStorage.setItem('plans_migrated_to_idb', 'true');
        return;
      }

      // Write all plans to IndexedDB
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      let migratedCount = 0;
      for (const plan of oldPlans) {
        try {
          await store.put(plan);
          migratedCount++;
        } catch (error) {
          console.error(`Error migrating plan ${plan.id}:`, error);
        }
      }

      await tx.done;

      console.log(`✅ Migrated ${migratedCount} of ${oldPlans.length} plans from localStorage to IndexedDB`);

      // Mark migration as complete
      localStorage.setItem('plans_migrated_to_idb', 'true');

      // Keep localStorage for backward compatibility temporarily (can remove after deployment)
      // Don't delete yet in case rollback is needed
      
    } catch (error) {
      console.error('❌ Error during plan migration:', error);
      // Don't mark as complete if migration failed
      throw error;
    }
  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureInit(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  /**
   * Save a plan to IndexedDB
   * Replaces existing plan with same ID
   */
  async savePlan(plan: CachedPlan): Promise<void> {
    await this.ensureInit();
    
    try {
      await this.db!.put(STORE_NAME, plan);
      console.log(`✓ Plan saved to IndexedDB: ${plan.query.substring(0, 50)}...`);
      
      // Auto-prune old plans if exceeding limit
      await this.pruneOldPlans();
      
    } catch (error) {
      console.error('❌ Error saving plan to IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Get all plans from IndexedDB
   * Returns sorted by timestamp (newest first)
   */
  async getAllPlans(): Promise<CachedPlan[]> {
    await this.ensureInit();
    
    try {
      const plans = await this.db!.getAll(STORE_NAME);
      
      // Sort by timestamp (newest first)
      return plans.sort((a, b) => b.timestamp - a.timestamp);
      
    } catch (error) {
      console.error('❌ Error reading plans from IndexedDB:', error);
      return [];
    }
  }

  /**
   * Get a specific plan by ID
   */
  async getPlan(id: string): Promise<CachedPlan | undefined> {
    await this.ensureInit();
    
    try {
      return await this.db!.get(STORE_NAME, id);
    } catch (error) {
      console.error(`❌ Error reading plan ${id} from IndexedDB:`, error);
      return undefined;
    }
  }

  /**
   * Delete a plan by ID
   */
  async deletePlan(id: string): Promise<void> {
    await this.ensureInit();
    
    try {
      await this.db!.delete(STORE_NAME, id);
      console.log(`✓ Plan deleted from IndexedDB: ${id}`);
    } catch (error) {
      console.error(`❌ Error deleting plan ${id} from IndexedDB:`, error);
      throw error;
    }
  }

  /**
   * Clear all plans
   */
  async clear(): Promise<void> {
    await this.ensureInit();
    
    try {
      await this.db!.clear(STORE_NAME);
      console.log('✓ All plans cleared from IndexedDB');
    } catch (error) {
      console.error('❌ Error clearing plans from IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Replace all plans (used for cloud sync restore)
   * Clears existing and writes new plans
   */
  async replacePlans(plans: CachedPlan[]): Promise<void> {
    await this.ensureInit();
    
    try {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      // Clear existing
      await store.clear();
      
      // Add all new plans
      for (const plan of plans) {
        await store.put(plan);
      }
      
      await tx.done;
      
      console.log(`✅ Replaced all plans with ${plans.length} items from sync`);
      
    } catch (error) {
      console.error('❌ Error replacing plans in IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Get plans modified after a specific timestamp
   */
  async getPlansModifiedSince(timestamp: number): Promise<CachedPlan[]> {
    await this.ensureInit();
    
    try {
      const allPlans = await this.getAllPlans();
      return allPlans.filter(p => p.timestamp > timestamp);
    } catch (error) {
      console.error('❌ Error getting modified plans:', error);
      return [];
    }
  }

  /**
   * Prune old plans to keep only MAX_PLANS most recent
   * Called automatically after saves
   */
  private async pruneOldPlans(): Promise<void> {
    try {
      const allPlans = await this.getAllPlans();
      
      if (allPlans.length <= MAX_PLANS) {
        return; // Nothing to prune
      }

      // Sort by timestamp (newest first)
      const sortedPlans = allPlans.sort((a, b) => b.timestamp - a.timestamp);
      
      // Delete plans beyond limit
      const plansToDelete = sortedPlans.slice(MAX_PLANS);
      
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      for (const plan of plansToDelete) {
        await store.delete(plan.id);
      }
      
      await tx.done;
      
      console.log(`✓ Pruned ${plansToDelete.length} old plans (keeping ${MAX_PLANS} most recent)`);
      
    } catch (error) {
      console.error('❌ Error pruning old plans:', error);
      // Don't throw - pruning failure shouldn't break saves
    }
  }

  /**
   * Get storage usage estimate
   */
  async getStorageEstimate(): Promise<{ usage: number; quota: number; percentage: number } | null> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percentage = quota > 0 ? (usage / quota) * 100 : 0;
        
        return { usage, quota, percentage };
      } catch (error) {
        console.error('Error getting storage estimate:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * Request persistent storage to prevent automatic eviction
   */
  async requestPersistentStorage(): Promise<boolean> {
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
   * Merge local and remote plans (deduplicates by query, keeps newer timestamp)
   */
  mergePlans(local: CachedPlan[], remote: CachedPlan[]): CachedPlan[] {
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
      .slice(0, MAX_PLANS);
  }
}

// Export singleton instance
export const planningDB = new PlanningDB();

// Helper function to generate plan IDs
export function generatePlanId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
