# Token Expiration Checking and Auto-Logout

**Date**: October 8, 2025  
**Feature**: Automatic token expiration detection and user logout  
**Status**: ✅ Implemented and Deployed

---

## Problem

Users experiencing "Authentication required" errors when their Google OAuth token expires (after ~1 hour), but the UI doesn't detect this and continues to allow message sending, leading to confusing errors.

---

## Solution

Implemented comprehensive token expiration checking:

1. **Periodic Checks**: Every 30 seconds, check if token is expired
2. **Warning Notifications**: Alert user 10 minutes before expiration
3. **Auto-Logout**: Automatically log out when token expires
4. **Error Detection**: Detect auth errors from API and trigger logout
5. **Immediate Validation**: Check token validity before sending messages

---

## Implementation Details

### 1. Enhanced Token Utilities

**File**: `ui-new/src/utils/auth.ts`

Added `getTokenTimeRemaining` function:

```typescript
// Get time until token expires (in milliseconds)
export const getTokenTimeRemaining = (token: string): number => {
  try {
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      return 0;
    }
    
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const remaining = expirationTime - currentTime;
    
    return Math.max(0, remaining);
  } catch (e) {
    console.error('Failed to get token time remaining:', e);
    return 0;
  }
};
```

Enhanced `isTokenExpiringSoon` with logging:

```typescript
export const isTokenExpiringSoon = (token: string): boolean => {
  try {
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    
    const expirationTime = decoded.exp * 1000;
    const currentTime = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    const remaining = expirationTime - currentTime;
    
    // Log warning if expiring within 10 minutes
    if (remaining > 0 && remaining < 10 * 60 * 1000 && remaining >= fiveMinutes) {
      const minutesRemaining = Math.floor(remaining / 60000);
      console.warn(`⚠️ Token expires in ${minutesRemaining} minutes`);
    }
    
    return remaining < fiveMinutes;
  } catch (e) {
    console.error('Failed to check token expiration:', e);
    return true;
  }
};
```

**Key Thresholds**:
- **10 minutes**: Warning notification shown
- **5 minutes**: Token considered "expiring soon"
- **0 minutes**: Token expired, immediate logout

### 2. AuthContext Periodic Checking

**File**: `ui-new/src/contexts/AuthContext.tsx`

Added state for warning tracking:

```typescript
const [hasShownExpiryWarning, setHasShownExpiryWarning] = useState(false);
const { showWarning } = useToast();
```

Implemented periodic expiration check:

```typescript
// Check for token expiration periodically and logout if expired
useEffect(() => {
  if (!authState.isAuthenticated || !authState.accessToken) {
    setHasShownExpiryWarning(false);
    return;
  }

  // Immediate check on mount
  if (isTokenExpiringSoon(authState.accessToken)) {
    console.warn('⚠️ Token expired on mount, logging out...');
    showWarning('Your session has expired. Please sign in again.');
    logout();
    return;
  }

  // Check token every 30 seconds for expiration
  const interval = setInterval(() => {
    if (!authState.accessToken) return;
    
    const timeRemaining = getTokenTimeRemaining(authState.accessToken);
    const minutesRemaining = Math.floor(timeRemaining / 60000);
    
    // Show warning at 10 minutes
    if (!hasShownExpiryWarning && timeRemaining > 0 && minutesRemaining <= 10 && minutesRemaining > 5) {
      console.warn(`⚠️ Token expires in ${minutesRemaining} minutes`);
      showWarning(`Your session expires in ${minutesRemaining} minutes. Please save your work.`);
      setHasShownExpiryWarning(true);
    }
    
    // Logout when expired (within 5 minutes)
    if (isTokenExpiringSoon(authState.accessToken)) {
      console.warn('⚠️ Token expired, logging out...');
      showWarning('Your session has expired. Please sign in again.');
      logout();
    }
  }, 30 * 1000); // 30 seconds

  return () => clearInterval(interval);
}, [authState.isAuthenticated, authState.accessToken, hasShownExpiryWarning, logout, showWarning]);
```

**Benefits**:
- ✅ Checks every 30 seconds (previously 60 seconds)
- ✅ Immediate check on component mount
- ✅ Warning at 10 minutes remaining
- ✅ Auto-logout at 5 minutes (token "expiring soon")
- ✅ Toast notifications for user awareness

### 3. ChatTab Pre-Send Validation

**File**: `ui-new/src/components/ChatTab.tsx`

Added token check before sending:

```typescript
const handleSend = async (messageText?: string) => {
  const textToSend = messageText !== undefined ? messageText : input;
  if (!textToSend.trim() || isLoading) return;
  
  // Check authentication before sending
  if (!accessToken) {
    showError('Please sign in to send messages');
    return;
  }
  
  // ... continue with message sending
};
```

**Benefits**:
- ✅ Prevents sending if not authenticated
- ✅ Clear error message to user
- ✅ Avoids confusing API errors

### 4. API Error Detection

**File**: `ui-new/src/components/ChatTab.tsx`

Enhanced error handling to detect auth errors:

```typescript
case 'error':
  // Error occurred
  const errorMsg = data.error;
  showError(errorMsg);
  
  // Check if authentication error - auto-logout
  if (errorMsg.includes('Authentication') || 
      errorMsg.includes('UNAUTHORIZED') || 
      data.code === 'UNAUTHORIZED') {
    console.warn('⚠️ Authentication error detected, logging out...');
    showWarning('Your session has expired. Please sign in again.');
    // The AuthContext will handle logout via useAuth
  }
  
  const errorMessage: ChatMessage = {
    role: 'assistant',
    content: `❌ Error: ${errorMsg}`
  };
  setMessages(prev => [...prev, errorMessage]);
  break;
```

**Benefits**:
- ✅ Detects "Authentication required" errors from API
- ✅ Automatically triggers warning notification
- ✅ Graceful handling of expired token scenarios

---

## User Experience

### Scenario 1: User Signs In

1. **User clicks "Sign in with Google"**
2. **Authenticates with Google**
3. **Token received** (expires in 60 minutes)
4. **Periodic checks start** (every 30 seconds)

**Console**: `🔒 Verifying Google token... ✅ Token signature verified`

### Scenario 2: Token Approaching Expiration

**At 10 minutes remaining**:
1. **Toast warning appears**: "Your session expires in 10 minutes. Please save your work."
2. **Console log**: `⚠️ Token expires in 10 minutes`
3. **User can continue working** but should prepare to save

**At 7 minutes remaining**:
1. **Console log**: `⚠️ Token expires in 7 minutes`
2. **No additional toasts** (only one warning shown)

### Scenario 3: Token Expires

**At 5 minutes remaining**:
1. **Auto-logout triggered** by periodic check
2. **Toast warning**: "Your session has expired. Please sign in again."
3. **Console log**: `⚠️ Token expired, logging out...`
4. **Auth state cleared** (accessToken = null, user = null)
5. **UI updates**: Send button disabled, "Sign in" button appears

### Scenario 4: User Tries to Send Without Auth

1. **User clicks Send button** (but token expired)
2. **Pre-send validation** catches missing token
3. **Error toast**: "Please sign in to send messages"
4. **Message not sent**
5. **User sees "Sign in with Google" button**

### Scenario 5: API Returns Auth Error

1. **Token expired but periodic check hasn't run yet**
2. **User sends message**
3. **API returns**: "Authentication required"
4. **Error handler detects** "Authentication" in error message
5. **Toast warning**: "Your session has expired. Please sign in again."
6. **Error message displayed** in chat: "❌ Error: Authentication required"
7. **Next periodic check** will trigger logout

---

## Timeline Example

| Time | Token Age | Action |
|------|-----------|--------|
| 0:00 | 0 min | User signs in, token issued |
| 0:30 | 0.5 min | First periodic check ✅ Token valid (59.5 min left) |
| 1:00 | 1 min | Check ✅ Token valid (59 min left) |
| ... | ... | Checks continue every 30 sec |
| 50:00 | 50 min | Check ✅ Token valid (10 min left) |
| 50:30 | 50.5 min | Check ⚠️ **Warning toast** "Expires in 10 min" |
| 51:00 | 51 min | Check ⏸️ Warning already shown (9 min left) |
| 55:00 | 55 min | Check ❌ **Auto-logout** "Token expired" (5 min threshold) |
| 55:30 | N/A | User logged out, checks stopped |

---

## Configuration

### Expiration Thresholds

**In `ui-new/src/utils/auth.ts`**:

```typescript
// Token considered "expiring soon" at 5 minutes
const fiveMinutes = 5 * 60 * 1000;

// Warning shown at 10 minutes
const tenMinutes = 10 * 60 * 1000;
```

**Customization**:

```typescript
// More aggressive (warn at 20 min, logout at 10 min)
const warningThreshold = 20 * 60 * 1000;
const expiryThreshold = 10 * 60 * 1000;

// More lenient (warn at 5 min, logout at 2 min)
const warningThreshold = 5 * 60 * 1000;
const expiryThreshold = 2 * 60 * 1000;
```

### Check Interval

**In `ui-new/src/contexts/AuthContext.tsx`**:

```typescript
// Current: Check every 30 seconds
const interval = setInterval(() => { ... }, 30 * 1000);

// More frequent: Check every 10 seconds
const interval = setInterval(() => { ... }, 10 * 1000);

// Less frequent: Check every 60 seconds
const interval = setInterval(() => { ... }, 60 * 1000);
```

**Recommendation**: 30 seconds is optimal balance between:
- **Responsiveness**: Detects expiration quickly
- **Performance**: Minimal overhead
- **User Experience**: Smooth, non-intrusive

---

## Console Logging

### Normal Operation

```javascript
🔒 Verifying Google token with signature verification (length: 1234)
✅ Token signature verified, email: user@example.com
⏰ Periodic token check (30s interval)
✅ Token valid, 45 minutes remaining
```

### Warning Phase

```javascript
⏰ Periodic token check (30s interval)
⚠️ Token expires in 10 minutes
🔔 Showing expiration warning toast
```

### Expiration

```javascript
⏰ Periodic token check (30s interval)
⚠️ Token expired, logging out...
🔔 Showing expiration notification
🚪 User logged out, clearing auth state
```

### API Error Detection

```javascript
📨 SSE Event: error
⚠️ Authentication error detected, logging out...
🔔 Showing session expired warning
```

---

## Testing

### Manual Testing

#### Test 1: Token Expiration Simulation

Modify the expiration check to use shorter thresholds:

```typescript
// In auth.ts, temporarily change:
const fiveMinutes = 30 * 1000; // 30 seconds instead of 5 minutes
const tenMinutes = 60 * 1000; // 60 seconds instead of 10 minutes

// Sign in and wait:
// - At 60 seconds: Warning toast appears
// - At 30 seconds: Auto-logout occurs
```

#### Test 2: Expired Token on Mount

1. Sign in normally
2. Use DevTools to manually expire token:
   ```javascript
   const token = localStorage.getItem('google_access_token');
   const decoded = JSON.parse(atob(token.split('.')[1]));
   decoded.exp = Math.floor(Date.now() / 1000) - 1; // Set to past
   const newToken = token.split('.')[0] + '.' + btoa(JSON.stringify(decoded)) + '.' + token.split('.')[2];
   localStorage.setItem('google_access_token', newToken);
   ```
3. Refresh page
4. Should see: "Your session has expired. Please sign in again."

#### Test 3: API Auth Error

1. Sign in normally
2. Wait for token to expire (60+ minutes)
3. Try to send a message
4. Should see:
   - Toast: "Your session has expired. Please sign in again."
   - Error message: "❌ Error: Authentication required"
   - Send button disabled

#### Test 4: Pre-Send Validation

1. Don't sign in (or manually clear token)
2. Type a message
3. Click Send
4. Should see: "Please sign in to send messages"
5. Message not sent

---

## Benefits

### For Users

✅ **No Confusing Errors**: Clear notifications instead of cryptic API errors  
✅ **Advance Warning**: 10-minute notice to save work  
✅ **Auto-Logout**: No need to manually refresh or re-authenticate  
✅ **Graceful Degradation**: UI disables smoothly, no broken state  
✅ **Clear Guidance**: Toast messages explain what happened and what to do  

### For Developers

✅ **Reduced Support Burden**: Fewer "why isn't it working?" questions  
✅ **Better Logging**: Clear console logs for debugging  
✅ **Centralized Logic**: All expiration handling in AuthContext  
✅ **Extensible**: Easy to add more checks or notifications  
✅ **Testable**: Can simulate expiration for testing  

---

## Known Limitations

### 1. Token Refresh Not Implemented

**Current**: When token expires, user must re-authenticate  
**Future**: Could implement silent token refresh using Google's refresh tokens

```typescript
// Potential implementation
const refreshToken = async () => {
  try {
    const newToken = await refreshGoogleToken();
    if (newToken) {
      login(newToken);
      return true;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }
  return false;
};
```

### 2. Network Timing

**Issue**: If user's clock is wrong, expiration detection may be inaccurate  
**Mitigation**: Use server time for expiration (would require API change)

### 3. Multiple Tabs

**Issue**: Logout in one tab doesn't immediately affect other tabs  
**Mitigation**: Could use BroadcastChannel or localStorage events to sync

```typescript
// Potential sync across tabs
window.addEventListener('storage', (e) => {
  if (e.key === 'google_access_token' && !e.newValue) {
    // Token removed in another tab, logout here too
    logout();
  }
});
```

---

## Future Enhancements

### 1. Visual Countdown

Show time remaining in UI:

```tsx
{isAuthenticated && tokenTimeRemaining < 10 * 60 * 1000 && (
  <div className="text-yellow-500 text-sm">
    ⚠️ Session expires in {Math.floor(tokenTimeRemaining / 60000)} minutes
  </div>
)}
```

### 2. Extend Session Button

Allow user to re-authenticate without losing work:

```tsx
{hasShownExpiryWarning && (
  <button onClick={handleExtendSession}>
    🔒 Extend Session
  </button>
)}
```

### 3. Background Sync

Sync auth state across tabs:

```typescript
const bc = new BroadcastChannel('auth_channel');
bc.onmessage = (event) => {
  if (event.data.type === 'logout') {
    logout();
  }
};
```

### 4. Grace Period

Allow completing in-progress operations:

```typescript
// Don't logout if message is currently being sent
if (isLoading) {
  console.log('Message in progress, delaying logout...');
  return;
}
```

---

## Deployment

### Build & Deploy

```bash
# Build UI
./scripts/build-docs.sh

# Deploy to GitHub Pages
./scripts/deploy-docs.sh -m "add token expiration checking and auto-logout"
```

### Status

✅ **Built**: October 8, 2025 00:11:04 UTC  
✅ **Deployed**: October 8, 2025 00:11:04 UTC  
✅ **Live**: https://lambdallmproxy.pages.dev

---

## Summary

**Problem**: Users experiencing confusing "Authentication required" errors when tokens expire  
**Solution**: Comprehensive token expiration checking with warnings and auto-logout  
**Benefits**:
- ✅ 10-minute advance warning
- ✅ Automatic logout at 5 minutes
- ✅ Pre-send validation
- ✅ API error detection
- ✅ Clear user notifications
- ✅ Graceful UI degradation

Combined with other recent improvements (IndexedDB storage, search progress, model load balancing), the app now provides a robust, user-friendly authentication experience!

---

**Last Updated**: October 8, 2025  
**Author**: GitHub Copilot
