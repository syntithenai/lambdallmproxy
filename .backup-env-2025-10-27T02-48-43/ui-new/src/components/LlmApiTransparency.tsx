import React, { useState } from 'react';
import { JsonTree } from './JsonTree';
import { formatCost, getCostBreakdown, calculateDualPricing } from '../utils/pricing';

interface LlmApiCall {
  phase: string;
  provider?: string;
  model: string;
  request: any;
  response?: any;
  httpHeaders?: any;
  httpStatus?: number;
  timestamp: string;
}

interface LlmApiTransparencyProps {
  apiCalls: LlmApiCall[];
}

export const LlmApiTransparency: React.FC<LlmApiTransparencyProps> = ({ apiCalls }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [fullScreenCall, setFullScreenCall] = useState<number | null>(null);
  const [expandedHeaders, setExpandedHeaders] = useState<Set<number>>(new Set());

  if (apiCalls.length === 0) {
    return null;
  }

  const toggleHeaders = (index: number) => {
    setExpandedHeaders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
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
      case 'self_evaluation':
        return '🔍 Self-Evaluation';
      case 'chat_iteration':
        return '💬 Chat Iteration';
      default:
        return phase;
    }
  };

  const getProviderFromModel = (model: string | undefined, provider?: string): string => {
    // Use explicit provider if available
    if (provider) {
      return provider.charAt(0).toUpperCase() + provider.slice(1); // Capitalize first letter
    }
    
    // Handle missing model
    if (!model) {
      return 'Unknown';
    }
    
    // Fall back to model name detection
    if (model.startsWith('gpt-') || model.startsWith('o1-')) {
      return 'OpenAI';
    }
    if (model.includes('claude')) {
      return 'Anthropic';
    }
    if (model.includes('llama') || model.includes('mixtral') || model.includes('gemma')) {
      return 'Groq';
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

  return (
    <div className="mt-4 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 
                   flex items-center justify-between text-left transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            🔍 LLM Calls
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({apiCalls.length} call{apiCalls.length !== 1 ? 's' : ''})
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Click to {isExpanded ? 'collapse' : 'expand'}
        </span>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-3 bg-white dark:bg-gray-900">
          
          {/* Guardrail Calls Section (if any) */}
          {(() => {
            const guardrailCalls = apiCalls.filter((call: any) => 
              call.type === 'guardrail_input' || call.type === 'guardrail_output'
            );
            
            if (guardrailCalls.length > 0) {
              return (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                  <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                    🛡️ Content Moderation ({guardrailCalls.length})
                  </h4>
                  {guardrailCalls.map((call: any, idx: number) => {
                    const tokensIn = call.response?.usage?.prompt_tokens || 0;
                    const tokensOut = call.response?.usage?.completion_tokens || 0;
                    const totalTokens = tokensIn + tokensOut;
                    const pricing = calculateDualPricing(call.model, tokensIn, tokensOut);
                    const duration = call.totalTime || 0;
                    
                    return (
                      <div key={idx} className="text-xs text-yellow-700 dark:text-yellow-300 mb-1 flex items-center gap-2">
                        <span>{call.type === 'guardrail_input' ? '📥 Input Filter' : '📤 Output Filter'}:</span>
                        <span className="font-mono">{call.model}</span>
                        <span>•</span>
                        <span>{totalTokens.toLocaleString()} tokens</span>
                        {pricing.actualCost !== null && (
                          <>
                            <span>•</span>
                            <span className="font-semibold">{pricing.formattedActual}</span>
                          </>
                        )}
                        {duration > 0 && (
                          <>
                            <span>•</span>
                            <span>⏱️ {duration.toFixed(2)}s</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }
            return null;
          })()}

          {apiCalls.filter((call: any) => 
            call.type !== 'guardrail_input' && call.type !== 'guardrail_output'
          ).map((call, index) => {
            const headersExpanded = expandedHeaders.has(index);
            const tokensIn = call.response?.usage?.prompt_tokens || 0;
            const tokensOut = call.response?.usage?.completion_tokens || 0;
            const totalTokens = call.response?.usage?.total_tokens || 0;
            
            // Extract timing information
            const queueTime = call.response?.usage?.queue_time;
            const promptTime = call.response?.usage?.prompt_time;
            const completionTime = call.response?.usage?.completion_time;
            const totalTime = call.response?.usage?.total_time;
            
            // Use HTTP headers from the separate field (sent by backend)
            const responseHeaders = call.httpHeaders || null;
            
            // Debug logging
            console.log('🔍 LLM API Call Debug:', {
              index,
              phase: call.phase,
              model: call.model,
              hasResponse: !!call.response,
              hasHttpHeaders: !!call.httpHeaders,
              httpHeaders: call.httpHeaders,
              httpStatus: call.httpStatus,
              responseHeaders
            });
            
            return (
              <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {/* Non-collapsible header */}
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {formatPhase(call.phase)}
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
                  
                  {/* Response metadata with timing, tokens, and cost info */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                    {call.response ? (
                      <>
                        {/* Cost Information - Dual Pricing */}
                        {(() => {
                          const pricing = calculateDualPricing(call.model, tokensIn, tokensOut);
                          const breakdown = getCostBreakdown(call.model, tokensIn, tokensOut);
                          
                          if (breakdown.hasPricing) {
                            if (pricing.isFree && pricing.paidEquivalentCost !== null) {
                              // Free tier model: show $0 + paid equivalent
                              return (
                                <span className="font-semibold text-green-600 dark:text-green-400" title={`Free tier model • Input: ${formatCost(breakdown.inputCost)} • Output: ${formatCost(breakdown.outputCost)}`}>
                                  💰 {pricing.formattedActual} <span className="text-xs opacity-75">(would be {pricing.formattedPaidEquivalent} on paid plan)</span>
                                </span>
                              );
                            } else if (pricing.actualCost !== null) {
                              // Paid model: show actual cost
                              return (
                                <span className="font-semibold text-green-600 dark:text-green-400" title={`Input: ${formatCost(breakdown.inputCost)} • Output: ${formatCost(breakdown.outputCost)}`}>
                                  💰 {pricing.formattedActual}
                                </span>
                              );
                            }
                          }
                          return null;
                        })()}
                        
                        {/* Token counts - ALWAYS show in/out/total for all models */}
                        {tokensIn > 0 && <span className="text-xs opacity-75">📥 {tokensIn.toLocaleString()} in</span>}
                        {tokensOut > 0 && <span className="text-xs opacity-75">📤 {tokensOut.toLocaleString()} out</span>}
                        {totalTokens > 0 && <span className="text-xs opacity-75">📊 {totalTokens.toLocaleString()} total</span>}
                        
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
                </div>

                {/* Always visible content */}
                <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                  <div className="space-y-4">

                    {/* Full Request Body */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          📤 Request Body
                        </h4>
                        <button
                          onClick={() => setFullScreenCall(index)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          🔍 View Full Screen
                        </button>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">
                        <div className="text-xs font-mono">
                          <JsonTree 
                            data={parseJsonStrings(call.request)} 
                            expanded={true}
                            expandPaths={['messages']}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Response Headers (above response) - Always show if there's a response */}
                    {call.response && (
                      <div>
                        <button
                          onClick={() => toggleHeaders(index)}
                          className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 mb-2"
                        >
                          <span>{headersExpanded ? '▼' : '▶'}</span>
                          <span>📋 Response Headers</span>
                          {!responseHeaders && (
                            <span className="text-xs text-yellow-600 dark:text-yellow-400">(not available)</span>
                          )}
                        </button>
                        {headersExpanded && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800 mb-4 max-h-96 overflow-y-auto">
                            <div className="text-xs font-mono">
                              {responseHeaders ? (
                                <JsonTree data={responseHeaders} expanded={true} />
                              ) : (
                                <div className="text-yellow-600 dark:text-yellow-400">
                                  <p className="mb-2">⚠️ HTTP headers not available</p>
                                  <p className="text-xs">Debug info:</p>
                                  <pre className="mt-1 text-xs">{JSON.stringify({
                                    hasHttpHeaders: !!call.httpHeaders,
                                    hasHttpStatus: !!call.httpStatus,
                                    httpHeadersType: typeof call.httpHeaders,
                                    httpHeadersValue: call.httpHeaders
                                  }, null, 2)}</pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Response Details */}
                    {call.response && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            📥 Response
                          </h4>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-200 dark:border-green-800 max-h-96 overflow-y-auto">
                          <div className="text-xs font-mono">
                            <JsonTree 
                              data={parseJsonStrings(call.response)} 
                              expandAll={true}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                      ⏰ {new Date(call.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Summary Totals Footer */}
          {apiCalls.length > 1 && (
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border-2 border-blue-200 dark:border-blue-700">
              <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <span>📊</span>
                <span>TOTAL SUMMARY</span>
                <span className="text-sm font-normal opacity-75">({apiCalls.length} API {apiCalls.length === 1 ? 'Call' : 'Calls'})</span>
              </h4>
              {(() => {
                // Calculate totals
                let totalTokensIn = 0;
                let totalTokensOut = 0;
                let totalTokensAll = 0;
                let totalActualCost = 0;
                let totalPaidEquivalentCost = 0;
                let totalDuration = 0;
                let hasFreeModels = false;
                
                apiCalls.forEach(call => {
                  const tokensIn = call.response?.usage?.prompt_tokens || 0;
                  const tokensOut = call.response?.usage?.completion_tokens || 0;
                  const tokens = call.response?.usage?.total_tokens || 0;
                  const duration = call.response?.usage?.total_time || 0;
                  
                  totalTokensIn += tokensIn;
                  totalTokensOut += tokensOut;
                  totalTokensAll += tokens;
                  totalDuration += duration;
                  
                  const pricing = calculateDualPricing(call.model, tokensIn, tokensOut);
                  if (pricing.isFree) {
                    hasFreeModels = true;
                    totalPaidEquivalentCost += pricing.paidEquivalentCost || 0;
                  } else {
                    totalActualCost += pricing.actualCost || 0;
                  }
                });
                
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Tokens Column */}
                    <div className="space-y-1">
                      <div className="font-semibold text-gray-700 dark:text-gray-300">Token Usage</div>
                      <div className="text-sm">📥 {totalTokensIn.toLocaleString()} in</div>
                      <div className="text-sm">📤 {totalTokensOut.toLocaleString()} out</div>
                      <div className="text-sm font-bold">📊 {totalTokensAll.toLocaleString()} total</div>
                    </div>
                    
                    {/* Cost Column */}
                    <div className="space-y-1">
                      <div className="font-semibold text-gray-700 dark:text-gray-300">Cost</div>
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        💰 {formatCost(totalActualCost)}
                      </div>
                      {hasFreeModels && totalPaidEquivalentCost > 0 && (
                        <div className="text-xs opacity-75">
                          (would be {formatCost(totalPaidEquivalentCost)} on paid plan)
                        </div>
                      )}
                    </div>
                    
                    {/* Duration Column */}
                    <div className="space-y-1">
                      <div className="font-semibold text-gray-700 dark:text-gray-300">Duration</div>
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        ⏱️ {totalDuration.toFixed(2)}s
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Full Screen Dialog */}
      {fullScreenCall !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
            {/* Dialog Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatPhase(apiCalls[fullScreenCall].phase)} - Full Request Details
                </h3>
                <div className="flex gap-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
                  <span>Provider: {getProviderFromModel(apiCalls[fullScreenCall].model, apiCalls[fullScreenCall].provider)}</span>
                  <span>Model: {getModelDisplay(apiCalls[fullScreenCall].model)}</span>
                </div>
              </div>
              <button
                onClick={() => setFullScreenCall(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Dialog Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Request */}
              <div>
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  📤 Request Body
                </h4>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border border-gray-200 dark:border-gray-700">
                  <div className="text-sm font-mono">
                    <JsonTree 
                      data={parseJsonStrings(apiCalls[fullScreenCall].request)} 
                      expanded={true}
                      expandPaths={['messages']}
                    />
                  </div>
                </div>
              </div>

              {/* Response */}
              {apiCalls[fullScreenCall].response && (
                <div>
                  <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    📥 Response
                  </h4>
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded border border-green-200 dark:border-green-800">
                    <div className="text-sm font-mono">
                      <JsonTree 
                        data={parseJsonStrings(apiCalls[fullScreenCall].response)} 
                        expandAll={true}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div className="text-sm text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                ⏰ {new Date(apiCalls[fullScreenCall].timestamp).toLocaleString()}
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setFullScreenCall(null)}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
