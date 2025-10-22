# TTS Stop Button Stale Closure Fix - COMPLETE

## Summary
Fixed TTS stop buttons not working by removing stale closure issues in TTSContext. The stop, pause, and resume functions now access current state through setState callbacks instead of capturing state in dependencies.

## Problem
Neither stop button worked on the snippets page:
1. GlobalTTSStopButton (in app header)
2. Flashing stop button (in snippet dialog header)

Both buttons called `stop()` from TTSContext, but the function wasn't actually stopping playback.

## Root Cause: Stale Closure Issue

### The Bug
The `stop`, `pause`, and `resume` functions in TTSContext had `state.currentProvider` in their dependency arrays:

```typescript
const stop = useCallback(() => {
  const provider = providerFactory.getProvider(state.currentProvider);
  if (provider) {
    provider.stop();
  }
  setState(prev => ({ ...prev, isPlaying: false, currentText: null }));
}, [state.currentProvider, providerFactory, fallbackTimeoutId]);
```

### Why It Failed
1. **Frequent Recreation**: Every time `state` changed, a new `stop` function was created
2. **Stale References**: Components or event handlers captured old versions of the `stop` function
3. **Wrong Provider**: Old `stop` functions had outdated `state.currentProvider` values
4. **No Effect**: Clicking stop might call a function that references the wrong provider or none at all

### Symptoms
- Click stop button → nothing happens
- Audio continues playing
- `isPlaying` state might not update
- Console logs show wrong provider or "no provider found"

## Changes Made

### 1. Fixed `stop()` Function (`TTSContext.tsx` lines 234-257)

**Before:**
```typescript
const stop = useCallback(() => {
  console.log('TTSContext.stop() called - before:', { 
    isPlaying: state.isPlaying, 
    currentProvider: state.currentProvider 
  });
  
  // Clear fallback timeout
  if (fallbackTimeoutId) {
    clearTimeout(fallbackTimeoutId);
    setFallbackTimeoutId(null);
  }
  
  const provider = providerFactory.getProvider(state.currentProvider);
  if (provider) {
    provider.stop();
  }
  setState(prev => {
    console.log('TTSContext.stop() - setting isPlaying to false, prev state:', { 
      isPlaying: prev.isPlaying 
    });
    return { ...prev, isPlaying: false, currentText: null };
  });
}, [state.currentProvider, providerFactory, fallbackTimeoutId]);
```

**After:**
```typescript
const stop = useCallback(() => {
  console.log('TTSContext.stop() called');
  
  // Clear fallback timeout
  if (fallbackTimeoutId) {
    clearTimeout(fallbackTimeoutId);
    setFallbackTimeoutId(null);
  }
  
  // Use setState callback to get current provider without dependency
  setState(prev => {
    console.log('TTSContext.stop() - stopping, prev state:', { 
      isPlaying: prev.isPlaying, 
      currentProvider: prev.currentProvider 
    });
    
    // Stop the provider
    const provider = providerFactory.getProvider(prev.currentProvider);
    if (provider) {
      console.log('TTSContext.stop() - calling provider.stop()');
      provider.stop();
    } else {
      console.warn('TTSContext.stop() - no provider found for:', prev.currentProvider);
    }
    
    return { ...prev, isPlaying: false, currentText: null };
  });
}, [providerFactory, fallbackTimeoutId]);
```

**Key Changes:**
- ✅ Removed `state.currentProvider` from dependencies
- ✅ Access provider inside `setState` callback using `prev.currentProvider`
- ✅ Function only recreated when `providerFactory` or `fallbackTimeoutId` changes (rare)
- ✅ Always uses current state, no stale closures

### 2. Fixed `pause()` Function (`TTSContext.tsx` lines 259-267)

**Before:**
```typescript
const pause = useCallback(() => {
  const provider = providerFactory.getProvider(state.currentProvider);
  if (provider && provider.pause) {
    provider.pause();
  }
}, [state.currentProvider, providerFactory]);
```

**After:**
```typescript
const pause = useCallback(() => {
  setState(prev => {
    const provider = providerFactory.getProvider(prev.currentProvider);
    if (provider && provider.pause) {
      provider.pause();
    }
    return prev; // No state change needed
  });
}, [providerFactory]);
```

### 3. Fixed `resume()` Function (`TTSContext.tsx` lines 269-277)

**Before:**
```typescript
const resume = useCallback(() => {
  const provider = providerFactory.getProvider(state.currentProvider);
  if (provider && provider.resume) {
    provider.resume();
  }
}, [state.currentProvider, providerFactory]);
```

**After:**
```typescript
const resume = useCallback(() => {
  setState(prev => {
    const provider = providerFactory.getProvider(prev.currentProvider);
    if (provider && provider.resume) {
      provider.resume();
    }
    return prev; // No state change needed
  });
}, [providerFactory]);
```

## Pattern: Accessing State in Callbacks

### ❌ Bad Pattern (Creates Stale Closures)
```typescript
const myFunction = useCallback(() => {
  const value = someState.property;
  doSomething(value);
}, [someState.property]); // Recreates on every state change
```

### ✅ Good Pattern (No Stale Closures)
```typescript
const myFunction = useCallback(() => {
  setState(prev => {
    const value = prev.property;
    doSomething(value);
    return prev; // or return updated state
  });
}, []); // Stable reference
```

## Benefits

### 1. **Stable Function References**
- `stop`, `pause`, `resume` functions only recreated when `providerFactory` changes
- Components can safely capture these functions in effects/handlers
- No stale closure issues

### 2. **Always Current State**
- Functions always access the most recent state via `setState` callback
- No race conditions from outdated state values
- Reliable provider lookups

### 3. **Better Performance**
- Fewer function recreations = fewer re-renders
- Reduced memory overhead from closures
- More efficient React reconciliation

## Testing

### Expected Behavior (Now Fixed):
1. **Play snippet** → TTS starts, `isPlaying: true`
2. **Click stop button** → Audio immediately stops
3. **State updates** → `isPlaying: false`
4. **Button updates** → Stop button disappears, Play button returns
5. **Console logs**:
   ```
   TTSContext.stop() called
   TTSContext.stop() - stopping, prev state: { isPlaying: true, currentProvider: 'llm' }
   TTSContext.stop() - calling provider.stop()
   LLMProviderTTSProvider: stop() triggering onEnd callback
   ```

### All Stop Methods Work:
- ✅ GlobalTTSStopButton (app header, z-60)
- ✅ Flashing stop button (snippet dialog header)
- ✅ ReadButton stop icon (action buttons area)

## Files Modified
- **ui-new/src/contexts/TTSContext.tsx** (lines 234-277)
  - Updated `stop()` function to access state via setState callback
  - Updated `pause()` function to access state via setState callback
  - Updated `resume()` function to access state via setState callback
  - Removed `state.currentProvider` from all three dependency arrays

## Related Issues

This same pattern should be checked in other contexts that use `useCallback` with state dependencies. Common signs:
- Handlers that don't work on first click
- Functions that seem to reference old data
- Callbacks that need multiple clicks to take effect
- State updates that appear delayed or don't happen

## Technical Notes

### Why setState Callback Works
`setState` with a callback always receives the **most current state** at the time it executes, regardless of when the function was created. This breaks the closure:

```typescript
// Closure captures state at time of function creation
const bad = useCallback(() => {
  console.log(state.value); // Stale value
}, [state.value]);

// No closure - always gets current state
const good = useCallback(() => {
  setState(prev => {
    console.log(prev.value); // Current value
    return prev;
  });
}, []);
```

### Performance Consideration
Using `setState` with a callback that doesn't change state (`return prev`) is cheap and doesn't cause re-renders. React compares the return value and skips rendering if it's the same object.
