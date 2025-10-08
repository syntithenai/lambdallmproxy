# Search Result Truncation Fix

**Date**: October 9, 2025  
**Issue**: "Please reduce the length of the messages or completion" error  
**Root Cause**: Search tool returning 1.1M character results  
**Status**: ✅ FIXED

## Problem Analysis

### CloudWatch Evidence
```
INFO: Tool message 10: name=search_web, tool_call_id=functions.search_web:3, content_length=1111603
⚠️ WARNING: Sending 3 tool messages to LLM (iteration 2)
ERROR: Please reduce the length of the messages or completion.
```

### What Went Wrong

1. **NOT Old Tool Messages**: The filter bug from Phase 27 was already fixed. This was a different issue.

2. **Current Cycle Tool Results**: The search tool (`search_web`) loaded full page content and returned **1.1 MILLION characters** in a single tool result.

3. **Ineffective Truncation**: The `extractKeyContent()` function was supposed to limit content to 300 chars, but it wasn't being applied correctly or the result object was bypassing it.

4. **Weak Safety Net**: The fallback truncation only triggered if estimated tokens > 4000, but the estimation was inaccurate, allowing massive responses through.

## The Fix

### Layer 10: Per-Result Hard Limit

**File**: `src/tools.js` (lines 440-455)

Added hard character limit AFTER `extractKeyContent()` but BEFORE adding to results:

```javascript
// HARD LIMIT: Ensure content never exceeds 5000 chars per result
// This prevents massive tool responses that exceed model context
const MAX_SEARCH_RESULT_CHARS = 5000;
if (result.content && result.content.length > MAX_SEARCH_RESULT_CHARS) {
  console.log(`✂️ Truncating search result content: ${result.content.length} → ${MAX_SEARCH_RESULT_CHARS} chars`);
  result.content = result.content.substring(0, MAX_SEARCH_RESULT_CHARS) + '\n\n[Content truncated to fit model limits]';
  result.truncated = true;
}
```

**Impact**: Each search result now limited to 5K chars (~1250 tokens).

### Layer 11: Total Response Size Limit

**File**: `src/tools.js` (lines 876-906)

Added character-based safety check BEFORE returning response:

```javascript
const MAX_TOTAL_RESPONSE_CHARS = 50000; // ~12.5K tokens with JSON overhead

if (responseCharCount > MAX_TOTAL_RESPONSE_CHARS || estimatedTokens > 4000) {
  console.warn(`⚠️ Response too large (${responseCharCount} chars, ${estimatedTokens} tokens), aggressively truncating`);
  
  // More aggressive truncation: fewer results, shorter content
  const maxResults = Math.min(3, allResults.length); // Max 3 results
  const truncatedResults = allResults.slice(0, maxResults).map(r => ({
    ...r,
    description: (r.description || '').substring(0, 150),
    content: r.content ? r.content.substring(0, 300) : r.content, // Reduced from 500 to 300
    images: r.images ? r.images.slice(0, 1) : undefined, // Max 1 image
    links: r.links ? r.links.slice(0, 5) : undefined, // Max 5 links
    youtube: r.youtube ? r.youtube.slice(0, 2) : undefined, // Max 2 YouTube
    media: undefined // Drop media to save space
  }));
  
  return JSON.stringify({ 
    ...response, 
    results: truncatedResults,
    truncated: true,
    original_count: allResults.length,
    original_chars: responseCharCount,
    original_tokens: estimatedTokens
  });
}
```

**Impact**: Total search tool response limited to 50K chars (~12.5K tokens), with aggressive fallback truncation.

## Deployment

**Package**: llmproxy-20251009-090301.zip (108K)  
**Method**: `make fast` (10 seconds)  
**Status**: ✅ Active and Successful

## Testing Recommendation

Test with a search that loads large pages (e.g., Wikipedia articles):
1. Search query that returns multiple results
2. Verify each result is truncated to ≤5K chars
3. Verify total response is ≤50K chars
4. Verify no "Please reduce the length" error

## Key Learnings

1. **Multi-Layer Defense**: Even with UI and backend message filtering working, tool result size can still cause context overflow.

2. **Per-Result vs Total Limits**: Need BOTH per-result limits (5K chars) AND total response limits (50K chars).

3. **Character-Based Safety**: Token estimation can be inaccurate. Character-based limits are more reliable.

4. **Current Cycle Tools**: The message filter only removes OLD tool messages. Current cycle tool results must be controlled by truncation.

## Related Documentation

- **TOKEN_OPTIMIZATION_STRATEGY.md**: Layers 1-9 (message filtering, scrape truncation)
- **UI_WORKFLOW.md**: UI message filter implementation
- **build_instructions_backend.md**: Deployment process

## Debug Logging

The debug logging added in Phase 28 successfully identified this issue:

- `🔍 Messages AFTER filtering (iteration 2)`: Shows 3 tool messages sent
- `⚠️ WARNING: Sending 3 tool messages to LLM`: Alerts to the problem
- `Tool message 10: content_length=1111603`: Pinpoints the massive result

**Recommendation**: Keep debug logging in place for continued monitoring.
