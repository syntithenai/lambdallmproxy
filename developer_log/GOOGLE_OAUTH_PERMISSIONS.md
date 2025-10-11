# Google OAuth Permissions - Privacy & Security

## What Permissions Does This App Request?

### Scope 1: `https://www.googleapis.com/auth/documents`
**Purpose**: Create and edit Google Docs

**What it allows**:
- ✅ Create new Google Docs
- ✅ Read document content (for documents created by this app)
- ✅ Edit document content (for documents created by this app)
- ✅ Update document formatting

**What it does NOT allow**:
- ❌ Access Google Sheets
- ❌ Access Google Slides
- ❌ Access Google Forms
- ❌ Access any other Google Workspace apps

### Scope 2: `https://www.googleapis.com/auth/drive.file` (RESTRICTED)
**Purpose**: Access files created or opened by this app only

**What it allows**:
- ✅ List documents created by this app
- ✅ Access documents created by this app
- ✅ Delete documents created by this app
- ✅ Modify metadata of documents created by this app

**What it does NOT allow**:
- ❌ Access your existing Google Drive files
- ❌ Browse your entire Google Drive
- ❌ See files created by other apps
- ❌ Access shared files (unless explicitly opened through this app)
- ❌ Access your photos, videos, or other files in Drive

## Why These Scopes?

The `drive.file` scope is Google's **most restrictive Drive scope**. It implements the principle of **least privilege**:

1. **Privacy**: The app cannot see your existing files
2. **Security**: Limited blast radius if compromised
3. **Transparency**: You know exactly what the app can access (only its own creations)

## Comparison with Other Scopes

### ❌ We DON'T use these broader scopes:

- `drive` - Full access to all Drive files (too broad!)
- `drive.readonly` - Read access to all Drive files (privacy concern!)
- `drive.metadata` - Metadata of all files (still too much!)
- `drive.appdata` - Only app data folder (too restrictive, can't share docs)

### ✅ We DO use:

- `drive.file` - Perfect balance of functionality and privacy

## What Happens During OAuth?

When you click "New Google Doc" or "Append to Existing Doc":

1. **First time**: Google OAuth popup appears
2. **Consent screen** shows:
   ```
   LambdaLLM Swag wants to:
   - See, edit, create, and delete only the specific Google Drive files you use with this app
   - See, edit, create, and delete your Google Docs documents
   ```
3. **You grant permission** (or deny)
4. **Token issued**: Short-lived access token (1 hour)
5. **Token stored**: In memory only (lost on page refresh)

## How to Verify Permissions

### Before Granting Access:
1. Look at the OAuth consent screen
2. Read the bullet points carefully
3. Notice the word "specific" - this means `drive.file` scope
4. Notice "only...files you use with this app"

### After Granting Access:
1. Go to https://myaccount.google.com/permissions
2. Find "LambdaLLM Swag" (or your app name)
3. Click to see permissions
4. Should show:
   - "View and manage Google Drive files and folders that you have opened or created with this app"
   - "See, edit, create, and delete your documents in Google Docs"

## How to Revoke Access

### Method 1: Through Google Account
1. Visit https://myaccount.google.com/permissions
2. Find "LambdaLLM Swag"
3. Click "Remove Access"
4. Confirm

### Method 2: Through the App
Currently not implemented, but could add a "Sign Out" button that calls:
```javascript
google.accounts.oauth2.revoke(accessToken)
```

## Token Security

### Storage:
- ✅ Stored in memory (JavaScript variable)
- ❌ NOT stored in localStorage
- ❌ NOT stored in cookies
- ❌ NOT sent to any backend server
- ❌ NOT persisted to disk

### Lifetime:
- **Default**: 1 hour
- **Behavior**: Token expires, user must re-authenticate
- **Refresh**: Not implemented (would require refresh token storage)

### Validation:
- Before each API call, token is validated
- If expired: User is prompted to authenticate again
- If invalid: Error message displayed

## Privacy Considerations

### What the App CAN'T see:
- Your existing Google Docs
- Your Google Sheets, Slides, Forms
- Your photos in Google Photos
- Your Gmail emails
- Files shared with you by others
- Folders you've created
- Your Drive storage usage
- Anything you had before using this app

### What the App CAN see:
- Documents it creates (when you click "New Google Doc")
- Content you explicitly append to those documents
- Titles and modification times of documents it created

### What the App NEVER does:
- Store tokens persistently
- Send tokens to a backend server
- Share your documents with others
- Modify existing documents (not created by the app)
- Access your personal information beyond what Google provides in the token

## For Advanced Users

### Inspect the OAuth Request:
Open browser DevTools → Network tab when clicking "New Google Doc":

```
Request URL: https://accounts.google.com/o/oauth2/v2/auth
Parameters:
  client_id: [your-client-id]
  scope: https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file
  response_type: token
  ...
```

### Inspect the Token:
After successful auth, decode the JWT token at https://jwt.io:

```json
{
  "aud": "[your-client-id]",
  "scope": "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file",
  "exp": 1234567890,
  ...
}
```

### Verify API Calls:
Check Network tab for API requests:

```
POST https://docs.googleapis.com/v1/documents
Authorization: Bearer [token]

GET https://www.googleapis.com/drive/v3/files?q=...
Authorization: Bearer [token]
```

All requests include the token in the Authorization header (standard OAuth 2.0).

## Compliance

This implementation follows:
- ✅ **OAuth 2.0 best practices**
- ✅ **Principle of least privilege**
- ✅ **Google's recommended scopes** for document creation apps
- ✅ **GDPR principles** (minimal data collection)
- ✅ **Transparent permission requests**

## Questions?

**Q: Why not use a refresh token for persistent access?**  
A: Refresh tokens must be stored securely (e.g., encrypted in a backend). This app is client-side only, so we use short-lived access tokens that expire after 1 hour.

**Q: Can the app delete my files?**  
A: Only files it created. It cannot see or delete your existing files.

**Q: What if the app is compromised?**  
A: The blast radius is limited to documents created by the app. Your existing files remain safe.

**Q: Can I use this with a Google Workspace (business) account?**  
A: Yes, but your workspace admin may need to approve the app first.

**Q: Does the token give access to my email or calendar?**  
A: No. The scopes only cover Google Docs and Drive files created by the app.

## References

- [Google OAuth 2.0 Scopes](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Drive API Scopes](https://developers.google.com/drive/api/guides/api-specific-auth)
- [OAuth 2.0 Best Practices](https://tools.ietf.org/html/rfc6749)
- [Principle of Least Privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege)
