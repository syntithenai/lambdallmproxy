/**
 * Agent Database - IndexedDB wrapper for agent state persistence
 * 
 * Provides persistent storage for agent states that survives browser
 * close/refresh and enables recovery of interrupted agents.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { AgentState, AgentStatus } from '../types/agent';

const DB_NAME = 'AgentManagerDB';
const STORE_NAME = 'agents';
const DB_VERSION = 1;

/**
 * Agent Database interface
 */
export interface AgentDB {
  saveAgent(state: AgentState): Promise<void>;
  getAgent(id: string): Promise<AgentState | null>;
  getAllAgents(): Promise<AgentState[]>;
  getRunningAgents(): Promise<AgentState[]>;
  getQueuedAgents(): Promise<AgentState[]>;
  getCompletedAgents(): Promise<AgentState[]>;
  getFailedAgents(): Promise<AgentState[]>;
  deleteAgent(id: string): Promise<void>;
  updateAgentStatus(id: string, status: AgentStatus): Promise<void>;
  clearCompletedAgents(): Promise<void>;
  clearAllAgents(): Promise<void>;
}

class AgentDBImpl implements AgentDB {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private async getDB(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Create agents store
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            
            // Indexes for efficient queries
            store.createIndex('status', 'status');
            store.createIndex('chatId', 'chatId');
            store.createIndex('createdAt', 'createdAt');
            store.createIndex('completedAt', 'completedAt');
          }
        }
      });
    }
    return this.dbPromise;
  }

  async saveAgent(state: AgentState): Promise<void> {
    try {
      const db = await this.getDB();
      await db.put(STORE_NAME, state);
      
      // Also backup to localStorage for faster recovery
      this.backupToLocalStorage(state);
    } catch (error) {
      console.error('Failed to save agent to IndexedDB:', error);
      throw error;
    }
  }

  async getAgent(id: string): Promise<AgentState | null> {
    try {
      const db = await this.getDB();
      const agent = await db.get(STORE_NAME, id);
      return agent || null;
    } catch (error) {
      console.error('Failed to get agent from IndexedDB:', error);
      return null;
    }
  }

  async getAllAgents(): Promise<AgentState[]> {
    try {
      const db = await this.getDB();
      const agents = await db.getAll(STORE_NAME);
      
      // Sort by createdAt descending (newest first)
      return agents.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Failed to get all agents from IndexedDB:', error);
      return [];
    }
  }

  async getRunningAgents(): Promise<AgentState[]> {
    try {
      const db = await this.getDB();
      const index = db.transaction(STORE_NAME).store.index('status');
      const agents = await index.getAll('running');
      return agents;
    } catch (error) {
      console.error('Failed to get running agents from IndexedDB:', error);
      return [];
    }
  }

  async getQueuedAgents(): Promise<AgentState[]> {
    try {
      const db = await this.getDB();
      const index = db.transaction(STORE_NAME).store.index('status');
      const agents = await index.getAll('queued');
      return agents;
    } catch (error) {
      console.error('Failed to get queued agents from IndexedDB:', error);
      return [];
    }
  }

  async getCompletedAgents(): Promise<AgentState[]> {
    try {
      const db = await this.getDB();
      const index = db.transaction(STORE_NAME).store.index('status');
      const agents = await index.getAll('completed');
      
      // Sort by completedAt descending
      return agents.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    } catch (error) {
      console.error('Failed to get completed agents from IndexedDB:', error);
      return [];
    }
  }

  async getFailedAgents(): Promise<AgentState[]> {
    try {
      const db = await this.getDB();
      const allAgents = await db.getAll(STORE_NAME);
      
      // Filter for error or aborted status
      return allAgents.filter(agent => 
        agent.status === 'error' || agent.status === 'aborted'
      ).sort((a, b) => b.lastUpdateTime - a.lastUpdateTime);
    } catch (error) {
      console.error('Failed to get failed agents from IndexedDB:', error);
      return [];
    }
  }

  async deleteAgent(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      await db.delete(STORE_NAME, id);
      
      // Remove from localStorage backup
      localStorage.removeItem(`agent_backup_${id}`);
    } catch (error) {
      console.error('Failed to delete agent from IndexedDB:', error);
      throw error;
    }
  }

  async updateAgentStatus(id: string, status: AgentStatus): Promise<void> {
    try {
      const agent = await this.getAgent(id);
      if (agent) {
        agent.status = status;
        agent.lastUpdateTime = Date.now();
        
        if (status === 'completed') {
          agent.completedAt = Date.now();
        }
        
        await this.saveAgent(agent);
      }
    } catch (error) {
      console.error('Failed to update agent status:', error);
      throw error;
    }
  }

  async clearCompletedAgents(): Promise<void> {
    try {
      const completed = await this.getCompletedAgents();
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      
      await Promise.all([
        ...completed.map(agent => tx.store.delete(agent.id)),
        tx.done
      ]);
      
      // Clean up localStorage backups
      completed.forEach(agent => {
        localStorage.removeItem(`agent_backup_${agent.id}`);
      });
    } catch (error) {
      console.error('Failed to clear completed agents:', error);
      throw error;
    }
  }

  async clearAllAgents(): Promise<void> {
    try {
      const db = await this.getDB();
      await db.clear(STORE_NAME);
      
      // Clear localStorage backups
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('agent_backup_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Failed to clear all agents:', error);
      throw error;
    }
  }

  /**
   * Backup essential agent data to localStorage for faster recovery
   */
  private backupToLocalStorage(agent: AgentState): void {
    try {
      const backup = {
        id: agent.id,
        chatId: agent.chatId,
        status: agent.status,
        lastUpdateTime: agent.lastUpdateTime,
        title: agent.title
      };
      localStorage.setItem(`agent_backup_${agent.id}`, JSON.stringify(backup));
    } catch (error) {
      // localStorage may be full or disabled - non-critical error
      console.warn('Failed to backup agent to localStorage:', error);
    }
  }
}

// Export singleton instance
export const agentDB: AgentDB = new AgentDBImpl();

/**
 * Find interrupted agents (were running but haven't updated recently)
 */
export async function findInterruptedAgents(): Promise<AgentState[]> {
  const allAgents = await agentDB.getAllAgents();
  const now = Date.now();
  const TIMEOUT_MS = 30000; // 30 seconds without update = interrupted
  
  return allAgents.filter(agent => 
    agent.status === 'running' && 
    (now - agent.lastUpdateTime > TIMEOUT_MS)
  );
}
