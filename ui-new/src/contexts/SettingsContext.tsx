import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { Settings, SettingsV1, ProviderConfig } from '../types/provider';
import { PROVIDER_ENDPOINTS } from '../types/provider';
import { loadSettingsFromDrive, saveSettingsToDrive, isAuthenticated } from '../utils/googleDocs';

interface SettingsContextValue {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  loadFromGoogleDrive: () => Promise<void>;
  saveToGoogleDrive: () => Promise<void>;
  clearSettings: () => void;
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
    // Determine provider type - map old groq to new groq type
    const providerType = oldSettings.provider === 'groq' ? 'groq' : 'openai';
    
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
    tavilyApiKey: '',
    syncToGoogleDrive: true // Default to enabled for better user experience
  });

  const [isLoadingFromDrive, setIsLoadingFromDrive] = useState(false);

  // Migrate settings on mount if needed
  const settings = migrateSettings(rawSettings);

  // Save migrated settings if migration occurred
  useEffect(() => {
    if (rawSettings !== settings) {
      setRawSettings(settings);
    }
  }, [rawSettings, settings, setRawSettings]);

  // Auto-load from Google Drive on mount if user is authenticated
  useEffect(() => {
    const autoLoadFromDrive = async () => {
      if (isAuthenticated() && !isLoadingFromDrive) {
        try {
          setIsLoadingFromDrive(true);
          console.log('🔄 Auto-loading settings from Google Drive...');
          const settingsJson = await loadSettingsFromDrive();
          if (settingsJson) {
            const loadedSettings = JSON.parse(settingsJson);
            setRawSettings(loadedSettings);
            console.log('✅ Settings auto-loaded from Google Drive');
          }
        } catch (error) {
          console.error('❌ Failed to auto-load settings from Google Drive:', error);
          // Don't throw - just log and continue with local settings
        } finally {
          setIsLoadingFromDrive(false);
        }
      }
    };

    autoLoadFromDrive();
  }, []); // Run once on mount

  const setSettings = (newSettings: Settings) => {
    setRawSettings(newSettings);
    
    // Auto-save to Google Drive if user is authenticated
    if (isAuthenticated()) {
      saveSettingsToDrive(JSON.stringify(newSettings, null, 2)).catch((error) => {
        console.error('❌ Failed to auto-save settings to Google Drive:', error);
        // Don't throw - settings are still saved locally
      });
    }
  };

  const loadFromGoogleDrive = async () => {
    try {
      console.log('📥 Manually loading settings from Google Drive...');
      const settingsJson = await loadSettingsFromDrive();
      if (settingsJson) {
        const loadedSettings = JSON.parse(settingsJson);
        setRawSettings(loadedSettings);
        console.log('✅ Settings loaded from Google Drive');
      } else {
        throw new Error('No settings found in Google Drive');
      }
    } catch (error) {
      console.error('❌ Failed to load settings from Google Drive:', error);
      throw error;
    }
  };

  const saveToGoogleDrive = async () => {
    try {
      console.log('💾 Manually saving settings to Google Drive...');
      await saveSettingsToDrive(JSON.stringify(settings, null, 2));
      console.log('✅ Settings saved to Google Drive');
    } catch (error) {
      console.error('❌ Failed to save settings to Google Drive:', error);
      throw error;
    }
  };

  const clearSettings = () => {
    const clearedSettings: Settings = {
      version: '2.0.0',
      providers: [],
      tavilyApiKey: '',
      syncToGoogleDrive: false
    };
    setRawSettings(clearedSettings);
    console.log('🗑️  Settings cleared');
  };

  return (
    <SettingsContext.Provider value={{ settings, setSettings, loadFromGoogleDrive, saveToGoogleDrive, clearSettings }}>
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
