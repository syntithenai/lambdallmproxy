/**
 * TTS Provider Factory
 *
 * Manages initialization and selection of TTS providers with fallback chain
 */

 

/* eslint-disable @typescript-eslint/no-unused-vars */


import type { TTSProvider, TTSProviderType, SpeakOptions } from '../../types/tts';
import type { ProviderConfig } from '../../types/provider';
import { BrowserSpeechProvider } from './BrowserProviders';
import { ElevenLabsProvider } from './ElevenLabsProvider';
import { 
  OpenAITTSProvider, 
  GroqTTSProvider,
  GeminiTTSProvider,
  OpenRouterTTSProvider 
} from './LLMTTSProviders';

// Track rate-limit occurrences and temporary blacklists per provider name
type RateLimitState = { count: number; blacklistedUntil: number | null };
const rateLimitState: Map<string, RateLimitState> = new Map();
// Map pregenerated Blob -> provider that produced it so playBlob can set the correct active provider
const pregeneratedBlobMap: WeakMap<Blob, TTSProvider> = new WeakMap();

function parseTryAgainDuration(message: string): number | null {
  // Look for patterns like "Please try again in 11m36s" or "Please try again in 43m12s" or "11m36s"
  try {
    const m = message.match(/Please try again in\s*((?:(?:\d+)h)?(?:(?:\d+)m)?(?:(?:\d+)s)?)/i);
    const token = m ? m[1] : null;
    if (!token) return null;

    const hoursMatch = token.match(/(\d+)h/);
    const minsMatch = token.match(/(\d+)m/);
    const secsMatch = token.match(/(\d+)s/);

    const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
    const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
    const secs = secsMatch ? parseInt(secsMatch[1], 10) : 0;

    const totalSeconds = hours * 3600 + mins * 60 + secs;
    return totalSeconds > 0 ? totalSeconds : null;
  } catch (err) {
    return null;
  }
}

/**
 * Fallback TTS Provider
 * Wraps a primary provider with fallback providers
 */
class FallbackTTSProvider implements TTSProvider {
  name: string;
  private primaryProvider: TTSProvider;
  private fallbackProviders: TTSProvider[];
  private activeProvider: TTSProvider | null = null; // Track which provider is actually speaking

  constructor(primaryProvider: TTSProvider, fallbackProviders: TTSProvider[]) {
    this.name = primaryProvider.name;
    this.primaryProvider = primaryProvider;
    this.fallbackProviders = fallbackProviders;
  }

  async isAvailable(): Promise<boolean> {
    // Respect temporary rate-limit blacklists for the primary provider
    try {
      const rl = rateLimitState.get(this.primaryProvider.name);
      if (rl && rl.blacklistedUntil && rl.blacklistedUntil > Date.now()) {
        const secs = Math.ceil((rl.blacklistedUntil - Date.now()) / 1000);
        console.log(`⏸️ FallbackTTSProvider.isAvailable(): Primary provider ${this.primaryProvider.name} blacklisted for ${secs}s`);
      } else {
        // Clear expired blacklist
        if (rl && rl.blacklistedUntil && rl.blacklistedUntil <= Date.now()) {
          rateLimitState.set(this.primaryProvider.name, { count: 0, blacklistedUntil: null });
        }

        if (await this.primaryProvider.isAvailable()) return true;
      }
    } catch (err) {
      console.warn('⚠️ FallbackTTSProvider.isAvailable(): Error checking rate-limit state', err);
    }

    for (const fallback of this.fallbackProviders) {
      if (await fallback.isAvailable()) return true;
    }

    return false;
  }

  async getVoices(languageCode?: string) {
    // If primary is blacklisted, prefer fallback voices
    try {
      const rl = rateLimitState.get(this.primaryProvider.name);
      if (rl && rl.blacklistedUntil && rl.blacklistedUntil > Date.now()) {
        console.log(`⏸️ FallbackTTSProvider.getVoices(): Primary provider ${this.primaryProvider.name} is blacklisted, returning fallback voices`);
      } else {
        // Clear expired blacklist
        if (rl && rl.blacklistedUntil && rl.blacklistedUntil <= Date.now()) {
          rateLimitState.set(this.primaryProvider.name, { count: 0, blacklistedUntil: null });
        }

        if (await this.primaryProvider.isAvailable()) return this.primaryProvider.getVoices(languageCode);
      }
    } catch (err) {
      console.warn('⚠️ FallbackTTSProvider.getVoices(): Error checking rate-limit state', err);
    }

    for (const fallback of this.fallbackProviders) {
      if (await fallback.isAvailable()) return fallback.getVoices(languageCode);
    }

    return [];
  }

  async speak(text: string, options: SpeakOptions): Promise<void> {
    // Try primary provider first, unless it's temporarily blacklisted due to rate limits
    try {
      const rl = rateLimitState.get(this.primaryProvider.name);
      if (rl && rl.blacklistedUntil && rl.blacklistedUntil > Date.now()) {
        const secondsLeft = Math.ceil((rl.blacklistedUntil - Date.now()) / 1000);
        console.log(`⏸️ FallbackTTSProvider: Primary provider ${this.primaryProvider.name} is temporarily blacklisted for ${secondsLeft}s, skipping to fallbacks`);
      } else {
        // Clean up expired blacklist state
        if (rl && rl.blacklistedUntil && rl.blacklistedUntil <= Date.now()) {
          rateLimitState.set(this.primaryProvider.name, { count: 0, blacklistedUntil: null });
        }

        if (await this.primaryProvider.isAvailable()) {
          try {
            console.log(`🔊 TTS: Using primary provider: ${this.primaryProvider.name}`);
            this.activeProvider = this.primaryProvider; // Track active provider
            
            // CRITICAL: Apply rate/volume to underlying provider BEFORE speak()
            // Some providers only apply settings via setters, not via options
            if (options.rate && 'setPlaybackRate' in this.primaryProvider && typeof (this.primaryProvider as any).setPlaybackRate === 'function') {
              console.log(`🎚️ FallbackTTSProvider: Pre-applying rate ${options.rate} to ${this.primaryProvider.name}`);
              try {
                (this.primaryProvider as any).setPlaybackRate(options.rate);
              } catch (err) {
                console.warn(`⚠️ Failed to pre-apply rate:`, err);
              }
            }
            if (options.volume !== undefined && 'setVolume' in this.primaryProvider && typeof (this.primaryProvider as any).setVolume === 'function') {
              console.log(`🔊 FallbackTTSProvider: Pre-applying volume ${options.volume} to ${this.primaryProvider.name}`);
              try {
                (this.primaryProvider as any).setVolume(options.volume);
              } catch (err) {
                console.warn(`⚠️ Failed to pre-apply volume:`, err);
              }
            }
            
            // On success, reset any accumulated rate-limit counter for this provider
            rateLimitState.set(this.primaryProvider.name, { count: 0, blacklistedUntil: null });
            return await this.primaryProvider.speak(text, options);
          } catch (error) {
            // If error is "interrupted", don't try fallbacks - user stopped intentionally
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('interrupted')) {
              console.log(`🛑 TTS: Primary provider was interrupted (user stopped), stopping completely`);
              this.activeProvider = null;
              // Don't throw - just return to stop gracefully without trying fallbacks
              return;
            }

            // Rate limit detection: increment counter and blacklist after 2 occurrences
            if (/rate limit|rate_limit_exceeded|429|Rate limit exceeded/i.test(errorMessage)) {
              // Get existing state or create new one
              let state = rateLimitState.get(this.primaryProvider.name);
              if (!state) {
                state = { count: 0, blacklistedUntil: null };
                rateLimitState.set(this.primaryProvider.name, state);
              }
              
              state.count += 1;
              console.warn(`⚠️ TTS: Primary provider ${this.primaryProvider.name} reported rate limit (occurrence ${state.count})`);

              if (state.count >= 2) {
                const seconds = parseTryAgainDuration(errorMessage) || (60 * 15); // default 15 minutes
                state.blacklistedUntil = Date.now() + seconds * 1000;
                console.log(`⛔️ TTS: Blacklisting ${this.primaryProvider.name} for ${seconds}s due to repeated rate limits`);
                state.count = 0; // reset counter after blacklisting
              }
            }

            console.warn(`⚠️ TTS: Primary provider failed, trying fallback:`, error);
            // Clear activeProvider since primary failed
            this.activeProvider = null;
          }
        } else {
          console.log(`🔊 TTS: Primary provider ${this.primaryProvider.name} not available, trying fallbacks`);
        }
      }
    } catch (err) {
      console.warn('⚠️ FallbackTTSProvider: Error while checking rate-limit state, proceeding to fallbacks', err);
    }

    // Try fallback providers
    for (const fallback of this.fallbackProviders) {
      if (await fallback.isAvailable()) {
        try {
          console.log(`🔊 TTS: Falling back to: ${fallback.name}`);
          this.activeProvider = fallback; // Track active provider
          
          // Apply rate/volume to fallback provider too
          if (options.rate && 'setPlaybackRate' in fallback && typeof (fallback as any).setPlaybackRate === 'function') {
            console.log(`🎚️ FallbackTTSProvider: Pre-applying rate ${options.rate} to fallback ${fallback.name}`);
            try {
              (fallback as any).setPlaybackRate(options.rate);
            } catch (err) {
              console.warn(`⚠️ Failed to pre-apply rate to fallback:`, err);
            }
          }
          if (options.volume !== undefined && 'setVolume' in fallback && typeof (fallback as any).setVolume === 'function') {
            console.log(`🔊 FallbackTTSProvider: Pre-applying volume ${options.volume} to fallback ${fallback.name}`);
            try {
              (fallback as any).setVolume(options.volume);
            } catch (err) {
              console.warn(`⚠️ Failed to pre-apply volume to fallback:`, err);
            }
          }
          
          // CRITICAL: Replace voice with browser-appropriate one when falling back
          // Provider-specific voice names (like "Judy-PlayAI" from Groq) are incompatible
          const fallbackOptions = { ...options };
          if (fallback.name === 'Browser Speech') {
            // Use the voice configured for browser in settings, if available
            const browserVoice = options.providerVoices?.browser;
            if (browserVoice) {
              console.log(`✅ FallbackTTSProvider: Using configured browser voice: ${browserVoice}`);
              fallbackOptions.voice = browserVoice;
            } else {
              // No browser voice configured - try to find an English voice
              console.log(`🔄 FallbackTTSProvider: No browser voice configured, checking available voices...`);
              try {
                const browserVoices = await fallback.getVoices();
                if (browserVoices.length > 0) {
                  // Try to find an English voice first
                  const englishVoice = browserVoices.find(v => {
                    const nameLower = v.name.toLowerCase();
                    return nameLower.includes('english') || 
                           nameLower.includes('us ') || 
                           nameLower.includes('uk ') ||
                           nameLower.includes('en-');
                  });
                  
                  if (englishVoice) {
                    console.log(`📢 FallbackTTSProvider: Using English browser voice: ${englishVoice.name}`);
                    fallbackOptions.voice = englishVoice.id;
                  } else {
                    console.log(`📢 FallbackTTSProvider: No English voice found, using first available: ${browserVoices[0].name}`);
                    fallbackOptions.voice = browserVoices[0].id;
                  }
                } else {
                  console.log(`📢 FallbackTTSProvider: No voices available, will use system default`);
                  delete fallbackOptions.voice;
                }
              } catch (err) {
                console.warn(`⚠️ FallbackTTSProvider: Failed to get browser voices, using default:`, err);
                delete fallbackOptions.voice;
              }
            }
          }
          
          return await fallback.speak(text, fallbackOptions);
        } catch (error) {
          // If error is "interrupted", don't try more fallbacks - user stopped intentionally
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('interrupted')) {
            console.log(`🛑 TTS: Fallback ${fallback.name} was interrupted (user stopped), stopping completely`);
            this.activeProvider = null;
            // Don't throw - just return to stop gracefully without trying more fallbacks
            return;
          }
          console.warn(`⚠️ TTS: Fallback ${fallback.name} failed:`, error);
        }
      }
    }

    this.activeProvider = null;
    throw new Error('All TTS providers failed');
  }

  stop() {
    // Only stop the provider that is actually active to avoid cascading
    // stops which can interrupt other providers (e.g., stopping browser TTS
    // while speak.js is speaking). If no active provider is tracked, stop
    // the primary provider as a reasonable fallback.
    try {
      if (this.activeProvider) {
        console.log(`🔇 FallbackTTSProvider.stop(): Stopping active provider: ${this.activeProvider.name}`);
        this.activeProvider.stop();
      } else if (this.primaryProvider) {
        console.log(`🔇 FallbackTTSProvider.stop(): No active provider, stopping primary: ${this.primaryProvider.name}`);
        this.primaryProvider.stop();
      }
    } catch (err) {
      console.warn('FallbackTTSProvider.stop() - error while stopping provider:', err);
    }
    this.activeProvider = null; // Clear active provider on stop
  }

  cleanup() {
    if (this.primaryProvider.cleanup) this.primaryProvider.cleanup();
    this.fallbackProviders.forEach(f => f.cleanup?.());
    this.activeProvider = null;
  }

  /**
   * Proxy method for real-time playback rate control
   */
  setPlaybackRate(rate: number): void {
    console.log(`🎚️ FallbackTTSProvider.setPlaybackRate(${rate})`);
    console.log(`   - activeProvider: ${this.activeProvider?.name || 'null'}`);
    console.log(`   - primaryProvider: ${this.primaryProvider.name}`);
    
    if (this.activeProvider && 'setPlaybackRate' in this.activeProvider && typeof (this.activeProvider as any).setPlaybackRate === 'function') {
      console.log(`✅ FallbackTTSProvider: Proxying setPlaybackRate(${rate}) to ${this.activeProvider.name}`);
      (this.activeProvider as any).setPlaybackRate(rate);
    } else if (!this.activeProvider && 'setPlaybackRate' in this.primaryProvider && typeof (this.primaryProvider as any).setPlaybackRate === 'function') {
      // Fallback: If no active provider yet (before speak), apply to primary
      console.log(`⚠️ FallbackTTSProvider: No active provider yet, applying to primary: ${this.primaryProvider.name}`);
      (this.primaryProvider as any).setPlaybackRate(rate);
    } else {
      console.warn(`❌ FallbackTTSProvider: Cannot apply setPlaybackRate - no active provider or method not available`);
    }
  }

  /**
   * Proxy method for real-time volume control
   */
  setVolume(volume: number): void {
    console.log(`🔊 FallbackTTSProvider.setVolume(${volume})`);
    console.log(`   - activeProvider: ${this.activeProvider?.name || 'null'}`);
    
    if (this.activeProvider && 'setVolume' in this.activeProvider && typeof (this.activeProvider as any).setVolume === 'function') {
      console.log(`✅ FallbackTTSProvider: Proxying setVolume(${volume}) to ${this.activeProvider.name}`);
      (this.activeProvider as any).setVolume(volume);
    } else if (!this.activeProvider && 'setVolume' in this.primaryProvider && typeof (this.primaryProvider as any).setVolume === 'function') {
      // Fallback: If no active provider yet (before speak), apply to primary
      console.log(`⚠️ FallbackTTSProvider: No active provider yet, applying to primary: ${this.primaryProvider.name}`);
      (this.primaryProvider as any).setVolume(volume);
    } else {
      console.warn(`❌ FallbackTTSProvider: Cannot apply setVolume - no active provider or method not available`);
    }
  }

  /**
   * Get the name of the provider that's actually playing
   */
  getActiveProviderName(): string | null {
    return this.activeProvider?.name || null;
  }

  /**
   * Proxy method for pre-generating audio blobs
   */
  async pregenerate(text: string, options: SpeakOptions): Promise<Blob> {
    console.log(`🎬 FallbackTTSProvider.pregenerate() - attempting pregeneration (primary: ${this.primaryProvider.name})`);

    // Helper to attempt pregeneration on a provider and record mapping
    const tryPregenerate = async (provider: TTSProvider) => {
      if (!('pregenerate' in provider) || typeof (provider as any).pregenerate !== 'function') {
        throw new Error(`Pre-generation not supported by ${provider.name}`);
      }

      try {
        const blob = await (provider as any).pregenerate(text, options);
        try {
          pregeneratedBlobMap.set(blob, provider);
        } catch (err) {
          // ignore WeakMap set errors (shouldn't happen)
        }
        return blob;
      } catch (err) {
        // If this looks like a rate-limit error, increment rateLimitState for this provider
        try {
          const errorMessage = err instanceof Error ? err.message : String(err);
          if (/rate limit|rate_limit_exceeded|429|Rate limit exceeded/i.test(errorMessage)) {
            let state = rateLimitState.get(provider.name);
            if (!state) {
              state = { count: 0, blacklistedUntil: null };
              rateLimitState.set(provider.name, state);
            }
            state.count += 1;
            console.warn(`⚠️ TTS: Provider ${provider.name} reported rate limit during pregenerate (occurrence ${state.count})`);
            if (state.count >= 2) {
              const seconds = parseTryAgainDuration(errorMessage) || (60 * 15);
              state.blacklistedUntil = Date.now() + seconds * 1000;
              console.log(`⛔️ TTS: Blacklisting ${provider.name} for ${seconds}s due to repeated rate limits (pregenerate)`);
              state.count = 0;
            }
          }
        } catch (e) {
          // ignore bookkeeping errors
        }
        throw err;
      }
    };

    // Respect blacklist for primary provider
    try {
      const rl = rateLimitState.get(this.primaryProvider.name);
      if (rl && rl.blacklistedUntil && rl.blacklistedUntil > Date.now()) {
        const secs = Math.ceil((rl.blacklistedUntil - Date.now()) / 1000);
        console.log(`⏸️ FallbackTTSProvider.pregenerate(): Skipping primary ${this.primaryProvider.name} (blacklisted ${secs}s)`);
      } else {
        // Clear expired
        if (rl && rl.blacklistedUntil && rl.blacklistedUntil <= Date.now()) {
          rateLimitState.set(this.primaryProvider.name, { count: 0, blacklistedUntil: null });
        }

        try {
          // Skip primary if it doesn't implement pregenerate
          if (!('pregenerate' in this.primaryProvider) || typeof (this.primaryProvider as any).pregenerate !== 'function') {
            console.log(`ℹ️ FallbackTTSProvider.pregenerate(): Primary provider ${this.primaryProvider.name} does not support pregenerate, skipping`);
          } else if (await this.primaryProvider.isAvailable()) {
            return await tryPregenerate(this.primaryProvider);
          }
        } catch (err) {
          // Treat primary pregenerate failure as a potential rate-limit occurrence
          console.warn(`⚠️ FallbackTTSProvider.pregenerate(): primary pregenerate attempt failed:`, err);
          try {
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (/rate limit|rate_limit_exceeded|429|Rate limit exceeded/i.test(errorMessage)) {
              let state = rateLimitState.get(this.primaryProvider.name);
              if (!state) {
                state = { count: 0, blacklistedUntil: null };
                rateLimitState.set(this.primaryProvider.name, state);
              }
              state.count += 1;
              console.warn(`⚠️ TTS: Primary provider ${this.primaryProvider.name} reported rate limit (occurrence ${state.count})`);
              if (state.count >= 2) {
                const seconds = parseTryAgainDuration(errorMessage) || (60 * 15);
                state.blacklistedUntil = Date.now() + seconds * 1000;
                console.log(`⛔️ TTS: Blacklisting ${this.primaryProvider.name} for ${seconds}s due to repeated rate limits (pregenerate)`);
                state.count = 0;
              }
            }
          } catch (e) {
            // ignore errors during rate-limit bookkeeping
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ FallbackTTSProvider.pregenerate(): Error while checking rate-limit state, proceeding to fallbacks', err);
    }

    // Try fallback providers (skip those that don't support pregenerate)
    for (const fallback of this.fallbackProviders) {
      try {
        if (!('pregenerate' in fallback) || typeof (fallback as any).pregenerate !== 'function') {
          console.log(`ℹ️ FallbackTTSProvider.pregenerate(): Skipping ${fallback.name} - pregenerate not supported`);
          continue;
        }

        if (await fallback.isAvailable()) {
          try {
            return await tryPregenerate(fallback);
          } catch (err) {
            console.warn(`⚠️ FallbackTTSProvider.pregenerate(): fallback ${fallback.name} failed:`, err);
          }
        }
      } catch (err) {
        console.warn(`⚠️ FallbackTTSProvider.pregenerate(): error checking fallback ${fallback.name}:`, err);
      }
    }

    throw new Error(`Pre-generation not supported or failed for any providers in chain starting with ${this.primaryProvider.name}`);
  }

  /**
   * Proxy method for playing pre-generated audio blobs
   */
  async playBlob(blob: Blob, options: SpeakOptions, providedObjectUrl?: string): Promise<void> {
    // Attempt to determine which provider produced this blob so we can mark the correct active provider
    const providerForBlob = pregeneratedBlobMap.get(blob) || this.primaryProvider;
    console.log(`▶️ FallbackTTSProvider.playBlob() - playing blob with provider: ${providerForBlob.name}`);

    // Prefer to call playBlob on the provider that produced it if supported
  if ('playBlob' in providerForBlob && typeof (providerForBlob as any).playBlob === 'function') {
      // Apply rate/volume to the provider that will play the blob to keep playback consistent
      try {
        if (options.rate && 'setPlaybackRate' in providerForBlob && typeof (providerForBlob as any).setPlaybackRate === 'function') {
          (providerForBlob as any).setPlaybackRate(options.rate);
        }
        if (options.volume !== undefined && 'setVolume' in providerForBlob && typeof (providerForBlob as any).setVolume === 'function') {
          (providerForBlob as any).setVolume(options.volume);
        }
      } catch (err) {
        console.warn(`⚠️ FallbackTTSProvider.playBlob(): Failed to apply rate/volume to ${providerForBlob.name}:`, err);
      }

      this.activeProvider = providerForBlob; // Track as active
      try {
        return await (providerForBlob as any).playBlob(blob, options, providedObjectUrl);
      } catch (err) {
        console.warn(`⚠️ FallbackTTSProvider.playBlob(): provider ${providerForBlob.name} failed to play blob:`, err);
        // fall through to try primary
      }
    }

    // Fallback: try primary provider's playBlob
  if ('playBlob' in this.primaryProvider && typeof (this.primaryProvider as any).playBlob === 'function') {
      // Apply rate/volume to primary provider as a fallback
      try {
        if (options.rate && 'setPlaybackRate' in this.primaryProvider && typeof (this.primaryProvider as any).setPlaybackRate === 'function') {
          (this.primaryProvider as any).setPlaybackRate(options.rate);
        }
        if (options.volume !== undefined && 'setVolume' in this.primaryProvider && typeof (this.primaryProvider as any).setVolume === 'function') {
          (this.primaryProvider as any).setVolume(options.volume);
        }
      } catch (err) {
        console.warn(`⚠️ FallbackTTSProvider.playBlob(): Failed to apply rate/volume to primary ${this.primaryProvider.name}:`, err);
      }

      this.activeProvider = this.primaryProvider;
      return await (this.primaryProvider as any).playBlob(blob, options, providedObjectUrl);
    }

    throw new Error(`Blob playback not supported by any provider in chain starting with ${this.primaryProvider.name}`);
  }

  /**
   * Check if boundary events are supported (delegates to active or primary provider)
   */
  isBoundarySupported(): boolean {
    const provider = this.activeProvider || this.primaryProvider;
    if (provider && 'isBoundarySupported' in provider && typeof (provider as any).isBoundarySupported === 'function') {
      return (provider as any).isBoundarySupported();
    }
    return false;
  }
}

/**
 * TTS Provider Factory
 */
export class TTSProviderFactory {
  private providers: Map<TTSProviderType, TTSProvider> = new Map();
  private browserSpeech: BrowserSpeechProvider;

  constructor() {
    this.browserSpeech = new BrowserSpeechProvider();
  }

  async initializeProviders(_llmProviders: ProviderConfig[], elevenlabsApiKey?: string): Promise<void> {
    this.providers.clear();

    // Build fallback chain: Web Speech API only
    const fallbackChain: TTSProvider[] = [];
    if (await this.browserSpeech.isAvailable()) fallbackChain.push(this.browserSpeech);

    // Initialize each LLM TTS provider with fallback chain
    const openaiConfig = _llmProviders?.find(p => p.type === 'openai');
    const openaiApiKey = openaiConfig && openaiConfig.apiKey && openaiConfig.apiKey !== '[BACKEND]' ? openaiConfig.apiKey : undefined;
    const openaiTTS = new OpenAITTSProvider(openaiApiKey);
    if (await openaiTTS.isAvailable()) {
      const wrapper = new FallbackTTSProvider(openaiTTS, fallbackChain);
      // set lightweight flag indicating whether pregeneration is supported by
      // any provider in this wrapper's chain (used to avoid attempting pregenerate)
      try {
        (wrapper as any).supportsPregenerate = !!(
          ('pregenerate' in openaiTTS && typeof (openaiTTS as any).pregenerate === 'function') ||
          fallbackChain.some(f => ('pregenerate' in f && typeof (f as any).pregenerate === 'function'))
        );
      } catch (_) {
        (wrapper as any).supportsPregenerate = false;
      }
      this.providers.set('openai-tts', wrapper);
    }

    const groqConfig = _llmProviders?.find(p => p.type === 'groq');
    const groqApiKey = groqConfig && groqConfig.apiKey && groqConfig.apiKey !== '[BACKEND]' ? groqConfig.apiKey : undefined;
    const groqTTS = new GroqTTSProvider(groqApiKey);
    if (await groqTTS.isAvailable()) {
      const wrapper = new FallbackTTSProvider(groqTTS, fallbackChain);
      try {
        (wrapper as any).supportsPregenerate = !!(
          ('pregenerate' in groqTTS && typeof (groqTTS as any).pregenerate === 'function') ||
          fallbackChain.some(f => ('pregenerate' in f && typeof (f as any).pregenerate === 'function'))
        );
      } catch (_) {
        (wrapper as any).supportsPregenerate = false;
      }
      this.providers.set('groq-tts', wrapper);
    }

    const geminiConfig = _llmProviders?.find(p => p.type === 'gemini');
    const geminiApiKey = geminiConfig && geminiConfig.apiKey && geminiConfig.apiKey !== '[BACKEND]' ? geminiConfig.apiKey : undefined;
    const geminiTTS = new GeminiTTSProvider(geminiApiKey);
    if (await geminiTTS.isAvailable()) {
      const wrapper = new FallbackTTSProvider(geminiTTS, fallbackChain);
      try {
        (wrapper as any).supportsPregenerate = !!(
          ('pregenerate' in geminiTTS && typeof (geminiTTS as any).pregenerate === 'function') ||
          fallbackChain.some(f => ('pregenerate' in f && typeof (f as any).pregenerate === 'function'))
        );
      } catch (_) {
        (wrapper as any).supportsPregenerate = false;
      }
      this.providers.set('gemini-tts', wrapper);
    }

  const openrouterConfig = _llmProviders?.find(p => (p as any).type === 'openrouter');
    const openrouterApiKey = openrouterConfig && openrouterConfig.apiKey && openrouterConfig.apiKey !== '[BACKEND]' ? openrouterConfig.apiKey : undefined;
    const openrouterTTS = new OpenRouterTTSProvider(openrouterApiKey);
    if (await openrouterTTS.isAvailable()) {
      const wrapper = new FallbackTTSProvider(openrouterTTS, fallbackChain);
      try {
        (wrapper as any).supportsPregenerate = !!(
          ('pregenerate' in openrouterTTS && typeof (openrouterTTS as any).pregenerate === 'function') ||
          fallbackChain.some(f => ('pregenerate' in f && typeof (f as any).pregenerate === 'function'))
        );
      } catch (_) {
        (wrapper as any).supportsPregenerate = false;
      }
      this.providers.set('openrouter-tts', wrapper);
    }

    // ElevenLabs with fallback chain (always available for voice browsing, even without API key)
    const elevenlabs = new ElevenLabsProvider(elevenlabsApiKey || '');
    // Always add to providers map so pre-made voices can be browsed
    // Speech will fail gracefully if no API key is set when trying to speak
    const elevenWrapper = new FallbackTTSProvider(elevenlabs, fallbackChain);
    try {
      (elevenWrapper as any).supportsPregenerate = !!(
        ('pregenerate' in elevenlabs && typeof (elevenlabs as any).pregenerate === 'function') ||
        fallbackChain.some(f => ('pregenerate' in f && typeof (f as any).pregenerate === 'function'))
      );
    } catch (_) {
      (elevenWrapper as any).supportsPregenerate = false;
    }
    this.providers.set('elevenlabs', elevenWrapper);

    // Browser without fallback wrappers
    if (await this.browserSpeech.isAvailable()) {
      // Browser speech provider does not support pregenerate
      (this.browserSpeech as any).supportsPregenerate = false;
      this.providers.set('browser', this.browserSpeech);
    }
  }

  getProvider(type: TTSProviderType): TTSProvider | undefined {
    if (type === 'auto') return this.getCheapestProvider();
    return this.providers.get(type);
  }

  private getCheapestProvider(): TTSProvider | undefined {
    // Priority: Cheapest online provider with API key configured → Browser (free) → speak.js
    // Only select online providers that are actually available (have API keys)
    
    // Define pricing for online providers (cost per 1M chars, using cheapest model)
    const onlineProviders: Array<{type: TTSProviderType, cost: number}> = [
      { type: 'openrouter-tts', cost: 3 },   // Kokoro: $3 per 1M chars
      { type: 'gemini-tts', cost: 4 },       // Standard: $4 per 1M chars  
      { type: 'openai-tts', cost: 15 },      // TTS-1: $15 per 1M chars
      { type: 'groq-tts', cost: 50 }         // PlayAI: $50 per 1M chars
    ];
    
    // Filter to only providers that are configured (exist in map)
    // and sort by cost (cheapest first)
    const availableOnline = onlineProviders
      .filter(p => this.providers.has(p.type))
      .sort((a, b) => a.cost - b.cost);
    
    // Return cheapest available online provider that is not currently blacklisted
    if (availableOnline.length > 0) {
      for (const p of availableOnline) {
        const prov = this.providers.get(p.type);
        if (!prov) continue;
        const rl = rateLimitState.get((prov as any).name || '');
        if (rl && rl.blacklistedUntil && rl.blacklistedUntil > Date.now()) {
          const secs = Math.ceil((rl.blacklistedUntil - Date.now()) / 1000);
          console.log(`⏸️ TTSProviderFactory.getCheapestProvider(): Skipping ${p.type} (${(prov as any).name}) - blacklisted for ${secs}s`);
          continue;
        }
        return prov;
      }
    }
    
    // Fallback to browser if no online providers available
    if (this.providers.has('browser')) return this.providers.get('browser');
    
    return undefined;
  }

  getAvailableProviders(): TTSProviderType[] {
    const available: TTSProviderType[] = ['auto'];
    const types: TTSProviderType[] = [
      'openai-tts',
      'groq-tts', 
      'gemini-tts',
      'openrouter-tts',
      'browser'
    ];
    
    types.forEach(type => {
      if (this.providers.has(type)) available.push(type);
    });
    
    // Always show elevenlabs in list (even if not configured)
    if (!available.includes('elevenlabs')) available.push('elevenlabs');
    
    return available;
  }

  getDefaultProvider(): TTSProvider | null {
    return this.getCheapestProvider() || null;
  }

  getDefaultProviderType(): TTSProviderType {
    return 'auto';
  }

  /**
   * Check whether the selected provider (or any provider in its fallback chain)
   * supports pregeneration (has a pregenerate method).
   */
  supportsPregenerate(type: TTSProviderType): boolean {
    const provider = this.providers.get(type);
    if (!provider) return false;

    // Direct support
    if ('pregenerate' in provider && typeof (provider as any).pregenerate === 'function') return true;

    // If this is a FallbackTTSProvider, inspect its primary/fallbacks
    try {
      const primary = (provider as any).primaryProvider as any | undefined;
      if (primary && 'pregenerate' in primary && typeof primary.pregenerate === 'function') return true;
      const fallbacks = (provider as any).fallbackProviders as any[] | undefined;
      if (Array.isArray(fallbacks)) {
        for (const f of fallbacks) {
          if (f && 'pregenerate' in f && typeof f.pregenerate === 'function') return true;
        }
      }
    } catch (err) {
      // Ignore inspection errors and fall through
    }

    return false;
  }

  async updateElevenLabsApiKey(apiKey: string): Promise<void> {
    const fallbackChain: TTSProvider[] = [];
    if (await this.browserSpeech.isAvailable()) fallbackChain.push(this.browserSpeech);

    if (apiKey) {
      const existing = this.providers.get('elevenlabs');
      if (existing && existing instanceof FallbackTTSProvider) {
        const primary = (existing as any).primaryProvider as ElevenLabsProvider;
        primary.setApiKey(apiKey);
      } else {
        const newProvider = new ElevenLabsProvider(apiKey);
        if (await newProvider.isAvailable()) {
          this.providers.set('elevenlabs', new FallbackTTSProvider(newProvider, fallbackChain));
        }
      }
    } else {
      this.providers.delete('elevenlabs');
    }
  }

  cleanup(): void {
    this.providers.forEach(provider => {
      try {
        // NOTE: Do NOT call stop() during cleanup - this would interrupt active speech
        // Only call cleanup() which releases resources without stopping playback
        if (provider.cleanup) provider.cleanup();
      } catch (error) {
        console.warn('Error cleaning up TTS provider:', error);
      }
    });
    this.providers.clear();
  }
}
