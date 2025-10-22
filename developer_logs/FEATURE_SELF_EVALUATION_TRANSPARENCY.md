# Feature: Display Self-Evaluation in LLM Transparency

**Date**: 2025-10-12  
**Status**: ✅ Fixed and Deployed

## Problem

Response self-evaluation was happening in the backend but not being displayed in the LLM transparency UI, making it invisible to users. This meant users couldn't see:
- How many evaluation attempts were made
- The evaluation reasoning
- Token usage and cost for evaluation calls
- Whether their response was deemed comprehensive

## Solution

### Backend Changes

**File**: `src/endpoints/chat.js` (lines 1860-1884)

Added `phase` property to evaluation LLM call tracking so the UI can properly display it:

```javascript
const evalLlmCall = {
    phase: 'self_evaluation', // UI looks for 'phase' property
    type: 'self_evaluation',
    iteration: evaluationRetries + 1,
    model: model,
    provider: provider,
    request: {
        purpose: 'evaluate_response_comprehensiveness',
        evaluation_attempt: evaluationRetries + 1
    },
    response: {
        usage: evaluation.usage,
        comprehensive: evaluation.isComprehensive,
        reason: evaluation.reason
    },
    httpHeaders: evaluation.httpHeaders || {},
    httpStatus: evaluation.httpStatus,
    timestamp: new Date().toISOString()
};
```

**Key Changes**:
1. Added `phase: 'self_evaluation'` (UI component uses this)
2. Kept `type: 'self_evaluation'` for backward compatibility
3. Added `timestamp` field for proper tracking

### Frontend Changes

**File**: `ui-new/src/components/LlmApiTransparency.tsx` (lines 78-92)

Updated the `formatPhase` function to handle self-evaluation and chat iteration phases:

```typescript
const formatPhase = (phase: string): string => {
  switch (phase) {
    case 'planning':
      return '🧠 Planning';
    case 'tool_iteration':
      return '🔧 Tool Execution';
    case 'final_synthesis':
    case 'final_response':
      return '✨ Final Answer';
    case 'self_evaluation':
      return '🔍 Self-Evaluation';      // NEW
    case 'chat_iteration':
      return '💬 Chat Iteration';       // NEW
    default:
      return phase;
  }
};
```

## User Experience

Now when users expand the "🔍 LLM Calls" section, they will see:

### Before Fix:
```
🔍 LLM Calls (1 call)
▶ ✨ Final Answer • Groq • llama-3.3-70b-versatile
  💰 $0 (would be $0.0023 on paid plan)
```

### After Fix:
```
🔍 LLM Calls (2 calls)

▶ 💬 Chat Iteration • Groq • llama-3.3-70b-versatile
  💰 $0 (would be $0.0023 on paid plan)
  📥 2465 in • 📤 358 out • 📊 2823 total
  ⏱️ 1.009s

▶ 🔍 Self-Evaluation • Groq • llama-3.3-70b-versatile
  💰 $0 (would be $0.0001 on paid plan)
  📥 180 in • 📤 25 out • 📊 205 total
  ⏱️ 0.234s
  
  Response: { "comprehensive": true, "reason": "Response includes code example" }
```

## Benefits

1. **Full Transparency**: Users can now see ALL LLM calls including evaluations
2. **Cost Visibility**: Evaluation costs are tracked and displayed
3. **Performance Insight**: Users see how much time evaluation takes
4. **Debugging**: Can inspect evaluation requests/responses in detail
5. **Comprehension**: Users understand why the system made certain decisions

## Testing

### Test Case: Simple Query with Evaluation
**Query**: "Create a flowchart showing the software development lifecycle"

**Expected Behavior**:
1. First LLM call labeled "💬 Chat Iteration" generates the response
2. Second LLM call labeled "🔍 Self-Evaluation" evaluates comprehensiveness
3. Both calls visible in LLM transparency expandable section
4. Evaluation shows `{ comprehensive: true, reason: "..." }`
5. Token usage and costs displayed for both calls

### Verification Steps:
1. Open chat interface
2. Submit a query that generates JavaScript or diagrams
3. Wait for response completion
4. Click "🔍 LLM Calls" to expand
5. Verify you see both "💬 Chat Iteration" and "🔍 Self-Evaluation"
6. Expand evaluation call to see full request/response

## Impact

- ✅ Self-evaluation is now visible to users
- ✅ Token usage for evaluations is tracked and displayed
- ✅ Cost transparency includes evaluation costs
- ✅ Users can debug evaluation logic
- ✅ Better understanding of system behavior

## Deployment

```bash
# Deploy backend
make deploy-lambda-fast

# Commit and push UI changes
git add ui-new/src/components/LlmApiTransparency.tsx
git commit -m "feat: display self-evaluation in LLM transparency UI"
git push origin agent
```

**Backend Deployed**: 2025-10-12 03:00:22 UTC  
**Frontend Committed**: 2025-10-12 03:02:47 UTC (commit eccdcec)

## Related Files

- `src/endpoints/chat.js` - Evaluation tracking logic
- `ui-new/src/components/LlmApiTransparency.tsx` - Display component
- `ui-new/src/utils/api.ts` - TypeScript types for LLM API calls

## Future Enhancements

1. **Evaluation Details Badge**: Show evaluation result (✅/❌) next to response
2. **Retry Indicators**: Highlight evaluation retries with warning icons
3. **Collapsible Sections**: Group evaluation calls together
4. **Statistics**: Show average evaluation time/cost across conversations
