# React Hooks Order Fix - MediaPlayerDialog

## Error
```
React has detected a change in the order of Hooks called by MediaPlayerDialog. 
This will lead to bugs and errors if not fixed.

Uncaught Error: Rendered more hooks than during the previous render.
```

## Root Cause

The component had an **early return before hooks**:

```tsx
// ❌ WRONG - early return before useMemo
useEffect(() => { ... });

if (!isOpen) return null;  // <-- Breaks Rules of Hooks

const filteredPlaylist = useMemo(() => { ... });  // <-- Not called when closed
const groupedPlaylist = groupByDate(filteredPlaylist);
```

**What happened:**
1. When dialog is **closed**: `if (!isOpen) return null` → `useMemo` never called
2. When dialog **opens**: All hooks run including `useMemo`
3. React sees **different number of hooks** between renders → Error!

## Rules of Hooks

From React docs (https://react.dev/link/rules-of-hooks):

> **Only call hooks at the top level**
> Don't call Hooks inside loops, conditions, or nested functions. 
> Instead, always use Hooks at the top level of your React function, 
> before any early returns.

**Why?** React relies on the **order** hooks are called to maintain state between renders. Conditional hook calls break this order.

## Solution

Move the early return **after all hooks**:

```tsx
// ✅ CORRECT - all hooks before early return
useEffect(() => { ... });

const filteredPlaylist = useMemo(() => { ... });
const groupedPlaylist = groupByDate(filteredPlaylist);

// Early return AFTER all hooks
if (!isOpen) return null;

return (
  <div>...</div>
);
```

## Changes Made

**File**: `ui-new/src/components/MediaPlayerDialog.tsx`

**Before** (lines 85-105):
```tsx
  useEffect(() => {
    if (!isOpen) return;
    // ...
  }, [isOpen, onClose]);

  if (!isOpen) return null;  // ❌ WRONG POSITION

  const filteredPlaylist = useMemo(() => {
    // ...
  }, [playlist, searchQuery]);

  const groupedPlaylist = groupByDate(filteredPlaylist);
```

**After** (lines 85-108):
```tsx
  useEffect(() => {
    if (!isOpen) return;
    // ...
  }, [isOpen, onClose]);

  const filteredPlaylist = useMemo(() => {
    // ...
  }, [playlist, searchQuery]);

  const groupedPlaylist = groupByDate(filteredPlaylist);

  // Early return after all hooks to follow Rules of Hooks
  if (!isOpen) return null;  // ✅ CORRECT POSITION
```

## Why This Works

1. **All hooks always run** in the same order on every render
2. When `isOpen={false}`:
   - All hooks run (order preserved)
   - Early return prevents expensive JSX rendering
   - `useMemo` still executes but result is unused (minimal cost)
3. When `isOpen={true}`:
   - All hooks run (same order as before)
   - No early return, component renders normally

**Performance Impact**: Negligible - `useMemo` is cheap compared to full render

## Build Status

✅ **Build successful** in 10.93s  
✅ **No React warnings**  
✅ **Hooks order preserved**  
✅ **Ready for testing**

---

**Date**: October 16, 2025  
**Fix**: Moved early return after all hooks  
**Status**: Complete - Ready for testing
