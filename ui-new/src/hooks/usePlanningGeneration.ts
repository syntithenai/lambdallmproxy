/**
 * Custom hook for managing planning generation logic
 */
import { useState, useCallback } from 'react';
import { generatePlan } from '../utils/api';
import { saveCachedPlan } from '../utils/planningCache';

interface UsePlanningGenerationProps {
  query: string;
  getToken: () => Promise<string | null>;
  enabledProviders: any[];
  onSuccess: (systemPrompt: string, userQuery: string, result: any) => void;
  onError: (error: string) => void;
}

export const usePlanningGeneration = ({
  query,
  getToken,
  enabledProviders,
  onSuccess,
  onError
}: UsePlanningGenerationProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const transformResultToPrompts = useCallback((data: any, originalQuery: string) => {
    // Build system prompt from plan fields
    let systemPromptText = '';
    
    if (data.persona) {
      systemPromptText += `AI Persona:\n${data.persona}\n\n`;
    }
    
    if (data.plan) {
      systemPromptText += `Research Plan:\n${data.plan}\n\n`;
    }
    
    if (data.reasoning) {
      systemPromptText += `Research Context:\n${data.reasoning}\n\n`;
    }
    
    if (data.steps && data.steps.length > 0) {
      systemPromptText += `Research Steps:\n`;
      systemPromptText += data.steps.map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n');
      systemPromptText += '\n\n';
    }
    
    if (data.sources && data.sources.length > 0) {
      systemPromptText += `Recommended Sources:\n`;
      systemPromptText += data.sources.map((source: string) => `- ${source}`).join('\n');
      systemPromptText += '\n\n';
    }
    
    if (data.notes) {
      systemPromptText += `Additional Notes:\n${data.notes}\n\n`;
    }
    
    // Build user query from search keywords and questions
    let userQueryText = `I need help with the following research task:\n\n`;
    userQueryText += `**Original Query:** ${originalQuery}\n\n`;
    
    if (data.searchKeywords && data.searchKeywords.length > 0) {
      userQueryText += `**Search Keywords:**\n`;
      userQueryText += data.searchKeywords.map((kw: string) => `- ${kw}`).join('\n');
      userQueryText += `\n\nPlease use your search tools to find information about these keywords.\n\n`;
    }
    
    if (data.questions && data.questions.length > 0) {
      userQueryText += `**Be sure to answer the following questions:**\n`;
      userQueryText += data.questions.map((q: string, idx: number) => `${idx + 1}. ${q}`).join('\n');
      userQueryText += `\n\nPlease research and provide complete answers to all these questions.\n\n`;
    }
    
    userQueryText += `Please help me research this topic thoroughly using your available tools.`;
    
    return {
      systemPrompt: systemPromptText.trim(),
      userQuery: userQueryText.trim()
    };
  }, []);

  const generateResearchPlan = useCallback(async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    
    try {
      const token = await getToken();
      if (!token) {
        onError('Authentication expired. Please sign out and sign in again to continue.');
        setIsLoading(false);
        return;
      }

      if (enabledProviders.length === 0) {
        onError('No providers configured. Please set up at least one provider in Settings.');
        setIsLoading(false);
        return;
      }

      await generatePlan(
        query,
        token,
        enabledProviders,
        undefined,
        (event: string, data: any) => {
          if (event === 'result') {
            const { systemPrompt, userQuery } = transformResultToPrompts(data, query);
            onSuccess(systemPrompt, userQuery, data);
            // Save with both system and user prompts
            saveCachedPlan(
              query, 
              data,
              data.enhancedSystemPrompt || systemPrompt || '',
              data.enhancedUserPrompt || userQuery || ''
            );
            console.log('Plan auto-saved to cache with prompts');
          } else if (event === 'error') {
            const errorMsg = data.error || 'Unknown error';
            const providerInfo = data.provider && data.model 
              ? ` (Provider: ${data.provider}, Model: ${data.model})`
              : '';
            let fullError = `${errorMsg}${providerInfo}`;
            
            if (errorMsg.includes('Invalid API Key') || errorMsg.includes('401')) {
              fullError += '\n\nTip: Check your API key in Settings. Make sure it is valid and has not expired.';
            } else if (data.isRateLimit || errorMsg.includes('rate limit')) {
              fullError += '\n\nTip: You have hit the rate limit. Try again in a few moments or use a different provider.';
            }
            
            onError(fullError);
          }
        },
        () => {
          console.log('Planning stream complete');
          setIsLoading(false);
        },
        (error: Error) => {
          console.error('Planning stream error:', error);
          onError(error.message);
          setIsLoading(false);
        }
      );
    } catch (error) {
      console.error('Planning error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      onError(errorMsg);
      setIsLoading(false);
    }
  }, [query, isLoading, getToken, enabledProviders, onSuccess, onError, transformResultToPrompts]);

  return {
    isLoading,
    generateResearchPlan
  };
};
