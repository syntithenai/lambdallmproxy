# Planning Dialog Button Layout Fix

## Problem
In the PlanningDialog (the popup that appears when clicking "Make A Plan"), the buttons were scattered in different sections:
- "Load Saved Plan" and "Clear" buttons at the top
- "Generate Plan" button in its own section below the query input
- "Transfer to Chat" button only appeared in the results section after generating a plan

User wanted all main action buttons (Generate Plan, Transfer to Chat, Load Saved Plans, Clear) in one row at the top.

## Solution

Reorganized the button layout in `PlanningDialog.tsx` to put all primary action buttons in a single row at the top of the dialog.

### Before:
```
┌─────────────────────────────────────────────┐
│ Research Planning                        [X] │
├─────────────────────────────────────────────┤
│ [Load Saved Plan] [Clear]                   │
│                                             │
│ Research Query:                             │
│ [text area]                                 │
│                                             │
│ [Generate Research Plan]                    │  ← Separate section
│                                             │
│ Research Plan                [Transfer →]   │  ← Only in results
└─────────────────────────────────────────────┘
```

### After:
```
┌─────────────────────────────────────────────┐
│ Research Planning                        [X] │
├─────────────────────────────────────────────┤
│ [Generate Plan] [Transfer to Chat]          │  ← All in one row
│ [Load Saved Plans] [Clear]                  │
│                                             │
│ Research Query:                             │
│ [text area]                                 │
│                                             │
│ Research Plan                      [💰 Info]│
└─────────────────────────────────────────────┘
```

## Changes Made

### File: `ui-new/src/components/PlanningDialog.tsx`

#### 1. Added All Buttons to Top Row (lines 253-275):

**Old Code:**
```tsx
{/* Action Buttons */}
<div className="flex flex-wrap gap-2">
  <button onClick={() => setShowLoadDialog(true)} className="btn-secondary text-sm">
    📂 Load Saved Plan
  </button>
  <button onClick={() => { setQuery(''); setResult(null); setSystemPrompt(''); }} className="btn-secondary text-sm">
    🗑️ Clear
  </button>
</div>

{/* Query Input... */}

{/* Generate Button */}
{isAuthenticated && (
  <div className="card p-4">
    <button onClick={handleSubmit} disabled={isLoading || !query.trim()} className="btn-primary w-full">
      {isLoading ? 'Generating Plan...' : 'Generate Research Plan'}
    </button>
  </div>
)}
```

**New Code:**
```tsx
{/* Action Buttons - All in one row */}
<div className="flex flex-wrap gap-2">
  <button 
    onClick={handleSubmit}
    disabled={isLoading || !query.trim() || !isAuthenticated}
    className="btn-primary text-sm"
  >
    {isLoading ? 'Generating...' : 'Generate Plan'}
  </button>
  
  {onTransferToChat && (
    <button
      onClick={handleTransferToChat}
      disabled={!result || result.error}
      className="btn-primary text-sm"
    >
      Transfer to Chat
    </button>
  )}
  
  <button 
    onClick={() => setShowLoadDialog(true)} 
    className="btn-secondary text-sm"
  >
    Load Saved Plans
  </button>
  
  <button 
    onClick={() => { setQuery(''); setResult(null); setSystemPrompt(''); }} 
    className="btn-secondary text-sm"
  >
    Clear
  </button>
</div>
```

#### 2. Removed Duplicate "Transfer to Chat" from Results Section (lines 310-325):

**Old Code:**
```tsx
<div className="flex justify-between items-center mb-4">
  <h3>Research Plan</h3>
  <div className="flex gap-2">
    {llmInfo && <button>💰 Info</button>}
    {onTransferToChat && (
      <button onClick={handleTransferToChat}>Transfer to Chat →</button>
    )}
  </div>
</div>
```

**New Code:**
```tsx
<div className="flex justify-between items-center mb-4">
  <h3>Research Plan</h3>
  {llmInfo && <button>💰 Info</button>}
</div>
```

## Button Behavior

### Generate Plan
- **Enabled when**: User is authenticated AND query has text
- **Disabled when**: Not authenticated OR query is empty OR loading
- **Text**: "Generate Plan" (normal) / "Generating..." (loading)
- **Style**: Primary button (blue)

### Transfer to Chat
- **Enabled when**: Plan has been generated successfully (result exists and no error)
- **Disabled when**: No result OR result has error
- **Text**: "Transfer to Chat"
- **Style**: Primary button (blue)
- **Conditional**: Only shown if `onTransferToChat` callback provided

### Load Saved Plans
- **Always enabled**
- **Text**: "Load Saved Plans"
- **Style**: Secondary button (gray)
- **Action**: Opens saved plans dialog

### Clear
- **Always enabled**
- **Text**: "Clear"
- **Style**: Secondary button (gray)
- **Action**: Clears query, result, and system prompt

## Benefits

1. **Better UX**: All primary actions visible at the top
2. **Consistent Layout**: Buttons stay in same position regardless of state
3. **Cleaner UI**: No buttons moving around as you use the dialog
4. **Easier to Find**: Primary actions (Generate, Transfer) are prominent
5. **Mobile Friendly**: `flex-wrap` ensures buttons wrap on small screens

## Testing

1. **Open Planning Dialog**:
   - Click "Make A Plan" button in chat
   - Verify all 4 buttons visible at top

2. **Test Button States**:
   - **Not authenticated**: Generate Plan disabled, others enabled
   - **Empty query**: Generate Plan disabled, others enabled
   - **Valid query**: Generate Plan enabled
   - **Plan generated**: Transfer to Chat enabled
   - **Error result**: Transfer to Chat disabled

3. **Test Functionality**:
   - Click "Generate Plan" → Should generate plan
   - Click "Transfer to Chat" → Should transfer to chat and close dialog
   - Click "Load Saved Plans" → Should open load dialog
   - Click "Clear" → Should clear all fields

4. **Test Mobile**:
   - Resize browser to mobile width
   - Verify buttons wrap to multiple lines
   - All buttons remain accessible

## Related Files

- `ui-new/src/components/PlanningDialog.tsx` - Modified
- `ui-new/src/components/PlanningTab.tsx` - Separate file (full-page planning view)

Note: The PlanningTab (accessed via Planning navigation link) already had the correct layout with fixed buttons at top. This fix applies only to the PlanningDialog popup.

## Implementation Date
October 15, 2025

---

**Status**: ✅ Complete
**Build**: ✅ Passing
**UI Updated**: Planning Dialog button layout reorganized
**User Impact**: Better accessibility and cleaner interface
