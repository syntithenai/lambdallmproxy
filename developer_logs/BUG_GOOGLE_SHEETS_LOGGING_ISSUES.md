# Google Sheets Logging Issues Analysis

**Date**: October 23, 2025  
**Status**: 🐛 Multiple issues identified  
**Priority**: Medium  
**Related Files**: 
- `src/services/google-sheets-logger.js`
- `src/services/user-billing-sheet.js`
- `src/endpoints/chat.js`
- `src/guardrails/guardrail-factory.js`

## Issues Identified in Spreadsheet Logs

### Sample Problematic Data

```
2025-10-22T15:21:16.018Z  unknown              guardrail_input   ❌ Missing email
2025-10-22T15:21:56.853Z  syntithenai@gmail   guardrail_output  ✅ Has email
2025-10-22T15:21:17.190Z  syntithenai@gmail   chat_iteration    ⚠️  Out of order
2025-10-22T15:21:43.287Z  syntithenai@gmail   chat_iteration    ⚠️  Out of order
2025-10-22T15:21:53.911Z  syntithenai@gmail   assessment        ⚠️  Out of order
2025-10-22T15:21:55.379Z  syntithenai@gmail   chat              ❌ Duplicate
```

---

## Problem 1: Timestamp Ordering Issues ⚠️

### Description
Logs appear in the spreadsheet in **non-chronological order** within the same request. Example from request `local-1761146473285`:

```
Expected Order          Actual Log Order (by row)
----------------        -------------------------
15:21:16  guardrail     15:21:16  guardrail_input  ← First logged
15:21:17  chat          15:21:56  guardrail_output ← Logged 8th
15:21:43  chat          15:21:17  chat_iteration   ← Logged 2nd
15:21:53  assessment    15:21:43  chat_iteration   ← Logged 3rd
15:21:56  guardrail     15:21:53  assessment       ← Logged 4th
```

### Root Cause
**Asynchronous logging without sequencing**. Multiple calls to `logToBothSheets()` execute **concurrently** without coordination:

```javascript
// In src/endpoints/chat.js (lines 1276, 3233, 3431)
await logToBothSheets(driveAccessToken, {...});  // Awaited
await logToBothSheets(driveAccessToken, {...});  // Awaited
await logToBothSheets(driveAccessToken, {...});  // Awaited
```

Even though individual calls are awaited, they complete in **variable order** due to:
1. Network latency differences
2. Google Sheets API processing time variations
3. OAuth token renewal delays
4. Concurrent HTTP requests completing out of order

### Impact
- Difficult to trace request execution flow
- Debugging confusion (events appear to happen in wrong order)
- Analytics and reporting become unreliable

### Solution Options

**Option A: Sequential Logging (Simple)**
```javascript
// Queue logs and write them in sequence
const logsToWrite = [];

// During request processing
logsToWrite.push(logData);

// At the end of request
for (const log of logsToWrite) {
  await logToBothSheets(driveAccessToken, log);
}
```

**Option B: Batch Logging (Efficient)**
```javascript
// Collect all logs for request
const requestLogs = [];
requestLogs.push({ type: 'guardrail_input', ... });
requestLogs.push({ type: 'chat_iteration', ... });
requestLogs.push({ type: 'assessment', ... });

// Write all at once (preserves order, single API call)
await logBatchToGoogleSheets(driveAccessToken, requestLogs);
```

**Option C: Client-Side Sorting (No code change)**
- Sort spreadsheet by `Request ID` + `Timestamp` when viewing
- Adds formula column: `=TEXT(Timestamp, "YYYY-MM-DD HH:MM:SS.000")`
- Not a fix, just a workaround

---

## Problem 2: Duplicate Guardrail Logs ❌

### Description
Guardrail calls are logged **twice** with different types:

```
Row 1: guardrail_output, llama-guard-4-12b, 483 prompt, 2 completion
Row 2: chat,             llama-guard-4-12b, 483 prompt, 2 completion  ← Duplicate
```

### Root Cause
Guardrails use the **provider infrastructure** which has its own logging:

**File**: `src/guardrails/guardrail-factory.js` (lines 130-148)
```javascript
const response = await provider.makeRequest([
  { role: 'user', content: prompt }
], {
  model: config.inputModel,
  temperature: 0,
  max_tokens: 500
});
```

The `provider.makeRequest()` calls into providers like `GroqProvider` which internally log the call as type `chat`:

**File**: `src/providers/groq-provider.js` (hypothetical)
```javascript
async makeRequest(messages, options) {
  const response = await fetch('https://api.groq.com/v1/chat', {...});
  
  // Provider logs this as 'chat' type
  await logToGoogleSheets({
    type: 'chat',  // ← Problem: should be 'guardrail_input'
    model: options.model,
    ...
  });
  
  return response;
}
```

Then the **guardrail wrapper** ALSO logs it:

**File**: `src/guardrails/guardrail-factory.js` (lines 140-157)
```javascript
return {
  safe: result.safe,
  tracking: {
    type: 'guardrail_input',  // ← Duplicate log
    model: config.inputModel,
    ...
  }
};
```

### Impact
- Inflated usage statistics (double counting)
- Incorrect billing (guardrails counted twice)
- Confusing analytics

### Solution

**Option A: Disable Provider Logging for Guardrails**
```javascript
// In guardrail-factory.js
const providerConfig = {
  id: 'guardrail',
  type: config.provider,
  apiKey: apiKey,
  source: 'guardrail',
  disableLogging: true  // ← Add this flag
};

const provider = createProvider(providerConfig);
```

Then in each provider (e.g., `GroqProvider`):
```javascript
async makeRequest(messages, options) {
  const response = await fetch(...);
  
  // Skip logging if disabled
  if (!this.config.disableLogging) {
    await logToGoogleSheets({...});
  }
  
  return response;
}
```

**Option B: Use Source Field to Filter**
Already partially implemented! The providers are created with `source: 'guardrail'`:

```javascript
// In provider logging
if (this.config.source === 'guardrail') {
  // Don't log here, guardrail wrapper will log
  return;
}
```

**Option C: De-duplicate in Spreadsheet**
- Add conditional formatting to highlight duplicate `Request ID` + `Model` + `Tokens`
- Manual cleanup (not scalable)

---

## Problem 3: Missing Email for Guardrail Input ❌

### Description
```
2025-10-22T15:18:14.082Z  unknown  guardrail_input
2025-10-22T15:21:16.018Z  unknown  guardrail_input
```

Email shows "unknown" for `guardrail_input` calls, but subsequent calls in same request show correct email.

### Root Cause
The guardrail validator is initialized **before** user authentication happens:

**File**: `src/endpoints/chat.js` (lines 1168-1180)
```javascript
// Initialize guardrails if enabled
let guardrailValidator = null;
try {
    const guardrailContext = {
        ...apiKeys  // ← Has API keys but NO userEmail yet
    };
    const guardrailConfig = loadGuardrailConfig(guardrailContext);
    if (guardrailConfig) {
        guardrailValidator = createGuardrailValidator(guardrailConfig, guardrailContext);
    }
} catch (error) {
    console.error('🛡️ Guardrail initialization error:', error.message);
}
```

Then later, input validation happens **before** email is set:

**File**: `src/endpoints/chat.js` (lines 1200-1210)
```javascript
// Validate input with guardrails
if (guardrailValidator) {
    const inputValidation = await guardrailValidator.validateInput(userMessage);
    // ← At this point, userEmail is not yet available
    
    if (!inputValidation.safe) {
        // Return error...
    }
    
    // Log the validation (email = 'unknown')
    await logToBothSheets(driveAccessToken, {
        userEmail: userEmail || 'unknown',  // ← userEmail not set yet!
        type: 'guardrail_input',
        ...inputValidation.tracking
    });
}
```

Authentication happens **after** this:

**File**: `src/endpoints/chat.js` (lines 1250-1270)
```javascript
// Verify authentication AFTER guardrail validation
const authResult = verifyAuthToken(body.authToken);
const userEmail = authResult.email;  // ← Email set here
```

### Impact
- User tracking broken for guardrail input calls
- Cannot attribute guardrail costs to users
- Billing inaccurate

### Solution

**Move guardrail logging AFTER auth**:

```javascript
// Parse request
const body = JSON.parse(event.body);
const userMessage = body.message;

// Authenticate FIRST
const authResult = verifyAuthToken(body.authToken);
const userEmail = authResult.email;

// Initialize guardrails with userEmail
const guardrailContext = {
    ...apiKeys,
    userEmail  // ← Now available
};
const guardrailConfig = loadGuardrailConfig(guardrailContext);
let guardrailValidator = null;
if (guardrailConfig) {
    guardrailValidator = createGuardrailValidator(guardrailConfig, guardrailContext);
}

// Validate input
if (guardrailValidator) {
    const inputValidation = await guardrailValidator.validateInput(userMessage);
    
    // Log with correct email
    await logToBothSheets(driveAccessToken, {
        userEmail,  // ← Now correct!
        type: 'guardrail_input',
        ...inputValidation.tracking
    });
}
```

---

## Problem 4: Tool-Generated Image Logs Missing Context ⚠️

### Description
```
2025-10-22T15:20:26.031Z  tool-generated  openai  dall-e-2  image_generation
```

Image generation logs show:
- Email: `tool-generated` (should be user email)
- Isolated request IDs (can't link to parent chat)
- No parent request ID reference

### Root Cause
Image generation tools log independently without parent context:

**File**: `src/tools/generate-image.js` (hypothetical)
```javascript
async function generateImage(prompt, options, context) {
  const response = await openai.images.generate({
    model: 'dall-e-2',
    prompt
  });
  
  // Log without user context
  await logToGoogleSheets({
    userEmail: 'tool-generated',  // ← Should be context.userEmail
    type: 'image_generation',
    requestId: generateUniqueId(),  // ← Should be context.parentRequestId
    ...
  });
  
  return response;
}
```

### Impact
- Cannot track which user generated images
- Cannot correlate image gen costs to chat requests
- Billing broken for image generation

### Solution

**Pass user context to tool functions**:

```javascript
// In chat.js - tool execution
const toolResult = await executeTool(toolName, toolArgs, {
  userEmail,
  requestId,  // Parent request ID
  accessToken: driveAccessToken
});

// In generate-image.js
async function generateImage(prompt, options, context) {
  const response = await openai.images.generate({...});
  
  // Log with user context
  await logToGoogleSheets({
    userEmail: context.userEmail,  // ← Correct email
    type: 'image_generation',
    requestId: context.requestId,  // ← Parent request ID
    subRequestId: generateUniqueId(),  // ← Tool's own ID
    ...
  });
  
  return response;
}
```

---

## Problem 5: Assessment Calls Missing for Some Requests ⚠️

### Description
Some requests have assessment calls logged, others don't. Pattern:

```
✅ Groq assessment: Logged (llama-3.1-8b-instant)
❌ Gemini assessment: NOT logged (empty response from API)
```

### Root Cause
**Gemini API returns empty response for assessment prompts** (content policy block):

**File**: `src/endpoints/chat.js` (lines 300-302)
```javascript
console.log(`🔍 Evaluation rawResponse:`, evalResponse.rawResponse ? 'present' : 'MISSING');
console.log(`🔍 Evaluation usage:`, evalResponse.rawResponse?.usage ? JSON.stringify(...) : 'MISSING');
```

Output shows:
```
🔍 Evaluation rawResponse: MISSING
🔍 Evaluation usage: MISSING
```

When `rawResponse` is missing, there's **no usage data to log**, so no spreadsheet entry is created.

### Impact
- Incomplete assessment tracking
- Cannot measure assessment quality across providers
- Debugging difficult (missing data points)

### Solution

**Option A: Log failed assessments**
```javascript
try {
  const evaluation = await performAssessment(response);
  
  if (evaluation.rawResponse && evaluation.usage) {
    // Log successful assessment
    await logToBothSheets({
      type: 'assessment',
      ...evaluation.usage
    });
  } else {
    // Log FAILED assessment
    await logToBothSheets({
      type: 'assessment_failed',
      provider: evaluationProvider,
      model: evaluationModel,
      errorReason: 'Empty response from provider',
      promptTokens: 0,
      completionTokens: 0
    });
  }
} catch (error) {
  // Log assessment error
  await logToBothSheets({
    type: 'assessment_error',
    errorMessage: error.message
  });
}
```

**Option B: Fallback to working provider (already done)**
Already using Groq as fallback. Issue is we're not logging when Gemini fails.

---

## Problem 6: Fire-and-Forget Logging (Minor) ⚠️

### Description
Some error logging calls are **not awaited**:

**File**: `src/endpoints/chat.js` (lines 3505, 3591)
```javascript
logToBothSheets(driveAccessToken, {
  errorCode: 'MAX_ITERATIONS',
  errorMessage: '...'
}).catch(err => console.error('Failed to log error to sheets:', err.message));
// ← Not awaited! Lambda may terminate before log completes
```

### Root Cause
Error handling code doesn't wait for logging to complete before ending response.

### Impact
- Error logs may be lost if Lambda terminates too quickly
- Incomplete error tracking

### Solution

**Always await logging**:
```javascript
try {
  await logToBothSheets(driveAccessToken, {
    errorCode: 'MAX_ITERATIONS',
    errorMessage: '...'
  });
} catch (err) {
  console.error('Failed to log error to sheets:', err.message);
}

// Now safe to end response
responseStream.end();
```

---

## Summary of Issues

| Issue | Severity | Impact | Fix Complexity |
|-------|----------|--------|----------------|
| 1. Timestamp ordering | Medium | UX/Analytics | Medium (batch logging) |
| 2. Duplicate guardrail logs | High | Billing/Stats | Low (add flag) |
| 3. Missing email (guardrails) | High | Billing | Low (reorder code) |
| 4. Image gen missing context | Medium | Billing | Medium (context passing) |
| 5. Missing assessment logs | Low | Analytics | Low (log failures) |
| 6. Fire-and-forget logging | Low | Data loss | Low (add await) |

---

## Recommended Fix Priority

1. **Fix #3 (Missing email)** - Breaks billing, simple fix
2. **Fix #2 (Duplicate logs)** - Inflates costs, simple fix
3. **Fix #6 (Fire-and-forget)** - Data loss risk, trivial fix
4. **Fix #4 (Image context)** - Billing accuracy, medium fix
5. **Fix #5 (Missing assessments)** - Analytics only, log failures
6. **Fix #1 (Timestamp order)** - UX issue, complex fix (batch logging)

---

## Implementation Plan

### Phase 1: Critical Fixes (30 minutes)

1. **Move guardrail initialization after auth**
   - File: `src/endpoints/chat.js`
   - Move lines 1168-1180 to after line 1270
   - Pass `userEmail` to guardrail context

2. **Disable provider logging for guardrails**
   - File: `src/providers/groq-provider.js` (and others)
   - Check `if (this.config.source === 'guardrail') return;`
   - Skip logging in provider's `makeRequest()`

3. **Await error logging calls**
   - File: `src/endpoints/chat.js`
   - Add `await` to lines 3505 and 3591

### Phase 2: Medium Priority (1 hour)

4. **Pass user context to image generation**
   - File: `src/tools/generate-image.js`
   - Accept `context` parameter with `userEmail`, `requestId`
   - Update all tool calls to pass context

5. **Log failed assessments**
   - File: `src/endpoints/chat.js`
   - Add logging for empty Gemini responses
   - Track failure reasons

### Phase 3: Long-term Enhancement (2-3 hours)

6. **Implement batch logging**
   - New function: `logBatchToGoogleSheets()`
   - Collect all logs during request
   - Write in single API call at end
   - Preserves chronological order

---

## Testing Checklist

After fixes:

- [ ] Guardrail input logs show correct email
- [ ] No duplicate guardrail logs in spreadsheet
- [ ] Image generation logs show user email
- [ ] Image gen logs reference parent request ID
- [ ] Failed assessments are logged
- [ ] Error logs always appear (not lost)
- [ ] Logs appear in chronological order (if batch logging implemented)

---

## Related Documentation

- `GOOGLE_SHEETS_LOGGING_SETUP.md` - Setup guide
- `AUTHENTICATION_FIXES.md` - Auth flow documentation
- `FEATURE_GUARDRAILS_AUTO_DETECTION.md` - Guardrails configuration
