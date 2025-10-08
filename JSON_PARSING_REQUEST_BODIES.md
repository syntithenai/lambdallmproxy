# JSON Parsing in Request Bodies - Tool Message Content

## Enhancement

Extended the JSON string parsing feature to also handle **request bodies**, specifically tool message content that contains JSON strings. Now both requests and responses automatically parse and display JSON strings as expandable trees.

## Problem

Tool messages in the request body often contain JSON string content. For example:

```json
{
  "messages": [
    {
      "role": "tool",
      "content": "{\"results\": [{\"title\": \"Example\", \"url\": \"https://example.com\"}]}"
    }
  ]
}
```

Previously, the `content` field would display as a raw JSON string:
```
content: "{\"results\": [{\"title\": \"Example\", \"url\": \"https://example.com\"}]}"
```

This made it difficult to:
- Inspect tool results
- Understand tool response structures
- Navigate nested data in tool messages
- Debug tool execution

## Solution

Applied the same `parseJsonStrings()` function to **both** request and response data:

### Updated Code

**File**: `ui-new/src/components/LlmApiTransparency.tsx`

**Regular view - Request**:
```typescript
<JsonTree 
  data={parseJsonStrings(call.request)}  // ✅ Now parses JSON strings
  expanded={true}
  expandPaths={['messages']}
/>
```

**Regular view - Response**:
```typescript
<JsonTree 
  data={parseJsonStrings(call.response)}  // ✅ Already parsing
  expandAll={true}
/>
```

**Full-screen dialog - Request**:
```typescript
<JsonTree 
  data={parseJsonStrings(apiCalls[fullScreenCall].request)}  // ✅ Now parses
  expanded={true}
  expandPaths={['messages']}
/>
```

**Full-screen dialog - Response**:
```typescript
<JsonTree 
  data={parseJsonStrings(apiCalls[fullScreenCall].response)}  // ✅ Already parsing
  expandAll={true}
/>
```

## How It Works

The `parseJsonStrings()` function recursively processes the entire request/response object:

1. **Traverses all fields**: Objects, arrays, nested structures
2. **Detects JSON strings**: Strings starting with `{`/`[` and ending with `}`/`]`
3. **Parses safely**: try/catch prevents errors on invalid JSON
4. **Recursively applies**: Handles deeply nested JSON strings
5. **Renders as tree**: Uses JsonTree for expandable display

### Example Flow

**Original Request**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "search for something"
    },
    {
      "role": "tool",
      "tool_call_id": "call_123",
      "name": "search_web",
      "content": "{\"query\":\"something\",\"results\":[{\"title\":\"Result\",\"url\":\"https://example.com\"}]}"
    }
  ]
}
```

**After Parsing & Display**:
```
messages: ▼ Array(2)
  [0]: ▼ Object{2}
    role: "user"
    content: "search for something"
  [1]: ▼ Object{4}
    role: "tool"
    tool_call_id: "call_123"
    name: "search_web"
    content: ▼ Object{2}                    ← Parsed from JSON string!
      query: "something"
      results: ▼ Array(1)
        [0]: ▼ Object{2}
          title: "Result"
          url: "https://example.com"
```

## Benefits

### For Request Bodies
1. ✅ **Tool Message Inspection**: See structured tool results clearly
2. ✅ **Debug Tool Execution**: Understand what data tools returned
3. ✅ **Navigate Results**: Collapse/expand tool response structures
4. ✅ **Compare Iterations**: See how tool results change across iterations

### For Response Bodies
1. ✅ **LLM Output Parsing**: See structured LLM responses
2. ✅ **Tool Call Arguments**: Inspect complex tool call parameters
3. ✅ **Nested Data**: Navigate deep object hierarchies

### Overall
1. ✅ **Consistent Experience**: Same parsing in both requests and responses
2. ✅ **Automatic**: No manual JSON parsing needed
3. ✅ **Safe**: Invalid JSON displays as original string
4. ✅ **Visual**: Tree structure is easier to understand than strings

## Use Cases

### 1. Web Search Results
**Tool message content**:
```json
"content": "{\"results\": [{\"title\": \"...\", \"snippet\": \"...\", \"url\": \"...\"}]}"
```

**Now displays as**:
```
content: ▼ Object{1}
  results: ▼ Array(3)
    [0]: ▼ Object{3}
      title: "..."
      snippet: "..."
      url: "..."
```

### 2. JavaScript Execution Results
**Tool message content**:
```json
"content": "{\"output\": \"...\", \"error\": null, \"logs\": [\"log1\", \"log2\"]}"
```

**Now displays as**:
```
content: ▼ Object{3}
  output: "..."
  error: null
  logs: ▼ Array(2)
    [0]: "log1"
    [1]: "log2"
```

### 3. Scraped Web Content
**Tool message content**:
```json
"content": "{\"title\": \"...\", \"content\": \"...\", \"links\": [\"...\"]}"
```

**Now displays as**:
```
content: ▼ Object{3}
  title: "..."
  content: "..."
  links: ▼ Array(...)
```

## Technical Details

### Parsing Rules

The `parseJsonStrings()` function:
- **Only parses strings** that look like JSON (proper brackets)
- **Preserves other strings** unchanged
- **Handles nested structures** recursively
- **Fails gracefully** on invalid JSON (returns original string)
- **Works on all data types**: objects, arrays, primitives

### Performance

- **Efficient**: Only parses once per render
- **Non-blocking**: Doesn't affect UI responsiveness  
- **Lightweight**: No additional libraries needed
- **Lazy**: JsonTree only renders expanded nodes

### Edge Cases

- ✅ **Empty strings**: Passed through unchanged
- ✅ **Partial JSON**: Not parsed (missing brackets)
- ✅ **Escaped JSON**: Handles properly escaped quotes
- ✅ **Nested JSON strings**: Recursively parsed
- ✅ **Mixed content**: Objects with both parsed and unparsed fields

## Testing

To see the feature in action:

1. **Send a query** that uses tools (e.g., web search)
2. **Open "LLM Calls"** section
3. **Expand "📤 Request Body"**
4. **Navigate to messages array**
5. **Find tool messages** (role: "tool")
6. **Check content field** - should be expandable tree, not JSON string

**Expected to see**:
- ✅ Tool message `content` as expandable objects
- ✅ Nested structures properly parsed
- ✅ Easy to inspect tool results
- ✅ Consistent with response parsing

## Files Modified

- ✅ `ui-new/src/components/LlmApiTransparency.tsx`
  - Applied `parseJsonStrings()` to request data in regular view
  - Applied `parseJsonStrings()` to request data in full-screen dialog

## Deployment

- **Frontend**: Deployed to GitHub Pages (index-CXLCg28K.js)
- **Commit**: 34c2050 - "feat: Parse JSON strings in request body tool messages for expandable display"
- **No backend changes**: Pure frontend enhancement

## Related Features

This completes the JSON parsing feature:
1. ✅ **Response bodies**: Parse JSON strings in LLM responses
2. ✅ **Request bodies**: Parse JSON strings in tool messages (NEW)
3. ✅ **Recursive parsing**: Handles deeply nested structures
4. ✅ **Safe fallback**: Invalid JSON displays as string

Now every part of the LLM API transparency view automatically parses and displays JSON strings as expandable trees!
