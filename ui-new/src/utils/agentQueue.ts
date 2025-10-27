/**
 * Agent Execution Queue
 * 
 * Manages concurrent agent execution with automatic queue management,
 * resource limits, and error handling.
 */

import type { AgentState, AgentLimits } from '../types/agent';
import { estimateAgentMemory } from '../types/agent';
import { agentDB } from './agentDB';
import { 
  getCurrentAgentLimits, 
  enforceAgentLimits
} from './memoryManagement';

/**
 * Callback type for agent execution
 */
export type AgentExecutionCallback = (agent: AgentState) => Promise<void>;

/**
 * Agent queue events
 */
export type AgentQueueEvent = 
  | 'agent-started'
  | 'agent-queued'
  | 'agent-completed'
  | 'agent-error'
  | 'agent-paused'
  | 'agent-aborted'
  | 'queue-updated';

/**
 * Event listener callback
 */
export type AgentQueueListener = (agent: AgentState) => void;

/**
 * Agent Execution Queue Manager
 */
export class AgentExecutionQueue {
  private runningAgents: Map<string, AgentState> = new Map();
  private queuedAgents: AgentState[] = [];
  private limits: AgentLimits;
  private listeners: Map<AgentQueueEvent, Set<AgentQueueListener>> = new Map();
  private executionCallback: AgentExecutionCallback | null = null;

  constructor(limits?: AgentLimits) {
    this.limits = limits || getCurrentAgentLimits();
  }

  /**
   * Set the callback for agent execution
   * This will be called when an agent is ready to run
   */
  setExecutionCallback(callback: AgentExecutionCallback): void {
    this.executionCallback = callback;
  }

  /**
   * Add event listener
   */
  on(event: AgentQueueEvent, listener: AgentQueueListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Remove event listener
   */
  off(event: AgentQueueEvent, listener: AgentQueueListener): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(event: AgentQueueEvent, agent: AgentState): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(agent));
    }
  }

  /**
   * Enqueue an agent for execution
   */
  async enqueue(agent: AgentState): Promise<void> {
    // Update memory estimate
    agent.estimatedMemoryUsage = estimateAgentMemory(agent);
    
    // Check if agent can proceed
    const check = enforceAgentLimits(
      agent,
      this.limits,
      this.runningAgents.size,
      this.queuedAgents.length
    );

    if (!check.canProceed) {
      if (agent.status === 'error') {
        // Agent was rejected
        await agentDB.saveAgent(agent);
        this.emit('agent-error', agent);
        throw new Error(check.reason);
      } else {
        // Agent should be queued
        agent.status = 'queued';
        this.queuedAgents.push(agent);
        await agentDB.saveAgent(agent);
        this.emit('agent-queued', agent);
        this.emit('queue-updated', agent);
        return;
      }
    }

    // Agent can run immediately
    await this.startAgent(agent);
  }

  /**
   * Start an agent
   */
  private async startAgent(agent: AgentState): Promise<void> {
    agent.status = 'running';
    agent.startTime = Date.now();
    agent.lastUpdateTime = Date.now();
    
    this.runningAgents.set(agent.id, agent);
    await agentDB.saveAgent(agent);
    
    this.emit('agent-started', agent);
    this.emit('queue-updated', agent);
    
    // Execute agent if callback is set
    if (this.executionCallback) {
      try {
        await this.executionCallback(agent);
      } catch (error: any) {
        console.error('Agent execution error:', error);
        agent.status = 'error';
        agent.lastError = error.message;
        await agentDB.saveAgent(agent);
        this.emit('agent-error', agent);
        this.runningAgents.delete(agent.id);
        await this.dequeue();
      }
    }
  }

  /**
   * Complete an agent and start next queued agent if available
   */
  async completeAgent(agentId: string): Promise<void> {
    const agent = this.runningAgents.get(agentId);
    if (!agent) return;

    agent.status = 'completed';
    agent.completedAt = Date.now();
    await agentDB.saveAgent(agent);
    
    this.runningAgents.delete(agentId);
    this.emit('agent-completed', agent);
    this.emit('queue-updated', agent);
    
    // Start next queued agent
    await this.dequeue();
  }

  /**
   * Pause an agent
   */
  async pauseAgent(agentId: string): Promise<void> {
    const agent = this.runningAgents.get(agentId);
    if (!agent) {
      // Check if it's queued
      const queuedIndex = this.queuedAgents.findIndex(a => a.id === agentId);
      if (queuedIndex !== -1) {
        const queuedAgent = this.queuedAgents[queuedIndex];
        queuedAgent.status = 'paused';
        await agentDB.saveAgent(queuedAgent);
        this.queuedAgents.splice(queuedIndex, 1);
        this.emit('agent-paused', queuedAgent);
        this.emit('queue-updated', queuedAgent);
      }
      return;
    }

    agent.status = 'paused';
    await agentDB.saveAgent(agent);
    
    this.runningAgents.delete(agentId);
    this.emit('agent-paused', agent);
    this.emit('queue-updated', agent);
    
    // Start next queued agent
    await this.dequeue();
  }

  /**
   * Abort an agent
   */
  async abortAgent(agentId: string): Promise<void> {
    const agent = this.runningAgents.get(agentId);
    if (!agent) {
      // Check if it's queued
      const queuedIndex = this.queuedAgents.findIndex(a => a.id === agentId);
      if (queuedIndex !== -1) {
        const queuedAgent = this.queuedAgents[queuedIndex];
        queuedAgent.status = 'aborted';
        await agentDB.saveAgent(queuedAgent);
        this.queuedAgents.splice(queuedIndex, 1);
        this.emit('agent-aborted', queuedAgent);
        this.emit('queue-updated', queuedAgent);
      }
      return;
    }

    agent.status = 'aborted';
    await agentDB.saveAgent(agent);
    
    this.runningAgents.delete(agentId);
    this.emit('agent-aborted', agent);
    this.emit('queue-updated', agent);
    
    // Start next queued agent
    await this.dequeue();
  }

  /**
   * Resume a paused agent
   */
  async resumeAgent(agentId: string): Promise<void> {
    const agent = await agentDB.getAgent(agentId);
    if (!agent || agent.status !== 'paused') return;

    agent.status = 'idle';
    await this.enqueue(agent);
  }

  /**
   * Start next queued agent if capacity available
   */
  private async dequeue(): Promise<void> {
    if (this.queuedAgents.length > 0 && this.runningAgents.size < this.limits.maxConcurrentAgents) {
      const nextAgent = this.queuedAgents.shift()!;
      await this.startAgent(nextAgent);
    }
  }

  /**
   * Update max concurrent agents limit (dynamic based on memory)
   */
  updateMaxConcurrent(max: number): void {
    this.limits.maxConcurrentAgents = Math.max(1, Math.min(5, max));
    
    // Try to dequeue if we now have capacity
    this.dequeue();
  }

  /**
   * Pause all queued agents (e.g., due to low memory)
   */
  async pauseQueue(): Promise<void> {
    const queuedCopy = [...this.queuedAgents];
    this.queuedAgents = [];
    
    for (const agent of queuedCopy) {
      agent.status = 'paused';
      await agentDB.saveAgent(agent);
      this.emit('agent-paused', agent);
    }
    
    this.emit('queue-updated', queuedCopy[0] || {} as AgentState);
  }

  /**
   * Get current queue status
   */
  getStatus(): {
    running: number;
    queued: number;
    maxConcurrent: number;
    runningAgents: AgentState[];
    queuedAgents: AgentState[];
  } {
    return {
      running: this.runningAgents.size,
      queued: this.queuedAgents.length,
      maxConcurrent: this.limits.maxConcurrentAgents,
      runningAgents: Array.from(this.runningAgents.values()),
      queuedAgents: [...this.queuedAgents]
    };
  }

  /**
   * Clear all agents (useful for testing/reset)
   */
  clear(): void {
    this.runningAgents.clear();
    this.queuedAgents = [];
  }
}

// Export singleton instance
export const agentQueue = new AgentExecutionQueue();
