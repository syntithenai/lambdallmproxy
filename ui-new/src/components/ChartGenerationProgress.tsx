import React from 'react';

interface ChartGenerationProgressProps {
  data: {
    tool: string;
    phase: 'preparing' | 'completed';
    chart_type?: string;
    description?: string;
  };
}

export const ChartGenerationProgress: React.FC<ChartGenerationProgressProps> = ({ data }) => {
  if (data.phase === 'preparing') {
    return (
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-blue-700 dark:text-blue-300">
              Preparing {data.chart_type || 'chart'} diagram
            </div>
            {data.description && (
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {data.description}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  if (data.phase === 'completed') {
    return (
      <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-green-500">✓</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-green-700 dark:text-green-300">
              {data.chart_type || 'Chart'} diagram ready
            </div>
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              Diagram will appear below
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
};
