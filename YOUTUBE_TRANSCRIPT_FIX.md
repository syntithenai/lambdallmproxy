# YouTube Transcript Fix for Search Results

**Date**: 2025-01-11  
**Status**: ✅ Fixed & Deployed (2 fixes applied)

## Problem

When using the `search_youtube` tool, video transcripts were not being retrieved even when:
1. YouTube OAuth was enabled and authenticated
2. Videos had captions available
3. The code attempted to fetch transcripts

Users saw "Captions available but transcript could not be fetched. Try using transcribe_url tool." instead of actual transcript content.

## Root Causes

### Bug #1: Property Name Mismatch in Context Object

### In `src/endpoints/chat.js` (Line 600):
```javascript
youtubeAccessToken: youtubeToken, // Pass YouTube OAuth token for transcript access
```

### In `src/tools.js` search_youtube (Line 1334 - BEFORE FIX):
```javascript
const youtubeToken = context?.youtubeToken;  // ❌ WRONG PROPERTY NAME
```

### In `src/tools.js` transcribe_url (Line 1207 - CORRECT):
```javascript
const youtubeAccessToken = context.youtubeAccessToken || null;  // ✅ CORRECT
```

**Result**: The `search_youtube` tool was always reading `undefined` for the OAuth token, so it never fetched transcripts even when authentication was available.

### Bug #2: Invalid Parameter to getYouTubeTranscript

**In `src/tools.js` search_youtube (Line 1346 - BEFORE FIX):**
```javascript
const transcript = await getYouTubeTranscript(videoId, youtubeToken);  // ❌ WRONG - passing videoId
```

**In `src/youtube-api.js` getYouTubeTranscript (Line 19):**
```javascript
async function getYouTubeTranscript(url, accessToken) {  // Expects full URL, not videoId
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL - could not extract video ID');  // ❌ This error was thrown
  }
```

**Result**: The function was being passed just a videoId (e.g., `"abc123"`) but it expects a full YouTube URL (e.g., `"https://www.youtube.com/watch?v=abc123"`). The `extractYouTubeVideoId()` function couldn't extract an ID from a plain videoId string, causing the error.

## Solution

### Fix #1: Corrected Property Name (Line 1334)

```javascript
// BEFORE (incorrect)
const youtubeToken = context?.youtubeToken;

// AFTER (fixed)
const youtubeToken = context?.youtubeAccessToken; // Fixed: use youtubeAccessToken (same as transcribe_url tool)
```

### Fix #2: Convert VideoId to Full URL (Lines 1345-1347)

```javascript
// BEFORE (incorrect)
const { getYouTubeTranscript } = require('./youtube-api');
const transcript = await getYouTubeTranscript(videoId, youtubeToken);

// AFTER (fixed)
const { getYouTubeTranscript } = require('./youtube-api');
// Convert videoId to full URL (getYouTubeTranscript expects URL, not just ID)
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const transcript = await getYouTubeTranscript(videoUrl, youtubeToken);
```

## Impact

### Before Fix
- YouTube search returned videos with "Captions available" message
- No transcript content in search results
- Users had to manually use `transcribe_url` tool for each video

### After Fix
- YouTube search automatically fetches transcripts (when OAuth enabled)
- First 500 characters of transcript shown in search results
- Full transcript length indicated
- Users can see content immediately without additional steps

### Example Output (After Fix)
```json
{
  "videos": [
    {
      "videoId": "abc123",
      "title": "JavaScript Tutorial",
      "transcript": "Welcome to this JavaScript tutorial. Today we'll cover...",
      "transcriptLength": 5432,
      "transcriptNote": "Full transcript available (5432 chars). Showing first 500 characters.",
      "hasCaptions": true
    }
  ]
}
```

## Code Flow

1. **Frontend**: User enables YouTube transcripts in settings
2. **OAuth**: Frontend sends OAuth token in `X-YouTube-Token` header
3. **Backend** (`chat.js`): Extracts token, adds to context as `youtubeAccessToken`
4. **Tool** (`search_youtube`): Now correctly reads `youtubeAccessToken` from context
5. **API Call**: Fetches captions using `getYouTubeTranscript()` from `youtube-api.js`
6. **Response**: Returns truncated transcript with each video result

## Related Files

### Modified
- **src/tools.js** (Line 1334): Fixed property name from `youtubeToken` to `youtubeAccessToken`

### Context
- **src/endpoints/chat.js** (Line 600): Sets `youtubeAccessToken` in context
- **src/youtube-api.js**: Contains `getYouTubeTranscript()` function
- **ui-new/src/contexts/YouTubeAuthContext.tsx**: Frontend OAuth management

## Testing

To verify the fix:

1. **Enable YouTube OAuth**:
   - Open app settings
   - Connect YouTube account
   - Grant permissions

2. **Search for videos**:
   ```
   User: "search YouTube for javascript tutorials"
   ```

3. **Verify transcript in results**:
   - Check that video results include `transcript` field
   - Verify transcript content is meaningful
   - Confirm `transcriptLength` is populated

4. **Check console logs**:
   ```
   🎬 YouTube search: 10 videos, OAuth available: true
   ✅ Fetched transcript for abc123 (5432 chars)
   ```

## Notes

- **Requirement**: Users must have YouTube OAuth enabled and authenticated
- **Truncation**: Only first 500 characters shown in search results (to keep response size manageable)
- **Full Transcript**: Users can still use `transcribe_url` tool for complete transcript
- **Language**: Prefers English captions, falls back to first available
- **Error Handling**: Gracefully falls back to caption availability info if transcript fetch fails

## Deployment

**First Deploy** (Fix #1): 2025-01-11 08:37:16 UTC  
**Second Deploy** (Fix #2): 2025-01-11 08:42:06 UTC  
**Method**: Fast Lambda deployment (code only)  
**Duration**: ~10 seconds each  
**Endpoint**: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

## Related Configuration

### Environment Variable (Optional)
```bash
DISABLE_YOUTUBE_TRANSCRIPTION=true  # Set to false to enable transcription
```

**Note**: This environment variable currently only affects the `transcribe_url` tool, not `search_youtube`. Consider adding consistent handling across both tools in future updates.

## Future Enhancements

1. **Add DISABLE_YOUTUBE_TRANSCRIPTION check** to `search_youtube` tool for consistency
2. **Configurable truncation length** for transcript preview
3. **Caching** of transcripts to reduce API calls
4. **Batch transcript fetching** optimization
5. **Auto-generated vs manual caption preference** setting
