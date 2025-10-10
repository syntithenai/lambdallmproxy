# Event Flow Analysis - Lambda to UI

## Backend Event Emission (chat.js)

### Loop Structure
The chat endpoint runs in a loop (`while (iterationCount < maxToolIterations)`):

1. **First Iteration (iteration 1)**:
   - `llm_request` event (line 621) - **ONLY SENT ONCE**
   - `delta` events during streaming (line 674)
   - `llm_response` event (line 766)
   - `message_complete` event (line 800) if tool_calls present
   - Tool execution: `tool_call_start`, `tool_call_result` per tool

2. **Subsequent Iterations (iteration 2+)**:
   - **NO llm_request event**
   - `delta` events during streaming
   - `llm_response` event
   - `message_complete` event if tool_calls present
   - Tool execution events

### Key Event Structures

#### llm_request (line 621) - **Only sent in iteration 1**
```javascript
{
  phase: 'chat_iteration',
  iteration: iterationCount,
  provider,  // ✅ Top-level
  model,     // ✅ Top-level
  request: requestBody,
  timestamp
}
```

#### llm_response (line 766) - **Sent in ALL iterations**
```javascript
{
  phase: 'chat_iteration',
  iteration: iterationCount,
  provider,  // ✅ Top-level
  model,     // ✅ Top-level
  response: { content, tool_calls, usage },
  httpHeaders,
  httpStatus,
  llmApiCall: { /* nested structure */ },
  timestamp
}
```

#### message_complete (line 800) - **Sent in ALL iterations**
```javascript
{
  role: 'assistant',
  content: assistantMessage.content,
  tool_calls: validToolCalls,
  llmApiCalls: allLlmApiCalls  // ❌ NESTED structure
}
```

### LlmApiCall Structure from Backend (line 720)
```javascript
{
  request: {
    model,      // ❌ NESTED, not top-level
    provider,   // ❌ NESTED, not top-level
    messages,
    temperature,
    max_tokens
  },
  response: {
    content,
    tool_calls,
    finish_reason,
    usage
  },
  timestamp
}
```

## Frontend Event Handling (ChatTab.tsx)

### Message Creation Flow

#### llm_request handler (line 1330)
- **Only fires for iteration 1** (backend doesn't send it for iteration 2+)
- Creates placeholder assistant message OR attaches to existing
- Adds llmApiCall with structure:
```typescript
{
  phase,
  provider,  // ✅ Top-level
  model,     // ✅ Top-level
  request,
  timestamp
}
```

#### delta handler (line 930)
- Updates existing streaming assistant OR creates new one
- **Creates NEW assistant message if tool message exists** (line 970)
- Only handles content, no llmApiCalls

#### llm_response handler (line 1386)
- Tries to update existing llmApiCall
- **My recent fix**: Creates new llmApiCall if none exists
- Creates structure:
```typescript
{
  phase,
  provider,  // ✅ Top-level (from event)
  model,     // ✅ Top-level (from event)
  request,
  response,
  httpHeaders,
  httpStatus,
  timestamp
}
```

#### message_complete handler (line 1186)
- **Overwrites llmApiCalls with data.llmApiCalls** (line 1202)
- Creates new assistant if tool messages exist (line 1235)
- Problem: `data.llmApiCalls` has **NESTED provider/model** structure!

## Root Causes

### Problem 1: Missing Provider/Model in Iteration 2+

**Root Cause**: Structural mismatch between backend and frontend

1. Backend sends `llmApiCalls` in `message_complete` with structure:
   ```javascript
   { request: { provider, model }, response: {...} }
   ```

2. Frontend UI expects:
   ```typescript
   { provider, model, request: {...}, response: {...} }
   ```

3. The `message_complete` handler **OVERWRITES** llmApiCalls (line 1202):
   ```typescript
   llmApiCalls: data.llmApiCalls || newMessages[i].llmApiCalls
   ```

4. For iteration 1:
   - `llm_request` handler creates llmApiCall with top-level provider/model
   - `llm_response` handler updates it
   - `message_complete` overwrites with nested structure
   - **Works because UI reads from first structure before overwrite completes**

5. For iteration 2+:
   - NO `llm_request` handler (event not sent)
   - `llm_response` handler creates llmApiCall with top-level provider/model
   - `message_complete` **IMMEDIATELY OVERWRITES** with nested structure
   - UI gets nested structure with provider/model buried inside

### Problem 2: Duplicate Grey Boxes

**Root Cause**: Multiple message creation points for same iteration

1. **First creation**: `delta` handler (line 970)
   - Sees tool message exists
   - Creates NEW streaming assistant message
   - Message has partial/no content, no llmApiCalls yet

2. **Second creation**: `message_complete` handler (line 1235)
   - Checks if tool message exists after last assistant
   - Creates ANOTHER assistant message
   - Has full content, tool_calls, llmApiCalls

3. Result: Two assistant messages for same LLM response
   - First: Grey box, minimal content
   - Second: Full response with tool calls

## Solution Design

### Goals
1. One response block per LLM call
2. Each block shows LLM transparency info (provider, model, usage)
3. Tool use blocks appended to the response that triggered them
4. No duplicate boxes
5. Compact, transparent display

### Approach

#### Option A: Fix Backend Structure (RECOMMENDED)
Modify backend to send top-level provider/model in llmApiCalls

**Pros**:
- Consistent structure across all events
- Simpler frontend logic
- Fixes root cause

**Cons**:
- Backend change required
- Need to update all llmApiCall creation

#### Option B: Transform in Frontend
Add transformation logic in message_complete handler

**Pros**:
- No backend changes
- Quick fix

**Cons**:
- Frontend workaround for backend structure
- More complex frontend code
- Doesn't fix root cause

#### Option C: Hybrid
1. Fix backend structure
2. Remove duplicate message creation
3. Ensure llm_response creates complete llmApiCall for iteration 2+

### Recommended Solution

**Phase 1: Fix Backend Structure**
1. Modify llmApiCall creation (chat.js line 720) to have top-level provider/model:
```javascript
const llmApiCall = {
  provider: provider,  // Move to top level
  model: model,        // Move to top level
  phase: 'chat_iteration',
  request: {
    messages: cleanMessages.length,
    temperature,
    max_tokens
  },
  response: {
    content: assistantMessage.content,
    tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
    finish_reason: finishReason,
    usage: finalUsage
  },
  timestamp: new Date().toISOString()
}
```

**Phase 2: Fix Duplicate Message Creation**
1. Remove message creation from `delta` handler for iteration 2+
2. Let `message_complete` be sole creator for new iterations
3. OR: Remove message creation from `message_complete` if streaming message exists

**Phase 3: Simplify llm_response Handler**
1. Remove my recent "create new llmApiCall" logic
2. Let `message_complete` handle llmApiCalls completely
3. llm_response just updates existing if needed

## Variables Used for Event Collation

### Backend (chat.js)
- `iterationCount` - Current iteration number
- `allLlmApiCalls` - Accumulates llmApiCalls across iterations
- `currentMessages` - All messages in current chat session
- `assistantMessage` - Current LLM response being built
- `currentToolCalls` - Tool calls in current response

### Frontend (ChatTab.tsx)
- `messages` - All chat messages (user, assistant, tool)
- `currentStreamingBlockIndex` - Index of actively streaming message
- `streamingContent` - Accumulated streaming content
- `toolStatus` - Status of tool executions
- `expandedToolMessages` - Which tool sections are expanded

### Key State Management
- Assistant messages identified by `role === 'assistant'`
- Tool messages identified by `role === 'tool'`
- Streaming state tracked via `isStreaming` boolean
- Tool execution detected by presence of tool messages
- llmApiCalls attached to assistant messages via `llmApiCalls` array
