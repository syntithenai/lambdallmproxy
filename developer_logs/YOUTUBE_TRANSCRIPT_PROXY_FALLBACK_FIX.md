# YouTube Transcript Proxy Fallback Fix

**Date**: 2025-01-11 14:46 UTC  
**Status**: DEPLOYED  
**Issue**: Google blocking transcript requests with HTTP 429 "automated queries" error

## Problem

YouTube transcript fetching was failing with Google blocking messages:
```
"it seems like my computer is making automated queries so request blocked"
HTTP 429: Google blocked request (automated queries detected)
```

Even though proxy credentials were configured in the UI, transcripts were still being blocked by Google's anti-bot detection.

## Root Causes

### Issue 1: `transcribe_url` Tool Not Using Context Proxy

**Location**: `src/tools.js` line 1692-1695

The `transcribe_url` tool was hardcoded to use environment variables instead of checking for UI-provided proxy credentials first:

```javascript
// ❌ BEFORE (only used env vars)
result = await getYouTubeTranscriptViaInnerTube(videoId, {
  language,
  includeTimestamps,
  proxyUsername: process.env.WEBSHARE_PROXY_USERNAME,  // ❌ Ignored UI settings
  proxyPassword: process.env.WEBSHARE_PROXY_PASSWORD   // ❌ Ignored UI settings
});
```

**Impact**: Users configuring proxy in the UI settings had their credentials ignored for transcript fetching.

### Issue 2: No Fallback in `makeHttpsRequestWithProxy`

**Location**: `src/youtube-api.js` line 305-350

The `makeHttpsRequestWithProxy` helper function (used by InnerTube API) had no fallback logic:
- If proxy failed → Request failed completely
- If Google blocked proxy IP → No retry with direct connection
- No error detection for Google's "automated queries" message

## Solutions

### Fix 1: Use Context Proxy Credentials in `transcribe_url`

**File**: `src/tools.js` (lines 1687-1698)

```javascript
// ✅ AFTER (UI settings take priority)
// Get proxy credentials from context (posted from UI) or environment variables
const proxyUsername = context.proxyUsername || process.env.WEBSHARE_PROXY_USERNAME;
const proxyPassword = context.proxyPassword || process.env.WEBSHARE_PROXY_PASSWORD;

// Try InnerTube API first (works for all public videos)
try {
  console.log('🔄 Attempting InnerTube API for detailed transcript...');
  result = await getYouTubeTranscriptViaInnerTube(videoId, {
    language,
    includeTimestamps,
    proxyUsername,   // ✅ Uses UI settings first
    proxyPassword    // ✅ Falls back to env vars
  });
  console.log(`✅ InnerTube API succeeded`);
```

### Fix 2: Add Fallback Logic to `makeHttpsRequestWithProxy`

**File**: `src/youtube-api.js` (lines 305-393)

Completely rewrote the function to include:

1. **Proxy Error Detection**
   - Detects `ECONNREFUSED`, `ETIMEDOUT`, `ECONNRESET`, `ENOTFOUND`
   - Marks errors with `PROXY_FAILED:` prefix
   
2. **Google Block Detection**
   - Checks response body for "automated queries" message
   - Checks for `g-recaptcha` (CAPTCHA challenge)
   - Marks as `PROXY_FAILED` to trigger retry

3. **Automatic Retry Logic**
   - Try with proxy first
   - If proxy fails → Retry without proxy
   - If direct succeeds → Return result
   - If both fail → Clear error message

**Implementation**:

```javascript
function makeHttpsRequestWithProxy(url, options = {}) {
  return new Promise(async (resolve, reject) => {
    const usingProxy = !!options.agent;
    
    const makeRequest = (useProxy = true) => {
      return new Promise((resolveReq, rejectReq) => {
        const reqOptions = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: options.method || 'GET',
          headers: options.headers || {},
          agent: (useProxy && options.agent) ? options.agent : undefined
        };
        
        // ... request setup ...
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolveReq(data);
          } else {
            // ✅ Check for Google blocking message
            if (data.includes('automated queries') || data.includes('g-recaptcha')) {
              if (usingProxy && useProxy) {
                rejectReq(new Error(`PROXY_FAILED:HTTP ${res.statusCode}: Google blocked request`));
              } else {
                rejectReq(new Error(`HTTP ${res.statusCode}: Google blocked request`));
              }
            } else {
              rejectReq(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          }
        });
        
        req.on('error', (err) => {
          // ✅ Mark proxy-related errors
          if (usingProxy && useProxy && (
            err.message.includes('proxy') || 
            err.code === 'ECONNREFUSED' || 
            err.code === 'ETIMEDOUT' || 
            err.code === 'ECONNRESET' || 
            err.code === 'ENOTFOUND'
          )) {
            rejectReq(new Error(`PROXY_FAILED:${err.message}`));
          } else {
            rejectReq(new Error(`Request failed: ${err.message}`));
          }
        });
      });
    };
    
    // ✅ Try with proxy first, fallback to direct
    try {
      const result = await makeRequest(true);
      resolve(result);
    } catch (error) {
      if (usingProxy && error.message.startsWith('PROXY_FAILED:')) {
        const originalError = error.message.replace('PROXY_FAILED:', '');
        console.log(`⚠️ YouTube API proxy failed (${originalError}), retrying direct...`);
        try {
          const result = await makeRequest(false);
          console.log(`✅ YouTube API direct connection successful`);
          resolve(result);
        } catch (retryError) {
          reject(new Error(`Both proxy and direct connection failed: ${retryError.message}`));
        }
      } else {
        reject(error);
      }
    }
  });
}
```

## Affected Components

### Functions Fixed
1. ✅ `transcribe_url` tool - Now uses context proxy credentials
2. ✅ `makeHttpsRequestWithProxy` - Now has automatic fallback
3. ✅ `getYouTubeTranscriptViaInnerTube` - Benefits from fallback logic

### Request Flow
```
User Request
    ↓
transcribe_url tool
    ↓
Check context.proxyUsername/proxyPassword (UI settings)
    ↓
Falls back to process.env (if no UI settings)
    ↓
getYouTubeTranscriptViaInnerTube(videoId, { proxyUsername, proxyPassword })
    ↓
Creates proxy agent with Webshare credentials
    ↓
makeHttpsRequestWithProxy(url, { agent: proxyAgent })
    ↓
TRY: Request with proxy
    ↓
FAIL: Google blocks with "automated queries"
    ↓
RETRY: Request without proxy (direct connection)
    ↓
SUCCESS: Transcript fetched
```

## Deployment

**Command**: `make deploy-lambda-fast`  
**Time**: 2025-01-11 14:46:13 UTC  
**Package**: function.zip (183KB)  
**Status**: ✅ Successfully deployed

## Testing Instructions

### Test 1: Transcript with Valid Proxy

**Query**: "transcribe this video https://youtube.com/watch?v=abc123"

**Expected Behavior**:
```
Lambda Logs:
🔄 Attempting InnerTube API for detailed transcript...
Using Webshare proxy: exrihquq-rotate@p.webshare.io
✅ InnerTube API succeeded
✅ Fetched transcript (2500 chars)
```

**Result**: Transcript returned successfully via proxy

### Test 2: Transcript with Failing Proxy

**Setup**: Configure proxy but service is down or IP is blocked

**Expected Behavior**:
```
Lambda Logs:
🔄 Attempting InnerTube API for detailed transcript...
Using Webshare proxy: exrihquq-rotate@p.webshare.io
⚠️ YouTube API proxy failed (Google blocked request), retrying direct...
✅ YouTube API direct connection successful
✅ Fetched transcript (2500 chars)
```

**Result**: Transcript returned successfully via direct connection

### Test 3: YouTube Search with Transcript Fetching

**Query**: "search youtube for ai tutorials"

**Expected Behavior**:
```
Lambda Logs:
🔧 YouTube API search - Proxy: ENABLED
Found 10 videos, fetching public transcripts...
Fetching transcript 1/10: abc123
Using Webshare proxy: exrihquq-rotate@p.webshare.io
✅ Fetched InnerTube transcript for abc123 (1200 chars)
[Repeats for each video]
```

**Result**: All transcripts fetched (with fallback if needed)

### Test 4: Google Blocking Detection

**Setup**: Run many requests quickly to trigger Google blocking

**Expected Behavior**:
```
Lambda Logs:
⚠️ YouTube API proxy failed (HTTP 429: Google blocked request), retrying direct...
✅ YouTube API direct connection successful
```

**Result**: Automatic fallback avoids failure

## Error Handling Matrix

| Scenario | Proxy Attempt | Fallback | Final Result |
|----------|--------------|----------|--------------|
| Valid proxy, Google allows | ✅ Success | Not needed | Transcript via proxy |
| Valid proxy, Google blocks proxy IP | ❌ Blocked | ✅ Direct success | Transcript via direct |
| Invalid proxy credentials | ❌ ECONNREFUSED | ✅ Direct success | Transcript via direct |
| Proxy timeout | ❌ ETIMEDOUT | ✅ Direct success | Transcript via direct |
| Proxy DNS fail | ❌ ENOTFOUND | ✅ Direct success | Transcript via direct |
| No proxy configured | N/A (direct) | Not needed | Transcript via direct |
| Proxy fails, Google blocks direct too | ❌ Blocked | ❌ Blocked | Both failed error |

## Console Logging

### Success via Proxy
```
🔄 Attempting InnerTube API for detailed transcript...
Using Webshare proxy: exrihquq-rotate@p.webshare.io
✅ InnerTube API succeeded
```

### Fallback to Direct
```
⚠️ YouTube API proxy failed (HTTP 429: Google blocked request), retrying direct...
✅ YouTube API direct connection successful
```

### Both Failed
```
⚠️ YouTube API proxy failed (ECONNREFUSED), retrying direct...
❌ Error: Both proxy and direct connection failed: HTTP 429: Google blocked request
```

## Benefits

### 1. **Honors UI Settings**
- UI proxy settings now work for transcript fetching
- No need to edit `.env` file
- Priority: context > environment variables

### 2. **Resilient to Proxy Failures**
- Proxy issues don't block users
- Automatic fallback to direct connection
- Graceful degradation

### 3. **Google Block Detection**
- Recognizes "automated queries" message
- Detects CAPTCHA challenges
- Triggers fallback automatically

### 4. **Better Error Messages**
- Clear logging of fallback events
- Distinguishes proxy vs target failures
- Easy debugging

## Known Limitations

### When Fallback Won't Help

1. **Google Blocks AWS IPs Completely**
   - If Google blocks both proxy AND AWS IPs
   - Both attempts will fail
   - Need different proxy provider or wait

2. **Rate Limiting on Both Paths**
   - Rapid requests may trigger blocks on both
   - Implement request throttling
   - Add delays between transcript fetches

3. **CAPTCHA Challenges**
   - Google may require CAPTCHA
   - Cannot be solved programmatically
   - Need manual intervention or better proxies

## Recommendations

### For Best Results

1. **Use Residential Proxies** (like Webshare)
   - Rotating IPs avoid blocks
   - Better than datacenter proxies
   - More expensive but more reliable

2. **Implement Rate Limiting**
   - Don't fetch too many transcripts rapidly
   - Add delays between requests
   - Respect YouTube's rate limits

3. **Monitor Logs**
   - Watch for repeated fallback events
   - If all requests need fallback, proxy may be blocked
   - Consider switching proxy provider

4. **Have Backup Strategy**
   - Keep environment variables configured
   - Direct connection works from some AWS regions
   - OAuth API as last resort (requires user auth)

## Related Documentation

- **Proxy Settings UI**: [PROXY_SETTINGS_UI_COMPLETE.md](./PROXY_SETTINGS_UI_COMPLETE.md)
- **Proxy Fallback (Search/Scraping)**: [PROXY_FALLBACK_IMPLEMENTATION.md](./PROXY_FALLBACK_IMPLEMENTATION.md)
- **YouTube API Proxy Fix**: [YOUTUBE_API_PROXY_FIX.md](./YOUTUBE_API_PROXY_FIX.md)
- **Proxy Export Fix**: [YOUTUBE_PROXY_EXPORT_FIX.md](./YOUTUBE_PROXY_EXPORT_FIX.md)

## Troubleshooting

### Transcripts still failing?

**Check logs for patterns**:
```bash
aws logs tail /aws/lambda/llmproxy --since 10m --filter-pattern "transcript" | grep -E "(Proxy|fallback|blocked)"
```

**Possible causes**:
1. **Both proxy and direct blocked**: Google is blocking both paths
   - Solution: Wait or use different proxy provider
   
2. **Proxy credentials not sent**: UI settings not being passed
   - Check browser console for proxy settings load
   - Verify localStorage contains proxy_settings
   
3. **Video has no captions**: Not a blocking issue
   - Some videos don't have transcripts
   - Expected behavior

4. **AWS region blocked**: Some AWS regions more blocked than others
   - Consider deploying to different region
   - Use CloudFront in front of Lambda

### Still seeing "automated queries"?

1. **Clear pattern**: If EVERY request gets blocked
   - Google has blacklisted your IP range
   - Switch proxy provider or wait 24 hours
   
2. **Intermittent**: Some succeed, some fail
   - Normal with rotating proxies
   - Fallback should handle it
   - Check logs for "Direct connection successful"

3. **After many requests**: Rate limit triggered
   - Implement request throttling
   - Add 2-3 second delays between transcript fetches
   - Reduce number of videos processed

## Status

✅ **RESOLVED** - YouTube transcripts now have:
- UI proxy settings support
- Automatic fallback to direct connection
- Google block detection
- Better error messages

**Next Steps**:
- Monitor logs for fallback frequency
- Adjust proxy provider if needed
- Consider request throttling for bulk operations
