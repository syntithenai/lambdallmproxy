/**
 * Web Speech API Provider
 * 
 * Uses the browser's built-in Speech Synthesis API
 */


import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';
import { detectGenderFromVoiceName, prepareTextForSpeech, truncateForSpeech } from '../../utils/textPreprocessing';

export class BrowserSpeechProvider implements TTSProvider {
  name = 'Browser Speech';
  private synth: SpeechSynthesis;
  private utterance: SpeechSynthesisUtterance | null = null;
  private isStoppedIntentionally = false;
  private currentOnEndCallback: (() => void) | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.synth = window.speechSynthesis;
  }

  async isAvailable(): Promise<boolean> {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  async getVoices(): Promise<Voice[]> {
    // Wait for voices to load
    await this.waitForVoices();
    
    const voices = this.synth.getVoices();
    return voices.map(v => ({
      id: v.voiceURI,
      name: v.name,
      language: v.lang,
      gender: detectGenderFromVoiceName(v.name),
      provider: 'browser'
    }));
  }

  private waitForVoices(): Promise<void> {
    return new Promise((resolve) => {
      const voices = this.synth.getVoices();
      if (voices.length > 0) {
        resolve();
        return;
      }

      // Wait for voiceschanged event
      const handleVoicesChanged = () => {
        this.synth.removeEventListener('voiceschanged', handleVoicesChanged);
        resolve();
      };

      this.synth.addEventListener('voiceschanged', handleVoicesChanged);
      
      // Fallback timeout
      setTimeout(() => {
        this.synth.removeEventListener('voiceschanged', handleVoicesChanged);
        resolve();
      }, 1000);
    });
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {

    // Validate text input
    if (!text || text.trim().length === 0) {
      const error = new Error('Cannot speak empty text');
      options.onError?.(error);
      throw error;
    }

    // Cancel any ongoing speech
    this.stop();

    // Reset the intentional stop flag
    this.isStoppedIntentionally = false;
    this.currentOnEndCallback = null;



    // Preprocess and truncate text for browser TTS
    let speakText = prepareTextForSpeech(text);
    // Truncate to 500 chars for browser reliability
    speakText = truncateForSpeech(speakText, 500);

    // Helper to actually speak, with retry on synthesis-failed
    const trySpeak = (speakTextToTry: string, retry: boolean): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!speakTextToTry || speakTextToTry.trim().length === 0) {
          const error = new Error('Cannot speak empty text after preprocessing');
          options.onError?.(error);
          return reject(error);
        }

        this.utterance = new SpeechSynthesisUtterance(speakTextToTry);
        const utter = this.utterance;
        utter.rate = options.rate || 1.0;
        utter.pitch = options.pitch || 1.0;
        utter.volume = options.volume || 1.0;

        if (options.voice) {
          const voices = this.synth.getVoices();
          utter.voice = voices.find(v => v.voiceURI === options.voice) || null;
        }

        this.utterance.onstart = () => options.onStart?.();
        this.currentOnEndCallback = options.onEnd || null;
        this.utterance.onend = () => {
          this.stopPolling();
          options.onEnd?.();
          this.currentOnEndCallback = null;
          this.utterance = null;
          resolve();
        };
        this.utterance.onerror = (event) => {
          if (event.error === 'synthesis-failed' && retry) {
            // Retry with even shorter text
            const shorter = truncateForSpeech(speakTextToTry, 200);
            return trySpeak(shorter, false).then(resolve).catch(reject);
          }
          const error = new Error(`Speech synthesis error: ${event.error}`);
          options.onError?.(error);
          this.currentOnEndCallback = null;
          this.utterance = null;
          reject(error);
        };
        if (options.onBoundary) {
          this.utterance.onboundary = (event) => {
            const word = speakTextToTry.substring(event.charIndex, event.charIndex + event.charLength);
            options.onBoundary!(word, event.charIndex);
          };
        }
        try {
          this.synth.speak(this.utterance);
          this.startPolling();
        } catch (error) {
          const err = new Error(`Failed to start speech: ${error}`);
          options.onError?.(err);
          this.utterance = null;
          reject(err);
        }
      });
    };

    // Try speaking, retry with shorter text if synthesis-failed
    return trySpeak(speakText, true);

    if (!speakText || speakText.trim().length === 0) {
      const error = new Error('Cannot speak empty text after preprocessing');
      options.onError?.(error);
      throw error;
    }

    this.utterance = new SpeechSynthesisUtterance(speakText);
    this.utterance.rate = options.rate || 1.0;
    this.utterance.pitch = options.pitch || 1.0;
    this.utterance.volume = options.volume || 1.0;

    if (options.voice) {
      const voices = this.synth.getVoices();
      this.utterance.voice = voices.find(v => v.voiceURI === options.voice) || null;
    }

    return new Promise((resolve, reject) => {
      if (!this.utterance) {
        reject(new Error('Failed to create speech utterance'));
        return;
      }

      this.utterance.onstart = () => options.onStart?.();
      
      // Store the onEnd callback for use in stop()
      this.currentOnEndCallback = options.onEnd || null;
      
      this.utterance.onend = () => {
        console.log('BrowserSpeechProvider: onend event fired naturally');
        this.stopPolling(); // Stop polling since we got the natural event
        options.onEnd?.();
        this.currentOnEndCallback = null;
        this.utterance = null;
        resolve();
      };
      
      this.utterance.onerror = (event) => {
        console.error('BrowserSpeechProvider: Speech synthesis error:', {
          error: event.error,
          utterance: event.utterance,
          isStoppedIntentionally: this.isStoppedIntentionally,
          text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        });
        
        // Don't treat "interrupted" as an error if we stopped intentionally
        if (this.isStoppedIntentionally && event.error === 'interrupted') {
          options.onEnd?.();
          this.currentOnEndCallback = null;
          this.utterance = null;
          resolve();
          return;
        }
        
        // Handle synthesis-failed gracefully
        if (event.error === 'synthesis-failed') {
          console.warn('BrowserSpeechProvider: synthesis-failed - possibly empty text, too long text, or browser limitation');
        }
        
        const error = new Error(`Speech synthesis error: ${event.error}`);
        options.onError?.(error);
        this.currentOnEndCallback = null;
        this.utterance = null;
        reject(error);
      };

      // Handle word boundaries for highlighting
      if (options.onBoundary) {
        this.utterance.onboundary = (event) => {
          const word = text.substring(event.charIndex, event.charIndex + event.charLength);
          options.onBoundary!(word, event.charIndex);
        };
      }

      const startSpeaking = () => {
        try {
          this.synth.speak(this.utterance!);
          
          // Start polling to detect when speech actually stops
          this.startPolling();
        } catch (error) {
          const err = new Error(`Failed to start speech: ${error}`);
          options.onError?.(err);
          this.utterance = null;
          reject(err);
        }
      };

      // Reset speech synthesis if it's in a bad state
      if (this.synth.speaking || this.synth.pending) {
        console.warn('BrowserSpeechProvider: Speech synthesis in bad state, resetting...');
        this.synth.cancel();
        // Wait a bit for the cancel to complete before speaking
        setTimeout(startSpeaking, 100);
      } else {
        startSpeaking();
      }
    });
  }

  private startPolling(): void {
    // Clear any existing polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(() => {
      // If we have an utterance but speechSynthesis says it's not speaking
      if (this.utterance && !this.synth.speaking && !this.synth.pending) {
        console.log('BrowserSpeechProvider: Polling detected speech stopped, triggering onEnd');
        this.stopPolling();
        
        if (this.currentOnEndCallback) {
          const callback = this.currentOnEndCallback;
          this.currentOnEndCallback = null;
          this.utterance = null;
          callback();
        }
      }
    }, 500); // Check every 500ms
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  stop(): void {
    console.log('BrowserSpeechProvider: stop() called', { 
      hasUtterance: !!this.utterance, 
      hasCallback: !!this.currentOnEndCallback,
      isStoppedIntentionally: this.isStoppedIntentionally 
    });
    
    // Stop polling
    this.stopPolling();
    
    if (this.utterance || this.currentOnEndCallback) {
      this.isStoppedIntentionally = true;
      
      // Store callback before clearing utterance
      const onEndCallback = this.currentOnEndCallback;
      
      // More aggressive stopping for immediate response
      this.synth.pause(); // Pause first
      this.synth.cancel(); // Then cancel
      
      // Force immediate cancellation in some browsers
      setTimeout(() => {
        if (this.synth.speaking) {
          this.synth.cancel();
        }
      }, 0);
      
      this.utterance = null;
      this.currentOnEndCallback = null;
      
      // Ensure onEnd callback is called even if browser doesn't fire onend event
      if (onEndCallback) {
        console.log('BrowserSpeechProvider: Manually calling onEnd callback');
        setTimeout(() => onEndCallback(), 0);
      }
    }
  }

  pause(): void {
    if (this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
    }
  }

  resume(): void {
    if (this.synth.paused) {
      this.synth.resume();
    }
  }

  cleanup(): void {
    this.stopPolling(); // Stop polling
    this.stop(); // Clean up utterance and cancel speech
    this.isStoppedIntentionally = false;
    this.currentOnEndCallback = null;
  }
}

/**
 * speak.js Provider (Fallback)
 * 
 * Basic offline text-to-speech using speak.js library
 * Always available as last resort
 */
export class SpeakJsProvider implements TTSProvider {
  public name = 'speakjs';
  private speech: any = null;
  private isPlaying = false;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Dynamically import speak-tts (ignore type errors with any)
      const Speech = (await import('speak-tts' as any)).default;
      this.speech = new Speech();
      
      await this.speech.init({
        volume: 1,
        lang: 'en-US',
        rate: 1,
        pitch: 1,
        splitSentences: true
      });
      
      this.isInitialized = true;
      console.log('🔊 speak.js: Initialized successfully');
    } catch (err) {
      console.warn('🔊 speak.js: Failed to initialize, will use silent fallback:', err);
      // Will fall back to silent mode
    }
  }

  async isAvailable(): Promise<boolean> {
    // Always available as fallback (even if silent)
    return true;
  }

  async getVoices(): Promise<Voice[]> {
    await this.initialize();
    
    if (this.speech && this.isInitialized) {
      try {
        const voices = this.speech.voices();
        return voices.map((v: any) => ({
          id: v.voiceURI || v.name,
          name: v.name,
          language: v.lang,
          gender: detectGenderFromVoiceName(v.name),
          provider: 'speakjs'
        }));
      } catch (err) {
        console.warn('🔊 speak.js: Failed to get voices:', err);
      }
    }
    
    // Fallback voice
    return [
      { id: 'speakjs-en', name: 'speak.js English', language: 'en-US', gender: 'neutral', provider: 'speakjs' }
    ];
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    // Stop any current speech
    this.stop();

    // Initialize if needed
    await this.initialize();

    // If speak-tts is available, use it
    if (this.speech && this.isInitialized) {
      return new Promise((resolve, reject) => {
        this.isPlaying = true;
        options.onStart?.();

        this.speech.speak({
          text,
          queue: false,
          listeners: {
            onstart: () => {
              console.log('🔊 speak.js: Started speaking');
            },
            onend: () => {
              console.log('🔊 speak.js: Finished speaking');
              this.isPlaying = false;
              options.onEnd?.();
              resolve();
            },
            onerror: (err: Error) => {
              console.error('🔊 speak.js: Error:', err);
              this.isPlaying = false;
              options.onError?.(err);
              reject(err);
            }
          }
        }).catch((err: Error) => {
          console.error('🔊 speak.js: speak() failed:', err);
          this.isPlaying = false;
          options.onError?.(err);
          reject(err);
        });
      });
    }

    // Fallback: Silent mode with timing simulation
    console.warn('🔊 speak.js: Library not available, using silent fallback');
    return this.silentFallback(text, options);
  }

  private async silentFallback(text: string, options: SpeakOptions = {}): Promise<void> {
    // speak.js is a pure JavaScript TTS engine that doesn't rely on browser APIs
    // Since it's not currently available, we use a basic timing simulation
    // This prevents falling back to broken browser speech synthesis
    return new Promise((resolve) => {
      options.onStart?.();
      this.isPlaying = true;
      
      // Simulate reading time: ~150 words per minute = ~12.5 chars per second = 80ms per char
      const duration = Math.min(text.length * 80, 10000); // Max 10 seconds
      
      setTimeout(() => {
        if (this.isPlaying) {
          options.onEnd?.();
          this.isPlaying = false;
          resolve();
        }
      }, duration);
    });
  }

  stop(): void {
    this.isPlaying = false;
    if (this.speech && this.isInitialized) {
      try {
        this.speech.cancel();
      } catch (err) {
        console.warn('🔊 speak.js: Error stopping speech:', err);
      }
    }
  }

  pause(): void {
    if (this.speech && this.isInitialized) {
      try {
        this.speech.pause();
      } catch (err) {
        console.warn('🔊 speak.js: Pause not supported');
      }
    }
  }

  resume(): void {
    if (this.speech && this.isInitialized) {
      try {
        this.speech.resume();
      } catch (err) {
        console.warn('🔊 speak.js: Resume not supported');
      }
    }
  }

  cleanup(): void {
    this.stop();
    this.speech = null;
    this.isInitialized = false;
  }
}