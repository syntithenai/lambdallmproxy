# Max Iterations Error Debug Guide

## Problem
Getting "Maximum tool execution iterations reached" error even for simple queries with just one tool call.

## Possible Causes

### 1. Iteration Counter Bug
The loop increments `iterationCount` at the start, so:
- First iteration: `iterationCount = 1`
- If max is set to 1, it would fail immediately

**Check:**
```bash
# In your local Lambda server logs, look for:
grep "MAX_TOOL_ITERATIONS" logs
grep "maxIterations" logs
```

**Expected:** Should see `maxIterations = 15` or whatever you have configured

### 2. Loop Not Breaking After Tool Execution
The code should break after:
- No tool calls in response
- finish_reason === 'stop'
- Tool execution complete and no pending todos

**Debug Steps:**
1. Check backend console for these log messages:
   ```
   ✅ Treating response as final - no tool calls
   ✅ Treating response as final due to finish_reason=stop
   ✅ Completing request after N iterations
   ```

2. If you DON'T see these messages, the loop isn't breaking properly

### 3. Todos Auto-Progression Interfering
If todos manager thinks there are pending todos, it will `continue` the loop instead of breaking.

**Check for:**
```
🔄 Auto-resubmitting for next todo
TodosManager: Completed current todo, N remaining
```

### 4. Environment Variable Override
Someone might have set `MAX_TOOL_ITERATIONS=1` in the environment.

**Check:**
```bash
# If running locally:
echo $MAX_TOOL_ITERATIONS

# In Lambda environment variables:
# Check AWS Console → Lambda → Configuration → Environment Variables
```

## Quick Fix

### Temporary: Increase the Limit
Add to your `.env` or Lambda environment variables:
```
MAX_TOOL_ITERATIONS=30
```

### Better: Add Defensive Logging
To help debug, we should add logging BEFORE the max iterations check to see what's happening.

## How to Debug Locally

1. **Start local Lambda server:**
   ```bash
   node scripts/run-local-lambda.js
   ```

2. **Send a test query** that triggers the error

3. **Watch for these log patterns:**
   ```
   🔍 Messages BEFORE filtering (iteration 1): ...
   🔍 Messages AFTER filtering (iteration 1): ...
   📊 LLM Response: ...
   🔧 Tool calls: ...
   ✅ Treating response as final ...
   ✅ Completing request after N iterations
   ```

4. **If you see the loop continue unexpectedly:**
   - Check if `hasToolCalls` is incorrectly true
   - Check if `finishReason` is not 'stop'
   - Check if todos manager has pending items

5. **Look for the iteration that fails:**
   ```
   ⚠️ Max iteration (iteration 16/15)
   ```

## Most Likely Cause

Based on your error showing `iterations: 1`, I suspect:

1. **The iteration counter starts at 1** (correct)
2. **Something is causing a second iteration** when there shouldn't be one
3. **The second iteration immediately fails** because it's hitting limit

**What to check:**
- Is the LLM response being treated as final?
- Is there a continue statement being hit that shouldn't be?
- Are there pending todos causing auto-progression?

## Immediate Workaround

Add this logging to see what's happening in iteration 2:

In `src/endpoints/chat.js`, around line 1622, add:
```javascript
while (iterationCount < maxIterations) {
    iterationCount++;
    console.log(`🔄 ITERATION ${iterationCount}/${maxIterations} STARTING`);
    console.log(`   Current messages count: ${currentMessages.length}`);
    console.log(`   Last message role: ${currentMessages[currentMessages.length - 1]?.role}`);
    
    // ... rest of code
```

And around line 3246, add:
```javascript
console.log(`✅ ABOUT TO BREAK - iteration ${iterationCount}`);
console.log(`   hasError: ${hasError}`);
console.log(`   todosManager.hasPending(): ${todosManager.hasPending()}`);
console.log(`   todoAutoIterations: ${todoAutoIterations}`);
break;
```

This will show you exactly what's happening before the loop exits.

## Please Provide

To help debug further, please share:
1. **Full backend console logs** from when you send a query
2. **The exact query** you're sending
3. **Environment variables** - especially `MAX_TOOL_ITERATIONS`
4. **Error details** from browser console showing the full error event

The issue is likely one of:
- Iteration limit set too low (1 instead of 15)
- Loop not breaking after successful tool execution
- Todos auto-progression continuing when it shouldn't
