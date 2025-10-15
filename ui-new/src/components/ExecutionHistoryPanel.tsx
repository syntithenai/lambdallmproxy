import React, { useState, useEffect } from 'react';
import type { ExecutionHistoryEntry } from '../services/clientTools';

// Storage key for history
const HISTORY_STORAGE_KEY = 'browser_features_history';
const MAX_HISTORY_ENTRIES = 100;

/**
 * Get execution history from localStorage
 */
export function getExecutionHistory(): ExecutionHistoryEntry[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load execution history:', error);
    return [];
  }
}

/**
 * Add entry to execution history
 */
export function addExecutionHistoryEntry(entry: ExecutionHistoryEntry): void {
  try {
    const history = getExecutionHistory();
    history.unshift(entry); // Add to beginning
    
    // Keep only last MAX_HISTORY_ENTRIES
    const trimmed = history.slice(0, MAX_HISTORY_ENTRIES);
    
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save execution history:', error);
  }
}

/**
 * Clear all execution history
 */
export function clearExecutionHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear execution history:', error);
  }
}

/**
 * Delete specific history entry
 */
export function deleteExecutionHistoryEntry(id: string): void {
  try {
    const history = getExecutionHistory();
    const filtered = history.filter(entry => entry.id !== id);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete history entry:', error);
  }
}

interface ExecutionHistoryPanelProps {
  onClose?: () => void;
}

/**
 * Execution History Panel
 * 
 * Displays history of browser feature executions with two-panel layout
 * Features:
 * - List of executions with success/failure indicators
 * - Detailed view of selected execution
 * - Export history as JSON
 * - Delete individual entries
 * - Clear all history
 */
export const ExecutionHistoryPanel: React.FC<ExecutionHistoryPanelProps> = ({ onClose }) => {
  const [history, setHistory] = useState<ExecutionHistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'success' | 'failure'>('all');

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    setHistory(getExecutionHistory());
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteExecutionHistoryEntry(id);
    if (selectedId === id) {
      setSelectedId(null);
    }
    loadHistory();
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all execution history?')) {
      clearExecutionHistory();
      setSelectedId(null);
      loadHistory();
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(history, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `browser-features-history-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filter history
  const filteredHistory = history.filter(entry => {
    if (filter === 'all') return true;
    if (filter === 'success') return entry.success;
    if (filter === 'failure') return !entry.success;
    return true;
  });

  // Get selected entry
  const selectedEntry = selectedId ? history.find(e => e.id === selectedId) : null;

  // Calculate statistics
  const stats = {
    total: history.length,
    success: history.filter(e => e.success).length,
    failure: history.filter(e => !e.success).length,
    avgDuration: history.length > 0
      ? Math.round(history.reduce((sum, e) => sum + e.duration, 0) / history.length)
      : 0
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Execution History
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total</div>
            </div>
            <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-900 dark:text-green-200">{stats.success}</div>
              <div className="text-sm text-green-700 dark:text-green-400">Success</div>
            </div>
            <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-900 dark:text-red-200">{stats.failure}</div>
              <div className="text-sm text-red-700 dark:text-red-400">Failure</div>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{stats.avgDuration}ms</div>
              <div className="text-sm text-blue-700 dark:text-blue-400">Avg Duration</div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-lg text-sm ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                All ({history.length})
              </button>
              <button
                onClick={() => setFilter('success')}
                className={`px-3 py-1 rounded-lg text-sm ${
                  filter === 'success'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Success ({stats.success})
              </button>
              <button
                onClick={() => setFilter('failure')}
                className={`px-3 py-1 rounded-lg text-sm ${
                  filter === 'failure'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Failure ({stats.failure})
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleExport}
                disabled={history.length === 0}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export JSON
              </button>
              <button
                onClick={handleClearAll}
                disabled={history.length === 0}
                className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* Content - Two Panel Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - List */}
          <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            {filteredHistory.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No execution history
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredHistory.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      selectedId === entry.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {entry.success ? (
                          <span className="text-green-500" title="Success">✓</span>
                        ) : (
                          <span className="text-red-500" title="Failed">✗</span>
                        )}
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {entry.feature}
                        </span>
                        {entry.edited && (
                          <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 px-2 py-0.5 rounded">
                            edited
                          </span>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleDelete(entry.id, e)}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 line-clamp-2">
                      {entry.description}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{new Date(entry.timestamp).toLocaleString()}</span>
                      <span>{entry.duration}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel - Details */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedEntry ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Execution Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Feature:</span>
                      <p className="font-mono font-semibold">{selectedEntry.feature}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
                      <p className={selectedEntry.success ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {selectedEntry.success ? 'Success' : 'Failed'}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Timestamp:</span>
                      <p className="text-sm">{new Date(selectedEntry.timestamp).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Duration:</span>
                      <p className="text-sm">{selectedEntry.duration}ms</p>
                    </div>
                  </div>
                </div>

                {selectedEntry.description && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Description:</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{selectedEntry.description}</p>
                  </div>
                )}

                {selectedEntry.code && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Code:</h4>
                    <pre className="bg-gray-900 dark:bg-black text-gray-100 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                      {selectedEntry.code}
                    </pre>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Arguments:</h4>
                  <pre className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                    {JSON.stringify(selectedEntry.args, null, 2)}
                  </pre>
                </div>

                {selectedEntry.success ? (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Result:</h4>
                    <pre className="bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-gray-100 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                      {JSON.stringify(selectedEntry.result, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div>
                    <h4 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-2">Error:</h4>
                    <pre className="bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                      {selectedEntry.error}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                Select an entry to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
