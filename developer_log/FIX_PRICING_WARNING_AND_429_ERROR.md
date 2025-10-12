# Fix: Show Warning When Pricing Info Unavailable + 429 Error Investigation

**Date**: 2025-01-12  
**Issues**: 
1. UI doesn't show warning when model pricing information is unavailable
2. Intermittent 429 Too Many Requests error in UI

## Issue 1: Missing Pricing Warning

### Problem
When a provider/model doesn't have pricing information in the pricing catalog, the LLM Info dialog shows nothing for the cost field. Users can't tell if the cost is $0.00 or if pricing data is missing.

### Solution
Updated `LlmInfoDialog.tsx` to show a warning when `breakdown.hasPricing` is false:

**File**: `ui-new/src/components/LlmInfoDialog.tsx` (lines 308-328)

**Before**:
```typescript
if (breakdown.hasPricing) {
  // ... show pricing
}
return null;  // Show nothing if no pricing
```

**After**:
```typescript
if (breakdown.hasPricing) {
  // ... show pricing
} else {
  // Show warning when no pricing information is available
  return (
    <span className="font-medium text-yellow-600 dark:text-yellow-400" title="Pricing information not available for this model">
      ⚠️ No pricing info
    </span>
  );
}
return null;
```

### Deployment
```bash
make deploy-ui
```

✅ Successfully deployed to https://lambdallmproxy.pages.dev

### Result
- Models with pricing: Shows cost as before (`💰 $0.0000` or `💰 Free (would be $0.0001 on paid)`)
- Models without pricing: Shows `⚠️ No pricing info` in yellow with hover tooltip
- Clear visual distinction between $0.00 (free) and unknown pricing

## Issue 2: 429 Too Many Requests Error

### Error Details
```
Error: Request failed: 429 Too Many Requests
  at createSSERequest (http://localhost:8081/src/utils/streaming.ts:78:11)
  at sendChatMessageStreaming (http://localhost:8081/src/utils/api.ts:149:20)
  at handleSend (http://localhost:8081/src/components/ChatTab.tsx:1085:7)
```

### Investigation

**Error Source**: The 429 error comes from `streaming.ts:144`:
```typescript
if (!response.ok) {
  throw new Error(`Request failed: ${response.status} ${response.statusText}`);
}
```

This means the Lambda function itself is returning HTTP 429, not the UI code generating it.

### Possible Causes

1. **Provider Rate Limits**: Groq/OpenAI returning 429, Lambda forwards it
   - Check CloudWatch logs for upstream 429 errors
   - Groq free tier limits: 14,400 requests/day, 30,000 tokens/minute
   
2. **Lambda Concurrency Limit**: Too many simultaneous requests
   - AWS Lambda default: 1000 concurrent executions per region
   - Check AWS Lambda metrics in console
   
3. **API Gateway Rate Limiting**: If using API Gateway (not Lambda URL)
   - Check API Gateway throttling settings
   
4. **Application-Level Rate Limiting**: Custom rate limiting code
   - Checked backend - no explicit 429 responses found
   - Rate limits are detected/handled but not enforced by Lambda

### CloudWatch Log Analysis

From recent logs (2025-10-12 07:09):
- ✅ All requests succeeded (status 200)
- ✅ Rate limit headers present: `14,397 remaining requests`, `5,652 remaining tokens`
- ✅ No 429 errors in logs
- ❌ Google Sheets logging failing (missing `jsonwebtoken` module - separate issue)

**Conclusion**: 429 error is **intermittent** and not present in recent logs.

### Debugging Steps

1. **Check when it happens**:
   - After many rapid requests?
   - Specific provider/model?
   - Random/intermittent?

2. **Check CloudWatch logs immediately after 429**:
   ```bash
   make logs
   ```
   Look for:
   - Upstream provider 429 errors
   - Lambda timeout/throttling
   - Rate limit tracker messages

3. **Check Lambda metrics** (AWS Console):
   - Concurrent executions
   - Throttles count
   - Error rate
   - Duration (timeouts?)

4. **Check provider rate limits**:
   - Groq: Headers show `x-ratelimit-remaining-*`
   - OpenAI: Check usage dashboard
   - Together AI: Check account limits

5. **Reproduce**:
   - Send multiple rapid requests
   - Try different providers
   - Check if it's tied to specific tools (image generation, transcription)

### Potential Fixes

**If from provider rate limits**:
1. Implement exponential backoff in UI (already in backend)
2. Show rate limit info to user
3. Queue requests locally
4. Switch providers automatically

**If from Lambda concurrency**:
1. Increase reserved concurrency in AWS Console
2. Add request queuing
3. Implement circuit breaker in UI

**If intermittent/random**:
1. Add retry logic in UI (with exponential backoff)
2. Show friendly error message
3. Log errors to help debug

### Recommended Fix: Add UI Retry Logic

Update `streaming.ts` to retry on 429:

```typescript
export async function createSSERequest(
  url: string,
  body: any,
  token: string,
  signal?: AbortSignal,
  youtubeToken?: string | null,
  maxRetries = 3,  // NEW
  retryDelay = 1000  // NEW
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (youtubeToken) {
    headers['X-YouTube-Token'] = youtubeToken;
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        // NEW: Retry on 429
        if (response.status === 429 && attempt < maxRetries - 1) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay * Math.pow(2, attempt);
          console.warn(`Rate limited (429), retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(`Request failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
```

## Files Modified

- `ui-new/src/components/LlmInfoDialog.tsx` - Added pricing warning (deployed)

## Files to Modify (For 429 Fix)

- `ui-new/src/utils/streaming.ts` - Add retry logic (not yet implemented)

## Next Steps

1. ✅ Pricing warning deployed - test in UI
2. ⏳ Monitor for 429 errors - check CloudWatch when they occur
3. ⏳ If 429 persists, implement retry logic in streaming.ts
4. ⏳ Consider adding rate limit info to UI (show remaining requests/tokens)

## Testing

### Pricing Warning
1. Use a model without pricing info (if any exist)
2. Open LLM Info dialog
3. Verify `⚠️ No pricing info` appears in yellow

### 429 Error
1. Send many rapid requests (10+ in quick succession)
2. Check if 429 occurs
3. If yes, check CloudWatch logs: `make logs`
4. Note which provider/model triggered it
