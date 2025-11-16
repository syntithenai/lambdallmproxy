/**
 * Text-to-Speech Type Definitions
 * 
 * Defines the TTS system with support for multiple providers:
 * - LLM Providers (uses existing provider configuration)
 * - ElevenLabs (specialized TTS service)
 * - Browser Web Speech API
 */

export interface Voice {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  provider: string;
  isLocal?: boolean; // For browser voices: true if localService, false if network/remote
}

export interface SpeakOptions {
  voice?: string;
  rate?: number;      // 0.5 - 2.0 (playback speed)
  volume?: number;    // 0.0 - 1.0
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onBoundary?: (word: string, position: number) => void;
  providerVoices?: ProviderVoiceMap; // Voice map for fallback providers
}

export interface TTSProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getVoices(languageCode?: string): Promise<Voice[]>;
  speak(text: string, options: SpeakOptions): Promise<void>;
  stop(): void;
  pause?(): void;
  resume?(): void;
  cleanup?(): void; // Optional cleanup method for resources
  isBoundarySupported?(): boolean; // Check if browser supports boundary events (for settings restart)
  
  // Optional pregeneration methods for buffered playback (LLM/cloud TTS providers)
  pregenerate?(text: string, options: SpeakOptions): Promise<Blob>;
  playBlob?(audioBlob: Blob, options: SpeakOptions, providedObjectUrl?: string): Promise<void>;
  
  // Optional real-time control methods (for mid-playback rate/volume changes)
  setPlaybackRate?(rate: number): void;
  setVolume?(volume: number): void;
}

export type TTSProviderType = 
  | 'auto'           // Automatic - select cheapest available provider
  | 'openai-tts'     // OpenAI TTS (tts-1, tts-1-hd)
  | 'groq-tts'       // Groq TTS (PlayAI models)
  | 'gemini-tts'     // Google Gemini TTS (Wavenet, Neural2)
  | 'openrouter-tts' // OpenRouter TTS (chatterbox, speech-02, kokoro, f5-tts)
  | 'elevenlabs'     // ElevenLabs (requires explicit selection + API key)
  | 'browser';       // Web Speech API only (no fallback)

// Per-provider voice selections
export type ProviderVoiceMap = Partial<Record<TTSProviderType, string>>;

export interface TTSState {
  isEnabled: boolean;
  isPlaying: boolean;
  isLoadingAudio: boolean; // True when waiting for first audio chunk from online TTS
  currentText: string | null;
  currentProvider: TTSProviderType;
  activeProvider: TTSProviderType | null; // The actual provider currently playing (may differ from currentProvider due to fallback)
  providerVoices: ProviderVoiceMap; // Voice selection for each provider
  rate: number;
  volume: number;
  providers: TTSProvider[];
  voices: Voice[];
  elevenlabsApiKey: string;
  boundarySupported: boolean; // Whether current provider supports boundary events for mid-speech settings changes
  usingNonLocalVoice: boolean; // True if using a remote/network voice (for warning display)
  // Chunked playback info for highlighting
  chunks: string[];
  currentChunkIndex: number;
  totalChunks: number;
}

export interface TTSSettings {
  version: '1.0.0';
  isEnabled: boolean;
  currentProvider: TTSProviderType;
  providerVoices: ProviderVoiceMap; // Voice selection for each provider
  rate: number;
  volume: number;
  elevenlabsApiKey: string;
  // If true, pending pregenerated audio blobs will be invalidated when rate or volume
  // changes significantly (helps avoid playing audio generated for a different speed).
}

export interface TTSContextValue {
  state: TTSState;
  
  // Control methods
  speak(text: string, options?: Partial<SpeakOptions>): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  seekToChunk(chunkIndex: number): void; // Jump to specific chunk and start playing from there
  
  // Configuration methods
  setProvider(provider: TTSProviderType): void;
  setVoice(voiceId: string, forProvider?: TTSProviderType): void; // Set voice for specific provider
  setRate(rate: number): void;
  setVolume(volume: number): void;
  setElevenLabsApiKey(apiKey: string): void;
  
  // Utility methods
  getAvailableProviders(): TTSProviderType[];
  getVoicesForProvider(provider: TTSProviderType, languageCode?: string): Promise<Voice[]>;
  
  // Content-specific methods
  speakResponse(responseText: string): Promise<void>;
  speakSnippet(snippetContent: string): Promise<void>;
}

// Default TTS settings
export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  version: '1.0.0',
  isEnabled: true, // Always enabled when TTS feature is available
  currentProvider: 'auto',
  providerVoices: {},
  rate: 1.0,
  volume: 1.0,
  elevenlabsApiKey: '',
  // pregenerated buffers are always invalidated on large rate/volume changes
};

// Feature flag to completely disable TTS (for debugging)
export const TTS_FEATURE_ENABLED = true; // TTS feature enabled with memory leak fixes