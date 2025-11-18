# Fix: Transcription Authentication Token Refresh

## Issue
Users reported seeing "❌ Authentication expired. Please log in again." error during continuous voice mode transcription, even though Firebase Auth should refresh tokens automatically in the background.

## Root Cause
The `ContinuousVoiceMode` component was receiving `accessToken` as a prop and using it directly for transcription API calls. This token could be stale because:

1. Firebase Auth automatically refreshes tokens every hour
2. The `accessToken` prop passed to `ContinuousVoiceMode` was captured at component mount time
3. When transcription happened later (after token expiry), it used the old, expired token
4. The component had no mechanism to get a fresh token for each API call

## Analysis
Other parts of the codebase (e.g., `ChatTab.tsx`) correctly use the pattern:
```typescript
const token = await getToken(); // Gets fresh token from Firebase
```

But `ContinuousVoiceMode` was using:
```typescript
Authorization: `Bearer ${accessToken}` // Uses stale prop value
```

## Solution

### 1. Updated `ContinuousVoiceMode` Interface
**Location**: `/home/stever/projects/lambdallmproxy/ui-new/src/components/ContinuousVoiceMode.tsx` (lines 10-21)

Added `getToken` function to props:
```typescript
interface ContinuousVoiceModeProps {
  // ... existing props
  getToken?: () => Promise<string | null>; // Function to get fresh auth token
}
```

### 2. Updated Component to Accept `getToken`
**Location**: `/home/stever/projects/lambdallmproxy/ui-new/src/components/ContinuousVoiceMode.tsx` (lines 22-34)

```typescript
export function ContinuousVoiceMode({ 
  // ... existing props
  getToken
}: ContinuousVoiceModeProps) {
```

### 3. Modified `transcribeAudio()` to Use Fresh Token
**Location**: `/home/stever/projects/lambdallmproxy/ui-new/src/components/ContinuousVoiceMode.tsx` (lines 561-593)

**Before**:
```typescript
async function transcribeAudio(blob: Blob): Promise<string> {
  if (!accessToken) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(transcribeUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`, // Stale token!
    },
    // ...
  });
}
```

**After**:
```typescript
async function transcribeAudio(blob: Blob): Promise<string> {
  // Get fresh token for this request
  let authToken = accessToken;
  if (getToken) {
    console.log('🔑 Getting fresh auth token for transcription');
    authToken = await getToken();
  }
  
  if (!authToken) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(transcribeUrl, {
    headers: {
      'Authorization': `Bearer ${authToken}`, // Fresh token!
    },
    // ...
  });
}
```

### 4. Passed `getToken` from ChatTab
**Location**: `/home/stever/projects/lambdallmproxy/ui-new/src/components/ChatTab.tsx` (lines 8100-8140)

```typescript
<ContinuousVoiceMode
  accessToken={accessToken}
  // ... other props
  getToken={getToken}  // ← Added this line
/>
```

## How It Works Now

1. **Component Mount**: `ContinuousVoiceMode` receives both `accessToken` (for initial check) and `getToken` function
2. **User Speaks**: Hotword detected, recording starts
3. **Transcription Request**: 
   - Calls `getToken()` to get fresh Firebase ID token
   - Uses fresh token for API authorization
   - If token is expired, Firebase Auth automatically refreshes it before returning
4. **Success**: Transcription proceeds with valid authentication

## Fallback Behavior
- If `getToken` is not provided (backward compatibility), falls back to using `accessToken` prop
- This ensures older code doesn't break while providing better auth for new usage

## Testing
- [x] Verified no compilation errors
- [ ] Test continuous voice mode after 1 hour of inactivity (token expiry)
- [ ] Verify fresh token is logged in console: "🔑 Getting fresh auth token for transcription"
- [ ] Confirm no more "Authentication expired" errors during normal usage
- [ ] Test with local dev server (localhost:3000)
- [ ] Test with production Lambda endpoint

## Related Files
- `ContinuousVoiceMode.tsx` - Voice recording and transcription component
- `ChatTab.tsx` - Parent component that provides auth context
- `AuthContext.tsx` - Firebase Auth provider with `getToken()` method

## Security Considerations
- Fresh tokens are fetched on-demand for each transcription request
- Tokens expire after 1 hour (Firebase default)
- `getToken()` automatically handles refresh before expiry
- No tokens are stored in component state (avoids stale token bugs)

## Performance Impact
- Minimal: `getToken()` is cached by Firebase Auth SDK
- Only fetches new token if current one is expired or about to expire
- No additional network calls in normal operation

## Future Enhancements
- Consider applying same pattern to other components that accept `accessToken` as prop:
  - `VoiceInputDialog` (line 8100 in ChatTab.tsx)
  - Any other components making authenticated API calls
- Add retry logic specifically for auth failures (already exists for network failures)

## Deployment Notes
- Changes are backward compatible (optional `getToken` prop)
- No backend changes required
- No database migrations needed
- Dev server running with `make dev`

## Date
2025-11-17

## Status
✅ Implemented and verified
⏳ Ready for testing
⏳ Ready for production deployment via `make deploy-ui`
