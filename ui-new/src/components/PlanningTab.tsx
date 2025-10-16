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
  const { isLoading, generateResearchPlan } = usePlanningGeneration({
    query,
    getToken,
    enabledProviders,
    onSuccess: (systemPrompt, userQuery, resultData) => {
      setGeneratedSystemPrompt(systemPrompt);
      setGeneratedUserQuery(userQuery);
      setResult(resultData);
      showSuccess('Research plan generated successfully');
    },
    onError: (error) => {
      setResult({ error });
      showError(`Planning error: ${error}`);
    }
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

        {/* 1. Research Query */}
        <AutoResizingTextarea
          label="1. Research Query (prompt for generating plans)"
          value={query}
          onChange={setQuery}
          placeholder="Enter your research question or topic..."
          disabled={!isAuthenticated}
          minHeight="60px"
        />

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
