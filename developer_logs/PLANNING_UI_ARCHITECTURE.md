# Planning UI Implementation - Architecture Summary

## Current Implementation ✅

The Planning UI has been **fully implemented** according to your specifications. Here's how it works:

## Three Auto-Resizing Textareas

### 1. Research Query (Line 170-177)
```tsx
<AutoResizingTextarea
  label="1. Research Query (prompt for generating plans)"
  value={query}
  onChange={setQuery}
  placeholder="Enter your research question or topic..."
  disabled={!isAuthenticated}
  minHeight="60px"
/>
```
- **Purpose**: User input for generating plans
- **Editing**: Only changed by user
- **Always visible**: Yes
- **Auto-resizes**: ✅

### 2. Generated System Prompt (Line 179-188)
```tsx
{generatedSystemPrompt && (
  <AutoResizingTextarea
    label="2. Generated System Prompt (auto-generated after clicking Generate Plan)"
    value={generatedSystemPrompt}
    onChange={setGeneratedSystemPrompt}
    placeholder="System prompt will appear here after generating plan..."
    minHeight="100px"
    backgroundColor="bg-blue-50 dark:bg-blue-900/10"
  />
)}
```
- **Purpose**: System prompt with research context
- **Generated from**: persona, plan, reasoning, steps, sources, notes
- **Appears**: After clicking "Generate Plan"
- **Editable**: Yes (user can modify before sending)
- **Auto-resizes**: ✅

### 3. Generated User Query (Line 190-199)
```tsx
{generatedUserQuery && (
  <AutoResizingTextarea
    label="3. User Query (auto-generated after clicking Generate Plan, ready for Send To Chat)"
    value={generatedUserQuery}
    onChange={setGeneratedUserQuery}
    placeholder="User query will appear here after generating plan..."
    minHeight="150px"
    backgroundColor="bg-green-50 dark:bg-green-900/10"
  />
)}
```
- **Purpose**: User query with search keywords and questions
- **Generated from**: searchKeywords, questions, original query
- **Appears**: After clicking "Generate Plan"
- **Editable**: Yes (user can modify before sending)
- **Auto-resizes**: ✅

## Transformation Flow

### When User Clicks "Generate Plan":

```
1. User enters text in Research Query
   ↓
2. Clicks "Generate Plan" button
   ↓
3. usePlanningGeneration.generateResearchPlan() called
   ↓
4. API call to generatePlan() → SSE stream
   ↓
5. LLM responds with event: 'result', data: { persona, plan, searchKeywords, questions, ... }
   ↓
6. transformResultToPrompts(data, query) IMMEDIATELY called
   ↓
7. Returns { systemPrompt, userQuery }
   ↓
8. onSuccess(systemPrompt, userQuery, data) callback
   ↓
9. setGeneratedSystemPrompt(systemPrompt) ← Textarea #2 appears
   setGeneratedUserQuery(userQuery)       ← Textarea #3 appears
   ↓
10. User can now edit both textareas if desired
```

### transformResultToPrompts Function (usePlanningGeneration.ts, lines 23-86):

**Builds System Prompt:**
```typescript
systemPromptText = 
  "AI Persona:\n" + data.persona +
  "\n\nResearch Plan:\n" + data.plan +
  "\n\nResearch Context:\n" + data.reasoning +
  "\n\nResearch Steps:\n" + data.steps.join('\n') +
  "\n\nRecommended Sources:\n" + data.sources.join('\n') +
  "\n\nAdditional Notes:\n" + data.notes
```

**Builds User Query:**
```typescript
userQueryText = 
  "I need help with the following research task:\n\n" +
  "**Original Query:** " + originalQuery +
  "\n\n**Search Keywords:**\n" + data.searchKeywords.join('\n') +
  "\n\nPlease use your search tools to find information about these keywords.\n\n" +
  "**Be sure to answer the following questions:**\n" + data.questions.join('\n') +
  "\n\nPlease research and provide complete answers to all these questions.\n\n" +
  "Please help me research this topic thoroughly using your available tools."
```

### When User Clicks "Send To Chat":

```
1. User clicks "Send To Chat" button
   ↓
2. handleTransferToChat() called
   ↓
3. NO TRANSFORMATION - uses textareas as-is:
   {
     prompt: generatedUserQuery,        ← From textarea #3 (as edited by user)
     systemPrompt: generatedSystemPrompt ← From textarea #2 (as edited by user)
   }
   ↓
4. onTransferToChat(JSON.stringify(transferData))
   ↓
5. Chat receives both prompts exactly as shown in textareas
```

## Fixed Header with Buttons

```tsx
<PlanningHeader
  isAuthenticated={isAuthenticated}
  isLoading={isLoading}
  hasQuery={query.trim().length > 0}
  hasGeneratedQuery={generatedUserQuery.trim().length > 0}
  onGeneratePlan={generateResearchPlan}
  onSendToChat={handleTransferToChat}
  onLoadPlan={() => setShowLoadDialog(true)}
  onNewPlan={handleNewPlan}
/>
```

**Buttons (fixed at top):**
- **Generate Plan**: Enabled when query has text and not loading
- **Send To Chat**: Enabled when generated query exists
- **Load**: Opens dialog to load saved plans
- **New**: Clears all fields

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ [Generate Plan] [Send To Chat] [Load] [New]            │ ← Fixed (sticky top-0)
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [Configuration] (collapsible)                           │
│                                                         │
│ 1. Research Query                                       │ ← Always visible
│ ┌─────────────────────────────────────────────────┐     │
│ │ Enter your research question...                 │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ 2. Generated System Prompt (appears after Generate)    │ ← Conditional
│ ┌─────────────────────────────────────────────────┐     │
│ │ AI Persona: ...                                 │     │ ← Auto-resizes
│ │ Research Plan: ...                              │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ 3. Generated User Query (appears after Generate)       │ ← Conditional
│ ┌─────────────────────────────────────────────────┐     │
│ │ I need help with:                               │     │ ← Auto-resizes
│ │ Search Keywords: ...                            │     │
│ │ Questions: ...                                  │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │ ↓ Scrollable
│ [Raw Plan Details] (collapsible)                        │
└─────────────────────────────────────────────────────────┘
```

## Auto-Resize Implementation

**AutoResizingTextarea Component** uses `useAutoResizeTextarea` hook:

```typescript
useEffect(() => {
  if (textareaRef.current) {
    const textarea = textareaRef.current;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}, [value]);
```

**How it works:**
1. Reset height to 'auto' (collapses to content size)
2. Read `scrollHeight` (actual content height)
3. Set height to match content
4. Triggers on every value change
5. Result: Textarea grows/shrinks with content

## Key Features ✅

- ✅ **Three textareas** with auto-resize
- ✅ **Research Query** only changed by user
- ✅ **Transformation happens immediately** when LLM responds
- ✅ **System prompt** auto-generated from plan fields
- ✅ **User query** auto-generated from keywords/questions
- ✅ **Send To Chat** uses textareas as-is (no further manipulation)
- ✅ **Fixed header** with buttons at top
- ✅ **All textareas editable** before sending
- ✅ **No emojis** in UI
- ✅ **Clean, modern layout**

## Files Involved

1. **PlanningTab.tsx** (217 lines) - Main component
2. **usePlanningGeneration.ts** (156 lines) - Generation logic with transformation
3. **PlanningHeader.tsx** - Fixed header with buttons
4. **AutoResizingTextarea.tsx** - Reusable auto-resizing textarea
5. **useAutoResizeTextarea.ts** - Auto-resize hook
6. **PlanningConfiguration.tsx** - Collapsible config
7. **PlanResultsDisplay.tsx** - Raw plan details
8. **PlanLoadDialog.tsx** - Load/delete saved plans

## Current Status

✅ **FULLY IMPLEMENTED** - All requirements met
✅ **Build passing** - No errors
✅ **Ready to use** - Just run dev server

---

**Implementation Date**: October 15, 2025
**Lines of Code**: 217 (down from 525)
**Test Status**: Ready for testing
