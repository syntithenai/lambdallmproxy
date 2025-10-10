import React from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { useToast } from './ToastManager';

interface JsonTreeProps {
  data: any;
  level?: number;
}

const JsonTree: React.FC<JsonTreeProps> = ({ data, level = 0 }) => {
  const [expanded, setExpanded] = React.useState(level < 2);
  
  if (data === null) return <span className="text-gray-500">null</span>;
  if (data === undefined) return <span className="text-gray-500">undefined</span>;
  
  if (typeof data !== 'object') {
    if (typeof data === 'string') {
      return <span className="text-green-600 dark:text-green-400">"{data}"</span>;
    }
    if (typeof data === 'number') {
      return <span className="text-blue-600 dark:text-blue-400">{data}</span>;
    }
    if (typeof data === 'boolean') {
      return <span className="text-purple-600 dark:text-purple-400">{String(data)}</span>;
    }
    return <span>{String(data)}</span>;
  }
  
  const isArray = Array.isArray(data);
  const keys = isArray ? data.map((_, i) => i) : Object.keys(data);
  
  if (keys.length === 0) {
    return <span className="text-gray-500">{isArray ? '[]' : '{}'}</span>;
  }
  
  return (
    <div className="ml-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        {expanded ? '▼' : '▶'} {isArray ? `Array[${keys.length}]` : `Object{${keys.length}}`}
      </button>
      {expanded && (
        <div className="ml-4 border-l border-gray-300 dark:border-gray-600 pl-2">
          {keys.map((key) => (
            <div key={String(key)} className="my-1">
              <span className="text-blue-700 dark:text-blue-300 font-mono">{String(key)}</span>
              <span className="text-gray-500">: </span>
              <JsonTree data={data[key]} level={level + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ErrorInfoDialogProps {
  errorData: any;
  onClose: () => void;
}

export const ErrorInfoDialog: React.FC<ErrorInfoDialogProps> = ({ errorData, onClose }) => {
  const dialogRef = useDialogClose(true, onClose);
  const { showSuccess, showError } = useToast();

  return (
    <div ref={dialogRef} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Error Details
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Error Message Summary */}
            {errorData?.message && (
              <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-2">Error Message</h3>
                <p className="text-red-700 dark:text-red-300 font-mono text-sm whitespace-pre-wrap">
                  {errorData.message}
                </p>
              </div>
            )}

            {/* Error Type/Code */}
            {(errorData?.type || errorData?.code || errorData?.statusCode) && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-orange-800 dark:text-orange-200 mb-2">Error Classification</h3>
                <div className="space-y-1 text-sm">
                  {errorData.type && (
                    <div>
                      <span className="text-orange-700 dark:text-orange-300 font-semibold">Type:</span>{' '}
                      <span className="text-orange-600 dark:text-orange-400 font-mono">{errorData.type}</span>
                    </div>
                  )}
                  {errorData.code && (
                    <div>
                      <span className="text-orange-700 dark:text-orange-300 font-semibold">Code:</span>{' '}
                      <span className="text-orange-600 dark:text-orange-400 font-mono">{errorData.code}</span>
                    </div>
                  )}
                  {errorData.statusCode && (
                    <div>
                      <span className="text-orange-700 dark:text-orange-300 font-semibold">Status Code:</span>{' '}
                      <span className="text-orange-600 dark:text-orange-400 font-mono">{errorData.statusCode}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stack Trace */}
            {errorData?.stack && (
              <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Stack Trace</h3>
                <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto">
                  {errorData.stack}
                </pre>
              </div>
            )}

            {/* Lambda Error Details */}
            {(errorData?.errorType || errorData?.errorMessage) && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-2">Lambda Error</h3>
                <div className="space-y-1 text-sm">
                  {errorData.errorType && (
                    <div>
                      <span className="text-purple-700 dark:text-purple-300 font-semibold">Error Type:</span>{' '}
                      <span className="text-purple-600 dark:text-purple-400 font-mono">{errorData.errorType}</span>
                    </div>
                  )}
                  {errorData.errorMessage && (
                    <div>
                      <span className="text-purple-700 dark:text-purple-300 font-semibold">Error Message:</span>{' '}
                      <span className="text-purple-600 dark:text-purple-400 font-mono">{errorData.errorMessage}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LLM Provider Error Details */}
            {(errorData?.error?.message || errorData?.error?.type || errorData?.error?.code) && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                  Upstream LLM Provider Error
                </h3>
                <div className="space-y-1 text-sm">
                  {errorData.error.message && (
                    <div>
                      <span className="text-yellow-700 dark:text-yellow-300 font-semibold">Message:</span>{' '}
                      <span className="text-yellow-600 dark:text-yellow-400 font-mono">{errorData.error.message}</span>
                    </div>
                  )}
                  {errorData.error.type && (
                    <div>
                      <span className="text-yellow-700 dark:text-yellow-300 font-semibold">Type:</span>{' '}
                      <span className="text-yellow-600 dark:text-yellow-400 font-mono">{errorData.error.type}</span>
                    </div>
                  )}
                  {errorData.error.code && (
                    <div>
                      <span className="text-yellow-700 dark:text-yellow-300 font-semibold">Code:</span>{' '}
                      <span className="text-yellow-600 dark:text-yellow-400 font-mono">{errorData.error.code}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Request Context */}
            {(errorData?.request || errorData?.requestId || errorData?.timestamp) && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">Request Context</h3>
                <div className="space-y-1 text-sm">
                  {errorData.requestId && (
                    <div>
                      <span className="text-blue-700 dark:text-blue-300 font-semibold">Request ID:</span>{' '}
                      <span className="text-blue-600 dark:text-blue-400 font-mono">{errorData.requestId}</span>
                    </div>
                  )}
                  {errorData.timestamp && (
                    <div>
                      <span className="text-blue-700 dark:text-blue-300 font-semibold">Timestamp:</span>{' '}
                      <span className="text-blue-600 dark:text-blue-400 font-mono">
                        {new Date(errorData.timestamp).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {errorData.request && (
                    <div className="mt-2">
                      <span className="text-blue-700 dark:text-blue-300 font-semibold">Request Data:</span>
                      <div className="mt-1 bg-white dark:bg-gray-800 rounded p-2 max-h-48 overflow-auto">
                        <JsonTree data={errorData.request} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Full Error JSON */}
            <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center justify-between">
                <span>Complete Error Object (Expandable Tree)</span>
                <button
                  onClick={() => {
                    const jsonStr = JSON.stringify(errorData, null, 2);
                    navigator.clipboard.writeText(jsonStr)
                      .then(() => showSuccess('Copied to clipboard!'))
                      .catch(() => showError('Failed to copy'));
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 flex items-center gap-1"
                  title="Copy full JSON to clipboard"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy JSON
                </button>
              </h3>
              <div className="bg-white dark:bg-gray-800 rounded p-3 max-h-96 overflow-auto font-mono text-xs">
                <JsonTree data={errorData} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              const jsonStr = JSON.stringify(errorData, null, 2);
              navigator.clipboard.writeText(jsonStr)
                .then(() => showSuccess('Copied to clipboard!'))
                .catch(() => showError('Failed to copy'));
            }}
            className="btn-secondary"
          >
            Copy Full JSON
          </button>
          <button
            onClick={onClose}
            className="btn-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
