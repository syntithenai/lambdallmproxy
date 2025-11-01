import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusTrap } from 'focus-trap-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastManager';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useDialogClose } from '../hooks/useDialogClose';
import { generatePlan, getCachedApiBase } from '../utils/api';
import { 
  getAllCachedPlans, 
  saveCachedPlan, 
  deleteCachedPlan,
  getStorageEstimate
} from '../utils/planningCache';
import type { CachedPlan } from '../utils/planningCache';
import { LlmInfoDialog } from './LlmInfoDialog';
import { VoiceInputDialog } from './VoiceInputDialog';

interface PlanningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onTransferToChat?: (query: string) => void;
}

export const PlanningDialog: React.FC<PlanningDialogProps> = ({ isOpen, onClose, onTransferToChat }) => {
  const { t } = useTranslation();
  const dialogRef = useDialogClose(isOpen, onClose);
  const { getToken, isAuthenticated, accessToken } = useAuth();
  const { settings } = useSettings();
  const { showError, showSuccess } = useToast();
  const [query, setQuery] = useLocalStorage<string>('planning_query', '');
  const [result, setResult] = useLocalStorage<any>('planning_result', null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>(''); // New: track status messages
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedPlans, setSavedPlans] = useState<CachedPlan[]>([]);
  const [apiEndpoint, setApiEndpoint] = useState<string>('');
  
  // Storage management
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number; percentage: number } | null>(null);
  
  // LLM transparency tracking
  const [llmInfo, setLlmInfo] = useState<any>(null);
  const [showLlmInfo, setShowLlmInfo] = useState(false);
  
  // Voice input
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [lastFocusedTextarea, setLastFocusedTextarea] = useState<'query' | 'systemPrompt' | 'userQuery'>('query');
  const [lastCursorPosition, setLastCursorPosition] = useState<number>(0);
  
  // Refs for auto-resizing textareas
  const queryTextareaRef = useRef<HTMLTextAreaElement>(null);
  const systemPromptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const userQueryTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Generated prompts (transformed from LLM result)
  const [generatedSystemPrompt, setGeneratedSystemPrompt] = useLocalStorage('planning_dialog_generated_system_prompt', '');
  const [generatedUserQuery, setGeneratedUserQuery] = useLocalStorage('planning_dialog_generated_user_query', '');

  // Store original values when entering guidance mode (to restore when exiting)
  const [savedQuery, setSavedQuery] = useState<string>('');
  const [savedSystemPrompt, setSavedSystemPrompt] = useState<string>('');
  const [savedUserQuery, setSavedUserQuery] = useState<string>('');

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

  // Set API endpoint on mount (auto-detect local vs remote)
  useEffect(() => {
    getCachedApiBase().then(url => {
      setApiEndpoint(url);
      console.log('🔗 API endpoint for planning voice input:', url);
    });
  }, []);

  // Load saved plans when dialog opens
  useEffect(() => {
    if (showLoadDialog) {
      getAllCachedPlans().then(plans => {
        setSavedPlans(plans);
      });
      updateStorageInfo();
    }
  }, [showLoadDialog]);
  
  // Update storage info
  const updateStorageInfo = async () => {
    const estimate = await getStorageEstimate();
    setStorageInfo(estimate);
  };

  // Monitor result changes to save/restore values when entering/exiting guidance mode
  useEffect(() => {
    if (result && result.queryType === 'guidance') {
      // Entering guidance mode - save current values and hide them
      if (query) setSavedQuery(query);
      if (generatedSystemPrompt) setSavedSystemPrompt(generatedSystemPrompt);
      if (generatedUserQuery) setSavedUserQuery(generatedUserQuery);
      
      // Clear the displayed prompts (but not the query - user needs to edit it)
      setGeneratedSystemPrompt('');
      setGeneratedUserQuery('');
    } else if (result && result.queryType !== 'guidance' && savedQuery) {
      // Exiting guidance mode - restore saved values
      if (savedSystemPrompt) setGeneratedSystemPrompt(savedSystemPrompt);
      if (savedUserQuery) setGeneratedUserQuery(savedUserQuery);
      
      // Clear saved values
      setSavedQuery('');
      setSavedSystemPrompt('');
      setSavedUserQuery('');
    }
  }, [result]);

  const handleSubmit = async () => {
    // Check authentication FIRST
    if (!isAuthenticated) {
      console.error('User not authenticated');
      showError(t('planning.signInRequired'));
      setResult({ 
        error: t('planning.authRequired')
      });
      return;
    }

    if (!query.trim()) {
      showError(t('planning.enterResearchQuestion'));
      return;
    }

    if (isLoading) return;

    setIsLoading(true);
    setResult(null);
    setStatusMessage(t('planning.initializing')); // Show immediate feedback
    
    try {
      const token = await getToken();
      if (!token) {
        console.error('No valid token available');
        showError(t('planning.authExpired'));
        setResult({ 
          error: t('planning.authExpired')
        });
        setIsLoading(false);
        return;
      }

      console.log('🔐 Planning with token:', {
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...',
        isAuthenticated,
        hasProviders: settings.providers.length
      });

      // Get enabled providers from settings
      // NOTE: Even if user has no providers, server may have server-side credentials
      const enabledProviders = settings.providers.filter((p: any) => p.enabled !== false);
      
      console.log(`📋 Enabled providers: ${enabledProviders.length} (server may have additional credentials)`);

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
        },
        {
          language: settings.language || 'en'
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
    
    console.log('🎯 PlanningDialog - Creating transfer data:', transferData);
    const jsonString = JSON.stringify(transferData);
    console.log('🎯 PlanningDialog - JSON string length:', jsonString.length);
    onTransferToChat(jsonString);
    onClose();
  };

  // Copy debug info to clipboard for Copilot debugging
  const handleCopyDebugInfo = () => {
    const debugInfo = {
      query: query,
      result: result,
      generatedSystemPrompt: generatedSystemPrompt,
      generatedUserPrompt: generatedUserQuery,
      llmInfo: llmInfo,
      timestamp: new Date().toISOString()
    };
    
    const debugText = `=== Planning Debug Info for Copilot ===
Generated at: ${debugInfo.timestamp}

--- User Query ---
${debugInfo.query || '(none)'}

--- Planning Result (Full Response) ---
${JSON.stringify(debugInfo.result, null, 2)}

--- Generated System Prompt ---
${debugInfo.generatedSystemPrompt || '(none)'}

--- Generated User Query ---
${debugInfo.generatedUserPrompt || '(none)'}

--- LLM Request/Response Details ---
${JSON.stringify(debugInfo.llmInfo, null, 2)}

=== End Debug Info ===`;

    navigator.clipboard.writeText(debugText).then(() => {
      showSuccess(t('planning.debugCopied'));
    }, () => {
      showError(t('planning.debugCopyFailed'));
    });
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

  const handleDeletePlan = async (planId: string) => {
    await deleteCachedPlan(planId);
    const plans = await getAllCachedPlans();
    setSavedPlans(plans);
  };

  const handleSavePlan = async () => {
    if (!result || result.error) {
      showError(t('planning.cannotSavePlan'));
      return;
    }
    
    try {
      // Save with both system and user prompts
      await saveCachedPlan(
        query, 
        result, 
        result.enhancedSystemPrompt || generatedSystemPrompt || '',
        result.enhancedUserPrompt || generatedUserQuery || ''
      );
      showSuccess(t('planning.planSavedSuccess'));
      console.log('Plan manually saved to cache with system and user prompts');
    } catch (error) {
      showError(error instanceof Error ? error.message : t('planning.planSaveFailed'));
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

  // Handle voice input transcription - inject into last focused textarea
  const handleVoiceTranscription = (text: string) => {
    console.log('🎤 Voice transcription received for planning:', text);
    
    // Determine which textarea to inject into
    let currentValue = '';
    let setValue: (value: string) => void;
    let textarea: HTMLTextAreaElement | null = null;
    
    switch (lastFocusedTextarea) {
      case 'systemPrompt':
        currentValue = generatedSystemPrompt;
        setValue = setGeneratedSystemPrompt;
        textarea = systemPromptTextareaRef.current;
        break;
      case 'userQuery':
        currentValue = generatedUserQuery;
        setValue = setGeneratedUserQuery;
        textarea = userQueryTextareaRef.current;
        break;
      case 'query':
      default:
        currentValue = query;
        setValue = setQuery;
        textarea = queryTextareaRef.current;
        break;
    }
    
    // Insert text at last cursor position
    const before = currentValue.substring(0, lastCursorPosition);
    const after = currentValue.substring(lastCursorPosition);
    const newValue = before + text + after;
    
    setValue(newValue);
    
    // Update cursor position and focus textarea
    if (textarea) {
      setTimeout(() => {
        const newPosition = lastCursorPosition + text.length;
        textarea.selectionStart = newPosition;
        textarea.selectionEnd = newPosition;
        textarea.focus();
        setLastCursorPosition(newPosition);
      }, 0);
    }
  };
  
  // Track textarea focus and cursor position
  const handleTextareaFocus = (textareaType: 'query' | 'systemPrompt' | 'userQuery') => {
    setLastFocusedTextarea(textareaType);
  };
  
  const handleTextareaClick = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      setLastCursorPosition(textarea.selectionStart);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Main Planning Dialog */}
      <FocusTrap active={isOpen}>
        <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-4">
            <div className="flex justify-between items-start gap-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">
                {t('planning.title')}
              </h2>
              
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex-shrink-0"
                aria-label={t('common.close')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Action buttons - wrap on mobile */}
            <div className="flex flex-wrap gap-2 mt-3">
              <button 
                onClick={handleSavePlan}
                disabled={!result || result.error}
                className="btn-primary text-sm flex items-center gap-1.5"
                title={t('planning.savePlanTooltip')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {t('planning.savePlan')}
              </button>
              
              <button 
                onClick={() => setShowLoadDialog(true)} 
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t('planning.loadSaved')}
              </button>
              
              {/* Voice Input Button */}
              <button
                onClick={() => setShowVoiceInput(true)}
                disabled={!isAuthenticated}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                title={isAuthenticated ? "Voice input - transcribe speech into last selected field" : t('auth.signInRequired')}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
                🎤
              </button>
              
              {/* Copy Debug Info Button */}
              <button
                onClick={handleCopyDebugInfo}
                disabled={!query && !result}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                title={t('planning.debugTooltip')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {t('planning.debug')}
              </button>
              
              {/* Transfer to Chat */}
              {onTransferToChat && (
                <button
                  onClick={handleTransferToChat}
                  disabled={!generatedUserQuery || !generatedUserQuery.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {t('planning.transferToChat')}
                </button>
              )}
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
            {!(result && result.queryType === 'guidance') && (
              <div className="card p-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('planning.query')}
                  </label>
                  
                  {/* Generate Plan Button (Green) - Below right of label */}
                  <div className="flex items-center gap-2">
                  <button 
                    onClick={handleSubmit}
                    disabled={isLoading || !query.trim()}
                    title={!isAuthenticated ? t('planning.signInRequired') : 
                           !query.trim() ? t('planning.enterResearchQuestion') : 
                           isLoading ? t('planning.planning') : t('planning.generatePlan')}
                    className={`${!isAuthenticated ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'} disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    {isLoading ? t('planning.generating') : !isAuthenticated ? t('planning.signInToGenerate') : t('planning.generatePlan')}
                  </button>
                  
                  {/* Clear All Button (Red with Bin Icon) */}
                  <button 
                    onClick={handleClear}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                    title={t('planning.clearAllTooltip')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {t('planning.clearAll')}
                  </button>
                </div>
              </div>
              {!isAuthenticated ? (
                <div className="text-center text-red-500 py-4">
                  {t('planning.signInToUsePlanning')}
                </div>
              ) : (
                <>
                  <textarea
                    ref={queryTextareaRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => handleTextareaFocus('query')}
                    onClick={() => handleTextareaClick(queryTextareaRef.current)}
                    onKeyUp={() => handleTextareaClick(queryTextareaRef.current)}
                    placeholder={t('planning.enterQuery')}
                    className="input-field resize-none overflow-hidden"
                    style={{ minHeight: '120px' }}
                  />
                </>
              )}
            </div>
            )}

            {/* Generated Prompts - Three Auto-Resizing Textareas */}
            {generatedSystemPrompt && !(result && result.queryType === 'guidance') && (
              <div className="card p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {t('planning.generatedPrompts')}
                  </h3>
                  {/* LLM Transparency Info Button */}
                  {llmInfo && (
                    <button
                      onClick={() => setShowLlmInfo(true)}
                      className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
                      title={t('planning.llmInfoTooltip')}
                    >
                      💰 ${(llmInfo.cost || 0).toFixed(4)} • {llmInfo.calls || 1} {llmInfo.calls > 1 ? t('planning.llmCallsPlural') : t('planning.llmCalls')} ℹ️
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {/* Generated System Prompt */}
                  <div>
                    <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">{t('planning.systemPromptEditable')}</h4>
                    <textarea
                      ref={systemPromptTextareaRef}
                      value={generatedSystemPrompt}
                      onChange={(e) => setGeneratedSystemPrompt(e.target.value)}
                      onFocus={() => handleTextareaFocus('systemPrompt')}
                      onClick={() => handleTextareaClick(systemPromptTextareaRef.current)}
                      onKeyUp={() => handleTextareaClick(systemPromptTextareaRef.current)}
                      className="input-field resize-none overflow-hidden w-full"
                      style={{ minHeight: '96px' }}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {t('planning.systemPromptHelp')}
                    </p>
                  </div>

                  {/* Generated User Query */}
                  <div>
                    <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">{t('planning.userQueryEditable')}</h4>
                    <textarea
                      ref={userQueryTextareaRef}
                      value={generatedUserQuery}
                      onChange={(e) => setGeneratedUserQuery(e.target.value)}
                      onFocus={() => handleTextareaFocus('userQuery')}
                      onClick={() => handleTextareaClick(userQueryTextareaRef.current)}
                      onKeyUp={() => handleTextareaClick(userQueryTextareaRef.current)}
                      className="input-field resize-none overflow-hidden w-full"
                      style={{ minHeight: '96px' }}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {t('planning.userQueryHelp')}
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
                          {t('planning.simpleQueryDetected')}
                        </h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {result.simpleInstruction}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {t('planning.simpleQueryHelp')}
                        </p>
                      </div>
                    )}

                    {/* OVERVIEW Query Display */}
                    {result.queryType === 'OVERVIEW' && (
                      <div className="card p-4 space-y-4">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {t('planning.comprehensiveResearchPlan')}
                        </h3>

                        {/* Analysis Summary */}
                        <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                          <h4 className="text-sm font-medium mb-2 text-gray-800 dark:text-gray-200">{t('planning.analysisSummary')}</h4>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">{t('planning.queryType')}</span>
                              <span className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                                {result.queryType}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">{t('planning.complexity')}</span>
                              <span className="ml-2 px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded">
                                {result.complexityAssessment}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">{t('planning.researchApproach')}</span>
                              <span className="ml-2 px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                                {result.researchApproach}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600 dark:text-gray-400">{t('planning.estimatedSources')}</span>
                              <span className="ml-2 px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded">
                                {result.estimatedSources || 'N/A'}
                              </span>
                            </div>
                          </div>
                          {result.reasoning && (
                            <div className="mt-2">
                              <span className="font-medium text-gray-600 dark:text-gray-400">{t('planning.reasoning')}</span>
                              <p className="text-gray-700 dark:text-gray-300 mt-1">{result.reasoning}</p>
                            </div>
                          )}
                        </div>

                        {/* Expert Persona */}
                        {result.persona && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                            <h4 className="text-sm font-medium mb-2 text-blue-800 dark:text-blue-200">{t('planning.expertPersona')}</h4>
                            <p className="text-sm text-blue-700 dark:text-blue-300">{result.persona}</p>
                          </div>
                        )}

                        {/* Search Strategies */}
                        {result.searchStrategies?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">{t('planning.searchQueries')}</h4>
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
                            <h4 className="text-sm font-medium mb-2">{t('planning.researchQuestions')}</h4>
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
                            <h4 className="text-sm font-medium mb-2">{t('planning.suggestedSources')}</h4>
                            <div className="bg-teal-50 dark:bg-teal-900/20 p-3 rounded-lg">
                              <div className="space-y-2">
                                {result.suggestedSources.map((source: any, idx: number) => (
                                  <div key={idx} className="text-sm">
                                    <div className="font-medium text-teal-800 dark:text-teal-200 capitalize">
                                      {source.type} {t('planning.sources')}
                                    </div>
                                    <div className="text-teal-700 dark:text-teal-300 ml-2">
                                      {source.examples ? source.examples.join(', ') : t('planning.variousRelevantSources')}
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
                            <h4 className="text-sm font-medium mb-2">{t('planning.researchMethodology')}</h4>
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
                          {t('planning.longFormDocumentPlan')}
                        </h3>
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded text-sm">
                          <strong>Note:</strong> {t('planning.longFormNote')}
                        </div>
                        {/* Document Sections */}
                        {result.documentSections?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">{t('planning.documentStructure')}</h4>
                            {result.documentSections.map((section: any, idx: number) => (
                              <div key={idx} className="ml-4 mb-3 p-2 bg-gray-50 dark:bg-gray-900 rounded">
                                <div className="font-medium text-purple-600 dark:text-purple-400">
                                  {idx + 1}. {section.title}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  {t('planning.keywords')}: {section.keywords.join(', ')}
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
                            <h4 className="text-sm font-medium mb-2">{t('planning.workflow')}</h4>
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
                          {t('planning.needMoreInfo')}
                        </h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {result.reasoning}
                        </p>
                        {result.clarificationQuestions?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">{t('planning.pleaseClarify')}</h4>
                            <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                              {result.clarificationQuestions.map((q: string, idx: number) => (
                                <li key={idx} className="text-gray-700 dark:text-gray-300">{q}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="mt-4">
                          <label className="block text-sm font-medium mb-2">
                            {t('planning.updateQueryDetails')}
                          </label>
                          <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="input-field"
                            rows={4}
                            placeholder={t('planning.provideMoreDetails')}
                          />
                          <button
                            onClick={handleSubmit}
                            className="btn-primary mt-2 w-full"
                          >
                            {t('planning.regeneratePlanWithClarifications')}
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* GUIDANCE Display - For complex multi-iteration plans */}
                    {result.queryType === 'guidance' && (
                      <div className="card p-4 space-y-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
                        <h3 className="font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                          <span className="text-2xl">📋</span> {t('planning.moreInfoRequired')}
                        </h3>
                        
                        {/* Plan Type Badge */}
                        {result.planType && (
                          <div className="flex gap-2 items-center">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('planning.planType')}</span>
                            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm font-medium">
                              {result.planType.replace(/-/g, ' ').toUpperCase()}
                            </span>
                          </div>
                        )}
                        
                        {/* Detected Patterns */}
                        {result.detectedPatterns?.length > 0 && (
                          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-purple-200 dark:border-purple-700">
                            <h4 className="text-sm font-medium mb-2 text-purple-800 dark:text-purple-200">
                              {t('planning.detectedComplexityPatterns')}
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
                              <div className="font-medium text-blue-700 dark:text-blue-300">{t('planning.estimatedIterations')}</div>
                              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{result.estimatedIterations}</div>
                            </div>
                          )}
                          {result.toolsRequired?.length > 0 && (
                            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-blue-200 dark:border-blue-700">
                              <div className="font-medium text-blue-700 dark:text-blue-300">{t('planning.toolsRequired')}</div>
                              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{result.toolsRequired.length}</div>
                            </div>
                          )}
                        </div>
                        
                        {/* Suggested Workflow */}
                        {result.suggestedWorkflow && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                            <h4 className="text-sm font-medium mb-2 text-blue-800 dark:text-blue-200">
                              {t('planning.suggestedWorkflow')}
                            </h4>
                            <p className="text-sm text-blue-700 dark:text-blue-300">{result.suggestedWorkflow}</p>
                          </div>
                        )}
                        
                        {/* Tools Required */}
                        {result.toolsRequired?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">{t('planning.requiredTools')}</h4>
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
                            <span className="text-lg">💡</span> {t('planning.guidanceQuestions')}
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
                              {t('planning.updatePromptWithAnswers')}
                            </label>
                            <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                              {t('planning.guidanceTip')}
                            </p>
                            <textarea
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              className="input-field"
                              rows={6}
                              placeholder={t('planning.guidanceExamplePlaceholder')}
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={handleSubmit}
                                className="btn-primary flex-1"
                              >
                                {t('planning.generateDetailedExecutionPlan')}
                              </button>
                              <button
                                onClick={async () => {
                                  // Force plan - generate answers to questions and force plan generation
                                  if (!isAuthenticated) {
                                    showError(t('planning.signInRequired'));
                                    return;
                                  }
                                  
                                  if (isLoading) return;
                                  
                                  setIsLoading(true);
                                  setStatusMessage(t('planning.forcingPlan'));
                                  
                                  try {
                                    const token = await getToken();
                                    if (!token) {
                                      showError(t('planning.authExpired'));
                                      setIsLoading(false);
                                      return;
                                    }
                                    
                                    const enabledProviders = settings.providers.filter((p: any) => p.enabled !== false);
                                    
                                    // Generate automatic answers to guidance questions
                                    const autoAnswers = result.guidanceQuestions?.map((q: string, idx: number) => 
                                      `Q${idx + 1}: ${q}\nA${idx + 1}: ${t('planning.clarificationAnswer')}`
                                    ).join('\n\n') || '';
                                    
                                    await generatePlan(
                                      query,
                                      token,
                                      enabledProviders,
                                      undefined,
                                      (event: string, data: any) => {
                                        console.log('Force Plan SSE event:', event, data);
                                        
                                        switch (event) {
                                          case 'status':
                                            setStatusMessage(data.message || t('planning.processing'));
                                            break;
                                          case 'result':
                                            setResult(data);
                                            if (data.enhancedSystemPrompt) {
                                              setGeneratedSystemPrompt(data.enhancedSystemPrompt);
                                            }
                                            if (data.enhancedUserPrompt) {
                                              setGeneratedUserQuery(data.enhancedUserPrompt);
                                            }
                                            break;
                                          case 'llm_response':
                                            setLlmInfo(data);
                                            break;
                                          case 'error':
                                            const errorMsg = data.error || 'Unknown error';
                                            setResult({ error: errorMsg });
                                            showError(`${t('planning.forcePlanError')}: ${errorMsg}`);
                                            break;
                                        }
                                      },
                                      () => {
                                        console.log('Force plan complete');
                                        setIsLoading(false);
                                        setStatusMessage('');
                                      },
                                      (error: Error) => {
                                        console.error('Force plan error:', error);
                                        setResult({ error: error.message });
                                        showError(`${t('planning.forcePlanFailed')}: ${error.message}`);
                                        setIsLoading(false);
                                        setStatusMessage('');
                                      },
                                      {
                                        clarificationAnswers: autoAnswers,
                                        previousContext: result,
                                        forcePlan: true,
                                        language: settings.language || 'en'
                                      }
                                    );
                                  } catch (error) {
                                    console.error('Force plan error:', error);
                                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                                    setResult({ error: errorMsg });
                                    showError(`${t('planning.forcePlanError')}: ${errorMsg}`);
                                    setIsLoading(false);
                                    setStatusMessage('');
                                  }
                                }}
                                disabled={isLoading}
                                className="btn-secondary flex-1"
                                title={t('planning.forcePlanTooltip')}
                              >
                                {t('planning.forcePlan')}
                              </button>
                              <button
                                onClick={() => {
                                  // Reset - clear guidance mode and restore original state
                                  setResult(null);
                                  setStatusMessage('');
                                  // Restore saved values if they exist
                                  if (savedSystemPrompt) setGeneratedSystemPrompt(savedSystemPrompt);
                                  if (savedUserQuery) setGeneratedUserQuery(savedUserQuery);
                                  setSavedQuery('');
                                  setSavedSystemPrompt('');
                                  setSavedUserQuery('');
                                }}
                                className="btn-secondary"
                                title={t('planning.resetTooltip')}
                              >
                                {t('planning.reset')}
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {/* Info Box */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-300 dark:border-blue-700">
                          <p className="text-xs text-blue-800 dark:text-blue-200">
                            <strong>{t('planning.aboutGuidanceMode')}</strong> {t('planning.guidanceModeHelp')}
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
      </FocusTrap>

      {/* Load Plans Dialog */}
      {showLoadDialog && (
        <FocusTrap active={showLoadDialog}>
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="card p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{t('planning.loadSavedPlan')}</h3>
              {storageInfo && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('planning.storage')}: {(storageInfo.usage / (1024 * 1024)).toFixed(2)} MB / {(storageInfo.quota / (1024 * 1024)).toFixed(0)} MB ({storageInfo.percentage.toFixed(1)}%)
                </div>
              )}
            </div>
            
            {/* Storage warning - only show when storage is critically full */}
            {storageInfo && storageInfo.percentage > 80 && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold mb-2">
                  ⚠️ {t('planning.storageWarning', { percentage: storageInfo.percentage.toFixed(1) })}
                </div>
                <div className="text-xs text-yellow-700 dark:text-yellow-300">
                  {t('planning.storageWarningHelp')}
                </div>
              </div>
            )}
            
            {savedPlans.length === 0 ? (
              <p className="text-gray-500">{t('planning.noSavedPlans')}</p>
            ) : (
              <div className="space-y-3">
                {savedPlans.map((plan) => {
                  const date = new Date(plan.timestamp).toLocaleString();
                  return (
                    <div key={plan.id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1 truncate" title={plan.query}>
                            {plan.query.length > 100 ? plan.query.substring(0, 100) + '...' : plan.query}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {t('planning.saved')}: {date}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleLoadPlan(plan)}
                            className="btn-primary text-xs"
                          >
                            {t('planning.load')}
                          </button>
                          <button
                            onClick={() => handleDeletePlan(plan.id)}
                            className="btn-secondary text-red-500 text-xs"
                          >
                            {t('common.delete')}
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
              {t('common.close')}
            </button>
          </div>
        </div>
        </FocusTrap>
      )}

      {/* LLM Transparency Dialog */}
      {showLlmInfo && llmInfo && (
        <LlmInfoDialog
          apiCalls={[llmInfo]}
          onClose={() => setShowLlmInfo(false)}
        />
      )}

      {/* Voice Input Dialog */}
      <VoiceInputDialog
        isOpen={showVoiceInput}
        onClose={() => setShowVoiceInput(false)}
        onTranscriptionComplete={handleVoiceTranscription}
        accessToken={accessToken}
        apiEndpoint={apiEndpoint}
      />

      {/* Copy Debug Info Button */}
      <div className="flex justify-end mt-6">
        <button
          className="btn-secondary text-xs"
          onClick={handleCopyDebugInfo}
          title="Copy conversation, LLM, and tool debug info for Copilot support"
        >
          🐞 Copy Debug Info
        </button>
      </div>
    </>
  );
};
