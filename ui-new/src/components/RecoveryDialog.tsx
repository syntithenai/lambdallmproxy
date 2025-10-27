/**
 * Recovery Dialog Component
 * 
 * Shows interrupted agents when the app starts and allows the user
 * to recover or discard them.
 */

import React, { useState } from 'react';
import type { AgentState } from '../types/agent';
import { formatDuration } from '../types/agent';

interface RecoveryDialogProps {
  agents: AgentState[];
  onRecover: (agentIds: string[]) => void;
  onDiscard: (agentIds: string[]) => void;
  onClose: () => void;
}

export const RecoveryDialog: React.FC<RecoveryDialogProps> = ({ 
  agents, 
  onRecover, 
  onDiscard,
  onClose 
}) => {
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    new Set(agents.map(a => a.id)) // Select all by default
  );

  const handleToggleAgent = (agentId: string) => {
    const newSet = new Set(selectedAgents);
    if (newSet.has(agentId)) {
      newSet.delete(agentId);
    } else {
      newSet.add(agentId);
    }
    setSelectedAgents(newSet);
  };

  const handleSelectAll = () => {
    setSelectedAgents(new Set(agents.map(a => a.id)));
  };

  const handleSelectNone = () => {
    setSelectedAgents(new Set());
  };

  const handleRecover = () => {
    onRecover(Array.from(selectedAgents));
    onClose();
  };

  const handleDiscard = () => {
    onDiscard(Array.from(selectedAgents));
    onClose();
  };

  const handleDiscardAll = () => {
    onDiscard(agents.map(a => a.id));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🔄</span>
            <h2 className="text-2xl font-bold dark:text-gray-100">
              Recover Interrupted Agents
            </h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            The following agents were interrupted when you closed the browser. 
            Would you like to recover them?
          </p>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {agents.map(agent => {
            const timeSinceInterruption = Date.now() - agent.lastUpdateTime;
            
            return (
              <div 
                key={agent.id}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedAgents.has(agent.id) 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
                onClick={() => handleToggleAgent(agent.id)}
              >
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox"
                    checked={selectedAgents.has(agent.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleAgent(agent.id);
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate mb-1">
                      {agent.title}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <div>
                        📊 Iteration {agent.iterationCount}/{agent.maxIterations}
                      </div>
                      <div>
                        💬 {agent.messages.length} messages
                      </div>
                      <div>
                        ⏱️ Interrupted {formatDuration(timeSinceInterruption)} ago
                      </div>
                    </div>
                    {agent.lastError && (
                      <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                        ⚠️ Last error: {agent.lastError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selection Controls */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              Select All
            </button>
            <span className="text-gray-400">•</span>
            <button
              onClick={handleSelectNone}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              Select None
            </button>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selectedAgents.size} of {agents.length} selected
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button 
            onClick={handleRecover}
            disabled={selectedAgents.size === 0}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            🔄 Recover Selected ({selectedAgents.size})
          </button>
          <button 
            onClick={handleDiscard}
            disabled={selectedAgents.size === 0}
            className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
          >
            🗑️ Discard Selected
          </button>
          <button 
            onClick={handleDiscardAll}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            Discard All
          </button>
        </div>
      </div>
    </div>
  );
};
