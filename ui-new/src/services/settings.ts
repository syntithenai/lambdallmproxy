/**
 * Settings Utilities
 * 
 * Functions for creating, loading, and syncing settings
 */

import { db } from './db';
import type { Settings, ProviderConfig } from '../types/persistence';

/**
 * Create default settings for a new user
 */
export function createDefaultSettings(userId: string): Settings {
  return {
    userId,
    version: '2.0.0',
    
    // App settings
    language: 'en',
    theme: 'auto',
    
    // Provider settings
    providers: [],
    defaultProvider: undefined,
    
    // Voice settings
    voice: {
      hotword: 'Jarvis',
      sensitivity: 0.5,
      speechTimeout: 3.5, // Increased from 2.0 to allow for natural pauses while speaking
      conversationTimeout: 10000,
      silenceThreshold: 25,
      useLocalWhisper: false,
      localWhisperUrl: 'http://localhost:8000',
      whisperProvider: 'groq',
    },
    
    // Proxy settings
    proxy: {
      enabled: false,
      username: '',
      password: '',
      useServerProxy: false,
    },
    
    // RAG settings
    rag: {
      enabled: false,
      topK: 5,
      scoreThreshold: 0.7,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      chunkSize: 512,
      chunkOverlap: 50,
    },
    
    // TTS settings
    tts: {
      enabled: false,
      provider: 'browser',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
    },
    
    // Timestamps
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Load settings from IndexedDB
 */
export async function loadSettings(userId: string): Promise<Settings> {
  console.log('[Settings] Loading settings for user:', userId);
  
  let settings = await db.settings.get(userId);
  
  if (!settings) {
    console.log('[Settings] No settings found, creating defaults');
    settings = createDefaultSettings(userId);
    await db.settings.put(settings);
  }
  
  return settings;
}

/**
 * Save settings to IndexedDB
 */
export async function saveSettings(settings: Settings): Promise<void> {
  if (!settings.userId) {
    throw new Error('Settings must include userId');
  }
  
  settings.updatedAt = Date.now();
  await db.settings.put(settings);
  
  console.log('[Settings] Saved settings for user:', settings.userId);
}

/**
 * Update settings (partial update)
 */
export async function updateSettings(
  userId: string,
  updates: Partial<Settings>
): Promise<Settings> {
  const current = await loadSettings(userId);
  
  const updated: Settings = {
    ...current,
    ...updates,
    userId, // Ensure userId is not overwritten
    updatedAt: Date.now(),
  };
  
  await saveSettings(updated);
  return updated;
}

/**
 * Get a specific provider by ID
 */
export function getProvider(settings: Settings, providerId: string): ProviderConfig | undefined {
  return settings.providers.find(p => p.id === providerId);
}

/**
 * Get enabled providers sorted by priority
 */
export function getEnabledProviders(settings: Settings): ProviderConfig[] {
  return settings.providers
    .filter(p => p.enabled !== false)
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
}

/**
 * Add or update a provider
 */
export async function saveProvider(
  userId: string,
  provider: ProviderConfig
): Promise<void> {
  const settings = await loadSettings(userId);
  
  const existingIndex = settings.providers.findIndex(p => p.id === provider.id);
  
  if (existingIndex >= 0) {
    settings.providers[existingIndex] = provider;
  } else {
    settings.providers.push(provider);
  }
  
  await saveSettings(settings);
}

/**
 * Remove a provider
 */
export async function removeProvider(userId: string, providerId: string): Promise<void> {
  const settings = await loadSettings(userId);
  
  settings.providers = settings.providers.filter(p => p.id !== providerId);
  
  // Clear default provider if it was removed
  if (settings.defaultProvider === providerId) {
    settings.defaultProvider = undefined;
  }
  
  await saveSettings(settings);
}
