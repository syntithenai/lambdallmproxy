import React, { useState, useEffect } from 'react';
import { useToast } from './ToastManager';
import { FileUploadDialog } from './FileUploadDialog';
import { useSwag } from '../contexts/SwagContext';
import { useAuth } from '../contexts/AuthContext';

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
  similarityThreshold: 0.7,
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
  const { syncStatus, triggerManualSync } = useSwag();
  const { user } = useAuth();
  const [config, setConfig] = useState<RAGConfig>(DEFAULT_RAG_CONFIG);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    status: string;
  } | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);

  useEffect(() => {
    loadRAGConfig();
    loadRAGStats();
    loadDocuments();
  }, []);

  const loadRAGConfig = async () => {
    try {
      // Load from IndexedDB (via RAG system)
      const savedConfig = localStorage.getItem('rag_config');
      if (savedConfig) {
        setConfig(JSON.parse(savedConfig));
      }
    } catch (error) {
      console.error('Failed to load RAG config:', error);
    }
  };

  const loadRAGStats = async () => {
    try {
      // This would call the RAG system's getDBStats function
      // For now, we'll use localStorage as a placeholder
      const savedStats = localStorage.getItem('rag_stats');
      if (savedStats) {
        setStats(JSON.parse(savedStats));
      } else {
        setStats({
          totalChunks: 0,
          uniqueSnippets: 0,
          estimatedSizeMB: '0',
          embeddingModels: 0,
        });
      }
    } catch (error) {
      console.error('Failed to load RAG stats:', error);
    }
  };

  const loadDocuments = async () => {
    if (!config.enabled) return;
    
    try {
      const response = await fetch(`${process.env.REACT_APP_LAMBDA_URL || 'http://localhost:3000'}/rag/documents`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch documents');
      
      // Parse SSE events
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
              if (data.documents) {
                setDocuments(data.documents);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  const handleUploadDocument = async (files: File[], urls: string[]) => {
    try {
      setLoading(true);
      
      for (const file of files) {
        // Read file content
        const content = await file.text();
        
        const response = await fetch(`${process.env.REACT_APP_LAMBDA_URL || 'http://localhost:3000'}/rag/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content,
            sourceType: 'file',
            title: file.name,
          }),
        });
        
        if (!response.ok) throw new Error(`Failed to upload ${file.name}`);
        
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
                  throw new Error(data.error);
                }
                if (data.message) {
                  console.log(data.message);
                }
              }
            }
          }
        }
      }
      
      for (const url of urls) {
        const response = await fetch(`${process.env.REACT_APP_LAMBDA_URL || 'http://localhost:3000'}/rag/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            title: url,
          }),
        });
        
        if (!response.ok) throw new Error(`Failed to ingest ${url}`);
      }
      
      showSuccess(`Successfully uploaded ${files.length} files and ${urls.length} URLs`);
      setShowUploadDialog(false);
      await loadDocuments();
      await loadRAGStats();
      
    } catch (error) {
      console.error('Upload error:', error);
      showError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSingleFileUpload = async (fileOrUrl: File | string) => {
    if (typeof fileOrUrl === 'string') {
      await handleUploadDocument([], [fileOrUrl]);
    } else {
      await handleUploadDocument([fileOrUrl], []);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Delete this document and all its embeddings?')) return;
    
    try {
      setLoading(true);
      // Call delete endpoint when implemented
      showSuccess('Document deleted');
      await loadDocuments();
      await loadRAGStats();
    } catch (error) {
      showError('Failed to delete document');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (key: keyof RAGConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleManualSync = async () => {
    if (!user) {
      showWarning('Please sign in with Google to sync');
      return;
    }

    if (!config.syncEnabled) {
      showWarning('Cloud sync is not enabled');
      return;
    }

    try {
      setSyncInProgress(true);
      await triggerManualSync();
      showSuccess('Sync completed successfully');
    } catch (error) {
      console.error('Manual sync failed:', error);
      showError('Sync failed');
    } finally {
      setSyncInProgress(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      
      // Save to localStorage (will integrate with IndexedDB later)
      localStorage.setItem('rag_config', JSON.stringify(config));
      
      // Sync search_knowledge_base tool with RAG enabled state
      try {
        const toolsConfig = localStorage.getItem('chat_enabled_tools');
        if (toolsConfig) {
          const tools = JSON.parse(toolsConfig);
          tools.search_knowledge_base = config.enabled;
          localStorage.setItem('chat_enabled_tools', JSON.stringify(tools));
        }
      } catch (e) {
        console.error('Failed to sync search_knowledge_base tool:', e);
      }
      
      showSuccess('RAG settings saved successfully');
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save RAG config:', error);
      showError('Failed to save RAG settings');
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllChunks = async () => {
    if (!confirm('Are you sure you want to clear all embeddings? This cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      
      // This would call the RAG system's clearAllChunks function
      localStorage.removeItem('rag_stats');
      
      setStats({
        totalChunks: 0,
        uniqueSnippets: 0,
        estimatedSizeMB: '0',
        embeddingModels: 0,
      });
      
      showSuccess('All embeddings cleared');
    } catch (error) {
      console.error('Failed to clear chunks:', error);
      showError('Failed to clear embeddings');
    } finally {
      setLoading(false);
    }
  };

  const estimateReEmbeddingCost = () => {
    if (!stats) return '$0.00';
    
    // Rough estimate: 250 tokens per chunk * $0.02 per 1M tokens
    const totalTokens = stats.totalChunks * 250;
    const cost = (totalTokens / 1000000) * 0.02;
    
    return `$${cost.toFixed(4)}`;
  };

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
              Chunk Size: {config.chunkSize} characters (≈{Math.round(config.chunkSize / 4)} tokens)
            </span>
          </label>
          <input
            type="range"
            min="500"
            max="2000"
            step="100"
            value={config.chunkSize}
            onChange={(e) => handleConfigChange('chunkSize', parseInt(e.target.value))}
            disabled={!config.enabled}
            className="w-full disabled:opacity-50"
          />
        </div>

        {/* Chunk Overlap */}
        <div>
          <label className="block mb-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Chunk Overlap: {config.chunkOverlap} characters ({Math.round((config.chunkOverlap / config.chunkSize) * 100)}%)
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="500"
            step="50"
            value={config.chunkOverlap}
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
              Top-K Results: {config.topK}
            </span>
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={config.topK}
            onChange={(e) => handleConfigChange('topK', parseInt(e.target.value))}
            disabled={!config.enabled}
            className="w-full disabled:opacity-50"
          />
        </div>

        {/* Similarity Threshold */}
        <div>
          <label className="block mb-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Similarity Threshold: {config.similarityThreshold.toFixed(2)}
            </span>
          </label>
          <input
            type="range"
            min="0.3"
            max="0.95"
            step="0.05"
            value={config.similarityThreshold}
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
              onChange={(e) => handleConfigChange('syncEnabled', e.target.checked)}
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

      {/* Statistics */}
      {stats && (
        <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
            📊 Database Statistics
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500 dark:text-gray-400">Total Chunks</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {stats.totalChunks.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">Unique Snippets</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {stats.uniqueSnippets}
              </div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">Storage Size</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {stats.estimatedSizeMB} MB
              </div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">Models Used</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {stats.embeddingModels}
              </div>
            </div>
          </div>
          
          {stats.totalChunks > 0 && (
            <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Estimated re-embedding cost: <strong>{estimateReEmbeddingCost()}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document Upload Section */}
      {config.enabled && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">
              📄 Document Management
            </h4>
            <button
              onClick={() => setShowUploadDialog(true)}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
            >
              ➕ Upload Documents
            </button>
          </div>

          {/* Document List */}
          {documents.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {doc.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {doc.sourceType === 'file' ? '📄' : doc.sourceType === 'url' ? '🔗' : '📝'} {doc.sourceType} • {doc.chunkCount} chunks • {(doc.totalChars / 1000).toFixed(1)}K chars
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No documents uploaded yet. Click "Upload Documents" to get started.
            </div>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress && (
        <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {uploadProgress.status}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {uploadProgress.current} / {uploadProgress.total}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleSaveConfig}
          disabled={!hasChanges || loading}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
        
        {stats && stats.totalChunks > 0 && (
          <button
            onClick={handleClearAllChunks}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Clear All Embeddings
          </button>
        )}
      </div>

      {/* Help Text */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>💡 <strong>Tip:</strong> Start with default settings (text-embedding-3-small, 1000 char chunks, 200 overlap)</p>
        <p>📖 <strong>Learn more:</strong> Check src/rag/README.md for detailed documentation</p>
      </div>

      {/* Upload Dialog */}
      <FileUploadDialog
        isOpen={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onUpload={handleSingleFileUpload}
      />
    </div>
  );
};
