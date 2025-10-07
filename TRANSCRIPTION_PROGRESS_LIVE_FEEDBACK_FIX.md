# Transcription Progress Live Feedback Fix

## Problem

User reported: "I don't see live feedback in the transcription tool blocks even for a long example. What does happen is that the toolblock is shown then disappears for a period before delivering a final response."

## Root Cause Analysis

The issue had two parts:

### 1. Backend: Missing Progress Emitter in `/chat` Endpoint

The `/chat` endpoint (used by the React UI) was NOT setting up the `onProgress` callback for transcription tools, while the main Lambda handler was.

**Missing code** in `src/endpoints/chat.js`:
```javascript
// Set up progress emitter for transcription tool
if (name === 'transcribe_url' && sseWriter.writeEvent) {
    toolContext.onProgress = createProgressEmitter(sseWriter.writeEvent, id, 'transcribe_url');
}
```

Without this, the transcription tool had no way to emit progress events back to the frontend.

### 2. Frontend: Hidden Tool Execution Messages

The ChatTab component was skipping assistant messages with `tool_calls` but no content:

```typescript
// This caused the message to disappear during execution!
if (msg.role === 'assistant' && !msg.content && msg.tool_calls) {
    return null;
}
```

The progress events WERE being collected, but there was no UI element to display them.

## Solution

### Backend Fix
- Added `createProgressEmitter` import to `/chat` endpoint
- Set up `onProgress` callback for `transcribe_url` tool execution

### Frontend Fix
- Modified message skip logic to keep messages with active transcription
- Added `TranscriptionProgress` component rendering in assistant messages during execution

## Testing

Test with: `Transcribe this: https://llmproxy-media-samples.s3.amazonaws.com/audio/long-form-ai-speech.mp3`

Expected behavior:
- ✅ Tool execution message stays visible
- ✅ Progress shows download, chunking, and transcription status
- ✅ Stop button functional during execution
- ✅ Live updates for each chunk (1/3, 2/3, 3/3)

## Deployment

- Backend: `make fast` (commit: 2a5368f)
- Frontend: Built and pushed
- Status: ✅ Live at https://lambdallmproxy.pages.dev
