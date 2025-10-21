import React from 'react';
import type { ProgressEvent } from './TranscriptionProgress';

interface ScrapingProgressProps {
  toolCallId: string;
  url: string;
  events: ProgressEvent[];
}

/**
 * Display scraping progress for scrape_web_content tool
 * Shows browser launch, navigation, extraction progress
 */
export const ScrapingProgress: React.FC<ScrapingProgressProps> = ({
  toolCallId,
  url,
  events
}) => {
  if (!events || events.length === 0) {
    return null;
  }

  // Get the last event to determine current status
  const lastEvent = events[events.length - 1];
  const eventType = lastEvent.progress_type || lastEvent.data?.type || '';
  const isComplete = eventType === 'scrape_complete' || eventType === 'scrape_error';
  const isError = eventType === 'scrape_error';

  // Progress stages
  const stages = [
    { type: 'scrape_launching', icon: '🚀', label: 'Launching browser' },
    { type: 'scrape_launched', icon: '✅', label: 'Browser ready' },
    { type: 'scrape_navigating', icon: '🌐', label: 'Loading page' },
    { type: 'scrape_page_loaded', icon: '📄', label: 'Page loaded' },
    { type: 'scrape_extracting', icon: '📖', label: 'Extracting content' },
    { type: 'scrape_extracted', icon: '✅', label: 'Content extracted' },
    { type: 'scrape_complete', icon: '🎉', label: 'Complete' },
  ];

  // Find current stage
  const currentStageIndex = stages.findIndex(s => s.type === eventType);
  const currentStage = stages[currentStageIndex] || stages[0];

  // Extract metadata from events
  const extractedEvent = events.find(e => 
    (e.progress_type || e.data?.type) === 'scrape_extracted'
  );
  const completeEvent = events.find(e => 
    (e.progress_type || e.data?.type) === 'scrape_complete'
  );
  const errorEvent = events.find(e => 
    (e.progress_type || e.data?.type) === 'scrape_error'
  );

  const textLength = extractedEvent?.data?.textLength || completeEvent?.data?.textLength || 0;
  const linkCount = extractedEvent?.data?.linkCount || completeEvent?.data?.linkCount || 0;
  const imageCount = extractedEvent?.data?.imageCount || completeEvent?.data?.imageCount || 0;
  const totalTime = completeEvent?.data?.totalTime || 0;

  return (
    <div className={`p-4 rounded-lg border ${
      isError 
        ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
        : isComplete
        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{currentStage.icon}</span>
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              {isError ? '❌ Scraping Failed' : isComplete ? '✅ Scraping Complete' : currentStage.label}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-md">
              {url}
            </div>
          </div>
        </div>
        {totalTime > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {(totalTime / 1000).toFixed(1)}s
          </div>
        )}
      </div>

      {/* Error message */}
      {isError && errorEvent?.data?.error && (
        <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/30 rounded text-sm text-red-800 dark:text-red-200">
          <div className="font-semibold mb-1">Error:</div>
          <div className="text-xs font-mono">{errorEvent.data.error}</div>
        </div>
      )}

      {/* Progress bar */}
      {!isError && (
        <div className="mb-3">
          <div className="flex items-center gap-1">
            {stages.slice(0, -1).map((stage, idx) => {
              const isActive = idx <= currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              return (
                <React.Fragment key={stage.type}>
                  <div
                    className={`h-1 flex-1 rounded transition-all duration-300 ${
                      isActive
                        ? isCurrent
                          ? 'bg-blue-500 dark:bg-blue-400'
                          : 'bg-green-500 dark:bg-green-400'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      {(textLength > 0 || linkCount > 0 || imageCount > 0) && (
        <div className="flex gap-4 text-xs text-gray-700 dark:text-gray-300">
          {textLength > 0 && (
            <div className="flex items-center gap-1">
              <span>📝</span>
              <span>{textLength} chars</span>
            </div>
          )}
          {linkCount > 0 && (
            <div className="flex items-center gap-1">
              <span>🔗</span>
              <span>{linkCount} links</span>
            </div>
          )}
          {imageCount > 0 && (
            <div className="flex items-center gap-1">
              <span>🖼️</span>
              <span>{imageCount} images</span>
            </div>
          )}
        </div>
      )}

      {/* Event timeline (collapsed for completed) */}
      {!isComplete && events.length > 1 && (
        <details className="mt-3">
          <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-200">
            Show timeline ({events.length} events)
          </summary>
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {events.map((event, idx) => {
              const type = event.progress_type || event.data?.type || '';
              const stage = stages.find(s => s.type === type);
              const time = event.timestamp 
                ? new Date(event.timestamp).toLocaleTimeString()
                : '';
              
              return (
                <div key={idx} className="text-xs flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <span>{stage?.icon || '•'}</span>
                  <span className="flex-1">{stage?.label || type}</span>
                  {time && <span className="text-[10px]">{time}</span>}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
};
