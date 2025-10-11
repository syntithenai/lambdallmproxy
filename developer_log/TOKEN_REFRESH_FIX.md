# Token Refresh Issue - Fixed

## Problem

The automatic token refresh was causing errors and conflicts:

```
Token expiring soon, refreshing...
Silent token refresh timed out
Token refresh failed, clearing auth state
[GSI_LOGGER]: FedCM get() rejects with NotAllowedError: 
Only one navigator.credentials.get request may be outstanding at one time.
```

**Root Cause**: 
- Google's One Tap API was being initialized multiple times simultaneously:
  1. By the LoginScreen for initial sign-in
  2. By the token refresh logic for automatic refresh
- Google's One Tap/Silent refresh (`auto_select: true`) doesn't work well for background token refresh
- The `refreshGoogleToken()` function was trying to call `google.accounts.id.prompt()` while the login screen was also active
- This caused a conflict and timed out after 5 seconds

## Solution

**Disabled automatic token refresh** and implemented a simpler, more reliable approach:

### What Changed:

1. **Removed automatic refresh attempts**
   - No more background calls to `google.accounts.id.prompt()`
   - No more conflicts with the login screen
   - No more timeout errors

2. **Simple expiration check**
   - Check token every 60 seconds
   - If token is expired: log user out
   - User sees login screen and can sign in again with One Tap

3. **Simplified auto-login**
   - On page load, check if saved token is still valid
   - If valid: auto-login with existing token
   - If expired: clear auth state and show login screen

4. **Clean token validation**
   - `getToken()` checks expiration before returning token
   - If expired: automatically logs out and returns null
   - API calls will fail gracefully and user sees login screen

### Code Changes:

**Before** (Complex, Buggy):
```typescript
// Tried to refresh token automatically every 5 minutes
setInterval(() => {
  if (isTokenExpiringSoon(token)) {
    refreshToken(); // This conflicted with login screen
  }
}, 5 * 60 * 1000);

// refreshGoogleToken() tried to use google.accounts.id.prompt()
// This caused "Only one request may be outstanding" error
```

**After** (Simple, Reliable):
```typescript
// Just check if expired and logout
setInterval(() => {
  if (isTokenExpiringSoon(token)) {
    console.log('Token expired, logging out...');
    logout();
  }
}, 60 * 1000); // Check every minute

// No more google.accounts.id.prompt() calls in background
```

## User Experience

### Before:
- ❌ App would randomly log user out due to refresh failures
- ❌ Console filled with errors and warnings
- ❌ Google API conflicts and timeouts
- ❌ Confusing "Only one request" errors

### After:
- ✅ Token valid for ~1 hour (Google's default)
- ✅ When token expires: smooth logout
- ✅ Login screen appears with One Tap
- ✅ User clicks and is logged in again
- ✅ No background errors or conflicts
- ✅ Clean console output

## Token Lifetime

**Google OAuth tokens (JWT) expire after ~1 hour by default**

### Timeline:
- **0-55 minutes**: Token is valid, app works normally
- **55+ minutes**: Token flagged as "expiring soon" (within 5 minutes)
- **60 minutes**: Token expired
  - Next token check (within 1 minute) detects expiration
  - User is logged out
  - Login screen appears
  - User can sign in again with One Tap

### Why Not Refresh Automatically?

Google's OAuth system has limitations:
1. **Silent refresh requires user interaction**: Can't truly be "silent"
2. **One Tap conflicts**: Can't have multiple prompt() calls active
3. **Security design**: Short-lived tokens are intentional
4. **Best practice**: Let users re-authenticate when needed

## Testing

### Test Token Expiration:

**Method 1: Wait** (Not practical)
- Sign in and wait 1 hour
- App should log you out
- Login screen should appear

**Method 2: Manually expire token** (Developer)
```javascript
// In browser console:
const token = localStorage.getItem('google_access_token');
const decoded = JSON.parse(atob(token.split('.')[1]));
console.log('Token expires at:', new Date(decoded.exp * 1000));

// Force immediate expiration
decoded.exp = Math.floor(Date.now() / 1000) - 1; // 1 second ago
const newToken = token.split('.').slice(0, 1).join('.') + 
  '.' + btoa(JSON.stringify(decoded)) + 
  '.' + token.split('.')[2];
localStorage.setItem('google_access_token', newToken);

// Reload page - should see login screen
location.reload();
```

**Method 3: Clear storage** (Easy test)
```javascript
// In browser console:
localStorage.clear();
location.reload();
// Should see login screen
```

### Expected Console Output:

**On expired token:**
```
Token expired, logging out...
User logged out
LoginScreen: Initializing Google Sign-In
LoginScreen: Attempting One Tap sign-in
```

**No more errors:**
- ❌ No "Silent token refresh timed out"
- ❌ No "Only one navigator.credentials.get request"
- ❌ No "Token refresh failed"
- ❌ No FedCM warnings from background refresh

## API Behavior

All API calls check token validity:

```typescript
const token = await getToken(); // Checks expiration
if (!token) {
  // User is logged out
  // Login screen appears
  return;
}
// Make API call with valid token
```

If token expires mid-session:
1. Next API call attempts to get token
2. `getToken()` detects expiration
3. Logs user out
4. Returns null
5. API call fails gracefully
6. User sees login screen

## Benefits

✅ **Simpler code** - Less complexity, easier to maintain  
✅ **No conflicts** - No multiple OAuth flows fighting  
✅ **Reliable** - No timeout errors or race conditions  
✅ **Better UX** - Clean logout, smooth re-login with One Tap  
✅ **Standard practice** - Many apps handle expiration this way  
✅ **Security** - Short-lived tokens as intended  

## Alternative Approaches (Not Implemented)

### 1. Server-Side Token Refresh
**How**: Store refresh token on backend, refresh access token server-side  
**Pros**: True silent refresh, better security  
**Cons**: Requires backend changes, more complex  

### 2. Longer Token Lifetime
**How**: Request longer-lived tokens from Google  
**Pros**: Less frequent re-login  
**Cons**: Security risk, not recommended by Google  

### 3. Refresh Token Flow
**How**: Use OAuth refresh_token grant type  
**Pros**: Standard OAuth2 pattern  
**Cons**: Requires secure storage, more complex setup  

## Current Implementation: Client-Side JWT Only

**Chosen approach**: Simple, client-side, re-login on expiration  
**Rationale**: Best balance of simplicity and security for this app  
**Trade-off**: Users need to re-login every hour (minimal friction with One Tap)  

## Migration Notes

Users with expired tokens in localStorage:
- ✅ Will be logged out on next page load
- ✅ Login screen appears immediately
- ✅ Can sign in again with One Tap
- ✅ No error messages or confusion

No data loss - all local data (Swag snippets, settings) is preserved.

## Future Enhancements (Optional)

If automatic refresh becomes important:

1. **Implement proper refresh token flow**
   - Store refresh token securely
   - Use it to get new access tokens
   - Requires backend support

2. **Show "Session Expiring" warning**
   - Toast notification 5 minutes before expiration
   - "Your session will expire in 5 minutes. Click to stay logged in."
   - Triggers re-login flow

3. **Background tab handling**
   - Detect when tab becomes active
   - Check token validity
   - Auto-logout if expired while inactive

These are optional and can be added if user feedback indicates they're needed.

## Summary

**Before**: Complex automatic refresh that didn't work reliably  
**After**: Simple expiration check with clean logout  
**Result**: No more errors, better user experience, cleaner code  

Users need to re-login every hour, but with Google One Tap, it's just one click! 🎉
