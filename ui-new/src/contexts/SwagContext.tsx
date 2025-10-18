import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage, StorageError } from '../utils/storage';
import { useToast } from '../components/ToastManager';
import { ragSyncService } from '../services/ragSyncService';
import type { SyncStatus } from '../services/ragSyncService';
import { useAuth } from './AuthContext';

export interface ContentSnippet {
  id: string;
  content: string;
  title?: string;
  timestamp: number;
  updateDate: number;
  sourceType: 'user' | 'assistant' | 'tool';
  selected?: boolean;
  tags?: string[];
  hasEmbedding?: boolean;
}

interface SwagContextType {
  snippets: ContentSnippet[];
  addSnippet: (content: string, sourceType: ContentSnippet['sourceType'], title?: string) => Promise<void>;
  updateSnippet: (id: string, updates: Partial<ContentSnippet>) => Promise<void>;
  deleteSnippets: (ids: string[]) => void;
  mergeSnippets: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  getSelectedSnippets: () => ContentSnippet[];
  getAllTags: () => string[];
  addTagsToSnippets: (ids: string[], tags: string[]) => void;
  removeTagsFromSnippets: (ids: string[], tags: string[]) => void;
  storageStats: { totalSize: number; limit: number; percentUsed: number } | null;
  checkEmbeddingStatus: (id: string) => Promise<boolean>;
  bulkCheckEmbeddingStatus: () => Promise<void>;
  generateEmbeddings: (snippetIds: string[], onProgress?: (current: number, total: number) => void) => Promise<{ embedded: number; skipped: number; failed: number }>;
  syncStatus: SyncStatus | null;
  triggerManualSync: () => Promise<void>;
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const { showError, showWarning } = useToast();
  const { user } = useAuth();

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

  // Helper to check if RAG sync is enabled
  const isSyncEnabled = (): boolean => {
    try {
      const ragConfig = localStorage.getItem('rag_config');
      if (ragConfig) {
        const config = JSON.parse(ragConfig);
        return config.enabled && config.syncEnabled;
      }
    } catch (error) {
      console.error('Failed to check RAG sync config:', error);
    }
    return false;
  };

  // Initialize sync service when user logs in
  useEffect(() => {
    const initSync = async () => {
      if (!user?.email || !isSyncEnabled() || !isLoaded) {
        return;
      }

      try {
        // Initialize sync service
        await ragSyncService.initialize({
          enabled: true,
          autoSync: true,
          syncInterval: 60000, // 1 minute
          batchSize: 50,
          retryAttempts: 3,
          deviceId: ragSyncService.getDeviceId(),
        });

        // Register event handlers
        ragSyncService.onSyncStart(() => {
          setSyncStatus(ragSyncService.getStatus());
        });

        ragSyncService.onSyncComplete((result) => {
          setSyncStatus(ragSyncService.getStatus());
          if (result && result.snippetsPulled > 0) {
            console.log(`Synced ${result.snippetsPulled} snippets from cloud`);
          }
        });

        ragSyncService.onSyncError((_, error) => {
          console.error('Sync error:', error);
          setSyncStatus(ragSyncService.getStatus());
          if (error) {
            showError(`Sync failed: ${error.message}`);
          }
        });

        // Perform initial full sync - pull remote snippets
        console.log('Performing initial sync...');
        const remoteSnippets = await ragSyncService.pullSnippets(user.email);
        
        if (remoteSnippets && remoteSnippets.length > 0) {
          // Merge downloaded snippets with local ones
          setSnippets(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const newSnippets = remoteSnippets.filter(s => !existingIds.has(s.id));
            
            // Also update existing snippets if remote is newer
            const updated = prev.map(local => {
              const remote = remoteSnippets.find(r => r.id === local.id);
              if (remote && remote.updateDate > local.updateDate) {
                return remote;
              }
              return local;
            });
            
            // Combine and sort by updateDate descending
            return [...newSnippets, ...updated].sort((a, b) => b.updateDate - a.updateDate);
          });
          console.log(`Downloaded ${remoteSnippets.length} snippets from cloud`);
        }

        // Push local snippets that don't exist remotely
        if (snippets.length > 0) {
          await ragSyncService.pushSnippets(snippets, user.email);
        }

        // Start auto-sync
        ragSyncService.startAutoSync();
        console.log('RAG sync initialized and auto-sync started');
      } catch (error) {
        console.error('Failed to initialize sync:', error);
        showError('Failed to initialize cloud sync');
      }
    };

    initSync();

    // Cleanup on unmount or when sync is disabled
    return () => {
      if (isSyncEnabled()) {
        ragSyncService.stopAutoSync();
      }
    };
  }, [user?.email, isLoaded, showError]);

  // Helper to check if auto-embed is enabled
  const isAutoEmbedEnabled = (): boolean => {
    try {
      const ragConfig = localStorage.getItem('rag_config');
      if (ragConfig) {
        const config = JSON.parse(ragConfig);
        return config.enabled && config.autoEmbed;
      }
    } catch (error) {
      console.error('Failed to check RAG config:', error);
    }
    return false;
  };

  // Helper to auto-embed snippet if needed
  const autoEmbedSnippet = async (snippetId: string, content: string, title?: string) => {
    if (!isAutoEmbedEnabled()) return;

    try {
      const response = await fetch(`${process.env.REACT_APP_LAMBDA_URL || 'http://localhost:3000'}/rag/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          sourceType: 'snippet',
          title: title || `Snippet ${snippetId}`,
          snippetId, // Link to snippet for updates
        }),
      });

      if (!response.ok) {
        console.error('Failed to auto-embed snippet');
        return;
      }

      // Parse SSE response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.substring(6));
              if (data.error) {
                console.error('Auto-embed error:', data.error);
              }
              if (data.message) {
                console.log('Auto-embed:', data.message);
              }
            }
          }
        }
      }

      // Mark snippet as having embedding
      setSnippets(prev => prev.map(snippet =>
        snippet.id === snippetId ? { ...snippet, hasEmbedding: true } : snippet
      ));

    } catch (error) {
      console.error('Auto-embed failed:', error);
    }
  };

  const addSnippet = async (content: string, sourceType: ContentSnippet['sourceType'], title?: string) => {
    // Check if content already exists (prevent duplicates)
    const existingSnippet = snippets.find(s => s.content.trim() === content.trim());
    
    if (existingSnippet) {
      // Update the timestamp to move it to the top
      await updateSnippet(existingSnippet.id, { updateDate: Date.now() });
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

    // Queue sync if enabled
    if (isSyncEnabled() && user?.email) {
      ragSyncService.queueSync({
        type: 'push-snippet',
        data: newSnippet,
        userEmail: user.email,
      });
    }

    // Auto-embed if enabled
    await autoEmbedSnippet(newSnippet.id, content, title);
  };

  const updateSnippet = async (id: string, updates: Partial<ContentSnippet>) => {
    const oldSnippet = snippets.find(s => s.id === id);
    
    const updatedSnippet = { ...oldSnippet, ...updates, updateDate: Date.now() } as ContentSnippet;
    setSnippets(prev => prev.map(snippet => 
      snippet.id === id ? updatedSnippet : snippet
    ));

    // Queue sync if enabled
    if (isSyncEnabled() && user?.email) {
      ragSyncService.queueSync({
        type: 'push-snippet',
        data: updatedSnippet,
        userEmail: user.email,
      });
    }

    // If content changed, re-embed if auto-embed is enabled
    if (oldSnippet && updates.content && updates.content !== oldSnippet.content) {
      const newTitle = updates.title !== undefined ? updates.title : oldSnippet.title;
      await autoEmbedSnippet(id, updates.content, newTitle);
    }
  };

  const deleteSnippets = (ids: string[]) => {
    setSnippets(prev => prev.filter(snippet => !ids.includes(snippet.id)));
    
    // Queue sync for each deleted snippet if enabled
    if (isSyncEnabled() && user?.email) {
      ids.forEach(id => {
        ragSyncService.queueSync({
          type: 'delete-snippet',
          data: { id },
          userEmail: user!.email!,
        });
      });
    }
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

  const getAllTags = () => {
    const tagSet = new Set<string>();
    snippets.forEach(snippet => {
      if (snippet.tags) {
        snippet.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  };

  const addTagsToSnippets = (ids: string[], tags: string[]) => {
    setSnippets(prev => prev.map(snippet => {
      if (ids.includes(snippet.id)) {
        const existingTags = snippet.tags || [];
        const newTags = [...new Set([...existingTags, ...tags])];
        return { ...snippet, tags: newTags, updateDate: Date.now() };
      }
      return snippet;
    }));
  };

  const removeTagsFromSnippets = (ids: string[], tags: string[]) => {
    setSnippets(prev => prev.map(snippet => {
      if (ids.includes(snippet.id) && snippet.tags) {
        const remainingTags = snippet.tags.filter(tag => !tags.includes(tag));
        return { 
          ...snippet, 
          tags: remainingTags.length > 0 ? remainingTags : undefined,
          updateDate: Date.now() 
        };
      }
      return snippet;
    }));
  };

  const checkEmbeddingStatus = async (id: string): Promise<boolean> => {
    // This would check the backend for embedding status
    // For now, return false (not implemented yet)
    return false;
  };

  const bulkCheckEmbeddingStatus = async () => {
    try {
      // Get all snippet IDs
      const snippetIds = snippets.map(s => s.id);
      if (snippetIds.length === 0) return;
      
      // In a real implementation, we'd batch check the backend
      // For now, we'll just mark all as not having embeddings
      const statusMap = new Map<string, boolean>();
      
      // Update snippets with embedding status
      setSnippets(prev => prev.map(snippet => ({
        ...snippet,
        hasEmbedding: statusMap.get(snippet.id) || false
      })));
      
    } catch (error) {
      console.error('Failed to check embedding status:', error);
    }
  };

  const generateEmbeddings = async (
    snippetIds: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<{ embedded: number; skipped: number; failed: number }> => {
    const selectedSnippets = snippets.filter(s => snippetIds.includes(s.id));
    
    if (selectedSnippets.length === 0) {
      return { embedded: 0, skipped: 0, failed: 0 };
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_LAMBDA_URL || 'http://localhost:3000'}/rag/embed-snippets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippets: selectedSnippets.map(s => ({
            id: s.id,
            content: s.content,
            title: s.title,
            tags: s.tags,
            timestamp: s.timestamp
          }))
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate embeddings');
      }

      // Parse SSE response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      let embedded = 0;
      let skipped = 0;
      let failed = 0;
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = decoder.decode(value);
          const lines = text.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.substring(6));
              
              if (data.error) {
                throw new Error(data.error);
              }
              
              if (data.progress) {
                onProgress?.(data.progress.current, data.progress.total);
                embedded = data.progress.embedded || 0;
                skipped = data.progress.skipped || 0;
              }
              
              if (data.embedded !== undefined) {
                embedded = data.embedded;
                skipped = data.skipped || 0;
                failed = data.failed || 0;
              }
            }
          }
        }
      }

      // Update snippets with embedding status
      setSnippets(prev => prev.map(snippet => {
        if (snippetIds.includes(snippet.id)) {
          return { ...snippet, hasEmbedding: true };
        }
        return snippet;
      }));

      return { embedded, skipped, failed };
      
    } catch (error) {
      console.error('Failed to generate embeddings:', error);
      throw error;
    }
  };

  const triggerManualSync = async () => {
    if (!user?.email || !isSyncEnabled()) {
      showWarning('Cloud sync is not enabled');
      return;
    }

    try {
      console.log('Manual sync triggered');
      const remoteSnippets = await ragSyncService.pullSnippets(user.email);
      
      if (remoteSnippets && remoteSnippets.length > 0) {
        setSnippets(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const newSnippets = remoteSnippets.filter(s => !existingIds.has(s.id));
          
          const updated = prev.map(local => {
            const remote = remoteSnippets.find(r => r.id === local.id);
            if (remote && remote.updateDate > local.updateDate) {
              return remote;
            }
            return local;
          });
          
          return [...newSnippets, ...updated].sort((a, b) => b.updateDate - a.updateDate);
        });
      }
      
      // Push local changes
      if (snippets.length > 0) {
        await ragSyncService.pushSnippets(snippets, user.email);
      }
      
      console.log('Manual sync complete');
    } catch (error) {
      console.error('Manual sync failed:', error);
      showError('Manual sync failed');
    }
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
      getAllTags,
      addTagsToSnippets,
      removeTagsFromSnippets,
      storageStats,
      checkEmbeddingStatus,
      bulkCheckEmbeddingStatus,
      generateEmbeddings,
      syncStatus,
      triggerManualSync
    }}>
      {children}
    </SwagContext.Provider>
  );
};
