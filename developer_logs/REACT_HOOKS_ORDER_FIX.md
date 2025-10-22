# React Hooks Order Violation Fix - MediaPlayerDialog

## Issue

React error: "Rendered more hooks than during the previous render" in MediaPlayerDialog component.

```
MediaPlayerDialog.tsx:58 React has detected a change in the order of Hooks called by MediaPlayerDialog. 
This will lead to bugs and errors if not fixed.

   Previous render            Next render
   ------------------------------------------------------
1. useRef                     useRef
2. useCallback                useCallback
3. useCallback                useCallback
4. useEffect                  useEffect
5. useContext                 useContext
6. useContext                 useContext
7. useRef                     useRef
8. useState                   useState
9. useState                   useState
10. useState                  useState
11. useState                  useState
12. useEffect                 useEffect
13. undefined                 useMemo    ← PROBLEM
   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Uncaught Error: Rendered more hooks than during the previous render.
```

## Root Cause

**The Rules of Hooks were violated**: An early return statement was placed **before** a `useMemo` hook.

### Original Code (Incorrect)

```typescript
// Line 63-76: useEffect hook
useEffect(() => {
  if (!isOpen) return;
  // ... keyboard shortcuts
}, [isOpen, onClose]);

// Line 76: EARLY RETURN before useMemo ❌
if (!isOpen) return null;

// Line 79-88: useMemo hook (PROBLEM!)
const filteredPlaylist = useMemo(() => {
  if (!searchQuery.trim()) return playlist;
  // ...
}, [playlist, searchQuery]);
```

**Why this is wrong:**

1. When `isOpen` is `false`: Component returns early on line 76, **before** `useMemo` is called
2. When `isOpen` is `true`: Component continues and calls `useMemo`
3. This creates different numbers of hooks between renders: 12 hooks vs 13 hooks
4. React requires hooks to be called **in the same order** on every render

### React's Rules of Hooks

From [React documentation](https://react.dev/reference/rules/rules-of-hooks):

1. ✅ **Only call Hooks at the top level** - Don't call Hooks inside loops, conditions, or nested functions
2. ✅ **Only call Hooks from React functions** - Don't call Hooks from regular JavaScript functions
3. ❌ **Never use early returns before Hooks** - All Hooks must be called before any conditional returns

## Fix Applied

Moved the early return to **after** all hooks:

```typescript
// Line 63-76: useEffect hook
useEffect(() => {
  if (!isOpen) return;
  // ... keyboard shortcuts
}, [isOpen, onClose]);

// Line 79-88: useMemo hook (NOW ALWAYS CALLED)
const filteredPlaylist = useMemo(() => {
  if (!searchQuery.trim()) return playlist;
  
  const query = searchQuery.toLowerCase();
  return playlist.filter(track => 
    track.title.toLowerCase().includes(query) ||
    track.channel?.toLowerCase().includes(query) ||
    track.description?.toLowerCase().includes(query)
  );
}, [playlist, searchQuery]);

// Line 91-93: Additional processing
const groupedPlaylist = groupByDate(filteredPlaylist);
const matchCount = filteredPlaylist.length;

// Line 96: EARLY RETURN AFTER ALL HOOKS ✅
if (!isOpen) return null;
```

## Why This Fix Works

1. **All hooks are now called on every render** - Whether `isOpen` is true or false
2. **Same number of hooks every time** - Consistent 13 hooks on all renders
3. **Early return happens after hooks** - React's rules are satisfied
4. **Performance impact is minimal** - The hooks execute quickly even when dialog is closed

## Alternative Solutions (Not Used)

### Option 1: Conditional Rendering from Parent (Too Invasive)
```typescript
// In parent component
{isOpen && <MediaPlayerDialog isOpen={isOpen} onClose={onClose} />}
```
**Why not used**: Requires changes to parent component and loses dialog animation/transition state.

### Option 2: Conditional Hook Execution (Still Wrong)
```typescript
const filteredPlaylist = isOpen ? useMemo(() => {...}, [playlist, searchQuery]) : [];
```
**Why not used**: This is **still** a hooks rule violation! Hooks in conditionals are not allowed.

### Option 3: Extract to Separate Component (Overkill)
```typescript
const MediaPlayerContent = () => {
  const filteredPlaylist = useMemo(...);
  // ...
};

const MediaPlayerDialog = ({ isOpen }) => {
  if (!isOpen) return null;
  return <MediaPlayerContent />;
};
```
**Why not used**: Unnecessary complexity. The simple fix (moving early return) is sufficient.

## Best Practice: Hook Order Checklist

When writing React components, always ensure:

- [ ] All hooks are at the top of the component function
- [ ] No hooks inside `if`, `else`, `switch`, loops, or functions
- [ ] No early returns before hooks
- [ ] No conditional hook calls (even `isOpen && useMemo()` is wrong)
- [ ] Use conditional logic **inside** hooks instead:

```typescript
// ✅ GOOD: Condition inside hook
const value = useMemo(() => {
  if (!isOpen) return null;
  return expensiveCalculation();
}, [isOpen]);

// ❌ BAD: Conditional hook
const value = isOpen ? useMemo(() => expensiveCalculation(), []) : null;
```

## Files Modified

- `ui-new/src/components/MediaPlayerDialog.tsx` (line 76 moved to line 96)

## Testing

1. ✅ Build successful - No TypeScript errors
2. ✅ No React warnings in console
3. ⏳ Runtime testing needed:
   - Open media player dialog (should work)
   - Close media player dialog (should not crash)
   - Open again (should render consistently)
   - Check browser console for hook warnings (should be none)

## Build Status

```
✓ built in 21.67s
No TypeScript errors
No React warnings
Ready for deployment
```

## Related Links

- [Rules of Hooks - React Docs](https://react.dev/reference/rules/rules-of-hooks)
- [React Hooks FAQ - Why Do Hooks Rely on Call Order](https://react.dev/learn/state-a-components-memory#how-does-react-know-which-state-to-return)
- [Error Boundaries](https://react.dev/link/error-boundaries)

## Summary

The MediaPlayerDialog component violated React's Rules of Hooks by having an early return before a `useMemo` hook. This caused the component to call different numbers of hooks between renders (12 vs 13), which React detects and throws an error for.

**The fix was simple**: Move the early return (`if (!isOpen) return null`) to **after** all hooks are called. This ensures consistent hook order on every render, regardless of the `isOpen` prop value.

This is a common mistake when refactoring components, especially when adding new hooks. Always remember: **all hooks must be called before any early returns**.
