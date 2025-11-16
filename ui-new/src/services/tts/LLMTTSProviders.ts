/**
 * LLM TTS Provider Base Class
 * 
 * Generic provider for LLM-based TTS services (OpenAI, Groq, Gemini, OpenRouter)
 * Calls the backend /tts endpoint with appropriate provider parameter
 */

 

import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';
import { getCachedApiBase } from '../../utils/api';
import { googleAuth } from '../googleAuth';

/**
 * Base class for LLM-based TTS providers (OpenAI, Groq, Gemini, OpenRouter)
 * These providers call the backend /tts endpoint and play audio via HTML5 Audio element
 */
abstract class LLMTTSProvider implements TTSProvider {
  name: string;
  protected backendProvider: string;
  protected defaultVoices: Voice[];
  protected audio: HTMLAudioElement | null = null;
  // Timers used to re-apply playbackRate shortly after play() (workaround for some browsers)
  protected _playbackRateTimers: number[] = [];
  // Optional API key supplied from user settings for this provider
  protected apiKey?: string;

  constructor(name: string, backendProvider: string, voices: Voice[], apiKey?: string) {
    this.name = name;
    this.backendProvider = backendProvider;
    this.defaultVoices = voices;
    this.apiKey = apiKey;
  }

  async isAvailable(): Promise<boolean> {
    return true; // Backend handles availability
  }

  async getVoices(_languageCode?: string): Promise<Voice[]> {
    return this.defaultVoices;
  }

  /**
   * LLM providers don't support boundary events (audio stream)
   */
  isBoundarySupported(): boolean {
    return false;
  }

  /**
   * Get current audio element (for real-time control)
   */
  getAudioElement(): HTMLAudioElement | null {
    return this.audio;
  }

  /**
   * Update playback rate in real-time
   */
  setPlaybackRate(rate: number): void {
    if (this.audio) {
      this.audio.playbackRate = rate;
    }
  }

  /**
   * Update volume in real-time
   */
  setVolume(volume: number): void {
    if (this.audio) {
      this.audio.volume = volume;
    }
  }

  /**
   * Pre-generate audio blob without playing it
   * Useful for buffering next chunk while current one plays
   */
  async pregenerate(text: string, options: SpeakOptions): Promise<Blob> {
    const apiBase = await getCachedApiBase();
    const voiceId = options.voice || this.defaultVoices[0]?.id || 'default';
    
    // Parse voice ID if it contains model info (e.g., "model:voice")
    let model = '';
    let voice = voiceId;
    if (voiceId.includes(':')) {
      [model, voice] = voiceId.split(':');
    }

    console.log(`🎬 ${this.name}: Pre-generating speech with ${this.backendProvider} (voice: ${voice}${model ? `, model: ${model}` : ''})`);

    const body: any = {
      provider: this.backendProvider,
      model: model || this.defaultVoices[0]?.provider || 'default',
      voice: voice || 'default',
      text,
      rate: options.rate || 1.0
    };

    // Include client-supplied API key when available so backend can use it
    if (this.apiKey) {
      body.apiKey = this.apiKey;
    }

    // Retry on 401 with fresh token
    let retries = 1;
    let lastError: Error | null = null;

    while (retries >= 0) {
      try {
        const authToken = googleAuth.getAccessToken() || '';

        const response = await fetch(`${apiBase}/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(body)
        });

        // Check for rate limit - don't retry, let fallback handle it
        if (response.status === 429) {
          const error = await response.text();
          console.warn(`⚠️ TTS Pre-gen: Rate limit hit (429), falling back to Browser Speech`);
          throw new Error(`Rate limit exceeded: ${error}`);
        }

        if (response.status === 401 && retries > 0) {
          console.log('🔄 TTS Pre-gen: Got 401, clearing token cache and retrying...');
          googleAuth.clearAccessToken(); // Clear cached token to force fresh read
          retries--;
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`${this.name} TTS pre-generation failed: ${error}`);
        }

        return await response.blob();

      } catch (error) {
        lastError = error as Error;
        if (retries > 0) {
          console.log(`⚠️ TTS Pre-gen: Request failed, retrying... (${retries} retries left)`);
          retries--;
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        throw lastError;
      }
    }

    if (lastError) throw lastError;
    throw new Error('Pre-generation failed');
  }

  async speak(text: string, options: SpeakOptions): Promise<void> {
    const apiBase = await getCachedApiBase();
    const voiceId = options.voice || this.defaultVoices[0]?.id || 'default';
    
    // Parse voice ID if it contains model info (e.g., "model:voice")
    let model = '';
    let voice = voiceId;
    if (voiceId.includes(':')) {
      [model, voice] = voiceId.split(':');
    }

    console.log(`🔊 ${this.name}: Generating speech with ${this.backendProvider} (voice: ${voice}${model ? `, model: ${model}` : ''})`);

    const body: any = {
      provider: this.backendProvider,
      model: model || this.defaultVoices[0]?.provider || 'default',
      voice: voice || 'default',
      text,
      rate: options.rate || 1.0
    };

    // Include client-supplied API key when available so backend can use it
    if (this.apiKey) {
      body.apiKey = this.apiKey;
    }

    // Option 1 + 2: Retry on 401 with fresh token
    let retries = 1; // Retry once on 401
    let lastError: Error | null = null;

    while (retries >= 0) {
      try {
        // Option 2: Use googleAuth.getAccessToken() instead of direct localStorage
        // This uses the in-memory cache which updates immediately on token refresh
        const authToken = googleAuth.getAccessToken() || '';

        const response = await fetch(`${apiBase}/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(body)
        });

        // Check for rate limit - don't retry, let fallback handle it
        if (response.status === 429) {
          const error = await response.text();
          console.warn(`⚠️ TTS: Rate limit hit (429), falling back to Browser Speech`);
          throw new Error(`Rate limit exceeded: ${error}`);
        }

        // Option 1: Retry on 401 (token refresh race condition)
        if (response.status === 401 && retries > 0) {
          console.log('🔄 TTS: Got 401, retrying with refreshed token...');
          retries--;
          // Brief delay to allow token refresh to complete
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`${this.name} TTS failed: ${error}`);
        }

        const audioBlob = await response.blob();
        
        // Stop any currently playing audio
        if (this.audio) {
          this.audio.pause();
          this.audio = null;
        }

        // Create and play audio element
        this.audio = new Audio(URL.createObjectURL(audioBlob));
        this.audio.playbackRate = options.rate || 1.0;
        this.audio.volume = options.volume ?? 1.0;

        if (options.onStart) {
          options.onStart();
        }

        this.audio.onended = () => {
          if (options.onEnd) {
            options.onEnd();
          }
          this.audio = null;
        };

        this.audio.onerror = (error) => {
          console.error(`${this.name} playback error:`, error);
          if (options.onError) {
            options.onError(new Error('Audio playback failed'));
          }
          this.audio = null;
        };

        await this.audio.play();

        // Some browsers or decoders may temporarily reset playbackRate during initial playback.
        // Re-apply the requested rate on the 'playing' event and also schedule a couple
        // of short delayed re-applications as a defensive workaround.
        const applyRequestedRate = () => {
          try {
            if (this.audio) this.audio.playbackRate = options.rate || 1.0;
          } catch (err) {
            // swallow - best-effort; mark variable used to satisfy linters
            void err;
          }
        };

        // Ensure rate is applied immediately and when 'playing' fires
        applyRequestedRate();
        const onPlaying = () => applyRequestedRate();
        this.audio.addEventListener('playing', onPlaying);

        // Schedule a couple of re-applications (0ms, 60ms, 250ms)
        this._playbackRateTimers.push(window.setTimeout(applyRequestedRate, 60));
        this._playbackRateTimers.push(window.setTimeout(applyRequestedRate, 250));

        // Log actual playback rate for debugging (some browsers may override)
        try {
          console.log(`${this.name} playback started - audio.playbackRate=${this.audio?.playbackRate}, requested rate=${options.rate}`);
        } catch (err) {
          console.warn(`${this.name} playback started - failed to read playbackRate`, err);
        }

        // Clean up the 'playing' listener when playback ends (or on stop())
        const cleanupPlayingListener = () => {
          try {
            this.audio?.removeEventListener('playing', onPlaying);
          } catch (_e) { void _e; }
        };

        const originalOnEnded = this.audio.onended;
        this.audio.onended = () => {
          cleanupPlayingListener();
          // clear timers
          this._playbackRateTimers.forEach(t => clearTimeout(t));
          this._playbackRateTimers = [];
          try {
            if (originalOnEnded) originalOnEnded.call(this.audio as any, new Event('ended'));
          } catch (_e) { void _e; }
        };

        return; // Success - exit retry loop

      } catch (error) {
        lastError = error as Error;
        if (retries > 0) {
          console.log(`⚠️ TTS: Request failed, retrying... (${retries} retries left)`);
          retries--;
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        // No more retries, throw the error
        throw lastError;
      }
    }

    // Should never reach here, but TypeScript needs it
    if (lastError) throw lastError;
  }

  /**
   * Play from a pre-generated audio blob
   * Used with pregenerate() for buffered playback
   */
  async playBlob(audioBlob: Blob, options: SpeakOptions, providedObjectUrl?: string): Promise<void> {
    // Stop any currently playing audio
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }

    // Create and play audio element. If an object URL was provided by the
    // caller (pregeneration path), reuse it instead of creating a new one so
    // ownership/revocation remains with the caller's buffer manager.
    let createdObjectUrl: string | undefined;
    const audioSrc = providedObjectUrl ?? (() => {
      try {
        const url = URL.createObjectURL(audioBlob);
        createdObjectUrl = url;
        return url;
      } catch (e) {
        // Fall back to empty string; audio playback will likely fail and be handled
        return '';
      }
    })();

    this.audio = new Audio(audioSrc);
    this.audio.playbackRate = options.rate || 1.0;
    this.audio.volume = options.volume ?? 1.0;

    if (options.onStart) {
      options.onStart();
    }

    this.audio.onended = () => {
      try {
        options.onEnd?.();
      } catch (_e) { void _e; }
      // If we created the object URL here, revoke it now. If an object URL
      // was provided by the caller (pregeneration), the caller is responsible
      // for revocation and we must NOT revoke it here.
      try {
        if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
      } catch (_e) { void _e; }
      this.audio = null;
    };

    this.audio.onerror = (error) => {
      console.error(`${this.name} playback error:`, error);
      try {
        options.onError?.(new Error('Audio playback failed'));
      } catch (_e) { void _e; }
      try {
        if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
      } catch (_e) { void _e; }
      this.audio = null;
    };

    await this.audio.play();
    // Re-apply requested rate defensively (see speak())
    const applyRequestedRate = () => {
      try {
        if (this.audio) this.audio.playbackRate = options.rate || 1.0;
  } catch (_err) { void _err; }
    };
    applyRequestedRate();
    const onPlaying = () => applyRequestedRate();
    this.audio.addEventListener('playing', onPlaying);
    this._playbackRateTimers.push(window.setTimeout(applyRequestedRate, 60));
    this._playbackRateTimers.push(window.setTimeout(applyRequestedRate, 250));

    // Log playback rate for buffered playback
    try {
      console.log(`${this.name} playBlob started - audio.playbackRate=${this.audio?.playbackRate}, requested rate=${options.rate}`);
    } catch (err) {
      console.warn(`${this.name} playBlob started - failed to read playbackRate`, err);
    }

    // wrap original onended to cleanup timers/listener
    const originalOnEnded = this.audio.onended;
    this.audio.onended = () => {
      try {
        this._playbackRateTimers.forEach(t => clearTimeout(t));
      } catch (_e) { void _e; }
      this._playbackRateTimers = [];
      try {
        if (originalOnEnded) originalOnEnded.call(this.audio as any, new Event('ended'));
      } catch (_e) { void _e; }
    };
  }

  stop() {
    if (this.audio) {
      // CRITICAL: Remove ALL event listeners BEFORE stopping to prevent callbacks
      try {
        this._playbackRateTimers.forEach(t => clearTimeout(t));
  } catch (_e) { void _e; }
      this._playbackRateTimers = [];

      this.audio.onended = null;
      this.audio.onerror = null;

      // Stop playback
      this.audio.pause();
      this.audio.currentTime = 0;

      // Revoke any blob: URL created by this provider to avoid leaks
      try {
        if (this.audio.src && this.audio.src.startsWith('blob:')) {
          URL.revokeObjectURL(this.audio.src);
        }
      } catch (_e) { void _e; }

      this.audio = null;
    }
  }

  cleanup() {
    this.stop();
  }
}

/**
 * OpenAI TTS Provider
 */
export class OpenAITTSProvider extends LLMTTSProvider {
  constructor(apiKey?: string) {
    super('OpenAI TTS', 'openai', [
      { id: 'tts-1:alloy', name: 'Alloy', language: 'en-US', gender: 'neutral', provider: 'openai-tts' },
      { id: 'tts-1:echo', name: 'Echo', language: 'en-US', gender: 'male', provider: 'openai-tts' },
      { id: 'tts-1:fable', name: 'Fable', language: 'en-GB', gender: 'male', provider: 'openai-tts' },
      { id: 'tts-1:onyx', name: 'Onyx', language: 'en-US', gender: 'male', provider: 'openai-tts' },
      { id: 'tts-1:nova', name: 'Nova', language: 'en-US', gender: 'female', provider: 'openai-tts' },
      { id: 'tts-1:shimmer', name: 'Shimmer', language: 'en-US', gender: 'female', provider: 'openai-tts' },
      { id: 'tts-1-hd:alloy', name: 'Alloy HD', language: 'en-US', gender: 'neutral', provider: 'openai-tts' },
      { id: 'tts-1-hd:echo', name: 'Echo HD', language: 'en-US', gender: 'male', provider: 'openai-tts' },
      { id: 'tts-1-hd:fable', name: 'Fable HD', language: 'en-GB', gender: 'male', provider: 'openai-tts' },
      { id: 'tts-1-hd:onyx', name: 'Onyx HD', language: 'en-US', gender: 'male', provider: 'openai-tts' },
      { id: 'tts-1-hd:nova', name: 'Nova HD', language: 'en-US', gender: 'female', provider: 'openai-tts' },
      { id: 'tts-1-hd:shimmer', name: 'Shimmer HD', language: 'en-US', gender: 'female', provider: 'openai-tts' },
    ], apiKey);
  }
}

/**
 * Groq TTS Provider (PlayAI)
 */
export class GroqTTSProvider extends LLMTTSProvider {
  constructor(apiKey?: string) {
    super('Groq TTS', 'groq', [
      // Female voices
      { id: 'Aaliyah-PlayAI', name: 'Aaliyah (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Adelaide-PlayAI', name: 'Adelaide (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Arista-PlayAI', name: 'Arista (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Celeste-PlayAI', name: 'Celeste (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Cheyenne-PlayAI', name: 'Cheyenne (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Deedee-PlayAI', name: 'Deedee (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Eleanor-PlayAI', name: 'Eleanor (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Gail-PlayAI', name: 'Gail (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Indigo-PlayAI', name: 'Indigo (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Jennifer-PlayAI', name: 'Jennifer (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Judy-PlayAI', name: 'Judy (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Mamaw-PlayAI', name: 'Mamaw (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Nia-PlayAI', name: 'Nia (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      { id: 'Ruby-PlayAI', name: 'Ruby (Female)', language: 'en-US', gender: 'female', provider: 'groq-tts' },
      // Male voices
      { id: 'Angelo-PlayAI', name: 'Angelo (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Atlas-PlayAI', name: 'Atlas (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Basil-PlayAI', name: 'Basil (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Briggs-PlayAI', name: 'Briggs (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Calum-PlayAI', name: 'Calum (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Chip-PlayAI', name: 'Chip (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Cillian-PlayAI', name: 'Cillian (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Fritz-PlayAI', name: 'Fritz (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Mason-PlayAI', name: 'Mason (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Mikail-PlayAI', name: 'Mikail (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Mitch-PlayAI', name: 'Mitch (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Quinn-PlayAI', name: 'Quinn (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
      { id: 'Thunder-PlayAI', name: 'Thunder (Male)', language: 'en-US', gender: 'male', provider: 'groq-tts' },
    ], apiKey);
  }
}

/**
 * Gemini TTS Provider (Google Cloud TTS)
 */
export class GeminiTTSProvider extends LLMTTSProvider {
  constructor(apiKey?: string) {
    super('Gemini TTS', 'gemini', [
      // Neural2 voices (highest quality)
      { id: 'en-US-Neural2-A', name: 'Neural2 Male A (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      { id: 'en-US-Neural2-C', name: 'Neural2 Female C (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
      { id: 'en-US-Neural2-D', name: 'Neural2 Male D (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      { id: 'en-US-Neural2-E', name: 'Neural2 Female E (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
      { id: 'en-US-Neural2-F', name: 'Neural2 Female F (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
      { id: 'en-US-Neural2-G', name: 'Neural2 Female G (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
      { id: 'en-US-Neural2-H', name: 'Neural2 Female H (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
      { id: 'en-US-Neural2-I', name: 'Neural2 Male I (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      { id: 'en-US-Neural2-J', name: 'Neural2 Male J (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      // Wavenet voices (good quality)
      { id: 'en-US-Wavenet-A', name: 'Wavenet Male A (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      { id: 'en-US-Wavenet-B', name: 'Wavenet Male B (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      { id: 'en-US-Wavenet-C', name: 'Wavenet Female C (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
      { id: 'en-US-Wavenet-D', name: 'Wavenet Male D (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      { id: 'en-US-Wavenet-E', name: 'Wavenet Female E (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
      { id: 'en-US-Wavenet-F', name: 'Wavenet Female F (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
      // Standard voices (basic quality, cheaper)
      { id: 'en-US-Standard-A', name: 'Standard Male A (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      { id: 'en-US-Standard-B', name: 'Standard Male B (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      { id: 'en-US-Standard-C', name: 'Standard Female C (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
      { id: 'en-US-Standard-D', name: 'Standard Male D (US)', language: 'en-US', gender: 'male', provider: 'gemini-tts' },
      { id: 'en-US-Standard-E', name: 'Standard Female E (US)', language: 'en-US', gender: 'female', provider: 'gemini-tts' },
    ], apiKey);
  }
}

/**
 * OpenRouter TTS Provider (Chatterbox, Speech-02, Kokoro, F5-TTS)
 */
export class OpenRouterTTSProvider extends LLMTTSProvider {
  constructor(apiKey?: string) {
    super('OpenRouter TTS', 'openrouter', [
      // Minimax Speech-02 Turbo (low latency)
      { id: 'minimax/speech-02-turbo:female-en', name: 'Speech-02 Turbo Female (EN)', language: 'en-US', gender: 'female', provider: 'openrouter-tts' },
      { id: 'minimax/speech-02-turbo:male-en', name: 'Speech-02 Turbo Male (EN)', language: 'en-US', gender: 'male', provider: 'openrouter-tts' },
      // Minimax Speech-02 HD (high fidelity)
      { id: 'minimax/speech-02-hd:female-en', name: 'Speech-02 HD Female (EN)', language: 'en-US', gender: 'female', provider: 'openrouter-tts' },
      { id: 'minimax/speech-02-hd:male-en', name: 'Speech-02 HD Male (EN)', language: 'en-US', gender: 'male', provider: 'openrouter-tts' },
      // Resemble AI Chatterbox (emotion control, voice cloning)
      { id: 'resemble-ai/chatterbox:female', name: 'Chatterbox Female', language: 'en-US', gender: 'female', provider: 'openrouter-tts' },
      { id: 'resemble-ai/chatterbox:male', name: 'Chatterbox Male', language: 'en-US', gender: 'male', provider: 'openrouter-tts' },
      // Kokoro 82M (budget, lightweight)
      { id: 'jaaari/kokoro-82m:female', name: 'Kokoro Female (Budget)', language: 'en-US', gender: 'female', provider: 'openrouter-tts' },
      { id: 'jaaari/kokoro-82m:male', name: 'Kokoro Male (Budget)', language: 'en-US', gender: 'male', provider: 'openrouter-tts' },
      // F5-TTS (voice cloning)
      { id: 'x-lance/f5-tts:default', name: 'F5-TTS (Voice Clone)', language: 'en-US', gender: 'neutral', provider: 'openrouter-tts' },
    ], apiKey);
  }
}
