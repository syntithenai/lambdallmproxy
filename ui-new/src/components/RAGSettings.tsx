import React, { useState, useEffect } from 'react';
import { useToast } from './ToastManager';
// Document management removed from settings - heavy features moved to SWAG page
import { useSwag } from '../contexts/SwagContext';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { getCachedApiBase } from '../utils/api';

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

// Local browser-based embedding models (via Transformers.js)
const LOCAL_EMBEDDING_MODELS = [
  { id: 'Xenova/all-MiniLM-L6-v2', name: 'MiniLM-L6 (Recommended)', dimensions: 384, size: '23 MB', speed: 'Fast', description: 'Balanced quality and speed, best for general use' },
  { id: 'Xenova/paraphrase-MiniLM-L3-v2', name: 'MiniLM-L3 (Fastest)', dimensions: 384, size: '17 MB', speed: 'Very Fast', description: 'Fastest option, slightly lower quality' },
  { id: 'Xenova/bge-small-en-v1.5', name: 'BGE-Small (Highest Quality)', dimensions: 384, size: '33 MB', speed: 'Slower', description: 'Best quality for English text, slower generation' },
];

interface EmbeddingModel {
  id: string;
  provider: string;
  name: string;
  dimensions: number;
  maxTokens: number;
  recommended?: boolean;
  deprecated?: boolean;
  description: string;
  pricing?: {
    perMillionTokens: number;
  };
}

export const RAGSettings: React.FC = () => {
  const { showSuccess, showError, showWarning, showPersistentToast, removeToast, updateToast } = useToast();
  const { getUserRagSpreadsheet } = useSwag();
  const { user } = useAuth();
  const { settings, setSettings } = useSettings();
  const [config, setConfig] = useState<RAGConfig>(DEFAULT_RAG_CONFIG);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [availableEmbeddings, setAvailableEmbeddings] = useState<EmbeddingModel[]>([]);
  const [loadingEmbeddings, setLoadingEmbeddings] = useState(true);
  const [modelLoadProgress, setModelLoadProgress] = useState<{ loading: boolean; progress: number; model: string } | null>(null);

  useEffect(() => {
    loadRAGConfig();
    fetchAvailableEmbeddings();
  }, []);
  
  // Check if currently selected model is available
  const isSelectedModelAvailable = () => {
    if (settings.embeddingSource === 'local') {
      // Local models are always "available" (will download on demand)
      return true;
    }
    
    // For API models, check if selected model is in available list
    if (!settings.embeddingModel) {
      return availableEmbeddings.length > 0; // No model selected, but models available
    }
    
    return availableEmbeddings.some(m => m.id === settings.embeddingModel);
  };

  const fetchAvailableEmbeddings = async () => {
    try {
      const apiUrl = await getCachedApiBase();
      const token = localStorage.getItem('google_token');
      
      const response = await fetch(`${apiUrl}/billing`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.availableEmbeddings && Array.isArray(data.availableEmbeddings)) {
          setAvailableEmbeddings(data.availableEmbeddings);
          console.log('📊 Fetched available embeddings:', data.availableEmbeddings.length);
        }
      } else {
        console.warn('Failed to fetch available embeddings from billing endpoint');
      }
    } catch (error) {
      console.error('Error fetching available embeddings:', error);
    } finally {
      setLoadingEmbeddings(false);
    }
  };

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

  const preloadLocalModel = async (modelId: string) => {
    let toastId: string | null = null;
    
    try {
      setModelLoadProgress({ loading: true, progress: 0, model: modelId });
      
      // Show persistent toast
      const modelName = modelId.split('/')[1];
      toastId = showPersistentToast(`🔄 Loading model ${modelName}... 0%`, 'info');
      
      // Dynamically import the service
      const { getLocalEmbeddingService } = await import('../services/localEmbeddings');
      const embeddingService = getLocalEmbeddingService();
      
      // Load model with progress callback
      await embeddingService.loadModel(modelId, (progress) => {
        const percentage = Math.round(progress.progress * 100);
        setModelLoadProgress({ loading: true, progress: percentage, model: modelId });
        
        // Update persistent toast
        if (toastId) {
          updateToast(toastId, `🔄 Loading model ${modelName}... ${percentage}%`);
        }
      });
      
      // Hide loading toast
      if (toastId) {
        removeToast(toastId);
      }
      
      // Show success
      showSuccess(`✅ Model ${modelName} loaded successfully! Ready to use.`);
      setModelLoadProgress(null);
      
    } catch (error) {
      console.error('Failed to preload local model:', error);
      
      // Hide loading toast
      if (toastId) {
        removeToast(toastId);
      }
      
      showError(`❌ Failed to load model: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setModelLoadProgress(null);
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

      {/* Model Unavailable Warning */}
      {config.enabled && !loadingEmbeddings && !isSelectedModelAvailable() && (
        <div className="card p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <div className="font-bold text-red-900 dark:text-red-200 mb-2">
                RAG System Disabled: Embedding Model Not Available
              </div>
              <div className="text-sm text-red-800 dark:text-red-300 space-y-2">
                <p>
                  Your selected embedding model "{settings.embeddingModel || 'none'}" is not available from your configured providers.
                </p>
                <p className="font-medium">
                  To fix this:
                </p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Select a new embedding model from the available options below</li>
                  <li>Save your settings</li>
                  <li>Go to SWAG page and regenerate embeddings for all your snippets</li>
                  <li>Or configure a provider that supports your selected model in the Providers tab</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Embedding Source Selection */}
      <div className="card p-4">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
          Embedding Source
        </h4>
        
        <div className="space-y-3">
          {/* API-based option */}
          <label className="flex items-start cursor-pointer">
            <input
              type="radio"
              name="embeddingSource"
              value="api"
              checked={(settings.embeddingSource || 'api') === 'api'}
              onChange={() => {
                setSettings({ ...settings, embeddingSource: 'api' });
                setHasChanges(true);
              }}
              disabled={!config.enabled}
              className="mt-1 w-4 h-4 text-blue-600 disabled:opacity-50"
            />
            <div className="ml-3">
              <div className="font-medium text-gray-900 dark:text-gray-100">
                API-Based (Server)
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                High quality (1536 dims), fast (&lt;1s), requires provider. Uses your configured providers.
              </div>
            </div>
          </label>

          {/* Local browser option */}
          <label className="flex items-start cursor-pointer">
            <input
              type="radio"
              name="embeddingSource"
              value="local"
              checked={settings.embeddingSource === 'local'}
              onChange={() => {
                setSettings({ ...settings, embeddingSource: 'local' });
                setHasChanges(true);
              }}
              disabled={!config.enabled}
              className="mt-1 w-4 h-4 text-blue-600 disabled:opacity-50"
            />
            <div className="ml-3">
              <div className="font-medium text-gray-900 dark:text-gray-100">
                Local (Browser) 🆕
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Free, offline, no auth needed. Slower (2-5s), lower quality (384 dims). Good for personal use.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Embedding Model Selection - API-Based */}
      {(settings.embeddingSource || 'api') === 'api' && (
        <div className="card p-4">
          <label className="block mb-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              API Embedding Model
            </span>
          </label>
          
          {loadingEmbeddings ? (
            <div className="text-sm text-gray-500">Loading available models...</div>
          ) : availableEmbeddings.length === 0 ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              ⚠️ No embedding models available. Please configure a provider with embedding capabilities in the Providers tab.
            </div>
          ) : (
            <>
              <select
                value={settings.embeddingModel || 'text-embedding-3-small'}
                onChange={(e) => {
                  setSettings({ ...settings, embeddingModel: e.target.value });
                  setHasChanges(true);
                }}
                disabled={!config.enabled}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              >
                {availableEmbeddings.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider}) - ${model.pricing?.perMillionTokens || 0}/M tokens
                    {model.recommended ? ' ⭐' : ''}
                    {model.deprecated ? ' (Legacy)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {availableEmbeddings.find(m => m.id === (settings.embeddingModel || 'text-embedding-3-small'))?.description || 
                 'Select an embedding model from your configured providers'}
              </p>
            </>
          )}
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
            ⚠️ Changing models requires re-embedding all content
          </p>
        </div>
      )}

      {/* Embedding Model Selection - Local */}
      {settings.embeddingSource === 'local' && (
        <div className="card p-4">
          <label className="block mb-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              Local Embedding Model
            </span>
          </label>
          <select
            value={settings.embeddingModel || 'Xenova/all-MiniLM-L6-v2'}
            onChange={async (e) => {
              const newModel = e.target.value;
              setSettings({ ...settings, embeddingModel: newModel });
              setHasChanges(true);
              
              // Preload the model to verify it works and cache it
              await preloadLocalModel(newModel);
            }}
            disabled={!config.enabled || modelLoadProgress?.loading}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
          >
            {LOCAL_EMBEDDING_MODELS.map(model => (
              <option key={model.id} value={model.id}>
                {model.name} - {model.size}, {model.speed}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {LOCAL_EMBEDDING_MODELS.find(m => m.id === (settings.embeddingModel || 'Xenova/all-MiniLM-L6-v2'))?.description || 
             'Runs entirely in your browser using WebAssembly'}
          </p>
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
            ⚠️ Model will download on first use (~17-33 MB). Changing models requires re-embedding all content.
          </p>
        </div>
      )}

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
