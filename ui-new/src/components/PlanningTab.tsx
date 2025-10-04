import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalStorage, removeFromLocalStorage, getAllKeys } from '../hooks/useLocalStorage';
import { generatePlan } from '../utils/api';

interface PlanningTabProps {
  onTransferToChat: (query: string) => void;
  defaultQuery?: string;
}

export const PlanningTab: React.FC<PlanningTabProps> = ({ onTransferToChat, defaultQuery }) => {
  const { accessToken, isAuthenticated } = useAuth();
  const [query, setQuery] = useLocalStorage<string>('planning_query', defaultQuery || '');
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [saveName, setSaveName] = useState('');

  const handleSubmit = async () => {
    if (!query.trim() || !accessToken || isLoading) return;

    setIsLoading(true);
    setResult(null);
    
    try {
      await generatePlan(
        query,
        accessToken,
        // Handle SSE events
        (event, data) => {
          console.log('Planning SSE event:', event, data);
          
          switch (event) {
            case 'status':
              // Could show status message in UI
              console.log('Status:', data.message);
              break;
              
            case 'result':
              // Display the plan result
              setResult(data);
              break;
              
            case 'error':
              // Display error
              setResult({ error: data.error || 'Unknown error' });
              break;
          }
        },
        // On complete
        () => {
          console.log('Planning stream complete');
          setIsLoading(false);
        },
        // On error
        (error) => {
          console.error('Planning stream error:', error);
          setResult({ error: error.message });
          setIsLoading(false);
        }
      );
    } catch (error) {
      console.error('Planning error:', error);
      setResult({ error: error instanceof Error ? error.message : 'Unknown error' });
      setIsLoading(false);
    }
  };

  const handleTransferToChat = () => {
    if (result && result.searchKeywords) {
      const chatQuery = `Based on this research plan:\n\n${JSON.stringify(result, null, 2)}\n\nPlease help me with: ${query}`;
      onTransferToChat(chatQuery);
    }
  };

  const handleSavePlan = () => {
    if (!saveName.trim()) return;
    const key = `saved_plan_${Date.now()}_${saveName}`;
    localStorage.setItem(key, JSON.stringify({ query, result }));
    setSaveName('');
    setShowSaveDialog(false);
  };

  const handleLoadPlan = (key: string) => {
    const saved = localStorage.getItem(key);
    if (saved) {
      const data = JSON.parse(saved);
      setQuery(data.query);
      setResult(data.result);
      setShowLoadDialog(false);
    }
  };

  const handleDeletePlan = (key: string) => {
    removeFromLocalStorage(key);
  };

  const savedPlans = getAllKeys('saved_plan_');

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowSaveDialog(true)} className="btn-secondary text-sm">
          💾 Save Plan
        </button>
        <button onClick={() => setShowLoadDialog(true)} className="btn-secondary text-sm">
          📂 Load Plan
        </button>
        <button onClick={() => { setQuery(''); setResult(null); }} className="btn-secondary text-sm">
          🗑️ Clear
        </button>
      </div>

      {/* Query Input */}
      <div className="card p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Research Query
        </label>
        {!isAuthenticated ? (
          <div className="text-center text-red-500 py-4">
            Please sign in to use planning
          </div>
        ) : (
          <>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter your research question or topic..."
              className="input-field resize-none mb-4"
              rows={5}
            />
            <button
              onClick={handleSubmit}
              disabled={isLoading || !query.trim()}
              className="btn-primary w-full"
            >
              {isLoading ? 'Generating Plan...' : 'Generate Research Plan'}
            </button>
          </>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="card p-4 flex-1 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Research Plan
            </h3>
            {result.searchKeywords && (
              <button
                onClick={handleTransferToChat}
                className="btn-primary text-sm"
              >
                Transfer to Chat →
              </button>
            )}
          </div>

          {result.error ? (
            <div className="text-red-500">
              Error: {result.error}
            </div>
          ) : (
            <div className="space-y-4">
              {result.plan && (
                <div>
                  <h4 className="font-semibold mb-2">Plan:</h4>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {result.plan}
                  </p>
                </div>
              )}
              
              {result.searchKeywords && result.searchKeywords.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Search Keywords:</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.searchKeywords.map((keyword: string, idx: number) => (
                      <span
                        key={idx}
                        className="bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 px-3 py-1 rounded-full text-sm"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.reasoning && (
                <div>
                  <h4 className="font-semibold mb-2">Reasoning:</h4>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {result.reasoning}
                  </p>
                </div>
              )}

              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400">
                  View Raw Response
                </summary>
                <pre className="mt-2 p-4 bg-gray-100 dark:bg-gray-900 rounded overflow-x-auto text-xs">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="card p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Save Plan</h3>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Enter plan name"
              className="input-field mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveDialog(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleSavePlan} className="btn-primary flex-1">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="card p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Load Plan</h3>
            {savedPlans.length === 0 ? (
              <p className="text-gray-500">No saved plans found</p>
            ) : (
              <div className="space-y-2">
                {savedPlans.map((key) => {
                  const name = key.replace('saved_plan_', '').split('_').slice(1).join('_');
                  return (
                    <div key={key} className="flex gap-2">
                      <button
                        onClick={() => handleLoadPlan(key)}
                        className="btn-secondary flex-1 text-left"
                      >
                        {name || 'Unnamed Plan'}
                      </button>
                      <button
                        onClick={() => handleDeletePlan(key)}
                        className="btn-secondary text-red-500"
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => setShowLoadDialog(false)}
              className="btn-primary w-full mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
