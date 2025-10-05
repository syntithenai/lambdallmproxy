# Token Authentication Troubleshooting Guide

## Issue: "Authentication required. Please provide a valid JWT token"

This error occurs when the Google JWT token is expired or invalid. Here's how to fix it:

### Quick Fix (Recommended):
1. **Sign Out**: Click the "Sign Out" button in the top right
2. **Sign In Again**: Click "Sign in with Google" 
3. **Try Your Request**: The new token should work

### Understanding Token Expiration:

Google JWT tokens expire after **1 hour**. Our auto-refresh mechanism tries to silently get a new token, but this doesn't always work due to:

- Browser privacy settings
- Third-party cookie blocking
- Being in incognito mode
- No active Google session in the browser
- Google API rate limits

### Checking Token Status in Browser Console:

Open Developer Tools (F12) and look for these log messages:

#### ✅ Good Signs:
```
PlanningTab: User is authenticated
PlanningTab: Token length: 1234
PlanningTab: Token expiring soon? false
PlanningTab: Token expires at: 10/4/2025, 3:30:00 PM
Token is still valid
```

#### ⚠️ Warning Signs:
```
Token expiring soon, attempting refresh...
Token refreshed successfully
```
This is normal - auto-refresh working

#### ❌ Problem Signs:
```
Token expiring soon or expired, attempting refresh...
Token refresh timed out
Token refresh failed, clearing auth state
No token available
```
This means: **Sign out and sign in again**

### Manual Token Check:

In browser console, run:
```javascript
const token = localStorage.getItem('google_access_token');
console.log('Token:', token ? 'exists' : 'missing');

if (token) {
  const parts = token.split('.');
  const payload = JSON.parse(atob(parts[1]));
  const exp = new Date(payload.exp * 1000);
  const now = new Date();
  console.log('Expires:', exp.toLocaleString());
  console.log('Now:', now.toLocaleString());
  console.log('Expired?', exp < now);
}
```

### Common Scenarios:

#### Scenario 1: Token Expired
**Symptoms:** 
- Error on every request
- Console shows "Token expiring soon or expired"
- Token refresh fails

**Solution:** 
- Sign out and sign in again

#### Scenario 2: Token About to Expire
**Symptoms:**
- Works sometimes, fails sometimes
- Console shows "Token expiring soon, attempting refresh"

**Solution:**
- Auto-refresh should handle this
- If it fails, sign out and sign in again

#### Scenario 3: No Token
**Symptoms:**
- Error: "No valid token available"
- Console shows "User is not authenticated"

**Solution:**
- You're not signed in
- Click "Sign in with Google"

#### Scenario 4: Network Issues
**Symptoms:**
- Random failures
- Console shows network errors

**Solution:**
- Check internet connection
- Check if Lambda endpoint is accessible
- Try again in a few seconds

### Testing Token Refresh:

To test if auto-refresh works:

1. Sign in with Google
2. Open Developer Console (F12)
3. Run this to manually expire the token:
```javascript
const token = localStorage.getItem('google_access_token');
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log('Current expiration:', new Date(payload.exp * 1000));

// Set expiration to 4 minutes from now (should trigger refresh)
payload.exp = Math.floor(Date.now() / 1000) + 240;
const newToken = parts[0] + '.' + btoa(JSON.stringify(payload)) + '.' + parts[2];
localStorage.setItem('google_access_token', newToken);
console.log('Token will expire in 4 minutes');
```

4. Make a planning request
5. Check console for refresh messages

### Preventing Token Issues:

**Best Practices:**
- Don't stay signed in for more than 1 hour without activity
- Refresh the page if you've been idle for a while
- Sign out when done for the day
- Use regular browser (not incognito) for best auto-refresh support

### Why Auto-Refresh Might Fail:

1. **Browser Privacy Settings**
   - Third-party cookies blocked
   - Tracking protection enabled
   - Private/Incognito mode

2. **Google Session**
   - Not signed into Google in browser
   - Signed out of Google in another tab
   - Multiple Google accounts causing confusion

3. **API Limitations**
   - Google One Tap rate limits
   - Network interruptions
   - Browser extensions blocking scripts

### Current Limitations:

Our auto-refresh uses Google One Tap API which:
- ✅ Works great when conditions are perfect
- ⚠️ Fails silently in many privacy/security scenarios
- ❌ Requires manual re-authentication as fallback

This is by design for security - Google doesn't want tokens refreshing indefinitely without user interaction.

### Future Improvements:

Potential enhancements:
- Add "Session Expiring Soon" banner
- Show token expiration time in UI
- Add manual "Refresh Token" button
- Implement better fallback strategies
- Cache refresh tokens (if Google provides them)

### Emergency Reset:

If all else fails:
```javascript
// Clear all auth data
localStorage.removeItem('google_user');
localStorage.removeItem('google_access_token');
localStorage.removeItem('google_refresh_token');
localStorage.removeItem('last_token_refresh');

// Reload page
location.reload();

// Sign in again
```

### Backend Token Validation:

The Lambda function validates tokens by:
1. Checking JWT signature
2. Verifying email is in ALLOWED_EMAILS list
3. Checking token expiration (exp claim)

If any check fails → "Authentication required" error

### Debugging Checklist:

- [ ] Are you signed in? (Check top right corner)
- [ ] Is your token expired? (Check console logs)
- [ ] Did auto-refresh succeed? (Check console logs)
- [ ] Are you in incognito mode? (Try regular browser)
- [ ] Are third-party cookies blocked? (Check settings)
- [ ] Is your email in ALLOWED_EMAILS? (Ask admin)
- [ ] Is the Lambda endpoint accessible? (Check network tab)

### Getting Help:

If issues persist:
1. Copy console logs (F12 → Console)
2. Copy network requests (F12 → Network → planning/search request)
3. Note the exact error message
4. Share with developer

### Pro Tip:

Keep Developer Console (F12) open while using the app to see real-time token status and auto-refresh attempts.
