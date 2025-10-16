/**
 * PlanningHeader Component
 * Fixed header with action buttons for planning
 */
import React from 'react';

interface PlanningHeaderProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  hasQuery: boolean;
  hasGeneratedQuery: boolean;
  onGeneratePlan: () => void;
  onSendToChat: () => void;
  onLoadPlan: () => void;
  onNewPlan: () => void;
}

export const PlanningHeader: React.FC<PlanningHeaderProps> = ({
  isAuthenticated,
  isLoading,
  hasQuery,
  hasGeneratedQuery,
  onGeneratePlan,
  onSendToChat,
  onLoadPlan,
  onNewPlan
}) => {
  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 space-y-3">
      {/* Primary Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onGeneratePlan}
          disabled={isLoading || !hasQuery || !isAuthenticated}
          className="btn-primary flex-1 sm:flex-none"
        >
          {isLoading ? 'Generating Plan...' : 'Generate Plan'}
        </button>
        
        <button
          onClick={onSendToChat}
          disabled={!hasGeneratedQuery}
          className="btn-primary flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
        >
          Send To Chat
        </button>

        <button onClick={onLoadPlan} className="btn-secondary">
          Load
        </button>
        
        <button 
          onClick={onNewPlan} 
          className="btn-secondary"
          title="Start a new research plan"
        >
          New
        </button>
      </div>
      
      {!isAuthenticated && (
        <div className="text-center text-red-500 text-sm py-2 bg-red-50 dark:bg-red-900/20 rounded">
          Please sign in to use planning
        </div>
      )}
    </div>
  );
};
