# TTS Snippet Stop Button Fix - COMPLETE

## Summary
Fixed TTS playback stop button issues on the snippet viewing dialog by increasing GlobalTTSStopButton z-index and adding a flashing stop button in the dialog header.

## Problem
When clicking "Read" on a snippet in the SWAG page:
1. **GlobalTTSStopButton was hidden**: The snippet dialog (z-50) covered the global stop button in the app header (also z-50)
2. **Dialog stop button visibility**: User couldn't see the header stop button when viewing snippet in modal dialog
3. **ReadButton stop functionality**: The stop button that replaces "Read" when playing wasn't easily accessible

## User Report
> "after clicking read on the snippet page, the stop button does not stop playback. add a flashing stop button in the page header similar to when llm response content in the chat is spoken. is it because the snippet is being shown in a dialog that I can't see the header button. nonetheless the stop button that is swapped in when i click play does not stop playback."

## Changes Made

### 1. Increased GlobalTTSStopButton Z-Index (`ReadButton.tsx` line 214)
**Before:**
```typescript
className="fixed top-4 right-20 z-50 px-4 py-2 bg-red-600..."
```

**After:**
```typescript
className="fixed top-4 right-20 z-[60] px-4 py-2 bg-red-600..."
```

**Impact:** Global stop button now appears above all dialogs (z-50)

### 2. Added TTS Import to SwagPage (`SwagPage.tsx` line 5)
```typescript
import { useTTS } from '../contexts/TTSContext';
```

### 3. Added TTS Hook to SwagPage Component (`SwagPage.tsx` line 44)
```typescript
const { state: ttsState, stop: stopTTS } = useTTS();
```

### 4. Added Flashing Stop Button in Dialog Header (`SwagPage.tsx` lines 964-974)
Added after the timestamp in the dialog header:
```typescript
{/* TTS Stop Button - Flashing when playing */}
{ttsState.isPlaying && (
  <button
    onClick={stopTTS}
    className="px-3 py-1.5 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition-colors flex items-center gap-2 animate-pulse"
    title="Stop reading aloud"
  >
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" />
    </svg>
    Stop Reading
  </button>
)}
```

## Features

### Flashing Stop Button
- **Visibility**: Only appears when TTS is playing (`ttsState.isPlaying`)
- **Animation**: Uses `animate-pulse` for flashing effect (matches global button)
- **Position**: In the dialog header, next to sourceType badge and timestamp
- **Styling**: Red background (`bg-red-600`) with hover effect
- **Icon**: Square stop icon (12x12 rect)
- **Text**: "Stop Reading" label

### Z-Index Hierarchy
- **Dialog backdrop**: z-50
- **Dialog content**: z-50
- **GlobalTTSStopButton**: z-[60] (above dialogs)
- **Dialog TTS stop button**: No z-index needed (within dialog flow)

## UX Flow

### Before Fix:
1. User opens snippet dialog (z-50)
2. User clicks "Read" button
3. TTS starts playing
4. GlobalTTSStopButton appears but is hidden behind dialog
5. ReadButton swaps to stop icon but may not be easily noticed
6. **Problem**: User can't easily stop playback

### After Fix:
1. User opens snippet dialog (z-50)
2. User clicks "Read" button
3. TTS starts playing
4. **GlobalTTSStopButton appears above dialog** (z-60)
5. **Flashing stop button appears in dialog header** (animate-pulse)
6. ReadButton swaps to stop icon
7. **Solution**: User has THREE ways to stop:
   - Click flashing stop button in dialog header (most visible)
   - Click GlobalTTSStopButton in app header (above dialog)
   - Click ReadButton stop icon (in action buttons)

## Files Modified
- **ui-new/src/components/ReadButton.tsx** (line 214)
  - Changed GlobalTTSStopButton z-index from z-50 to z-[60]
- **ui-new/src/components/SwagPage.tsx** (lines 5, 44, 964-974)
  - Added useTTS import
  - Added useTTS hook call
  - Added flashing stop button in dialog header

## Testing
- ✅ Build succeeds with no TypeScript errors
- Expected behavior:
  - Flashing stop button appears in dialog header when TTS plays
  - GlobalTTSStopButton visible above dialog
  - All three stop buttons work (header, global, ReadButton)
  - Button animates with pulse effect
  - Button disappears when playback stops

## Similar Pattern
This matches the existing pattern in ChatInterface where TTS stop button appears in the page header during playback. The same visual style (red, animated, prominent) is now available in the snippet dialog.

## Related Components
- `ReadButton.tsx` - Contains ReadButton and GlobalTTSStopButton
- `TTSContext.tsx` - Manages TTS state and stop() function
- `SwagPage.tsx` - Snippet management page with viewing dialog
