# Structured Output Implementation Plan

**Date**: 2025-11-02  
**Status**: 🚧 Planning

## Problem Statement

Current Issues:
1. **JSON Parsing Errors**: Quiz and feed generation fails to parse JSON responses
2. **No Incremental Generation**: Feed items appear all at once instead of one-by-one
3. **Inconsistent Formats**: Different models output JSON differently (markdown blocks, trailing commas, etc.)
4. **No Structured Output**: Relying on prompt engineering alone without using provider-specific features

## Solution Overview

Implement a **multi-layered approach** to structured output that works across all providers:

### Layer 1: Tool-Based Structured Output (Preferred)
- Define tools that represent the output structure
- Force model to make tool calls with structured data
- Works with: OpenAI, Groq, Anthropic (Claude), Together, Cohere

### Layer 2: JSON Mode (Fallback)
- Use `response_format: { type: "json_object" }` parameter
- Forces valid JSON output (no markdown, no extra text)
- Works with: OpenAI, Groq, some Together models

### Layer 3: Robust JSON Parsing (Last Resort)
- Strip markdown code fences
- Remove trailing commas
- Handle partial JSON
- Extract JSON from text

### Layer 4: Incremental Streaming
- For feed generation: emit one tool call per item
- For quiz generation: stream tool call arguments incrementally
- Parse partial JSON as it arrives

## Implementation

### 1. Tool Definitions

#### Feed Item Tool
```javascript
const feedItemTool = {
  type: "function",
  function: {
    name: "generate_feed_item",
    description: "Generate a single educational feed item with expanded content",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["did-you-know", "question-answer"],
          description: "Type of feed item"
        },
        title: {
          type: "string",
          description: "Brief headline (max 80 chars)",
          maxLength: 80
        },
        content: {
          type: "string",
          description: "Engaging 2-3 sentence summary for preview"
        },
        expandedContent: {
          type: "string",
          description: "4-6 paragraphs with AT LEAST 4 fascinating facts"
        },
        mnemonic: {
          type: "string",
          description: "Creative memory aid - acronym, rhyme, or surprising connection"
        },
        topics: {
          type: "array",
          items: { type: "string" },
          description: "Array of relevant topics (3-5 items)"
        },
        imageSearchTerms: {
          type: "string",
          description: "Specific search query for finding relevant images"
        }
      },
      required: ["type", "title", "content", "expandedContent", "mnemonic", "topics", "imageSearchTerms"]
    }
  }
};
```

#### Quiz Tool
```javascript
const quizTool = {
  type: "function",
  function: {
    name: "generate_quiz",
    description: "Generate a complete 10-question multiple-choice quiz",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Question ID (q1, q2, etc.)"
              },
              prompt: {
                type: "string",
                description: "The question text"
              },
              choices: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Choice ID (a, b, c, d)" },
                    text: { type: "string", description: "Choice text" }
                  },
                  required: ["id", "text"]
                },
                minItems: 4,
                maxItems: 4
              },
              correctChoiceId: {
                type: "string",
                enum: ["a", "b", "c", "d"],
                description: "ID of the correct choice"
              },
              explanation: {
                type: "string",
                description: "Brief explanation (1-2 sentences)"
              }
            },
            required: ["id", "prompt", "choices", "correctChoiceId", "explanation"]
          },
          minItems: 10,
          maxItems: 10
        }
      },
      required: ["questions"]
    }
  }
};
```

### 2. Provider Capability Detection

```javascript
function getStructuredOutputCapabilities(model) {
  const capabilities = {
    supportsTools: false,
    supportsJsonMode: false,
    supportsStreaming: false,
    supportsToolStreaming: false
  };
  
  // OpenAI
  if (model.startsWith('openai:')) {
    capabilities.supportsTools = true;
    capabilities.supportsJsonMode = true;
    capabilities.supportsStreaming = true;
    capabilities.supportsToolStreaming = true;
  }
  
  // Groq
  else if (model.startsWith('groq:') || model.startsWith('groq-free:')) {
    capabilities.supportsTools = true;
    capabilities.supportsJsonMode = true; // Recent Groq models support this
    capabilities.supportsStreaming = true;
    capabilities.supportsToolStreaming = true;
  }
  
  // Gemini
  else if (model.startsWith('gemini:') || model.startsWith('gemini-free:')) {
    capabilities.supportsTools = true;
    capabilities.supportsJsonMode = false; // Via OpenAI-compatible endpoint
    capabilities.supportsStreaming = true;
    capabilities.supportsToolStreaming = false; // Limited support
  }
  
  // Anthropic (Claude)
  else if (model.startsWith('anthropic:') || model.startsWith('claude:')) {
    capabilities.supportsTools = true;
    capabilities.supportsJsonMode = false;
    capabilities.supportsStreaming = true;
    capabilities.supportsToolStreaming = true;
  }
  
  // Cohere
  else if (model.startsWith('cohere:')) {
    capabilities.supportsTools = true;
    capabilities.supportsJsonMode = false;
    capabilities.supportsStreaming = true;
    capabilities.supportsToolStreaming = false;
  }
  
  // Together
  else if (model.startsWith('together:')) {
    capabilities.supportsTools = true;
    capabilities.supportsJsonMode = true; // Some models
    capabilities.supportsStreaming = true;
    capabilities.supportsToolStreaming = true;
  }
  
  return capabilities;
}
```

### 3. Structured Request Builder

```javascript
function buildStructuredRequest(model, messages, schema, options = {}) {
  const capabilities = getStructuredOutputCapabilities(model);
  const request = {
    model,
    messages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 5000,
    stream: options.stream !== false
  };
  
  // Layer 1: Try tool-based structured output
  if (capabilities.supportsTools && schema.type === 'tool') {
    request.tools = [schema.definition];
    request.tool_choice = { type: "function", function: { name: schema.definition.function.name } };
    console.log('✅ Using tool-based structured output');
  }
  
  // Layer 2: Fall back to JSON mode
  else if (capabilities.supportsJsonMode) {
    request.response_format = { type: "json_object" };
    console.log('✅ Using JSON mode');
  }
  
  // Layer 3: Rely on prompt engineering + robust parsing
  else {
    console.log('⚠️ Using prompt-based JSON generation (no native structured output)');
  }
  
  return request;
}
```

### 4. Incremental Feed Generation

```javascript
async function generateFeedItemsStreaming(
  model,
  context,
  count,
  eventCallback
) {
  const capabilities = getStructuredOutputCapabilities(model);
  
  if (capabilities.supportsToolStreaming) {
    // INCREMENTAL: Generate one item at a time via tool calls
    for (let i = 0; i < count; i++) {
      const prompt = `Generate educational feed item ${i + 1} of ${count} based on context...`;
      
      const response = await llmResponsesWithTools({
        model,
        input: [{ role: 'user', content: prompt }],
        tools: [feedItemTool],
        options: {
          stream: true,
          tool_choice: { type: "function", function: { name: "generate_feed_item" } }
        }
      });
      
      // Parse tool call arguments (streamed incrementally)
      const item = JSON.parse(response.output[0].arguments);
      
      // Emit immediately
      eventCallback('item_generated', { item });
      
      console.log(`✅ Generated item ${i + 1}/${count}`);
    }
  } else {
    // BATCH: Generate all items in one request (legacy)
    const prompt = `Generate ${count} educational feed items...`;
    const response = await llmResponsesWithTools({
      model,
      input: [{ role: 'user', content: prompt }],
      tools: [],
      options: { stream: false }
    });
    
    // Parse all items from response
    const data = robustJsonParse(response.text);
    const items = data.items || [];
    
    // Emit one by one
    for (const item of items) {
      eventCallback('item_generated', { item });
    }
  }
}
```

### 5. Robust JSON Parsing

```javascript
function robustJsonParse(text) {
  // Try 1: Parse as-is
  try {
    return JSON.parse(text);
  } catch (e1) {
    console.log('⚠️ Initial JSON parse failed, trying cleanup...');
  }
  
  // Try 2: Strip markdown code fences
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  try {
    return JSON.parse(cleaned);
  } catch (e2) {
    console.log('⚠️ Still failed after removing markdown, trying trailing comma fix...');
  }
  
  // Try 3: Remove trailing commas
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(cleaned);
  } catch (e3) {
    console.log('⚠️ Still failed, trying to extract JSON from text...');
  }
  
  // Try 4: Extract JSON from surrounding text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e4) {
      console.log('⚠️ Extracted JSON still invalid');
    }
  }
  
  // Try 5: Extract from array notation
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (e5) {
      console.log('⚠️ Extracted array still invalid');
    }
  }
  
  throw new Error(`Failed to parse JSON after all attempts. Original text: ${text.substring(0, 200)}...`);
}
```

## Implementation Files

### Backend Changes
1. **`src/endpoints/feed.js`**
   - Add `feedItemTool` definition
   - Implement `generateFeedItemsStreaming()` with incremental tool calls
   - Use `buildStructuredRequest()` for each model

2. **`src/endpoints/quiz.js`** (if separate) OR integrate into feed
   - Add `quizTool` definition
   - Use tool-based generation
   - Fall back to JSON mode if tools not supported

3. **`src/llm_tools_adapter.js`**
   - Add `getStructuredOutputCapabilities()`
   - Add `buildStructuredRequest()`
   - Add `robustJsonParse()`
   - Support `tool_choice` parameter

4. **`src/utils/json-parser.js`** (NEW)
   - Extract `robustJsonParse()` into reusable utility
   - Add tests for edge cases

### Frontend Changes
1. **`ui-new/src/services/feedGenerator.ts`**
   - Update to handle incremental SSE events
   - Better error handling for JSON parsing

2. **`ui-new/src/contexts/FeedContext.tsx`**
   - Handle `item_generated` events one-by-one
   - Update UI progressively

## Benefits

### 1. Reliability
- ✅ Structured output via tools = guaranteed valid JSON
- ✅ JSON mode = fallback for models without tool support
- ✅ Robust parsing = handles edge cases

### 2. Performance
- ✅ Incremental generation = items appear one-by-one
- ✅ Streaming = faster perceived performance
- ✅ Smaller token windows = faster generation per item

### 3. User Experience
- ✅ Progressive loading (not "all at once")
- ✅ Fewer errors and retries
- ✅ Consistent output format across providers

### 4. Maintainability
- ✅ Schema definitions = self-documenting
- ✅ Provider capabilities = easy to extend
- ✅ Centralized JSON parsing = reusable

## Testing Plan

### Unit Tests
- [ ] `robustJsonParse()` with various malformed JSON
- [ ] `getStructuredOutputCapabilities()` for each provider
- [ ] `buildStructuredRequest()` with different schemas

### Integration Tests
- [ ] Feed generation with tools (OpenAI, Groq)
- [ ] Feed generation with JSON mode (fallback)
- [ ] Feed generation with prompt only (last resort)
- [ ] Quiz generation with tools
- [ ] Incremental streaming (emit events)

### Manual Testing
- [ ] Generate 10 feed items - verify they appear one-by-one
- [ ] Generate quiz - verify valid JSON structure
- [ ] Test with multiple providers (OpenAI, Groq, Gemini)
- [ ] Test error handling (malformed responses)

## Implementation Order

1. **Phase 1**: Add robust JSON parsing utility (low risk)
2. **Phase 2**: Add provider capability detection
3. **Phase 3**: Implement tool definitions for quiz generation (simpler, single response)
4. **Phase 4**: Implement incremental feed generation with tools
5. **Phase 5**: Add JSON mode fallback
6. **Phase 6**: Update frontend to handle incremental SSE
7. **Phase 7**: Testing and refinement

## Notes

### Why Tools Over JSON Mode?
- **Validation**: Tool schemas provide automatic validation
- **Structure**: Type definitions ensure correct structure
- **Incremental**: Can generate one tool call at a time
- **Composable**: Can combine multiple tools in one response

### Why Incremental Generation?
- **UX**: Users see progress immediately
- **Reliability**: Smaller requests = less likely to fail
- **Flexibility**: Can stop generation early if needed
- **Cost**: Can limit to fewer items dynamically

### Provider-Specific Notes
- **OpenAI**: Full tool support, JSON mode, streaming
- **Groq**: Good tool support, JSON mode available
- **Gemini**: Tool support via OpenAI endpoint, no JSON mode
- **Anthropic**: Excellent tool support, no JSON mode
- **Cohere**: Tool support, no JSON mode
- **Together**: Variable support depending on model

## References

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [OpenAI JSON Mode](https://platform.openai.com/docs/guides/structured-outputs)
- [Groq Function Calling](https://console.groq.com/docs/tool-use)
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
