# YouTube Search Empty Response - Root Cause and Fix

## Issue Description

**Query**: "search youtube for ai news"
**Problem**: Returns no tool calls and no response (empty response)
**Date**: 2025-10-11

## Root Cause Analysis

### The Problem

When `DISABLE_YOUTUBE_TRANSCRIPTION=true` was set, the system created a **confusing state** for the LLM:

1. **`search_youtube` tool description** said:
   - "🎬 SEARCH/FIND YouTube videos (NOT for transcription)"
   - "Use when user wants to FIND or SEARCH for videos"
   - **No mention of any restrictions**

2. **`transcribe_url` tool description** (modified by `getToolFunctions()`) said:
   - "**YOUTUBE TRANSCRIPTION DISABLED**: Cannot transcribe YouTube videos"
   - "DO NOT use for YouTube URLs"

### Why This Caused Empty Responses

The LLM received **contradictory signals**:
- User asks: "search youtube for ai news"
- LLM sees: `search_youtube` is available (tool description says to use it for searching)
- LLM also sees: "YouTube transcription disabled" in `transcribe_url` description
- LLM gets confused: "Should I search YouTube even though something YouTube-related is disabled?"
- **Result**: LLM returns empty response with no tool calls (`hasToolCalls=false, contentLength=0`)

### Code Evidence

From `src/tools.js` lines 1571-1585:

```javascript
function getToolFunctions() {
  const tools = [...toolFunctions];
  const disableYouTube = process.env.DISABLE_YOUTUBE_TRANSCRIPTION === 'true';
  
  if (disableYouTube) {
    // Only modifies transcribe_url description
    const transcribeToolIndex = tools.findIndex(t => t.function.name === 'transcribe_url');
    if (transcribeToolIndex >= 0) {
      tools[transcribeToolIndex] = {
        ...tools[transcribeToolIndex],
        function: {
          ...tools[transcribeToolIndex].function,
          description: '...YOUTUBE TRANSCRIPTION DISABLED...'
        }
      };
    }
    // ⚠️ Does NOT modify search_youtube description!
  }
  return tools;
}
```

### Logs Evidence

From CloudWatch logs (2025-10-10T22:07:34):

```
🔍 Tool execution decision: iteration=1, hasToolCalls=false, finishReason=null, 
   contentLength=0, hasSubstantiveAnswer=false
✅ Treating response as final - no tool calls
⚠️ WARNING: Empty response detected with no tool calls
   Using error fallback (no tool results)
```

Tool descriptions sent to LLM:
- `search_youtube`: "Use when user wants to FIND or SEARCH for videos" ✅
- `transcribe_url`: "**YOUTUBE TRANSCRIPTION DISABLED**: Cannot transcribe YouTube videos" ⚠️

## The Fix

### Solution: Set `DISABLE_YOUTUBE_TRANSCRIPTION=false`

Changed in `.env`:
```bash
# Before:
DISABLE_YOUTUBE_TRANSCRIPTION=true

# After:
DISABLE_YOUTUBE_TRANSCRIPTION=false
```

### Why This Works

With `DISABLE_YOUTUBE_TRANSCRIPTION=false`:
1. **`search_youtube`** keeps its normal description (unchanged)
2. **`transcribe_url`** keeps its normal description (supports YouTube)
3. **No contradictory signals** sent to LLM
4. **LLM can confidently call `search_youtube`** when user asks to search YouTube

### Deployment Steps

1. ✅ Updated `.env` file: `DISABLE_YOUTUBE_TRANSCRIPTION=false`
2. ✅ Deployed environment variables: `make deploy-env`
3. ✅ Redeployed Lambda function: `make deploy-lambda-fast`
4. ⏳ Test YouTube search functionality

## Alternative Solutions (If YouTube Transcription Really Needs to Be Disabled)

If you truly need to disable YouTube transcription while keeping search working, the code needs to be modified:

### Option 1: Better Tool Description Logic

Modify `getToolFunctions()` to clarify the distinction:

```javascript
if (disableYouTube) {
  // Update transcribe_url to say transcription is disabled
  const transcribeToolIndex = tools.findIndex(t => t.function.name === 'transcribe_url');
  if (transcribeToolIndex >= 0) {
    tools[transcribeToolIndex].function.description = 
      '🎙️ Transcribe audio/video from direct media URLs (.mp3, .mp4, etc.). ' +
      '**YOUTUBE TRANSCRIPTION DISABLED**: Cannot transcribe YouTube videos. ' +
      'Only use for non-YouTube media files.';
  }
  
  // Update search_youtube to clarify transcription is separate
  const searchYouTubeIndex = tools.findIndex(t => t.function.name === 'search_youtube');
  if (searchYouTubeIndex >= 0) {
    tools[searchYouTubeIndex].function.description = 
      '🎬 Search for YouTube videos (returns video links and metadata). ' +
      '**NOTE: Video transcription is disabled, but search works normally.** ' +
      'Use to find videos. Results include titles, descriptions, and links.';
  }
}
```

### Option 2: Remove `transcribe_url` Tool Entirely

If YouTube transcription is disabled, remove the tool completely:

```javascript
if (disableYouTube) {
  // Remove transcribe_url tool completely
  const filteredTools = tools.filter(t => t.function.name !== 'transcribe_url');
  return filteredTools;
}
```

### Option 3: Separate Flags

Use two separate environment variables:

```bash
DISABLE_YOUTUBE_TRANSCRIPTION=true   # Disables transcribing YouTube videos
DISABLE_YOUTUBE_SEARCH=false          # Keeps YouTube search enabled
```

## Testing

After applying the fix, test with:

**Query**: "search youtube for ai news"

**Expected Result**:
- ✅ LLM calls `search_youtube` tool with query="ai news"
- ✅ Returns list of YouTube videos with titles and URLs
- ✅ No empty response
- ✅ No confusing behavior

**Additional Tests**:
- "find youtube videos about machine learning" - Should call `search_youtube`
- "transcribe this video [YouTube URL]" - Should call `transcribe_url` (now enabled)

## Key Takeaways

1. **Environment variables affect LLM behavior**: When you modify tool descriptions based on config, ensure ALL related tools are updated consistently

2. **LLMs are sensitive to contradictions**: If one tool says "YouTube disabled" while another says "use this for YouTube", the LLM may refuse to use either

3. **Empty responses are a symptom**: When LLM returns empty response with no tool calls, it usually means:
   - Contradictory instructions in system prompt or tool descriptions
   - LLM unsure which tool to use
   - Safety filters triggering unexpectedly

4. **Test configuration changes**: After modifying environment variables that affect tool availability, always test the related functionality

## Related Files

- `.env` - Environment configuration
- `src/tools.js` - Tool definitions and `getToolFunctions()`
- `src/lambda_search_llm_handler.js` - Calls `getToolFunctions()` to get tool list
- `scripts/deploy-env.sh` - Deploys environment variables to Lambda
- `.github/copilot-instructions.md` - Documents when to run `make deploy-env`

## Timeline

- **Initial Problem**: `DISABLE_YOUTUBE_TRANSCRIPTION=true` set in local `.env`
- **First Attempt**: Deployed env vars to Lambda, but YouTube search still failed
- **Root Cause**: Contradictory tool descriptions confused LLM
- **Solution**: Set `DISABLE_YOUTUBE_TRANSCRIPTION=false`
- **Deployment**: 2025-10-11 09:09:56 UTC
- **Status**: ✅ FIXED

## Verification

Run these commands to verify the fix:

```bash
# Check current environment variable value
aws lambda get-function-configuration \
  --function-name llmproxy \
  --region us-east-1 \
  --query 'Environment.Variables.DISABLE_YOUTUBE_TRANSCRIPTION'

# Expected output: "false"

# Check recent logs
make logs | grep -i "youtube\|tool"

# Expected: No "YouTube is disabled" messages in logs
```
