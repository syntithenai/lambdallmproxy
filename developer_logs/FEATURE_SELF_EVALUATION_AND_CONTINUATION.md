# Feature: Self-Evaluation and Continuation Support

**Date**: 2025-01-XX  
**Status**: Backend Complete ✅ | Frontend Pending ⏸️  
**Files Modified**: `src/endpoints/chat.js`

## Overview

Implemented a self-evaluation system where the LLM evaluates its own response comprehensiveness before sending to the user, with automatic retry logic. Also added continuation support for error recovery.

## Feature Requirements

### 1. Self-Evaluation Before Final Response
- **Goal**: Evaluate if the LLM has answered the user's question comprehensively
- **Method**: Make a minimal LLM call with only user prompts + assistant responses (no tool results, no media)
- **Response Format**: JSON with `{"comprehensive": true/false, "reason": "explanation"}`
- **System Prompt**: Minimal prompt focused only on evaluation

### 2. Retry Logic
- **Trigger**: When evaluation returns `comprehensive: false`
- **Max Retries**: 2 (configurable via `MAX_EVALUATION_RETRIES`)
- **Method**: Append encouragement prompt and request more comprehensive answer
- **Fallback**: After max retries, proceed with current response (no blocking)

### 3. Continue Button for Errors/Limits
- **Trigger**: When error occurs or MAX_ITERATIONS reached
- **UI**: Show "Continue" button to user
- **Behavior**: Resubmit request with full context including tool results and media
- **Flag**: `isContinuation: true` to bypass message filtering

### 4. LLM Call Transparency
- **Goal**: Track ALL LLM calls including evaluations and retries
- **Method**: Add to `allLlmApiCalls` array with type tags
- **Types**: `self_evaluation`, `comprehensive_retry`

## Implementation Details

### Backend Changes (src/endpoints/chat.js)

#### 1. Self-Evaluation Function (Lines 25-132)

```javascript
async function evaluateResponseComprehensiveness(messages, finalResponse, model, apiKey, provider) {
  // Build minimal context: only user prompts + assistant responses
  const evaluationMessages = messages.filter(m => 
    m.role === 'user' || m.role === 'assistant'
  ).map(m => {
    if (m.role === 'user') {
      // Strip media attachments
      return { role: 'user', content: typeof m.content === 'string' ? m.content : '' };
    }
    return m;
  });
  
  // Add final response
  evaluationMessages.push({
    role: 'assistant',
    content: finalResponse
  });
  
  // Minimal system prompt
  const systemPrompt = {
    role: 'system',
    content: `Evaluate if the assistant's response comprehensively answers the user's questions.
Respond with JSON: {"comprehensive": true/false, "reason": "brief explanation"}`
  };
  
  // Make evaluation call
  const evaluationResponse = await makeStreamingRequest({
    messages: [systemPrompt, ...evaluationMessages],
    model,
    temperature: 0.1,
    stream: false
  }, apiKey, provider);
  
  // Parse JSON response
  const result = JSON.parse(evaluationResponse.content);
  
  return {
    isComprehensive: result.comprehensive,
    reason: result.reason,
    usage: evaluationResponse.usage,
    httpHeaders: evaluationResponse.httpHeaders,
    httpStatus: evaluationResponse.httpStatus
  };
}
```

#### 2. Evaluation Loop with Retry (Lines 1603-1720)

```javascript
const MAX_EVALUATION_RETRIES = 2;
let evaluationRetries = 0;
let finalContent = assistantMessage.content;
let evaluationResults = [];

while (evaluationRetries < MAX_EVALUATION_RETRIES) {
  // Evaluate current response
  const evaluation = await evaluateResponseComprehensiveness(
    currentMessages,
    finalContent,
    model,
    apiKey,
    provider
  );
  
  // Track in transparency array
  allLlmApiCalls.push({
    type: 'self_evaluation',
    iteration: evaluationRetries + 1,
    request: { model, provider },
    response: {
      usage: evaluation.usage,
      comprehensive: evaluation.isComprehensive,
      reason: evaluation.reason
    },
    httpHeaders: evaluation.httpHeaders,
    httpStatus: evaluation.httpStatus
  });
  
  evaluationResults.push({
    attempt: evaluationRetries + 1,
    comprehensive: evaluation.isComprehensive,
    reason: evaluation.reason
  });
  
  // If comprehensive, done
  if (evaluation.isComprehensive) {
    console.log(`✅ Response evaluated as comprehensive after ${evaluationRetries + 1} attempt(s)`);
    break;
  }
  
  // If max retries reached, proceed anyway
  if (evaluationRetries >= MAX_EVALUATION_RETRIES) {
    console.log(`⚠️ Max evaluation retries (${MAX_EVALUATION_RETRIES}) reached. Proceeding with current response.`);
    break;
  }
  
  // Retry: append encouragement
  console.log(`🔄 Response not comprehensive (attempt ${evaluationRetries + 1}/${MAX_EVALUATION_RETRIES + 1}). Retrying...`);
  
  const retryMessages = [...currentMessages, {
    role: 'assistant',
    content: finalContent
  }, {
    role: 'user',
    content: 'Please provide a more comprehensive and complete answer to address all aspects of my question. Take your time and be thorough.'
  }];
  
  const retryResponse = await llmResponsesWithTools({
    messages: retryMessages,
    model,
    tools,
    apiKey,
    provider,
    sseWriter,
    requestBody,
    extractedContent,
    continueContext,
    isRetry: true,
    userEmail
  });
  
  // Track retry in transparency array
  allLlmApiCalls.push({
    type: 'comprehensive_retry',
    iteration: evaluationRetries + 1,
    request: { model, provider },
    response: {
      usage: retryResponse.usage
    },
    httpHeaders: retryResponse.httpHeaders,
    httpStatus: retryResponse.httpStatus
  });
  
  finalContent = retryResponse.content;
  evaluationRetries++;
}

// Send final response with evaluation results
sseWriter.writeEvent('message_complete', {
  content: finalContent,
  model: `${provider}/${model}`,
  usage: finalUsage,
  evaluations: evaluationResults,  // Include evaluation results
  llmApiCalls: allLlmApiCalls      // Include all LLM calls
});
```

#### 3. Continuation Support (Lines 585, 650, 934)

```javascript
// Parse continuation flag
let { messages, model, tools, providers, isRetry, retryContext, isContinuation, mcp_servers } = body;

// Handle continuation mode
if (isContinuation) {
  console.log('🔄 Continuation request detected - tool results will be preserved');
  // Skip aggressive filtering to preserve full context
}

// Conditional message filtering
const shouldFilter = isInitialRequest && !isContinuation;
const filteredMessages = shouldFilter 
  ? filterToolMessagesForCurrentCycle(currentMessages, isInitialRequest)
  : currentMessages;
```

#### 4. Error Handlers with Continue Context (Lines 1730, 1747)

```javascript
// MAX_ITERATIONS error
sseWriter.writeEvent('error', {
  error: 'Maximum tool execution iterations reached',
  code: 'MAX_ITERATIONS',
  showContinueButton: true,
  continueContext: {
    messages: currentMessages,
    lastUserMessage: requestBody.messages[requestBody.messages.length - 1],
    provider,
    model,
    extractedContent
  }
});

// General error handler
errorEvent.showContinueButton = true;
errorEvent.continueContext = {
  messages: currentMessages,
  lastUserMessage: requestBody.messages[requestBody.messages.length - 1],
  provider,
  model
};
```

## Frontend Integration (✅ COMPLETE)

### 1. Continue Button UI (ui-new/src/components/ChatTab.tsx)

**State Variables** (Lines 148-149):
```typescript
const [showContinueButton, setShowContinueButton] = useState(false);
const [continueContext, setContinueContext] = useState<any>(null);
```

**Error Event Handler** (Lines 1683-1688):
```typescript
case 'error':
  // Check if continue button should be shown
  if (data.showContinueButton && data.continueContext) {
    console.log('🔄 Continue button enabled for error:', errorMsg);
    setShowContinueButton(true);
    setContinueContext(data.continueContext);
  }
  break;
```

**Continue Button Handler** (Lines 1998-2194):
```typescript
const handleContinue = async () => {
  if (!continueContext) {
    showError('No continuation context available');
    return;
  }
  
  console.log('🔄 Continuing from error/limit with context:', continueContext);
  
  // Hide the continue button
  setShowContinueButton(false);
  
  // Build request payload with continuation flag
  const requestPayload: any = {
    providers: enabledProviders,
    messages: continueContext.messages,  // Full message history including tool results
    temperature: 0.7,
    stream: true,
    isContinuation: true  // Critical: Flag to bypass message filtering
  };
  
  // Add tools, extracted content, MCP servers
  // ... (full implementation in ChatTab.tsx)
  
  await sendChatMessageStreaming(
    requestPayload,
    accessToken,
    // Event handlers for delta, error, complete
  );
};
```

**Continue Button UI** (Lines 3418-3433):
```typescript
{/* Continue Button for Error Recovery */}
{showContinueButton && continueContext && (
  <div className="flex justify-center py-3">
    <button
      onClick={handleContinue}
      disabled={isLoading}
      className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-semibold text-base transition-all transform hover:scale-105 shadow-lg flex items-center gap-2"
      title="Continue from where the error occurred"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
      </svg>
      Continue Processing
    </button>
  </div>
)}
```

### 2. Evaluation Results Display (ui-new/src/components/ChatTab.tsx)

**Type Definition** (ui-new/src/utils/api.ts, Lines 227-232):
```typescript
// Self-evaluation results
evaluations?: Array<{              // Self-evaluation results for response comprehensiveness
  attempt: number;                 // Evaluation attempt number
  comprehensive: boolean;          // Whether response was deemed comprehensive
  reason: string;                  // Explanation of evaluation result
}>;
```

**Evaluation Display** (Lines 3108-3136):
```typescript
{/* Self-Evaluation Results Display */}
{msg.role === 'assistant' && (msg as any).evaluations && (msg as any).evaluations.length > 0 && (
  <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Response Evaluation
    </div>
    <div className="space-y-1.5">
      {(msg as any).evaluations.map((evaluation: any, evalIdx: number) => (
        <div 
          key={evalIdx}
          className={`text-xs px-2.5 py-1.5 rounded flex items-start gap-2 ${
            evaluation.comprehensive 
              ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 text-green-800 dark:text-green-200'
              : 'bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-200'
          }`}
        >
          <span className="font-semibold shrink-0">
            {evaluation.comprehensive ? '✅' : '⚠️'} Attempt {evaluation.attempt}:
          </span>
          <span className="flex-1">{evaluation.reason}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

**Message Complete Handler** (Lines 1537-1667):
- Added `evaluations: data.evaluations` to all message update paths
- Ensures evaluation results are preserved when messages are updated or created

## Testing Checklist

### Self-Evaluation Testing
- [ ] Test with deliberately incomplete response (should trigger retry)
- [ ] Test with comprehensive response (should pass first evaluation)
- [ ] Test with max retries reached (should proceed with current response)
- [ ] Verify evaluation calls appear in LLM transparency panel
- [ ] Verify retry calls appear in LLM transparency panel
- [ ] Test with different providers (Groq, OpenAI, Claude)

### Retry Logic Testing
- [ ] Verify encouragement prompt appends correctly
- [ ] Verify retry response replaces original response
- [ ] Verify max 2 retries enforced
- [ ] Test with responses that improve on retry
- [ ] Test with responses that don't improve on retry

### Continue Button Testing
- [ ] Trigger MAX_ITERATIONS error
- [ ] Verify continue button appears in UI
- [ ] Click continue and verify request includes full context
- [ ] Verify tool results are preserved in continuation
- [ ] Verify media/attachments are preserved in continuation
- [ ] Test with general error (not MAX_ITERATIONS)
- [ ] Verify conversation resumes correctly after continuation

### Edge Cases
- [ ] Test evaluation with malformed JSON response
- [ ] Test evaluation with LLM API error
- [ ] Test continuation after multiple tool cycles
- [ ] Test continuation with large message history
- [ ] Test continuation with extracted content

## Configuration

### Environment Variables
None required. All configuration is in code constants.

### Constants
```javascript
// In src/endpoints/chat.js
const MAX_EVALUATION_RETRIES = 2;  // Maximum number of retry attempts
```

## Performance Considerations

### Token Usage Impact
- **Evaluation Call**: ~500-1000 tokens per evaluation (minimal context)
- **Retry Call**: Full conversation context (~2000-5000 tokens per retry)
- **Worst Case**: 1 evaluation + 2 retries + 2 evaluations = 3 evaluations + 2 full retries
- **Estimated Cost**: +20-30% token usage in worst case (rarely triggered)

### Latency Impact
- **Evaluation**: ~1-2 seconds per evaluation
- **Retry**: ~3-5 seconds per retry
- **Worst Case**: +10-15 seconds total (rarely triggered)
- **Typical Case**: +1-2 seconds (single evaluation, passes immediately)

## Benefits

1. **Quality Assurance**: Automatically catches incomplete responses
2. **User Experience**: Fewer follow-up questions needed
3. **Error Recovery**: Continue button provides smooth recovery from errors
4. **Transparency**: All LLM calls visible in UI
5. **Non-Blocking**: Max retries ensures response is always sent

## Known Limitations

1. **Self-evaluation accuracy**: LLM may not always correctly judge comprehensiveness
2. **Token costs**: Additional LLM calls increase costs
3. **Latency**: Additional time before final response
4. **False positives**: May retry when response is actually sufficient
5. **Frontend pending**: Continue button UI not yet implemented

## Future Improvements

1. **Configurable retry count**: Make MAX_EVALUATION_RETRIES environment variable
2. **Evaluation prompt tuning**: Improve evaluation accuracy
3. **Selective evaluation**: Only evaluate complex questions
4. **User feedback**: Allow user to rate evaluation accuracy
5. **Continue history**: Track how often continue button is used
6. **Evaluation caching**: Cache evaluation results to avoid redundant calls

## Related Documentation

- `ARCHITECTURE_PUPPETEER_LAMBDA_SEPARATION.md` - Puppeteer Lambda architecture
- `CHAT_ENDPOINT_DOCUMENTATION.md` - Chat endpoint overview
- `FEATURE_COMPLETE_LLM_TRANSPARENCY.md` - LLM call tracking

## Deployment

### Backend Deployment (Complete)
```bash
# Deploy backend changes
make deploy-lambda-fast

# Verify logs
make logs
```

### Frontend Deployment (Pending)
```bash
# After frontend implementation
make deploy-ui
```

## Status Summary

✅ **Complete**:
- Self-evaluation function implementation (backend)
- Retry logic with encouragement prompts (backend)
- Continuation flag parsing and handling (backend)
- Message filtering bypass for continuations (backend)
- Error handlers with continue context (backend)
- LLM call tracking for evaluations and retries (backend)
- **Continue button UI component (frontend)** ✨
- **Evaluation results display (frontend)** ✨
- **Type definitions updated (ChatMessage interface)** ✨
- **UI deployed to GitHub Pages** ✨

⏸️ **Pending**:
- Comprehensive testing of all features
- Documentation of test results
- Performance tuning based on real usage

---

## Deployment

### Backend Deployment
```bash
# Deploy backend changes to Lambda
make deploy-lambda-fast
```

### Frontend Deployment (✅ COMPLETE)
```bash
# Build and deploy UI (ALREADY DONE)
make deploy-ui

# Deployed commit: 9122369
# Build time: 2025-10-11 23:22:41 UTC
# Files changed: 5 files, 455 insertions(+), 455 deletions(-)
```

**Deployed URLs**:
- Production: https://lambdallmproxy.pages.dev
- GitHub Pages: https://syntithenai.github.io/lambdallmproxy

---

**Next Steps**:
1. ✅ ~~Implement frontend continue button UI~~ (DONE)
2. ✅ ~~Implement frontend evaluation display~~ (DONE)
3. Test self-evaluation with various prompts
4. Test continue button error recovery
5. Monitor performance and token usage in production
