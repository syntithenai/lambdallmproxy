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
  private currentOnEnd: (() => void) | null = null;

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
      // Use proxy endpoint for comprehensive logging
      const audioBlob = await this.speakViaProxy(text, voiceId, options);
      return this.playAudio(audioBlob, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`ElevenLabs TTS failed: ${errorMessage}`);
    }
  }

  /**
   * Speak via Lambda proxy endpoint for comprehensive logging
   */
  private async speakViaProxy(text: string, voiceId: string, options: SpeakOptions): Promise<Blob> {
    // Get API base URL (local or remote)
    const apiBase = await this.getApiBase();
    
    // Get auth token from localStorage
    const authToken = localStorage.getItem('google_id_token');
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
        provider: 'elevenlabs',
        text,
        voice: voiceId,
        rate: options.rate || 1.0,
        apiKey: this.apiKey // Pass API key for backend to use
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS Proxy API error: ${response.status} - ${errorText}`);
    }

    return await response.blob();
  }

  /**
   * Get API base URL (check for local dev server first)
   */
  private async getApiBase(): Promise<string> {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const localUrl = 'http://localhost:3000';
      try {
        const response = await fetch(`${localUrl}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(1000)
        });
        if (response.ok) {
          console.log('🏠 Using local Lambda server for TTS');
          return localUrl;
        }
      } catch (err) {
        // Local Lambda not available, fall through to remote
      }
    }
    // Use remote Lambda
    return import.meta.env.VITE_API_BASE || 
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
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      // Clean up blob URL to prevent memory leaks
      if (this.audio.src && this.audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.audio.src);
      }
      this.audio = null;
      
      // Trigger onEnd callback to reset TTS state
      if (this.currentOnEnd) {
        console.log('ElevenLabsProvider: stop() triggering onEnd callback');
        this.currentOnEnd();
        this.currentOnEnd = null;
      }
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