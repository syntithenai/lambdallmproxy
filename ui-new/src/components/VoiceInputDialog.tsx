import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { useProviders } from '../hooks/useProviders';
import { getCachedApiBase } from '../utils/api';

interface VoiceInputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscriptionComplete: (text: string, requestId: string, llmApiCall?: any) => void;
  accessToken: string | null;
  apiEndpoint: string;
}

export const VoiceInputDialog: React.FC<VoiceInputDialogProps> = ({ 
  isOpen, 
  onClose, 
  onTranscriptionComplete,
  accessToken,
  apiEndpoint
}) => {
  // keep apiEndpoint prop referenced to avoid unused variable linting
  void apiEndpoint;
  const dialogRef = useDialogClose(isOpen, onClose, false); // Don't close on click outside while recording
  const { providers } = useProviders(); // Get user providers for API keys
  
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(err => {
        console.warn('Failed to close AudioContext:', err);
      });
    }
    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  // Start recording
  const startRecording = async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support audio recording');
      }
      
      // Enumerate devices to check if microphone exists
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      if (audioInputs.length === 0) {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;
      
      // Setup audio context for visualization
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);
      
      // Setup media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      
      // Start VU meter animation
      updateAudioLevel();
      
      // Start silence detection
      detectSilence();
      
    } catch (err: any) {
      console.error('Error starting recording:', err);
      
      // Provide specific error messages
      let errorMessage = 'Failed to access microphone. ';
      
      if (err.name === 'NotFoundError' || err.message.includes('No microphone')) {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone permission denied. Please allow microphone access in your browser settings.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage = 'Your browser does not support audio recording. Please use Chrome, Firefox, or Edge.';
      } else if (err.message) {
        errorMessage = err.message;
      } else {
        errorMessage += 'Please check permissions and try again.';
      }
      
      setError(errorMessage);
    }
  };

  // Update audio level for VU meter
  const updateAudioLevel = () => {
    if (!analyserRef.current || !isRecording) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const normalized = Math.min(average / 128, 1); // Normalize to 0-1
    
    setAudioLevel(normalized);
    
    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
  };

  // Detect silence and auto-stop
  const detectSilence = () => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const SILENCE_THRESHOLD = 10; // Adjust as needed
    const SILENCE_DURATION = 2000; // 2 seconds of silence
    
    if (average < SILENCE_THRESHOLD) {
      if (!silenceTimeoutRef.current) {
        silenceTimeoutRef.current = setTimeout(() => {
          console.log('Silence detected, stopping recording...');
          stopRecording();
        }, SILENCE_DURATION);
      }
    } else {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    }
    
    if (isRecording) {
      setTimeout(detectSilence, 100); // Check every 100ms
    }
  };

  // Stop recording
  const stopRecording = () => {
    cleanup();
  };

  // Transcribe audio using Whisper with retries and API base auto-detection
  const transcribeAudio = async (audioBlob: Blob) => {
    if (!accessToken) {
      setError('Not authenticated. Please sign in.');
      return;
    }

    setIsProcessing(true);

    // Generate request ID for grouping transcription with subsequent chat request
    const requestId = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('🎙️ Generated request ID for voice transcription:', requestId);

    // Priority-based transcription provider selection:
    // 1. Speaches (LOCAL, FREE) - if available
    // 2. Groq (FREE)
    // 3. OpenAI (PAID)
    const speachesProvider = providers.find(p => p.type === 'speaches' && p.enabled !== false);
    const groqProvider = providers.find(p => p.type === 'groq' && p.enabled !== false);
    const openaiProvider = providers.find(p => p.type === 'openai' && p.enabled !== false);
    
    const whisperApiKey = speachesProvider?.apiKey || groqProvider?.apiKey || openaiProvider?.apiKey || null;
    const whisperProvider = speachesProvider ? 'speaches' : (groqProvider ? 'groq' : (openaiProvider ? 'openai' : null));

    if (speachesProvider) {
      console.log('🎤 Transcription provider: 🏠 Speaches (LOCAL, FREE)');
    } else {
      console.log('🎤 Transcription provider:', whisperProvider, 'hasKey:', !!whisperApiKey);
    }

    // Build form data once
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (whisperApiKey && whisperProvider) {
      formData.append('apiKey', whisperApiKey);
      formData.append('provider', whisperProvider);
    }

    // Helper: perform fetch with retries on network failures
    const maxAttempts = 3;
    let lastError: any = null;

    try {
      // Resolve API base dynamically (handles local dev vs remote)
      const resolvedBase = (await getCachedApiBase()).replace('/openai/v1', '');
      const transcribeUrl = `${resolvedBase}/transcribe`;

      console.log('Transcribing audio (resolved):', {
        url: transcribeUrl,
        blobSize: audioBlob.size,
        blobType: audioBlob.type,
        hasToken: !!accessToken,
        requestId,
        provider: whisperProvider,
        hasApiKey: !!whisperApiKey
      });

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000); // 20s

          const response = await fetch(transcribeUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Request-Id': requestId
            },
            body: formData,
            signal: controller.signal
          });

          clearTimeout(timeout);

          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            const errMsg = data?.error || response.statusText || `HTTP ${response.status}`;
            console.error(`Transcription failed (attempt ${attempt}):`, errMsg, data);
            throw new Error(errMsg);
          }

          const text = data.text || data.transcription || '';
          const llmApiCall = data.llmApiCall || null;

          setTranscription(text);
          // Auto-submit after a short delay, passing request ID and llmApiCall to parent
          setTimeout(() => {
            onTranscriptionComplete(text, requestId, llmApiCall);
            onClose();
          }, 500);

          // Success - return the text
          return;
        } catch (fetchErr: any) {
          lastError = fetchErr;
          // If abort due to timeout or network, retry with exponential backoff
          const isNetwork = fetchErr instanceof TypeError && fetchErr.message.includes('Failed to fetch');
          const isAbort = fetchErr.name === 'AbortError';
          console.warn(`Transcription attempt ${attempt} failed:`, fetchErr?.message || fetchErr);
          if (attempt < maxAttempts && (isNetwork || isAbort)) {
            const backoffMs = 500 * Math.pow(2, attempt - 1);
            console.log(`Retrying transcription in ${backoffMs}ms...`);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }
          // Non-retryable or last attempt - rethrow
          throw fetchErr;
        }
      }

      // If loop exits without returning, throw last error
      throw lastError || new Error('Transcription failed');

    } catch (err: any) {
      console.error('Transcription error (final):', err);
      // Provide clearer messages
      let errorMessage = 'Transcription failed';
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        errorMessage = 'Network error: Could not reach transcription service. Check your internet connection and that the backend is running (run `make dev`).';
      } else if (err.name === 'AbortError') {
        errorMessage = 'Transcription request timed out. Please try again.';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      return;
    } finally {
      setIsProcessing(false);
    }
  };

  // Cleanup on unmount or dialog close
  useEffect(() => {
    if (!isOpen) {
      cleanup();
    }
    return cleanup;
  }, [isOpen, cleanup]);

  // Reset state and auto-start recording when dialog opens
  useEffect(() => {
    if (isOpen) {
      // Clear previous transcription and errors
      setTranscription('');
      setError(null);
      
      // Auto-start recording
      if (!isRecording && !isProcessing) {
        startRecording();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {isProcessing ? '🔄 Processing...' : isRecording ? '🎤 Listening...' : '🎙️ Voice Input'}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isProcessing ? 'Transcribing your audio...' : 
             isRecording ? 'Speak now. Will auto-stop after 2 seconds of silence.' : 
             'Click start to begin recording'}
          </p>
        </div>

        {/* VU Meter */}
        <div className="mb-8">
          <div className="relative h-32 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
            {/* Animated bars */}
            <div className="absolute inset-0 flex items-end justify-center gap-1 p-4">
              {[...Array(20)].map((_, i) => {
                const height = Math.max(
                  0.1,
                  audioLevel * (1 - Math.abs(i - 10) / 10) * (0.8 + Math.random() * 0.4)
                );
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t transition-all duration-100 ${
                      isRecording
                        ? audioLevel > 0.3
                          ? 'bg-gradient-to-t from-green-500 to-green-300'
                          : 'bg-gradient-to-t from-blue-500 to-blue-300'
                        : 'bg-gray-400'
                    }`}
                    style={{
                      height: `${height * 100}%`,
                      opacity: isRecording ? 1 : 0.3
                    }}
                  />
                );
              })}
            </div>

            {/* Pulsing microphone icon */}
            {isRecording && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  audioLevel > 0.3 ? 'bg-green-500/20 animate-pulse' : 'bg-blue-500/20'
                }`}>
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Transcription Preview */}
        {transcription && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Transcription:</strong> {transcription}
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          {isRecording && !isProcessing && (
            <button
              onClick={stopRecording}
              className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
              Stop
            </button>
          )}
          
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : 'Cancel'}
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Press <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Esc</kbd> to cancel
        </div>
      </div>
    </div>
  );
};
