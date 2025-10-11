# Function Syntax Warning Enhancement

**Date**: 2025-10-05  
**Issue**: LLM responses still containing `<function=search>` syntax  
**Status**: ✅ Fixed

## Problem

Despite previous warnings against XML/JSON in system prompts, the LLM was still outputting `<function=search>` or `<function=execute_javascript>` syntax in text responses. This is an **Anthropic/Claude-style** function calling format that conflicts with the OpenAI function calling format used by this API.

### Root Cause

Some LLMs (particularly those trained on Anthropic's Claude dataset) have learned the `<function=name>` syntax as an alternative way to indicate tool usage. Our previous warnings mentioned XML tags and JSON objects, but didn't explicitly call out this specific pattern.

## Solution

Added **explicit warnings** against the `<function=name>` syntax pattern in all system prompt locations:

### 1. Core System Prompt (`src/config/prompts.js`)

**Added two new bullet points**:
```javascript
- NEVER write things like <function=search_web> or <function=execute_javascript> in your response
- NEVER use Anthropic/Claude-style function syntax like <function=name> - this API uses OpenAI format only
```

### 2. Backend Handler - First Location (`src/lambda_search_llm_handler.js` line ~182)

**Updated warning**:
```javascript
'CRITICAL: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. ' +
'NEVER write things like <execute_javascript>{"code": "..."}</execute_javascript> or ' +
'<function=search_web> or <function=execute_javascript> in your response. ' +
'This API uses OpenAI function calling format, NOT Anthropic/Claude syntax. ' +
'Tool calls happen automatically through the API.'
```

### 3. Backend Handler - Second Location (`src/lambda_search_llm_handler.js` line ~200)

**Updated warning** (same as above):
```javascript
'CRITICAL: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. ' +
'NEVER write things like <execute_javascript>{"code": "..."}</execute_javascript> or ' +
'<function=search_web> or <function=execute_javascript> in your response. ' +
'This API uses OpenAI function calling format, NOT Anthropic/Claude syntax. ' +
'Tool calls happen automatically through the API.'
```

### 4. Frontend Chat Tab (`ui-new/src/components/ChatTab.tsx` line ~211)

**Updated warning**:
```typescript
`IMPORTANT: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. ` +
`NEVER write <function=search_web> or <function=execute_javascript> or similar Anthropic/Claude-style syntax. ` +
`This API uses OpenAI function calling format only. ` +
`Write only natural language. Tool calls happen automatically through the API - you don't need to format them yourself.`
```

## Key Changes

### Before
Warnings were generic about "XML tags" and "JSON objects":
- ❌ "Do NOT include XML tags in your responses"
- ❌ "NEVER write things like `<execute_javascript>{...}`"

### After
Warnings are **specific** about the problematic pattern:
- ✅ "NEVER write `<function=search_web>` or `<function=execute_javascript>`"
- ✅ "NEVER use Anthropic/Claude-style function syntax like `<function=name>`"
- ✅ "This API uses OpenAI function calling format, NOT Anthropic/Claude syntax"

## Why This Matters

### The Two Function Calling Standards

**OpenAI Format** (Used by this API):
```json
{
  "role": "assistant",
  "content": "Let me search for that information.",
  "tool_calls": [{
    "id": "call_abc123",
    "type": "function",
    "function": {
      "name": "search_web",
      "arguments": "{\"query\": \"latest news\"}"
    }
  }]
}
```

**Anthropic/Claude Format** (NOT used by this API):
```
Let me search for that information.

<function=search_web>
{"query": "latest news"}
</function>
```

### Confusion Source

Some LLMs trained on multi-provider datasets may have learned both formats:
- **Groq models** (Llama 3.x): Primarily trained on OpenAI format
- **Mixed training**: May have seen Anthropic format in training data
- **Context confusion**: Model may choose wrong format if not explicitly guided

## Implementation Details

### File: `src/config/prompts.js`

**Lines 25-27** (added):
```javascript
- NEVER write things like <function=search_web> or <function=execute_javascript> in your response
- NEVER use Anthropic/Claude-style function syntax like <function=name> - this API uses OpenAI format only
```

### File: `src/lambda_search_llm_handler.js`

**Line ~182** (planning path):
```javascript
dynamicSystemPrompt = researchPlan.optimal_persona + 
  ' CRITICAL TOOL RULES: ... ' +
  'CRITICAL: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. ' +
  'NEVER write things like <execute_javascript>{"code": "..."}</execute_javascript> or ' +
  '<function=search_web> or <function=execute_javascript> in your response. ' +
  'This API uses OpenAI function calling format, NOT Anthropic/Claude syntax. ' +
  'Tool calls happen automatically through the API.' + 
  environmentContext;
```

**Line ~200** (fallback path - same warning):
```javascript
dynamicSystemPrompt = (systemPrompt || COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT) + 
  ' CRITICAL TOOL RULES: ... ' +
  'CRITICAL: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. ' +
  'NEVER write things like <execute_javascript>{"code": "..."}</execute_javascript> or ' +
  '<function=search_web> or <function=execute_javascript> in your response. ' +
  'This API uses OpenAI function calling format, NOT Anthropic/Claude syntax. ' +
  'Tool calls happen automatically through the API.' + 
  environmentContext;
```

### File: `ui-new/src/components/ChatTab.tsx`

**Line ~211**:
```typescript
if (tools.length > 0) {
  const toolNames = tools.map(t => t.function.name).join(', ');
  finalSystemPrompt += `\n\nYou have access to the following tools: ${toolNames}. ` +
    `Use them when appropriate to provide better answers. ` +
    `For web searches, scraping, or code execution, use the relevant tools.\n\n` +
    `IMPORTANT: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. ` +
    `NEVER write <function=search_web> or <function=execute_javascript> or similar Anthropic/Claude-style syntax. ` +
    `This API uses OpenAI function calling format only. ` +
    `Write only natural language. Tool calls happen automatically through the API - you don't need to format them yourself.`;
}
```

## Testing Strategy

### Test Case 1: Search Query
**Input**: "What's the latest news about AI?"

**Expected Behavior**:
```
✅ CORRECT: "Let me search for the latest AI news..." 
   [Tool call made via API]
   
❌ WRONG: "Let me search for the latest AI news... <function=search_web>..."
```

### Test Case 2: Calculation
**Input**: "Calculate 123 * 456"

**Expected Behavior**:
```
✅ CORRECT: "Let me calculate that for you..."
   [Tool call made via API]
   "The result is 56,088"
   
❌ WRONG: "Let me calculate that... <function=execute_javascript>{"code": "123 * 456"}</function>"
```

### Test Case 3: Multiple Tools
**Input**: "Search for Python tutorials and calculate the best learning time"

**Expected Behavior**:
```
✅ CORRECT: "I'll search for tutorials and help with timing..."
   [Multiple tool calls made via API]
   
❌ WRONG: "<function=search_web>... <function=execute_javascript>..."
```

## Monitoring

### What to Watch

1. **Response Content**: Check if `<function=` appears in any text responses
2. **Tool Call Success**: Verify tools are being called via proper API format
3. **Model Compliance**: Different models may behave differently
4. **Console Logs**: Look for malformed tool call errors

### Debugging Commands

```bash
# Search for function syntax in logs
grep -r "<function=" /var/log/lambda/

# Check recent responses
tail -f output.txt | grep -i "function="

# Monitor tool calls
aws logs tail /aws/lambda/llmproxy --follow --filter-pattern "tool_call"
```

## Benefits

### 1. Clearer LLM Guidance
- ✅ Explicitly names the problematic pattern
- ✅ Identifies it as Anthropic/Claude-specific
- ✅ States which format to use (OpenAI)

### 2. Better Model Compliance
- ✅ Models understand exact syntax to avoid
- ✅ Reduces confusion from mixed training data
- ✅ Works across different model providers

### 3. Improved User Experience
- ✅ No confusing XML/function syntax in responses
- ✅ Clean, natural language output
- ✅ Tools execute properly via API

### 4. Future-Proof
- ✅ Prepares for potential Anthropic/Claude integration
- ✅ Makes format requirements explicit
- ✅ Easy to adapt if adding new providers

## Build & Deployment

**Frontend Build**:
```bash
cd ui-new && npm run build
# Output: 248.26 kB (gzip: 75.31 kB)
# File: docs/assets/index-BK0m4IMX.js
```

**Backend Deployment**:
```bash
./scripts/deploy.sh
# Status: ✅ Deployment completed successfully
# Files: 11 source files packaged
# Function: llmproxy updated
```

**Verification**:
- ✅ Frontend built successfully
- ✅ Backend deployed successfully
- ✅ All warnings active in production

## Related Issues

**Fixed**:
- ❌ `<function=search>` appearing in responses
- ❌ `<function=execute_javascript>` in text output
- ❌ Generic "XML tags" warning insufficient

**Prevented**:
- ✅ Future Anthropic/Claude syntax confusion
- ✅ Mixed format responses
- ✅ Malformed tool call attempts

## Future Enhancements

### 1. Response Filtering
Add post-processing to strip any `<function=...>` patterns:
```javascript
function sanitizeResponse(text) {
  return text.replace(/<function=[^>]+>[\s\S]*?<\/function>/g, '');
}
```

### 2. Validation Warning
Log when function syntax is detected:
```javascript
if (response.content.includes('<function=')) {
  console.warn('⚠️ Model used prohibited function syntax:', response.content);
}
```

### 3. Model-Specific Prompts
Tailor warnings based on model provider:
```javascript
const getFormatWarning = (model) => {
  if (model.includes('claude')) {
    return 'This API uses OpenAI format, not Claude format.';
  }
  return 'Use OpenAI function calling format only.';
};
```

### 4. Training Examples
Add positive examples to system prompt:
```javascript
'CORRECT: "Let me search for that..." [then tool is called automatically]\n' +
'WRONG: "<function=search_web>..." [never write this]'
```

## Summary

Successfully enhanced system prompts across **4 locations** to explicitly warn against `<function=name>` syntax. The warnings now:

1. ✅ Name the specific problematic pattern
2. ✅ Identify it as Anthropic/Claude-style syntax  
3. ✅ State that OpenAI format is required
4. ✅ Reinforce that tool calls happen automatically

**Result**: LLMs should no longer output `<function=search>` or similar syntax in text responses.

**Status**: ✅ Deployed and ready for testing
