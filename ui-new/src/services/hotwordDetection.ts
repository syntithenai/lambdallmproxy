/**
 * Hotword Detection Service using Browser Speech Recognition
 * 
 * This is a FREE alternative to Picovoice Porcupine that uses the browser's
 * native Web Speech API. No API keys or downloads required!
 * 
 * Trade-offs vs Porcupine:
 * - FREE (no cost)
 * - No setup required
 * - Works in Chrome, Edge, Safari
 * - Requires internet connection (uses cloud speech recognition)
 * - Less accurate than Porcupine (~70-80% vs 95%+)
 * - Higher latency (~500ms vs <200ms)
 * - Privacy: Audio sent to cloud (vs on-device with Porcupine)
 * 
 * Supported wake words: Any phrase you want! Examples:
 * - "hey google"
 * - "ok google"
 * - "hey siri"
 * - "alexa"
 * - "jarvis"
 * - "computer"
 * - Or any custom phrase!
 */

export type HotwordCallback = () => void;

// Declare Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export class HotwordDetectionService {
  private recognition: any = null;
  private isListening: boolean = false;
  private callback: HotwordCallback | null = null;
  private currentHotword: string = 'hey google';
  private isRestarting: boolean = false; // Prevent multiple simultaneous restarts

  /**
   * Initialize browser-based hotword detection
   * 
   * @param hotword - The wake word to listen for (e.g., "hey google", "alexa", "jarvis")
   * @param _sensitivity - Not used in browser implementation (for API compatibility)
   */
  async initialize(hotword: string = 'hey google', _sensitivity: number = 0.5): Promise<void> {
    // Check if browser supports Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      throw new Error('Speech Recognition not supported in this browser. Please use Chrome, Edge, or Safari.');
    }

    try {
      this.currentHotword = hotword.toLowerCase();
      
      // Clean up any existing recognition instance
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {
          // Ignore errors when stopping old instance
        }
        this.recognition = null;
      }
      
      // Create recognition instance
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;  // Keep listening
      this.recognition.interimResults = true;  // Get interim results for faster detection
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;

      console.log(`✅ Browser Speech Recognition initialized with hotword: "${hotword}"`);
    } catch (error) {
      console.error('❌ Failed to initialize Speech Recognition:', error);
      // Clean up on error
      this.recognition = null;
      throw error;
    }
  }

  /**
   * Start listening for hotword using browser speech recognition
   */
  async startListening(callback: HotwordCallback): Promise<void> {
    if (!this.recognition) {
      throw new Error('Speech Recognition not initialized. Call initialize() first.');
    }

    if (this.isListening) {
      console.warn('Already listening for hotword');
      return;
    }

    // Clear any lingering restart flag from previous session
    this.isRestarting = false;
    this.callback = callback;

    try {
      // Set up event handlers
      this.recognition.onresult = (event: any) => {
        const results = event.results;
        const lastResult = results[results.length - 1];
        const transcript = lastResult[0].transcript.toLowerCase().trim();
        
        // Check if transcript contains the hotword
        if (transcript.includes(this.currentHotword)) {
          console.log('🎤 Hotword detected:', transcript);
          this.callback?.();
        }
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        
        // Auto-restart on some errors (but avoid race conditions)
        if ((event.error === 'no-speech' || event.error === 'aborted') && !this.isRestarting) {
          this.scheduleRestart('error');
        }
      };

      this.recognition.onend = () => {
        // Auto-restart if still supposed to be listening (but avoid race conditions)
        if (this.isListening && !this.isRestarting) {
          this.scheduleRestart('end');
        }
      };

      // Start recognition
      this.recognition.start();
      this.isListening = true;
      console.log('👂 Listening for hotword:', this.currentHotword);
    } catch (error) {
      console.error('Failed to start hotword detection:', error);
      this.isListening = false;
      this.callback = null;
      
      // Provide helpful error message
      if (error instanceof Error) {
        if (error.message.includes('not-allowed') || error.message.includes('permission')) {
          throw new Error('Microphone permission denied. Please allow microphone access in your browser settings.');
        } else if (error.message.includes('already started')) {
          throw new Error('Speech recognition already active. Please disable and try again.');
        }
      }
      
      throw error;
    }
  }

  /**
   * Schedule a restart with race condition protection
   */
  private scheduleRestart(source: 'error' | 'end'): void {
    if (this.isRestarting || !this.isListening) {
      return;
    }

    this.isRestarting = true;
    console.log(`Speech recognition ${source}, restarting...`);

    // Use longer delay for errors, shorter for normal end
    const delay = source === 'error' ? 1000 : 200;

    setTimeout(() => {
      if (this.isListening && this.recognition) {
        try {
          this.recognition.start();
          console.log('Speech recognition restarted successfully');
        } catch (error) {
          console.error('Failed to restart speech recognition:', error);
          // If restart fails, reset the flag so we can try again later
        } finally {
          this.isRestarting = false;
        }
      } else {
        this.isRestarting = false;
      }
    }, delay);
  }

  /**
   * Stop listening for hotword
   */
  async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    try {
      this.isListening = false;
      this.isRestarting = false; // Clear restart flag
      this.callback = null;
      
      if (this.recognition) {
        this.recognition.stop();
      }
      
      console.log('Stopped listening for hotword');
    } catch (error) {
      console.error('Failed to stop hotword detection:', error);
    }
  }

  /**
   * Release resources
   */
  async release(): Promise<void> {
    await this.stopListening();
    
    if (this.recognition) {
      this.recognition = null;
      console.log('Speech Recognition released');
    }
  }

  /**
   * Check if currently listening
   */
  isActive(): boolean {
    return this.isListening;
  }
}

// Singleton instance
export const hotwordService = new HotwordDetectionService();
