/**
 * Agent Card Component
 * 
 * Displays individual agent status, progress, and actions
 */

import React from 'react';
import type { AgentState } from '../types/agent';
import { formatDuration } from '../types/agent';

interface AgentCardProps {
  agent: AgentState;
  isSelected: boolean;
  onSelect: () => void;
  onPause?: () => void;
  onAbort?: () => void;
  onRetry?: () => void;
  onResume?: () => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({ 
  agent, 
  isSelected, 
  onSelect, 
  onPause, 
  onAbort, 
  onRetry,
  onResume
}) => {
  const elapsedTime = agent.completedAt 
    ? agent.completedAt - agent.startTime 
    : Date.now() - agent.startTime;
  
  const statusIcons: Record<string, string> = {
    idle: '💤',
    queued: '⏳',
    running: '🏃',
    paused: '⏸️',
    completed: '✅',
    error: '❌',
    aborted: '🛑'
  };
  
  const phaseIcons: Record<string, string> = {
    thinking: '🤔',
    tool_execution: '🔧',
    streaming: '📝',
    waiting: '⏱️'
  };
  
  const statusColors: Record<string, string> = {
    idle: 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600',
    queued: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-600',
    running: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600',
    paused: 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-600',
    completed: 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-600',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-600',
    aborted: 'bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-500'
  };
  
  return (
    <div 
      className={`
        agent-card p-3 rounded-lg border-2 cursor-pointer transition-all
        ${statusColors[agent.status] || statusColors.idle}
        ${isSelected ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'}
      `}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xl">{statusIcons[agent.status]}</span>
          <span className="font-medium truncate dark:text-gray-100">{agent.title}</span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">
          {formatDuration(elapsedTime)}
        </span>
      </div>
      
      {/* Current Phase (for running agents) */}
      {agent.status === 'running' && (
        <div className="flex items-center gap-2 mb-2 text-sm">
          <span>{phaseIcons[agent.phase]}</span>
          <span className="text-gray-700 dark:text-gray-300">
            {agent.phase.replace('_', ' ')}
          </span>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            Iteration {agent.iterationCount}/{agent.maxIterations}
          </span>
        </div>
      )}
      
      {/* Resource Metrics */}
      <div className="flex gap-3 text-xs text-gray-600 dark:text-gray-400 mb-2">
        <div className="flex items-center gap-1">
          <span className="font-medium">Memory:</span>
          <span>{agent.estimatedMemoryUsage}MB</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium">Tokens:</span>
          <span>{agent.tokenCount.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium">Tools:</span>
          <span>{agent.toolCallsCount}</span>
        </div>
      </div>
      
      {/* Error Message */}
      {agent.lastError && (
        <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-xs p-2 rounded mb-2">
          ⚠️ {agent.lastError}
        </div>
      )}
      
      {/* Retry Count (if retried) */}
      {agent.retryCount > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Retry attempt {agent.retryCount}
        </div>
      )}
      
      {/* Actions */}
      <div className="flex gap-2 mt-2">
        {agent.status === 'running' && (
          <>
            {onPause && (
              <button 
                onClick={(e) => { e.stopPropagation(); onPause(); }}
                className="text-xs px-2 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded transition-colors"
              >
                ⏸️ Pause
              </button>
            )}
            {onAbort && (
              <button 
                onClick={(e) => { e.stopPropagation(); onAbort(); }}
                className="text-xs px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              >
                🛑 Abort
              </button>
            )}
          </>
        )}
        
        {agent.status === 'paused' && onResume && (
          <button 
            onClick={(e) => { e.stopPropagation(); onResume(); }}
            className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            ▶️ Resume
          </button>
        )}
        
        {(agent.status === 'error' || agent.status === 'aborted') && onRetry && (
          <button 
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            className="text-xs px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
          >
            🔄 Retry
          </button>
        )}
      </div>
    </div>
  );
};
