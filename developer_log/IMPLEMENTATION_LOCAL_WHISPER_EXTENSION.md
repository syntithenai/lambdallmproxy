# Implementation Plan: Extend Local Whisper to All Microphone Inputs

**Status**: Planning Phase  
**Priority**: High  
**Date**: 2025-01-XX  
**Related**: See `developer_log/CONTINUOUS_VOICE_MODE_SETUP.md` for completed continuous voice mode implementation

## Overview

Extend the existing local Whisper functionality (currently only in continuous voice mode) to all microphone-based inputs in the application:
- Chat microphone button (VoiceInputDialog)
- Planning mode voice input
- Image editor voice commands

## Background

**What's Already Working:**
- Local Whisper server on port 8000 with cloud failover
- Backend `/transcribe` endpoint with local Whisper support
- `ContinuousVoiceMode.tsx` successfully using local Whisper via settings context
- Voice settings stored in localStorage: `voice_useLocalWhisper`, `voice_localWhisperUrl`

**What Needs Implementation:**
- Other voice input components don't check localStorage settings
- They directly call `/transcribe` without local Whisper preferences
- Planning mode voice input needs to be identified and updated

## Architecture

### Current Voice Input Components

1. **ContinuousVoiceMode.tsx** ✅ (COMPLETE)
   - Location: `ui-new/src/components/ContinuousVoiceMode.tsx`
   - Transcription: Line 383 `transcribeAudio()`, Line 393 calls `${resolvedBase}/transcribe`
   - Status: Already integrated with local Whisper settings

2. **VoiceInputDialog.tsx** 🔄 (NEEDS IMPLEMENTATION)
   - Location: `ui-new/src/components/VoiceInputDialog.tsx`
   - Transcription: Line 91/161 `transcribeAudio()`, Line 193 calls `/transcribe`
   - Current: Uses whisperApiKey for cloud transcription
   - Required: Read localStorage settings, pass to backend

3. **ImageEditor/CommandInput.tsx** 🔄 (NEEDS INVESTIGATION)
   - Location: `ui-new/src/components/ImageEditor/CommandInput.tsx`
   - Microphone: Lines 90, 370, 389, 418 reference microphone functionality
   - Required: Identify transcription flow, integrate local Whisper

4. **Planning Mode** 🔍 (NEEDS IDENTIFICATION)
   - Location: `ui-new/src/components/PlanningPage.tsx`, `PlanningTab.tsx`, etc.
   - Required: Find voice input component, integrate local Whisper

### Backend Status

**Already Implemented:**
- `src/endpoints/transcribe.js` - Direct transcription endpoint ✅
- `src/tools/transcribe.js` - Tool with `transcribeWithLocalWhisper()` ✅
- `src/endpoints/chat.js` - Extracts useLocalWhisper/localWhisperUrl from request body ✅

**Required Verification:**
- Ensure `/transcribe` endpoint accepts `useLocalWhisper` and `localWhisperUrl` parameters
- Verify failover behavior on local Whisper failure

## Implementation Plan

### Phase 1: Backend Endpoint Verification

**Task 1.1**: Audit `/transcribe` Endpoint
- **File**: `src/endpoints/transcribe.js`
- **Actions**:
  - Verify endpoint accepts `useLocalWhisper` and `localWhisperUrl` parameters
  - Ensure it calls `transcribeWithLocalWhisper()` from `src/tools/transcribe.js`
  - Confirm failover to cloud services on local failure
  - Test with curl/Postman to verify behavior
- **Success Criteria**: Endpoint properly handles local Whisper with cloud fallback

**Task 1.2**: Test Backend Integration
- **Command**: Use local dev server (`make dev`)
- **Test Cases**:
  - Call `/transcribe` with `useLocalWhisper: true` + valid local URL → should use local
  - Call `/transcribe` with `useLocalWhisper: true` + invalid local URL → should failover to cloud
  - Call `/transcribe` with `useLocalWhisper: false` → should use cloud
- **Success Criteria**: All test cases pass with proper logging

### Phase 2: VoiceInputDialog Integration

**Task 2.1**: Read localStorage Settings
- **File**: `ui-new/src/components/VoiceInputDialog.tsx`
- **Location**: Line 91-193 (transcribeAudio function)
- **Changes**:
  ```typescript
  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      // Read voice settings from localStorage
      const useLocalWhisper = localStorage.getItem('voice_useLocalWhisper') === 'true';
      const localWhisperUrl = localStorage.getItem('voice_localWhisperUrl') || 'http://localhost:8000';
      
      console.log(`🎤 VoiceInputDialog: useLocalWhisper=${useLocalWhisper}, url=${localWhisperUrl}`);
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('whisperApiKey', selectedWhisperKey || '');
      
      // Add local Whisper settings
      if (useLocalWhisper) {
        formData.append('useLocalWhisper', 'true');
        formData.append('localWhisperUrl', localWhisperUrl);
      }
      
      // ... rest of transcription logic
    }
  };
  ```
- **Success Criteria**: VoiceInputDialog sends local Whisper preferences to backend

**Task 2.2**: Test VoiceInputDialog
- **Test Locations**: Chat page, any place with microphone button
- **Test Cases**:
  - Enable "Use Local Whisper" in Settings → Click mic in chat → Should use local
  - Disable "Use Local Whisper" in Settings → Click mic in chat → Should use cloud
  - Local Whisper down + enabled → Should failover to cloud
- **Success Criteria**: All test cases work with proper console logging

### Phase 3: ImageEditor Voice Commands

**Task 3.1**: Identify Voice Transcription Flow
- **File**: `ui-new/src/components/ImageEditor/CommandInput.tsx`
- **Actions**:
  - Read lines 90, 370, 389, 418 to understand microphone implementation
  - Find where audio is captured (MediaRecorder)
  - Find where transcription is called (likely similar to VoiceInputDialog)
  - Document current transcription flow
- **Success Criteria**: Complete understanding of how image editor transcribes voice

**Task 3.2**: Integrate Local Whisper
- **File**: `ui-new/src/components/ImageEditor/CommandInput.tsx`
- **Changes**: Similar to VoiceInputDialog
  - Read `voice_useLocalWhisper` and `voice_localWhisperUrl` from localStorage
  - Append to FormData when calling transcription endpoint
  - Add console logging for debugging
- **Success Criteria**: Image editor voice commands use local Whisper when enabled

**Task 3.3**: Test ImageEditor Voice
- **Test Location**: Image Editor page
- **Test Cases**:
  - Enable local Whisper → Use voice command in image editor → Should use local
  - Disable local Whisper → Use voice command → Should use cloud
  - Local Whisper failure → Should failover to cloud
- **Success Criteria**: All test cases pass with proper error handling

### Phase 4: Planning Mode Voice Input

**Task 4.1**: Locate Planning Voice Input Component
- **Files to Search**:
  - `ui-new/src/components/PlanningPage.tsx`
  - `ui-new/src/components/PlanningTab.tsx`
  - `ui-new/src/components/PlanningDialog.tsx`
  - `ui-new/src/components/PlanningConfiguration.tsx`
- **Actions**:
  - Search for microphone button or voice recording
  - Search for `MediaRecorder`, `startRecording`, or `transcribe` calls
  - Identify the component responsible for voice input
- **Success Criteria**: Found and documented planning mode voice input component

**Task 4.2**: Integrate Local Whisper (If Voice Input Exists)
- **File**: TBD (from Task 4.1)
- **Changes**: Same pattern as VoiceInputDialog
  - Read localStorage settings
  - Pass to transcription endpoint
  - Add logging
- **Success Criteria**: Planning voice input uses local Whisper when enabled

**Task 4.3**: Test Planning Voice (If Applicable)
- **Test Location**: Planning mode page
- **Test Cases**: Same as other components
- **Success Criteria**: All test cases pass

### Phase 5: Documentation and Testing

**Task 5.1**: Update User Documentation
- **File**: `README.md` or voice settings documentation
- **Content**:
  - Explain that "Use Local Whisper" applies to ALL voice inputs (not just continuous mode)
  - List all affected features: continuous voice, chat microphone, image editor, planning
  - Document failover behavior
- **Success Criteria**: Clear user-facing documentation

**Task 5.2**: Update Developer Documentation
- **File**: This file (`developer_log/IMPLEMENTATION_LOCAL_WHISPER_EXTENSION.md`)
- **Content**:
  - Mark all tasks as complete
  - Document any issues encountered
  - List all files modified
  - Add testing results
- **Success Criteria**: Complete implementation record

**Task 5.3**: End-to-End Testing
- **Test Scenario**: Complete user workflow
  1. Open Voice Settings
  2. Enable "Use Local Whisper First"
  3. Set local Whisper URL
  4. Test continuous voice mode (should work - already implemented)
  5. Test chat microphone button
  6. Test image editor voice commands
  7. Test planning mode voice input (if exists)
  8. Disable local Whisper → Verify cloud fallback
- **Success Criteria**: All voice inputs respect local Whisper settings

## Technical Details

### localStorage Keys
- `voice_useLocalWhisper`: 'true' or 'false'
- `voice_localWhisperUrl`: URL string (default: 'http://localhost:8000')

### Backend Parameters
When calling `/transcribe` endpoint, include:
```javascript
{
  audio: Blob,
  whisperApiKey: string,
  useLocalWhisper: boolean,      // NEW
  localWhisperUrl: string         // NEW
}
```

### Failover Behavior
1. If `useLocalWhisper: true`, try local Whisper URL first
2. If local fails (timeout, connection error, etc.), automatically fallback to cloud
3. Log all attempts for debugging: `console.log('🏠 Trying local Whisper...', '☁️ Falling back to cloud...')`

## Risk Assessment

**Low Risk Areas:**
- Backend already has local Whisper infrastructure ✅
- ContinuousVoiceMode proves the pattern works ✅
- localStorage settings already exist ✅

**Medium Risk Areas:**
- VoiceInputDialog integration (straightforward but needs testing)
- ImageEditor voice flow (needs investigation first)

**High Risk Areas:**
- Planning mode voice input (may not exist at all)
- Need to verify planning mode has voice capabilities before implementing

## Testing Strategy

### Unit Tests
- Mock localStorage in tests
- Test that voice components read settings correctly
- Test that settings are passed to backend

### Integration Tests
- Test local Whisper server running
- Test local Whisper server down (failover)
- Test cloud-only mode (useLocalWhisper: false)

### Manual Testing
- Test on Chrome (MediaRecorder support)
- Test on Firefox (MediaRecorder support)
- Test on Safari (WebKit MediaRecorder)
- Test with local Whisper service running
- Test with local Whisper service stopped

## Success Metrics

- ✅ All voice input components check localStorage for local Whisper settings
- ✅ All voice inputs use local Whisper when enabled and available
- ✅ All voice inputs failover to cloud when local unavailable
- ✅ Consistent user experience across all voice features
- ✅ Proper error handling and user feedback
- ✅ Complete documentation for users and developers

## Files to Modify

### Backend (Verification Only)
- ✅ `src/endpoints/transcribe.js` - Verify parameter handling
- ✅ `src/tools/transcribe.js` - Already has `transcribeWithLocalWhisper()`
- ✅ `src/endpoints/chat.js` - Already extracts parameters

### Frontend (Implementation)
- 🔄 `ui-new/src/components/VoiceInputDialog.tsx` - Add localStorage reading
- 🔄 `ui-new/src/components/ImageEditor/CommandInput.tsx` - Add localStorage reading
- 🔍 Planning mode component TBD - Add localStorage reading (if exists)

### Documentation
- 🔄 `README.md` - Update voice features section
- 🔄 `developer_log/IMPLEMENTATION_LOCAL_WHISPER_EXTENSION.md` - Implementation log

## Timeline Estimate

- **Phase 1** (Backend Verification): 1-2 hours
- **Phase 2** (VoiceInputDialog): 2-3 hours
- **Phase 3** (ImageEditor): 3-4 hours
- **Phase 4** (Planning Mode): 2-4 hours (depends on if voice exists)
- **Phase 5** (Documentation & Testing): 2-3 hours

**Total**: 10-16 hours

## Next Steps

1. Start with Phase 1: Verify backend `/transcribe` endpoint
2. Implement Phase 2: VoiceInputDialog (most straightforward)
3. Investigate Phase 3: ImageEditor voice flow
4. Search Phase 4: Planning mode voice capabilities
5. Complete Phase 5: Testing and documentation

## Notes

- This implementation reuses the existing local Whisper infrastructure from continuous voice mode
- No new backend code needed - only frontend integration
- Pattern is consistent: read localStorage → pass to backend → backend handles failover
- User experience: Local Whisper setting applies globally to ALL voice features
