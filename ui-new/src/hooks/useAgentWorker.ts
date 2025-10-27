/**
 * useAgentWorker Hook
 * 
 * Manages Web Workers for background agent execution.
 * Handles worker lifecycle, message passing, and event emission.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { AgentState, AgentWorkerMessage } from '../types/agent';
import { agentDB } from '../utils/agentDB';
import { agentQueue } from '../utils/agentQueue';

// Import worker URL (Vite-specific syntax)
// The ?worker&url suffix tells Vite to emit the worker as a separate file
const AgentWorkerUrl = new URL('../workers/agent-worker.ts', import.meta.url);

interface AgentWorkerManager {
  workers: Map<string, Worker>;
  maxWorkers: number;
  startAgent(agent: AgentState): void;
  pauseAgent(agentId: string): void;
  abortAgent(agentId: string): void;
  cleanup(): void;
}

/**
 * Hook for managing agent workers
 */
export function useAgentWorker(): AgentWorkerManager {
  const workersRef = useRef(new Map<string, Worker>());
  const maxWorkers = 5; // Max concurrent workers
  const [, forceUpdate] = useState({});

  /**
   * Start an agent in a Web Worker
   */
  const startAgent = useCallback((agent: AgentState) => {
    if (workersRef.current.size >= maxWorkers) {
      throw new Error('Max concurrent workers reached. Please queue agent.');
    }

    // Create worker
    const worker = new Worker(AgentWorkerUrl, { type: 'module' });

    // Listen for worker messages
    worker.addEventListener('message', async (event: MessageEvent<AgentWorkerMessage>) => {
      const { type, payload } = event.data;

      try {
        switch (type) {
          case 'AGENT_UPDATE':
            if (payload?.agent) {
              // Update IndexedDB
              await agentDB.saveAgent(payload.agent);
              
              // Emit custom event for UI updates
              window.dispatchEvent(new CustomEvent('agent-update', { 
                detail: payload.agent 
              }));
            }
            break;

          case 'AGENT_COMPLETED':
            if (payload?.agent) {
              await agentDB.saveAgent(payload.agent);
              workersRef.current.delete(payload.agent.id);
              worker.terminate();
              
              // Notify queue and UI
              await agentQueue.completeAgent(payload.agent.id);
              window.dispatchEvent(new CustomEvent('agent-completed', { 
                detail: payload.agent 
              }));
              
              forceUpdate({});
            }
            break;

          case 'AGENT_ERROR':
            if (payload?.agent) {
              await agentDB.saveAgent(payload.agent);
              workersRef.current.delete(payload.agent.id);
              worker.terminate();
              
              window.dispatchEvent(new CustomEvent('agent-error', { 
                detail: payload.agent 
              }));
              
              forceUpdate({});
            }
            break;

          case 'AGENT_ABORTED':
            if (payload?.agent) {
              await agentDB.saveAgent(payload.agent);
              workersRef.current.delete(payload.agent.id);
              worker.terminate();
              
              window.dispatchEvent(new CustomEvent('agent-aborted', { 
                detail: payload.agent 
              }));
              
              forceUpdate({});
            }
            break;

          case 'AGENT_PAUSED':
            if (payload?.agent) {
              await agentDB.saveAgent(payload.agent);
              workersRef.current.delete(payload.agent.id);
              worker.terminate();
              
              window.dispatchEvent(new CustomEvent('agent-paused', { 
                detail: payload.agent 
              }));
              
              forceUpdate({});
            }
            break;
        }
      } catch (error) {
        console.error('Error handling worker message:', error);
      }
    });

    // Handle worker errors
    worker.addEventListener('error', (error) => {
      console.error('Worker error:', error);
      
      // Clean up
      workersRef.current.delete(agent.id);
      worker.terminate();
      
      // Update agent status
      agent.status = 'error';
      agent.lastError = 'Worker crashed: ' + error.message;
      agentDB.saveAgent(agent);
      
      window.dispatchEvent(new CustomEvent('agent-error', { 
        detail: agent 
      }));
      
      forceUpdate({});
    });

    // Start agent execution in worker
    const message: AgentWorkerMessage = {
      type: 'START_AGENT',
      payload: { agent }
    };
    worker.postMessage(message);
    
    workersRef.current.set(agent.id, worker);
    forceUpdate({});

  }, [maxWorkers]);

  /**
   * Pause an agent
   */
  const pauseAgent = useCallback((agentId: string) => {
    const worker = workersRef.current.get(agentId);
    if (worker) {
      const message: AgentWorkerMessage = {
        type: 'PAUSE_AGENT',
        payload: { agentId }
      };
      worker.postMessage(message);
    }
  }, []);

  /**
   * Abort an agent
   */
  const abortAgent = useCallback((agentId: string) => {
    const worker = workersRef.current.get(agentId);
    if (worker) {
      const message: AgentWorkerMessage = {
        type: 'ABORT_AGENT',
        payload: { agentId }
      };
      worker.postMessage(message);
    }
  }, []);

  /**
   * Cleanup all workers
   */
  const cleanup = useCallback(() => {
    workersRef.current.forEach(worker => {
      try {
        worker.terminate();
      } catch (error) {
        console.warn('Error terminating worker:', error);
      }
    });
    workersRef.current.clear();
    forceUpdate({});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    workers: workersRef.current,
    maxWorkers,
    startAgent,
    pauseAgent,
    abortAgent,
    cleanup
  };
}

/**
 * Global event types for agent updates
 */
export type AgentEventType = 
  | 'agent-update'
  | 'agent-completed'
  | 'agent-error'
  | 'agent-aborted'
  | 'agent-paused';

/**
 * Hook to listen for agent events
 */
export function useAgentEvents(
  callback: (agent: AgentState) => void,
  eventTypes: AgentEventType[] = ['agent-update']
): void {
  useEffect(() => {
    const handleEvent = (event: Event) => {
      if (event instanceof CustomEvent) {
        callback(event.detail);
      }
    };

    eventTypes.forEach(eventType => {
      window.addEventListener(eventType, handleEvent);
    });

    return () => {
      eventTypes.forEach(eventType => {
        window.removeEventListener(eventType, handleEvent);
      });
    };
  }, [callback, eventTypes]);
}
