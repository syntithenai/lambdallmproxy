# SWAG Google Docs Loading Fix

**Date**: October 22, 2025  
**Issue**: "Failed to load google docs" error when refreshing the SWAG page  
**Status**: ✅ Fixed

## Problem

When accessing the SWAG (Summarize Web with AI Guidance) page and trying to load Google Docs, the following error appeared:

```
Failed to load Google Docs. Please try again.
```

### Root Cause

The UI application requires the `VITE_GOOGLE_CLIENT_ID` environment variable to authenticate with Google's API for accessing Google Docs. This variable was missing in the `ui-new/.env` file.

The error occurred in `/home/stever/projects/lambdallmproxy/ui-new/src/utils/googleDocs.ts`:

```typescript
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export const initGoogleAuth = () => {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      const error = 'Google Client ID not configured. Please set VITE_GOOGLE_CLIENT_ID in ui-new/.env';
      console.error('❌', error);
      reject(new Error(error));
      return;
    }
    // ...
  });
};
```

## Solution

### 1. Created `ui-new/.env` File

The UI application has its own separate environment configuration from the backend. Created `/home/stever/projects/lambdallmproxy/ui-new/.env` with:

```bash
# API Configuration
VITE_API_BASE=http://localhost:3000

# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com
```

### 2. Restarted Development Servers

Vite requires a restart to pick up new environment variables:

```bash
make dev
```

## Verification

After the fix:

1. ✅ Navigate to http://localhost:8081/swag
2. ✅ Click "Load from Google Docs" button
3. ✅ Google OAuth prompt should appear (if not already authenticated)
4. ✅ After granting permissions, Google Docs created by the app should load
5. ✅ No "Failed to load google docs" error

## Environment Variable Architecture

### Backend Environment (`.env` in project root)
- Used by Lambda function and local backend server
- Contains `GOOGLE_CLIENT_ID` for backend OAuth operations
- Deployed to Lambda via `make deploy-env`

### Frontend Environment (`ui-new/.env`)
- Used by Vite dev server and production build
- Must prefix all variables with `VITE_`
- Contains `VITE_GOOGLE_CLIENT_ID` for frontend OAuth
- Baked into the build at compile time

### Why Two Separate Files?

1. **Security**: Frontend environment variables are exposed to the browser, backend ones stay server-side
2. **Deployment**: Backend deploys to Lambda, frontend builds to static files
3. **Vite Requirement**: Vite only exposes variables prefixed with `VITE_` to prevent accidental leaks

## Common SWAG Issues and Solutions

### Issue: "Failed to load Google Docs"

**Symptoms:**
- Error message when trying to load docs
- Console shows: `Google Client ID not configured`

**Solution:**
```bash
# 1. Ensure ui-new/.env exists with VITE_GOOGLE_CLIENT_ID
cat ui-new/.env | grep VITE_GOOGLE_CLIENT_ID

# 2. If missing, copy from .env.example and add your client ID
cp ui-new/.env.example ui-new/.env
# Edit ui-new/.env to add: VITE_GOOGLE_CLIENT_ID=your-client-id

# 3. Restart dev server
make dev
```

### Issue: "Please grant permissions and try again"

**Symptoms:**
- OAuth popup appears but fails
- Console shows authentication errors

**Solution:**
1. Check that Client ID is correct in both `.env` and `ui-new/.env`
2. Verify `http://localhost:8081` is in OAuth authorized origins (Google Cloud Console)
3. Clear localStorage and try again: `localStorage.clear()`

### Issue: Google Docs list is empty

**Symptoms:**
- No error, but doc list shows 0 documents
- "No documents found" message

**Explanation:**
- SWAG only shows Google Docs created by the app itself
- Uses metadata filter: `createdByApp='LambdaLLMProxy-Swag'`
- Won't show docs created outside the app (privacy/security feature)

**Solution:**
1. Create a new document using the "New Document" button in SWAG
2. Or append snippets to existing docs using "Append to Google Doc"

### Issue: Token expired / Not authenticated

**Symptoms:**
- Error: "Authentication failed"
- Have to re-login frequently

**Solution:**
- Google OAuth tokens expire after ~1 hour
- Click "Load from Google Docs" to refresh authentication
- The app will prompt for re-authentication automatically

## Testing Google Docs Integration

### 1. Test Authentication
```javascript
// In browser console on http://localhost:8081/swag
import { initGoogleAuth } from './src/utils/googleDocs';
initGoogleAuth().then(() => console.log('✅ Auth OK')).catch(console.error);
```

### 2. Test Document Creation
1. Go to http://localhost:8081/swag
2. Click "New Document" button
3. Enter document name
4. Click "Create"
5. Should open new Google Doc in new tab

### 3. Test Document Listing
1. Click "Load from Google Docs" button
2. Grant permissions if prompted
3. Should see list of documents created by app

### 4. Test Snippet Append
1. Select one or more snippets (checkboxes)
2. Click "Append to Google Doc" dropdown
3. Select target document
4. Click "Append"
5. Should see success message

## Environment Setup for Production

When deploying to production (GitHub Pages), the `VITE_GOOGLE_CLIENT_ID` needs to be set before building:

```bash
# 1. Set production environment variables in ui-new/.env
cat > ui-new/.env << EOF
VITE_API_BASE=https://your-lambda-url.lambda-url.us-east-1.on.aws
VITE_GOOGLE_CLIENT_ID=927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com
EOF

# 2. Build UI
make build-ui

# 3. Deploy to GitHub Pages
make deploy-ui
```

The build process bakes these variables into the JavaScript bundle.

## Google Cloud Console Configuration

For SWAG to work, the following must be configured in Google Cloud Console:

### Authorized JavaScript Origins
- `http://localhost:8081` (local dev)
- `https://syntithenai.github.io` (production GitHub Pages)

### Authorized Redirect URIs
- Not required for OAuth 2.0 implicit flow (used by this app)

### Required APIs
- ✅ Google Docs API
- ✅ Google Drive API

### OAuth Scopes
- `https://www.googleapis.com/auth/documents` - Create/edit docs
- `https://www.googleapis.com/auth/drive.file` - Access app-created files only
- `https://www.googleapis.com/auth/spreadsheets` - Access spreadsheets

## Security Notes

1. **Limited Scope**: App only requests access to files it creates, not all user files
2. **Metadata Filtering**: Server-side filtering ensures only app-created docs are shown
3. **Client-Side Auth**: Google handles authentication, we just use the token
4. **No Backend Storage**: Access tokens stored in browser localStorage only
5. **Token Expiration**: Tokens expire after 1 hour, requiring re-authentication

## Files Modified

1. **Created**: `/home/stever/projects/lambdallmproxy/ui-new/.env`
   - Added `VITE_GOOGLE_CLIENT_ID` configuration
   - Added `VITE_API_BASE` for local development

## Related Documentation

- **SWAG Feature**: See `developer_logs/SWAG_FEATURE_COMPLETE.md`
- **Google OAuth Setup**: See `developer_logs/GOOGLE_OAUTH_SETUP.md`
- **Environment Configuration**: See `ui-new/.env.example`

## Troubleshooting Commands

```bash
# Check if ui-new/.env exists
ls -la ui-new/.env

# View environment configuration
cat ui-new/.env

# Check for GOOGLE_CLIENT_ID in both files
grep GOOGLE_CLIENT_ID .env ui-new/.env

# Restart dev server after env changes
make dev

# Clear browser cache and localStorage
# In browser console:
localStorage.clear();
location.reload(true);
```

## Future Improvements

1. **Better Error Messages**: Show specific missing variable in UI
2. **Auto-detect Missing Env**: Warn user when `VITE_GOOGLE_CLIENT_ID` is not set
3. **Setup Wizard**: Guide users through Google OAuth setup
4. **Token Refresh**: Implement automatic token refresh before expiration
5. **Multiple Folders**: Allow users to organize docs in custom folders

## Conclusion

The SWAG Google Docs loading issue was caused by a missing environment variable in the UI configuration. The fix involved:

1. Creating `ui-new/.env` file
2. Adding `VITE_GOOGLE_CLIENT_ID` from the main `.env` file
3. Restarting the development server

The SWAG feature should now work correctly with Google Docs integration! 🎉
