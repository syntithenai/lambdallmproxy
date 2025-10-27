import React, { useState, useRef, useEffect } from 'react';

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder?: string;
}

export const CommandInput: React.FC<CommandInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Describe transformation (e.g., 'resize to 800px width' or 'convert to grayscale')",
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasDetectedSpeechRef = useRef(false);
  const interimTranscriptRef = useRef('');

  // Check for browser support on mount
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true; // Keep listening for speech
      recognitionRef.current.interimResults = true; // Get interim results for activity detection
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        // Process all results
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Detect speech activity (user has started speaking)
        if (interimTranscript.trim() || finalTranscript.trim()) {
          if (!hasDetectedSpeechRef.current) {
            hasDetectedSpeechRef.current = true;
            console.log('🎤 Speech detected, starting timeout...');
          }

          // Store interim transcript for buffering
          interimTranscriptRef.current = interimTranscript;

          // Clear existing silence timer
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // Set new silence timer (2 seconds after last speech)
          silenceTimerRef.current = setTimeout(() => {
            console.log('🎤 Silence detected, stopping...');
            if (recognitionRef.current) {
              recognitionRef.current.stop();
            }
          }, 2000); // 2 second silence timeout AFTER speech detected
        }

        // Update transcript with final results
        if (finalTranscript) {
          const combinedTranscript = (interimTranscriptRef.current + ' ' + finalTranscript).trim();
          onChange(value ? `${value} ${combinedTranscript}` : combinedTranscript);
          interimTranscriptRef.current = ''; // Clear buffer after using
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        
        // Don't stop on 'no-speech' error - user might still be preparing to speak
        if (event.error === 'no-speech') {
          console.log('🎤 No speech detected yet, continuing to listen...');
          // Restart recognition if user hasn't spoken yet
          if (!hasDetectedSpeechRef.current && isListening) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              // Already running, ignore
            }
          }
        } else {
          // Other errors - stop listening
          setIsListening(false);
          hasDetectedSpeechRef.current = false;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
        }
      };

      recognitionRef.current.onend = () => {
        console.log('🎤 Recognition ended');
        setIsListening(false);
        hasDetectedSpeechRef.current = false;
        interimTranscriptRef.current = '';
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [onChange, value, isListening]);

  const handleVoiceInput = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setIsListening(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSubmit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="bg-white p-4">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              placeholder={placeholder}
              className="w-full border border-gray-300 rounded-lg p-3 pr-12 resize-none h-24 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              onKeyDown={handleKeyDown}
            />
            
            {/* Microphone button (positioned inside textarea) */}
            {isSupported && (
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={disabled}
                className={`
                  absolute right-2 top-2 p-2 rounded-full transition-all
                  ${isListening 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                title={isListening ? 'Listening... Click to stop' : 'Click to speak command'}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              >
                {isListening ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    {/* Recording animation - pulsing circle */}
                    <circle cx="10" cy="10" r="8" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    {/* Microphone icon */}
                    <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                    <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
                  </svg>
                )}
              </button>
            )}
          </div>
          
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className={`
              self-end px-6 py-3 rounded-lg font-medium transition-colors
              ${
                disabled || !value.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            Apply
          </button>
        </div>

        {/* Example Commands */}
        <div className="mt-2 text-xs text-gray-500">
          <strong>Examples:</strong> "resize to 800px width" • "convert to grayscale" • "rotate 90 degrees" •
          "add 10px border"
          {isSupported && (
            <> • <strong>🎤 Voice:</strong> Click microphone to speak commands</>
          )}
          {' '}• Press <kbd className="px-1 py-0.5 bg-gray-200 rounded">Ctrl+Enter</kbd> to apply
        </div>
      </form>
    </div>
  );
};
