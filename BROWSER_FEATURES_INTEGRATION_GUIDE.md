# Browser Features Integration Guide

## Quick Start

The browser features system has been fully implemented. To integrate it into ChatTab:

### 1. Import the hook and dialog

```typescript
import { useBrowserFeatures } from '../hooks/useBrowserFeatures';
import { CodeReviewDialog } from './CodeReviewDialog';
```

### 2. Initialize the hook

```typescript
const {
  codeReviewRequest,
  showCodeReview,
  handleBrowserFeatureCall,
  approveCodeReview,
  rejectCodeReview,
  alwaysAllowCodeReview
} = useBrowserFeatures();
```

### 3. Add execute_browser_feature tool definition

Add to your tools array when sending messages:

```typescript
{
  type: 'function',
  function: {
    name: 'execute_browser_feature',
    description: 'Execute browser features like JavaScript, DOM manipulation, storage, clipboard, etc.',
    parameters: {
      type: 'object',
      properties: {
        feature: {
          type: 'string',
          enum: [
            'javascript', 'storage_read', 'storage_write',
            'clipboard_read', 'clipboard_write', 'notification',
            'geolocation', 'file_read', 'screenshot',
            'dom_query', 'dom_manipulate'
          ],
          description: 'The browser feature to execute'
        },
        description: {
          type: 'string',
          description: 'Human-readable description of what this will do'
        },
        // Feature-specific parameters
        code: { type: 'string' },
        storage_key: { type: 'string' },
        storage_value: { type: 'string' },
        clipboard_text: { type: 'string' },
        // ... other parameters
      },
      required: ['feature']
    }
  }
}
```

### 4. Handle tool calls in SSE stream

When processing tool calls from the stream:

```typescript
// Check if this is a browser feature call
if (toolCall.function?.name === 'execute_browser_feature') {
  const result = await handleBrowserFeatureCall(toolCall);
  
  // Add tool result to messages and re-submit
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify(result)
  });
  
  // Re-submit request with tool result
  sendRequest(messages);
}
```

### 5. Add CodeReviewDialog to JSX

```typescript
<CodeReviewDialog
  isOpen={showCodeReview}
  request={codeReviewRequest}
  onApprove={approveCodeReview}
  onReject={rejectCodeReview}
  onAlwaysAllow={alwaysAllowCodeReview}
/>
```

## Features

### 11 Browser Features Implemented

1. **javascript** - Execute sandboxed JavaScript code
2. **storage_read** - Read from localStorage/sessionStorage
3. **storage_write** - Write to localStorage/sessionStorage
4. **clipboard_read** - Read clipboard contents
5. **clipboard_write** - Write to clipboard
6. **notification** - Show browser notifications
7. **geolocation** - Get device location
8. **file_read** - Read local files (user picker)
9. **screenshot** - Capture screenshots (placeholder)
10. **dom_query** - Query page elements
11. **dom_manipulate** - Modify page elements

### Security Features

- **Risk Levels**: HIGH (javascript, dom_manipulate), MEDIUM (storage_write, file_read, geolocation), LOW (others)
- **Code Review**: Always/Risky-Only/Timeout modes
- **Sandboxing**: Web Workers with limited API access
- **Timeouts**: 10s execution limit, 5s setTimeout limit
- **Size Limits**: 10KB result size limit
- **Audit Logging**: All executions logged to history

### Settings

Users can configure browser features in Settings > Browser:

- Enable/disable individual features
- Set code review mode (always/risky-only/timeout)
- Configure auto-approve timeout (5-120 seconds)
- View execution history

### Code Review Dialog

Shows:
- Feature name and risk level
- Description
- Code to execute (with editing capability)
- Arguments
- Safety tips

Actions:
- Approve & Execute
- Approve with Edits
- Reject
- Always Allow (low-risk only, session-based)

### Execution History

- Last 100 executions stored
- Success/failure tracking
- Export as JSON
- Delete individual entries
- Full details (code, args, result, duration)

## Files Created

### Core Services
- `ui-new/src/services/clientTools/types.ts` - Type definitions
- `ui-new/src/services/clientTools/ClientToolRegistry.ts` - Tool registry
- `ui-new/src/services/clientTools/JavaScriptSandbox.ts` - Sandboxed execution
- `ui-new/src/services/clientTools/tools/ExecuteBrowserFeature.ts` - Feature handlers
- `ui-new/src/services/clientTools/index.ts` - Exports

### Components
- `ui-new/src/components/CodeReviewDialog.tsx` - Code review UI
- `ui-new/src/components/ExecutionHistoryPanel.tsx` - History viewer
- `ui-new/src/components/BrowserFeaturesSettings.tsx` - Settings UI

### Hooks
- `ui-new/src/hooks/useBrowserFeatures.ts` - Integration hook

### Updated
- `ui-new/src/components/SettingsModal.tsx` - Added Browser tab

## Testing

Test the implementation:

1. Enable a feature in Settings > Browser
2. Ask AI to use it: "Read my clipboard" or "Store 'test' in localStorage as 'myKey'"
3. Review and approve the code
4. Check execution history

## Next Steps

1. Integrate into ChatTab.tsx (follow guide above)
2. Add comprehensive tests
3. Test all 11 features
4. Update documentation
5. Consider adding more features (WebSocket, IndexedDB, etc.)

## Security Notes

⚠️ **IMPORTANT**:
- Always review code before approval
- High-risk features should NEVER auto-approve
- Sandbox is NOT a perfect security barrier
- Trust but verify AI-generated code
- Monitor execution history for suspicious activity

## Support

For issues or questions:
- Check execution history for errors
- Review browser console for logs
- Ensure features are enabled in settings
- Verify tool definitions match schema
