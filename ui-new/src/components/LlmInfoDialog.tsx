import React from 'react';
import { JsonTree } from './JsonTree';
import { useDialogClose } from '../hooks/useDialogClose';
import { formatCost, getCostBreakdown, calculateDualPricing } from '../utils/pricing';
import { useToast } from './ToastManager';

interface LlmApiCall {
  phase: string;
  provider?: string;
  model: string;
  request: any;
  response?: any;
  httpHeaders?: any;
  httpStatus?: number;
  timestamp: string;
  type?: string; // 'image_generation' or undefined for text
  cost?: number; // For image generation calls
  durationMs?: number; // Duration in milliseconds
  metadata?: any; // Additional metadata (size, quality, style, etc.)
  success?: boolean; // Success status
}

interface Evaluation {
  attempt: number;
  comprehensive: boolean;
  reason: string;
}

interface LlmInfoDialogProps {
  apiCalls: LlmApiCall[];
  evaluations?: Evaluation[]; // Kept for backwards compatibility but no longer used
  onClose: () => void;
}

export const LlmInfoDialog: React.FC<LlmInfoDialogProps> = ({ apiCalls, onClose }) => {
  const dialogRef = useDialogClose(true, onClose);
  const { showSuccess, showError } = useToast();

  // Copy JSON to clipboard
  const copyToClipboard = async (data: any, label: string) => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(jsonString);
      showSuccess(`${label} copied to clipboard!`);
    } catch (err) {
      showError(`Failed to copy ${label}`);
      console.error('Copy failed:', err);
    }
  };

  // Parse JSON strings in response object recursively
  const parseJsonStrings = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // Try to parse as JSON
      try {
        const trimmed = obj.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          const parsed = JSON.parse(trimmed);
          // Recursively parse the parsed object
          return parseJsonStrings(parsed);
        }
      } catch (e) {
        // Not valid JSON, return as-is
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => parseJsonStrings(item));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = parseJsonStrings(value);
      }
      return result;
    }

    return obj;
  };

  const formatPhase = (phase: string): string => {
    switch (phase) {
      case 'planning':
        return '🧠 Planning';
      case 'tool_iteration':
        return '🔧 Tool Execution';
      case 'final_synthesis':
      case 'final_response':
        return '✨ Final Answer';
      case 'page_summary':
        return '📄 Page Summary';
      case 'synthesis_summary':
        return '🔄 Search Synthesis';
      default:
        return phase;
    }
  };

  const getProviderFromModel = (model: string | undefined, provider?: string): string => {
    // Use explicit provider if available
    if (provider) {
      // Image generation providers with proper display names
      if (provider.toLowerCase() === 'openai') return 'OpenAI';
      if (provider.toLowerCase() === 'together') return 'Together AI';
      if (provider.toLowerCase() === 'replicate') return 'Replicate';
      if (provider.toLowerCase() === 'gemini') return 'Google Gemini';
      
      // Default: capitalize first letter
      return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
    
    // Handle missing model
    if (!model) {
      return 'Unknown';
    }
    
    // Fall back to model name detection
    if (model.startsWith('gpt-') || model.startsWith('o1-') || model.includes('dall-e')) {
      return 'OpenAI';
    }
    if (model.includes('claude')) {
      return 'Anthropic';
    }
    if (model.includes('llama') || model.includes('mixtral') || model.includes('gemma')) {
      return 'Groq';
    }
    if (model.includes('stable-diffusion')) {
      return 'Together AI';
    }
    if (model.includes('sdxl') || model.includes('realistic-vision')) {
      return 'Replicate';
    }
    return 'Unknown';
  };

  const getModelDisplay = (model: string | undefined): string => {
    // Handle missing model
    if (!model) {
      return 'Unknown';
    }
    // Remove provider prefix for cleaner display
    return model.replace(/^(openai:|groq:|anthropic:)/, '');
  };

  // Get provider badge color for image generation
  const getProviderBadgeColor = (provider: string): string => {
    switch (provider.toLowerCase()) {
      case 'openai':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'together':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'replicate':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      case 'gemini':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  // Calculate total cost and tokens across all calls with dual pricing + image generation
  const { totalActualCost, totalPaidEquivalent, hasFreeModels, totalPromptTokens, totalCompletionTokens, totalTokens, hasPricing } = apiCalls.reduce((acc, call) => {
    // Check if this is an image generation call
    if (call.type === 'image_generation' && call.cost !== undefined) {
      return {
        totalActualCost: acc.totalActualCost + call.cost,
        totalPaidEquivalent: acc.totalPaidEquivalent + call.cost,
        hasFreeModels: acc.hasFreeModels,
        totalPromptTokens: acc.totalPromptTokens,
        totalCompletionTokens: acc.totalCompletionTokens,
        totalTokens: acc.totalTokens,
        hasPricing: acc.hasPricing
      };
    }
    
    // Regular text generation call
    const tokensIn = call.response?.usage?.prompt_tokens || 0;
    const tokensOut = call.response?.usage?.completion_tokens || 0;
    const pricing = calculateDualPricing(call.model, tokensIn, tokensOut);
    const breakdown = getCostBreakdown(call.model, tokensIn, tokensOut);
    
    return {
      totalActualCost: acc.totalActualCost + (pricing.actualCost || 0),
      totalPaidEquivalent: acc.totalPaidEquivalent + (pricing.paidEquivalentCost || 0),
      hasFreeModels: acc.hasFreeModels || pricing.isFree,
      totalPromptTokens: acc.totalPromptTokens + tokensIn,
      totalCompletionTokens: acc.totalCompletionTokens + tokensOut,
      totalTokens: acc.totalTokens + tokensIn + tokensOut,
      hasPricing: acc.hasPricing || breakdown.hasPricing
    };
  }, { totalActualCost: 0, totalPaidEquivalent: 0, hasFreeModels: false, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, hasPricing: false });

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Dialog Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              🔍 LLM Transparency Info
            </h3>
            <div className="flex gap-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
              <span>{apiCalls.length} call{apiCalls.length !== 1 ? 's' : ''}</span>
              
              {/* Token Summary */}
              {totalTokens > 0 && (
                <>
                  <span>•</span>
                  <span>
                    📊 {totalTokens.toLocaleString()} tokens
                    <span className="text-xs opacity-75 ml-1">
                      ({totalPromptTokens.toLocaleString()} in, {totalCompletionTokens.toLocaleString()} out)
                    </span>
                  </span>
                </>
              )}
              
              {/* Cost Summary */}
              {totalActualCost > 0 && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    💰 {formatCost(totalActualCost)}
                    {hasFreeModels && totalPaidEquivalent > 0 && (
                      <span className="text-xs opacity-75 ml-1">
                        (would be {formatCost(totalPaidEquivalent)} on paid)
                      </span>
                    )}
                  </span>
                </>
              )}
              
              {/* Pricing Warning */}
              {!hasPricing && totalTokens > 0 && (
                <>
                  <span>•</span>
                  <span className="font-medium text-yellow-600 dark:text-yellow-400" title="Pricing information not available for some models">
                    ⚠️ No pricing info
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-3xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Dialog Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {apiCalls.filter(call => call.phase !== 'self_evaluation').map((call, index) => {
            const tokensIn = call.response?.usage?.prompt_tokens || 0;
            const tokensOut = call.response?.usage?.completion_tokens || 0;
            
            // Extract timing information
            const queueTime = call.response?.usage?.queue_time;
            const promptTime = call.response?.usage?.prompt_time;
            const completionTime = call.response?.usage?.completion_time;
            const totalTime = call.response?.usage?.total_time;
            
            // Use HTTP headers from the separate field (sent by backend)
            const responseHeaders = call.httpHeaders || null;
            
            return (
              <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {/* Call header */}
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {/* Call Type Icon */}
                      {call.type === 'image_generation' ? (
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          🖼️ Image Generation
                        </span>
                      ) : (
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {formatPhase(call.phase)}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                      
                      {/* Provider Badge with Color */}
                      {call.type === 'image_generation' && call.provider ? (
                        <span className={`text-xs px-2 py-1 rounded font-medium ${getProviderBadgeColor(call.provider)}`}>
                          {getProviderFromModel(call.model, call.provider)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {getProviderFromModel(call.model, call.provider)}
                        </span>
                      )}
                      
                      <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                      <code className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                        {getModelDisplay(call.model)}
                      </code>
                    </div>
                  </div>
                  
                  {/* Response metadata with cost, timing, and token info */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                    {/* Image Generation Cost and Metadata */}
                    {call.type === 'image_generation' ? (
                      <>
                        {/* Image generation cost */}
                        {call.cost !== undefined && (
                          <span className="font-semibold text-green-600 dark:text-green-400">
                            💰 {formatCost(call.cost)}
                          </span>
                        )}
                        
                        {/* Image generation metadata */}
                        {call.metadata?.size && (
                          <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                            📐 {call.metadata.size}
                          </span>
                        )}
                        {call.metadata?.quality && (
                          <span className="px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                            ⭐ {call.metadata.quality}
                          </span>
                        )}
                        {call.metadata?.style && (
                          <span className="px-2 py-0.5 rounded bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300">
                            🎨 {call.metadata.style}
                          </span>
                        )}
                        
                        {/* Duration */}
                        {call.durationMs && (
                          <span>⏱️ {(call.durationMs / 1000).toFixed(2)}s</span>
                        )}
                        
                        {/* Success/failure status */}
                        {call.success !== undefined && (
                          <span className={call.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {call.success ? '✅ Success' : '❌ Failed'}
                          </span>
                        )}
                      </>
                    ) : call.response ? (
                      <>
                        {/* Cost Information - Dual Pricing (Primary) */}
                        {(() => {
                          const pricing = calculateDualPricing(call.model, tokensIn, tokensOut);
                          const breakdown = getCostBreakdown(call.model, tokensIn, tokensOut);
                          
                          if (breakdown.hasPricing) {
                            if (pricing.isFree && pricing.paidEquivalentCost !== null) {
                              return (
                                <span className="font-semibold text-green-600 dark:text-green-400" title={`Free tier • Input: ${formatCost(breakdown.inputCost)} • Output: ${formatCost(breakdown.outputCost)}`}>
                                  💰 {pricing.formattedActual} <span className="text-xs opacity-75">(would be {pricing.formattedPaidEquivalent} on paid)</span>
                                </span>
                              );
                            } else if (pricing.actualCost !== null) {
                              return (
                                <span className="font-semibold text-green-600 dark:text-green-400" title={`Input: ${formatCost(breakdown.inputCost)} • Output: ${formatCost(breakdown.outputCost)}`}>
                                  💰 {pricing.formattedActual}
                                </span>
                              );
                            }
                          } else {
                            // Show warning when no pricing information is available
                            return (
                              <span className="font-medium text-yellow-600 dark:text-yellow-400" title="Pricing information not available for this model">
                                ⚠️ No pricing info
                              </span>
                            );
                          }
                          return null;
                        })()}
                        
                        {/* Token counts (Secondary, smaller) - show breakdown only if we have the data */}
                        {(tokensIn > 0 || tokensOut > 0) && (
                          <span className="opacity-75">
                            {tokensIn > 0 && `📥 ${tokensIn.toLocaleString()} in`}
                            {tokensIn > 0 && tokensOut > 0 && ' • '}
                            {tokensOut > 0 && `� ${tokensOut.toLocaleString()} out`}
                          </span>
                        )}
                        
                        {/* Timing information */}
                        {totalTime && <span>⏱️ {totalTime.toFixed(3)}s</span>}
                        {queueTime && <span>⏳ queue: {queueTime.toFixed(3)}s</span>}
                        {promptTime && <span>🔄 prompt: {promptTime.toFixed(3)}s</span>}
                        {completionTime && <span>✍️ completion: {completionTime.toFixed(3)}s</span>}
                      </>
                    ) : (
                      <span className="text-yellow-600 dark:text-yellow-400">⏳ Request sent, awaiting response...</span>
                    )}
                  </div>
                  
                  {/* Timestamp */}
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    ⏰ {new Date(call.timestamp).toLocaleString()}
                  </div>
                </div>

                {/* Call content */}
                <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                  <div className="space-y-4">

                    {/* Full Request Body */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          📤 Request Body
                        </h4>
                        <button
                          onClick={() => copyToClipboard(call.request, 'Request')}
                          className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1"
                          title="Copy request JSON to clipboard"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </button>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">
                        <div className="text-xs font-mono">
                          <JsonTree 
                            data={parseJsonStrings(call.request)} 
                            expanded={false}
                            expandPaths={['messages']}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Response Headers */}
                    {call.response && responseHeaders && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            📋 Response Headers
                          </h4>
                          <button
                            onClick={() => copyToClipboard(responseHeaders, 'Headers')}
                            className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1"
                            title="Copy headers JSON to clipboard"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </button>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800 max-h-64 overflow-y-auto">
                          <div className="text-xs font-mono">
                            <JsonTree data={responseHeaders} expanded={false} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Response Details */}
                    {call.response && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            📥 Response
                          </h4>
                          <button
                            onClick={() => copyToClipboard(call.response, 'Response')}
                            className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1"
                            title="Copy response JSON to clipboard"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </button>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-200 dark:border-green-800 max-h-96 overflow-y-auto">
                          <div className="text-xs font-mono">
                            <JsonTree 
                              data={parseJsonStrings(call.response)} 
                              expanded={false}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Self-Evaluation Calls - Display as regular API calls */}
          {apiCalls.filter(call => call.phase === 'self_evaluation').map((call, index) => {
            const tokensIn = call.response?.usage?.prompt_tokens || 0;
            const tokensOut = call.response?.usage?.completion_tokens || 0;
            
            // Extract evaluation result from response
            let evaluationResult: any = null;
            try {
              if (call.response?.choices?.[0]?.message?.content) {
                evaluationResult = JSON.parse(call.response.choices[0].message.content);
              }
            } catch (e) {
              // Not JSON
            }
            
            return (
              <div key={`eval-${index}`} className="border border-purple-200 dark:border-purple-700 rounded-lg overflow-hidden">
                {/* Call header */}
                <div className="px-4 py-3 bg-purple-100 dark:bg-purple-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        🔍 self_evaluation
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {getProviderFromModel(call.model, call.provider)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                      <code className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                        {getModelDisplay(call.model)}
                      </code>
                    </div>
                  </div>
                  
                  {/* Response metadata */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                    {call.response && (() => {
                      const pricing = calculateDualPricing(call.model, tokensIn, tokensOut);
                      const breakdown = getCostBreakdown(call.model, tokensIn, tokensOut);
                      
                      return (
                        <>
                          {breakdown.hasPricing && pricing.actualCost !== null && (
                            <span className="font-semibold text-green-600 dark:text-green-400">
                              💰 {pricing.formattedActual}
                            </span>
                          )}
                          {(tokensIn > 0 || tokensOut > 0) && (
                            <span className="opacity-75">
                              {tokensIn > 0 && `📥 ${tokensIn.toLocaleString()} in`}
                              {tokensIn > 0 && tokensOut > 0 && ' • '}
                              {tokensOut > 0 && `📤 ${tokensOut.toLocaleString()} out`}
                            </span>
                          )}
                          {/* Show evaluation result badge */}
                          {evaluationResult && (
                            <span className={`px-2 py-0.5 rounded font-medium ${
                              evaluationResult.comprehensive 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                            }`}>
                              {evaluationResult.comprehensive ? '✅ Comprehensive' : '⚠️ Needs Improvement'}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  
                  {/* Timestamp */}
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    ⏰ {new Date(call.timestamp).toLocaleString()}
                  </div>
                </div>

                {/* Call content */}
                <div className="p-4 bg-white dark:bg-gray-900 border-t border-purple-200 dark:border-purple-700">
                  <div className="space-y-4">

                    {/* Full Request Body */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          📤 Request Body
                        </h4>
                        <button
                          onClick={() => copyToClipboard(call.request, 'Self-Evaluation Request')}
                          className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </button>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">
                        <div className="text-xs font-mono">
                          <JsonTree 
                            data={parseJsonStrings(call.request)} 
                            expanded={false}
                            expandPaths={['messages']}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Response Details */}
                    {call.response && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            📥 Response
                          </h4>
                          <button
                            onClick={() => copyToClipboard(call.response, 'Self-Evaluation Response')}
                            className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </button>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-200 dark:border-green-800 max-h-96 overflow-y-auto">
                          <div className="text-xs font-mono">
                            <JsonTree 
                              data={parseJsonStrings(call.response)} 
                              expanded={false}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dialog Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
          <div className="text-sm text-gray-600 dark:text-gray-400 flex gap-4">
            {/* Token Summary */}
            {totalTokens > 0 && (
              <span>
                📊 {totalTokens.toLocaleString()} tokens
                <span className="text-xs opacity-75 ml-1">
                  ({totalPromptTokens.toLocaleString()} in, {totalCompletionTokens.toLocaleString()} out)
                </span>
              </span>
            )}
            
            {/* Cost Summary */}
            {totalActualCost > 0 && (
              <span className="font-semibold text-green-600 dark:text-green-400">
                💰 Total Cost: {formatCost(totalActualCost)}
                {hasFreeModels && totalPaidEquivalent > 0 && (
                  <span className="text-xs opacity-75 ml-1">
                    (would be {formatCost(totalPaidEquivalent)} on paid plan)
                  </span>
                )}
              </span>
            )}
            
            {/* Pricing Warning */}
            {!hasPricing && totalTokens > 0 && (
              <span className="font-medium text-yellow-600 dark:text-yellow-400">
                ⚠️ Some models lack pricing data
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
