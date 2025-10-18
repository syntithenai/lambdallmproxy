# Playlist Fixes - Duplicates and Size Limit

## Problems Fixed

### 1. **Playlist Growing Too Large and Freezing UI**
**Solution**: Increased limit to 500 items (from 400) and ensured oldest items are removed when limit is reached.

**Changes**:
- `PlaylistContext.tsx` line 192: `combined.slice(0, 500)` - limits `addTracks()`
- `PlaylistContext.tsx` line 242: `combined.slice(0, 500)` - limits `addTracksToStart()`

### 2. **Many Duplicate Items in Playlist**
**Root Cause**: When loading chat history, the effect in `ChatTab.tsx` was only processing the LAST message, not extracting videos from ALL messages. This meant:
- Videos from previous messages were never added when loading history
- But the `MarkdownRenderer` would add them when links were clicked
- The tracking system (`processedMessagesRef`) would get confused

**Solution**: Changed the extraction logic to process ALL messages and properly track which messages have been processed.

**Changes**:
- `ChatTab.tsx` lines 931-1003: Complete rewrite of YouTube extraction logic
  - Now processes ALL assistant messages, not just the last one
  - Maintains proper deduplication within each batch
  - Tracks processed messages by unique ID
  - Only shows success toast for NEW videos (not bulk history loads)

### 3. **Why So Many Duplicates Appeared**

The duplicates were caused by multiple factors:

1. **History Loading Issue**: 
   - Old code only looked at the LAST message
   - When you loaded a chat from history, only videos from the last message were extracted
   - But when you clicked "Play" buttons in markdown, those would add the videos again
   - Result: Videos appeared multiple times

2. **Effect Re-running**:
   - Every time messages changed (streaming, loading, etc.), the effect ran
   - The `processedMessagesRef` would sometimes miss messages
   - Videos would be added multiple times

3. **Multiple Add Points**:
   - `ChatTab.useEffect`: Adds videos from tool results
   - `MarkdownRenderer.YouTubeLink`: Adds video when "Play" button clicked
   - Both could add the same video if not properly coordinated

## New Behavior

### When Loading Chat from History:
1. ✅ Scans ALL messages in the chat
2. ✅ Extracts ALL YouTube videos from `search_youtube` tool results
3. ✅ Deduplicates by `videoId` within the batch
4. ✅ Adds to playlist (the `addTracksToStart` function also deduplicates against existing playlist)
5. ✅ Tracks processed messages to avoid re-processing
6. ✅ No success toast shown (since it's bulk loading)

### When New Search Results Arrive:
1. ✅ Processes the new message
2. ✅ Extracts YouTube videos
3. ✅ Adds to playlist with deduplication
4. ✅ Shows success toast: "Added N videos to playlist"

### When "Play" Button Clicked:
1. ✅ `MarkdownRenderer` adds video to playlist
2. ✅ `addTracksToStart()` checks if video already exists
3. ✅ If exists, moves it to top and updates timestamp
4. ✅ If new, adds it to playlist
5. ✅ Plays the video immediately

## Size Limit Details

- **Maximum**: 500 items
- **Removal strategy**: Oldest items removed first (FIFO - First In, First Out)
- **Applied in**: Both `addTracks()` and `addTracksToStart()` functions
- **Behavior**: 
  - New items added to top/start
  - When limit exceeded, items at end (oldest) are removed
  - Currently playing track index is adjusted if needed

## Testing Recommendations

1. **Test History Loading**:
   - Load a chat with multiple YouTube searches
   - Verify all videos appear in playlist
   - Verify no duplicates

2. **Test New Searches**:
   - Perform a YouTube search
   - Verify videos added to playlist
   - Verify success toast appears

3. **Test Play Buttons**:
   - Click "Play" button on a YouTube link
   - Verify video plays
   - Verify no duplicate added if already in playlist
   - Verify existing video moves to top with updated timestamp

4. **Test Size Limit**:
   - Add more than 500 videos
   - Verify oldest videos are removed
   - Verify UI remains responsive

## Code Changes Summary

### `PlaylistContext.tsx`:
- Line 192: Changed limit from 400 to 500 in `addTracks()`
- Line 242: Changed limit from 400 to 500 in `addTracksToStart()`
- Comments updated to clarify "remove oldest" behavior

### `ChatTab.tsx`:
- Lines 931-1003: Complete rewrite of YouTube extraction effect
  - Now processes ALL messages (not just last)
  - Better deduplication within batch
  - Improved message tracking (200 message IDs retained)
  - Conditional success toast (only for new results, not history loads)
  - Added console.log for debugging

## Deduplication Strategy

The system uses multiple layers of deduplication:

1. **Within Batch** (ChatTab extraction):
   - Uses `Set<string>` to track `videoId` within current extraction batch
   - Prevents same video being added twice from same message

2. **Against Existing Playlist** (`addTracksToStart`):
   - Checks if `videoId` already exists in playlist
   - If exists: Moves to top, updates timestamp
   - If new: Adds to playlist

3. **Message Processing Tracking**:
   - Uses `processedMessagesRef` to track which messages have been processed
   - Prevents re-processing same message multiple times
   - Retains last 200 message IDs (prevents memory growth)

## Performance Improvements

- **Limit to 500**: Prevents UI lockup from excessive DOM elements
- **Batch Processing**: Processes all videos in one operation instead of multiple
- **Early Returns**: Skips processing if message already handled
- **Set Operations**: Fast O(1) lookups for duplicate checking
