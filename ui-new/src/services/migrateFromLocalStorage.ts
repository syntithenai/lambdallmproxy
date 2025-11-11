/**
 * localStorage Migration Script
 * 
 * Migrates data from localStorage to unified IndexedDB structure
 * Runs once on app startup for each user
 */

import { createDefaultSettings, saveSettings } from './settings';
import { unifiedStorage } from './unifiedStorage';
import type { Settings } from '../types/persistence';

/**
 * Check if migration has already been completed
 */
function isMigrationComplete(): boolean {
  return localStorage.getItem('localStorage_migration_completed') === 'true';
}

/**
 * Mark migration as complete
 */
function markMigrationComplete(): void {
  localStorage.setItem('localStorage_migration_completed', 'true');
}

/**
 * Main migration function
 * Migrates all localStorage data to IndexedDB
 */
export async function migrateFromLocalStorage(userId: string): Promise<void> {
  if (isMigrationComplete()) {
    console.log('[Migration] Already completed, skipping');
    return;
  }
  
  console.log('[Migration] Starting localStorage migration for', userId);
  
  try {
    // Migrate settings
    await migrateSettings(userId);
    
    // Migrate UI state
    await migrateUIState(userId);
    
    // Mark migration complete
    markMigrationComplete();
    console.log('[Migration] ✅ Completed successfully');
  } catch (error) {
    console.error('[Migration] ❌ Failed:', error);
    throw error;
  }
}

/**
 * Migrate settings from localStorage to IndexedDB
 */
async function migrateSettings(userId: string): Promise<void> {
  console.log('[Migration] Migrating settings...');
  
  const settings = createDefaultSettings(userId);
  
  // Migrate main settings
  const oldSettings = localStorage.getItem('settings');
  if (oldSettings) {
    try {
      const parsed = JSON.parse(oldSettings);
      Object.assign(settings, {
        language: parsed.language || settings.language,
        theme: parsed.theme || settings.theme,
        providers: parsed.providers || settings.providers,
        defaultProvider: parsed.defaultProvider,
      });
      console.log('[Migration] ✅ Migrated main settings');
    } catch (e) {
      console.error('[Migration] ⚠️ Failed to parse old settings:', e);
    }
  }
  
  // Migrate voice settings
  const voiceKeys: Record<string, (value: string) => void> = {
    'continuousVoice_hotword': (v: string) => { settings.voice.hotword = v; },
    'continuousVoice_sensitivity': (v: string) => { settings.voice.sensitivity = parseFloat(v); },
    'continuousVoice_speechTimeout': (v: string) => { settings.voice.speechTimeout = parseFloat(v); },
    'continuousVoice_conversationTimeout': (v: string) => { settings.voice.conversationTimeout = parseInt(v); },
    'voice_useLocalWhisper': (v: string) => { settings.voice.useLocalWhisper = v === 'true'; },
    'voice_localWhisperUrl': (v: string) => { settings.voice.localWhisperUrl = v; },
  };
  
  for (const [key, setter] of Object.entries(voiceKeys)) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      setter(value);
    }
  }
  console.log('[Migration] ✅ Migrated voice settings');
  
  // Migrate proxy settings
  const proxySettings = localStorage.getItem('proxy_settings');
  if (proxySettings) {
    try {
      const parsed = JSON.parse(proxySettings);
      Object.assign(settings.proxy, {
        enabled: parsed.enabled !== false,
        username: parsed.username || '',
        password: parsed.password || '',
        useServerProxy: parsed.useServerProxy || false,
      });
      console.log('[Migration] ✅ Migrated proxy settings');
    } catch (e) {
      console.error('[Migration] ⚠️ Failed to parse proxy settings:', e);
    }
  }
  
  // Save unified settings
  await saveSettings(settings);
  console.log('[Migration] ✅ Saved unified settings to IndexedDB');
  
  // Clean up old keys (KEEP auth tokens and runtime cache)
  const keysToRemove = [
    'settings',
    'proxy_settings',
    'continuousVoice_hotword',
    'continuousVoice_sensitivity',
    'continuousVoice_speechTimeout',
    'continuousVoice_conversationTimeout',
    'voice_useLocalWhisper',
    'voice_localWhisperUrl',
  ];
  
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  console.log('[Migration] ✅ Cleaned up localStorage');
}

/**
 * Migrate UI state from localStorage to IndexedDB
 */
async function migrateUIState(_userId: string): Promise<void> {
  console.log('[Migration] Migrating UI state...');
  
  // Migrate recent tags
  const recentTags = localStorage.getItem('recent-tags');
  if (recentTags) {
    try {
      const tags = JSON.parse(recentTags);
      await unifiedStorage.saveUIState('recentTags', { tags });
      localStorage.removeItem('recent-tags');
      console.log('[Migration] ✅ Migrated recent tags');
    } catch (e) {
      console.error('[Migration] ⚠️ Failed to migrate recent tags:', e);
    }
  }
  
  // Migrate last active chat
  const lastActiveChat = localStorage.getItem('lastActiveChat');
  if (lastActiveChat) {
    await unifiedStorage.saveUIState('lastActiveChat', {
      conversationId: lastActiveChat,
    });
    localStorage.removeItem('lastActiveChat');
    console.log('[Migration] ✅ Migrated last active chat');
  }
  
  console.log('[Migration] UI state migration complete');
}

/**
 * Rollback migration (restore localStorage from IndexedDB)
 * Use this if migration causes issues
 */
export async function rollbackMigration(_userId: string, settings: Settings): Promise<void> {
  console.log('[Rollback] Starting migration rollback...');
  
  // Restore to localStorage
  localStorage.setItem('settings', JSON.stringify({
    language: settings.language,
    theme: settings.theme,
    providers: settings.providers,
    defaultProvider: settings.defaultProvider,
  }));
  
  localStorage.setItem('proxy_settings', JSON.stringify({
    username: settings.proxy.username,
    password: settings.proxy.password,
    enabled: settings.proxy.enabled,
    useServerProxy: settings.proxy.useServerProxy,
  }));
  
  localStorage.setItem('continuousVoice_hotword', settings.voice.hotword);
  localStorage.setItem('continuousVoice_sensitivity', settings.voice.sensitivity.toString());
  localStorage.setItem('continuousVoice_speechTimeout', settings.voice.speechTimeout.toString());
  localStorage.setItem('continuousVoice_conversationTimeout', settings.voice.conversationTimeout.toString());
  localStorage.setItem('voice_useLocalWhisper', settings.voice.useLocalWhisper.toString());
  localStorage.setItem('voice_localWhisperUrl', settings.voice.localWhisperUrl);
  
  // Mark migration as incomplete
  localStorage.removeItem('localStorage_migration_completed');
  
  console.log('[Rollback] Complete');
}
