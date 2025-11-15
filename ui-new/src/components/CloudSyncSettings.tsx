import React, { useState, useEffect } from 'react';
import './CloudSyncSettings.css';
import { googleDriveSync } from '../services/googleDriveSync';
import { googleAuth } from '../services/googleAuth';

interface CloudSyncSettingsProps {
  onClose?: () => void;
}

const CloudSyncSettings: React.FC<CloudSyncSettingsProps> = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [syncProgress, setSyncProgress] = useState<{
    operation: string | null;
    progress: number;
    total: number;
  }>({ operation: null, progress: 0, total: 0 });
  const [syncMetadata, setSyncMetadata] = useState<{
    plansCount: number;
    playlistsCount: number;
    snippetsCount: number;
    embeddingsCount: number;
    chatHistoryCount: number;
    quizProgressCount: number;
    settingsCount: number;
    imagesCount: number;
  }>({ 
    plansCount: 0, 
    playlistsCount: 0, 
    snippetsCount: 0, 
    embeddingsCount: 0,
    chatHistoryCount: 0,
    quizProgressCount: 0,
    settingsCount: 0,
    imagesCount: 0
  });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(
    localStorage.getItem('auto_sync_enabled') === 'true'
  );

  // Load sync metadata and actual local counts
  const loadSyncMetadata = async () => {
    try {
      const metadata = await googleDriveSync.getSyncMetadata();
      setLastSyncTime(metadata.lastSyncTime);
      
      // Get actual local counts from IndexedDB and localStorage
      // Import IndexedDB modules dynamically to get counts
      const { planningDB } = await import('../utils/planningDB');
      const { playlistDB } = await import('../utils/playlistDB');
      const { quizDB } = await import('../db/quizDb');
      const { ragDB } = await import('../utils/ragDB');
      const { chatHistoryDB } = await import('../utils/chatHistoryDB');
      
      // Get counts from IndexedDB
      const plans = await planningDB.getAllPlans();
      const playlists = await playlistDB.listPlaylists();
      const quizStats = await quizDB.getQuizStatistics();
      const embeddingChunks = await ragDB.getAllChunks();
      const chatHistory = await chatHistoryDB.getAllChats();
      
      // Get snippets from storage utility (could be IndexedDB or localStorage)
      const { storage } = await import('../utils/storage');
      const snippets = await storage.getItem<any[]>('swag-snippets') || [];
      
      // Get images from IndexedDB
      const { imageStorage } = await import('../utils/imageStorage');
      const images = await imageStorage.getAllImages();
      
      // Check if settings exist in localStorage
      // Look for common settings keys (exclude auth tokens and sync-related keys)
      const settingsKeys = [
        'auto_sync_enabled', 'proxy_settings', 'rag_config', 
        'playbackRate', 'volume', 'repeatMode', 'shuffleMode', 'videoQuality',
        'user_location', 'has_completed_welcome_wizard'
      ];
      
      let settingsCount = 0;
      for (const key of settingsKeys) {
        if (localStorage.getItem(key) !== null) {
          settingsCount++;
        }
      }
      
      console.log('📊 Loaded sync metadata counts:', {
        plans: plans.length,
        playlists: playlists.length,
        snippets: snippets.length,
        embeddings: embeddingChunks.length,
        chatHistory: chatHistory.length,
        quizProgress: quizStats.length,
        settings: settingsCount,
        images: images.length
      });
      
      setSyncMetadata({
        plansCount: plans.length,
        playlistsCount: playlists.length,
        snippetsCount: snippets.length,
        embeddingsCount: embeddingChunks.length,
        chatHistoryCount: chatHistory.length,
        quizProgressCount: quizStats.length,
        settingsCount: settingsCount,
        imagesCount: images.length
      });
    } catch (error) {
      console.error('Failed to load sync metadata:', error);
    }
  };

  // Handle manual sync
  const handleSync = async () => {
    // Check if sync is already in progress
    if (googleDriveSync.isSyncInProgress()) {
      setError('Sync already in progress. Please wait for it to complete.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setIsSyncing(true);
    setSyncStatus(null);
    setError(null);

    try {
      const result = await googleDriveSync.syncAll();
      
      // Format status message
      const messages: string[] = [];
      if (result.plans.action === 'uploaded') {
        messages.push(`Uploaded ${result.plans.itemCount} plan(s)`);
      } else if (result.plans.action === 'downloaded') {
        messages.push(`Downloaded ${result.plans.itemCount} plan(s)`);
      }
      
      if (result.playlists.action === 'uploaded') {
        messages.push(`Uploaded ${result.playlists.itemCount} playlist(s)`);
      } else if (result.playlists.action === 'downloaded') {
        messages.push(`Downloaded ${result.playlists.itemCount} playlist(s)`);
      }
      
      if (result.snippets.action === 'uploaded') {
        messages.push(`Uploaded ${result.snippets.itemCount} snippet(s)`);
      } else if (result.snippets.action === 'downloaded') {
        messages.push(`Downloaded ${result.snippets.itemCount} snippet(s)`);
      }
      
      if (result.embeddings.action === 'uploaded') {
        messages.push(`Uploaded ${result.embeddings.itemCount} embedding(s)`);
      } else if (result.embeddings.action === 'downloaded') {
        messages.push(`Downloaded ${result.embeddings.itemCount} embedding(s)`);
      }
      
      if (result.chatHistory.action === 'uploaded') {
        messages.push(`Uploaded ${result.chatHistory.itemCount} chat(s)`);
      } else if (result.chatHistory.action === 'downloaded') {
        messages.push(`Downloaded ${result.chatHistory.itemCount} chat(s)`);
      }
      
      if (result.quizProgress.action === 'uploaded') {
        messages.push(`Uploaded ${result.quizProgress.itemCount} quiz stat(s)`);
      } else if (result.quizProgress.action === 'downloaded') {
        messages.push(`Downloaded ${result.quizProgress.itemCount} quiz stat(s)`);
      }
      
      if (result.settings.action === 'uploaded') {
        messages.push(`Uploaded settings`);
      } else if (result.settings.action === 'downloaded') {
        messages.push(`Downloaded settings`);
      }
      
      if (result.images.action === 'uploaded') {
        messages.push(`Uploaded ${result.images.itemCount} image(s)`);
      } else if (result.images.action === 'downloaded') {
        messages.push(`Downloaded ${result.images.itemCount} image(s)`);
      }
      
      if (messages.length === 0) {
        setSyncStatus('Everything is up to date');
      } else {
        setSyncStatus(messages.join(', '));
      }
      
      // Reload metadata
      await loadSyncMetadata();
      
      // Dispatch event to notify other components (like SwagContext) that sync completed
      // This allows them to reload their data from storage
      window.dispatchEvent(new CustomEvent('cloud_sync_completed', { 
        detail: { 
          snippetsDownloaded: result.snippets.action === 'downloaded',
          imagesDownloaded: result.images.action === 'downloaded',
          snippetsCount: result.snippets.itemCount,
          imagesCount: result.images.itemCount
        } 
      }));
      
      console.log('✅ Sync completed:', result);
    } catch (err: any) {
      setError(err.message || 'Sync failed');
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle auto-sync
  const handleAutoSyncToggle = async () => {
    const newValue = !autoSyncEnabled;
    setAutoSyncEnabled(newValue);
    localStorage.setItem('auto_sync_enabled', String(newValue));
    
    // If enabling auto-sync, trigger immediate sync
    if (newValue && isAuthenticated) {
      try {
        console.log('🔄 Auto-sync enabled, triggering immediate sync...');
        await googleDriveSync.triggerImmediateSync();
      } catch (err) {
        console.warn('⚠️ Initial sync after enabling auto-sync failed:', err);
      }
    }
  };

  // Format last sync time
  const formatLastSyncTime = (timestamp: number): string => {
    if (timestamp === 0) return 'Never';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return `${Math.floor(diff / 86400000)} days ago`;
  };

  // Check authentication status on mount
  useEffect(() => {
    // Use unified auth service
    const isAuth = googleAuth.isAuthenticated();
    const hasDrive = googleAuth.hasDriveAccess();
    const userProfile = googleAuth.getUserProfile();
    
    // Only set authenticated if user has Drive access
    setIsAuthenticated(isAuth && hasDrive);
    setUserEmail(userProfile?.email || null);
    
    if (isAuth && hasDrive) {
      loadSyncMetadata();
    }
    
    // Listen for auth changes
    const handleAuthSuccess = () => {
      const profile = googleAuth.getUserProfile();
      const hasDriveAccess = googleAuth.hasDriveAccess();
      setIsAuthenticated(hasDriveAccess);
      setUserEmail(profile?.email || null);
      
      if (hasDriveAccess) {
        loadSyncMetadata();
        
        // Trigger immediate sync after successful login (if cloud sync is enabled)
        googleDriveSync.triggerImmediateSync().catch(err => {
          console.warn('⚠️ Post-login sync failed:', err);
        });
      }
    };
    
    const handleAuthSignout = () => {
      setIsAuthenticated(false);
      setUserEmail(null);
    };
    
    const handleDriveDisconnected = () => {
      setIsAuthenticated(false);
      // Keep userEmail since they're still logged in to the main app
    };
    
    window.addEventListener('google-auth-success', handleAuthSuccess);
    window.addEventListener('google-auth-signout', handleAuthSignout);
    window.addEventListener('google-drive-disconnected', handleDriveDisconnected);
    
    // Check if sync is already in progress when component mounts
    const currentSyncStatus = googleDriveSync.getSyncStatus();
    if (currentSyncStatus.inProgress) {
      setIsSyncing(true);
      setSyncProgress({
        operation: currentSyncStatus.operation,
        progress: currentSyncStatus.progress,
        total: currentSyncStatus.total
      });
      console.log('🔔 [CloudSyncSettings] Sync already in progress on mount:', currentSyncStatus.operation);
    }
    
    return () => {
      window.removeEventListener('google-auth-success', handleAuthSuccess);
      window.removeEventListener('google-auth-signout', handleAuthSignout);
      window.removeEventListener('google-drive-disconnected', handleDriveDisconnected);
    };
  }, []);

  // Poll for sync status updates every second when mounted
  useEffect(() => {
    const pollInterval = setInterval(() => {
      const currentSyncStatus = googleDriveSync.getSyncStatus();
      
      // Update sync state based on polling
      if (currentSyncStatus.inProgress) {
        setIsSyncing(true);
        setSyncProgress({
          operation: currentSyncStatus.operation,
          progress: currentSyncStatus.progress,
          total: currentSyncStatus.total
        });
      } else if (isSyncing) {
        // Sync just completed
        console.log('🔔 [CloudSyncSettings] Sync completed (detected via polling)');
        setTimeout(() => {
          setIsSyncing(false);
          setSyncProgress({ operation: null, progress: 0, total: 0 });
          loadSyncMetadata();
        }, 1000);
      }
    }, 1000); // Poll every second

    return () => clearInterval(pollInterval);
  }, [isSyncing]);

  // Listen for sync progress events
  useEffect(() => {
    const handleSyncProgress = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { operation, progress, total } = customEvent.detail;
      setSyncProgress({ operation, progress, total });
      setIsSyncing(true);
      console.log('🔔 [CloudSyncSettings] Sync progress:', operation, `(${progress}/${total})`);
    };

    const handleSyncComplete = () => {
      console.log('🔔 [CloudSyncSettings] Sync complete');
      // Keep the progress visible for a moment before clearing
      setTimeout(() => {
        setSyncProgress({ operation: null, progress: 0, total: 0 });
        setIsSyncing(false);
        // Reload metadata to show updated counts
        loadSyncMetadata();
      }, 1000);
    };

    window.addEventListener('sync-progress', handleSyncProgress);
    window.addEventListener('sync-complete', handleSyncComplete);

    return () => {
      window.removeEventListener('sync-progress', handleSyncProgress);
      window.removeEventListener('sync-complete', handleSyncComplete);
    };
  }, []);

  // Handle Google Drive authentication
  const handleGoogleAuth = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Use unified auth service - request Drive permissions
      await googleAuth.init();
      const granted = await googleAuth.requestDriveAccess();
      
      if (!granted) {
        setError('Drive permissions not granted. Please allow access to use cloud sync features.');
        setIsLoading(false);
        return;
      }
      
      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate with Google');
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Revoke Drive permissions with Google
      await googleAuth.revokeDriveAccess();
      setIsAuthenticated(false);
      setUserEmail(null);
      setIsLoading(false);
    } catch (err: any) {
      // Even if revocation fails, clear local state
      googleAuth.signOut();
      setIsAuthenticated(false);
      setUserEmail(null);
      setError(err.message || 'Failed to revoke Drive permissions');
      setIsLoading(false);
    }
  };

  return (
    <div className="cloud-sync-settings">
      <h2>Cloud Sync Settings</h2>
      
      {/* Global Sync Status Banner - Shows for both manual and auto sync */}
      {isSyncing && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-blue-900 dark:text-blue-100">
                {syncProgress.operation || 'Syncing...'}
              </div>
              {syncProgress.total > 0 && (
                <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Step {syncProgress.progress} of {syncProgress.total}
                </div>
              )}
            </div>
            {syncProgress.total > 0 && (
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {Math.round((syncProgress.progress / syncProgress.total) * 100)}%
              </div>
            )}
          </div>
          {syncProgress.total > 0 && (
            <div className="mt-3 w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2">
              <div
                className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(syncProgress.progress / syncProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}
      
      <div className="auth-section">
        <h3>Google Drive Authentication</h3>
        
        {!isAuthenticated ? (
          <div className="auth-prompt">
            <p>Connect your Google account to enable automatic cloud synchronization of your settings, API keys, SWAG content, and usage logs.</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <strong>Note:</strong> All sync features are automatically enabled when you connect your Google account. No additional configuration needed!
            </p>
            <button 
              onClick={handleGoogleAuth}
              disabled={isLoading}
              className="google-auth-button"
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Connecting...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                    <path fill="#34A853" d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z"/>
                    <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
                    <path fill="#EA4335" d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.003 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z"/>
                  </svg>
                  Connect to Google Drive
                </>
              )}
            </button>
            
            {error && (
              <div className="error-message">
                <strong>Error:</strong> {error}
              </div>
            )}
          </div>
        ) : (
          <div className="auth-status">
            <div className="connected-info">
              <span className="status-indicator">✓</span>
              <div>
                <strong>Connected</strong>
                {userEmail && <div className="user-email">{userEmail}</div>}
              </div>
            </div>
            <button onClick={handleDisconnect} className="disconnect-button">
              Disconnect
            </button>
          </div>
        )}
      </div>

      {isAuthenticated && (
        <>
          <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 mt-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">☁️</span>
              <div className="flex-1">
                <div className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
                  Data Sync Status
                </div>
                
                <div className="text-sm text-blue-700 dark:text-blue-300 space-y-3">
                  <div className="flex justify-between items-center">
                    <span>Last synced:</span>
                    <strong>{formatLastSyncTime(lastSyncTime)}</strong>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Saved plans:</span>
                    <strong>{syncMetadata.plansCount} items</strong>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Saved playlists:</span>
                    <strong>{syncMetadata.playlistsCount} items</strong>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Saved snippets:</span>
                    <strong>{syncMetadata.snippetsCount} items</strong>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Saved embeddings:</span>
                    <strong>{syncMetadata.embeddingsCount} chunks</strong>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Chat history:</span>
                    <strong>{syncMetadata.chatHistoryCount} chats</strong>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Quiz progress:</span>
                    <strong>{syncMetadata.quizProgressCount} quizzes</strong>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Settings:</span>
                    <strong>{syncMetadata.settingsCount} setting{syncMetadata.settingsCount !== 1 ? 's' : ''}</strong>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Saved images:</span>
                    <strong>{syncMetadata.imagesCount} image{syncMetadata.imagesCount !== 1 ? 's' : ''}</strong>
                  </div>
                  
                  {syncStatus && (
                    <div className="p-2 bg-green-100 dark:bg-green-800 rounded text-green-800 dark:text-green-100">
                      ✓ {syncStatus}
                    </div>
                  )}
                  
                  {/* Sync Progress Display */}
                  {isSyncing && syncProgress.operation && (
                    <div className="p-3 bg-blue-100 dark:bg-blue-800 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {syncProgress.operation}
                        </span>
                        <span className="text-xs text-blue-700 dark:text-blue-300">
                          {syncProgress.progress} / {syncProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2">
                        <div
                          className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(syncProgress.progress / syncProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleSync}
                      disabled={isSyncing}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSyncing ? (
                        <>
                          <span className="inline-block animate-spin mr-2">🔄</span>
                          Syncing...
                        </>
                      ) : (
                        <>🔄 Sync Now</>
                      )}
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-3 p-2 bg-blue-100 dark:bg-blue-800 rounded">
                    <input
                      type="checkbox"
                      id="auto-sync"
                      checked={autoSyncEnabled}
                      onChange={handleAutoSyncToggle}
                      className="w-4 h-4"
                    />
                    <label htmlFor="auto-sync" className="cursor-pointer">
                      Auto-sync every 5 minutes
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="card p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 mt-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">✅</span>
              <div className="flex-1">
                <div className="font-semibold text-green-900 dark:text-green-100 mb-2">
                  Cloud Sync Enabled
                </div>
                <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                  <p>All sync features are now active:</p>
                  <ul className="list-disc ml-5 mt-2 space-y-1">
                    <li><strong>Settings & Preferences:</strong> Automatically synced across devices</li>
                    <li><strong>API Keys (SWAG):</strong> Securely backed up to your Google Drive</li>
                    <li><strong>RAG Content:</strong> Snippets and embeddings synced to Google Drive</li>
                    <li><strong>Chat History:</strong> All conversations backed up with metadata</li>
                    <li><strong>Quizzes:</strong> Quiz content, progress, and statistics synced</li>
                    <li><strong>Images:</strong> All saved images from snippets backed up to Google Drive</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CloudSyncSettings;
