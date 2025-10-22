# Fix: Duplicate System Messages and Message Cleaning

**Date**: 2025-10-12  
**Status**: ✅ Fixed and Deployed

## Problem

Location-based queries were failing with two critical issues:

### Issue 1: Duplicate System Messages
When location was enabled, the backend created a duplicate system message, causing LLM errors:
- **Log Evidence**: `🔍 Messages AFTER filtering: 0:system, 1:system, 2:user, 3:assistant, 4:user`
- **Root Cause**: Location context was being prepended as a separate system message, but the client already sent one
- **Impact**: Multiple system messages confuse the LLM, leading to query failures

### Issue 2: Unsupported Message Properties
Groq API rejected requests with UI-specific properties:
```
❌ Error: 'messages.3' : for 'role:assistant' the following must be satisfied
[('messages.3' : property 'evaluations' is unsupported)]
```
- **Root Cause**: The `evaluations` property (added by UI) was not being stripped before sending to LLM
- **Impact**: All requests with assistant messages containing evaluations would fail

## Solution

### Fix 1: Merge System Messages with Location Context

**File**: `src/endpoints/chat.js` (lines 626-648)

**Changes**:
1. Extract location context into a variable instead of prepending as separate message
2. Find all system messages in the messages array
3. Merge all system messages into a single message
4. Append location context (if present) to the merged system message
5. Reconstruct messages array with single system message at start

**Code**:
```javascript
// Merge all system messages and inject location context
// This prevents duplicate system messages which confuse the LLM
if (messages && messages.length > 0) {
    // Find all system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    if (systemMessages.length > 0) {
        // Merge all system messages into one
        const mergedSystemContent = systemMessages.map(m => m.content).join('\n\n');
        const finalSystemContent = locationContext 
            ? mergedSystemContent + locationContext 
            : mergedSystemContent;
        
        // Reconstruct messages array with single system message at the start
        messages = [
            { role: 'system', content: finalSystemContent },
            ...nonSystemMessages
        ];
        
        console.log(`📍 Merged ${systemMessages.length} system message(s)` + 
            (locationContext ? ' and added location context' : ''));
    } else if (locationContext) {
        // No system message exists, prepend one with location context
        messages.unshift({
            role: 'system',
            content: 'You are a helpful AI assistant.' + locationContext
        });
        console.log('📍 Location context added as new system message');
    }
}
```

### Fix 2: Strip Unsupported Message Properties

**File**: `src/endpoints/chat.js` (line 1037-1041)

**Changes**: Added `evaluations` to the list of properties to remove before sending to LLM

**Before**:
```javascript
const cleanMessages = filteredMessages.map(msg => {
    const { isStreaming, errorData, llmApiCalls, extractedContent, rawResult, ...cleanMsg } = msg;
    return cleanMsg;
});
```

**After**:
```javascript
const cleanMessages = filteredMessages.map(msg => {
    const { isStreaming, errorData, llmApiCalls, extractedContent, rawResult, evaluations, ...cleanMsg } = msg;
    return cleanMsg;
});
```

## Testing

### Test Case: Location-Based Query
**Query**: "Find the nearest hospital or emergency room to my location"

**Before Fix**:
- ❌ Two system messages sent to LLM
- ❌ Request failed with "evaluations is unsupported" error
- ❌ No response generated

**After Fix**:
- ✅ Single merged system message with location context
- ✅ All UI-specific properties stripped
- ✅ Request succeeds and returns location-relevant results

### Verification
Check CloudWatch logs for these indicators:
```bash
make logs
```

**Success Indicators**:
1. `📍 Merged 2 system message(s) and added location context` - System messages merged
2. `🔍 Messages AFTER filtering: 0:system, 1:user, 2:assistant, 3:user` - Only ONE system message
3. No "evaluations is unsupported" errors
4. Successful LLM response with location-relevant results

## Related Issues

This fix also addresses potential issues with:
- **Retry Context**: Retry system messages are now merged with main system prompt
- **MCP Servers**: Any system messages from MCP servers will be merged
- **Future Features**: Any feature adding system context will be properly merged

## Deployment

```bash
# Deploy backend fix
make deploy-lambda-fast

# Verify deployment
make logs
```

**Deployment Time**: ~10 seconds (fast deployment)  
**Deployed**: 2025-10-12 02:56:20 UTC

## Additional Fix: Proxy Dashboard Link

**File**: `ui-new/src/components/SettingsModal.tsx` (line 441)

**Changed**: Updated Webshare proxy dashboard link from old URL to new dashboard
- **Old**: `https://proxy2.webshare.io/userapi/credentials`
- **New**: `https://dashboard.webshare.io/dashboard`

**Deployment**: 
```bash
make deploy-ui
```

**Deployed**: 2025-10-12 02:54:17 UTC

## Impact

- ✅ Location-based queries now work correctly
- ✅ Multiple system messages are automatically merged
- ✅ UI-specific properties no longer cause API errors
- ✅ Improved reliability for all LLM requests
- ✅ Better error handling and logging

## Files Modified

1. `src/endpoints/chat.js` - System message merging + property cleaning
2. `ui-new/src/components/SettingsModal.tsx` - Proxy dashboard link update

## Future Improvements

1. **Client-Side Fix**: UI should not send separate location system message - let backend handle it
2. **Message Validation**: Add schema validation to catch unsupported properties earlier
3. **Testing**: Add integration tests for location queries with multiple system messages
