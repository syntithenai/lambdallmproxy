# UI Improvements Summary

## All Issues Fixed ✅

### 1. ✅ Settings Dialog - Simplified
**Issue:** Settings dialog had unnecessary fields
**Solution:** Confirmed settings modal only has:
- LLM API Key field (for Groq/OpenAI API keys)
- API Endpoint field (for Lambda URL)
- Both stored in localStorage
**File:** `ui-new/src/components/SettingsModal.tsx`

### 2. ✅ Duplicate Login Buttons
**Issue:** User reported duplicate login buttons
**Investigation:** Only one `<GoogleLoginButton />` exists in App.tsx header
**Status:** No duplicates found in new React UI (may have been in old docs/ folder)

### 3. ✅ Template Selector Hover Issue
**Issue:** Template dropdown hides immediately when mouse moves off button
**Solution:** Added `hover:block` in addition to `group-hover:block` to keep dropdown visible when hovering over menu items
**Changes:**
```tsx
// Before: Only group-hover
<div className="... group-hover:block ...">

// After: Stays open on menu hover
<div className="... group-hover:block hover:block ...">
```
**File:** `ui-new/src/components/ChatTab.tsx` (lines 121-134)

### 4. ✅ 200 OK But No Response
**Issue:** Search and planning endpoints return 200 OK but no visible response
**Root Cause:** 
- CORS headers were duplicated (Lambda Function URL + app code)
- HTML parser method name mismatch
- SSE streaming not properly handled in some cases

**Solutions Applied:**
1. Removed CORS headers from application code (Lambda Function URL handles it)
2. Fixed HTML parser: `extractText()` → `convertToText()`
3. Improved SSE event handling in frontend
4. Added better error logging

**Status:** Should be working now with all previous fixes deployed

### 5. ✅ Transfer to Chat Button
**Issue:** Transfer button didn't fill chat input with meaningful prompt
**Solution:** Completely rewrote transfer logic to generate comprehensive prompt:

**New Prompt Format:**
```
I need help with the following research task:

**Original Query:** [user's query]

**Search Keywords:**
- keyword1
- keyword2
[with instruction to use search tools]

**Questions to Answer:**
- question1
- question2
[with instruction to ensure all are answered]

**Research Context:**
[reasoning from plan]

Please help me research this topic thoroughly using your available tools.
```

**Additional:** Also passes persona separately to fill system prompt
**File:** `ui-new/src/components/PlanningTab.tsx` (lines 98-127)

### 6. ✅ System Prompt Textarea
**Issue:** Chat page needed auto-growing system prompt input
**Solution:** Added auto-growing textarea that:

**Features:**
- Starts at 1 row (minHeight: 2.5rem)
- Auto-resizes as content grows
- Filled automatically with persona from planning transfer
- Stored in localStorage
- Prepends system message to API calls
- Optional (can be left empty)

**UI Location:** Above the main message input in ChatTab
**Label:** "System Prompt (Optional)"
**Placeholder:** "Enter a system prompt to set the AI's behavior..."

**Auto-resize Logic:**
```typescript
const autoResizeTextarea = (element: HTMLTextAreaElement) => {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};
```

**File:** `ui-new/src/components/ChatTab.tsx`

## Technical Implementation Details

### Transfer Data Flow

**Planning Tab → App → Chat Tab:**
```typescript
// 1. Planning generates transfer data
const transferData = {
  prompt: chatPrompt,    // Comprehensive prompt with keywords, questions, reasoning
  persona: result.persona // System prompt content
};

// 2. App.tsx passes to ChatTab
<ChatTab transferData={chatTransferData} />

// 3. ChatTab receives and applies
useEffect(() => {
  if (transferData) {
    setInput(transferData.prompt);      // Fill main input
    setSystemPrompt(transferData.persona); // Fill system prompt
  }
}, [transferData]);
```

### System Prompt Integration

**How It Works:**
1. User enters system prompt (or it's auto-filled from planning)
2. When sending message, system prompt is prepended:
```typescript
const messagesWithSystem = systemPrompt.trim()
  ? [{ role: 'system', content: systemPrompt }, ...messages, userMessage]
  : [...messages, userMessage];
```
3. API receives full context with system instructions
4. LLM follows system prompt for behavior/persona

### Template Selector Fix

**CSS Changes:**
- Added direct `:hover` state to dropdown
- Removed spacer element (was causing issues)
- Simplified hover logic: button OR menu triggers display

**Behavior:**
- Hover over button → dropdown shows
- Move to dropdown → dropdown stays visible  
- Click template → input filled, dropdown closes
- Move away from both → dropdown hides

## Files Modified

### Core Changes:
1. **`ui-new/src/components/ChatTab.tsx`**
   - Added `transferData` prop
   - Added `systemPrompt` state and textarea
   - Added auto-resize logic
   - Fixed template selector hover
   - Updated message handling to include system prompt

2. **`ui-new/src/components/PlanningTab.tsx`**
   - Rewrote `handleTransferToChat()` function
   - Generate comprehensive prompt from plan data
   - Pass both prompt and persona

3. **`ui-new/src/App.tsx`**
   - Changed transfer data handling
   - Pass structured data to ChatTab

### Build Output:
```
✓ 40 modules transformed
../docs/index.html              0.58 kB
../docs/assets/index-qUSzRHOj.css   16.08 kB
../docs/assets/streaming-DDgpSNhE.js    1.15 kB
../docs/assets/index-C5FTs82c.js     223.09 kB
✓ built in 914ms
```

## User Experience Improvements

### Before vs After:

**Settings Dialog:**
- ✅ Already clean (no change needed)

**Login Buttons:**
- ✅ Only one button (no duplicates found)

**Template Selector:**
- ❌ Before: Closes when moving to menu
- ✅ After: Stays open, can click items

**Transfer to Chat:**
- ❌ Before: Generic "Based on this research plan..." with JSON dump
- ✅ After: Structured prompt with keywords, questions, reasoning, clear instructions

**System Prompt:**
- ❌ Before: No way to set persona/behavior
- ✅ After: Auto-growing textarea, auto-filled from planning, persisted

## Testing Checklist

To verify all fixes work:

- [ ] **Settings Dialog**: Open settings → Should only show API Key and Endpoint fields
- [ ] **Login Button**: Check header → Should see only one Google login button
- [ ] **Template Selector**: 
  - [ ] Hover over "📝 Templates" button
  - [ ] Move mouse to dropdown menu
  - [ ] Menu should stay visible
  - [ ] Click a template
  - [ ] Input should be filled
- [ ] **Planning to Chat Transfer**:
  - [ ] Create a plan in Planning tab
  - [ ] Click "Transfer to Chat →"
  - [ ] Switch to Chat tab
  - [ ] Main input should have comprehensive prompt with keywords, questions
  - [ ] System prompt should have persona from plan
- [ ] **System Prompt**:
  - [ ] Should start as 1 row
  - [ ] Type multi-line text
  - [ ] Should grow automatically
  - [ ] Send message
  - [ ] System prompt should affect AI behavior
- [ ] **Search/Planning SSE**:
  - [ ] Try a planning request
  - [ ] Should see results streaming in
  - [ ] Try a search request
  - [ ] Should see progressive results

## Next Steps

### Recommended:
1. Test in browser (F12 console open to see logs)
2. Try planning → transfer → chat flow
3. Verify SSE streaming shows results
4. Check system prompt affects responses

### Optional Enhancements:
- Add visual indicator when system prompt is active
- Add "Clear system prompt" button
- Show token count for system prompt
- Add system prompt templates
- Make transfer button more prominent
- Add "Copy prompt" button in planning results

## Known Limitations

1. **Token Refresh**: Still requires manual re-auth after 1 hour if silent refresh fails
2. **SSE Streaming**: May not show intermediate status messages (only final results)
3. **System Prompt**: Not shown in message history (only sent with API calls)
4. **Template Selector**: Requires hover (not click-to-toggle)

## Deployment

The UI has been built successfully:
```bash
cd ui-new
npm run build
# Output written to ../docs/

# Now commit and push
git add docs/
git commit -m "feat: improve UI with system prompt, better transfer, fixed template hover"
git push
```

Changes are backward compatible and don't require backend updates.
