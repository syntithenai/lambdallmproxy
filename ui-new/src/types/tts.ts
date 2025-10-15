/**
 * Text-to-Speech Type Definitions
 * 
 * Defines the TTS system with support for multiple providers:
 * - LLM Providers (uses existing provider configuration)
 * - ElevenLabs (specialized TTS service)
 * - Browser Web Speech API
 * - speak.js (fallback)
 */

export interface Voice {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  provider: string;
}

export interface SpeakOptions {
  voice?: string;
  rate?: number;      // 0.5 - 2.0
  pitch?: number;     // 0.5 - 2.0
  volume?: number;    // 0.0 - 1.0
  shouldSummarize?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onBoundary?: (word: string, position: number) => void;
}

export interface TTSProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getVoices(): Promise<Voice[]>;
  speak(text: string, options: SpeakOptions): Promise<void>;
  stop(): void;
  pause?(): void;
  resume?(): void;
  cleanup?(): void; // Optional cleanup method for resources
}

export type TTSProviderType = 'llm' | 'openai-tts' | 'groq-tts' | 'gemini-tts' | 'together-tts' | 'elevenlabs' | 'browser' | 'speakjs';

export interface TTSState {
  isEnabled: boolean;
  isPlaying: boolean;
  currentText: string | null;
  currentProvider: TTSProviderType;
  currentVoice: string | null;
  rate: number;
  pitch: number;
  volume: number;
  providers: TTSProvider[];
  voices: Voice[];
  autoSummarize: boolean;
  elevenlabsApiKey: string;
}

export interface TTSSettings {
  version: '1.0.0';
  isEnabled: boolean;
  currentProvider: TTSProviderType;
  currentVoice: string | null;
  rate: number;
  pitch: number;
  volume: number;
  autoSummarize: boolean;
  elevenlabsApiKey: string;
}

export interface TTSContextValue {
  state: TTSState;
  
  // Control methods
  speak(text: string, options?: Partial<SpeakOptions>): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  
  // Configuration methods
  setEnabled(enabled: boolean): void;
  setProvider(provider: TTSProviderType): void;
  setVoice(voiceId: string): void;
  setRate(rate: number): void;
  setPitch(pitch: number): void;
  setVolume(volume: number): void;
  setAutoSummarize(enabled: boolean): void;
  setElevenLabsApiKey(apiKey: string): void;
  
  // Utility methods
  getAvailableProviders(): TTSProviderType[];
  getVoicesForProvider(provider: TTSProviderType): Promise<Voice[]>;
  
  // Content-specific methods
  speakResponse(responseText: string, shouldSummarize?: boolean): Promise<void>;
  speakSnippet(snippetContent: string, shouldSummarize?: boolean): Promise<void>;
}

// Default TTS settings
export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  version: '1.0.0',
  isEnabled: false, // Keep disabled by default
  currentProvider: 'llm',
  currentVoice: null,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  autoSummarize: true,
  elevenlabsApiKey: ''
};

// Feature flag to completely disable TTS (for debugging)
export const TTS_FEATURE_ENABLED = true; // TTS feature enabled with memory leak fixes