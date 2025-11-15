/**
 * TTS Settings Component
 * 
 * Configuration UI for text-to-speech functionality
 * Includes provider selection, per-provider voice selection, and ElevenLabs authentication
 */

import React, { useState, useEffect } from 'react';
import { useTTS } from '../contexts/TTSContext';
import { useSettings } from '../contexts/SettingsContext';
import { TTS_FEATURE_ENABLED } from '../types/tts';
import type { TTSProviderType, Voice } from '../types/tts';

export const TTSSettings: React.FC = () => {
  // Don't render if TTS is disabled
  if (!TTS_FEATURE_ENABLED) {
    return (
      <div className="p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          Text-to-Speech
        </h3>
        <div className="text-gray-500 dark:text-gray-400">
          Text-to-Speech feature is currently disabled.
        </div>
      </div>
    );
  }

  const { 
    state, 
    setProvider, 
    setVoice, 
    setRate, 
    setVolume, 
    setElevenLabsApiKey,
    getAvailableProviders,
    getVoicesForProvider
  } = useTTS();

  const { settings } = useSettings();

  const [availableProviders, setAvailableProviders] = useState<TTSProviderType[]>([]);
  const [activeVoiceTab, setActiveVoiceTab] = useState<TTSProviderType>('browser');
  const [voicesByProvider, setVoicesByProvider] = useState<Record<string, Voice[]>>({});
  const [isLoadingVoices, setIsLoadingVoices] = useState<Record<string, boolean>>({});

  // Update available providers
  useEffect(() => {
    const providers = getAvailableProviders();
    setAvailableProviders(providers);
  }, [getAvailableProviders]);

  // Mirror the active voice tab to the currently selected provider
  useEffect(() => {
    // Only update if currentProvider is not 'auto'
    if (state.currentProvider !== 'auto') {
      setActiveVoiceTab(state.currentProvider);
    } else {
      // If 'auto' is selected, default to first non-auto provider
      const firstProvider = availableProviders.find((p: TTSProviderType) => p !== 'auto') || 'browser';
      setActiveVoiceTab(firstProvider);
    }
  }, [state.currentProvider, availableProviders]);

  // Load voices for a specific provider
  const loadVoicesForProvider = async (providerType: TTSProviderType) => {
    if (providerType === 'auto') return; // Skip auto provider
    
    setIsLoadingVoices(prev => ({ ...prev, [providerType]: true }));
    try {
      // Get user's language preference from settings
      const languageCode = settings?.language || 'en';
      console.log(`🎤 loadVoicesForProvider: Loading voices for ${providerType} with language ${languageCode}`);
      const voices = await getVoicesForProvider(providerType, languageCode);
      console.log(`🎤 loadVoicesForProvider: Received ${voices.length} voices for ${providerType}`);
      
      // Show ALL voices for browser provider (remote voices are already sorted first by BrowserProviders)
      setVoicesByProvider(prev => ({ ...prev, [providerType]: voices }));
    } catch (error) {
      console.error(`Failed to load voices for ${providerType}:`, error);
      setVoicesByProvider(prev => ({ ...prev, [providerType]: [] }));
    } finally {
      setIsLoadingVoices(prev => ({ ...prev, [providerType]: false }));
    }
  };

  // Load voices when tab changes
  useEffect(() => {
    if (activeVoiceTab && activeVoiceTab !== 'auto') {
      loadVoicesForProvider(activeVoiceTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVoiceTab]);

  // Reload voices when language changes
  useEffect(() => {
    if (activeVoiceTab && activeVoiceTab !== 'auto' && settings?.language) {
      console.log(`🌍 Language changed to: ${settings.language}, reloading voices`);
      loadVoicesForProvider(activeVoiceTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.language]);

  const handleProviderChange = async (providerType: TTSProviderType) => {
    console.log(`🔄 Changing TTS provider to: ${providerType}`);
    try {
      await setProvider(providerType);
      console.log(`✅ TTS provider changed to: ${providerType}`);
    } catch (error) {
      console.error('❌ Failed to change provider:', error);
    }
  };

  const handleVoiceChange = (voiceId: string, providerType: TTSProviderType) => {
    setVoice(voiceId, providerType);
  };

  const getProviderDisplayName = (providerType: TTSProviderType): string => {
    const names: Record<TTSProviderType, string> = {
      'auto': 'Automatic (Recommended)',
      'openai-tts': 'OpenAI TTS',
      'groq-tts': 'Groq TTS',
      'gemini-tts': 'Gemini TTS',
      'openrouter-tts': 'OpenRouter TTS',
      'elevenlabs': state.elevenlabsApiKey ? 'ElevenLabs' : 'ElevenLabs (Needs API Key)',
      'browser': 'Web Speech API'
    };
    return names[providerType] || providerType;
  };

  const getProviderDescription = (provider: TTSProviderType): string => {
    const descriptions: Record<TTSProviderType, string> = {
      'auto': 'Automatically selects the cheapest available online provider with API key configured. Falls back to Web Speech API if no keys configured.',
      'openai-tts': 'OpenAI TTS-1 and TTS-1-HD models ($15-30 per 1M chars). Falls back to Web Speech API.',
      'groq-tts': 'Groq PlayAI Dialog v1.0 ($50 per 1M chars, 140 chars/s). Falls back to Web Speech API.',
      'gemini-tts': 'Google Cloud TTS (Neural2, Wavenet, Standard - $4-16 per 1M chars). Falls back to Web Speech API.',
      'openrouter-tts': 'Access to LLM TTS models (Chatterbox, Speech-02, Kokoro, F5-TTS). Falls back to Web Speech API.',
      'elevenlabs': state.elevenlabsApiKey 
        ? 'Ultra-realistic AI voices. Only used when explicitly selected. Falls back to Web Speech API.' 
        : 'Ultra-realistic AI voices (configure API key below). Only used when explicitly selected.',
      'browser': 'Uses your browser\'s built-in voices only (no fallback)'
    };
    return descriptions[provider] || '';
  };

  // Get all actual providers (excluding 'auto')
  const voiceTabProviders = availableProviders.filter(p => p !== 'auto');

  return (
    <div className="space-y-6">
          {/* Provider Selection */}
          <div className="card bg-white dark:bg-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Voice Provider</h3>
            <div className="space-y-3">
              {availableProviders.map(providerType => (
                <div key={providerType}>
                  <div 
                    className={`flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 ${
                      state.currentProvider === providerType 
                        ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                    onClick={() => handleProviderChange(providerType)}
                  >
                    <input
                      type="radio"
                      name="tts-provider"
                      value={providerType}
                      checked={state.currentProvider === providerType}
                      onChange={() => {}}
                      className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
                        {getProviderDisplayName(providerType)}
                        {providerType === 'auto' && (
                          <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-2 py-1 rounded-full">
                            Default
                          </span>
                        )}
                        {providerType === 'elevenlabs' && !state.elevenlabsApiKey && (
                          <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-1 rounded-full">
                            Configure
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {getProviderDescription(providerType)}
                      </div>
                    </div>
                  </div>
                  
                  {/* ElevenLabs API Key inline configuration */}
                  {providerType === 'elevenlabs' && state.currentProvider === 'elevenlabs' && (
                    <div className="ml-7 mt-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ElevenLabs API Key:</label>
                      <input
                        type="password"
                        placeholder="Enter ElevenLabs API key"
                        value={state.elevenlabsApiKey}
                        onChange={(e) => setElevenLabsApiKey(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Get your API key from <a href="https://elevenlabs.io/speech-synthesis" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ElevenLabs Dashboard</a>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">• Free tier: 10,000 characters/month</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">• Starter: $1/month for 30,000 characters</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">• Creator: $22/month for 100,000 characters</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Voice Selection - Tabbed by Provider */}
          <div className="card bg-white dark:bg-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Voice Selection by Provider</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Configure voice preferences for each provider. These will be used when that provider is active or as a fallback.
            </p>
            
            {/* Provider Tabs */}
            <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
              {voiceTabProviders.map(providerType => (
                <button
                  key={providerType}
                  onClick={() => setActiveVoiceTab(providerType)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    activeVoiceTab === providerType
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {getProviderDisplayName(providerType)}
                </button>
              ))}
            </div>

            {/* Voice Grid for Active Tab */}
            {isLoadingVoices[activeVoiceTab] ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600 dark:text-gray-400">Loading voices...</span>
              </div>
            ) : (voicesByProvider[activeVoiceTab]?.length || 0) === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No voices available for this provider
              </div>
            ) : (
              <>
                {/* Warning if no local voices available (browser provider only) */}
                {activeVoiceTab === 'browser' && voicesByProvider[activeVoiceTab]?.length > 0 && 
                 !voicesByProvider[activeVoiceTab].some(v => v.isLocal !== false) && (
                  <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-yellow-600 dark:text-yellow-400 text-xl">⚠️</span>
                      <div className="flex-1">
                        <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                          No Local Voices Available
                        </h4>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          Your browser only has remote/network voices. These voices:
                        </p>
                        <ul className="text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside mt-2 space-y-1">
                          <li>May not support live rate/volume changes during playback</li>
                          <li>May not fire boundary events (required for mid-speech adjustments)</li>
                          <li>Have higher latency due to network requests</li>
                        </ul>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                          <strong>Recommendation:</strong> Install local TTS voices in your operating system for better performance.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {(voicesByProvider[activeVoiceTab] || []).map(voice => {
                    const isSelected = state.providerVoices[activeVoiceTab] === voice.id;
                    const isNonLocal = activeVoiceTab === 'browser' && voice.isLocal === false;
                    
                    return (
                      <button
                        key={voice.id}
                        onClick={() => handleVoiceChange(voice.id, activeVoiceTab)}
                        className={`p-3 text-left border rounded-lg transition-colors ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{voice.name}</div>
                          {isNonLocal && (
                            <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                              Remote
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {voice.language} • {voice.gender || 'neutral'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

          </div>

          {/* Playback Controls */}
          <div className="card bg-white dark:bg-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Playback Settings</h3>
            
            {/* Speed */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Speed: {state.rate.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={state.rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 slider"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>0.5x Slower</span>
                <span>1.0x Normal</span>
                <span>2.0x Faster</span>
              </div>
            </div>
            
            {/* Volume */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Volume: {Math.round(state.volume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 slider"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>0% Silent</span>
                <span>50%</span>
                <span>100% Max</span>
              </div>
            </div>
          </div>
    </div>
  );
};