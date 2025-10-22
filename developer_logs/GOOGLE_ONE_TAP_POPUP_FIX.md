# Google One Tap "Cannot continue with Google" Popup Fix

## Issue
When the authentication token auto-refreshes/expires and the user is logged out, the LoginScreen component would sometimes show a popup with the error: **"Cannot continue with Google."**

## Root Cause
The issue was in `LoginScreen.tsx`. The component calls `google.accounts.id.prompt()` to attempt Google One Tap authentication for returning users. However, Google One Tap has built-in rate limiting and cooldown periods. When the prompt is called multiple times in a short period (e.g., when the component re-renders after token expiration), it can trigger this error popup.

### Scenario that Triggered the Issue:
1. User is logged in with a valid token
2. Token expires (Google ID tokens expire after 1 hour)
3. AuthContext detects expiration and logs user out
4. LoginScreen component mounts
5. LoginScreen calls `google.accounts.id.prompt()`
6. If user had dismissed One Tap recently, or if called too frequently, Google shows "Cannot continue with Google" popup

## Solution
Implemented a session-level guard to ensure `google.accounts.id.prompt()` is only called once per browser session, preventing rapid re-calls that trigger the error popup.

### Changes Made to `LoginScreen.tsx`:

#### 1. Added Session Guard Variable
```typescript
// Track if we've already attempted One Tap in this session
// to prevent "Cannot continue with Google" popup on rapid re-renders
let hasAttemptedOneTap = false;
```

#### 2. Updated One Tap Prompt Logic
```typescript
// Only attempt once per session to prevent "Cannot continue with Google" popup
if (!hasAttemptedOneTap) {
  hasAttemptedOneTap = true;
  console.log('LoginScreen: Attempting One Tap sign-in (first time this session)');
  
  try {
    (google.accounts.id.prompt as any)((notification: any) => {
      // ... callback logic
    });
  } catch (error) {
    // Silently catch any Google One Tap errors to prevent popup
    console.log('LoginScreen: One Tap prompt failed silently:', error);
  }
} else {
  console.log('LoginScreen: Skipping One Tap (already attempted this session)');
}
```

## Behavior After Fix

### First Time LoginScreen Mounts (in a browser session):
- ✅ Google One Tap prompt is attempted
- ✅ User can sign in silently if they were recently authenticated
- ✅ Manual login button still available

### Subsequent LoginScreen Mounts (same browser session):
- ✅ One Tap prompt is skipped (logged to console)
- ✅ No "Cannot continue with Google" popup
- ✅ User can still use the manual "Sign in with Google" button

### When Browser Tab/Window is Refreshed:
- ✅ Session guard resets (new page load)
- ✅ One Tap prompt attempted again (once)

## Benefits

1. **No More Annoying Popups**: Users won't see "Cannot continue with Google" errors
2. **Better UX**: Silent One Tap still works on first mount
3. **Manual Login Always Available**: Sign-in button remains functional
4. **Respects Google's Rate Limits**: Prevents excessive prompt() calls
5. **Backward Compatible**: Doesn't break existing authentication flow

## Technical Details

### Google One Tap Rate Limiting
Google One Tap implements rate limiting to prevent abuse:
- **Cooldown Period**: After dismissal, won't show again for 2 hours
- **Rate Limits**: Limited number of prompt() calls per time period
- **User Dismissal**: If user clicks "X" or closes prompt, it won't show again
- **Browser Settings**: Users can disable One Tap entirely

### Why Module-Level Variable Works
```typescript
let hasAttemptedOneTap = false;
```
- Variable persists across component re-renders
- Resets only on page refresh (new module load)
- Simple and effective for this use case
- No need for localStorage or complex state management

### Alternative Considered
We could have used `localStorage` to persist across page refreshes, but decided against it because:
- Resetting on page refresh is acceptable behavior
- Keeps implementation simple
- Avoids potential stale state issues

## Testing Checklist

- [x] Build succeeds without errors
- [x] Manual login button still works
- [x] One Tap attempted on first mount
- [x] One Tap skipped on subsequent mounts
- [x] No "Cannot continue with Google" popup
- [x] Logs show correct behavior in console

## Deployment Info

- **Commit**: e98c0fe
- **Build**: 784.52 kB (229.63 kB gzip)
- **Deployed**: October 10, 2025
- **Status**: ✅ Live at https://lambdallmproxy.pages.dev

## Related Files

- `ui-new/src/components/LoginScreen.tsx` - Fixed component
- `ui-new/src/contexts/AuthContext.tsx` - Token expiration handling
- `ui-new/src/utils/auth.ts` - Auth utility functions

## Future Considerations

If we need more sophisticated One Tap behavior in the future, we could:
1. Add exponential backoff for retry attempts
2. Implement smart detection of Google API errors
3. Add user preference to disable One Tap
4. Track dismissal reasons and adjust behavior

For now, the simple session guard is sufficient and effective.
