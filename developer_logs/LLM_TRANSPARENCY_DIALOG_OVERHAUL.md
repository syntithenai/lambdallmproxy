# LLM Transparency Dialog - Comprehensive Overhaul

## Summary

Completely redesigned the LLM API transparency dialog with modern UI, detailed request/response information, token/cost metrics, and comprehensive logging of all API call types including voice transcription.

## Implementation Date

December 2024

## Changes Overview

### 1. New Dialog Component (`LlmInfoDialogNew.tsx`)

Created a completely new dialog component with:

- **JsonTree Component**: Expandable JSON viewer with syntax highlighting and copy-to-clipboard functionality
- **ApiCallCard Component**: Individual API call display with:
  - Color-coded badges for call types (guardrail, image, transcription, assessment, chat, etc.)
  - Metrics grid showing prompt tokens, completion tokens, total tokens, duration
  - Expandable sections for request/response headers and body
  - Copy buttons for all JSON sections
- **Grand Totals Footer**: Aggregates all metrics across all calls:
  - Total API calls
  - Total prompt tokens
  - Total completion tokens
  - Combined total tokens
  - Total cost with currency formatting

### 2. UX Improvements

- **Click-Outside-to-Close**: Implemented via `useDialogClose` hook
- **Large Close Button**: 12x12 (w-12 h-12) X button in top-right corner
- **No Bottom Close Button**: Removed redundant footer close button
- **Modern Styling**:
  - Gradient backgrounds (from-gray-900 to-gray-800)
  - Better shadows and rounded corners (rounded-2xl)
  - Improved spacing and typography
  - Color-coded call type badges
  - Smooth transitions and hover effects

### 3. Call Type Support

Verified and ensured all LLM call types are logged and displayed:

- ✅ **Guardrails** (input/output): Already logged in `chat.js` with types 'guardrail_input', 'guardrail_output'
- ✅ **Images**: Already logged in `generate-image.js` with llmApiCall object
- ✅ **Self-Assessment**: Already logged in `chat.js` with type 'self_evaluation'
- ✅ **Whisper Transcription**: Added llmApiCall tracking to `transcribe.js` endpoint
- ℹ️ **TTS**: Client-side browser Speech Synthesis API (no backend calls to log)

### 4. Voice Transcription Integration

Complete end-to-end integration of transcription llmApiCall:

**Backend (`src/endpoints/transcribe.js`)**:
- Lines 352-390: Create llmApiCall object after successful transcription
- Includes: phase, provider, model, type, timestamp, durationMs, cost, success
- Request data: filename, audioSize, estimatedMinutes
- Response data: text, textLength
- Metadata: audioHash, cached status
- Line ~440: Added llmApiCall to JSON response body

**Frontend - VoiceInputDialog (`ui-new/src/components/VoiceInputDialog.tsx`)**:
- Line 7: Updated interface to accept llmApiCall parameter in onTranscriptionComplete callback
- Lines 230-232: Extract llmApiCall from transcription response data
- Line 236: Pass llmApiCall to parent along with text and requestId

**Frontend - ChatTab (`ui-new/src/components/ChatTab.tsx`)**:
- Line 567: Added `voiceLlmApiCallRef` to store transcription llmApiCall
- Line 571: Updated `handleVoiceTranscription` to accept and store llmApiCall parameter
- Lines 1659-1663: Add transcription llmApiCall to user message `_llmApiCalls` array
- Result: Transcription calls now appear in LLM info dialog for user messages

## File Changes

### New Files
- `ui-new/src/components/LlmInfoDialogNew.tsx` (400+ lines)

### Modified Files
1. `ui-new/src/components/ChatTab.tsx`:
   - Updated import to use LlmInfoDialogNew
   - Added voiceLlmApiCallRef for storing transcription llmApiCall
   - Updated handleVoiceTranscription signature
   - Added llmApiCall to user message when voice input is used

2. `src/endpoints/transcribe.js`:
   - Added llmApiCall object creation after successful transcription
   - Included llmApiCall in response body

3. `ui-new/src/components/VoiceInputDialog.tsx`:
   - Updated props interface to include llmApiCall in callback
   - Extract llmApiCall from transcription response
   - Pass llmApiCall to parent component

## Technical Details

### Call Type Styling

Each call type has distinct visual styling:

```javascript
const callTypeInfo = {
  guardrail_input: { color: 'orange', border: 'border-orange-500/30', text: 'text-orange-400', icon: '🛡️' },
  guardrail_output: { color: 'orange', border: 'border-orange-500/30', text: 'text-orange-400', icon: '🛡️' },
  image_generation: { color: 'purple', border: 'border-purple-500/30', text: 'text-purple-400', icon: '🎨' },
  transcription: { color: 'pink', border: 'border-pink-500/30', text: 'text-pink-400', icon: '🎙️' },
  embedding: { color: 'cyan', border: 'border-cyan-500/30', text: 'text-cyan-400', icon: '🔢' },
  planning: { color: 'yellow', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: '📋' },
  assessment: { color: 'green', border: 'border-green-500/30', text: 'text-green-400', icon: '✅' },
  chat: { color: 'blue', border: 'border-blue-500/30', text: 'text-blue-400', icon: '💬' }
}
```

### Token Calculation

Tokens are extracted from `response.usage`:
- `prompt_tokens`: Input tokens
- `completion_tokens`: Output tokens  
- `total_tokens`: Combined total

### Cost Formatting

Uses `formatCost` utility to display prices:
- Shows currency symbol ($)
- Formats to 4 decimal places for small amounts
- Handles zero/null values gracefully

## User Experience Flow

1. **User sends message via voice input**
2. **Audio recorded and uploaded to `/transcribe` endpoint**
3. **Backend processes transcription and returns llmApiCall object**
4. **VoiceInputDialog extracts llmApiCall and passes to ChatTab**
5. **ChatTab stores llmApiCall in user message metadata**
6. **User clicks "LLM Info" icon on message**
7. **Dialog displays all API calls including transcription**
8. **User can expand JSON sections, copy data, view metrics**

## Testing

To verify the implementation:

1. **Use voice input** to record a message
2. **Check console** for log: `🎙️ Added voice transcription llmApiCall to user message`
3. **Click LLM info icon** on the user message
4. **Verify transcription call appears** with:
   - Pink "🎙️ transcription" badge
   - Token/cost metrics
   - Expandable request/response JSON
   - Audio file metadata (filename, size, duration)

## Future Enhancements

Potential improvements:
- Add search/filter for specific call types
- Add download button for all API data as JSON
- Add timeline view showing call sequence
- Add comparison view for retry/continuation scenarios
- Add export to CSV for cost analysis

## Notes

- **TTS Not Applicable**: Text-to-speech uses browser's Speech Synthesis API which is client-side and free, so there are no backend API calls to log
- **Backward Compatible**: Old LlmInfoDialog component still exists but is not used (could be removed in cleanup)
- **Message Metadata**: Uses `_llmApiCalls` array in message objects (underscore prefix indicates internal metadata)
- **Request ID Grouping**: Backend uses X-Request-ID header to group related API calls

## Related Documentation

- See `developer_logs/CHAT_ENDPOINT_DOCUMENTATION.md` for backend API structure
- See `developer_logs/COMPREHENSIVE_EXAMPLES_UPDATE.md` for example integration
- See `developer_logs/VOICE_INPUT_MULTIPART_FIX.md` for transcription endpoint details
