import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../contexts/SettingsContext';
import { useYouTubeAuth } from '../contexts/YouTubeAuthContext';
import { useLocation } from '../contexts/LocationContext';
import { ProviderList } from './ProviderList';
import { ServerProviders } from './ServerProviders';
import { TTSSettings } from './TTSSettings';
import { RAGSettings } from './RAGSettings';
import { VoiceSettings } from './VoiceSettings';
import CloudSyncSettings from './CloudSyncSettings';
import { TTS_FEATURE_ENABLED } from '../types/tts';

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

  const [activeTab, setActiveTab] = useState<'general' | 'provider' | 'tools' | 'proxy' | 'location' | 'voice' | 'tts' | 'rag' | 'cloud'>('general');
  
  // Proxy settings state
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [proxyEnabled, setProxyEnabled] = useState(false);

  useEffect(() => {
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
  }, []);

  // Auto-save proxy settings whenever they change
  const saveProxySettings = (username: string, password: string, enabled: boolean) => {
    localStorage.setItem('proxy_settings', JSON.stringify({
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
            🧰 {t('settings.tabs.tools')}
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
            onClick={() => setActiveTab('voice')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'voice'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            🎤 {t('settings.tabs.voice')}
          </button>
          {TTS_FEATURE_ENABLED && (
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
          )}
          <button
            onClick={() => setActiveTab('rag')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'rag'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            📚 {t('settings.tabs.rag')}
          </button>
        </div>

        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('settings.language')}
              </label>
              <select
                value={settings.language || 'en'}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="pt">Português</option>
                <option value="ru">Русский</option>
                <option value="zh">中文</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
                <option value="ar">العربية</option>
                <option value="hi">हिन्दी</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('settings.tavilyApiKey')}
              </label>
              <input
                type="password"
                value={settings.tavilyApiKey || ''}
                onChange={(e) => setSettings({ ...settings, tavilyApiKey: e.target.value })}
                placeholder={t('settings.enterTavilyKey')}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {t('settings.tavilyApiKeyHelp')}
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {t('settings.youtubeAuth')}
              </h3>
              {isConnected ? (
                <div className="flex items-center gap-4">
                  <span className="text-green-600 dark:text-green-400">✓ {t('settings.connectedToYouTube')}</span>
                  <button
                    onClick={disconnect}
                    className="btn-secondary"
                  >
                    {t('settings.disconnectYouTube')}
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={initiateOAuthFlow}
                    disabled={isLoading}
                    className="btn-primary"
                  >
                    {isLoading ? t('settings.connecting') : t('settings.connectToYouTube')}
                  </button>
                  {error && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Provider Tab */}
        {activeTab === 'provider' && (
          <div className="space-y-6">
            <ProviderList />
            <ServerProviders />
          </div>
        )}

        {/* Cloud Sync Tab */}
        {activeTab === 'cloud' && (
          <CloudSyncSettings />
        )}

        {/* Tools Tab */}
        {activeTab === 'tools' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {t('settings.enabledTools')}
              </h3>
              <div className="space-y-3">
                {Object.entries(enabledTools).map(([tool, enabled]) => (
                  <label key={tool} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabledTools({ ...enabledTools, [tool]: e.target.checked })}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-gray-900 dark:text-gray-100">
                      {t(`settings.tools.${tool}`)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <button
                onClick={onOpenMCPDialog}
                className="btn-primary w-full"
              >
                {t('settings.configureMCP')}
              </button>
            </div>
          </div>
        )}

        {/* Proxy Tab */}
        {activeTab === 'proxy' && (
          <div className="space-y-6">
            <div>
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={proxyEnabled}
                  onChange={(e) => {
                    setProxyEnabled(e.target.checked);
                    saveProxySettings(proxyUsername, proxyPassword, e.target.checked);
                  }}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-gray-900 dark:text-gray-100 font-medium">
                  {t('settings.enableProxy')}
                </span>
              </label>
            </div>

            {proxyEnabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('settings.proxyUsername')}
                  </label>
                  <input
                    type="text"
                    value={proxyUsername}
                    onChange={(e) => {
                      setProxyUsername(e.target.value);
                      saveProxySettings(e.target.value, proxyPassword, proxyEnabled);
                    }}
                    placeholder={t('settings.enterProxyUsername')}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('settings.proxyPassword')}
                  </label>
                  <input
                    type="password"
                    value={proxyPassword}
                    onChange={(e) => {
                      setProxyPassword(e.target.value);
                      saveProxySettings(proxyUsername, e.target.value, proxyEnabled);
                    }}
                    placeholder={t('settings.enterProxyPassword')}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </>
            )}

            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('settings.proxyHelp')}
            </p>
          </div>
        )}

        {/* Location Tab */}
        {activeTab === 'location' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {t('settings.locationServices')}
              </h3>
              
              {locationLoading && (
                <p className="text-gray-600 dark:text-gray-400">{t('settings.locationLoading')}</p>
              )}
              
              {locationError && (
                <p className="text-red-600 dark:text-red-400">{locationError}</p>
              )}
              
              {location ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-green-800 dark:text-green-200 font-medium">
                      {t('settings.locationEnabled')}
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                      Lat: {location.latitude.toFixed(6)}, Lng: {location.longitude.toFixed(6)}
                    </p>
                  </div>
                  <button
                    onClick={clearLocation}
                    className="btn-secondary"
                  >
                    {t('settings.clearLocation')}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-600 dark:text-gray-400">
                    {t('settings.locationHelp')}
                  </p>
                  <button
                    onClick={requestLocation}
                    disabled={locationLoading || permissionState === 'denied'}
                    className="btn-primary"
                  >
                    {t('settings.enableLocation')}
                  </button>
                  {permissionState === 'denied' && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {t('settings.locationDenied')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Voice Tab */}
        {activeTab === 'voice' && (
          <VoiceSettings />
        )}

        {/* TTS Tab */}
        {activeTab === 'tts' && (
          <TTSSettings />
        )}

        {/* RAG Tab */}
        {activeTab === 'rag' && (
          <RAGSettings />
        )}
      </div>
    </div>
  );
};
