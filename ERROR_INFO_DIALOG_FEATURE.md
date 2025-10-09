# Error Info Dialog Feature

**Date**: October 9, 2025  
**Type**: UI Enhancement - Error Transparency  
**Deployment**: Commit 8e5cc6c  
**Impact**: Users can now see full error details including upstream LLM errors, Lambda errors, and stack traces

## Problem Statement

Error messages in the chat were being obscured and simplified, making it difficult to:
- **Debug issues**: Users couldn't see the full error details to understand what went wrong
- **Report bugs**: Limited error information made it hard to provide detailed bug reports
- **Understand failures**: Upstream LLM provider errors were hidden behind generic error messages
- **Troubleshoot**: No access to stack traces, error codes, or request context

This was particularly problematic because:
1. Lambda errors contain valuable debugging information
2. LLM provider errors (Groq, OpenAI) have specific error codes and types
3. Stack traces help identify code issues
4. Request IDs enable error tracking and correlation
5. Users need transparency to trust the system

## Solution Overview

Added an **Error Info** button to error messages that opens a full-screen dialog showing:
1. **Complete error object** as an expandable JSON tree
2. **Error classification** (type, code, status code)
3. **Stack traces** (when available)
4. **Lambda-specific errors** (errorType, errorMessage)
5. **Upstream LLM provider errors** (from Groq, OpenAI, etc.)
6. **Request context** (request ID, timestamp, request data)
7. **Copy functionality** for sharing error details

## Implementation Details

### Files Created

**1. `ui-new/src/components/ErrorInfoDialog.tsx`** (NEW)
- Full-screen dialog component for displaying error details
- Expandable JSON tree component for viewing complex error structures
- Color-coded sections for different error types
- Copy-to-clipboard functionality for error JSON

**Key Features**:
- **Error Message Summary**: Red background with prominent error text
- **Error Classification**: Type, code, and status code display
- **Stack Trace Viewer**: Formatted stack traces with syntax highlighting
- **Lambda Error Details**: AWS Lambda-specific error information
- **LLM Provider Errors**: Nested error objects from upstream providers
- **Request Context**: Request ID, timestamp, and request data
- **Expandable JSON Tree**: Collapsible tree view of entire error object
- **Copy Button**: One-click copy of full error JSON

**JsonTree Component**:
```tsx
const JsonTree: React.FC<JsonTreeProps> = ({ data, level = 0 }) => {
  const [expanded, setExpanded] = React.useState(level < 2);
  // Recursively renders JSON as expandable tree
  // Color codes: strings (green), numbers (blue), booleans (purple)
  // Auto-expands first 2 levels for quick visibility
}
```

### Files Modified

**2. `ui-new/src/utils/api.ts`** (MODIFIED)
- Added `errorData?: any` field to `ChatMessage` interface
- Stores complete error object from Lambda or caught errors

**Change**:
```typescript
export interface ChatMessage {
  // ... existing fields
  errorData?: any;  // Full error object for error transparency
}
```

**3. `ui-new/src/components/ChatTab.tsx`** (MODIFIED)

**Import**: Added `ErrorInfoDialog` component
```typescript
import { ErrorInfoDialog } from './ErrorInfoDialog';
```

**State**: Added error dialog tracking
```typescript
const [showErrorInfo, setShowErrorInfo] = useState<number | null>(null);
```

**Error Handling (Streaming)**: Capture full error from SSE events
```typescript
case 'error':
  const errorMessage: ChatMessage = {
    role: 'assistant',
    content: `❌ Error: ${errorMsg}`,
    errorData: data  // Store full error object including code, stack, etc.
  };
  setMessages(prev => [...prev, errorMessage]);
  break;
```

**Error Handling (Catch Block)**: Capture Error objects
```typescript
const errorMessage: ChatMessage = {
  role: 'assistant',
  content: `❌ Error: ${errorMsg}`,
  errorData: error instanceof Error ? {
    ...error,  // Capture any additional properties
    message: error.message,
    name: error.name,
    stack: error.stack
  } : { message: String(error) }
};
```

**Error Info Button**: Added to error messages (after Copy/Gmail/Grab/Info buttons)
```tsx
{msg.errorData && msg.content.startsWith('❌ Error:') && (
  <button
    onClick={() => setShowErrorInfo(idx)}
    className="text-xs text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-100 flex items-center gap-1"
    title="View full error details"
  >
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
    Error Info
  </button>
)}
```

**Dialog Rendering**: Added at end of component (after LLM Info dialog)
```tsx
{/* Error Info Dialog */}
{showErrorInfo !== null && messages[showErrorInfo]?.errorData && (
  <ErrorInfoDialog 
    errorData={messages[showErrorInfo].errorData}
    onClose={() => setShowErrorInfo(null)}
  />
)}
```

## User Experience

### Error Message Display

**Before**:
- Error message: "❌ Error: Invalid request"
- Pink background with border
- No additional information
- No way to see full error details

**After**:
- Same visual error message
- **NEW**: "Error Info" button with warning icon
- Click to open full-screen dialog
- Complete error transparency

### Error Info Dialog Layout

**Header**:
- Red warning icon
- "Error Details" title
- Close button (X)

**Content Sections** (color-coded for clarity):

1. **Error Message Summary** (Red)
   - Main error message
   - Font-mono for code-style display
   - White-space preserved

2. **Error Classification** (Orange)
   - Error type (e.g., "ValidationError", "RateLimitError")
   - Error code (e.g., "ERR_INVALID_REQUEST")
   - HTTP status code (e.g., 400, 429, 500)

3. **Stack Trace** (Gray)
   - Full JavaScript/Python stack trace
   - Monospace font
   - Scrollable if long

4. **Lambda Error** (Purple)
   - `errorType`: Lambda function error type
   - `errorMessage`: Lambda error message

5. **Upstream LLM Provider Error** (Yellow)
   - Nested `error` object from Groq/OpenAI/etc.
   - Provider-specific error types
   - Rate limit details
   - Quota information

6. **Request Context** (Blue)
   - Request ID for tracking
   - Timestamp (formatted)
   - Request data (expandable tree)

7. **Complete Error Object** (Gray)
   - Full JSON as expandable tree
   - Copy button for entire JSON
   - Auto-expands first 2 levels

**Footer**:
- "Copy Full JSON" button
- "Close" button

## Example Error Scenarios

### Scenario 1: Rate Limit Error

**User Action**: Send too many requests quickly

**Error Message in Chat**:
```
❌ Error: Rate limit exceeded. Please try again in 60 seconds.
```

**Click "Error Info" → Dialog Shows**:
```json
{
  "error": "Rate limit exceeded. Please try again in 60 seconds.",
  "code": "RATE_LIMIT_EXCEEDED",
  "type": "rate_limit_error",
  "statusCode": 429,
  "error": {
    "message": "Rate limit exceeded for requests",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  },
  "requestId": "abc123-def456-789",
  "timestamp": "2025-10-09T10:23:45.123Z",
  "retryAfter": 60
}
```

**Sections Displayed**:
- ✅ Error Message: "Rate limit exceeded..."
- ✅ Classification: Type=rate_limit_error, Code=RATE_LIMIT_EXCEEDED, Status=429
- ✅ Upstream LLM: Groq rate limit details
- ✅ Request Context: Request ID, timestamp, retry-after
- ✅ Full JSON: Expandable tree view

### Scenario 2: Invalid Request Error

**User Action**: Send malformed request (missing required field)

**Error Message in Chat**:
```
❌ Error: Invalid request: Missing required field 'model'
```

**Error Info Dialog Shows**:
```json
{
  "error": "Invalid request: Missing required field 'model'",
  "code": "INVALID_REQUEST",
  "type": "validation_error",
  "statusCode": 400,
  "validationErrors": [
    {
      "field": "model",
      "message": "This field is required"
    }
  ],
  "requestId": "req_xyz789",
  "timestamp": "2025-10-09T10:25:30.456Z"
}
```

### Scenario 3: Lambda Function Error

**User Action**: Trigger a bug in Lambda function

**Error Message in Chat**:
```
❌ Error: Internal server error
```

**Error Info Dialog Shows**:
```json
{
  "errorType": "TypeError",
  "errorMessage": "Cannot read property 'length' of undefined",
  "stack": [
    "TypeError: Cannot read property 'length' of undefined",
    "    at processTools (/var/task/src/tools.js:123:45)",
    "    at handler (/var/task/src/index.js:67:89)",
    "    at Runtime.handleOnce (/var/runtime/index.js:123:456)"
  ],
  "requestId": "lambda-req-123",
  "timestamp": "2025-10-09T10:27:15.789Z"
}
```

**Sections Displayed**:
- ✅ Error Message: "Internal server error"
- ✅ Lambda Error: TypeError with message
- ✅ Stack Trace: Full call stack with line numbers
- ✅ Request Context: Lambda request ID and timestamp

### Scenario 4: Upstream Provider Timeout

**User Action**: LLM provider takes too long to respond

**Error Message in Chat**:
```
❌ Error: Request timeout: The LLM provider did not respond within 30 seconds
```

**Error Info Dialog Shows**:
```json
{
  "error": "Request timeout: The LLM provider did not respond within 30 seconds",
  "code": "TIMEOUT",
  "type": "timeout_error",
  "statusCode": 504,
  "provider": "groq",
  "model": "mixtral-8x7b-32768",
  "timeoutMs": 30000,
  "error": {
    "message": "Gateway Timeout",
    "type": "timeout",
    "code": "504"
  },
  "requestId": "timeout-req-456",
  "timestamp": "2025-10-09T10:30:00.123Z",
  "request": {
    "model": "mixtral-8x7b-32768",
    "temperature": 0.7,
    "max_tokens": 4096
  }
}
```

## Technical Details

### JsonTree Component

**Purpose**: Recursively render JSON as an expandable tree

**Features**:
- Auto-expand first 2 levels (level parameter)
- Color-coded by type:
  - Strings: Green
  - Numbers: Blue
  - Booleans: Purple
  - null/undefined: Gray
- Arrays show `Array[N]` with count
- Objects show `Object{N}` with key count
- Click to expand/collapse
- Recursive rendering for nested structures

**Performance**:
- Uses React.useState for expansion state
- Minimal re-renders (only expanded subtrees)
- Efficient for large error objects

### Error Data Flow

1. **Error Occurs** (Lambda or client-side)
2. **Capture Error** (streaming event or catch block)
3. **Store in Message** (errorData field)
4. **Render Error Info Button** (if errorData exists)
5. **Click Button** (setShowErrorInfo(idx))
6. **Open Dialog** (ErrorInfoDialog component)
7. **Display Sections** (conditional rendering based on error structure)
8. **User Copies JSON** (copy button or manual copy)

### Error Detection Logic

**Determines if message is an error**:
```typescript
msg.errorData && msg.content.startsWith('❌ Error:')
```

**Why Both Checks**:
1. `msg.errorData`: Ensures full error object is available
2. `msg.content.startsWith('❌ Error:')`: Ensures it's actually an error message
3. Combined: Prevents false positives on normal messages

### Error Object Structure

**Standard Fields**:
- `message` or `error`: Main error text
- `type`: Error classification (e.g., "rate_limit_error")
- `code`: Error code (e.g., "ERR_TIMEOUT")
- `statusCode`: HTTP status code (e.g., 429, 500)

**Lambda-Specific**:
- `errorType`: JavaScript error name (e.g., "TypeError")
- `errorMessage`: Error description
- `stack`: Array of stack trace lines

**LLM Provider-Specific** (nested `error` object):
- `error.message`: Provider error message
- `error.type`: Provider error type
- `error.code`: Provider error code

**Context**:
- `requestId`: Unique request identifier
- `timestamp`: ISO 8601 timestamp
- `request`: Original request data

## Deployment

**Frontend Build**:
```bash
cd ui-new && npm run build
```

**Build Output**:
- Bundle: `docs/assets/index-AMyo0Xeg.js` (722.95 KB)
- CSS: `docs/assets/index-Dq-9FkaG.css` (50.19 KB)
- Build time: 2.44s
- Modules: 532 transformed

**Git Deployment**:
```bash
./scripts/deploy-docs.sh -m "Add error info dialog with expandable JSON tree"
```

**Commit**: 8e5cc6c  
**Deployment Time**: October 9, 2025, 10:23:54 UTC  
**URL**: https://lambdallmproxy.pages.dev  
**Status**: ✅ Successfully deployed

## Benefits

### For Users

1. **Complete Transparency**: See exactly what went wrong
2. **Better Bug Reports**: Copy full error JSON to include in reports
3. **Self-Service Debugging**: Understand errors without contacting support
4. **Trust Building**: Shows system is open and honest about failures
5. **Learning**: Understand API errors and troubleshooting

### For Developers

1. **Easier Debugging**: Full error context available
2. **Issue Triage**: Quickly identify error types and sources
3. **Error Tracking**: Request IDs enable correlation across systems
4. **Provider Issues**: See when errors originate from upstream
5. **Regression Testing**: Verify error handling improvements

### For System Reliability

1. **Error Patterns**: Users can report consistent error types
2. **Provider Monitoring**: Identify provider-specific issues
3. **Performance Tuning**: See timeout and rate limit patterns
4. **Security Auditing**: Track authentication and authorization errors
5. **Compliance**: Audit trail of error details

## Testing Scenarios

### Test 1: Basic Error Dialog

**Steps**:
1. Trigger an error (e.g., send message while not signed in)
2. See error message with pink background
3. Click "Error Info" button
4. Verify dialog opens with error details
5. Click "Close" or X to dismiss
6. Verify dialog closes

**Expected**: ✅ Dialog shows error message, classification, and full JSON

### Test 2: Copy Error JSON

**Steps**:
1. Open error info dialog
2. Click "Copy Full JSON" button
3. Paste into text editor
4. Verify JSON is valid and complete

**Expected**: ✅ Clipboard contains formatted JSON with all error details

### Test 3: Expandable JSON Tree

**Steps**:
1. Open error info dialog
2. Verify first 2 levels auto-expanded
3. Click ▶ to expand collapsed sections
4. Click ▼ to collapse expanded sections
5. Verify nested objects expand recursively

**Expected**: ✅ Tree view works smoothly, color-coded by type

### Test 4: Multiple Error Types

**Test Cases**:
- Rate limit error (429)
- Invalid request (400)
- Lambda function error (500)
- Timeout error (504)
- Authentication error (401)

**Expected**: ✅ Each error type displays appropriate sections

### Test 5: Dark Mode

**Steps**:
1. Enable dark mode
2. Trigger error
3. Open error info dialog
4. Verify colors are readable
5. Check all sections

**Expected**: ✅ Dialog has proper dark mode styles

### Test 6: Long Error Messages

**Steps**:
1. Trigger error with very long stack trace
2. Open error info dialog
3. Verify scrollable sections
4. Check dialog doesn't overflow screen

**Expected**: ✅ Dialog handles long content gracefully with scrolling

## Future Enhancements

### Potential Improvements

1. **Error Search/Filter**:
   - Search within error JSON
   - Filter by error type
   - Highlight search terms

2. **Error History**:
   - Keep last N errors in memory
   - Show error timeline
   - Compare errors

3. **Error Export**:
   - Download as JSON file
   - Export to bug tracker
   - Share via link

4. **Error Analytics**:
   - Count errors by type
   - Show error frequency
   - Identify patterns

5. **Smart Error Suggestions**:
   - Based on error type, suggest fixes
   - Link to documentation
   - Show similar resolved errors

6. **Error Notifications**:
   - Toast notification with error summary
   - Option to dismiss or view details
   - Persistent error badge

7. **Request Replay**:
   - If request data available, offer to retry
   - Show "Retry with same params" button
   - Exponential backoff for rate limits

8. **Error Context Enrichment**:
   - Show user's settings at time of error
   - Display enabled tools
   - Include browser/environment info

## Related Features

### Synergy with LLM Info Button (Phase 32)

The Error Info dialog follows the same design pattern as the LLM Info button:
- Full-screen modal dialog
- Expandable JSON tree
- Copy functionality
- Consistent button style
- Similar user experience

**Shared Patterns**:
- Both provide transparency (LLM calls vs Errors)
- Both use expandable trees for complex data
- Both have copy-to-clipboard
- Both integrate seamlessly into message flow

### Integration with Console.log Fix (Phase 33)

Errors often include execution results that use console.log:
- Error in JavaScript tool execution
- Console.log captures context
- Error dialog shows execution failure
- Complete picture of what went wrong

### Temporal Guidance (Phase 34)

Date/time errors now have full transparency:
- If JavaScript date query fails
- Error dialog shows exact failure
- Stack trace reveals issue
- User can see and report problem

## Lessons Learned

### Design Insights

1. **Progressive Disclosure**: Start with simple error message, provide details on demand
2. **Visual Hierarchy**: Color-code sections by importance and type
3. **Scanability**: Use consistent formatting and clear labels
4. **Accessibility**: Include ARIA labels and keyboard navigation
5. **Dark Mode First**: Design for both light and dark simultaneously

### Technical Insights

1. **Error Preservation**: Spread operator before specific fields to avoid overwrites
2. **Type Safety**: Use `any` for errorData to handle diverse error structures
3. **Conditional Rendering**: Check both errorData existence and content format
4. **Tree Recursion**: Limit auto-expansion depth to prevent performance issues
5. **JSON Serialization**: Handle circular references and non-serializable objects

### User Experience Insights

1. **Trust Through Transparency**: Users appreciate seeing what's happening
2. **Copy is King**: Always provide copy functionality for technical data
3. **Context Matters**: Show request ID and timestamp for support
4. **Visual Feedback**: Color-coding helps users quickly scan sections
5. **Don't Overwhelm**: Hide complexity behind expandable sections

## Conclusion

The Error Info Dialog provides complete error transparency, empowering users to understand failures, report issues effectively, and debug problems independently. By following the same design pattern as the LLM Info button, it maintains UI consistency while delivering powerful error inspection capabilities.

**Key Achievements**:
- ✅ Full error transparency with expandable JSON tree
- ✅ Organized sections for different error types
- ✅ Copy functionality for easy sharing
- ✅ Consistent design with existing features
- ✅ Dark mode support
- ✅ No performance impact on normal operation

**Impact**: Users can now see exactly what errors occurred, including upstream LLM provider errors, Lambda errors, stack traces, and request context, leading to better debugging, more detailed bug reports, and increased trust in the system.

---

**Deployment**: Commit 8e5cc6c  
**Timestamp**: October 9, 2025, 10:23:54 UTC  
**Phase**: 35  
**Related**: Phase 32 (LLM Info Button), Phase 33 (Console.log Fix), Phase 34 (Temporal Guidance)
