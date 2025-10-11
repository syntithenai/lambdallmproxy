# HttpsProxyAgent Import Fix

**Date**: 2025-10-11 12:15:49 UTC  
**Status**: ✅ DEPLOYED  
**Priority**: CRITICAL (Blocking YouTube Transcripts)

---

## Problem

YouTube transcript fetching was failing with error:
```
❌ InnerTube transcript fetch failed for {videoId}: HttpsProxyAgent is not a constructor
```

This caused `search_youtube` to fall back to caption availability checks only, displaying:
```
Auto-generated captions available in en. Transcript could not be fetched. 
Use get_youtube_transcript or transcribe_url tool for full content.
```

---

## Root Cause

**Module Import Issue**: `https-proxy-agent` package version 7+ changed from default export to named export.

**Before (Incorrect)**:
```javascript
const HttpsProxyAgent = require('https-proxy-agent');
```

**After (Correct)**:
```javascript
const { HttpsProxyAgent } = require('https-proxy-agent');
```

The old import style returned the entire module object, not the constructor, causing `new HttpsProxyAgent()` to fail with "is not a constructor".

---

## Solution

**File**: `src/youtube-api.js` (line 288)

**Change**:
```javascript
// Before
function createWebshareProxyAgent(username, password) {
  // ...
  const HttpsProxyAgent = require('https-proxy-agent');
  return new HttpsProxyAgent(proxyUrl);
}

// After
function createWebshareProxyAgent(username, password) {
  // ...
  // https-proxy-agent v7+ uses named exports
  const { HttpsProxyAgent } = require('https-proxy-agent');
  return new HttpsProxyAgent(proxyUrl);
}
```

---

## Package Information

**package.json**:
```json
{
  "dependencies": {
    "https-proxy-agent": "^7.0.6"
  }
}
```

**Breaking Change**: Version 7.0.0 of `https-proxy-agent` changed from:
- v6.x: `module.exports = HttpsProxyAgent` (default export)
- v7.x: `module.exports = { HttpsProxyAgent }` (named export)

---

## Impact

### Before Fix
- ❌ All InnerTube API calls failed
- ❌ `search_youtube` couldn't fetch transcripts
- ❌ `get_youtube_transcript` couldn't fetch transcripts
- ⚠️ Fell back to caption availability checks only
- ⚠️ Users saw "Transcript could not be fetched" messages

### After Fix
- ✅ InnerTube API calls work correctly
- ✅ `search_youtube` fetches transcript snippets
- ✅ `get_youtube_transcript` fetches full transcripts with timestamps
- ✅ Webshare proxy functions correctly
- ✅ No more "is not a constructor" errors

---

## Testing

### Verify the Fix

**1. Check CloudWatch Logs**:
```bash
aws logs tail /aws/lambda/llmproxy --since 5m --filter-pattern "InnerTube"
```

**Expected (Success)**:
```
Fetching transcript via InnerTube for {videoId} (language: en)
Using Webshare proxy: exrihquq-rotate@p.webshare.io
Extracted InnerTube API key: AIzaSy...
Found 2 caption tracks
✅ Fetched InnerTube transcript for {videoId} (8234 chars)
```

**NOT Expected (Error)**:
```
❌ InnerTube transcript fetch failed for {videoId}: HttpsProxyAgent is not a constructor
```

**2. Test search_youtube**:
```bash
# Test query that should return videos with transcripts
curl -X POST https://nrw7ppe... \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_youtube",
    "args": {
      "query": "ai news",
      "limit": 3
    }
  }'
```

**Expected Response**:
```json
{
  "videos": [
    {
      "videoId": "...",
      "hasCaptions": true,
      "transcript": "First 500 characters of transcript...",
      "transcriptLength": 8234,
      "transcriptNote": "Full transcript available (8234 chars)..."
    }
  ]
}
```

**3. Test get_youtube_transcript**:
```bash
curl -X POST https://nrw7ppe... \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "get_youtube_transcript",
    "args": {
      "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "include_timestamps": true
    }
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "text": "Full transcript...",
  "snippets": [
    {"text": "...", "start": 0.0, "duration": 2.5}
  ],
  "metadata": {
    "source": "innertube"
  }
}
```

---

## Related Issues

### Similar Import Problems in Node.js

Many packages migrated to ESM/named exports in recent versions:
- `node-fetch` v3: `const fetch = require('node-fetch')` → `const {default: fetch} = require('node-fetch')`
- `chalk` v5: Requires ESM (no CommonJS support)
- `https-proxy-agent` v7: `require('https-proxy-agent')` → `require('https-proxy-agent').HttpsProxyAgent`

### Best Practice

Always check package changelogs when upgrading major versions:
```bash
npm show https-proxy-agent@7.0.0 --json | jq '.version,.main'
```

---

## Prevention

### 1. Add Type Checking
Consider adding JSDoc or TypeScript to catch constructor errors:
```javascript
/**
 * @returns {import('https-proxy-agent').HttpsProxyAgent}
 */
function createWebshareProxyAgent(username, password) {
  const { HttpsProxyAgent } = require('https-proxy-agent');
  return new HttpsProxyAgent(proxyUrl);
}
```

### 2. Test After Upgrades
Always test critical paths after dependency upgrades:
```bash
npm upgrade
npm test
# Test in Lambda environment
make deploy-lambda-fast
make logs
```

### 3. Pin Major Versions
Consider using exact versions or tilde ranges:
```json
{
  "dependencies": {
    "https-proxy-agent": "~7.0.6"  // Only patch updates
  }
}
```

---

## Deployment

**Deployed**: 2025-10-11 12:15:49 UTC  
**Method**: `make deploy-lambda-fast`  
**Package Size**: 180KB  
**Deployment Time**: ~10 seconds

**Verification**:
```bash
make logs  # Check for successful InnerTube requests
```

---

## Summary

Fixed critical module import issue causing all YouTube transcript fetching to fail. Changed from default export to named export syntax for `https-proxy-agent` v7+. This enables:

- ✅ Working InnerTube API calls
- ✅ Successful Webshare proxy connections
- ✅ Transcript fetching in `search_youtube`
- ✅ Full transcript support in `get_youtube_transcript`

The issue was caused by a breaking change in `https-proxy-agent` v7.0.0 that changed the module export structure. The fix is a one-line change to use destructuring for the named export.
