/**
 * TTS Context Provider
 * 
 * Manages text-to-speech state, providers, and configuration
 * Integrates with existing settings system
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useSettings } from './SettingsContext';
import type { 
  TTSContextValue, 
  TTSState, 
  TTSSettings, 
  TTSProviderType, 
  SpeakOptions 
} from '../types/tts';
import { DEFAULT_TTS_SETTINGS } from '../types/tts';
import { TTSProviderFactory } from '../services/tts/TTSProviderFactory';
import { extractSpeakableText, shouldSummarizeForSpeech } from '../utils/textPreprocessing';
import { SpeakableSummaryService } from '../services/tts/SpeakableSummaryService';

const TTSContext = createContext<TTSContextValue | undefined>(undefined);

export const TTSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const [ttsSettings, setTTSSettings] = useLocalStorage<TTSSettings>('tts_settings', DEFAULT_TTS_SETTINGS);
  
  const [providerFactory] = useState(() => new TTSProviderFactory());
  const [summaryService] = useState(() => new SpeakableSummaryService());
  const [fallbackTimeoutId, setFallbackTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const isStoppingIntentionally = useRef(false);
  
  const [state, setState] = useState<TTSState>({
    isEnabled: ttsSettings.isEnabled,
    isPlaying: false,
    currentText: null,
    currentProvider: ttsSettings.currentProvider,
    currentVoice: ttsSettings.currentVoice,
    rate: ttsSettings.rate,
    pitch: ttsSettings.pitch,
    volume: ttsSettings.volume,
    providers: [],
    voices: [],
    autoSummarize: ttsSettings.autoSummarize,
    elevenlabsApiKey: ttsSettings.elevenlabsApiKey
  });

  // Initialize providers when settings change
  useEffect(() => {
    const initializeProviders = async () => {
      try {
        // Clean up existing providers first
        providerFactory.cleanup();
        
        await providerFactory.initializeProviders(settings.providers, ttsSettings.elevenlabsApiKey);
        
        // Update available providers
        const availableProviders = providerFactory.getAvailableProviders();
        
        // Set default provider if current one is not available
        let currentProvider = ttsSettings.currentProvider;
        if (!availableProviders.includes(currentProvider)) {
          currentProvider = providerFactory.getDefaultProviderType() || 'speakjs';
        }

        // Get voices for current provider
        const provider = providerFactory.getProvider(currentProvider);
        const voices = provider ? await provider.getVoices() : [];

        setState(prev => ({
          ...prev,
          currentProvider,
          providers: [], // We don't store provider instances in state
          voices
        }));

        // Update settings if provider changed (avoid infinite loop)
        if (currentProvider !== ttsSettings.currentProvider) {
          setTTSSettings(prev => ({ ...prev, currentProvider }));
        }
      } catch (error) {
        console.error('Failed to initialize TTS providers:', error);
      }
    };

    initializeProviders();
    
    // Cleanup on unmount
    return () => {
      providerFactory.cleanup();
    };
  }, [settings.providers, ttsSettings.elevenlabsApiKey]); // Remove currentProvider to prevent infinite loop

  // Update voices when provider changes
  useEffect(() => {
    const updateVoices = async () => {
      const provider = providerFactory.getProvider(ttsSettings.currentProvider);
      if (provider) {
        try {
          const voices = await provider.getVoices();
          setState(prev => ({ 
            ...prev, 
            voices,
            // Reset voice selection if current voice is not available
            currentVoice: voices.find(v => v.id === prev.currentVoice) ? prev.currentVoice : null
          }));
        } catch (error) {
          console.error('Failed to load voices:', error);
          setState(prev => ({ ...prev, voices: [] }));
        }
      }
    };

    updateVoices();
  }, [ttsSettings.currentProvider]); // Use ttsSettings instead of state to prevent infinite loop

  const speak = useCallback(async (text: string, options: Partial<SpeakOptions> = {}): Promise<void> => {
    if (!state.isEnabled) {
      throw new Error('TTS is disabled');
    }

    // Reset the intentional stop flag when starting new speech
    // This allows the next onEnd to be processed normally
    console.log('TTSContext.speak() - Resetting isStoppingIntentionally flag (starting new speech)');
    isStoppingIntentionally.current = false;

    // Prepare text
    let speakableText = extractSpeakableText(text);
    
    // Generate summary if needed
    if (options.shouldSummarize || shouldSummarizeForSpeech(speakableText, state.autoSummarize)) {
      try {
        const bestProvider = settings.providers.find(p => p.enabled !== false && p.apiKey);
        if (bestProvider) {
          speakableText = await summaryService.generateSpeakableSummary(speakableText, bestProvider);
        }
      } catch (error) {
        console.warn('Failed to generate summary, using original text:', error);
      }
    }

    setState(prev => ({ ...prev, isPlaying: true, currentText: speakableText }));

    // Clear any existing fallback timeout
    if (fallbackTimeoutId) {
      clearTimeout(fallbackTimeoutId);
      setFallbackTimeoutId(null);
    }

    // Set a fallback timeout to ensure isPlaying gets reset even if callbacks fail
    const timeoutId = setTimeout(() => {
      console.log('TTSContext: Fallback timeout triggered - forcing isPlaying to false');
      setState(prev => ({ ...prev, isPlaying: false, currentText: null }));
      setFallbackTimeoutId(null);
    }, 30000); // 30 second fallback
    setFallbackTimeoutId(timeoutId);

    // Define fallback hierarchy
    const getFallbackHierarchy = (selectedProvider: TTSProviderType): TTSProviderType[] => {
      const baseFallbacks: TTSProviderType[] = ['browser', 'speakjs'];
      
      // If user selected a specific provider, start with that
      const hierarchy = [selectedProvider];
      
      // Add other available providers as fallbacks (excluding the selected one)
      const availableProviders = providerFactory.getAvailableProviders()
        .filter(p => p !== selectedProvider && !baseFallbacks.includes(p));
      
      hierarchy.push(...availableProviders, ...baseFallbacks);
      
      return hierarchy;
    };

    const fallbackHierarchy = getFallbackHierarchy(state.currentProvider);

    const speakOptions: SpeakOptions = {
      voice: state.currentVoice || undefined,
      rate: state.rate,
      pitch: state.pitch,
      volume: state.volume,
      onStart: () => {
        options.onStart?.();
      },
      onEnd: () => {
        console.log('TTSContext speak onEnd callback - checking if intentional stop:', isStoppingIntentionally.current);
        
        // If this was an intentional stop, don't call the user's onEnd callback
        // This prevents auto-restart behavior
        if (isStoppingIntentionally.current) {
          console.log('TTSContext speak onEnd - INTENTIONAL STOP, skipping onEnd callback and ensuring clean state');
          
          // Clear fallback timeout
          if (fallbackTimeoutId) {
            clearTimeout(fallbackTimeoutId);
            setFallbackTimeoutId(null);
          }
          
          // Ensure state is clean (belt and suspenders)
          setState(prev => ({ ...prev, isPlaying: false, currentText: null }));
          return;
        }
        
        console.log('TTSContext speak onEnd callback - setting isPlaying to false');
        
        // Clear fallback timeout
        if (fallbackTimeoutId) {
          clearTimeout(fallbackTimeoutId);
          setFallbackTimeoutId(null);
        }
        
        setState(prev => {
          console.log('TTSContext speak onEnd - prev state:', { isPlaying: prev.isPlaying });
          return { ...prev, isPlaying: false, currentText: null };
        });
        options.onEnd?.();
      },
      onError: (error) => {
        setState(prev => ({ ...prev, isPlaying: false, currentText: null }));
        options.onError?.(error);
      },
      onBoundary: options.onBoundary,
      ...options
    };

    // Try each provider in the fallback hierarchy
    let lastError: Error | null = null;
    let usedProvider: TTSProviderType | null = null;
    
    for (const providerType of fallbackHierarchy) {
      const provider = providerFactory.getProvider(providerType);
      if (!provider) continue;

      try {
        // If we're using a fallback provider, log it
        if (providerType !== state.currentProvider) {
          console.warn(`TTS: ${state.currentProvider} failed, falling back to ${providerType}`);
        }

        await provider.speak(speakableText, speakOptions);
        usedProvider = providerType;
        break; // Success - exit the loop
      } catch (error) {
        console.warn(`TTS provider ${providerType} failed:`, error);
        lastError = error as Error;
        continue; // Try next provider
      }
    }

    // If no provider worked
    if (!usedProvider) {
      setState(prev => ({ ...prev, isPlaying: false, currentText: null }));
      throw lastError || new Error('All TTS providers failed');
    }
  }, [state, settings.providers, providerFactory, summaryService]);

  const stop = useCallback(() => {
    console.log('TTSContext.stop() called - INTENTIONAL STOP');
    
    // Set flag to indicate this is an intentional stop (not natural end)
    isStoppingIntentionally.current = true;
    
    // Clear fallback timeout
    if (fallbackTimeoutId) {
      clearTimeout(fallbackTimeoutId);
      setFallbackTimeoutId(null);
    }
    
    // FAIL-SAFE 1: Stop browser's native Speech Synthesis API
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      console.log('TTSContext.stop() - Stopping speechSynthesis');
      window.speechSynthesis.cancel();
    }
    
    // FAIL-SAFE 2: Stop ALL audio elements immediately
    // This ensures audio stops even if provider reference is lost
    const allAudioElements = document.querySelectorAll('audio');
    console.log('TTSContext.stop() - Found', allAudioElements.length, 'audio elements');
    allAudioElements.forEach((audio) => {
      if (!audio.paused) {
        console.log('TTSContext.stop() - Force stopping audio element');
        audio.pause();
        audio.currentTime = 0;
        // Clean up blob URLs
        if (audio.src && audio.src.startsWith('blob:')) {
          URL.revokeObjectURL(audio.src);
          audio.src = '';
        }
      }
    });
    
    // FAIL-SAFE 3: Stop via provider (proper cleanup)
    setState(prev => {
      console.log('TTSContext.stop() - stopping, prev state:', { isPlaying: prev.isPlaying, currentProvider: prev.currentProvider });
      
      const provider = providerFactory.getProvider(prev.currentProvider);
      if (provider) {
        console.log('TTSContext.stop() - calling provider.stop()');
        try {
          provider.stop();
        } catch (error) {
          console.error('TTSContext.stop() - Error calling provider.stop():', error);
        }
      } else {
        console.warn('TTSContext.stop() - no provider found for:', prev.currentProvider);
      }
      
      return { ...prev, isPlaying: false, currentText: null };
    });
    
    // NOTE: We do NOT reset isStoppingIntentionally here!
    // The flag stays true until the next speak() call starts new speech.
    // This ensures any delayed onEnd callbacks won't restart playback.
  }, [providerFactory, fallbackTimeoutId]);

  const pause = useCallback(() => {
    setState(prev => {
      const provider = providerFactory.getProvider(prev.currentProvider);
      if (provider && provider.pause) {
        provider.pause();
      }
      return prev; // No state change needed
    });
  }, [providerFactory]);

  const resume = useCallback(() => {
    setState(prev => {
      const provider = providerFactory.getProvider(prev.currentProvider);
      if (provider && provider.resume) {
        provider.resume();
      }
      return prev; // No state change needed
    });
  }, [providerFactory]);

  const setEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, isEnabled: enabled }));
    setTTSSettings(prev => ({ ...prev, isEnabled: enabled }));
  }, [setTTSSettings]);

  const setProvider = useCallback(async (providerType: TTSProviderType) => {
    const provider = providerFactory.getProvider(providerType);
    if (!provider) return;

    // Stop current speech
    stop();

    // Load voices for new provider
    try {
      const voices = await provider.getVoices();
      setState(prev => ({ 
        ...prev, 
        currentProvider: providerType, 
        voices,
        currentVoice: null // Reset voice selection
      }));
      setTTSSettings(prev => ({ 
        ...prev, 
        currentProvider: providerType,
        currentVoice: null
      }));
    } catch (error) {
      console.error('Failed to switch provider:', error);
    }
  }, [providerFactory, stop, setTTSSettings]);

  const setVoice = useCallback((voiceId: string) => {
    setState(prev => ({ ...prev, currentVoice: voiceId }));
    setTTSSettings(prev => ({ ...prev, currentVoice: voiceId }));
  }, [setTTSSettings]);

  const setRate = useCallback((rate: number) => {
    setState(prev => ({ ...prev, rate }));
    setTTSSettings(prev => ({ ...prev, rate }));
  }, [setTTSSettings]);

  const setPitch = useCallback((pitch: number) => {
    setState(prev => ({ ...prev, pitch }));
    setTTSSettings(prev => ({ ...prev, pitch }));
  }, [setTTSSettings]);

  const setVolume = useCallback((volume: number) => {
    setState(prev => ({ ...prev, volume }));
    setTTSSettings(prev => ({ ...prev, volume }));
  }, [setTTSSettings]);

  const setAutoSummarize = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, autoSummarize: enabled }));
    setTTSSettings(prev => ({ ...prev, autoSummarize: enabled }));
  }, [setTTSSettings]);

  const setElevenLabsApiKey = useCallback(async (apiKey: string) => {
    setState(prev => ({ ...prev, elevenlabsApiKey: apiKey }));
    setTTSSettings(prev => ({ ...prev, elevenlabsApiKey: apiKey }));
    
    // Update ElevenLabs provider
    await providerFactory.updateElevenLabsApiKey(apiKey);
    
    // Refresh available providers
    const availableProviders = providerFactory.getAvailableProviders();
    console.log('Available TTS providers after ElevenLabs update:', availableProviders);
  }, [setTTSSettings, providerFactory]);

  const getAvailableProviders = useCallback((): TTSProviderType[] => {
    return providerFactory.getAvailableProviders();
  }, [providerFactory]);

  const getVoicesForProvider = useCallback(async (providerType: TTSProviderType) => {
    const provider = providerFactory.getProvider(providerType);
    return provider ? await provider.getVoices() : [];
  }, [providerFactory]);

  const speakResponse = useCallback(async (responseText: string, shouldSummarize?: boolean): Promise<void> => {
    return speak(responseText, { shouldSummarize });
  }, [speak]);

  const speakSnippet = useCallback(async (snippetContent: string, shouldSummarize?: boolean): Promise<void> => {
    return speak(snippetContent, { shouldSummarize });
  }, [speak]);

  const contextValue: TTSContextValue = {
    state,
    speak,
    stop,
    pause,
    resume,
    setEnabled,
    setProvider,
    setVoice,
    setRate,
    setPitch,
    setVolume,
    setAutoSummarize,
    setElevenLabsApiKey,
    getAvailableProviders,
    getVoicesForProvider,
    speakResponse,
    speakSnippet
  };

  return (
    <TTSContext.Provider value={contextValue}>
      {children}
    </TTSContext.Provider>
  );
};

export const useTTS = () => {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error('useTTS must be used within a TTSProvider');
  }
  return context;
};