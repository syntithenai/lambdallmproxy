import React, { useState } from 'react';
import { JsonTreeViewer } from './JsonTreeViewer';
import ReactMarkdown from 'react-markdown';

interface ToolTransparencyProps {
  rawResponse?: string;
  extractionMetadata?: any;
}

const ToolTransparency: React.FC<ToolTransparencyProps> = ({ 
  rawResponse, 
  extractionMetadata 
}) => {
  const [showRawDialog, setShowRawDialog] = useState<{ content: string; title: string } | null>(null);
  
  // Parse rawResponse if it's a search_web result
  let parsedData: any = null;
  let searchResults: any[] = [];
  
  try {
    if (rawResponse) {
      parsedData = JSON.parse(rawResponse);
      if (parsedData.results && Array.isArray(parsedData.results)) {
        searchResults = parsedData.results;
      }
    }
  } catch (e) {
    console.log('Failed to parse rawResponse:', e);
  }
  
  console.log('🔍 ToolTransparency received:', {
    hasRawResponse: !!rawResponse,
    rawResponseLength: rawResponse?.length,
    hasExtraction: !!extractionMetadata,
    parsedResults: searchResults.length,
    rawResponsePreview: rawResponse ? rawResponse.substring(0, 100) + '...' : 'none'
  });

  if (!rawResponse && !extractionMetadata) {
    console.log('⚠️ ToolTransparency: No data, returning null');
    return null;
  }
  
  console.log('✅ ToolTransparency: Rendering with', searchResults.length, 'results');

  return (
    <>
      <div className="mt-3 pt-3 border-t-4 border-purple-400 dark:border-purple-600 bg-purple-50 dark:bg-purple-950 p-3 rounded">
        <div className="text-sm font-bold text-purple-700 dark:text-purple-300 mb-3 flex items-center gap-2">
          🔍 Search Results Transparency
          <span className="text-xs font-normal opacity-75">({searchResults.length} results)</span>
        </div>
        
        <div className="space-y-4">
          {searchResults.map((result, idx) => {
            const rawContent = result.rawHtml || result.rawContent || '';
            const extractedContent = result.content || '';
            
            return (
              <div key={idx} className="border border-purple-300 dark:border-purple-700 rounded p-3 bg-white dark:bg-gray-900">
                <div className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-2">
                  Result {idx + 1}: {result.title || result.url}
                </div>
                
                {/* 1. Full Raw Scraped Content Button */}
                {rawContent && (
                  <div className="mb-3">
                    <button
                      onClick={() => setShowRawDialog({ 
                        content: rawContent, 
                        title: `Raw Content: ${result.title || result.url}` 
                      })}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded flex items-center gap-2"
                    >
                      📄 View Full Raw Scraped Content
                      <span className="opacity-75">({rawContent.length.toLocaleString()} chars)</span>
                    </button>
                  </div>
                )}
                
                {/* 2. Extracted Content Sent to LLM (Markdown Rendered) */}
                {extractedContent && (
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1 flex items-center gap-2">
                      🤖 Content Sent to LLM
                      <span className="opacity-75">({extractedContent.length.toLocaleString()} chars)</span>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950 border border-green-300 dark:border-green-700 rounded p-3 max-h-96 overflow-y-auto">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{extractedContent}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 3. JSON Tree of Parsed Structure */}
                <div className="mb-2">
                  <div className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-1">
                    📊 Parsed Page Structure & Metadata
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950 border border-purple-300 dark:border-purple-700 rounded p-2 max-h-96 overflow-y-auto">
                    <JsonTreeViewer 
                      data={{
                        url: result.url,
                        title: result.title,
                        snippet: result.snippet,
                        images: result.page_content?.images || result.images || [],
                        youtube: result.youtube || [],
                        media: result.media || [],
                        links: result.links || [],
                        page_content: result.page_content,
                        summary: result.page_content?.summary,
                        structure: result.page_content?.structure,
                        metadata: {
                          contentLength: extractedContent.length,
                          rawContentLength: rawContent.length,
                          hasImages: !!(result.page_content?.images?.length || result.images?.length),
                          hasYouTube: !!(result.youtube?.length),
                          hasMedia: !!(result.media?.length),
                          hasLinks: !!(result.links?.length)
                        }
                      }} 
                    />
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Show extraction metadata if available */}
          {extractionMetadata && (
            <div className="border border-purple-300 dark:border-purple-700 rounded p-3 bg-white dark:bg-gray-900">
              <div className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-2">
                📊 Overall Extraction Metadata
              </div>
              <div className="bg-purple-50 dark:bg-purple-950 border border-purple-300 dark:border-purple-700 rounded p-2 max-h-96 overflow-y-auto">
                <JsonTreeViewer data={extractionMetadata} />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Full Raw Content Dialog */}
      {showRawDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {showRawDialog.title}
              </h3>
              <button
                onClick={() => setShowRawDialog(null)}
                className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-sm"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200 font-mono">
                {showRawDialog.content}
              </pre>
            </div>
            <div className="p-4 border-t border-gray-300 dark:border-gray-700 flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(showRawDialog.content);
                  alert('Copied to clipboard!');
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
              >
                📋 Copy to Clipboard
              </button>
              <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center">
                {showRawDialog.content.length.toLocaleString()} characters
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ToolTransparency;
