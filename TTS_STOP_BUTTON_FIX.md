# TTS Stop Button Fix

## Issue
When clicking the "Read" button on the snippet page (SwagPage), the global TTS stop button in the page header did not properly stop playback. The button appeared (with flashing animation) but clicking it failed to stop the audio and reset the TTS state.

## Root Cause
The `stop()` method in the TTS providers (`LLMProviderTTSProvider` and `ElevenLabsProvider`) was not triggering the `onEnd` callback when audio was manually stopped. This caused:

1. The audio stopped playing, but the TTS context state remained as `isPlaying: true`
2. The global stop button remained visible and flashing
3. The UI was stuck in a "playing" state even though audio had stopped

The `playAudio()` method created a Promise that only resolved when the audio naturally ended (`audio.onended` event). When `stop()` was called manually, it paused the audio and cleaned up, but never triggered the `onEnd` callback or resolved the promise.

## Solution
Modified both `LLMProviderTTSProvider` and `ElevenLabsProvider` to:

### 1. Store the `onEnd` Callback
Added a private field to store the callback:
```typescript
private currentOnEnd: (() => void) | null = null;
```

### 2. Capture Callback in `playAudio()`
Store the callback when audio starts playing:
```typescript
private async playAudio(audioBlob: Blob, options: SpeakOptions): Promise<void> {
  // ...
  this.currentOnEnd = options.onEnd || null;
  // ...
}
```

### 3. Trigger Callback in `stop()`
Call the stored callback when audio is manually stopped:
```typescript
stop(): void {
  if (this.audio) {
    this.audio.pause();
    this.audio.currentTime = 0;
    // Clean up blob URL
    if (this.audio.src && this.audio.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.audio.src);
    }
    this.audio = null;
    
    // Trigger onEnd callback to reset TTS state
    if (this.currentOnEnd) {
      console.log('Provider: stop() triggering onEnd callback');
      this.currentOnEnd();
      this.currentOnEnd = null;
    }
  }
}
```

### 4. Clean Up Callback on Natural End
Reset the callback when audio ends naturally or errors:
```typescript
this.audio.onended = () => {
  options.onEnd?.();
  URL.revokeObjectURL(audioUrl);
  this.audio = null;
  this.currentOnEnd = null;  // Clean up
  resolve();
};
```

## Files Modified
1. **`ui-new/src/services/tts/LLMProviderTTSProvider.ts`**
   - Added `currentOnEnd` field
   - Modified `playAudio()` to store callback
   - Modified `stop()` to trigger callback
   - Clean up callback on natural end/error

2. **`ui-new/src/services/tts/ElevenLabsProvider.ts`**
   - Same modifications as LLMProviderTTSProvider

3. **`ui-new/src/services/tts/BrowserProviders.ts`**
   - Already had proper `onEnd` callback handling in `stop()` ✓

## Global Stop Button Implementation
The GlobalTTSStopButton already exists and is properly implemented in `ui-new/src/components/ReadButton.tsx`:

```typescript
export const GlobalTTSStopButton: React.FC = () => {
  const { state, stop } = useTTS();

  if (!state.isPlaying) return null;

  return (
    <button
      onClick={stop}
      className="fixed top-4 right-20 z-50 px-4 py-2 bg-red-600 text-white rounded-lg shadow-lg hover:bg-red-700 transition-colors flex items-center gap-2 animate-pulse"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="6" width="12" height="12" />
      </svg>
      Stop Reading
    </button>
  );
};
```

**Features:**
- ✅ Positioned at top-right of screen (`fixed top-4 right-20`)
- ✅ Flashing animation (`animate-pulse`)
- ✅ Red color for stop action
- ✅ Only visible when `state.isPlaying` is true
- ✅ Calls `stop()` from TTS context
- ✅ Works globally across all pages (Chat, Swag, etc.)

## Behavior
### Before Fix
1. Click "Read" button on snippet
2. Audio starts playing, global stop button appears (flashing)
3. Click the global stop button
4. Audio stops BUT button stays visible (stuck state)
5. TTS context remains `isPlaying: true`
6. Cannot start new TTS until page refresh

### After Fix
1. Click "Read" button on snippet
2. Audio starts playing, global stop button appears (flashing)
3. Click the global stop button
4. Audio stops AND button disappears immediately
5. TTS context resets to `isPlaying: false`
6. Can start new TTS immediately

## Testing
### Manual Test Steps
1. **Prerequisites:**
   - Configure a TTS provider (OpenAI, Groq, ElevenLabs, or Gemini)
   - Enable TTS in settings
   - Navigate to Swag page
   - Create or have an existing snippet

2. **Test Stop Button on Snippet:**
   - Click to view a snippet
   - Click the "Read" button in the snippet dialog
   - Observe: Global stop button appears at top-right, flashing red
   - Click the global stop button
   - Expected: Audio stops immediately, button disappears
   - Try clicking "Read" again
   - Expected: Audio starts playing normally

3. **Test Stop Button on Chat:**
   - Navigate to Chat page
   - Send a message and get a response
   - Click the read icon next to a message
   - Observe: Global stop button appears
   - Click the global stop button
   - Expected: Audio stops immediately, button disappears

4. **Test with Different Providers:**
   - Test with OpenAI TTS
   - Test with Groq TTS
   - Test with ElevenLabs (if API key configured)
   - Test with Gemini TTS
   - Test with Browser TTS (fallback)
   - All should have working stop button

### Console Verification
When clicking the stop button, you should see:
```
LLMProviderTTSProvider: stop() triggering onEnd callback
```
or
```
ElevenLabsProvider: stop() triggering onEnd callback
```

This confirms the callback is being triggered properly.

## Impact
- **User Experience:** Stop button now works correctly for snippet reading
- **State Management:** TTS state properly resets when audio is stopped manually
- **Cross-Page:** Works consistently across Chat, Swag, and any other page using TTS
- **All Providers:** Fix applies to LLM-based (OpenAI, Groq, Gemini) and ElevenLabs TTS

## Related Components
- `GlobalTTSStopButton` - Header stop button component (already working)
- `TTSContext` - Global TTS state management
- `ReadButton` - Individual read buttons in UI
- TTS Providers:
  - `LLMProviderTTSProvider` - OpenAI, Groq, Gemini, Together
  - `ElevenLabsProvider` - ElevenLabs API
  - `BrowserSpeechProvider` - Browser Web Speech API (already working)
  - `SpeakJSProvider` - speak.js fallback (already working)

## Deployment
1. Build UI: `cd ui-new && npm run build`
2. Deploy to GitHub Pages: `./scripts/deploy-docs.sh -m "fix: TTS stop button now properly stops playback and resets state"`
3. Test on production with actual TTS providers

## Future Improvements
- Consider adding a fade-out effect when stopping audio
- Add visual feedback (pulse/shake) when stop is clicked
- Add keyboard shortcut (e.g., Escape key) to stop TTS
- Add progress indicator showing how much of the text has been read
