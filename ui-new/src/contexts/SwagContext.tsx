import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage, StorageError } from '../utils/storage';
import { useToast } from '../components/ToastManager';
import { ragSyncService } from '../services/ragSyncService';
import { isGoogleIdentityAvailable, appendRows, formatChunksForSheets } from '../services/googleSheetsClient';
import type { SyncStatus } from '../services/ragSyncService';
import { useAuth } from './AuthContext';
import { ragDB } from '../utils/ragDB';

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
  addSnippet: (content: string, sourceType: ContentSnippet['sourceType'], title?: string) => Promise<ContentSnippet | undefined>;
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
  getEmbeddingDetails: (id: string) => Promise<{ hasEmbedding: boolean; chunkCount: number; chunks: any[]; metadata?: any }>;
  bulkCheckEmbeddingStatus: () => Promise<void>;
  generateEmbeddings: (snippetIds: string[], onProgress?: (current: number, total: number) => void, force?: boolean) => Promise<{ embedded: number; skipped: number; failed: number }>;
  syncStatus: SyncStatus | null;
  triggerManualSync: () => Promise<void>;
  getUserRagSpreadsheet: () => Promise<string | null>;
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
  const { showError, showWarning, showSuccess } = useToast();
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
  const isSyncEnabled = () => {
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

  /**
   * Get or create user's RAG spreadsheet
   * Stores spreadsheet ID in localStorage for future use
   */
  const getUserRagSpreadsheet = async (): Promise<string | null> => {
    try {
      // Check if we already have spreadsheet ID cached
      const cached = localStorage.getItem('rag_spreadsheet_id');
      if (cached) {
        console.log('Using cached spreadsheet ID:', cached);
        return cached;
      }

      // Request Google Drive API OAuth access token
      let authToken = localStorage.getItem('google_drive_access_token');
      
      // If no token or token might be expired, request a new one
      if (!authToken) {
        console.log('🔑 Requesting Google Drive API access token...');
        
        try {
          // Use Google Identity Services OAuth2 token client
          const tokenClient = (window as any).google?.accounts?.oauth2?.initTokenClient({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
            callback: (response: any) => {
              if (response.access_token) {
                localStorage.setItem('google_drive_access_token', response.access_token);
                console.log('✅ Got Drive API access token');
              }
            },
          });
          
          if (!tokenClient) {
            throw new Error('Google Identity Services not available');
          }
          
          // Request access token - this will prompt user if needed
          await new Promise<void>((resolve, reject) => {
            tokenClient.callback = (response: any) => {
              if (response.error) {
                reject(new Error(response.error));
                return;
              }
              if (response.access_token) {
                authToken = response.access_token;
                localStorage.setItem('google_drive_access_token', response.access_token);
                console.log('✅ Got Drive API access token');
                resolve();
              }
            };
            tokenClient.requestAccessToken({ prompt: 'consent' });
          });
        } catch (error) {
          console.error('Failed to get Drive API token:', error);
          showError('Please grant access to Google Drive to enable sync');
          return null;
        }
      }
      
      if (!authToken) {
        console.error('No Drive API access token available');
        return null;
      }

      // Call backend to get/create spreadsheet
      const envUrl = import.meta.env.VITE_LAMBDA_URL;
      const apiUrl = (envUrl && envUrl.trim()) ? envUrl : 'http://localhost:3000';
      console.log('🌐 Calling getUserRagSpreadsheet at:', apiUrl);
      const response = await fetch(`${apiUrl}/rag/user-spreadsheet`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Backend error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        let errorMessage = `Failed to get spreadsheet: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error) {
            errorMessage = errorJson.error;
          }
        } catch (e) {
          // Not JSON, use status
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      // Cache the spreadsheet ID
      localStorage.setItem('rag_spreadsheet_id', result.spreadsheetId);
      
      if (result.created) {
        console.log('✅ Created new RAG spreadsheet:', result.spreadsheetId);
        showWarning('Created new "Research Agent Swag" spreadsheet in your Google Drive');
      } else {
        console.log('✅ Found existing RAG spreadsheet:', result.spreadsheetId);
      }

      return result.spreadsheetId;
    } catch (error) {
      console.error('Failed to get user RAG spreadsheet:', error);
      showError('Failed to access your Google Drive spreadsheet');
      return null;
    }
  };

  // Initialize sync service when user logs in
  useEffect(() => {
    const initSync = async () => {
      if (!user?.email || !isSyncEnabled() || !isLoaded) {
        return;
      }

      try {
        // Step 1: Get or create user's RAG spreadsheet
        const spreadsheetId = await getUserRagSpreadsheet();
        if (!spreadsheetId) {
          console.warn('Could not get user RAG spreadsheet');
          return;
        }

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
      const response = await fetch(`${import.meta.env.VITE_LAMBDA_URL || 'http://localhost:3000'}/rag/ingest`, {
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

  const addSnippet = async (content: string, sourceType: ContentSnippet['sourceType'], title?: string): Promise<ContentSnippet | undefined> => {
    // Check if content already exists (prevent duplicates)
    const existingSnippet = snippets.find(s => s.content.trim() === content.trim());
    
    if (existingSnippet) {
      // Update the timestamp to move it to the top
      await updateSnippet(existingSnippet.id, { updateDate: Date.now() });
      return existingSnippet;
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
    
    return newSnippet;
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
    try {
      // Check local IndexedDB instead of calling backend
      const hasEmbedding = await ragDB.hasEmbedding(id);
      return hasEmbedding;
    } catch (error) {
      console.error('Error checking embedding status:', error);
      return false;
    }
  };

  const getEmbeddingDetails = async (id: string) => {
    try {
      // Check local IndexedDB for embedding info
      const details = await ragDB.getEmbeddingDetails(id);
      if (details.hasEmbedding) {
        return details;
      }
      
      // If not in IndexedDB, check if snippet has hasEmbedding flag (set after successful embed)
      const snippet = snippets.find(s => s.id === id);
      if (snippet?.hasEmbedding) {
        // Embeddings exist in backend but not synced to IndexedDB yet
        return { hasEmbedding: true, chunkCount: 1, chunks: [] };
      }
      
      return { hasEmbedding: false, chunkCount: 0, chunks: [] };
    } catch (error) {
      console.error('Error getting embedding details:', error);
      return { hasEmbedding: false, chunkCount: 0, chunks: [] };
    }
  };

  const bulkCheckEmbeddingStatus = async () => {
    try {
      // Get all snippet IDs
      const snippetIds = snippets.map(s => s.id);
      if (snippetIds.length === 0) return;
      
      // Batch check using local IndexedDB
      const statusMap = await ragDB.bulkCheckEmbeddings(snippetIds);
      
      // Update snippets with embedding status
      setSnippets(prev => prev.map(snippet => ({
        ...snippet,
        hasEmbedding: statusMap[snippet.id] || false
      })));
      
    } catch (error) {
      console.error('Failed to check embedding status:', error);
    }
  };

  const generateEmbeddings = async (
    snippetIds: string[],
    onProgress?: (current: number, total: number) => void,
    force: boolean = false
  ): Promise<{ embedded: number; skipped: number; failed: number }> => {
    const selectedSnippets = snippets.filter(s => snippetIds.includes(s.id));
    
    if (selectedSnippets.length === 0) {
      return { embedded: 0, skipped: 0, failed: 0 };
    }

    try {
      // Step 1: Request embeddings from backend with retry logic
      let response;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount <= maxRetries) {
        try {
          response = await fetch(`${import.meta.env.VITE_LAMBDA_URL || 'http://localhost:3000'}/rag/embed-snippets`, {
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
              })),
              force
            }),
          });

          // If rate limited (429), retry with exponential backoff
          if (response.status === 429 && retryCount < maxRetries) {
            const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            console.warn(`⏳ Rate limited, retrying in ${waitTime/1000}s... (attempt ${retryCount + 1}/${maxRetries})`);
            showWarning(`⏳ Rate limited, retrying in ${waitTime/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
            continue;
          }

          // Break on success or non-retryable error
          break;

        } catch (fetchError) {
          if (retryCount < maxRetries) {
            const waitTime = Math.pow(2, retryCount) * 1000;
            console.warn(`⚠️ Fetch error, retrying in ${waitTime/1000}s...`, fetchError);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
            continue;
          }
          throw fetchError;
        }
      }

      if (!response || !response.ok) {
        const errorText = await response?.text() || 'No response';
        throw new Error(`Failed to generate embeddings: ${response?.status} ${response?.statusText}. ${errorText}`);
      }

      // Parse JSON response
      const responseData = await response.json();
      const firstEmbedding = responseData.results?.[0]?.chunks?.[0]?.embedding;
      console.log('📦 Backend response:', {
        success: responseData.success,
        resultsCount: responseData.results?.length,
        firstResult: responseData.results?.[0],
        firstChunk: responseData.results?.[0]?.chunks?.[0],
        firstChunkKeys: responseData.results?.[0]?.chunks?.[0] ? Object.keys(responseData.results[0].chunks[0]) : [],
        firstChunkEmbeddingLength: firstEmbedding?.length,
        firstChunkEmbeddingType: firstEmbedding?.constructor?.name,
        firstChunkEmbeddingFirst5: Array.isArray(firstEmbedding) ? firstEmbedding.slice(0, 5) : 'NOT_AN_ARRAY'
      });
      
      const { success, results, error } = responseData;
      
      if (!success) {
        throw new Error(error || 'Failed to generate embeddings');
      }
      
      // Step 2: Save to IndexedDB
      const embeddedSnippetIds: string[] = [];
      let totalChunks = 0;
      let embedded = 0;
      let failed = 0;
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        
        if (result.status === 'success' && result.chunks.length > 0) {
          // Debug: Check if chunks have id field
          console.log('🔍 Chunk structure check:', {
            chunkCount: result.chunks.length,
            firstChunk: result.chunks[0],
            hasId: result.chunks[0]?.id !== undefined,
            hasSnippetId: result.chunks[0]?.snippet_id !== undefined
          });
          
          try {
            // Save chunks with embeddings to IndexedDB
            await ragDB.saveChunks(result.chunks, {
              snippet_id: result.id,
              created_at: Date.now(),
              updated_at: Date.now()
            });
            
            embeddedSnippetIds.push(result.id);
            totalChunks += result.chunks.length;
            embedded++;
            
            console.log(`✅ Saved ${result.chunks.length} chunks for snippet ${result.id}`);
          } catch (saveError) {
            failed++;
            console.error(`❌ Failed to save chunks for snippet ${result.id}:`, saveError);
            // Continue processing other results
          }
          
          // Report progress
          if (onProgress) {
            onProgress(i + 1, results.length);
          }
        } else if (result.status === 'failed') {
          failed++;
          console.error(`Failed to embed snippet ${result.id}:`, result.error);
        }
      }
      
      // Step 3: Update snippet flags
      setSnippets(prev => prev.map(s => 
        embeddedSnippetIds.includes(s.id)
          ? { ...s, hasEmbedding: true }
          : s
      ));
      
      // Step 4: Auto-push to Google Sheets (hybrid approach)
      const allChunks = results
        .filter((r: any) => r.status === 'success')
        .flatMap((r: any) => r.chunks);
      
      console.log(`📊 Google Sheets sync check:`, {
        chunksToSync: allChunks.length,
        userEmail: user?.email,
        spreadsheetId: localStorage.getItem('rag_spreadsheet_id'),
        googleLinked: localStorage.getItem('rag_google_linked'),
      });
      
      if (allChunks.length > 0 && user?.email) {
        try {
          const spreadsheetId = localStorage.getItem('rag_spreadsheet_id');
          if (!spreadsheetId) {
            console.warn('⚠️ No spreadsheet ID found. Skipping Google Sheets sync.');
            console.log('💡 To enable sync: Go to Settings > RAG and configure cloud sync');
            showWarning('⚠️ Embeddings saved locally. Enable cloud sync in Settings to backup to Google Sheets.');
          } else {
            const googleLinked = localStorage.getItem('rag_google_linked') === 'true';
            const canUseClientSync = googleLinked && isGoogleIdentityAvailable();
            
            console.log(`📤 Sync method: ${canUseClientSync ? 'Client-side direct' : 'Backend'}`);
            
            if (canUseClientSync) {
              // Client-side direct sync (no Lambda, no concurrency issues)
              console.log(`📤 Using direct Google Sheets sync for ${allChunks.length} chunks (client-side)...`);
              
              try {
                const rows = formatChunksForSheets(allChunks);
                console.log(`📝 Formatted ${rows.length} rows for Google Sheets`);
                await appendRows(spreadsheetId, 'embeddings!A:K', rows);
                
                console.log('✅ Synced to Google Sheets (client-side)');
                showWarning(`✅ Synced ${allChunks.length} embeddings to Google Sheets`);
              } catch (clientError) {
                console.error('❌ Client-side sync failed, falling back to backend:', clientError);
                showWarning('⚠️ Direct sync failed, using backend fallback...');
                
                // Fallback to backend sync with delay
                setTimeout(async () => {
                  try {
                    await ragSyncService.pushEmbeddings(allChunks, (current, total) => {
                      console.log(`📤 Backend sync: ${current}/${total} chunks`);
                    });
                    console.log('✅ Synced to Google Sheets (backend fallback)');
                    showWarning(`✅ Synced ${allChunks.length} embeddings to Google Sheets (backend)`);
                  } catch (backendError) {
                    console.error('Backend sync also failed:', backendError);
                    showWarning('⚠️ Embeddings saved locally but sync to Google Sheets failed');
                  }
                }, 2000);
              }
            } else {
              // Backend sync with delay (original behavior)
              console.log(`📤 Using backend sync for ${allChunks.length} chunks (with 2s delay)...`);
              
              setTimeout(async () => {
                try {
                  console.log(`📤 Starting backend Google Sheets sync...`);
                  await ragSyncService.pushEmbeddings(allChunks, (current, total) => {
                    console.log(`📤 Syncing: ${current}/${total} chunks`);
                  });
                  
                  console.log('✅ Synced to Google Sheets (backend)');
                  showWarning(`✅ Synced ${allChunks.length} embeddings to Google Sheets`);
                } catch (syncError) {
                  console.error('Failed to sync to Google Sheets:', syncError);
                  showWarning('⚠️ Embeddings saved locally but sync to Google Sheets failed');
                }
              }, 2000);
            }
          }
        } catch (syncError) {
          console.error('Failed to queue sync:', syncError);
          // Continue - embeddings are still in IndexedDB
        }
      }
      
      console.log(`✅ Generated ${totalChunks} embeddings for ${embedded} snippets`);
      
      return {
        embedded,
        skipped: results.length - embedded - failed,
        failed
      };
      
    } catch (error) {
      console.error('Failed to generate embeddings:', error);
      throw error;
    }
  };

  const triggerManualSync = async () => {
    if (!user?.email) {
      showWarning('Please sign in with Google to sync');
      return;
    }

    if (!isSyncEnabled()) {
      showWarning('Cloud sync is not enabled. Enable it in RAG Settings first.');
      return;
    }

    try {
      console.log('📤 Manual sync triggered');
      
      // Step 1: Ensure spreadsheet exists
      console.log('📋 Ensuring spreadsheet exists...');
      const spreadsheetId = await getUserRagSpreadsheet();
      if (!spreadsheetId) {
        showError('Failed to create or access Google Sheets spreadsheet');
        return;
      }
      console.log('✅ Spreadsheet ready:', spreadsheetId);
      
      // Step 2: Pull remote snippets
      console.log('⬇️ Pulling remote snippets...');
      const remoteSnippets = await ragSyncService.pullSnippets(user.email);
      
      if (remoteSnippets && remoteSnippets.length > 0) {
        console.log(`📥 Received ${remoteSnippets.length} remote snippets`);
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
      } else {
        console.log('📭 No remote snippets found');
      }
      
      // Step 3: Push local changes
      console.log('⬆️ Pushing local snippets...');
      if (snippets.length > 0) {
        await ragSyncService.pushSnippets(snippets, user.email);
        console.log(`📤 Pushed ${snippets.length} snippets to Google Sheets`);
      } else {
        console.log('📭 No local snippets to push');
      }
      
      console.log('✅ Manual sync complete');
      showSuccess(`Synced with Google Sheets (${spreadsheetId.substring(0, 10)}...)`);
    } catch (error) {
      console.error('❌ Manual sync failed:', error);
      showError(`Manual sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      getEmbeddingDetails,
      bulkCheckEmbeddingStatus,
      generateEmbeddings,
      syncStatus,
      triggerManualSync,
      getUserRagSpreadsheet
    }}>
      {children}
    </SwagContext.Provider>
  );
};
