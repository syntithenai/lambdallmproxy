import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastManager';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useDialogClose } from '../hooks/useDialogClose';
import { generatePlan } from '../utils/api';
import { 
  getAllCachedPlans, 
  saveCachedPlan, 
  deleteCachedPlan 
} from '../utils/planningCache';
import type { CachedPlan } from '../utils/planningCache';
import { LlmInfoDialog } from './LlmInfoDialog';

interface PlanningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onTransferToChat?: (query: string) => void;
}

export const PlanningDialog: React.FC<PlanningDialogProps> = ({ isOpen, onClose, onTransferToChat }) => {
  const dialogRef = useDialogClose(isOpen, onClose);
  const { getToken, isAuthenticated } = useAuth();
  const { settings } = useSettings();
  const { showError, showSuccess } = useToast();
  const [query, setQuery] = useLocalStorage<string>('planning_query', '');
  const [result, setResult] = useLocalStorage<any>('planning_result', null);
  const [isLoading, setIsLoading] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedPlans, setSavedPlans] = useState<CachedPlan[]>([]);
  
  // LLM transparency tracking
  const [llmInfo, setLlmInfo] = useState<any>(null);
  const [showLlmInfo, setShowLlmInfo] = useState(false);
  
  // Refs for auto-resizing textareas
  const queryTextareaRef = useRef<HTMLTextAreaElement>(null);
  const systemPromptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const userQueryTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Generated prompts (transformed from LLM result)
  const [generatedSystemPrompt, setGeneratedSystemPrompt] = useLocalStorage('planning_dialog_generated_system_prompt', '');
  const [generatedUserQuery, setGeneratedUserQuery] = useLocalStorage('planning_dialog_generated_user_query', '');

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

  // Auto-resize generated prompts textareas when they change
  useEffect(() => {
    autoResize(systemPromptTextareaRef.current);
  }, [generatedSystemPrompt]);

  useEffect(() => {
    autoResize(userQueryTextareaRef.current);
  }, [generatedUserQuery]);

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

      // Get enabled providers from settings
      // IMPORTANT: Only send providers that are explicitly enabled (enabled === true)
      const enabledProviders = settings.providers.filter((p: any) => p.enabled === true);
      
      if (enabledProviders.length === 0) {
        setResult({ error: 'No providers configured. Please set up at least one provider in Settings.' });
        setIsLoading(false);
        return;
      }

      await generatePlan(
        query,
        token,
        enabledProviders,
        undefined, // Let server use load balancing
        (event: string, data: any) => {
          console.log('Planning SSE event:', event, data);
          
          switch (event) {
            case 'status':
              console.log('Status:', data.message);
              break;
              
            case 'result':
              setResult(data);
              // Use enhancedSystemPrompt and enhancedUserPrompt directly from LLM (no manipulation)
              if (data.enhancedSystemPrompt) {
                setGeneratedSystemPrompt(data.enhancedSystemPrompt);
              }
              if (data.enhancedUserPrompt) {
                setGeneratedUserQuery(data.enhancedUserPrompt);
              }
              // Don't auto-save - user must explicitly click "Save Plan"
              break;
              
            case 'llm_response':
              // Store LLM transparency information
              setLlmInfo(data);
              console.log('Captured LLM transparency info:', data);
              break;
              
            case 'error':
              // Enhanced error display with provider/model info
              const errorMsg = data.error || 'Unknown error';
              const providerInfo = data.provider && data.model 
                ? ` (Provider: ${data.provider}, Model: ${data.model})`
                : '';
              const fullError = `${errorMsg}${providerInfo}`;
              
              // Add helpful hints for common errors
              let errorHint = '';
              if (errorMsg.includes('Invalid API Key') || errorMsg.includes('401')) {
                errorHint = '\n\n💡 Tip: Check your API key in Settings. Make sure it\'s valid and hasn\'t expired.';
              } else if (data.isRateLimit || errorMsg.includes('rate limit')) {
                errorHint = '\n\n💡 Tip: You\'ve hit the rate limit. Try again in a few moments or use a different provider.';
              }
              
              setResult({ error: fullError + errorHint });
              showError(`Planning error: ${fullError}${errorHint}`);
              break;
              
            case 'llm_error':
              // Handle LLM-specific errors
              console.error('LLM Error:', data);
              const llmError = data.error || 'LLM request failed';
              const llmProviderInfo = data.provider && data.modelName
                ? ` (${data.provider}:${data.modelName})`
                : '';
              showError(`LLM Error${llmProviderInfo}: ${llmError}`);
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
    if (!generatedUserQuery || !onTransferToChat) return;
    
    // Use the generated prompts as-is and include full planning context
    const transferData = {
      prompt: generatedUserQuery,
      persona: generatedSystemPrompt || '',
      // NEW: Include planning context
      planningQuery: query,
      generatedSystemPrompt: generatedSystemPrompt,
      generatedUserQuery: generatedUserQuery
    };
    
    onTransferToChat(JSON.stringify(transferData));
    onClose();
  };

  const handleLoadPlan = (plan: CachedPlan) => {
    setQuery(plan.query);
    setResult(plan.plan);
    // Use enhanced prompts directly from cached plan (no manipulation)
    if (plan.plan && !plan.plan.error) {
      if (plan.plan.enhancedSystemPrompt) {
        setGeneratedSystemPrompt(plan.plan.enhancedSystemPrompt);
      }
      if (plan.plan.enhancedUserPrompt) {
        setGeneratedUserQuery(plan.plan.enhancedUserPrompt);
      }
    }
    setShowLoadDialog(false);
  };

  const handleDeletePlan = (planId: string) => {
    deleteCachedPlan(planId);
    setSavedPlans(getAllCachedPlans());
  };

  const handleSavePlan = () => {
    if (!result || result.error) {
      showError('Cannot save plan: No valid plan generated');
      return;
    }
    
    saveCachedPlan(query, result, result.enhancedSystemPrompt || '');
    showSuccess('Plan saved successfully');
    console.log('Plan manually saved to cache');
  };

  const handleClear = () => {
    // Clear planning input
    setQuery('');
    
    // Clear planning results
    setResult(null);
    
    // Clear generated prompts
    setGeneratedSystemPrompt('');
    setGeneratedUserQuery('');
    
    // Clear from localStorage
    localStorage.removeItem('planning_dialog_generated_system_prompt');
    localStorage.removeItem('planning_dialog_generated_user_query');
    localStorage.removeItem('planning_query');
    localStorage.removeItem('planning_result');
    
    console.log('Planning dialog cleared completely');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Main Planning Dialog */}
      <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
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
            {/* Action Buttons - All in one row */}
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={handleSubmit}
                disabled={isLoading || !query.trim() || !isAuthenticated}
                className="btn-primary text-sm"
              >
                {isLoading ? 'Generating...' : 'Generate Plan'}
              </button>
              
              <button 
                onClick={handleSavePlan}
                disabled={!result || result.error}
                className="btn-primary text-sm"
                title="Save the current plan to your saved plans list"
              >
                Save Plan
              </button>
              
              {onTransferToChat && (
                <button
                  onClick={handleTransferToChat}
                  disabled={!generatedUserQuery || !generatedUserQuery.trim()}
                  className="btn-primary text-sm"
                >
                  Transfer to Chat
                </button>
              )}
              
              <button 
                onClick={() => setShowLoadDialog(true)} 
                className="btn-secondary text-sm"
              >
                Load Saved Plans
              </button>
              
              <button 
                onClick={handleClear}
                className="btn-secondary text-sm"
                title="Clear all planning data and start fresh"
              >
                Clear All
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

            {/* Generated Prompts - Three Auto-Resizing Textareas */}
            {generatedSystemPrompt && (
              <div className="card p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    Generated Prompts
                  </h3>
                  {/* LLM Transparency Info Button */}
                  {llmInfo && (
                    <button
                      onClick={() => setShowLlmInfo(true)}
                      className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
                      title="View LLM transparency info (model, tokens, cost)"
                    >
                      💰 ${(llmInfo.cost || 0).toFixed(4)} • {llmInfo.calls || 1} call{llmInfo.calls > 1 ? 's' : ''} ℹ️
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {/* Generated System Prompt */}
                  <div>
                    <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Generated System Prompt (Editable):</h4>
                    <textarea
                      ref={systemPromptTextareaRef}
                      value={generatedSystemPrompt}
                      onChange={(e) => setGeneratedSystemPrompt(e.target.value)}
                      className="input-field resize-none overflow-hidden w-full"
                      style={{ minHeight: '96px' }}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      This defines the AI's role and behavior. Edit as needed before transferring to chat.
                    </p>
                  </div>

                  {/* Generated User Query */}
                  <div>
                    <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Generated User Query (Editable):</h4>
                    <textarea
                      ref={userQueryTextareaRef}
                      value={generatedUserQuery}
                      onChange={(e) => setGeneratedUserQuery(e.target.value)}
                      className="input-field resize-none overflow-hidden w-full"
                      style={{ minHeight: '96px' }}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      This is the message that will be sent to the chat. Edit to refine your query.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Results Display */}
            {result && !result.error && (
              <div className="card p-4">
                <div className="space-y-4">
                  {/* SIMPLE Query Display */}
                    {result.queryType === 'SIMPLE' && (
                      <div className="card p-4 bg-blue-50 dark:bg-blue-900/20">
                        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                          Simple Query Detected
                        </h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {result.simpleInstruction}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          This query can be answered directly without extensive planning.
                        </p>
                      </div>
                    )}

                    {/* OVERVIEW Query Display */}
                    {result.queryType === 'OVERVIEW' && (
                      <div className="card p-4 space-y-4">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          📚 Comprehensive Research Plan
                        </h3>

                        {/* Analysis Summary */}
                        <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                          <h4 className="text-sm font-medium mb-2 text-gray-800 dark:text-gray-200">📊 Analysis Summary</h4>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Query Type:</span>
                              <span className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                                {result.queryType}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Complexity:</span>
                              <span className="ml-2 px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded">
                                {result.complexityAssessment}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Research Approach:</span>
                              <span className="ml-2 px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                                {result.researchApproach}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Estimated Sources:</span>
                              <span className="ml-2 px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded">
                                {result.estimatedSources || 'N/A'}
                              </span>
                            </div>
                          </div>
                          {result.reasoning && (
                            <div className="mt-2">
                              <span className="font-medium text-gray-600 dark:text-gray-400">Reasoning:</span>
                              <p className="text-gray-700 dark:text-gray-300 mt-1">{result.reasoning}</p>
                            </div>
                          )}
                        </div>

                        {/* Expert Persona */}
                        {result.persona && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                            <h4 className="text-sm font-medium mb-2 text-blue-800 dark:text-blue-200">🎭 Expert Persona</h4>
                            <p className="text-sm text-blue-700 dark:text-blue-300">{result.persona}</p>
                          </div>
                        )}

                        {/* Search Strategies */}
                        {result.searchStrategies?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">🔍 Search Queries:</h4>
                            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                              <ul className="space-y-1">
                                {result.searchStrategies.map((query: string, idx: number) => (
                                  <li key={idx} className="text-sm text-green-700 dark:text-green-300 flex items-start">
                                    <span className="text-green-500 mr-2">•</span>
                                    <span>"{query}"</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}

                        {/* Research Questions */}
                        {result.researchQuestions?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">📋 Research Questions:</h4>
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                              <ul className="list-decimal list-inside space-y-1 text-sm">
                                {result.researchQuestions.map((q: string, idx: number) => (
                                  <li key={idx} className="text-purple-700 dark:text-purple-300">{q}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}

                        {/* Suggested Sources */}
                        {result.suggestedSources?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">🌐 Suggested Sources:</h4>
                            <div className="bg-teal-50 dark:bg-teal-900/20 p-3 rounded-lg">
                              <div className="space-y-2">
                                {result.suggestedSources.map((source: any, idx: number) => (
                                  <div key={idx} className="text-sm">
                                    <div className="font-medium text-teal-800 dark:text-teal-200 capitalize">
                                      {source.type} Sources:
                                    </div>
                                    <div className="text-teal-700 dark:text-teal-300 ml-2">
                                      {source.examples ? source.examples.join(', ') : 'Various relevant sources'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Methodology */}
                        {result.methodology && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">⚙️ Research Methodology:</h4>
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                              <p className="text-sm text-yellow-700 dark:text-yellow-300">{result.methodology}</p>
                            </div>
                          </div>
                        )}



                        {/* Enhanced System Prompt */}
                        {result.enhancedSystemPrompt && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">� Enhanced System Prompt:</h4>
                            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border">
                              <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                                {result.enhancedSystemPrompt}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Enhanced User Prompt */}
                        {result.enhancedUserPrompt && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">💬 Enhanced User Prompt:</h4>
                            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border">
                              <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                                {result.enhancedUserPrompt}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Raw LLM Response Fields (for debugging) */}
                        <details className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border">
                          <summary className="text-sm font-medium cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                            🔍 Debug: Raw LLM Response Fields
                          </summary>
                          <div className="mt-3 space-y-2 text-xs">
                            {Object.entries(result).map(([key, value]) => {
                              // Skip private fields and complex objects
                              if (key.startsWith('_') || typeof value === 'object') return null;
                              return (
                                <div key={key} className="flex">
                                  <span className="font-mono text-gray-500 dark:text-gray-400 w-32 flex-shrink-0">
                                    {key}:
                                  </span>
                                  <span className="text-gray-700 dark:text-gray-300 break-all">
                                    {typeof value === 'string' ? value : JSON.stringify(value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      </div>
                    )}

                    {/* LONG_FORM Query Display */}
                    {result.queryType === 'LONG_FORM' && (
                      <div className="card p-4 space-y-4">
                        <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                          📝 Long-Form Document Plan
                        </h3>
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded text-sm">
                          <strong>Note:</strong> This will be built in stages using snippets. Each section
                          will be researched and written separately, then combined into a final document.
                        </div>
                        {/* Document Sections */}
                        {result.documentSections?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">📑 Document Structure:</h4>
                            {result.documentSections.map((section: any, idx: number) => (
                              <div key={idx} className="ml-4 mb-3 p-2 bg-gray-50 dark:bg-gray-900 rounded">
                                <div className="font-medium text-purple-600 dark:text-purple-400">
                                  {idx + 1}. {section.title}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  Keywords: {section.keywords.join(', ')}
                                </div>
                                {section.questions?.length > 0 && (
                                  <ul className="text-xs mt-1 ml-4 list-disc list-inside">
                                    {section.questions.map((q: string, qIdx: number) => (
                                      <li key={qIdx}>{q}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Workflow */}
                        {result.snippetWorkflow && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">⚙️ Workflow:</h4>
                            <div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap">
                              {result.snippetWorkflow}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* NEEDS_CLARIFICATION Display */}
                    {result.queryType === 'NEEDS_CLARIFICATION' && (
                      <div className="card p-4 space-y-4 bg-orange-50 dark:bg-orange-900/20">
                        <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                          ❓ Need More Information
                        </h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {result.reasoning}
                        </p>
                        {result.clarificationQuestions?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">Please clarify:</h4>
                            <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                              {result.clarificationQuestions.map((q: string, idx: number) => (
                                <li key={idx} className="text-gray-700 dark:text-gray-300">{q}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="mt-4">
                          <label className="block text-sm font-medium mb-2">
                            Update your query with more details:
                          </label>
                          <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="input-field"
                            rows={4}
                            placeholder="Provide more specific details..."
                          />
                          <button
                            onClick={handleSubmit}
                            className="btn-primary mt-2 w-full"
                          >
                            Regenerate Plan with Clarifications
                          </button>
                        </div>
                      </div>
                    )}
                </div>
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

      {/* LLM Transparency Dialog */}
      {showLlmInfo && llmInfo && (
        <LlmInfoDialog
          apiCalls={[llmInfo]}
          onClose={() => setShowLlmInfo(false)}
        />
      )}
    </>
  );
};
