# Google OAuth Setup Guide for Swag Feature

## Overview
The Swag feature requires Google OAuth credentials to enable Google Docs integration (create documents, list documents, append content).

## Setup Steps

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project name/ID

### 2. Enable Required APIs
1. Go to **APIs & Services** > **Library**
2. Search for and enable:
   - **Google Docs API**
   - **Google Drive API**

### 3. Create OAuth 2.0 Credentials
1. Go to **APIs & Services** > **Credentials**
2. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen first:
   - User Type: **External** (for testing)
   - Add your email as a test user
   - Scopes: Add these **minimal, privacy-respecting** scopes:
     - `../auth/documents` - Create/edit Google Docs only
     - `../auth/drive.file` - Access only files created by this app (not all Drive files)
4. Application type: **Web application**
5. Name: `LambdaLLMProxy Swag`
6. **Authorized JavaScript origins**:
   - `http://localhost:8081` (production build)
   - `http://localhost:5173` (Vite dev server)
   - Your deployed domain if applicable
7. Click **CREATE**
8. **Copy the Client ID** (format: `123456789-abc...xyz.apps.googleusercontent.com`)

### 4. Configure Environment Variable
1. Open `ui-new/.env`
2. Replace `YOUR_CLIENT_ID_HERE` with your actual Client ID:
   ```
   VITE_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
   ```

### 5. Rebuild and Test
```bash
# Rebuild the UI
./scripts/build-docs.sh

# Start local server
cd docs && python3 -m http.server 8081

# Open browser to http://localhost:8081
# Navigate to /swag page
# Click "New Google Doc" button
# Grant permissions when prompted
```

## Debugging Google OAuth

The app now includes comprehensive console logging to help diagnose OAuth issues:

### Check Browser Console
1. Open Developer Tools (F12)
2. Go to **Console** tab
3. Look for these debug messages:

#### Initialization
- 🔐 Initializing Google Auth...
- 📋 Client ID configured: YES/NO
- 📋 Client ID value: (first 20 chars)
- 📥 Loading Google Identity Services library...
- ✅ Google Identity Services library loaded
- ✅ Token client initialized

#### Authentication Flow
- 🔑 Requesting Google Auth...
- 📋 Current token: (if exists)
- 🚀 Requesting access token from Google...
- ⏳ Waiting for user to grant permissions...
- 🎫 Token callback received
- ✅ Access token received

#### API Calls
- 📄 Creating Google Doc: [title]
- 📝 Listing Google Docs...
- ➕ Appending to Google Doc: [id]
- 🔑 Using token: (first 20 chars)
- 🚀 Making API request to Google...
- 📩 Response status: 200 OK / 401 Unauthorized / etc.
- ✅ Document created successfully

#### Errors
- ❌ Client ID not configured
- ❌ Failed to load Google Identity Services library
- ❌ No access token in response
- ❌ API Error: [details]
- ❌ Token validation failed

### Common Issues

**"Client ID configured: NO"**
- Solution: Add `VITE_GOOGLE_CLIENT_ID` to `ui-new/.env` and rebuild

**"Failed to load Google Identity Services library"**
- Check network tab for blocked script loading
- Verify internet connection
- Check browser console for CORS errors

**"No access token in response"**
- User may have denied permissions
- Check OAuth consent screen configuration
- Verify scopes are correct

**"401 Unauthorized" API errors**
- Token may be expired (app will auto-refresh)
- Check that APIs are enabled in Google Cloud Console
- Verify scopes include `documents` and `drive.file`

**OAuth popup doesn't appear**
- Check browser popup blocker settings
- Verify authorized origins include your domain
- Try clicking the button again

## Testing the Integration

### 1. Create a Document
- Click **"New Google Doc"** button
- Grant permissions in OAuth popup
- Enter document title
- Check console for: "✅ Document created successfully"

### 2. List Documents
- Click **"Append to Existing Doc"** dropdown
- Check console for: "✅ Documents retrieved: [count]"
- Verify documents appear in dropdown

### 3. Append Content
- Select snippets with checkboxes
- Choose document from dropdown
- Click **"Append to Google Doc"**
- Check console for: "✅ Content appended successfully"

## Security & Privacy Notes

This app uses **minimal, privacy-respecting permissions**:

### Scopes Requested:
1. **`https://www.googleapis.com/auth/documents`**
   - Allows: Create and edit Google Docs
   - Does NOT allow: Access to other document types (Sheets, Slides, etc.)

2. **`https://www.googleapis.com/auth/drive.file`** (Most Important for Privacy!)
   - Allows: Access ONLY to files that this app creates or opens
   - Does NOT allow: Access to your existing Google Drive files
   - Does NOT allow: Browsing your entire Drive
   - Restricted scope - app can only see its own documents

### Additional Security Measures:
- OAuth tokens are stored in **memory only** (not persisted to disk or localStorage)
- Tokens are validated before each use (auto-refresh if expired)
- Access can be revoked at any time via Google Account settings
- No server-side token storage (all OAuth happens client-side)

## Additional Resources

- [Google Identity Services Documentation](https://developers.google.com/identity/gsi/web)
- [Google Docs API Reference](https://developers.google.com/docs/api)
- [Google Drive API Reference](https://developers.google.com/drive/api)
- [OAuth 2.0 for Web Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
