# YouTube API Proxy Fix & Proxy Infrastructure Plan

**Date**: 2025-10-11 02:05:30 UTC  
**Status**: ⚠️ PARTIALLY DEPLOYED (Critical fix done, more work needed)  
**Priority**: CRITICAL (HTTP 429 errors blocking YouTube search)

---

## Problem Discovered

### Critical Issue: YouTube Data API NOT Using Proxy

**Symptom**: HTTP 429 errors with Google's "Sorry..." page when searching YouTube

**Root Cause**: The YouTube Data API v3 search request (used to find videos) was making direct HTTPS calls to Google WITHOUT using the Webshare residential proxy. Only the InnerTube API (transcript fetching) was using the proxy.

**Evidence**:
```javascript
// OLD CODE in src/tools.js (line ~1353)
https.get(apiUrl, {
  headers: { 'Accept': 'application/json' }
}, (res) => {
  // ... NO PROXY AGENT!
});
```

**Result**: Google detects automated queries from AWS Lambda IP and blocks with HTTP 429.

---

## Solution Implemented ✅

### 1. Added Proxy to YouTube Data API Search

**File**: `src/tools.js` (lines 1327-1370)

**Changes**:
```javascript
// Import proxy agent creator
const { createWebshareProxyAgent } = require('./youtube-api');

// Get proxy credentials from context (UI) or environment
const proxyUsername = context.proxyUsername || process.env.WEBSHARE_PROXY_USERNAME;
const proxyPassword = context.proxyPassword || process.env.WEBSHARE_PROXY_PASSWORD;

// Create proxy agent
const proxyAgent = createWebshareProxyAgent(proxyUsername, proxyPassword);
console.log(`🔧 YouTube API search - Proxy: ${proxyAgent ? 'ENABLED' : 'DISABLED'}`);

// Add to request options
const requestOptions = {
  headers: { ... },
  agent: proxyAgent  // ✅ NOW USING PROXY!
};

https.get(apiUrl, requestOptions, (res) => { ... });
```

**Benefits**:
- ✅ YouTube API search now routes through Webshare residential proxy
- ✅ Rotating IPs on each request (p.webshare.io:80 with username-rotate)
- ✅ Avoids Google's automated query detection
- ✅ Supports context.proxyUsername/proxyPassword for UI-provided credentials

**Deployment**: ✅ Deployed 02:05:30 UTC via `make deploy-lambda-fast`

---

## Testing Required

### Verify Proxy is Working

**Test Query**: "search youtube for ai news"

**Expected Logs**:
```
🔧 YouTube API search - Proxy: ENABLED
Using Webshare proxy: exrihquq-rotate@p.webshare.io
```

**Expected Result**:
- ✅ No HTTP 429 errors
- ✅ Videos found successfully
- ✅ Transcripts fetched successfully

**Check CloudWatch**:
```bash
aws logs tail /aws/lambda/llmproxy --since 5m --follow | grep "Proxy"
```

---

## Remaining Work

### 1. DuckDuckGo Search Proxy Support

**File**: `src/search.js`

**Current**: Uses Node's `http.request()` / `https.request()` without proxy

**Needed**:
```javascript
const { createWebshareProxyAgent } = require('./youtube-api');

// In constructor or method
this.proxyAgent = createWebshareProxyAgent(username, password);

// In fetchUrl() method (line ~1253)
const options = {
  hostname: parsedUrl.hostname,
  // ...
  agent: this.proxyAgent  // Add proxy agent
};

const req = client.request(options, (res) => { ... });
```

**Impact**: Avoid DuckDuckGo rate limiting

---

### 2. Content Scraping Proxy Support

**File**: `src/html-parser.js` (scrape_url tool)

**Current**: Uses Node's HTTP client without proxy

**Needed**: Same pattern as DuckDuckGo - add agent option

**Impact**: Avoid rate limiting when scraping web pages

---

### 3. Transcription Media Download Proxy Support

**File**: `src/tools/transcribe.js` (downloadYouTubeAudio, downloadDirectUrl)

**Current**: Uses ytdl-core and HTTP client without proxy

**Needed**: Add proxy agent to download requests

**Impact**: Avoid rate limiting when downloading media files

---

### 4. Proxy Configuration UI

#### A. Environment Variables (Already Exist)

**File**: `.env` (lines 29-32)
```properties
# Webshare Proxy Configuration (for YouTube transcript fetching)
# Get credentials from https://proxy2.webshare.io/userapi/credentials
WEBSHARE_PROXY_USERNAME=exrihquq
WEBSHARE_PROXY_PASSWORD=1cqwvmcu9ija
```

✅ No changes needed - already documented in .env

#### B. Settings UI Tab (NOT YET IMPLEMENTED)

**File**: `ui-new/src/components/SettingsModal.tsx` (needs new tab)

**Required Features**:
- Tab: "Proxy Settings"
- Fields: Username, Password
- Save to localStorage
- Send with every API request

**Storage Key**: `proxy_settings`

**Data Structure**:
```typescript
interface ProxySettings {
  username: string;
  password: string;
  enabled: boolean;
}
```

#### C. Send Proxy to Lambda (NOT YET IMPLEMENTED)

**File**: `ui-new/src/utils/api.ts`

**Current Request**:
```typescript
const requestPayload = {
  providers: [...],
  messages: [...],
  temperature: 0.7,
  stream: true
};
```

**Needed**:
```typescript
// Load from settings
const proxySettings = JSON.parse(localStorage.getItem('proxy_settings') || '{}');

const requestPayload = {
  providers: [...],
  messages: [...],
  temperature: 0.7,
  stream: true,
  // Add proxy settings
  proxyUsername: proxySettings.username,
  proxyPassword: proxySettings.password
};
```

**Lambda**: Already supports `context.proxyUsername` and `context.proxyPassword` (implemented in this fix)

---

### 5. YouTube Results as JSON Tree (NOT YET IMPLEMENTED)

**File**: `ui-new/src/components/ChatTab.tsx`

**Current**: YouTube results shown as plain text in tool result block

**Needed**:
- Detect search_youtube tool results
- Parse JSON response
- Render as expandable JSON tree
- Auto-expand all nodes EXCEPT "transcript" fields
- Use react-json-tree or similar library

**Example**:
```jsx
{toolResult.name === 'search_youtube' && (
  <JSONTree 
    data={JSON.parse(toolResult.content)}
    shouldExpandNode={(keyPath) => !keyPath.includes('transcript')}
  />
)}
```

---

## Google Blocking Analysis

### Can Google Block Residential Proxies?

**Yes, theoretically**, but it's much harder:

1. **Residential IPs**: Webshare uses real residential IPs (home ISPs)
2. **Rotating IPs**: Each request gets a different IP (username-rotate)
3. **Legitimate Traffic**: Indistinguishable from real users

### Possible Reasons for Continued Blocking

1. **Request Patterns**: Too many requests too fast from same session
   - **Solution**: Sequential processing with delays (already implemented)

2. **Headers**: Missing browser headers or suspicious patterns
   - **Solution**: Add more realistic headers (User-Agent, Referer already added)

3. **API Key Quota**: YouTube API key may have daily quota
   - **Solution**: Monitor quota at console.cloud.google.com

4. **Proxy Not Applied**: Bug in proxy implementation (most likely before fix)
   - **Solution**: Verify logs show "Proxy: ENABLED"

### Verification Steps

1. **Check Logs**: Confirm "Proxy: ENABLED" appears
2. **Check IP**: Log the actual IP being used (add to debug output)
3. **Test Single Video**: Try fetching one video to isolate issue
4. **Check Quota**: Verify YouTube API key quota not exceeded

---

## Priority Implementation Order

1. ✅ **DONE**: YouTube API search proxy (CRITICAL - DEPLOYED)
2. ⏳ **NEXT**: Test and verify proxy is working
3. 📋 **HIGH**: DuckDuckGo search proxy
4. 📋 **HIGH**: Content scraping proxy
5. 📋 **MEDIUM**: Settings UI for proxy configuration
6. 📋 **MEDIUM**: Send proxy from UI to Lambda
7. 📋 **LOW**: Transcription media download proxy
8. 📋 **LOW**: YouTube results JSON tree display

---

## Files Changed

### Backend (Deployed)
1. `src/tools.js` (lines 1327-1406)
   - Added `createWebshareProxyAgent` import
   - Added proxy credential loading from context/env
   - Added proxy agent to YouTube API request
   - Reused proxy credentials for InnerTube

### Pending Changes
1. `src/search.js` - Add proxy to DuckDuckGo
2. `src/html-parser.js` - Add proxy to scraping
3. `src/tools/transcribe.js` - Add proxy to downloads
4. `ui-new/src/components/SettingsModal.tsx` - Add proxy settings tab
5. `ui-new/src/utils/api.ts` - Send proxy to Lambda
6. `ui-new/src/components/ChatTab.tsx` - JSON tree display

---

## Testing Checklist

### Immediate (YouTube API Proxy)
- [ ] Test "search youtube for ai news"
- [ ] Check CloudWatch logs for "Proxy: ENABLED"
- [ ] Verify no HTTP 429 errors
- [ ] Confirm videos are found
- [ ] Confirm transcripts are fetched

### After Additional Proxy Implementations
- [ ] Test DuckDuckGo search
- [ ] Test content scraping
- [ ] Test transcription downloads
- [ ] Test proxy settings UI
- [ ] Test UI-provided proxy credentials override env

---

## Related Documentation

- `YOUTUBE_PROGRESS_UI_IMPLEMENTATION.md` - YouTube progress UI
- `YOUTUBE_RATE_LIMITING_FIX.md` - Sequential processing
- `HTTPSPROXY_AGENT_IMPORT_FIX.md` - HttpsProxyAgent fix
- `YOUTUBE_SEARCH_STREAMING_PROGRESS.md` - Streaming events

---

## Summary

**Critical Fix Deployed**: YouTube Data API v3 search now uses Webshare residential proxy to avoid Google's automated query detection (HTTP 429 errors).

**Next Steps**: Test to verify proxy is working, then extend proxy support to DuckDuckGo search, content scraping, and transcription downloads.

**UI Enhancements Pending**: Settings tab for proxy configuration, JSON tree display for YouTube results.
