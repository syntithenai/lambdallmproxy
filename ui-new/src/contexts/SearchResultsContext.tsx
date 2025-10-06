/**
 * Search Results Context
 * Provides a way to share search results between Chat and Search tabs
 */

import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { SearchResult } from '../utils/api';

interface SearchResultsContextType {
  searchResults: SearchResult[];
  addSearchResult: (result: SearchResult) => void;
  setSearchResults: (results: SearchResult[]) => void;
  clearSearchResults: () => void;
  wasCleared: boolean;
}

const SearchResultsContext = createContext<SearchResultsContextType | undefined>(undefined);

export const SearchResultsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [searchResults, setSearchResultsState] = useState<SearchResult[]>([]);
  const [wasCleared, setWasCleared] = useState(false);

  const addSearchResult = (result: SearchResult) => {
    setWasCleared(false); // Reset flag when adding results
    setSearchResultsState(prev => {
      // Check if we already have this query
      const existingIndex = prev.findIndex(r => r.query.toLowerCase() === result.query.toLowerCase());
      
      if (existingIndex >= 0) {
        // Update existing result
        const updated = [...prev];
        updated[existingIndex] = result;
        return updated;
      } else {
        // Add new result
        return [...prev, result];
      }
    });
  };

  const setSearchResults = (results: SearchResult[]) => {
    setSearchResultsState(results);
  };

  const clearSearchResults = () => {
    setWasCleared(true); // Set flag to indicate intentional clear
    setSearchResultsState([]);
  };

  return (
    <SearchResultsContext.Provider
      value={{
        searchResults,
        addSearchResult,
        setSearchResults,
        clearSearchResults,
        wasCleared
      }}
    >
      {children}
    </SearchResultsContext.Provider>
  );
};

export const useSearchResults = () => {
  const context = useContext(SearchResultsContext);
  if (context === undefined) {
    throw new Error('useSearchResults must be used within a SearchResultsProvider');
  }
  return context;
};
