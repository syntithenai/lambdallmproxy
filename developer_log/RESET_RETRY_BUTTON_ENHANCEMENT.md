# Reset and Retry Button Enhancement - October 6, 2025

## Summary

Enhanced the chat UI by moving the reset button to the bottom of user messages alongside assistant message actions, and added a new "Retry" button that automatically resubmits queries. Removed confirmation dialogs for a smoother user experience.

## Changes Made

### 1. Button Placement
- **Before**: Reset button was displayed at the top-right of user messages
- **After**: Both Reset and Retry buttons are at the bottom of user messages, matching the style of assistant message actions (Copy, Gmail)

### 2. Button Styling
- Consistent with assistant message buttons (Copy, Gmail)
- Small icons with text labels
- Gray color scheme with hover effects
- Proper spacing and alignment

### 3. New Retry Button

**Functionality:**
1. Restores the user message content to the input field
2. Clears all messages after the selected message
3. Clears tool status and streaming state
4. **Automatically submits the query** (key difference from Reset)

**Use Cases:**
- Model returned an error → Retry with same input
- Response was incomplete → Retry to get a better answer
- Rate limit was hit → Retry after waiting
- Want to regenerate response with different model (change settings first, then retry)

### 4. Reset Button Enhancement

**Functionality:**
1. Restores the user message content to the input field
2. Clears all messages after the selected message
3. Clears tool status and streaming state
4. **Waits for user to edit and manually submit**

**Use Cases:**
- Want to modify the query before resubmitting
- Need to change system prompt or settings
- Want to review the query before sending
- Need to add more context to the query

### 5. Removed Confirmations

**Before**: Both buttons showed a confirmation dialog:
```javascript
if (window.confirm('Reset chat to this message?...'))
```

**After**: No confirmation dialogs - direct action

**Rationale:**
- Actions are easily reversible (can always retry or reset again)
- Reduces friction in chat interaction
- User messages are still preserved in localStorage
- Matches modern chat UX patterns (ChatGPT, Claude, etc.)

## Visual Layout

### Before
```
┌─────────────────────────────────┐
│ 👤 User                    🔄   │  ← Reset at top-right
│                                 │
│ What is the capital of France? │
│                                 │
└─────────────────────────────────┘
```

### After
```
┌─────────────────────────────────┐
│ 👤 User                         │
│                                 │
│ What is the capital of France? │
│                                 │
│ ────────────────────────────── │  ← Border separator
│ 🔄 Reset    ↻ Retry            │  ← Buttons at bottom
└─────────────────────────────────┘
```

## Code Changes

### File: `ui-new/src/components/ChatTab.tsx`

**Location**: Lines 765-808 (approximately)

**Key Changes:**

1. **Moved button section** from standalone position to inside the message content area
2. **Added border separator** matching assistant message style
3. **Created button container** with consistent styling
4. **Added Retry button** with async click handler
5. **Updated Reset button** to match new style
6. **Removed confirmation dialog** from Reset button
7. **Added auto-submit** to Retry button using `handleSend()`

### Button Click Handlers

#### Reset Button
```typescript
onClick={() => {
  setInput(msg.content);
  setMessages(messages.slice(0, idx));
  setToolStatus([]);
  setStreamingContent('');
}}
```

#### Retry Button
```typescript
onClick={async () => {
  setInput(msg.content);
  const newMessages = messages.slice(0, idx);
  setMessages(newMessages);
  setToolStatus([]);
  setStreamingContent('');
  await handleSend();  // Auto-submit
}}
```

## User Experience Improvements

### Before
1. User sees suboptimal response
2. Clicks small reset button at top-right
3. Confirms dialog ("Are you sure?")
4. Message restored to input
5. User clicks Send
6. Response generated

**Steps**: 6 actions, includes confirmation

### After (Retry)
1. User sees suboptimal response
2. Clicks Retry button at bottom
3. Response immediately regenerated

**Steps**: 2 actions, no confirmation

### After (Reset + Edit)
1. User sees suboptimal response
2. Clicks Reset button at bottom
3. Edits message in input field
4. Clicks Send
5. Response generated

**Steps**: 4 actions, no confirmation

## Behavior Consistency

### Reset Button
- ✅ Clears subsequent messages
- ✅ Restores message to input
- ✅ Clears tool execution state
- ✅ Clears streaming state
- ✅ Waits for user action
- ❌ Does NOT auto-submit

### Retry Button
- ✅ Clears subsequent messages
- ✅ Restores message to input
- ✅ Clears tool execution state
- ✅ Clears streaming state
- ✅ **Auto-submits query**
- ✅ Uses current settings (model, system prompt, tools)

## Testing Scenarios

### Test 1: Reset Workflow
1. Send message: "What is the capital of France?"
2. Get response: "Paris"
3. Send message: "And Germany?"
4. Get response: "Berlin"
5. Click Reset on "What is the capital of France?"
6. **Expected**: Message restored to input, "And Germany?" conversation removed
7. **Verify**: Can edit message before sending

### Test 2: Retry Workflow
1. Send message: "What is the capital of France?"
2. Get response: "Paris"
3. Send message: "And Germany?"
4. Get error or bad response
5. Click Retry on "And Germany?"
6. **Expected**: Message automatically resubmitted, new response generated
7. **Verify**: Query sent without manual confirmation

### Test 3: Model Switch + Retry
1. Send message with model A: "Explain quantum computing"
2. Get basic response
3. Open Settings → Switch to more powerful model B
4. Click Retry on original message
5. **Expected**: Same query sent with model B, better response
6. **Verify**: New model used (check in console/network tab)

### Test 4: No Confirmation Dialogs
1. Click Reset on any user message
2. **Expected**: Immediate action, no dialog
3. Click Retry on any user message
4. **Expected**: Immediate submission, no dialog
5. **Verify**: No `window.confirm()` calls

### Test 5: Button Visibility
1. Send user message
2. **Verify**: Reset and Retry buttons visible at bottom
3. Expand assistant message
4. **Verify**: Copy and Gmail buttons visible at bottom
5. Expand tool message
6. **Verify**: No action buttons (correct)
7. **Verify**: Consistent styling across all button types

## Edge Cases Handled

### 1. First Message Reset/Retry
- **Behavior**: Clears all messages (becomes empty chat)
- **Result**: User can start fresh conversation

### 2. Last Message Reset/Retry
- **Behavior**: Only clears streaming assistant response (if any)
- **Result**: Can retry most recent query

### 3. Middle Message Reset/Retry
- **Behavior**: Clears all subsequent conversation
- **Result**: Can branch conversation at any point

### 4. Retry During Loading
- **Behavior**: Previous request should complete first
- **Note**: Consider adding loading state check in future

### 5. Multiple Rapid Retries
- **Behavior**: Each retry submits a new request
- **Note**: Rate limiting may apply

## Known Limitations

1. **No Retry History**: Each retry overwrites previous attempts
   - **Future**: Consider saving retry history for comparison

2. **No Loading Prevention**: User can click retry during active request
   - **Future**: Disable retry button when `isLoading === true`

3. **No Retry Count**: No indication of how many times query was retried
   - **Future**: Show retry count badge

4. **No Model Comparison**: Can't see responses from different models side-by-side
   - **Future**: Add "Compare Models" feature

5. **No Rate Limit Warning**: Retry doesn't warn if approaching rate limits
   - **Future**: Show rate limit status before retry

## Build Results

```
../docs/assets/index-BbdTVKN9.js  256.50 kB │ gzip: 77.41 kB
✓ built in 988ms
```

Changes are included in the same build as model selection updates.

## Accessibility Considerations

- ✅ Buttons have clear text labels ("Reset", "Retry")
- ✅ Buttons have `title` attributes for tooltips
- ✅ SVG icons provide visual reinforcement
- ✅ Buttons use semantic HTML `<button>` elements
- ✅ Hover states provide visual feedback
- ⚠️ Could improve: Add aria-label for screen readers
- ⚠️ Could improve: Add keyboard shortcuts (Ctrl+R for retry?)

## Future Enhancements

1. **Retry with Different Model**: Quick model switcher on retry button
2. **Retry History**: Track and compare multiple retry attempts
3. **Smart Retry**: Automatically retry on rate limit with exponential backoff
4. **Retry Delay**: Show countdown if rate limited
5. **Batch Retry**: Retry multiple failed messages at once
6. **Retry Analytics**: Track success rate of retries
7. **Loading State**: Disable retry during active request
8. **Keyboard Shortcuts**: Ctrl+R to retry last message
9. **Retry Options**: "Retry with more context", "Retry with different model"
10. **Undo Retry**: Quick way to restore previous response

## User Documentation

### Quick Guide: Reset vs Retry

**Use Reset when:**
- You want to modify the query before resubmitting
- You need to change settings or model first
- You want to review the query
- You need to add more context

**Use Retry when:**
- The model returned an error
- The response was incomplete or low quality
- You hit a rate limit and want to try again
- You changed the model and want to regenerate the response

**Tip**: Both buttons clear the conversation history after that point, so you can branch your conversation at any message.

## Related Files

- `ui-new/src/components/ChatTab.tsx` - Main implementation
- `MODEL_SELECTION_UPDATE.md` - Related model changes
- `LLAMA_3.3_FUNCTION_SYNTAX_ISSUE.md` - Why retry is useful for model issues

## References

- Chat UX best practices
- Modern chat interfaces (ChatGPT, Claude, Gemini)
- User feedback on conversation branching
- Accessibility guidelines for interactive elements
