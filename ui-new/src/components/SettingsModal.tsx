import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useYouTubeAuth } from '../contexts/YouTubeAuthContext';
import { useLocation } from '../contexts/LocationContext';
import type { Settings } from '../types/provider';
import { ProviderList } from './ProviderList';

interface EnabledTools {
  web_search: boolean;
  execute_js: boolean;
  scrape_url: boolean;
  youtube: boolean;
  transcribe: boolean;
  generate_chart: boolean;
  generate_image: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enabledTools: EnabledTools;
  setEnabledTools: (tools: EnabledTools) => void;
  onOpenMCPDialog: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  enabledTools, 
  setEnabledTools,
  onOpenMCPDialog 
}) => {
  const { settings, setSettings } = useSettings();
  const { isConnected, isLoading, error, initiateOAuthFlow, disconnect } = useYouTubeAuth();
  const { location, isLoading: locationLoading, error: locationError, permissionState, requestLocation, clearLocation } = useLocation();

  const [tempSettings, setTempSettings] = useState<Settings>(settings);
  const [activeTab, setActiveTab] = useState<'provider' | 'tools' | 'proxy' | 'location'>('provider');
  
  // Proxy settings state
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [proxyEnabled, setProxyEnabled] = useState(false);

  useEffect(() => {
    setTempSettings(settings);
    
    // Load proxy settings from localStorage
    const savedProxySettings = localStorage.getItem('proxy_settings');
    if (savedProxySettings) {
      try {
        const parsed = JSON.parse(savedProxySettings);
        setProxyUsername(parsed.username || '');
        setProxyPassword(parsed.password || '');
        setProxyEnabled(parsed.enabled !== false); // Default to true
      } catch (e) {
        console.error('Failed to parse proxy settings:', e);
      }
    }
  }, [settings, isOpen]);

  const handleSave = () => {
    setSettings(tempSettings);
    
    // Save proxy settings to localStorage
    localStorage.setItem('proxy_settings', JSON.stringify({
      username: proxyUsername,
      password: proxyPassword,
      enabled: proxyEnabled
    }));
    
    console.log('Settings saved:', tempSettings);
    onClose();
  };

  const handleCancel = () => {
    setTempSettings(settings);
    onClose();
  };

  if (!isOpen) return null;

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
          <button
            onClick={() => setActiveTab('proxy')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'proxy'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            🌐 Proxy
          </button>
          <button
            onClick={() => setActiveTab('location')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'location'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            📍 Location
          </button>
        </div>

        {/* Provider Tab */}
        {activeTab === 'provider' && (
        <div className="space-y-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              ⚡ Provider Credentials
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure your LLM provider API keys. The backend automatically selects the best model for each request.
            </p>
          </div>
          
          {/* Provider List Component */}
          <ProviderList />
          
          {/* Model Selection Optimization */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              🎯 Model Selection Strategy
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Choose how the system selects models for your requests. This balances cost, quality, and performance.
            </p>
            
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 has-[:checked]:border-blue-500 dark:has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20">
                <input
                  type="radio"
                  name="optimization"
                  value="cheap"
                  checked={(tempSettings.optimization || 'cheap') === 'cheap'}
                  onChange={(e) => setTempSettings({ ...tempSettings, optimization: e.target.value as any })}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    💰 Cheap (Recommended)
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Prioritize free providers (Groq, Gemini) and smallest capable models. Falls back to paid providers only when rate-limited. Best for most use cases.
                  </div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 has-[:checked]:border-blue-500 dark:has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20">
                <input
                  type="radio"
                  name="optimization"
                  value="balanced"
                  checked={tempSettings.optimization === 'balanced'}
                  onChange={(e) => setTempSettings({ ...tempSettings, optimization: e.target.value as any })}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    ⚖️ Balanced
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Choose models that reliably do the job without compromising quality. Uses free tier when quality is equivalent, paid models when quality matters. Balances cost vs. capability.
                  </div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 has-[:checked]:border-blue-500 dark:has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20">
                <input
                  type="radio"
                  name="optimization"
                  value="powerful"
                  checked={tempSettings.optimization === 'powerful'}
                  onChange={(e) => setTempSettings({ ...tempSettings, optimization: e.target.value as any })}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    💪 Powerful
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Use the best available models (GPT-4o, Gemini 2.5 Pro, o1) for maximum capability. Prioritizes quality over cost. Uses reasoning models for complex analysis.
                  </div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 has-[:checked]:border-blue-500 dark:has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20">
                <input
                  type="radio"
                  name="optimization"
                  value="fastest"
                  checked={tempSettings.optimization === 'fastest'}
                  onChange={(e) => setTempSettings({ ...tempSettings, optimization: e.target.value as any })}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    ⚡ Fastest
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Prioritize low-latency models (Groq) for quick responses. May sacrifice some quality for speed in simple requests. Great for interactive sessions.
                  </div>
                </div>
              </label>
            </div>
          </div>
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

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.generate_chart}
                  onChange={(e) => setEnabledTools({ ...enabledTools, generate_chart: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    📊 Generate Charts & Diagrams
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Create interactive flowcharts, sequence diagrams, ER diagrams, Gantt charts, and more
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.generate_image}
                  onChange={(e) => setEnabledTools({ ...enabledTools, generate_image: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    🎨 Generate Images (AI)
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Create images using DALL-E, Stable Diffusion, and other AI models with quality tier selection
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* YouTube Transcripts - Simple Checkbox */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <div className="mb-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={isConnected}
                  onChange={(e) => {
                    // Don't trigger OAuth on checkbox click
                    // User needs to explicitly use the connect button below
                    e.preventDefault();
                  }}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    📺 Use YouTube Captions API
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Direct access to YouTube transcripts (faster than Whisper transcription)
                  </div>
                </div>
                {isConnected && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Connected
                  </span>
                )}
              </label>
            </div>

            {/* Connection Controls - Only show if not connected */}
            {!isConnected && (
              <div className="ml-11 mb-4">
                <button
                  onClick={initiateOAuthFlow}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isLoading ? 'Connecting...' : 'Connect YouTube Account'}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Requires Google account authorization (read-only access)
                </p>
              </div>
            )}

            {/* Disconnect Button - Only show if connected */}
            {isConnected && (
              <div className="ml-11 mb-4">
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to disconnect YouTube access?')) {
                      disconnect();
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-300 dark:border-red-700 rounded-lg transition-colors"
                >
                  Disconnect YouTube Access
                </button>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="ml-11 mb-4 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}
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

        {/* Proxy Tab */}
        {activeTab === 'proxy' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
              Webshare Proxy Configuration
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Configure residential proxy for YouTube, DuckDuckGo, and content scraping to avoid rate limiting
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Username
                </label>
                <input
                  type="text"
                  value={proxyUsername}
                  onChange={(e) => setProxyUsername(e.target.value)}
                  placeholder="exrihquq"
                  className="input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <input
                  type="password"
                  value={proxyPassword}
                  onChange={(e) => setProxyPassword(e.target.value)}
                  placeholder="Enter password"
                  className="input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="proxyEnabled"
                  checked={proxyEnabled}
                  onChange={(e) => setProxyEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="proxyEnabled" className="text-sm text-gray-700 dark:text-gray-300">
                  Enable proxy for all requests
                </label>
              </div>
            </div>
            
            <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 space-y-1 bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
              <p>✓ Rotating residential IPs via p.webshare.io:80</p>
              <p>✓ Avoids rate limiting from Google and other services</p>
              <p>✓ Get credentials from <a href="https://dashboard.webshare.io/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline">Webshare Dashboard</a></p>
              <p>⚠️ UI settings override environment variables</p>
            </div>
          </div>
        </div>
        )}

        {/* Location Tab */}
        {activeTab === 'location' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
              📍 Location Services
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Enable location services to provide context-aware responses for local queries (weather, restaurants, directions, etc.)
            </p>
            
            {/* Location Status Card */}
            <div className={`p-6 rounded-lg border-2 ${
              location 
                ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                : permissionState === 'denied'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
            }`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {locationLoading ? (
                    <svg className="w-12 h-12 text-blue-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : location ? (
                    <svg className="w-12 h-12 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  ) : permissionState === 'denied' ? (
                    <svg className="w-12 h-12 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm1 13h-2v-2h2v2zm0-4h-2V7h2v4z"/>
                    </svg>
                  ) : (
                    <svg className="w-12 h-12 text-gray-400" viewBox="0 0 24 24" fill="currentColor" opacity="0.5">
                      <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                    </svg>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="mb-3">
                    {locationLoading ? (
                      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Getting your location...
                      </div>
                    ) : location ? (
                      <>
                        <div className="text-lg font-semibold text-green-700 dark:text-green-400 mb-2">
                          Location Enabled
                        </div>
                        {location.address && (
                          <div className="space-y-1">
                            {location.address.formatted && (
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {location.address.formatted}
                              </div>
                            )}
                            {!location.address.formatted && (
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {[location.address.city, location.address.state, location.address.country].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                          <div>Coordinates: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</div>
                          <div>Accuracy: ±{location.accuracy.toFixed(0)} meters</div>
                          <div>Updated: {new Date(location.timestamp).toLocaleString()}</div>
                        </div>
                      </>
                    ) : permissionState === 'denied' ? (
                      <>
                        <div className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
                          Location Access Denied
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          You have denied location access. To enable it, please update your browser settings and reload the page.
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Location Not Enabled
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Click the button below to share your location. This helps provide better responses for location-specific queries.
                        </div>
                      </>
                    )}
                  </div>
                  
                  {locationError && (
                    <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
                      <div className="text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span>{locationError}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 flex gap-3">
                    {!location && permissionState !== 'denied' && (
                      <button
                        onClick={requestLocation}
                        disabled={locationLoading}
                        className="btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {locationLoading ? 'Getting Location...' : 'Enable Location'}
                      </button>
                    )}
                    
                    {location && (
                      <>
                        <button
                          onClick={requestLocation}
                          disabled={locationLoading}
                          className="btn-secondary px-4 py-2"
                        >
                          🔄 Refresh
                        </button>
                        <button
                          onClick={clearLocation}
                          className="btn-secondary px-4 py-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          🗑️ Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Privacy Notice */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    Privacy & Usage
                  </h4>
                  <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                    <p>✓ Your location is stored locally in your browser (not on our servers)</p>
                    <p>✓ Location data is only sent to the Lambda function when you send a chat message</p>
                    <p>✓ Automatically expires after 24 hours</p>
                    <p>✓ You can clear your location data at any time</p>
                    <p>✓ Used for: weather, local businesses, directions, time zones, regional info</p>
                  </div>
                </div>
              </div>
            </div>
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
