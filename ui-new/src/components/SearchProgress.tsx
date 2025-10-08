import React from 'react';

interface SearchProgressData {
  phase: string;
  query?: string;
  queries?: string[];
  service?: string;
  result_count?: number;
  result_index?: number;
  result_total?: number;
  url?: string;
  title?: string;
  content_size?: number;
  fetch_time_ms?: number;
  error?: string;
  timestamp?: string;
}

interface SearchProgressProps {
  data: SearchProgressData;
}

export const SearchProgress: React.FC<SearchProgressProps> = ({ data }) => {
  // Render different UI based on phase
  switch (data.phase) {
    case 'searching':
      return (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className="text-gray-700 dark:text-gray-300">
            Searching {data.service === 'tavily' ? 'Tavily' : 'DuckDuckGo'}...
          </span>
        </div>
      );
      
    case 'results_found':
      return (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-gray-700 dark:text-gray-300">
            Found results for: {data.query}
          </span>
        </div>
      );
      
    case 'loading_content':
      return (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className="text-gray-700 dark:text-gray-300">
            Loading content from {data.result_count} results...
          </span>
        </div>
      );
      
    case 'fetching_result':
      return (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
          </div>
          <div className="flex-1 text-gray-700 dark:text-gray-300">
            <div className="font-medium">
              [{data.result_index}/{data.result_total}] {data.title}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {data.url}
            </div>
          </div>
        </div>
      );
      
    case 'result_loaded':
      return (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div className="flex-1 text-gray-700 dark:text-gray-300">
            <div className="font-medium">
              [{data.result_index}/{data.result_total}] {data.title}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Loaded {Math.round((data.content_size || 0) / 1024)}KB in {data.fetch_time_ms}ms
            </div>
          </div>
        </div>
      );
      
    case 'result_failed':
      return (
        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <div className="flex-1 text-gray-700 dark:text-gray-300">
            <div className="font-medium">
              [{data.result_index}/{data.result_total}] Failed: {data.title}
            </div>
            <div className="text-xs text-red-600 dark:text-red-400">
              {data.error}
            </div>
          </div>
        </div>
      );
      
    default:
      return null;
  }
};
