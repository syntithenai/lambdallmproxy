import React, { useState, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Provider = 'groq' | 'openai';

interface Settings {
  provider: Provider;
  llmApiKey: string;
  apiEndpoint: string;
  smallModel: string;
  largeModel: string;
  reasoningModel: string;
}

const PROVIDER_ENDPOINTS: Record<Provider, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1'
};

const MODEL_SUGGESTIONS: Record<Provider, { small: string[]; large: string[]; reasoning: string[] }> = {
  groq: {
    small: [
      'llama-3.1-8b-instant',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'gemma2-9b-it'
    ],
    large: [
      // Best rate limits + context (recommended order)
      'meta-llama/llama-4-scout-17b-16e-instruct',  // 30K TPM (fastest!), 131K context, parallel tools
      'qwen/qwen3-32b',                              // 6K TPM, 131K context, parallel tools
      'moonshotai/kimi-k2-instruct-0905',           // 262K context (largest!), parallel tools
      'openai/gpt-oss-120b',                        // 131K context, 65K output
      'openai/gpt-oss-20b',                         // 131K context, 65K output
      'meta-llama/llama-4-maverick-17b-128e-instruct', // 131K context, parallel tools
      'llama-3.1-8b-instant',                       // Fast, 131K context, parallel tools
      'llama-3.3-70b-versatile',                    // 131K context, has format issues
      'mixtral-8x7b-32768'
    ],
    reasoning: [
      // Best for reasoning/planning
      'openai/gpt-oss-120b',
      'qwen/qwen3-32b',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b'
    ]
  },
  openai: {
    small: ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4o-mini-2024-07-18'],
    large: ['gpt-4o', 'gpt-4-turbo', 'gpt-4'],
    reasoning: ['o1-preview', 'o1-mini', 'gpt-4o']
  }
};

const DEFAULT_MODELS: Record<Provider, { small: string; large: string; reasoning: string }> = {
  groq: {
    small: 'llama-3.1-8b-instant',
    large: 'meta-llama/llama-4-scout-17b-16e-instruct',  // Best rate limits (30K TPM) + good context
    reasoning: 'openai/gpt-oss-120b'  // Updated to use OpenAI's GPT-OSS 120B for best reasoning
  },
  openai: {
    small: 'gpt-4o-mini',
    large: 'gpt-4o',
    reasoning: 'o1-preview'
  }
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useLocalStorage<Settings>('app_settings', {
    provider: 'groq',
    llmApiKey: '',
    apiEndpoint: PROVIDER_ENDPOINTS.groq,
    smallModel: DEFAULT_MODELS.groq.small,
    largeModel: DEFAULT_MODELS.groq.large,
    reasoningModel: DEFAULT_MODELS.groq.reasoning
  });

  const [tempSettings, setTempSettings] = useState<Settings>(settings);

  useEffect(() => {
    setTempSettings(settings);
  }, [settings, isOpen]);

  const handleProviderChange = (provider: Provider) => {
    setTempSettings({
      ...tempSettings,
      provider,
      apiEndpoint: PROVIDER_ENDPOINTS[provider],
      smallModel: DEFAULT_MODELS[provider].small,
      largeModel: DEFAULT_MODELS[provider].large,
      reasoningModel: DEFAULT_MODELS[provider].reasoning
    });
  };

  const handleSave = () => {
    setSettings(tempSettings);
    console.log('Settings saved:', tempSettings);
    onClose();
  };

  const handleCancel = () => {
    setTempSettings(settings);
    onClose();
  };

  if (!isOpen) return null;

  const suggestions = MODEL_SUGGESTIONS[tempSettings.provider];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={handleCancel}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* API Provider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Provider
            </label>
            <select
              value={tempSettings.provider}
              onChange={(e) => handleProviderChange(e.target.value as Provider)}
              className="input-field"
            >
              <option value="groq">Groq</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          {/* LLM API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={tempSettings.llmApiKey}
              onChange={(e) => setTempSettings({ ...tempSettings, llmApiKey: e.target.value })}
              className="input-field"
              placeholder={`Enter your ${tempSettings.provider === 'groq' ? 'Groq' : 'OpenAI'} API key`}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This key is stored locally in your browser
            </p>
          </div>

          {/* Small Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Small Model (Fast, low-cost tasks)
            </label>
            <select
              value={tempSettings.smallModel}
              onChange={(e) => setTempSettings({ ...tempSettings, smallModel: e.target.value })}
              className="input-field"
            >
              {suggestions.small.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Fast, low-cost models for simple tasks
            </p>
          </div>

          {/* Large Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Large Model (Complex, high-quality tasks)
            </label>
            <select
              value={tempSettings.largeModel}
              onChange={(e) => setTempSettings({ ...tempSettings, largeModel: e.target.value })}
              className="input-field"
            >
              {suggestions.large.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              High-quality models for complex reasoning and detailed responses
            </p>
          </div>

          {/* Reasoning Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Reasoning Model (Planning, analysis)
            </label>
            <select
              value={tempSettings.reasoningModel}
              onChange={(e) => setTempSettings({ ...tempSettings, reasoningModel: e.target.value })}
              className="input-field"
            >
              {suggestions.reasoning.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Best models for planning, multi-step reasoning, and complex analysis
            </p>
          </div>

          {/* API Endpoint (Hidden/Auto-filled) */}
          <input type="hidden" value={tempSettings.apiEndpoint} />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Endpoint: {tempSettings.apiEndpoint}
          </p>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
