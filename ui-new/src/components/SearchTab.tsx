import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSearchResults } from '../contexts/SearchResultsContext';
import { useToast } from './ToastManager';
import { performSearch } from '../utils/api';
import type { SearchResult } from '../utils/api';
import {
  getCachedSearch,
  saveCachedSearch,
  getCachedQueryStrings,
  saveCurrentSearches,
  loadCurrentSearches
} from '../utils/searchCache';

import { useLocalStorage } from '../hooks/useLocalStorage';

export const SearchTab: React.FC = () => {
  const { getToken, isAuthenticated } = useAuth();
  const { searchResults: contextResults, wasCleared } = useSearchResults();
  const { showError, showWarning } = useToast();
  // Note: Search endpoint uses server-side model configuration
  const [queries, setQueries] = useState<string[]>(['']);
  const [results, setResults] = useLocalStorage<SearchResult[]>('search_results', []);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [showAutocomplete, setShowAutocomplete] = useState<number | null>(null);
  const [cachedQueries, setCachedQueries] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Helper function to highlight keywords in text
  const highlightKeywords = (text: string | undefined): string => {
    if (!text || !searchFilter.trim()) return text || '';
    
    const keywords = searchFilter.trim().toLowerCase().split(/\s+/);
    let highlightedText = text;
    
    keywords.forEach(keyword => {
      if (keyword.length > 0) {
        const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedText = highlightedText.replace(
          regex,
          '<mark class="bg-yellow-200 dark:bg-yellow-600 px-1">$1</mark>'
        );
      }
    });
    
    return highlightedText;
  };

  // Load current searches on mount
  useEffect(() => {
    const savedQueries = loadCurrentSearches();
    if (savedQueries.length > 0) {
      setQueries(savedQueries);
    }
    setCachedQueries(getCachedQueryStrings());
  }, []);

  // Save current searches whenever they change
  useEffect(() => {
    const validQueries = queries.filter(q => q.trim());
    if (validQueries.length > 0) {
      saveCurrentSearches(queries);
    }
  }, [queries]);

  // Sync search results with chat context
  useEffect(() => {
    if (wasCleared) {
      // Context was intentionally cleared (new chat) - clear visible results
      console.log('SearchTab: Clearing results (wasCleared=true)');
      setResults([]);
    } else if (contextResults.length > 0) {
      // Merge context results with existing results
      console.log('SearchTab: Updating from context, got', contextResults.length, 'results');
      setResults(prev => {
        // Create a map of existing results by query (lowercase)
        const existingMap = new Map(prev.map(r => [r.query.toLowerCase(), r]));
        
        // Add/update results from context
        contextResults.forEach(result => {
          console.log('SearchTab: Adding/updating result for query:', result.query);
          existingMap.set(result.query.toLowerCase(), result);
        });
        
        // Convert back to array
        const updated = Array.from(existingMap.values());
        console.log('SearchTab: Updated results, now have', updated.length, 'total');
        return updated;
      });
    }
    // If wasCleared is false and contextResults is empty, it's initial state - do nothing
  }, [contextResults, wasCleared, setResults]);

  const addQueryField = () => {
    setQueries([...queries, '']);
  };

  const removeQueryField = (index: number) => {
    if (queries.length > 1) {
      setQueries(queries.filter((_, i) => i !== index));
    }
  };

  const updateQuery = (index: number, value: string) => {
    const newQueries = [...queries];
    newQueries[index] = value;
    setQueries(newQueries);
  };

  const handleSearch = async () => {
    if (isLoading) return;

    const validQueries = queries.filter(q => q.trim());
    if (validQueries.length === 0) return;

    setIsLoading(true);
    setExpandedResults(new Set()); // Reset all expansions
    
    const collectedResults: SearchResult[] = [];
    const uncachedQueries: string[] = [];
    
    // First, check cache for each query
    validQueries.forEach(query => {
      const cached = getCachedSearch(query);
      if (cached) {
        console.log('Using cached results for:', query);
        collectedResults.push({
          query: cached.query,
          results: cached.results
        });
      } else {
        uncachedQueries.push(query);
      }
    });
    
    // Show cached results immediately
    if (collectedResults.length > 0) {
      setResults([...collectedResults]);
    } else {
      setResults([]);
    }
    
    // If all queries are cached, we're done
    if (uncachedQueries.length === 0) {
      setIsLoading(false);
      return;
    }
    
    try {
      // Get valid token (will auto-refresh if needed)
      const token = await getToken();
      if (!token) {
        console.error('No valid token available');
        setIsLoading(false);
        return;
      }

      // Perform search for uncached queries
      await performSearch(
        uncachedQueries,
        token,
        {
          maxResults: 5,
          includeContent: true
        },
        // Handle SSE events
        (event, data) => {
          console.log('Search SSE event:', event, data);
          
          switch (event) {
            case 'status':
              // Could show status message in UI
              console.log('Status:', data.message);
              break;
              
            case 'search-start':
              // A search query is starting
              console.log('Search starting:', data.query);
              break;
              
            case 'search-result':
              // Results for a specific query - cache them
              const newResult = {
                query: data.query,
                results: data.results
              };
              collectedResults.push(newResult);
              
              // Save to cache
              saveCachedSearch(data.query, data.results);
              
              // Update cached queries list
              setCachedQueries(getCachedQueryStrings());
              
              setResults([...collectedResults]);
              break;
              
            case 'result':
              // Single query result - cache it
              const singleResult = {
                query: data.query,
                results: data.results
              };
              
              // Save to cache
              saveCachedSearch(data.query, data.results);
              
              // Update cached queries list
              setCachedQueries(getCachedQueryStrings());
              
              setResults([singleResult]);
              break;
              
            case 'search-error':
              // Error for a specific query
              console.error('Search error for', data.query, ':', data.error);
              showWarning(`Search failed for "${data.query}": ${data.error}`);
              collectedResults.push({
                query: data.query,
                results: []
              });
              setResults([...collectedResults]);
              break;
              
            case 'error':
              // General error
              console.error('Search error:', data.error);
              showError(`Search error: ${data.error}`);
              break;
          }
        },
        // On complete
        () => {
          console.log('Search stream complete');
          setIsLoading(false);
        },
        // On error
        (error) => {
          console.error('Search stream error:', error);
          showError(`Search failed: ${error.message}`);
          setIsLoading(false);
        }
      );
    } catch (error) {
      console.error('Search error:', error);
      setIsLoading(false);
    }
  };

  const toggleExpanded = (resultId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Query Inputs */}
      <div className="card p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Search Queries
          </h3>
          <button onClick={addQueryField} className="btn-secondary text-sm">
            ➕ Add Query
          </button>
        </div>

        {!isAuthenticated ? (
          <div className="text-center text-red-500 py-4">
            Please sign in to use search
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              {queries.map((query, index) => {
                const filteredSuggestions = cachedQueries.filter(cq => 
                  cq.toLowerCase().includes(query.toLowerCase()) && cq.toLowerCase() !== query.toLowerCase()
                );
                const showSuggestions = showAutocomplete === index && query.trim().length > 0 && filteredSuggestions.length > 0;
                
                return (
                  <div key={index} className="relative flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => updateQuery(index, e.target.value)}
                        onFocus={() => setShowAutocomplete(index)}
                        onBlur={() => setTimeout(() => setShowAutocomplete(null), 200)}
                        placeholder={`Search query ${index + 1}...`}
                        className="input-field w-full"
                      />
                      {showSuggestions && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredSuggestions.slice(0, 10).map((suggestion, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                updateQuery(index, suggestion);
                                setShowAutocomplete(null);
                                // Load the cached search result
                                const cached = getCachedSearch(suggestion);
                                if (cached) {
                                  console.log('Loading cached search:', suggestion);
                                  setResults([{
                                    query: cached.query,
                                    results: cached.results
                                  }]);
                                }
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {queries.length > 1 && (
                      <button
                        onClick={() => removeQueryField(index)}
                        className="btn-secondary text-red-500"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            
            <button
              onClick={handleSearch}
              disabled={isLoading || queries.every(q => !q.trim())}
              className="btn-primary w-full"
            >
              {isLoading ? 'Searching...' : '🔍 Search All'}
            </button>
          </>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card p-3">
          <div className="relative">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter results..."
              className="input-field w-full"
            />
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto space-y-4">
        {results.length > 0 && results
          .filter(searchResult => {
            if (!searchFilter.trim()) return true;
            
            // Split filter into individual terms
            const filterTerms = searchFilter.toLowerCase().trim().split(/\s+/);
            
            // Check if ALL filter terms are present in the query string
            const queryLower = searchResult.query.toLowerCase();
            return filterTerms.every(term => queryLower.includes(term));
          })
          .map((searchResult, searchIdx) => (
          <div key={searchIdx} className="card p-4">
            <h4 className="font-bold text-lg mb-3 text-primary-600 dark:text-primary-400">
              Query: {searchResult.query}
            </h4>
            
            {searchResult.results && searchResult.results.length > 0 ? (
              <div className="space-y-3">
                {searchResult.results.map((result, resultIdx) => {
                  const resultId = `${searchIdx}-${resultIdx}`;
                  const isExpanded = expandedResults.has(resultId);

                  return (
                    <div
                      key={resultIdx}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <h5 
                            className="font-semibold text-gray-900 dark:text-gray-100 mb-1"
                            dangerouslySetInnerHTML={{ __html: highlightKeywords(result.title) }}
                          />
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary-600 dark:text-primary-400 hover:underline block mb-2"
                            dangerouslySetInnerHTML={{ __html: highlightKeywords(result.url) }}
                          />
                          <p 
                            className="text-sm text-gray-600 dark:text-gray-400"
                            dangerouslySetInnerHTML={{ __html: highlightKeywords(result.description) }}
                          />
                        </div>
                        <button
                          onClick={() => toggleExpanded(resultId)}
                          className="btn-secondary text-xs whitespace-nowrap"
                        >
                          {isExpanded ? '▲ Collapse' : '▼ Expand'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          {result.error ? (
                            <div className="text-red-500 text-sm">
                              Error: {result.error}
                            </div>
                          ) : result.content ? (
                            <div className="prose dark:prose-invert max-w-none">
                              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-96 overflow-y-auto">
                                {result.content}
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-500 text-sm">
                              No content available
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-gray-500">No results found for this query</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
