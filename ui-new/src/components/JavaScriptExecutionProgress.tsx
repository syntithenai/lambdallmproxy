import React from 'react';

interface JavaScriptExecutionProgressData {
  phase: string;
  output?: string;
  code_length?: number;
  timeout_ms?: number;
  output_lines?: number;
  output_number?: number;
  has_result?: boolean;
  error?: string;
  timestamp?: string;
}

interface JavaScriptExecutionProgressProps {
  data: JavaScriptExecutionProgressData;
}

export const JavaScriptExecutionProgress: React.FC<JavaScriptExecutionProgressProps> = ({ data }) => {
  switch (data.phase) {
    case 'starting':
      return (
        <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className="text-gray-700 dark:text-gray-300">
            💻 Starting JavaScript execution ({data.code_length} characters, {(data.timeout_ms || 0) / 1000}s timeout)...
          </span>
        </div>
      );
      
    case 'executing':
      return (
        <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-gray-700 dark:text-gray-300">
            💻 Executing JavaScript code...
          </span>
        </div>
      );
      
    case 'console_output':
      return (
        <div className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded text-sm font-mono border-l-4 border-purple-500">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Console Output #{data.output_number}:</span>
          </div>
          <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {data.output}
          </div>
        </div>
      );
      
    case 'completed':
      return (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-gray-700 dark:text-gray-300">
            ✅ Execution completed
            {data.output_lines !== undefined && data.output_lines > 0 && (
              <span className="ml-1">({data.output_lines} console output{data.output_lines !== 1 ? 's' : ''})</span>
            )}
            {data.has_result && !data.output_lines && (
              <span className="ml-1">(returned value)</span>
            )}
          </span>
        </div>
      );
      
    case 'error':
      return (
        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <div className="flex-1">
            <div className="font-medium text-red-700 dark:text-red-300">❌ Execution Error</div>
            <div className="text-xs text-red-600 dark:text-red-400 font-mono mt-1">{data.error}</div>
          </div>
        </div>
      );
      
    default:
      return null;
  }
};
