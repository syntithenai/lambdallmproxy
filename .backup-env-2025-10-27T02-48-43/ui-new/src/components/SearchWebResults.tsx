/**
 * Search Web Results Component
 * Displays search_web tool results with expandable content and metadata
 */

import React, { useState } from 'react';
import { JsonTree } from './JsonTree';

interface SearchResult {
  query?: string;
  title: string;
  url: string;
  description?: string;
  snippet?: string;
  content?: string;
  originalLength?: number;
  intelligentlyExtracted?: boolean;
  truncated?: boolean;
  contentLength?: number;
  fetchTimeMs?: number;
  score?: number;
  duckduckgoScore?: number;
  state?: string;
  images?: any[];
  youtube?: any[];
  media?: any[];
  links?: any[];
  page_content?: any;
  contentError?: string;
}

interface SearchWebResultsProps {
  results: SearchResult[];
}

export const SearchWebResults: React.FC<SearchWebResultsProps> = ({ results }) => {
  const [expandedContent, setExpandedContent] = useState<Set<number>>(new Set());
  const [expandedMetadata, setExpandedMetadata] = useState<Set<number>>(new Set());

  const toggleContent = (index: number) => {
    setExpandedContent(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const toggleMetadata = (index: number) => {
    setExpandedMetadata(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-purple-800 dark:text-purple-200">
        🔍 Search Results ({results.length})
      </div>
      
      {results.map((result, idx) => {
        const isContentExpanded = expandedContent.has(idx);
        const isMetadataExpanded = expandedMetadata.has(idx);
        
        // Build metadata object (excluding content for cleaner JSON)
        const metadata = {
          url: result.url,
          title: result.title,
          description: result.description,
          score: result.score,
          duckduckgoScore: result.duckduckgoScore,
          state: result.state,
          contentLength: result.contentLength,
          fetchTimeMs: result.fetchTimeMs,
          originalLength: result.originalLength,
          intelligentlyExtracted: result.intelligentlyExtracted,
          truncated: result.truncated,
          images_count: result.images?.length || 0,
          youtube_count: result.youtube?.length || 0,
          media_count: result.media?.length || 0,
          links_count: result.links?.length || 0,
          contentError: result.contentError
        };

        return (
          <div 
            key={idx} 
            className="border border-purple-200 dark:border-purple-700 rounded-lg p-3 bg-purple-50/30 dark:bg-purple-900/10"
          >
            {/* Header */}
            <div className="flex items-start gap-2 mb-2">
              <span className="flex-shrink-0 text-purple-600 dark:text-purple-400 font-bold text-sm">
                #{idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-purple-900 dark:text-purple-100 text-sm mb-1">
                  {result.title || `Result ${idx + 1}`}
                </h4>
                {result.url && (
                  <a 
                    href={result.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs break-all block"
                  >
                    {result.url}
                  </a>
                )}
              </div>
            </div>

            {/* Description/Snippet */}
            {(result.description || result.snippet) && (
              <p className="text-gray-700 dark:text-gray-300 text-xs mb-2 italic">
                {result.description || result.snippet}
              </p>
            )}

            {/* Content Error */}
            {result.contentError && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded p-2 mb-2">
                <span className="text-xs text-red-700 dark:text-red-300">
                  ⚠️ {result.contentError}
                </span>
              </div>
            )}

            {/* Stats badges */}
            <div className="flex flex-wrap gap-2 mb-2">
              {result.contentLength !== undefined && (
                <span className="text-[10px] px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded">
                  {(result.contentLength / 1024).toFixed(1)} KB
                </span>
              )}
              {result.fetchTimeMs !== undefined && (
                <span className="text-[10px] px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded">
                  {result.fetchTimeMs}ms
                </span>
              )}
              {result.images && result.images.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded">
                  🖼️ {result.images.length}
                </span>
              )}
              {result.links && result.links.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded">
                  🔗 {result.links.length}
                </span>
              )}
              {result.truncated && (
                <span className="text-[10px] px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded">
                  ✂️ Truncated
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {/* Content Expand Button */}
              {result.content && (
                <button
                  onClick={() => toggleContent(idx)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors font-medium"
                >
                  <span>{isContentExpanded ? '▼' : '▶'}</span>
                  <span>Content Sent to LLM</span>
                  {result.originalLength && (
                    <span className="opacity-75">
                      ({(result.originalLength / 1024).toFixed(1)} KB)
                    </span>
                  )}
                </button>
              )}
              
              {/* Metadata Expand Button */}
              <button
                onClick={() => toggleMetadata(idx)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium"
              >
                <span>{isMetadataExpanded ? '▼' : '▶'}</span>
                <span>Metadata JSON</span>
              </button>
            </div>

            {/* Expanded Content Section */}
            {isContentExpanded && result.content && (
              <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700">
                <div className="text-xs font-semibold text-purple-800 dark:text-purple-200 mb-2">
                  📄 Content Sent to LLM:
                  {result.intelligentlyExtracted && (
                    <span className="ml-2 text-green-600 dark:text-green-400">
                      ✨ Intelligently Extracted
                    </span>
                  )}
                </div>
                <div className="bg-white dark:bg-gray-900 rounded border border-purple-200 dark:border-purple-700 p-3 max-h-96 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200 leading-relaxed font-mono">
                    {result.content}
                  </pre>
                </div>
              </div>
            )}

            {/* Expanded Metadata Section */}
            {isMetadataExpanded && (
              <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700">
                <div className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-2">
                  🔍 Scrape Metadata:
                </div>
                <div className="bg-white dark:bg-gray-900 rounded border border-blue-200 dark:border-blue-700 p-3 max-h-96 overflow-y-auto">
                  <JsonTree data={metadata} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
