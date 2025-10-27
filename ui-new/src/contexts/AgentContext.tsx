/**
 * Agent Context
 * 
 * Provides global agent management throughout the application.
 * Integrates the queue, workers, and recovery system.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { AgentState } from '../types/agent';
import { agentQueue } from '../utils/agentQueue';
import { useAgentWorker } from '../hooks/useAgentWorker';
import { checkForInterruptedAgents, recoverAgents, discardAgents } from '../utils/agentRecovery';
import { agentDB } from '../utils/agentDB';
import { RecoveryDialog } from '../components/RecoveryDialog';
import { detectBrowserCapacity, calculateMaxConcurrentAgents } from '../utils/memoryManagement';

interface AgentContextValue {
  // Agent management
  createAgent: (chatId: string, messages: any[], currentInput: string, title?: string) => Promise<AgentState>;
  startAgent: (agent: AgentState) => Promise<void>;
  pauseAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<void>;
  abortAgent: (agentId: string) => Promise<void>;
  retryAgent: (agentId: string) => Promise<void>;
  
  // State
  runningAgents: AgentState[];
  queuedAgents: AgentState[];
  allAgents: AgentState[];
  
  // UI
  showAgentManager: boolean;
  setShowAgentManager: (show: boolean) => void;
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

interface AgentProviderProps {
  children: ReactNode;
}

export const AgentProvider: React.FC<AgentProviderProps> = ({ children }) => {
  const [runningAgents, setRunningAgents] = useState<AgentState[]>([]);
  const [queuedAgents, setQueuedAgents] = useState<AgentState[]>([]);
  const [allAgents, setAllAgents] = useState<AgentState[]>([]);
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [interruptedAgents, setInterruptedAgents] = useState<AgentState[]>([]);
  
  const agentWorker = useAgentWorker();

  // Connect queue to workers
  useEffect(() => {
    agentQueue.setExecutionCallback(async (agent: AgentState) => {
      try {
        agentWorker.startAgent(agent);
      } catch (error) {
        console.error('Failed to start agent in worker:', error);
        agent.status = 'error';
        agent.lastError = error instanceof Error ? error.message : 'Failed to start worker';
        await agentDB.saveAgent(agent);
      }
    });
  }, [agentWorker]);

  // Load agents on mount
  useEffect(() => {
    loadAgents();
  }, []);

  // Listen for agent events
  useEffect(() => {
    const handleAgentUpdate = () => {
      loadAgents();
    };

    window.addEventListener('agent-update', handleAgentUpdate);
    window.addEventListener('agent-completed', handleAgentUpdate);
    window.addEventListener('agent-error', handleAgentUpdate);
    window.addEventListener('agent-paused', handleAgentUpdate);
    window.addEventListener('agent-aborted', handleAgentUpdate);
    window.addEventListener('agent-recovered', handleAgentUpdate);

    return () => {
      window.removeEventListener('agent-update', handleAgentUpdate);
      window.removeEventListener('agent-completed', handleAgentUpdate);
      window.removeEventListener('agent-error', handleAgentUpdate);
      window.removeEventListener('agent-paused', handleAgentUpdate);
      window.removeEventListener('agent-aborted', handleAgentUpdate);
      window.removeEventListener('agent-recovered', handleAgentUpdate);
    };
  }, []);

  // Check for interrupted agents on mount
  useEffect(() => {
    checkForInterruptedAgents({
      onInterruptedAgentsFound: (agents) => {
        setInterruptedAgents(agents);
        setShowRecovery(true);
      }
    });
  }, []);

  // Monitor memory and adjust limits
  useEffect(() => {
    const interval = setInterval(() => {
      const capacity = detectBrowserCapacity();
      const maxConcurrent = calculateMaxConcurrentAgents(capacity);
      agentQueue.updateMaxConcurrent(maxConcurrent);
      
      if (capacity.isLowMemory) {
        console.warn('⚠️ Low memory detected - pausing queue');
        agentQueue.pauseQueue();
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const loadAgents = async () => {
    const all = await agentDB.getAllAgents();
    const running = await agentDB.getRunningAgents();
    const queued = await agentDB.getQueuedAgents();
    
    setAllAgents(all);
    setRunningAgents(running);
    setQueuedAgents(queued);
  };

  const createAgent = useCallback(async (
    chatId: string,
    messages: any[],
    currentInput: string,
    title?: string
  ): Promise<AgentState> => {
    const { createAgentState } = await import('../types/agent');
    const agent = createAgentState(chatId, messages, currentInput, title);
    await agentDB.saveAgent(agent);
    return agent;
  }, []);

  const startAgent = useCallback(async (agent: AgentState) => {
    await agentQueue.enqueue(agent);
    await loadAgents();
  }, []);

  const pauseAgent = useCallback(async (agentId: string) => {
    await agentQueue.pauseAgent(agentId);
    agentWorker.pauseAgent(agentId);
    await loadAgents();
  }, [agentWorker]);

  const resumeAgent = useCallback(async (agentId: string) => {
    await agentQueue.resumeAgent(agentId);
    await loadAgents();
  }, []);

  const abortAgent = useCallback(async (agentId: string) => {
    await agentQueue.abortAgent(agentId);
    agentWorker.abortAgent(agentId);
    await loadAgents();
  }, [agentWorker]);

  const retryAgent = useCallback(async (agentId: string) => {
    const agent = await agentDB.getAgent(agentId);
    if (agent) {
      agent.status = 'idle';
      agent.retryCount += 1;
      agent.lastError = undefined;
      await agentQueue.enqueue(agent);
      await loadAgents();
    }
  }, []);

  const handleRecover = useCallback(async (agentIds: string[]) => {
    await recoverAgents(agentIds);
    setShowRecovery(false);
    
    // Re-enqueue recovered agents
    for (const agentId of agentIds) {
      const agent = await agentDB.getAgent(agentId);
      if (agent && agent.status === 'queued') {
        await agentQueue.enqueue(agent);
      }
    }
    
    await loadAgents();
  }, []);

  const handleDiscard = useCallback(async (agentIds: string[]) => {
    await discardAgents(agentIds);
    setShowRecovery(false);
    await loadAgents();
  }, []);

  const value: AgentContextValue = {
    createAgent,
    startAgent,
    pauseAgent,
    resumeAgent,
    abortAgent,
    retryAgent,
    runningAgents,
    queuedAgents,
    allAgents,
    showAgentManager,
    setShowAgentManager
  };

  return (
    <AgentContext.Provider value={value}>
      {children}
      
      {/* Recovery Dialog */}
      {showRecovery && interruptedAgents.length > 0 && (
        <RecoveryDialog
          agents={interruptedAgents}
          onRecover={handleRecover}
          onDiscard={handleDiscard}
          onClose={() => setShowRecovery(false)}
        />
      )}
    </AgentContext.Provider>
  );
};

export const useAgents = (): AgentContextValue => {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgents must be used within an AgentProvider');
  }
  return context;
};
