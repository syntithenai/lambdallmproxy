/**
 * Agent Manager Component
 * 
 * Main UI for viewing and managing concurrent agents.
 * Displays running, queued, completed, and failed agents with
 * memory monitoring and queue controls.
 */

import React, { useState, useEffect } from 'react';
import type { AgentState, BrowserCapacity } from '../types/agent';
import { agentDB } from '../utils/agentDB';
import { agentQueue } from '../utils/agentQueue';
import { 
  detectBrowserCapacity, 
  checkMemoryWarnings 
} from '../utils/memoryManagement';
import { AgentCard } from './AgentCard';

interface AgentManagerProps {
  onSwitchToAgent: (agentId: string, chatId: string) => void;
  onCreateNewAgent: () => void;
  onClose: () => void;
}

export const AgentManager: React.FC<AgentManagerProps> = ({ 
  onSwitchToAgent, 
  onCreateNewAgent,
  onClose 
}) => {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [capacity, setCapacity] = useState<BrowserCapacity | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Load agents on mount and set up auto-refresh
  useEffect(() => {
    loadAgents();
    updateCapacity();
    
    const agentsInterval = setInterval(() => {
      if (autoRefresh) {
        loadAgents();
      }
    }, 2000); // Update every 2 seconds
    
    const capacityInterval = setInterval(() => {
      updateCapacity();
    }, 5000); // Update capacity every 5 seconds
    
    return () => {
      clearInterval(agentsInterval);
      clearInterval(capacityInterval);
    };
  }, [autoRefresh]);

  // Listen for queue events
  useEffect(() => {
    const handleQueueUpdate = () => {
      loadAgents();
    };

    agentQueue.on('agent-started', handleQueueUpdate);
    agentQueue.on('agent-completed', handleQueueUpdate);
    agentQueue.on('agent-error', handleQueueUpdate);
    agentQueue.on('agent-paused', handleQueueUpdate);
    agentQueue.on('agent-aborted', handleQueueUpdate);
    agentQueue.on('queue-updated', handleQueueUpdate);

    return () => {
      agentQueue.off('agent-started', handleQueueUpdate);
      agentQueue.off('agent-completed', handleQueueUpdate);
      agentQueue.off('agent-error', handleQueueUpdate);
      agentQueue.off('agent-paused', handleQueueUpdate);
      agentQueue.off('agent-aborted', handleQueueUpdate);
      agentQueue.off('queue-updated', handleQueueUpdate);
    };
  }, []);

  const loadAgents = async () => {
    const allAgents = await agentDB.getAllAgents();
    setAgents(allAgents);
  };

  const updateCapacity = () => {
    const cap = detectBrowserCapacity();
    setCapacity(cap);
  };

  const handlePauseAgent = async (agentId: string) => {
    await agentQueue.pauseAgent(agentId);
  };

  const handleResumeAgent = async (agentId: string) => {
    await agentQueue.resumeAgent(agentId);
  };

  const handleAbortAgent = async (agentId: string) => {
    await agentQueue.abortAgent(agentId);
  };

  const handleRetryAgent = async (agentId: string) => {
    const agent = await agentDB.getAgent(agentId);
    if (agent) {
      agent.status = 'idle';
      agent.retryCount += 1;
      agent.lastError = undefined;
      await agentQueue.enqueue(agent);
    }
  };

  const handleClearCompleted = async () => {
    if (confirm('Clear all completed agents?')) {
      await agentDB.clearCompletedAgents();
      await loadAgents();
    }
  };

  const runningAgents = agents.filter(a => a.status === 'running');
  const queuedAgents = agents.filter(a => a.status === 'queued');
  const completedAgents = agents.filter(a => a.status === 'completed');
  const failedAgents = agents.filter(a => ['error', 'aborted'].includes(a.status));
  const pausedAgents = agents.filter(a => a.status === 'paused');

  const memoryWarning = capacity ? checkMemoryWarnings(capacity) : { level: 'ok' };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold dark:text-gray-100">🤖 Agent Manager</h2>
            <button
              onClick={onCreateNewAgent}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            >
              + New Chat
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Memory/Capacity Display */}
        {capacity && (
          <div className={`p-3 border-b ${
            memoryWarning.level === 'critical' ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-600' :
            memoryWarning.level === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-600' :
            'border-gray-200 dark:border-gray-700'
          }`}>
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
              Browser Memory: {capacity.usedMemory.toFixed(0)}MB / {capacity.totalMemory.toFixed(0)}MB
              {' • '}
              {capacity.availableMemory.toFixed(0)}MB available
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  capacity.isLowMemory ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, (capacity.usedMemory / capacity.totalMemory) * 100)}%` }}
              />
            </div>
            {'message' in memoryWarning && memoryWarning.message && (
              <div className={`text-xs mt-1 ${
                memoryWarning.level === 'critical' ? 'text-red-700 dark:text-red-300' :
                'text-yellow-700 dark:text-yellow-300'
              }`}>
                {memoryWarning.message}
              </div>
            )}
          </div>
        )}

        {/* Agent Lists */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Running Agents */}
          {runningAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                🏃 Running ({runningAgents.length})
              </h3>
              <div className="space-y-2">
                {runningAgents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgent === agent.id}
                    onSelect={() => {
                      setSelectedAgent(agent.id);
                      onSwitchToAgent(agent.id, agent.chatId);
                    }}
                    onPause={() => handlePauseAgent(agent.id)}
                    onAbort={() => handleAbortAgent(agent.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Queued Agents */}
          {queuedAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                ⏳ Queued ({queuedAgents.length})
              </h3>
              <div className="space-y-2">
                {queuedAgents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgent === agent.id}
                    onSelect={() => {
                      setSelectedAgent(agent.id);
                      onSwitchToAgent(agent.id, agent.chatId);
                    }}
                    onAbort={() => handleAbortAgent(agent.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Paused Agents */}
          {pausedAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                ⏸️ Paused ({pausedAgents.length})
              </h3>
              <div className="space-y-2">
                {pausedAgents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgent === agent.id}
                    onSelect={() => {
                      setSelectedAgent(agent.id);
                      onSwitchToAgent(agent.id, agent.chatId);
                    }}
                    onResume={() => handleResumeAgent(agent.id)}
                    onAbort={() => handleAbortAgent(agent.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Agents */}
          {completedAgents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  ✅ Completed ({completedAgents.length})
                </h3>
                <button
                  onClick={handleClearCompleted}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-2">
                {completedAgents.slice(0, 5).map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgent === agent.id}
                    onSelect={() => {
                      setSelectedAgent(agent.id);
                      onSwitchToAgent(agent.id, agent.chatId);
                    }}
                  />
                ))}
              </div>
              {completedAgents.length > 5 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  ... and {completedAgents.length - 5} more
                </div>
              )}
            </div>
          )}

          {/* Failed/Aborted Agents */}
          {failedAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                ❌ Failed/Aborted ({failedAgents.length})
              </h3>
              <div className="space-y-2">
                {failedAgents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgent === agent.id}
                    onSelect={() => {
                      setSelectedAgent(agent.id);
                      onSwitchToAgent(agent.id, agent.chatId);
                    }}
                    onRetry={() => handleRetryAgent(agent.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {agents.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-2">🤖</div>
              <div className="text-gray-500 dark:text-gray-400">
                No agents yet. Start a new chat to create one!
              </div>
              <button
                onClick={onCreateNewAgent}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Create New Chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
