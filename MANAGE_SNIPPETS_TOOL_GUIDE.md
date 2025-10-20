# Manage Snippets Tool - Complete Guide

## Overview

The `manage_snippets` tool is a powerful LLM function that manages a personal knowledge base stored in Google Sheets. It allows the AI assistant to save, retrieve, search, and organize information on behalf of the user.

## Storage Location

- **Google Sheet**: "Research Agent/Research Agent Swag"
- **Access**: User's personal OAuth token (requires Google Drive authentication)
- **Visibility**: Also accessible via the UI's "Swag" page for manual management

## Tool Definition

```javascript
{
  type: 'function',
  function: {
    name: 'manage_snippets',
    description: '📝 **MANAGE KNOWLEDGE SNIPPETS**: Insert, retrieve, search, or delete knowledge snippets stored in your personal Google Sheet ("Research Agent/Research Agent Swag"). Use this to save important information, code examples, procedures, references, or any content you want to preserve and search later.',
    parameters: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['insert', 'capture', 'get', 'search', 'delete'],
          description: 'Operation to perform'
        },
        payload: {
          type: 'object',
          description: 'Action-specific parameters',
          properties: {
            // Fields vary by action (see below)
          }
        }
      }
    }
  }
}
```

## 5 Actions Supported

### 1. INSERT - Add New Snippet

**Purpose**: Explicitly save new information with full control over metadata.

**Required Fields**:
- `title` (string): Snippet title
- `content` (string): Main content/body

**Optional Fields**:
- `tags` (array of strings): Categorization tags, e.g., `["javascript", "async", "tutorial"]`
- `source` (string): Where it came from - `"chat"`, `"url"`, `"file"`, or `"manual"`
- `url` (string): Source URL if applicable

**Example LLM Call**:
```javascript
{
  "action": "insert",
  "payload": {
    "title": "React useEffect Hook Best Practices",
    "content": "1. Always specify dependencies array\n2. Cleanup functions for subscriptions\n3. Avoid object/array deps without useMemo",
    "tags": ["react", "hooks", "best-practices"],
    "source": "manual"
  }
}
```

**Response**:
```json
{
  "success": true,
  "action": "insert",
  "data": {
    "id": 42,
    "title": "React useEffect Hook Best Practices",
    "content": "1. Always specify dependencies array...",
    "tags": ["react", "hooks", "best-practices"],
    "source": "manual",
    "url": "",
    "created": "2025-10-20T10:30:00Z"
  },
  "message": "Successfully saved snippet \"React useEffect Hook Best Practices\" with ID 42"
}
```

**SSE Event Emitted**: `snippet_inserted` with id, title, and tags

---

### 2. CAPTURE - Quick Save from Context

**Purpose**: Quickly save information during a conversation with automatic source tracking.

**Required Fields**:
- `title` (string): Snippet title

**Optional Fields**:
- `content` (string): Content (can be empty)
- `tags` (array of strings): Categorization tags
- `source` (string): Defaults to `"chat"` if not specified
- `url` (string): Source URL

**Example LLM Call**:
```javascript
{
  "action": "capture",
  "payload": {
    "title": "TypeScript 5.0 const type parameters",
    "content": "TypeScript 5.0 introduced const type parameters for generic functions, preserving literal types",
    "tags": ["typescript", "generics"],
    "source": "chat"
  }
}
```

**Response**: Same format as INSERT

**Use Case**: When user says "Remember this" or "Save this for later" during conversation

---

### 3. GET - Retrieve Specific Snippet

**Purpose**: Fetch a single snippet by ID or exact title match.

**Required Fields** (one of):
- `id` (number): Snippet ID
- `title` (string): Exact title to search for

**Example LLM Call**:
```javascript
{
  "action": "get",
  "payload": {
    "id": 42
  }
}
```

**Or**:
```javascript
{
  "action": "get",
  "payload": {
    "title": "React useEffect Hook Best Practices"
  }
}
```

**Response**:
```json
{
  "success": true,
  "action": "get",
  "data": {
    "id": 42,
    "title": "React useEffect Hook Best Practices",
    "content": "...",
    "tags": ["react", "hooks", "best-practices"],
    "source": "manual",
    "url": "",
    "created": "2025-10-20T10:30:00Z"
  },
  "message": "Retrieved snippet \"React useEffect Hook Best Practices\""
}
```

---

### 4. SEARCH - Find Snippets

**Purpose**: Find snippets by text query or tags.

**Optional Fields**:
- `query` (string): Text search (searches both title and content)
- `tags` (array of strings): Filter by tags

**Example LLM Call - Text Search**:
```javascript
{
  "action": "search",
  "payload": {
    "query": "react hooks"
  }
}
```

**Example LLM Call - Tag Search**:
```javascript
{
  "action": "search",
  "payload": {
    "tags": ["python", "async"]
  }
}
```

**Example LLM Call - Combined**:
```javascript
{
  "action": "search",
  "payload": {
    "query": "performance",
    "tags": ["javascript"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "action": "search",
  "data": [
    {
      "id": 42,
      "title": "React useEffect Hook Best Practices",
      "content": "...",
      "tags": ["react", "hooks", "best-practices"],
      "source": "manual",
      "url": "",
      "created": "2025-10-20T10:30:00Z"
    },
    {
      "id": 43,
      "title": "React useState Hook Patterns",
      "content": "...",
      "tags": ["react", "hooks"],
      "source": "chat",
      "url": "",
      "created": "2025-10-20T11:15:00Z"
    }
  ],
  "count": 2,
  "message": "Found 2 snippets matching \"react hooks\""
}
```

---

### 5. DELETE - Remove Snippet

**Purpose**: Delete a snippet by ID or exact title.

**Required Fields** (one of):
- `id` (number): Snippet ID
- `title` (string): Exact title

**Example LLM Call**:
```javascript
{
  "action": "delete",
  "payload": {
    "id": 42
  }
}
```

**Response**:
```json
{
  "success": true,
  "action": "delete",
  "message": "Successfully deleted snippet with ID 42"
}
```

---

## Authentication & Security

### OAuth Requirements

- **User Must Be Logged In**: The tool requires a valid Google OAuth token
- **Scope Needed**: `https://www.googleapis.com/auth/drive.file` (access to files created by the app)
- **Token Source**: Extracted from `context.googleToken` or `context.accessToken`
- **User Email**: Required for identifying the user's sheet

### Error Handling

**No Token Available**:
```json
{
  "success": false,
  "error": "Authentication required",
  "message": "Please login with Google to use snippets feature"
}
```

**No User Email**:
```json
{
  "success": false,
  "error": "User identification required",
  "message": "Could not identify user"
}
```

**Missing Required Fields**:
```json
{
  "success": false,
  "error": "Missing required fields",
  "message": "Both title and content are required for insert action"
}
```

**Snippet Not Found**:
```json
{
  "success": false,
  "error": "Not found",
  "message": "Snippet not found with ID 42"
}
```

---

## Trigger Keywords for LLM

The LLM should use `manage_snippets` when the user says:

- **Save/Insert**: "save this", "remember this", "add to knowledge base", "store snippet", "save for later"
- **Search**: "search my snippets", "find my notes", "what did I save about", "look up my snippets"
- **Retrieve**: "get snippet", "show me snippet", "retrieve note"
- **Delete**: "delete snippet", "remove note"

## Backend Implementation

### Service Layer

Located in: `src/services/google-sheets-snippets.js`

**Core Functions**:
```javascript
async function insertSnippet(snippetData, userEmail, accessToken)
async function getSnippet({ id, title }, userEmail, accessToken)
async function searchSnippets({ query, tags }, userEmail, accessToken)
async function deleteSnippet({ id, title }, userEmail, accessToken)
```

### Google Sheets Structure

**Sheet Name**: "Research Agent Swag" (within "Research Agent" spreadsheet)

**Columns**:
1. **ID**: Auto-incrementing unique identifier
2. **Title**: Snippet title
3. **Content**: Main body text
4. **Tags**: Comma-separated tags
5. **Source**: Origin type (chat/url/file/manual)
6. **URL**: Source URL (if applicable)
7. **Created**: ISO timestamp

### Data Flow

```
User Request → LLM → manage_snippets tool call → callFunction() → 
Google Sheets API → Response → LLM → User
                     ↓
                 SSE Event (snippet_inserted)
                     ↓
                 UI Update (optional)
```

---

## UI Integration

### Swag Page

Users can also manage snippets manually via the UI:
- **Location**: Swag tab in the application
- **Features**: 
  - Text search
  - Vector search (semantic similarity)
  - Tag filtering
  - Manual add/edit/delete
  - Bulk operations
  - Export functionality

### Snippet Context Selection

Snippets can be manually attached to chat messages:
- **Feature**: "📎 Attach Context" button in chat
- **Purpose**: Include full snippet content (not fragments) in message context
- **Vs RAG**: Manual selection vs automatic embedding search

---

## Example User Conversations

### Example 1: Save Code Snippet

**User**: "Save this code example with tags 'javascript' and 'async': `async function fetchData() { const response = await fetch(url); return response.json(); }`"

**LLM Action**:
```javascript
manage_snippets({
  "action": "insert",
  "payload": {
    "title": "Async Fetch Data Function",
    "content": "async function fetchData() { const response = await fetch(url); return response.json(); }",
    "tags": ["javascript", "async"],
    "source": "chat"
  }
})
```

**LLM Response**: "I've saved that code snippet as 'Async Fetch Data Function' with tags 'javascript' and 'async'. It's now stored in your knowledge base with ID 42."

---

### Example 2: Quick Note

**User**: "Remember: TypeScript 5.0 introduced const type parameters"

**LLM Action**:
```javascript
manage_snippets({
  "action": "capture",
  "payload": {
    "title": "TypeScript 5.0 const type parameters",
    "content": "TypeScript 5.0 introduced const type parameters for generic functions",
    "tags": ["typescript"],
    "source": "chat"
  }
})
```

**LLM Response**: "Got it! I've saved that information about TypeScript 5.0 const type parameters to your snippets."

---

### Example 3: Search Snippets

**User**: "Search my snippets for react hooks"

**LLM Action**:
```javascript
manage_snippets({
  "action": "search",
  "payload": {
    "query": "react hooks"
  }
})
```

**LLM Response**: "I found 2 snippets about React hooks:

1. **React useEffect Hook Best Practices** (ID: 42)
   - Tags: react, hooks, best-practices
   - Content preview: 1. Always specify dependencies array...

2. **React useState Hook Patterns** (ID: 43)
   - Tags: react, hooks
   - Content preview: Common patterns for useState..."

---

### Example 4: Retrieve Specific Snippet

**User**: "Show me snippet 42"

**LLM Action**:
```javascript
manage_snippets({
  "action": "get",
  "payload": {
    "id": 42
  }
})
```

**LLM Response**: "Here's snippet #42:

**Title**: React useEffect Hook Best Practices

**Content**:
1. Always specify dependencies array
2. Cleanup functions for subscriptions
3. Avoid object/array deps without useMemo

**Tags**: react, hooks, best-practices"

---

## Performance Considerations

- **Rate Limiting**: Google Sheets API has rate limits (100 requests per 100 seconds per user)
- **Caching**: Consider caching frequently accessed snippets
- **Batch Operations**: Not currently supported but could be added
- **Large Datasets**: Performance degrades with >1000 snippets; consider pagination

## Future Enhancements

- [ ] Vector embeddings for semantic search
- [ ] Snippet versioning/history
- [ ] Sharing snippets between users
- [ ] Batch insert/delete operations
- [ ] Rich text formatting support
- [ ] File attachments
- [ ] Snippet collections/folders
- [ ] Export to markdown/JSON

## Related Features

- **RAG System**: Automatic embedding search for context
- **Manual Snippet Attachment**: User-selected snippets for chat context
- **Swag Page**: UI-based snippet management
- **Google Drive Sync**: OAuth integration for secure access

## Troubleshooting

### Common Issues

1. **"Authentication required"**: User needs to connect Google account in Cloud Sync Settings
2. **"Snippet not found"**: ID doesn't exist or title doesn't match exactly
3. **"Rate limit exceeded"**: Too many API calls; wait and retry
4. **Empty search results**: No snippets match query/tags; try broader search

### Debug Logging

The tool logs extensively to help debug issues:
```
❌ manage_snippets: No OAuth token available
✅ Successfully saved snippet "Title" with ID 42
🔍 Searching snippets with query: "react hooks"
```

## Summary

The `manage_snippets` tool is a versatile LLM function that enables:
- ✅ Persistent knowledge storage across sessions
- ✅ Organized categorization with tags
- ✅ Flexible search by text or tags
- ✅ Source tracking (chat/url/file/manual)
- ✅ Integration with UI for manual management
- ✅ Secure OAuth-based access control

It's particularly useful for building a personal knowledge base, saving code examples, bookmarking research, and organizing information for later retrieval.
