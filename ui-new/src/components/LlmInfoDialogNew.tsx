import React, { useState } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { formatCost } from '../utils/pricing';
import { JsonTreeViewer } from './JsonTreeViewer';

interface LlmApiCall {
  phase: string;
  provider?: string;
  model: string;
  request: any;
  response?: any;
  httpHeaders?: any;
  httpStatus?: number;
  timestamp: string;
  type?: string;
  cost?: number;
  durationMs?: number;
  metadata?: any;
  success?: boolean;
}

interface Evaluation {
  attempt: number;
  comprehensive: boolean;
  reason: string;
}

interface LlmInfoDialogProps {
  apiCalls: LlmApiCall[];
  evaluations?: Evaluation[];
  onClose: () => void;
}

// JSON Tree Component with Full Screen Modal - Opens full screen immediately for arrays/objects
const JsonTree: React.FC<{ data: any; title: string }> = ({ data, title }) => {
  const [copied, setCopied] = useState(false);
  const [showFullScreen, setShowFullScreen] = useState(false);

  // Recursively ensure all JSON is fully parsed (no stringified JSON within JSON)
  const deepParseJSON = (obj: any): any => {
    if (typeof obj === 'string') {
      try {
        // Try to parse as JSON
        const parsed = JSON.parse(obj);
        // Recursively parse the result
        return deepParseJSON(parsed);
      } catch {
        // Not JSON, return as-is
        return obj;
      }
    } else if (Array.isArray(obj)) {
      return obj.map(item => deepParseJSON(item));
    } else if (obj !== null && typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        result[key] = deepParseJSON(obj[key]);
      }
      return result;
    }
    return obj;
  };

  const fullyParsedData = deepParseJSON(data);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(fullyParsedData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Open full screen immediately when clicking the section
  const handleSectionClick = () => {
    setShowFullScreen(true);
  };

  return (
    <>
      <div className="mt-3">
        <button
          onClick={handleSectionClick}
          className="flex items-center justify-between w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <span className="font-medium text-gray-700 dark:text-gray-300">{title}</span>
          <span className="text-purple-600 dark:text-purple-400 text-sm font-medium">
            🔍 Click to View
          </span>
        </button>
      </div>

      {/* Full Screen Modal */}
      {showFullScreen && (
        <div 
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowFullScreen(false)}
        >
          <div 
            className="bg-white dark:bg-gray-900 rounded-xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  {copied ? '✓ Copied!' : '📋 Copy All'}
                </button>
                <button
                  onClick={() => setShowFullScreen(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            
            {/* Modal Body - Scrollable JSON Tree */}
            <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-gray-950">
              <JsonTreeViewer data={fullyParsedData} defaultExpanded={true} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Call Type Info Helper
function getCallTypeInfo(call: LlmApiCall) {
  switch (call.type) {
    case 'guardrail_input':
      return { label: 'Guardrail Input', color: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-300 dark:border-yellow-700', text: 'text-yellow-700 dark:text-yellow-300', icon: '🛡️' };
    case 'guardrail_output':
      return { label: 'Guardrail Output', color: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-300 dark:border-yellow-700', text: 'text-yellow-700 dark:text-yellow-300', icon: '🛡️' };
    case 'image_generation':
      return { label: 'Image Generation', color: 'bg-pink-50 dark:bg-pink-900/20', border: 'border-pink-300 dark:border-pink-700', text: 'text-pink-700 dark:text-pink-300', icon: '🖼️' };
    case 'transcription':
      return { label: 'Whisper Transcription', color: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-300 dark:border-purple-700', text: 'text-purple-700 dark:text-purple-300', icon: '🎤' };
    case 'embedding':
      return { label: 'Embedding', color: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-300 dark:border-indigo-700', text: 'text-indigo-700 dark:text-indigo-300', icon: '🧩' };
    case 'planning':
      return { label: 'Planning', color: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-700 dark:text-blue-300', icon: '📝' };
    case 'assessment':
      return { label: 'Self-Assessment', color: 'bg-teal-50 dark:bg-teal-900/20', border: 'border-teal-300 dark:border-teal-700', text: 'text-teal-700 dark:text-teal-300', icon: '🔍' };
    default:
      return { label: 'Chat', color: 'bg-gray-50 dark:bg-gray-900/20', border: 'border-gray-300 dark:border-gray-700', text: 'text-gray-700 dark:text-gray-300', icon: '💬' };
  }
}

// API Call Card Component
const ApiCallCard: React.FC<{ call: LlmApiCall; index: number }> = ({ call, index }) => {
  const callTypeInfo = getCallTypeInfo(call);
  
  // Extract token counts from response
  const promptTokens = call.response?.usage?.prompt_tokens || 0;
  const completionTokens = call.response?.usage?.completion_tokens || 0;
  const totalTokens = call.response?.usage?.total_tokens || promptTokens + completionTokens;
  
  // Calculate cost if not provided
  const cost = call.cost ?? 0;
  
  return (
    <div className={`border-2 ${callTypeInfo.border} ${callTypeInfo.color} rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{callTypeInfo.icon}</span>
          <div>
            <h3 className={`font-bold text-lg ${callTypeInfo.text}`}>{callTypeInfo.label}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {call.provider} • {call.model}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${cost > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {formatCost(cost)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            #{index + 1}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">Prompt Tokens</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{promptTokens.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">Completion Tokens</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{completionTokens.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">Total Tokens</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">Duration</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {call.durationMs ? `${(call.durationMs / 1000).toFixed(2)}s` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Status & Timestamp */}
      <div className="flex items-center justify-between mb-4 text-sm">
        <div className="flex items-center gap-2">
          {call.success !== undefined && (
            <span className={`px-2 py-1 rounded-full ${call.success ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
              {call.success ? '✅ Success' : '❌ Failed'}
            </span>
          )}
          {call.httpStatus && (
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              HTTP {call.httpStatus}
            </span>
          )}
        </div>
        <div className="text-gray-500 dark:text-gray-400">
          {new Date(call.timestamp).toLocaleString()}
        </div>
      </div>

      {/* Expandable JSON Sections */}
      <div className="space-y-2">
        {call.request && <JsonTree data={call.request} title="📤 Request Body" />}
        {call.response && <JsonTree data={call.response} title="📥 Response Body" />}
        {call.httpHeaders && <JsonTree data={call.httpHeaders} title="🔖 HTTP Headers" />}
        {call.metadata && <JsonTree data={call.metadata} title="ℹ️ Metadata" />}
      </div>
    </div>
  );
};

export const LlmInfoDialog: React.FC<LlmInfoDialogProps> = ({ apiCalls, onClose }) => {
  const dialogRef = useDialogClose(true, onClose);

  // Calculate totals
  const totalPromptTokens = apiCalls.reduce((sum, call) => 
    sum + (call.response?.usage?.prompt_tokens || 0), 0
  );
  const totalCompletionTokens = apiCalls.reduce((sum, call) => 
    sum + (call.response?.usage?.completion_tokens || 0), 0
  );
  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const totalCost = apiCalls.reduce((sum, call) => sum + (call.cost || 0), 0);
  const totalDuration = apiCalls.reduce((sum, call) => sum + (call.durationMs || 0), 0);

  return (
    <div 
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              🔍 LLM API Transparency
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {apiCalls.length} API call{apiCalls.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {apiCalls.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No API calls found.
            </div>
          ) : (
            apiCalls.map((call, idx) => (
              <ApiCallCard key={idx} call={call} index={idx} />
            ))
          )}
        </div>

        {/* Footer with Totals */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">📊 Grand Totals</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Prompt Tokens</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {totalPromptTokens.toLocaleString()}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Completion Tokens</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {totalCompletionTokens.toLocaleString()}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Tokens</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {totalTokens.toLocaleString()}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Duration</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {(totalDuration / 1000).toFixed(2)}s
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-green-200 dark:border-green-700 bg-gradient-to-br from-green-50 to-white dark:from-green-900/20 dark:to-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Cost</div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {formatCost(totalCost)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
