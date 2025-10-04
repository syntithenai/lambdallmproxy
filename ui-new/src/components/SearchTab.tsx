import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { performSearch } from '../utils/api';
import type { SearchResult } from '../utils/api';

export const SearchTab: React.FC = () => {
  const { accessToken, isAuthenticated } = useAuth();
  const [queries, setQueries] = useState<string[]>(['']);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

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
    if (!accessToken || isLoading) return;

    const validQueries = queries.filter(q => q.trim());
    if (validQueries.length === 0) return;

    setIsLoading(true);
    try {
      const searchResults = await performSearch(validQueries, accessToken, {
        maxResults: 5,
        includeContent: true
      });
      console.log('Search results:', searchResults);
      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
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
              {queries.map((query, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => updateQuery(index, e.target.value)}
                    placeholder={`Search query ${index + 1}...`}
                    className="input-field flex-1"
                  />
                  {queries.length > 1 && (
                    <button
                      onClick={() => removeQueryField(index)}
                      className="btn-secondary text-red-500"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
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
      <div className="flex-1 overflow-y-auto space-y-4">
        {results.length > 0 && results.map((searchResult, searchIdx) => (
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
                          <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                            {result.title}
                          </h5>
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary-600 dark:text-primary-400 hover:underline block mb-2"
                          >
                            {result.url}
                          </a>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {result.description}
                          </p>
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
