# Text-to-Speech Implementation Plan 🔊

## Overview

Implement comprehensive text-to-speech functionality for chat responses and SWAG snippets, with LLM-generated speakable summaries, multiple TTS providers, and granular UI controls.

**Goal:** Enable users to listen to AI responses and saved snippets with high-quality speech synthesis, including intelligent summarization for long content.

## ✅ UPDATED Requirements Integration

### Key Changes Made:
1. **Primary TTS Provider**: Use existing LLM provider models (OpenAI, Google, etc.) for speech generation
   - Leverages already configured API keys and provider settings
   - No additional authentication required for LLM-based TTS
   - Priority order: LLM Provider → ElevenLabs → Browser → speak.js

2. **ElevenLabs Authentication Block**: 
   - Dedicated configuration section for ElevenLabs API key
   - Clear indication that ElevenLabs is a TTS-only service requiring separate authentication
   - Pricing tiers and usage information displayed
   - Distinguished from LLM providers that offer TTS as part of their broader services

---

## Feature Requirements

### Core Features
1. ✅ **Read Button** - On response blocks and snippet viewers
2. ✅ **Text Extraction** - Clean text content preparation for speech
3. ✅ **LLM Speakable Summaries** - Generate concise, natural-sounding summaries
4. ✅ **Multi-Provider Support** - Use existing LLM providers for TTS, Browser Speech API, speak.js fallback
5. ✅ **Stop Control** - Stop button in fixed header during playback
6. ✅ **Configuration UI** - Settings tab for TTS options with 11labs authentication
7. ✅ **Voice Selection** - Choose from available voices per provider
8. ✅ **Enable/Disable Toggle** - Master switch for TTS feature

### Advanced Features (Future)
- 🔄 **Playback Controls** - Pause, resume, speed control
- 🔄 **Highlight Sync** - Highlight text as it's spoken
- 🔄 **Queue Management** - Queue multiple items for continuous playback
- 🔄 **Voice Cloning** - Custom voice training (ElevenLabs)
- 🔄 **Offline Mode** - Download audio for offline listening

---

## Architecture Design

### Provider Abstraction Layer

```typescript
// TTS Provider Interface
interface TTSProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getVoices(): Promise<Voice[]>;
  speak(text: string, options: SpeakOptions): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
}

interface Voice {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  provider: string;
}

interface SpeakOptions {
  voice?: string;
  rate?: number;      // 0.5 - 2.0
  pitch?: number;     // 0.5 - 2.0
  volume?: number;    // 0.0 - 1.0
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onBoundary?: (word: string, position: number) => void;
}
```

### Provider Implementations

#### 1. **LLM Provider TTS** (Primary - New)
```typescript
class LLMProviderTTSProvider implements TTSProvider {
  private provider: string;
  private model: string;
  private apiKey: string;
  private audio: HTMLAudioElement | null;
  
  constructor(provider: string, model: string, apiKey: string) {
    this.provider = provider;
    this.model = model;
    this.apiKey = apiKey;
  }
  
  async isAvailable(): Promise<boolean> {
    // Check if the configured LLM provider supports TTS
    const supportedProviders = ['openai', 'anthropic', 'google'];
    return supportedProviders.includes(this.provider);
  }
  
  async getVoices(): Promise<Voice[]> {
    // Return voices based on the LLM provider
    switch (this.provider) {
      case 'openai':
        return [
          { id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral', provider: 'openai' },
          { id: 'echo', name: 'Echo', language: 'en-US', gender: 'male', provider: 'openai' },
          { id: 'fable', name: 'Fable', language: 'en-US', gender: 'neutral', provider: 'openai' },
          { id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male', provider: 'openai' },
          { id: 'nova', name: 'Nova', language: 'en-US', gender: 'female', provider: 'openai' },
          { id: 'shimmer', name: 'Shimmer', language: 'en-US', gender: 'female', provider: 'openai' },
        ];
      case 'google':
        return [
          { id: 'en-US-Neural2-A', name: 'Neural2 A (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Neural2-C', name: 'Neural2 C (Female)', language: 'en-US', gender: 'female', provider: 'google' },
          { id: 'en-US-Neural2-D', name: 'Neural2 D (Male)', language: 'en-US', gender: 'male', provider: 'google' },
          { id: 'en-US-Neural2-E', name: 'Neural2 E (Female)', language: 'en-US', gender: 'female', provider: 'google' },
        ];
      default:
        return [];
    }
  }
  
  async speak(text: string, options: SpeakOptions): Promise<void> {
    let audioBlob: Blob;
    
    if (this.provider === 'openai') {
      // Use OpenAI TTS API
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: options.voice || 'alloy',
          speed: options.rate || 1.0,
        }),
      });
      audioBlob = await response.blob();
    } else if (this.provider === 'google') {
      // Use Google Cloud TTS API
      const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey
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
            pitch: (options.pitch || 1.0) * 20 - 20
          }
        })
      });
      
      const data = await response.json();
      audioBlob = base64ToBlob(data.audioContent, 'audio/mp3');
    } else {
      throw new Error(`TTS not supported for provider: ${this.provider}`);
    }
    
    const audioUrl = URL.createObjectURL(audioBlob);
    this.audio = new Audio(audioUrl);
    this.audio.volume = options.volume || 1.0;
    
    return new Promise((resolve, reject) => {
      this.audio!.onplay = options.onStart;
      this.audio!.onended = () => {
        options.onEnd?.();
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      this.audio!.onerror = (e) => {
        options.onError?.(new Error('Audio playback failed'));
        reject(e);
      };
      
      this.audio!.play();
    });
  }
  
  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
  }
}
```

#### 2. **Web Speech API Provider** (Secondary)
```typescript
class WebSpeechProvider implements TTSProvider {
  private synth: SpeechSynthesis;
  private utterance: SpeechSynthesisUtterance | null;
  
  async isAvailable(): Promise<boolean> {
    return 'speechSynthesis' in window;
  }
  
  async getVoices(): Promise<Voice[]> {
    const voices = speechSynthesis.getVoices();
    return voices.map(v => ({
      id: v.voiceURI,
      name: v.name,
      language: v.lang,
      gender: detectGender(v.name),
      provider: 'browser'
    }));
  }
  
  async speak(text: string, options: SpeakOptions): Promise<void> {
    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.rate = options.rate || 1.0;
    this.utterance.pitch = options.pitch || 1.0;
    this.utterance.volume = options.volume || 1.0;
    
    if (options.voice) {
      const voices = speechSynthesis.getVoices();
      this.utterance.voice = voices.find(v => v.voiceURI === options.voice) || null;
    }
    
    this.utterance.onstart = options.onStart;
    this.utterance.onend = options.onEnd;
    this.utterance.onerror = (e) => options.onError?.(new Error(e.error));
    this.utterance.onboundary = (e) => {
      const word = text.substring(e.charIndex, e.charIndex + e.charLength);
      options.onBoundary?.(word, e.charIndex);
    };
    
    return new Promise((resolve, reject) => {
      this.utterance!.onend = () => {
        options.onEnd?.();
        resolve();
      };
      this.utterance!.onerror = (e) => {
        options.onError?.(new Error(e.error));
        reject(new Error(e.error));
      };
      
      speechSynthesis.speak(this.utterance!);
    });
  }
  
  stop(): void {
    speechSynthesis.cancel();
  }
}
```

#### 3. **ElevenLabs Provider** (Specialized TTS-Only Service)
```typescript
class ElevenLabsProvider implements TTSProvider {
  private apiKey: string;
  private audio: HTMLAudioElement | null;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
  
  async getVoices(): Promise<Voice[]> {
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': this.apiKey }
      });
      const data = await response.json();
      return data.voices.map((v: any) => ({
        id: v.voice_id,
        name: v.name,
        language: v.labels?.language || 'en',
        gender: v.labels?.gender,
        provider: 'elevenlabs'
      }));
    } catch (error) {
      console.error('Failed to fetch ElevenLabs voices:', error);
      return [];
    }
  }
  
  async speak(text: string, options: SpeakOptions): Promise<void> {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${options.voice}`, {
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
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }
    
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    this.audio = new Audio(audioUrl);
    this.audio.volume = options.volume || 1.0;
    
    return new Promise((resolve, reject) => {
      this.audio!.onplay = options.onStart;
      this.audio!.onended = () => {
        options.onEnd?.();
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      this.audio!.onerror = (e) => {
        options.onError?.(new Error('Audio playback failed'));
        reject(e);
      };
      
      this.audio!.play();
    });
  }
  
  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
  }
}
```

#### 4. **speak.js Provider** (Fallback)
```typescript
class SpeakJsProvider implements TTSProvider {
  private worker: Worker | null;
  
  async isAvailable(): Promise<boolean> {
    // Always available as fallback
    return true;
  }
  
  async getVoices(): Promise<Voice[]> {
    return [
      { id: 'speakjs-en', name: 'speak.js English', language: 'en-US', provider: 'speakjs' }
    ];
  }
  
  async speak(text: string, options: SpeakOptions): Promise<void> {
    // Use speak.js library
    return new Promise((resolve, reject) => {
      this.worker = new Worker('/speak-worker.js');
      
      this.worker.postMessage({
        command: 'speak',
        text: text,
        options: {
          rate: options.rate || 1.0,
          pitch: options.pitch || 1.0,
          volume: options.volume || 1.0
        }
      });
      
      this.worker.onmessage = (e) => {
        if (e.data.type === 'start') options.onStart?.();
        if (e.data.type === 'end') {
          options.onEnd?.();
          resolve();
        }
        if (e.data.type === 'error') {
          options.onError?.(new Error(e.data.message));
          reject(new Error(e.data.message));
        }
      };
    });
  }
  
  stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
```

---

## Implementation Phases

### **Phase 1: Core Infrastructure** (4 hours)

#### 1.1 TTS Context & State Management
**File:** `ui-new/src/contexts/TTSContext.tsx`

```typescript
interface TTSState {
  isEnabled: boolean;
  isPlaying: boolean;
  currentText: string | null;
  currentProvider: string;
  currentVoice: string | null;
  rate: number;
  pitch: number;
  volume: number;
  providers: TTSProvider[];
  voices: Voice[];
  autoSummarize: boolean; // Use LLM summaries
}

interface TTSContextType {
  state: TTSState;
  
  // Control methods
  speak(text: string, options?: Partial<SpeakOptions>): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  
  // Configuration methods
  setEnabled(enabled: boolean): void;
  setProvider(provider: string): void;
  setVoice(voiceId: string): void;
  setRate(rate: number): void;
  setPitch(pitch: number): void;
  setVolume(volume: number): void;
  setAutoSummarize(enabled: boolean): void;
  
  // Utility methods
  getAvailableProviders(): string[];
  getVoicesForProvider(provider: string): Voice[];
  
  // Content-specific methods
  speakResponse(responseText: string, shouldSummarize?: boolean): Promise<void>;
  speakSnippet(snippetContent: string, shouldSummarize?: boolean): Promise<void>;
}
```

**Key Features:**
- Provider management and switching
- Voice selection per provider
- Playback state tracking
- Configuration persistence (localStorage)
- Auto-summarization toggle

#### 1.2 Provider Factory
**File:** `ui-new/src/services/tts/TTSProviderFactory.ts`

```typescript
class TTSProviderFactory {
  private providers: Map<string, TTSProvider> = new Map();
  
  async initializeProviders(): Promise<void> {
    // Initialize LLM providers for TTS (Primary)
    const llmConfig = this.getLLMProviderConfig();
    if (llmConfig.provider && llmConfig.apiKey) {
      const llmTTS = new LLMProviderTTSProvider(llmConfig.provider, llmConfig.model, llmConfig.apiKey);
      if (await llmTTS.isAvailable()) {
        this.providers.set('llm', llmTTS);
      }
    }
    
    // Initialize ElevenLabs (Specialized TTS service)
    const elevenlabsApiKey = localStorage.getItem('tts_elevenlabs_api_key');
    if (elevenlabsApiKey) {
      this.providers.set('elevenlabs', new ElevenLabsProvider(elevenlabsApiKey));
    }
    
    // Initialize Web Speech API (Secondary)
    const webSpeech = new WebSpeechProvider();
    if (await webSpeech.isAvailable()) {
      this.providers.set('browser', webSpeech);
    }
    
    // Initialize speak.js (Fallback)
    const speakJs = new SpeakJsProvider();
    this.providers.set('speakjs', speakJs);
  }
  
  private getLLMProviderConfig() {
    // Get the currently configured LLM provider from existing settings
    const provider = localStorage.getItem('selected_provider') || 'openai';
    const model = localStorage.getItem('selected_model') || 'gpt-3.5-turbo';
    const apiKey = localStorage.getItem(`${provider}_api_key`);
    
    return { provider, model, apiKey };
  }
  
  getProvider(name: string): TTSProvider | undefined {
    return this.providers.get(name);
  }
  
  getDefaultProvider(): TTSProvider {
    // Priority: llm > elevenlabs > browser > speakjs
    return this.providers.get('llm') 
      || this.providers.get('elevenlabs')
      || this.providers.get('browser')
      || this.providers.get('speakjs')!;
  }
}
```

#### 1.3 Text Preprocessing Utilities
**File:** `ui-new/src/utils/textPreprocessing.ts`

```typescript
/**
 * Clean and prepare text for speech synthesis
 */
export function prepareTextForSpeech(text: string): string {
  let cleaned = text;
  
  // Remove markdown formatting
  cleaned = cleaned.replace(/#{1,6}\s/g, ''); // Headers
  cleaned = cleaned.replace(/\*\*\*(.*?)\*\*\*/g, '$1'); // Bold+Italic
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1'); // Italic
  cleaned = cleaned.replace(/`{1,3}[^`]*`{1,3}/g, 'code'); // Code blocks
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Links
  
  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  
  // Remove special characters but keep punctuation
  cleaned = cleaned.replace(/[^\w\s.,!?;:'"()-]/g, ' ');
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Add pauses for better speech flow
  cleaned = cleaned.replace(/\. /g, '. ... '); // Longer pause after sentences
  cleaned = cleaned.replace(/, /g, ', .. '); // Shorter pause after commas
  
  return cleaned;
}

/**
 * Extract speakable text from message object
 */
export function extractSpeakableText(message: ChatMessage): string {
  if (typeof message.content === 'string') {
    return prepareTextForSpeech(message.content);
  }
  
  // Handle array content (multimodal messages)
  if (Array.isArray(message.content)) {
    const textParts = message.content
      .filter(part => part.type === 'text')
      .map(part => part.text);
    return prepareTextForSpeech(textParts.join(' '));
  }
  
  return '';
}

/**
 * Truncate long text with summary prompt
 */
export function truncateForSpeech(text: string, maxLength: number = 500): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '... (content truncated)';
}
```

---

### **Phase 2: UI Controls** (3 hours)

#### 2.1 Read Button Component
**File:** `ui-new/src/components/ReadButton.tsx`

```typescript
interface ReadButtonProps {
  text: string;
  variant?: 'icon' | 'button' | 'fab';
  size?: 'sm' | 'md' | 'lg';
  onStart?: () => void;
  onEnd?: () => void;
  shouldSummarize?: boolean;
}

export const ReadButton: React.FC<ReadButtonProps> = ({
  text,
  variant = 'icon',
  size = 'md',
  onStart,
  onEnd,
  shouldSummarize = false
}) => {
  const { state, speak, stop } = useTTS();
  const [isReading, setIsReading] = useState(false);
  
  const handleClick = async () => {
    if (isReading) {
      stop();
      setIsReading(false);
      onEnd?.();
    } else {
      setIsReading(true);
      onStart?.();
      
      try {
        await speak(text, { shouldSummarize });
      } finally {
        setIsReading(false);
        onEnd?.();
      }
    }
  };
  
  if (!state.isEnabled) return null;
  
  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title={isReading ? 'Stop reading' : 'Read aloud'}
      >
        {isReading ? (
          <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          </svg>
        )}
      </button>
    );
  }
  
  if (variant === 'button') {
    return (
      <button
        onClick={handleClick}
        className={`px-3 py-1 rounded flex items-center gap-2 ${
          isReading 
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isReading ? (
          <>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
            Stop
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>
            Read
          </>
        )}
      </button>
    );
  }
  
  // FAB variant (floating action button)
  return (
    <button
      onClick={handleClick}
      className={`fixed bottom-20 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-40 ${
        isReading
          ? 'bg-red-600 hover:bg-red-700'
          : 'bg-blue-600 hover:bg-blue-700'
      } text-white`}
    >
      {isReading ? (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" />
        </svg>
      ) : (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        </svg>
      )}
    </button>
  );
};
```

#### 2.2 Stop Button in Fixed Header
**File:** `ui-new/src/components/ChatTab.tsx` (modify header)

```typescript
// Add to header section
{state.isPlaying && (
  <button
    onClick={() => stop()}
    className="fixed top-4 right-20 z-50 px-4 py-2 bg-red-600 text-white rounded-lg shadow-lg hover:bg-red-700 transition-colors flex items-center gap-2 animate-pulse"
  >
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" />
    </svg>
    Stop Reading
  </button>
)}
```

#### 2.3 Integration in Message Blocks
**File:** `ui-new/src/components/ChatTab.tsx` (add to message rendering)

```typescript
// Add ReadButton to assistant message blocks
<div className="flex items-start gap-3">
  <div className="flex-1">
    {/* Existing message content */}
    <MarkdownRenderer content={msg.content} />
  </div>
  
  {/* Read button */}
  <ReadButton 
    text={extractSpeakableText(msg)}
    variant="icon"
    shouldSummarize={msg.content.length > 500}
  />
</div>
```

#### 2.4 Integration in Snippet Viewer
**File:** `ui-new/src/components/SwagPage.tsx` (add to viewing dialog)

```typescript
// Add ReadButton to snippet viewing dialog footer
<div className="flex gap-3">
  <ReadButton
    text={viewingSnippet.content}
    variant="button"
    shouldSummarize={viewingSnippet.content.length > 500}
  />
  {/* Existing buttons (Cast, Edit, Close) */}
</div>
```

---

### **Phase 3: Configuration UI** (2 hours)

#### 3.1 Configuration Tab
**File:** `ui-new/src/components/ConfigurationPage.tsx`

```typescript
export const ConfigurationPage: React.FC = () => {
  const { state, setEnabled, setProvider, setVoice, setRate, setPitch, setVolume, setAutoSummarize } = useTTS();
  const [providers, setProviders] = useState<string[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  
  useEffect(() => {
    // Load available providers
    setProviders(getAvailableProviders());
  }, []);
  
  useEffect(() => {
    // Load voices when provider changes
    if (state.currentProvider) {
      setVoices(getVoicesForProvider(state.currentProvider));
    }
  }, [state.currentProvider]);
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Configuration</h1>
      
      {/* Tabs */}
      <div className="tabs mb-6">
        <button className="tab tab-active">General</button>
        <button className="tab">Text-to-Speech</button>
        <button className="tab">Advanced</button>
      </div>
      
      {/* Text-to-Speech Settings */}
      <div className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="card bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Enable Text-to-Speech</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Allow AI responses and snippets to be read aloud
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={state.isEnabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
        
        {state.isEnabled && (
          <>
            {/* Auto-Summarize Toggle */}
            <div className="card bg-white dark:bg-gray-800 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Auto-Summarize Long Content</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Use LLM to generate concise, speakable summaries for long responses
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.autoSummarize}
                    onChange={(e) => setAutoSummarize(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
            
            {/* Provider Selection */}
            <div className="card bg-white dark:bg-gray-800 p-6">
              <h3 className="text-lg font-semibold mb-4">Voice Provider</h3>
              <select
                value={state.currentProvider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              >
                {providers.map(provider => (
                  <option key={provider} value={provider}>
                    {provider === 'llm' ? 'LLM Provider (Current)' :
                     provider === 'elevenlabs' ? 'ElevenLabs (Specialized TTS)' :
                     provider === 'browser' ? 'Browser (Web Speech API)' :
                     provider === 'speakjs' ? 'speak.js (Offline)' :
                     provider}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {state.currentProvider === 'llm' && 'Uses your configured LLM provider for TTS (OpenAI, Google, etc.)'}
                {state.currentProvider === 'elevenlabs' && 'Ultra-realistic AI voices (requires separate API key)'}
                {state.currentProvider === 'browser' && 'Uses your browser\'s built-in voices'}
                {state.currentProvider === 'speakjs' && 'Offline synthesis, basic quality'}
              </p>
            </div>
            
            {/* Voice Selection */}
            <div className="card bg-white dark:bg-gray-800 p-6">
              <h3 className="text-lg font-semibold mb-4">Voice</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {voices.map(voice => (
                  <button
                    key={voice.id}
                    onClick={() => setVoice(voice.id)}
                    className={`p-3 text-left border rounded-lg transition-colors ${
                      state.currentVoice === voice.id
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}
                  >
                    <div className="font-medium">{voice.name}</div>
                    <div className="text-xs text-gray-500">
                      {voice.language} • {voice.gender || 'neutral'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Playback Controls */}
            <div className="card bg-white dark:bg-gray-800 p-6">
              <h3 className="text-lg font-semibold mb-4">Playback Settings</h3>
              
              {/* Speed */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Speed: {state.rate.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={state.rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Slower</span>
                  <span>Normal</span>
                  <span>Faster</span>
                </div>
              </div>
              
              {/* Pitch */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Pitch: {state.pitch.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={state.pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Lower</span>
                  <span>Normal</span>
                  <span>Higher</span>
                </div>
              </div>
              
              {/* Volume */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Volume: {Math.round(state.volume * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
            
            {/* ElevenLabs API Key Configuration */}
            {state.currentProvider === 'elevenlabs' && (
              <div className="card bg-white dark:bg-gray-800 p-6">
                <h3 className="text-lg font-semibold mb-4">ElevenLabs Authentication</h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">Specialized TTS Service</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        ElevenLabs provides TTS-only services and requires separate authentication from your LLM providers.
                      </p>
                    </div>
                  </div>
                </div>
                <label className="block text-sm font-medium mb-2">API Key:</label>
                <input
                  type="password"
                  placeholder="Enter ElevenLabs API key"
                  value={localStorage.getItem('tts_elevenlabs_api_key') || ''}
                  onChange={(e) => {
                    localStorage.setItem('tts_elevenlabs_api_key', e.target.value);
                    // Reinitialize providers
                    initializeProviders();
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Get your API key from <a href="https://elevenlabs.io/speech-synthesis" target="_blank" className="text-blue-600 hover:underline">ElevenLabs Dashboard</a>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    • Free tier: 10,000 characters/month
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    • Starter: $1/month for 30,000 characters
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    • Creator: $22/month for 100,000 characters
                  </p>
                </div>
              </div>
            )}
            
            {/* LLM Provider TTS Info */}
            {state.currentProvider === 'llm' && (
              <div className="card bg-white dark:bg-gray-800 p-6">
                <h3 className="text-lg font-semibold mb-4">LLM Provider TTS</h3>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-green-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h4 className="font-medium text-green-900 dark:text-green-100">Using Existing Configuration</h4>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        TTS will use your currently configured LLM provider and API key. No additional authentication required.
                      </p>
                      <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                        Current Provider: <strong>{getCurrentLLMProvider()}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
```

#### 3.2 Add Configuration Tab to Navigation
**File:** `ui-new/src/App.tsx`

```typescript
// Add tab to navigation
<nav className="tabs">
  <button onClick={() => setActiveTab('chat')}>Chat</button>
  <button onClick={() => setActiveTab('swag')}>SWAG</button>
  <button onClick={() => setActiveTab('config')}>⚙️ Settings</button>
</nav>

{activeTab === 'config' && <ConfigurationPage />}
```

---

### **Phase 4: LLM Integration** (3 hours)

#### 4.1 Speakable Summary Generation
**File:** `ui-new/src/services/tts/SpeakableSummaryService.ts`

```typescript
export class SpeakableSummaryService {
  /**
   * Generate a concise, speakable summary of long content
   */
  async generateSpeakableSummary(
    text: string,
    apiConfig: { provider: string; model: string; apiKey: string }
  ): Promise<string> {
    // Skip summarization for short text
    if (text.length < 500) {
      return prepareTextForSpeech(text);
    }
    
    const prompt = `Convert the following text into a concise, natural-sounding spoken summary. 
The summary should:
- Be 2-3 sentences maximum
- Sound natural when read aloud
- Capture the key points
- Avoid technical jargon or formatting
- Use conversational language

Text to summarize:
${text}

Speakable summary:`;
    
    try {
      const response = await fetch(`/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        body: JSON.stringify({
          provider: apiConfig.provider,
          model: apiConfig.model,
          request: {
            messages: [
              { role: 'system', content: 'You are a helpful assistant that creates concise, natural-sounding spoken summaries.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 200,
            temperature: 0.7
          }
        })
      });
      
      const data = await response.json();
      const summary = data.choices[0].message.content;
      
      return prepareTextForSpeech(summary);
    } catch (error) {
      console.error('Failed to generate speakable summary:', error);
      // Fallback to truncated original text
      return truncateForSpeech(text, 500);
    }
  }
  
  /**
   * Determine if text should be summarized
   */
  shouldSummarize(text: string, autoSummarize: boolean): boolean {
    if (!autoSummarize) return false;
    
    // Summarize if text is longer than 500 characters
    return text.length > 500;
  }
}
```

#### 4.2 LLM Real-Time Speakable Responses
**File:** `src/endpoints/chat.js` (modify)

When TTS is enabled, modify the LLM request to request short-form speakable responses:

```javascript
// Add to system message when TTS is enabled
if (requestBody.ttsEnabled) {
  const ttsSystemMessage = {
    role: 'system',
    content: 'IMPORTANT: The user has text-to-speech enabled. Please provide responses in a concise, natural-sounding format suitable for speech synthesis. Keep responses to 2-3 sentences when possible, and avoid excessive formatting or technical jargon.'
  };
  
  // Prepend to messages
  cleanMessages.unshift(ttsSystemMessage);
}
```

**Frontend Request Modification:**
```typescript
// In chat request, include TTS flag
const response = await fetch('/api/chat', {
  // ...
  body: JSON.stringify({
    // ... existing fields
    ttsEnabled: state.isEnabled && state.autoSummarize
  })
});
```

---

### **Phase 5: Advanced Features** (Optional, 4 hours)

#### 5.1 Highlight Sync
Highlight words as they're spoken:

```typescript
const [highlightedWordIndex, setHighlightedWordIndex] = useState<number>(-1);

// In speak options:
onBoundary: (word, position) => {
  setHighlightedWordIndex(position);
}

// In rendering:
<span className={wordIndex === highlightedWordIndex ? 'bg-yellow-200' : ''}>
  {word}
</span>
```

#### 5.2 Playback Queue
Queue multiple messages for continuous playback:

```typescript
interface TTSQueue {
  items: Array<{ id: string; text: string }>;
  currentIndex: number;
}

async function playQueue(queue: TTSQueue) {
  for (let i = 0; i < queue.items.length; i++) {
    await speak(queue.items[i].text);
  }
}
```

#### 5.3 Download Audio
Allow downloading generated audio:

```typescript
async function downloadAudio(text: string, voice: string) {
  const audioBlob = await generateAudio(text, voice);
  const url = URL.createObjectURL(audioBlob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `speech-${Date.now()}.mp3`;
  a.click();
  
  URL.revokeObjectURL(url);
}
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure ✅
- [ ] Create `TTSContext.tsx` with state management
- [ ] Implement `LLMProviderTTSProvider` (Primary)
- [ ] Implement `ElevenLabsProvider` (Specialized TTS)
- [ ] Implement `WebSpeechProvider` (Secondary)
- [ ] Implement `SpeakJsProvider` (Fallback)
- [ ] Create `TTSProviderFactory` with LLM provider integration
- [ ] Implement text preprocessing utilities
- [ ] Add localStorage persistence for settings
- [ ] Write unit tests for text cleaning

### Phase 2: UI Controls ✅
- [ ] Create `ReadButton` component (icon, button, FAB variants)
- [ ] Add ReadButton to message blocks in ChatTab
- [ ] Add ReadButton to snippet viewer in SwagPage
- [ ] Add Stop button to fixed header
- [ ] Implement playback state indicators
- [ ] Add loading states during speech generation

### Phase 3: Configuration UI ✅
- [ ] Create `ConfigurationPage` component
- [ ] Add TTS settings tab
- [ ] Implement enable/disable toggle
- [ ] Create provider selection UI (LLM, ElevenLabs, Browser, speak.js)
- [ ] Create voice selection grid
- [ ] Add playback controls (rate, pitch, volume)
- [ ] Add ElevenLabs API key authentication block
- [ ] Add LLM provider TTS info display
- [ ] Persist settings to localStorage
- [ ] Add navigation to settings page

### Phase 4: LLM Integration ✅
- [ ] Create `SpeakableSummaryService`
- [ ] Implement summary generation API calls using existing LLM providers
- [ ] Add TTS flag to chat requests
- [ ] Modify Lambda chat endpoint for TTS-aware responses
- [ ] Add auto-summarize toggle
- [ ] Implement fallback for failed summarization
- [ ] Add cost estimation for LLM provider TTS
- [ ] Integrate with existing provider configuration system

### Phase 5: Advanced Features (Optional) ⏳
- [ ] Implement highlight sync during playback
- [ ] Create playback queue system
- [ ] Add pause/resume functionality
- [ ] Implement audio download
- [ ] Add keyboard shortcuts (Space to play/pause)
- [ ] Create TTS analytics dashboard

---

## Testing Strategy

### Unit Tests
- Text preprocessing functions
- Provider availability detection
- Voice selection logic
- State management in TTSContext

### Integration Tests
- Provider switching
- Voice switching
- Playback controls
- Configuration persistence

### Manual Testing
- Test each provider (browser, speak.js, cloud)
- Test on different browsers (Chrome, Firefox, Safari)
- Test with various text content types
- Test summarization quality
- Test long-form content playback
- Test stop/pause functionality

### User Acceptance Testing
- Speech quality assessment
- Voice naturalness rating
- Summary accuracy evaluation
- UI/UX feedback
- Performance testing (latency, memory)

---

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading** - Load speak.js only when needed
2. **Caching** - Cache generated audio (cloud providers)
3. **Debouncing** - Debounce rate/pitch/volume changes
4. **Chunking** - Break long text into chunks for streaming
5. **Web Workers** - Offload audio processing to workers
6. **Preloading** - Preload voices on app start

### Memory Management
- Limit audio cache size (max 50MB)
- Clean up audio URLs after playback
- Terminate workers when not in use

---

## Cost Estimation

### Time Estimates
| Phase | Description | Hours |
|-------|-------------|-------|
| Phase 1 | Core Infrastructure | 4 |
| Phase 2 | UI Controls | 3 |
| Phase 3 | Configuration UI | 2 |
| Phase 4 | LLM Integration | 3 |
| Phase 5 | Advanced Features | 4 |
| **Total** | | **16 hours** |

### TTS Costs
- **LLM Provider TTS**: 
  - OpenAI TTS: $15 per 1M characters
  - Google Cloud TTS: $4 per 1M characters
  - (Uses existing LLM provider API keys - no additional authentication)
- **ElevenLabs** (Specialized TTS service): 
  - Free: 10,000 characters/month
  - Starter: $1/month for 30,000 characters
  - Creator: $22/month for 100,000 characters
  - (Requires separate API key authentication)
- **Free Tier**: Browser Speech API (unlimited)
- **Free Tier**: speak.js (unlimited)

---

## Security Considerations

1. **API Key Storage** - Store in localStorage, not in code
2. **Rate Limiting** - Prevent abuse of cloud TTS APIs
3. **Content Filtering** - Sanitize text before speech synthesis
4. **CORS** - Ensure proper CORS headers for audio playback
5. **XSS Prevention** - Sanitize user-generated content

---

## Accessibility

1. **ARIA Labels** - Proper labeling for screen readers
2. **Keyboard Navigation** - Full keyboard support
3. **Focus Management** - Proper focus handling during playback
4. **High Contrast** - Ensure controls visible in all themes
5. **Reduced Motion** - Respect prefers-reduced-motion

---

## Browser Compatibility

| Browser | Web Speech API | speak.js | Cloud TTS |
|---------|---------------|----------|-----------|
| Chrome 33+ | ✅ | ✅ | ✅ |
| Firefox 49+ | ✅ | ✅ | ✅ |
| Safari 14.1+ | ✅ | ✅ | ✅ |
| Edge 14+ | ✅ | ✅ | ✅ |
| Mobile Chrome | ✅ | ✅ | ✅ |
| Mobile Safari | ✅ | ✅ | ✅ |

---

## Documentation

### User Documentation
- [ ] TTS feature overview
- [ ] How to enable/configure TTS
- [ ] Voice selection guide
- [ ] Provider comparison
- [ ] Troubleshooting guide

### Developer Documentation
- [ ] Architecture overview
- [ ] Provider implementation guide
- [ ] API reference
- [ ] Testing guide
- [ ] Deployment checklist

---

## Next Steps

1. **Review and approve plan**
2. **Set up development environment**
3. **Begin Phase 1 implementation**
4. **Create feature branch: `feature/text-to-speech`**
5. **Weekly progress reviews**
6. **Beta testing with select users**
7. **Production deployment**

---

## Success Metrics

- **Adoption Rate**: % of users who enable TTS
- **Usage Frequency**: Average TTS plays per session
- **Provider Distribution**: Which providers are most popular
- **Summary Quality**: User ratings of LLM summaries
- **Performance**: Average latency from click to speech start
- **Cost**: Monthly cloud TTS API costs (if applicable)

---

*Plan Created: October 2025*  
*Status: Ready for Implementation* 📋🔊
