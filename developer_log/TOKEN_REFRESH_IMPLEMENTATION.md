# Auto Token Refresh Implementation

## Overview
Implemented automatic Google JWT token refresh to prevent authentication errors when tokens expire (typically after 1 hour).

## Changes Made

### 1. Enhanced Authentication Utilities (`ui-new/src/utils/auth.ts`)

#### New Functions Added:

**`isTokenExpiringSoon(token: string): boolean`**
- Checks if a token is expired or will expire within 5 minutes
- Returns `true` if token needs refresh, `false` if still valid
- Provides 5-minute buffer to prevent requests failing due to timing

**`refreshGoogleToken(): Promise<string | null>`**
- Attempts to silently refresh the Google JWT token
- Uses Google One Tap API to get new credentials without user interaction
- Falls back to `null` if silent refresh is not available
- Has a 5-second timeout to prevent hanging

**`getValidToken(currentToken: string | null): Promise<string | null>`**
- Main entry point for getting a valid token
- Checks if current token is still valid
- Automatically refreshes if token is expiring soon
- Updates localStorage with new token
- Returns `null` if refresh fails (requires re-authentication)

### 2. Updated Auth Context (`ui-new/src/contexts/AuthContext.tsx`)

#### New Context Methods:

**`refreshToken(): Promise<boolean>`**
- Manually refresh the current token
- Updates auth state with new token
- Returns `true` on success, `false` on failure
- Logs user out if refresh fails

**`getToken(): Promise<string | null>`**
- Get a valid token, refreshing if necessary
- Should be used by all API calls instead of accessing `accessToken` directly
- Ensures token is always valid before making requests

#### Auto-Refresh Timer:
- Checks token expiration every 5 minutes
- Automatically refreshes when token is expiring soon
- Runs as useEffect hook when user is authenticated
- Cleans up interval on unmount or logout

### 3. Updated Components

All components now use `getToken()` instead of directly accessing `accessToken`:

**ChatTab** (`ui-new/src/components/ChatTab.tsx`)
- Calls `getToken()` before sending chat messages
- Shows authentication error if token is unavailable

**PlanningTab** (`ui-new/src/components/PlanningTab.tsx`)
- Calls `getToken()` before generating plans
- Shows authentication error if token is unavailable

**SearchTab** (`ui-new/src/components/SearchTab.tsx`)
- Calls `getToken()` before performing searches
- Shows authentication error if token is unavailable

## How It Works

### Token Lifecycle:

1. **Initial Login:**
   - User signs in with Google
   - JWT token is stored in localStorage
   - Token is valid for ~1 hour

2. **Token Validation:**
   - Before each API call, `getToken()` is called
   - Token expiration is checked (exp claim in JWT)
   - If token expires in < 5 minutes, refresh is triggered

3. **Auto Refresh:**
   - Every 5 minutes, background timer checks token
   - If expiring soon, attempts silent refresh
   - Uses Google One Tap API for seamless refresh

4. **Manual Refresh:**
   - Components call `getToken()` before API requests
   - Ensures fresh token for every request
   - Prevents "Authentication required" errors

5. **Refresh Failure:**
   - If refresh fails, `getToken()` returns `null`
   - Component shows authentication error
   - User is logged out automatically
   - Must re-authenticate manually

### Token Expiration Check:

```typescript
// JWT structure: { exp: 1696435200, ... }
const expirationTime = decoded.exp * 1000; // Convert to ms
const currentTime = Date.now();
const fiveMinutes = 5 * 60 * 1000;

// Refresh if expiring within 5 minutes
return expirationTime - currentTime < fiveMinutes;
```

### Silent Refresh Flow:

```
1. Check token expiration
   ↓
2. Token expiring? → Yes
   ↓
3. Initialize Google API with current credentials
   ↓
4. Call google.accounts.id.prompt()
   ↓
5. Google auto-selects signed-in account (if available)
   ↓
6. New JWT token received
   ↓
7. Update localStorage and auth state
   ↓
8. Return new token to caller
```

## Error Handling

### Scenarios Handled:

1. **Token Expired:**
   - Detected by `isTokenExpiringSoon()`
   - Automatic refresh attempted
   - User logged out if refresh fails

2. **Refresh Failed:**
   - Google API not available
   - Network error
   - User not signed in on Google
   - Falls back to manual re-authentication

3. **No Token:**
   - `getToken()` returns `null`
   - Component shows authentication error
   - User prompted to sign in

4. **API Call Failed with Auth Error:**
   - Backend returns 401
   - Frontend shows error message
   - Token refresh attempted on next request

## Benefits

✅ **Seamless Experience:** Users don't get interrupted by auth errors
✅ **Automatic Refresh:** Happens in background without user action
✅ **Fail-Safe:** Graceful fallback to manual login if refresh fails
✅ **Consistent:** All API calls use the same token validation flow
✅ **Efficient:** Only refreshes when needed (5-minute buffer)
✅ **Observable:** Console logs show when refresh occurs

## Usage in Components

### Before:
```typescript
const { accessToken } = useAuth();

// API call
await performSearch(queries, accessToken, ...);
```

### After:
```typescript
const { getToken } = useAuth();

// Get valid token (auto-refreshes if needed)
const token = await getToken();
if (!token) {
  // Handle authentication error
  return;
}

// API call
await performSearch(queries, token, ...);
```

## Testing

### Test Token Expiration:
1. Sign in with Google
2. Wait 55 minutes
3. Make a search/planning request
4. Token should auto-refresh
5. Request should succeed

### Test Refresh Failure:
1. Sign in with Google
2. Manually corrupt token in localStorage
3. Make a request
4. Should show authentication error
5. Sign in again to continue

### Test Background Refresh:
1. Sign in with Google
2. Leave tab open for 55+ minutes
3. Check console for "Token expiring soon, refreshing..."
4. Token should refresh automatically
5. No user action required

## Configuration

### Timing Constants:
- **Expiration Buffer:** 5 minutes before actual expiration
- **Check Interval:** Every 5 minutes
- **Refresh Timeout:** 5 seconds

These can be adjusted in `auth.ts` if needed.

## Limitations

### Google One Tap Limitations:
- Silent refresh may not work if:
  - User signs out of Google in another tab
  - Browser blocks third-party cookies
  - User is in incognito mode
  - Google API fails to load

### Fallback Behavior:
- If silent refresh fails, user must manually sign in again
- This is expected behavior for security reasons
- Better than failing silently with expired tokens

## Future Enhancements

Possible improvements:
- Show toast notification when token is refreshed
- Add "Session expiring soon" warning
- Implement token refresh on failed 401 responses
- Store refresh timestamp to optimize refresh attempts
- Add manual "Refresh session" button

## Files Modified

1. `ui-new/src/utils/auth.ts` - Added token refresh utilities
2. `ui-new/src/contexts/AuthContext.tsx` - Added refresh logic and timer
3. `ui-new/src/components/ChatTab.tsx` - Use getToken()
4. `ui-new/src/components/PlanningTab.tsx` - Use getToken()
5. `ui-new/src/components/SearchTab.tsx` - Use getToken()

## Deployment

Build and deploy the updated UI:
```bash
cd ui-new
npm run build
git add ../docs
git commit -m "feat: implement auto token refresh"
git push
```

The changes are backward compatible and don't require backend updates.
