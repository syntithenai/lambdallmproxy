/**
 * Web Speech API Provider
 * 
 * Uses the browser's built-in Speech Synthesis API
 */

import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';
import { detectGenderFromVoiceName } from '../../utils/textPreprocessing';

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

    // Trim and limit text length to avoid browser limitations
    const trimmedText = text.trim();
    const maxLength = 32000; // Most browsers have limits around 32KB
    const finalText = trimmedText.length > maxLength 
      ? trimmedText.substring(0, maxLength) + '...' 
      : trimmedText;

    if (trimmedText.length > maxLength) {
      console.warn(`BrowserSpeechProvider: Text truncated from ${trimmedText.length} to ${maxLength} characters`);
    }

    this.utterance = new SpeechSynthesisUtterance(finalText);
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
  private worker: Worker | null = null;
  private isPlaying = false;

  async isAvailable(): Promise<boolean> {
    // Always available as fallback (we'll include speak.js in the build)
    return true;
  }

  async getVoices(): Promise<Voice[]> {
    return [
      { id: 'speakjs-en', name: 'speak.js English', language: 'en-US', gender: 'neutral', provider: 'speakjs' }
    ];
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    // Stop any current speech
    this.stop();

    // For now, fallback to Web Speech API if available since speak.js requires additional setup
    if ('speechSynthesis' in window) {
      const webSpeech = new BrowserSpeechProvider();
      return webSpeech.speak(text, options);
    }

    return new Promise((resolve) => {
      // Simplified implementation - in a real implementation, you'd load speak.js
      // For now, just simulate speech with a delay
      options.onStart?.();
      this.isPlaying = true;
      
      const duration = Math.min(text.length * 50, 5000); // Simulate reading time
      
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
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  pause(): void {
    // Not supported in this basic implementation
  }

  resume(): void {
    // Not supported in this basic implementation
  }

  cleanup(): void {
    this.stop(); // Terminate worker if any
  }
}