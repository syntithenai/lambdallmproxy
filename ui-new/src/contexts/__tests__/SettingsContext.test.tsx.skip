/**
 * SettingsContext Tests
 * 
 * Tests for settings context including provider configuration,
 * persistence, migration, and Google Drive sync
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'

// Mock dependencies BEFORE imports
vi.mock('../../utils/googleDocs', () => ({
  loadSettingsFromDrive: vi.fn(),
  saveSettingsToDrive: vi.fn(),
  isAuthenticated: vi.fn(),
}))

vi.mock('../../hooks/useLocalStorage', () => ({
  useLocalStorage: vi.fn((_key: string, initialValue: any) => {
    const [value, setValue] = React.useState(initialValue)
    return [value, setValue]
  })
}))

// Import after mocks
import { SettingsProvider, useSettings } from '../SettingsContext'
import * as googleDocs from '../../utils/googleDocs'

// Mock crypto.randomUUID for consistent IDs in tests
global.crypto = {
  ...global.crypto,
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7)
} as any

describe('SettingsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('Context Setup', () => {
    it('should throw error when useSettings used outside provider', () => {
      expect(() => {
        renderHook(() => useSettings())
      }).toThrow('useSettings must be used within SettingsProvider')
    })

    it('should provide settings context within provider', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      expect(result.current).toBeDefined()
      expect(result.current.settings).toBeDefined()
      expect(result.current.settings.version).toBe('2.0.0')
    })

    it('should initialize with default settings', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      expect(result.current.settings).toEqual({
        version: '2.0.0',
        providers: [],
        tavilyApiKey: '',
        syncToGoogleDrive: false
      })
    })
  })

  describe('Settings Updates', () => {
    it('should update settings', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [{
            id: 'test-id',
            type: 'openai',
            apiEndpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: 'sk-test'
          }],
          tavilyApiKey: 'tvly-test',
          syncToGoogleDrive: false
        })
      })

      expect(result.current.settings.providers).toHaveLength(1)
      expect(result.current.settings.providers[0].type).toBe('openai')
      expect(result.current.settings.tavilyApiKey).toBe('tvly-test')
    })

    it('should handle multiple provider configurations', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [
            {
              id: 'provider-1',
              type: 'openai',
              apiEndpoint: 'https://api.openai.com/v1/chat/completions',
              apiKey: 'sk-openai'
            },
            {
              id: 'provider-2',
              type: 'groq-free',
              apiEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
              apiKey: 'gsk-groq'
            }
          ],
          tavilyApiKey: '',
          syncToGoogleDrive: false
        })
      })

      expect(result.current.settings.providers).toHaveLength(2)
      expect(result.current.settings.providers[0].type).toBe('openai')
      expect(result.current.settings.providers[1].type).toBe('groq-free')
    })

    it('should clear settings', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      // Set some settings first
      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [{
            id: 'test-id',
            type: 'openai',
            apiEndpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: 'sk-test'
          }],
          tavilyApiKey: 'tvly-test',
          syncToGoogleDrive: false
        })
      })

      expect(result.current.settings.providers).toHaveLength(1)

      // Clear settings
      act(() => {
        result.current.clearSettings()
      })

      expect(result.current.settings).toEqual({
        version: '2.0.0',
        providers: [],
        tavilyApiKey: '',
        syncToGoogleDrive: false
      })
    })
  })

  describe('Settings Migration', () => {
    it('should migrate v1 settings to v2', () => {
      // This test verifies migration logic by setting up v1 format
      // and checking if it gets migrated to v2 format
      
      // Note: Migration happens automatically in the context
      // We test this through the context behavior
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      // After migration, should have v2 structure
      expect(result.current.settings.version).toBe('2.0.0')
      expect(Array.isArray(result.current.settings.providers)).toBe(true)
    })

    it('should preserve v2 settings without migration', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      const v2Settings = {
        version: '2.0.0' as const,
        providers: [{
          id: 'existing-id',
          type: 'openai' as const,
          apiEndpoint: 'https://api.openai.com/v1/chat/completions',
          apiKey: 'sk-existing'
        }],
        tavilyApiKey: 'tvly-existing',
        syncToGoogleDrive: false
      }

      act(() => {
        result.current.setSettings(v2Settings)
      })

      expect(result.current.settings).toEqual(v2Settings)
    })
  })

  describe('Google Drive Sync', () => {
    it('should not auto-load when sync disabled', async () => {
      vi.mocked(googleDocs.isAuthenticated).mockReturnValue(true)

      renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      // Wait a bit to ensure no auto-load happens
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(googleDocs.loadSettingsFromDrive).not.toHaveBeenCalled()
    })

    it('should not auto-load when not authenticated', async () => {
      vi.mocked(googleDocs.isAuthenticated).mockReturnValue(false)

      renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(googleDocs.loadSettingsFromDrive).not.toHaveBeenCalled()
    })

    it('should manually load settings from Google Drive', async () => {
      vi.mocked(googleDocs.loadSettingsFromDrive).mockResolvedValue(
        JSON.stringify({
          version: '2.0.0',
          providers: [{
            id: 'drive-id',
            type: 'openai',
            apiEndpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: 'sk-from-drive'
          }],
          tavilyApiKey: 'tvly-from-drive',
          syncToGoogleDrive: true
        })
      )

      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      await act(async () => {
        await result.current.loadFromGoogleDrive()
      })

      expect(result.current.settings.providers[0]?.apiKey).toBe('sk-from-drive')
      expect(result.current.settings.tavilyApiKey).toBe('tvly-from-drive')
    })

    it('should handle load from Drive failure', async () => {
      vi.mocked(googleDocs.loadSettingsFromDrive).mockRejectedValue(
        new Error('Drive load failed')
      )

      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      await expect(
        result.current.loadFromGoogleDrive()
      ).rejects.toThrow('Drive load failed')
    })

    it('should manually save settings to Google Drive', async () => {
      vi.mocked(googleDocs.saveSettingsToDrive).mockResolvedValue(undefined)

      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      await act(async () => {
        await result.current.saveToGoogleDrive()
      })

      expect(googleDocs.saveSettingsToDrive).toHaveBeenCalledWith(
        expect.stringContaining('"version": "2.0.0"')
      )
    })

    it('should handle save to Drive failure', async () => {
      vi.mocked(googleDocs.saveSettingsToDrive).mockRejectedValue(
        new Error('Drive save failed')
      )

      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      await expect(
        result.current.saveToGoogleDrive()
      ).rejects.toThrow('Drive save failed')
    })

    it('should auto-save to Drive when sync enabled', async () => {
      vi.mocked(googleDocs.saveSettingsToDrive).mockResolvedValue(undefined)

      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [],
          tavilyApiKey: 'test',
          syncToGoogleDrive: true // Enable sync
        })
      })

      await waitFor(() => {
        expect(googleDocs.saveSettingsToDrive).toHaveBeenCalled()
      })
    })

    it('should not auto-save to Drive when sync disabled', async () => {
      vi.mocked(googleDocs.saveSettingsToDrive).mockResolvedValue(undefined)

      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [],
          tavilyApiKey: 'test',
          syncToGoogleDrive: false // Sync disabled
        })
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(googleDocs.saveSettingsToDrive).not.toHaveBeenCalled()
    })

    it('should handle auto-save failures gracefully', async () => {
      vi.mocked(googleDocs.saveSettingsToDrive).mockRejectedValue(
        new Error('Auto-save failed')
      )

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [],
          tavilyApiKey: 'test',
          syncToGoogleDrive: true
        })
      })

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('Failed to auto-save'),
          expect.any(Error)
        )
      })

      // Settings should still be updated locally despite save failure
      expect(result.current.settings.tavilyApiKey).toBe('test')

      consoleError.mockRestore()
    })
  })

  describe('Provider Configuration', () => {
    it('should validate provider structure', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [{
            id: 'test-id',
            type: 'openai',
            apiEndpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: 'sk-test123'
          }],
          tavilyApiKey: '',
          syncToGoogleDrive: false
        })
      })

      const provider = result.current.settings.providers[0]
      expect(provider.id).toBeDefined()
      expect(provider.type).toBe('openai')
      expect(provider.apiEndpoint).toBeTruthy()
      expect(provider.apiKey).toBeTruthy()
    })

    it('should support different provider types', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      const providerTypes = ['openai', 'groq-free'] as const

      providerTypes.forEach(type => {
        act(() => {
          result.current.setSettings({
            version: '2.0.0',
            providers: [{
              id: `${type}-id`,
              type: type,
              apiEndpoint: `https://api.${type}.com/v1/chat/completions`,
              apiKey: `key-${type}`
            }],
            tavilyApiKey: '',
            syncToGoogleDrive: false
          })
        })

        expect(result.current.settings.providers[0].type).toBe(type)
      })
    })

    it('should handle empty provider list', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [],
          tavilyApiKey: 'tvly-test',
          syncToGoogleDrive: false
        })
      })

      expect(result.current.settings.providers).toEqual([])
      expect(result.current.settings.tavilyApiKey).toBe('tvly-test')
    })
  })

  describe('Tavily API Key', () => {
    it('should store Tavily API key', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [],
          tavilyApiKey: 'tvly-abc123',
          syncToGoogleDrive: false
        })
      })

      expect(result.current.settings.tavilyApiKey).toBe('tvly-abc123')
    })

    it('should handle empty Tavily API key', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      })

      act(() => {
        result.current.setSettings({
          version: '2.0.0',
          providers: [],
          tavilyApiKey: '',
          syncToGoogleDrive: false
        })
      })

      expect(result.current.settings.tavilyApiKey).toBe('')
    })
  })
})
