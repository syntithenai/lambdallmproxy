import React from 'react';

interface ImageGenerationProgressProps {
  data: {
    tool: string;
    phase: 'analyzing_prompt' | 'quality_selected' | 'selecting_provider' | 'generating' | 'completed' | 'error';
    prompt?: string;
    quality?: string;
    provider?: string;
    model?: string;
    size?: string;
    estimated_cost?: number;
    estimated_seconds?: number;
    remaining_seconds?: number; // Added by countdown timer
    error?: string;
    url?: string;
  };
}

export const ImageGenerationProgress: React.FC<ImageGenerationProgressProps> = ({ data }) => {
  const getPhaseInfo = () => {
    switch (data.phase) {
      case 'analyzing_prompt':
        return {
          icon: (
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
            </div>
          ),
          label: 'Analyzing prompt',
          description: data.prompt ? `"${data.prompt.substring(0, 60)}${data.prompt.length > 60 ? '...' : ''}"` : '',
          bgColor: 'bg-pink-50 dark:bg-pink-900/20',
          textColor: 'text-pink-700 dark:text-pink-300'
        };
      
      case 'quality_selected':
        return {
          icon: <span className="text-purple-500">⚡</span>,
          label: `Quality tier: ${data.quality || 'standard'}`,
          description: data.quality === 'ultra' ? 'Highest quality, slower generation' :
                      data.quality === 'high' ? 'High quality output' :
                      data.quality === 'standard' ? 'Balanced quality and speed' :
                      'Fast generation',
          bgColor: 'bg-purple-50 dark:bg-purple-900/20',
          textColor: 'text-purple-700 dark:text-purple-300'
        };
      
      case 'selecting_provider':
        return {
          icon: <span className="text-indigo-500">🎨</span>,
          label: `Selected: ${data.provider || 'provider'} ${data.model || ''}`,
          description: `Size: ${data.size || '1024x1024'} • ${data.estimated_cost ? `~$${data.estimated_cost.toFixed(4)}` : 'Calculating cost...'}`,
          bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
          textColor: 'text-indigo-700 dark:text-indigo-300'
        };
      
      case 'generating':
        const remainingSeconds = data.remaining_seconds ?? data.estimated_seconds ?? 15;
        const progress = data.estimated_seconds && data.remaining_seconds !== undefined
          ? Math.min(100, Math.max(0, ((data.estimated_seconds - data.remaining_seconds) / data.estimated_seconds) * 100))
          : 0;
        
        return {
          icon: (
            <div className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
          ),
          label: 'Generating image...',
          description: (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span>⏱️</span>
                <span>
                  {remainingSeconds > 0 
                    ? `~${remainingSeconds}s remaining`
                    : 'Finishing up...'}
                </span>
              </div>
              {data.estimated_seconds && (
                <div className="w-full bg-pink-200 dark:bg-pink-800 rounded-full h-1.5">
                  <div 
                    className="bg-gradient-to-r from-pink-500 to-purple-500 h-1.5 rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {data.provider} • {data.quality} quality • {data.size}
              </div>
            </div>
          ),
          bgColor: 'bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20',
          textColor: 'text-pink-700 dark:text-pink-300'
        };
      
      case 'completed':
        return {
          icon: <span className="text-green-500">✓</span>,
          label: 'Image generated successfully',
          description: `${data.provider} • ${data.quality} quality • ${data.size}${data.estimated_cost ? ` • $${data.estimated_cost.toFixed(4)}` : ''}`,
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          textColor: 'text-green-700 dark:text-green-300'
        };
      
      case 'error':
        return {
          icon: <span className="text-red-500">✗</span>,
          label: 'Image generation failed',
          description: data.error || 'Unknown error occurred',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          textColor: 'text-red-700 dark:text-red-300'
        };
      
      default:
        return {
          icon: (
            <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
          ),
          label: 'Processing...',
          description: '',
          bgColor: 'bg-gray-50 dark:bg-gray-900/20',
          textColor: 'text-gray-700 dark:text-gray-300'
        };
    }
  };

  const phaseInfo = getPhaseInfo();

  return (
    <div className={`rounded-lg ${phaseInfo.bgColor} p-3 shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {phaseInfo.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-medium text-sm ${phaseInfo.textColor}`}>
            {phaseInfo.label}
          </div>
          {phaseInfo.description && (
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {typeof phaseInfo.description === 'string' ? (
                <span>{phaseInfo.description}</span>
              ) : (
                phaseInfo.description
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
