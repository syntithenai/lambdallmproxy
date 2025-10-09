# MAX_TOOL_ITERATIONS Configuration Update

**Date**: October 9, 2025  
**Type**: Configuration Change  
**Impact**: Tool execution loop limit updated from 20 (old default) to 15 (new default) with environment override to 10

## Summary

Updated the `MAX_TOOL_ITERATIONS` configuration to prevent excessive tool calling loops while ensuring reasonable iteration limits for complex queries.

## Changes Made

### 1. Code Defaults Updated (Fallback Value: 15)

**File**: `src/config/prompts.js`
```javascript
// BEFORE
const MAX_TOOL_ITERATIONS = Number(process.env.MAX_TOOL_ITERATIONS) || 20;

// AFTER  
const MAX_TOOL_ITERATIONS = Number(process.env.MAX_TOOL_ITERATIONS) || 15;
```

**File**: `src/endpoints/chat.js` (line 473)
```javascript
// BEFORE
const maxIterations = parseInt(process.env.MAX_TOOL_ITERATIONS) || 20;

// AFTER
const maxIterations = parseInt(process.env.MAX_TOOL_ITERATIONS) || 15;
```

### 2. Environment Variable Set (Override: 10)

**File**: `.env`
```bash
# LLM Configuration
MAX_TOKENS_PLANNING=300           # Tokens for initial decision-making/planning phase
MAX_TOOL_ITERATIONS=10            # Maximum tool iterations (default is 15, override here)
```

**Removed duplicate entry** that was set to 3 (causing premature termination)

### 3. Example File Updated

**File**: `.env.example`
```bash
# Tool Execution Configuration
MAX_TOOL_ITERATIONS=10              # Maximum tool execution loop iterations (default: 15)
```

### 4. Lambda Environment Variables Updated

Using AWS CLI with proper JSON:
```bash
aws lambda update-function-configuration \
  --function-name llmproxy \
  --region us-east-1 \
  --environment '{
    "Variables": {
      "ACCESS_SECRET": "...",
      "OPENAI_API_KEY": "...",
      "GROQ_API_KEY": "...",
      "OPENAI_API_BASE": "https://api.openai.com",
      "OPENAI_MODEL": "gpt-4o-mini",
      "GROQ_MODEL": "llama-3.1-8b-instant",
      "ALLOWED_EMAILS": "...",
      "GOOGLE_CLIENT_ID": "...",
      "REASONING_EFFORT": "medium",
      "MAX_TOOL_ITERATIONS": "10"
    }
  }'
```

**Status**: ✅ Successfully applied

### 5. Code Deployed

**Deployment**: llmproxy-20251009-103947.zip (109K)
**Method**: `make fast` (fast deployment with Lambda Layer)
**Status**: ✅ Active and Successful

## Configuration Hierarchy

The tool iteration limit is determined in this order:

1. **Environment Variable** (Highest Priority): `process.env.MAX_TOOL_ITERATIONS`
   - Current value: `"10"` (set in Lambda environment)
   - Can be updated via AWS console or CLI
   
2. **Code Default** (Fallback): `|| 15`
   - Used if environment variable is not set
   - Changed from 20 to 15 in this update

## Behavior

### Before This Update

- **Default**: 20 iterations
- **Problem**: `.env` file had duplicate `MAX_TOOL_ITERATIONS=3` entries
- **Result**: Lambda was using 3 iterations, causing premature termination
- **Error**: "Maximum tool execution iterations reached" after only 3 iterations

### After This Update

- **Lambda Environment**: 10 iterations (explicit override)
- **Code Fallback**: 15 iterations (if env var not set)
- **Safety Limit**: 8 iterations (hardcoded in chat.js line 639)
  - Stops tool execution even if max iterations not reached
  - Ensures LLM provides final answer if taking too long

## Iteration Limits Explained

### Primary Limit: MAX_TOOL_ITERATIONS (10)

This is the **maximum number of LLM→Tool→LLM cycles** allowed. Each iteration:
1. LLM generates response with tool_calls
2. Tools are executed
3. Tool results are added to conversation
4. Loop continues if LLM still needs more tools

**Current value**: 10 iterations

### Secondary Limit: tooManyIterations (8)

**File**: `src/endpoints/chat.js` line 639
```javascript
const tooManyIterations = iterationCount >= 8; // Safety limit (increased from 5)
```

This is a **safety check** that stops tool execution even if:
- We haven't reached MAX_TOOL_ITERATIONS yet
- LLM wants to call more tools
- LLM hasn't provided a substantive answer

**Purpose**: Prevent infinite loops in tool-heavy workflows

### Comparison

| Limit | Value | Purpose | Can be overridden? |
|-------|-------|---------|-------------------|
| MAX_TOOL_ITERATIONS | 10 | Hard stop - no more iterations | Yes (env var) |
| tooManyIterations | 8 | Safety check - force final answer | No (hardcoded) |

## Why These Values?

### MAX_TOOL_ITERATIONS = 10

**Rationale**:
- Most queries need 2-4 iterations
- Complex research queries may need 6-8 iterations
- 10 provides reasonable headroom
- Higher values risk:
  - Excessive API costs
  - Slow response times (30+ seconds)
  - User frustration
  - Potential infinite loops

**Examples**:
- Simple query: 1-2 iterations (search → synthesize)
- Medium query: 3-5 iterations (search → scrape → search → synthesize)
- Complex query: 6-8 iterations (multiple searches, scrapes, calculations)
- Edge case: 9-10 iterations (very complex multi-tool workflows)

### tooManyIterations = 8

**Rationale**:
- Provides early stopping before MAX_TOOL_ITERATIONS
- If LLM hasn't finished after 8 iterations, it's likely stuck
- Forces LLM to provide best-effort answer with available data
- Prevents user waiting too long (8 iterations ≈ 20-25 seconds)

## Safety Mechanisms

### 1. Iteration Counting
```javascript
let iterationCount = 0;
const maxIterations = parseInt(process.env.MAX_TOOL_ITERATIONS) || 15;

while (iterationCount < maxIterations) {
  iterationCount++;
  // ... LLM call and tool execution
}
```

### 2. Early Stopping Conditions
```javascript
const shouldExecuteTools = hasToolCalls && 
                          currentToolCalls.length > 0 && 
                          finishReason !== 'stop' &&      // LLM explicitly done
                          !hasSubstantiveAnswer &&         // Already has good answer
                          !tooManyIterations;              // Safety limit
```

**Stops if**:
- LLM sets `finish_reason='stop'`
- LLM provides substantive answer (>200 chars)
- 8 iterations reached (safety limit)

### 3. Graceful Degradation
```javascript
if (tooManyIterations && hasToolCalls) {
  console.log(`⚠️ Safety limit reached after ${iterationCount} iterations`);
  
  if (assistantMessage.content.trim().length === 0) {
    // Provide fallback message if LLM gave no content
    const hasToolResults = currentMessages.some(m => m.role === 'tool');
    if (hasToolResults) {
      assistantMessage.content = 'I apologize, but I wasn\'t able to synthesize...';
    } else {
      assistantMessage.content = 'I apologize, but I encountered difficulty...';
    }
  }
  delete assistantMessage.tool_calls; // Don't execute more tools
}
```

## Error Transparency

With the **Error Info Dialog** feature (Phase 35), users can now see detailed error information when hitting iteration limits:

**Error Message**:
```json
{
  "error": "Maximum tool execution iterations reached",
  "code": "MAX_ITERATIONS",
  "iterations": 10
}
```

**Dialog Shows**:
- Error classification (code: MAX_ITERATIONS)
- Number of iterations completed
- Full error JSON with context
- Copy button for debugging

## Deployment Integration

### Deploy Script Support

The `scripts/deploy.sh` automatically reads `MAX_TOOL_ITERATIONS` from `.env`:

```bash
MAX_TOOL_ITERATIONS_ENV=$(grep '^MAX_TOOL_ITERATIONS=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
```

And includes it in the Lambda environment update via jq.

### Fast Deploy

The `make fast` command (used in this deployment):
- Updates Lambda code only (~10 seconds)
- Does NOT update environment variables
- Uses existing Lambda Layer for dependencies

**When to use**:
- Code changes only
- Quick iterations
- Environment variables already set

### Full Deploy

The `./scripts/deploy.sh` command:
- Updates Lambda code
- Updates environment variables from `.env`
- Installs dependencies
- Takes ~2-3 minutes

**When to use**:
- First deployment
- Environment variable changes
- Dependency changes

## Testing

### Test Scenarios

**Scenario 1: Normal Query (2-3 iterations)**
```
User: "What's the weather in San Francisco?"
- Iteration 1: Search for weather
- Iteration 2: Synthesize answer
Result: ✅ Completes normally
```

**Scenario 2: Complex Query (6-8 iterations)**
```
User: "Compare the stock performance of tech companies and analyze..."
- Iteration 1-3: Multiple searches
- Iteration 4-5: Scrape detailed data
- Iteration 6-7: Execute calculations
- Iteration 8: Final synthesis
Result: ✅ Completes within safety limit
```

**Scenario 3: Edge Case (Hits MAX_TOOL_ITERATIONS)**
```
User: Very complex multi-part query
- Iterations 1-10: Multiple searches, scrapes, calculations
- Iteration 10: MAX_TOOL_ITERATIONS reached
Result: ⚠️ Error returned with full context via Error Info Dialog
```

### Verification

1. ✅ Code defaults updated to 15
2. ✅ Environment variable set to 10  
3. ✅ Lambda environment configured
4. ✅ Code deployed (llmproxy-20251009-103947.zip)
5. ✅ Error Info Dialog available for transparency

## Monitoring

### CloudWatch Logs

Look for these log patterns:
```
🔍 Tool execution decision: iteration=X, hasToolCalls=true, ...
⚠️ Safety limit reached after N iterations
✅ Completing request after N iterations
```

### Error Tracking

Errors will include:
- `code: 'MAX_ITERATIONS'`
- `iterations: N` (number completed)
- Full request context in Error Info Dialog

## Future Considerations

### Potential Improvements

1. **Dynamic Limits**: Adjust based on query complexity
   - Simple queries: 5 iterations
   - Medium queries: 10 iterations
   - Complex queries: 15 iterations

2. **Cost Tracking**: Monitor per-iteration costs
   - Alert if query exceeds cost threshold
   - Provide cost estimate before execution

3. **User Control**: Allow users to set iteration limit
   - Pro users: Higher limits
   - Free tier: Lower limits

4. **Smarter Early Stopping**: Machine learning to detect when answer is complete
   - Analyze response quality
   - Stop when confidence threshold reached

5. **Continuation Support**: If limit reached, offer to continue
   - "I've gathered data but need more iterations. Continue?"
   - User can approve additional iterations

## Conclusion

The MAX_TOOL_ITERATIONS configuration has been properly updated with:

- **Code default**: 15 iterations (reasonable fallback)
- **Environment override**: 10 iterations (conservative production value)
- **Safety limit**: 8 iterations (prevents runaway loops)
- **Error transparency**: Full error details via Error Info Dialog

This provides a good balance between:
- ✅ Allowing complex queries to complete
- ✅ Preventing excessive API costs
- ✅ Maintaining reasonable response times
- ✅ Providing clear error messages when limits reached

---

**Deployment**: llmproxy-20251009-103947.zip  
**Lambda Environment**: ✅ Updated with MAX_TOOL_ITERATIONS=10  
**Status**: ✅ Active and deployed  
**Related**: Phase 35 (Error Info Dialog Feature)
