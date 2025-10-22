# Self-Evaluation Query Visibility Fix

**Date**: 2025-10-18  
**Status**: ✅ Fixed and Deployed

## Problem

When viewing LLM transparency information for queries that use tools (like `transcribe_url`), the self-assessment/evaluation query was not showing in the LLM transparency dialog. Users could see:
- ✅ The evaluation result (comprehensive: true/false, reason)
- ✅ Token usage for evaluation
- ❌ **The actual messages/query sent to LLM for evaluation** (MISSING)

This made it impossible to see what prompt was used to evaluate the response.

## Root Cause

In `src/endpoints/chat.js`, the `evaluateResponseComprehensiveness` function:
1. **Did construct** the evaluation messages array (system prompt + conversation history)
2. **Did send** these messages to the LLM
3. **Did NOT return** the messages array in its response object

The tracking code (lines 2755-2771) then created the `evalLlmCall` object with:
```javascript
request: {
    purpose: 'evaluate_response_comprehensiveness',
    evaluation_attempt: evaluationRetries + 1
    // ❌ Missing: messages array
}
```

The UI (`LlmInfoDialog.tsx`) displays the `request` object in a JSON tree, but without the `messages` field, users couldn't see what was sent.

## Solution

### 1. Return Messages from Evaluation Function

Modified `evaluateResponseComprehensiveness` to return the messages array:

**File**: `src/endpoints/chat.js` (lines 305-320)

```javascript
return {
    isComprehensive: evalResult.comprehensive === true,
    reason: evalResult.reason || 'No reason provided',
    usage: evalResponse.rawResponse?.usage || null,
    rawResponse: evalResponse.rawResponse || null,
    httpHeaders: evalResponse.httpHeaders || {},
    httpStatus: evalResponse.httpStatus,
    messages: [
        { role: 'system', content: evaluationSystemPrompt },
        ...evaluationMessages
    ] // Include the actual messages sent for transparency
};
```

### 2. Include Messages in Tracking Object

Updated the evaluation tracking code to include messages in the request:

**File**: `src/endpoints/chat.js` (lines 2762-2766)

```javascript
request: {
    purpose: 'evaluate_response_comprehensiveness',
    evaluation_attempt: evaluationRetries + 1,
    messages: evaluation.messages || [] // Include actual messages sent for transparency
}
```

### 3. Handle Error Cases

Also added `messages: []` to error return paths to maintain consistent structure:

```javascript
// Auth error case
return {
    isComprehensive: true,
    reason: 'Evaluation skipped - API authentication failed',
    usage: null,
    error: error.message,
    skipEvaluation: true,
    messages: [] // No messages on error
};

// Generic error case
return {
    isComprehensive: true,
    reason: 'Evaluation failed - assuming comprehensive',
    usage: null,
    error: error.message,
    messages: [] // No messages on error
};
```

## Files Modified

1. **src/endpoints/chat.js**:
   - Lines 305-320: Return messages from `evaluateResponseComprehensiveness`
   - Lines 2762-2766: Include messages in evaluation tracking
   - Lines 330-338: Add messages to auth error return
   - Lines 343-348: Add messages to generic error return

## User Experience

### Before Fix
When clicking "🔍 LLM Calls" → Expanding "🔍 Self-Evaluation":
```json
{
  "request": {
    "purpose": "evaluate_response_comprehensiveness",
    "evaluation_attempt": 1
  }
}
```
❌ **Cannot see what was sent to LLM for evaluation**

### After Fix
When clicking "🔍 LLM Calls" → Expanding "🔍 Self-Evaluation":
```json
{
  "request": {
    "purpose": "evaluate_response_comprehensiveness",
    "evaluation_attempt": 1,
    "messages": [
      {
        "role": "system",
        "content": "You are a response quality evaluator..."
      },
      {
        "role": "user",
        "content": "Transcribe this: https://..."
      },
      {
        "role": "assistant",
        "content": "[Full transcript text]"
      }
    ]
  }
}
```
✅ **Full visibility into evaluation query**

## Benefits

1. **Complete Transparency**: Users can now see exactly what was sent to the LLM for evaluation
2. **Debugging**: Can inspect the conversation history used for evaluation
3. **Understanding**: Can see the system prompt that guides evaluation logic
4. **Consistency**: Evaluation calls now have the same structure as other LLM calls
5. **Auditing**: Full request/response pairs available for all LLM interactions

## Testing

### Test Case: Transcription with Self-Evaluation

**Query**: "Transcribe this: https://llmproxy-media-samples.s3.amazonaws.com/audio/long-form-ai-speech.mp3"

**Expected Behavior**:
1. Tool executes (`transcribe_url`)
2. LLM generates response with transcript
3. Self-evaluation runs to check comprehensiveness
4. In LLM transparency dialog, self-evaluation shows:
   - ✅ Full request with messages array
   - ✅ System prompt for evaluation
   - ✅ User's original query
   - ✅ Assistant's response being evaluated
   - ✅ Response with comprehensive/reason
   - ✅ Token usage and cost

### Verification Steps:
1. Submit transcription query
2. Wait for completion
3. Click "🔍 LLM Calls" (ⓘ icon)
4. Expand "🔍 Self-Evaluation" section
5. Click "📤 Request Body" copy button
6. Verify `messages` array is present with:
   - System prompt
   - User query
   - Assistant response

## Deployment

```bash
# Deploy backend
./scripts/deploy-fast.sh
```

**Deployed**: 2025-10-18 12:03:10 UTC

## Related Documentation

- `developer_log/FEATURE_SELF_EVALUATION_TRANSPARENCY.md` - Original transparency feature
- `developer_log/FEATURE_SELF_EVALUATION_AND_CONTINUATION.md` - Self-evaluation implementation
- `src/endpoints/chat.js` - Evaluation and tracking logic
- `ui-new/src/components/LlmInfoDialog.tsx` - UI display component

## Impact

✅ **No Breaking Changes**: Only adds data, doesn't remove or change existing structure  
✅ **No UI Changes Needed**: UI already displays `request.messages` in JSON tree  
✅ **Backward Compatible**: Empty messages array on errors prevents undefined issues  
✅ **Performance**: No performance impact (data already existed, just not returned)

---

**Next Steps**: User can now inspect full evaluation queries in LLM transparency dialog for any query type.
