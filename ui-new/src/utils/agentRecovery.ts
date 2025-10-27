/**
 * Agent Recovery Utilities
 * 
 * Handles detection and recovery of interrupted agents when the app starts.
 */

import type { AgentState } from '../types/agent';
import { agentDB, findInterruptedAgents } from './agentDB';

/**
 * Recovery action type
 */
export type RecoveryAction = 'recover' | 'discard' | 'none';

/**
 * Recovery options
 */
export interface RecoveryOptions {
  onInterruptedAgentsFound?: (agents: AgentState[]) => void;
  autoRecover?: boolean; // Automatically recover all without showing dialog
  autoDiscard?: boolean; // Automatically discard all without showing dialog
}

/**
 * Check for interrupted agents on app startup
 * Returns true if interrupted agents were found, false otherwise
 */
export async function checkForInterruptedAgents(
  options: RecoveryOptions = {}
): Promise<boolean> {
  const interruptedAgents = await findInterruptedAgents();
  
  if (interruptedAgents.length === 0) {
    return false;
  }
  
  console.log(`🔄 Found ${interruptedAgents.length} interrupted agent(s)`, interruptedAgents);
  
  // Auto-recover mode
  if (options.autoRecover) {
    await recoverAgents(interruptedAgents.map(a => a.id));
    return true;
  }
  
  // Auto-discard mode
  if (options.autoDiscard) {
    await discardAgents(interruptedAgents.map(a => a.id));
    return true;
  }
  
  // Manual mode - notify caller to show dialog
  if (options.onInterruptedAgentsFound) {
    options.onInterruptedAgentsFound(interruptedAgents);
  }
  
  return true;
}

/**
 * Recover interrupted agents by resetting them to 'queued' status
 */
export async function recoverAgents(agentIds: string[]): Promise<void> {
  const recoveredCount = agentIds.length;
  
  for (const agentId of agentIds) {
    const agent = await agentDB.getAgent(agentId);
    if (agent) {
      // Reset to queued status for recovery
      agent.status = 'queued';
      agent.retryCount += 1;
      agent.lastUpdateTime = Date.now();
      agent.lastError = undefined;
      
      await agentDB.saveAgent(agent);
      
      // Emit recovery event
      window.dispatchEvent(new CustomEvent('agent-recovered', { 
        detail: agent 
      }));
    }
  }
  
  console.log(`✅ Recovered ${recoveredCount} agent(s)`);
}

/**
 * Discard interrupted agents by marking them as aborted
 */
export async function discardAgents(agentIds: string[]): Promise<void> {
  const discardedCount = agentIds.length;
  
  for (const agentId of agentIds) {
    const agent = await agentDB.getAgent(agentId);
    if (agent) {
      agent.status = 'aborted';
      agent.lastError = 'Discarded by user after interruption';
      agent.lastUpdateTime = Date.now();
      
      await agentDB.saveAgent(agent);
    }
  }
  
  console.log(`🗑️ Discarded ${discardedCount} agent(s)`);
}

/**
 * Get recovery statistics for display
 */
export async function getRecoveryStats(): Promise<{
  interruptedCount: number;
  oldestInterruption: number | null; // Unix timestamp
  newestInterruption: number | null; // Unix timestamp
}> {
  const interrupted = await findInterruptedAgents();
  
  if (interrupted.length === 0) {
    return {
      interruptedCount: 0,
      oldestInterruption: null,
      newestInterruption: null
    };
  }
  
  const times = interrupted.map(a => a.lastUpdateTime).sort((a, b) => a - b);
  
  return {
    interruptedCount: interrupted.length,
    oldestInterruption: times[0],
    newestInterruption: times[times.length - 1]
  };
}

/**
 * Clear all recovery backups from localStorage
 */
export function clearRecoveryBackups(): void {
  const keys = Object.keys(localStorage);
  let clearedCount = 0;
  
  keys.forEach(key => {
    if (key.startsWith('agent_backup_')) {
      localStorage.removeItem(key);
      clearedCount++;
    }
  });
  
  if (clearedCount > 0) {
    console.log(`🧹 Cleared ${clearedCount} recovery backup(s) from localStorage`);
  }
}

/**
 * Check localStorage usage and warn if approaching quota
 */
export async function checkStorageQuota(): Promise<{
  used: number; // In MB
  available: number; // In MB
  total: number; // In MB
  percentUsed: number;
  isNearLimit: boolean; // > 80% used
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const used = (estimate.usage || 0) / (1024 * 1024); // Convert to MB
    const total = (estimate.quota || 0) / (1024 * 1024);
    const available = total - used;
    const percentUsed = total > 0 ? (used / total) * 100 : 0;
    
    return {
      used,
      available,
      total,
      percentUsed,
      isNearLimit: percentUsed > 80
    };
  }
  
  // Fallback for browsers without storage API
  return {
    used: 0,
    available: 1000,
    total: 1000,
    percentUsed: 0,
    isNearLimit: false
  };
}
