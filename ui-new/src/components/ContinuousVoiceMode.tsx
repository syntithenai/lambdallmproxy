import { useState, useEffect, useRef } from 'react';
import { hotwordService } from '../services/hotwordDetection';
import { useToast } from './ToastManager';
import './ContinuousVoiceMode.css';
import { getCachedApiBase } from '../utils/api';

type ConversationState = 'hotword' | 'listening' | 'thinking' | 'speaking';

interface ContinuousVoiceModeProps {
  onVoiceRequest?: (text: string) => void;
  onTranscriptionStart?: () => void;
  accessToken: string | null;
  apiEndpoint: string;
  isProcessing?: boolean;
  isSpeaking?: boolean;
  enabled?: boolean; // External control for enabled state
  onEnabledChange?: (enabled: boolean) => void; // Callback when enabled state changes
}

export function ContinuousVoiceMode({ 
  onVoiceRequest,
  onTranscriptionStart,
  accessToken,
  apiEndpoint,
  isProcessing = false,
  isSpeaking = false,
  enabled = false,
  onEnabledChange
}: ContinuousVoiceModeProps) {
  // keep apiEndpoint referenced to avoid unused variable linting (we resolve base via getCachedApiBase)
  void apiEndpoint;
  
  // Toast notifications
  const { showPersistentToast, removeToast, updateToast } = useToast();
  const toastIdRef = useRef<string | null>(null);
  
  // Update toast message based on state
  const updateToastMessage = (message: string) => {
    if (toastIdRef.current) {
      updateToast(toastIdRef.current, message);
    }
  };
  
  // Use external enabled state if provided, otherwise manage internally
  const [isEnabled, setIsEnabled] = useState(enabled);
  
  // Sync with external enabled prop
  useEffect(() => {
    setIsEnabled(enabled);
  }, [enabled]);
  
  // Notify parent when enabled state changes
  const handleSetEnabled = (newEnabled: boolean) => {
    setIsEnabled(newEnabled);
    onEnabledChange?.(newEnabled);
  };
  
  const [state, setState] = useState<ConversationState>('hotword');
  const [transcript, setTranscript] = useState('');
  const [turnCount, setTurnCount] = useState(0);
  
  // Settings
  const [hotword, setHotword] = useState(() => {
    return localStorage.getItem('continuousVoice_hotword') || 'hey google';
  });
  const [sensitivity, setSensitivity] = useState(() => {
    return parseFloat(localStorage.getItem('continuousVoice_sensitivity') || '0.5');
  });
  const [timeoutDuration, setTimeoutDuration] = useState(() => {
    return parseInt(localStorage.getItem('continuousVoice_timeout') || '10000');
  });
  
  const timeoutRef = useRef<number | null>(null);
  const maxTurns = 100; // Prevent infinite loops

  // Recording state management
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceCheckIntervalRef = useRef<number | null>(null);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('continuousVoice_hotword', hotword);
    localStorage.setItem('continuousVoice_sensitivity', sensitivity.toString());
    localStorage.setItem('continuousVoice_timeout', timeoutDuration.toString());
  }, [hotword, sensitivity, timeoutDuration]);

  // Sync state with external processing/speaking state
  useEffect(() => {
    if (isProcessing) {
      setState('thinking');
    } else if (isSpeaking) {
      setState('speaking');
    }
  }, [isProcessing, isSpeaking]);

  // When speaking completes, auto-restart or timeout
  useEffect(() => {
    if (state === 'speaking' && !isSpeaking && isEnabled) {
      // Speaking just finished, auto-restart listening
      console.log('🔄 TTS complete, auto-restarting listening...');
      const newTurnCount = turnCount + 1;
      setTurnCount(newTurnCount);
      
      if (newTurnCount >= maxTurns) {
        console.warn('⚠️ Max turns reached, stopping continuous mode');
        handleSetEnabled(false);
        return;
      }

      setState('listening');
      startRecording();
      startTimeout();
    }
  }, [isSpeaking, state, isEnabled, turnCount]);

  useEffect(() => {
    if (isEnabled) {
      initializeContinuousMode();
      // Show persistent toast when enabled
      if (!toastIdRef.current) {
        toastIdRef.current = showPersistentToast(
          '🎤 Listening for "' + hotword + '"...',
          'info',
          {
            label: 'Stop',
            onClick: () => handleSetEnabled(false)
          }
        );
      }
    } else {
      cleanup();
      // Remove toast when disabled
      if (toastIdRef.current) {
        removeToast(toastIdRef.current);
        toastIdRef.current = null;
      }
    }

    return () => {
      cleanup();
      if (toastIdRef.current) {
        removeToast(toastIdRef.current);
        toastIdRef.current = null;
      }
    };
  }, [isEnabled]);

  useEffect(() => {
    if (state === 'hotword' && isEnabled) {
      startHotwordListening();
    }
  }, [state, isEnabled]);

  // Update toast message when state changes
  useEffect(() => {
    if (!isEnabled || !toastIdRef.current) return;
    
    const stateMessages = {
      hotword: `🎤 Listening for "${hotword}"...`,
      listening: '🎙️ Recording... (speak now)',
      thinking: '🤔 Processing...',
      speaking: '🔊 Speaking...'
    };
    
    updateToastMessage(stateMessages[state]);
  }, [state, isEnabled, hotword]);

  async function initializeContinuousMode() {
    try {
      // Initialize Porcupine for hotword detection
      await hotwordService.initialize(hotword, sensitivity);
      
      // Start recording immediately on first enable (skip hotword)
      console.log('🎙️ Starting continuous mode - recording immediately');
      setState('listening');
      setTurnCount(0);
      startRecording();
      startTimeout();
    } catch (error) {
      console.error('❌ Failed to initialize continuous mode:', error);
      handleSetEnabled(false);
      alert(`Failed to initialize voice detection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function startHotwordListening() {
    try {
      // Reinitialize if needed (e.g., after release())
      await hotwordService.initialize(hotword, sensitivity);
      await hotwordService.startListening(handleHotwordDetected);
      console.log('🎤 Hotword mode active');
    } catch (error) {
      console.error('❌ Failed to start hotword listening:', error);
    }
  }

  function handleHotwordDetected() {
    console.log('✅ Hotword detected, starting microphone...');
    
    // Stop hotword listening while user speaks
    hotwordService.stopListening();
    
    // Start recording
    setState('listening');
    onTranscriptionStart?.();
    startRecording();
    
    // Set timeout in case no speech detected
    startTimeout();
  }

  function startTimeout() {
    clearCurrentTimeout();
    
    if (timeoutDuration <= 0) return; // No timeout if set to "never"
    
    timeoutRef.current = window.setTimeout(() => {
      console.log('⏱️ Timeout: No speech detected, returning to hotword mode');
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        stopRecording();
      }
      
      setState('hotword');
    }, timeoutDuration);
  }

  function clearCurrentTimeout() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  async function startRecording() {
    try {
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Setup audio context for VAD
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
        await handleRecordingComplete(audioBlob);
      };
      
      mediaRecorder.start();
      
      // Start silence detection
      detectSilence();
      
      console.log('🎙️ Recording started');
    } catch (err) {
      console.error('❌ Error starting recording:', err);
      setState('hotword');
    }
  }

  function detectSilence() {
    if (!analyserRef.current || !mediaRecorderRef.current || 
        (mediaRecorderRef.current.state !== 'recording' && mediaRecorderRef.current.state !== 'paused')) {
      return;
    }
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const SILENCE_THRESHOLD = 10;
    const SILENCE_DURATION = 2000; // 2 seconds
    
    if (average < SILENCE_THRESHOLD) {
      if (!silenceCheckIntervalRef.current) {
        silenceCheckIntervalRef.current = window.setTimeout(() => {
          console.log('🤫 Silence detected, stopping recording...');
          stopRecording();
        }, SILENCE_DURATION);
      }
    } else {
      if (silenceCheckIntervalRef.current) {
        clearTimeout(silenceCheckIntervalRef.current);
        silenceCheckIntervalRef.current = null;
      }
    }
    
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      setTimeout(detectSilence, 100); // Check every 100ms
    }
  }

  function stopRecording() {
    if (silenceCheckIntervalRef.current) {
      clearTimeout(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(err => {
        console.warn('Failed to close AudioContext:', err);
      });
      audioContextRef.current = null;
    }
  }

  async function handleRecordingComplete(audioBlob: Blob) {
    clearCurrentTimeout();
    
    if (audioBlob.size === 0) {
      console.warn('⚠️ No audio data recorded');
      setState('hotword');
      return;
    }
    
    setState('thinking');

    try {
      // Transcribe using existing endpoint
      const transcript = await transcribeAudio(audioBlob);
      setTranscript(transcript);

      if (!transcript.trim()) {
        // No speech detected, return to hotword mode
        console.log('⚠️ Empty transcript, returning to hotword mode');
        setState('hotword');
        return;
      }

      console.log('📝 Transcript:', transcript);

      // Send to parent component (ChatTab) which will handle LLM request
      onVoiceRequest?.(transcript);
      
      // State will transition to 'thinking' via isProcessing prop
      // Then to 'speaking' via isSpeaking prop
      // Then auto-restart in the useEffect hook
      
    } catch (error) {
      console.error('❌ Error processing speech:', error);
      setState('hotword'); // Return to hotword mode on error
    }
  }

  async function transcribeAudio(blob: Blob): Promise<string> {
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');

    // Resolve current API base (handles local dev vs remote)
    const resolvedBase = (await getCachedApiBase()).replace('/openai/v1', '');
    const transcribeUrl = `${resolvedBase}/transcribe`;

    const maxAttempts = 3;
    let lastErr: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(transcribeUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          body: formData,
          signal: controller.signal
        });

        clearTimeout(timeout);

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const errMsg = data?.error || response.statusText || `HTTP ${response.status}`;
          throw new Error(errMsg);
        }

        return data.text || data.transcription || '';
      } catch (err: any) {
        lastErr = err;
        const isNetwork = err instanceof TypeError && err.message.includes('Failed to fetch');
        const isAbort = err.name === 'AbortError';
        console.warn(`Transcription attempt ${attempt} failed:`, err?.message || err);
        if (attempt < maxAttempts && (isNetwork || isAbort)) {
          const backoff = 400 * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        throw err;
      }
    }

    throw lastErr || new Error('Transcription failed');
  }

  async function cleanup() {
    clearCurrentTimeout();
    
    if (silenceCheckIntervalRef.current) {
      clearTimeout(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      stopRecording();
    }
    
    await hotwordService.release();
  }

  function toggleContinuousMode() {
    handleSetEnabled(!isEnabled);
  }

  return (
    <div className="continuous-voice-mode">
      {/* Toggle Button - Only show if not externally controlled */}
      {!onEnabledChange && (
        <button
          onClick={toggleContinuousMode}
          className={`toggle-btn ${isEnabled ? 'active' : ''}`}
          title={isEnabled ? 'Stop Continuous Mode' : 'Start Continuous Mode'}
        >
          {isEnabled ? '🔴 Stop' : '🎙️ Continuous Mode'}
        </button>
      )}

      {/* State Indicator - Only show if not externally controlled */}
      {isEnabled && !onEnabledChange && (
        <div className={`state-indicator state-${state}`}>
          <div className="state-icon">
            {state === 'hotword' && '🎤'}
            {state === 'listening' && '👂'}
            {state === 'thinking' && '🤔'}
            {state === 'speaking' && '🔊'}
          </div>
          <div className="state-text">
            {state === 'hotword' && `Say "${hotword}" to start...`}
            {state === 'listening' && 'Listening...'}
            {state === 'thinking' && 'Processing...'}
            {state === 'speaking' && 'Speaking...'}
          </div>
          <div className="turn-count">
            Turn {turnCount}/{maxTurns}
          </div>
        </div>
      )}

      {/* Settings Panel - Only show if not externally controlled (settings in Settings tab otherwise) */}
      {!isEnabled && !onEnabledChange && (
        <details className="settings-panel">
          <summary>⚙️ Settings</summary>
          
          <div className="setting">
            <label>Hotword:</label>
            <select value={hotword} onChange={e => setHotword(e.target.value)}>
              <option value="hey google">Hey Google</option>
              <option value="ok google">OK Google</option>
              <option value="hey siri">Hey Siri</option>
              <option value="alexa">Alexa</option>
              <option value="jarvis">Jarvis</option>
              <option value="computer">Computer</option>
              <option value="porcupine">Porcupine</option>
            </select>
            <small>Say this phrase to activate</small>
          </div>

          <div className="setting">
            <label>Sensitivity: {sensitivity.toFixed(1)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={sensitivity}
              onChange={e => setSensitivity(parseFloat(e.target.value))}
            />
            <small>Low = fewer false triggers | High = more sensitive</small>
          </div>

          <div className="setting">
            <label>Silence Timeout:</label>
            <select value={timeoutDuration} onChange={e => setTimeoutDuration(parseInt(e.target.value))}>
              <option value="5000">5 seconds</option>
              <option value="10000">10 seconds (default)</option>
              <option value="30000">30 seconds</option>
              <option value="-1">Never (manual only)</option>
            </select>
            <small>Return to hotword mode after silence</small>
          </div>

          <div className="info-box">
            <p><strong>How it works:</strong></p>
            <ol>
              <li>Say "{hotword}" to activate</li>
              <li>Speak your question</li>
              <li>Agent responds</li>
              <li>Microphone auto-restarts for next turn</li>
              <li>After {timeoutDuration > 0 ? `${timeoutDuration/1000}s` : '∞'} silence, returns to hotword mode</li>
            </ol>
          </div>
        </details>
      )}

      {/* Transcript Display */}
      {transcript && isEnabled && (
        <div className="transcript-display">
          <strong>You:</strong> {transcript}
        </div>
      )}
    </div>
  );
}
