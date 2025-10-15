import React, { useState, useEffect } from 'react';
import { useToast } from './ToastManager';

interface RAGConfig {
  enabled: boolean;
  autoEmbed: boolean;
  embeddingModel: string;
  embeddingProvider: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
  sheetsBackupEnabled: boolean;
}

interface RAGStats {
  totalChunks: number;
  uniqueSnippets: number;
  estimatedSizeMB: string;
  embeddingModels: number;
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
  sheetsBackupEnabled: true,
};

const EMBEDDING_MODELS = [
  { name: 'text-embedding-3-small', provider: 'openai', cost: '$0.02/1M tokens', recommended: true },
  { name: 'text-embedding-3-large', provider: 'openai', cost: '$0.13/1M tokens' },
  { name: 'embed-english-v3.0', provider: 'cohere', cost: '$0.10/1M tokens' },
  { name: 'm2-bert-80M-8k-retrieval', provider: 'together', cost: '$0.008/1M tokens' },
];

export const RAGSettings: React.FC = () => {
  const { showSuccess, showError } = useToast();
  const [config, setConfig] = useState<RAGConfig>(DEFAULT_RAG_CONFIG);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadRAGConfig();
    loadRAGStats();
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

  const handleConfigChange = (key: keyof RAGConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      
      // Save to localStorage (will integrate with IndexedDB later)
      localStorage.setItem('rag_config', JSON.stringify(config));
      
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

      {/* Google Sheets Backup */}
      <div className="card p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Google Sheets Backup
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Sync embeddings to Google Sheets for cloud backup
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.sheetsBackupEnabled}
            onChange={(e) => handleConfigChange('sheetsBackupEnabled', e.target.checked)}
            disabled={!config.enabled}
            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </label>
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
    </div>
  );
};
