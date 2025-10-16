/**
 * LLM Provider TTS Implementation
 * 
 * Uses existing LLM provider configuration for text-to-speech
 * Supports OpenAI TTS API and Google Cloud TTS API
 */

import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';
import type { ProviderConfig } from '../../types/provider';
import { base64ToBlob } from '../../utils/textPreprocessing';

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
    const supportedTypes = ['openai', 'gemini', 'gemini-free', 'groq-free', 'together'];
    return supportedTypes.includes(this.provider.type);
  }

  async getVoices(): Promise<Voice[]> {
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
      case 'gemini-free':
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
      
      case 'groq-free':
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

    let audioBlob: Blob;

    if (this.provider.type === 'openai') {
      audioBlob = await this.speakWithOpenAI(text, options);
    } else if (this.provider.type === 'gemini' || this.provider.type === 'gemini-free') {
      audioBlob = await this.speakWithGoogle(text, options);
    } else if (this.provider.type === 'groq-free') {
      audioBlob = await this.speakWithGroq(text, options);
    } else if (this.provider.type === 'together') {
      audioBlob = await this.speakWithTogether(text, options);
    } else {
      throw new Error(`TTS not supported for provider type: ${this.provider.type}. Supported providers: OpenAI, Gemini, Groq`);
    }

    // Play the audio
    return this.playAudio(audioBlob, options);
  }

  private async speakWithOpenAI(text: string, options: SpeakOptions): Promise<Blob> {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.provider!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: options.voice || 'alloy',
        speed: options.rate || 1.0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS API error: ${response.status} - ${errorText}`);
    }

    return await response.blob();
  }

  private async speakWithGoogle(text: string, options: SpeakOptions): Promise<Blob> {
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.provider!.apiKey
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'en-US',
          name: options.voice || 'en-US-Neural2-A'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: options.rate || 1.0,
          pitch: ((options.pitch || 1.0) - 1.0) * 20 // Convert 0.5-2.0 to -10 to +20
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google TTS API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return base64ToBlob(data.audioContent, 'audio/mp3');
  }

  private async speakWithGroq(text: string, options: SpeakOptions): Promise<Blob> {
    const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.provider!.apiKey}`
      },
      body: JSON.stringify({
        model: 'playai-tts',
        input: text,
        voice: options.voice || 'Jennifer-PlayAI', // Use valid PlayAI voice as default
        response_format: 'mp3',
        speed: options.rate || 1.0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq TTS API error: ${response.status} - ${errorText}`);
    }

    return await response.blob();
  }

  private async speakWithTogether(_text: string, _options: SpeakOptions): Promise<Blob> {
    // Note: Together AI does not appear to have a native TTS API
    // This is a placeholder implementation - may need to fallback to another provider
    throw new Error('Together AI TTS API is not currently available. Please use a different provider.');
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