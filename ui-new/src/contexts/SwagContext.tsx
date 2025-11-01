import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { storage, StorageError } from '../utils/storage';
import { useToast } from '../components/ToastManager';
import { ragSyncService } from '../services/ragSyncService';
import { isGoogleIdentityAvailable, appendRows, formatChunksForSheets, getAccessToken } from '../services/googleSheetsClient';
import type { SyncStatus } from '../services/ragSyncService';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { useProject } from './ProjectContext';
import { ragDB } from '../utils/ragDB';
import { fetchSnippetById } from '../services/snippetsSync';
import { getCachedApiBase } from '../utils/api';
import { googleDriveSync } from '../services/googleDriveSync';

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
  projectId?: string;  // Associated project for filtering
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
  syncSnippetFromGoogleSheets: (snippetId: number) => Promise<void>;
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
  const [allSnippets, setAllSnippets] = useState<ContentSnippet[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageStats, setStorageStats] = useState<{ totalSize: number; limit: number; percentUsed: number } | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const { showError, showWarning, showSuccess, showPersistentToast, removeToast, updateToast } = useToast();
  const { user, getToken } = useAuth();
  const { settings } = useSettings();
  const { getCurrentProjectId } = useProject();

  // Filter snippets by current project
  const snippets = useMemo(() => {
    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) {
      // No project selected - show all snippets
      return allSnippets;
    }
    // Filter by current project
    return allSnippets.filter(s => s.projectId === currentProjectId);
  }, [allSnippets, getCurrentProjectId]);

  // Load from storage on mount and sync with Google Drive
  useEffect(() => {
    const loadSnippets = async () => {
      try {
        const saved = await storage.getItem<ContentSnippet[]>('swag-snippets');
        if (saved) {
          setAllSnippets(saved);
        }
        setIsLoaded(true);
        
        // Check for newer data in Google Drive after local load
        if (isSyncEnabled()) {
          try {
            console.log('🔄 Checking Google Drive for newer snippets and embeddings...');
            
            // Sync snippets
            const snippetsResult = await googleDriveSync.syncSnippets();
            if (snippetsResult.success && snippetsResult.action === 'downloaded') {
              console.log(`📥 Downloaded ${snippetsResult.itemCount} snippets from Google Drive`);
              // Reload snippets after download
              const updated = await storage.getItem<ContentSnippet[]>('swag-snippets');
              if (updated) {
                setAllSnippets(updated);
              }
            }
            
            // Sync embeddings
            const embeddingsResult = await googleDriveSync.syncEmbeddings();
            if (embeddingsResult.success && embeddingsResult.action === 'downloaded') {
              console.log(`📥 Downloaded ${embeddingsResult.itemCount} embeddings from Google Drive`);
            }
          } catch (error) {
            console.error('Failed to sync with Google Drive on load:', error);
          }
        }
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
        await storage.setItem('swag-snippets', allSnippets);
        
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
  }, [allSnippets, isLoaded, showError, showWarning]);

  // Debounced sync to Google Drive when snippets change
  useEffect(() => {
    if (!isLoaded) return; // Don't sync during initial load
    if (!isSyncEnabled()) return; // Only sync if authenticated

    const syncTimeout = setTimeout(async () => {
      try {
        console.log('🔄 Syncing snippets to Google Drive...');
        const result = await googleDriveSync.syncSnippets();
        if (result.success && result.action !== 'no-change') {
          console.log(`✅ Snippets synced: ${result.action} (${result.itemCount} items)`);
        }
      } catch (error) {
        console.error('Failed to sync snippets to Google Drive:', error);
      }
    }, 10000); // Wait 10 seconds after last change

    return () => clearTimeout(syncTimeout);
  }, [snippets, isLoaded]);

  // Helper to check if cloud sync is available (user is authenticated)
  const isSyncEnabled = () => {
    try {
      const accessToken = localStorage.getItem('google_drive_access_token');
      return !!accessToken && accessToken.length > 0;
    } catch (error) {
      console.error('Failed to check authentication:', error);
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
        
        // Check if Google Identity Services is available
        if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
          console.error('❌ Google Identity Services not available. The library may not have loaded yet.');
          console.log('💡 This usually happens if the page loads before Google GSI library is ready.');
          console.log('💡 Try: 1) Refresh the page, 2) Check internet connection, 3) Check browser console for script loading errors');
          throw new Error('Google Identity Services not available - library not loaded');
        }
        
        try {
          // Use Google Identity Services OAuth2 token client
          const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: import.meta.env.VITE_GGL_CID,
            scope: 'https://www.googleapis.com/auth/drive.file', // Only files created by this app
            callback: async (tokenResponse: any) => {
              if (tokenResponse.access_token) {
                // Sanitize token: remove whitespace and newlines before storing
                const sanitizedToken = tokenResponse.access_token.trim().replace(/[\r\n]/g, '');
                localStorage.setItem('google_drive_access_token', sanitizedToken);
                console.log('✅ Got Drive API access token');
              }
            },
          });
          
          if (!tokenClient) {
            throw new Error('Failed to initialize Google token client');
          }
          
          // Request access token - this will prompt user if needed
          await new Promise<void>((resolve, reject) => {
            (tokenClient as any).callback = (response: any) => {
              if (response.error) {
                console.error('OAuth error:', response.error);
                reject(new Error(`OAuth error: ${response.error}`));
                return;
              }
              if (response.access_token) {
                // Sanitize token: remove whitespace and newlines before storing
                const sanitizedToken = response.access_token.trim().replace(/[\r\n]/g, '');
                authToken = sanitizedToken;
                localStorage.setItem('google_drive_access_token', sanitizedToken);
                console.log('✅ Got Drive API access token');
                resolve();
              } else {
                reject(new Error('No access token received'));
              }
            };
            
            console.log('📋 Requesting Google Drive & Sheets permissions...');
            tokenClient.requestAccessToken({ prompt: '' }); // Empty prompt = only show if needed
          });
        } catch (error) {
          console.error('Failed to get Drive API token:', error);
          throw new Error('Please grant access to Google Drive and Sheets to enable cloud sync');
        }
      } else {
        console.log('✅ Using cached Drive API access token');
      }
      
      if (!authToken) {
        console.error('No Drive API access token available');
        throw new Error('No Drive API access token - unable to access Google Sheets');
      }

      // Call backend to get/create spreadsheet
      const apiUrl = await getCachedApiBase();
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
      // Return null and let the caller handle the error display
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
          console.warn('Could not get user RAG spreadsheet - sync disabled');
          // Show helpful message if user is authenticated but spreadsheet couldn't be accessed
          showWarning('Cannot access Google Sheets. Please check your Google Drive connection in Settings > Cloud Sync.');
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
        const token = await getToken();
        const remoteSnippets = await ragSyncService.pullSnippets(user.email, token || undefined);
        
        if (remoteSnippets && remoteSnippets.length > 0) {
          // Merge downloaded snippets with local ones
          setAllSnippets(prev => {
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
          await ragSyncService.pushSnippets(snippets, user.email, token || undefined);
        }

        // Start auto-sync
        ragSyncService.startAutoSync();
        console.log('✅ RAG sync initialized and auto-sync started');
      } catch (error) {
        console.error('Failed to initialize sync:', error);
        // Show error if authentication present but sync failing
        showError('Cloud sync failed to initialize. Check your Google Drive connection in Settings > Cloud Sync.');
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
      const apiUrl = await getCachedApiBase();
      const response = await fetch(`${apiUrl}/rag/ingest`, {
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
      setAllSnippets(prev => prev.map(snippet =>
        snippet.id === snippetId ? { ...snippet, hasEmbedding: true } : snippet
      ));

    } catch (error) {
      console.error('Auto-embed failed:', error);
    }
  };

  const addSnippet = async (content: string, sourceType: ContentSnippet['sourceType'], title?: string): Promise<ContentSnippet | undefined> => {
    // Check if content already exists (prevent duplicates)
    const existingSnippet = allSnippets.find(s => s.content.trim() === content.trim());
    
    if (existingSnippet) {
      // Update the timestamp to move it to the top
      await updateSnippet(existingSnippet.id, { updateDate: Date.now() });
      return existingSnippet;
    }
    
    const now = Date.now();
    const currentProjectId = getCurrentProjectId();
    const newSnippet: ContentSnippet = {
      id: `snippet-${now}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      title,
      sourceType,
      timestamp: now,
      updateDate: now,
      selected: false,
      projectId: currentProjectId || undefined  // Auto-tag with current project
    };
    setAllSnippets(prev => [newSnippet, ...prev]);

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
    setAllSnippets(prev => prev.map(snippet => 
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
    setAllSnippets(prev => prev.filter(snippet => !ids.includes(snippet.id)));
    
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

    setAllSnippets(prev => [
      newSnippet,
      ...prev.filter(snippet => !ids.includes(snippet.id))
    ]);
  };

  const toggleSelection = (id: string) => {
    setAllSnippets(prev => prev.map(snippet =>
      snippet.id === id ? { ...snippet, selected: !snippet.selected } : snippet
    ));
  };

  const selectAll = () => {
    setAllSnippets(prev => prev.map(snippet => ({ ...snippet, selected: true })));
  };

  const selectNone = () => {
    setAllSnippets(prev => prev.map(snippet => ({ ...snippet, selected: false })));
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
    setAllSnippets(prev => prev.map(snippet => {
      if (ids.includes(snippet.id)) {
        const existingTags = snippet.tags || [];
        const newTags = [...new Set([...existingTags, ...tags])];
        return { ...snippet, tags: newTags, updateDate: Date.now() };
      }
      return snippet;
    }));
  };

  const removeTagsFromSnippets = (ids: string[], tags: string[]) => {
    setAllSnippets(prev => prev.map(snippet => {
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
      setAllSnippets(prev => prev.map(snippet => ({
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

    // Filter out snippets that already have embeddings (unless force=true)
    let snippetsToEmbed = selectedSnippets;
    let skippedCount = 0;
    
    if (!force) {
      const statusMap = await ragDB.bulkCheckEmbeddings(snippetIds);
      const alreadyIndexed = snippetIds.filter(id => statusMap[id]);
      
      if (alreadyIndexed.length > 0) {
        console.log(`⏭️ Skipping ${alreadyIndexed.length} already indexed snippets:`, alreadyIndexed);
        snippetsToEmbed = selectedSnippets.filter(s => !statusMap[s.id]);
        skippedCount = alreadyIndexed.length;
        
        if (snippetsToEmbed.length === 0) {
          console.log('✅ All selected snippets already have embeddings');
          showWarning(`✅ All ${selectedSnippets.length} snippets already indexed`);
          return { embedded: 0, skipped: skippedCount, failed: 0 };
        }
        
        showWarning(`⏭️ Skipping ${skippedCount} already indexed, generating ${snippetsToEmbed.length} new embeddings`);
      }
    }

    try {
      // Check if local embeddings are selected
      const useLocalEmbeddings = settings.embeddingSource === 'local';
      console.log(`🔍 Embedding source check: embeddingSource="${settings.embeddingSource}", useLocalEmbeddings=${useLocalEmbeddings}, embeddingModel="${settings.embeddingModel}"`);
      let results: any[] = [];
      
      if (useLocalEmbeddings) {
        // ============ LOCAL BROWSER-BASED EMBEDDINGS ============
        console.log('🏠 Using local browser-based embeddings');
        
        // Dynamically import LocalEmbeddingService to avoid bundling issues
        const { getLocalEmbeddingService } = await import('../services/localEmbeddings');
        const embeddingService = getLocalEmbeddingService();
        
        // Get selected model (default to recommended)
        const modelId = settings.embeddingModel || 'Xenova/all-MiniLM-L6-v2';
        const modelName = modelId.replace('Xenova/', '');
        console.log(`📦 Loading model: ${modelId}`);
        
        // Show persistent toast with progress bar
        let toastId: string | null = null;
        toastId = showPersistentToast(`🔄 Loading local model ${modelName}...`, 'info');
        
        // Load model with progress feedback
        await embeddingService.loadModel(modelId, (progress) => {
          console.log(`⏳ ${progress.message} (${progress.progress}%)`);
          if (toastId) {
            const percentage = Math.round(progress.progress);
            updateToast(toastId, `🔄 Loading local model ${modelName}... ${percentage}%`, percentage);
          }
        });
        
        if (toastId) {
          removeToast(toastId);
          toastId = null;
        }
        
        console.log('✅ Model loaded, generating embeddings...');
        
        // Process each snippet
        for (let i = 0; i < snippetsToEmbed.length; i++) {
          const snippet = snippetsToEmbed[i];
          
          try {
            // Notify progress
            if (onProgress) {
              onProgress(i + 1, snippetsToEmbed.length);
            }
            
            // Generate embedding for full content (with metadata prefix like API version)
            const metadataPrefix = [];
            if (snippet.title) {
              metadataPrefix.push(`Title: ${snippet.title}`);
            }
            if (snippet.tags && snippet.tags.length > 0) {
              metadataPrefix.push(`Tags: ${snippet.tags.join(', ')}`);
            }
            const metadataText = metadataPrefix.length > 0 ? metadataPrefix.join('\n') + '\n\n' : '';
            const fullText = metadataText + snippet.content;
            
            // Generate embedding
            const embedding = await embeddingService.generateEmbedding(fullText);
            
            // Create chunk object compatible with ragDB
            const chunk = {
              id: `${snippet.id}_0`, // Single chunk per snippet for local embeddings
              snippet_id: snippet.id,
              chunk_text: snippet.content,
              chunk_index: 0,
              start_char: 0,
              end_char: snippet.content.length,
              embedding: embedding,
              created_at: Date.now(),
              updated_at: Date.now()
            };
            
            results.push({
              id: snippet.id,
              status: 'success',
              chunks: [chunk]
            });
            
          } catch (error) {
            console.error(`❌ Failed to embed snippet ${snippet.id}:`, error);
            results.push({
              id: snippet.id,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              chunks: []
            });
          }
        }
        
      } else {
        // ============ API-BASED EMBEDDINGS (EXISTING LOGIC) ============
        // Step 1: Request embeddings from backend with retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount <= maxRetries) {
          try {
            const apiUrl = await getCachedApiBase();
            const token = await getToken();
            
            // Check authentication before proceeding
            if (!token) {
              throw new Error(
                `🔐 Authentication Required\n\n` +
                `To generate embeddings, you need to sign in with Google.\n\n` +
                `📝 Steps:\n` +
                `1. Click the profile icon in the top right\n` +
                `2. Click "Sign in with Google"\n` +
                `3. Authorize the application\n` +
                `4. Try generating embeddings again\n\n` +
                `💡 Note: Embeddings enable vector search and semantic similarity in SWAG.`
              );
            }
            
            // Format providers for backend (only enabled providers with embedding capability)
            const providers = settings.providers
              .filter(p => p.enabled !== false && p.capabilities?.embedding !== false)
              .map(p => ({
                type: p.type,
                apiKey: p.apiKey,
                apiEndpoint: p.apiEndpoint,
                modelName: p.modelName,
                allowedModels: p.allowedModels,
                maxImageQuality: p.maxImageQuality
              }));
            
            // Include selected embedding model from settings
            const embeddingModel = settings.embeddingModel || undefined;
            
            response = await fetch(`${apiUrl}/rag/embed-snippets`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                snippets: snippetsToEmbed.map(s => ({
                  id: s.id,
                  content: s.content,
                  title: s.title,
                  tags: s.tags,
                  timestamp: s.timestamp
                })),
                providers,  // Include providers in request
                embeddingModel, // Include selected embedding model
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
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText };
          }
          
          // Check for specific error about missing embedding provider
          if (errorData.requiredAction === 'CONFIGURE_EMBEDDING_PROVIDER' || 
              (errorData.error && errorData.error.includes('No embedding provider'))) {
            throw new Error(
              `⚙️ Embedding Provider Required\n\n` +
              `To use Swag embeddings and vector search, you need to configure a provider that supports embeddings.\n\n` +
              `📝 Steps:\n` +
              `1. Go to Settings (gear icon)\n` +
              `2. Click "Providers" tab\n` +
              `3. Add a provider: OpenAI, Together.AI, Cohere, or Voyage\n` +
              `4. Enable the "🔗 Embeddings" capability\n` +
              `5. Save and try again\n\n` +
              `💡 Note: Swag embeddings work independently of the RAG system. You just need one embedding-capable provider configured.`
            );
          }
          
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
        
        const { success, error } = responseData;
        results = responseData.results;
        
        if (!success) {
          throw new Error(error || 'Failed to generate embeddings');
        }
      } // End of API-based embeddings if/else
      
      // ============ COMMON LOGIC: Save results to IndexedDB ============
      // At this point, both local and API paths have `results` array available
      
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
      setAllSnippets(prev => prev.map(s => 
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
            console.log('💡 To enable sync: Go to Settings > Cloud Sync and connect Google Drive');
            showWarning('⚠️ Embeddings saved locally. Connect Google Drive in Cloud Sync settings to enable automatic backup.');
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
                await appendRows(spreadsheetId, 'RAG_Embeddings_v1!A:K', rows);
                
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
      
      // Sync embeddings to Google Drive immediately (no debounce)
      if (isSyncEnabled()) {
        // Fire and forget - don't block return
        (async () => {
          try {
            console.log('🔄 Syncing embeddings to Google Drive...');
            const result = await googleDriveSync.syncEmbeddings();
            if (result.success && result.action !== 'no-change') {
              console.log(`✅ Embeddings synced: ${result.action} (${result.itemCount} chunks)`);
            }
          } catch (error) {
            console.error('Failed to sync embeddings to Google Drive:', error);
          }
        })();
      }
      
      return {
        embedded,
        skipped: skippedCount + (results.length - embedded - failed),
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
      showWarning('Cloud sync requires Google Drive connection. Go to Settings > Cloud Sync to connect.');
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
      
      // Step 2: Pull remote snippets from Google Sheets
      console.log('⬇️ Pulling remote snippets...');
      try {
        const driveToken = localStorage.getItem('google_drive_access_token');
        if (!driveToken) {
          console.warn('No Drive token available for pull');
        } else {
          const rows = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/RAG_Snippets_v1!A2:J10000`,
            {
              headers: { Authorization: `Bearer ${driveToken}` }
            }
          ).then(r => r.json()).then(data => data.values || []);
          
          if (rows.length > 0) {
            console.log(`📥 Received ${rows.length} rows from Sheets`);
            
            // Reassemble chunked snippets
            const snippetChunks = new Map<string, any[]>();
            rows.forEach((row: any[]) => {
              const id = row[0];
              if (!snippetChunks.has(id)) {
                snippetChunks.set(id, []);
              }
              snippetChunks.get(id)!.push(row);
            });
            
            const remoteSnippets: ContentSnippet[] = [];
            snippetChunks.forEach((chunks, id) => {
              // Sort chunks by chunk_index
              chunks.sort((a, b) => parseInt(a[8] || '1') - parseInt(b[8] || '1'));
              
              // Reassemble content from all chunks
              const firstChunk = chunks[0];
              const content = chunks.map(chunk => chunk[2] || '').join('');
              
              remoteSnippets.push({
                id,
                title: firstChunk[1] || '',
                content,
                timestamp: parseInt(firstChunk[5]) || Date.now(),
                updateDate: parseInt(firstChunk[6]) || Date.now(),
                sourceType: (firstChunk[7] || 'user') as ContentSnippet['sourceType'],
                tags: firstChunk[4] ? JSON.parse(firstChunk[4]) : [],
              });
            });
            
            console.log(`📦 Reassembled ${remoteSnippets.length} snippets from ${rows.length} rows`);
            
            setAllSnippets(prev => {
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
        }
      } catch (pullError) {
        console.error('⚠️ Pull failed:', pullError);
        // Continue to push even if pull fails
      }
      
      // Step 3: Push local snippets to Google Sheets
      console.log('⬆️ Pushing local snippets...');
      if (snippets.length > 0) {
        const driveToken = localStorage.getItem('google_drive_access_token');
        if (!driveToken) {
          showError('No Drive API access token available');
          return;
        }
        
        // Format snippets for sheets - split large content into chunks
        const CELL_MAX_CHARS = 49000; // Stay under 50k limit with safety margin
        const rows: any[] = [];
        
        snippets.forEach(s => {
          const content = s.content || '';
          
          if (content.length <= CELL_MAX_CHARS) {
            // Single row for small content
            rows.push([
              s.id,
              s.title || '',
              content,
              '', // source (deprecated)
              JSON.stringify(s.tags || []),
              s.timestamp.toString(),
              s.updateDate.toString(),
              s.sourceType,
              '1', // chunk_index
              '1', // total_chunks
            ]);
          } else {
            // Split large content into multiple rows
            const totalChunks = Math.ceil(content.length / CELL_MAX_CHARS);
            for (let i = 0; i < totalChunks; i++) {
              const chunkStart = i * CELL_MAX_CHARS;
              const chunkEnd = Math.min((i + 1) * CELL_MAX_CHARS, content.length);
              const chunk = content.substring(chunkStart, chunkEnd);
              
              rows.push([
                s.id,
                i === 0 ? (s.title || '') : '', // Only first row has title
                chunk,
                '', // source (deprecated)
                i === 0 ? JSON.stringify(s.tags || []) : '[]', // Only first row has tags
                s.timestamp.toString(),
                s.updateDate.toString(),
                s.sourceType,
                (i + 1).toString(), // chunk_index (1-based)
                totalChunks.toString(), // total_chunks
              ]);
            }
          }
        });
        
        console.log(`📝 Prepared ${rows.length} rows from ${snippets.length} snippets`);
        
        // Clear existing data first
        console.log('🗑️ Clearing existing data...');
        const clearResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/RAG_Snippets_v1!A2:J10000:clear`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${driveToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (!clearResponse.ok) {
          const errorText = await clearResponse.text();
          console.error('Clear error:', errorText);
        }
        
        // Update (overwrite) all snippets at once
        console.log(`📝 Writing ${rows.length} rows...`);
        const updateResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/RAG_Snippets_v1!A2?valueInputOption=RAW`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${driveToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: rows })
          }
        );
        
        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('❌ Update error:', errorText);
          throw new Error(`Failed to update sheet: ${updateResponse.status} ${errorText}`);
        }
        
        const updateResult = await updateResponse.json();
        console.log(`📤 Pushed ${snippets.length} snippets (${rows.length} rows) to Google Sheets`, updateResult);
      } else {
        console.log('📭 No local snippets to push');
      }
      
      console.log('✅ Manual sync complete');
      showSuccess(`Synced ${snippets.length} snippets with Google Sheets`);
    } catch (error) {
      console.error('❌ Manual sync failed:', error);
      showError(`Manual sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  /**
   * Sync a specific snippet from Google Sheets by ID
   * Called when backend emits 'snippet_sync' event after creating a snippet
   */
  const syncSnippetFromGoogleSheets = async (snippetId: number): Promise<void> => {
    try {
      console.log(`🔄 Syncing snippet #${snippetId} from Google Sheets...`);
      
      // Get Drive access token for Google Sheets API
      const driveToken = await getAccessToken();
      
      if (!driveToken) {
        throw new Error('No Drive access token available');
      }
      
      // Fetch the snippet from Google Sheets
      const snippet = await fetchSnippetById(snippetId, driveToken);
      
      if (!snippet) {
        console.warn(`⚠️ Snippet #${snippetId} not found in Google Sheets`);
        return;
      }
      
      // Check if snippet already exists in localStorage (by sheet ID or content)
      const existingSnippet = snippets.find(s => 
        s.id === snippet.id || s.content.trim() === snippet.content.trim()
      );
      
      if (existingSnippet) {
        console.log(`✅ Snippet #${snippetId} already exists in localStorage, updating timestamp`);
        // Update to move it to the top
        await updateSnippet(existingSnippet.id, { updateDate: Date.now() });
        showSuccess(`Snippet "${snippet.title || 'Untitled'}" synced from Google Sheets`);
        return;
      }
      
      // Add snippet to localStorage
      setAllSnippets(prev => [snippet, ...prev]);
      showSuccess(`Snippet "${snippet.title || 'Untitled'}" synced from Google Sheets`);
      console.log(`✅ Synced snippet #${snippetId} from Google Sheets:`, snippet.title);
      
      // Auto-embed if enabled
      await autoEmbedSnippet(snippet.id, snippet.content, snippet.title);
    } catch (error) {
      console.error(`❌ Failed to sync snippet #${snippetId}:`, error);
      showError(`Failed to sync snippet: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      getUserRagSpreadsheet,
      syncSnippetFromGoogleSheets
    }}>
      {children}
    </SwagContext.Provider>
  );
};
