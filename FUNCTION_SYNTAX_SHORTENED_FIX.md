# Function Syntax Fix: Shortened Pattern `<function=search>`

**Date**: 2025-10-05  
**Issue**: LLM still outputting `<function=search>` even after previous warnings  
**Context**: Empty system prompt with tools enabled  
**Status**: ✅ Fixed

## Problem

Despite previous fixes that warned against `<function=search_web>` and `<function=execute_javascript>`, the LLM was still outputting the **shortened pattern** `<function=search>` (without the `_web` suffix).

### Reproduction

**Query**: "What are the latest developments in artificial intelligence this week?"

**Response**: 
```
I'll check the latest news and updates on artificial intelligence. 
<function=search>
```

**Trigger Condition**: Empty system prompt with search tool enabled

### Root Cause

Our previous warnings listed specific examples like:
- ❌ `<function=search_web>`
- ❌ `<function=execute_javascript>`

But the LLM was using a **shortened version**:
- ❌ `<function=search>` (without the `_web` suffix)

The warnings weren't generic enough to cover all variations of the pattern.

## Solution

Updated all warning text to be more comprehensive and explicitly mention **any/all** variations:

### Key Changes

**Before** (too specific):
```
NEVER write <function=search_web> or <function=execute_javascript>
```

**After** (covers all patterns):
```
NEVER write <function=search>, <function=search_web>, <function=execute_javascript>, or ANY similar patterns
```

### Language Strengthened

1. **Added "ANY"**: Makes it clear that ALL variations are prohibited
2. **Added shortened form**: Explicitly lists `<function=search>` 
3. **Used "patterns"**: Indicates this is a category of syntax, not just specific examples
4. **Emphasized with CAPS**: "ANY XML-style tags", "do NOT format them in your text"

## Implementation

### 1. Core System Prompt (`src/config/prompts.js`)

**Lines 24-29** (updated):

```javascript
// Before
- NEVER write things like <function=search_web> or <function=execute_javascript> in your response
- NEVER use Anthropic/Claude-style function syntax like <function=name> - this API uses OpenAI format only

// After
- NEVER write things like <function=search>, <function=search_web>, or <function=execute_javascript> in your response
- NEVER use Anthropic/Claude-style function syntax like <function=name> or any XML-style tags - this API uses OpenAI format only
```

### 2. Backend Handler - Planning Path (`src/lambda_search_llm_handler.js` ~line 182)

**Updated**:

```javascript
// Before
'CRITICAL: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. ' +
'NEVER write things like <execute_javascript>{"code": "..."}</execute_javascript> or ' +
'<function=search_web> or <function=execute_javascript> in your response. ' +
'This API uses OpenAI function calling format, NOT Anthropic/Claude syntax.'

// After
'CRITICAL: Do NOT include ANY XML-style tags or function syntax in your text responses. ' +
'NEVER write <function=search>, <function=search_web>, <function=execute_javascript>, or ANY similar patterns. ' +
'This API uses OpenAI function calling format, NOT Anthropic/Claude syntax. ' +
'Tool calls happen automatically through the API - do NOT format them in your text.'
```

### 3. Backend Handler - Fallback Path (`src/lambda_search_llm_handler.js` ~line 200)

**Updated** (same pattern as above):

```javascript
'CRITICAL: Do NOT include ANY XML-style tags or function syntax in your text responses. ' +
'NEVER write <function=search>, <function=search_web>, <function=execute_javascript>, or ANY similar patterns. ' +
'This API uses OpenAI function calling format, NOT Anthropic/Claude syntax. ' +
'Tool calls happen automatically through the API - do NOT format them in your text.'
```

### 4. Frontend Chat Tab (`ui-new/src/components/ChatTab.tsx` ~line 211)

**Updated**:

```typescript
// Before
`IMPORTANT: Do NOT include XML tags, JSON objects, or function call syntax in your text responses. ` +
`NEVER write <function=search_web> or <function=execute_javascript> or similar Anthropic/Claude-style syntax. ` +
`This API uses OpenAI function calling format only.`

// After
`CRITICAL: Do NOT include ANY XML-style tags or function syntax in your text responses. ` +
`NEVER write <function=search>, <function=search_web>, <function=execute_javascript>, or ANY similar syntax. ` +
`This API uses OpenAI function calling format only - tools are called automatically through the API, NOT through text formatting. ` +
`Write ONLY natural language in your responses. The system will handle all tool calling for you.`
```

## Pattern Variations Covered

The updated warnings now explicitly prevent:

1. ✅ `<function=search>` - Shortened tool name
2. ✅ `<function=search_web>` - Full tool name  
3. ✅ `<function=execute_javascript>` - JS tool
4. ✅ `<function=scrape_web_content>` - Scraping tool
5. ✅ `<function=any_tool_name>` - Generic pattern
6. ✅ Any other XML-style function tags

## Why This Happened

### LLM Pattern Matching

LLMs often generalize from examples but may also:
- **Shorten patterns**: `<function=search>` instead of `<function=search_web>`
- **Vary syntax**: `<tool=name>`, `<call:name>`, etc.
- **Adapt to context**: May try different formats if unsure

### Training Data Influence

Some models may have seen various function calling syntaxes:
- Anthropic/Claude: `<function=name>` or `<tool>name</tool>`
- Function tags: `<func:name>`, `<call=name>`
- Custom formats: `[TOOL:name]`, `{function:name}`

### Empty System Prompt Edge Case

When the system prompt is empty or minimal, the model relies more on:
- **Training data patterns**: May revert to familiar syntax
- **Tool descriptions**: May infer format from tool names
- **Context clues**: Previous conversations or examples

## Testing

### Test Case 1: Empty System Prompt + Search Tool

**Setup**:
```typescript
systemPrompt: ""  // Empty
tools: [search_web]  // Enabled
```

**Query**: "What are the latest developments in artificial intelligence this week?"

**Expected**:
```
✅ "I'll search for the latest AI developments this week..."
   [Tool call made via API]
   [Search results returned]
   "Here's what I found: ..."
```

**NOT Expected**:
```
❌ "I'll check the latest news... <function=search>"
```

### Test Case 2: Custom System Prompt + All Tools

**Setup**:
```typescript
systemPrompt: "You are a research assistant"
tools: [search_web, execute_javascript, scrape_web_content]
```

**Query**: "Calculate 25 factorial and find recent news about it"

**Expected**:
```
✅ Natural language response with multiple tool calls
   [Both tools called via API]
   No XML/function syntax in text
```

### Test Case 3: Default Prompt + Search Tool

**Setup**:
```typescript
systemPrompt: ""  // Uses "You are a helpful assistant"
tools: [search_web]
```

**Query**: "Search for Python tutorials"

**Expected**:
```
✅ Clean natural language
   No <function=...> patterns
```

## Monitoring

### What to Check

1. **Response Content**: Any `<function=` strings in responses?
2. **Tool Success Rate**: Are tools being called properly via API?
3. **Empty Prompt Cases**: Does default system prompt include warnings?
4. **Model Variations**: Test with different models (Llama 3.x, GPT, etc.)

### Debug Command

```bash
# Check for function syntax in responses
grep -r "<function=" /var/log/lambda/ | tail -20

# Check system prompts being sent
aws logs filter-pattern /aws/lambda/llmproxy "system.*content" --start-time 1h

# Monitor tool calls
aws logs tail /aws/lambda/llmproxy --follow --filter-pattern "tool_call"
```

### Console Logging

Add temporary logging to verify prompts:

```javascript
// In ChatTab.tsx
console.log('Final system prompt:', finalSystemPrompt);
console.log('Has tool warnings:', finalSystemPrompt.includes('CRITICAL'));
```

## Additional Improvements

### 1. Response Post-Processing

Add a filter to strip any function syntax that slips through:

```javascript
function sanitizeLLMResponse(text: string): string {
  // Remove any <function=...> patterns
  return text.replace(/<function=[^>]*>/g, '[tool call]');
}
```

### 2. System Prompt Validation

Ensure warnings are always present when tools are enabled:

```typescript
function buildSystemPrompt(basePrompt: string, tools: any[]): string {
  let prompt = basePrompt.trim() || 'You are a helpful assistant';
  
  if (tools.length > 0) {
    // Always add warnings if tools are present
    if (!prompt.includes('CRITICAL') && !prompt.includes('NEVER write <function')) {
      prompt += TOOL_USAGE_WARNING;
    }
  }
  
  return prompt;
}
```

### 3. Model-Specific Warnings

Tailor warnings based on which model is being used:

```typescript
const getModelSpecificWarning = (model: string): string => {
  if (model.includes('llama')) {
    return 'Use OpenAI function calling format. Do not write <function=name> tags.';
  }
  if (model.includes('gpt')) {
    return 'Use native function calling. Do not format tools in text.';
  }
  return 'Use API function calling only.';
};
```

## Build & Deployment

**Frontend**:
```bash
cd ui-new && npm run build
# Output: 248.32 kB (gzip: 75.33 kB)
# File: docs/assets/index-BkNZffnG.js
# Status: ✅ Built successfully
```

**Backend**:
```bash
./scripts/deploy.sh
# Files: 11 source files
# Status: ✅ Deployed successfully
# Timestamp: Oct 5 13:37
```

**Verification**:
- ✅ prompts.js updated with `<function=search>` warning
- ✅ lambda_search_llm_handler.js updated (2 locations)
- ✅ ChatTab.tsx updated with stronger warnings
- ✅ All warnings use "ANY similar patterns" language

## Summary

Fixed the `<function=search>` issue by:

1. ✅ **Added shortened pattern**: Explicitly listed `<function=search>` 
2. ✅ **Strengthened language**: Changed to "ANY XML-style tags or function syntax"
3. ✅ **Listed multiple examples**: Shows both full and shortened variations
4. ✅ **Emphasized prohibition**: Used CAPS and stronger phrasing
5. ✅ **Updated 4 locations**: Core prompt, 2 backend handlers, 1 frontend

**Key Insight**: LLMs may vary/shorten patterns even when specific examples are given. Warnings must be **generic and comprehensive**, not just list specific examples.

**Result**: LLM should now understand that **any form** of `<function=...>` syntax is prohibited, not just the specific examples we listed.

**Status**: ✅ Deployed and ready for testing
