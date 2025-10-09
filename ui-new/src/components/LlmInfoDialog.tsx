import React from 'react';
import { JsonTree } from './JsonTree';
import { useDialogClose } from '../hooks/useDialogClose';

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

interface LlmInfoDialogProps {
  apiCalls: LlmApiCall[];
  onClose: () => void;
}

export const LlmInfoDialog: React.FC<LlmInfoDialogProps> = ({ apiCalls, onClose }) => {
  const dialogRef = useDialogClose(true, onClose);

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

  const getProviderFromModel = (model: string, provider?: string): string => {
    // Use explicit provider if available
    if (provider) {
      return provider.charAt(0).toUpperCase() + provider.slice(1); // Capitalize first letter
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

  const getModelDisplay = (model: string): string => {
    // Remove provider prefix for cleaner display
    return model.replace(/^(openai:|groq:|anthropic:)/, '');
  };

  // Calculate total tokens
  const totalTokensIn = apiCalls.reduce((sum, call) => 
    sum + (call.response?.usage?.prompt_tokens || 0), 0);
  const totalTokensOut = apiCalls.reduce((sum, call) => 
    sum + (call.response?.usage?.completion_tokens || 0), 0);
  const totalTokens = apiCalls.reduce((sum, call) => 
    sum + (call.response?.usage?.total_tokens || 0), 0);

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
              {totalTokens > 0 && (
                <>
                  <span>•</span>
                  <span className="font-medium">Total: 📥 {totalTokensIn.toLocaleString()} in • 📤 {totalTokensOut.toLocaleString()} out • 📊 {totalTokens.toLocaleString()} total</span>
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
          {apiCalls.map((call, index) => {
            const tokensIn = call.response?.usage?.prompt_tokens || 0;
            const tokensOut = call.response?.usage?.completion_tokens || 0;
            const callTotal = call.response?.usage?.total_tokens || 0;
            
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
                  
                  {/* Response metadata with timing and token info */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                    {call.response ? (
                      <>
                        {tokensIn > 0 && <span className="font-medium">📥 {tokensIn.toLocaleString()} in</span>}
                        {tokensOut > 0 && <span className="font-medium">📤 {tokensOut.toLocaleString()} out</span>}
                        {callTotal > 0 && <span className="font-medium">📊 {callTotal.toLocaleString()} total</span>}
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
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        📤 Request Body
                      </h4>
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
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          📋 Response Headers
                        </h4>
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
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          📥 Response
                        </h4>
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
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {totalTokens > 0 && (
              <span className="font-medium">
                Total Tokens: 📥 {totalTokensIn.toLocaleString()} in • 📤 {totalTokensOut.toLocaleString()} out • 📊 {totalTokens.toLocaleString()} total
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
