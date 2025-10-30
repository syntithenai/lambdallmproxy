/**
 * Chatterbox TTS Provider
 * 
 * Provides TTS using a local Chatterbox TTS Server running in Docker.
 * Supports high-quality neural TTS with GPU acceleration.
 * 
 * Default endpoint: http://localhost:8000
 * API: POST /api/tts with JSON body: { text, language, speaker_id }
 */

import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';

export class ChatterboxTTSProvider implements TTSProvider {
  name = 'Chatterbox TTS (Local)';
  private baseUrl: string;
  private audioElement: HTMLAudioElement | null = null;
  private cachedVoices: Voice[] | null = null;

  constructor(baseUrl: string = 'http://localhost:8000') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Use 'no-cors' mode to prevent CORS errors in console
      // Since this is just a health check for an optional service, we don't need to read the response
      await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
        mode: 'no-cors' // Prevents CORS errors in console when service is unavailable
      });
      // With no-cors mode, we can't check response.ok, but we can check if the fetch succeeded
      // If the fetch completes without throwing, the service is likely available
      return true;
    } catch (error) {
      // Silently fail - Chatterbox TTS is optional and may not be running
      // Only log in development mode if needed for debugging
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_TTS) {
        console.warn('Chatterbox TTS Server not available:', error);
      }
      return false;
    }
  }

  async getVoices(): Promise<Voice[]> {
    // Return cached voices if available
    if (this.cachedVoices) {
      return this.cachedVoices;
    }

    try {
      // Try to fetch available speakers from the API
      const response = await fetch(`${this.baseUrl}/api/speakers`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        this.cachedVoices = this.parseVoicesFromAPI(data);
        return this.cachedVoices;
      }
    } catch (error) {
      console.warn('Failed to fetch Chatterbox speakers, using defaults:', error);
    }

    // Fallback to default voices
    this.cachedVoices = this.getDefaultVoices();
    return this.cachedVoices;
  }

  private parseVoicesFromAPI(data: any): Voice[] {
    // Parse API response - adapt based on actual Chatterbox API format
    if (Array.isArray(data.speakers)) {
      return data.speakers.map((speaker: any, index: number) => ({
        id: speaker.id || `speaker_${index}`,
        name: speaker.name || `Speaker ${index + 1}`,
        language: speaker.language || 'en',
        gender: speaker.gender || 'neutral',
        provider: 'chatterbox'
      }));
    }
    return this.getDefaultVoices();
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

      // Call Chatterbox TTS API
      const response = await fetch(`${this.baseUrl}/api/tts`, {
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
