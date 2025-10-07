import React, { useState, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface EnabledTools {
  web_search: boolean;
  execute_js: boolean;
  scrape_url: boolean;
  youtube: boolean;
  transcribe: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enabledTools: EnabledTools;
  setEnabledTools: (tools: EnabledTools) => void;
  onOpenMCPDialog: () => void;
}

type Provider = 'groq' | 'openai';

interface Settings {
  provider: Provider;
  llmApiKey: string;
  tavilyApiKey: string;
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

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  enabledTools, 
  setEnabledTools,
  onOpenMCPDialog 
}) => {
  const [settings, setSettings] = useLocalStorage<Settings>('app_settings', {
    provider: 'groq',
    llmApiKey: '',
    tavilyApiKey: '',
    apiEndpoint: PROVIDER_ENDPOINTS.groq,
    smallModel: DEFAULT_MODELS.groq.small,
    largeModel: DEFAULT_MODELS.groq.large,
    reasoningModel: DEFAULT_MODELS.groq.reasoning
  });

  const [tempSettings, setTempSettings] = useState<Settings>(settings);
  const [activeTab, setActiveTab] = useState<'provider' | 'tools'>('provider');

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

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
          <button
            onClick={() => setActiveTab('provider')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'provider'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            🔌 Provider
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'tools'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            🛠️ Tools
          </button>
        </div>

        {/* Provider Tab */}
        {activeTab === 'provider' && (
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
        )}

        {/* Tools Tab */}
        {activeTab === 'tools' && (
        <div className="space-y-6">
          {/* Tavily API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tavily API Key (Optional)
            </label>
            <input
              type="password"
              value={tempSettings.tavilyApiKey}
              onChange={(e) => setTempSettings({ ...tempSettings, tavilyApiKey: e.target.value })}
              className="input-field"
              placeholder="tvly-..."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Enables enhanced web search and scraping via Tavily API. Falls back to DuckDuckGo if not provided.
            </p>
          </div>

          {/* Tool Configuration */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Enabled Tools
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.web_search}
                  onChange={(e) => setEnabledTools({ ...enabledTools, web_search: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    🔍 Web Search
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Search the web for current information, news, and articles
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.execute_js}
                  onChange={(e) => setEnabledTools({ ...enabledTools, execute_js: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    ⚡ JavaScript Execution
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Execute JavaScript code for calculations and data processing
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.scrape_url}
                  onChange={(e) => setEnabledTools({ ...enabledTools, scrape_url: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    🌐 Web Scraping
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Extract content from specific URLs and websites
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.youtube}
                  onChange={(e) => setEnabledTools({ ...enabledTools, youtube: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    🎬 YouTube Search
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Search YouTube for videos with transcript support
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.transcribe}
                  onChange={(e) => setEnabledTools({ ...enabledTools, transcribe: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    🎙️ Transcribe Audio/Video
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Transcribe audio/video from URLs (YouTube, MP3, MP4, etc.) using Whisper
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* MCP Servers */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                MCP Servers
              </h3>
              <button
                onClick={() => {
                  onOpenMCPDialog();
                  onClose();
                }}
                className="btn-secondary text-sm px-4 py-2"
                title="Configure Model Context Protocol Servers"
              >
                ➕ Configure MCP
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add and manage Model Context Protocol servers for extended functionality
            </p>
          </div>
        </div>
        )}

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
