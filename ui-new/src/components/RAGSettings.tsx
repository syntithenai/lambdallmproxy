import React, { useState, useEffect } from 'react';
import { useToast } from './ToastManager';
// Document management removed from settings - heavy features moved to SWAG page
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
}

const DEFAULT_RAG_CONFIG: RAGConfig = {
  enabled: false,
  autoEmbed: true, // Auto-embed enabled by default for better UX
  embeddingModel: 'text-embedding-3-small',
  embeddingProvider: 'openai',
  chunkSize: 1000,
  chunkOverlap: 200,
  topK: 5,
  similarityThreshold: 0.3, // Lowered from 0.5 for better recall (semantic search can have lower scores for exact matches)
};

const EMBEDDING_MODELS = [
  { name: 'text-embedding-3-small', provider: 'openai', cost: '$0.02/1M tokens', recommended: true },
  { name: 'text-embedding-3-large', provider: 'openai', cost: '$0.13/1M tokens' },
  { name: 'embed-english-v3.0', provider: 'cohere', cost: '$0.10/1M tokens' },
  { name: 'm2-bert-80M-8k-retrieval', provider: 'together', cost: '$0.008/1M tokens' },
];

export const RAGSettings: React.FC = () => {
  const { showSuccess, showError, showWarning } = useToast();
  const { getUserRagSpreadsheet } = useSwag();
  const { user } = useAuth();
  const [config, setConfig] = useState<RAGConfig>(DEFAULT_RAG_CONFIG);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadRAGConfig();
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

  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      
      // Save to localStorage (will integrate with IndexedDB later)
      localStorage.setItem('rag_config', JSON.stringify(config));
      
      // Dispatch custom event to notify other components (like SwagPage)
      window.dispatchEvent(new Event('rag_config_updated'));
      
      // If user is authenticated, ensure spreadsheet is created
      if (user) {
        console.log('📊 User authenticated - ensuring spreadsheet exists...');
        const spreadsheetId = await getUserRagSpreadsheet();
        if (spreadsheetId) {
          console.log('✅ Spreadsheet ready:', spreadsheetId);
          showSuccess('RAG settings saved! Your embeddings will sync to Google Sheets when you connect Google Drive.');
        } else {
          console.warn('⚠️ Failed to get spreadsheet ID');
          showWarning('Settings saved. Connect Google Drive in Cloud Sync tab to enable automatic backup.');
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
              Similarity Threshold: {(config.similarityThreshold || 0.3).toFixed(2)}
            </span>
          </label>
          <input
            type="range"
            min="0.1"
            max="0.95"
            step="0.05"
            value={config.similarityThreshold || 0.3}
            onChange={(e) => handleConfigChange('similarityThreshold', parseFloat(e.target.value))}
            disabled={!config.enabled}
            className="w-full disabled:opacity-50"
          />
        </div>
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
