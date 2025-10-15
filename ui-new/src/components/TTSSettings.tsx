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
    setEnabled, 
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
      {/* Enable/Disable Toggle */}
            {/* Browser Compatibility Notice */}
      <div className="card bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
              💡 Browser Compatibility
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              TTS works best in <strong>Chrome</strong> and <strong>Firefox</strong>. The system includes multiple fallback mechanisms 
              to handle browser inconsistencies and automatically reset stuck buttons.
            </p>
          </div>
        </div>
      </div>

      {/* TTS Enable Toggle */}
      <div className="card bg-white dark:bg-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Enable Text-to-Speech</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Allow AI responses and snippets to be read aloud
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={state.isEnabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      {state.isEnabled && (
        <>
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

          {/* Troubleshooting Section */}
          <div className="card bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 p-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  🔧 TTS Troubleshooting
                </h4>
                <div className="text-sm text-amber-700 dark:text-amber-300 space-y-2">
                  <p><strong>Stop Button Stuck Red?</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>The system uses multiple detection methods to reset the button automatically</li>
                    <li>If stuck, refresh the page or try a different browser</li>
                    <li>Chrome and Firefox have the most reliable speech synthesis support</li>
                    <li>Safari may have inconsistent behavior with browser TTS</li>
                  </ul>
                  
                  <p className="mt-3"><strong>Provider Recommendations:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>Best Quality:</strong> ElevenLabs or LLM providers (OpenAI, Groq)</li>
                    <li><strong>Most Reliable:</strong> Browser Speech API (built-in voices)</li>
                    <li><strong>Offline Backup:</strong> speak.js (basic quality)</li>
                  </ul>

                  <p className="mt-3"><strong>Common Issues:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>API providers require valid keys and sufficient credits</li>
                    <li>Browser TTS may be interrupted by other audio or navigation</li>
                    <li>Long text is automatically summarized for better speech experience</li>
                    <li>Check browser console (F12) for detailed error messages</li>
                  </ul>
                </div>
              </div>
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

          {/* Advanced Debugging Section */}
          <div className="card bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6">
            <details className="group">
              <summary className="cursor-pointer flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                <span className="flex items-center gap-2">
                  🔧 Advanced Debugging & Diagnostics
                </span>
                <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              
              <div className="mt-4 space-y-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Current State</h5>
                    <ul className="space-y-1 text-xs">
                      <li><strong>Provider:</strong> {state.currentProvider}</li>
                      <li><strong>Voice:</strong> {state.currentVoice || 'Default'}</li>
                      <li><strong>Status:</strong> {state.isPlaying ? '🔴 Playing' : '⚫ Stopped'}</li>
                      <li><strong>Auto-Summarize:</strong> {state.autoSummarize ? 'ON' : 'OFF'}</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Browser Support</h5>
                    <ul className="space-y-1 text-xs">
                      <li><strong>Speech Synthesis:</strong> {'speechSynthesis' in window ? '✅ Available' : '❌ Not Available'}</li>
                      <li><strong>User Agent:</strong> {navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Other'}</li>
                      <li><strong>Voices Loaded:</strong> {voices.length} available</li>
                    </ul>
                  </div>
                </div>
                
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded">
                  <h5 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">🚨 If TTS Button Gets Stuck:</h5>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-yellow-700 dark:text-yellow-300">
                    <li>Wait 30 seconds (automatic timeout will reset it)</li>
                    <li>Try clicking the stop button again</li>
                    <li>Refresh the page (Ctrl+F5 or Cmd+R)</li>
                    <li>Switch to a different browser (Chrome recommended)</li>
                    <li>Check browser console (F12) for error messages</li>
                    <li>Try switching to a different TTS provider above</li>
                  </ol>
                </div>
                
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 rounded">
                  <h5 className="font-medium text-green-800 dark:text-green-200 mb-2">💡 Performance Tips:</h5>
                  <ul className="list-disc list-inside space-y-1 text-xs text-green-700 dark:text-green-300">
                    <li>Enable auto-summarize for long content to improve speech quality</li>
                    <li>LLM providers (OpenAI, Groq) offer the highest quality voices</li>
                    <li>Browser TTS is most reliable but has limited voice options</li>
                    <li>ElevenLabs provides premium voices but requires credits</li>
                    <li>The system automatically falls back to working providers</li>
                  </ul>
                </div>
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
};