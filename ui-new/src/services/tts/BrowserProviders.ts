/**
 * Web Speech API Provider
 * 
 * Uses the browser's built-in Speech Synthesis API
 */

 

/* eslint-disable @typescript-eslint/no-unused-vars */


import type { TTSProvider, Voice, SpeakOptions } from '../../types/tts';
import { detectGenderFromVoiceName, prepareTextForSpeech } from '../../utils/textPreprocessing';

export class BrowserSpeechProvider implements TTSProvider {
  name = 'Browser Speech';
  private synth: SpeechSynthesis;
  private utterance: SpeechSynthesisUtterance | null = null;
  private isStoppedIntentionally = false;
  private currentOnEndCallback: (() => void) | null = null;
  // Use ReturnType<typeof setTimeout> for browser compatibility
  private pollingInterval: ReturnType<typeof setTimeout> | null = null;
  private startTimeout: ReturnType<typeof setTimeout> | null = null; // Track timeout for clearing on stop
  private currentText: string = '';
  private lastWordBoundary: number = 0; // Track last word boundary for accurate restart
  private currentOptions: SpeakOptions = {};
  private boundarySupported: boolean = false; // Will be tested on first boundary event
  private boundaryTested: boolean = false; // Track if we've tested boundary support
  private pendingSpeak: { text: string; options: SpeakOptions } | null = null; // Queue for next utterance

  constructor() {
    this.synth = window.speechSynthesis;
    // Initial check for property existence
    const testUtterance = new SpeechSynthesisUtterance('test');
    const hasProperty = 'onboundary' in testUtterance;
    console.log(`BrowserSpeechProvider: onboundary property ${hasProperty ? 'exists' : 'does not exist'}`);
    console.log(`BrowserSpeechProvider: typeof onboundary = ${typeof testUtterance.onboundary}`);
    console.log(`BrowserSpeechProvider: speechSynthesis object:`, this.synth);
    // We'll detect actual support when the first boundary event fires (or doesn't)
  }

  /**
   * Check if boundary events are supported
   */
  isBoundarySupported(): boolean {
    const result = this.boundarySupported === true;
    console.log(`🔍 BrowserSpeechProvider.isBoundarySupported() called -> ${result}`);
    console.log(`   - boundaryTested: ${this.boundaryTested}`);
    console.log(`   - boundarySupported: ${this.boundarySupported}`);
    return result;
  }

  /**
   * Update playback rate in real-time
   * If boundary events are supported, restart from last spoken word
   */
  setPlaybackRate(rate: number): void {
    console.log(`🎚️ BrowserSpeechProvider.setPlaybackRate(${rate})`);
    console.log(`   - utterance exists: ${!!this.utterance}`);
    console.log(`   - speaking: ${this.synth.speaking}`);
    console.log(`   - boundary tested: ${this.boundaryTested}`);
    console.log(`   - boundary supported: ${this.boundarySupported}`);
    console.log(`   - last word boundary: ${this.lastWordBoundary}`);
    
    // Update current options for next utterance
    this.currentOptions.rate = rate;
    
    if (this.utterance && this.synth.speaking) {
      if (this.boundarySupported && this.currentText) {
        // Restart from last word boundary with new rate
        console.log(`✅ BrowserSpeechProvider: Restarting from word boundary (char ${this.lastWordBoundary}) with rate ${rate}`);
        this.restartFromLastWordBoundary({ rate });
      } else {
        // Fallback: just update the property (won't take effect until next utterance)
        this.utterance.rate = rate;
        console.log(`⚠️ BrowserSpeechProvider: Updated utterance.rate to ${rate} (will apply on next chunk - boundary events not supported)`);
      }
    }
  }

  /**
   * Update volume in real-time
   * If boundary events are supported, restart from last spoken word
   */
  setVolume(volume: number): void {
    console.log(`🔊 BrowserSpeechProvider.setVolume(${volume}) - boundary supported: ${this.boundarySupported}`);
    
    // Update current options for next utterance
    this.currentOptions.volume = volume;
    
    if (this.utterance) {
      if (this.boundarySupported && this.synth.speaking && this.currentText) {
        // Restart from last word boundary with new volume
        console.log(`✅ BrowserSpeechProvider: Restarting from word boundary (char ${this.lastWordBoundary}) with volume ${volume}`);
        this.restartFromLastWordBoundary({ volume });
      } else {
        // Fallback: just update the property (won't take effect until next utterance)
        this.utterance.volume = volume;
        console.log(`⚠️ BrowserSpeechProvider: Updated utterance.volume to ${volume} (will apply on next chunk - boundary events not supported)`);
      }
    }
  }

  /**
   * Restart speech from the last word boundary with updated settings
   */
  private restartFromLastWordBoundary(newOptions: Partial<SpeakOptions>): void {
    if (!this.currentText || !this.synth.speaking) return;

    // Get text from last word boundary onwards
    const remainingText = this.currentText.substring(this.lastWordBoundary);
    if (!remainingText.trim()) return;

    console.log(`BrowserSpeechProvider: Restarting from "${remainingText.substring(0, 50)}..." with options:`, newOptions);

    // Store the current onEnd callback before stopping
    const savedOnEnd = this.currentOnEndCallback;

    // Stop current speech
    this.isStoppedIntentionally = true;
    this.synth.cancel();

    // Merge options
    const options = { ...this.currentOptions, ...newOptions };
    
    // Restore the onEnd callback
    if (savedOnEnd) {
      options.onEnd = savedOnEnd;
    }

    // Small delay to ensure cancel completes
    setTimeout(() => {
      this.isStoppedIntentionally = false;
      // Restart with updated options
      this.speakInternal(remainingText, options);
    }, 50);
  }



  async isAvailable(): Promise<boolean> {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  /**
   * Filter voices by language based on voice name and lang code
   * Maps UI language codes to voice name prefixes and language codes
   */
  private filterVoicesByLanguage(voices: SpeechSynthesisVoice[], languageCode?: string): SpeechSynthesisVoice[] {
    if (!languageCode || languageCode === 'en') {
      // Default to English
      return voices.filter(v => 
        v.name.toLowerCase().startsWith('english') || 
        v.lang.toLowerCase().startsWith('en')
      );
    }

    // Map language codes to voice name prefixes and lang codes
    const languageMap: Record<string, { prefixes: string[], langCodes: string[] }> = {
      'es': { prefixes: ['spanish', 'español'], langCodes: ['es'] },
      'fr': { prefixes: ['french', 'français'], langCodes: ['fr'] },
      'de': { prefixes: ['german', 'deutsch'], langCodes: ['de'] },
      'nl': { prefixes: ['dutch', 'nederlands'], langCodes: ['nl'] },
      'pt': { prefixes: ['portuguese', 'português'], langCodes: ['pt'] },
      'ru': { prefixes: ['russian', 'русский'], langCodes: ['ru'] },
      'zh': { prefixes: ['chinese', 'mandarin', '中文'], langCodes: ['zh', 'cmn'] },
      'ja': { prefixes: ['japanese', '日本語'], langCodes: ['ja'] },
      'ar': { prefixes: ['arabic', 'العربية'], langCodes: ['ar'] }
    };

    const langConfig = languageMap[languageCode];
    if (!langConfig) {
      console.warn(`Unknown language code: ${languageCode}, falling back to all voices`);
      return voices;
    }

    const filtered = voices.filter(v => {
      const nameLower = v.name.toLowerCase();
      const langLower = v.lang.toLowerCase();
      
      // Check if voice name starts with any of the language prefixes
      const matchesPrefix = langConfig.prefixes.some(prefix => 
        nameLower.startsWith(prefix)
      );
      
      // Check if voice lang code starts with any of the language codes
      const matchesLangCode = langConfig.langCodes.some(code => 
        langLower.startsWith(code)
      );
      
      return matchesPrefix || matchesLangCode;
    });

    console.log(`🌍 Filtered voices for language '${languageCode}': ${filtered.length} of ${voices.length} voices`);
    return filtered;
  }

  async getVoices(languageCode?: string): Promise<Voice[]> {
    // Web Speech API voices are loaded synchronously by the browser
    // No need to wait - getVoices() returns immediately
    const allVoices = this.synth.getVoices();
    
    console.log(`🎤 BrowserSpeechProvider.getVoices() called with languageCode: ${languageCode || 'undefined'}`);
    console.log(`   Total voices from browser: ${allVoices.length}`);
    
    // Deduplicate voices by voiceURI (eSpeak creates many duplicates)
    const uniqueVoices = Array.from(
      new Map(allVoices.map(v => [v.voiceURI, v])).values()
    );
    console.log(`   Unique voices after deduplication: ${uniqueVoices.length}`);
    
    // Filter by language if specified
    const voices = languageCode ? this.filterVoicesByLanguage(uniqueVoices, languageCode) : uniqueVoices;
    
    // Separate local and remote voices
    const localVoices = voices.filter(v => v.localService);
    const remoteVoices = voices.filter(v => !v.localService);
    
    console.log(`🎤 BrowserSpeechProvider: Found ${localVoices.length} local voices, ${remoteVoices.length} remote voices (language: ${languageCode || 'all'})`);
    if (localVoices.length > 0) {
      console.log(`   Sample local voices:`, localVoices.slice(0, 5).map(v => `${v.name} (${v.voiceURI})`));
    }
    if (remoteVoices.length > 0) {
      console.log(`   Sample remote voices:`, remoteVoices.slice(0, 5).map(v => `${v.name} (${v.voiceURI})`));
    }
    
    // Show remote voices FIRST (better quality), then local voices
    const sortedVoices = [...remoteVoices, ...localVoices];
    
    return sortedVoices.map(v => ({
      id: v.voiceURI,
      name: v.name,
      language: v.lang,
      gender: detectGenderFromVoiceName(v.name),
      provider: 'browser',
      isLocal: v.localService // Add flag to indicate if voice is local
    }));
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    console.log(`🎤 BrowserSpeechProvider.speak() called:`, {
      textLength: text?.length || 0,
      textPreview: text?.substring(0, 50),
      hasOnStart: !!options.onStart,
      hasOnEnd: !!options.onEnd,
      hasOnError: !!options.onError,
      rate: options.rate,
      volume: options.volume,
      isSpeaking: this.synth.speaking,
      isPending: this.synth.pending,
      isStoppedIntentionally: this.isStoppedIntentionally
    });
    
    // Validate text input
    if (!text || text.trim().length === 0) {
      console.error(`❌ BrowserSpeechProvider: Cannot speak empty text`);
      const error = new Error('Cannot speak empty text');
      options.onError?.(error);
      throw error;
    }

    // CRITICAL: Reset stop flag at the START of speak() - this is a NEW speak request
    // The flag should only block speak() if stop() was called DURING this speak() call
    // Not if it was called from a previous speak() that already finished
    if (this.isStoppedIntentionally && (this.synth.speaking || this.synth.pending)) {
      // Only block if we're actually in the middle of speaking
      console.log('🛑 BrowserSpeechProvider: Stop was called during active speech, rejecting');
      throw new Error('Speech stopped intentionally');
    }
    
    // Clear the stop flag for this new speak request
    console.log('✅ BrowserSpeechProvider: Clearing isStoppedIntentionally flag for new speak()');
    this.isStoppedIntentionally = false;

    // CRITICAL: Force clear any existing speech synthesis state before checking if speaking
    // This is especially important when browser speech is used as a fallback from another provider
    // The synth might be in a weird state from previous provider's usage
    if (this.synth.speaking || this.synth.pending) {
      console.log('🧹 BrowserSpeechProvider: Clearing existing speech state before new speak()');
      this.synth.cancel();
      // Small delay to ensure cancel completes
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Now re-check if still speaking (should be clear now)
    if (this.synth.speaking || this.synth.pending) {
      console.log('⚠️ BrowserSpeechProvider: Still speaking after cancel, queueing next utterance');
      this.pendingSpeak = { text, options };
      
      // Wait for stop to be called or for pending to be processed
      return new Promise<void>((resolve, reject) => {
        const checkInterval = setInterval(() => {
          // Check if stop was called
          if (this.isStoppedIntentionally) {
            console.log('🛑 BrowserSpeechProvider: Stop called while queued, aborting');
            clearInterval(checkInterval);
            this.pendingSpeak = null;
            reject(new Error('Speech stopped intentionally'));
            return;
          }
          
          // Check if we're no longer pending (someone else processed us or we were cleared)
          if (this.pendingSpeak === null) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });
    }

    // Not speaking, safe to start immediately
    console.log('🎤 BrowserSpeechProvider: Not currently speaking, starting immediately');

    // Reset state (already reset isStoppedIntentionally above)
    this.currentOnEndCallback = null;
    this.currentText = prepareTextForSpeech(text);
    this.lastWordBoundary = 0; // Reset to start of text
    this.currentOptions = options;

    return this.speakInternal(this.currentText, options);
  }

  private speakInternal(text: string, options: SpeakOptions = {}): Promise<void> {
    // Helper to actually speak, with retry on synthesis-failed
    const trySpeak = (speakTextToTry: string, retry: boolean): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!speakTextToTry || speakTextToTry.trim().length === 0) {
          const error = new Error('Cannot speak empty text after preprocessing');
          options.onError?.(error);
          return reject(error);
        }

        // Ensure voices are loaded before creating utterance
        const voices = this.synth.getVoices();
        if (voices.length === 0) {
          console.warn('No voices available yet, waiting for voiceschanged event...');
          // Try to trigger voice loading
          const loadVoices = () => {
            const loadedVoices = this.synth.getVoices();
            if (loadedVoices.length > 0) {
              console.log(`Voices loaded: ${loadedVoices.length} available`);
              this.synth.removeEventListener('voiceschanged', loadVoices);
              // Retry speak after voices load
              trySpeak(speakTextToTry, retry).then(resolve).catch(reject);
            }
          };
          this.synth.addEventListener('voiceschanged', loadVoices);
          // Timeout after 2 seconds
          setTimeout(() => {
            this.synth.removeEventListener('voiceschanged', loadVoices);
            const nowVoices = this.synth.getVoices();
            if (nowVoices.length === 0) {
              const error = new Error('No voices available for speech synthesis');
              options.onError?.(error);
              reject(error);
            }
          }, 2000);
          return;
        }

        this.utterance = new SpeechSynthesisUtterance(speakTextToTry);
        const utter = this.utterance;
        
        // Debug: Log the options being received
        console.log('🎚️ BrowserSpeechProvider: Setting rate and volume', {
          'options.rate': options.rate,
          'options.volume': options.volume,
          'rate || 1.0': options.rate || 1.0,
          'volume || 1.0': options.volume || 1.0
        });
        
        utter.rate = options.rate || 1.0;
        utter.volume = options.volume || 1.0;
        // Removed pitch control

        if (options.voice) {
          const voices = this.synth.getVoices();
          console.log(`🔍 BrowserSpeechProvider: Looking for voice with URI: "${options.voice}"`);
          console.log(`   Total available voices: ${voices.length}`);
          
          const matchedVoice = voices.find(v => v.voiceURI === options.voice);
          
          if (!matchedVoice) {
            console.error(`❌ BrowserSpeechProvider: Could not find voice with URI: "${options.voice}"`);
            console.log(`   Available voice URIs:`, voices.map(v => `${v.voiceURI} (${v.name})`));
            console.log(`   First 5 voices:`, voices.slice(0, 5).map(v => ({ uri: v.voiceURI, name: v.name, lang: v.lang })));
            
            // Try to find an English voice as fallback instead of using first voice
            const englishVoice = voices.find(v => 
              v.lang.toLowerCase().startsWith('en-') || 
              v.name.toLowerCase().includes('english') ||
              v.name.toLowerCase().includes('us') ||
              v.name.toLowerCase().includes('uk')
            );
            
            if (englishVoice) {
              utter.voice = englishVoice;
              console.warn(`⚠️ BrowserSpeechProvider: Falling back to English voice: ${englishVoice.name} (${englishVoice.voiceURI}, lang: ${englishVoice.lang})`);
            } else {
              // Last resort: use first voice
              utter.voice = null;
              const defaultVoice = this.synth.getVoices()[0];
              console.warn(`⚠️ BrowserSpeechProvider: No English voice found, using default: ${defaultVoice?.name || 'unknown'} (${defaultVoice?.voiceURI || 'unknown'})`);
            }
          } else {
            utter.voice = matchedVoice;
            console.log(`✅ BrowserSpeechProvider: Matched voice: ${utter.voice.name} (${utter.voice.lang})`);
            console.log(`   Voice URI: ${utter.voice.voiceURI}, Local: ${utter.voice.localService}`);
          }
        } else {
          // No voice specified - try to find an English voice
          const englishVoice = voices.find(v => 
            v.lang.toLowerCase().startsWith('en-') || 
            v.name.toLowerCase().includes('english') ||
            v.name.toLowerCase().includes('us') ||
            v.name.toLowerCase().includes('uk')
          );
          
          if (englishVoice) {
            utter.voice = englishVoice;
            console.log(`🎤 BrowserSpeechProvider: No voice specified, using English voice: ${englishVoice.name} (${englishVoice.voiceURI}, lang: ${englishVoice.lang})`);
          } else {
            utter.voice = null;
            const defaultVoice = this.synth.getVoices()[0];
            console.log(`🎤 BrowserSpeechProvider: No voice specified, using default: ${defaultVoice?.name || 'unknown'} (${defaultVoice?.voiceURI || 'unknown'})`);
          }
        }

        // Set a timeout to detect if onstart never fires (common browser bug)
        this.startTimeout = setTimeout(() => {
          // CRITICAL: Check if stop was called before retrying
          if (this.isStoppedIntentionally) {
            console.log('🛑 BrowserSpeechProvider: onstart timeout fired but stop was called, NOT retrying');
            this.startTimeout = null;
            return;
          }
          
          console.error('❌ BrowserSpeechProvider: onstart event never fired after 3000ms!');
          console.error('   Browser likely blocked speech or synthesis queue is stuck');
          console.error('   Clearing queue and rejecting...');
          
          // Clear the queue
          this.synth.cancel();
          this.startTimeout = null;
          
          // Reject the promise instead of retrying infinitely
          const error = new Error('Browser Speech synthesis failed to start (onstart timeout)');
          options.onError?.(error);
          reject(error);
        }, 3000);
        
        this.utterance.onstart = () => {
          // Cancel the timeout since onstart fired successfully
          if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
          }
          console.log('🎤 BrowserSpeechProvider: Speech started, waiting for boundary events...');
          console.log(`   Voice: ${utter.voice?.name || 'default'}, Rate: ${utter.rate}, Volume: ${utter.volume}`);
          options.onStart?.();
          
          // If boundary events haven't fired after 2 seconds, assume not supported
          // Some browsers may take longer to fire the first boundary event
          if (!this.boundaryTested) {
            console.log('⏱️ BrowserSpeechProvider: Starting 2000ms timeout to detect boundary support');
            setTimeout(() => {
              if (!this.boundaryTested) {
                this.boundaryTested = true;
                this.boundarySupported = false;
                console.log('⚠️ BrowserSpeechProvider: Boundary events NOT SUPPORTED (timeout after 2000ms)');
                console.log('   This voice/browser combination does not fire boundary events');
                console.log('   Live settings changes will be disabled during playback');
              }
            }, 2000);
          }
        };
        this.currentOnEndCallback = options.onEnd || null;
        this.utterance.onend = () => {
          console.log('🎤 BrowserSpeechProvider: onend event fired', {
            isStoppedIntentionally: this.isStoppedIntentionally,
            hasOnEndCallback: !!options.onEnd
          });
          this.stopPolling();
          
          // Only call onEnd if this wasn't an intentional stop
          if (!this.isStoppedIntentionally && options.onEnd) {
            console.log('🎤 BrowserSpeechProvider: Calling onEnd callback');
            options.onEnd();
          } else if (this.isStoppedIntentionally) {
            console.log('🎤 BrowserSpeechProvider: Skipping onEnd callback (intentional stop)');
          }
          
          this.currentOnEndCallback = null;
          this.utterance = null;
          
          // Process pending utterance if one is queued
          if (this.pendingSpeak && !this.isStoppedIntentionally) {
            console.log('🎤 BrowserSpeechProvider: Processing queued utterance');
            const pending = this.pendingSpeak;
            this.pendingSpeak = null;
            
            // Start the queued utterance (don't await, let it run in background)
            this.speakInternal(prepareTextForSpeech(pending.text), pending.options)
              .catch(error => {
                console.error('Error speaking queued utterance:', error);
                pending.options.onError?.(error);
              });
          }
          
          resolve();
        };
        this.utterance.onerror = (event) => {
          console.error(`🎤 BrowserSpeechProvider: Speech error event:`, {
            error: event.error,
            voice: utter.voice?.name || 'default',
            voiceURI: utter.voice?.voiceURI || 'none',
            isLocal: utter.voice?.localService || false
          });
          
          // If this is an "interrupted" error from our aggressive stop(), don't treat it as an error
          if (event.error === 'interrupted' || event.error === 'canceled') {
            console.log('BrowserSpeechProvider: Speech interrupted/canceled (expected from stop)');
            this.currentOnEndCallback = null;
            this.utterance = null;
            resolve(); // Resolve successfully, not an error
            return;
          }
          
          if (event.error === 'synthesis-failed' && retry) {
            // Retry with shorter text
            const shorter = speakTextToTry.substring(0, 200);
            return trySpeak(shorter, false).then(resolve).catch(reject);
          }
          const error = new Error(`Speech synthesis error: ${event.error}`);
          options.onError?.(error);
          this.currentOnEndCallback = null;
          this.utterance = null;
          reject(error);
        };
        
        // Always set up boundary event handler to track position for restart
        // Use addEventListener instead of onboundary property (more reliable)
        const boundaryHandler = (event: SpeechSynthesisEvent) => {
          console.log(`🎯 BrowserSpeechProvider: boundary event fired!`, event);
          
          // Mark boundary events as supported on first fire (ANY boundary event counts)
          if (!this.boundaryTested) {
            this.boundaryTested = true;
            this.boundarySupported = true;
            console.log('✅ BrowserSpeechProvider: Boundary events ARE SUPPORTED - live settings changes enabled');
            console.log(`   First boundary event: name="${event.name}", charIndex=${event.charIndex}`);
          }
          
          // Track last WORD boundary for accurate restart
          if (event.name === 'word') {
            this.lastWordBoundary = event.charIndex;
            console.log(`📍 BrowserSpeechProvider: Word boundary at char ${event.charIndex}`);
          }
          
          // Also call user's boundary callback if provided
          if (options.onBoundary) {
            const word = speakTextToTry.substring(event.charIndex, event.charIndex + (event.charLength || 0));
            options.onBoundary(word, event.charIndex);
          }
        };
        
        // Try BOTH methods to ensure we catch the events
        this.utterance.addEventListener('boundary', boundaryHandler);
        this.utterance.onboundary = boundaryHandler;
        
        console.log(`🔧 BrowserSpeechProvider: Boundary handlers attached:`, {
          hasOnBoundary: typeof this.utterance.onboundary === 'function',
          hasEventListener: true,
          utteranceText: speakTextToTry.substring(0, 50) + '...',
          textLength: speakTextToTry.length
        });
        
        try {
          // Cancel any pending speech to clear the queue
          console.log(`🎤 BrowserSpeechProvider: Calling synth.speak() with:`, {
            voice: utter.voice?.name || 'default',
            voiceURI: utter.voice?.voiceURI || 'none',
            isLocal: utter.voice?.localService || false,
            rate: utter.rate,
            volume: utter.volume,
            textLength: speakTextToTry.length
          });
          console.log(`   Before speak: synth.speaking=${this.synth.speaking}, synth.pending=${this.synth.pending}`);
          this.synth.cancel();
          this.synth.speak(this.utterance);
          this.startPolling();
          console.log(`✓ BrowserSpeechProvider: synth.speak() called successfully`);
          console.log(`   After speak: synth.speaking=${this.synth.speaking}, synth.pending=${this.synth.pending}`);
        } catch (error) {
          console.error(`✗ BrowserSpeechProvider: synth.speak() failed:`, error);
          const err = new Error(`Failed to start speech: ${error}`);
          options.onError?.(err);
          this.utterance = null;
          reject(err);
        }
      });
    };

    // Try speaking, retry with shorter text if synthesis-failed
    return trySpeak(text, true);
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
    console.log('🛑 BrowserSpeechProvider.stop() called'); 
    console.log('   - hasUtterance:', !!this.utterance);
    console.log('   - synth.speaking:', this.synth.speaking);
    console.log('   - synth.pending:', this.synth.pending);
    console.log('   - hasCallback:', !!this.currentOnEndCallback);
    console.log('   - isStoppedIntentionally:', this.isStoppedIntentionally);
    console.log('   - hasPending:', !!this.pendingSpeak);
    console.log('   - hasStartTimeout:', !!this.startTimeout);
    
    // Stop polling
    this.stopPolling();
    
    // Clear start timeout to prevent retry
    if (this.startTimeout) {
      console.log('🛑 BrowserSpeechProvider: Clearing start timeout');
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
    
    // Clear any pending utterances
    if (this.pendingSpeak) {
      console.log('🛑 BrowserSpeechProvider: Clearing pending utterance');
      this.pendingSpeak = null;
    }
    
    if (this.utterance || this.currentOnEndCallback || this.synth.speaking) {
      console.log('🛑 BrowserSpeechProvider: Setting isStoppedIntentionally = true');
      this.isStoppedIntentionally = true;
      
      // Clear the callback WITHOUT calling it (prevent restart)
      this.currentOnEndCallback = null;
      
      // ULTRA AGGRESSIVE: Multiple cancel attempts with pause
      // Chrome especially needs pause() before cancel() to stop mid-sentence
      console.log('🛑 BrowserSpeechProvider: Calling pause() + cancel() multiple times...');
      
      // Aggressive sequence for Chrome
      this.synth.pause();   // Pause first
      this.synth.cancel();  // Cancel #1
      this.synth.pause();   // Pause again
      this.synth.cancel();  // Cancel #2
      this.synth.resume();  // Resume (clears paused state)
      this.synth.cancel();  // Cancel #3
      
      // Force immediate cancellation with setTimeout
      setTimeout(() => {
        console.log('🛑 BrowserSpeechProvider: Cancel #4 (0ms delay)');
        this.synth.pause();
        this.synth.cancel();
      }, 0);
      
      // Another cancel after a small delay
      setTimeout(() => {
        console.log('🛑 BrowserSpeechProvider: Cancel #5 (10ms delay)');
        this.synth.cancel();
      }, 10);
      
      // More aggressive cancels
      setTimeout(() => {
        console.log('🛑 BrowserSpeechProvider: Cancel #6 (50ms delay)');
        this.synth.pause();
        this.synth.cancel();
      }, 50);
      
      // Final cancel after longer delay
      setTimeout(() => {
        console.log('🛑 BrowserSpeechProvider: Cancel #7 (100ms delay)');
        this.synth.cancel();
      }, 100);
      
      this.utterance = null;
      
      console.log('🛑 BrowserSpeechProvider: Stop complete');
    } else {
      console.log('⚠️ BrowserSpeechProvider: Nothing to stop (no utterance, callback, or speaking)');
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
  private currentRate: number = 1.0;
  private currentVolume: number = 1.0;

  /**
   * speak.js doesn't support boundary events
   */
  isBoundarySupported(): boolean {
    return false;
  }

  /**
   * Set playback rate (speed)
   */
  setPlaybackRate(rate: number): void {
    console.log(`🔊 speak.js: setPlaybackRate(${rate})`);
    this.currentRate = rate;
    
    // If speech is initialized, update the instance settings
    if (this.speech && this.isInitialized) {
      try {
        // speak-tts uses setRate() method to update the rate on the instance
        if (typeof this.speech.setRate === 'function') {
          this.speech.setRate(rate);
          console.log(`🔊 speak.js: Successfully called speech.setRate(${rate})`);
        } else {
          console.warn('🔊 speak.js: speech.setRate() method not available');
        }
      } catch (err) {
        console.warn('🔊 speak.js: Error setting rate on speech instance:', err);
      }
    }
  }

  /**
   * Set volume
   */
  setVolume(volume: number): void {
    console.log(`🔊 speak.js: setVolume(${volume})`);
    this.currentVolume = volume;
    
    // If speech is initialized, update the instance settings
    if (this.speech && this.isInitialized) {
      try {
        // speak-tts uses setVolume() method to update the volume on the instance
        if (typeof this.speech.setVolume === 'function') {
          this.speech.setVolume(volume);
          console.log(`🔊 speak.js: Successfully called speech.setVolume(${volume})`);
        } else {
          console.warn('🔊 speak.js: speech.setVolume() method not available');
        }
      } catch (err) {
        console.warn('🔊 speak.js: Error setting volume on speech instance:', err);
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // CRITICAL: Force clear any stuck Web Speech API state before initializing
    // This fixes the issue where speechSynthesis gets stuck and won't play until browser restart
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      console.log('🔊 speak.js: Clearing stuck speechSynthesis state before init...');
      try {
        // Cancel any pending utterances
        window.speechSynthesis.cancel();
        
        // Some browsers need a small delay after cancel
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Double-check state is clear
        const status = {
          speaking: window.speechSynthesis.speaking,
          pending: window.speechSynthesis.pending,
          paused: window.speechSynthesis.paused
        };
        console.log('🔊 speak.js: speechSynthesis state after cleanup:', status);
        
        // If still speaking/pending, try more aggressive cleanup
        if (status.speaking || status.pending) {
          console.warn('🔊 speak.js: speechSynthesis still stuck, trying resume+cancel...');
          window.speechSynthesis.resume();
          await new Promise(resolve => setTimeout(resolve, 50));
          window.speechSynthesis.cancel();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err) {
        console.warn('🔊 speak.js: Error during speechSynthesis cleanup:', err);
      }
    }
    
    try {
      // Dynamically import speak-tts (ignore type errors with any)
      const Speech = (await import('speak-tts' as any)).default;
      this.speech = new Speech();
      
      const initResult = await this.speech.init({
        volume: this.currentVolume,
        lang: 'en-US',
        rate: this.currentRate,
        pitch: 1,
        splitSentences: true,
        listeners: {
          onvoiceschanged: (voices: any) => {
            console.log('🔊 speak.js: Voices changed, count:', voices?.length);
          }
        }
      });
      
      console.log('🔊 speak.js: Init result:', initResult);
      console.log('🔊 speak.js: Initialized with rate:', this.currentRate, 'volume:', this.currentVolume);
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

  async getVoices(_languageCode?: string): Promise<Voice[]> {
    // speak.js only has one voice - no need to initialize or wait
    return [
      { id: 'speakjs-en', name: 'speak.js English', language: 'en-US', gender: 'neutral', provider: 'speakjs' }
    ];
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    // Initialize if needed (or re-initialize if cleanup was called)
    if (!this.speech || !this.isInitialized) {
      console.log('🔊 speak.js: Not initialized, initializing now...');
      await this.initialize();
    }

    // If speak-tts is available, use it
    if (this.speech && this.isInitialized) {
      // CRITICAL: Wait for voices to be loaded before speaking
      // Without this, speechSynthesis.speak() may silently fail
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        console.log('🔊 speak.js: Available voices count:', voices.length);
        
        if (voices.length === 0) {
          console.warn('🔊 speak.js: No voices loaded yet, waiting for voiceschanged event...');
          await new Promise<void>((resolve) => {
            let resolved = false;
            const timeout = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                console.warn('🔊 speak.js: Timeout waiting for voices, proceeding anyway');
                resolve();
              }
            }, 1000);
            
            window.speechSynthesis.onvoiceschanged = () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                const newVoices = window.speechSynthesis.getVoices();
                console.log('🔊 speak.js: Voices loaded after waiting:', newVoices.length);
                resolve();
              }
            };
            
            // Check again immediately in case voices loaded during setup
            const recheckVoices = window.speechSynthesis.getVoices();
            if (recheckVoices.length > 0 && !resolved) {
              resolved = true;
              clearTimeout(timeout);
              console.log('🔊 speak.js: Voices already loaded on recheck:', recheckVoices.length);
              resolve();
            }
          });
        }
      }
      
      console.log('🔊 speak.js: Calling speak() with text length:', text.length);
      console.log('🔊 speak.js: this.speech object:', this.speech);
      console.log('🔊 speak.js: typeof this.speech.speak:', typeof this.speech.speak);
      
      // CRITICAL: Force clear any stuck Web Speech API state before speaking
      // This prevents the "sometimes doesn't play" issue that persists across page reloads
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const beforeStatus = {
          speaking: window.speechSynthesis.speaking,
          pending: window.speechSynthesis.pending,
          paused: window.speechSynthesis.paused
        };
        console.log('🔊 speak.js: Browser speechSynthesis status BEFORE cleanup:', beforeStatus);
        
        // If there's stuck state, aggressively clear it
        if (beforeStatus.speaking || beforeStatus.pending || beforeStatus.paused) {
          console.warn('🔊 speak.js: Detected stuck speechSynthesis state, clearing...');
          try {
            window.speechSynthesis.cancel();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // If still stuck, try resume+cancel
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
              console.warn('🔊 speak.js: Still stuck, trying resume+cancel...');
              window.speechSynthesis.resume();
              await new Promise(resolve => setTimeout(resolve, 50));
              window.speechSynthesis.cancel();
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (err) {
            console.warn('🔊 speak.js: Error clearing stuck state:', err);
          }
        }
        
        const afterStatus = {
          speaking: window.speechSynthesis.speaking,
          pending: window.speechSynthesis.pending,
          paused: window.speechSynthesis.paused
        };
        console.log('🔊 speak.js: Browser speechSynthesis status AFTER cleanup:', afterStatus);
      }
      
      return new Promise<void>((resolve, reject) => {
        this.isPlaying = true;
        
        // Fallback timeout in case events never fire (10 seconds)
        const timeoutId = setTimeout(() => {
          console.warn('🔊 speak.js: Timeout after 10s - no events fired, resolving anyway');
          this.isPlaying = false;
          resolve();
        }, 10000);

        try {
          console.log('🔊 speak.js: About to call this.speech.speak()...');
          console.log('🔊 speak.js: Options rate:', options.rate, 'Options volume:', options.volume);
          console.log('🔊 speak.js: Stored currentRate:', this.currentRate, 'currentVolume:', this.currentVolume);
          
          // Use either the provided options or our stored values
          const finalRate = options.rate ?? this.currentRate;
          const finalVolume = options.volume ?? this.currentVolume;
          
          // Update stored values
          this.currentRate = finalRate;
          this.currentVolume = finalVolume;
          
          // Update the speech instance with the current rate/volume
          // This ensures the settings are applied even for queued utterances
          try {
            if (typeof this.speech.setRate === 'function') {
              this.speech.setRate(finalRate);
              console.log('🔊 speak.js: Set instance rate to', finalRate);
            }
            if (typeof this.speech.setVolume === 'function') {
              this.speech.setVolume(finalVolume);
              console.log('🔊 speak.js: Set instance volume to', finalVolume);
            }
          } catch (err) {
            console.warn('🔊 speak.js: Error setting rate/volume on instance before speak:', err);
          }
          
          console.log('🔊 speak.js: Final rate:', finalRate, 'Final volume:', finalVolume);
          
          // Don't pass rate/volume in the speak call - they're set on the instance
          const speakPromise = this.speech.speak({
            text,
            queue: true, // Queue chunks sequentially instead of interrupting
            listeners: {
              onstart: () => {
                console.log('🔊 speak.js: Started speaking (onstart fired)');
                clearTimeout(timeoutId);
                // Call onStart callback when speech actually starts
                options.onStart?.();
              },
              onend: () => {
                console.log('🔊 speak.js: Finished speaking (onend fired)');
                clearTimeout(timeoutId);
                this.isPlaying = false;
                options.onEnd?.();
                resolve();
              },
              onerror: (err: Error) => {
                console.error('🔊 speak.js: Error (onerror fired):', err);
                clearTimeout(timeoutId);
                this.isPlaying = false;
                options.onError?.(err);
                reject(err);
              }
            }
          });
          
          console.log('🔊 speak.js: this.speech.speak() returned:', speakPromise);
          console.log('🔊 speak.js: speakPromise type:', typeof speakPromise);
          
          if (speakPromise && typeof speakPromise.then === 'function') {
            speakPromise.then((result: any) => {
              console.log('🔊 speak.js: speak() promise resolved:', result);
            }).catch((err: Error) => {
              console.error('🔊 speak.js: speak() promise rejected:', err);
              clearTimeout(timeoutId);
              this.isPlaying = false;
              options.onError?.(err);
              reject(err);
            });
          } else {
            console.warn('🔊 speak.js: speak() did not return a promise!');
          }
        } catch (err) {
          console.error('🔊 speak.js: Exception calling speak():', err);
          clearTimeout(timeoutId);
          this.isPlaying = false;
          options.onError?.(err as Error);
          reject(err);
        }
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
    console.log('🔊 speak.js: stop() called');
    this.isPlaying = false;
    if (this.speech && this.isInitialized) {
      try {
        console.log('🔊 speak.js: Calling speech.cancel()');
        this.speech.cancel();
        
        // Also force cancel on the underlying Web Speech API to prevent stuck state
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          console.log('🔊 speak.js: Also calling window.speechSynthesis.cancel() for cleanup');
          window.speechSynthesis.cancel();
        }
      } catch (err) {
        console.warn('🔊 speak.js: Error stopping speech:', err);
      }
    } else {
      console.log('🔊 speak.js: stop() - speech not initialized, nothing to cancel');
      
      // Even if not initialized, try to clear any stuck Web Speech API state
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          console.log('🔊 speak.js: Clearing window.speechSynthesis directly (not initialized case)');
          window.speechSynthesis.cancel();
        } catch (err) {
          console.warn('🔊 speak.js: Error clearing speechSynthesis in stop():', err);
        }
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
    console.log('🔊 speak.js: cleanup() called');
    this.stop();
    
    // Force clear Web Speech API state during cleanup
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        console.log('🔊 speak.js: Forcing speechSynthesis.cancel() during cleanup');
        window.speechSynthesis.cancel();
      } catch (err) {
        console.warn('🔊 speak.js: Error during cleanup cancel:', err);
      }
    }
    
    this.speech = null;
    this.isInitialized = false;
  }
}