# Removed Content Cleaning - Testing Raw Model Output

**Date**: October 6, 2025  
**Action**: Removed all content cleaning from backend and frontend  
**Purpose**: Diagnose whether model generates function syntax or if prompt fix works  
**Status**: ✅ DEPLOYED

## Changes Made

### Backend: src/endpoints/chat.js

**Removed**:
1. ❌ `cleanLLMContent()` function definition
2. ❌ Cleaning from `delta` events (streaming)
3. ❌ Cleaning from `message_complete` event

**Result**: Backend now sends raw, unfiltered model output

### Frontend: ui-new/src/components/ChatTab.tsx

**Removed**:
1. ❌ `cleanLLMContent()` function definition
2. ❌ Cleaning from delta events (streaming display)
3. ❌ Cleaning from message_complete handler
4. ❌ Cleaning from message display
5. ❌ Cleaning from copy button
6. ❌ Cleaning from Gmail share button

**Result**: Frontend now displays raw, unfiltered model output

## Deployment Status

✅ **Backend deployed successfully**  
✅ **Frontend built successfully** (255.83 kB)

## Why Remove Cleaning?

User correctly identified that cleaning masks the real problem. By removing all cleaning, we can:

1. **See exactly what the model generates**
   - If `<function=...>` appears → Model issue (or prompt issue)
   - If no syntax appears → Prompt fix worked!

2. **Properly diagnose the root cause**
   - Is it the system prompt? (We just fixed this)
   - Is it the model architecture?
   - Is it something in the conversation history?

3. **Make informed decisions**
   - If syntax appears: Switch models
   - If syntax doesn't appear: Prompt fix succeeded

4. **Avoid masking issues**
   - Cleaning hides symptoms
   - Symptoms help us find root causes
   - Hidden issues can resurface unexpectedly

## Testing Plan

### Test 1: Simple Query (No Tools)
**Query**: "What is 2+2?"  
**Expected**: Clean mathematical response  
**Check**: No `<function=...>` syntax

### Test 2: Tool Triggering Query
**Query**: "What are the latest AI developments?"  
**Expected**: Model should use tools, then provide answer  
**Check**: 
- Tools execute properly
- Final response has NO `<function=...>` syntax
- Response is natural language

### Test 3: Explicit Search Request
**Query**: "Search for news about quantum computing"  
**Expected**: Search tool executes, results incorporated naturally  
**Check**: 
- Search executes
- NO `<function=...>` in final response
- Results integrated smoothly

### Test 4: Multiple Tool Calls
**Query**: "Search for AI news and then search for climate news"  
**Expected**: Both searches execute, combined results  
**Check**:
- Both tools execute
- NO function syntax in output
- Natural language throughout

## Possible Outcomes

### Outcome 1: Clean Output (Best Case) ✅
**What happens**: No `<function=...>` syntax appears  
**Conclusion**: Prompt fix worked! The negative prompting was the problem  
**Next steps**: 
- Keep using `openai/gpt-oss-120b`
- Monitor for any regressions
- Document the successful fix

### Outcome 2: Function Syntax Still Appears ❌
**What happens**: `<function=...>` or similar tags in responses  
**Conclusion**: Model architecture issue, not prompt issue  
**Next steps**:
1. Try `qwen/qwen3-32b` (best alternative)
2. Try `meta-llama/llama-4-scout-17b-16e-instruct` (fastest)
3. Try `moonshotai/kimi-k2-instruct-0905` (huge context)
4. If all fail: Revert to `llama-3.3-70b-versatile` with cleaning

### Outcome 3: Different Syntax Appears 🔍
**What happens**: Other unexpected patterns in output  
**Conclusion**: Need to investigate further  
**Next steps**:
- Document the new pattern
- Check if it's model-specific
- Adjust prompts or try different model

### Outcome 4: No Content At All ❌
**What happens**: Empty responses  
**Conclusion**: Different issue (provider routing, API error, etc.)  
**Next steps**:
- Check CloudWatch logs
- Verify API key and endpoint
- Test with simple non-tool query

## System Prompt (Current)

The system prompt now says:
```
You have access to these tools: search_web.

IMPORTANT: When users ask for current information, news, web content, or anything 
requiring real-time data or external sources, you MUST use the appropriate tools. 
Do not make up information or refuse to help - use the tools to get accurate, 
up-to-date information.

Examples when you MUST use tools:
- "Find current news about X" → Use search_web
- "What's the latest on X" → Use search_web  
- "Search for X" → Use search_web
- "Get content from URL" → Use scrape_web_content
- "Execute this code" → Use execute_javascript

The API will automatically handle tool execution. After calling a tool, you'll 
receive the results and should incorporate them naturally into your response. 
Always provide complete, helpful answers using the tool results.
```

**Key point**: NO mention of `<function=...>` syntax (removed negative prompting)

## What We're Testing

### Hypothesis 1: Negative Prompting Was the Problem
**Theory**: By mentioning `<function=search>` in the prompt, we taught the model to use it  
**Test**: With new prompt, model should NOT generate this syntax  
**If true**: Problem solved, keep current setup

### Hypothesis 2: Model Architecture Issue
**Theory**: `openai/gpt-oss-120b` inherently generates this syntax  
**Test**: Even with fixed prompt, syntax still appears  
**If true**: Need to switch models

### Hypothesis 3: Training Data Contamination
**Theory**: Model was trained on mixed formats (OpenAI + Claude)  
**Test**: Model occasionally "bleeds" between formats regardless of prompt  
**If true**: Either accept it or switch models

## Monitoring

Watch for:
- ✅ Clean, natural language responses
- ❌ Any XML-like tags or function syntax
- ❌ Empty responses or errors
- ✅ Proper tool execution
- ✅ Good response quality

## Documentation Notes

If the prompt fix works (Outcome 1):
- Document that negative prompting caused the issue
- Document the solution (positive framing only)
- Share this as a lesson learned
- Keep monitoring for regressions

If we need to switch models (Outcome 2):
- Document why `openai/gpt-oss-120b` didn't work
- Document the alternative model chosen
- Document any trade-offs (performance, capability, etc.)
- Update MODEL_SELECTION_ANALYSIS.md

## Quick Reference

### To Re-Enable Cleaning (If Needed)

If we determine cleaning is necessary:

**Backend**: Restore `cleanLLMContent()` function and apply to:
- Delta events: `sseWriter.writeEvent('delta', { content: cleanLLMContent(delta.content) })`
- Message complete: `sseWriter.writeEvent('message_complete', { ...msg, content: cleanLLMContent(msg.content) })`

**Frontend**: Restore `cleanLLMContent()` function and apply to:
- Delta display: `setStreamingContent(prev => prev + cleanLLMContent(data.content))`
- Message display: `<div>{cleanLLMContent(msg.content)}</div>`
- Copy: `navigator.clipboard.writeText(cleanLLMContent(msg.content))`
- Share: `encodeURIComponent(cleanLLMContent(msg.content))`

### To Switch Models

Change in `ui-new/src/components/ChatTab.tsx`:
```typescript
largeModel: 'qwen/qwen3-32b'  // or other alternative
```

Then rebuild: `cd ui-new && npm run build`

## Success Metrics

**Immediate (within 5 queries)**:
- No function syntax visible
- Tools execute properly
- Responses are natural

**Short-term (24 hours)**:
- Consistent clean output
- No user reports of strange syntax
- Good response quality maintained

**Long-term (1 week)**:
- No regressions
- Model performs well across all query types
- User satisfaction maintained/improved

---

**Status**: ✅ DEPLOYED AND READY FOR TESTING

Now we can see the model's true behavior and make informed decisions about whether to keep the current model or switch alternatives.
