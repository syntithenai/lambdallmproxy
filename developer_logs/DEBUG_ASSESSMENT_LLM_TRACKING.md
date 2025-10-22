# Debug: Assessment LLM Call Tracking

## Issue Report
User reports that when triggering a web search tool use, they see:
1. ✅ Initial LLM call to generate tool use
2. ✅ LLM call to generate response with tool result data  
3. ❌ Assessment LLM request to decide if response is sufficient (NOT VISIBLE)

## Investigation

### Code Review Findings

The assessment/evaluation flow IS implemented in `src/endpoints/chat.js`:

**Location**: Lines 2986-3150
**Function**: `evaluateResponseComprehensiveness()` at lines 200-408

### Assessment Flow (As Designed)

```javascript
// After tool execution loop completes and final response is generated:

1. while (evaluationRetries < MAX_EVALUATION_RETRIES) {
2.   const evaluation = await evaluateResponseComprehensiveness(...)
3.   
4.   // Track evaluation call in LLM transparency
5.   if (evaluation.usage || evaluation.rawResponse) {
6.     const evalLlmCall = {
7.       phase: 'assessment',
8.       type: 'assessment',
9.       model, provider, request, response, usage, cost...
10.    };
11.    allLlmApiCalls.push(evalLlmCall);
12.  }
13.  
14.  if (evaluation.isComprehensive) break;
15.  // Otherwise retry with encouragement prompt
16. }
```

### evaluateResponseComprehensiveness Function

**Lines 200-408**: Makes LLM call via `llmResponsesWithTools()`:

```javascript
const evalResponse = await llmResponsesWithTools({
    model: model,
    input: evaluationMessages,
    tools: [],
    options: { temperature: 0.1, max_tokens: 200, ... }
});

return {
    isComprehensive: evalResult.comprehensive === true,
    reason: evalResult.reason || 'No reason provided',
    usage: evalResponse.rawResponse?.usage || null,  // ← KEY
    rawResponse: evalResponse.rawResponse || null,   // ← KEY
    httpHeaders: evalResponse.httpHeaders || {},
    httpStatus: evalResponse.httpStatus,
    messages: [...]
};
```

### Tracking Condition (Line 3011)

```javascript
if (evaluation.usage || evaluation.rawResponse) {
    // Create and push evalLlmCall to allLlmApiCalls
}
```

**This means**: If either `usage` OR `rawResponse` is present, the assessment call SHOULD be tracked.

### Possible Causes of Missing Assessment

1. **`rawResponse` is null/undefined**
   - `llmResponsesWithTools()` might not be returning `rawResponse`
   - OR it's returning an empty object

2. **`usage` is null/undefined**
   - `evalResponse.rawResponse?.usage` is falsy
   - Some providers don't return usage in the same format

3. **Evaluation is being skipped**
   - `evaluation.skipEvaluation` is true (auth error)
   - Error in evaluation function returns early

4. **Evaluation is not running at all**
   - Code path doesn't reach the evaluation section
   - Early returns before line 2986

## Debug Logging Added

### 1. In evaluateResponseComprehensiveness (Line 300-302)
```javascript
console.log(`🔍 Evaluation response: ${evalText.substring(0, 200)}`);
console.log(`🔍 Evaluation rawResponse:`, evalResponse.rawResponse ? 'present' : 'MISSING');
console.log(`🔍 Evaluation usage:`, evalResponse.rawResponse?.usage ? JSON.stringify(evalResponse.rawResponse.usage) : 'MISSING');
```

### 2. At tracking checkpoint (Line 3007-3012)
```javascript
console.log(`🔍 Checking evaluation tracking:`, {
    hasUsage: !!evaluation.usage,
    hasRawResponse: !!evaluation.rawResponse,
    evaluationKeys: Object.keys(evaluation)
});
```

## Testing Instructions

1. **Start dev server**: Already running at `http://localhost:3000`
2. **Open UI**: `http://localhost:8081`
3. **Trigger web search tool**:
   - Send message: "Search for recent news about AI"
4. **Watch backend logs**: Check terminal for debug output
5. **Check LLM Info dialog**: See if assessment call appears

### Expected Log Output

If assessment is working:
```
🔍 Self-evaluation attempt 1/3
🔍 Evaluating response comprehensiveness with <model>
🔍 Evaluation response: {"comprehensive": true, "reason": "..."}
🔍 Evaluation rawResponse: present
🔍 Evaluation usage: {"prompt_tokens": 123, "completion_tokens": 45, ...}
🔍 Checking evaluation tracking: { hasUsage: true, hasRawResponse: true, ... }
📊 Tracked self-evaluation LLM call #1 { type: 'assessment', phase: 'assessment', comprehensive: true }
✅ Response deemed comprehensive: ...
```

If assessment is NOT working:
```
🔍 Self-evaluation attempt 1/3
🔍 Evaluating response comprehensiveness with <model>
🔍 Evaluation response: ...
🔍 Evaluation rawResponse: MISSING  ← Problem!
🔍 Evaluation usage: MISSING         ← Problem!
🔍 Checking evaluation tracking: { hasUsage: false, hasRawResponse: false, ... }
(no tracking happens)
```

## Next Steps Based on Logs

### Scenario A: rawResponse is MISSING
**Cause**: `llmResponsesWithTools()` not returning rawResponse for evaluation calls
**Fix**: Check `llm_tools_adapter.js` to ensure all providers return `rawResponse`

### Scenario B: usage is nested differently
**Cause**: Provider returns usage in a different structure (e.g., `evalResponse.usage` instead of `evalResponse.rawResponse.usage`)
**Fix**: Update line 368 in chat.js:
```javascript
usage: evalResponse.usage || evalResponse.rawResponse?.usage || null,
```

### Scenario C: Evaluation not running
**Cause**: Code doesn't reach line 2986 (evaluation section)
**Fix**: Check for early returns, errors, or condition failures before evaluation

### Scenario D: skipEvaluation is true
**Cause**: Auth error or API key issue causes evaluation to be skipped
**Fix**: Check API key configuration for evaluation model

## Related Code

- `src/endpoints/chat.js` lines 200-408: `evaluateResponseComprehensiveness()`
- `src/endpoints/chat.js` lines 2986-3150: Evaluation loop and tracking
- `src/llm_tools_adapter.js` lines 145-175: `rawResponse` handling
- `ui-new/src/components/LlmInfoDialogNew.tsx`: Assessment call display (teal badge)

## Assessment Call Type

The assessment call should appear in LLM Info with:
- **Type**: `assessment`
- **Phase**: `assessment`
- **Badge**: 🔍 Self-Assessment (teal color)
- **Model**: Same as chat model
- **Purpose**: `evaluate_response_comprehensiveness`

## Current Status

✅ Debug logging added
✅ Dev server restarted
⏳ Waiting for test results to identify root cause
