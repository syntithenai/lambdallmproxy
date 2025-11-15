/**
 * Chatterbox TTS Provider
 * 
 * Provides TTS using a local Chatterbox TTS Server running in Docker.
 * Supports high-quality neural TTS with GPU acceleration.
 * 
 * Default endpoint: http://localhost:8001 (port 8001 to avoid conflict with Whisper on 8000)
 * API: POST /api/tts with JSON body: { text, language, speaker_id }
 */

/* eslint-disable no-console */
 
import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';

export class ChatterboxTTSProvider implements TTSProvider {
  name = 'Chatterbox TTS (Local)';
  private baseUrl: string;
  private audioElement: HTMLAudioElement | null = null;
  private cachedVoices: Voice[] | null = null;

  constructor(baseUrl: string = 'http://localhost:8001') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  async isAvailable(): Promise<boolean> {
    try {
      console.log(`🔍 [Chatterbox] Testing availability at ${this.baseUrl}/speech...`);
      // Check if Chatterbox server is running by attempting a minimal test request
      // The server may be slow to respond during model loading, so we use a generous timeout
      const response = await fetch(`${this.baseUrl}/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'test',
          language: 'en',
          speaker_id: 'en_default'
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout for model loading
      });
      
      console.log(`✅ [Chatterbox] Server responded with status: ${response.status}`);
      // If we get any response (even an error), the server is available
      return response.status !== 0;
    } catch (error) {
      console.error('❌ [Chatterbox] TTS Server not available:', error);
      return false;
    }
  }

  /**
   * Chatterbox doesn't support boundary events (audio stream)
   */
  isBoundarySupported(): boolean {
    return false;
  }

  async getVoices(_languageCode?: string): Promise<Voice[]> {
    // Return cached voices if available
    if (this.cachedVoices) {
      return this.cachedVoices;
    }

    // TODO: TTS provider capabilities should come from the backend /billing endpoint
    // to match the architecture used for image generation providers.
    // For now, just return default voices to avoid direct HTTP calls and CORS errors.
    this.cachedVoices = this.getDefaultVoices();
    return this.cachedVoices;
  }

  private getDefaultVoices(): Voice[] {
    // Default voices for common languages
    return [
      { id: 'en_default', name: 'English (Default)', language: 'en', gender: 'neutral', provider: 'chatterbox' },
      { id: 'en_male', name: 'English (Male)', language: 'en', gender: 'male', provider: 'chatterbox' },
      { id: 'en_female', name: 'English (Female)', language: 'en', gender: 'female', provider: 'chatterbox' },
      { id: 'es_default', name: 'Spanish (Default)', language: 'es', gender: 'neutral', provider: 'chatterbox' },
      { id: 'fr_default', name: 'French (Default)', language: 'fr', gender: 'neutral', provider: 'chatterbox' },
      { id: 'de_default', name: 'German (Default)', language: 'de', gender: 'neutral', provider: 'chatterbox' },
      { id: 'it_default', name: 'Italian (Default)', language: 'it', gender: 'neutral', provider: 'chatterbox' },
      { id: 'pt_default', name: 'Portuguese (Default)', language: 'pt', gender: 'neutral', provider: 'chatterbox' },
      { id: 'ru_default', name: 'Russian (Default)', language: 'ru', gender: 'neutral', provider: 'chatterbox' },
      { id: 'zh_default', name: 'Chinese (Default)', language: 'zh', gender: 'neutral', provider: 'chatterbox' },
      { id: 'ja_default', name: 'Japanese (Default)', language: 'ja', gender: 'neutral', provider: 'chatterbox' },
      { id: 'ko_default', name: 'Korean (Default)', language: 'ko', gender: 'neutral', provider: 'chatterbox' }
    ];
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for TTS');
    }

    try {
      options.onStart?.();

      // Extract language from voice ID or default to 'en'
      const language = options.voice?.split('_')[0] || 'en';
      const speakerId = options.voice || 'en_default';

      // Call Chatterbox TTS API (endpoint is /speech, not /api/tts)
      const response = await fetch(`${this.baseUrl}/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text.trim(),
          language,
          speaker_id: speakerId,
          speed: options.rate || 1.0
        }),
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chatterbox TTS API error: ${response.status} ${errorText}`);
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Play audio
      await this.playAudio(audioUrl, options);

      options.onEnd?.();

      // Cleanup
      URL.revokeObjectURL(audioUrl);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Chatterbox TTS error:', errorMessage);
      options.onError?.(new Error(`Failed to generate speech: ${errorMessage}`));
      throw error;
    }
  }

  private playAudio(audioUrl: string, options: SpeakOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      // Stop any existing audio
      this.stop();

      // Create new audio element
      this.audioElement = new Audio(audioUrl);
      
      // Set volume
      if (options.volume !== undefined) {
        this.audioElement.volume = Math.max(0, Math.min(1, options.volume));
      }

      // Set playback rate (speed)
      if (options.rate !== undefined) {
        this.audioElement.playbackRate = Math.max(0.5, Math.min(2.0, options.rate));
      }

      // Event handlers
      this.audioElement.onended = () => {
        resolve();
      };

      this.audioElement.onerror = () => {
        const error = new Error('Audio playback failed');
        reject(error);
      };

      // Start playback
      this.audioElement.play().catch(reject);
    });
  }

  stop(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement = null;
    }
  }

  pause(): void {
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }
  }

  resume(): void {
    if (this.audioElement && this.audioElement.paused) {
      this.audioElement.play().catch(error => {
        console.error('Failed to resume audio:', error);
      });
    }
  }

  cleanup(): void {
    this.stop();
    this.cachedVoices = null;
  }
}
