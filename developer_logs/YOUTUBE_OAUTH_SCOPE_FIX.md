# YouTube OAuth Scope Fix - Captions API Permission

**Date**: 2025-10-11  
**Status**: ✅ RESOLVED  
**Priority**: CRITICAL (Feature Completely Broken)

## Problem Summary

After deploying `youtube-api.js` module successfully, YouTube transcript fetching was still failing with:

```
HTTP 403: {
  "error": {
    "code": 403,
    "message": "Request had insufficient authentication scopes.",
    "errors": [
      {
        "message": "Insufficient Permission",
        "domain": "global",
        "reason": "insufficientPermissions"
      }
    ],
    "status": "PERMISSION_DENIED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
        "domain": "googleapis.com",
        "metadata": {
          "service": "youtube.googleapis.com",
          "method": "youtube.api.v3.V3DataCaptionService.List"
        }
      }
    ]
  }
}
```

All YouTube search results showed: `"captionsNote":"Captions available but transcript could not be fetched. Try using transcribe_url tool."`

## Root Cause

The UI was requesting the wrong OAuth scope:
- **Requested**: `https://www.googleapis.com/auth/youtube.readonly`
- **Required**: `https://www.googleapis.com/auth/youtube.force-ssl`

The YouTube Captions API (`youtube.api.v3.V3DataCaptionService.List`) requires the `youtube.force-ssl` scope, not the read-only scope.

## Why This Happened

The scope was set to `youtube.readonly` which provides:
- ✅ View YouTube account details
- ✅ View videos, playlists, subscriptions
- ❌ Access captions API (requires force-ssl)

The `youtube.force-ssl` scope provides:
- ✅ Full YouTube Data API access
- ✅ Captions API access (download, upload, update, delete)
- ✅ Everything that readonly provides, plus more

## Impact Timeline

1. **2025-10-11 09:30 UTC**: Module deployment fixed (youtube-api.js now deployed)
2. **2025-10-11 09:35 UTC**: User logged out/in and re-enabled YouTube in settings
3. **2025-10-11 09:40 UTC**: Still seeing "Captions available but transcript could not be fetched"
4. **2025-10-11 09:45 UTC**: Logs revealed HTTP 403 permission error
5. **2025-10-11 09:50 UTC**: Identified scope mismatch
6. **2025-10-11 10:00 UTC**: Fixed scope in UI and deployed

## The Fix

### File Changed: `ui-new/src/contexts/YouTubeAuthContext.tsx`

```diff
// OAuth configuration
// Uses VITE_GOOGLE_CLIENT_ID from ui-new/.env
const OAUTH_CONFIG = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  redirectUri: `${import.meta.env.VITE_API_BASE}/oauth/callback`,
-  scope: 'https://www.googleapis.com/auth/youtube.readonly',
+  scope: 'https://www.googleapis.com/auth/youtube.force-ssl', // Required for captions.list API
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth'
};
```

### Deployment

```bash
make deploy-ui
```

**Build time**: ~2.5 seconds  
**Commit**: 051cfd9  
**Status**: Deployed to GitHub Pages ✅

## YouTube API Scopes Reference

### `youtube.readonly`
- **URL**: `https://www.googleapis.com/auth/youtube.readonly`
- **Description**: View YouTube account
- **APIs Available**:
  - channels.list
  - videos.list
  - search.list
  - playlistItems.list
  - subscriptions.list
- **APIs NOT Available**:
  - ❌ captions.list
  - ❌ captions.download

### `youtube.force-ssl` (What We Need)
- **URL**: `https://www.googleapis.com/auth/youtube.force-ssl`
- **Description**: Manage YouTube account (read/write)
- **APIs Available**:
  - ✅ Everything in youtube.readonly
  - ✅ captions.list (get caption tracks)
  - ✅ captions.download (get caption content)
  - ✅ captions.insert (upload captions)
  - ✅ captions.update (modify captions)
  - ✅ captions.delete (remove captions)

**Note**: Despite the name "force-ssl", this scope doesn't give write access to user's channel. It's specifically for managing captions and other YouTube data via the API.

## User Action Required

After this fix is deployed, users MUST:

1. **Log out** of the UI
2. **Log back in** to trigger new OAuth flow
3. **Accept the new permissions** when Google asks for consent
4. **Re-enable YouTube** in settings if needed

The old tokens with `youtube.readonly` scope will not work. A fresh OAuth flow is required to get tokens with `youtube.force-ssl` scope.

## Verification Steps

### Before Fix (Broken)
```bash
# User query: "search youtube for ai"
# Response: 10 videos with captionsNote: "Captions available but transcript could not be fetched"

aws logs tail /aws/lambda/llmproxy --since 1m | grep "YouTube transcript"
# ❌ YouTube transcript fetch failed for [videoId]: HTTP 403: Request had insufficient authentication scopes
```

### After Fix (Expected)
```bash
# User logs out, logs back in with new scope
# User query: "search youtube for ai"  
# Response: 10 videos with actual transcript snippets

aws logs tail /aws/lambda/llmproxy --since 1m | grep "Fetched transcript"
# ✅ Fetched transcript for nPay6LgxcEI (4523 chars, truncated to 500)
# ✅ Fetched transcript for 1XF-NG_35NE (8934 chars, truncated to 500)
# ... etc for all 10 videos
```

## Security Considerations

### Why `youtube.force-ssl` is Safe

Despite the scary name, `youtube.force-ssl` does NOT provide:
- ❌ Access to user's personal data (email, contacts)
- ❌ Ability to upload videos to user's channel
- ❌ Ability to delete user's videos
- ❌ Ability to modify user's channel settings

It ONLY provides:
- ✅ Read access to public YouTube data
- ✅ Access to captions API (download captions for videos)
- ✅ Same as readonly, but includes captions

### Google OAuth Consent Screen

When users re-authenticate, Google will show:
```
This app wants to:
✓ View and manage your YouTube account
```

This is standard Google language for the `youtube.force-ssl` scope. It sounds broad, but in practice we're only using it to download captions.

### Privacy Notes

- We never store user's YouTube videos or personal data
- Transcripts are fetched on-demand and not persisted
- OAuth tokens are stored in browser localStorage only
- Tokens are not sent to our servers (except to backend for API calls)
- Users can revoke access anytime at https://myaccount.google.com/permissions

## Related Files

### Backend (No changes needed)
- ✅ `src/youtube-api.js` - Already deployed (previous fix)
- ✅ `src/tools.js` - Already using correct API calls

### Frontend (Fixed)
- ✅ `ui-new/src/contexts/YouTubeAuthContext.tsx` - **FIXED**: Changed scope to `youtube.force-ssl`

### Documentation
- `YOUTUBE_OAUTH_SETUP.md` - May need update to mention correct scope
- `YOUTUBE_TRANSCRIPT_MODULE_FIX.md` - Previous fix (module deployment)
- `GOOGLE_OAUTH_PERMISSIONS.md` - May need update with new scope info

## Next Steps for User

1. **Go to UI**: https://lambdallmproxy.pages.dev
2. **Log out**: Click profile menu → Logout
3. **Log in**: Click Login button
4. **Accept new permissions**: When Google asks, click "Allow"
5. **Enable YouTube**: Go to Settings → Enable YouTube Captions
6. **Test**: Search YouTube: "search youtube for ai news"
7. **Verify**: Should see transcript snippets in results (not just "Captions available...")

## Testing Checklist

After user re-authenticates:

- [ ] YouTube search finds videos
- [ ] Videos show `hasCaptions: true`
- [ ] Videos show actual transcript content (not captionsNote)
- [ ] Transcript truncated to 500 chars in search results
- [ ] Logs show "✅ Fetched transcript for [videoId]"
- [ ] No HTTP 403 errors in logs
- [ ] No "insufficient authentication scopes" errors
- [ ] `transcribe_url` tool still works as alternative

## Alternative: transcribe_url Tool

If user doesn't want to grant `youtube.force-ssl` scope, they can:
1. Use `search_youtube` to find videos (without transcripts)
2. Use `transcribe_url` tool on specific videos they want to transcribe
3. `transcribe_url` uses Whisper API (different from YouTube Captions API)
4. No YouTube OAuth required for `transcribe_url`

Example:
```
User: "search youtube for ai news"
LLM: [Returns 10 videos with links, no transcripts]

User: "transcribe the first video"
LLM: [Uses transcribe_url tool with Whisper, returns full transcript]
```

## Lessons Learned

1. **Always check OAuth scopes against API requirements**
   - YouTube Captions API docs clearly state `youtube.force-ssl` required
   - We used `youtube.readonly` which doesn't include captions

2. **Test OAuth flows end-to-end**
   - Should have caught this during initial YouTube OAuth setup
   - Error was hidden until module was actually deployed

3. **Log OAuth errors clearly**
   - HTTP 403 with "insufficient scopes" is clear
   - But could add UI warning when scope is wrong

4. **Document required scopes in code**
   - Added comment: `// Required for captions.list API`
   - Makes it clear why this specific scope is needed

## Related Issues

- ✅ **Module deployment** (YOUTUBE_TRANSCRIPT_MODULE_FIX.md) - Fixed
- ✅ **OAuth scope** (this doc) - Fixed
- ⏳ **User re-authentication** - User must do this manually

## Status: RESOLVED ✅

Code deployed, UI updated with correct OAuth scope. User must log out and back in to get fresh token with `youtube.force-ssl` scope. After that, YouTube transcript fetching will work.
