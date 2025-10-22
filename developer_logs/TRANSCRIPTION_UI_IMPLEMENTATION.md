# Transcription UI Components Implementation

## Overview

This document describes the frontend UI components implemented for the transcription enhancement feature. These components provide real-time visual feedback during audio/video transcription, including progress indicators, metadata display, expandable transcripts, and stop functionality.

**Implementation Date**: October 7, 2024  
**Status**: ✅ Complete and Deployed

---

## Components

### 1. TranscriptionProgress Component

**File**: `ui-new/src/components/TranscriptionProgress.tsx`

**Purpose**: Displays real-time progress for transcription operations with rich visual feedback.

#### Features

1. **Progress Bar**
   - Animated progress indicator (0-100%)
   - Color-coded by stage (blue=downloading, purple=chunking, green=transcribing)
   - Smooth transitions between stages

2. **Stage Indicator**
   - Current operation: Downloading, Chunking, Transcribing, Complete, Stopped, Error
   - Chunk counter for multi-chunk files (e.g., "Chunk 2 of 5")
   - Spinning loader animation during active operations

3. **Metadata Display** (YouTube videos)
   - Video thumbnail (24x16 thumbnail image)
   - Video title
   - Channel/author name
   - Duration in HH:MM:SS or MM:SS format

4. **Expandable Partial Transcript**
   - Real-time display of transcribed text as chunks complete
   - Collapsible panel with chevron icon
   - Scrollable container (max-height: 240px)
   - Shows chunk progress (e.g., "Show Partial Transcript (2 of 5 chunks)")

5. **Stop Button**
   - Visible during active transcription (downloading, chunking, transcribing)
   - Changes to "Stopping..." state when clicked
   - Calls backend /stop-transcription endpoint
   - Shows toast notification on success

6. **Status Messages**
   - ✅ "Transcription complete!" with checkmark icon
   - ⏸️ "Transcription stopped (X of Y chunks completed)" with stop icon
   - ❌ Error messages in red banner

#### Props Interface

```typescript
interface TranscriptionProgressProps {
  toolCallId: string;          // Unique ID for this transcription
  url: string;                 // Source URL (YouTube or direct media)
  events: ProgressEvent[];     // Array of progress events from SSE
  onStop: (toolCallId: string) => void;  // Stop handler function
}
```

#### Event Types

```typescript
const TranscriptionEventType = {
  YOUTUBE_DOWNLOAD_START: 'youtube_download_start',
  YOUTUBE_DOWNLOAD_PROGRESS: 'youtube_download_progress',
  YOUTUBE_DOWNLOAD_COMPLETE: 'youtube_download_complete',
  DOWNLOAD_START: 'download_start',
  DOWNLOAD_PROGRESS: 'download_progress',
  DOWNLOAD_COMPLETE: 'download_complete',
  METADATA: 'metadata',
  CHUNKING_START: 'chunking_start',
  CHUNK_READY: 'chunk_ready',
  TRANSCRIBE_START: 'transcribe_start',
  TRANSCRIBE_CHUNK_COMPLETE: 'transcribe_chunk_complete',
  TRANSCRIBE_COMPLETE: 'transcribe_complete',
  TRANSCRIPTION_STOPPED: 'transcription_stopped',
  ERROR: 'error'
};
```

#### Progress Event Structure

```typescript
interface ProgressEvent {
  tool_call_id: string;
  tool_name: string;
  event_type: TranscriptionEventType;
  data?: {
    percent?: number;           // Download progress percentage
    size?: number;              // File size in bytes
    fileSize?: number;          // Total file size
    chunks?: number;            // Total number of chunks
    totalChunks?: number;       // Total chunks (same as chunks)
    chunkIndex?: number;        // Current chunk index (1-based)
    text?: string;              // Partial transcription text
    title?: string;             // YouTube video title
    author?: string;            // YouTube channel name
    duration?: number;          // Video duration in seconds
    thumbnail?: string;         // YouTube thumbnail URL
    textLength?: number;        // Transcription text length
    completedChunks?: number;   // Chunks completed before stop
    error?: string;             // Error message
  };
}
```

#### Stage Calculation Logic

The component uses `useMemo` to calculate the current stage based on event history:

```typescript
const status = useMemo(() => {
  let stage = TranscriptionStage.DOWNLOADING;
  let progress = 0;
  let metadata = null;
  let partialText = '';
  let currentChunk = 0;
  let totalChunks = 1;
  let error = null;

  // Iterate through events to determine current state
  for (const event of events) {
    switch (event.event_type) {
      case 'download_progress':
        progress = event.data?.percent || 0;
        break;
      case 'chunking_start':
        stage = TranscriptionStage.CHUNKING;
        totalChunks = event.data?.chunks || 1;
        break;
      case 'transcribe_chunk_complete':
        stage = TranscriptionStage.TRANSCRIBING;
        partialText += event.data?.text || '';
        currentChunk = event.data?.chunkIndex || 0;
        progress = (currentChunk / totalChunks) * 100;
        break;
      // ... more cases
    }
  }

  return { stage, progress, metadata, partialText, currentChunk, totalChunks, error };
}, [events]);
```

#### Color Schemes

**Stage Colors** (text):
- Downloading: `text-blue-600 dark:text-blue-400`
- Chunking: `text-purple-600 dark:text-purple-400`
- Transcribing: `text-green-600 dark:text-green-400`
- Complete: `text-green-700 dark:text-green-300`
- Stopped: `text-yellow-600 dark:text-yellow-400`
- Error: `text-red-600 dark:text-red-400`

**Progress Bar Colors**:
- Downloading: `bg-blue-500`
- Chunking: `bg-purple-500`
- Transcribing: `bg-green-500`
- Complete: `bg-green-600`
- Stopped: `bg-yellow-500`
- Error: `bg-red-500`

#### Styling

- Container: White background with border, rounded corners, padding
- Dark mode: Gray-800 background with gray-600 border
- Animations: CSS transitions for progress bar width, chevron rotation
- Responsive: Works on mobile and desktop

---

### 2. ChatTab Integration

**File**: `ui-new/src/components/ChatTab.tsx`

#### State Management

```typescript
// Transcription progress tracking
const [transcriptionProgress, setTranscriptionProgress] = useState<Map<string, Array<{
  tool_call_id: string;
  tool_name: string;
  event_type: string;
  data?: Record<string, unknown>;
}>>>(new Map());
```

#### SSE Event Handler

Added `tool_progress` case to the streaming event handler:

```typescript
case 'tool_progress':
  // Transcription progress events (download, chunking, transcription)
  console.log('📊 Tool progress event:', data);
  if (data.tool_call_id) {
    setTranscriptionProgress(prev => {
      const newMap = new Map(prev);
      const events = newMap.get(data.tool_call_id) || [];
      newMap.set(data.tool_call_id, [...events, data]);
      return newMap;
    });
  }
  break;
```

#### Stop Transcription Handler

```typescript
const handleStopTranscription = async (toolCallId: string) => {
  try {
    const response = await fetch(`${settings.apiEndpoint.replace('/openai/v1', '')}/stop-transcription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ tool_call_id: toolCallId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to stop transcription');
    }

    showSuccess('Transcription stopped');
    console.log('Transcription stopped:', toolCallId);
  } catch (error) {
    console.error('Failed to stop transcription:', error);
    showError('Failed to stop transcription: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};
```

#### Component Rendering

TranscriptionProgress is rendered for `transcribe_url` tool messages:

```tsx
{/* Transcription Progress for transcribe_url tool */}
{msg.name === 'transcribe_url' && msg.tool_call_id && transcriptionProgress.has(msg.tool_call_id) && (
  <div className="mb-3">
    <TranscriptionProgress
      toolCallId={msg.tool_call_id}
      url={(() => {
        try {
          const parsed = JSON.parse(toolCall?.function?.arguments || '{}');
          return parsed.url || '';
        } catch {
          return '';
        }
      })()}
      events={transcriptionProgress.get(msg.tool_call_id) as ProgressEvent[] || []}
      onStop={handleStopTranscription}
    />
  </div>
)}
```

---

## User Flow

### Typical Transcription Flow

1. **User Submits Request**
   ```
   User: "Transcribe this YouTube video: https://youtube.com/watch?v=..."
   ```

2. **LLM Calls Tool**
   - LLM decides to use `transcribe_url` tool
   - Tool call shows in UI with function arguments

3. **Progress Events Start**
   - `youtube_download_start` → Progress bar appears, stage: "Downloading"
   - `youtube_download_progress` → Progress bar fills (0-100%)
   - `metadata` → Thumbnail, title, author displayed

4. **Large File Chunking** (if applicable)
   - `chunking_start` → Stage: "Chunking", shows total chunks
   - `chunk_ready` → Progress updates per chunk

5. **Transcription**
   - `transcribe_start` → Stage: "Transcribing", chunk indicator shown
   - `transcribe_chunk_complete` → Partial transcript displayed, expandable panel appears
   - User can click "Show Partial Transcript" to see progress

6. **Completion**
   - `transcribe_complete` → Stage: "Complete", green checkmark
   - Full transcript appears in tool result
   - Progress component remains visible showing final state

### Stop Flow

1. **User Clicks Stop Button**
   - Button changes to "Stopping..." state
   - POST request sent to `/stop-transcription`

2. **Backend Processes Stop**
   - `registerStopSignal(toolCallId)` called
   - Transcription loop checks signal between chunks
   - Partial transcription returned

3. **UI Updates**
   - `transcription_stopped` event received
   - Stage: "Stopped", yellow color
   - Shows "Transcription stopped (X of Y chunks completed)"
   - Partial transcript remains visible and expanded

---

## Styling Details

### Progress Bar Animation

```css
/* Smooth width transitions */
.transition-all.duration-300.ease-out {
  transition: all 300ms ease-out;
}
```

### Expandable Transcript

```tsx
<button onClick={() => setIsExpanded(!isExpanded)}>
  <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
    {/* Chevron icon */}
  </svg>
</button>

{isExpanded && (
  <div className="max-h-60 overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded p-3">
    {status.partialText}
  </div>
)}
```

### Dark Mode Support

All colors have dark mode variants using Tailwind's `dark:` prefix:
- Backgrounds: `bg-white dark:bg-gray-800`
- Text: `text-gray-900 dark:text-gray-100`
- Borders: `border-gray-300 dark:border-gray-600`

### Responsive Design

- Max width: 80% of container
- Thumbnail: Fixed 24x16 size (scales down on mobile)
- Text: Truncates with ellipsis for long titles
- Scrollable transcript: Max height 240px

---

## Visual Examples

### Downloading State

```
┌─────────────────────────────────────────┐
│ [Thumbnail] Video Title                 │
│            Channel Name                 │
│            Duration: 3:45               │
│                              [Stop]     │
│                                         │
│ Downloading ⟳                           │
│ ████████████░░░░░░░░░░░░░░░░░░ 45%     │
│ 45% complete                            │
└─────────────────────────────────────────┘
```

### Transcribing with Chunks

```
┌─────────────────────────────────────────┐
│ [Thumbnail] Long Podcast Episode        │
│            Podcast Channel              │
│            Duration: 1:30:00            │
│                              [Stop]     │
│                                         │
│ Transcribing (Chunk 2 of 5) ⟳          │
│ ████████░░░░░░░░░░░░░░░░░░░░░░ 40%     │
│ 40% complete                            │
│                                         │
│ ▶ Show Partial Transcript (2 of 5)     │
└─────────────────────────────────────────┘
```

### Expanded Transcript

```
┌─────────────────────────────────────────┐
│ [Thumbnail] Interview                   │
│            Interview Channel            │
│            Duration: 45:23              │
│                              [Stop]     │
│                                         │
│ Transcribing (Chunk 3 of 4) ⟳          │
│ ██████████████████░░░░░░░░░░░░ 75%     │
│ 75% complete                            │
│                                         │
│ ▼ Hide Partial Transcript (3 of 4)     │
│ ┌─────────────────────────────────────┐ │
│ │ Welcome to the show. Today we're   │ │
│ │ talking about...                   │ │
│ │                                    │ │
│ │ [Chapter 1 text]                   │ │
│ │                                    │ │
│ │ [Chapter 2 text]                   │ │
│ │                                    │ │
│ │ And now let's discuss...           │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Complete State

```
┌─────────────────────────────────────────┐
│ [Thumbnail] Tutorial Video              │
│            Tutorial Channel             │
│            Duration: 12:34              │
│                                         │
│ Complete                                │
│ ████████████████████████████████ 100%  │
│ 100% complete                           │
│                                         │
│ ✅ Transcription complete!              │
└─────────────────────────────────────────┘
```

### Stopped State

```
┌─────────────────────────────────────────┐
│ [Thumbnail] Long Lecture                │
│            University Channel           │
│            Duration: 2:15:00            │
│                                         │
│ Stopped                                 │
│ ████████░░░░░░░░░░░░░░░░░░░░░░ 40%     │
│ 40% complete                            │
│                                         │
│ ⏸️ Transcription stopped (2 of 5       │
│    chunks completed)                    │
└─────────────────────────────────────────┘
```

---

## API Integration

### Backend SSE Events

The component consumes Server-Sent Events from the backend `/chat` endpoint:

```
event: tool_progress
data: {"tool_call_id":"call-123","tool_name":"transcribe_url","event_type":"download_progress","data":{"percent":45}}

event: tool_progress
data: {"tool_call_id":"call-123","tool_name":"transcribe_url","event_type":"metadata","data":{"title":"Video Title","author":"Channel","duration":212,"thumbnail":"https://..."}}

event: tool_progress
data: {"tool_call_id":"call-123","tool_name":"transcribe_url","event_type":"transcribe_chunk_complete","data":{"chunkIndex":1,"totalChunks":3,"text":"First chunk transcription..."}}
```

### Stop Transcription Endpoint

```http
POST /stop-transcription
Authorization: Bearer <google-oauth-token>
Content-Type: application/json

{
  "tool_call_id": "call-123"
}
```

**Response** (Success):
```json
{
  "success": true,
  "message": "Stop signal registered",
  "tool_call_id": "call-123"
}
```

**Response** (Error):
```json
{
  "success": false,
  "error": "tool_call_id is required and must be a string"
}
```

---

## Testing Checklist

### Visual Testing

- [ ] Progress bar animates smoothly from 0-100%
- [ ] Colors change correctly for each stage
- [ ] Dark mode colors render properly
- [ ] Spinner animation displays during active stages
- [ ] Thumbnail displays correctly (YouTube videos)
- [ ] Video metadata (title, author, duration) renders
- [ ] Duration formats correctly (MM:SS and HH:MM:SS)
- [ ] Text truncates with ellipsis for long titles
- [ ] Component is responsive on mobile/desktop

### Functional Testing

- [ ] Progress events update the UI in real-time
- [ ] Partial transcript appears after first chunk
- [ ] Expand/collapse transcript works
- [ ] Transcript scrolls when content exceeds max-height
- [ ] Stop button appears during active transcription
- [ ] Stop button changes to "Stopping..." when clicked
- [ ] Stop button disappears when transcription complete
- [ ] Stop request sends correct tool_call_id
- [ ] Toast notification shows on stop success/error
- [ ] Complete message appears with checkmark
- [ ] Stopped message appears with chunk count
- [ ] Error message displays in red banner

### Edge Cases

- [ ] Direct URL (no metadata) displays correctly
- [ ] Single-chunk file (no chunking stage)
- [ ] Very large files (5+ chunks)
- [ ] Stop during download stage
- [ ] Stop during chunking stage
- [ ] Stop during transcription stage
- [ ] Network errors during stop request
- [ ] Missing thumbnail (YouTube private video)
- [ ] Very long video titles
- [ ] Zero-duration videos
- [ ] Transcripts with special characters
- [ ] Transcripts with multiple languages

---

## Known Limitations

1. **Progress Persistence**: Progress state is lost on page refresh (in-memory only)
2. **Multiple Simultaneous Transcriptions**: UI supports it, but may be cluttered
3. **Very Long Transcripts**: No pagination, entire text loaded in memory
4. **Thumbnail Placeholder**: No default image for failed thumbnail loads
5. **Stop Timing**: Small delay between stop button click and backend response
6. **Mobile Layout**: Thumbnail may be small on narrow screens
7. **Accessibility**: No ARIA labels or screen reader support yet

---

## Future Enhancements

### UI Improvements

1. **Progress Persistence**
   - Store progress in localStorage
   - Resume display on page reload

2. **Enhanced Metadata**
   - View count, publish date
   - Video category/tags
   - Related videos

3. **Transcript Features**
   - Copy transcript button
   - Download as .txt or .srt
   - Search within transcript
   - Timestamp links (click to jump to video time)

4. **Visual Polish**
   - Smooth fade-in animations
   - Pulse effect on active elements
   - Better loading skeleton
   - Confetti on completion 🎉

5. **Accessibility**
   - ARIA labels for all interactive elements
   - Keyboard navigation support
   - Screen reader announcements
   - Focus management

### Functional Improvements

1. **Batch Operations**
   - Queue multiple transcriptions
   - Show list of all active transcriptions
   - Bulk stop functionality

2. **Error Recovery**
   - Retry failed chunks
   - Resume interrupted transcriptions
   - Better error messages with suggestions

3. **Performance**
   - Virtual scrolling for very long transcripts
   - Lazy load progress events
   - Optimize re-renders with React.memo

---

## Deployment

**Build Command**:
```bash
cd ui-new && npm run build
```

**Deploy Command**:
```bash
./scripts/deploy-docs.sh -m "feat: Add transcription progress UI"
```

**Build Output**:
```
✓ 510 modules transformed.
../docs/assets/index-28ZtT644.css      42.12 kB │ gzip:   8.60 kB
../docs/assets/index-CmCZLbzD.js      620.38 kB │ gzip: 187.19 kB
✓ built in 1.87s
```

**Deployed**: October 7, 2024  
**Live URL**: https://lambdallmproxy.pages.dev

---

## Conclusion

The transcription UI components are now **fully implemented and deployed**. Users have complete visibility into transcription progress with:

✅ Real-time progress updates  
✅ Visual stage indicators  
✅ YouTube video metadata  
✅ Expandable partial transcripts  
✅ Stop button functionality  
✅ Dark mode support  
✅ Responsive design  

The UI provides a polished, professional experience for long-running transcription operations.

---

**Document Version**: 1.0  
**Last Updated**: October 7, 2024  
**Author**: AI Assistant (Claude)  
**Status**: Complete and Deployed
