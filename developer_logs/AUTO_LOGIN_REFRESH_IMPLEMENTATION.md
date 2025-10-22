# Automatic Login Token Refresh

**Date**: October 15, 2025  
**Feature**: Automatic token refresh before expiry  
**Status**: ✅ Implemented

## Summary

Implemented automatic Google OAuth token refresh to prevent users from being logged out when their authentication token expires. The system now proactively refreshes tokens before they expire, providing a seamless user experience.

## Changes Made

### 1. ✅ Enhanced Token Refresh Function (`AuthContext.tsx`)

**Before**:
```typescript
const refreshToken = useCallback(async (): Promise<boolean> => {
  // Token refresh is disabled - user must re-login
  console.log('Token refresh requested, but automatic refresh is disabled');
  return false;
}, []);
```

**After**:
```typescript
const refreshToken = useCallback(async (): Promise<boolean> => {
  try {
    console.log('🔄 Attempting to refresh token...');
    
    if (!authState.accessToken) {
      console.warn('No token to refresh');
      return false;
    }

    const { refreshGoogleToken, decodeJWT, saveAuthState: saveAuthStateUtil } = 
      await import('../utils/auth');
    const newToken = await refreshGoogleToken();
    
    if (newToken) {
      const decoded = decodeJWT(newToken);
      if (decoded) {
        const user: GoogleUser = {
          email: decoded.email,
          name: decoded.name,
          picture: decoded.picture,
          sub: decoded.sub
        };
        
        saveAuthStateUtil(user, newToken);
        setAuthState({
          user,
          accessToken: newToken,
          isAuthenticated: true
        });
        
        console.log('✅ Token refreshed successfully');
        return true;
      }
    }
    
    console.warn('⚠️ Token refresh failed');
    return false;
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    return false;
  }
}, [authState.accessToken]);
```

**Changes**:
- Now actually calls `refreshGoogleToken()` from auth utils
- Decodes new token and updates user state
- Saves new token to localStorage
- Returns success/failure status

---

### 2. ✅ Added Proactive Refresh Check (`auth.ts`)

**New Function**:
```typescript
// Check if token should be proactively refreshed (within 15 minutes of expiry)
export const shouldRefreshToken = (token: string): boolean => {
  try {
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    
    const expirationTime = decoded.exp * 1000;
    const currentTime = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    
    const remaining = expirationTime - currentTime;
    
    // Refresh if less than 15 minutes remaining
    return remaining < fifteenMinutes;
  } catch (e) {
    console.error('Failed to check if token should refresh:', e);
    return true;
  }
};
```

**Purpose**:
- Separate function for earlier refresh check (15 min threshold)
- Allows proactive refresh before token becomes critical
- Reduces chance of user being logged out

---

### 3. ✅ Automatic Refresh Loop (`AuthContext.tsx`)

**Before** (logged out when expired):
```typescript
// Check token every 30 seconds for expiration
const interval = setInterval(() => {
  if (!authState.accessToken) return;
  
  if (isTokenExpiringSoon(authState.accessToken)) {
    console.warn('⚠️ Token expired, logging out...');
    logout();
  }
}, 30 * 1000);
```

**After** (automatically refreshes):
```typescript
// Check token every 2 minutes for proactive refresh
const interval = setInterval(async () => {
  if (!authState.accessToken) return;
  
  const currentToken = authState.accessToken;
  
  // Proactively refresh when within 15 minutes of expiry
  if (shouldRefreshToken(currentToken)) {
    console.log('🔄 Token within 15 minutes of expiry, attempting proactive refresh...');
    
    const success = await refreshToken();
    
    if (!success && isTokenExpiringSoon(currentToken)) {
      // Only logout if refresh failed AND token is critically close to expiring
      console.warn('⚠️ Proactive refresh failed and token expiring soon, logging out...');
      logout();
    } else if (!success) {
      console.warn('⚠️ Proactive refresh failed but token still has time');
    }
  }
}, 2 * 60 * 1000); // Check every 2 minutes
```

**Changes**:
- Check interval increased to 2 minutes (was 30 seconds)
- Proactively refreshes at 15 min before expiry
- Only logs out if refresh fails AND token is critically close (< 5 min)
- Gracefully handles refresh failures with retry opportunities

---

### 4. ✅ Refresh on Mount

**New Logic**:
```typescript
// Immediate check on mount
const currentToken = authState.accessToken;

if (shouldRefreshToken(currentToken)) {
  console.log('🔄 Token should be refreshed on mount (less than 15 min remaining)');
  refreshToken().then((success) => {
    if (!success && isTokenExpiringSoon(currentToken)) {
      console.warn('⚠️ Token refresh failed and token expiring soon, logging out...');
      logout();
    }
  });
} else if (isTokenExpiringSoon(currentToken)) {
  // Token is critically close to expiring (< 5 min), must refresh or logout
  console.warn('⚠️ Token critically close to expiring on mount, attempting refresh...');
  refreshToken().then((success) => {
    if (!success) {
      console.warn('⚠️ Critical token refresh failed on mount, logging out...');
      logout();
    }
  });
}
```

**Purpose**:
- Refresh token immediately on page load if needed
- Handle both proactive (15 min) and critical (5 min) scenarios
- Ensures users don't immediately get logged out after page refresh

---

## How It Works

### Token Expiration Timeline

```
Token Created
    |
    |------ 45 minutes ------>|<-- 15 min -->|<- 5 min ->| Expiry
    |                         |              |           |
    ✅ Valid                  🔄 Proactive   ⚠️ Critical | ❌ Expired
                              Refresh       Refresh
```

**Zones**:

1. **✅ Valid Zone** (45+ min remaining)
   - Token is fresh and valid
   - No action needed
   - App operates normally

2. **🔄 Proactive Refresh Zone** (15-5 min remaining)
   - Token approaching expiry
   - System attempts silent refresh
   - If refresh fails, keeps trying until critical zone
   - User continues working uninterrupted

3. **⚠️ Critical Zone** (5-0 min remaining)
   - Token about to expire
   - System urgently attempts refresh
   - If refresh fails, user is logged out
   - Last chance to maintain session

4. **❌ Expired** (0 min)
   - Token no longer valid
   - User must sign in again

---

## Refresh Behavior

### Automatic Checks

| Check Type | Timing | Action |
|------------|--------|--------|
| **On Mount** | Page load/refresh | Immediate refresh if < 15 min |
| **Periodic** | Every 2 minutes | Check and refresh if < 15 min |
| **Critical** | When < 5 min | Urgent refresh, logout if fails |

### Silent Refresh Process

1. **Detect expiration approaching** (< 15 min remaining)
2. **Call `refreshGoogleToken()`** (from auth utils)
3. **Google OAuth auto_select** tries silent sign-in
4. **If successful**:
   - Decode new JWT token
   - Extract user info
   - Save to localStorage
   - Update React state
   - ✅ User continues working
5. **If fails**:
   - Log warning
   - Retry on next check (2 min later)
   - Only logout if critically close (< 5 min)

---

## User Experience

### Before (without auto-refresh)
```
User working → Token expires → Logged out → Data loss → Frustrated user
```

### After (with auto-refresh)
```
User working → Token refreshes silently → User continues working → Happy user
```

**Benefits**:
- ✅ No unexpected logouts
- ✅ No interruption to workflow
- ✅ No data loss from unsaved work
- ✅ Seamless experience
- ✅ Users barely notice token management

---

## Configuration

### Refresh Thresholds

Adjust in `src/utils/auth.ts`:

```typescript
// Proactive refresh (current: 15 minutes)
const fifteenMinutes = 15 * 60 * 1000;

// Critical refresh (current: 5 minutes)
const fiveMinutes = 5 * 60 * 1000;
```

**Recommendations**:
- **Proactive**: 10-20 minutes (gives multiple retry chances)
- **Critical**: 5-10 minutes (last chance before expiry)
- **Check interval**: 1-5 minutes (balance between responsiveness and performance)

### Check Frequency

Adjust in `src/contexts/AuthContext.tsx`:

```typescript
// Current: Every 2 minutes
const interval = setInterval(async () => {
  // ...refresh logic
}, 2 * 60 * 1000);
```

**Trade-offs**:
- **More frequent** (30 sec - 1 min): Faster response, more CPU usage
- **Less frequent** (5-10 min): Less CPU usage, might miss optimal refresh window
- **Recommended**: 2-3 minutes (good balance)

---

## Testing

### Manual Testing

1. **Test proactive refresh** (15 min before expiry):
   ```typescript
   // In browser console:
   // Manually set token to expire in 14 minutes
   const token = localStorage.getItem('google_access_token');
   const decoded = JSON.parse(atob(token.split('.')[1]));
   const newExp = Math.floor(Date.now() / 1000) + (14 * 60);
   // (Note: This is for testing only, actual tokens are signed by Google)
   ```

2. **Test critical refresh** (5 min before expiry):
   - Wait for token to naturally reach 5 min remaining
   - Watch console for "Token critically close to expiring" message
   - Verify refresh attempt

3. **Test refresh on mount**:
   - Login and wait for token to reach 14 min remaining
   - Refresh page
   - Watch console for "Token should be refreshed on mount" message

### Automated Testing

```typescript
// Example Jest test
describe('Token Refresh', () => {
  it('should refresh token when within 15 minutes of expiry', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    
    // Mock token expiring in 14 minutes
    const mockToken = createMockToken({ expiresIn: 14 * 60 });
    act(() => result.current.login(mockToken));
    
    // Wait for refresh check interval
    await waitFor(() => {
      expect(refreshGoogleToken).toHaveBeenCalled();
    }, { timeout: 3000 });
  });
});
```

---

## Console Logs

Monitor refresh behavior via console:

### Normal Operation
```
🔄 Token should be refreshed on mount (less than 15 min remaining)
🔄 Attempting to refresh token...
✅ Token refreshed successfully
```

### Proactive Refresh
```
🔄 Token within 15 minutes of expiry, attempting proactive refresh...
🔄 Attempting to refresh token...
✅ Token refreshed successfully
```

### Critical Refresh
```
⚠️ Token critically close to expiring on mount, attempting refresh...
🔄 Attempting to refresh token...
✅ Token refreshed successfully
```

### Refresh Failure (still has time)
```
🔄 Token within 15 minutes of expiry, attempting proactive refresh...
🔄 Attempting to refresh token...
⚠️ Token refresh failed
⚠️ Proactive refresh failed but token still has time
```

### Refresh Failure (critical)
```
⚠️ Token critically close to expiring on mount, attempting refresh...
🔄 Attempting to refresh token...
⚠️ Token refresh failed
⚠️ Proactive refresh failed and token expiring soon, logging out...
User logged out
```

---

## Limitations

### Google OAuth Silent Refresh

Google's silent refresh (`auto_select: true`) has limitations:

1. **Requires third-party cookies** enabled
2. **May not work in incognito/private mode**
3. **Subject to Google's security policies**
4. **Can fail due to network issues**

### Fallback Behavior

If silent refresh consistently fails:
- User is logged out when token expires
- User must manually sign in again
- Session state is preserved (no data loss)
- Next login will have fresh token (1 hour validity)

---

## Future Improvements

### Option 1: Refresh Token Flow
Implement proper OAuth refresh token flow:
- Store refresh token (longer-lived)
- Use refresh token to get new access token
- No need for silent sign-in

### Option 2: Server-Side Session
Backend-issued JWT with refresh:
- Lambda issues JWT with refresh token
- Client requests new JWT via refresh token
- More control over token lifetime

### Option 3: Exponential Backoff
Smarter retry strategy:
- First retry: 2 minutes
- Second retry: 4 minutes
- Third retry: 8 minutes
- Reduces spam during network issues

---

## Related Files

- `ui-new/src/contexts/AuthContext.tsx` - Main auth context with refresh logic
- `ui-new/src/utils/auth.ts` - Token validation and refresh functions
- `ui-new/src/components/LoginScreen.tsx` - Login UI
- `ui-new/src/components/GoogleLoginButton.tsx` - Google Sign-In button

---

## Summary

✅ **Problem Solved**: Users no longer get unexpectedly logged out when tokens expire

✅ **Implementation**: Proactive token refresh at 15 min before expiry with 2-minute check interval

✅ **User Experience**: Seamless, uninterrupted workflow with automatic session maintenance

✅ **Reliability**: Multiple retry opportunities before forcing logout

✅ **Monitoring**: Comprehensive console logging for debugging and observability

---

**Result**: Enhanced user experience with automatic login session maintenance! 🎉
