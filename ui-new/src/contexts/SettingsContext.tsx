/**
 * SettingsContext
 * 
 * Provides unified settings throughout the React app
 * Replaces localStorage-based settings with IndexedDB persistence
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadSettings, saveSettings, updateSettings as updateSettingsUtil, getEnabledProviders } from '../services/settings';
import { uploadSettingsToDrive, loadSettingsFromDrive } from '../services/googleDrive';
import type { Settings, ProviderConfig } from '../types/persistence';
import { useAuth } from './AuthContext';

interface SettingsContextValue {
  settings: Settings | null;
  loading: boolean;
  error: Error | null;
  
  // Core settings operations
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  reloadSettings: () => Promise<void>;
  
  // Provider management
  getEnabledProviders: () => ProviderConfig[];
  saveProvider: (provider: ProviderConfig) => Promise<void>;
  removeProvider: (providerId: string) => Promise<void>;
  
  // Google Drive sync
  syncToDrive: () => Promise<void>;
  loadFromDrive: () => Promise<void>;
  lastSyncTime: Date | null;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

interface SettingsProviderProps {
  children: React.ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  // Load settings on mount or when user changes
  useEffect(() => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }
    
    loadSettingsFromDB();
  }, [user]);
  
  const loadSettingsFromDB = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const loaded = await loadSettings(user.email);
      setSettings(loaded);
    } catch (err) {
      console.error('[SettingsContext] Failed to load settings:', err);
      setError(err instanceof Error ? err : new Error('Failed to load settings'));
    } finally {
      setLoading(false);
    }
  };
  
  const handleUpdateSettings = useCallback(async (updates: Partial<Settings>) => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    try {
      await updateSettingsUtil(user.email, updates);
      await loadSettingsFromDB();
    } catch (err) {
      console.error('[SettingsContext] Failed to update settings:', err);
      throw err;
    }
  }, [user]);
  
  const reloadSettings = useCallback(async () => {
    await loadSettingsFromDB();
  }, [user]);
  
  const handleGetEnabledProviders = useCallback((): ProviderConfig[] => {
    if (!settings) return [];
    return getEnabledProviders(settings);
  }, [settings]);
  
  const handleSaveProvider = useCallback(async (provider: ProviderConfig) => {
    if (!user || !settings) {
      throw new Error('User not authenticated or settings not loaded');
    }
    
    const existingIndex = settings.providers.findIndex(p => p.id === provider.id);
    const newProviders = [...settings.providers];
    
    if (existingIndex >= 0) {
      newProviders[existingIndex] = provider;
    } else {
      newProviders.push(provider);
    }
    
    await handleUpdateSettings({ providers: newProviders });
  }, [user, settings, handleUpdateSettings]);
  
  const handleRemoveProvider = useCallback(async (providerId: string) => {
    if (!user || !settings) {
      throw new Error('User not authenticated or settings not loaded');
    }
    
    const newProviders = settings.providers.filter(p => p.id !== providerId);
    const updates: Partial<Settings> = { providers: newProviders };
    
    // Clear defaultProvider if it was the removed provider
    if (settings.defaultProvider === providerId) {
      updates.defaultProvider = undefined;
    }
    
    await handleUpdateSettings(updates);
  }, [user, settings, handleUpdateSettings]);
  
  const syncToDrive = useCallback(async () => {
    if (!user || !settings) {
      throw new Error('User not authenticated or settings not loaded');
    }
    
    try {
      await uploadSettingsToDrive(settings);
      setLastSyncTime(new Date());
      console.log('[SettingsContext] Settings synced to Drive');
    } catch (err) {
      console.error('[SettingsContext] Failed to sync to Drive:', err);
      throw err;
    }
  }, [user, settings]);
  
  const loadFromDrive = useCallback(async () => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    try {
      const driveSettings = await loadSettingsFromDrive(user.email);
      if (driveSettings) {
        await saveSettings(driveSettings);
        setSettings(driveSettings);
        setLastSyncTime(new Date());
        console.log('[SettingsContext] Settings loaded from Drive');
      }
    } catch (err) {
      console.error('[SettingsContext] Failed to load from Drive:', err);
      throw err;
    }
  }, [user]);
  
  const value: SettingsContextValue = {
    settings,
    loading,
    error,
    updateSettings: handleUpdateSettings,
    reloadSettings,
    getEnabledProviders: handleGetEnabledProviders,
    saveProvider: handleSaveProvider,
    removeProvider: handleRemoveProvider,
    syncToDrive,
    loadFromDrive,
    lastSyncTime,
  };
  
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
