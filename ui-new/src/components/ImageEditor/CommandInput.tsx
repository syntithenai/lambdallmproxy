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
  placeholder = "Describe transformation (e.g., 'resize to 800px width', 'convert to grayscale', or 'add a dog')",
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasDetectedSpeechRef = useRef(false);
  const interimTranscriptRef = useRef('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize audio analyzer for frequency visualization
  const setupAudioAnalyzer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      dataArrayRef.current = dataArray;

      drawFrequencyBars();
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  // Draw frequency visualization
  const drawFrequencyBars = () => {
    if (!analyserRef.current || !dataArrayRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    const bufferLength = analyser.frequencyBinCount;

    const draw = () => {
      if (!isListening) return;

      animationFrameRef.current = requestAnimationFrame(draw);
      // @ts-ignore - TypeScript has issues with Web Audio API types
      analyser.getByteFrequencyData(dataArray);

      // Clear canvas with dark background
      canvasCtx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      // Draw frequency bars
      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

        // Color gradient based on frequency intensity
        const intensity = dataArray[i] / 255;
        const hue = 200; // Blue-ish hue
        const saturation = 50 + intensity * 30; // More saturated when louder
        const lightness = 40 + intensity * 30; // Brighter when louder
        
        canvasCtx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }

      // Draw center line for reference
      canvasCtx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      canvasCtx.lineWidth = 1;
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, canvas.height / 2);
      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();
  };

  // Cleanup audio resources
  const cleanupAudio = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

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
        setShowOverlay(false);
        
        // Auto-submit if speech was detected and we have text
        const hadSpeech = hasDetectedSpeechRef.current;
        hasDetectedSpeechRef.current = false;
        interimTranscriptRef.current = '';
        
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        cleanupAudio();
        
        // Auto-submit after a short delay if we detected speech
        if (hadSpeech && value.trim()) {
          setTimeout(() => {
            onSubmit();
          }, 500);
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
      cleanupAudio();
    };
  }, [onChange, value, isListening]);

  const handleVoiceInput = async () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setShowOverlay(false);
      cleanupAudio();
    } else {
      try {
        setShowOverlay(true);
        await setupAudioAnalyzer();
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setIsListening(false);
        setShowOverlay(false);
        cleanupAudio();
      }
    }
  };

  // Handle ESC key to close overlay
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showOverlay) {
        handleVoiceInput();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showOverlay]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSubmit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Enter (without shift key for multiline support)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit();
      }
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
              tabIndex={1}
              className="w-full border border-gray-300 rounded-lg p-3 pr-12 resize-none h-24 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              onKeyDown={handleKeyDown}
            />
            
            {/* Microphone button (positioned inside textarea) */}
            {isSupported && (
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={disabled}
                tabIndex={3}
                className={`
                  absolute right-2 top-2 p-2 rounded-full transition-all
                  ${isListening 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                title={isListening ? 'Listening... Click to stop' : 'Click to speak command'}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  {/* Microphone icon */}
                  <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                  <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
                </svg>
              </button>
            )}
          </div>
          
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            tabIndex={2}
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
          <strong>Examples:</strong> "resize to 800px width" • "convert to grayscale" • "rotate 90 degrees" • "add a dog" • "change background to sunset"
          {isSupported && (
            <> • <strong>🎤 Voice:</strong> Click microphone to speak commands (auto-submits)</>
          )}
          {' '}• Press <kbd className="px-1 py-0.5 bg-gray-200 rounded">Enter</kbd> to apply • <kbd className="px-1 py-0.5 bg-gray-200 rounded">Shift+Enter</kbd> for new line
        </div>
      </form>

      {/* Voice Input Overlay with Frequency Analyzer */}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
          <div className="relative bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-2xl w-full mx-4">
            {/* Close button */}
            <button
              onClick={handleVoiceInput}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-blue-500 bg-opacity-20">
                <svg className="w-8 h-8 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                  <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-white mb-2">
                {hasDetectedSpeechRef.current ? 'Listening...' : 'Speak your command'}
              </h3>
              <p className="text-slate-400 text-sm">
                {hasDetectedSpeechRef.current 
                  ? 'Processing your voice input...' 
                  : 'Try: "resize to 800 pixels" or "convert to grayscale"'
                }
              </p>
            </div>

            {/* Frequency Analyzer Canvas */}
            <div className="mb-6 rounded-xl overflow-hidden border border-slate-700 shadow-inner">
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="w-full h-48"
              />
            </div>

            {/* Status indicator */}
            <div className="flex items-center justify-center gap-3 text-slate-300">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-sm font-medium">
                {hasDetectedSpeechRef.current ? 'Speech detected' : 'Ready to listen'}
              </span>
            </div>

            {/* Transcript preview */}
            {interimTranscriptRef.current && (
              <div className="mt-4 p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-slate-300 text-sm italic">
                  "{interimTranscriptRef.current}"
                </p>
              </div>
            )}

            {/* Help text */}
            <div className="mt-6 text-center text-xs text-slate-500">
              Click outside or press ESC to cancel • Stops automatically after 2 seconds of silence
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
