import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage, StorageError } from '../utils/storage';
import { useToast } from '../components/ToastManager';

export interface ContentSnippet {
  id: string;
  content: string;
  title?: string;
  timestamp: number;
  updateDate: number;
  sourceType: 'user' | 'assistant' | 'tool';
  selected?: boolean;
}

interface SwagContextType {
  snippets: ContentSnippet[];
  addSnippet: (content: string, sourceType: ContentSnippet['sourceType'], title?: string) => void;
  updateSnippet: (id: string, updates: Partial<ContentSnippet>) => void;
  deleteSnippets: (ids: string[]) => void;
  mergeSnippets: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  getSelectedSnippets: () => ContentSnippet[];
  storageStats: { totalSize: number; limit: number; percentUsed: number } | null;
}

const SwagContext = createContext<SwagContextType | undefined>(undefined);

export const useSwag = () => {
  const context = useContext(SwagContext);
  if (!context) {
    throw new Error('useSwag must be used within SwagProvider');
  }
  return context;
};

export const SwagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snippets, setSnippets] = useState<ContentSnippet[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageStats, setStorageStats] = useState<{ totalSize: number; limit: number; percentUsed: number } | null>(null);
  const { showError, showWarning } = useToast();

  // Load from storage on mount
  useEffect(() => {
    const loadSnippets = async () => {
      try {
        const saved = await storage.getItem<ContentSnippet[]>('swag-snippets');
        if (saved) {
          setSnippets(saved);
        }
        setIsLoaded(true);
      } catch (error) {
        console.error('Failed to load snippets:', error);
        showError('Failed to load snippets from storage');
        setIsLoaded(true);
      }
    };

    loadSnippets();
  }, [showError]);

  // Helper function to format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // Save to storage whenever snippets change (with error handling)
  useEffect(() => {
    if (!isLoaded) return; // Don't save during initial load

    const saveSnippets = async () => {
      try {
        await storage.setItem('swag-snippets', snippets);
        
        // Update storage stats
        const stats = await storage.getStats();
        setStorageStats({
          totalSize: stats.totalSize,
          limit: stats.limit,
          percentUsed: stats.percentUsed
        });

        // Warn if storage is getting full
        if (stats.percentUsed > 80) {
          showWarning(`Storage is ${stats.percentUsed.toFixed(0)}% full. Consider deleting old snippets.`);
        }
      } catch (error) {
        if (error instanceof StorageError) {
          if (error.code === 'QUOTA_EXCEEDED') {
            const sizeInfo = error.estimatedSize && error.limit 
              ? `Current size: ${formatBytes(error.estimatedSize)}, Limit: ${formatBytes(error.limit)}`
              : '';
            showError(`Storage Quota Exceeded! ${error.message} ${sizeInfo}`);
          } else {
            showError(`Storage error: ${error.message}`);
          }
        } else {
          console.error('Failed to save snippets:', error);
          showError('Failed to save snippets to storage');
        }
      }
    };

    saveSnippets();
  }, [snippets, isLoaded, showError, showWarning]);

  const addSnippet = (content: string, sourceType: ContentSnippet['sourceType'], title?: string) => {
    // Check if content already exists (prevent duplicates)
    const existingSnippet = snippets.find(s => s.content.trim() === content.trim());
    
    if (existingSnippet) {
      // Update the timestamp to move it to the top
      updateSnippet(existingSnippet.id, { updateDate: Date.now() });
      return;
    }
    
    const now = Date.now();
    const newSnippet: ContentSnippet = {
      id: `snippet-${now}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      title,
      sourceType,
      timestamp: now,
      updateDate: now,
      selected: false
    };
    setSnippets(prev => [newSnippet, ...prev]);
  };

  const updateSnippet = (id: string, updates: Partial<ContentSnippet>) => {
    setSnippets(prev => prev.map(snippet => 
      snippet.id === id ? { ...snippet, ...updates } : snippet
    ));
  };

  const deleteSnippets = (ids: string[]) => {
    setSnippets(prev => prev.filter(snippet => !ids.includes(snippet.id)));
  };

  const mergeSnippets = (ids: string[]) => {
    if (ids.length < 2) return;

    const snippetsToMerge = snippets.filter(s => ids.includes(s.id)).sort((a, b) => a.timestamp - b.timestamp);
    const mergedContent = snippetsToMerge.map(s => s.content).join('\n\n---\n\n');
    const mergedTitle = snippetsToMerge
      .filter(s => s.title)
      .map(s => s.title)
      .join(' + ');

    const now = Date.now();
    const newSnippet: ContentSnippet = {
      id: `snippet-${now}-${Math.random().toString(36).substr(2, 9)}`,
      content: mergedContent,
      title: mergedTitle || undefined,
      sourceType: snippetsToMerge[0].sourceType,
      timestamp: now,
      updateDate: now,
      selected: false
    };

    setSnippets(prev => [
      newSnippet,
      ...prev.filter(snippet => !ids.includes(snippet.id))
    ]);
  };

  const toggleSelection = (id: string) => {
    setSnippets(prev => prev.map(snippet =>
      snippet.id === id ? { ...snippet, selected: !snippet.selected } : snippet
    ));
  };

  const selectAll = () => {
    setSnippets(prev => prev.map(snippet => ({ ...snippet, selected: true })));
  };

  const selectNone = () => {
    setSnippets(prev => prev.map(snippet => ({ ...snippet, selected: false })));
  };

  const getSelectedSnippets = () => {
    return snippets.filter(s => s.selected);
  };

  return (
    <SwagContext.Provider value={{
      snippets,
      addSnippet,
      updateSnippet,
      deleteSnippets,
      mergeSnippets,
      toggleSelection,
      selectAll,
      selectNone,
      getSelectedSnippets,
      storageStats
    }}>
      {children}
    </SwagContext.Provider>
  );
};
