# YouTube Search Empty Response Issue

**Date**: 2025-01-11  
**Status**: 🔍 Diagnosed - Requires Lambda Environment Variable Configuration

## Problem

Query: "search youtube for ai news"
Result: No tool calls, empty response

## Root Cause

The `.env` file has `DISABLE_YOUTUBE_TRANSCRIPTION=true`, but this environment variable **is only read locally during development**. The deployed Lambda function doesn't automatically read the `.env` file - it needs environment variables configured in AWS Lambda Console.

### Evidence from Logs

```
🔍 Tool execution decision: hasToolCalls=false, contentLength=0
⚠️ WARNING: Empty response detected with no tool calls
```

And in the tool descriptions logged, we see:
```
"description": "🎙️ **PRIMARY TOOL FOR GETTING VIDEO/AUDIO TEXT CONTENT**: ... **YOUTUBE SUPPORT**: Can transcribe directly from YouTube URLs
```

This shows the `getToolFunctions()` didn't modify the description, meaning the environment variable wasn't set in Lambda.

## Solution

You need to set the environment variable in **AWS Lambda Console**:

### Option 1: AWS Console (Recommended)

1. Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda)
2. Navigate to the `llmproxy` function
3. Click "Configuration" tab
4. Click "Environment variables" in the left sidebar
5. Click "Edit"
6. Add or update:
   - **Key**: `DISABLE_YOUTUBE_TRANSCRIPTION`
   - **Value**: `false` (to enable) or `true` (to disable)
7. Click "Save"

### Option 2: AWS CLI

```bash
aws lambda update-function-configuration \
  --function-name llmproxy \
  --environment "Variables={DISABLE_YOUTUBE_TRANSCRIPTION=false}"
```

### Option 3: Update Deployment Script

Modify `scripts/deploy.sh` or `scripts/deploy-fast.sh` to include environment variables during deployment.

## Current Behavior

### With DISABLE_YOUTUBE_TRANSCRIPTION=true (Local .env only)
- ❌ Lambda doesn't see the variable
- ❌ Tools show YouTube support
- ❌ LLM confused, returns empty response

### With DISABLE_YOUTUBE_TRANSCRIPTION=true (Set in Lambda)
- ✅ `getToolFunctions()` modifies descriptions
- ✅ transcribe_url description says "YouTube DISABLED"
- ✅ search_youtube skips transcript fetching
- ✅ LLM knows what's available

### With DISABLE_YOUTUBE_TRANSCRIPTION=false (or not set in Lambda)
- ✅ Full YouTube transcription enabled
- ✅ All tools work normally
- ✅ LLM makes proper tool calls

## Debug Logging Added

The code now logs environment variable status:

```javascript
console.log(`🎬 getToolFunctions: DISABLE_YOUTUBE_TRANSCRIPTION=${process.env.DISABLE_YOUTUBE_TRANSCRIPTION}, disabled=${disableYouTube}`);
```

After setting the environment variable in Lambda, you should see in CloudWatch logs:
- If disabled: `🎬 getToolFunctions: DISABLE_YOUTUBE_TRANSCRIPTION=true, disabled=true`
- If enabled: `🎬 getToolFunctions: DISABLE_YOUTUBE_TRANSCRIPTION=undefined, disabled=false`

## Recommended Action

**To enable YouTube transcription** (fix the empty response issue):

1. Go to AWS Lambda Console → llmproxy function
2. Configuration → Environment variables
3. Either:
   - Remove `DISABLE_YOUTUBE_TRANSCRIPTION` entirely (enables by default)
   - Or set `DISABLE_YOUTUBE_TRANSCRIPTION=false`
4. Save and test

**To disable YouTube transcription** (but allow other tools):

1. Set `DISABLE_YOUTUBE_TRANSCRIPTION=true` in Lambda Console
2. The code will then properly update tool descriptions
3. LLM will know transcription is disabled

## Why Empty Response?

The LLM saw:
- System prompt: "You have access to these tools: ... search_youtube, transcribe_url"
- transcribe_url description: "YOUTUBE SUPPORT: Can transcribe YouTube URLs"
- User query: "search youtube for ai news"

But internally:
- `transcribe_url` tool rejects YouTube URLs (code check)
- LLM doesn't know this from the description
- Gets confused, returns empty response

**Fix**: Set environment variable in Lambda so `getToolFunctions()` can update descriptions properly.

## Testing After Fix

1. **Set environment variable in Lambda Console**
2. **Try query**: "search youtube for ai news"
3. **Expected**: LLM calls `search_youtube` tool with query="ai news"
4. **Check logs**: Should see `🎬 getToolFunctions:` log line
5. **Result**: Videos returned successfully

## Files Modified

- **src/tools.js**: Added debug logging to `getToolFunctions()`

## Next Steps

1. ✅ Set `DISABLE_YOUTUBE_TRANSCRIPTION=false` in AWS Lambda environment variables
2. ✅ Test "search youtube for ai news" query
3. ✅ Verify tool calls work properly
4. ✅ Check CloudWatch logs for debug output

## Important Note

The `.env` file is only for **local development**. Deployed Lambda functions need environment variables configured through AWS Lambda Console or deployment scripts. This is a common source of confusion!

## Related Issues

- [YOUTUBE_TRANSCRIPT_FIX.md](./YOUTUBE_TRANSCRIPT_FIX.md) - Transcript fetching bugs
- [YOUTUBE_TRANSCRIPTION_DISABLE_FIX.md](./YOUTUBE_TRANSCRIPTION_DISABLE_FIX.md) - Dynamic tool descriptions

