import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastManager';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { generatePlan } from '../utils/api';
import { 
  getAllCachedPlans, 
  saveCachedPlan, 
  deleteCachedPlan 
} from '../utils/planningCache';
import type { CachedPlan } from '../utils/planningCache';

interface PlanningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onTransferToChat?: (query: string) => void;
}

export const PlanningDialog: React.FC<PlanningDialogProps> = ({ isOpen, onClose, onTransferToChat }) => {
  const { getToken, isAuthenticated } = useAuth();
  const { showError } = useToast();
  const [query, setQuery] = useLocalStorage<string>('planning_query', '');
  const [result, setResult] = useLocalStorage<any>('planning_result', null);
  const [isLoading, setIsLoading] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedPlans, setSavedPlans] = useState<CachedPlan[]>([]);
  
  // Refs for auto-resizing textareas
  const queryTextareaRef = useRef<HTMLTextAreaElement>(null);
  const systemPromptTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // System prompt state (synced with chat)
  const [systemPrompt, setSystemPrompt] = useLocalStorage('chat_system_prompt', '');

  // Auto-resize function for textareas
  const autoResize = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  };

  // Auto-resize query textarea when query changes
  useEffect(() => {
    autoResize(queryTextareaRef.current);
  }, [query]);

  // Auto-resize system prompt textarea when it changes
  useEffect(() => {
    autoResize(systemPromptTextareaRef.current);
  }, [systemPrompt]);

  // Load saved plans when dialog opens
  useEffect(() => {
    if (showLoadDialog) {
      setSavedPlans(getAllCachedPlans());
    }
  }, [showLoadDialog]);

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);
    
    try {
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
        undefined,
        (event: string, data: any) => {
          console.log('Planning SSE event:', event, data);
          
          switch (event) {
            case 'status':
              console.log('Status:', data.message);
              break;
              
            case 'result':
              setResult(data);
              // Update system prompt from persona if available
              const promptToSave = data.persona || undefined;
              if (data.persona) {
                setSystemPrompt(data.persona);
              }
              saveCachedPlan(query, data, promptToSave);
              console.log('Plan auto-saved to cache with system prompt');
              break;
              
            case 'error':
              setResult({ error: data.error || 'Unknown error' });
              showError(`Planning error: ${data.error || 'Unknown error'}`);
              break;
          }
        },
        () => {
          console.log('Planning stream complete');
          setIsLoading(false);
        },
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
    if (!result || !onTransferToChat) return;
    
    let chatPrompt = `I need help with the following research task:\n\n`;
    chatPrompt += `**Original Query:** ${query}\n\n`;
    
    if (result.searchKeywords && result.searchKeywords.length > 0) {
      // Flatten the searchKeywords array (it's an array of arrays)
      const flatKeywords = result.searchKeywords.flat();
      
      chatPrompt += `**Search Keywords:**\n`;
      chatPrompt += flatKeywords.map((kw: string) => `- ${kw}`).join('\n');
      chatPrompt += `\n\nPlease search for these keywords to gather comprehensive information.\n\n`;
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
    
    const transferData = {
      prompt: chatPrompt,
      persona: systemPrompt || ''
    };
    
    onTransferToChat(JSON.stringify(transferData));
    onClose();
  };

  const handleLoadPlan = (plan: CachedPlan) => {
    setQuery(plan.query);
    setResult(plan.plan);
    // Restore system prompt if it was saved with the plan
    if (plan.systemPrompt) {
      setSystemPrompt(plan.systemPrompt);
    }
    setShowLoadDialog(false);
  };

  const handleDeletePlan = (planId: string) => {
    deleteCachedPlan(planId);
    setSavedPlans(getAllCachedPlans());
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Main Planning Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Research Planning
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

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowLoadDialog(true)} className="btn-secondary text-sm">
                📂 Load Saved Plan
              </button>
              <button onClick={() => { setQuery(''); setResult(null); setSystemPrompt(''); }} className="btn-secondary text-sm">
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
                    ref={queryTextareaRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter your research question or topic..."
                    className="input-field resize-none overflow-hidden"
                    style={{ minHeight: '120px' }}
                  />
                </>
              )}
            </div>

            {/* Generate Button */}
            {isAuthenticated && (
              <div className="card p-4">
                <button
                  onClick={handleSubmit}
                  disabled={isLoading || !query.trim()}
                  className="btn-primary w-full"
                >
                  {isLoading ? 'Generating Plan...' : 'Generate Research Plan'}
                </button>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="card p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    Research Plan
                  </h3>
                  {result.searchKeywords && onTransferToChat && (
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
                    {/* Editable System Prompt embedded in research plan */}
                    {systemPrompt && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                        <h4 className="font-semibold mb-2 text-blue-800 dark:text-blue-300">System Prompt (Editable):</h4>
                        <textarea
                          ref={systemPromptTextareaRef}
                          value={systemPrompt}
                          onChange={(e) => setSystemPrompt(e.target.value)}
                          className="input-field resize-none overflow-hidden w-full"
                          style={{ minHeight: '96px' }}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          This defines the AI's role and behavior. Edit as needed before transferring to chat.
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
          </div>
        </div>
      </div>

      {/* Load Plans Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
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
    </>
  );
};
