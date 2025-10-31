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
 * Also ensures embedding settings have default values
 */
function migrateSettings(oldSettings: any): Settings {
  let settings = oldSettings;
  let needsMigration = false;

  // If already v2, clean up legacy fields
  if (settings.version === '2.0.0') {
    // Check if legacy fields exist
    if ('provider' in settings || 'llmApiKey' in settings) {
      // Remove legacy v1 fields if they exist (prevents re-migration)
      const { provider, llmApiKey, ...cleanSettings } = settings;
      settings = cleanSettings;
      needsMigration = true;
    }
  } else {
    // Migrate from v1 single provider to v2 multi-provider
    const migratedProviders: ProviderConfig[] = [];

    if (settings.provider && settings.llmApiKey) {
      // Determine provider type - map old groq to new groq type
      const providerType = settings.provider === 'groq' ? 'groq' : 'openai';
      
      migratedProviders.push({
        id: crypto.randomUUID(),
        type: providerType,
        apiEndpoint: PROVIDER_ENDPOINTS[providerType],
        apiKey: settings.llmApiKey
      });
    }

    settings = {
      version: '2.0.0',
      providers: migratedProviders,
      tavilyApiKey: settings.tavilyApiKey || ''
    };
    needsMigration = true;
  }

  // IMPORTANT: Fix missing or undefined embedding settings
  // This ensures local embeddings work out of the box
  if (!settings.embeddingSource || settings.embeddingSource === 'undefined') {
    console.log('🔧 Migrating: Setting default embeddingSource to "local"');
    settings.embeddingSource = 'local';
    needsMigration = true;
  }
  
  if (!settings.embeddingModel || settings.embeddingModel === 'undefined') {
    console.log('🔧 Migrating: Setting default embeddingModel to "Xenova/all-MiniLM-L6-v2"');
    settings.embeddingModel = 'Xenova/all-MiniLM-L6-v2';
    needsMigration = true;
  }

  return settings as Settings;
}

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [rawSettings, setRawSettings] = useLocalStorage<Settings | SettingsV1>('app_settings', {
    version: '2.0.0',
    providers: [],
    tavilyApiKey: '',
    syncToGoogleDrive: true, // Default to enabled for better user experience
    language: 'en', // Default to English
    embeddingSource: 'local', // Default to local embeddings (browser-based, no API needed)
    embeddingModel: 'Xenova/all-MiniLM-L6-v2' // Default to recommended local model
  });

  const [isLoadingFromDrive, setIsLoadingFromDrive] = useState(false);

  // Migrate settings on mount if needed
  const settings = migrateSettings(rawSettings);

  // Save migrated settings if migration occurred
  useEffect(() => {
    if (rawSettings !== settings) {
      setRawSettings(settings);
      
      // Also save to Google Drive to overwrite old format
      if (isAuthenticated()) {
        saveSettingsToDrive(JSON.stringify(settings, null, 2)).catch((error) => {
          console.error('❌ Failed to save migrated settings to Google Drive:', error);
        });
      }
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
      syncToGoogleDrive: false,
      embeddingSource: 'local',
      embeddingModel: 'Xenova/all-MiniLM-L6-v2'
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
