# Google OAuth "Malformed Request" Error - Troubleshooting Guide

## Error Message
> "The server cannot process the request because it is malformed. It should not be retried. That's all we know."

## Common Causes and Solutions

### 1. ✅ Placeholder Client ID (FIXED)
**Problem**: Still using `YOUR_CLIENT_ID_HERE`  
**Solution**: Get real Client ID from Google Cloud Console

#### Steps to Get Client ID:
1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Configure as shown below
4. Copy the Client ID to `ui-new/.env`

### 2. ⚠️ Missing or Incorrect Authorized JavaScript Origins
**Problem**: The origin you're accessing the app from isn't authorized  
**Solution**: Add ALL origins you'll use to test

#### In Google Cloud Console:
Navigate to: **APIs & Services** > **Credentials** > **Your OAuth Client**

**Authorized JavaScript origins** must include:
```
http://localhost:8081          # Production build with Python server
http://localhost:5173          # Vite dev server (npm run dev)
http://127.0.0.1:8081         # Alternative localhost (optional)
http://127.0.0.1:5173         # Alternative localhost (optional)
```

**Important**: 
- ✅ DO include the protocol (`http://`)
- ✅ DO include the port (`:8081` or `:5173`)
- ❌ DON'T add trailing slashes
- ❌ DON'T use wildcards in origins

### 3. ⚠️ Wrong Origin Format
**Problem**: Google is very strict about origin format

**Bad Examples**:
```
localhost:8081           ❌ Missing http://
http://localhost:8081/   ❌ Has trailing slash
http://localhost         ❌ Missing port (unless on port 80)
https://localhost:8081   ❌ Wrong protocol (should be http for local)
*.localhost:8081         ❌ Wildcards not allowed
```

**Good Examples**:
```
http://localhost:8081    ✅ Correct
http://localhost:5173    ✅ Correct
http://127.0.0.1:8081   ✅ Correct (alternative)
```

### 4. ⚠️ OAuth Consent Screen Not Configured
**Problem**: Consent screen required but not set up

**Solution**: Configure OAuth Consent Screen
1. Go to **APIs & Services** > **OAuth consent screen**
2. User Type: **External** (for testing) or **Internal** (for org only)
3. App information:
   - App name: `LambdaLLM Swag`
   - User support email: Your email
   - Developer contact: Your email
4. Scopes: Add these scopes:
   - `../auth/documents`
   - `../auth/drive.file`
5. Test users: Add your email (required for External apps in testing)
6. Save and continue

### 5. ⚠️ Client ID Format Issue
**Problem**: Client ID doesn't match expected format

**Expected Format**:
```
123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
```

**Check**:
- Should end with `.apps.googleusercontent.com`
- Should have a number, hyphen, then alphanumeric string
- Should be ~70 characters long

### 6. ⚠️ Redirect URI Required (Web Apps)
**Problem**: Some OAuth clients require explicit redirect URIs

**Solution**: In Google Cloud Console, add **Authorized redirect URIs**:
```
http://localhost:8081
http://localhost:5173
```

Note: For the token client flow (what we're using), redirect URIs are typically NOT needed, but adding them doesn't hurt.

### 7. ⚠️ APIs Not Enabled
**Problem**: Required APIs not enabled in project

**Solution**: Enable APIs
1. Go to **APIs & Services** > **Library**
2. Search and enable:
   - ✅ Google Docs API
   - ✅ Google Drive API
   - ✅ Google Identity Services (should be enabled by default)

### 8. ⚠️ Wrong OAuth Client Type
**Problem**: Using wrong client type (Desktop, iOS, etc. instead of Web)

**Solution**: 
- Delete the credential if wrong type
- Create new: **OAuth 2.0 Client ID** → **Web application**

## Debugging Steps

### Step 1: Check Current Configuration
Open browser console before clicking the Google Docs button and look for:
```
📋 Client ID configured: YES/NO
📋 Client ID value: [first 30 chars]...
📋 Current origin: http://localhost:8081
```

### Step 2: Verify Client ID Format
```bash
# Check your .env file
cat ui-new/.env | grep VITE_GOOGLE_CLIENT_ID
```

Expected output:
```
VITE_GOOGLE_CLIENT_ID=123456789012-abc...xyz.apps.googleusercontent.com
```

### Step 3: Rebuild After Changing .env
```bash
# Environment variables are baked into the build
./scripts/build-docs.sh
```

### Step 4: Check Google Cloud Console Configuration

**Checklist**:
- [ ] OAuth consent screen configured
- [ ] Test user added (your email)
- [ ] APIs enabled (Docs + Drive)
- [ ] OAuth client type is "Web application"
- [ ] Authorized JavaScript origins include your origin exactly
- [ ] Client ID copied correctly to .env

### Step 5: Test OAuth Flow
1. Clear browser cache/cookies for `accounts.google.com`
2. Rebuild app: `./scripts/build-docs.sh`
3. Start server: `cd docs && python3 -m http.server 8081`
4. Open: `http://localhost:8081/swag` (use exact origin you authorized)
5. Open browser console (F12 → Console tab)
6. Click "New Google Doc" button
7. Watch console for debug messages

### Step 6: Read Error Details
Look for these console messages:
```
❌ Authentication failed: [error] - [description]
```

Common errors:
- `invalid_client` → Client ID wrong or not found
- `redirect_uri_mismatch` → Origin not authorized
- `access_denied` → User denied permission
- `invalid_scope` → Scope format wrong

## Quick Fix Checklist

Try these in order:

1. **✅ Verify .env has real Client ID**
   ```bash
   grep VITE_GOOGLE_CLIENT_ID ui-new/.env
   ```

2. **✅ Rebuild after changing .env**
   ```bash
   ./scripts/build-docs.sh
   ```

3. **✅ Check Google Cloud Console**
   - Authorized JavaScript origins includes `http://localhost:8081`
   - Exactly matches (no trailing slash, includes protocol and port)

4. **✅ Clear browser cache**
   - Google caches OAuth settings aggressively
   - Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)

5. **✅ Use exact authorized origin**
   - If you authorized `http://localhost:8081`, use that exact URL
   - Don't use `127.0.0.1` if you authorized `localhost`

6. **✅ Check OAuth consent screen status**
   - Should show "Testing" or "Published"
   - Your email should be in test users

## Testing in Vite Dev Server

If testing with `npm run dev` (port 5173):

1. **Add to Authorized JavaScript origins**:
   ```
   http://localhost:5173
   ```

2. **Start dev server**:
   ```bash
   cd ui-new
   npm run dev
   ```

3. **Access at**: `http://localhost:5173/swag`

## Still Not Working?

### Create a minimal test:
```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <button onclick="testAuth()">Test OAuth</button>
  <script>
    const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';  // Replace with your Client ID
    
    function testAuth() {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/documents',
        callback: (response) => {
          console.log('Response:', response);
          if (response.access_token) {
            alert('Success! Token: ' + response.access_token.substring(0, 20) + '...');
          } else {
            alert('Error: ' + JSON.stringify(response));
          }
        }
      });
      client.requestAccessToken({ prompt: '' });
    }
  </script>
</body>
</html>
```

Save as `test-oauth.html`, serve with:
```bash
python3 -m http.server 8081
```

If this minimal test fails with same error, the issue is definitely in Google Cloud Console configuration.

## Contact Google Support

If none of the above works:
1. Go to Google Cloud Console
2. Click "?" icon (top right)
3. Select "Send feedback"
4. Include:
   - Client ID (they can look up your config)
   - Exact error message
   - Origin you're using
   - Screenshot of OAuth client settings
