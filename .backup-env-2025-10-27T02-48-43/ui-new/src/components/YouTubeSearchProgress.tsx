import React from 'react';

interface YouTubeSearchProgressData {
  type: 'youtube_search_progress';
  phase: 'searching' | 'results_found' | 'complete' | 'fetching_transcripts' | 'fetching_transcript' | 'transcript_fetched' | 'transcript_failed';
  query?: string;
  totalVideos?: number;
  currentVideo?: number;
  videoId?: string;
  transcriptLength?: number;
  error?: string;
  message?: string;
  successCount?: number;
  failedCount?: number;
  timestamp?: string;
}

interface YouTubeSearchProgressProps {
  data: YouTubeSearchProgressData;
}

export const YouTubeSearchProgress: React.FC<YouTubeSearchProgressProps> = ({ data }) => {
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
            🔍 Searching YouTube for: <span className="font-medium">{data.query}</span>
          </span>
        </div>
      );
    
    case 'results_found':
      return (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-gray-700 dark:text-gray-300">
            🎬 Found <span className="font-medium">{data.totalVideos} videos</span> for: {data.query}
          </span>
        </div>
      );
    
    case 'complete':
      return (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-gray-700 dark:text-gray-300">
            ✅ YouTube search complete - <span className="font-medium">{data.totalVideos} videos</span> added to playlist
          </span>
        </div>
      );
    
    case 'fetching_transcripts':
      return (
        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className="text-gray-700 dark:text-gray-300">
            🎬 {data.message || `Found ${data.totalVideos} videos, fetching transcripts...`}
          </span>
        </div>
      );
      
    case 'fetching_transcript':
      const progressPercent = data.totalVideos && data.currentVideo 
        ? Math.round((data.currentVideo / data.totalVideos) * 100)
        : 0;
      
      return (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
            </div>
            <div className="flex-1 text-gray-700 dark:text-gray-300">
              <div className="font-medium">
                📝 {data.message || `Fetching transcript ${data.currentVideo}/${data.totalVideos}`}
              </div>
              {data.videoId && (
                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  Video ID: {data.videoId}
                </div>
              )}
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-red-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
            {progressPercent}% complete
          </div>
        </div>
      );
      
    case 'transcript_fetched':
      return (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div className="flex-1 text-gray-700 dark:text-gray-300">
            <span className="font-medium">
              {data.message || 'Transcript fetched'}
            </span>
            {data.transcriptLength && (
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                ({data.transcriptLength.toLocaleString()} characters)
              </span>
            )}
          </div>
        </div>
      );
      
    case 'transcript_failed':
      return (
        <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 text-gray-700 dark:text-gray-300">
            <span className="font-medium">
              {data.message || 'Transcript unavailable'}
            </span>
            {data.error && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400">
                {data.error}
              </div>
            )}
          </div>
        </div>
      );
      
    default:
      return null;
  }
};

export type { YouTubeSearchProgressData };
