import React from 'react';

interface StorageStatsProps {
  totalSize: number;
  limit: number;
  percentUsed: number;
}

export const StorageStats: React.FC<StorageStatsProps> = ({ totalSize, limit, percentUsed }) => {
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getColorClass = () => {
    if (percentUsed < 50) return 'bg-green-500';
    if (percentUsed < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Storage Usage
      </h3>
      
      {/* Progress bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
        <div 
          className={`h-2.5 rounded-full transition-all duration-300 ${getColorClass()}`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        ></div>
      </div>
      
      {/* Stats */}
      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
        <span>{formatBytes(totalSize)} used</span>
        <span>{formatBytes(limit)} limit</span>
      </div>
      
      <div className="mt-1 text-xs text-center text-gray-500 dark:text-gray-400">
        {percentUsed.toFixed(1)}% used
      </div>

      {/* Warning message */}
      {percentUsed > 80 && (
        <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded text-xs text-yellow-800 dark:text-yellow-200">
          ⚠️ Storage is getting full. Consider deleting old snippets.
        </div>
      )}

      {percentUsed > 95 && (
        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded text-xs text-red-800 dark:text-red-200">
          🚨 Storage almost full! You may not be able to save new snippets.
        </div>
      )}
    </div>
  );
};
