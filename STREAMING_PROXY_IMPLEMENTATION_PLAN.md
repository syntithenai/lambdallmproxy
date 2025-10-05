# Streaming Proxy with Tool Execution - Implementation Plan

## Executive Summary

This document outlines the plan to refactor the Lambda proxy architecture to support OpenAI-compatible streaming responses with integrated tool execution. The refactoring separates concerns between static content delivery and streaming API proxying.

## Current Architecture

### Single Lambda Function (`src/index.js`)
- **Routing**: All requests handled by one Lambda with `awslambda.streamifyResponse()`
- **Endpoints**:
  - `POST /planning` → Streaming SSE (planning.js)
  - `POST /search` → Streaming SSE (search.js)
  - `POST /proxy` → **Non-streaming buffered** (proxy.js)
  - `GET /*` → Static files (static.js)

### Problems
1. **Proxy endpoint is non-streaming**: Returns buffered JSON responses only
2. **No tool execution**: Tools defined in `tools.js` but not integrated into proxy
3. **No OpenAI tool calling flow**: Doesn't handle `tool_calls` or tool result injection
4. **Mixed concerns**: Static file serving uses streaming infrastructure unnecessarily

## Proposed Architecture

### Two Lambda Functions

#### Lambda 1: `llmproxy-static` (NEW)
- **Purpose**: Serve static content and non-streaming proxy requests
- **Endpoints**:
  - `GET /*` → Static files from docs/
  - `POST /proxy/buffered` → Non-streaming proxy (legacy support)
- **Response Type**: Standard buffered Lambda responses
- **No streaming infrastructure needed**

#### Lambda 2: `llmproxy` (REFACTORED)
- **Purpose**: Streaming SSE endpoints with tool execution
- **Endpoints**:
  - `POST /planning` → Planning with streaming
  - `POST /search` → Search with streaming
  - `POST /chat` → **NEW** OpenAI-compatible streaming with tools
- **Response Type**: SSE via `awslambda.streamifyResponse()`
- **Tool Integration**: Full OpenAI tool calling flow

## OpenAI Tool Calling Flow

### Standard Flow (No Tools)
```
Client → Lambda → LLM API → Stream chunks → SSE events → Client
```

### Tool Calling Flow
```
Client → Lambda → LLM API (with tools) → tool_calls detected
  ↓
  Execute tools via tools.js
  ↓
  Inject tool results into messages
  ↓
  Resubmit to LLM API
  ↓
  Stream final response → SSE events → Client
```

### SSE Events for Tool Calling

```javascript
// When tool call is detected
event: tool_call_start
data: {"name": "search_web", "id": "call_abc123", "arguments": "{\"query\":\"...\"}"} 

// During tool execution
event: tool_call_progress
data: {"name": "search_web", "id": "call_abc123", "status": "executing"}

// When tool completes
event: tool_call_result
data: {"name": "search_web", "id": "call_abc123", "result": "..."}

// Streaming text chunks
event: delta
data: {"content": "Based on the search results..."}

// Final message
event: message_complete
data: {"role": "assistant", "content": "Full response text"}

// Errors
event: error
data: {"error": "Tool execution failed", "code": "TOOL_ERROR"}
```

## Implementation Phases

### Phase 1: Create Static Lambda Function

**Files to Create:**
- `src/static-index.js` - New entry point for static Lambda
- `scripts/deploy-static.sh` - Deployment script for static Lambda

**Changes:**
- Copy `src/endpoints/static.js` and `src/endpoints/proxy.js` (buffered version)
- Create simple router for GET/POST /proxy/buffered
- No streaming infrastructure needed
- Standard Lambda handler (not streamifyResponse)

**Deployment:**
```bash
aws lambda create-function \
  --function-name llmproxy-static \
  --runtime nodejs20.x \
  --handler index.handler \
  --role <ROLE_ARN> \
  --timeout 30
```

### Phase 2: Refactor Streaming Lambda

**Files to Modify:**
- `src/index.js` - Remove static file handling
- Remove proxy.js from streaming Lambda

**New routing:**
```javascript
if (method === 'POST' && path === '/planning') { ... }
if (method === 'POST' && path === '/search') { ... }
if (method === 'POST' && path === '/chat') { // NEW
  await chatEndpoint.handler(event, responseStream);
}
```

### Phase 3: Create Streaming Chat Endpoint

**File to Create:** `src/endpoints/chat.js`

**Key Components:**

#### 1. SSE Writer Utility
```javascript
class SSEWriter {
  constructor(responseStream) {
    this.stream = responseStream;
  }
  
  writeEvent(eventType, data) {
    this.stream.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  
  writeError(error) {
    this.writeEvent('error', { error: error.message, code: 'ERROR' });
  }
  
  end() {
    this.stream.end();
  }
}
```

#### 2. OpenAI Stream Parser
```javascript
async function* parseOpenAIStream(response) {
  // Parse Server-Sent Events from OpenAI/Groq
  for await (const chunk of response) {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6);
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data);
        } catch (e) {
          console.error('Failed to parse SSE chunk:', e);
        }
      }
    }
  }
}
```

#### 3. Tool Execution Handler
```javascript
const { callFunction } = require('../tools');

async function executeToolCalls(toolCalls, context) {
  const results = [];
  
  for (const toolCall of toolCalls) {
    const { id, function: { name, arguments: args } } = toolCall;
    
    try {
      // Parse arguments
      const parsedArgs = JSON.parse(args);
      
      // Execute tool
      const result = await callFunction(name, parsedArgs, context);
      
      results.push({
        tool_call_id: id,
        role: 'tool',
        name: name,
        content: JSON.stringify(result)
      });
      
    } catch (error) {
      results.push({
        tool_call_id: id,
        role: 'tool',
        name: name,
        content: JSON.stringify({ error: error.message })
      });
    }
  }
  
  return results;
}
```

#### 4. Main Handler Logic
```javascript
async function handler(event, responseStream) {
  const sseWriter = new SSEWriter(responseStream);
  
  try {
    // Parse request
    const body = JSON.parse(event.body);
    const { messages, model, tools, temperature, max_tokens } = body;
    
    // Verify auth
    const user = await verifyAuthToken(event.headers);
    if (!user) {
      sseWriter.writeError(new Error('Authentication required'));
      sseWriter.end();
      return;
    }
    
    // Build context for tools
    const toolContext = {
      user: user.email,
      timestamp: new Date().toISOString()
    };
    
    let currentMessages = [...messages];
    let toolCallsDetected = false;
    
    do {
      toolCallsDetected = false;
      
      // Make request to LLM
      const response = await makeStreamingRequest({
        messages: currentMessages,
        model,
        tools,
        temperature,
        max_tokens,
        stream: true
      });
      
      // Parse streaming response
      let currentToolCalls = [];
      let assistantMessage = { role: 'assistant', content: '' };
      
      for await (const chunk of parseOpenAIStream(response)) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta?.content) {
          // Stream text content
          assistantMessage.content += delta.content;
          sseWriter.writeEvent('delta', { content: delta.content });
        }
        
        if (delta?.tool_calls) {
          // Accumulate tool calls
          toolCallsDetected = true;
          for (const tc of delta.tool_calls) {
            if (!currentToolCalls[tc.index]) {
              currentToolCalls[tc.index] = {
                id: tc.id,
                type: 'function',
                function: { name: '', arguments: '' }
              };
            }
            if (tc.function?.name) {
              currentToolCalls[tc.index].function.name = tc.function.name;
            }
            if (tc.function?.arguments) {
              currentToolCalls[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }
      }
      
      // If tool calls detected, execute them
      if (toolCallsDetected && currentToolCalls.length > 0) {
        assistantMessage.tool_calls = currentToolCalls;
        currentMessages.push(assistantMessage);
        
        // Notify client about tool calls
        for (const tc of currentToolCalls) {
          sseWriter.writeEvent('tool_call_start', {
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments
          });
        }
        
        // Execute tools
        const toolResults = await executeToolCalls(currentToolCalls, toolContext);
        
        // Notify client about results
        for (const result of toolResults) {
          sseWriter.writeEvent('tool_call_result', {
            id: result.tool_call_id,
            name: result.name,
            content: result.content
          });
        }
        
        // Add tool results to messages
        currentMessages.push(...toolResults);
        
      } else {
        // No more tool calls, send final message
        currentMessages.push(assistantMessage);
        sseWriter.writeEvent('message_complete', assistantMessage);
      }
      
    } while (toolCallsDetected);
    
    // Send complete event
    sseWriter.writeEvent('complete', {
      status: 'success',
      messages: currentMessages
    });
    sseWriter.end();
    
  } catch (error) {
    console.error('Chat endpoint error:', error);
    sseWriter.writeError(error);
    sseWriter.end();
  }
}
```

### Phase 4: Update Deployment Scripts

**Modify `scripts/deploy.sh`:**
```bash
# Deploy streaming Lambda (existing)
deploy_streaming_lambda() {
  FUNCTION_NAME="llmproxy"
  # ... existing deploy logic
}

# Deploy static Lambda (new)
deploy_static_lambda() {
  FUNCTION_NAME="llmproxy-static"
  # ... deploy logic for static function
}

# Main execution
deploy_streaming_lambda
deploy_static_lambda
```

**Environment Variables:**
Both Lambdas need:
- `GROQ_API_KEY`
- `OPENAI_API_KEY`
- `ALLOWED_EMAILS`
- `GOOGLE_CLIENT_ID`

### Phase 5: Update UI for OpenAI Format

**File: `ui-new/src/components/ChatTab.tsx`**

#### Message Format Changes
```typescript
// Old format (custom)
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// New format (OpenAI-compatible)
interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
```

#### SSE Event Handling
```typescript
const eventSource = new EventSource(apiUrl);

eventSource.addEventListener('delta', (event) => {
  const data = JSON.parse(event.data);
  // Append to current message in real-time
  setMessages(prev => {
    const last = prev[prev.length - 1];
    if (last.role === 'assistant') {
      return [...prev.slice(0, -1), {
        ...last,
        content: last.content + data.content
      }];
    }
    return prev;
  });
});

eventSource.addEventListener('tool_call_start', (event) => {
  const data = JSON.parse(event.data);
  showToast(`Executing tool: ${data.name}`, 'info');
  setToolStatus(prev => [...prev, {
    id: data.id,
    name: data.name,
    status: 'executing'
  }]);
});

eventSource.addEventListener('tool_call_result', (event) => {
  const data = JSON.parse(event.data);
  setToolStatus(prev => prev.map(t => 
    t.id === data.id 
      ? { ...t, status: 'complete', result: data.content }
      : t
  ));
});

eventSource.addEventListener('message_complete', (event) => {
  const data = JSON.parse(event.data);
  // Update with final message
  setMessages(prev => [...prev, data]);
});

eventSource.addEventListener('error', (event) => {
  const data = JSON.parse(event.data);
  showToast(data.error, 'error');
});
```

#### Tool Status Display
```typescript
<div className="tool-status">
  {toolStatus.map(tool => (
    <div key={tool.id} className="tool-execution">
      <span className="tool-name">{tool.name}</span>
      <span className={`status ${tool.status}`}>
        {tool.status === 'executing' && '⏳ Running...'}
        {tool.status === 'complete' && '✓ Complete'}
      </span>
    </div>
  ))}
</div>
```

### Phase 6: Update API Client

**File: `ui-new/src/utils/api.ts`**

```typescript
export async function sendChatMessage(
  messages: Message[],
  settings: ChatSettings,
  tools: Tool[],
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`
    },
    body: JSON.stringify({
      messages,
      model: settings.model,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      tools: tools.length > 0 ? tools : undefined,
      stream: true
    }),
    signal
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  // Parse SSE stream
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        const eventType = line.substring(7);
        continue;
      }
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.substring(6));
        onEvent({ type: eventType, data });
      }
    }
  }
}
```

## Testing Strategy

### Unit Tests
- `tests/unit/chat-endpoint.test.js` - Chat endpoint logic
- `tests/unit/sse-writer.test.js` - SSE writer utility
- `tests/unit/tool-execution.test.js` - Tool execution flow

### Integration Tests
- `tests/integration/streaming-chat.test.js` - Full streaming flow
- `tests/integration/tool-calling.test.js` - Tool calling flow
- `tests/integration/two-lambda-routing.test.js` - Routing between Lambdas

### Manual Testing Checklist
- [ ] Static files served from static Lambda
- [ ] Chat endpoint streams responses correctly
- [ ] Tool calls are detected and executed
- [ ] Tool results are injected back into conversation
- [ ] UI updates in real-time during streaming
- [ ] Tool status displays correctly
- [ ] Error handling works (tool failures, timeouts)
- [ ] Authentication works for both Lambdas
- [ ] CORS headers set correctly

## Migration Steps

### Step 1: Create Static Lambda (No Breaking Changes)
1. Create `src/static-index.js`
2. Deploy as new function `llmproxy-static`
3. Test static file serving
4. Update DNS/routing to point to new static Lambda for GET requests

### Step 2: Add Chat Endpoint (Additive Change)
1. Create `src/endpoints/chat.js`
2. Add routing in `src/index.js`
3. Deploy streaming Lambda
4. Test with Postman/curl before UI changes

### Step 3: Update UI (Can be done in parallel)
1. Update message format to OpenAI-compatible
2. Add SSE event handlers
3. Add tool status display
4. Test with new chat endpoint

### Step 4: Remove Old Proxy (Breaking Change)
1. Remove `src/endpoints/proxy.js` from streaming Lambda
2. Update docs to point clients to `/chat` instead of `/proxy`
3. Deprecation notice for `/proxy` endpoint

## Rollback Plan

### If Static Lambda Fails
- Routing still works via old Lambda
- No impact on existing functionality

### If Chat Endpoint Fails
- Old `/proxy` endpoint still available
- UI can fallback to buffered responses

### If UI Changes Break
- Previous UI version still in git
- Can quickly revert and redeploy docs

## Timeline Estimate

- **Phase 1** (Static Lambda): 2-3 hours
- **Phase 2** (Refactor routing): 1 hour
- **Phase 3** (Chat endpoint): 6-8 hours
- **Phase 4** (Deployment scripts): 2 hours
- **Phase 5** (UI updates): 4-6 hours
- **Phase 6** (API client): 2 hours
- **Testing**: 4-6 hours
- **Documentation**: 2 hours

**Total: 23-30 hours** (3-4 working days)

## Success Criteria

1. ✅ Two Lambda functions deployed and accessible
2. ✅ Static content served from static Lambda
3. ✅ Chat endpoint streams responses via SSE
4. ✅ Tool calls detected and executed automatically
5. ✅ Tool results injected back into conversation
6. ✅ UI displays streaming responses in real-time
7. ✅ Tool execution status visible in UI
8. ✅ All existing endpoints (planning, search) still work
9. ✅ Authentication works for all endpoints
10. ✅ Error handling graceful across all scenarios

## Open Questions

1. **Should we support non-streaming mode for chat?**
   - Recommendation: Yes, add `stream: false` support for compatibility

2. **How to handle tool execution timeouts?**
   - Recommendation: 30-second timeout per tool, send error event to client

3. **Should tool results be truncated?**
   - Recommendation: Yes, use existing truncation logic from tools.js

4. **Do we need rate limiting for tool execution?**
   - Recommendation: Yes, max 5 tool calls per conversation turn

5. **Should we log tool executions?**
   - Recommendation: Yes, log to CloudWatch for monitoring and debugging

## Next Steps

1. **Review this plan** with stakeholders
2. **Create feature branch**: `feature/streaming-chat-with-tools`
3. **Start with Phase 1**: Static Lambda (lowest risk)
4. **Iterate and test** each phase before moving to next
5. **Deploy to staging** before production
6. **Update documentation** as we go

---

**Document Status**: Draft for Review  
**Author**: GitHub Copilot  
**Date**: October 5, 2025  
**Version**: 1.0
