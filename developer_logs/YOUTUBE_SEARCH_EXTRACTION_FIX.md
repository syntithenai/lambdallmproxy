# YouTube Search Results Extraction Fix

## Problem

When using the `search_youtube` tool, videos were displayed in the tool results block but were NOT appearing in the "YouTube Videos" section of the extracted content (alongside "All Links", "All Images", etc.).

## Root Cause

The backend extraction logic in `src/endpoints/chat.js` was missing a handler for `search_youtube` tool results. 

The extraction system processes tool results and aggregates content like:
- Links from `search_web`
- Images/videos from `scrape_web_content`
- Generated images from `generate_image`

But it had NO extraction logic for `search_youtube`, so YouTube videos from search results were never added to the `youtubeVideos` array in `extractedContent`.

## Solution

Added extraction logic for `search_youtube` tool results in `src/endpoints/chat.js` (lines ~2450-2463).

### Code Added:

```javascript
// Extract from search_youtube results
if (toolMsg.name === 'search_youtube') {
    console.log(`📺 Processing search_youtube tool result`);
    if (parsed.videos && Array.isArray(parsed.videos)) {
        for (const video of parsed.videos) {
            allVideos.push({
                src: video.url,
                title: video.title || 'YouTube Video',
                source: 'youtube_search'
            });
        }
        console.log(`✅ Extracted ${parsed.videos.length} YouTube videos from search results`);
    }
}
```

### How It Works:

1. **Detects search_youtube results**: Checks if tool name is `search_youtube`
2. **Parses video array**: Extracts the `videos` array from the JSON response
3. **Adds to allVideos**: Pushes each video into the `allVideos` aggregation array
4. **Categorizes correctly**: Later processing separates YouTube videos from other videos
5. **Displays in UI**: Videos appear in the "📺 YouTube Videos" collapsible section

## Result

YouTube videos from search results now appear in TWO places:

1. **Inside tool result block** (when expanded):
   - Shows detailed search results with descriptions, channels, thumbnails
   - Original behavior, unchanged

2. **In extracted content section** (NEW):
   - Listed in "📺 YouTube Videos (N)" collapsible section
   - Appears alongside "All Links", "All Images", etc.
   - Consistent with other extracted content types

## Data Flow

```
search_youtube tool
    ↓
Returns: { videos: [...] }
    ↓
Backend extracts videos
    ↓
Adds to allVideos array
    ↓
Categorized as youtubeVideos
    ↓
Sent in extractedContent
    ↓
UI displays in "YouTube Videos" section
```

## Testing

To verify the fix works:

1. Perform a YouTube search: "find videos about AI"
2. Wait for results
3. Check the LLM response block
4. Look for "📺 YouTube Videos (N)" collapsible section
5. Expand it to see the list of videos
6. Videos should also appear in tool result block when expanded

## Files Modified

- `src/endpoints/chat.js` (lines ~2450-2463)
  - Added search_youtube extraction handler
  - Added logging for debugging

## Related Systems

This extraction system also handles:
- `search_web` → extracts links, images, videos
- `scrape_web_content` → extracts links, images, YouTube links, media
- `scrape_url` → extracts links, images, videos, media
- `generate_image` → extracts generated image metadata

All of these contribute to the unified `extractedContent` object that gets displayed in the organized sections below the LLM's response.
