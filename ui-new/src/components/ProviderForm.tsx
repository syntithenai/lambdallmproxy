/**
 * Phase 2: ProviderForm Component
 * 
 * Form for adding or editing provider configurations.
 * Credentials-only interface with auto-filled endpoints.
 */

import { useState, useEffect } from 'react';
import type { ProviderType, ProviderConfig } from '../types/provider';
import { PROVIDER_ENDPOINTS, PROVIDER_INFO } from '../types/provider';
import { validateProvider } from '../utils/providerValidation';

interface ProviderFormProps {
  initialProvider?: ProviderConfig;
  onSave: (provider: Omit<ProviderConfig, 'id'>) => void;
  onCancel: () => void;
}

export function ProviderForm({ initialProvider, onSave, onCancel }: ProviderFormProps) {
  const [providerType, setProviderType] = useState<ProviderType | ''>(initialProvider?.type || '');
  const [apiKey, setApiKey] = useState(initialProvider?.apiKey || '');
  const [apiEndpoint, setApiEndpoint] = useState(initialProvider?.apiEndpoint || '');
  const [modelName, setModelName] = useState(initialProvider?.modelName || '');
  const [rateLimitTPM, setRateLimitTPM] = useState<string>(
    initialProvider?.rateLimitTPM?.toString() || ''
  );
  const [capabilities, setCapabilities] = useState({
    chat: initialProvider?.capabilities?.chat !== false,
    image: initialProvider?.capabilities?.image !== false,
    embedding: initialProvider?.capabilities?.embedding !== false,
    voice: initialProvider?.capabilities?.voice !== false,
    tts: initialProvider?.capabilities?.tts !== false,
  });
  const [allowedModels, setAllowedModels] = useState(
    initialProvider?.allowedModels?.join(', ') || ''
  );
  const [maxImageQuality, setMaxImageQuality] = useState<'fast' | 'standard' | 'high' | 'ultra'>(
    initialProvider?.maxImageQuality || 'fast'
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-fill endpoint when provider type changes
  useEffect(() => {
    if (providerType && providerType !== 'openai-compatible') {
      setApiEndpoint(PROVIDER_ENDPOINTS[providerType]);
    } else if (providerType === 'openai-compatible') {
      setApiEndpoint(initialProvider?.apiEndpoint || 'https://');
    }
  }, [providerType, initialProvider]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!providerType) {
      setErrors({ type: 'Please select a provider type' });
      return;
    }

    const provider: Partial<ProviderConfig> = {
      type: providerType,
      apiKey,
      apiEndpoint,
      capabilities, // Include capabilities
    };

    // Add optional fields for openai-compatible
    if (providerType === 'openai-compatible') {
      provider.modelName = modelName;
      if (rateLimitTPM) {
        provider.rateLimitTPM = parseInt(rateLimitTPM, 10);
      }
    }

    // Add allowed models filter if specified
    if (allowedModels.trim()) {
      provider.allowedModels = allowedModels.split(',').map(m => m.trim()).filter(m => m.length > 0);
    } else {
      provider.allowedModels = null; // Empty = allow all
    }

    // Add max image quality if image capability enabled
    if (capabilities.image && maxImageQuality) {
      provider.maxImageQuality = maxImageQuality;
    }

    // Validate
    const validation = validateProvider(provider);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    // Save
    onSave(provider as Omit<ProviderConfig, 'id'>);
  };

  const providerTypes: ProviderType[] = [
    'groq-free',
    'groq',
    'openai',
    'gemini-free',
    'gemini',
    'together',
    'openai-compatible',
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Provider Type */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
          Provider Type
        </label>
        <select
          value={providerType}
          onChange={(e) => setProviderType(e.target.value as ProviderType)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          <option value="">Select provider type...</option>
          {providerTypes.map((type) => {
            const info = PROVIDER_INFO[type];
            return (
              <option key={type} value={type}>
                {info.icon} {info.name}
              </option>
            );
          })}
        </select>
        {errors.type && <p className="mt-1 text-sm text-red-500">{errors.type}</p>}
      </div>

      {/* Provider Description */}
      {providerType && (
        <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">{PROVIDER_INFO[providerType].description}</p>
        </div>
      )}

      {/* API Endpoint */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
          API Endpoint
        </label>
        <input
          type="text"
          value={apiEndpoint}
          onChange={(e) => setApiEndpoint(e.target.value)}
          disabled={providerType !== 'openai-compatible'}
          className={`w-full px-3 py-2 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            providerType !== 'openai-compatible' ? 'bg-gray-900 cursor-not-allowed' : 'bg-gray-800'
          }`}
          placeholder="https://"
          required
        />
        {providerType !== 'openai-compatible' && (
          <p className="mt-1 text-xs text-gray-500">ⓘ Auto-filled, not editable</p>
        )}
        {providerType === 'openai-compatible' && (
          <p className="mt-1 text-xs text-gray-500">✏️ EDITABLE - Enter custom endpoint</p>
        )}
        {errors.apiEndpoint && <p className="mt-1 text-sm text-red-500">{errors.apiEndpoint}</p>}
      </div>

      {/* Model Name (only for openai-compatible) */}
      {providerType === 'openai-compatible' && (
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Model Name
          </label>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="llama-3.1-70b-instruct"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            ✏️ REQUIRED - Exact model name for API
          </p>
          {errors.modelName && <p className="mt-1 text-sm text-red-500">{errors.modelName}</p>}
        </div>
      )}

      {/* Rate Limit TPM (only for openai-compatible) */}
      {providerType === 'openai-compatible' && (
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Rate Limit (Tokens Per Minute)
          </label>
          <input
            type="number"
            value={rateLimitTPM}
            onChange={(e) => setRateLimitTPM(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Leave empty for no rate limiting"
            min="0"
          />
          <p className="mt-1 text-xs text-gray-500">
            ⓘ Optional - Leave empty to disable rate limiting
          </p>
          {errors.rateLimitTPM && <p className="mt-1 text-sm text-red-500">{errors.rateLimitTPM}</p>}
        </div>
      )}

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter your API key"
          required
        />
        <p className="mt-1 text-xs text-gray-500">ⓘ Your API key for this provider</p>
        {errors.apiKey && <p className="mt-1 text-sm text-red-500">{errors.apiKey}</p>}
      </div>

      {/* Capabilities */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <label className="block text-sm font-medium text-gray-200 mb-3">
          Service Capabilities
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Select which services this provider can be used for. By default, all are enabled.
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={capabilities.chat}
              onChange={(e) => setCapabilities({ ...capabilities, chat: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">💬 Chat / Text Completion</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={capabilities.image}
              onChange={(e) => setCapabilities({ ...capabilities, image: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">🎨 Image Generation</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={capabilities.embedding}
              onChange={(e) => setCapabilities({ ...capabilities, embedding: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">🔗 Embeddings</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={capabilities.voice}
              onChange={(e) => setCapabilities({ ...capabilities, voice: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">🎤 Voice / Transcription</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={capabilities.tts}
              onChange={(e) => setCapabilities({ ...capabilities, tts: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">🔊 Text-to-Speech</span>
          </label>
        </div>
      </div>

      {/* Model Restrictions (ALL LLM Calls) */}
      <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <label className="block text-sm font-medium text-gray-200 mb-3">
          � Model Access Restrictions
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Restrict which models can be used for ALL LLM operations (chat, image generation, etc.). Leave empty to allow all models.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Allowed Models (comma-separated)
          </label>
          <input
            type="text"
            value={allowedModels}
            onChange={(e) => setAllowedModels(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            placeholder="Leave empty for all models, or: llama-3.1-8b-instant, gpt-4o-mini"
          />
          <p className="mt-1 text-xs text-gray-500">
            ⓘ <strong>Empty</strong> = allow all models | <strong>Non-empty</strong> = exact model name must match
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Examples: <code className="text-blue-400">llama-3.1-8b-instant</code>, <code className="text-blue-400">black-forest-labs/FLUX.1-schnell-Free</code>
          </p>
        </div>
      </div>

      {/* Image Generation Configuration (only shown if image capability enabled) */}
      {capabilities.image && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <label className="block text-sm font-medium text-gray-200 mb-3">
            🎨 Image Generation Quality Cap
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Limit maximum image quality to control costs. Works together with "Allowed Models" above.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Maximum Quality Tier
            </label>
            <select
              value={maxImageQuality}
              onChange={(e) => setMaxImageQuality(e.target.value as 'fast' | 'standard' | 'high' | 'ultra')}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fast">Fast (draft, &lt;$0.001/image) - DEFAULT</option>
              <option value="standard">Standard (normal, ~$0.002/image)</option>
              <option value="high">High (detailed, ~$0.04/image)</option>
              <option value="ultra">Ultra (photorealistic, ~$0.12/image)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              ⓘ Prevents generating images above this quality tier
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {initialProvider ? 'Update Provider' : 'Save Provider'}
        </button>
      </div>
    </form>
  );
}
