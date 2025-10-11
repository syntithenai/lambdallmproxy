import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useYouTubeAuth } from '../contexts/YouTubeAuthContext';
import type { Settings } from '../types/provider';
import { ProviderList } from './ProviderList';

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

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  enabledTools, 
  setEnabledTools,
  onOpenMCPDialog 
}) => {
  const { settings, setSettings } = useSettings();
  const { isConnected, isLoading, error, initiateOAuthFlow, disconnect } = useYouTubeAuth();

  const [tempSettings, setTempSettings] = useState<Settings>(settings);
  const [activeTab, setActiveTab] = useState<'provider' | 'tools' | 'proxy'>('provider');
  
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

          {/* YouTube Transcripts OAuth */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              🎬 YouTube Transcripts
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Enable direct access to YouTube transcripts using Google's API. 
              Faster and more accurate than audio transcription.
            </p>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {isConnected ? (
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isConnected}
                        disabled={isLoading}
                        onChange={(e) => {
                          if (e.target.checked) {
                            initiateOAuthFlow();
                          } else {
                            if (confirm('Disconnect YouTube access? You can reconnect anytime.')) {
                              disconnect();
                            }
                          }
                        }}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {isLoading ? 'Connecting...' : 'Enable YouTube Transcripts'}
                      </span>
                    </label>
                    
                    {isConnected && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Connected
                      </span>
                    )}
                  </div>
                  
                  {error && (
                    <div className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span>{error}</span>
                    </div>
                  )}
                  
                  {isConnected && (
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to disconnect YouTube access?')) {
                            disconnect();
                          }
                        }}
                        className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline"
                      >
                        Disconnect YouTube Access
                      </button>
                    </div>
                  )}
                  
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <p>✓ Much faster than audio transcription (seconds vs. minutes)</p>
                    <p>✓ More accurate for videos with high-quality captions</p>
                    <p>✓ Automatically falls back to Whisper if captions unavailable</p>
                    <p>✓ Read-only access (cannot modify your YouTube account)</p>
                  </div>
                </div>
              </div>
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
              <p>✓ Get credentials from <a href="https://proxy2.webshare.io/userapi/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline">Webshare Dashboard</a></p>
              <p>⚠️ UI settings override environment variables</p>
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
