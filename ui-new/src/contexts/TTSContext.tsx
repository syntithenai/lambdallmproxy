/**
 * TTS Context Provider
 * 
 * Manages text-to-speech state, providers, and configuration
 * Integrates with existing settings system
 */

/* eslint-disable no-console */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode, FC } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useSettings } from './SettingsContext';
import { useUsage } from './UsageContext';
import type { ProviderConfig } from '../types/provider';
import type { 
  TTSContextValue, 
  TTSState, 
  TTSSettings, 
  TTSProviderType, 
  SpeakOptions
} from '../types/tts';
import { DEFAULT_TTS_SETTINGS } from '../types/tts';
import { TTSProviderFactory } from '../services/tts/TTSProviderFactory';
import { chunkTextBySentences, groupSentencesForPlayback } from '../utils/textChunking';
import { extractSpeakableText } from '../utils/textPreprocessing';

const TTSContext = createContext<TTSContextValue | undefined>(undefined);

export const TTSProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const { ttsCapabilities } = useUsage(); // Get backend TTS capabilities
  const [ttsSettings, setTTSSettings] = useLocalStorage<TTSSettings>('tts_settings', DEFAULT_TTS_SETTINGS);
  
  // Helper to create clean stopped state
  const createStoppedState = () => ({
    isPlaying: false,
    isLoadingAudio: false,
    currentText: null,
    activeProvider: null,
    chunks: [] as string[],
    currentChunkIndex: -1,
    totalChunks: 0
  });
  
  const [providerFactory] = useState(() => new TTSProviderFactory());
  // Use ReturnType<typeof setTimeout> to be compatible with both DOM and Node types
  const [fallbackTimeoutId, setFallbackTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);
  const isStoppingIntentionally = useRef(false);
  const currentProviderRef = useRef<TTSProviderType>('auto');
  const activeProviderRef = useRef<any>(null); // Reference to the currently playing provider
  
  // Chunked playback state
  const chunkedPlaybackState = useRef<{
    isChunked: boolean;
    chunks: string[];
    currentChunkIndex: number;
    totalChunks: number;
  } | null>(null);
  
  const [state, setState] = useState<TTSState>({
    isEnabled: true, // Always enabled when TTS feature is available
    isPlaying: false,
    isLoadingAudio: false,
    currentText: null,
    currentProvider: ttsSettings.currentProvider,
    activeProvider: null, // No provider actively playing yet
    providerVoices: ttsSettings.providerVoices || {},
    rate: ttsSettings.rate,
    volume: ttsSettings.volume,
    providers: [],
    voices: [],
    elevenlabsApiKey: ttsSettings.elevenlabsApiKey,
    boundarySupported: false, // Will be checked after provider initialization
    usingNonLocalVoice: false, // Will be checked when voice is selected
    chunks: [],
    currentChunkIndex: -1,
    totalChunks: 0
  });

  // Refs to hold the latest rate/volume so long-running speakChunked can read
  // live updates (closures won't see mid-playback changes otherwise).
  const currentRateRef = useRef<number>(ttsSettings.rate);
  const currentVolumeRef = useRef<number>(ttsSettings.volume);
  // Ref to hold the currently active audio buffer for chunked playback so
  // it can be invalidated when rate/volume changes significantly.
  // Map: chunkIndex -> { blob, objectUrl }
  const currentAudioBufferRef = useRef<Map<number, { blob: Blob; objectUrl?: string }> | null>(null);
  // Ref to track generation rates for buffered chunks: chunkIndex -> generationRate
  const generationRatesRef = useRef<Map<number, number> | null>(null);

  // Helper: revoke any object URLs stored in the audio buffer and clear it
  const revokeAndClearAudioBuffer = (buf?: Map<number, { blob: Blob; objectUrl?: string } | undefined> | null) => {
    try {
      if (!buf) return;
      for (const [, entry] of buf) {
        try {
          if (entry && entry.objectUrl) {
            URL.revokeObjectURL(entry.objectUrl);
          }
        } catch (_err) {
          // best-effort revoke; suppress exceptions but mark variable used
          void _err;
        }
      }
      buf.clear();
    } catch (err) {
      // best-effort cleanup - log and continue
      console.warn('⚠️ TTSContext: Error revoking pregenerated object URLs', err);
    }
  };

  // Migration: Ensure isEnabled is always true for all users
  useEffect(() => {
    if (ttsSettings.isEnabled !== true) {
      console.log('🎙️ TTS: Migrating user settings - enabling TTS');
      setTTSSettings(prev => ({ ...prev, isEnabled: true }));
    }
  }, [ttsSettings.isEnabled, setTTSSettings]);

  // Sync ttsSettings changes to state (rate, volume, etc.)
  useEffect(() => {
    setState(prev => ({
      ...prev,
      rate: ttsSettings.rate,
      volume: ttsSettings.volume
    }));
  }, [ttsSettings.rate, ttsSettings.volume]);

  // CRITICAL: Cancel any browser speech synthesis on mount (e.g., after page refresh)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      console.log('🛑 TTSContext: Cancelling any existing browser speech on mount');
      // Multiple cancel calls - some browsers need this
      window.speechSynthesis.cancel();
      window.speechSynthesis.pause();
      window.speechSynthesis.cancel();
      setTimeout(() => window.speechSynthesis.cancel(), 0);
      setTimeout(() => window.speechSynthesis.cancel(), 10);
      setTimeout(() => window.speechSynthesis.cancel(), 100);
    }
  }, []); // Run once on mount

  // Initialize providers when settings or backend capabilities change
  useEffect(() => {
    const initializeProviders = async () => {
      try {
        // CRITICAL: Do NOT cleanup if currently playing - this would interrupt active speech
        if (!state.isPlaying) {
          console.log('🎙️ TTS: Cleaning up providers (not currently playing)');
          providerFactory.cleanup();
        } else {
          console.log('🎙️ TTS: Skipping cleanup - currently playing speech');
        }
        
        // Merge frontend settings with backend capabilities
        const allProviders: ProviderConfig[] = [...(settings?.providers || [])];
        
        // Add backend providers if available
        if (ttsCapabilities?.groq && !allProviders.some(p => p.type === 'groq')) {
          console.log('🎙️ TTS: Adding Groq TTS from backend');
          allProviders.push({
            id: 'backend-groq',
            type: 'groq',
            apiKey: '[BACKEND]', // Actual key is on backend
            apiEndpoint: '',
            enabled: true
          });
        }
        
        if (ttsCapabilities?.openai && !allProviders.some(p => p.type === 'openai')) {
          console.log('🎙️ TTS: Adding OpenAI TTS from backend');
          allProviders.push({
            id: 'backend-openai',
            type: 'openai',
            apiKey: '[BACKEND]',
            apiEndpoint: '',
            enabled: true
          });
        }
        
        if (ttsCapabilities?.gemini && !allProviders.some(p => p.type === 'gemini')) {
          console.log('🎙️ TTS: Adding Gemini TTS from backend');
          allProviders.push({
            id: 'backend-gemini',
            type: 'gemini',
            apiKey: '[BACKEND]',
            apiEndpoint: '',
            enabled: true
          });
        }
        
        if (ttsCapabilities?.together && !allProviders.some(p => p.type === 'together')) {
          console.log('🎙️ TTS: Adding Together TTS from backend');
          allProviders.push({
            id: 'backend-together',
            type: 'together',
            apiKey: '[BACKEND]',
            apiEndpoint: '',
            enabled: true
          });
        }
        
        await providerFactory.initializeProviders(allProviders, ttsSettings.elevenlabsApiKey);
        
        // Update available providers
        const availableProviders = providerFactory.getAvailableProviders();
        console.log('🎙️ TTS: Available providers:', availableProviders);
        
        // Set default provider if current one is not available
        let currentProvider = ttsSettings.currentProvider;
        if (!availableProviders.includes(currentProvider)) {
          currentProvider = providerFactory.getDefaultProviderType() || 'browser';
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
  }, [settings, ttsSettings.elevenlabsApiKey, ttsCapabilities]); // Added ttsCapabilities

  // Update voices when provider changes
  useEffect(() => {
    const updateVoices = async () => {
      const provider = providerFactory.getProvider(ttsSettings.currentProvider);
      if (provider) {
        try {
          const voices = await provider.getVoices();
          setState(prev => ({ 
            ...prev, 
            voices
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

    // If stop is in progress, wait a bit then reset the flag
    if (isStoppingIntentionally.current) {
      console.log('TTSContext.speak() - Stop was in progress, resetting flag and clearing state');
      isStoppingIntentionally.current = false; // Reset the flag NOW
      // Ensure state is clean
      setState(prev => ({ ...prev, isPlaying: false, currentText: null, activeProvider: null, chunks: [], currentChunkIndex: -1, totalChunks: 0 }));
      // Give a tiny delay to ensure stop operations complete
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Reset the intentional stop flag when starting new speech (redundant but safe)
    console.log('TTSContext.speak() - Starting new speech, isStoppingIntentionally = false');
    isStoppingIntentionally.current = false;

    // Extract and clean the text for speech
    // This removes markdown links, images, and other non-speakable content
    const speakableText = extractSpeakableText(text);

    // Check if text is long enough to require chunked playback (>500 chars)
    const shouldChunk = speakableText.length > 500;
    
    // Always chunk by sentences for UI highlighting
    const uiChunks = chunkTextBySentences(speakableText);
    console.log(`TTS: Split into ${uiChunks.length} sentences for UI highlighting`);
    
    if (shouldChunk) {
      console.log(`TTS: Text is long (${speakableText.length} chars), using chunked playback`);
      // Use a try/catch around chunked playback so we always reset state on error
      try {
        await speakChunked(speakableText, options, uiChunks);
        return;
      } catch (err) {
        console.error('TTSContext.speak(): Error during chunked playback:', err);
        // Ensure UI state is cleaned up so stop button hides and highlighting clears
        try {
          setState(prev => ({ ...prev, ...createStoppedState() }));
          // Clear refs used for playback
          activeProviderRef.current = null;
          chunkedPlaybackState.current = null;
          // Revoke any pregenerated object URLs and clear buffer
          try { revokeAndClearAudioBuffer(currentAudioBufferRef.current); } catch (e) { void e; }
          currentAudioBufferRef.current = null;
          generationRatesRef.current = null;
        } catch (e) {
          console.warn('TTSContext.speak(): Failed to set stopped state after error', e);
        }
        // Clear any fallback timeout we set earlier
        if (fallbackTimeoutId) {
          clearTimeout(fallbackTimeoutId);
          setFallbackTimeoutId(null);
        }
        // Re-throw so callers (e.g., ReadButton) can react if needed
        throw err;
      }
    }

    // For short text, play as single unit but show sentence chunks in UI
    console.log(`TTS: Short text (${speakableText.length} chars), single playback with ${uiChunks.length} sentence highlights`);
    
    setState(prev => ({ 
      ...prev, 
      isPlaying: true, 
      currentText: speakableText, 
      activeProvider: null,
      chunks: uiChunks,
      currentChunkIndex: 0,
      totalChunks: uiChunks.length
    }));

    // Clear any existing fallback timeout
    if (fallbackTimeoutId) {
      clearTimeout(fallbackTimeoutId);
      setFallbackTimeoutId(null);
    }

    // Set a fallback timeout to ensure isPlaying gets reset even if callbacks fail
    const timeoutId = setTimeout(() => {
      console.log('TTSContext: Fallback timeout triggered - forcing isPlaying to false');
      setState(prev => ({ ...prev, ...createStoppedState() }));
      setFallbackTimeoutId(null);
    }, 30000); // 30 second fallback
    setFallbackTimeoutId(timeoutId);

    // Define fallback hierarchy
    const getFallbackHierarchy = (selectedProvider: TTSProviderType): TTSProviderType[] => {
      // Auto provider: try all available providers in order of preference
      if (selectedProvider === 'auto') {
        const autoHierarchy: TTSProviderType[] = [
          'browser',        // Try Web Speech API first (fastest, free)
          'openrouter-tts', // OpenRouter TTS models
          'openai-tts',     // OpenAI TTS
          'groq-tts',       // Groq TTS
          'gemini-tts'      // Gemini TTS
        ];
        
        // Add ElevenLabs if API key is available
        if (state.elevenlabsApiKey) {
          autoHierarchy.splice(5, 0, 'elevenlabs'); // Insert at end
        }
        
        return autoHierarchy;
      }
      
      // For all providers: no fallback (they should work or fail cleanly)
      return [selectedProvider];
    };

    const fallbackHierarchy = getFallbackHierarchy(state.currentProvider);
    console.log(`🔍 TTS: Fallback hierarchy for ${state.currentProvider}:`, fallbackHierarchy);

    // Get the voice for the current provider
    const currentVoice = state.providerVoices[state.currentProvider] || undefined;

    const speakOptions: SpeakOptions = {
      voice: currentVoice,
      rate: state.rate,
      volume: state.volume,
      onStart: () => {
        // When speech ACTUALLY starts, update the activeProvider with the REAL provider being used
        // This handles FallbackTTSProvider fallback resolution
        console.log('TTSContext speak onStart callback - speech started');
        console.log('🎚️ TTSContext: Current rate and volume from state:', {
          'state.rate': state.rate,
          'state.volume': state.volume,
          'speakOptions.rate': speakOptions.rate,
          'speakOptions.volume': speakOptions.volume
        });
        
        // For FallbackTTSProvider, get the actual provider that's playing NOW
        for (const providerType of fallbackHierarchy) {
          const provider = providerFactory.getProvider(providerType);
          if (provider && 'getActiveProviderName' in provider && typeof (provider as any).getActiveProviderName === 'function') {
            const activeName = (provider as any).getActiveProviderName();
            if (activeName) {
              console.log(`🎯 TTSContext onStart: FallbackTTSProvider is using: ${activeName}`);
              setState(prev => ({ ...prev, activeProvider: activeName as TTSProviderType }));
              break;
            }
          }
        }
        
        // Check boundary support after speech starts (gives time for boundary event to fire)
        setTimeout(() => {
          const currentProvider = activeProviderRef.current;
          if (currentProvider && 'isBoundarySupported' in currentProvider) {
            const boundarySupported = (currentProvider as any).isBoundarySupported();
            console.log(`🔍 TTSContext onStart: Checking boundary support after 2100ms: ${boundarySupported}`);
            setState(prev => {
              if (prev.boundarySupported !== boundarySupported) {
                console.log(`✅ TTSContext: Updating boundarySupported to ${boundarySupported}`);
                return { ...prev, boundarySupported };
              }
              return prev;
            });
          }
        }, 2100); // Check after 2100ms (100ms after BrowserProvider timeout)
        
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
          setState(prev => {
            console.log('TTSContext - Forced clean state after intentional stop');
            return { ...prev, isPlaying: false, currentText: null, activeProvider: null, chunks: [], currentChunkIndex: -1, totalChunks: 0 };
          });
          
          // Clear refs
          activeProviderRef.current = null;
          
          // DO NOT call options.onEnd - this would restart playback!
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
          return { ...prev, isPlaying: false, currentText: null, activeProvider: null, chunks: [], currentChunkIndex: -1, totalChunks: 0 };
        });
        
        // Clear refs
        activeProviderRef.current = null;
        
        options.onEnd?.();
      },
      onError: (error) => {
        setState(prev => ({ ...prev, isPlaying: false, currentText: null, activeProvider: null, chunks: [], currentChunkIndex: -1, totalChunks: 0 }));
        activeProviderRef.current = null;
        options.onError?.(error);
      },
      onBoundary: options.onBoundary,
      ...options
    };

    // Try each provider in the fallback hierarchy
    let lastError: Error | null = null;
    let usedProvider: TTSProviderType | null = null;
    
    for (const providerType of fallbackHierarchy) {
      // Check if stop was called before trying next provider
      if (isStoppingIntentionally.current) {
        console.log('TTS: Stop detected before trying provider, exiting fallback loop');
        setState(prev => ({ ...prev, ...createStoppedState() }));
        activeProviderRef.current = null;
        return;
      }
      
      const provider = providerFactory.getProvider(providerType);
      console.log(`🔍 TTS: Attempting to get provider ${providerType}:`, provider ? `Found (${provider.name})` : 'NOT FOUND');
      if (!provider) {
        console.warn(`⚠️ TTS: Provider ${providerType} not available, skipping`);
        continue;
      }

      try {
        // If we're using a fallback provider, log it
        if (providerType !== state.currentProvider) {
          console.warn(`TTS: ${state.currentProvider} failed, falling back to ${providerType}`);
        } else {
          console.log(`TTS: Using primary provider ${providerType}`);
        }

        // Store reference to active provider for real-time control
        activeProviderRef.current = provider;
        currentProviderRef.current = providerType;

        // Ensure current rate/volume are applied before speaking (some providers may ignore options)
        try {
          if ('setPlaybackRate' in provider && typeof (provider as any).setPlaybackRate === 'function') {
            console.log('TTSContext: Applying playback rate to provider before speak()', state.rate);
            (provider as any).setPlaybackRate(state.rate);
          }
          if ('setVolume' in provider && typeof (provider as any).setVolume === 'function') {
            console.log('TTSContext: Applying volume to provider before speak()', state.volume);
            (provider as any).setVolume(state.volume);
          }
        } catch (err) {
          console.warn('TTSContext: Failed to apply rate/volume to provider before speak():', err);
        }

        // The actual provider will be detected in the onStart callback
        // (after FallbackTTSProvider resolves which provider it's actually using)
        
        await provider.speak(speakableText, speakOptions);
        
        usedProvider = providerType;
        console.log(`TTS: Successfully used provider ${providerType}`);
        break; // Success - exit the loop
      } catch (error) {
        console.warn(`TTS provider ${providerType} failed:`, error);
        
        // If stop was called intentionally, don't try fallback providers
        if (isStoppingIntentionally.current) {
          console.log('TTS: Stop was intentional, skipping fallback providers');
          setState(prev => ({ ...prev, ...createStoppedState() }));
          activeProviderRef.current = null;
          return;
        }
        
        lastError = error as Error;
        activeProviderRef.current = null;
        continue; // Try next provider
      }
    }

    // If no provider worked
    if (!usedProvider) {
      setState(prev => ({ ...prev, ...createStoppedState() }));
      throw lastError || new Error('All TTS providers failed');
    }
  }, [state, settings, providerFactory]);

  /**
   * Speak long text using chunked playback with pre-generation
   * Splits text into chunks and plays them sequentially with 1-chunk lookahead
   * 
   * For LLM/cloud TTS: Pre-generates next chunk while current plays
   * For browser TTS: Waits between chunks to prevent interruption
   * 
   * @param text - Text to speak
   * @param options - Speak options
   * @param uiChunks - Optional sentence-level chunks for UI highlighting
   */
  const speakChunked = useCallback(async (
    text: string, 
    options: Partial<SpeakOptions> = {},
    uiChunks?: string[]
  ): Promise<void> => {
    // Get sentence-level chunks for UI highlighting
    const sentenceChunks = uiChunks || chunkTextBySentences(text);
    console.log(`TTS: Split into ${sentenceChunks.length} sentences for UI highlighting`);
    
    // Group sentences into larger chunks for smoother playback (~250 chars each)
    const { playbackChunks, sentenceMap } = groupSentencesForPlayback(sentenceChunks);
    console.log(`TTS: Grouped into ${playbackChunks.length} playback chunks for smooth speech`);
    
    // Initialize chunked playback state
    chunkedPlaybackState.current = {
      isChunked: true,
      chunks: playbackChunks,
      currentChunkIndex: 0,
      totalChunks: playbackChunks.length
    };
    
    // Get provider and voice settings once
    const provider = providerFactory.getProvider(state.currentProvider);
    if (!provider) {
      throw new Error(`TTS provider ${state.currentProvider} not available`);
    }
    
    // CRITICAL: Set activeProviderRef so stop() can access the actual playing provider
    activeProviderRef.current = provider;
    currentProviderRef.current = state.currentProvider;
    console.log('TTSContext.speakChunked() - Set activeProviderRef to:', provider.name);
    
    // Check if using online TTS (not browser) - these need loading indicator
    const isOnlineTTS = state.currentProvider !== 'browser';
    
    // Note: Actual provider detection happens in first chunk's onStart callback (after FallbackTTSProvider resolves)
    setState(prev => ({ 
      ...prev, 
      isPlaying: true,
      isLoadingAudio: isOnlineTTS, // Show loading for online TTS until first chunk plays
      currentText: text,
      chunks: sentenceChunks,  // UI uses sentence chunks
      currentChunkIndex: 0,     // Start with first sentence
      totalChunks: sentenceChunks.length
    }));
    
    // Apply current rate/volume proactively (in case provider ignores per-call options)
    try {
      if ('setPlaybackRate' in provider && typeof (provider as any).setPlaybackRate === 'function') {
        console.log('TTSContext.speakChunked: Applying playback rate to provider', state.rate);
        (provider as any).setPlaybackRate(state.rate);
      }
      if ('setVolume' in provider && typeof (provider as any).setVolume === 'function') {
        console.log('TTSContext.speakChunked: Applying volume to provider', state.volume);
        (provider as any).setVolume(state.volume);
      }
    } catch (err) {
      console.warn('TTSContext.speakChunked: Failed to apply rate/volume to provider:', err);
    }
    
    const currentVoice = state.providerVoices[state.currentProvider] || undefined;
    const baseOptions = {
      voice: currentVoice,
      rate: state.rate,
      volume: state.volume,
      onBoundary: options.onBoundary,
      providerVoices: state.providerVoices // Pass voice map for fallback providers
    };
    
  // Determine if this provider needs pre-generation by asking providerFactory
  // whether the selected provider (or any in its fallback chain) supports pregenerate.
  const needsPreGeneration = providerFactory.supportsPregenerate(state.currentProvider);
    
    if (needsPreGeneration) {
      // Pre-generation strategy: Sequential generation to fail fast
      // Generate one chunk at a time so errors are caught immediately
    const audioBuffer: Map<number, { blob: Blob; objectUrl?: string }> = new Map(); // chunkIndex -> entry
    // Publish refs so other callbacks (setRate/setVolume) can invalidate if needed
    currentAudioBufferRef.current = audioBuffer;
  generationRatesRef.current = new Map<number, number>();
  let chunkEndTime = 0; // Track when last chunk finished for gap measurement
      
      // Helper to pre-generate a chunk SEQUENTIALLY (throws errors to fail fast)
        const pregenerateChunk = async (chunkIndex: number): Promise<void> => {
        if (chunkIndex >= sentenceChunks.length || audioBuffer.has(chunkIndex)) {
          return; // Already generated or out of bounds
        }
        
        const chunk = sentenceChunks[chunkIndex];
        console.log(`🎬 TTS: Pre-generating sentence ${chunkIndex + 1}/${sentenceChunks.length}`);
        
        // Check if provider has pregenerate method
          if ('pregenerate' in provider && typeof (provider as any).pregenerate === 'function') {
            const chunkOptions: SpeakOptions = {
              ...baseOptions,
              onStart: undefined,
              onEnd: undefined,
              onError: undefined,
              rate: currentRateRef.current,
              volume: currentVolumeRef.current
            };

            // Don't catch errors - let them propagate to fail fast
            const blob = await (provider as any).pregenerate(chunk, chunkOptions);
            // Create an object URL now so we can revoke it if the buffer is invalidated later
            let objectUrl: string | undefined;
            try {
              objectUrl = URL.createObjectURL(blob);
            } catch (e) { void e; objectUrl = undefined; }
            audioBuffer.set(chunkIndex, { blob, objectUrl });
            try {
              generationRatesRef.current?.set(chunkIndex, currentRateRef.current);
            } catch (e) { void e; }
          console.log(`✅ TTS: Pre-generated sentence ${chunkIndex + 1}/${sentenceChunks.length}`);
        }
      };
      
      // Pre-generate first chunk ONLY (sequential, not parallel)
      // If this fails, we want to know immediately before starting playback
      try {
        if (sentenceChunks.length > 0) {
          await pregenerateChunk(0);
        }
      } catch (error) {
        console.error(`❌ TTS: Pre-generation failed for first chunk:`, error);
        // Re-throw to trigger fallback provider immediately
        throw error;
      }
      
      for (let chunkIndex = 0; chunkIndex < sentenceChunks.length; chunkIndex++) {
        // CRITICAL: Check FIRST before doing anything with the chunk
        if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
          console.log('TTS: Chunked playback stopped at loop start');
          chunkedPlaybackState.current = null;
          // Clear any buffers/metadata for pregenerated audio (revoke object URLs)
          try { revokeAndClearAudioBuffer(currentAudioBufferRef.current); } catch (e) { void e; }
          currentAudioBufferRef.current = null;
          generationRatesRef.current = null;
          setState(prev => ({ ...prev, ...createStoppedState() }));
          return;
        }
        
        const chunk = sentenceChunks[chunkIndex];
        console.log(`TTS: Playing sentence ${chunkIndex + 1}/${sentenceChunks.length}: "${chunk.substring(0, 50)}..."`);
        console.log(`   📦 Buffer status: ${audioBuffer.size} blobs cached`);
        console.log(`   🎯 Current chunk buffered: ${audioBuffer.has(chunkIndex) ? 'YES ✅' : 'NO ❌'}`);
        
        // Update current chunk index in both ref and state
        chunkedPlaybackState.current.currentChunkIndex = chunkIndex;
        setState(prev => ({ ...prev, currentChunkIndex: chunkIndex }));
        
        // Pre-generate NEXT chunk only (sequential, fail-fast)
        // Only if current pre-generation is working
        const nextIndex = chunkIndex + 1;
        if (nextIndex < sentenceChunks.length && !audioBuffer.has(nextIndex)) {
          try {
            // Start pre-generation but don't await (will complete while current plays)
            pregenerateChunk(nextIndex).catch(error => {
              // Log a concise, non-verbose message for background pregeneration failures.
              // Many providers simply don't support pregeneration (Browser Speech) or
              // pregeneration may fail due to rate limits — this is expected and
              // should not spam the console with full stack traces.
              const msg = error instanceof Error ? error.message : String(error);
              if (/pre[- ]?generation not supported|not supported|failed for any providers/i.test(msg)) {
                // Non-actionable: no provider supports pregenerate for this chain
                console.log(`ℹ️ TTS: Background pregeneration skipped for chunk ${nextIndex + 1} - ${msg}`);
              } else {
                // Unexpected but recoverable: log the message (no stack) and continue
                console.warn(`⚠️ TTS: Background pre-generation failed for chunk ${nextIndex + 1}, will use direct speak(): ${msg}`);
              }
              // Don't propagate - just means this chunk won't be buffered
            });
          } catch (error) {
            console.warn(`⚠️ TTS: Failed to start pre-generation for chunk ${nextIndex + 1}:`, error);
          }
        }
        
        // Play current chunk and wait for completion
        await new Promise<void>((resolve, reject) => {
          // Check stop flag immediately before starting speak
          if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
            console.log('TTS: Stop detected before speak call, aborting');
            resolve();
            return;
          }
          
          const chunkOptions: SpeakOptions = {
            ...baseOptions,
            rate: currentRateRef.current,
            volume: currentVolumeRef.current,
            onStart: chunkIndex === 0 ? () => {
              // First chunk starting - audio has loaded, clear loading state
              setState(prev => ({ ...prev, isLoadingAudio: false }));
              
              // Detect actual provider being used
              if ('getActiveProviderName' in provider && typeof (provider as any).getActiveProviderName === 'function') {
                const activeName = (provider as any).getActiveProviderName();
                if (activeName) {
                  console.log(`🎯 TTSContext chunked onStart: FallbackTTSProvider is using: ${activeName}`);
                  setState(prev => ({ ...prev, activeProvider: activeName as TTSProviderType }));
                }
              }
              options.onStart?.();
            } : undefined,
            onEnd: () => {
              console.log(`TTS: Sentence ${chunkIndex + 1} finished`);
              const now = Date.now();
              if (chunkEndTime > 0) {
                const gap = now - chunkEndTime;
                console.log(`⏱️ Gap since last chunk ended: ${gap}ms`);
              }
              chunkEndTime = now;
              resolve();
            },
            onError: (error) => {
              console.error(`TTS: Error in sentence ${chunkIndex + 1}:`, error);
              
              // If stop was called intentionally, don't reject (prevents fallback)
              if (isStoppingIntentionally.current) {
                console.log('TTS: Chunk error during intentional stop, resolving instead of rejecting');
                resolve();
                return;
              }
              
              reject(error);
            }
          };
          
          // Use buffered audio if available, otherwise speak normally
          const entry = audioBuffer.get(chunkIndex);
          const bufferedBlob = entry?.blob;
          if (bufferedBlob && 'playBlob' in provider && typeof (provider as any).playBlob === 'function') {
            const genRate = generationRatesRef.current?.get(chunkIndex);
            console.log(`▶️ TTS: Playing buffered sentence ${chunkIndex + 1}/${sentenceChunks.length} (generated at rate=${genRate ?? 'n/a'}, playback rate=${currentRateRef.current})`);
            (provider as any).playBlob(bufferedBlob, chunkOptions).catch((error: Error) => {
              if (isStoppingIntentionally.current) {
                console.log('TTS: Buffered playback error during intentional stop, resolving instead of rejecting');
                resolve();
                return;
              }
              reject(error);
            });
          } else {
            console.log(`▶️ TTS: Playing sentence ${chunkIndex + 1}/${sentenceChunks.length} (not buffered) (playback rate=${currentRateRef.current})`);
            provider.speak(chunk, chunkOptions).catch((error) => {
              if (isStoppingIntentionally.current) {
                console.log('TTS: Chunk speak error during intentional stop, resolving instead of rejecting');
                resolve();
                return;
              }
              reject(error);
            });
          }
        });
        
  // Clean up used buffer entry (revoke any object URL we created)
  try {
    const usedEntry = audioBuffer.get(chunkIndex);
    if (usedEntry?.objectUrl) {
      try { URL.revokeObjectURL(usedEntry.objectUrl); } catch (e) { void e; }
    }
  } catch (e) { void e; }
  audioBuffer.delete(chunkIndex);
  generationRatesRef.current?.delete(chunkIndex);
        
        // Check again after chunk completes - stop might have been called during playback
        if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
          console.log('TTS: Stop detected after chunk completion, exiting loop');
          chunkedPlaybackState.current = null;
          try { revokeAndClearAudioBuffer(currentAudioBufferRef.current); } catch (e) { void e; }
          currentAudioBufferRef.current = null;
          generationRatesRef.current = null;
          setState(prev => ({ ...prev, ...createStoppedState() }));
          return;
        }
      }
    } else {
      // Standard sequential playback for browser TTS
      // Play larger chunks but update sentence highlighting based on word boundaries
      for (let chunkIndex = 0; chunkIndex < playbackChunks.length; chunkIndex++) {
        // CRITICAL: Check FIRST before doing anything with the chunk
        if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
          console.log('TTS: Chunked playback stopped at loop start (browser TTS)');
          chunkedPlaybackState.current = null;
          try { revokeAndClearAudioBuffer(currentAudioBufferRef.current); } catch (e) { void e; }
          currentAudioBufferRef.current = null;
          generationRatesRef.current = null;
          setState(prev => ({ ...prev, ...createStoppedState() }));
          return;
        }
        
        const chunk = playbackChunks[chunkIndex];
        const sentencesInChunk = sentenceMap[chunkIndex];
        console.log(`TTS: Playing chunk ${chunkIndex + 1}/${playbackChunks.length} (${chunk.length} chars, sentences ${sentencesInChunk[0] + 1}-${sentencesInChunk[sentencesInChunk.length - 1] + 1})`);
        console.log(`   Text preview: "${chunk.substring(0, 80)}..."`);
        console.log(`   isStoppingIntentionally: ${isStoppingIntentionally.current}, hasState: ${!!chunkedPlaybackState.current}`);
        
        // Track sentence indices for this chunk
        const firstSentenceIndex = sentencesInChunk[0];
        const lastSentenceIndex = sentencesInChunk[sentencesInChunk.length - 1];
        chunkedPlaybackState.current.currentChunkIndex = chunkIndex;
        
        // Play chunk and wait for completion
        await new Promise<void>((resolve, reject) => {
          // Check stop flag immediately before starting speak
          if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
            console.log('TTS: Stop detected before speak call (browser), aborting');
            resolve();
            return;
          }
          
          const chunkOptions: SpeakOptions = {
            ...baseOptions,
            onStart: () => {
              // Update highlighting when speech ACTUALLY starts (not before)
              console.log(`TTS: Chunk ${chunkIndex + 1} started speaking - highlighting sentence ${firstSentenceIndex + 1}`);
              setState(prev => ({ ...prev, currentChunkIndex: firstSentenceIndex }));
              
              // First chunk starting - detect actual provider being used and clear loading
              if (chunkIndex === 0) {
                setState(prev => ({ ...prev, isLoadingAudio: false }));
                
                if ('getActiveProviderName' in provider && typeof (provider as any).getActiveProviderName === 'function') {
                  const activeName = (provider as any).getActiveProviderName();
                  if (activeName) {
                    console.log(`🎯 TTSContext chunked browser onStart: FallbackTTSProvider is using: ${activeName}`);
                    setState(prev => ({ ...prev, activeProvider: activeName as TTSProviderType }));
                  }
                }
                options.onStart?.();
              }
            },
            onEnd: () => {
              console.log(`TTS: Chunk ${chunkIndex + 1} finished - moving to sentence ${lastSentenceIndex + 1}`);
              console.log(`   About to resolve Promise for chunk ${chunkIndex + 1}`);
              // Move highlighting to last sentence in this chunk as it finishes
              setState(prev => ({ ...prev, currentChunkIndex: lastSentenceIndex }));
              resolve();
            },
            onError: (error) => {
              console.error(`TTS: Error in chunk ${chunkIndex + 1}:`, error);
              console.log(`   isStoppingIntentionally: ${isStoppingIntentionally.current}`);
              
              // If stop was called intentionally, don't reject (prevents fallback)
              if (isStoppingIntentionally.current) {
                console.log('TTS: Chunk error during intentional stop, resolving instead of rejecting');
                resolve();
                return;
              }
              
              reject(error);
            }
          };
          
          provider.speak(chunk, chunkOptions).catch((error) => {
            // If stop was called intentionally, don't reject
            if (isStoppingIntentionally.current) {
              console.log('TTS: Chunk speak error during intentional stop, resolving instead of rejecting');
              resolve();
              return;
            }
            reject(error);
          });
        });
        
        console.log(`TTS: Promise resolved for chunk ${chunkIndex + 1}, checking stop conditions...`);
        
        // Check again after chunk completes - stop might have been called during playback
        if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
          console.log('TTS: Stop detected after chunk completion (browser TTS), exiting loop');
          chunkedPlaybackState.current = null;
          try { revokeAndClearAudioBuffer(currentAudioBufferRef.current); } catch (e) { void e; }
          currentAudioBufferRef.current = null;
          generationRatesRef.current = null;
          setState(prev => ({ ...prev, ...createStoppedState() }));
          return;
        }
        
        console.log(`TTS: Chunk ${chunkIndex + 1} completed successfully, continuing...`);
        
        // Minimal delay between chunks for browser TTS stability
        if (chunkIndex < playbackChunks.length - 1) {
          console.log(`TTS: Adding 50ms delay before chunk ${chunkIndex + 2}...`);
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Check again after delay - stop might have been called during delay
          if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
            console.log('TTS: Stop detected after inter-chunk delay, exiting loop');
            chunkedPlaybackState.current = null;
            try { revokeAndClearAudioBuffer(currentAudioBufferRef.current); } catch (e) { void e; }
            currentAudioBufferRef.current = null;
            generationRatesRef.current = null;
            setState(prev => ({ ...prev, ...createStoppedState() }));
            return;
          }
        }
      }
    }
    
  // All chunks completed successfully
    console.log('TTS: All chunks played successfully');
  chunkedPlaybackState.current = null;
  // Clear refs for audio buffer and generation rates (revoke object URLs)
  try { revokeAndClearAudioBuffer(currentAudioBufferRef.current); } catch (e) { void e; }
  currentAudioBufferRef.current = null;
  generationRatesRef.current = null;
  setState(prev => ({ ...prev, ...createStoppedState() }));
  options.onEnd?.();
  }, [state, providerFactory]);

  const stop = useCallback(() => {
    console.log('🛑 TTSContext.stop() called - INTENTIONAL STOP');
    console.log('   - activeProviderRef.current:', activeProviderRef.current?.name || 'NULL');
    console.log('   - currentProviderRef.current:', currentProviderRef.current);
    console.log('   - state.isPlaying:', state.isPlaying);
    console.log('   - state.currentProvider:', state.currentProvider);
    
    // CRITICAL: Set flag FIRST before doing anything else
    isStoppingIntentionally.current = true;
    
    // Clear chunked playback state if active
    if (chunkedPlaybackState.current) {
      console.log('TTSContext.stop() - Clearing chunked playback state');
      chunkedPlaybackState.current = null;
    }
    
    // Clear fallback timeout
    if (fallbackTimeoutId) {
      clearTimeout(fallbackTimeoutId);
      setFallbackTimeoutId(null);
    }
    
    // FAIL-SAFE 1: Stop browser's native Speech Synthesis API
    // IMPORTANT: Don't cancel speechSynthesis if using browser provider - it uses speechSynthesis internally!
    const activeProviderName = activeProviderRef.current?.name?.toLowerCase() || '';
    const isBrowserProvider = activeProviderName.includes('browser') || activeProviderName.includes('speech');
    
    if (typeof window !== 'undefined' && window.speechSynthesis && !isBrowserProvider) {
      console.log('TTSContext.stop() - Stopping speechSynthesis AGGRESSIVELY (not browser provider)');
      // Multiple cancel calls - some browsers need this
      window.speechSynthesis.cancel();
      window.speechSynthesis.pause();
      window.speechSynthesis.cancel();
      setTimeout(() => window.speechSynthesis.cancel(), 0);
      setTimeout(() => window.speechSynthesis.cancel(), 10);
      setTimeout(() => window.speechSynthesis.cancel(), 100);
    } else if (isBrowserProvider) {
      console.log('TTSContext.stop() - Skipping aggressive speechSynthesis cancel (using browser provider)');
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
    // Use activeProviderRef first (actual playing provider), fallback to currentProvider
    const stoppedProviderName = activeProviderRef.current?.name;
    if (activeProviderRef.current) {
      console.log('TTSContext.stop() - calling activeProviderRef.current.stop():', stoppedProviderName);
      try {
        activeProviderRef.current.stop();
      } catch (error) {
        console.error('TTSContext.stop() - Error calling activeProviderRef.stop():', error);
      }
    }
    
    setState(prev => {
      console.log('TTSContext.stop() - stopping, prev state:', { isPlaying: prev.isPlaying, currentProvider: prev.currentProvider });
      
      // Also try to stop via currentProvider (in case activeProviderRef was cleared)
      // CRITICAL: Skip if currentProvider is the same provider we just stopped (by name comparison)
      const provider = providerFactory.getProvider(prev.currentProvider);
      const isSameProvider = provider && (
        provider === activeProviderRef.current || 
        provider.name === stoppedProviderName
      );
      
      if (provider && !isSameProvider) {
        console.log('TTSContext.stop() - also calling currentProvider.stop():', prev.currentProvider);
        try {
          provider.stop();
        } catch (error) {
          console.error('TTSContext.stop() - Error calling provider.stop():', error);
        }
      } else if (isSameProvider) {
        console.log('TTSContext.stop() - skipping duplicate stop call (same provider):', provider?.name);
      }
      
      return { ...prev, isPlaying: false, currentText: null, activeProvider: null, chunks: [], currentChunkIndex: -1, totalChunks: 0 };
    });
    
    // Clear active provider ref
    activeProviderRef.current = null;
    currentProviderRef.current = 'auto';
  // Revoke any pregenerated buffers
  try { revokeAndClearAudioBuffer(currentAudioBufferRef.current); } catch (e) { void e; }
  currentAudioBufferRef.current = null;
  generationRatesRef.current = null;
    
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

  const seekToChunk = useCallback((chunkIndex: number) => {
    if (!chunkedPlaybackState.current || !state.chunks.length) {
      console.warn('seekToChunk: No chunked playback active');
      return;
    }
    
    if (chunkIndex < 0 || chunkIndex >= state.totalChunks) {
      console.warn(`seekToChunk: Invalid chunk index ${chunkIndex} (total: ${state.totalChunks})`);
      return;
    }
    
    console.log(`🎯 Seeking to chunk ${chunkIndex + 1}/${state.totalChunks}`);
    
    // Save the original text and chunks before stopping
    const originalText = state.currentText;
    const originalChunks = state.chunks;
    
    // Stop current playback
    stop();
    
    // Resume playback from the selected chunk using the ORIGINAL full text and chunks
    // We pass the full text but tell speakChunked to start from chunkIndex
    setTimeout(() => {
      if (!originalText) return;
      
      // Call speakChunked directly with the original chunks, starting at the selected index
      const provider = providerFactory.getProvider(state.currentProvider);
      if (!provider) {
        console.error('seekToChunk: No provider available');
        return;
      }
      
      // Reset stopping flag so playback can start
      isStoppingIntentionally.current = false;
      
      // Initialize chunked playback state with the starting index
      chunkedPlaybackState.current = {
        isChunked: true,
        chunks: originalChunks,
        currentChunkIndex: chunkIndex,
        totalChunks: originalChunks.length
      };
      
      // Set active provider
      activeProviderRef.current = provider;
      currentProviderRef.current = state.currentProvider;
      
      // Update state to show we're playing from this chunk
      setState(prev => ({ 
        ...prev, 
        isPlaying: true, 
        currentText: originalText,  // Keep original full text for matching
        chunks: originalChunks,     // Keep original chunks
        currentChunkIndex: chunkIndex,  // Start from clicked sentence
        totalChunks: originalChunks.length
      }));
      
      // Apply rate/volume
      try {
        if ('setPlaybackRate' in provider && typeof (provider as any).setPlaybackRate === 'function') {
          (provider as any).setPlaybackRate(state.rate);
        }
        if ('setVolume' in provider && typeof (provider as any).setVolume === 'function') {
          (provider as any).setVolume(state.volume);
        }
      } catch (err) {
        console.warn('seekToChunk: Failed to apply rate/volume:', err);
      }
      
      const currentVoice = state.providerVoices[state.currentProvider] || undefined;
      const baseOptions = {
        voice: currentVoice,
        rate: state.rate,
        volume: state.volume
      };
      
      // Play sentences sequentially starting from chunkIndex
      (async () => {
        for (let i = chunkIndex; i < originalChunks.length; i++) {
          // Check if stopped
          if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
            console.log('TTS: Seek playback stopped');
            chunkedPlaybackState.current = null;
            setState(prev => ({ ...prev, ...createStoppedState() }));
            return;
          }
          
          const chunk = originalChunks[i];
          console.log(`TTS: Seek playing sentence ${i + 1}/${originalChunks.length}: "${chunk.substring(0, 50)}..."`);
          
          // Update current chunk index
          chunkedPlaybackState.current.currentChunkIndex = i;
          setState(prev => ({ ...prev, currentChunkIndex: i }));
          
          // Play this sentence
          await new Promise<void>((resolve, reject) => {
            if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
              resolve();
              return;
            }
            
            const chunkOptions = {
              ...baseOptions,
              onEnd: () => {
                console.log(`TTS: Seek sentence ${i + 1} finished`);
                resolve();
              },
              onError: (error: Error) => {
                console.error(`TTS: Error in seek sentence ${i + 1}:`, error);
                if (isStoppingIntentionally.current) {
                  resolve();
                } else {
                  reject(error);
                }
              }
            };
            
            provider.speak(chunk, chunkOptions).catch((error) => {
              if (isStoppingIntentionally.current) {
                resolve();
              } else {
                reject(error);
              }
            });
          });
          
          // Check again after chunk completes
          if (isStoppingIntentionally.current || !chunkedPlaybackState.current) {
            console.log('TTS: Seek playback stopped after chunk');
            chunkedPlaybackState.current = null;
            setState(prev => ({ ...prev, ...createStoppedState() }));
            return;
          }
          
          // Small delay for browser TTS stability
          if (i < originalChunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        // All chunks finished
        console.log('TTS: Seek playback completed all chunks');
        chunkedPlaybackState.current = null;
        setState(prev => ({ ...prev, ...createStoppedState() }));
      })();
    }, 100);
  }, [state.chunks, state.currentText, state.totalChunks, state.currentProvider, state.rate, state.volume, state.providerVoices, stop, providerFactory]);

  const setProvider = useCallback(async (providerType: TTSProviderType) => {
    console.log(`🔍 [TTSContext] setProvider called with: ${providerType}`);
    const provider = providerFactory.getProvider(providerType);
    console.log(`🔍 [TTSContext] Provider found:`, provider ? '✅ Yes' : '❌ No');
    
    // Special case: Allow selecting ElevenLabs even without API key (for configuration)
    if (!provider && providerType !== 'elevenlabs') {
      console.error(`❌ [TTSContext] Provider "${providerType}" not found in factory`);
      return;
    }

    // Stop current speech
    stop();

    // If no provider (ElevenLabs without API key), just update state without loading voices
    if (!provider) {
      console.log(`⚠️ [TTSContext] ${providerType} not initialized, updating state for configuration`);
      setState(prev => ({ 
        ...prev, 
        currentProvider: providerType, 
        voices: [],
        boundarySupported: false
      }));
      setTTSSettings(prev => ({ 
        ...prev, 
        currentProvider: providerType
      }));
      return;
    }

    // Check if provider supports boundary events
    const boundarySupported = provider.isBoundarySupported?.() || false;
    console.log(`🔍 [TTSContext] Provider ${providerType} boundary support:`, boundarySupported);

    // Load voices for provider
    try {
      console.log(`🔍 [TTSContext] Loading voices for: ${providerType}`);
      const voices = await provider.getVoices();
      console.log(`✅ [TTSContext] Loaded ${voices.length} voices for: ${providerType}`);
      
      // For browser provider, auto-select first remote voice (if available)
      if (providerType === 'browser' && voices.length > 0 && !state.providerVoices.browser) {
        const firstVoice = voices[0];
        console.log(`🎤 [TTSContext] Auto-selecting default browser voice: ${firstVoice.name} (ID: ${firstVoice.id})`);
        setState(prev => ({ 
          ...prev, 
          currentProvider: providerType, 
          voices,
          boundarySupported,
          providerVoices: {
            ...prev.providerVoices,
            browser: firstVoice.id
          },
          usingNonLocalVoice: firstVoice.isLocal === false
        }));
        setTTSSettings(prev => ({ 
          ...prev, 
          currentProvider: providerType,
          providerVoices: {
            ...prev.providerVoices,
            browser: firstVoice.id
          }
        }));
      } else {
        setState(prev => ({ 
          ...prev, 
          currentProvider: providerType, 
          voices,
          boundarySupported
        }));
        setTTSSettings(prev => ({ 
          ...prev, 
          currentProvider: providerType
        }));
      }
      console.log(`✅ [TTSContext] State updated to provider: ${providerType}, boundary: ${boundarySupported}`);
    } catch (error) {
      console.error(`❌ [TTSContext] Failed to switch provider to ${providerType}:`, error);
    }
  }, [providerFactory, stop, setTTSSettings]);

  const setVoice = useCallback(async (voiceId: string, forProvider?: TTSProviderType) => {
    const targetProvider = forProvider || state.currentProvider;
    
    console.log(`🎤 setVoice called: voiceId="${voiceId}", provider="${targetProvider}"`);
    
    // Check if this is a non-local browser voice
    let isNonLocal = false;
    if (targetProvider === 'browser') {
      const provider = providerFactory.getProvider('browser');
      if (provider) {
        const voices = await provider.getVoices();
        const selectedVoice = voices.find(v => v.id === voiceId);
        isNonLocal = selectedVoice?.isLocal === false;
        console.log(`🎤 Selected voice "${selectedVoice?.name}" (ID: ${voiceId}): ${isNonLocal ? 'REMOTE' : 'LOCAL'}`);
        if (!selectedVoice) {
          console.error(`⚠️ Voice with ID "${voiceId}" not found in provider voices!`);
          console.log(`   Available voice IDs:`, voices.slice(0, 10).map(v => v.id));
        }
      }
    }
    
    setState(prev => ({ 
      ...prev, 
      providerVoices: {
        ...prev.providerVoices,
        [targetProvider]: voiceId
      },
      usingNonLocalVoice: isNonLocal
    }));
    setTTSSettings(prev => ({ 
      ...prev, 
      providerVoices: {
        ...prev.providerVoices,
        [targetProvider]: voiceId
      }
    }));
  }, [state.currentProvider, setTTSSettings, providerFactory]);

  const setRate = useCallback((rate: number) => {
    console.log(`🎚️ TTSContext.setRate(${rate})`);
    
    setState(prev => {
      console.log(`   - prev.isPlaying: ${prev.isPlaying}`);
      return { ...prev, rate };
    });
    setTTSSettings(prev => ({ ...prev, rate }));
    // Update refs for long-running playback loops
    const oldRate = currentRateRef.current;
    currentRateRef.current = rate;
    // Invalidate pregenerated blobs when rate changes significantly
    try {
      const buf = currentAudioBufferRef.current;
      if (buf && buf.size > 0) {
        const relChange = Math.abs(rate - oldRate) / (oldRate || 1);
        if (relChange >= 0.15) {
          console.log(`🧹 TTSContext: Invalidating ${buf.size} pregenerated blobs due to rate change ${oldRate} -> ${rate} (rel ${relChange.toFixed(2)})`);
          revokeAndClearAudioBuffer(buf);
          if (generationRatesRef.current) generationRatesRef.current.clear();
        }
      }
    } catch (err) {
      console.warn('⚠️ TTSContext: Error while invalidating pregenerated blobs on rate change', err);
    }
    
    // Apply real-time if playing - check via ref since it's more current than closure
    const provider = activeProviderRef.current;
    console.log(`   - activeProviderRef.current:`, provider?.name || 'null');
    
    if (provider) {
      if ('setPlaybackRate' in provider && typeof provider.setPlaybackRate === 'function') {
        console.log(`✅ TTSContext: Calling provider.setPlaybackRate(${rate})`);
        provider.setPlaybackRate(rate);
      } else {
        console.warn(`⚠️ TTSContext: Provider ${provider.name} does not support setPlaybackRate`);
      }
    } else {
      console.log(`ℹ️ TTSContext: Not applying rate - no active provider`);
    }
  }, [setTTSSettings]);

  const setVolume = useCallback((volume: number) => {
    console.log(`🔊 TTSContext.setVolume(${volume})`);
    
    setState(prev => {
      console.log(`   - prev.isPlaying: ${prev.isPlaying}`);
      return { ...prev, volume };
    });
    setTTSSettings(prev => ({ ...prev, volume }));
    
    // Apply real-time if playing - check via ref since it's more current than closure
    const provider = activeProviderRef.current;
    console.log(`   - activeProviderRef.current:`, provider?.name || 'null');
    
    if (provider) {
      if ('setVolume' in provider && typeof provider.setVolume === 'function') {
        console.log(`✅ TTSContext: Calling provider.setVolume(${volume})`);
        provider.setVolume(volume);
      } else {
        console.warn(`⚠️ TTSContext: Provider ${provider.name} does not support setVolume`);
      }
    } else {
      console.log(`ℹ️ TTSContext: Not applying volume - no active provider`);
    }
    const oldVol = currentVolumeRef.current;
    currentVolumeRef.current = volume;
    try {
      const buf = currentAudioBufferRef.current;
      if (buf && buf.size > 0 && Math.abs(volume - oldVol) >= 0.2) {
        console.log(`🧹 TTSContext: Invalidating ${buf.size} pregenerated blobs due to volume change ${oldVol} -> ${volume}`);
        revokeAndClearAudioBuffer(buf);
        if (generationRatesRef.current) generationRatesRef.current.clear();
      }
    } catch (err) {
      console.warn('⚠️ TTSContext: Error while invalidating pregenerated blobs on volume change', err);
    }
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

  const getVoicesForProvider = useCallback(async (providerType: TTSProviderType, languageCode?: string) => {
    const provider = providerFactory.getProvider(providerType);
    return provider ? await provider.getVoices(languageCode) : [];
  }, [providerFactory]);

  const speakResponse = useCallback(async (responseText: string): Promise<void> => {
    return speak(responseText);
  }, [speak]);

  const speakSnippet = useCallback(async (snippetContent: string): Promise<void> => {
    return speak(snippetContent);
  }, [speak]);

  const contextValue: TTSContextValue = {
    state,
    speak,
    stop,
    pause,
    resume,
    seekToChunk,
    setProvider,
    setVoice,
    setRate,
    setVolume,
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
    // During hot reload, return a safe fallback instead of throwing
    if (import.meta.env.DEV) {
      console.warn('useTTS called outside TTSProvider - this may happen during hot reload');
      // Return a minimal mock context to prevent crashes during HMR
      return {
        state: {
          isPlaying: false,
          isPaused: false,
          currentProvider: 'browser' as const,
          activeProvider: 'browser' as const,
          availableProviders: [],
          rate: 1.0,
          volume: 1.0,
          boundarySupported: false,
          usingNonLocalVoice: false,
        },
        speak: async () => {},
        pause: () => {},
        resume: () => {},
        stop: () => {},
        setProvider: async () => {},
        setRate: () => {},
        setVolume: () => {},
        getAvailableProviders: () => [],
        getVoicesForProvider: async () => [],
        setVoiceForProvider: () => {},
      } as any;
    }
    throw new Error('useTTS must be used within a TTSProvider');
  }
  return context;
};