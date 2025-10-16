/**
 * PlanLoadDialog Component
 * Dialog for loading saved plans from cache
 */
import React from 'react';
import type { CachedPlan } from '../utils/planningCache';

interface PlanLoadDialogProps {
  isOpen: boolean;
  savedPlans: CachedPlan[];
  onClose: () => void;
  onLoadPlan: (plan: CachedPlan) => void;
  onDeletePlan: (planId: string) => void;
}

export const PlanLoadDialog: React.FC<PlanLoadDialogProps> = ({
  isOpen,
  savedPlans,
  onClose,
  onLoadPlan,
  onDeletePlan
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="card p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4">Load Saved Plan</h3>
        {savedPlans.length === 0 ? (
          <p className="text-gray-500">No saved plans found</p>
        ) : (
          <div className="space-y-3">
            {savedPlans.map((plan) => {
              const date = new Date(plan.timestamp).toLocaleString();
              return (
                <div key={plan.id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                        {plan.query}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Saved: {date}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onLoadPlan(plan)}
                        className="btn-primary text-xs"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => onDeletePlan(plan.id)}
                        className="btn-secondary text-red-500 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button
          onClick={onClose}
          className="btn-primary w-full mt-4"
        >
          Close
        </button>
      </div>
    </div>
  );
};
