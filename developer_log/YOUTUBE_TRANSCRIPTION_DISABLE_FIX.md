# YouTube Transcription Disable Fix

**Date**: 2025-01-11  
**Status**: ✅ Fixed & Deployed

## Problem

Despite setting `DISABLE_YOUTUBE_TRANSCRIPTION=true` in environment variables:
1. The LLM was still trying to use the `transcribe_url` tool for YouTube videos
2. The `search_youtube` tool was still attempting to fetch transcripts
3. Users saw unnecessary "transcript could not be fetched" messages

## Root Cause

The `DISABLE_YOUTUBE_TRANSCRIPTION` environment variable was only checked in the `transcribe_url` tool implementation, but not in:
1. The `transcribe_url` tool **description** (what the LLM sees)
2. The `search_youtube` tool (for automatic transcript fetching)

### Why This Matters

**LLMs make decisions based on tool descriptions**, not implementation code. Even though the `transcribe_url` tool would reject YouTube URLs, the LLM didn't know this from the description, so it kept trying to use the tool.

## Solution

### Fix #1: Dynamic Tool Descriptions

Created `getToolFunctions()` to modify tool descriptions based on environment:

**src/tools.js**:
```javascript
/**
 * Get tool functions with dynamic descriptions based on environment
 * Modifies tool availability based on configuration
 */
function getToolFunctions() {
  const tools = [...toolFunctions]; // Clone array
  
  // If YouTube transcription is disabled, update the transcribe_url description
  if (process.env.DISABLE_YOUTUBE_TRANSCRIPTION === 'true') {
    const transcribeToolIndex = tools.findIndex(t => t.function.name === 'transcribe_url');
    if (transcribeToolIndex >= 0) {
      tools[transcribeToolIndex] = {
        ...tools[transcribeToolIndex],
        function: {
          ...tools[transcribeToolIndex].function,
          description: '🎙️ Transcribe audio or video content from direct media URLs using OpenAI Whisper. **YOUTUBE TRANSCRIPTION DISABLED**: Cannot transcribe YouTube videos. Only supports direct media URLs (.mp3, .mp4, .wav, .m4a, etc.). Use for: audio files, video files with direct URLs, podcasts. DO NOT use for YouTube URLs.'
        }
      };
    }
  }
  
  return tools;
}
```

### Fix #2: Disable Transcript Fetching in search_youtube

**src/tools.js** (search_youtube tool):
```javascript
// BEFORE
const youtubeToken = context?.youtubeAccessToken;
const canFetchTranscripts = !!youtubeToken;

// AFTER
const disableYouTube = process.env.DISABLE_YOUTUBE_TRANSCRIPTION === 'true';
const youtubeToken = context?.youtubeAccessToken;
const canFetchTranscripts = !!youtubeToken && !disableYouTube; // Don't fetch if disabled

console.log(`🎬 YouTube search: ${videoIds.length} videos, OAuth available: ${!!youtubeToken}, Transcription disabled: ${disableYouTube}`);
```

### Fix #3: Update Lambda Handler

**src/lambda_search_llm_handler.js**:
```javascript
// BEFORE
const { toolFunctions, callFunction } = require('./tools');
...
tools: toolFunctions,

// AFTER
const { getToolFunctions, callFunction } = require('./tools');
...
const toolFunctions = getToolFunctions(); // Get environment-filtered tools
tools: toolFunctions,
```

## Impact

### Before Fixes
```
LLM sees: "Can transcribe YouTube URLs..."
LLM thinks: "I'll use transcribe_url for this YouTube video"
Tool rejects: "YouTube transcription disabled"
LLM confused: Tries again or gives error message
```

### After Fixes
```
LLM sees: "YOUTUBE TRANSCRIPTION DISABLED: Cannot transcribe YouTube videos"
LLM thinks: "I cannot transcribe YouTube videos, won't try"
Tool never called: Clean user experience
```

## Benefits

1. **LLM Awareness**: The LLM now knows YouTube transcription is disabled
2. **No Wasted Attempts**: LLM won't try to use disabled functionality
3. **Clean Search Results**: search_youtube won't show "could not fetch" messages
4. **Consistent Behavior**: Both tools respect the environment variable
5. **Better UX**: Users don't see confusing error messages

## Environment Variable Behavior

### When `DISABLE_YOUTUBE_TRANSCRIPTION=true`

**transcribe_url tool**:
- ❌ Rejects YouTube URLs with clear error
- ✅ Still works for direct media URLs (.mp3, .mp4, etc.)
- 📝 Description tells LLM it's disabled

**search_youtube tool**:
- ❌ Won't attempt to fetch transcripts
- ✅ Still returns video metadata (title, description, etc.)
- ✅ Still shows caption availability
- 📝 No "could not fetch" error messages

### When `DISABLE_YOUTUBE_TRANSCRIPTION=false` (or not set)

**Both tools work normally**:
- ✅ transcribe_url accepts YouTube URLs
- ✅ search_youtube fetches transcripts automatically
- 📝 Full functionality enabled

## Configuration

### Lambda Environment Variables

To disable YouTube transcription in AWS Lambda:

1. Go to Lambda Console → llmproxy function
2. Configuration → Environment variables
3. Add or update:
   ```
   DISABLE_YOUTUBE_TRANSCRIPTION = true
   ```
4. Save

**Note**: The deployed code automatically reads this variable. No code changes needed to toggle the feature.

## Testing

### Test Disabled State (DISABLE_YOUTUBE_TRANSCRIPTION=true)

1. **Search for YouTube videos**:
   ```
   User: "search YouTube for javascript tutorials"
   ```
   Expected: Videos listed, no transcript content, no error messages

2. **Try to transcribe YouTube URL**:
   ```
   User: "transcribe this video: https://youtube.com/watch?v=abc123"
   ```
   Expected: LLM should NOT use transcribe_url tool (knows it's disabled)

3. **Transcribe direct media URL**:
   ```
   User: "transcribe this audio: https://example.com/audio.mp3"
   ```
   Expected: Works normally (only YouTube is disabled)

### Test Enabled State (DISABLE_YOUTUBE_TRANSCRIPTION=false)

1. **Search for YouTube videos**:
   Expected: Videos listed WITH transcript previews (if OAuth enabled)

2. **Transcribe YouTube URL**:
   Expected: LLM uses transcribe_url tool, gets full transcript

## Deployment

**Deployed**: 2025-01-11 08:47:33 UTC  
**Method**: Fast Lambda deployment (code only)  
**Duration**: ~10 seconds  
**Endpoint**: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

## Files Modified

1. **src/tools.js** (3 changes):
   - Added `getToolFunctions()` function
   - Updated `search_youtube` to check `DISABLE_YOUTUBE_TRANSCRIPTION`
   - Exported `getToolFunctions` in module.exports

2. **src/lambda_search_llm_handler.js** (2 changes):
   - Changed import from `toolFunctions` to `getToolFunctions`
   - Call `getToolFunctions()` to get environment-filtered tools

## Why Dynamic Descriptions Matter

**Key Insight**: LLMs make tool selection decisions based on descriptions alone. They don't see the implementation code.

**Traditional Approach** (doesn't work well):
- Tool description says: "Can do X"
- Tool implementation blocks X
- LLM keeps trying, gets errors, confused

**Our Approach** (works perfectly):
- Tool description dynamically reflects what's available
- If X is disabled, description says "Cannot do X"
- LLM knows not to try, smooth experience

## Future Enhancements

1. **More Granular Controls**: Separate flags for search transcripts vs direct transcription
2. **Rate Limiting**: Add per-user transcript quotas
3. **Fallback Methods**: Try caption API if OAuth fails
4. **Caching**: Cache transcripts to reduce API calls
5. **Language Selection**: Allow users to specify preferred caption language

## Related Documentation

- [YOUTUBE_TRANSCRIPT_FIX.md](./YOUTUBE_TRANSCRIPT_FIX.md) - Previous transcript bugs and fixes
- [.env](./.env) - Environment variable configuration
- [src/youtube-api.js](./src/youtube-api.js) - YouTube OAuth integration
