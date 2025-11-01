import React, { useState, useEffect } from 'react';
import { useToast } from './ToastManager';
// Document management removed from settings - heavy features moved to SWAG page
import { useSettings } from '../contexts/SettingsContext';
import { useUsage } from '../contexts/UsageContext';

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

export const RAGSettings: React.FC = () => {
  const { showSuccess, showError, showPersistentToast, removeToast, updateToast } = useToast();
  const { settings, setSettings } = useSettings();
  const { availableEmbeddings, loading: loadingEmbeddings } = useUsage();
  const [config, setConfig] = useState<RAGConfig>(DEFAULT_RAG_CONFIG);
  const [modelLoadProgress, setModelLoadProgress] = useState<{ loading: boolean; progress: number; model: string } | null>(null);

  useEffect(() => {
    loadRAGConfig();
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

  // Auto-save helper
  const autoSaveConfig = async (newConfig: RAGConfig) => {
    try {
      // Save to localStorage
      localStorage.setItem('rag_config', JSON.stringify(newConfig));
      
      // Dispatch custom event to notify other components (like SwagPage)
      window.dispatchEvent(new Event('rag_config_updated'));
      
      console.log('✅ RAG settings auto-saved');
    } catch (error) {
      console.error('Failed to auto-save RAG config:', error);
    }
  };

  const handleConfigChange = (key: keyof RAGConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    autoSaveConfig(newConfig);
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

      {/* Embedding Model Selection - Combined Dropdown */}
      <div className="card p-4">
        <label className="block mb-3">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            Embedding Model
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Choose from API-based (server) or local (browser) embedding models
          </p>
        </label>
        
        {loadingEmbeddings ? (
          <div className="text-sm text-gray-500">Loading available models...</div>
        ) : (
          <>
            <select
              value={settings.embeddingModel || 'text-embedding-3-small'}
              onChange={async (e) => {
                const newModel = e.target.value;
                
                // Determine if it's a local or API model
                const isLocalModel = LOCAL_EMBEDDING_MODELS.some(m => m.id === newModel);
                const newSource = isLocalModel ? 'local' : 'api';
                
                // Update settings
                setSettings({ 
                  ...settings, 
                  embeddingModel: newModel,
                  embeddingSource: newSource
                });
                
                // If local model selected, preload it
                if (isLocalModel) {
                  await preloadLocalModel(newModel);
                }
              }}
              disabled={!config.enabled || modelLoadProgress?.loading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
            >
              {/* Local Models Section */}
              <optgroup label="🏠 Local (Browser) - Free, Offline">
                {LOCAL_EMBEDDING_MODELS.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} - {model.size}, {model.speed}, {model.dimensions}d
                  </option>
                ))}
              </optgroup>
              
              {/* API Models Section */}
              {availableEmbeddings.length > 0 && (
                <optgroup label="☁️ API (Server) - High Quality, Fast">
                  {availableEmbeddings.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.provider}) - ${model.pricing?.perMillionTokens || 0}/M tokens, {model.dimensions}d
                      {model.recommended ? ' ⭐' : ''}
                      {model.deprecated ? ' (Legacy)' : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            
            {/* Model Description */}
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              {(() => {
                const localModel = LOCAL_EMBEDDING_MODELS.find(m => m.id === settings.embeddingModel);
                if (localModel) {
                  return `🏠 Local: ${localModel.description}. Model downloads on first use (~${localModel.size}).`;
                }
                const apiModel = availableEmbeddings.find(m => m.id === settings.embeddingModel);
                if (apiModel) {
                  return `☁️ API: ${apiModel.description}`;
                }
                return 'Select an embedding model to see details';
              })()}
            </p>
          </>
        )}
        
        {availableEmbeddings.length === 0 && !loadingEmbeddings && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mt-2">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h4 className="font-medium text-yellow-900 dark:text-yellow-100">No API Embedding Models Available</h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  To use API-based embeddings, configure a provider in the <strong>Providers</strong> tab with an API key.
                  Supported providers: OpenAI, Gemini, Together AI, Cohere, Voyage AI.
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                  💡 <strong>Tip:</strong> Local browser-based embeddings work without any API keys and are perfect for getting started!
                </p>
              </div>
            </div>
          </div>
        )}
        
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

      {/* Help Text */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>💡 <strong>Tip:</strong> All settings auto-save. Start with text-embedding-3-small (or local MiniLM-L6 for free), 1000 char chunks, 200 overlap</p>
        <p>📖 <strong>Learn more:</strong> Check src/rag/README.md for detailed documentation</p>
      </div>

      {/* Upload dialog and document management removed from settings */}
    </div>
  );
};
