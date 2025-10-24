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
  deleteCachedPlan,
  getStorageEstimate
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
  const [statusMessage, setStatusMessage] = useState<string>(''); // New: track status messages
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedPlans, setSavedPlans] = useState<CachedPlan[]>([]);
  
  // Storage management
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number; percentage: number } | null>(null);
  
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
      updateStorageInfo();
    }
  }, [showLoadDialog]);
  
  // Update storage info
  const updateStorageInfo = async () => {
    const estimate = await getStorageEstimate();
    setStorageInfo(estimate);
  };

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);
    setStatusMessage('Initializing...'); // Show immediate feedback
    
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
              setStatusMessage(data.message || 'Processing...'); // Update status message
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
          setStatusMessage(''); // Clear status message on completion
        },
        (error: Error) => {
          console.error('Planning stream error:', error);
          setResult({ error: error.message });
          showError(`Planning failed: ${error.message}`);
          setIsLoading(false);
          setStatusMessage(''); // Clear status message on error
        }
      );
    } catch (error) {
      console.error('Planning error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setResult({ error: errorMsg });
      showError(`Planning error: ${errorMsg}`);
      setIsLoading(false);
      setStatusMessage(''); // Clear status message on error
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
    // Also restore saved prompts if they exist (for backwards compatibility)
    if (plan.systemPrompt) {
      setGeneratedSystemPrompt(plan.systemPrompt);
    }
    if (plan.userPrompt) {
      setGeneratedUserQuery(plan.userPrompt);
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
    
    try {
      // Save with both system and user prompts
      saveCachedPlan(
        query, 
        result, 
        result.enhancedSystemPrompt || generatedSystemPrompt || '',
        result.enhancedUserPrompt || generatedUserQuery || ''
      );
      showSuccess('Plan saved successfully');
      console.log('Plan manually saved to cache with system and user prompts');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to save plan');
    }
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
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Research Planning
              </h2>
              
              {/* Left side buttons */}
              <div className="ml-4">
                <button 
                  onClick={handleSavePlan}
                  disabled={!result || result.error}
                  className="btn-primary text-sm flex items-center gap-1.5"
                  title="Save the current plan to your saved plans list"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Save Plan
                </button>
              </div>
              
              <button 
                onClick={() => setShowLoadDialog(true)} 
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Load Saved
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Transfer to Chat - Far Right */}
              {onTransferToChat && (
                <button
                  onClick={handleTransferToChat}
                  disabled={!generatedUserQuery || !generatedUserQuery.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Transfer to Chat
                </button>
              )}
              
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Status Message - Show when loading */}
            {isLoading && statusMessage && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-700">{statusMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Query Input */}
            <div className="card p-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Research Query
                </label>
                
                {/* Generate Plan Button (Green) - Below right of label */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleSubmit}
                    disabled={isLoading || !query.trim() || !isAuthenticated}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    {isLoading ? 'Generating...' : 'Generate Plan'}
                  </button>
                  
                  {/* Clear All Button (Red with Bin Icon) */}
                  <button 
                    onClick={handleClear}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                    title="Clear all planning data and start fresh"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear All
                  </button>
                </div>
              </div>
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
                    
                    {/* GUIDANCE Display - For complex multi-iteration plans */}
                    {result.queryType === 'guidance' && (
                      <div className="card p-4 space-y-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
                        <h3 className="font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                          <span className="text-2xl">🎯</span> Seeking Guidance - Complex Multi-Iteration Plan
                        </h3>
                        
                        {/* Plan Type Badge */}
                        {result.planType && (
                          <div className="flex gap-2 items-center">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Plan Type:</span>
                            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm font-medium">
                              {result.planType.replace(/-/g, ' ').toUpperCase()}
                            </span>
                          </div>
                        )}
                        
                        {/* Detected Patterns */}
                        {result.detectedPatterns?.length > 0 && (
                          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-purple-200 dark:border-purple-700">
                            <h4 className="text-sm font-medium mb-2 text-purple-800 dark:text-purple-200">
                              🔍 Detected Complexity Patterns:
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {result.detectedPatterns.map((pattern: string, idx: number) => (
                                <span key={idx} className="px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                                  {pattern}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Estimated Scope */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {result.estimatedIterations && (
                            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-blue-200 dark:border-blue-700">
                              <div className="font-medium text-blue-700 dark:text-blue-300">Estimated Iterations</div>
                              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{result.estimatedIterations}</div>
                            </div>
                          )}
                          {result.toolsRequired?.length > 0 && (
                            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-blue-200 dark:border-blue-700">
                              <div className="font-medium text-blue-700 dark:text-blue-300">Tools Required</div>
                              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{result.toolsRequired.length}</div>
                            </div>
                          )}
                        </div>
                        
                        {/* Suggested Workflow */}
                        {result.suggestedWorkflow && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                            <h4 className="text-sm font-medium mb-2 text-blue-800 dark:text-blue-200">
                              ⚙️ Suggested Workflow:
                            </h4>
                            <p className="text-sm text-blue-700 dark:text-blue-300">{result.suggestedWorkflow}</p>
                          </div>
                        )}
                        
                        {/* Tools Required */}
                        {result.toolsRequired?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">🛠️ Required Tools:</h4>
                            <div className="flex flex-wrap gap-2">
                              {result.toolsRequired.map((tool: string, idx: number) => (
                                <span key={idx} className="px-3 py-1 bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 text-blue-800 dark:text-blue-200 rounded-lg text-sm font-mono">
                                  {tool}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Guidance Questions */}
                        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 p-4 rounded-lg border-2 border-yellow-300 dark:border-yellow-700">
                          <h4 className="text-sm font-medium mb-3 text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
                            <span className="text-lg">💡</span> Please answer these questions to refine your plan:
                          </h4>
                          {result.guidanceQuestions?.length > 0 && (
                            <ol className="list-decimal list-inside space-y-2 text-sm mb-4">
                              {result.guidanceQuestions.map((q: string, idx: number) => (
                                <li key={idx} className="text-yellow-800 dark:text-yellow-200 font-medium">{q}</li>
                              ))}
                            </ol>
                          )}
                          
                          <div className="mt-4 space-y-2">
                            <label className="block text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                              Update your research prompt with answers:
                            </label>
                            <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                              💡 Tip: Include answers to the questions above in your updated query. The more specific you are, 
                              the better the AI can create an effective multi-iteration plan with proper tool usage and few-shot examples.
                            </p>
                            <textarea
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              className="input-field"
                              rows={6}
                              placeholder="Example: I want to build a comprehensive research report on climate change by:
1. Creating 25 todos for different sub-topics (policy, science, economics, etc.)
2. Searching the web for each topic and saving results to snippets
3. Generating charts to visualize key data points
4. Combining all snippets into a master analysis

Please create a detailed plan with few-shot examples showing how to use create_todo, search_web, create_snippet, and generate_chart together in each iteration..."
                            />
                            <button
                              onClick={handleSubmit}
                              className="btn-primary mt-2 w-full"
                            >
                              🎯 Generate Detailed Execution Plan
                            </button>
                          </div>
                        </div>
                        
                        {/* Info Box */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-300 dark:border-blue-700">
                          <p className="text-xs text-blue-800 dark:text-blue-200">
                            <strong>About Guidance Mode:</strong> This mode detects complex projects that require multiple iterations 
                            and extensive tool usage. Answer the questions above to help create a detailed execution plan with 
                            few-shot examples showing how to use todos, snippets, and multiple tool calls per iteration.
                          </p>
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
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Load Saved Plan</h3>
              {storageInfo && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Storage: {(storageInfo.usage / (1024 * 1024)).toFixed(2)} MB / {(storageInfo.quota / (1024 * 1024)).toFixed(0)} MB ({storageInfo.percentage.toFixed(1)}%)
                </div>
              )}
            </div>
            
            {/* Storage warning - only show when storage is critically full */}
            {storageInfo && storageInfo.percentage > 80 && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold mb-2">
                  ⚠️ Storage is {storageInfo.percentage.toFixed(1)}% full
                </div>
                <div className="text-xs text-yellow-700 dark:text-yellow-300">
                  Consider deleting old plans to free up space.
                </div>
              </div>
            )}
            
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
