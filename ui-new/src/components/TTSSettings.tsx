/**
 * TTS Settings Component
 * 
 * Configuration UI for text-to-speech functionality
 * Includes provider selection, voice selection, and ElevenLabs authentication
 */

import React, { useState, useEffect } from 'react';
import { useTTS } from '../contexts/TTSContext';
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
    setPitch, 
    setVolume, 
    setAutoSummarize, 
    setElevenLabsApiKey,
    getAvailableProviders 
  } = useTTS();

  const [availableProviders, setAvailableProviders] = useState<TTSProviderType[]>([]);
  const [voices, setVoices] = useState<Voice[]>(state.voices);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // Update available providers
  useEffect(() => {
    const providers = getAvailableProviders();
    setAvailableProviders(providers);
  }, [getAvailableProviders]);

  // Update voices when state changes
  useEffect(() => {
    setVoices(state.voices);
  }, [state.voices]);

  const handleProviderChange = async (providerType: TTSProviderType) => {
    setIsLoadingVoices(true);
    try {
      await setProvider(providerType);
    } catch (error) {
      console.error('Failed to change provider:', error);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  const getProviderDisplayName = (providerType: TTSProviderType): string => {
    const names: Record<TTSProviderType, string> = {
      'chatterbox': 'Chatterbox TTS (Local GPU)',
      'speaches': 'Speaches TTS (Local)',
      'llm': 'LLM Provider (Auto)',
      'openai-tts': 'OpenAI TTS',
      'groq-tts': 'Groq TTS',
      'gemini-tts': 'Gemini TTS',
      'together-tts': 'Together AI TTS (Not Available)',
      'elevenlabs': state.elevenlabsApiKey ? 'ElevenLabs (Specialized TTS)' : 'ElevenLabs (Needs API Key)',
      'browser': 'Browser (Web Speech API)',
      'speakjs': 'speak.js (Offline)'
    };
    return names[providerType];
  };

  const getProviderDescription = (providerType: TTSProviderType): string => {
    const descriptions: Record<TTSProviderType, string> = {
      'chatterbox': 'High-quality neural TTS with GPU acceleration (requires Docker container on localhost:8000)',
      'speaches': 'Local TTS server (configure in LLM providers)',
      'llm': 'Automatically selects best available LLM provider (fallback option)',
      'openai-tts': 'OpenAI\'s text-to-speech model (high quality, fast)',
      'groq-tts': 'Groq\'s PlayAI TTS model (fast inference)',
      'gemini-tts': 'Google Gemini text-to-speech (natural voices)',
      'together-tts': 'Together AI does not provide TTS API - please use another provider',
      'elevenlabs': state.elevenlabsApiKey ? 'Ultra-realistic AI voices' : 'Ultra-realistic AI voices (configure API key below)',
      'browser': 'Uses your browser\'s built-in voices',
      'speakjs': 'Offline synthesis, basic quality'
    };
    return descriptions[providerType];
  };

  return (
    <div className="space-y-6">
      {/* Auto-Summarize Toggle */}
          <div className="card bg-white dark:bg-gray-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Auto-Summarize Long Content</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Use LLM to generate concise, speakable summaries for long responses
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.autoSummarize}
                  onChange={(e) => setAutoSummarize(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Provider Selection */}
          <div className="card bg-white dark:bg-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Voice Provider</h3>
            <div className="space-y-3">
              {availableProviders.map(providerType => (
                <label key={providerType} className={`flex items-start gap-3 cursor-pointer p-4 rounded-lg border-2 transition-all hover:border-blue-300 dark:hover:border-blue-700 ${
                  state.currentProvider === providerType 
                    ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}>
                  <input
                    type="radio"
                    name="tts-provider"
                    value={providerType}
                    checked={state.currentProvider === providerType}
                    onChange={() => handleProviderChange(providerType)}
                    className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
                      {getProviderDisplayName(providerType)}
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
                </label>
              ))}
            </div>
          </div>



          {/* Voice Selection */}
          <div className="card bg-white dark:bg-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Voice</h3>
            {isLoadingVoices ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600 dark:text-gray-400">Loading voices...</span>
              </div>
            ) : voices.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No voices available for this provider
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {voices.map(voice => (
                  <button
                    key={voice.id}
                    onClick={() => setVoice(voice.id)}
                    className={`p-3 text-left border rounded-lg transition-colors ${
                      state.currentVoice === voice.id
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">{voice.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {voice.language} • {voice.gender || 'neutral'}
                    </div>
                  </button>
                ))}
              </div>
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
            
            {/* Pitch */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Pitch: {state.pitch.toFixed(1)}
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={state.pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 slider"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>0.5 Lower</span>
                <span>1.0 Normal</span>
                <span>2.0 Higher</span>
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

          {/* ElevenLabs API Key Configuration */}
          <div className="card bg-white dark:bg-gray-800 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">ElevenLabs Authentication</h3>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">Specialized TTS Service</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      ElevenLabs provides TTS-only services and requires separate authentication from your LLM providers.
                    </p>
                  </div>
                </div>
              </div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API Key:</label>
              <input
                type="password"
                placeholder="Enter ElevenLabs API key"
                value={state.elevenlabsApiKey}
                onChange={(e) => setElevenLabsApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Get your API key from <a href="https://elevenlabs.io/speech-synthesis" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ElevenLabs Dashboard</a>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  • Free tier: 10,000 characters/month
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  • Starter: $1/month for 30,000 characters
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  • Creator: $22/month for 100,000 characters
                </p>
              </div>
            </div>

          {/* LLM Provider TTS Info */}
          {(['llm', 'openai-tts', 'groq-tts', 'gemini-tts', 'together-tts'] as TTSProviderType[]).includes(state.currentProvider) && (
            <div className="card bg-white dark:bg-gray-800 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {state.currentProvider === 'llm' ? 'LLM Provider TTS' : `${getProviderDisplayName(state.currentProvider)}`}
              </h3>
              
              {/* Together AI Warning */}
              {state.currentProvider === 'together-tts' && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-medium text-red-900 dark:text-red-100">TTS Not Available</h4>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        Together AI does not provide a Text-to-Speech API. Please select a different TTS provider like OpenAI TTS, Groq TTS, or Gemini TTS.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Success message for working providers */}
              {state.currentProvider !== 'together-tts' && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="font-medium text-green-900 dark:text-green-100">Using Existing Configuration</h4>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      {state.currentProvider === 'llm' 
                        ? 'TTS will use your currently configured LLM provider and API key. No additional authentication required.'
                        : `TTS will use your ${getProviderDisplayName(state.currentProvider)} configuration and API key. No additional authentication required.`
                      }
                    </p>
                  </div>
                </div>
              </div>
              )}
            </div>
          )}
    </div>
  );
};