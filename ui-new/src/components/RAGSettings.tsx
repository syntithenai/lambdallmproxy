import React, { useState, useEffect } from 'react';
import { useToast } from './ToastManager';
// Document management removed from settings - heavy features moved to SWAG page
import { useSwag } from '../contexts/SwagContext';
import { useAuth } from '../contexts/AuthContext';
import { isGoogleIdentityAvailable, getAccessToken, clearAccessToken } from '../services/googleSheetsClient';

interface RAGConfig {
  enabled: boolean;
  autoEmbed: boolean;
  embeddingModel: string;
  embeddingProvider: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
  syncEnabled: boolean; // Renamed from sheetsBackupEnabled
}

interface RAGStats {
  totalChunks: number;
  uniqueSnippets: number;
  estimatedSizeMB: string;
  embeddingModels: number;
}

interface RAGDocument {
  id: string;
  name: string;
  sourceType: 'file' | 'url' | 'text';
  sourceUrl?: string;
  sourceFileName?: string;
  createdAt: string;
  chunkCount: number;
  totalTokens: number;
  totalChars: number;
  models: string[];
}

const DEFAULT_RAG_CONFIG: RAGConfig = {
  enabled: false,
  autoEmbed: false,
  embeddingModel: 'text-embedding-3-small',
  embeddingProvider: 'openai',
  chunkSize: 1000,
  chunkOverlap: 200,
  topK: 5,
  similarityThreshold: 0.5, // Lowered from 0.7 for better recall (fewer false negatives)
  syncEnabled: true, // Renamed from sheetsBackupEnabled
};

const EMBEDDING_MODELS = [
  { name: 'text-embedding-3-small', provider: 'openai', cost: '$0.02/1M tokens', recommended: true },
  { name: 'text-embedding-3-large', provider: 'openai', cost: '$0.13/1M tokens' },
  { name: 'embed-english-v3.0', provider: 'cohere', cost: '$0.10/1M tokens' },
  { name: 'm2-bert-80M-8k-retrieval', provider: 'together', cost: '$0.008/1M tokens' },
];

export const RAGSettings: React.FC = () => {
  const { showSuccess, showError, showWarning } = useToast();
  const { syncStatus, triggerManualSync, getUserRagSpreadsheet } = useSwag();
  const { user } = useAuth();
  const [config, setConfig] = useState<RAGConfig>(DEFAULT_RAG_CONFIG);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [googleLinked, setGoogleLinked] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  useEffect(() => {
    loadRAGConfig();
    
    // Check if user has linked Google account
    const linked = localStorage.getItem('rag_google_linked') === 'true';
    setGoogleLinked(linked);
  }, []);

  const loadRAGConfig = async () => {
    try {
      // Load from IndexedDB (via RAG system)
      const savedConfig = localStorage.getItem('rag_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        // Merge with defaults to ensure all fields are defined
        setConfig({
          ...DEFAULT_RAG_CONFIG,
          ...parsed
        });
      } else {
        // No saved config, use defaults
        setConfig(DEFAULT_RAG_CONFIG);
      }
    } catch (error) {
      console.error('Failed to load RAG config:', error);
      // On error, use defaults
      setConfig(DEFAULT_RAG_CONFIG);
    }
  };

  // Document management and database statistics removed from settings UI

  const handleConfigChange = (key: keyof RAGConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleManualSync = async () => {
    if (!user) {
      showWarning('Please sign in with Google to sync');
      return;
    }

    // Check current component state, not localStorage
    if (!config.enabled) {
      showWarning('RAG system is not enabled. Enable it in the settings above.');
      return;
    }

    if (!config.syncEnabled) {
      showWarning('Cloud sync is not enabled. Check the "Sync to Google Sheets" box above.');
      return;
    }

    // Save config before syncing so triggerManualSync can read it
    try {
      localStorage.setItem('rag_config', JSON.stringify(config));
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save config before sync:', error);
    }

    try {
      setSyncInProgress(true);
      // triggerManualSync() handles its own success/error messages
      await triggerManualSync();
    } catch (error) {
      // Error already shown by triggerManualSync
      console.error('Manual sync failed:', error);
    } finally {
      setSyncInProgress(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      
      // Save to localStorage (will integrate with IndexedDB later)
      localStorage.setItem('rag_config', JSON.stringify(config));
      
      // Dispatch custom event to notify other components (like SwagPage)
      window.dispatchEvent(new Event('rag_config_updated'));
      
      // If sync is enabled, ensure spreadsheet is created
      if (config.syncEnabled && user) {
        console.log('📊 Sync enabled - ensuring spreadsheet exists...');
        const spreadsheetId = await getUserRagSpreadsheet();
        if (spreadsheetId) {
          console.log('✅ Spreadsheet ready:', spreadsheetId);
          showSuccess('RAG settings saved! Your embeddings will sync to Google Sheets.');
        } else {
          console.warn('⚠️ Failed to get spreadsheet ID');
          showWarning('Settings saved but could not access Google Sheets. Check your authentication.');
        }
      } else {
        showSuccess('RAG settings saved successfully');
      }
      
      // NOTE: search_knowledge_base tool is now independent and managed in Settings > Tools
      // Local RAG system (this settings page) is separate from server-side knowledge_base tool
      
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save RAG config:', error);
      showError('Failed to save RAG settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSync = async (enabled: boolean) => {
    handleConfigChange('syncEnabled', enabled);

    // If enabling sync, attempt to create/ensure the spreadsheet immediately
    if (enabled && user) {
      try {
        setSyncInProgress(true);
        console.log('📊 Sync toggled ON - ensuring spreadsheet exists...');
        const spreadsheetId = await getUserRagSpreadsheet();
        if (spreadsheetId) {
          console.log('✅ Spreadsheet ready:', spreadsheetId);
          showSuccess('Cloud sync enabled and spreadsheet created/verified.');
        } else {
          console.warn('⚠️ Could not obtain spreadsheet ID when enabling sync');
          showWarning('Cloud sync enabled but failed to access Google Sheets. Check authentication.');
        }
      } catch (error) {
        console.error('Error ensuring spreadsheet on toggle:', error);
        showError('Failed to prepare Google Sheets for sync. Try linking your Google account.');
      } finally {
        setSyncInProgress(false);
      }
    }
  };

  const handleLinkGoogleAccount = async () => {
    if (!isGoogleIdentityAvailable()) {
      showError('Google Identity Services not available. Please refresh the page.');
      return;
    }

    try {
      setLinkingGoogle(true);
      // Request access token (triggers OAuth consent)
      await getAccessToken();
      
      // Mark as linked
      localStorage.setItem('rag_google_linked', 'true');
      setGoogleLinked(true);
      
      showSuccess('✅ Google Account linked! Embeddings will sync directly to your Sheets.');
    } catch (error) {
      console.error('Failed to link Google account:', error);
      showError('Failed to link Google account. Please try again.');
    } finally {
      setLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogleAccount = () => {
    clearAccessToken();
    localStorage.removeItem('rag_google_linked');
    setGoogleLinked(false);
    showSuccess('Google Account unlinked. Embeddings will sync via backend.');
  };

  // Clearing all chunks not exposed in settings (kept as CLI/admin operation)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          🧠 RAG (Retrieval-Augmented Generation)
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Enable semantic search over your saved snippets using embeddings. Enhances LLM responses with relevant context from your content.
        </p>
      </div>

      {/* Enable RAG Toggle */}
      <div className="card p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Enable RAG System
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Automatically search your snippets when asking questions
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleConfigChange('enabled', e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      {/* Auto-Embed Toggle */}
      <div className="card p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Auto-Embed New Snippets
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Automatically generate embeddings when saving snippets
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.autoEmbed}
            onChange={(e) => handleConfigChange('autoEmbed', e.target.checked)}
            disabled={!config.enabled}
            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </label>
      </div>

      {/* Embedding Model Selection */}
      <div className="card p-4">
        <label className="block mb-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            Embedding Model
          </span>
        </label>
        <select
          value={config.embeddingModel}
          onChange={(e) => {
            const selectedModel = EMBEDDING_MODELS.find(m => m.name === e.target.value);
            if (selectedModel) {
              handleConfigChange('embeddingModel', selectedModel.name);
              handleConfigChange('embeddingProvider', selectedModel.provider);
            }
          }}
          disabled={!config.enabled}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
        >
          {EMBEDDING_MODELS.map(model => (
            <option key={model.name} value={model.name}>
              {model.name} ({model.cost}) {model.recommended ? '⭐ Recommended' : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
          ⚠️ Changing models requires re-embedding all content
        </p>
      </div>

      {/* Chunking Settings */}
      <div className="card p-4 space-y-4">
        <h4 className="font-medium text-gray-900 dark:text-gray-100">
          Chunking Settings
        </h4>
        
        {/* Chunk Size */}
        <div>
          <label className="block mb-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Chunk Size: {config.chunkSize || 1000} characters (≈{Math.round((config.chunkSize || 1000) / 4)} tokens)
            </span>
          </label>
          <input
            type="range"
            min="500"
            max="2000"
            step="100"
            value={config.chunkSize || 1000}
            onChange={(e) => handleConfigChange('chunkSize', parseInt(e.target.value))}
            disabled={!config.enabled}
            className="w-full disabled:opacity-50"
          />
        </div>

        {/* Chunk Overlap */}
        <div>
          <label className="block mb-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Chunk Overlap: {config.chunkOverlap || 200} characters ({Math.round(((config.chunkOverlap || 200) / (config.chunkSize || 1000)) * 100)}%)
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="500"
            step="50"
            value={config.chunkOverlap || 200}
            onChange={(e) => handleConfigChange('chunkOverlap', parseInt(e.target.value))}
            disabled={!config.enabled}
            className="w-full disabled:opacity-50"
          />
        </div>
      </div>

      {/* Search Settings */}
      <div className="card p-4 space-y-4">
        <h4 className="font-medium text-gray-900 dark:text-gray-100">
          Search Settings
        </h4>
        
        {/* Top K */}
        <div>
          <label className="block mb-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Top-K Results: {config.topK || 5}
            </span>
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={config.topK || 5}
            onChange={(e) => handleConfigChange('topK', parseInt(e.target.value))}
            disabled={!config.enabled}
            className="w-full disabled:opacity-50"
          />
        </div>

        {/* Similarity Threshold */}
        <div>
          <label className="block mb-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Similarity Threshold: {(config.similarityThreshold || 0.5).toFixed(2)}
            </span>
          </label>
          <input
            type="range"
            min="0.3"
            max="0.95"
            step="0.05"
            value={config.similarityThreshold || 0.5}
            onChange={(e) => handleConfigChange('similarityThreshold', parseFloat(e.target.value))}
            disabled={!config.enabled}
            className="w-full disabled:opacity-50"
          />
        </div>
      </div>

      {/* Cloud Sync with Google Sheets */}
      <div className="card p-4">
        <div className="mb-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">
                ☁️ Cloud Sync with Google Sheets
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Automatically sync snippets across devices with your Google account
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.syncEnabled}
              onChange={(e) => handleToggleSync(e.target.checked)}
              disabled={!config.enabled || !user}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </label>
          {!user && (
            <div className="mt-2 text-sm text-amber-600 dark:text-amber-400">
              ⚠️ Sign in with Google to enable cloud sync
            </div>
          )}
        </div>

        {config.syncEnabled && user && (
          <div className="mt-4 space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            {/* Google Account Linking */}
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    🔐 Direct Google Sheets Sync
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {googleLinked 
                      ? '✅ Embeddings sync directly from browser to your Google Sheets (faster, no backend)'
                      : '⚠️ Currently using backend sync (may hit rate limits with large batches)'}
                  </div>
                </div>
                {googleLinked ? (
                  <button
                    onClick={handleUnlinkGoogleAccount}
                    className="px-3 py-1.5 text-sm bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Unlink
                  </button>
                ) : (
                  <button
                    onClick={handleLinkGoogleAccount}
                    disabled={linkingGoogle || !isGoogleIdentityAvailable()}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {linkingGoogle ? '⏳ Linking...' : '🔗 Link Google Account'}
                  </button>
                )}
              </div>
              {!isGoogleIdentityAvailable() && (
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  ⚠️ Google Identity Services not loaded. Please refresh the page.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium text-gray-700 dark:text-gray-300">Sync Status</div>
                {syncStatus && (
                  <>
                    {syncStatus.inProgress ? (
                      <div className="text-blue-600 dark:text-blue-400 flex items-center gap-2">
                        <span className="animate-spin">🔄</span>
                        Syncing... {syncStatus.pendingChanges > 0 && `(${syncStatus.pendingChanges} pending)`}
                      </div>
                    ) : syncStatus.lastSync ? (
                      <div className="text-green-600 dark:text-green-400">
                        ✅ Last synced: {new Date(syncStatus.lastSync).toLocaleString()}
                      </div>
                    ) : (
                      <div className="text-gray-500 dark:text-gray-400">
                        Not yet synced
                      </div>
                    )}
                    {syncStatus.lastError && (
                      <div className="text-red-600 dark:text-red-400 text-xs mt-1">
                        ❌ {syncStatus.lastError}
                      </div>
                    )}
                    {syncStatus.conflictsResolved > 0 && (
                      <div className="text-amber-600 dark:text-amber-400 text-xs mt-1">
                        ⚠️ {syncStatus.conflictsResolved} conflicts resolved (last-write-wins)
                      </div>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={handleManualSync}
                disabled={syncInProgress || (syncStatus?.inProgress ?? false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {syncInProgress || (syncStatus?.inProgress ?? false) ? '⏳ Syncing...' : '🔄 Sync Now'}
              </button>
            </div>
            
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <div>✓ Automatic sync every minute</div>
              <div>✓ Works across all browsers with same Google account</div>
              <div>✓ Offline changes queued and synced when online</div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleSaveConfig}
          disabled={!hasChanges || loading}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Help Text */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>💡 <strong>Tip:</strong> Start with default settings (text-embedding-3-small, 1000 char chunks, 200 overlap)</p>
        <p>📖 <strong>Learn more:</strong> Check src/rag/README.md for detailed documentation</p>
      </div>

      {/* Upload dialog and document management removed from settings */}
    </div>
  );
};
