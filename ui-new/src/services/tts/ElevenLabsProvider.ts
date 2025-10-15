/**
 * ElevenLabs TTS Provider Implementation
 * 
 * Specialized TTS service with high-quality AI voices
 * Requires separate API key authentication
 */

import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';

export class ElevenLabsProvider implements TTSProvider {
  public name = 'elevenlabs';
  private apiKey: string;
  private audio: HTMLAudioElement | null = null;
  private cachedVoices: Voice[] | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
    this.cachedVoices = null; // Reset cache when API key changes
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async getVoices(): Promise<Voice[]> {
    if (this.cachedVoices) {
      return this.cachedVoices;
    }

    if (!this.apiKey) {
      return [];
    }

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch ElevenLabs voices:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      
      this.cachedVoices = data.voices.map((v: any) => ({
        id: v.voice_id,
        name: v.name,
        language: v.labels?.language || 'en',
        gender: this.detectGender(v.name, v.labels),
        provider: 'elevenlabs'
      }));

      return this.cachedVoices!;
    } catch (error) {
      console.error('Failed to fetch ElevenLabs voices:', error);
      return [];
    }
  }

  private detectGender(name: string, labels: any): 'male' | 'female' | 'neutral' {
    // Use labels if available
    if (labels?.gender) {
      return labels.gender.toLowerCase();
    }

    // Common ElevenLabs voice name patterns
    const nameLower = name.toLowerCase();
    
    // Known female voices
    if (nameLower.includes('bella') || 
        nameLower.includes('elli') || 
        nameLower.includes('rachel') || 
        nameLower.includes('domi') ||
        nameLower.includes('sarah') ||
        nameLower.includes('nicole') ||
        nameLower.includes('female')) {
      return 'female';
    }
    
    // Known male voices
    if (nameLower.includes('adam') || 
        nameLower.includes('antoni') || 
        nameLower.includes('arnold') || 
        nameLower.includes('josh') ||
        nameLower.includes('sam') ||
        nameLower.includes('male')) {
      return 'male';
    }
    
    return 'neutral';
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    // Get available voices to ensure voice exists
    const voices = await this.getVoices();
    let voiceId = options.voice;
    
    // Use first available voice if none specified or invalid
    if (!voiceId || !voices.find(v => v.id === voiceId)) {
      if (voices.length === 0) {
        throw new Error('No ElevenLabs voices available');
      }
      voiceId = voices[0].id;
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorData.detail || response.statusText}`);
      }

      const audioBlob = await response.blob();
      return this.playAudio(audioBlob, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`ElevenLabs TTS failed: ${errorMessage}`);
    }
  }

  private async playAudio(audioBlob: Blob, options: SpeakOptions): Promise<void> {
    const audioUrl = URL.createObjectURL(audioBlob);
    this.audio = new Audio(audioUrl);
    this.audio.volume = options.volume || 1.0;

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
        resolve();
      };
      this.audio.onerror = () => {
        const error = new Error('Audio playback failed');
        options.onError?.(error);
        URL.revokeObjectURL(audioUrl);
        this.audio = null;
        reject(error);
      };

      this.audio.play().catch((playError) => {
        const error = new Error(`Failed to start audio playback: ${playError.message}`);
        options.onError?.(error);
        URL.revokeObjectURL(audioUrl);
        this.audio = null;
        reject(error);
      });
    });
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      // Clean up blob URL to prevent memory leaks
      if (this.audio.src && this.audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.audio.src);
      }
      this.audio = null;
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
    // Clear cached voices to free memory
    this.cachedVoices = null;
  }
}