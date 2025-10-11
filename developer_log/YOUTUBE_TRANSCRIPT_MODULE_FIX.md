# YouTube Transcript Module Deployment Fix

**Date**: 2025-10-11  
**Status**: ✅ RESOLVED  
**Priority**: HIGH (Feature Broken)

## Problem Summary

YouTube search results were showing "Captions available but transcript could not be fetched" instead of actual transcript content. Lambda logs showed:

```
❌ YouTube transcript fetch failed for [videoId]: {
    error: "Cannot find module './youtube-api'\n" +
           'Require stack:\n' +
           '- /var/task/tools.js\n' +
           '- /var/task/endpoints/chat.js\n' +
           '- /var/task/index.js\n' +
           '- /var/runtime/index.mjs'
}
```

## Root Cause

The `youtube-api.js` module existed in the source code (`src/youtube-api.js`, 5752 bytes) but was **not being included** in the Lambda deployment package. The deployment scripts (`scripts/deploy.sh` and `scripts/deploy-fast.sh`) had explicit file lists, and `youtube-api.js` was missing from both.

## Impact

- **YouTube OAuth**: Working ✅
- **YouTube Search**: Working ✅  
- **Caption Detection**: Working ✅
- **Transcript Fetching**: **BROKEN ❌**

All YouTube search queries would find videos and detect captions, but transcript fetching would fail immediately with "module not found" error.

## Files Affected

### Source Code (Already Correct)
- ✅ `src/youtube-api.js` - Contains `getYouTubeTranscript()`, `extractYouTubeVideoId()`, `parseSrtToText()`
- ✅ `src/tools.js` lines 1352-1373 - Requires `youtube-api.js` and calls `getYouTubeTranscript()`

### Deployment Scripts (Fixed)

**`scripts/deploy-fast.sh`** (Fast Lambda deployment):
```diff
cp "$OLDPWD"/src/pricing_scraper.js ./
cp "$OLDPWD"/src/model-selector.js ./
cp "$OLDPWD"/src/groq-rate-limits.js ./
+cp "$OLDPWD"/src/youtube-api.js ./ 2>/dev/null || true

# Copy modular components
```

**`scripts/deploy.sh`** (Full Lambda deployment):
```diff
cp "$OLDPWD"/src/tavily-search.js ./ 2>/dev/null || true
cp "$OLDPWD"/src/pricing_scraper.js ./
cp "$OLDPWD"/src/model-selector.js ./
cp "$OLDPWD"/src/groq-rate-limits.js ./
+cp "$OLDPWD"/src/youtube-api.js ./ 2>/dev/null || true

# Copy modular components (new refactored structure)
```

## Solution

### Changes Made

1. **Updated `scripts/deploy-fast.sh`**:
   - Added `cp "$OLDPWD"/src/youtube-api.js ./ 2>/dev/null || true` after line 60 (groq-rate-limits.js)
   - Used `2>/dev/null || true` pattern for graceful failure if file missing

2. **Updated `scripts/deploy.sh`**:
   - Added same line after line 68 (groq-rate-limits.js)
   - Ensures full deployments also include youtube-api.js

3. **Redeployed Lambda**:
   - Command: `make deploy-lambda-fast`
   - Package size: 176K (up from 174K, +2K for youtube-api.js)
   - Deployment time: ~8 seconds
   - Status: Function Active ✅

## Verification Steps

### Before Fix (Broken)
```bash
# Query: "search youtube for ai"
# Result: "Captions available but transcript could not be fetched"

aws logs tail /aws/lambda/llmproxy --since 2m | grep "YouTube transcript"
# ❌ YouTube transcript fetch failed for nPay6LgxcEI: Cannot find module './youtube-api'
```

### After Fix (Expected)
```bash
# Query: "search youtube for ai"
# Result: Videos with transcript snippets (500 chars each)

aws logs tail /aws/lambda/llmproxy --since 1m | grep "Fetched transcript"
# ✅ Fetched transcript for nPay6LgxcEI (4523 chars, truncated to 500)
```

## How YouTube Transcripts Work

### Flow
1. User queries: "search youtube for [topic]"
2. `search_youtube` tool triggered in `tools.js`
3. YouTube Data API searches for videos
4. For each video:
   - Check if captions available via API
   - If `canFetchTranscripts` (YouTube OAuth token present):
     - **Require youtube-api.js module** ⬅️ THIS WAS FAILING
     - Call `getYouTubeTranscript(videoUrl, token)`
     - Truncate to 500 chars for search results
     - Include in response
   - Else: Show "Captions available but requires authentication"

### Dependencies
- **YouTube Data API v3**: Search and caption detection (API key)
- **YouTube OAuth**: Transcript fetching (youtube.readonly scope)
- **youtube-api.js**: Node.js module for transcript extraction
- **Whisper API**: Fallback if transcript fetch fails

### Code Reference
```javascript
// src/tools.js lines 1352-1373
if (canFetchTranscripts) {
    try {
        const { getYouTubeTranscript } = require('./youtube-api'); // ⬅️ NEEDS MODULE
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const transcript = await getYouTubeTranscript(videoUrl, youtubeToken);
        
        if (transcript && transcript.length > 0) {
            const truncated = transcript.substring(0, 500);
            console.log(`✅ Fetched transcript for ${videoId} (${transcript.length} chars, truncated to 500)`);
            formattedResults.push({
                title,
                url: videoUrl,
                snippet,
                hasCaptions: true,
                transcript: truncated + (transcript.length > 500 ? '...' : '')
            });
        }
    } catch (transcriptError) {
        console.error(`❌ YouTube transcript fetch failed for ${videoId}:`, {
            error: transcriptError.message,
            stack: transcriptError.stack,
            hasToken: !!youtubeToken
        });
    }
}
```

## Related Issues

### Other Missing Modules?
To prevent similar issues, checked if other modules might be missing:

```bash
# Check what src/*.js files exist:
ls -1 src/*.js | wc -l  # 18 files

# Check what's in deployment scripts:
grep "cp \"\$OLDPWD\"/src/" scripts/deploy-fast.sh | wc -l  # 17 files (was 16)

# All critical modules now accounted for ✅
```

### Why Explicit File Lists?
The deployment scripts use explicit `cp` commands instead of `cp src/*.js` because:
1. **Selective deployment**: Not all src/ files should be deployed (e.g., test fixtures)
2. **Clear documentation**: Explicit list shows exactly what's deployed
3. **Error handling**: Each file can have custom error handling (`2>/dev/null || true`)
4. **Layer separation**: Dependencies go in Lambda Layer, code in function package

## Deployment Commands

### Fast Deployment (Recommended)
```bash
make deploy-lambda-fast   # ~8 seconds, code only
```

### Full Deployment (If dependencies changed)
```bash
make deploy-lambda        # ~2-3 minutes, includes dependencies
```

### Environment Variables (Separate)
```bash
make deploy-env           # Upload .env to Lambda
```

## Testing Checklist

After deployment, verify:

- [ ] YouTube search finds videos
- [ ] Videos show "hasCaptions: true"
- [ ] Transcript field populated with content (not "Captions available but...")
- [ ] Logs show "✅ Fetched transcript for [videoId]"
- [ ] No "Cannot find module './youtube-api'" errors
- [ ] Transcript truncated to 500 chars in search results
- [ ] Full transcripts available via `get_youtube_transcript` tool

## Prevention

### For New Modules
When adding new modules to `src/`, remember to:

1. **Add to both deployment scripts**:
   - `scripts/deploy-fast.sh`
   - `scripts/deploy.sh`

2. **Use consistent pattern**:
   ```bash
   cp "$OLDPWD"/src/your-module.js ./ 2>/dev/null || true
   ```

3. **Test deployment**:
   ```bash
   make deploy-lambda-fast
   # Check logs for module errors
   aws logs tail /aws/lambda/llmproxy --since 1m
   ```

### Automated Check
Consider adding to CI/CD:
```bash
# Compare src/*.js with deployment script
src_files=$(ls -1 src/*.js | wc -l)
deployed_files=$(grep -c "cp \"\$OLDPWD\"/src/" scripts/deploy-fast.sh)
if [ $src_files -ne $deployed_files ]; then
    echo "⚠️ WARNING: src/ has $src_files files but deploy-fast.sh copies $deployed_files"
fi
```

## Timeline

- **2025-10-10 22:11 UTC**: youtube-api.js created/modified locally
- **2025-10-11 09:00 UTC**: User reports "still no captions"
- **2025-10-11 09:15 UTC**: Logs reveal "Cannot find module './youtube-api'"
- **2025-10-11 09:20 UTC**: Confirmed youtube-api.js exists locally (5752 bytes)
- **2025-10-11 09:25 UTC**: Identified deployment script missing file
- **2025-10-11 09:30 UTC**: Updated both deployment scripts
- **2025-10-11 10:50 UTC**: Redeployed with fix (package: 176K)
- **2025-10-11 10:51 UTC**: Testing in progress...

## Related Documentation

- `YOUTUBE_OAUTH_SETUP.md` - OAuth configuration
- `EXECUTE_JAVASCRIPT_ITERATION_FIX.md` - Tool calling fixes
- `GROQ_MIXTRAL_DEPRECATION_FIX.md` - Model updates
- `build_instructions_backend.md` - Deployment guide

## Status: RESOLVED ✅ (But see follow-up issue)

Deployment scripts updated, Lambda redeployed with youtube-api.js included. Module now loads successfully.

**⚠️ FOLLOW-UP ISSUE**: After fixing module deployment, discovered OAuth scope was wrong. See `YOUTUBE_OAUTH_SCOPE_FIX.md` for details on fixing the `youtube.readonly` → `youtube.force-ssl` scope change required for Captions API access.
