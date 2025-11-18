# Continuous Voice Mode - Refactoring Plan

**Date**: 2025-11-17  
**Status**: Planning Phase - No Implementation Yet  
**Goal**: Simplify and fix the continuous voice mode to work reliably

## Executive Summary

The continuous voice mode system has accumulated complexity through multiple iterations, resulting in:
- **State Management Issues**: Multiple competing state machines (local state, props, refs)
- **Authentication Problems**: Token refresh failures causing phantom errors
- **Toast Message Chaos**: Conflicting toast updates from different lifecycle events
- **Phantom User Messages**: TTS audio being transcribed as user input
- **Complex Timeout Logic**: Conversation timeout vs speech timeout confusion

**Key User Requirements**:
- ✅ **Persistent Mode**: Continuous mode stays active until user manually stops it
- ✅ **No Hotword Detection**: Remove Porcupine wake word completely
- ✅ **Empty Transcript Retry**: Retry up to 3 times on empty transcripts before stopping
- ✅ **First 3 Sentences TTS**: Speak only beginning of response for faster turnaround

## Current Architecture Analysis

### File Structure

```
ui-new/src/
├── components/
│   ├── ContinuousVoiceMode.tsx (775 lines) - Main voice control component
│   ├── ChatTab.tsx (8299 lines) - Parent component managing chat and voice
│   └── ToastManager.tsx - Toast notification system
├── contexts/
│   ├── TTSContext.tsx (1558 lines) - Text-to-speech provider
│   ├── AuthContext.tsx (318 lines) - Google OAuth authentication
│   └── SettingsContext.tsx - Voice settings storage
└── services/
    ├── googleAuth.ts (807 lines) - Google OAuth token management
    ├── hotwordDetection.ts - Porcupine wake word detection
    └── tts/ - TTS provider implementations
```

### State Flow (Current - PROBLEMATIC)

```
User Clicks Button
    ↓
ContinuousVoiceMode.isEnabled = true
    ↓
initializeContinuousMode()
    ├─ setState('listening')          [LOCAL STATE]
    ├─ startRecording()
    └─ startConversationTimeout()     [16 seconds]
         ↓
detectSilence() loop (every 100ms)
    ├─ If silence: start speechTimeout [3.5s]
    ├─ If speech: clear speechTimeout
    └─ If speech first time: clearConversationTimeout()
         ↓
After speechTimeout fires:
    └─ stopRecording() → handleRecordingComplete()
         ↓
transcribeAudio() 
    ├─ await getToken()               [AUTH ISSUE #1]
    ├─ fetch('/transcribe')           [AUTH ISSUE #2]
    └─ Returns transcript
         ↓
onVoiceRequest(transcript)            [Sends to ChatTab]
    ↓
ChatTab.handleSend(transcript)
    ├─ setMessages([...messages, userMessage])  [USER MESSAGE CREATED]
    └─ sendChatMessageStreaming()
         ↓
ChatTab SSE Event Handler:
    ├─ 'delta': setStreamingContent()
    ├─ 'message_complete': lastAssistantContentRef.current = content
    └─ 'complete': 
         ├─ setIsLoading(false)       [isProcessing becomes false]
         └─ if continuousVoiceEnabled: ttsSpeak()
              ↓
TTSContext.speak()
    ├─ setState({ isPlaying: true })  [isSpeaking becomes true]
    └─ Audio plays
         ↓ (when done)
    └─ onEnd callback
         ├─ setState({ isPlaying: false })  [isSpeaking becomes false]
         └─ ContinuousVoiceMode detects via useEffect
              ↓
ContinuousVoiceMode useEffect[isSpeaking]:
    └─ if (state === 'speaking' && !isSpeaking):
         ├─ setState('listening')
         ├─ startRecording()
         └─ (NO timeout) - RECENTLY CHANGED
              ↓
detectSilence() loop resumes
    └─ If silence after speech: startConversationTimeout()  [16s]
         ↓
If 16s passes with no speech:
    └─ conversationTimeout fires:
         ├─ stopRecording()
         └─ setState('hotword')
              ↓
hotwordService.startListening()
    └─ Listens for "hey google" or configured wake word
         ↓
If hotword detected:
    └─ Cycles back to listening state
```

### useEffect Dependencies (RACE CONDITIONS)

**ContinuousVoiceMode.tsx has 10+ useEffects:**

1. **Sync external props** (line 51-53): `[enabled]`
2. **Sync isProcessing/isSpeaking to state** (line 104-115): `[isProcessing, isSpeaking]`
   - **ISSUE**: Can flip state to 'thinking' or 'speaking' unexpectedly
3. **Auto-restart after TTS** (line 118-138): `[isSpeaking, state, isEnabled, turnCount]`
   - **ISSUE**: Starts recording without timeout (recent change causing confusion)
4. **Initialize/cleanup** (line 140-147): `[isEnabled]`
5. **State-based hotword management** (line 200-227): `[state, isEnabled, isProcessing, isSpeaking, startHotwordListening]`
6. **Hotword restart events** (line 230-250): `[state, isEnabled, isProcessing, isSpeaking, startHotwordListening]`
7. **Watchdog timeout** (line 253-273): `[state, isProcessing, isSpeaking, startHotwordListening]`
8. **Toast message updates** (line 277-325): `[state, isEnabled, hotword, isSpeaking, onStopTTS]`
   - **ISSUE**: Creates toast on EVERY state change, causing flurry

### Authentication Flow (FRAGILE)

```
ChatTab.getToken()
    ↓
AuthContext.getToken()
    ↓
googleAuth.ensureValidToken()
    ├─ if (!isAuthenticated()): return null  [CHECK #1]
    ├─ if (isTokenExpiringSoon()):           [CHECK #2]
    │   └─ await refreshToken()              [ASYNC]
    │       ├─ tokenClient.requestAccessToken({ prompt: '' })
    │       └─ Returns Promise<boolean>
    │            ├─ True: Token refreshed
    │            └─ False: Refresh failed (no refresh token, network issue)
    └─ return getAccessToken()

ISSUES:
1. refreshToken() is async but may fail silently
2. If refresh fails, returns null → error toast → disables voice mode
3. No retry logic for transient failures
4. Token stored in localStorage can be stale
```

### TTS Integration (COMPLEX)

**Problem: Reading entire response**

Current code in ChatTab.tsx (line 3716-3768):
```typescript
case 'complete':
  if (continuousVoiceEnabled) {
    const responseText = lastAssistantContentRef.current;
    
    if (wordCount < 100) {
      ttsSpeak(responseText, { onEnd: ... });  // SPEAKS ENTIRE RESPONSE
    } else {
      summarizeForVoice(responseText)          // SPEAKS SUMMARY
        .then(summary => ttsSpeak(summary));
    }
  }
```

**User Requirement**: Only speak first 3 sentences

### Phantom User Messages (AUDIO FEEDBACK LOOP)

**Root Cause**: TTS audio is being picked up by the microphone and transcribed

```
Flow:
1. TTS plays: "The capital of France is Paris"
2. Microphone is recording (state='listening')  [WRONG - should not be recording during TTS]
3. Audio detected → speechDetectedRef.current = true
4. After TTS finishes → stopRecording() → transcribeAudio()
5. Transcription result: "Paris" or "The capital of France is Paris"
6. Creates user message with TTS audio content
```

**Current "Fix" Attempt**: Removed `startConversationTimeout()` after TTS
**Problem**: This doesn't stop recording during TTS - it just delays the timeout

## Problems Identified

### 1. State Management Chaos

**Multiple Sources of Truth:**
- Local `state: ConversationState` (hotword|listening|thinking|speaking)
- Parent props: `isProcessing`, `isSpeaking`, `enabled`
- Refs: `speechDetectedRef`, `conversationTimeoutIdRef`, `silenceCheckIntervalRef`

**Result**: State transitions trigger multiple competing useEffects

### 2. Toast Message Flurry

**Current Logic** (line 277-325):
```typescript
useEffect(() => {
  if (stateChanged || speakingChanged || !toastIdRef.current) {
    // Remove old toast
    if (toastIdRef.current) removeToast(toastIdRef.current);
    
    // Create new toast
    toastIdRef.current = showPersistentToast(...);
  }
}, [state, isEnabled, hotword, isSpeaking, onStopTTS]);
```

**Problem**: Runs on EVERY state change, even transient ones
**User sees**: Rapid flickering between "Processing", "Listening for Jarvis", "Recording"

### 3. Recording During TTS (Audio Feedback Loop)

**Current behavior:**
- TTS starts → `isSpeaking = true` → state changes to 'speaking' (line 104-115)
- TTS ends → `isSpeaking = false` → useEffect fires (line 118-138)
- Immediately calls `startRecording()` 
- **ISSUE**: TTS may still have audio in the output buffer/speaker system
- Microphone picks up TTS audio → transcribes it → creates phantom message

**Required Fix**: Don't record during TTS playback

### 4. Authentication Token Refresh Race Condition

**Scenario:**
```
1. User speaks: "What is quantum computing?"
2. Recording stops → transcribeAudio() called
3. await getToken() → ensureValidToken() 
4. isTokenExpiringSoon() = true → refreshToken() starts (async)
5. Meanwhile, token expires completely
6. refreshToken() returns false (token expired mid-refresh)
7. getToken() returns null
8. Error: "Authentication required"
9. Voice mode disabled
```

**User Impact**: Mid-conversation authentication failures

### 5. Speech Timeout Logic Confusion

**Two competing timeouts:**

1. **Speech Timeout** (3.5s): Time of silence before stopping recording
   - Starts when silence detected after speech
   - Purpose: Detect end of utterance
   
2. **Conversation Timeout** (16s): Time before returning to hotword mode
   - ~~Originally started after TTS finished~~
   - ~~Recently changed to start when silence detected after speech~~
   - **Confusion**: When should it actually start?

**User Expectation**: 
- Record when button clicked
- Detect speech
- Wait for silence (3.5s) before processing
- After TTS, restart recording (no timeout)
- Only go to hotword mode after extended idle period

### 6. Hotword Mode Unnecessary Complexity

**Current logic:**
- After conversation timeout → go to hotword mode
- Hotword mode uses Porcupine wake word detection
- User must say "hey google" to restart

**Issues:**
- Adds Porcupine dependency (large WASM files)
- Adds latency (wake word → recording → transcription)
- User just wants to click button and talk

**Question**: Is hotword mode even needed? Or should it be optional?

## Proposed Simplified Architecture

### State Machine Redesign

**New States** (simplified from 4 to 2):
```
RECORDING → PROCESSING → SPEAKING → (back to RECORDING)
     ↑_____________________________________|

NO IDLE STATE - Mode stays active until user clicks stop button
```

Remove:
- ❌ `hotword` state (remove feature completely)
- ❌ `thinking` state (merge into `PROCESSING`)
- ❌ `idle` state (mode is persistent)

**User Control**:
- Click "Start Continuous Mode" → Begin RECORDING
- Click "Stop Continuous Mode" → End mode entirely
- No automatic timeout or idle state

### Toast Message Strategy

**Show exactly ONE toast for each phase:**

```
State:      RECORDING        PROCESSING       SPEAKING
Toast:      🎙️ Recording...  🤔 Generating... 🔊 Speaking...
Button:     Stop Recording   Stop Generation  Stop TTS

Timeline:
|--RECORDING--|--TRANSCRIBING--|--LLM GENERATING--|--SPEAKING--|--RECORDING--|
     ↑              ↑                  ↑                ↑            ↑
  "Recording"   "Transcribing"    "Generating"    "Speaking"   "Recording"
```

**Implementation:**
- Single `updateToast()` function called on state change
- No useEffect watching state - just call directly in setState
- Debounce rapid state changes (100ms)

### Recording Lifecycle

**Correct Flow:**

```typescript
// 1. User clicks button
function enableContinuousMode() {
  setState('RECORDING');
  emptyTranscriptRetryCount = 0; // Reset retry counter
  startMicrophone();
  // Mode stays active until user manually stops
  // No timeouts, no automatic idle
}

// 2. Audio analysis (100ms intervals)
function analyzeAudio() {
  const volume = getAudioLevel();
  
  if (volume > silenceThreshold) {
    if (!speechDetected) {
      speechDetected = true;
      console.log('Speech started');
      // Clear any existing timeout
      clearSilenceTimeout();
    }
  } else if (speechDetected) {
    // Silence detected AFTER speech
    if (!silenceTimeout) {
      silenceTimeout = setTimeout(() => {
        console.log('Silence timeout reached - processing audio');
        stopRecordingAndProcess();
      }, SPEECH_TIMEOUT); // 3.5 seconds
    }
  }
  // If no speech detected yet, keep recording indefinitely
}

// 3. Process recording with retry logic
async function stopRecordingAndProcess() {
  stopMicrophone();
  setState('PROCESSING');
  
  const audioBlob = getRecordedAudio();
  
  // Transcribe
  updateToast('📝 Transcribing...');
  const text = await transcribe(audioBlob);
  
  // Check if transcript is empty (after stripping punctuation)
  const hasActualContent = text.replace(/[\s.,!?;:'"()-]/g, '').length > 0;
  
  if (!hasActualContent) {
    emptyTranscriptRetryCount++;
    console.warn(`Empty transcript (attempt ${emptyTranscriptRetryCount}/3)`);
    
    if (emptyTranscriptRetryCount >= 3) {
      console.error('3 consecutive empty transcripts - stopping continuous mode');
      showError('No speech detected after 3 attempts. Stopping continuous mode.');
      disableContinuousMode();
      return;
    }
    
    // Retry: restart recording
    console.log('Retrying - restarting recording');
    setState('RECORDING');
    speechDetected = false;
    startMicrophone();
    return;
  }
  
  // Reset retry counter on successful transcription
  emptyTranscriptRetryCount = 0;
  
  // Generate LLM response
  updateToast('🤔 Generating...');
  await sendToLLM(text);
  // (LLM response handled by SSE events)
}

// 4. LLM complete event
function onLLMComplete(responseText) {
  setState('SPEAKING');
  
  // Extract first 3 sentences
  const firstThreeSentences = extractSentences(responseText, 3);
  
  speakText(firstThreeSentences, {
    onEnd: () => {
      // CRITICAL: Wait for audio buffer to clear
      setTimeout(() => {
        // Auto-restart recording (persistent mode)
        setState('RECORDING');
        speechDetected = false;
        startMicrophone();
      }, 500); // 500ms delay for speaker/mic separation
    }
  });
}

// 5. User stops manually
function disableContinuousMode() {
  stopMicrophone();
  stopTTS();
  setState(null); // No state when disabled
  emptyTranscriptRetryCount = 0;
  // User must click button again to restart
}
```

### Authentication Hardening

**Token Refresh with Retry:**

```typescript
async function getValidToken(): Promise<string | null> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 1. Check if authenticated
      if (!isAuthenticated()) {
        console.error('Not authenticated');
        return null;
      }
      
      // 2. Get current token
      let token = getStoredToken();
      
      // 3. Check if expiring soon (within 10 minutes)
      if (isTokenExpiringSoon(token)) {
        console.log(`Token expiring soon, refreshing (attempt ${attempt}/${MAX_RETRIES})`);
        
        const refreshed = await refreshToken();
        if (refreshed) {
          token = getStoredToken();
        } else {
          // Refresh failed, retry
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY * attempt); // Exponential backoff
            continue;
          }
          console.error('Token refresh failed after max retries');
          return null;
        }
      }
      
      // 4. Verify token is valid
      if (token && !isExpired(token)) {
        return token;
      }
      
    } catch (error) {
      console.error(`Token retrieval error (attempt ${attempt}):`, error);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY * attempt);
        continue;
      }
    }
  }
  
  // All retries failed
  console.error('Failed to get valid token after retries');
  showError('Session expired. Please refresh the page.');
  return null;
}

async function transcribe(audioBlob: Blob): Promise<string> {
  // Get fresh token with retry logic
  const token = await getValidToken();
  if (!token) {
    throw new Error('Authentication required');
  }
  
  const formData = new FormData();
  formData.append('audio', audioBlob);
  
  const response = await fetch('/transcribe', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  if (response.status === 401) {
    // Token was rejected - try ONE more time with fresh token
    console.warn('401 error, retrying with fresh token');
    const freshToken = await refreshToken();
    if (freshToken) {
      return transcribe(audioBlob); // Recursive retry (once)
    }
    throw new Error('Authentication failed');
  }
  
  const data = await response.json();
  return data.text || '';
}
```

### TTS Integration (First 3 Sentences)

**Text Extraction:**

```typescript
function extractFirstSentences(text: string, count: number = 3): string {
  // Remove markdown formatting
  const plainText = text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // Bold
    .replace(/\*(.+?)\*/g, '$1')      // Italic
    .replace(/`(.+?)`/g, '$1')        // Code
    .replace(/#+\s/g, '')             // Headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Links
  
  // Split by sentence endings: . ! ?
  // But preserve abbreviations like "Dr." or "U.S."
  const sentences = plainText
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .filter(s => s.trim().length > 0);
  
  // Take first N sentences
  const selected = sentences.slice(0, count).join(' ');
  
  return selected.trim();
}

// In ChatTab.tsx 'complete' event:
case 'complete':
  if (continuousVoiceEnabled) {
    const responseText = lastAssistantContentRef.current;
    const firstThree = extractFirstSentences(responseText, 3);
    
    console.log(`🎙️ Speaking first 3 sentences (${firstThree.length} chars)`);
    
    ttsSpeak(firstThree, {
      onStart: () => {
        console.log('🔊 TTS started');
      },
      onEnd: () => {
        console.log('🔊 TTS finished - will restart recording after delay');
        // ContinuousVoiceMode will handle restart via isSpeaking prop
      }
    });
  }
  break;
```

## Implementation Plan

### Phase 1: Simplify State Management (Priority: HIGH)

**Files to modify:**
- `ui-new/src/components/ContinuousVoiceMode.tsx`

**Changes:**
1. ✅ Remove `hotword` and `thinking` states completely
2. ✅ Remove `idle` state - mode is persistent
3. ✅ Consolidate to 2 active states: `RECORDING`, `SPEAKING`
4. ✅ Add transitional state: `PROCESSING` (for transcription + LLM generation)
5. ✅ Remove all hotword detection code and dependencies
6. ✅ Remove competing useEffects - single state machine
7. ✅ Direct state updates instead of prop watching

**Before:**
```typescript
type ConversationState = 'hotword' | 'listening' | 'thinking' | 'speaking';

useEffect(() => {
  if (isProcessing) setState('thinking');
  else if (isSpeaking) setState('speaking');
}, [isProcessing, isSpeaking]);

// Hotword detection
await hotwordService.initialize(hotword, sensitivity);
```

**After:**
```typescript
type VoiceState = 'RECORDING' | 'PROCESSING' | 'SPEAKING';

// No useEffect watching props - parent explicitly manages state
// No hotword service - feature completely removed

// When enabled, always in one of three states
// When disabled, state is null
```

**Remove:**
- All `hotwordService` imports and calls
- All hotword-related settings (hotword, sensitivity)
- Conversation timeout logic
- Automatic idle/hotword transitions

### Phase 2: Fix Toast Message System (Priority: HIGH)

**Files to modify:**
- `ui-new/src/components/ContinuousVoiceMode.tsx`

**Changes:**
1. ✅ Remove useEffect watching state for toasts
2. ✅ Create single `updateToast()` function
3. ✅ Call directly in state transitions
4. ✅ Add debouncing (100ms) to prevent flurry

**Implementation:**
```typescript
const updateToast = useMemo(() => 
  debounce((state: VoiceState, message: string) => {
    if (toastIdRef.current) {
      removeToast(toastIdRef.current);
    }
    toastIdRef.current = showPersistentToast(message, 'info', {
      label: state === 'SPEAKING' ? 'Stop TTS' : 'Stop Voice',
      onClick: () => handleStop()
    });
  }, 100)
, []);

function setState(newState: VoiceState) {
  _setState(newState);
  updateToast(newState, STATE_MESSAGES[newState]);
}
```

### Phase 3: Fix Audio Feedback Loop (Priority: CRITICAL)

**Files to modify:**
- `ui-new/src/components/ContinuousVoiceMode.tsx`

**Changes:**
1. ✅ Stop microphone when TTS starts
2. ✅ Add delay after TTS before restarting microphone (500ms)
3. ✅ Ensure microphone is fully stopped during TTS

**Implementation:**
```typescript
// In useEffect watching isSpeaking
useEffect(() => {
  if (isSpeaking) {
    // TTS started - stop microphone immediately
    if (mediaRecorderRef.current?.state === 'recording') {
      console.log('🛑 Stopping microphone - TTS started');
      stopMicrophone();
    }
  } else if (prevIsSpeaking && state === 'SPEAKING') {
    // TTS just finished - wait before restarting
    console.log('⏳ TTS finished - waiting 500ms before restart');
    setTimeout(() => {
      if (isEnabled) {  // Check still enabled
        console.log('🎙️ Restarting microphone after TTS');
        setState('RECORDING');
        startMicrophone();
      }
    }, 500);
  }
}, [isSpeaking]);
```

### Phase 4: Harden Authentication (Priority: HIGH)

**Files to modify:**
- `ui-new/src/components/ContinuousVoiceMode.tsx`
- `ui-new/src/contexts/AuthContext.tsx`
- `ui-new/src/services/googleAuth.ts`

**Changes:**
1. ✅ Add retry logic to `getToken()`
2. ✅ Add retry logic to `transcribe()` on 401
3. ✅ Better error messages
4. ✅ Graceful degradation (don't disable voice mode on transient errors)

**Implementation:**
```typescript
async function transcribeWithRetry(audioBlob: Blob, maxRetries = 2): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const token = await getValidToken();
      if (!token) throw new Error('No valid token');
      
      const result = await fetch('/transcribe', {
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (result.ok) {
        return await result.json().then(d => d.text);
      }
      
      if (result.status === 401 && attempt < maxRetries) {
        console.warn(`401 error, retrying (${attempt + 1}/${maxRetries})`);
        await sleep(1000);
        continue;
      }
      
      throw new Error(`HTTP ${result.status}`);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.warn(`Transcription attempt ${attempt + 1} failed, retrying...`);
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Phase 5: Implement First 3 Sentences TTS (Priority: MEDIUM)

**Files to modify:**
- `ui-new/src/components/ChatTab.tsx`
- `ui-new/src/utils/textPreprocessing.ts` (create if needed)

**Changes:**
1. ✅ Create `extractFirstSentences()` utility function
2. ✅ Modify 'complete' event handler to use it
3. ✅ Handle edge cases (short responses, single sentence)

**Implementation:**
```typescript
// In ChatTab.tsx
case 'complete':
  if (continuousVoiceEnabled) {
    const responseText = lastAssistantContentRef.current;
    const spokenText = extractFirstSentences(responseText, 3);
    
    ttsSpeak(spokenText, {
      onEnd: () => {
        // ContinuousVoiceMode will auto-restart via isSpeaking prop
      }
    });
  }
```

### Phase 6: Remove Conversation Timeout (Priority: HIGH)

**Files to modify:**
- `ui-new/src/components/ContinuousVoiceMode.tsx`

**Changes:**
1. ✅ **Remove all conversation timeout logic** - Mode is persistent
2. ✅ Only stop continuous mode when:
   - User clicks stop button explicitly
   - Authentication fails
   - 3 consecutive empty transcripts (Phase 7)
   - Critical error occurs
3. ✅ Remove unused refs and state related to timeout
4. ✅ Simplify recording restart logic

**Rationale**: 
- User wants persistent mode - "I want continuous mode to be persistent"
- No auto-stop on inactivity - user explicitly stops when done
- Eliminates 16-second artificial delay and race conditions
- Only auto-stop on repeated errors (3 empty transcripts from Phase 7)

**Before (Complex Timeout Logic):**
```typescript
const conversationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const speechDetectedRef = useRef(false);

function startConversationTimeout() {
  clearConversationTimeout();
  console.log('Starting conversation timeout (16s)');
  conversationTimeoutRef.current = setTimeout(() => {
    console.log('Conversation timeout - stopping continuous mode');
    handleSetEnabled(false);
  }, CONVERSATION_TIMEOUT);
}

function clearConversationTimeout() {
  if (conversationTimeoutRef.current) {
    clearTimeout(conversationTimeoutRef.current);
    conversationTimeoutRef.current = null;
  }
}

// In detectSilence
if (speechDetectedRef.current && isSilent) {
  startConversationTimeout();
}
```

**After (Persistent Mode - No Timeout):**
```typescript
// ✅ Removed: conversationTimeoutRef, speechDetectedRef
// ✅ Removed: startConversationTimeout(), clearConversationTimeout()
// ✅ Removed: All timeout-related useEffect cleanup

// Mode only stops on:
// 1. User action
function handleStopClick() {
  handleSetEnabled(false);
}

// 2. Authentication failure
if (!authToken) {
  showError('Session expired. Please refresh the page.');
  handleSetEnabled(false);
}

// 3. Three consecutive empty transcripts (Phase 7)
if (emptyTranscriptRetryCountRef.current >= 3) {
  showError('No speech detected after 3 attempts. Stopping continuous mode.');
  handleSetEnabled(false);
}

// 4. Critical error
catch (error) {
  console.error('Critical error:', error);
  handleSetEnabled(false);
}

// Recording restarts automatically after TTS with no timeout:
useEffect(() => {
  if (!enabled || state !== 'SPEAKING' || isSpeaking) return;
  
  console.log('TTS finished - restarting recording immediately');
  setState('RECORDING');
  startRecording();
}, [enabled, state, isSpeaking]);
```

**Benefits:**
- ✅ Eliminates 16-second artificial delay between responses
- ✅ Removes timeout race conditions and complexity
- ✅ Simpler code - 2 refs removed, 2 functions removed
- ✅ True persistent mode - continuous conversation until explicit stop
- ✅ Better UX - no unexpected stops during long conversations

**Removed Code:**
- `conversationTimeoutRef`
- `speechDetectedRef` (only used for timeout)
- `startConversationTimeout()`
- `clearConversationTimeout()`
- All useEffect cleanup for timeout
- Timeout logic in `detectSilence()`

**Keep:**
- Speech timeout (silence detection) - still needed for end-of-utterance
- `speechTimeoutMs` calculation
- Silence detection in `detectSilence()` for stopping recording

### Phase 7: Empty Transcript Retry Logic (Priority: HIGH)

**Files to modify:**
- `ui-new/src/components/ContinuousVoiceMode.tsx`

**Changes:**
1. ✅ Add retry counter: `emptyTranscriptRetryCount` (ref)
2. ✅ Check transcript after stripping punctuation: `text.replace(/[\s.,!?;:'"()-]/g, '')`
3. ✅ If empty: increment counter and restart recording
4. ✅ If counter reaches 3: show error and disable continuous mode
5. ✅ If successful: reset counter to 0

**Implementation:**
```typescript
const emptyTranscriptRetryCountRef = useRef(0);

async function handleRecordingComplete(audioBlob: Blob) {
  setState('PROCESSING');
  
  try {
    const transcript = await transcribeAudio(audioBlob);
    
    // Strip all punctuation and whitespace
    const hasActualContent = transcript.replace(/[\s.,!?;:'"()-]/g, '').length > 0;
    
    if (!hasActualContent) {
      emptyTranscriptRetryCountRef.current++;
      console.warn(`Empty transcript (attempt ${emptyTranscriptRetryCountRef.current}/3)`);
      
      if (emptyTranscriptRetryCountRef.current >= 3) {
        console.error('3 consecutive empty transcripts - stopping continuous mode');
        showError('No speech detected after 3 attempts. Stopping continuous mode.');
        handleSetEnabled(false);
        return;
      }
      
      // Retry: restart recording
      console.log('Empty transcript - retrying');
      setState('RECORDING');
      speechDetectedRef.current = false;
      startRecording();
      return;
    }
    
    // Success - reset counter
    emptyTranscriptRetryCountRef.current = 0;
    
    // Send to LLM
    onVoiceRequest?.(transcript);
    
  } catch (error) {
    console.error('Transcription error:', error);
    // Don't count errors as empty transcripts
    // Just restart recording
    setState('RECORDING');
    startRecording();
  }
}
```

**Edge Cases:**
- Network errors: Don't count toward retry limit
- API errors: Don't count toward retry limit
- Only count truly empty transcripts after successful API call

## Testing Plan

### Unit Tests

1. **State transitions**
   - IDLE → RECORDING → PROCESSING → SPEAKING → RECORDING
   - Verify no duplicate toasts
   - Verify microphone stops during TTS

2. **Authentication**
   - Token refresh on expiry
   - Retry logic on 401
   - Graceful failure

3. **Audio processing**
   - Speech detection
   - Silence timeout
   - No audio feedback loop

### Integration Tests

1. **Full conversation flow**
   - Click button → speak → verify transcription → verify LLM response → verify TTS
   - Verify microphone restarts after TTS
   - Verify no phantom messages

2. **Error scenarios**
   - Network failure during transcription
   - Token expiry mid-conversation
   - Empty/invalid transcription

3. **Edge cases**
   - Very short responses (< 3 sentences)
   - Multiple rapid state changes
   - TTS stop during playback

## Success Criteria

1. ✅ **No toast message flurry** - exactly one toast per state
2. ✅ **No phantom messages** - TTS audio not transcribed
3. ✅ **Smooth state transitions** - clear visual feedback
4. ✅ **Reliable authentication** - token refresh works consistently
5. ✅ **First 3 sentences only** - TTS speaks partial response
6. ✅ **Auto-restart after TTS** - microphone resumes without user action
7. ✅ **Stop button always works** - can interrupt at any time

## Migration Strategy

1. **Create feature branch**: `refactor/continuous-voice-mode`
2. **Implement phases incrementally** - test after each phase
3. **Keep old code commented** - easy rollback if needed
4. **Add feature flag**: `ENABLE_NEW_VOICE_MODE` env variable
5. **Beta test with users** before removing old code
6. **Remove old code** after 1 week of stable operation

## Open Questions

~~1. **Hotword mode**: Keep or remove entirely?~~
   - ✅ **DECIDED**: Remove completely per user request
   
~~2. **Conversation timeout**: Keep with different trigger?~~
   - ✅ **DECIDED**: Remove - persistent mode with manual stop only
   
~~3. **TTS summary for long responses**: Keep?~~
   - ✅ **DECIDED**: No - just speak first 3 sentences even if response is long

4. **Multiple transcription endpoints**: Consolidate?
   - **Current**: `/transcribe` endpoint
   - **Alternative**: Use existing LLM endpoints
   - **Recommendation**: Keep separate for simplicity

## References

- Current implementation: `ui-new/src/components/ContinuousVoiceMode.tsx`
- Parent integration: `ui-new/src/components/ChatTab.tsx` (lines 8126-8165)
- TTS context: `ui-new/src/contexts/TTSContext.tsx`
- Auth context: `ui-new/src/contexts/AuthContext.tsx`
- Toast manager: `ui-new/src/components/ToastManager.tsx`

## Conclusion

The continuous voice mode system needs simplification:
- **Remove** hotword detection completely (Porcupine dependency, wake word complexity)
- **Remove** conversation timeout (mode is persistent until manual stop)
- **Simplify** state machine from 4 states to 2 (RECORDING ↔ SPEAKING)
- **Fix** audio feedback loop by stopping microphone during TTS + 500ms delay
- **Harden** authentication with retry logic and better error handling
- **Simplify** toast messages to one updateToast() function
- **Implement** first 3 sentences TTS for faster responses
- **Add** empty transcript retry logic (3 attempts before stopping)

**Key Architectural Changes**:
1. **Persistent Mode**: Never auto-stops except on errors or manual stop
2. **2-State Machine**: RECORDING → SPEAKING → RECORDING (continuous loop)
3. **No Hotword**: Click button to start, click button to stop
4. **Smart Retry**: 3 attempts on empty transcripts before giving up

Estimated effort: **3-4 days** for complete refactoring and testing.

---

**Next Steps**: Review this plan, get approval, then create feature branch and begin Phase 1.
