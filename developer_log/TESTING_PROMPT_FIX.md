# Quick Test: System Prompt Fix for XML/JSON in Responses

## Problem Fixed

LLM was sometimes including tool syntax in responses like:
```
<execute_javascript>{"code": "..."}</execute_javascript>
```

This should NOT appear in responses. Tool calls happen automatically via the function calling protocol.

## How to Test (3 minutes)

### Test 1: Poetry + Execute (Most Common Issue)
```
URL: http://localhost:8081
Tab: Chat
Tools: Enable "Execute JavaScript"

Prompt: "Write me a short poem about sunrise and execute it as JavaScript to display it"

❌ BAD (before fix):
  Response contains: <execute_javascript>{"code": "console.log(`poem...`)"}</execute_javascript>

✅ GOOD (after fix):
  Response contains: Only the poem text in natural language
  Purple tool message appears separately showing code execution
```

### Test 2: Search Query
```
Tools: Enable "Web Search"

Prompt: "What's the latest news about AI?"

❌ BAD:
  Response contains: <search_web>{"query": "latest AI news"}</search_web>

✅ GOOD:
  Response contains: Natural language summary of news
  Purple tool message appears separately showing search results
```

### Test 3: Math Calculation
```
Tools: Enable "Execute JavaScript"

Prompt: "Calculate the factorial of 15"

❌ BAD:
  Response contains: <execute_javascript>{"code": "function factorial..."}</execute_javascript>

✅ GOOD:
  Response contains: "The factorial of 15 is 1,307,674,368,000"
  Purple tool message appears separately showing calculation
```

### Test 4: Complex Multi-Tool
```
Tools: Enable both "Web Search" and "Execute JavaScript"

Prompt: "Search for the current population of China and calculate what 10% of that would be"

❌ BAD:
  Response contains: <search_web> or <execute_javascript> tags

✅ GOOD:
  Response contains: Natural language answer with calculations
  Two purple tool messages (one for search, one for calculation)
```

## What to Look For

### ✅ Success Indicators
- Response content is pure natural language
- No XML tags like `<tool_name>`
- No JSON objects like `{"code": "..."}`
- Tool messages appear separately (purple boxes below response)
- Professional, clean appearance

### ❌ Failure Indicators (Report These)
- XML tags in response text: `<execute_javascript>`, `<search_web>`, etc.
- JSON objects in response text: `{"code": ...}`, `{"query": ...}`
- Response looks technical/code-like when it should be natural
- Tools mentioned but not executed

## Quick Verification Checklist

- [ ] No `<` followed by tool name in any response
- [ ] No `{"code":` or `{"query":` in response text
- [ ] Tool execution shows in purple messages (separate from response)
- [ ] Responses read naturally like human writing
- [ ] Multiple tools can be used without syntax appearing

## Debug Commands

### Check Current System Prompt
```javascript
// Browser console (ChatTab)
// Look at the network request payload
// Check the first message (role: 'system')
```

### Check Backend Logs
```bash
# Look for prompt construction
grep "CRITICAL:" src/config/prompts.js
grep "NEVER write things like" src/lambda_search_llm_handler.js
```

### Verify Deployment
```bash
# Check Lambda deployment timestamp
aws lambda get-function --function-name llmproxy --query 'Configuration.LastModified'
```

## Expected Behavior

### Correct Flow

```
User: "Write a poem and execute it"
    ↓
LLM: Generates poem text
    ↓
LLM: Calls execute_javascript tool (via tool_calls)
    ↓
Backend: Executes code
    ↓
UI: Shows poem in chat + purple tool message
```

### Incorrect Flow (Fixed Now)

```
User: "Write a poem and execute it"
    ↓
LLM: Generates poem text WITH <execute_javascript> tag
    ↓
Backend: No tool execution (it's just text)
    ↓
UI: Shows poem with ugly XML syntax
    ❌ Tool never actually executed
```

## Common Issues

### Issue: Still seeing XML tags
**Cause**: Frontend cache or old Lambda deployment  
**Fix**: 
1. Hard refresh browser (Ctrl+Shift+R)
2. Check Lambda deployment timestamp
3. Verify `scripts/deploy.sh` ran successfully

### Issue: Tools not executing at all
**Cause**: Different issue (not this fix)  
**Fix**: Check tool enablement and API configuration

### Issue: Responses too technical
**Cause**: Model behavior, not necessarily XML/JSON  
**Fix**: May need additional prompt tuning for specific models

## Files Changed

1. ✅ `src/config/prompts.js` - Core system prompt
2. ✅ `src/lambda_search_llm_handler.js` - Dynamic prompts (2 locations)
3. ✅ `ui-new/src/components/ChatTab.tsx` - Frontend prompts
4. ✅ Lambda deployed
5. ✅ Frontend built and served

## Build Info

- **Frontend**: index-Cydz6e4s.js (248.10 kB)
- **Backend**: Lambda `llmproxy` deployed successfully
- **Server**: http://localhost:8081

## If Issue Persists

1. **Check model**: Some models more prone to this behavior
2. **Check temperature**: Lower temperature (0.5-0.7) helps
3. **Check tool definitions**: Ensure schemas are correct
4. **Try different prompt**: User can add to system prompt: "Write only natural language"
5. **Report**: Document model name, prompt, and response for investigation

---

**Status**: ✅ Fix deployed and ready for testing  
**Expected Result**: No more XML/JSON tool syntax in responses  
**Test Time**: ~3 minutes with 4 test cases
