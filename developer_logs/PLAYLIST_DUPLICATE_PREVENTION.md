# Playlist Duplicate Prevention and Size Management

## Problem Analysis

### Issue 1: Unmanageable Playlist Size
The playlist could grow indefinitely, causing UI freezes when loading chat history with many YouTube searches.

### Issue 2: Duplicate Videos
Videos were being added multiple times to the playlist, even though deduplication was supposed to be in place.

### Root Causes of Duplicates:

1. **Unstable Message IDs**
   - Previous code: `messageId = ${idx}-${msg.content.substring(0, 50)}-${toolResults.length}`
   - Problem: `msg.content` changes during streaming, causing different IDs for the same message
   - Result: Same message processed multiple times as content updates

2. **Effect Running on Every Message Change**
   - Dependency: `[messages, showSuccess]`
   - Problem: Effect runs even when messages are still streaming
   - Result: Partial messages processed, then processed again when complete

3. **History Loading**
   - When loading chat history, ALL messages are new to the component
   - Previous tracking only worked within a single session
   - Result: Reloading a chat would re-add all videos

4. **Message-Based Tracking Instead of Tool-Result-Based**
   - Tracked entire messages rather than individual tool results
   - A single message can have multiple tool results
   - Result: If one tool result changed, all tool results in that message were reprocessed

## Solutions Implemented

### 1. Playlist Size Limit: 500 Items ✅ (Already in place)

**Location**: `ui-new/src/contexts/PlaylistContext.tsx`

Both `addTracks()` and `addTracksToStart()` functions now:
```typescript
// Limit playlist to 500 items to prevent UI lockup (remove oldest)
return combined.slice(0, 500);
```

- **What it does**: Keeps only the 500 most recent videos
- **How it works**: Oldest videos (by `addedAt` timestamp) are removed first
- **Impact**: Prevents UI freeze from massive playlists

### 2. Tool-Result-Based Tracking ✅ (New implementation)

**Location**: `ui-new/src/components/ChatTab.tsx` (lines 920-1007)

**Changed from message-based to tool-result-based tracking:**

```typescript
// OLD: Tracked messages (unstable IDs)
const messageId = `${idx}-${msg.content.substring(0, 50)}-${msg.toolResults?.length || 0}`;
processedMessagesRef.current.has(messageId)

// NEW: Track individual tool results (stable IDs)
const toolResultId = toolResult.tool_call_id || `${toolResult.name}-${JSON.stringify(toolResult.content).substring(0, 100)}`;
processedToolResultsRef.current.has(toolResultId)
```

**Benefits:**
- Uses `tool_call_id` which is stable and unique
- Tracks each tool result independently
- Survives chat history reloads
- No false negatives from content changes

### 3. Only Process Completed Messages ✅ (New implementation)

```typescript
// Filter to only completed (non-streaming) assistant messages
const completedMessages = messages.filter(msg => 
  msg.role === 'assistant' && !msg.isStreaming && msg.toolResults
);
```

**Benefits:**
- Doesn't process partial/streaming messages
- Waits until message is complete
- Prevents duplicate processing during streaming
- Cleaner logic flow

### 4. Improved Deduplication ✅ (Enhanced)

**Within a single effect run:**
```typescript
const videoIdsSeen = new Set<string>();
result.videos.forEach((video: any) => {
  if (video.videoId && !videoIdsSeen.has(video.videoId)) {
    videoIdsSeen.add(video.videoId);
    allYoutubeVideos.push(video);
  }
});
```

**Across effect runs:**
```typescript
processedToolResultsRef.current.has(toolResultId)
```

**In PlaylistContext:**
```typescript
// addTracksToStart checks for existing tracks by videoId
const existingIndex = prev.findIndex(t => t.videoId === track.videoId);
if (existingIndex !== -1) {
  // Move existing track to top instead of adding duplicate
  movedTracks.push({
    ...prev[existingIndex],
    addedAt: Date.now()
  });
}
```

**Three layers of deduplication:**
1. **Within tool result**: Same video ID in one search
2. **Within effect run**: Same video from multiple tool results
3. **In playlist context**: Video already in playlist (moves to top)

### 5. Memory Management ✅ (Improved)

```typescript
// Limit set size to prevent memory growth (keep last 500 tool result IDs)
if (processedToolResultsRef.current.size > 500) {
  const arr = Array.from(processedToolResultsRef.current);
  processedToolResultsRef.current = new Set(arr.slice(-500));
}
```

**Prevents unbounded memory growth** from tracking processed tool results.

## How It Works Now

### Loading Chat from History:

1. **Chat loads** → `messages` array populated with history
2. **Effect runs** → Filters for completed assistant messages with toolResults
3. **For each message** → Checks each tool result's `tool_call_id`
4. **If not processed** → Extracts videos and adds to batch
5. **Deduplication** → Filters duplicate videoIds within batch
6. **Add to playlist** → `addTracksToStart()` handles existing videos
7. **Mark as processed** → `tool_call_id` stored in ref
8. **Limit applied** → Playlist keeps only 500 most recent items

### When New YouTube Search Completes:

1. **Search completes** → New message added with toolResults
2. **Effect runs** → Detects new completed message
3. **Check tool_call_id** → Not in processed set (new search)
4. **Extract videos** → Parse video data from tool result
5. **Add to playlist** → New videos added to top
6. **Show toast** → "Added N videos to playlist"
7. **Mark processed** → Store tool_call_id
8. **Limit applied** → Remove oldest if over 500

## Testing Checklist

### Test 1: No Duplicates on History Load
1. Load a chat with multiple YouTube searches
2. Open playlist
3. ✅ Verify no duplicate videoIds
4. ✅ Verify videos are ordered by most recent search

### Test 2: No Duplicates on New Search
1. Perform YouTube search
2. Wait for completion
3. ✅ Verify videos added once
4. ✅ Verify toast shows correct count

### Test 3: Size Limit Enforcement
1. Load chat with >500 videos worth of searches
2. Check playlist
3. ✅ Verify exactly 500 videos (or fewer)
4. ✅ Verify oldest videos removed

### Test 4: Reload Chat
1. Load chat, videos added to playlist
2. Reload same chat
3. ✅ Verify videos NOT re-added
4. ✅ Verify no duplicate toast messages

### Test 5: Existing Video Handling
1. Have video in playlist
2. Search returns same video
3. ✅ Verify video moved to top (not duplicated)
4. ✅ Verify `addedAt` timestamp updated

## Technical Details

### Stable Identifiers

**tool_call_id** is the key to preventing duplicates:
- Generated by the LLM API
- Unique for each tool invocation
- Persists across streaming updates
- Stored in message history
- Never changes for a given tool call

### Why Previous Approach Failed

```typescript
// ❌ UNSTABLE - content changes during streaming
const messageId = `${idx}-${msg.content.substring(0, 50)}-${msg.toolResults?.length}`;

// Timeline:
// T1: Streaming starts → content = ""
// T2: Streaming → content = "Here are"
// T3: Complete → content = "Here are some videos..."
// Result: 3 different IDs for same message!
```

### Why New Approach Works

```typescript
// ✅ STABLE - tool_call_id never changes
const toolResultId = toolResult.tool_call_id;

// Timeline:
// T1: Tool called → tool_call_id = "call_abc123"
// T2: Streaming → tool_call_id = "call_abc123"
// T3: Complete → tool_call_id = "call_abc123"
// Result: Same ID throughout lifecycle!
```

## Performance Impact

### Before:
- Unlimited playlist growth → UI freeze with large histories
- Multiple duplicate processing → Wasted CPU cycles
- Toast spam → Poor UX
- Memory leak → Set grows indefinitely

### After:
- 500 item limit → Smooth UI even with large histories
- One-time processing → Efficient CPU usage
- Single toast per search → Clean UX
- Bounded memory → Set limited to 500 entries

## Conclusion

The combination of:
1. ✅ Tool-result-based tracking (stable IDs)
2. ✅ Processing only completed messages
3. ✅ Three-layer deduplication
4. ✅ 500 item playlist limit
5. ✅ Bounded memory management

Ensures that:
- **No duplicates** in playlist
- **No UI freezes** from large playlists
- **No duplicate toast messages**
- **History loading works correctly**
- **Memory usage stays bounded**
- **Smooth user experience**
