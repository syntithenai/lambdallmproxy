# Planning UI - Testing Guide

## Quick Test to Verify Implementation

### Step 1: Start Dev Server
```bash
cd /home/stever/projects/lambdallmproxy/ui-new
npm run dev
```

### Step 2: Navigate to Planning Tab
Open browser and go to Planning page

### Step 3: Verify Initial State

**You should see:**
- ✅ Four buttons at top (fixed header): `Generate Plan`, `Send To Chat`, `Load`, `New`
- ✅ One visible textarea: "1. Research Query (prompt for generating plans)"
- ✅ No emojis anywhere
- ✅ Collapsible "Configuration" section

**You should NOT see:**
- ❌ Second textarea (Generated System Prompt) - not shown yet
- ❌ Third textarea (Generated User Query) - not shown yet

### Step 4: Enter Research Query

**Type in textarea #1:**
```
What are the latest developments in quantum computing?
```

**Verify:**
- ✅ Textarea auto-resizes as you type
- ✅ `Generate Plan` button is enabled

### Step 5: Click "Generate Plan"

**What happens:**
1. Loading indicator appears
2. API call to LLM
3. LLM responds with plan data
4. **IMMEDIATELY** two new textareas appear

**You should now see THREE textareas:**

#### Textarea #1 (unchanged):
```
1. Research Query (prompt for generating plans)
┌─────────────────────────────────────────────────┐
│ What are the latest developments in quantum     │
│ computing?                                      │
└─────────────────────────────────────────────────┘
```

#### Textarea #2 (NEW - blue background):
```
2. Generated System Prompt (auto-generated after clicking Generate Plan)
┌─────────────────────────────────────────────────┐
│ AI Persona:                                     │
│ [LLM-generated persona]                         │
│                                                 │
│ Research Plan:                                  │
│ [LLM-generated plan]                            │
│                                                 │
│ Research Context:                               │
│ [LLM-generated reasoning]                       │
│                                                 │
│ Research Steps:                                 │
│ 1. [Step 1]                                    │
│ 2. [Step 2]                                    │
│ ...                                            │
└─────────────────────────────────────────────────┘
```

#### Textarea #3 (NEW - green background):
```
3. User Query (auto-generated after clicking Generate Plan, ready for Send To Chat)
┌─────────────────────────────────────────────────┐
│ I need help with the following research task:  │
│                                                 │
│ **Original Query:** What are the latest        │
│ developments in quantum computing?              │
│                                                 │
│ **Search Keywords:**                            │
│ - quantum computing                             │
│ - quantum algorithms                            │
│ - quantum hardware                              │
│                                                 │
│ Please use your search tools to find            │
│ information about these keywords.               │
│                                                 │
│ **Be sure to answer the following questions:** │
│ 1. [Question 1]                                │
│ 2. [Question 2]                                │
│ ...                                            │
│                                                 │
│ Please help me research this topic thoroughly  │
│ using your available tools.                     │
└─────────────────────────────────────────────────┘
```

### Step 6: Verify Auto-Resize

**Test all three textareas:**
1. Click in textarea #2
2. Add some text (e.g., type "Additional context...")
3. **Verify:** Textarea grows to fit content ✅
4. Delete text
5. **Verify:** Textarea shrinks ✅
6. Repeat for textarea #3

### Step 7: Verify Editability

**Edit the prompts:**
1. Click in textarea #2 (System Prompt)
2. Modify some text (e.g., change the persona)
3. **Verify:** Changes are saved ✅
4. Click in textarea #3 (User Query)
5. Modify the search keywords or questions
6. **Verify:** Changes are saved ✅

### Step 8: Test "Send To Chat"

**Click "Send To Chat" button**

**What should happen:**
1. Success toast: "Plan sent to chat"
2. Chat tab receives **exactly** what's in the textareas (no further transformation)
3. Check Chat tab:
   - System prompt = contents of textarea #2
   - User message = contents of textarea #3

**Verify NO transformation happens:**
- If you edited the textareas, your edits should be preserved
- No regeneration of prompts
- No changes to the text

### Step 9: Test "New" Button

**Click "New" button**

**What should happen:**
1. All three textareas clear
2. Textareas #2 and #3 disappear
3. Only textarea #1 (Research Query) remains
4. Ready for new query

### Step 10: Test Fixed Header

**Scroll down the page**

**Verify:**
- ✅ Buttons stay at top (fixed position)
- ✅ Content scrolls underneath
- ✅ Buttons always accessible

## Success Criteria

### All these should be TRUE:

- [ ] Three textareas visible after Generate Plan
- [ ] All textareas auto-resize
- [ ] Research Query only changed by user
- [ ] System Prompt appears immediately after LLM response
- [ ] User Query appears immediately after LLM response
- [ ] Both generated prompts are editable
- [ ] Send To Chat uses textarea content as-is
- [ ] No transformation on Send To Chat
- [ ] Buttons fixed at top
- [ ] No emojis in UI
- [ ] Clean, professional appearance

## Troubleshooting

### If textareas #2 and #3 don't appear:
1. Check browser console for errors
2. Verify authentication (must be signed in)
3. Check network tab - API call should complete
4. Verify LLM response includes required fields

### If textareas don't auto-resize:
1. Check if `useAutoResizeTextarea` hook is imported
2. Verify `AutoResizingTextarea` component is used (not plain `<textarea>`)
3. Check browser console for errors

### If transformation doesn't happen immediately:
1. Check `usePlanningGeneration.ts` line 110 - should call `onSuccess` in 'result' event
2. Verify `transformResultToPrompts` is called before `onSuccess`
3. Check browser console for transformation logs

### If Send To Chat transforms the prompts:
1. Check `handleTransferToChat` function - should NOT call transformation
2. Verify it uses `generatedSystemPrompt` and `generatedUserQuery` directly
3. No calls to `transformResultToPrompts` in `handleTransferToChat`

## Quick Verification Checklist

```bash
# 1. Files exist
ls ui-new/src/components/PlanningTab.tsx
ls ui-new/src/components/AutoResizingTextarea.tsx
ls ui-new/src/hooks/usePlanningGeneration.ts

# 2. No compile errors
cd ui-new && npm run build

# 3. Start dev server
npm run dev
```

Then test in browser with steps above.

---

**Test Status**: Ready for manual testing
**Expected Duration**: 5-10 minutes
**Critical**: Verify transformation happens immediately after Generate Plan
