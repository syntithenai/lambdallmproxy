import React, { useState } from 'react';
import { generateImage } from '../utils/api';

interface ImageGenerationData {
  id: string;
  provider: string;
  model: string;
  modelKey?: string;
  cost: number;
  prompt: string;
  size?: string;
  style?: string;
  qualityTier?: string;
  constraints?: {
    maxSize?: string;
    supportedSizes?: string[];
    supportsStyle?: boolean;
  };
  imageUrl?: string;
  llmApiCall?: any;
  status: 'pending' | 'generating' | 'complete' | 'error';
  error?: string;
  fallbackUsed?: boolean;
  availableAlternatives?: Array<{
    provider: string;
    model: string;
    cost: number;
    capabilities?: string[];
  }>;
  ready?: boolean;
  message?: string;
}

interface GeneratedImageBlockProps {
  data: ImageGenerationData;
  accessToken: string | null;
  onCopy?: (text: string) => void;
  onGrab?: (markdown: string) => void;
  onLlmInfo?: (llmApiCall: any) => void;
  onStatusChange?: (
    id: string,
    status: 'generating' | 'complete' | 'error',
    imageUrl?: string,
    llmApiCall?: any
  ) => void;
}

export const GeneratedImageBlock: React.FC<GeneratedImageBlockProps> = ({
  data,
  accessToken,
  onCopy,
  onGrab,
  onLlmInfo,
  onStatusChange,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConstraints, setShowConstraints] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);

  // Provider color mapping
  const getProviderColor = (provider: string): string => {
    switch (provider.toLowerCase()) {
      case 'openai':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'together':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'replicate':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      case 'gemini':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  // Provider display name mapping
  const getProviderLabel = (provider: string): string => {
    switch (provider.toLowerCase()) {
      case 'openai':
        return 'OpenAI';
      case 'together':
        return 'Together AI';
      case 'replicate':
        return 'Replicate';
      case 'gemini':
        return 'Google Gemini';
      default:
        return provider;
    }
  };

  // Handle image generation
  const handleGenerate = async () => {
    if (!accessToken) {
      setError('Authentication required');
      return;
    }

    setIsGenerating(true);
    setError(null);
    onStatusChange?.(data.id, 'generating');

    try {
      const result = await generateImage(
        data.prompt,
        data.provider,
        data.model,
        data.modelKey || '',
        data.size || '',
        data.qualityTier || '',
        data.style || '',
        accessToken
      );

      if (result.success && result.imageUrl) {
        onStatusChange?.(data.id, 'complete', result.imageUrl, result.llmApiCall);
      } else {
        const errorMsg = result.error || 'Image generation failed';
        setError(errorMsg);
        onStatusChange?.(data.id, 'error');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Image generation failed';
      setError(errorMsg);
      onStatusChange?.(data.id, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Action handlers
  const handleCopy = () => {
    if (data.imageUrl && onCopy) {
      onCopy(data.imageUrl);
    }
  };

  const handleGrab = () => {
    if (data.imageUrl && onGrab) {
      const markdown = `![${data.prompt.substring(0, 100)}](${data.imageUrl})`;
      onGrab(markdown);
    }
  };

  const handleLlmInfo = () => {
    if (data.llmApiCall && onLlmInfo) {
      onLlmInfo(data.llmApiCall);
    }
  };

  // Pending state - show button to generate
  if (data.status === 'pending' || (!data.imageUrl && !isGenerating && !error)) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
        <div className="flex flex-col gap-3">
          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="btn-primary flex items-center justify-center gap-2 py-3"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Generate Image for ${data.cost.toFixed(4)}</span>
          </button>

          {/* Provider and Model Info */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${getProviderColor(data.provider)}`}>
              {getProviderLabel(data.provider)}
            </span>
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {data.model}
            </span>
            {data.qualityTier && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                {data.qualityTier}
              </span>
            )}
            {data.size && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                {data.size}
              </span>
            )}
          </div>

          {/* Constraints Section */}
          {data.constraints && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <button
                onClick={() => setShowConstraints(!showConstraints)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                <svg
                  className={`w-4 h-4 transform transition-transform ${showConstraints ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span>Model Constraints</span>
              </button>
              {showConstraints && (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 space-y-1 pl-6">
                  {data.constraints.maxSize && (
                    <div>• Max size: {data.constraints.maxSize}</div>
                  )}
                  {data.constraints.supportedSizes && data.constraints.supportedSizes.length > 0 && (
                    <div>• Supported sizes: {data.constraints.supportedSizes.join(', ')}</div>
                  )}
                  {data.constraints.supportsStyle !== undefined && (
                    <div>• Style support: {data.constraints.supportsStyle ? 'Yes' : 'No'}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Alternatives Section */}
          {data.availableAlternatives && data.availableAlternatives.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <button
                onClick={() => setShowAlternatives(!showAlternatives)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                <svg
                  className={`w-4 h-4 transform transition-transform ${showAlternatives ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span>Available Alternatives ({data.availableAlternatives.length})</span>
              </button>
              {showAlternatives && (
                <div className="mt-2 space-y-2 pl-6">
                  {data.availableAlternatives.map((alt, idx) => (
                    <div
                      key={idx}
                      className="text-sm bg-gray-50 dark:bg-gray-700/50 rounded p-2 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getProviderColor(alt.provider)}`}>
                          {getProviderLabel(alt.provider)}
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">{alt.model}</span>
                      </div>
                      <span className="text-gray-600 dark:text-gray-400">${alt.cost.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Generating state - show spinner
  if (isGenerating || data.status === 'generating') {
    return (
      <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Generating image with {getProviderLabel(data.provider)}...
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              This may take a few seconds
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state - show error message with retry
  if (error || data.status === 'error') {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <div className="font-medium text-red-900 dark:text-red-200">
              Image Generation Failed
            </div>
            <div className="text-sm text-red-700 dark:text-red-300 mt-1">
              {error || data.error || 'An unknown error occurred'}
            </div>
            <button
              onClick={handleGenerate}
              className="mt-3 btn-secondary text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Retry</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Complete state - show image with actions
  if (data.status === 'complete' && data.imageUrl) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
        {/* Fallback Warning */}
        {data.fallbackUsed && (
          <div className="mb-3 flex items-center gap-2 text-sm bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded px-3 py-2">
            <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-yellow-800 dark:text-yellow-200">
              Primary provider unavailable, fallback provider used
            </span>
          </div>
        )}

        {/* Image Display */}
        <div className="mb-3">
          <img
            src={data.imageUrl}
            alt={data.prompt}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
          />
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`px-2 py-1 rounded text-xs font-medium ${getProviderColor(data.provider)}`}>
            {getProviderLabel(data.provider)}
          </span>
          <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
            {data.model}
          </span>
          {data.size && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
              {data.size}
            </span>
          )}
          <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            ${data.cost.toFixed(4)}
          </span>
        </div>

        {/* Prompt Display */}
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          <span className="font-medium">Prompt: </span>
          {data.prompt.length > 150 ? (
            <>
              {data.prompt.substring(0, 150)}...
            </>
          ) : (
            data.prompt
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onCopy && (
            <button
              onClick={handleCopy}
              className="btn-secondary text-sm flex items-center gap-1.5"
              title="Copy image URL"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Copy</span>
            </button>
          )}
          {onGrab && (
            <button
              onClick={handleGrab}
              className="btn-secondary text-sm flex items-center gap-1.5"
              title="Copy as markdown"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Grab</span>
            </button>
          )}
          {onLlmInfo && data.llmApiCall && (
            <button
              onClick={handleLlmInfo}
              className="btn-secondary text-sm flex items-center gap-1.5"
              title="View LLM call details"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>LLM Info</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Fallback - shouldn't reach here
  return null;
};
