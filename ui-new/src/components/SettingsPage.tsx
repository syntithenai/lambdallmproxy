import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../contexts/SettingsContext';
import { useYouTubeAuth } from '../contexts/YouTubeAuthContext';
import { useLocation } from '../contexts/LocationContext';
import { useFeatures } from '../contexts/FeaturesContext';
import { ProviderList } from './ProviderList';
import { ServerProviders } from './ServerProviders';
import { TTSSettings } from './TTSSettings';
import { RAGSettings } from './RAGSettings';
import CloudSyncSettings from './CloudSyncSettings';

interface EnabledTools {
  web_search: boolean;
  execute_js: boolean;
  scrape_url: boolean;
  youtube: boolean;
  transcribe: boolean;
  generate_chart: boolean;
  generate_image: boolean;
  search_knowledge_base: boolean;
  manage_todos: boolean;
  manage_snippets: boolean;
  ask_llm: boolean;
  generate_reasoning_chain: boolean;
}

interface SettingsPageProps {
  enabledTools: EnabledTools;
  setEnabledTools: (tools: EnabledTools) => void;
  onOpenMCPDialog: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ 
  enabledTools, 
  setEnabledTools,
  onOpenMCPDialog 
}) => {
  const { settings, setSettings } = useSettings();
  const { t, i18n } = useTranslation();
  const { isConnected, isLoading, error, initiateOAuthFlow, disconnect } = useYouTubeAuth();
  const { location, isLoading: locationLoading, error: locationError, permissionState, requestLocation, clearLocation } = useLocation();
  const { features } = useFeatures();

  const [activeTab, setActiveTab] = useState<'general' | 'provider' | 'tools' | 'proxy' | 'location' | 'tts' | 'rag' | 'cloud'>('general');
  
  // Track if a provider is being edited
  const [isEditingProvider, setIsEditingProvider] = useState(false);
  
  // Proxy settings state
  const [useServerProxy, setUseServerProxy] = useState(false);
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [proxyEnabled, setProxyEnabled] = useState(false);

  useEffect(() => {
    // Load proxy settings from localStorage
    const savedProxySettings = localStorage.getItem('proxy_settings');
    if (savedProxySettings) {
      try {
        const parsed = JSON.parse(savedProxySettings);
        setUseServerProxy(parsed.useServerProxy || false);
        setProxyUsername(parsed.username || '');
        setProxyPassword(parsed.password || '');
        setProxyEnabled(parsed.enabled !== false); // Default to true
      } catch (e) {
        console.error('Failed to parse proxy settings:', e);
      }
    }
  }, []);

  // Auto-save proxy settings whenever they change
  const saveProxySettings = (serverProxy: boolean, username: string, password: string, enabled: boolean) => {
    localStorage.setItem('proxy_settings', JSON.stringify({
      useServerProxy: serverProxy,
      username,
      password,
      enabled
    }));
  };
  
  // Handle language change
  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setSettings({ ...settings, language: lang });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="card p-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t('settings.title')}</h1>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            ⚙️ {t('settings.tabs.general')}
          </button>
          <button
            onClick={() => setActiveTab('provider')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'provider'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            🔌 {t('settings.tabs.provider')}
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'cloud'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            ☁️ {t('settings.tabs.cloud')}
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'tools'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            🛠️ {t('settings.tabs.tools')}
          </button>
          <button
            onClick={() => setActiveTab('proxy')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'proxy'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            🌐 {t('settings.tabs.proxy')}
          </button>
          <button
            onClick={() => setActiveTab('location')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'location'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            📍 {t('settings.tabs.location')}
          </button>
          <button
            onClick={() => setActiveTab('tts')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'tts'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            🔊 {t('settings.tabs.tts')}
          </button>
          <button
            onClick={() => setActiveTab('rag')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'rag'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            🧠 {t('settings.tabs.rag')}
          </button>
        </div>

        {/* General Tab */}
        {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t('settings.general')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('settings.generalDescription')}
            </p>
          </div>
          
          {/* Language Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              🌍 {t('settings.language')}
            </label>
            <select 
              value={settings.language || 'en'}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="en">🇬🇧 {t('languages.en')} - English</option>
              <option value="es">🇪🇸 {t('languages.es')} - Spanish</option>
              <option value="fr">🇫🇷 {t('languages.fr')} - French</option>
              <option value="de">🇩🇪 {t('languages.de')} - German</option>
              <option value="nl">🇳🇱 {t('languages.nl')} - Dutch</option>
              <option value="pt">🇵🇹 {t('languages.pt')} - Portuguese</option>
              <option value="ru">🇷🇺 {t('languages.ru')} - Russian</option>
              <option value="zh">🇨🇳 {t('languages.zh')} - Chinese</option>
              <option value="ja">🇯🇵 {t('languages.ja')} - Japanese</option>
              <option value="ar">🇸🇦 {t('languages.ar')} - Arabic</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('settings.languageHelp')}
            </p>
          </div>
        </div>
        )}

        {/* Provider Tab */}
        {activeTab === 'provider' && (
        <div className="space-y-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              ⚡ {t('settings.providerCredentials')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('settings.providerDescription')}
            </p>
          </div>
          
          {/* Provider List Component */}
          <ProviderList onEditingChange={setIsEditingProvider} />
          
          {/* Server Providers - Show available features */}
          {!isEditingProvider && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              🌐 {t('settings.serverProviders')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('settings.serverProvidersDescription')}
            </p>
            <ServerProviders />
          </div>
          )}
          
          {/* Model Selection Optimization - Hidden when editing a provider */}
          {!isEditingProvider && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              🎯 {t('settings.modelSelectionStrategy')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('settings.modelStrategyDescription')}
            </p>
            
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 has-[:checked]:border-blue-500 dark:has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20">
                <input
                  type="radio"
                  name="optimization"
                  value="cheap"
                  checked={(settings.optimization || 'cheap') === 'cheap'}
                  onChange={(e) => setSettings({ ...settings, optimization: e.target.value as any })}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    💰 {t('settings.cheap')}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {t('settings.cheapDescription')}
                  </div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 has-[:checked]:border-blue-500 dark:has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20">
                <input
                  type="radio"
                  name="optimization"
                  value="balanced"
                  checked={settings.optimization === 'balanced'}
                  onChange={(e) => setSettings({ ...settings, optimization: e.target.value as any })}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    ⚖️ {t('settings.balanced')}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {t('settings.balancedDescription')}
                  </div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 has-[:checked]:border-blue-500 dark:has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20">
                <input
                  type="radio"
                  name="optimization"
                  value="powerful"
                  checked={settings.optimization === 'powerful'}
                  onChange={(e) => setSettings({ ...settings, optimization: e.target.value as any })}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    💪 {t('settings.powerful')}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {t('settings.powerfulDescription')}
                  </div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 has-[:checked]:border-blue-500 dark:has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20">
                <input
                  type="radio"
                  name="optimization"
                  value="fastest"
                  checked={settings.optimization === 'fastest'}
                  onChange={(e) => setSettings({ ...settings, optimization: e.target.value as any })}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    ⚡ {t('settings.fastest')}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {t('settings.fastestDescription')}
                  </div>
                </div>
              </label>
            </div>
          </div>
          )}
        </div>
        )}

        {/* Tools Tab */}
        {activeTab === 'tools' && (
        <div className="space-y-6">
          {/* Tavily API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.tavilyApiKey')}
            </label>
            <input
              type="password"
              value={settings.tavilyApiKey}
              onChange={(e) => setSettings({ ...settings, tavilyApiKey: e.target.value })}
              className="input-field"
              placeholder={t('settings.tavilyPlaceholder')}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('settings.tavilyHelp')}
            </p>
          </div>

          {/* Tool Configuration */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t('settings.enabledTools')}
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
                    🔍 {t('settings.webSearch')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.webSearchDescription')}
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
                    ⚡ {t('settings.executeJs')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.executeJsDescription')}
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
                    🌐 {t('settings.scrapeUrl')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.scrapeUrlDescription')}
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
                    🎬 {t('settings.youtubeSearch')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.youtubeDescription')}
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
                    🎙️ {t('settings.transcribe')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.transcribeDescription')}
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
                    📊 {t('settings.generateChart')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.chartDescription')}
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
                    🎨 {t('settings.generateImage')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.imageDescription')}
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.search_knowledge_base}
                  onChange={(e) => setEnabledTools({ ...enabledTools, search_knowledge_base: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    📚 {t('settings.searchKnowledgeBase')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.ragDescription')}
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.manage_todos}
                  onChange={(e) => setEnabledTools({ ...enabledTools, manage_todos: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    ✅ {t('settings.manageTodos')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.todosDescription')}
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={enabledTools.manage_snippets}
                  onChange={(e) => setEnabledTools({ ...enabledTools, manage_snippets: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    📝 {t('settings.manageSnippets')}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.snippetsDescription')}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* YouTube Transcripts */}
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

          {/* Tool Configuration Continued */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-2 border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10">
                <input
                  type="checkbox"
                  checked={enabledTools.ask_llm}
                  onChange={(e) => setEnabledTools({ ...enabledTools, ask_llm: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    🤖 {t('settings.askLlm')}
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-200 dark:bg-amber-900/50 dark:text-amber-400 rounded-full">
                      ⚠️ HIGH TOKEN USAGE
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-1">
                    {t('settings.askLlmDescription')}
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 p-2 rounded border border-amber-300 dark:border-amber-800">
                    <strong>WARNING:</strong> This tool creates complete recursive conversations with all available tools and multiple iterations. 
                    Can consume <strong>5-10x more tokens</strong> than direct responses. Use ONLY for complex queries requiring multiple steps with different tools. 
                    Limited to 5 iterations with token budget safeguards.
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-4 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors border-3 border-red-400 dark:border-red-900 bg-red-50 dark:bg-red-950/20 shadow-md">
                <input
                  type="checkbox"
                  checked={enabledTools.generate_reasoning_chain}
                  onChange={(e) => setEnabledTools({ ...enabledTools, generate_reasoning_chain: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-red-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    🧠 {t('settings.generateReasoning')}
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold text-red-800 bg-red-300 dark:bg-red-900/70 dark:text-red-300 rounded-full animate-pulse">
                      ⚠️⚠️ EXTREME TOKEN USAGE
                    </span>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-200 font-semibold mb-1">
                    {t('settings.reasoningDescription')}
                  </div>
                  <div className="text-xs text-red-800 dark:text-red-300 bg-red-100 dark:bg-red-950/50 p-3 rounded border-2 border-red-400 dark:border-red-800 space-y-1">
                    <div className="font-bold text-sm mb-2">🚨 CRITICAL WARNINGS:</div>
                    <div>• Can consume <strong className="text-red-900 dark:text-red-200">10-50x MORE tokens</strong> than normal responses</div>
                    <div>• Uses <strong>maximum reasoning depth</strong> - models think extensively before responding</div>
                    <div>• May trigger <strong>PARALLEL ASYNCHRONOUS TOOL CALLS</strong> causing rapid token consumption</div>
                    <div>• Reasoning models charge for <strong>both reasoning AND output tokens</strong></div>
                    <div className="mt-2 pt-2 border-t border-red-300 dark:border-red-800">
                      <strong>USE ONLY FOR:</strong> Complex problems requiring deep logical analysis, multi-step proofs, mathematical derivations, or strategic planning where explicit reasoning transparency is essential.
                    </div>
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
              {t('settings.proxySettings')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('settings.proxyDescription')}
            </p>
            
            <div className="space-y-4">
              {/* Server Proxy Checkbox - Only show if backend has proxy configured */}
              {features?.proxy && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      id="useServerProxy"
                      checked={useServerProxy}
                      onChange={(e) => {
                        const newServerProxy = e.target.checked;
                        setUseServerProxy(newServerProxy);
                        saveProxySettings(newServerProxy, proxyUsername, proxyPassword, proxyEnabled);
                      }}
                      className="w-4 h-4"
                    />
                    <label htmlFor="useServerProxy" className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Use Server Proxy (Recommended)
                    </label>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300 ml-6">
                    Server has a proxy configured. Uses server's proxy credentials for all requests.
                  </p>
                </div>
              )}

              {/* User Proxy Settings - Only relevant if not using server proxy */}
              <div className={useServerProxy ? 'opacity-50 pointer-events-none' : ''}>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    {t('settings.proxyUsername')}
                  </label>
                  <input
                    type="text"
                    value={proxyUsername}
                    onChange={(e) => {
                      const newUsername = e.target.value;
                      setProxyUsername(newUsername);
                      saveProxySettings(useServerProxy, newUsername, proxyPassword, proxyEnabled);
                    }}
                    placeholder="exrihquq"
                    disabled={useServerProxy}
                    className="input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    {t('settings.proxyPassword')}
                  </label>
                  <input
                    type="password"
                    value={proxyPassword}
                    onChange={(e) => {
                      const newPassword = e.target.value;
                      setProxyPassword(newPassword);
                      saveProxySettings(useServerProxy, proxyUsername, newPassword, proxyEnabled);
                    }}
                    placeholder="Enter password"
                    disabled={useServerProxy}
                    className="input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                
                <div className="flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    id="proxyEnabled"
                    checked={proxyEnabled}
                    onChange={(e) => {
                      const newEnabled = e.target.checked;
                      setProxyEnabled(newEnabled);
                      saveProxySettings(useServerProxy, proxyUsername, proxyPassword, newEnabled);
                    }}
                    disabled={useServerProxy}
                    className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <label htmlFor="proxyEnabled" className="text-sm text-gray-700 dark:text-gray-300">
                    Enable user proxy for all requests
                  </label>
                </div>
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
              📍 {t('settings.locationServices')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('settings.locationDescription')}
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

        {/* TTS Tab */}
        {activeTab === 'tts' && (
          <TTSSettings />
        )}

        {/* RAG Tab */}
        {activeTab === 'rag' && (
          <RAGSettings />
        )}

        {/* Cloud Sync Tab */}
        {activeTab === 'cloud' && (
          <CloudSyncSettings />
        )}
      </div>
    </div>
  );
};
