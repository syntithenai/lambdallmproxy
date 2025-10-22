# LLM Info Dialog Copy Buttons Feature

## Summary
Added copy buttons to all LLM Info dialog JSON blocks (Request, Response, and Headers) with toast notifications.

## Changes Made

### File: `ui-new/src/components/LlmInfoDialog.tsx`

#### 1. Added Toast Integration
- Imported `useToast` from ToastManager
- Added toast hooks for success and error notifications

#### 2. Implemented Copy Function
```typescript
const copyToClipboard = async (data: any, label: string) => {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(jsonString);
    showSuccess(`${label} copied to clipboard!`);
  } catch (err) {
    showError(`Failed to copy ${label}`);
    console.error('Copy failed:', err);
  }
};
```

#### 3. Added Copy Buttons to Three Sections

**Request Body Section:**
- Added blue copy button with clipboard icon
- Label: "Copy Request"
- Copies the full request JSON with proper formatting

**Response Headers Section:**
- Added blue copy button with clipboard icon
- Label: "Copy Headers"
- Copies HTTP response headers as JSON

**Response Section:**
- Added blue copy button with clipboard icon
- Label: "Copy Response"
- Copies the full response JSON including all nested data

## User Experience

### Button Design
- Small, unobtrusive buttons positioned next to section headers
- Blue background (`bg-blue-100 dark:bg-blue-900/30`)
- Clipboard icon for visual recognition
- Hover effect for better interactivity
- Consistent styling across all three sections

### Toast Notifications
- **Success**: "Request copied to clipboard!" (or Headers/Response)
- **Error**: "Failed to copy Request" (or Headers/Response)
- Automatic dismissal after a few seconds

## Usage

1. Open any LLM Info dialog (click the ℹ️ icon on messages or planning results)
2. Find the section you want to copy (Request, Headers, or Response)
3. Click the "Copy" button next to the section header
4. JSON is copied to clipboard with proper formatting (indented with 2 spaces)
5. Toast notification confirms the action

## Benefits

- **Developer Debugging**: Easy copying of request/response data for analysis
- **API Testing**: Quick extraction of exact API calls for reproduction
- **Documentation**: Simple way to capture real examples for documentation
- **Troubleshooting**: Immediate access to headers for debugging auth/rate-limit issues
- **Data Analysis**: Export JSON for external tools or comparison

## Technical Details

- Uses browser's native `navigator.clipboard.writeText()` API
- JSON formatted with `JSON.stringify(data, null, 2)` for readability
- Graceful error handling with user feedback
- Works in both light and dark modes
- Accessible with keyboard navigation

## Deployment

- **UI Deployed**: 2025-10-14 18:54 UTC
- **Commit**: a8bd027
- **Branch**: agent
- **Live URL**: https://lambdallmproxy.pages.dev

## Testing

Test by:
1. Making a chat request that uses LLMs
2. Clicking the ℹ️ icon to view LLM transparency info
3. Clicking each Copy button (Request, Headers, Response)
4. Verifying toast notifications appear
5. Pasting clipboard content to verify JSON formatting
