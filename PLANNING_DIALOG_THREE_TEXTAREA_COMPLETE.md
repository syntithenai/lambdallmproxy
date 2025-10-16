# Planning Dialog Three-Textarea Restructure - COMPLETE

## Summary
Restructured the Planning Dialog to match the Planning Tab's three-textarea interface, with immediate transformation of LLM results into editable system and user prompts.

## Problem
The Planning Dialog (popup from "Make A Plan" button) had a different structure than the Planning Tab (full-page view):
- Only showed Research Query and partial System Prompt
- No transformation logic - just displayed persona field
- Transfer to Chat built prompts at transfer time instead of immediately
- Inconsistent UX between dialog and full-page planning

## User Requirements
1. Three auto-resizing textareas: Research Query, Generated System Prompt, Generated User Query
2. Transformation happens immediately when LLM responds (not at transfer time)
3. All textareas editable before transfer
4. Transfer to Chat uses textareas as-is (no further manipulation)

## Changes Made

### 1. Added State for Generated Prompts (`PlanningDialog.tsx` lines 42-44)
```typescript
// Generated prompts (transformed from LLM result)
const [generatedSystemPrompt, setGeneratedSystemPrompt] = useLocalStorage('planning_dialog_generated_system_prompt', '');
const [generatedUserQuery, setGeneratedUserQuery] = useLocalStorage('planning_dialog_generated_user_query', '');
```

### 2. Added Transformation Function (`PlanningDialog.tsx` lines 47-105)
Replicated `transformResultToPrompts` from `usePlanningGeneration` hook:
- Builds system prompt from: persona, plan, reasoning, steps, sources, notes
- Builds user query from: originalQuery, searchKeywords, questions
- Returns both prompts for immediate display

### 3. Updated Event Handler (`PlanningDialog.tsx` lines 172-179)
**Before:**
```typescript
case 'result':
  setResult(data);
  const promptToSave = data.persona || undefined;
  if (data.persona) {
    setSystemPrompt(data.persona);
  }
  saveCachedPlan(query, data, promptToSave);
  break;
```

**After:**
```typescript
case 'result':
  setResult(data);
  // Transform result to prompts immediately
  const { systemPrompt, userQuery } = transformResultToPrompts(data, query);
  setGeneratedSystemPrompt(systemPrompt);
  setGeneratedUserQuery(userQuery);
  saveCachedPlan(query, data, systemPrompt);
  console.log('Plan auto-saved to cache with transformed prompts');
  break;
```

### 4. Simplified Transfer Function (`PlanningDialog.tsx` lines 239-248)
**Before:** Complex prompt building with result field checks
**After:**
```typescript
const handleTransferToChat = () => {
  if (!generatedUserQuery || !onTransferToChat) return;
  
  // Use the generated prompts as-is (no further manipulation)
  const transferData = {
    prompt: generatedUserQuery,
    persona: generatedSystemPrompt || ''
  };
  
  onTransferToChat(JSON.stringify(transferData));
  onClose();
};
```

### 5. Updated Load Plan Handler (`PlanningDialog.tsx` lines 250-260)
Transforms loaded plans to prompts:
```typescript
const handleLoadPlan = (plan: CachedPlan) => {
  setQuery(plan.query);
  setResult(plan.plan);
  // Transform loaded plan to prompts
  if (plan.plan && !plan.plan.error) {
    const { systemPrompt, userQuery } = transformResultToPrompts(plan.plan, plan.query);
    setGeneratedSystemPrompt(systemPrompt);
    setGeneratedUserQuery(userQuery);
  }
  setShowLoadDialog(false);
};
```

### 6. Updated Clear Button (`PlanningDialog.tsx` lines 320-327)
Clears all three fields:
```typescript
onClick={() => { 
  setQuery(''); 
  setResult(null); 
  setGeneratedSystemPrompt(''); 
  setGeneratedUserQuery(''); 
}}
```

### 7. Updated Transfer Button State (`PlanningDialog.tsx` lines 303-309)
```typescript
<button
  onClick={handleTransferToChat}
  disabled={!generatedUserQuery || !generatedUserQuery.trim()}
  className="btn-primary text-sm"
>
  Transfer to Chat
</button>
```

### 8. Added Three Auto-Resizing Textareas (`PlanningDialog.tsx` lines 356-405)
**Replaced:** Old system prompt + user message preview section
**With:**
1. **Research Query Textarea** (unchanged position, for input)
2. **Generated System Prompt Textarea** (auto-resizes, editable)
3. **Generated User Query Textarea** (auto-resizes, editable)

Example:
```typescript
<textarea
  ref={systemPromptTextareaRef}
  value={generatedSystemPrompt}
  onChange={(e) => setGeneratedSystemPrompt(e.target.value)}
  className="input-field resize-none overflow-hidden w-full"
  style={{ minHeight: '96px' }}
/>
```

### 9. Added Auto-Resize Effects (`PlanningDialog.tsx` lines 119-129)
```typescript
useEffect(() => {
  autoResize(systemPromptTextareaRef.current);
}, [generatedSystemPrompt]);

useEffect(() => {
  autoResize(userQueryTextareaRef.current);
}, [generatedUserQuery]);
```

### 10. Removed Transfer Preview Section
Deleted the old preview section (lines 678-764) that showed read-only prompts since prompts are now editable in textareas above.

## Files Modified
- **ui-new/src/components/PlanningDialog.tsx**
  - Added `useCallback` import
  - Added generatedSystemPrompt and generatedUserQuery state
  - Added userQueryTextareaRef
  - Added transformResultToPrompts function
  - Updated 'result' event handler
  - Simplified handleTransferToChat
  - Updated handleLoadPlan with transformation
  - Updated Clear button
  - Updated Transfer button disabled condition
  - Added three auto-resizing textareas
  - Added auto-resize effects
  - Removed transfer preview section

## UX Flow

1. **User enters Research Query** → First textarea
2. **User clicks Generate Plan** → Loading state
3. **LLM responds** → Transformation happens immediately:
   - Result stored in `result` state
   - `transformResultToPrompts()` called
   - `generatedSystemPrompt` updated (second textarea appears)
   - `generatedUserQuery` updated (third textarea appears)
4. **User can edit prompts** → All textareas editable
5. **User clicks Transfer to Chat** → Uses textareas as-is (no transformation)

## Pattern Consistency
Now matches PlanningTab pattern:
- ✅ Three textareas (Research Query, Generated System Prompt, Generated User Query)
- ✅ Transformation happens immediately on LLM response
- ✅ All textareas auto-resize
- ✅ All prompts editable before transfer
- ✅ Transfer uses textareas as-is
- ✅ Load plan transforms cached results

## Testing
- ✅ Build succeeds with no TypeScript errors
- UI changes visible:
  - Three textareas display after plan generation
  - Transfer button disabled until prompts generated
  - Clear button clears all three fields
  - Load plan populates all three textareas

## Related Files (Reference Only)
- `ui-new/src/components/PlanningTab.tsx` - Full-page planning (already had this pattern)
- `ui-new/src/hooks/usePlanningGeneration.ts` - Original transformation logic
- `ui-new/src/hooks/useAutoResizeTextarea.ts` - Auto-resize implementation
