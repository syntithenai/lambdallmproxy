import React from 'react';
import { formatCost } from '../utils/pricing';

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

interface LlmApiCallCardProps {
  call: LlmApiCall;
}

export const LlmApiCallCard: React.FC<LlmApiCallCardProps> = ({ call }) => {
  const [showRequest, setShowRequest] = React.useState(false);
  const [showResponse, setShowResponse] = React.useState(false);
  
  // Helper to get display label and color for call type
  function getCallTypeInfo(call: LlmApiCall) {
    switch (call.type) {
      case 'guardrail_input':
        return { label: 'Guardrail Input', color: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-400', text: 'text-yellow-700 dark:text-yellow-300', icon: '🛡️' };
      case 'guardrail_output':
        return { label: 'Guardrail Output', color: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-400', text: 'text-yellow-700 dark:text-yellow-300', icon: '🛡️' };
      case 'image_generation':
        return { label: 'Image Generation', color: 'bg-pink-100 dark:bg-pink-900/30', border: 'border-pink-400', text: 'text-pink-700 dark:text-pink-300', icon: '🖼️' };
      case 'planning':
        return { label: 'Planning', color: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-400', text: 'text-blue-700 dark:text-blue-300', icon: '📝' };
      case 'embedding':
        return { label: 'Embedding', color: 'bg-indigo-100 dark:bg-indigo-900/30', border: 'border-indigo-400', text: 'text-indigo-700 dark:text-indigo-300', icon: '🧩' };
      default:
        return { label: 'Chat', color: 'bg-gray-100 dark:bg-gray-900/30', border: 'border-gray-400', text: 'text-gray-700 dark:text-gray-300', icon: '💬' };
    }
  }

  const callTypeInfo = getCallTypeInfo(call);

  return (
    <div className={`border rounded-lg p-4 mb-2 ${callTypeInfo.color} ${callTypeInfo.border || ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`font-semibold ${callTypeInfo.text}`}>{callTypeInfo.icon} {callTypeInfo.label}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{call.provider} • {call.model}</span>
      </div>
      <div className="mb-2">
        <span className="font-mono text-sm">Timestamp: {new Date(call.timestamp).toLocaleString()}</span>
      </div>
      <div className="mb-2">
        {call.cost !== undefined && (
          <span className="font-semibold text-pink-700 dark:text-pink-300">💰 {formatCost(call.cost)}</span>
        )}
        {call.durationMs && (
          <span className="ml-2">⏱️ {(call.durationMs / 1000).toFixed(2)}s</span>
        )}
        {call.success !== undefined && (
          <span className={call.success ? 'text-green-600 dark:text-green-400 ml-2' : 'text-red-600 dark:text-red-400 ml-2'}>
            {call.success ? '✅ Success' : '❌ Failed'}
          </span>
        )}
      </div>
      
      {/* Expandable Request Data */}
      {call.request && (
        <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
          <button
            onClick={() => setShowRequest(!showRequest)}
            className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
          >
            <span className="font-mono text-sm text-gray-700 dark:text-gray-300">📤 Request Data</span>
            <svg 
              className={`w-4 h-4 transition-transform ${showRequest ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showRequest && (
            <pre className="p-3 text-xs overflow-auto max-h-96 bg-white dark:bg-gray-900 font-mono text-gray-800 dark:text-gray-200">
              {JSON.stringify(call.request, null, 2)}
            </pre>
          )}
        </div>
      )}
      
      {/* Expandable Response Data */}
      {call.response && (
        <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
          <button
            onClick={() => setShowResponse(!showResponse)}
            className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
          >
            <span className="font-mono text-sm text-gray-700 dark:text-gray-300">📥 Response Data</span>
            <svg 
              className={`w-4 h-4 transition-transform ${showResponse ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showResponse && (
            <pre className="p-3 text-xs overflow-auto max-h-96 bg-white dark:bg-gray-900 font-mono text-gray-800 dark:text-gray-200">
              {JSON.stringify(call.response, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
