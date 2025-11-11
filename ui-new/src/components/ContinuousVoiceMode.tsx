import { useState, useEffect, useRef, useCallback } from 'react';
import { hotwordService } from '../services/hotwordDetection';
import { useToast } from './ToastManager';
import { useSettings } from '../contexts/SettingsContext';
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
  onStopTTS?: () => void; // Callback to stop TTS playback
}

export function ContinuousVoiceMode({ 
  onVoiceRequest,
  onTranscriptionStart,
  accessToken,
  apiEndpoint,
  isProcessing = false,
  isSpeaking = false,
  enabled = false,
  onEnabledChange,
  onStopTTS
}: ContinuousVoiceModeProps) {
  // keep apiEndpoint referenced to avoid unused variable linting (we resolve base via getCachedApiBase)
  void apiEndpoint;
  
  // Toast notifications
  const { showPersistentToast, removeToast } = useToast();
  const toastIdRef = useRef<string | null>(null);
  
  // Get settings from unified SettingsContext
  const { settings, updateSettings } = useSettings();
  
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
  const [turnCount, setTurnCount] = useState(0);
  
  // Voice settings from unified settings (with fallback defaults)
  const hotword = settings?.voice?.hotword || 'hey google';
  const sensitivity = settings?.voice?.sensitivity ?? 0.5;
  const speechTimeout = settings?.voice?.speechTimeout ?? 2;
  const conversationTimeout = settings?.voice?.conversationTimeout ?? 10000;
  
  const timeoutRef = useRef<number | null>(null);
  const maxTurns = 100; // Prevent infinite loops

  // Recording state management
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceCheckIntervalRef = useRef<number | null>(null);

  // Handlers to update voice settings
  const handleSetHotword = async (value: string) => {
    if (!settings?.voice) return;
    await updateSettings({ voice: { ...settings.voice, hotword: value } });
  };

  const handleSetSensitivity = async (value: number) => {
    if (!settings?.voice) return;
    await updateSettings({ voice: { ...settings.voice, sensitivity: value } });
  };

  const handleSetSpeechTimeout = async (value: number) => {
    if (!settings?.voice) return;
    await updateSettings({ voice: { ...settings.voice, speechTimeout: value } });
  };

  const handleSetConversationTimeout = async (value: number) => {
    if (!settings?.voice) return;
    await updateSettings({ voice: { ...settings.voice, conversationTimeout: value } });
  };

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
      // Show persistent toast when enabled - starts with recording message since we record immediately
      if (!toastIdRef.current) {
        toastIdRef.current = showPersistentToast(
          '�️ Recording... (speak now)',
          'info',
          {
            label: 'Stop Voice',
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
  }, [isEnabled]);

  // Cleanup only on component unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (toastIdRef.current) {
        removeToast(toastIdRef.current);
        toastIdRef.current = null;
      }
    };
  }, []); // Empty deps = only run on mount/unmount

  // Define callbacks before useEffects
  const handleHotwordDetected = useCallback(() => {
    console.log('✅ Hotword detected, starting microphone...');
    
    // Stop hotword listening while user speaks
    hotwordService.stopListening();
    
    // Start recording
    setState('listening');
    onTranscriptionStart?.();
    startRecording();
    
    // Set timeout in case no speech detected
    startTimeout();
  }, [onTranscriptionStart]); // startRecording and startTimeout are defined below

  const startHotwordListening = useCallback(async () => {
    try {
      // Reinitialize if needed (e.g., after release())
      await hotwordService.initialize(hotword, sensitivity);
      await hotwordService.startListening(handleHotwordDetected);
      console.log('🎤 Hotword mode active');
    } catch (error) {
      console.error('❌ Failed to start hotword listening:', error);
      // Disable continuous mode if hotword detection fails
      handleSetEnabled(false);
      alert(`Failed to start hotword detection: ${error instanceof Error ? error.message : 'Unknown error'}\n\nNote: Hotword detection requires Chrome/Edge browser and microphone permissions.`);
    }
  }, [hotword, sensitivity, handleHotwordDetected]);

  useEffect(() => {
    if (state === 'hotword' && isEnabled) {
      startHotwordListening();
    }
  }, [state, isEnabled, startHotwordListening]);

  // Track previous isSpeaking state to only update when it changes
  const prevIsSpeakingRef = useRef<boolean>(false);
  
  // Update toast message when state changes
  useEffect(() => {
    if (!isEnabled || !toastIdRef.current) return;
    
    const stateMessages = {
      hotword: `🎤 Listening for "${hotword}"...`,
      listening: '🎙️ Recording... (speak now)',
      thinking: '🤔 Processing...',
      speaking: '🔊 Speaking...'
    };
    
    // Only recreate toast if the button type needs to change (speaking state changed)
    const wasSpeaking = prevIsSpeakingRef.current;
    const isNowSpeaking = isSpeaking && !!onStopTTS;
    
    if (wasSpeaking !== isNowSpeaking) {
      // Button type changed, recreate toast with new action
      prevIsSpeakingRef.current = isNowSpeaking;
      
      const actionButton = isNowSpeaking ? {
        label: 'Stop TTS',
        onClick: () => {
          console.log('🛑 Stop TTS clicked from toast');
          onStopTTS!();
        }
      } : {
        label: 'Stop Voice',
        onClick: () => handleSetEnabled(false)
      };
      
      removeToast(toastIdRef.current);
      toastIdRef.current = showPersistentToast(
        stateMessages[state],
        'info',
        actionButton
      );
    } else {
      // Just update the message without recreating the toast
      // Note: ToastManager's updateToast would be ideal here, but we removed it
      // For now, only recreate when button changes to avoid infinite loop
      // The message will update when the button changes anyway
    }
  }, [state, isEnabled, hotword, isSpeaking, onStopTTS]);

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

  function startTimeout() {
    clearCurrentTimeout();
    
    if (conversationTimeout <= 0) return; // No timeout if set to "never"
    
    timeoutRef.current = window.setTimeout(() => {
      console.log('⏱️ Timeout: No speech detected, returning to hotword mode');
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        stopRecording();
      }
      
      setState('hotword');
    }, conversationTimeout);
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
    const speechTimeoutMs = speechTimeout * 1000; // Convert seconds to milliseconds
    
    if (average < SILENCE_THRESHOLD) {
      if (!silenceCheckIntervalRef.current) {
        silenceCheckIntervalRef.current = window.setTimeout(() => {
          console.log(`🤫 Silence detected after ${speechTimeout}s, stopping recording...`);
          stopRecording();
        }, speechTimeoutMs);
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

      if (!transcript.trim()) {
        // No speech detected, return to hotword mode
        console.log('⚠️ Empty transcript, returning to hotword mode');
        setState('hotword');
        return;
      }

      console.log('📝 Transcript:', transcript);

      // Send to parent component (ChatTab) which will handle LLM request and display
      onVoiceRequest?.(transcript);
      
      // State will transition to 'thinking' via isProcessing prop
      // Then to 'speaking' via isSpeaking prop
      // Then auto-restart in the useEffect hook
      
    } catch (error) {
      console.error('❌ Error processing speech:', error);
      
      // Check if it's an authentication error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Authentication') || errorMessage.includes('Unauthorized')) {
        console.log('🔴 Authentication failed - disabling voice mode');
        handleSetEnabled(false); // Disable voice mode on auth failure
        return;
      }
      
      // Check if it's a connection error (backend not running)
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_CONNECTION_REFUSED')) {
        showPersistentToast('❌ Backend server not running. Start with: make dev', 'error');
      }
      
      setState('hotword'); // Return to hotword mode on error
    }
  }

  async function transcribeAudio(blob: Blob): Promise<string> {
    if (!accessToken) {
      console.error('❌ No access token available for transcription');
      showPersistentToast('❌ Authentication required. Please log in again.', 'error');
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
          // Handle 401 Unauthorized specially
          if (response.status === 401) {
            console.error('❌ Authentication failed - token may have expired');
            showPersistentToast('❌ Authentication expired. Please log in again.', 'error');
            throw new Error('Authentication required');
          }
          
          const errMsg = data?.error || response.statusText || `HTTP ${response.status}`;
          throw new Error(errMsg);
        }

        return data.text || data.transcription || '';
      } catch (err: any) {
        lastErr = err;
        const isNetwork = err instanceof TypeError && err.message.includes('Failed to fetch');
        const isAbort = err.name === 'AbortError';
        const isAuth = err.message?.includes('Authentication') || err.message?.includes('Unauthorized');
        
        console.warn(`Transcription attempt ${attempt} failed:`, err?.message || err);
        
        // Don't retry auth errors
        if (isAuth) {
          throw err;
        }
        
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
            <select value={hotword} onChange={e => handleSetHotword(e.target.value)}>
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
              onChange={e => handleSetSensitivity(parseFloat(e.target.value))}
            />
            <small>Low = fewer false triggers | High = more sensitive</small>
          </div>

          <div className="setting">
            <label>Speech Timeout: {speechTimeout.toFixed(1)}s</label>
            <input
              type="range"
              min="0.2"
              max="5"
              step="0.1"
              value={speechTimeout}
              onChange={e => handleSetSpeechTimeout(parseFloat(e.target.value))}
            />
            <small>Auto-submit after this many seconds of silence</small>
          </div>

          <div className="setting">
            <label>Conversation Timeout:</label>
            <select value={conversationTimeout} onChange={e => handleSetConversationTimeout(parseInt(e.target.value))}>
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
              <li>Speak your question ({speechTimeout}s silence auto-submits)</li>
              <li>Agent responds</li>
              <li>Microphone auto-restarts for next turn</li>
              <li>After {conversationTimeout > 0 ? `${conversationTimeout/1000}s` : '∞'} silence, returns to hotword mode</li>
            </ol>
          </div>
        </details>
      )}
    </div>
  );
}
