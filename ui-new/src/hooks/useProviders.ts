/**
 * Phase 2: useProviders Hook
 * 
 * Provides CRUD operations for provider management.
 * Integrates with SettingsContext to persist provider configurations.
 */

import { useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import type { ProviderConfig } from '../types/provider';
import { validateProvider, isDuplicateProvider } from '../utils/providerValidation';

export interface UseProvidersResult {
  providers: ProviderConfig[];
  addProvider: (provider: Omit<ProviderConfig, 'id'>) => { success: boolean; error?: string };
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => { success: boolean; error?: string };
  deleteProvider: (id: string) => void;
  getProvider: (id: string) => ProviderConfig | undefined;
}

export function useProviders(): UseProvidersResult {
  const { settings, setSettings } = useSettings();

  /**
   * Add a new provider configuration
   */
  const addProvider = useCallback(
    (provider: Omit<ProviderConfig, 'id'>): { success: boolean; error?: string } => {
      // Validate provider
      const validation = validateProvider(provider);
      if (!validation.valid) {
        const firstError = Object.values(validation.errors)[0];
        return { success: false, error: firstError };
      }

      // Check for duplicates
      const newProvider: ProviderConfig = {
        ...provider,
        id: crypto.randomUUID(),
        enabled: true, // Default new providers to enabled
      };

      const duplicate = settings.providers.find((p) => isDuplicateProvider(p, newProvider));
      if (duplicate) {
        return {
          success: false,
          error: 'A provider with this type and API key already exists',
        };
      }

      // Add provider
      setSettings({
        ...settings,
        providers: [...settings.providers, newProvider],
      });

      return { success: true };
    },
    [settings, setSettings]
  );

  /**
   * Update an existing provider configuration
   */
  const updateProvider = useCallback(
    (id: string, updates: Partial<ProviderConfig>): { success: boolean; error?: string } => {
      const existingProvider = settings.providers.find((p) => p.id === id);
      if (!existingProvider) {
        return { success: false, error: 'Provider not found' };
      }

      const updatedProvider = { ...existingProvider, ...updates };

      // Validate updated provider (skip validation for enabled toggle)
      if (!('enabled' in updates && Object.keys(updates).length === 1)) {
        const validation = validateProvider(updatedProvider);
        if (!validation.valid) {
          const firstError = Object.values(validation.errors)[0];
          return { success: false, error: firstError };
        }

        // Check for duplicates (excluding the current provider)
        const duplicate = settings.providers.find(
          (p) => p.id !== id && isDuplicateProvider(p, updatedProvider)
        );
        if (duplicate) {
          return {
            success: false,
            error: 'A provider with this type and API key already exists',
          };
        }
      }

      // Update provider
      const newProviders = settings.providers.map((p) => (p.id === id ? updatedProvider : p));
      
      setSettings({
        ...settings,
        providers: newProviders,
      });

      return { success: true };
    },
    [settings, setSettings]
  );

  /**
   * Delete a provider configuration
   */
  const deleteProvider = useCallback(
    (id: string): void => {
      setSettings({
        ...settings,
        providers: settings.providers.filter((p) => p.id !== id),
      });
    },
    [settings, setSettings]
  );

  /**
   * Get a single provider by ID
   */
  const getProvider = useCallback(
    (id: string): ProviderConfig | undefined => {
      return settings.providers.find((p) => p.id === id);
    },
    [settings.providers]
  );

  return {
    providers: settings.providers,
    addProvider,
    updateProvider,
    deleteProvider,
    getProvider,
  };
}
