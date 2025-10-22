# Double JSON Encoding Fix - "No Content Returned" Error

## Problem

User reported: "Could not process Cat.pdf: No content returned from conversion"

The PDF conversion was succeeding on the backend, but the frontend couldn't extract the content from the response.

## Root Cause

### The Issue: Double JSON Encoding

The backend handler returns a **Lambda response format**:

```javascript
responseStream.write(JSON.stringify({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, content: markdown })  // ← body is JSON STRING
}));
```

This creates a structure like:
```json
{
  "statusCode": 200,
  "headers": {...},
  "body": "{\"markdown\":\"...\",\"content\":\"...\"}"
}
```

The frontend was doing:
```typescript
const result = await response.json();  // Parses outer JSON
console.log(result.markdown);  // undefined! markdown is in result.body (as a string)
```

### Why This Happens

1. **Lambda Response Format**: AWS Lambda handlers return this structure
2. **Local Server Streams Raw**: The local dev server writes this directly to HTTP response
3. **Double Encoding**: The `body` field is a JSON string, not an object

So the data flow is:
```
Backend: { markdown: "..." }
  ↓ JSON.stringify for body field
Backend: { body: '{"markdown":"..."}' }
  ↓ JSON.stringify for response
HTTP: '{"body":"{\\"markdown\\":\\"...\\"}"}'
  ↓ response.json() in frontend
Frontend: { body: '{"markdown":"..."}' }  ← body is still a string!
  ↓ result.markdown
Frontend: undefined  ❌
```

## Solution

### Parse Body if It's a String

Added logic to detect and parse the nested JSON:

```typescript
let result = await response.json();

// Handle Lambda response format (body is a JSON string)
if (result.body && typeof result.body === 'string') {
  try {
    result = JSON.parse(result.body);  // Parse the inner JSON
  } catch (e) {
    console.error('Failed to parse response body:', e);
  }
}

// Now result.markdown is accessible
const markdown = result.markdown || result.content;
```

### How It Works

```typescript
// Step 1: Parse HTTP response
const result = await response.json();
// result = { statusCode: 200, headers: {...}, body: '{"markdown":"..."}' }

// Step 2: Check if body is a string
if (result.body && typeof result.body === 'string') {
  // Step 3: Parse the nested JSON
  result = JSON.parse(result.body);
  // result = { markdown: "...", content: "..." }
}

// Step 4: Access the data
const markdown = result.markdown;  ✅ Works!
```

## Implementation

### Files Modified

**ui-new/src/components/SwagPage.tsx** - `handleUploadDocuments()`

### File Uploads (PDF, DOCX, etc.)

**Before:**
```typescript
const result = await response.json();

if (!result.markdown && !result.content) {
  throw new Error('No content returned');
}

markdownContent = result.markdown || result.content;
```

**After:**
```typescript
let result = await response.json();

// Handle Lambda response format (body is a JSON string)
if (result.body && typeof result.body === 'string') {
  try {
    result = JSON.parse(result.body);
  } catch (e) {
    console.error('Failed to parse response body:', e);
  }
}

if (!result.markdown && !result.content) {
  throw new Error('No content returned from conversion - PDF may be empty or image-based');
}

markdownContent = result.markdown || result.content;

if (!markdownContent || markdownContent.trim().length === 0) {
  throw new Error('Converted content is empty - PDF may contain only images');
}
```

### URL Conversions

**Before:**
```typescript
const result = await response.json();
const markdownContent = result.markdown || result.content;

await addSnippet(markdownContent, 'user', url);
```

**After:**
```typescript
let result = await response.json();

// Handle Lambda response format (body is a JSON string)
if (result.body && typeof result.body === 'string') {
  try {
    result = JSON.parse(result.body);
  } catch (e) {
    console.error('Failed to parse response body:', e);
  }
}

const markdownContent = result.markdown || result.content;

if (!markdownContent || markdownContent.trim().length === 0) {
  throw new Error('No content extracted from URL');
}

await addSnippet(markdownContent, 'user', url);
```

## Additional Improvements

### 1. Better PDF Error Handling (file-converters.js)

Added detection for PDFs with no extractable text:

```javascript
if (!data.text || data.text.trim().length === 0) {
  console.warn('⚠️ PDF has no extractable text content');
  return {
    markdown: '*(This PDF contains no extractable text. It may be an image-based PDF or scanned document.)*',
    metadata: {
      pages: data.numpages,
      source_type: 'file',
      source_mime_type: 'application/pdf',
      warning: 'No text content found. PDF may contain only images.',
    },
  };
}
```

### 2. Enhanced Logging

Added detailed logging in PDF conversion:

```javascript
console.log(`📄 PDF parsed successfully:`, {
  pages: data.numpages,
  textLength: data.text?.length || 0,
  hasText: !!data.text
});

// ... after conversion ...

console.log(`✅ PDF converted to markdown:`, {
  markdownLength: markdown.length,
  pageCount: pages.filter(p => p.trim()).length
});
```

### 3. Better Error Messages

Frontend now shows specific errors:

- **"No content returned from conversion - PDF may be empty or image-based"** - Response has no markdown field
- **"Converted content is empty - PDF may contain only images"** - Markdown is empty string
- **"No content extracted from URL"** - URL fetch returned empty content

## Why Lambda Response Format?

The handler uses Lambda response streaming format because:

1. **AWS Lambda Requirement**: Production Lambda needs this structure
2. **Streaming Support**: Allows SSE and chunked responses
3. **Status Codes**: Can return different HTTP status codes
4. **Headers**: Can set response headers

The local dev server mimics this behavior for consistency, but it means we need to handle the double encoding.

## Alternative Solutions

### Option 1: Fix Local Server (Better)

Modify `run-local-lambda.js` to parse the Lambda response:

```javascript
const responseStream = {
  write: (data) => {
    if (expressResponse) {
      // Parse Lambda response format
      try {
        const lambdaResponse = JSON.parse(data);
        if (lambdaResponse.statusCode && lambdaResponse.body) {
          // This is a Lambda response, unwrap it
          expressResponse.status(lambdaResponse.statusCode);
          
          Object.keys(lambdaResponse.headers || {}).forEach(key => {
            expressResponse.setHeader(key, lambdaResponse.headers[key]);
          });
          
          expressResponse.write(lambdaResponse.body);  // Send unwrapped body
          return;
        }
      } catch (e) {
        // Not Lambda format, send as-is
      }
      
      expressResponse.write(data);
    }
  }
};
```

**Pros:**
- Frontend doesn't need special handling
- Cleaner client code
- Matches production Lambda behavior

**Cons:**
- Requires changing local server
- More complex server logic
- Need to handle both formats

### Option 2: Current Solution (Frontend Parsing)

**Pros:**
- ✅ No server changes needed
- ✅ Works immediately
- ✅ Defensive programming (handles both formats)

**Cons:**
- Frontend needs to know about Lambda format
- Repeated code for each endpoint

### Option 3: Shared API Client

Create a wrapper function:

```typescript
// utils/api-client.ts
async function fetchAPI(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  let result = await response.json();
  
  // Handle Lambda response format
  if (result.body && typeof result.body === 'string') {
    result = JSON.parse(result.body);
  }
  
  return result;
}

// Usage:
const result = await fetchAPI('/convert-to-markdown', {
  method: 'POST',
  body: formData
});
const markdown = result.markdown;
```

**Pros:**
- Centralized logic
- Easy to maintain
- Type-safe with TypeScript

**Cons:**
- Need to refactor all fetch calls
- Another abstraction layer

## Testing

### Test Cases

**Valid PDF with Text:**
```
1. Upload document.pdf with extractable text
2. Backend logs:
   "📄 PDF parsed successfully: { pages: 3, textLength: 1234, hasText: true }"
   "✅ PDF converted to markdown: { markdownLength: 1500, pageCount: 3 }"
3. Frontend parses nested JSON
4. Snippet created with PDF text
```

**Image-Based PDF:**
```
1. Upload scanned.pdf (no extractable text)
2. Backend logs:
   "📄 PDF parsed successfully: { pages: 2, textLength: 0, hasText: false }"
   "⚠️ PDF has no extractable text content"
3. Frontend receives warning message
4. Snippet created with:
   "*(This PDF contains no extractable text. It may be an image-based PDF or scanned document.)*"
```

**Valid URL:**
```
1. Enter https://example.com
2. Backend fetches and converts HTML
3. Frontend parses nested JSON
4. Snippet created with HTML → Markdown content
```

## Response Structure Examples

### What Backend Sends (Lambda Format)

```json
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"markdown\":\"## Page 1\\n\\nPDF content...\",\"content\":\"## Page 1\\n\\nPDF content...\"}"
}
```

### What Frontend Receives (After response.json())

```javascript
{
  statusCode: 200,
  headers: { "Content-Type": "application/json" },
  body: '{"markdown":"## Page 1\\n\\nPDF content...","content":"## Page 1\\n\\nPDF content..."}'
  //    ↑ Still a string!
}
```

### After Parsing result.body

```javascript
{
  markdown: "## Page 1\n\nPDF content...",
  content: "## Page 1\n\nPDF content..."
}
```

## Summary

**Problem:** Frontend couldn't access markdown content from backend response

**Root Cause:** Double JSON encoding - Lambda response format with nested JSON body

**Solution:**
1. ✅ Detect if `result.body` is a string
2. ✅ Parse nested JSON: `result = JSON.parse(result.body)`
3. ✅ Add validation for empty content
4. ✅ Better error messages for different scenarios
5. ✅ Enhanced logging in PDF conversion

**Files Modified:**
- `ui-new/src/components/SwagPage.tsx` - Parse nested JSON in both file and URL uploads
- `src/rag/file-converters.js` - Better handling of empty PDFs + logging

**Result:** PDF uploads now work correctly, with helpful messages for image-based PDFs!
