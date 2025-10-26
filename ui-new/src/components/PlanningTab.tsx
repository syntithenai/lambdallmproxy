/**
 * PlanningTab Component (Refactored)
 * 
 * Main planning interface with three auto-resizing textarea fields:
 * 1. Research Query (user input)
 * 2. Generated System Prompt (auto-generated from plan)
 * 3. Generated User Query (auto-generated from keywords/questions)
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './ToastManager';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { usePlanningGeneration } from '../hooks/usePlanningGeneration';
import { isTokenExpiringSoon, decodeJWT } from '../utils/auth';
import { 
  getAllCachedPlans, 
  deleteCachedPlan 
} from '../utils/planningCache';
import type { CachedPlan } from '../utils/planningCache';

// Components
import { PlanningHeader } from './PlanningHeader';
import { PlanningConfiguration } from './PlanningConfiguration';
import { AutoResizingTextarea } from './AutoResizingTextarea';
import { PlanResultsDisplay } from './PlanResultsDisplay';
import { PlanLoadDialog } from './PlanLoadDialog';

interface PlanningTabProps {
  onTransferToChat: (query: string) => void;
  defaultQuery?: string;
}

export const PlanningTab: React.FC<PlanningTabProps> = ({ onTransferToChat, defaultQuery }) => {
  const { getToken, isAuthenticated, accessToken } = useAuth();
  const { settings } = useSettings();
  const { showError, showSuccess } = useToast();
  
  // State
  const [query, setQuery] = useLocalStorage<string>('planning_query', defaultQuery || '');
  const [result, setResult] = useLocalStorage<any>('planning_result', null);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedPlans, setSavedPlans] = useState<CachedPlan[]>([]);
  
  // Clarification state
  const [needsClarification, setNeedsClarification] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationContext, setClarificationContext] = useState<any>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<string>('');
  
  // Store original prompts when entering clarification mode (to restore on cancel)
  const [savedSystemPrompt, setSavedSystemPrompt] = useState<string>('');
  const [savedUserQuery, setSavedUserQuery] = useState<string>('');
  
  // Configuration
  const [temperature, setTemperature] = useLocalStorage('planning_temperature', 0.7);
  const [maxTokens, setMaxTokens] = useLocalStorage('planning_max_tokens', 512);
  const [systemPrompt, setSystemPrompt] = useLocalStorage('chat_system_prompt', '');
  
  // Generated prompts
  const [generatedSystemPrompt, setGeneratedSystemPrompt] = useLocalStorage('planning_generated_system_prompt', '');
  const [generatedUserQuery, setGeneratedUserQuery] = useLocalStorage('planning_generated_user_query', '');

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

  // Get enabled providers
  const enabledProviders = settings.providers.filter((p: any) => p.enabled === true);

  // Planning generation hook
  const { isLoading, generateResearchPlan, stopGeneration } = usePlanningGeneration({
    query,
    getToken,
    enabledProviders,
    onSuccess: (systemPrompt, userQuery, resultData) => {
      setGeneratedSystemPrompt(systemPrompt);
      setGeneratedUserQuery(userQuery);
      setResult(resultData);
      setNeedsClarification(false); // Clear clarification mode on success
      setClarificationQuestions([]);
      setClarificationAnswers('');
      showSuccess('Research plan generated successfully');
    },
    onError: (error) => {
      setResult({ error });
      showError(`Planning error: ${error}`);
    },
    onClarificationNeeded: (questions, context) => {
      // LLM needs clarification - show questions to user
      // Save current prompts before entering clarification mode (to restore on cancel)
      setSavedSystemPrompt(generatedSystemPrompt);
      setSavedUserQuery(generatedUserQuery);
      
      // Clear the generated prompts to hide them
      setGeneratedSystemPrompt('');
      setGeneratedUserQuery('');
      
      // Set clarification mode
      setNeedsClarification(true);
      setClarificationQuestions(questions);
      setClarificationContext(context);
      // Pre-fill answers with question template
      setClarificationAnswers(questions.map((q, i) => `${i + 1}. ${q}\n   Answer: `).join('\n\n'));
      showSuccess('Please answer the clarification questions below');
    },
    clarificationAnswers: needsClarification ? undefined : clarificationAnswers, // Only send if resubmitting
    previousContext: needsClarification ? undefined : clarificationContext
  });

  // Handlers
  const handleTransferToChat = () => {
    if (!generatedUserQuery.trim()) return;
    
    const transferData = {
      prompt: generatedUserQuery,
      systemPrompt: generatedSystemPrompt
    };
    
    onTransferToChat(JSON.stringify(transferData));
    showSuccess('Plan sent to chat');
  };

  const handleLoadPlan = (plan: CachedPlan) => {
    setQuery(plan.query);
    setResult(plan.plan);
    setShowLoadDialog(false);
    showSuccess('Plan loaded');
  };

  const handleDeletePlan = (planId: string) => {
    deleteCachedPlan(planId);
    setSavedPlans(getAllCachedPlans());
    showSuccess('Plan deleted');
  };

  const handleNewPlan = () => {
    setQuery('');
    setResult(null);
    setGeneratedSystemPrompt('');
    setGeneratedUserQuery('');
  };

  // Load saved plans when dialog opens
  useEffect(() => {
    if (showLoadDialog) {
      setSavedPlans(getAllCachedPlans());
    }
  }, [showLoadDialog]);

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Header */}
      <PlanningHeader
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
        hasQuery={query.trim().length > 0}
        hasGeneratedQuery={generatedUserQuery.trim().length > 0}
        onGeneratePlan={generateResearchPlan}
        onStopGeneration={stopGeneration}
        onSendToChat={handleTransferToChat}
        onLoadPlan={() => setShowLoadDialog(true)}
        onNewPlan={handleNewPlan}
      />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Configuration */}
        <PlanningConfiguration
          temperature={temperature}
          maxTokens={maxTokens}
          systemPrompt={systemPrompt}
          onTemperatureChange={setTemperature}
          onMaxTokensChange={setMaxTokens}
          onSystemPromptChange={setSystemPrompt}
        />

        {/* 1. Research Query - Hide when in clarification mode */}
        {!needsClarification && (
          <AutoResizingTextarea
            label="1. Research Query (prompt for generating plans)"
            value={query}
            onChange={setQuery}
            placeholder="Enter your research question or topic..."
            disabled={!isAuthenticated}
            minHeight="60px"
          />
        )}

        {/* Clarification Questions (shown when LLM needs more info) */}
        {needsClarification && clarificationQuestions.length > 0 && (
          <div className="card p-4 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-yellow-800 dark:text-yellow-300 mb-1">
                  📋 More Info Required
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  The AI needs more information to create a complete research plan. Please answer the questions below:
                </p>
              </div>
            </div>
            
            {/* Questions list (read-only) */}
            <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded border border-yellow-300 dark:border-yellow-700">
              <p className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
                Questions from AI:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {clarificationQuestions.map((question, idx) => (
                  <li key={idx}>{question}</li>
                ))}
              </ol>
            </div>
            
            {/* Editable answers textarea */}
            <AutoResizingTextarea
              label="Your Answers (edit the text below with your responses)"
              value={clarificationAnswers}
              onChange={setClarificationAnswers}
              placeholder="Please provide your answers to the clarification questions above..."
              minHeight="120px"
              backgroundColor="bg-white dark:bg-gray-800"
            />
            
            {/* Resubmit button */}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  // Clear clarification mode and regenerate with answers
                  setNeedsClarification(false);
                  generateResearchPlan();
                }}
                disabled={isLoading || !clarificationAnswers.trim()}
                className="btn-primary flex items-center gap-2"
              >
                <span>🔄</span>
                <span>Regenerate Plan with Answers</span>
              </button>
              <button
                onClick={() => {
                  // Restore saved prompts and exit clarification mode
                  setNeedsClarification(false);
                  setClarificationQuestions([]);
                  setClarificationAnswers('');
                  setGeneratedSystemPrompt(savedSystemPrompt);
                  setGeneratedUserQuery(savedUserQuery);
                  setSavedSystemPrompt('');
                  setSavedUserQuery('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 2. Generated System Prompt */}
        {generatedSystemPrompt && (
          <AutoResizingTextarea
            label="2. Generated System Prompt (auto-generated after clicking Generate Plan)"
            value={generatedSystemPrompt}
            onChange={setGeneratedSystemPrompt}
            placeholder="System prompt will appear here after generating plan..."
            minHeight="100px"
            backgroundColor="bg-blue-50 dark:bg-blue-900/10"
          />
        )}

        {/* 3. Generated User Query */}
        {generatedUserQuery && (
          <AutoResizingTextarea
            label="3. User Query (auto-generated after clicking Generate Plan, ready for Send To Chat)"
            value={generatedUserQuery}
            onChange={setGeneratedUserQuery}
            placeholder="User query will appear here after generating plan..."
            minHeight="150px"
            backgroundColor="bg-green-50 dark:bg-green-900/10"
          />
        )}

        {/* Error Display */}
        {result && result.error && (
          <div className="card p-4 bg-red-50 dark:bg-red-900/20">
            <h3 className="text-lg font-bold text-red-700 dark:text-red-300 mb-2">
              Error
            </h3>
            <div className="text-red-600 dark:text-red-400 whitespace-pre-wrap">
              {result.error}
            </div>
          </div>
        )}

        {/* Raw Results Display */}
        <PlanResultsDisplay result={result} />
      </div>

      {/* Load Dialog */}
      <PlanLoadDialog
        isOpen={showLoadDialog}
        savedPlans={savedPlans}
        onClose={() => setShowLoadDialog(false)}
        onLoadPlan={handleLoadPlan}
        onDeletePlan={handleDeletePlan}
      />
    </div>
  );
};
