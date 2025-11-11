/**
 * SnippetSelector Component
 * 
 * PURPOSE:
 * This component allows users to manually select snippets from their knowledge base
 * to attach as context to chat messages. This extends the automatic RAG system by
 * giving users explicit control over what context is included.
 * 
 * HOW IT DIFFERS FROM AUTOMATIC RAG:
 * - Automatic RAG: Searches embeddings and includes small FRAGMENTS (chunks) based on similarity
 * - Manual Selection: User chooses specific snippets and includes FULL CONTENT
 * 
 * INTEGRATION WITH MESSAGES ARRAY:
 * Selected snippets are injected into the messages array as 'user' role messages with
 * a special prefix before the actual user message:
 * [
 *   { role: 'system', content: systemPrompt },
 *   { role: 'system', content: automaticRagFragments },  // Automatic RAG (if enabled)
 *   { role: 'user', content: '**CONTEXT:** \n\n' + snippet1.content }, // Manual snippet 1
 *   { role: 'user', content: '**CONTEXT:** \n\n' + snippet2.content }, // Manual snippet 2
 *   { role: 'user', content: actualUserMessage }         // The actual question
 * ]
 * 
 * DATA FLOW:
 * 1. User opens snippet selector panel
 * 2. User searches/filters snippets (text, vector, tags)
 * 3. User selects snippets (checkbox or click)
 * 4. Selected snippet IDs stored in parent component state
 * 5. When sending message, parent retrieves full snippet content
 * 6. Parent injects snippets as context messages before user message
 * 7. Backend receives complete messages array with full snippet context
 * 
 * STATE MANAGEMENT:
 * - Component manages its own search/filter state
 * - Parent component (ChatTab) manages selected snippet IDs
 * - Uses SwagContext to access all snippets
 * - Uses ragDB for vector search functionality
 */

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSwag } from '../contexts/SwagContext';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import type { ContentSnippet } from '../contexts/SwagContext';
import { ragDB } from '../utils/ragDB';
import type { SearchResult } from '../utils/ragDB';
import { getCachedApiBase } from '../utils/api';

interface SnippetSelectorProps {
  /** Currently selected snippet IDs from parent */
  selectedSnippetIds: Set<string>;
  /** Callback when selection changes */
  onSelectionChange: (snippetIds: Set<string>) => void;
  /** User email for display/tracking */
  userEmail?: string;
}

/**
 * Extract image data from snippet content
 * Returns { hasImage, imageSrc, altText, textContent }
 */
const extractImageData = (content: string): { 
  hasImage: boolean; 
  imageSrc: string | null; 
  altText: string | null;
  textContent: string;
} => {
  // Match img tag and extract src and alt attributes separately
  const imgTagMatch = content.match(/<img[^>]+>/i);
  
  if (imgTagMatch) {
    const imgTag = imgTagMatch[0];
    
    // Extract src attribute
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    const imageSrc = srcMatch ? srcMatch[1] : null;
    
    // Extract alt attribute
    const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
    const altText = altMatch ? altMatch[1] : 'Image';
    
    // Extract text content (remove img tag)
    const textContent = content.replace(/<img[^>]+>/gi, '').trim();
    
    return {
      hasImage: !!imageSrc,
      imageSrc,
      altText,
      textContent: textContent.length > 200 ? textContent.substring(0, 200) + '...' : textContent
    };
  }
  
  return {
    hasImage: false,
    imageSrc: null,
    altText: null,
    textContent: content.length > 300 ? content.substring(0, 300) + '...' : content
  };
};

export const SnippetSelector: React.FC<SnippetSelectorProps> = ({
  selectedSnippetIds,
  onSelectionChange,
  userEmail: _userEmail
}) => {
  const { getToken } = useAuth();
  const { snippets, getAllTags } = useSwag();
  const { settings } = useSettings();
  
  // Search mode: 'text' for keyword search, 'vector' for semantic search
  const [searchMode, setSearchMode] = useState<'text' | 'vector'>('text');
  
  // Text search query
  const [textQuery, setTextQuery] = useState('');
  
  // Vector search state
  const [vectorQuery, setVectorQuery] = useState('');
  const [vectorResults, setVectorResults] = useState<SearchResult[]>([]);
  const [isVectorSearching, setIsVectorSearching] = useState(false);
  const [hasRunVectorSearch, setHasRunVectorSearch] = useState(false);
  
  // Tag filtering
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // RAG config for similarity threshold
  const [similarityThreshold, setSimilarityThreshold] = useState(0.5);
  
  // Load similarity threshold from settings
  useEffect(() => {
    const loadRagConfig = () => {
      const savedConfig = localStorage.getItem('rag_config');
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          if (config.similarityThreshold !== undefined) {
            setSimilarityThreshold(config.similarityThreshold);
          }
        } catch (error) {
          console.error('Failed to parse RAG config:', error);
        }
      }
    };
    
    loadRagConfig();
    
    // Listen for config changes
    const handleConfigChange = () => loadRagConfig();
    window.addEventListener('rag_config_updated', handleConfigChange);
    
    return () => {
      window.removeEventListener('rag_config_updated', handleConfigChange);
    };
  }, []);
  
  /**
   * Perform vector (semantic) search using embeddings
   * Similar to automatic RAG but user-controlled
   */
  const handleVectorSearch = async () => {
    if (!vectorQuery.trim()) return;
    
    setIsVectorSearching(true);
    setHasRunVectorSearch(true);
    
    try {
      // Get query embedding from backend (use auto-detected API base)
      const apiUrl = await getCachedApiBase();
      const token = await getToken();
      const response = await fetch(`${apiUrl}/rag/embed-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ 
          query: vectorQuery,
          embeddingModel: settings?.embeddingModel,
          providers: settings?.providers || []
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get query embedding');
      }
      
      const { embedding } = await response.json();
      
      // Search locally in IndexedDB
      const results = await ragDB.vectorSearch(embedding, 20, similarityThreshold);
      
      console.log(`🔍 Vector search found ${results.length} results with threshold ${similarityThreshold}`);
      
      setVectorResults(results);
    } catch (error) {
      console.error('Vector search error:', error);
      alert('Vector search failed. Make sure snippets have embeddings generated.');
    } finally {
      setIsVectorSearching(false);
    }
  };
  
  /**
   * Get filtered snippets based on current search mode and filters
   */
  const getFilteredSnippets = (): ContentSnippet[] => {
    let filtered = snippets;
    
    // Apply tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter(snippet => 
        selectedTags.every(tag => snippet.tags?.includes(tag))
      );
    }
    
    // Apply search based on mode
    if (searchMode === 'text' && textQuery.trim()) {
      const query = textQuery.toLowerCase();
      filtered = filtered.filter(snippet =>
        snippet.title?.toLowerCase().includes(query) ||
        snippet.content.toLowerCase().includes(query)
      );
    } else if (searchMode === 'vector' && hasRunVectorSearch) {
      // Filter snippets to only show those in vector search results
      const resultSnippetIds = new Set(
        vectorResults.map(r => String(r.snippet_id))
      );
      filtered = filtered.filter(snippet => resultSnippetIds.has(snippet.id));
    }
    
    return filtered;
  };
  
  /**
   * Get similarity score for a snippet (only in vector search mode)
   */
  const getSimilarityScore = (snippetId: string): number | null => {
    if (searchMode !== 'vector' || !hasRunVectorSearch) return null;
    
    const result = vectorResults.find(r => String(r.snippet_id) === snippetId);
    return result ? result.score : null;
  };
  
  // Handler functions for selection
  const handleToggleSnippet = (snippetId: string) => {
    const newSelection = new Set(selectedSnippetIds);
    if (newSelection.has(snippetId)) {
      newSelection.delete(snippetId);
    } else {
      newSelection.add(snippetId);
    }
    onSelectionChange(newSelection);
  };
  
  const handleSelectAll = () => {
    const filtered = getFilteredSnippets();
    const newSelection = new Set<string>();
    filtered.forEach(s => newSelection.add(s.id));
    onSelectionChange(newSelection);
  };
  
  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };
  
  const filteredSnippets = getFilteredSnippets();
  const allTags = getAllTags();
  
  return (
    <div className="snippet-selector flex flex-col h-full bg-gray-50 dark:bg-gray-800">
      {/* Header with selection count */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            📎 Attach Context
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {selectedSnippetIds.size > 0 && `${selectedSnippetIds.size} selected`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            disabled={filteredSnippets.length === 0}
            className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Select All
          </button>
          <button
            onClick={handleSelectNone}
            disabled={selectedSnippetIds.size === 0}
            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>
      
      {/* Info banner explaining purpose */}
      <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-800 dark:text-blue-200">
          💡 Select snippets to include as <strong>full context</strong> in your message. 
          Unlike automatic RAG which finds relevant fragments, selected snippets are included in their entirety.
        </p>
      </div>
      
      {/* Search mode toggle */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSearchMode('text');
              setHasRunVectorSearch(false);
              setVectorResults([]);
            }}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
              searchMode === 'text'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            🔤 Text Search
          </button>
          <button
            onClick={() => setSearchMode('vector')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
              searchMode === 'vector'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            🧠 Semantic Search
          </button>
        </div>
      </div>
      
      {/* Search input area */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-2">
        {searchMode === 'text' ? (
          <input
            type="text"
            placeholder="Search by title or content..."
            value={textQuery}
            onChange={e => setTextQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter semantic search query..."
              value={vectorQuery}
              onChange={e => setVectorQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVectorSearch()}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleVectorSearch}
              disabled={isVectorSearching || !vectorQuery.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVectorSearching ? '🔄' : '🔍'}
            </button>
          </div>
        )}
        
        {searchMode === 'vector' && hasRunVectorSearch && (
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Found {vectorResults.length} results with similarity ≥ {similarityThreshold.toFixed(2)}
          </p>
        )}
      </div>
      
      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex flex-wrap gap-1.5">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => {
                  setSelectedTags(prev =>
                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                  );
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear tag filters
            </button>
          )}
        </div>
      )}
      
      {/* Snippets list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredSnippets.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {snippets.length === 0 ? (
              <>
                <p className="text-sm font-medium">No snippets in knowledge base</p>
                <p className="text-xs mt-2">Visit the Swag page to add snippets</p>
              </>
            ) : searchMode === 'vector' && !hasRunVectorSearch ? (
              <p className="text-sm">Enter a query and click Search to find semantically similar snippets</p>
            ) : (
              <p className="text-sm">No snippets match your filters</p>
            )}
          </div>
        ) : (
          filteredSnippets.map(snippet => {
            const isSelected = selectedSnippetIds.has(snippet.id);
            const similarityScore = getSimilarityScore(snippet.id);
            
            return (
              <div
                key={snippet.id}
                onClick={() => handleToggleSnippet(snippet.id)}
                className={`border rounded p-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // Handled by div onClick
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {snippet.title || 'Untitled'}
                      </h3>
                      {similarityScore !== null && (
                        <span className="text-xs font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {(similarityScore * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    
                    {/* Content preview - render images directly, text with markdown */}
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 overflow-hidden snippet-preview">
                      {(() => {
                        const imageData = extractImageData(snippet.content);
                        
                        if (imageData.hasImage && imageData.imageSrc) {
                          return (
                            <div className="space-y-2">
                              <img
                                src={imageData.imageSrc}
                                alt={imageData.altText || 'Image'}
                                className="max-w-full h-auto max-h-32 rounded border border-gray-300 dark:border-gray-600 block"
                                loading="lazy"
                              />
                              {imageData.textContent && (
                                <ReactMarkdown
                                  components={{
                                    p: ({ node, ...props }) => <p {...props} className="my-1" />,
                                    code: ({ node, ...props }) => (
                                      <code {...props} className="bg-gray-200 dark:bg-gray-700 px-1 rounded text-xs" />
                                    ),
                                  }}
                                >
                                  {imageData.textContent}
                                </ReactMarkdown>
                              )}
                            </div>
                          );
                        }
                        
                        // Text-only content
                        return (
                          <ReactMarkdown
                            components={{
                              p: ({ node, ...props }) => <p {...props} className="my-1" />,
                              code: ({ node, ...props }) => (
                                <code {...props} className="bg-gray-200 dark:bg-gray-700 px-1 rounded text-xs" />
                              ),
                            }}
                          >
                            {imageData.textContent}
                          </ReactMarkdown>
                        );
                      })()}
                    </div>
                    
                    {/* Tags */}
                    {snippet.tags && snippet.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {snippet.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {/* Metadata */}
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="capitalize">{snippet.sourceType}</span>
                      {snippet.hasEmbedding && <span title="Has embeddings">🧠</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {/* Footer with help text */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
        <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
          💡 Tip: Click a snippet to toggle selection. Selected snippets will be included as context when you send your message.
        </p>
      </div>
    </div>
  );
};
