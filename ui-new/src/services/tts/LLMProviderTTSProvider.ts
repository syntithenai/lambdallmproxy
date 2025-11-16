/**
 * LLM Provider TTS Implementation
 * 
 * Uses existing LLM provider configuration for text-to-speech
 * Supports OpenAI TTS API and Google Cloud TTS API
 */

 

/* eslint-disable @typescript-eslint/no-unused-vars */

import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';
import type { ProviderConfig } from '../../types/provider';
import { googleAuth } from '../googleAuth';

export class LLMProviderTTSProvider implements TTSProvider {
  public name = 'llm';
  private provider: ProviderConfig | null = null;
  private audio: HTMLAudioElement | null = null;
  private currentOnEnd: (() => void) | null = null;

  constructor(provider?: ProviderConfig) {
    this.provider = provider || null;
  }

  setProvider(provider: ProviderConfig) {
    this.provider = provider;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.provider) return false;
    
    // Check if the provider supports TTS
    const supportedTypes = ['openai', 'gemini', 'groq', 'together'];
    return supportedTypes.includes(this.provider.type);
  }

  async getVoices(_languageCode?: string): Promise<Voice[]> {
    if (!this.provider) return [];

    switch (this.provider.type) {
      case 'openai':
        return [
          { id: 'alloy', name: 'Alloy', language: 'en', gender: 'neutral', provider: 'openai' },
          { id: 'echo', name: 'Echo', language: 'en', gender: 'male', provider: 'openai' },
          { id: 'fable', name: 'Fable', language: 'en', gender: 'neutral', provider: 'openai' },
          { id: 'onyx', name: 'Onyx', language: 'en', gender: 'male', provider: 'openai' },
          { id: 'nova', name: 'Nova', language: 'en', gender: 'female', provider: 'openai' },
          { id: 'shimmer', name: 'Shimmer', language: 'en', gender: 'female', provider: 'openai' },
        ];
      
      case 'gemini':
        return [
          // Neural2 voices (premium)
          { id: 'en-US-Neural2-A', name: 'Neural2 A (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          { id: 'en-US-Neural2-C', name: 'Neural2 C (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Neural2-D', name: 'Neural2 D (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          { id: 'en-US-Neural2-E', name: 'Neural2 E (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Neural2-F', name: 'Neural2 F (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Neural2-G', name: 'Neural2 G (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Neural2-H', name: 'Neural2 H (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Neural2-I', name: 'Neural2 I (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          { id: 'en-US-Neural2-J', name: 'Neural2 J (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          // WaveNet voices (premium)
          { id: 'en-US-Wavenet-A', name: 'WaveNet A (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          { id: 'en-US-Wavenet-B', name: 'WaveNet B (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          { id: 'en-US-Wavenet-C', name: 'WaveNet C (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Wavenet-D', name: 'WaveNet D (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          { id: 'en-US-Wavenet-E', name: 'WaveNet E (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Wavenet-F', name: 'WaveNet F (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          // Standard voices (basic)
          { id: 'en-US-Standard-A', name: 'Standard A (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          { id: 'en-US-Standard-B', name: 'Standard B (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          { id: 'en-US-Standard-C', name: 'Standard C (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Standard-D', name: 'Standard D (Male)', language: 'en-US', gender: 'male', provider: 'google' },
        ];
      
      case 'groq':
        return [
          { id: 'Aaliyah-PlayAI', name: 'Aaliyah', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Adelaide-PlayAI', name: 'Adelaide', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Angelo-PlayAI', name: 'Angelo', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Arista-PlayAI', name: 'Arista', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Atlas-PlayAI', name: 'Atlas', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Basil-PlayAI', name: 'Basil', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Briggs-PlayAI', name: 'Briggs', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Calum-PlayAI', name: 'Calum', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Celeste-PlayAI', name: 'Celeste', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Cheyenne-PlayAI', name: 'Cheyenne', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Chip-PlayAI', name: 'Chip', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Cillian-PlayAI', name: 'Cillian', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Deedee-PlayAI', name: 'Deedee', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Eleanor-PlayAI', name: 'Eleanor', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Fritz-PlayAI', name: 'Fritz', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Gail-PlayAI', name: 'Gail', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Indigo-PlayAI', name: 'Indigo', language: 'en-US', gender: 'neutral', provider: 'groq' },
          { id: 'Jennifer-PlayAI', name: 'Jennifer', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Judy-PlayAI', name: 'Judy', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Mamaw-PlayAI', name: 'Mamaw', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Mason-PlayAI', name: 'Mason', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Mikail-PlayAI', name: 'Mikail', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Mitch-PlayAI', name: 'Mitch', language: 'en-US', gender: 'male', provider: 'groq' },
          { id: 'Nia-PlayAI', name: 'Nia', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Quinn-PlayAI', name: 'Quinn', language: 'en-US', gender: 'neutral', provider: 'groq' },
          { id: 'Ruby-PlayAI', name: 'Ruby', language: 'en-US', gender: 'female', provider: 'groq' },
          { id: 'Thunder-PlayAI', name: 'Thunder', language: 'en-US', gender: 'male', provider: 'groq' },
        ];
      
      case 'together':
        // Together AI does not provide TTS API - return empty array
        return [];
      
      default:
        return [];
    }
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    if (!this.provider) {
      throw new Error('No provider configured for TTS');
    }

    // Stop any currently playing audio before starting new speech
    console.log('LLMProviderTTSProvider: speak() called, stopping any existing audio');
    this.stop();

    // Use proxy endpoint for TTS to enable logging
    const audioBlob = await this.speakViaProxy(text, options);

    // Play the audio
    return this.playAudio(audioBlob, options);
  }

  /**
   * Speak via Lambda proxy endpoint for comprehensive logging
   */
  private async speakViaProxy(text: string, options: SpeakOptions): Promise<Blob> {
    // Get API base URL (local or remote)
    const apiBase = await this.getApiBase();
    
    // Map provider type to proxy provider name
    let providerName: string = this.provider!.type;
    if (providerName === 'gemini') {
      providerName = 'google';
    } else if (providerName === 'groq') {
      providerName = 'groq';
    }
    
    // Option 1 + 2: Retry on 401 with fresh token
    let retries = 1;
    let lastError: Error | null = null;

    while (retries >= 0) {
      try {
        // Option 2: Use googleAuth.getAccessToken() instead of direct localStorage
        const authToken = googleAuth.getAccessToken();
        if (!authToken) {
          throw new Error('Authentication required. Please sign in.');
        }

        const response = await fetch(`${apiBase}/tts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider: providerName,
            text,
            voice: options.voice,
            rate: options.rate || 1.0,
            model: providerName === 'openai' ? 'tts-1' : undefined,
            apiKey: this.provider!.apiKey // Pass API key for backend to use
          }),
        });

        // Check for rate limit - don't retry, let fallback handle it
        if (response.status === 429) {
          const errorText = await response.text();
          console.warn(`⚠️ LLM Provider TTS: Rate limit hit (429), falling back to Browser Speech`);
          throw new Error(`Rate limit exceeded: ${errorText}`);
        }

        // Option 1: Retry on 401 (token refresh race condition)
        if (response.status === 401 && retries > 0) {
          console.log('🔄 LLM Provider TTS: Got 401, retrying with refreshed token...');
          retries--;
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`TTS Proxy API error: ${response.status} - ${errorText}`);
        }

        return await response.blob();

      } catch (error) {
        lastError = error as Error;
        if (retries > 0) {
          console.log(`⚠️ LLM Provider TTS: Request failed, retrying... (${retries} retries left)`);
          retries--;
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        throw lastError;
      }
    }

    // Should never reach here, but TypeScript needs it
    if (lastError) throw lastError;
    throw new Error('Unexpected error in retry loop');
  }

  /**
   * Get API base URL (check for local dev server first)
   */
  private async getApiBase(): Promise<string> {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const localUrl = 'http://localhost:3000';
      try {
        // Try a simple OPTIONS request to check if server is responding
        const response = await fetch(localUrl, { 
          method: 'OPTIONS',
          signal: AbortSignal.timeout(500)
        });
        // Accept any response as indication server is running
        if (response.status !== undefined) {
          console.log('🏠 Using local Lambda server for TTS');
          return localUrl;
        }
      } catch (err) {
        // Local Lambda not available, fall through to remote
      }
    }
    // Use remote Lambda
    return import.meta.env.VITE_API || 
           'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';
  }

  private async playAudio(audioBlob: Blob, options: SpeakOptions): Promise<void> {
    const audioUrl = URL.createObjectURL(audioBlob);
    this.audio = new Audio(audioUrl);
    this.audio.volume = options.volume || 1.0;

    // Store the onEnd callback so stop() can trigger it
    this.currentOnEnd = options.onEnd || null;

    return new Promise((resolve, reject) => {
      if (!this.audio) {
        reject(new Error('Audio element not available'));
        return;
      }

      this.audio.onplay = () => options.onStart?.();
      this.audio.onended = () => {
        options.onEnd?.();
        URL.revokeObjectURL(audioUrl);
        this.audio = null;
        this.currentOnEnd = null;
        resolve();
      };
      this.audio.onerror = () => {
        const error = new Error('Audio playback failed');
        options.onError?.(error);
        URL.revokeObjectURL(audioUrl);
        this.audio = null;
        this.currentOnEnd = null;
        reject(error);
      };

      this.audio.play().catch((playError) => {
        const error = new Error(`Failed to start audio playback: ${playError.message}`);
        options.onError?.(error);
        URL.revokeObjectURL(audioUrl);
        this.audio = null;
        this.currentOnEnd = null;
        reject(error);
      });
    });
  }

  stop(): void {
    console.log('LLMProviderTTSProvider: stop() called', { hasAudio: !!this.audio });
    
    if (this.audio) {
      console.log('LLMProviderTTSProvider: Stopping audio', {
        paused: this.audio.paused,
        currentTime: this.audio.currentTime,
        duration: this.audio.duration,
        src: this.audio.src?.substring(0, 50)
      });
      
      // Remove all event listeners first to prevent them from interfering
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.oncanplaythrough = null;
      
      // Force stop the audio
      this.audio.pause();
      this.audio.currentTime = 0;
      
      // Store the audio reference before nulling it
      const audioToCleanup = this.audio;
      this.audio = null;
      
      // Clean up blob URL to prevent memory leaks
      if (audioToCleanup.src && audioToCleanup.src.startsWith('blob:')) {
        console.log('LLMProviderTTSProvider: Revoking blob URL');
        URL.revokeObjectURL(audioToCleanup.src);
        audioToCleanup.src = '';
      }
      
      // Try to completely remove the audio element
      try {
        audioToCleanup.remove();
      } catch (e) {
        console.warn('Failed to remove audio element:', e);
      }
      
      console.log('LLMProviderTTSProvider: Audio stopped and cleaned up');
      
      // Trigger onEnd callback to reset TTS state
      if (this.currentOnEnd) {
        console.log('LLMProviderTTSProvider: Triggering onEnd callback');
        const callback = this.currentOnEnd;
        this.currentOnEnd = null;
        callback();
      }
    } else {
      console.log('LLMProviderTTSProvider: No audio to stop');
    }
  }

  pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
  }

  resume(): void {
    if (this.audio && this.audio.paused) {
      this.audio.play().catch(console.error);
    }
  }

  cleanup(): void {
    this.stop(); // This will clean up audio and URLs
  }
}