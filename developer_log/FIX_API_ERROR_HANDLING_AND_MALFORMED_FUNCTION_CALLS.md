# Fix: API Error Handling and Malformed Function Calls

**Date**: 2025-10-12  
**Status**: ✅ Completed  
**Deployed**: Yes (Lambda fast deploy)

## Problem

User reported error: "❌ Error: API request failed" when submitting query "Find current news about climate change policy updates".

### Root Cause Analysis

Investigation revealed two issues:

1. **Generic Error Messages**: The error handler at line 401 in `src/endpoints/chat.js` only tried to extract `error.error?.message`, falling back to generic "API request failed" when the error structure was different.

2. **Malformed Function Calls in Message History**: The conversation history contained an assistant message with invalid function call syntax:
   ```
   <scrape_web_content>{"url": "https://..."} </function>
   ```
   This hybrid XML/JSON format caused provider APIs to reject the request. The LLM had generated a text-based function call instead of using proper OpenAI tool calling mechanism.

## Solution

### 1. Improved Error Message Extraction

**File**: `src/endpoints/chat.js` (lines 393-415)

Enhanced error handling to try multiple error message paths:

```javascript
const errorMessage = 
    error.error?.message || 
    error.message || 
    error.error || 
    (error.details ? JSON.stringify(error.details) : null) ||
    `API request failed (${res.statusCode})`;

reject(new Error(errorMessage));
```

**Benefits**:
- Shows actual provider error details instead of generic message
- Tries multiple common error structure patterns
- Falls back to status code for context
- Helps with debugging by showing what actually went wrong

### 2. Malformed Function Call Cleaning

**File**: `src/endpoints/chat.js` (lines 1082-1102)

Added detection and removal of malformed function calls from assistant messages:

```javascript
if (cleanMsg.role === 'assistant' && cleanMsg.content && typeof cleanMsg.content === 'string') {
    const malformedFunctionPattern = /<[^>]+>\s*\{[^}]*\}\s*<\/[^>]+>/g;
    const originalContent = cleanMsg.content;
    cleanMsg.content = cleanMsg.content.replace(malformedFunctionPattern, '').trim();
    
    if (originalContent !== cleanMsg.content) {
        console.log('🧹 Cleaned malformed function call from assistant message');
        console.log('   Original:', originalContent.substring(0, 200));
        console.log('   Cleaned:', cleanMsg.content.substring(0, 200));
    }
}
```

**Pattern Detection**:
- Matches: `<function_name>{...json...} </function>`
- Matches: `<tool_name> {"param": "value"} </tool>`
- Removes invalid XML/JSON hybrid syntax
- Logs when cleaning occurs for debugging

**Benefits**:
- Prevents API rejection due to malformed messages
- Cleans message history automatically
- Preserves valid content while removing invalid syntax
- Provides visibility through logging

## Technical Details

### Error Structure Variations

Different providers return errors in different formats:

```javascript
// OpenAI format
{ error: { message: "..." } }

// Gemini format  
{ error: "..." }

// Generic format
{ message: "..." }

// Detailed format
{ details: {...} }
```

The improved error handler now tries all these paths.

### Malformed Function Call Examples

**Invalid formats cleaned**:
```
<scrape_web_content>{"url": "..."} </function>
<search_web> {"query": "..."} </search_web>
<execute_js>{"code": "..."}</execute_js>
```

**Valid formats preserved**:
- Plain text content
- Proper tool_calls array with structured calls
- Normal assistant responses

## Testing

### Verification Steps

1. **Error Message Improvement**:
   - Submit query that triggers API error
   - Verify actual error details shown instead of "API request failed"
   - Check CloudWatch logs for detailed error information

2. **Malformed Message Cleaning**:
   - Use conversation with malformed function calls in history
   - Verify subsequent queries succeed
   - Check logs for cleaning messages
   - Confirm API doesn't reject requests

### Expected Behavior

- ✅ Detailed error messages show actual API errors
- ✅ Malformed function calls automatically removed
- ✅ Queries succeed even with invalid messages in history
- ✅ Logging provides visibility into cleaning operations
- ✅ Valid content preserved, only malformed syntax removed

## Related Context

### Previous Error Handling Fixes

This builds on previous work:
- Message field cleaning (UI-only properties)
- Tool message filtering for token optimization
- Retry mechanism improvements

### Why Malformed Calls Occur

LLMs sometimes generate function calls as text when:
- Training data includes XML/JSON examples
- Prompt doesn't clearly specify tool calling format
- Model hallucinates function call syntax
- Context confuses structured vs text responses

### Prevention Strategy

While this fix cleans malformed calls reactively, prevention strategies include:
- Clear system prompts about tool calling format
- Better model selection (some models better at tool use)
- Validation on assistant responses before storage
- User feedback when invalid formats detected

## Deployment

### Commands Used

```bash
# Fast Lambda deployment (code only, ~10 seconds)
bash scripts/deploy-fast.sh
```

### Deployment Verification

```bash
# Check function status
aws lambda get-function --function-name llmproxy \
  --query 'Configuration.[LastModified,State,LastUpdateStatus]' \
  --output text

# Output: 2025-10-12T04:49:33.000+0000  Active  Successful
```

### Post-Deployment Testing

```bash
# View logs to verify fix working
make logs

# Look for:
# - "🧹 Cleaned malformed function call from assistant message"
# - More detailed error messages instead of "API request failed"
```

## Impact

### User Experience

**Before**:
- Generic "API request failed" error
- Queries fail with malformed messages in history
- No visibility into what went wrong
- Frustrating debugging experience

**After**:
- Detailed error messages show actual issues
- Malformed messages automatically cleaned
- Queries succeed even with invalid history
- Better debugging through logging

### Code Quality

- More robust error handling
- Defense-in-depth message validation
- Better observability through logging
- Graceful handling of edge cases

## Lessons Learned

1. **Error Message Quality Matters**: Generic errors frustrate users and complicate debugging
2. **Defense-in-Depth Validation**: Clean/validate data at multiple layers
3. **LLM Output Unpredictability**: Models can generate unexpected formats
4. **Logging is Critical**: Visibility helps debug complex issues
5. **Error Structure Varies**: Different providers use different formats

## Future Improvements

### Short Term
- Add metrics for malformed message frequency
- Alert when cleaning occurs frequently (may indicate systemic issue)
- Track which providers/models generate malformed calls most often

### Long Term
- Implement assistant response validation before storage
- Add prompt engineering to prevent malformed calls
- Consider model fine-tuning to improve tool use
- Build analytics dashboard for error patterns

## References

- **File**: `src/endpoints/chat.js`
- **Lines Changed**: 393-415 (error handling), 1082-1102 (message cleaning)
- **Related Docs**: 
  - `developer_log/FIX_UI_FIELD_CLEANING.md` (previous message cleaning work)
  - `developer_log/FIX_RETRY_INDEX_TRACKING.md` (retry mechanism)
  - `developer_log/CHAT_ENDPOINT_DOCUMENTATION.md` (endpoint overview)

## Commit

```bash
git add src/endpoints/chat.js
git commit -m "fix: improve API error messages and clean malformed function calls

- Enhanced error handler to try multiple error structure paths
- Added detection/removal of malformed XML/JSON function calls
- Prevents API rejections from invalid message formats
- Improved debugging through detailed error messages
- Added logging for malformed message cleaning operations"
```
