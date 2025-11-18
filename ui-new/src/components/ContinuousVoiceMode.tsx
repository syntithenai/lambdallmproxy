import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useToast } from './ToastManager';
import { useSettings } from '../contexts/SettingsContext';
import './ContinuousVoiceMode.css';
import { getCachedApiBase } from '../utils/api';

// Simplified state machine: RECORDING → PROCESSING → SPEAKING → RECORDING
type VoiceState = 'RECORDING' | 'PROCESSING' | 'SPEAKING';

interface ContinuousVoiceModeProps {
  onVoiceRequest?: (text: string) => void;
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
  
  // Log when isSpeaking prop changes
  useEffect(() => {
    console.log(`🔊 ContinuousVoiceMode: isSpeaking prop changed to ${isSpeaking}`);
  }, [isSpeaking]);
  
  // Log when isProcessing changes
  useEffect(() => {
    console.log(`🤔 ContinuousVoiceMode: isProcessing prop changed to ${isProcessing}`);
  }, [isProcessing]);
  
  // Toast notifications
  const { showPersistentToast, removeToast, updateToast } = useToast();
  const toastIdRef = useRef<string | null>(null);
  
  // Get settings from unified SettingsContext
  const { settings, updateSettings } = useSettings();
  
  // Use external enabled state if provided, otherwise manage internally
  const [isEnabled, setIsEnabled] = useState(enabled);
  
  // Sync with external enabled prop
  useEffect(() => {
    setIsEnabled(enabled);
  }, [enabled]);
  
  // Notify parent when enabled state changes - wrap in useCallback to prevent stale closures in toast handlers
  const handleSetEnabled = useCallback((newEnabled: boolean) => {
    console.log(`🔄 handleSetEnabled called: ${newEnabled}`);
    setIsEnabled(newEnabled);
    onEnabledChange?.(newEnabled);
  }, [onEnabledChange]);
  
  // Simplified state machine: RECORDING → PROCESSING → SPEAKING → RECORDING
  const [state, setState] = useState<VoiceState | null>(null);
  const stateRef = useRef<VoiceState | null>(null); // Ref to track current state for async operations
  const emptyTranscriptRetryCountRef = useRef(0);
  const [isSpeechDetected, setIsSpeechDetected] = useState(false); // Track real-time speech detection
  
  // Sync state to ref for async operations (detectSilence uses this to avoid closure staleness)
  useEffect(() => {
    stateRef.current = state;
    console.log(`📊 State ref updated to: ${state}`);
  }, [state]);
  
  // Voice settings from unified settings (with fallback defaults)
  const speechTimeout = settings?.voice?.speechTimeout ?? 3.5; // Time to wait for silence before processing
  const silenceThreshold = settings?.voice?.silenceThreshold ?? 1; // Audio level threshold (very sensitive for quiet mics)

  // Recording state management
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceCheckIntervalRef = useRef<number | null>(null);
  const speechDetectedRef = useRef<boolean>(false); // Track if speech was detected
  const silenceTimeoutRef = useRef<number | null>(null); // Timeout for end-of-utterance detection
  const isCleaningUpRef = useRef<boolean>(false); // Track if we're in cleanup to prevent race conditions
  const isEnabledRef = useRef<boolean>(isEnabled); // Ref to track enabled state for async operations
  const autoRestartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Timeout for auto-restart after TTS
  
  // Sync isEnabled to ref
  useEffect(() => {
    isEnabledRef.current = isEnabled;
    console.log(`📊 isEnabled ref updated to: ${isEnabled}`);
  }, [isEnabled]);

  // Phase 2: Debounced toast update function
  const previousStateRef = useRef<VoiceState | null>(null); // Track previous state for toast updates
  const updateToastMessage = useMemo(() => {
    let timeoutId: number | null = null;
    return (newState: VoiceState, message: string, forceNew: boolean = false) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        // Determine action button label and handler based on state
        const actionConfig = newState === 'SPEAKING' 
          ? { label: 'Stop TTS', onClick: () => onStopTTS?.() }
          : { label: 'Stop', onClick: () => handleSetEnabled(false) };
        
        // ALWAYS force new toast if state changed (different action button needed)
        const stateChanged = previousStateRef.current !== newState;
        const shouldForceNew = forceNew || stateChanged;
        
        // If we already have a toast and not forcing a new one, just update the message
        if (toastIdRef.current && !shouldForceNew) {
          console.log(`📝 Updating existing toast message to: "${message}"`);
          updateToast(toastIdRef.current, message);
        } else {
          // Create new toast (for state transitions or first toast)
          if (toastIdRef.current) {
            console.log(`🗑️ Removing old toast (state changed: ${previousStateRef.current} → ${newState})`);
            removeToast(toastIdRef.current);
          }
          console.log(`🆕 Creating new toast with message: "${message}", action: ${actionConfig.label}`);
          toastIdRef.current = showPersistentToast(message, 'info', actionConfig);
        }
        
        // Update previous state ref
        previousStateRef.current = newState;
      }, 100); // 100ms debounce
    };
  }, [showPersistentToast, removeToast, updateToast, onStopTTS, handleSetEnabled]);

  // Helper to update state and toast together
  const setStateWithToast = useCallback((newState: VoiceState | null, customMessage?: string, forceNewToast: boolean = false) => {
    const speechDetected = speechDetectedRef.current;
    console.log(`🔄 setStateWithToast: ${state} → ${newState}, speechDetected: ${speechDetected}, customMessage: ${customMessage || 'none'}, forceNew: ${forceNewToast}`);
    setState(newState);
    if (newState) {
      let message: string;
      if (customMessage) {
        message = customMessage;
      } else if (newState === 'RECORDING') {
        // Use ref for current speech detection status
        message = speechDetected 
          ? '🎙️ Listening... (speaking detected ✓)' 
          : '🎙️ Listening... (waiting for speech)';
      } else if (newState === 'PROCESSING') {
        message = '🤔 Processing...';
      } else {
        message = '🔊 Speaking...';
      }
      console.log(`📊 Toast message will be: "${message}"`);
      updateToastMessage(newState, message, forceNewToast);
    }
  }, [updateToastMessage]);

  // Phase 4: Helper to get access token (use the OAuth token, not Firebase ID token)
  // The backend /transcribe endpoint expects Google OAuth access token, not Firebase ID token
  async function getTokenWithRetry(): Promise<string | null> {
    // Simply return the accessToken prop - it's already the correct Google OAuth token
    // The getToken() function returns Firebase ID tokens which won't work for transcription
    if (!accessToken) {
      console.error('❌ No Google OAuth access token available');
      return null;
    }
    
    console.log('✅ Using Google OAuth access token for transcription');
    return accessToken;
  }

  // When speaking completes, auto-restart recording (Phase 3 + Phase 6)
  useEffect(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔍 Auto-restart useEffect triggered:`);
    console.log(`  - state: ${state}`);
    console.log(`  - isSpeaking: ${isSpeaking}`);
    console.log(`  - isEnabled: ${isEnabled}`);
    console.log(`  - isEnabledRef.current: ${isEnabledRef.current}`);
    
    // CRITICAL: Check isEnabledRef FIRST before any other logic
    // This prevents auto-restart from firing during shutdown
    if (!isEnabledRef.current) {
      console.log('⚠️ Auto-restart: isEnabledRef is false, skipping auto-restart');
      return;
    }
    
    // Check BOTH isEnabled state and ref to prevent restart during shutdown
    if (state === 'SPEAKING' && !isSpeaking && isEnabled) {
      console.log('🔊 TTS finished - immediately transitioning to RECORDING');
      
      // IMPORTANT: Reset speech detection state BEFORE calling setStateWithToast
      speechDetectedRef.current = false;
      setIsSpeechDetected(false);
      
      // Immediately update state and toast to show "Listening (waiting for speech)"
      // Force new toast since we're changing from SPEAKING to RECORDING (different button)
      setStateWithToast('RECORDING', '🎙️ Listening... (waiting for speech)', true);
      
      // Clear any existing auto-restart timeout
      if (autoRestartTimeoutRef.current) {
        clearTimeout(autoRestartTimeoutRef.current);
        autoRestartTimeoutRef.current = null;
      }
      
      // Start recording after a brief delay to let speaker/mic buffers clear
      // Store timeout in ref so it persists across re-renders
      autoRestartTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Starting recording after buffer clear delay');
        console.log(`🔄 isEnabled: ${isEnabled}, isEnabledRef.current: ${isEnabledRef.current}`);
        // Double-check enabled ref before actually starting
        if (isEnabledRef.current) {
          startRecording();
        } else {
          console.log('⚠️ Auto-restart cancelled: isEnabledRef is false');
        }
        autoRestartTimeoutRef.current = null;
      }, 300);
      
      // Don't return cleanup - let the timeout fire even if component re-renders
    }
  }, [isSpeaking, state, isEnabled, setStateWithToast]);

  // Initialize/cleanup based on enabled state
  useEffect(() => {
    console.log(`🔧 Enabled state changed to: ${isEnabled}, current state: ${state}`);
    // IMPORTANT: Only start if explicitly enabled (prevent auto-start on reload)
    if (isEnabled) {
      console.log('🎙️ Starting continuous voice mode');
      isCleaningUpRef.current = false; // Reset cleanup flag
      emptyTranscriptRetryCountRef.current = 0;
      speechDetectedRef.current = false;
      setIsSpeechDetected(false); // Reset UI state
      // Force new toast - initial start of voice mode
      setStateWithToast('RECORDING', '🎙️ Listening... (waiting for speech)', true);
      startRecording();
    } else {
      console.log('🛑 Stopping continuous voice mode - beginning cleanup sequence');
      console.log(`   Current state: ${state}, toastId: ${toastIdRef.current}`);
      // Clear state FIRST to prevent auto-restart
      setState(null);
      console.log('   ✓ State cleared to null');
      setIsSpeechDetected(false);
      // Remove toast BEFORE cleanup to prevent flashing
      if (toastIdRef.current) {
        console.log(`   ✓ Removing toast: ${toastIdRef.current}`);
        removeToast(toastIdRef.current);
        toastIdRef.current = null;
      }
      // Then cleanup resources
      console.log('   ✓ Starting cleanup()');
      cleanup();
      console.log('   ✓ Cleanup complete');
    }
  }, [isEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      setState(null); // Clear state on unmount
      if (toastIdRef.current) {
        removeToast(toastIdRef.current);
        toastIdRef.current = null;
      }
    };
  }, []);

  // Phase 3: Stop microphone when TTS starts
  useEffect(() => {
    if (isSpeaking && (state === 'RECORDING' || state === 'PROCESSING')) {
      console.log('🛑 TTS started - transitioning to SPEAKING state');
      if (mediaRecorderRef.current?.state === 'recording') {
        console.log('🛑 Stopping microphone');
        stopRecording();
      }
      // Force new toast - changing to SPEAKING (different button)
      setStateWithToast('SPEAKING', undefined, true);
    } else if (isProcessing && state === 'RECORDING') {
      console.log('🤔 LLM processing started');
      // Force new toast - changing from RECORDING to PROCESSING
      setStateWithToast('PROCESSING', undefined, true);
    } else if (!isSpeaking && !isProcessing && state === 'SPEAKING') {
      // IMPORTANT: When TTS finishes and LLM is done, immediately transition to auto-restart
      // This prevents showing "Processing" after TTS completes
      console.log('✅ TTS finished and LLM done - will auto-restart recording');
      // Don't set state here - let the auto-restart useEffect handle it
    } else if (!isSpeaking && state === 'SPEAKING') {
      // TTS finished but LLM might still be processing
      // Still let auto-restart handle it to avoid "Processing" flash
      console.log('✅ TTS finished - will auto-restart recording (LLM may still be processing)');
      // Don't transition to PROCESSING - let auto-restart happen
    }
  }, [isSpeaking, isProcessing, state, isEnabled]);

  async function startRecording() {
    try {
      console.log('🎙️ startRecording() called');
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;
      console.log('✅ Got media stream');
      
      // Log audio track settings
      const audioTrack = stream.getAudioTracks()[0];
      const settings = audioTrack.getSettings();
      console.log('🎤 Microphone settings:', settings);
      
      // Setup audio context for VAD
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048; // Increased for better sensitivity
      analyser.smoothingTimeConstant = 0.8; // Smooth out noise
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyserRef.current = analyser;
      source.connect(analyser);
      
      console.log('🎤 Analyser configured:', {
        fftSize: analyser.fftSize,
        frequencyBinCount: analyser.frequencyBinCount,
        smoothingTimeConstant: analyser.smoothingTimeConstant
      });
      
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
      showPersistentToast(`❌ Failed to start recording: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      handleSetEnabled(false);
    }
  }

  function detectSilence() {
    // Stop if we're cleaning up or disabled
    if (isCleaningUpRef.current || !isEnabledRef.current) {
      console.log(`⏹️ detectSilence stopped: cleaning=${isCleaningUpRef.current}, enabled=${isEnabledRef.current}`);
      return;
    }
    
    // Log state and refs for debugging
    console.log(`🔍 detectSilence check: state=${stateRef.current}, enabled=${isEnabledRef.current}, mediaRecorder.state=${mediaRecorderRef.current?.state}`);
    
    if (!analyserRef.current || !mediaRecorderRef.current || 
        (mediaRecorderRef.current.state !== 'recording' && mediaRecorderRef.current.state !== 'paused')) {
      console.log(`⏹️ detectSilence stopped: no analyser or recorder not recording (state: ${mediaRecorderRef.current?.state})`);
      console.log(`   analyserRef.current: ${!!analyserRef.current}, mediaRecorderRef.current: ${!!mediaRecorderRef.current}`);
      return;
    }
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(dataArray); // Use time-domain data for amplitude
    
    // Calculate volume (RMS - Root Mean Square)
    let sum = 0;
    let min = 255;
    let max = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const value = dataArray[i];
      min = Math.min(min, value);
      max = Math.max(max, value);
      const normalized = (value - 128) / 128; // Normalize to -1 to 1
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const volume = rms * 100; // Scale to 0-100
    
    const speechTimeoutMs = speechTimeout * 1000; // Convert seconds to milliseconds
    
    // Log volume for debugging
    if (Math.random() < 0.05) { // Log 5% of the time to avoid spam
      console.log(`🔊 Volume: ${volume.toFixed(1)} | Min: ${min} | Max: ${max} | Range: ${max - min} (threshold: ${silenceThreshold})`);
    }
    
    if (volume < silenceThreshold) {
      // Silence detected
      if (!silenceTimeoutRef.current && speechDetectedRef.current) {
        // Only start silence timeout if we detected speech first
        console.log(`🤫 Silence started - will auto-submit in ${speechTimeout}s`);
        silenceTimeoutRef.current = window.setTimeout(() => {
          console.log(`🤫 Silence timeout reached after ${speechTimeout}s, stopping recording...`);
          stopRecording();
        }, speechTimeoutMs);
      }
      
      // Update UI to show silence
      if (isSpeechDetected) {
        setIsSpeechDetected(false);
        if (stateRef.current === 'RECORDING') {
          console.log('📊 UI update: Silence detected, showing "will auto-submit" message');
          // Don't force new toast - just update the existing one
          setStateWithToast('RECORDING', '🎙️ Listening... (silence - will auto-submit)', false);
        } else {
          console.log(`⚠️ State mismatch during silence: expected RECORDING, got ${stateRef.current}`);
        }
      }
    } else {
      // Speech detected
      if (!speechDetectedRef.current) {
        console.log('🎤 Speech detected for the first time');
        speechDetectedRef.current = true;
        setIsSpeechDetected(true);
        if (stateRef.current === 'RECORDING') {
          console.log('📊 UI update: First speech detected, showing "speaking detected ✓" message');
          // Don't force new toast - just update the existing one
          setStateWithToast('RECORDING', '🎙️ Listening... (speaking detected ✓)', false);
        } else {
          console.log(`⚠️ State mismatch during first speech: expected RECORDING, got ${stateRef.current}`);
        }
      } else if (!isSpeechDetected) {
        // Was silent, now speaking again
        console.log('🎤 Speaking resumed after silence');
        setIsSpeechDetected(true);
        if (stateRef.current === 'RECORDING') {
          console.log('📊 UI update: Speech resumed, showing "speaking detected ✓" message');
          // Don't force new toast - just update the existing one
          setStateWithToast('RECORDING', '🎙️ Listening... (speaking detected ✓)', false);
        } else {
          console.log(`⚠️ State mismatch during speech resume: expected RECORDING, got ${stateRef.current}`);
        }
      }
      
      // Clear silence timeout
      if (silenceTimeoutRef.current) {
        console.log('🔄 Silence timeout cleared - speaking again');
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    }
    
    // Continue checking if still recording and not cleaning up
    if (!isCleaningUpRef.current && mediaRecorderRef.current && 
        (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      // Log every 20th iteration (every 2 seconds) to avoid spam
      if (Math.random() < 0.05) {
        console.log(`🔄 detectSilence: Continuing loop (state=${mediaRecorderRef.current.state}, cleaning=${isCleaningUpRef.current})`);
      }
      setTimeout(detectSilence, 100); // Check every 100ms
    } else {
      console.log(`⏹️ detectSilence: Loop stopped (cleaning=${isCleaningUpRef.current}, recorder=${!!mediaRecorderRef.current}, state=${mediaRecorderRef.current?.state})`);
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
    // Exit early if we're cleaning up (user clicked stop)
    if (isCleaningUpRef.current || !isEnabled) {
      console.log('🛑 Ignoring recording completion - mode was stopped');
      return;
    }
    
    // CRITICAL: Don't transcribe if no speech was ever detected
    // This happens when silence timeout triggers without any speech
    if (!speechDetectedRef.current) {
      console.warn('⚠️ No speech detected during recording - skipping transcription');
      console.log('🔄 Restarting recording to wait for speech...');
      speechDetectedRef.current = false;
      setIsSpeechDetected(false);
      // Keep same toast - we're staying in RECORDING state
      setStateWithToast('RECORDING', '🎙️ Listening... (waiting for speech)', false);
      startRecording();
      return;
    }
    
    if (audioBlob.size === 0) {
      console.warn('⚠️ No audio data recorded');
      // Restart recording
      speechDetectedRef.current = false;
      setIsSpeechDetected(false);
      setStateWithToast('RECORDING', '🎙️ Listening... (waiting for speech)', true);
      startRecording();
      return;
    }
    
    // Force new toast - transitioning to PROCESSING
    setStateWithToast('PROCESSING', undefined, true);

    try {
      // Transcribe using existing endpoint
      const transcript = await transcribeAudio(audioBlob);

      // Phase 7: Check if transcript is empty (after stripping punctuation)
      const hasActualContent = transcript.replace(/[\s.,!?;:'"()-]/g, '').length > 0;
      
      if (!hasActualContent) {
        emptyTranscriptRetryCountRef.current++;
        console.warn(`Empty transcript (attempt ${emptyTranscriptRetryCountRef.current}/3)`);
        
        if (emptyTranscriptRetryCountRef.current >= 3) {
          console.error('3 consecutive empty transcripts - stopping continuous mode');
          showPersistentToast('❌ No speech detected after 3 attempts. Stopping continuous mode.', 'error');
          handleSetEnabled(false);
          return;
        }
        
        // Retry: restart recording
        console.log('Empty transcript - retrying');
        speechDetectedRef.current = false;
        setIsSpeechDetected(false);
        // Force new toast - transitioning back to RECORDING after empty transcript
        setStateWithToast('RECORDING', '🎙️ Listening... (waiting for speech)', true);
        startRecording();
        return;
      }

      // Success - reset retry counter
      emptyTranscriptRetryCountRef.current = 0;
      console.log('📝 Transcript:', transcript);

      // Send to parent component (ChatTab) which will handle LLM request and display
      onVoiceRequest?.(transcript);
      
      // State will transition to 'PROCESSING' via isProcessing prop
      // Then to 'SPEAKING' via isSpeaking prop
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
      
      // On other errors, restart recording (don't disable mode)
      // Force new toast - transitioning back to RECORDING after error
      setStateWithToast('RECORDING', undefined, true);
      speechDetectedRef.current = false;
      startRecording();
    }
  }

  async function transcribeAudio(blob: Blob): Promise<string> {
    // Phase 4: Get fresh token with retry logic and exponential backoff
    console.log('🔑 Getting fresh auth token for transcription');
    const authToken = await getTokenWithRetry();
    
    if (!authToken) {
      console.error('❌ Failed to obtain auth token after retries');
      showPersistentToast('❌ Session expired. Please refresh the page to log in again.', 'error');
      // Disable continuous mode so user can click login button
      handleSetEnabled(false);
      throw new Error('Authentication token unavailable');
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
            'Authorization': `Bearer ${authToken}`,
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
            showPersistentToast('❌ Session expired. Please refresh the page to log in again.', 'error');
            handleSetEnabled(false); // Disable continuous mode
            throw new Error('Authentication expired');
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
    console.log('🧹 Cleaning up continuous voice mode');
    isCleaningUpRef.current = true;
    
    // Clear auto-restart timeout if pending
    if (autoRestartTimeoutRef.current) {
      console.log('🧹 Clearing pending auto-restart timeout');
      clearTimeout(autoRestartTimeoutRef.current);
      autoRestartTimeoutRef.current = null;
    }
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      stopRecording();
    }
    
    // Reset cleanup flag after a brief delay
    setTimeout(() => {
      isCleaningUpRef.current = false;
    }, 100);
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
      {isEnabled && !onEnabledChange && state && (
        <div className={`state-indicator state-${state.toLowerCase()}`}>
          <div className="state-icon">
            {state === 'RECORDING' && '�️'}
            {state === 'PROCESSING' && '🤔'}
            {state === 'SPEAKING' && '🔊'}
          </div>
          <div className="state-text">
            {state === 'RECORDING' && 'Recording...'}
            {state === 'PROCESSING' && 'Processing...'}
            {state === 'SPEAKING' && 'Speaking...'}
          </div>
        </div>
      )}

      {/* Settings Panel - Simplified */}
      {!isEnabled && !onEnabledChange && (
        <details className="settings-panel">
          <summary>⚙️ Settings</summary>
          
          <div className="setting">
            <label>Speech Timeout: {speechTimeout.toFixed(1)}s</label>
            <input
              type="range"
              min="0.2"
              max="5"
              step="0.1"
              value={speechTimeout}
              onChange={async e => {
                const value = parseFloat(e.target.value);
                if (settings?.voice) {
                  await updateSettings({ voice: { ...settings.voice, speechTimeout: value } });
                }
              }}
            />
            <small>Auto-submit after this many seconds of silence</small>
          </div>

          <div className="info-box">
            <p><strong>How it works:</strong></p>
            <ol>
              <li>Click "Continuous Mode" button to start</li>
              <li>Speak your question ({speechTimeout}s silence auto-submits)</li>
              <li>Agent responds</li>
              <li>Microphone auto-restarts for next turn</li>
              <li>Click "Stop" button when done</li>
            </ol>
            <p><strong>Note:</strong> Persistent mode - stays active until you manually stop it.</p>
          </div>
        </details>
      )}
    </div>
  );
}
