# Planning Dialog Save Behavior Fix

## Summary
Fixed the Planning Dialog to avoid duplicate saved plans and properly handle plan creation workflow.

## Changes Made

### 1. Removed Automatic Plan Saving
**File**: `ui-new/src/components/PlanningDialog.tsx`

**Before**: Plans were automatically saved to cache every time "Generate Plan" was clicked (line 126)
```typescript
case 'result':
  setResult(data);
  // ... set generated prompts ...
  saveCachedPlan(query, data, data.enhancedSystemPrompt || '');
  console.log('Plan auto-saved to cache with enhanced prompts');
  break;
```

**After**: Plans are only saved when user explicitly clicks "Save Plan" button
```typescript
case 'result':
  setResult(data);
  // ... set generated prompts ...
  // Don't auto-save - user must explicitly click "Save Plan"
  break;
```

### 2. Added "Save Plan" Button
**File**: `ui-new/src/components/PlanningDialog.tsx`

Added a new button between "Generate Plan" and "Transfer to Chat":
- **Label**: "Save Plan"
- **Behavior**: Saves the current plan to localStorage cache
- **Validation**: Disabled if no valid plan exists (result is null or has error)
- **Feedback**: Shows success toast message when saved
- **Tooltip**: "Save the current plan to your saved plans list"

**Implementation**:
```typescript
const handleSavePlan = () => {
  if (!result || result.error) {
    showError('Cannot save plan: No valid plan generated');
    return;
  }
  
  saveCachedPlan(query, result, result.enhancedSystemPrompt || '');
  showSuccess('Plan saved successfully');
  console.log('Plan manually saved to cache');
};
```

### 3. Renamed and Enhanced "Clear" Button
**File**: `ui-new/src/components/PlanningDialog.tsx`

**Before**: Button labeled "Clear"
**After**: Button labeled "Create New Plan"

**Before Behavior**: Cleared query, result, and generated prompts
**After Behavior**: Same clearing behavior, but with clearer intent
- Renamed function: `handleClear` → `handleCreateNewPlan`
- Added tooltip: "Clear everything and start fresh"

**Implementation**:
```typescript
const handleCreateNewPlan = () => {
  setQuery('');
  setResult(null);
  setGeneratedSystemPrompt('');
  setGeneratedUserQuery('');
};
```

## User Workflow

### Before
1. User enters research query
2. Clicks "Generate Plan"
3. Plan is **automatically saved** (creates duplicate if generated again)
4. User must manually delete duplicates from saved plans

### After
1. User enters research query
2. Clicks "Generate Plan"
3. Reviews the generated plan
4. **Explicitly clicks "Save Plan"** if they want to keep it
5. Clicks "Create New Plan" to clear and start fresh (clears research query)

## Benefits

1. **No More Duplicates**: Plans are only saved when explicitly requested
2. **Clear Intent**: "Create New Plan" clearly indicates starting fresh
3. **User Control**: User decides which plans are worth saving
4. **Better UX**: Success feedback when plan is saved
5. **Cleaner Workflow**: Research query is cleared when creating new plan

## Button Layout
The button row now contains (left to right):
1. **Generate Plan** (primary) - Generate plan from query
2. **Save Plan** (primary) - Save current plan to cache
3. **Transfer to Chat** (primary) - Send plan to chat interface
4. **Load Saved Plans** (secondary) - Open saved plans dialog
5. **Create New Plan** (secondary) - Clear everything and start fresh

## Technical Details

- The `saveCachedPlan()` function in `planningCache.ts` already handles duplicate prevention by query text
- However, automatic saving on every generation was causing unnecessary saves and confusion
- Manual save gives users control over what gets persisted
- All validation and error handling maintained from original implementation
