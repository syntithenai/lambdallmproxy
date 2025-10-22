# YouTube Media Player Not Appearing - Fix

## Issue
YouTube media player button not appearing even when YouTube search tool is called and returns results.

## Root Cause

The useEffect hook in `ChatTab.tsx` that extracts YouTube search results and adds them to the playlist was looking for tool results in the wrong field.

### Original Code (Incorrect)
```typescript
// Line 875 - Looking for tool_calls
if (lastMessage.tool_calls) {
  console.log('🔧 Found tool_calls:', lastMessage.tool_calls);
  lastMessage.tool_calls.forEach((toolCall: any) => {
    console.log('🛠️ Processing tool call:', toolCall.function?.name, toolCall);
    if (toolCall.function?.name === 'search_youtube' && toolCall.result) {
      // ...
    }
  });
}
```

**Problem**: The tool results are not stored in `tool_calls` but in a different field called `toolResults`.

### How Tool Results Are Actually Stored

According to the code at lines 1796-1808, tool results are embedded in the assistant message as a `toolResults` array:

```typescript
// Line 1796-1808
if (!newMessages[i].toolResults) {
  newMessages[i] = {
    ...newMessages[i],
    toolResults: [toolResult]
  };
} else {
  newMessages[i] = {
    ...newMessages[i],
    toolResults: [...(newMessages[i].toolResults || []), toolResult]
  };
}
```

Each `toolResult` has the structure:
```typescript
{
  tool_call_id: string,
  role: 'tool',
  name: string,  // e.g., 'search_youtube'
  content: string  // JSON string with the result
}
```

## Fix Applied

Changed the useEffect to look for `toolResults` instead of `tool_calls` and access `content` instead of `result`:

```typescript
// Extract YouTube URLs from messages and add to playlist
useEffect(() => {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'assistant') return;

  console.log('🎬 Checking for YouTube results in last message:', lastMessage);

  // Look for YouTube search results in toolResults (embedded in assistant message)
  const youtubeResults: any[] = [];
  if (lastMessage.toolResults) {
    console.log('🔧 Found toolResults:', lastMessage.toolResults);
    lastMessage.toolResults.forEach((toolResult: any) => {
      console.log('🛠️ Processing tool result:', toolResult.name, toolResult);
      if (toolResult.name === 'search_youtube' && toolResult.content) {
        try {
          const result = typeof toolResult.content === 'string' 
            ? JSON.parse(toolResult.content) 
            : toolResult.content;
          console.log('📦 Parsed YouTube result:', result);
          if (result.videos && Array.isArray(result.videos)) {
            console.log(`✅ Found ${result.videos.length} YouTube videos`);
            youtubeResults.push(...result.videos);
          } else {
            console.warn('⚠️ No videos array in result:', result);
          }
        } catch (e) {
          console.error('❌ Failed to parse YouTube results:', e, 'Raw result:', toolResult.content);
        }
      }
    });
  } else {
    console.log('⚠️ No toolResults in last message');
  }

  // Add YouTube videos to playlist (at the start)
  if (youtubeResults.length > 0) {
    console.log(`🎵 Adding ${youtubeResults.length} videos to playlist`);
    const tracks = youtubeResults.map((video: any) => ({
      videoId: video.videoId,
      url: video.url,
      title: video.title || 'Untitled Video',
      description: video.description || '',
      duration: video.duration || '',
      channel: video.channel || '',
      thumbnail: video.thumbnail || ''
    }));
    
    addTracksToStart(tracks);
    showSuccess(`Added ${tracks.length} video${tracks.length !== 1 ? 's' : ''} to playlist`);
  } else {
    console.log('ℹ️ No YouTube videos found to add to playlist');
  }
}, [messages, addTracksToStart, showSuccess]);
```

## Key Changes

1. **Changed field**: `tool_calls` → `toolResults`
2. **Changed property**: `toolCall.function?.name` → `toolResult.name`
3. **Changed result access**: `toolCall.result` → `toolResult.content`

## Expected Behavior After Fix

1. User searches for YouTube videos (e.g., "find videos about React")
2. `search_youtube` tool is called
3. Tool results are embedded in assistant message as `toolResults`
4. useEffect detects `toolResults` in last assistant message
5. Extracts videos from `search_youtube` tool result
6. Adds videos to playlist using `addTracksToStart()`
7. Success notification shows: "Added X videos to playlist"
8. MediaPlayerButton appears in header (purple playlist icon with track count)
9. Clicking button opens MediaPlayerDialog with video player and playlist

## Testing

1. **Test YouTube search**: Send message "find videos about javascript"
2. **Check console**: Should see logs:
   - `🎬 Checking for YouTube results in last message`
   - `🔧 Found toolResults: [...]`
   - `✅ Found X YouTube videos`
   - `🎵 Adding X videos to playlist`
3. **Verify UI**: MediaPlayerButton should appear in header
4. **Open player**: Click button to see playlist and video player
5. **Play video**: Click any video in playlist to start playback

## Files Modified

- `ui-new/src/components/ChatTab.tsx` (lines 867-895)

## Build Status

✅ Build successful  
✅ No TypeScript errors  
✅ Ready for deployment

## Related Components

- **PlaylistButton** (`ui-new/src/components/PlaylistButton.tsx`): Shows player controls in header
- **MediaPlayerDialog** (`ui-new/src/components/MediaPlayerDialog.tsx`): Full player UI with playlist
- **PlaylistContext** (`ui-new/src/contexts/PlaylistContext.tsx`): Playlist state management
- **playlistDB** (`ui-new/src/utils/playlistDB.ts`): IndexedDB persistence

## Notes

- The MediaPlayerButton only appears when `playlist.length > 0`
- Videos are added to the **start** of the playlist (prepended)
- Current playback continues uninterrupted when new videos are added
- Playlist persists across page reloads via IndexedDB
- Maximum recommended playlist size: 500 videos
