import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastManager';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { generatePlan } from '../utils/api';
import { isTokenExpiringSoon, decodeJWT } from '../utils/auth';
import { 
  getAllCachedPlans, 
  saveCachedPlan, 
  deleteCachedPlan 
} from '../utils/planningCache';
import type { CachedPlan } from '../utils/planningCache';

interface PlanningTabProps {
  onTransferToChat: (query: string) => void;
  defaultQuery?: string;
}

export const PlanningTab: React.FC<PlanningTabProps> = ({ onTransferToChat, defaultQuery }) => {
  const { getToken, isAuthenticated, accessToken } = useAuth();
  const { showError } = useToast();
  // Note: Planning endpoint uses server-side model configuration
  const [query, setQuery] = useLocalStorage<string>('planning_query', defaultQuery || '');
  const [result, setResult] = useLocalStorage<any>('planning_result', null);
  const [isLoading, setIsLoading] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedPlans, setSavedPlans] = useState<CachedPlan[]>([]);
  
  // Configuration state for temperature, maxTokens, and system prompt
  const [temperature, setTemperature] = useLocalStorage('planning_temperature', 0.7);
  const [maxTokens, setMaxTokens] = useLocalStorage('planning_max_tokens', 512);
  const [systemPrompt, setSystemPrompt] = useLocalStorage('chat_system_prompt', '');

  // Debug: Check token on mount
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      console.log('PlanningTab: User is authenticated');
      console.log('PlanningTab: Token length:', accessToken.length);
      console.log('PlanningTab: Token expiring soon?', isTokenExpiringSoon(accessToken));
      const decoded = decodeJWT(accessToken);
      if (decoded && decoded.exp) {
        const expiresAt = new Date(decoded.exp * 1000);
        console.log('PlanningTab: Token expires at:', expiresAt.toLocaleString());
      }
    } else {
      console.log('PlanningTab: User is not authenticated');
    }
  }, [isAuthenticated, accessToken]);

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);
    
    try {
      // Get valid token (will auto-refresh if needed)
      const token = await getToken();
      if (!token) {
        console.error('No valid token available');
        setResult({ 
          error: 'Authentication expired. Please sign out and sign in again to continue.' 
        });
        setIsLoading(false);
        return;
      }

      await generatePlan(
        query,
        token,
        undefined, // Planning endpoint uses server-side model configuration
        // Handle SSE events
        (event: string, data: any) => {
          console.log('Planning SSE event:', event, data);
          
          switch (event) {
            case 'status':
              // Could show status message in UI
              console.log('Status:', data.message);
              break;
              
            case 'result':
              // Display the plan result
              setResult(data);
              // Auto-save successful plan to cache
              saveCachedPlan(query, data);
              console.log('Plan auto-saved to cache');
              break;
              
            case 'error':
              // Display error
              setResult({ error: data.error || 'Unknown error' });
              showError(`Planning error: ${data.error || 'Unknown error'}`);
              break;
          }
        },
        // On complete
        () => {
          console.log('Planning stream complete');
          setIsLoading(false);
        },
        // On error
        (error: Error) => {
          console.error('Planning stream error:', error);
          setResult({ error: error.message });
          showError(`Planning failed: ${error.message}`);
          setIsLoading(false);
        }
      );
    } catch (error) {
      console.error('Planning error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setResult({ error: errorMsg });
      showError(`Planning error: ${errorMsg}`);
      setIsLoading(false);
    }
  };

  const handleTransferToChat = () => {
    if (!result) return;
    
    // Generate comprehensive prompt from the plan
    let chatPrompt = `I need help with the following research task:\n\n`;
    chatPrompt += `**Original Query:** ${query}\n\n`;
    
    if (result.searchKeywords && result.searchKeywords.length > 0) {
      chatPrompt += `**Search Keywords:**\n`;
      chatPrompt += result.searchKeywords.map((kw: string) => `- ${kw}`).join('\n');
      chatPrompt += `\n\nPlease use your search tools to find information about these keywords.\n\n`;
    }
    
    if (result.questions && result.questions.length > 0) {
      chatPrompt += `**Be sure to answer the following questions:**\n`;
      chatPrompt += result.questions.map((q: string, idx: number) => `${idx + 1}. ${q}`).join('\n');
      chatPrompt += `\n\nPlease research and provide complete answers to all these questions.\n\n`;
    }
    
    if (result.reasoning) {
      chatPrompt += `**Research Context:**\n${result.reasoning}\n\n`;
    }
    
    chatPrompt += `Please help me research this topic thoroughly using your available tools.`;
    
    // Pass both the prompt and persona
    const transferData = {
      prompt: chatPrompt,
      persona: result.persona || ''
    };
    
    onTransferToChat(JSON.stringify(transferData));
  };

  const handleLoadPlan = (plan: CachedPlan) => {
    setQuery(plan.query);
    setResult(plan.plan);
    setShowLoadDialog(false);
  };

  const handleDeletePlan = (planId: string) => {
    deleteCachedPlan(planId);
    // Refresh the list
    setSavedPlans(getAllCachedPlans());
  };

  // Load saved plans when dialog opens
  useEffect(() => {
    if (showLoadDialog) {
      setSavedPlans(getAllCachedPlans());
    }
  }, [showLoadDialog]);

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowLoadDialog(true)} className="btn-secondary text-sm">
          � Load Saved Plan
        </button>
        <button onClick={() => { setQuery(''); setResult(null); }} className="btn-secondary text-sm">
          🗑️ Clear
        </button>
      </div>

      {/* Configuration Panel */}
      <div className="card p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Temperature: {temperature.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span title="Deterministic and precise">0.0 Factual</span>
            <span title="Slight variation">0.3 Mostly Factual</span>
            <span title="Balanced creativity">0.5 Balanced</span>
            <span title="More creative and varied" className="font-semibold">0.7 Creative</span>
            <span title="Highly experimental">1.0 Experimental</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Response Length: {maxTokens} tokens
          </label>
          <input
            type="range"
            min="128"
            max="4096"
            step="128"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>128 Brief</span>
            <span className="font-semibold">512 Normal</span>
            <span>1024 Detailed</span>
            <span>2048 Comprehensive</span>
            <span>4096 Extensive</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            System Prompt (synced with Chat)
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Enter a custom system prompt to guide the AI's behavior..."
            className="input-field resize-none"
            rows={4}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            This system prompt will be used in both Planning and Chat tabs. It helps define the AI's role and behavior.
          </p>
        </div>
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
              {result.persona && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-blue-800 dark:text-blue-300">AI Persona:</h4>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {result.persona}
                  </p>
                </div>
              )}

              {result.plan && (
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-green-800 dark:text-green-300">Research Plan:</h4>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {result.plan}
                  </p>
                </div>
              )}
              
              {result.searchKeywords && result.searchKeywords.length > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-purple-800 dark:text-purple-300">Search Keywords:</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.searchKeywords.map((keyword: string, idx: number) => (
                      <span
                        key={idx}
                        className="bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100 px-3 py-1 rounded-full text-sm font-medium"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.questions && result.questions.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-yellow-800 dark:text-yellow-300">Research Questions:</h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                    {result.questions.map((question: string, idx: number) => (
                      <li key={idx}>{question}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.reasoning && (
                <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-orange-800 dark:text-orange-300">Reasoning:</h4>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {result.reasoning}
                  </p>
                </div>
              )}

              {result.steps && result.steps.length > 0 && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-indigo-800 dark:text-indigo-300">Research Steps:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
                    {result.steps.map((step: string, idx: number) => (
                      <li key={idx} className="pl-2">{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {result.sources && result.sources.length > 0 && (
                <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-teal-800 dark:text-teal-300">Recommended Sources:</h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                    {result.sources.map((source: string, idx: number) => (
                      <li key={idx}>{source}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.notes && (
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-300">Additional Notes:</h4>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {result.notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
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
                            onClick={() => handleLoadPlan(plan)}
                            className="btn-primary text-xs"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => handleDeletePlan(plan.id)}
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
