# Planning Dialog Enhanced Prompts Direct Usage - COMPLETE

## Summary
Updated Planning Dialog to use `enhancedSystemPrompt` and `enhancedUserPrompt` directly from the LLM response with no manipulation, removing the client-side transformation logic.

## Problem
The Planning Dialog was transforming the LLM response by building prompts from individual fields (persona, plan, reasoning, steps, searchKeywords, questions, etc.) instead of using the pre-formatted `enhancedSystemPrompt` and `enhancedUserPrompt` fields that the backend already provides.

## User Requirement
> "in the planning dialog, after the llm call, the fields enhancedSystemPrompt and enhancedUserPrompt should be used to populate the respective text inputs. there should be no manipulation of these values"

## Changes Made

### 1. Updated 'result' Event Handler (`PlanningDialog.tsx` lines 172-181)

**Before:**
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

**After:**
```typescript
case 'result':
  setResult(data);
  // Use enhancedSystemPrompt and enhancedUserPrompt directly from LLM (no manipulation)
  if (data.enhancedSystemPrompt) {
    setGeneratedSystemPrompt(data.enhancedSystemPrompt);
  }
  if (data.enhancedUserPrompt) {
    setGeneratedUserQuery(data.enhancedUserPrompt);
  }
  saveCachedPlan(query, data, data.enhancedSystemPrompt || '');
  console.log('Plan auto-saved to cache with enhanced prompts');
  break;
```

### 2. Updated Load Plan Handler (`PlanningDialog.tsx` lines 255-267)

**Before:**
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

**After:**
```typescript
const handleLoadPlan = (plan: CachedPlan) => {
  setQuery(plan.query);
  setResult(plan.plan);
  // Use enhanced prompts directly from cached plan (no manipulation)
  if (plan.plan && !plan.plan.error) {
    if (plan.plan.enhancedSystemPrompt) {
      setGeneratedSystemPrompt(plan.plan.enhancedSystemPrompt);
    }
    if (plan.plan.enhancedUserPrompt) {
      setGeneratedUserQuery(plan.plan.enhancedUserPrompt);
    }
  }
  setShowLoadDialog(false);
};
```

### 3. Removed Unused Transformation Function (`PlanningDialog.tsx`)

**Deleted:**
- `transformResultToPrompts()` function (63 lines, lines 47-109)
- `useCallback` import (no longer needed)

This function was building prompts from individual result fields:
- persona
- plan
- reasoning
- steps
- sources
- notes
- searchKeywords
- questions

**Now:** The backend provides pre-formatted `enhancedSystemPrompt` and `enhancedUserPrompt` that are used directly.

## Benefits

### 1. **Single Source of Truth**
The backend LLM now controls the exact format and content of the prompts. No client-side manipulation ensures consistency.

### 2. **Reduced Code Complexity**
Removed 63 lines of transformation logic and eliminated the need for `useCallback`.

### 3. **Better Maintainability**
Changes to prompt formatting only need to happen in one place (backend) rather than maintaining parallel logic in both backend and frontend.

### 4. **Flexibility**
The backend can optimize prompt formatting based on:
- Query type (SIMPLE, OVERVIEW, etc.)
- Complexity assessment
- Research approach
- Any future criteria

Without frontend code changes needed.

## Data Flow

### Before:
1. Backend LLM generates response with individual fields
2. Backend may build `enhancedSystemPrompt` and `enhancedUserPrompt` (unused)
3. Frontend receives full result
4. **Frontend transforms individual fields into prompts** ❌
5. Frontend displays transformed prompts in textareas

### After:
1. Backend LLM generates response with individual fields
2. **Backend builds `enhancedSystemPrompt` and `enhancedUserPrompt`** ✅
3. Frontend receives full result
4. **Frontend uses enhanced prompts directly** ✅
5. Frontend displays enhanced prompts in textareas

## Files Modified
- **ui-new/src/components/PlanningDialog.tsx**
  - Line 1: Removed `useCallback` import
  - Lines 47-109: Removed `transformResultToPrompts()` function
  - Lines 172-181: Updated 'result' case to use enhanced prompts directly
  - Lines 255-267: Updated `handleLoadPlan()` to use enhanced prompts directly

## Testing
- ✅ Build succeeds with no TypeScript errors
- Expected behavior:
  - Generate Plan creates enhanced prompts from backend
  - Generated System Prompt textarea populated with `data.enhancedSystemPrompt`
  - Generated User Query textarea populated with `data.enhancedUserPrompt`
  - No client-side transformation or manipulation
  - Load Saved Plans restores enhanced prompts correctly
  - Transfer to Chat uses textareas as-is

## Backend API Contract
The planning API response (`/chat/planning-dialog`) must include:
```typescript
{
  enhancedSystemPrompt?: string,  // Pre-formatted system prompt (optional)
  enhancedUserPrompt?: string,    // Pre-formatted user query (optional)
  // ... other fields (persona, plan, reasoning, etc. for display)
}
```

## Related Components
- **PlanningDialog.tsx** - Popup planning interface (UPDATED)
- **PlanningTab.tsx** - Full-page planning interface (may need similar update)
- **usePlanningGeneration.ts** - Hook for PlanningTab (has its own transformResultToPrompts)

## Note on PlanningTab
PlanningTab still uses `usePlanningGeneration` hook which has its own `transformResultToPrompts`. If the backend provides `enhancedSystemPrompt` and `enhancedUserPrompt`, PlanningTab should be updated similarly to use those fields directly.
