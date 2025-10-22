# Loading Indicator Feature

## Overview
Added a loading indicator that shows in the mini player header while media is loading, then displays the track title once ready.

## Changes Made

### 1. PlayerContext - Added Loading State
**File**: `ui-new/src/contexts/PlayerContext.tsx`

Added `isLoading` state to track media loading status:
```tsx
interface PlayerContextType {
  // ... existing props
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const PlayerProvider: React.FC<PlayerProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  
  // ... provide isLoading and setIsLoading in context
}
```

### 2. BackgroundPlayer - Track Loading Events
**File**: `ui-new/src/components/BackgroundPlayer.tsx`

Added loading state tracking:
- Sets `isLoading = true` when track changes
- Sets `isLoading = false` when ReactPlayer fires `onReady` event
- Sets `isLoading = false` on error

```tsx
// Set loading when track changes
useEffect(() => {
  if (currentTrack) {
    setIsLoading(true);
  }
}, [currentTrack, setIsLoading]);

// Track player ready state
<ReactPlayer
  onReady={() => {
    console.log('[BackgroundPlayer] Media ready');
    setIsLoading(false);
  }}
  onError={(error) => {
    console.error('[BackgroundPlayer] Playback error:', error);
    setIsLoading(false);
  }}
/>
```

### 3. PlaylistButton - Show Loading Indicator
**File**: `ui-new/src/components/PlaylistButton.tsx`

Added visual loading indicator in title area:
```tsx
import { usePlayer } from '../contexts/PlayerContext';

export const MediaPlayerButton: React.FC = () => {
  const { isLoading } = usePlayer();
  
  return (
    <div className="hidden sm:flex items-center px-2 py-1">
      {isLoading ? (
        // Show spinner + "Loading..." text
        <div className="flex items-center gap-1">
          <svg className="animate-spin h-3 w-3">...</svg>
          <span className="text-xs text-gray-500">Loading...</span>
        </div>
      ) : (
        // Show track title (max 10 chars)
        <span className="text-xs truncate">
          {currentTrack?.title.slice(0, 10)}
        </span>
      )}
    </div>
  );
}
```

## User Experience

### Before Loading Complete
```
[◀] [▶] [▶▶]  [🔄 Loading...]  [🎵 5]
```

### After Media Ready
```
[◀] [▶] [▶▶]  [Wild Car]  [🎵 5]
```

## Loading States

1. **Track Change** → `isLoading = true`
   - User clicks next/previous
   - User selects different track
   - Playlist auto-advances

2. **Media Ready** → `isLoading = false`
   - ReactPlayer successfully loaded media
   - Video/audio ready to play

3. **Error** → `isLoading = false`
   - Media failed to load
   - Prevents stuck loading state

## Technical Details

### Loading Detection Flow
```
1. User clicks "Next" button
   ↓
2. PlaylistContext updates currentTrack
   ↓
3. BackgroundPlayer detects currentTrack change
   ↓
4. setIsLoading(true) called
   ↓
5. PlaylistButton renders spinner
   ↓
6. ReactPlayer loads new URL
   ↓
7. ReactPlayer fires onReady()
   ↓
8. setIsLoading(false) called
   ↓
9. PlaylistButton renders title
```

### Why This Approach Works
- **Centralized State**: PlayerContext manages loading for entire app
- **Event-Driven**: ReactPlayer's `onReady` reliably indicates media is loaded
- **Error Handling**: Loading state cleared on errors (prevents stuck spinner)
- **Track Changes**: Loading state set immediately on track change
- **Always Accurate**: BackgroundPlayer always mounted, so events always fire

## Visual Design

### Spinner Animation
- Uses Tailwind's `animate-spin` utility
- 3x3 pixel size (compact for header)
- Matches text color (gray-700 light mode, gray-300 dark mode)

### Loading Text
- Font size: `text-xs` (matches title size)
- Color: `text-gray-500` (lighter to indicate transient state)
- Layout: Flexbox with 4px gap between spinner and text

### Responsive Behavior
- Hidden on mobile (`hidden sm:flex`)
- Only shows on desktop where title is visible
- Same max-width constraints as title (`max-w-[150px] md:max-w-[250px]`)

## Build Status

✅ **Build successful** in 13.28s  
✅ **No TypeScript errors**  
✅ **Bundle size**: 1,733.17 kB (489.89 kB gzipped)  
✅ **Ready for testing**

## Testing Instructions

1. **Initial Load**
   - Search for videos
   - Add to playlist
   - Click play
   - ✅ Should see "Loading..." spinner briefly
   - ✅ Then see track title (10 chars)

2. **Track Changes**
   - While playing, click "Next"
   - ✅ Should see "Loading..." appear
   - ✅ Then new title after ~1-2 seconds

3. **Slow Connection**
   - Throttle network in DevTools
   - Change tracks
   - ✅ Loading spinner should show longer
   - ✅ Should transition to title when ready

4. **Error Handling**
   - Add invalid YouTube URL to playlist
   - Try to play it
   - ✅ Loading spinner should appear
   - ✅ Should disappear on error (not stuck)

## Future Enhancements

### Progress Indicator
```tsx
{isLoading && (
  <div className="flex items-center gap-1">
    <div className="h-1 w-16 bg-gray-200 rounded overflow-hidden">
      <div className="h-full bg-blue-500 animate-pulse" />
    </div>
  </div>
)}
```

### Loading Percentage
```tsx
const [loadProgress, setLoadProgress] = useState(0);

<ReactPlayer
  onProgress={({ loaded }) => {
    setLoadProgress(loaded);
  }}
/>

{isLoading && <span>{Math.round(loadProgress * 100)}%</span>}
```

### Skeleton Loader
```tsx
{isLoading ? (
  <div className="animate-pulse">
    <div className="h-3 bg-gray-300 rounded w-20"></div>
  </div>
) : (
  <span>{title}</span>
)}
```

---

**Date**: October 16, 2025  
**Feature**: Loading indicator in mini player  
**Status**: Complete - Ready for testing  
**Files Modified**:
- `ui-new/src/contexts/PlayerContext.tsx` (added isLoading state)
- `ui-new/src/components/BackgroundPlayer.tsx` (track loading events)
- `ui-new/src/components/PlaylistButton.tsx` (show loading indicator)
