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
    };

    // Add optional fields for openai-compatible
    if (providerType === 'openai-compatible') {
      provider.modelName = modelName;
      if (rateLimitTPM) {
        provider.rateLimitTPM = parseInt(rateLimitTPM, 10);
      }
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
