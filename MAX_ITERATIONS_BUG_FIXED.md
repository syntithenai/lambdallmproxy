# MAX_ITERATIONS Bug - ROOT CAUSE FOUND AND FIXED

## Issue
Simple queries were hitting "Maximum tool execution iterations reached" error even after successful completion.

## Root Cause
**Structural bug in `src/endpoints/chat.js`**: The MAX_ITERATIONS error handler (lines 3346-3401) was executing **unconditionally** after the while loop ended, regardless of whether the loop exited successfully via `break` or exhausted naturally.

### The Code Structure Problem

```javascript
Line 1622: while (iterationCount < maxIterations) {
    // ... tool execution logic ...
    
    Line 3246: break;  // Exit loop successfully
    Line 3248-3298: // UNREACHABLE CODE (Google Sheets logging after break)
    
Line 3344: }  // ← END OF WHILE LOOP

Line 3346: // MAX_ITERATIONS error handling - EXECUTED EVERY TIME!
Line 3357: console.log(`❌ MAX_ITERATIONS hit...`);
Line 3364: sseWriter.writeEvent('error', { code: 'MAX_ITERATIONS' ... });
Line 3400: responseStream.end();

Line 3403: } catch (error) {
```

**The Problem**: After the while loop closed at line 3344, the code immediately proceeded to MAX_ITERATIONS error handling without checking **why** the loop ended. This caused the error to fire even on successful completions.

## The Fix

Added conditional check to only execute MAX_ITERATIONS error when loop actually exhausted:

```javascript
Line 3347: // Check if we exited the loop due to hitting max iterations (not via break for completion)
Line 3348: if (iterationCount >= maxIterations) {
    // ... MAX_ITERATIONS error handling ...
Line 3401: } // End of if (iterationCount >= maxIterations)
```

Now the error only fires when `iterationCount >= maxIterations`, not when the loop exited via `break`.

## Changes Made

**File**: `src/endpoints/chat.js`

**Line 3347-3348**: Added condition before MAX_ITERATIONS error block
```javascript
// Check if we exited the loop due to hitting max iterations (not via break for completion)
if (iterationCount >= maxIterations) {
```

**Line 3401**: Closed the conditional block
```javascript
} // End of if (iterationCount >= maxIterations)
```

## Additional Issue Discovered

**Lines 3248-3298** contain **unreachable code** - Google Sheets logging logic placed after the `break` statement at line 3246. This code should be moved to execute before the break, or restructured to execute after the while loop closes.

### Suggested Follow-up Fix

The Google Sheets logging code (lines 3248-3298) should be moved before the `break` statement so it actually executes on successful completion:

```javascript
Line 3243: console.log(`✅ Completing request...`);

// Move this block UP (before break):
// Log to Google Sheets (async, don't block response)
try {
    const { logToGoogleSheets } = require('../services/google-sheets-logger');
    // ... logging code ...
} catch (err) {
    console.error('Google Sheets logging error:', err.message);
}

Line 3246: break;  // Exit the loop
```

This would ensure successful completions are logged to Google Sheets.

## Testing

After the fix:
- ✅ Simple queries complete successfully without MAX_ITERATIONS error
- ✅ Error only fires when loop genuinely hits iteration limit
- ✅ No syntax errors

## Status

**FIXED** - The conditional check prevents incorrect MAX_ITERATIONS errors.

**KNOWN ISSUE** - Unreachable Google Sheets logging code after `break` statement (lines 3248-3298) should be refactored in a follow-up fix.
