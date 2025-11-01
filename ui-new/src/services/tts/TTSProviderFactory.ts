/**
 * TTS Provider Factory
 * 
 * Manages initialization and selection of TTS providers
 * Integrates with existing LLM provider configuration
 */

import type { TTSProvider, TTSProviderType } from '../../types/tts';
import type { ProviderConfig } from '../../types/provider';
import { LLMProviderTTSProvider } from './LLMProviderTTSProvider';
import { ElevenLabsProvider } from './ElevenLabsProvider';
import { BrowserSpeechProvider, SpeakJsProvider } from './BrowserProviders';
// import { SpeachesProvider } from './SpeachesProvider'; // File doesn't exist
import { ChatterboxTTSProvider } from './ChatterboxTTSProvider';

export class TTSProviderFactory {
  private providers: Map<TTSProviderType, TTSProvider> = new Map();
  private llmProviders: ProviderConfig[] = [];

  async initializeProviders(llmProviders: ProviderConfig[], elevenlabsApiKey?: string): Promise<void> {
    this.llmProviders = llmProviders;
    this.providers.clear();

    // Initialize Chatterbox (Local TTS with GPU - Priority #1)
    const chatterbox = new ChatterboxTTSProvider('http://localhost:8000');
    if (await chatterbox.isAvailable()) {
      this.providers.set('chatterbox', chatterbox);
      console.log('🏠 Chatterbox TTS provider initialized (LOCAL GPU)');
    }

    // Note: Speaches provider not implemented yet (SpeachesProvider.ts doesn't exist)

    // Initialize individual LLM providers for TTS
    await this.initializeLLMProviders();

    // Initialize generic LLM provider (fallback)
    const supportedLLMProvider = this.getBestLLMProviderForTTS();
    if (supportedLLMProvider) {
      const llmTTS = new LLMProviderTTSProvider(supportedLLMProvider);
      if (await llmTTS.isAvailable()) {
        this.providers.set('llm', llmTTS);
      }
    }

    // Initialize ElevenLabs (Specialized TTS service)
    if (elevenlabsApiKey) {
      const elevenlabs = new ElevenLabsProvider(elevenlabsApiKey);
      if (await elevenlabs.isAvailable()) {
        this.providers.set('elevenlabs', elevenlabs);
      }
    }

    // Initialize Web Speech API (Secondary)
    const webSpeech = new BrowserSpeechProvider();
    if (await webSpeech.isAvailable()) {
      this.providers.set('browser', webSpeech);
    }

    // Initialize speak.js (Fallback)
    const speakJs = new SpeakJsProvider();
    if (await speakJs.isAvailable()) {
      this.providers.set('speakjs', speakJs);
    }
  }

  /**
   * Initialize individual LLM providers for specific TTS access
   */
  private async initializeLLMProviders(): Promise<void> {
    // OpenAI TTS
    const openaiProvider = this.llmProviders.find(p => p.type === 'openai' && p.enabled !== false);
    if (openaiProvider) {
      const openaiTTS = new LLMProviderTTSProvider(openaiProvider);
      if (await openaiTTS.isAvailable()) {
        this.providers.set('openai-tts', openaiTTS);
      }
    }

    // Groq TTS
    const groqProvider = this.llmProviders.find(p => p.type === 'groq' && p.enabled !== false);
    if (groqProvider) {
      const groqTTS = new LLMProviderTTSProvider(groqProvider);
      if (await groqTTS.isAvailable()) {
        this.providers.set('groq-tts', groqTTS);
      }
    }

    // Gemini TTS
    const geminiProvider = this.llmProviders.find(p => 
      p.type === 'gemini' && p.enabled !== false
    );
    if (geminiProvider) {
      const geminiTTS = new LLMProviderTTSProvider(geminiProvider);
      if (await geminiTTS.isAvailable()) {
        this.providers.set('gemini-tts', geminiTTS);
      }
    }

    // Together AI TTS
    const togetherProvider = this.llmProviders.find(p => p.type === 'together' && p.enabled !== false);
    if (togetherProvider) {
      const togetherTTS = new LLMProviderTTSProvider(togetherProvider);
      if (await togetherTTS.isAvailable()) {
        this.providers.set('together-tts', togetherTTS);
      }
    }
  }

  /**
   * Find the best available LLM provider that supports TTS
   */
  private getBestLLMProviderForTTS(): ProviderConfig | null {
    // Priority order for TTS support
    const ttsProviderPriority: (keyof typeof import('../../types/provider').PROVIDER_ENDPOINTS)[] = [
      'openai',      // Best TTS quality
      'gemini',      // Good TTS support
      'groq',        // Groq TTS via PlayAI
      'together'     // Together AI TTS support
    ];

    for (const providerType of ttsProviderPriority) {
      const provider = this.llmProviders.find(p => 
        p.type === providerType && 
        p.enabled !== false
      );
      if (provider) {
        return provider;
      }
    }

    return null;
  }

  getProvider(type: TTSProviderType): TTSProvider | undefined {
    return this.providers.get(type);
  }

  getAvailableProviders(): TTSProviderType[] {
    const availableProviders = Array.from(this.providers.keys());
    
    // Always include ElevenLabs in the list so users can configure it
    if (!availableProviders.includes('elevenlabs')) {
      availableProviders.push('elevenlabs');
    }
    
    // Sort providers by preference (LLM auto first, then specific providers, then local/fallbacks)
    const sortOrder: TTSProviderType[] = [
      'llm', // LLM Provider (Auto) - first choice
      'speaches', // Local CPU TTS
      'openai-tts', 'groq-tts', 'gemini-tts', 'together-tts', // Specific LLM providers
      'elevenlabs', // Specialized TTS service
      'chatterbox', // Local GPU TTS (after elevenlabs)
      'browser', 'speakjs' // Browser fallbacks
    ];
    
    return availableProviders.sort((a, b) => {
      const aIndex = sortOrder.indexOf(a);
      const bIndex = sortOrder.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
  }

  /**
   * Get available LLM providers that support TTS
   */
  getAvailableLLMProviders(): { type: string; name: string; }[] {
    return this.llmProviders
      .filter(provider => 
        provider.enabled !== false &&
        ['openai', 'gemini', 'groq', 'together'].includes(provider.type)
      )
      .map(provider => ({
        type: provider.type,
        name: this.getLLMProviderDisplayName(provider.type)
      }));
  }

  /**
   * Get LLM provider for TTS by specific type
   */
  getLLMProviderByType(providerType: string): ProviderConfig | null {
    return this.llmProviders.find(p => 
      p.type === providerType && 
      p.enabled !== false
    ) || null;
  }

  private getLLMProviderDisplayName(type: string): string {
    const names: Record<string, string> = {
      'openai': 'OpenAI',
      'gemini': 'Gemini',
      'groq': 'Groq',
      'together': 'Together AI'
    };
    return names[type] || type;
  }

  getDefaultProvider(): TTSProvider | null {
    const priorities: TTSProviderType[] = [
      'llm', // LLM Provider (Auto) - first choice
      'speaches', // Local CPU TTS
      'openai-tts', 'groq-tts', 'gemini-tts', 'together-tts', // Specific LLM providers
      'elevenlabs', // Specialized TTS service
      'chatterbox', // Local GPU TTS (after elevenlabs)
      'browser', 'speakjs' // Browser fallbacks
    ];
    
    for (const type of priorities) {
      const provider = this.providers.get(type);
      if (provider) {
        return provider;
      }
    }

    return null;
  }

  getDefaultProviderType(): TTSProviderType | null {
    const priorities: TTSProviderType[] = [
      'llm', // LLM Provider (Auto) - first choice
      'speaches', // Local CPU TTS
      'openai-tts', 'groq-tts', 'gemini-tts', 'together-tts', // Specific LLM providers
      'elevenlabs', // Specialized TTS service
      'chatterbox', // Local GPU TTS (after elevenlabs)
      'browser', 'speakjs' // Browser fallbacks
    ];
    
    for (const type of priorities) {
      if (this.providers.has(type)) {
        return type;
      }
    }

    return null;
  }

  /**
   * Update the LLM provider configuration for TTS
   */
  async updateLLMProviders(llmProviders: ProviderConfig[]): Promise<void> {
    this.llmProviders = llmProviders;
    
    // Update the LLM TTS provider
    const supportedProvider = this.getBestLLMProviderForTTS();
    if (supportedProvider) {
      const existingProvider = this.providers.get('llm') as LLMProviderTTSProvider;
      if (existingProvider) {
        existingProvider.setProvider(supportedProvider);
      } else {
        const newProvider = new LLMProviderTTSProvider(supportedProvider);
        if (await newProvider.isAvailable()) {
          this.providers.set('llm', newProvider);
        }
      }
    } else {
      // Remove LLM provider if no suitable provider available
      this.providers.delete('llm');
    }
  }

  /**
   * Update ElevenLabs API key
   */
  async updateElevenLabsApiKey(apiKey: string): Promise<void> {
    if (apiKey) {
      const existingProvider = this.providers.get('elevenlabs') as ElevenLabsProvider;
      if (existingProvider) {
        existingProvider.setApiKey(apiKey);
      } else {
        const newProvider = new ElevenLabsProvider(apiKey);
        if (await newProvider.isAvailable()) {
          this.providers.set('elevenlabs', newProvider);
        }
      }
    } else {
      // Remove ElevenLabs provider if no API key
      this.providers.delete('elevenlabs');
    }
  }

  /**
   * Clean up all providers and dispose of resources
   */
  cleanup(): void {
    this.providers.forEach(provider => {
      if (provider && typeof provider.stop === 'function') {
        try {
          provider.stop();
        } catch (error) {
          console.warn('Error stopping TTS provider:', error);
        }
      }
      if (provider && typeof provider.cleanup === 'function') {
        try {
          provider.cleanup();
        } catch (error) {
          console.warn('Error cleaning up TTS provider:', error);
        }
      }
    });
    this.providers.clear();
  }

  /**
   * Get current LLM provider info for display
   */
  getCurrentLLMProviderInfo(): { name: string; type: string } | null {
    const provider = this.getBestLLMProviderForTTS();
    if (!provider) return null;

    const providerNames: Record<string, string> = {
      'openai': 'OpenAI',
      'gemini': 'Google Gemini',
      'groq': 'Groq',
      'together': 'Together AI',
      'atlascloud': 'Atlas Cloud'
    };

    return {
      name: providerNames[provider.type] || provider.type,
      type: provider.type
    };
  }
}