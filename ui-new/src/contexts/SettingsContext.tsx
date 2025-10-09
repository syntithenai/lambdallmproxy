import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { Settings, SettingsV1, ProviderConfig } from '../types/provider';
import { PROVIDER_ENDPOINTS } from '../types/provider';

interface SettingsContextValue {
  settings: Settings;
  setSettings: (settings: Settings) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

/**
 * Migrate settings from v1.0.0 to v2.0.0
 * Converts single provider to multi-provider array
 */
function migrateSettings(oldSettings: any): Settings {
  // If already v2, return as-is
  if (oldSettings.version === '2.0.0') {
    return oldSettings;
  }

  // Migrate from v1 single provider to v2 multi-provider
  const migratedProviders: ProviderConfig[] = [];

  if (oldSettings.provider && oldSettings.llmApiKey) {
    // Determine provider type - assume Groq was free tier by default
    const providerType = oldSettings.provider === 'groq' ? 'groq-free' : 'openai';
    
    migratedProviders.push({
      id: crypto.randomUUID(),
      type: providerType,
      apiEndpoint: PROVIDER_ENDPOINTS[providerType],
      apiKey: oldSettings.llmApiKey
    });
  }

  return {
    version: '2.0.0',
    providers: migratedProviders,
    tavilyApiKey: oldSettings.tavilyApiKey || ''
  };
}

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [rawSettings, setRawSettings] = useLocalStorage<Settings | SettingsV1>('app_settings', {
    version: '2.0.0',
    providers: [],
    tavilyApiKey: ''
  });

  // Migrate settings on mount if needed
  const settings = migrateSettings(rawSettings);

  // Save migrated settings if migration occurred
  useEffect(() => {
    if (rawSettings !== settings) {
      setRawSettings(settings);
    }
  }, [rawSettings, settings, setRawSettings]);

  const setSettings = (newSettings: Settings) => {
    setRawSettings(newSettings);
  };

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
