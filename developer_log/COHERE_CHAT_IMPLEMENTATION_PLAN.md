# Cohere Chat/Completion Implementation Plan

**Date**: October 27, 2025  
**Status**: Planning Phase  
**Current State**: Cohere embeddings ✅ implemented | Cohere chat/completions ❌ not implemented

---

## 1. Current State Analysis

### ✅ Already Implemented
- **Embeddings**: Fully functional in `src/rag/embeddings.js`
  - Endpoint: `https://api.cohere.ai/v1/embed`
  - Models: `embed-english-v3.0`, `embed-multilingual-v3.0`, etc.
  - Request format: `{ texts: [...], model, input_type, truncate }`
  - Response parsing: `data.embeddings[0]`, `data.meta.billed_units.input_tokens`

### ❌ Not Implemented
- **Chat/Completions**: No support in LLM handler
  - Current providers: Groq (free/paid), OpenAI, Gemini
  - Missing: Cohere chat API integration

---

## 2. Cohere Chat API Analysis

### API Endpoint
```
https://api.cohere.ai/v1/chat
```

### Request Format (Cohere-specific)
```json
{
  "message": "User's current message",
  "model": "command-r-plus-08-2024",
  "chat_history": [
    {"role": "USER", "message": "Previous user message"},
    {"role": "CHATBOT", "message": "Previous bot response"}
  ],
  "preamble": "System prompt goes here (optional)",
  "temperature": 0.3,
  "max_tokens": 4096,
  "p": 0.75,
  "k": 0,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "stream": false,
  "tools": [
    {
      "name": "function_name",
      "description": "Function description",
      "parameter_definitions": {
        "param1": {
          "description": "Parameter description",
          "type": "string",
          "required": true
        }
      }
    }
  ],
  "tool_results": [
    {
      "call": {
        "name": "function_name",
        "parameters": {"param1": "value"}
      },
      "outputs": [{"result": "function output"}]
    }
  ]
}
```

### Response Format
```json
{
  "text": "Chatbot response",
  "generation_id": "uuid",
  "chat_history": [
    {"role": "USER", "message": "..."},
    {"role": "CHATBOT", "message": "..."}
  ],
  "finish_reason": "COMPLETE",
  "meta": {
    "api_version": {"version": "1"},
    "billed_units": {
      "input_tokens": 100,
      "output_tokens": 50
    },
    "tokens": {
      "input_tokens": 100,
      "output_tokens": 50
    }
  },
  "tool_calls": [
    {
      "name": "function_name",
      "parameters": {"param1": "value"}
    }
  ]
}
```

### Streaming Response Format
```
event: stream-start
data: {"generation_id": "uuid"}

event: text-generation
data: {"text": "chunk of text"}

event: stream-end
data: {"finish_reason": "COMPLETE", "response": {...}}
```

---

## 3. Key Differences from OpenAI API

### Message Format
| Aspect | OpenAI | Cohere |
|--------|--------|--------|
| Role names | `system`, `user`, `assistant`, `tool` | `USER`, `CHATBOT`, system = `preamble` |
| Message structure | `{role, content}` | `{role, message}` |
| System prompt | First message with `role: "system"` | Separate `preamble` field |
| Chat history | All messages in `messages` array | Separate `chat_history` + current `message` |

### Tool Calling
| Aspect | OpenAI | Cohere |
|--------|--------|--------|
| Tool format | `tools: [{type: "function", function: {...}}]` | `tools: [{name, description, parameter_definitions}]` |
| Tool results | `{role: "tool", content, tool_call_id}` | `tool_results: [{call: {...}, outputs: [...]}]` |
| Parameter schema | JSON Schema format | Cohere-specific format |
| Response | `tool_calls: [{id, type, function}]` | `tool_calls: [{name, parameters}]` - no ID! |

### Parameters
| OpenAI Parameter | Cohere Parameter | Notes |
|------------------|------------------|-------|
| `top_p` | `p` | Same concept, different name |
| `temperature` | `temperature` | ✅ Same |
| `max_tokens` | `max_tokens` | ✅ Same |
| `frequency_penalty` | `frequency_penalty` | ✅ Same |
| `presence_penalty` | `presence_penalty` | ✅ Same |
| N/A | `k` | Cohere-specific (top-k sampling) |

---

## 4. Implementation Architecture

### File Structure
```
src/
├── llm_tools_adapter.js         ← Add Cohere handler here
├── providers.js                 ← Add model detection functions
└── PROVIDER_CATALOG.json        ← Add Cohere models & pricing
```

### Code Changes Required

#### 4.1. Model Detection (`src/providers.js`)
```javascript
// Add detection function
function isCohereModel(model) {
  return model?.startsWith('cohere:') || 
         model?.startsWith('command-') ||
         model?.startsWith('c4ai-');
}

function isKnownCohereModel(model) {
  const cohereModels = [
    'command-r-plus-08-2024',
    'command-r-plus-04-2024',
    'command-r-08-2024',
    'command-r-03-2024',
    'command-r7b-12-2024',
    'command-light',
    'c4ai-aya-expanse-32b',
    'c4ai-aya-expanse-8b'
  ];
  return cohereModels.includes(model);
}
```

#### 4.2. Message Conversion (`src/llm_tools_adapter.js`)
```javascript
function convertToCohereMessages(input) {
  const chatHistory = [];
  let preamble = null;
  let currentMessage = '';
  
  for (const block of input || []) {
    if (block.role === 'system') {
      preamble = block.content;
    } else if (block.type === 'function_call_output') {
      // Tool results handled separately
      continue;
    } else if (block.role === 'user') {
      // Last user message becomes current message
      currentMessage = block.content;
      // Previous messages go to history
      if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role !== 'USER') {
        chatHistory.push({ role: 'USER', message: currentMessage });
      }
    } else if (block.role === 'assistant') {
      chatHistory.push({ role: 'CHATBOT', message: block.content });
    }
  }
  
  return { preamble, chatHistory, currentMessage };
}
```

#### 4.3. Tool Conversion
```javascript
function convertToCohereTools(openAITools) {
  if (!openAITools || openAITools.length === 0) return [];
  
  return openAITools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameter_definitions: convertParameterSchema(tool.function.parameters)
  }));
}

function convertParameterSchema(jsonSchema) {
  const definitions = {};
  const properties = jsonSchema?.properties || {};
  const required = jsonSchema?.required || [];
  
  for (const [key, value] of Object.entries(properties)) {
    definitions[key] = {
      description: value.description || '',
      type: value.type || 'string',
      required: required.includes(key)
    };
  }
  
  return definitions;
}
```

#### 4.4. Tool Results Conversion
```javascript
function extractToolResults(input) {
  const toolResults = [];
  
  for (const block of input || []) {
    if (block.type === 'function_call_output') {
      toolResults.push({
        call: {
          name: block.name || 'unknown',
          parameters: block.parameters || {}
        },
        outputs: [{ result: block.output }]
      });
    }
  }
  
  return toolResults;
}
```

#### 4.5. Main Cohere Handler
```javascript
if (isCohereModel(normalizedModel)) {
  const hostname = 'api.cohere.ai';
  const path = '/v1/chat';
  
  // Convert messages
  const { preamble, chatHistory, currentMessage } = convertToCohereMessages(input);
  
  // Convert tools
  const cohereTools = convertToCohereTools(tools);
  const toolResults = extractToolResults(input);
  
  const payload = {
    message: currentMessage,
    model: normalizedModel.replace(/^cohere:/, ''),
    chat_history: chatHistory,
    temperature,
    max_tokens,
    p: top_p,
    k: 0, // Use p-sampling, not k-sampling
    frequency_penalty,
    presence_penalty,
    stream: false // TODO: Implement streaming later
  };
  
  if (preamble) {
    payload.preamble = preamble;
  }
  
  if (cohereTools.length > 0) {
    payload.tools = cohereTools;
  }
  
  if (toolResults.length > 0) {
    payload.tool_results = toolResults;
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${options?.apiKey}`,
    'X-Client-Name': 'lambdallmproxy'
  };
  
  try {
    const data = await httpsRequestJson({ 
      hostname, 
      path, 
      method: 'POST', 
      headers, 
      bodyObj: payload, 
      timeoutMs: options?.timeoutMs || 30000 
    });
    
    const result = normalizeFromCohere(data);
    result.provider = 'cohere';
    result.model = normalizedModel;
    return result;
  } catch (error) {
    error.provider = 'cohere';
    error.model = normalizedModel;
    error.endpoint = `https://${hostname}${path}`;
    throw error;
  }
}
```

#### 4.6. Response Normalization
```javascript
function normalizeFromCohere(responseWithHeaders) {
  const data = responseWithHeaders?.data || responseWithHeaders;
  const httpHeaders = responseWithHeaders?.headers || {};
  const httpStatus = responseWithHeaders?.status;
  
  const toolCalls = data?.tool_calls || [];
  const output = toolCalls.map((tc, index) => ({
    id: `cohere_${data.generation_id}_${index}`, // Cohere doesn't provide tool call IDs
    call_id: `cohere_${data.generation_id}_${index}`,
    type: 'function_call',
    name: tc.name,
    arguments: JSON.stringify(tc.parameters)
  }));
  
  return {
    output,
    text: data?.text || '',
    rawResponse: data,
    httpHeaders,
    httpStatus,
    tokens: {
      input: data?.meta?.billed_units?.input_tokens || 0,
      output: data?.meta?.billed_units?.output_tokens || 0,
      total: (data?.meta?.billed_units?.input_tokens || 0) + 
             (data?.meta?.billed_units?.output_tokens || 0)
    }
  };
}
```

---

## 5. Pricing Data (PROVIDER_CATALOG.json)

### Models to Add
```json
{
  "cohere": {
    "name": "Cohere",
    "type": "cohere",
    "apiBase": "https://api.cohere.ai/v1",
    "supportsStreaming": true,
    "supportsTools": true,
    "models": {
      "command-r-plus-08-2024": {
        "id": "command-r-plus-08-2024",
        "category": "large",
        "contextWindow": 128000,
        "maxOutput": 4096,
        "pricing": {
          "input": 2.50,
          "output": 10.00,
          "unit": "per_million_tokens"
        },
        "supportsTools": true,
        "supportsVision": false,
        "supportsStreaming": true,
        "available": true,
        "description": "Command R+ (Aug 2024) - Most capable model, 128K context"
      },
      "command-r-08-2024": {
        "id": "command-r-08-2024",
        "category": "medium",
        "contextWindow": 128000,
        "maxOutput": 4096,
        "pricing": {
          "input": 0.15,
          "output": 0.60,
          "unit": "per_million_tokens"
        },
        "supportsTools": true,
        "supportsVision": false,
        "supportsStreaming": true,
        "available": true,
        "description": "Command R (Aug 2024) - Balanced performance, 128K context"
      },
      "command-r7b-12-2024": {
        "id": "command-r7b-12-2024",
        "category": "small",
        "contextWindow": 128000,
        "maxOutput": 4096,
        "pricing": {
          "input": 0.075,
          "output": 0.30,
          "unit": "per_million_tokens"
        },
        "supportsTools": true,
        "supportsVision": false,
        "supportsStreaming": true,
        "available": true,
        "description": "Command R7B - Fastest & cheapest, 128K context"
      },
      "c4ai-aya-expanse-32b": {
        "id": "c4ai-aya-expanse-32b",
        "category": "medium",
        "contextWindow": 128000,
        "maxOutput": 4096,
        "pricing": {
          "input": 0.80,
          "output": 2.40,
          "unit": "per_million_tokens"
        },
        "supportsTools": true,
        "supportsVision": false,
        "supportsStreaming": true,
        "available": true,
        "description": "Aya Expanse 32B - Multilingual model, 23 languages"
      },
      "c4ai-aya-expanse-8b": {
        "id": "c4ai-aya-expanse-8b",
        "category": "small",
        "contextWindow": 8192,
        "maxOutput": 4096,
        "pricing": {
          "input": 0.20,
          "output": 0.40,
          "unit": "per_million_tokens"
        },
        "supportsTools": true,
        "supportsVision": false,
        "supportsStreaming": true,
        "available": true,
        "description": "Aya Expanse 8B - Multilingual, fast, 23 languages"
      }
    }
  }
}
```

**Pricing Source**: https://cohere.com/pricing (as of Oct 2025)

---

## 6. Potential Issues & Solutions

### Issue 1: Tool Call IDs
**Problem**: Cohere doesn't provide unique IDs for tool calls in responses  
**Impact**: Cannot reliably match tool results to original calls in multi-turn conversations  
**Solution**: Generate synthetic IDs using `generation_id + index`
```javascript
id: `cohere_${data.generation_id}_${index}`
```

### Issue 2: Chat History Management
**Problem**: Cohere requires explicit split between `chat_history` and current `message`  
**Impact**: Need to extract last user message from input array  
**Solution**: Build history from all messages except the last user message
```javascript
const lastUserIndex = input.findLastIndex(b => b.role === 'user');
const history = input.slice(0, lastUserIndex);
const currentMessage = input[lastUserIndex].content;
```

### Issue 3: Parameter Schema Conversion
**Problem**: Cohere uses different schema format than OpenAI's JSON Schema  
**Impact**: Tool parameter definitions need conversion  
**Solution**: Map JSON Schema properties to Cohere's `parameter_definitions`
```javascript
// OpenAI: {properties: {name: {type, description}}, required: [...]}
// Cohere: {name: {type, description, required: boolean}}
```

### Issue 4: System Prompt Placement
**Problem**: Cohere uses `preamble` field instead of system message  
**Impact**: Need to extract system message and move to separate field  
**Solution**: Filter out system messages and add as `preamble`

### Issue 5: Streaming Format
**Problem**: Cohere uses Server-Sent Events (SSE) not JSON stream  
**Impact**: Current streaming implementation won't work  
**Solution**: Phase 1 - disable streaming, Phase 2 - implement SSE parser

### Issue 6: Token Counting
**Problem**: Different tokenization than OpenAI/Groq  
**Impact**: Cost calculations may be inaccurate with estimation  
**Solution**: Use `meta.billed_units` from response (actual billed tokens)

### Issue 7: Tool Result Format
**Problem**: Cohere expects `tool_results` array with specific structure  
**Impact**: Need to track tool calls and format results correctly  
**Solution**: Track function call outputs and convert to Cohere format

---

## 7. Testing Strategy

### Phase 1: Basic Chat (No Tools)
```javascript
// Test simple conversation
const input = [
  {role: 'system', content: 'You are a helpful assistant'},
  {role: 'user', content: 'Hello, how are you?'}
];
```

### Phase 2: Multi-turn Chat
```javascript
// Test chat history
const input = [
  {role: 'system', content: 'You are a helpful assistant'},
  {role: 'user', content: 'My name is Alice'},
  {role: 'assistant', content: 'Nice to meet you, Alice!'},
  {role: 'user', content: 'What is my name?'}
];
```

### Phase 3: Tool Calling
```javascript
// Test function calling
const tools = [{
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: {type: 'string', description: 'City name'}
      },
      required: ['location']
    }
  }
}];
```

### Phase 4: Tool Results
```javascript
// Test tool result handling
const input = [
  {role: 'user', content: 'What is the weather in Paris?'},
  {role: 'assistant', tool_calls: [...]},
  {type: 'function_call_output', output: '{"temp": 20, "conditions": "sunny"}'}
];
```

---

## 8. Implementation Checklist

### Code Changes
- [ ] Add `isCohereModel()` to `src/providers.js`
- [ ] Add `isKnownCohereModel()` to `src/providers.js`
- [ ] Add `convertToCohereMessages()` to `src/llm_tools_adapter.js`
- [ ] Add `convertToCohereTools()` to `src/llm_tools_adapter.js`
- [ ] Add `convertParameterSchema()` to `src/llm_tools_adapter.js`
- [ ] Add `extractToolResults()` to `src/llm_tools_adapter.js`
- [ ] Add `normalizeFromCohere()` to `src/llm_tools_adapter.js`
- [ ] Add Cohere handler in `llmResponsesWithTools()`
- [ ] Add Cohere models to `PROVIDER_CATALOG.json`

### Testing
- [ ] Test basic chat (no tools)
- [ ] Test multi-turn conversation
- [ ] Test system prompt (preamble)
- [ ] Test tool calling
- [ ] Test tool results
- [ ] Test error handling
- [ ] Test token counting
- [ ] Test cost calculation

### Documentation
- [ ] Update README with Cohere support
- [ ] Add Cohere to provider list in UI
- [ ] Document Cohere-specific features
- [ ] Add pricing information

---

## 9. Rollout Plan

### Phase 1: Core Implementation (1-2 hours)
1. Add model detection functions
2. Add message/tool conversion functions
3. Add Cohere handler to LLM adapter
4. Add response normalization

### Phase 2: Catalog & Testing (1 hour)
1. Add models to PROVIDER_CATALOG.json
2. Test basic chat functionality
3. Test tool calling
4. Verify token counting

### Phase 3: Streaming Support (Future)
1. Implement SSE parser
2. Handle streaming events
3. Test streaming responses

### Phase 4: Production (30 mins)
1. Deploy to Lambda
2. Monitor for errors
3. Gather usage metrics

---

## 10. Cost Comparison

| Model | Provider | Input ($/M) | Output ($/M) | Notes |
|-------|----------|-------------|--------------|-------|
| command-r7b-12-2024 | Cohere | $0.075 | $0.30 | **Cheapest Cohere** |
| llama-3.1-8b-instant | Groq | $0.00 | $0.00 | **FREE** |
| text-embedding-3-small | OpenAI | $0.02 | - | Embeddings |
| command-r-08-2024 | Cohere | $0.15 | $0.60 | Mid-tier |
| gpt-4o-mini | OpenAI | $0.15 | $0.60 | Similar pricing |
| command-r-plus-08-2024 | Cohere | $2.50 | $10.00 | Premium |

**Recommendation**: For users who want Cohere, `command-r7b-12-2024` offers best value, but Groq remains the free option.

---

## 11. API Compatibility Matrix

| Feature | OpenAI | Groq | Gemini | Cohere |
|---------|--------|------|--------|--------|
| Streaming | ✅ | ✅ | ✅ | ✅ |
| Tool calling | ✅ | ✅ | ✅ | ✅ |
| Vision | ✅ | ❌ | ✅ | ❌ |
| JSON mode | ✅ | ✅ | ✅ | ❌ |
| System prompt | Message | Message | Field | Field |
| Tool call IDs | ✅ | ✅ | ✅ | ❌ |
| Batch API | ✅ | ❌ | ❌ | ❌ |

---

## 12. Success Criteria

### Must Have
- ✅ Basic chat conversations work
- ✅ Multi-turn conversations work
- ✅ System prompts work (preamble)
- ✅ Tool calling works
- ✅ Token counting is accurate
- ✅ Cost calculation is correct
- ✅ Error handling is robust

### Nice to Have
- 🔄 Streaming responses (Phase 3)
- 🔄 Auto-retry on rate limits
- 🔄 Response caching
- 🔄 Batch processing

### Known Limitations
- ⚠️ No tool call IDs (synthetic IDs used)
- ⚠️ No vision support
- ⚠️ No JSON mode
- ⚠️ SSE streaming (different from current impl)

---

**Ready to implement when approved!** 🚀
