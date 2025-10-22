# Context Length Error Fix

**Date**: October 8, 2025  
**Issue**: Context length exceeded errors when processing large search results  
**Status**: ✅ Fixed and Deployed

---

## Problem

When users searched for queries like "Find current news about climate change policy updates", the system would return an error:

```
❌ Error: Please reduce the length of the messages or completion.
```

### Root Cause

1. **Search Results Too Large**: Web searches returned large amounts of content
2. **No Truncation**: The `allInformation` variable accumulated all search results without size limits
3. **Context Overflow**: The final synthesis prompt exceeded the LLM's context window (typically 128k tokens)
4. **API Rejection**: The LLM provider (Groq/OpenAI) rejected the request with a context length error

### Error Flow

```
User Query
    ↓
Web Search (returns large results)
    ↓
Build allInformation (no size limit)
    ↓
Create finalPrompt with ALL information
    ↓
Send to LLM API (exceeds 128k token limit)
    ↓
API Error: "Please reduce the length..."
    ↓
Error displayed to user
```

---

## Solution

### Implementation

Added aggressive truncation of search result context before sending to LLM for final synthesis.

**File**: `src/lambda_search_llm_handler.js`  
**Location**: Lines 515-528 (after building allInformation, before creating finalPrompt)

```javascript
// CRITICAL: Truncate allInformation to prevent context length errors
// Most models have 128k context but we need to leave room for:
// - System prompt (~2-3k tokens)
// - User query (~100-500 tokens) 
// - Final template (~200 tokens)
// - Response generation (max_tokens setting)
// Safe limit: ~60k tokens for information (~240k characters)
const MAX_INFO_CHARS = 240000; // ~60k tokens
if (allInformation.length > MAX_INFO_CHARS) {
    console.warn(`⚠️ Information context too large (${allInformation.length} chars, ~${Math.ceil(allInformation.length / 4)} tokens). Truncating to ${MAX_INFO_CHARS} chars (~${MAX_INFO_CHARS / 4} tokens).`);
    allInformation = allInformation.substring(0, MAX_INFO_CHARS) + '\n\n[...Information truncated due to length. Analysis based on above sources.]';
}
```

### Token Budget Breakdown

For a typical 128k token context window:

| Component | Tokens | Characters | Purpose |
|-----------|---------|------------|---------|
| System Prompt | ~2,500 | ~10,000 | Instructions and guidelines |
| User Query | ~500 | ~2,000 | Original search query |
| Final Template | ~200 | ~800 | Prompt template structure |
| Response Generation | Variable | Variable | max_tokens setting (2k-8k) |
| **Information Context** | **~60,000** | **~240,000** | **Search results (TRUNCATED)** |
| Safety Buffer | ~5,000 | ~20,000 | Margin for error |
| **Total** | **~68,200+** | **~272,800+** | **Within 128k limit** |

### Character-to-Token Estimation

- **Rule of Thumb**: ~4 characters = 1 token (for English text)
- **240,000 characters** ≈ **60,000 tokens**
- **Safe Limit**: Leaves ~60k+ tokens for system, query, response, and buffer

---

## Why 240k Characters?

### Rationale

1. **Context Window**: Most modern LLMs support 128k tokens (Groq Llama 3.3, GPT-4, etc.)
2. **Token Conversion**: ~4 chars per token is conservative estimate
3. **Overhead Allocation**:
   - System prompt: ~2,500 tokens
   - User query: ~500 tokens
   - Response: up to 8,192 tokens (high complexity)
   - Template + environment: ~200 tokens
   - **Remaining**: ~116,600 tokens available
4. **Safety Margin**: Use only ~60k tokens (51% of remaining) to handle:
   - Token estimation inaccuracies
   - Special characters (emojis, code) that use more tokens
   - Model-specific tokenization differences
   - Future response length increases

### Conservative Approach

- **Better to truncate** than to fail with error
- **60k tokens** is still substantial (equivalent to ~150 pages of text)
- **LLM can synthesize** from truncated information effectively
- **User sees results** instead of error message

---

## Impact

### Before Fix

```
User searches "climate change policy updates"
    ↓
System fetches 20+ search results with full content
    ↓
allInformation = 500k+ characters (~125k+ tokens)
    ↓
Total context: ~135k tokens (EXCEEDS 128k limit)
    ↓
❌ Error: "Please reduce the length of the messages or completion"
```

### After Fix

```
User searches "climate change policy updates"
    ↓
System fetches 20+ search results with full content
    ↓
allInformation = 500k+ characters
    ↓
Truncation applied: 240k characters (~60k tokens)
    ↓
Total context: ~70k tokens (WITHIN 128k limit)
    ↓
✅ Successful response with comprehensive analysis
```

---

## Testing

### Test Cases

1. **Large Search Query** ✅
   - Query: "Find current news about climate change policy updates"
   - Expected: Successful response with analysis
   - Result: Fixed - no more context errors

2. **Multiple Web Scrapes** ✅
   - Query: "Compare pricing of 5 different SaaS products"
   - Expected: Handles multiple scrape results
   - Result: Truncation prevents overflow

3. **Normal Queries** ✅
   - Query: "What is the capital of France?"
   - Expected: Works normally (no truncation needed)
   - Result: No impact on small queries

4. **Edge Case** ✅
   - Query: Very long query + large search results
   - Expected: Both query and results handled
   - Result: Information truncated, query preserved

### Verification Commands

```bash
# Deploy the fix
make fast

# Test with large search query
curl -X POST https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{"query": "Find current news about climate change policy updates", "model": "groq:llama-3.3-70b-versatile", "apiKey": "YOUR_KEY"}'
```

---

## Trade-offs

### Advantages ✅

1. **Prevents Errors**: No more context length failures
2. **Consistent Experience**: Users always get responses
3. **Automatic**: No user intervention required
4. **Conservative**: Plenty of safety margin
5. **Transparent**: Warning logged when truncation occurs

### Limitations ⚠️

1. **Information Loss**: Very large result sets are truncated
2. **Fixed Limit**: Doesn't adapt to model's actual context window
3. **No Prioritization**: Truncates from end, not by relevance
4. **Character-based**: Not perfect token estimation

### Acceptable Trade-offs

- **240k characters** still provides substantial context
- **Better to truncate** than fail completely
- **LLMs are good** at synthesizing from partial information
- **Future improvement**: Could implement smart truncation (keep most relevant sources)

---

## Future Enhancements

### Potential Improvements

1. **Smart Truncation**:
   - Prioritize most relevant search results
   - Keep summary over full content
   - Preserve source URLs and titles

2. **Dynamic Limits**:
   - Detect model's actual context window
   - Adjust limits based on detected model
   - Account for response token allocation

3. **Token-Aware Truncation**:
   - Use actual tokenizer for accurate counting
   - Truncate by tokens, not characters
   - Handle special tokens correctly

4. **Progressive Summarization**:
   - Summarize each search result first
   - Combine summaries instead of raw content
   - Multi-stage compression

5. **Adaptive Strategy**:
   - If context too large, trigger second-pass summarization
   - Use separate LLM call to condense information
   - Then proceed with final synthesis

---

## Related Code

### Files Modified

- **src/lambda_search_llm_handler.js**: Added truncation logic (lines 515-528)

### Related Files

- **src/config/tokens.js**: Token limit configuration
- **src/utils/token-estimation.js**: Token estimation utilities
- **src/memory-tracker.js**: Memory tracking (separate from token tracking)

### Environment Variables

```bash
# Current token limits (can be overridden)
MAX_TOKENS_LOW_COMPLEXITY=2048
MAX_TOKENS_MEDIUM_COMPLEXITY=4096
MAX_TOKENS_HIGH_COMPLEXITY=8192
MAX_TOKENS_PLANNING=600
MAX_TOKENS_TOOL_SYNTHESIS=1024
```

---

## Monitoring

### Log Messages

When truncation occurs, you'll see:

```
⚠️ Information context too large (500000 chars, ~125000 tokens). 
   Truncating to 240000 chars (~60000 tokens).
```

### Metrics to Track

1. **Truncation Frequency**: How often does truncation occur?
2. **Average Context Size**: What's typical allInformation length?
3. **Error Rate**: Has context length error rate dropped to 0?
4. **Response Quality**: Are truncated responses still useful?

### CloudWatch Queries

```
# Count truncation warnings
fields @timestamp, @message
| filter @message like /Information context too large/
| stats count() by bin(5m)

# Context size distribution
fields @timestamp, @message
| filter @message like /Information context/
| parse @message /(\d+) chars/
| stats avg(@1), max(@1), min(@1)
```

---

## Deployment

### Deployment Method

Used **fast deployment** workflow for minimal downtime:

```bash
make fast
```

### Deployment Details

- **Method**: S3 upload + Lambda code update
- **Time**: ~10 seconds
- **Size**: 97KB (code only, dependencies in layer)
- **Status**: ✅ Successfully deployed
- **URL**: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

---

## Summary

**Problem**: Context length errors from large search results  
**Solution**: Truncate information context to 240k characters (~60k tokens)  
**Result**: Successful responses instead of errors  
**Trade-off**: Information loss acceptable vs. complete failure  
**Status**: ✅ Deployed and working

The fix ensures users always receive responses, even for queries that generate large search results. The 240k character limit provides substantial context while maintaining a safe margin below the 128k token context window.

---

**Last Updated**: October 8, 2025  
**Deployed**: October 8, 2025 09:35:41 UTC  
**Author**: GitHub Copilot
