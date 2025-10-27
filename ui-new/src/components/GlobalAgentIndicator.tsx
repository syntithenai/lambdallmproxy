/**
 * Global Agent Indicator
 * 
 * Shows agent activity status in the header/navbar.
 * Always visible regardless of current tab.
 */

import React from 'react';
import { useAgents } from '../contexts/AgentContext';

export const GlobalAgentIndicator: React.FC = () => {
  const { runningAgents, queuedAgents, setShowAgentManager } = useAgents();

  const totalActive = runningAgents.length + queuedAgents.length;

  if (totalActive === 0) {
    return null; // Don't show indicator when no active agents
  }

  return (
    <button
      onClick={() => setShowAgentManager(true)}
      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors shadow-md"
      title="View agent manager"
    >
      <div className="relative">
        <span className="text-lg">🤖</span>
        {runningAgents.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
        )}
      </div>
      <div className="flex flex-col items-start text-xs">
        <span className="font-medium">
          {runningAgents.length > 0 && (
            <span className="text-green-200">{runningAgents.length} running</span>
          )}
          {runningAgents.length > 0 && queuedAgents.length > 0 && <span className="mx-1">•</span>}
          {queuedAgents.length > 0 && (
            <span className="text-yellow-200">{queuedAgents.length} queued</span>
          )}
        </span>
      </div>
    </button>
  );
};
