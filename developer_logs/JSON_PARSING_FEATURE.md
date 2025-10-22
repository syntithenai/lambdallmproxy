# JSON String Parsing in LLM Transparency

## Feature

Added automatic JSON string parsing in the LLM API Transparency response viewer. When the response contains string fields with JSON content (like tool call arguments), they are now automatically parsed and rendered as expandable trees instead of showing raw JSON strings.

## Problem

The LLM response often contains fields with JSON strings, particularly in tool call content. For example:

```json
{
  "choices": [{
    "message": {
      "content": "{\"query\": \"example\", \"parameters\": {\"nested\": \"value\"}}"
    }
  }]
}
```

Previously, this would display as a string:
```
content: "{\"query\": \"example\", \"parameters\": {\"nested\": \"value\"}}"
```

This made it difficult to:
- Read nested structures
- Understand tool call parameters
- Navigate complex JSON payloads
- Inspect deeply nested data

## Solution

Added recursive JSON string parsing that:

1. **Detects JSON strings**: Identifies strings that start/end with `{}`/`[]`
2. **Parses safely**: Uses try/catch to handle invalid JSON gracefully
3. **Recursively processes**: Applies parsing to nested objects and arrays
4. **Renders as tree**: Uses JsonTree component for expandable display

### Implementation

**File**: `ui-new/src/components/LlmApiTransparency.tsx`

**New function**:
```typescript
// Parse JSON strings in response object recursively
const parseJsonStrings = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Try to parse as JSON
    try {
      const trimmed = obj.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        const parsed = JSON.parse(trimmed);
        // Recursively parse the parsed object
        return parseJsonStrings(parsed);
      }
    } catch (e) {
      // Not valid JSON, return as-is
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => parseJsonStrings(item));
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = parseJsonStrings(value);
    }
    return result;
  }

  return obj;
};
```

**Applied to rendering**:
```typescript
// Regular view
<JsonTree 
  data={parseJsonStrings(call.response)} 
  expandAll={true}
/>

// Full-screen dialog
<JsonTree 
  data={parseJsonStrings(apiCalls[fullScreenCall].response)} 
  expandAll={true}
/>
```

## How It Works

### Before

```
📥 Response
▼ Object{3}
  "id": "chatcmpl-123"
  "choices": ▼ Array(1)
    [0]: ▼ Object{2}
      "message": ▼ Object{1}
        "content": "{\"tool\":\"search\",\"args\":{\"query\":\"test\",\"max\":10}}"
```

### After

```
📥 Response
▼ Object{3}
  "id": "chatcmpl-123"
  "choices": ▼ Array(1)
    [0]: ▼ Object{2}
      "message": ▼ Object{1}
        "content": ▼ Object{2}
          "tool": "search"
          "args": ▼ Object{2}
            "query": "test"
            "max": 10
```

The JSON string is automatically parsed and rendered as an expandable tree structure!

## Benefits

1. **Better Readability**: Nested JSON is easier to understand in tree form
2. **Tool Call Inspection**: Can see tool arguments structure clearly
3. **Data Navigation**: Collapse/expand sections to focus on relevant parts
4. **Type Awareness**: JsonTree colorizes different data types
5. **No Manual Parsing**: Happens automatically for all responses
6. **Safe Fallback**: Invalid JSON displays as original string

## Use Cases

### 1. Tool Call Arguments
When LLM calls tools with complex parameters:
```json
"arguments": "{\"queries\":[\"query1\",\"query2\"],\"filters\":{\"date\":\"2025\"}}"
```

Now displays as:
```
arguments: ▼ Object{2}
  queries: ▼ Array(2)
    [0]: "query1"
    [1]: "query2"
  filters: ▼ Object{1}
    date: "2025"
```

### 2. Nested Response Content
When response contains JSON payloads:
```json
"content": "{\"results\":[{\"title\":\"Result 1\",\"score\":0.95}]}"
```

Now displays as:
```
content: ▼ Object{1}
  results: ▼ Array(1)
    [0]: ▼ Object{2}
      title: "Result 1"
      score: 0.95
```

### 3. Configuration Objects
When tool calls include configuration:
```json
"config": "{\"model\":\"gpt-4\",\"settings\":{\"temp\":0.7}}"
```

Now displays as:
```
config: ▼ Object{2}
  model: "gpt-4"
  settings: ▼ Object{1}
    temp: 0.7
```

## Technical Details

### Parsing Logic

1. **String detection**: Only processes strings that look like JSON (start/end with `{}`/`[]`)
2. **Safe parsing**: Uses try/catch to handle malformed JSON gracefully
3. **Recursive**: Applies to all nested structures (objects, arrays, parsed values)
4. **Non-destructive**: Original data unchanged, only display is affected
5. **Selective**: Only parses strings that are valid JSON

### Performance

- **Lazy evaluation**: JsonTree components only render when expanded
- **Memoization**: React's rendering optimizations apply
- **Minimal overhead**: Parsing only happens once per response render
- **No memory issues**: Parsed data is temporary (not stored in state)

### Edge Cases Handled

- **Invalid JSON**: Returns original string if parsing fails
- **Null/undefined**: Passes through unchanged
- **Partial JSON**: Doesn't parse strings that don't have proper start/end brackets
- **Nested JSON**: Recursively parses multi-level JSON strings
- **Mixed content**: Handles objects with both parsed and unparsed fields

## Testing

To see the feature in action:

1. Send a query that triggers tool calls
2. Open "LLM Calls" section
3. Expand "📥 Response"
4. Look for fields that previously showed JSON strings
5. They should now be expandable tree structures

**Expected improvements**:
- ✅ Tool arguments shown as objects, not strings
- ✅ Can expand/collapse nested structures
- ✅ Color-coded by type (strings, numbers, objects)
- ✅ Better visual hierarchy

## Deployment

- **Frontend**: Deployed to GitHub Pages (index-DpIDVzHu.js)
- **Commit**: 7653fce - "feat: Parse JSON strings in LLM response and render as expandable trees"
- **No backend changes**: Pure frontend enhancement

## Future Enhancements

Possible improvements:
1. **Syntax highlighting**: Color-code JSON keys/values differently
2. **Copy button**: Allow copying parsed JSON to clipboard
3. **Search**: Find text within parsed structures
4. **Format toggle**: Switch between parsed/raw views
5. **Deep linking**: Link to specific nodes in the tree
