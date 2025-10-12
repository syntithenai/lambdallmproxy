# OAuth2 Configuration Complete

**Date**: October 10, 2025
**Status**: ✅ **CONFIGURED - READY TO DEPLOY**

## Configuration Summary

All OAuth2 credentials and endpoints have been configured for YouTube Transcript integration.

### Backend Configuration (Lambda)

**File**: `.env`

```bash
# Google OAuth Configuration for YouTube Transcripts
GOOGLE_CLIENT_ID=927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=AIzaSyBuQ_uQQtDw1p2eUphZor8PLH4_ySOAXTc
OAUTH_REDIRECT_URI=https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback
```

### Frontend Configuration (UI)

**File**: `ui-new/.env`

```bash
VITE_API_BASE=https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
VITE_GOOGLE_CLIENT_ID=927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com
```

### OAuth2 Flow URLs

| Component | URL |
|-----------|-----|
| **Authorization URL** | `https://accounts.google.com/o/oauth2/v2/auth` |
| **Redirect URI** | `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback` |
| **Token Refresh Endpoint** | `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/refresh` |
| **Token Revoke Endpoint** | `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/revoke` |

## Code Updates Made

### 1. Lambda Environment Variables (`.env`)

Added three OAuth configuration variables:
- `GOOGLE_CLIENT_ID` - OAuth 2.0 Client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - API Key for server-side token exchange
- `OAUTH_REDIRECT_URI` - Callback URL after OAuth authorization

### 2. Frontend Context (`ui-new/src/contexts/YouTubeAuthContext.tsx`)

Updated `OAUTH_CONFIG` to use environment variables:

```typescript
const OAUTH_CONFIG = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  redirectUri: `${import.meta.env.VITE_API_BASE}/oauth/callback`,
  scope: 'https://www.googleapis.com/auth/youtube.readonly',
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth'
};
```

**Benefits**:
- ✅ Uses environment variables instead of hardcoded values
- ✅ Automatically constructs redirect URI from API base URL
- ✅ Single source of truth for Client ID (from `.env` file)
- ✅ Easy to update for different environments (dev/prod)

## Google Cloud Console Configuration

You need to ensure these settings are configured in Google Cloud Console:

### OAuth 2.0 Client ID Settings

**Navigation**: `APIs & Services > Credentials > OAuth 2.0 Client IDs`

**Client ID**: `927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com`

### Required Settings:

#### 1. Authorized JavaScript Origins
Add these origins for the popup OAuth flow:
```
https://lambdallmproxy.pages.dev
https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
http://localhost:8081
http://localhost:5173
```

#### 2. Authorized Redirect URIs
Add this redirect URI:
```
https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback
```

#### 3. OAuth Consent Screen
- **Application name**: Lambda LLM Proxy
- **Scopes**: `https://www.googleapis.com/auth/youtube.readonly`
- **Test users**: Add your email(s) if in testing mode

### Enable Required APIs

**Navigation**: `APIs & Services > Library`

Search for and enable:
- ✅ **YouTube Data API v3**

## Deployment Steps

### 1. Deploy Backend (Lambda)

Since environment variables changed, you need a **full deployment** (not fast deploy):

```bash
make deploy-lambda
```

This will:
- Include the new environment variables (GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI)
- Update the Lambda function with OAuth endpoints
- Package and deploy with all dependencies

### 2. Deploy Frontend (UI)

Build and deploy the updated UI with environment variable changes:

```bash
make deploy-ui
```

This will:
- Build the React app with VITE_GOOGLE_CLIENT_ID
- Update YouTubeAuthContext with environment-based config
- Deploy to GitHub Pages

## Testing the OAuth Flow

### 1. Enable YouTube Transcripts

1. Open the app: https://lambdallmproxy.pages.dev
2. Go to Settings (⚙️ icon)
3. Find "YouTube Transcripts" section
4. Click the checkbox to enable

### 2. OAuth Authorization

1. A popup window will open to Google's authorization page
2. Select your Google account
3. Review the permissions (YouTube Read-Only access)
4. Click "Allow"

### 3. Verify Connection

After authorization:
- Settings should show "✅ Connected" status
- Your Google account email should be displayed
- You can disconnect at any time

### 4. Test Transcript Fetching

1. Start a new chat
2. Send a message with a YouTube URL:
   ```
   Transcribe this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
   ```
3. The system should:
   - Detect the YouTube URL
   - Use your OAuth token to fetch the transcript via YouTube API
   - Fall back to Whisper if transcript not available
   - Display the source used ('youtube_api' or 'whisper')

## Architecture Overview

### OAuth2 Flow Sequence

```
1. User clicks "Enable YouTube Transcripts" in Settings
   ↓
2. Frontend opens popup to Google OAuth authorization URL
   ↓
3. User authorizes, Google redirects to Lambda callback endpoint
   ↓
4. Lambda exchanges auth code for access + refresh tokens
   ↓
5. Lambda returns HTML that sends tokens to parent window via postMessage
   ↓
6. Frontend stores tokens in localStorage
   ↓
7. Frontend includes X-YouTube-Token header in chat API calls
   ↓
8. Lambda uses token to fetch YouTube transcripts via YouTube Data API
   ↓
9. Tokens auto-refresh 10 minutes before expiry
```

### Security Features

- ✅ **CSRF Protection**: State parameter validates authorization flow
- ✅ **Read-Only Scope**: Only youtube.readonly access requested
- ✅ **Client-Side Storage**: Tokens stored in browser localStorage only
- ✅ **No Server Storage**: Lambda never persists tokens
- ✅ **Automatic Refresh**: Tokens refresh before expiry (10 min buffer)
- ✅ **HTTPS Only**: All OAuth endpoints require HTTPS

## Troubleshooting

### Issue: "redirect_uri_mismatch" Error

**Cause**: Redirect URI not configured in Google Cloud Console

**Fix**: Add `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback` to Authorized Redirect URIs

### Issue: "access_denied" Error

**Cause**: User declined authorization or insufficient permissions

**Fix**: Re-initiate OAuth flow and ensure user clicks "Allow"

### Issue: "invalid_client" Error

**Cause**: Client ID or Client Secret mismatch

**Fix**: Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in `.env` match Google Cloud Console

### Issue: Token Refresh Fails

**Cause**: Refresh token expired or revoked

**Fix**: Disconnect and reconnect to get new tokens

### Issue: YouTube API Returns 403

**Cause**: YouTube Data API v3 not enabled in Google Cloud Console

**Fix**: Enable the API in `APIs & Services > Library`

## Next Steps

1. ✅ **Deploy Backend**: `make deploy-lambda` (full deploy for env vars)
2. ✅ **Deploy Frontend**: `make deploy-ui` (new build with env vars)
3. ✅ **Configure Google Cloud**: Add redirect URIs and enable YouTube API
4. ✅ **Test OAuth Flow**: Enable YouTube Transcripts in Settings
5. ✅ **Test Transcript Fetch**: Send a YouTube URL in chat

## References

- **Google OAuth Documentation**: https://developers.google.com/identity/protocols/oauth2
- **YouTube Data API**: https://developers.google.com/youtube/v3
- **OAuth2 Implementation Plan**: `OAUTH2_DUAL_AUTH_PLAN.md`
- **Implementation Summary**: `OAUTH2_IMPLEMENTATION_SUMMARY.md`

---

**Configuration Status**: ✅ Complete
**Ready to Deploy**: ✅ Yes
**Google Cloud Setup**: ⚠️ Requires manual configuration (see above)
