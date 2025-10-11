# LLM Event Emissions - Complete Audit

**Date**: 2025-10-08  
**Status**: ✅ All LLM calls now emit llm_request/llm_response events

## Overview

This document tracks all calls to `llmResponsesWithTools()` and confirms that each one emits `llm_request` and `llm_response` SSE events for transparency.

## Main Handler LLM Calls

### 1. Planning Phase
**File**: `src/lambda_search_llm_handler.js`  
**Lines**: 127-177  
**Phase**: `planning`  
**Purpose**: Analyzes query to determine research strategy and optimal persona  
**Events**: ✅ YES
- llm_request (line 140)
- llm_response (line 166)

**Test Event**: Also emits `search_progress` with phase='test' (line 131) to verify stream works

### 2. Tool Iteration  
**File**: `src/lambda_search_llm_handler.js`  
**Lines**: 254-287  
**Phase**: `tool_iteration`  
**Purpose**: Processes tool calls and generates responses  
**Events**: ✅ YES
- llm_request (line 261)
- llm_response (line 278)

**Iterations**: Can occur multiple times (up to MAX_TOOL_ITERATIONS=8)

### 3. Final Synthesis
**File**: `src/lambda_search_llm_handler.js`  
**Lines**: 692-711  
**Phase**: `final_synthesis`  
**Purpose**: Generates comprehensive final answer from all gathered information  
**Events**: ✅ YES
- llm_request (line 692)
- llm_response (line 704)

## Search Tool LLM Calls (tools.js)

### 4. Direct Synthesis (Low-TPM Mode)
**File**: `src/tools.js`  
**Lines**: 449-493  
**Phase**: `direct_synthesis`  
**Purpose**: Ultra-compact synthesis for low-TPM models (llama-4-scout, llama-4-maverick)  
**Events**: ✅ YES (ADDED 2025-10-08)
- llm_request (line 463)
- llm_response (line 473)

**When Used**: Only for models with <64k TPM limit

### 5. Page Summary (Standard Mode)
**File**: `src/tools.js`  
**Lines**: 524-560  
**Phase**: `page_summary`  
**Purpose**: Summarizes individual web pages from search results  
**Events**: ✅ YES
- llm_request (line 535)
- llm_response (line 553)

**Iterations**: Once per page (up to MAX_PAGES_TO_SUMMARIZE=5)  
**UI Display**: Excluded from LlmApiTransparency component (internal processing)

### 6. Synthesis Summary (Standard Mode)
**File**: `src/tools.js`  
**Lines**: 610-645  
**Phase**: `synthesis_summary`  
**Purpose**: Combines multiple page summaries into one comprehensive summary  
**Events**: ✅ YES
- llm_request (line 621)
- llm_response (line 638)

**UI Display**: Excluded from LlmApiTransparency component (internal processing)

### 7. Description Summary (No Content Loaded)
**File**: `src/tools.js`  
**Lines**: 662-693  
**Phase**: `description_summary`  
**Purpose**: Generates summary from search result titles/descriptions when content isn't loaded  
**Events**: ✅ YES
- llm_request (line 674)
- llm_response (line 687)

**UI Display**: Currently NOT excluded (will appear in transparency UI)

## Event Flow Example

For a typical search query, the LLM event sequence would be:

```
1. event: llm_request    (phase: planning)
2. event: llm_response   (phase: planning)
3. event: llm_request    (phase: tool_iteration, iteration: 1)
4. event: llm_response   (phase: tool_iteration, iteration: 1)
   
   [If search_web tool is called]
   5a. event: llm_request   (phase: page_summary, page_index: 0)  [IF STANDARD MODE]
   5b. event: llm_response  (phase: page_summary, page_index: 0)
   5c. event: llm_request   (phase: page_summary, page_index: 1)
   5d. event: llm_response  (phase: page_summary, page_index: 1)
   ... (repeat for each page)
   5e. event: llm_request   (phase: synthesis_summary)
   5f. event: llm_response  (phase: synthesis_summary)
   
   OR [IF LOW-TPM MODE]
   5x. event: llm_request   (phase: direct_synthesis)
   5y. event: llm_response  (phase: direct_synthesis)

6. event: llm_request    (phase: tool_iteration, iteration: 2)  [IF MORE TOOLS NEEDED]
7. event: llm_response   (phase: tool_iteration, iteration: 2)

8. event: llm_request    (phase: final_synthesis)
9. event: llm_response   (phase: final_synthesis)
```

## Frontend Display

### LlmApiTransparency Component
**File**: `ui-new/src/components/ChatTab.tsx`  
**Lines**: 926-943

**Included Phases** (shown in UI):
- ✅ `planning`
- ✅ `tool_iteration`
- ✅ `final_synthesis`
- ✅ `direct_synthesis`
- ✅ `description_summary`

**Excluded Phases** (internal processing, not shown):
- ❌ `page_summary` (internal content processing)
- ❌ `synthesis_summary` (internal content processing)

### Console Logging
All llm_request/llm_response events are logged to console:
- `🔵 LLM API Request:` (line 927)
- `🟢 LLM API Response:` (line 936)

## Verification Checklist

To verify LLM events are working:

### Backend (Lambda Logs)
```bash
aws logs tail /aws/lambda/llmproxy --follow | grep -E "llm_request|llm_response|writeEvent"
```

Look for:
- ✅ `✅ llm_request event emitted for planning phase`
- ✅ `✅ llm_response event emitted for planning phase`
- ✅ Console logs showing stream.writeEvent calls

### Frontend (Browser)

**Network Tab**:
1. Open DevTools → Network
2. Find the streaming request to Lambda
3. Click on it and view "EventStream" or "Response"
4. Look for:
```
event: llm_request
data: {"phase":"planning","model":"...","request":{...}}

event: llm_response
data: {"phase":"planning","response":{...}}
```

**Console**:
Look for:
- `🔵 LLM API Request: {phase: "planning", ...}`
- `🟢 LLM API Response: {phase: "planning", ...}`

**UI**:
- After assistant response, should see expandable "🔍 LLM API Calls" section
- Click to expand and see details of planning, tool_iteration, final_synthesis calls

## Debug Mode

The following debug statements are currently active:

### Handler (lambda_search_llm_handler.js)
- Line 875: `🔧 HANDLER: About to call runToolLoop`
- Line 876: `🔧 HANDLER: writeEvent function exists`
- Line 877: `🔧 HANDLER: streamObject.writeEvent`

### runToolLoop (lambda_search_llm_handler.js)
- Line 59: `🔧 STREAM CHECK - stream exists`
- Line 64: `✅ TEST: Successfully emitted debug event`
- Line 131: TEST search_progress event with phase='test'
- Line 138: `🔧 About to emit llm_request event`
- Line 148: `✅ llm_request event emitted for planning phase`
- Line 167: `✅ llm_response event emitted for planning phase`

### Tools (tools.js)
- Line 223: `🔧 TOOLS: callFunction('${name}')` 
- Line 227: `🔧 TOOLS: search_web starting - writeEvent`

## Known Issues

### Issue: Events not visible in network tab
**Status**: Under investigation  
**Symptoms**: Frontend handlers exist, backend emits events, but not visible in browser  
**Debug Steps**:
1. Check if test search_progress event appears (line 131)
2. Check browser console for 🔵/🟢 logs
3. Verify browser hard refresh (Ctrl+Shift+R) loaded latest build
4. Check Lambda logs for "✅ event emitted" messages

### Issue: Frontend filters some phases
**Status**: By design  
**Reason**: page_summary and synthesis_summary are internal content processing  
**Solution**: If you want to see ALL LLM calls, modify line 928 in ChatTab.tsx:
```tsx
// Remove the filter to show all phases
if (true) {  // was: if (data.phase !== 'page_summary' && ...)
```

## Summary

✅ **All 7 LLM call sites now emit llm_request/llm_response events**
✅ **Events include full request body and response**
✅ **Frontend has handlers to display events**
✅ **Debug logging added to trace event flow**
✅ **Test event added to verify stream works**

Next step: Test a query and verify events appear in:
1. Lambda CloudWatch logs
2. Browser network tab (raw SSE events)
3. Browser console (parsed events with 🔵/🟢)
4. UI (LlmApiTransparency component)
