# LLM Transparency and Streaming Indicator Improvements

## Changes Made

### 1. Self-Evaluation Display in LLM Transparency

**Problem**: Self-evaluation API calls were shown in a simplified format at the bottom of the dialog, different from other API calls. They didn't show the full request/response JSON trees.

**Solution**: Self-evaluations are now displayed as regular API calls with full request/response JSON trees.

#### Files Modified:

**ui-new/src/components/LlmInfoDialog.tsx**:
- Removed the special "Response Evaluation" section at the bottom
- Self-evaluation calls (with `phase === 'self_evaluation'`) are now rendered as regular API call blocks
- Each self-evaluation shows:
  - Full request body with expandable JSON tree
  - Full response with expandable JSON tree
  - Cost breakdown
  - Token usage
  - Provider and model information
  - Evaluation result badge (✅ Comprehensive or ⚠️ Needs Improvement)
  - Copy buttons for request and response

**Display Format**:
```
🔍 Self-Evaluation • Provider • model-name
💰 $0.0001 • 📥 150 in • 📤 50 out • ✅ Comprehensive
⏰ Timestamp

📤 Request Body [Copy button]
[Expandable JSON tree]

📥 Response [Copy button]
[Expandable JSON tree]
```

### 2. Streaming Indicator Placement

**Problem**: The "Generating LLM response..." indicator was embedded inside the last tool result block, making it hard to notice.

**Solution**: Moved the streaming indicator to a prominent separate block that appears AFTER tool results and LLM response.

#### Files Modified:

**ui-new/src/components/ChatTab.tsx**:
- Removed streaming indicator from inside tool result blocks
- Added new dedicated streaming indicator block after the toolResults section
- Styled as a prominent blue box with:
  - Larger spinner (6x6)
  - Bold heading "Generating LLM Response..."
  - Descriptive subtitle "The AI is analyzing the tool results and composing a response"
  - Blue background with border
  - More visual prominence

**Display Format**:
```
┌──────────────────────────────────────────────┐
│ [Spinner] Generating LLM Response...         │
│           The AI is analyzing the tool       │
│           results and composing a response   │
└──────────────────────────────────────────────┘
```

**Placement**:
- Appears AFTER all tool results have been displayed
- Appears AFTER any LLM response content (if started)
- Shows only when:
  - Message is currently streaming (`msg.isStreaming`)
  - Tool results exist (`msg.toolResults && msg.toolResults.length > 0`)
- Automatically disappears when streaming completes

## Technical Details

### Self-Evaluation Filtering:
```typescript
apiCalls.filter(call => call.phase === 'self_evaluation')
```

Extracts evaluation calls from the API calls array and displays them with the same format as planning, tool_iteration, and final_synthesis phases.

### Streaming Indicator Conditions:
```typescript
{msg.isStreaming && msg.toolResults && msg.toolResults.length > 0 && (
  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 ...">
    ...
  </div>
)}
```

Only shows when tool results are present and the message is actively streaming.

## Benefits

### Self-Evaluation Display:
1. **Consistency**: All API calls now follow the same display format
2. **Transparency**: Full request/response visibility for debugging
3. **Copy Functionality**: Easy to copy evaluation prompts and responses
4. **Token Tracking**: See exact token usage for self-evaluation
5. **Cost Transparency**: Track cost of self-evaluation calls

### Streaming Indicator:
1. **Visibility**: Much more prominent and noticeable
2. **Context**: Clear messaging about what's happening
3. **Separation**: Visual separation from tool results and content
4. **Styling**: Eye-catching blue theme that stands out
5. **Professional**: Looks polished with descriptive text

## Testing

To test these changes:

1. **Self-Evaluation Display**:
   - Make a query that triggers planning with self-evaluation
   - Click the LLM info button (ⓘ)
   - Scroll to see self-evaluation calls displayed as regular API calls
   - Verify request/response JSON trees are expandable
   - Test copy buttons

2. **Streaming Indicator**:
   - Scrape a webpage or perform a search
   - Watch for the tool result to appear
   - Look for the blue "Generating LLM Response..." box AFTER the tool result
   - Verify it appears in a separate, prominent block
   - Confirm it disappears when the LLM response completes
