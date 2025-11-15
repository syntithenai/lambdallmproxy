/**
 * ElevenLabs TTS Provider Implementation
 * 
 * Specialized TTS service with high-quality AI voices
 * Requires separate API key authentication
 */

/* eslint-disable no-console */

/*
  NOTE: The following list contains ElevenLabs public voice IDs (not secrets).
  The repository's secret detector flags high-entropy strings; these are public identifiers
  provided by ElevenLabs and safe to keep in source. We disable the no-secrets rule
  for this file to avoid false positives.
  */
/* eslint-disable no-secrets/no-secrets */

/* eslint-disable @typescript-eslint/no-unused-vars */
import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';
import { googleAuth } from '../googleAuth';

/**
 * Pre-made ElevenLabs voices (as of November 2025)
 * These are available to all users with an ElevenLabs API key
 */
const ELEVENLABS_PREMADE_VOICES: Voice[] = [
  // Female voices
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
  { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', language: 'en-GB', gender: 'female', provider: 'elevenlabs' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
  { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
  { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
  { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', language: 'en-SE', gender: 'female', provider: 'elevenlabs' },
  
  // Male voices
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  { id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', language: 'en-GB', gender: 'male', provider: 'elevenlabs' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', language: 'en-AU', gender: 'male', provider: 'elevenlabs' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'George', language: 'en-GB', gender: 'male', provider: 'elevenlabs' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Clyde', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'Daniel', language: 'en-GB', gender: 'male', provider: 'elevenlabs' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Liam', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  { id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  
  // Neutral/Character voices
  { id: 'flq6f7yk4E4fJM5XTYuZ', name: 'Michael', language: 'en-US', gender: 'neutral', provider: 'elevenlabs' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Emily', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
  { id: 'g5CIjZEefAph4nQFvHAz', name: 'Ethan', language: 'en-US', gender: 'male', provider: 'elevenlabs' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', language: 'en-US', gender: 'female', provider: 'elevenlabs' },
];

export class ElevenLabsProvider implements TTSProvider {
  public name = 'elevenlabs';
  private apiKey: string;
  private audio: HTMLAudioElement | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async getVoices(_languageCode?: string): Promise<Voice[]> {
    // Always return the fixed list of 27 pre-made voices
    // No API call needed - these voices are always available with any ElevenLabs API key
    return ELEVENLABS_PREMADE_VOICES;
  }

  /**
   * ElevenLabs doesn't support boundary events (audio stream)
   */
  isBoundarySupported(): boolean {
    return false;
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
            provider: 'elevenlabs',
            text,
            voice: voiceId,
            rate: options.rate || 1.0,
            apiKey: this.apiKey // Pass API key for backend to use
          }),
        });

        // Check for rate limit - don't retry, let fallback handle it
        if (response.status === 429) {
          const errorText = await response.text();
          console.warn(`⚠️ ElevenLabs TTS: Rate limit hit (429), falling back to Browser Speech`);
          throw new Error(`Rate limit exceeded: ${errorText}`);
        }

        // Option 1: Retry on 401 (token refresh race condition)
        if (response.status === 401 && retries > 0) {
          console.log('🔄 ElevenLabs TTS: Got 401, retrying with refreshed token...');
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
          console.log(`⚠️ ElevenLabs TTS: Request failed, retrying... (${retries} retries left)`);
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
    this.audio.playbackRate = options.rate || 1.0;  // Set rate immediately
    this.audio.volume = options.volume ?? 1.0;

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
      // CRITICAL: Remove ALL event listeners BEFORE pausing to prevent callbacks
      this.audio.onplay = null;
      this.audio.onended = null;
      this.audio.onerror = null;
      
      // Now safe to stop
      this.audio.pause();
      this.audio.currentTime = 0;
      
      // Clean up blob URL to prevent memory leaks
      if (this.audio.src && this.audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.audio.src);
      }
      this.audio = null;
    }
  }

  /**
   * Update playback rate in real-time
   */
  setPlaybackRate(rate: number): void {
    if (this.audio) {
      this.audio.playbackRate = rate;
      console.log(`🎚️ ElevenLabsProvider: Set playback rate to ${rate}`);
    }
  }

  /**
   * Update volume in real-time
   */
  setVolume(volume: number): void {
    if (this.audio) {
      this.audio.volume = volume;
      console.log(`🔊 ElevenLabsProvider: Set volume to ${volume}`);
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