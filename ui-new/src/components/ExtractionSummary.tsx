import React from 'react';

interface ExtractionSummaryProps {
  data: {
    phase: string;
    url?: string;
    title?: string;
    format?: string;
    originalLength?: number;
    extractedLength?: number;
    compressionRatio?: number;
    images?: number;
    videos?: number;
    youtube?: number;
    links?: number;
    language?: string;
    duration?: number;
    textLength?: number;
    wordCount?: number;
    warning?: string;
  };
}

export const ExtractionSummary: React.FC<ExtractionSummaryProps> = ({ data }) => {
  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm space-y-2">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-medium text-green-700 dark:text-green-300">
          Content Extracted
        </span>
      </div>
      
      {data.title && (
        <div className="text-gray-700 dark:text-gray-300 font-medium truncate">
          {data.title}
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Format & Compression */}
        {data.format && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Format:</span>{' '}
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {data.format === 'markdown' ? '📝 Markdown' : '📄 Plain Text'}
            </span>
          </div>
        )}
        
        {data.compressionRatio != null && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Compression:</span>{' '}
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {Number(data.compressionRatio).toFixed(1)}x
            </span>
          </div>
        )}
        
        {/* Size */}
        {data.originalLength !== undefined && data.extractedLength !== undefined && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Size:</span>{' '}
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {(data.originalLength / 1024).toFixed(1)}KB → {(data.extractedLength / 1024).toFixed(1)}KB
            </span>
          </div>
        )}
        
        {/* Word count for transcripts */}
        {data.wordCount !== undefined && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Words:</span>{' '}
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {data.wordCount.toLocaleString()}
            </span>
          </div>
        )}
        
        {/* Language */}
        {data.language && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Language:</span>{' '}
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {data.language}
            </span>
          </div>
        )}
        
        {/* Duration for transcripts */}
        {data.duration !== undefined && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Duration:</span>{' '}
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {Math.floor(data.duration / 60)}:{(data.duration % 60).toString().padStart(2, '0')}
            </span>
          </div>
        )}
      </div>
      
      {/* Media counts */}
      {(data.images || data.videos || data.youtube || data.links) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {(data.images ?? 0) > 0 && (
            <span className="text-gray-600 dark:text-gray-400">
              🖼️ {data.images} {data.images === 1 ? 'image' : 'images'}
            </span>
          )}
          {(data.videos ?? 0) > 0 && (
            <span className="text-gray-600 dark:text-gray-400">
              🎥 {data.videos} {data.videos === 1 ? 'video' : 'videos'}
            </span>
          )}
          {(data.youtube ?? 0) > 0 && (
            <span className="text-gray-600 dark:text-gray-400">
              📺 {data.youtube} YouTube {data.youtube === 1 ? 'video' : 'videos'}
            </span>
          )}
          {(data.links ?? 0) > 0 && (
            <span className="text-gray-600 dark:text-gray-400">
              🔗 {data.links} {data.links === 1 ? 'link' : 'links'}
            </span>
          )}
        </div>
      )}
      
      {/* Warning */}
      {data.warning && (
        <div className="text-yellow-600 dark:text-yellow-400 text-xs">
          ⚠️ {data.warning}
        </div>
      )}
    </div>
  );
};
