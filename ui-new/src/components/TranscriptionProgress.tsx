import React, { useState, useMemo } from 'react';

// Event types from backend progress-emitter.js
export const TranscriptionEventType = {
  YOUTUBE_DOWNLOAD_START: 'youtube_download_start',
  YOUTUBE_DOWNLOAD_PROGRESS: 'youtube_download_progress',
  YOUTUBE_DOWNLOAD_COMPLETE: 'youtube_download_complete',
  DOWNLOAD_START: 'download_start',
  DOWNLOAD_PROGRESS: 'download_progress',
  DOWNLOAD_COMPLETE: 'download_complete',
  METADATA: 'metadata',
  CHUNKING_START: 'chunking_start',
  CHUNK_READY: 'chunk_ready',
  TRANSCRIBE_START: 'transcribe_start',
  TRANSCRIBE_CHUNK_COMPLETE: 'transcribe_chunk_complete',
  TRANSCRIBE_COMPLETE: 'transcribe_complete',
  TRANSCRIPTION_STOPPED: 'transcription_stopped',
  ERROR: 'error'
} as const;

export type TranscriptionEventType = typeof TranscriptionEventType[keyof typeof TranscriptionEventType];

// Progress event structure from backend
export interface ProgressEvent {
  tool_call_id: string;
  tool_name: string;
  progress_type: string;  // Event type from backend (e.g., 'download_start', 'transcribe_chunk_complete')
  data?: {
    type?: string;  // Also in data.type for compatibility
    percent?: number;
    size?: number;
    fileSize?: number;
    chunks?: number;
    totalChunks?: number;
    chunkIndex?: number;
    text?: string;
    title?: string;
    author?: string;
    duration?: number;
    thumbnail?: string;
    textLength?: number;
    completedChunks?: number;
    error?: string;
    linkCount?: number;
    imageCount?: number;
    totalTime?: number;
  };
  timestamp?: string;
}

interface TranscriptionProgressProps {
  toolCallId: string;
  url: string;
  events: ProgressEvent[];
  onStop: (toolCallId: string) => void;
}

// Stage definitions
const TranscriptionStage = {
  DOWNLOADING: 'Downloading',
  CHUNKING: 'Chunking',
  TRANSCRIBING: 'Transcribing',
  COMPLETE: 'Complete',
  STOPPED: 'Stopped',
  ERROR: 'Error'
} as const;

type TranscriptionStage = typeof TranscriptionStage[keyof typeof TranscriptionStage];

export const TranscriptionProgress: React.FC<TranscriptionProgressProps> = ({
  toolCallId,
  url,
  events,
  onStop
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Calculate current stage and progress
  const status = useMemo(() => {
    let stage: TranscriptionStage = TranscriptionStage.DOWNLOADING;
    let progress = 0;
    let metadata: ProgressEvent['data'] | null = null;
    let partialText = '';
    let currentChunk = 0;
    let totalChunks = 1;
    let error: string | null = null;

    // Debug logging
    if (events.length > 0) {
      console.log(`[TranscriptionProgress] Processing ${events.length} events for ${toolCallId}:`, 
        events.map(e => ({ type: e.progress_type || e.data?.type, data: e.data }))
      );
    }

    for (const event of events) {
      const eventType = event.progress_type || event.data?.type || '';
      switch (eventType) {
        case TranscriptionEventType.YOUTUBE_DOWNLOAD_START:
        case TranscriptionEventType.DOWNLOAD_START:
          stage = TranscriptionStage.DOWNLOADING;
          progress = 0;
          break;

        case TranscriptionEventType.YOUTUBE_DOWNLOAD_PROGRESS:
        case TranscriptionEventType.DOWNLOAD_PROGRESS:
          stage = TranscriptionStage.DOWNLOADING;
          progress = event.data?.percent || 0;
          break;

        case TranscriptionEventType.YOUTUBE_DOWNLOAD_COMPLETE:
        case TranscriptionEventType.DOWNLOAD_COMPLETE:
          stage = TranscriptionStage.DOWNLOADING;
          progress = 100;
          break;

        case TranscriptionEventType.METADATA:
          metadata = event.data || null;
          break;

        case TranscriptionEventType.CHUNKING_START:
          stage = TranscriptionStage.CHUNKING;
          totalChunks = event.data?.chunks || 1;
          progress = 0;
          break;

        case TranscriptionEventType.CHUNK_READY:
          stage = TranscriptionStage.CHUNKING;
          currentChunk = event.data?.chunkIndex || 0;
          totalChunks = event.data?.totalChunks || 1;
          progress = (currentChunk / totalChunks) * 100;
          break;

        case TranscriptionEventType.TRANSCRIBE_START:
          stage = TranscriptionStage.TRANSCRIBING;
          currentChunk = event.data?.chunkIndex || 0;
          break;

        case TranscriptionEventType.TRANSCRIBE_CHUNK_COMPLETE:
          stage = TranscriptionStage.TRANSCRIBING;
          if (event.data?.text) {
            partialText += (partialText ? '\n\n' : '') + event.data.text;
          }
          currentChunk = event.data?.chunkIndex || 0;
          totalChunks = event.data?.totalChunks || 1;
          progress = (currentChunk / totalChunks) * 100;
          break;

        case TranscriptionEventType.TRANSCRIBE_COMPLETE:
          stage = TranscriptionStage.COMPLETE;
          progress = 100;
          break;

        case TranscriptionEventType.TRANSCRIPTION_STOPPED:
          stage = TranscriptionStage.STOPPED;
          currentChunk = event.data?.completedChunks || 0;
          totalChunks = event.data?.totalChunks || 1;
          progress = totalChunks > 0 ? (currentChunk / totalChunks) * 100 : 0;
          break;

        case TranscriptionEventType.ERROR:
          stage = TranscriptionStage.ERROR;
          error = event.data?.error || 'Unknown error';
          break;
      }
    }

    return {
      stage,
      progress: Math.min(100, Math.max(0, progress)),
      metadata,
      partialText,
      currentChunk,
      totalChunks,
      error
    };
  }, [events]);

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await onStop(toolCallId);
    } catch (error) {
      console.error('Failed to stop transcription:', error);
    } finally {
      // Keep stopping state until we receive stopped event
      setTimeout(() => setIsStopping(false), 5000);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getStageColor = (stage: TranscriptionStage): string => {
    switch (stage) {
      case TranscriptionStage.DOWNLOADING:
        return 'text-blue-600 dark:text-blue-400';
      case TranscriptionStage.CHUNKING:
        return 'text-purple-600 dark:text-purple-400';
      case TranscriptionStage.TRANSCRIBING:
        return 'text-green-600 dark:text-green-400';
      case TranscriptionStage.COMPLETE:
        return 'text-green-700 dark:text-green-300';
      case TranscriptionStage.STOPPED:
        return 'text-yellow-600 dark:text-yellow-400';
      case TranscriptionStage.ERROR:
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getProgressBarColor = (stage: TranscriptionStage): string => {
    switch (stage) {
      case TranscriptionStage.DOWNLOADING:
        return 'bg-blue-500';
      case TranscriptionStage.CHUNKING:
        return 'bg-purple-500';
      case TranscriptionStage.TRANSCRIBING:
        return 'bg-green-500';
      case TranscriptionStage.COMPLETE:
        return 'bg-green-600';
      case TranscriptionStage.STOPPED:
        return 'bg-yellow-500';
      case TranscriptionStage.ERROR:
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const isInProgress = 
    status.stage === TranscriptionStage.DOWNLOADING ||
    status.stage === TranscriptionStage.CHUNKING ||
    status.stage === TranscriptionStage.TRANSCRIBING;

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 mb-4 bg-white dark:bg-gray-800">
      {/* Header with Metadata */}
      <div className="flex items-start gap-3 mb-3">
        {status.metadata?.thumbnail && (
          <img
            src={status.metadata.thumbnail}
            alt="Video thumbnail"
            className="w-24 h-16 object-cover rounded flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          {status.metadata?.title ? (
            <>
              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {status.metadata.title}
              </div>
              {status.metadata.author && (
                <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                  {status.metadata.author}
                </div>
              )}
              {status.metadata.duration && (
                <div className="text-xs text-gray-500 dark:text-gray-500">
                  Duration: {formatDuration(status.metadata.duration)}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {url}
            </div>
          )}
        </div>

        {/* Stop Button */}
        {isInProgress && !isStopping && (
          <button
            onClick={handleStop}
            className="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors flex-shrink-0"
            title="Stop transcription"
          >
            Stop
          </button>
        )}
        {isStopping && (
          <div className="px-3 py-1 text-sm bg-gray-400 text-white rounded flex-shrink-0">
            Stopping...
          </div>
        )}
      </div>

      {/* Stage Indicator */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-sm font-medium ${getStageColor(status.stage)}`}>
          {status.stage}
        </span>
        {status.totalChunks > 1 && isInProgress && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            (Chunk {status.currentChunk} of {status.totalChunks})
          </span>
        )}
        {isInProgress && (
          <div className="ml-auto">
            <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full"></div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
        <div
          className={`absolute left-0 top-0 h-full ${getProgressBarColor(status.stage)} transition-all duration-300 ease-out`}
          style={{ width: `${status.progress}%` }}
        />
      </div>

      {/* Progress Percentage */}
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
        {status.progress.toFixed(0)}% complete
      </div>

      {/* Error Message */}
      {status.error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          Error: {status.error}
        </div>
      )}

      {/* Expandable Transcript */}
      {status.partialText && (
        <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors mb-2"
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>
              {isExpanded ? 'Hide' : 'Show'} Partial Transcript
              {status.totalChunks > 1 && ` (${status.currentChunk} of ${status.totalChunks} chunks)`}
            </span>
          </button>

          {isExpanded && (
            <div className="max-h-60 overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {status.partialText}
            </div>
          )}
        </div>
      )}

      {/* Complete Message */}
      {status.stage === TranscriptionStage.COMPLETE && (
        <div className="mt-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Transcription complete!
        </div>
      )}

      {/* Stopped Message */}
      {status.stage === TranscriptionStage.STOPPED && (
        <div className="mt-3 text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
          </svg>
          Transcription stopped ({status.currentChunk} of {status.totalChunks} chunks completed)
        </div>
      )}
    </div>
  );
};
