import React, { useState, useEffect } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import type { CodeReviewRequest, RiskLevel } from '../services/clientTools';

interface CodeReviewDialogProps {
  isOpen: boolean;
  request: CodeReviewRequest | null;
  onApprove: (editedCode?: string) => void;
  onReject: () => void;
  onAlwaysAllow?: () => void;
}

/**
 * Code Review Dialog
 * 
 * Allows users to review and edit code before execution
 * Features:
 * - Two tabs: Review (read-only) and Edit (editable)
 * - Risk level badges
 * - Safety tips
 * - Code editing with change tracking
 */
export const CodeReviewDialog: React.FC<CodeReviewDialogProps> = ({
  isOpen,
  request,
  onApprove,
  onReject,
  onAlwaysAllow
}) => {
  const dialogRef = useDialogClose(isOpen, onReject);
  const [activeTab, setActiveTab] = useState<'review' | 'edit'>('review');
  const [editedCode, setEditedCode] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Reset state when dialog opens with new request
  useEffect(() => {
    if (isOpen && request) {
      setEditedCode(request.code || '');
      setHasChanges(false);
      setActiveTab('review');
    }
  }, [isOpen, request]);

  // Track code changes
  useEffect(() => {
    if (request?.code) {
      setHasChanges(editedCode !== request.code);
    }
  }, [editedCode, request?.code]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onReject();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onReject]);

  if (!isOpen || !request) return null;

  const handleApprove = () => {
    if (hasChanges && activeTab === 'edit') {
      onApprove(editedCode);
    } else {
      onApprove();
    }
  };

  const handleReset = () => {
    setEditedCode(request.code || '');
    setHasChanges(false);
  };

  // Risk level styling
  const riskStyles: Record<RiskLevel, { badge: string; border: string }> = {
    high: {
      badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      border: 'border-red-500'
    },
    medium: {
      badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      border: 'border-yellow-500'
    },
    low: {
      badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      border: 'border-green-500'
    }
  };

  const currentRiskStyle = riskStyles[request.riskLevel];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div 
        ref={dialogRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        role="dialog"
        aria-labelledby="code-review-title"
      >
        {/* Header */}
        <div className={`p-6 border-b-2 dark:border-gray-700 ${currentRiskStyle.border}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 
                  id="code-review-title"
                  className="text-xl font-semibold text-gray-900 dark:text-white"
                >
                  Code Review Required
                </h3>
                <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase ${currentRiskStyle.badge}`}>
                  {request.riskLevel} Risk
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Feature: <span className="font-mono font-semibold">{request.feature}</span>
              </p>
              {request.description && (
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {request.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <button
              onClick={() => setActiveTab('review')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'review'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Review
            </button>
            <button
              onClick={() => setActiveTab('edit')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'edit'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Edit {hasChanges && '(Modified)'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'review' ? (
            <div className="space-y-4">
              {/* Safety Tips */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                  🛡️ Safety Tips
                </h4>
                <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  <li>• Review the code carefully before approving</li>
                  <li>• Watch for suspicious API calls or data access</li>
                  <li>• Check for infinite loops or excessive operations</li>
                  {request.riskLevel === 'high' && (
                    <li className="font-semibold">• HIGH RISK: Exercise extreme caution</li>
                  )}
                </ul>
              </div>

              {/* Code Display */}
              {request.code && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Code to Execute:
                  </h4>
                  <pre className="bg-gray-900 dark:bg-black text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                    {request.code}
                  </pre>
                </div>
              )}

              {/* Arguments */}
              {Object.keys(request.args).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Arguments:
                  </h4>
                  <pre className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                    {JSON.stringify(request.args, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Edit Instructions */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                  ✏️ Edit Mode
                </h4>
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  You can modify the code below. Changes will be saved when you approve.
                </p>
              </div>

              {/* Editable Code */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Code Editor:
                  </h4>
                  <div className="flex items-center gap-3">
                    {hasChanges && (
                      <button
                        onClick={handleReset}
                        className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                      >
                        Reset Changes
                      </button>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {editedCode.length} characters
                    </span>
                  </div>
                </div>
                <textarea
                  value={editedCode}
                  onChange={(e) => setEditedCode(e.target.value)}
                  className="w-full h-64 bg-gray-900 dark:bg-black text-gray-100 p-4 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  spellCheck={false}
                />
              </div>

              {/* Change Indicator */}
              {hasChanges && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                  <p className="text-sm text-orange-800 dark:text-orange-300">
                    ⚠️ Code has been modified. Review your changes carefully before approving.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex justify-between items-center">
            <button
              onClick={onReject}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              Reject
            </button>
            
            <div className="flex gap-3">
              {onAlwaysAllow && request.riskLevel === 'low' && (
                <button
                  onClick={onAlwaysAllow}
                  className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  Always Allow (This Session)
                </button>
              )}
              
              <button
                onClick={handleApprove}
                className={`px-6 py-2 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 ${
                  request.riskLevel === 'high'
                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                    : request.riskLevel === 'medium'
                    ? 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
                    : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                }`}
              >
                {hasChanges ? 'Approve with Edits' : 'Approve & Execute'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
