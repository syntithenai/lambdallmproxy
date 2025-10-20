# Cloud Sync Troubleshooting Guide

**Date:** 20 October 2025  
**Issue:** "Cloud sync failed to initialize" or "Failed to initialize cloud sync"  
**When:** Cloud sync is enabled in RAG Settings but failing

---

## Quick Diagnosis

Open browser console (F12) and look for these specific error messages:

### Error 1: "Google Identity Services not available - library not loaded"
**Cause:** Google GSI library hasn't loaded yet  
**Solution:** Refresh the page or check internet connection

### Error 2: "Please grant access to Google Drive and Sheets to enable cloud sync"
**Cause:** User hasn't granted Drive/Sheets permissions  
**Solution:** Follow the permission grant flow below

### Error 3: "No Drive API access token - unable to access Google Sheets"
**Cause:** OAuth flow didn't complete  
**Solution:** Clear cached token and try again

### Error 4: Backend API errors (403, 500, etc.)
**Cause:** Backend can't access Google Sheets API  
**Solution:** Check backend is running and configured

---

## Step-by-Step Fix

### Step 1: Clear Cached Tokens
Sometimes old/expired tokens cause issues.

```javascript
// Open browser console (F12) and run:
localStorage.removeItem('google_drive_access_token');
localStorage.removeItem('rag_spreadsheet_id');
```

Then refresh the page.

### Step 2: Grant Google Drive Permissions
Cloud sync requires TWO separate permissions:

1. **Basic Sign-In** (email, profile)
   - Already granted when you signed in
   
2. **Drive & Sheets Access** (separate permission!)
   - Required for cloud sync
   - Will prompt automatically when you enable sync

**What to expect:**
1. Enable "Cloud Sync with Google Sheets" in Settings > RAG
2. Google OAuth popup appears
3. Shows: "Research Agent wants to access your Google Drive"
4. Click "Allow"
5. Console shows: "✅ Got Drive API access token"
6. Console shows: "✅ RAG sync initialized and auto-sync started"

**If popup doesn't appear:**
- Check if popup was blocked (browser toolbar)
- Check console for error: "Google Identity Services not available"
- Refresh page and try again

### Step 3: Check Google Identity Services Library
The Google GSI library must load before sync can work.

**Check in console:**
```javascript
// Run in browser console:
console.log(window.google?.accounts?.oauth2)
```

**Expected:** Should show an object with methods  
**If undefined:** Library didn't load

**Fixes:**
1. Check internet connection
2. Check browser console for script loading errors
3. Verify index.html includes GSI script:
   ```html
   <script src="https://accounts.google.com/gsi/client" async defer></script>
   ```
4. Refresh page

### Step 4: Verify Backend is Running
Cloud sync needs the backend API to create/access Google Sheets.

**Check backend status:**
```bash
# Should see backend running on port 9000 or Lambda URL
lsof -i :9000
# OR
curl http://localhost:9000/health
```

**Check API endpoint:**
```bash
# Test the endpoint (replace with your Lambda URL if deployed)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:9000/rag/user-spreadsheet
```

**Expected:** JSON response with spreadsheetId  
**If 403/401:** Token issue  
**If 500:** Backend error (check backend logs)

### Step 5: Check Environment Variables
Verify configuration is correct:

```bash
cd ui-new
cat .env | grep VITE_GOOGLE_CLIENT_ID
```

**Expected:** Should show your Google OAuth Client ID  
**If missing:** Copy from `.env.example` and configure

---

## Console Log Reference

### Successful Initialization
```
🔑 Requesting Google Drive API access token...
📋 Requesting Google Drive & Sheets permissions...
✅ Got Drive API access token
🌐 Calling getUserRagSpreadsheet at: http://localhost:9000
✅ Found existing RAG spreadsheet: 1abc...xyz
Performing initial sync...
✅ RAG sync initialized and auto-sync started
```

### Failed - Library Not Loaded
```
🔑 Requesting Google Drive API access token...
❌ Google Identity Services not available. The library may not have loaded yet.
💡 This usually happens if the page loads before Google GSI library is ready.
💡 Try: 1) Refresh the page, 2) Check internet connection, 3) Check browser console for script loading errors
Failed to initialize sync: Error: Google Identity Services not available - library not loaded
Cloud sync failed to initialize. Check Settings > RAG for details.
```

**Fix:** Refresh the page

### Failed - Permissions Denied
```
🔑 Requesting Google Drive API access token...
📋 Requesting Google Drive & Sheets permissions...
OAuth error: access_denied
Failed to get Drive API token: Error: OAuth error: access_denied
Failed to initialize sync: Error: Please grant access to Google Drive and Sheets to enable cloud sync
Cloud sync failed to initialize. Check Settings > RAG for details.
```

**Fix:** Grant permissions in the OAuth popup

### Failed - Backend Error
```
✅ Got Drive API access token
🌐 Calling getUserRagSpreadsheet at: http://localhost:9000
❌ Backend error response: { status: 500, statusText: 'Internal Server Error', body: '...' }
Failed to get user RAG spreadsheet: Error: Failed to get spreadsheet: 500
Cloud sync enabled but cannot access Google Sheets. Please check permissions in Settings > RAG.
```

**Fix:** Check backend logs, verify backend is running

---

## Common Scenarios

### Scenario 1: First Time Enabling Sync
**Expected Flow:**
1. Go to Settings > RAG
2. Check "Cloud Sync with Google Sheets"
3. OAuth popup appears
4. Click "Allow" to grant Drive/Sheets access
5. Sync initializes
6. Spreadsheet created in your Drive (if doesn't exist)

**If popup blocked:**
- Look for blocked popup icon in browser toolbar
- Click to allow popups from this site
- Try again

### Scenario 2: Sync Was Working, Now Broken
**Common Causes:**
- Token expired
- User revoked permissions in Google account settings
- Backend configuration changed

**Fix:**
1. Clear tokens (Step 1 above)
2. Disable and re-enable cloud sync
3. Grant permissions again

### Scenario 3: Error on Every Page Load
**If sync is NOT enabled:**
- Should NOT see errors (our fix handles this)
- If still seeing errors, check console logs

**If sync IS enabled:**
- Errors are legitimate - something needs fixing
- Follow steps above to diagnose

---

## Manual Verification

### Check Google Drive
1. Go to https://drive.google.com
2. Look for folder: "Research Agent"
3. Inside should be: "Research Agent Swag" spreadsheet
4. Open spreadsheet
5. Look for sheets: "Snippets", "RAG Embeddings"

**If missing:**
- Backend couldn't create it
- Check backend permissions
- Check backend logs

### Check localStorage
```javascript
// Browser console:
console.log('RAG spreadsheet ID:', localStorage.getItem('rag_spreadsheet_id'));
console.log('Drive token exists:', !!localStorage.getItem('google_drive_access_token'));
console.log('RAG config:', localStorage.getItem('rag_config'));
```

### Check Sync Status
```javascript
// Browser console - if SwagContext is accessible:
// Look for sync status in React DevTools > Components > SwagProvider
```

---

## Advanced Debugging

### Enable Verbose Logging
All relevant logs are already in console. Use browser DevTools:

1. Open Console (F12)
2. Filter by "sync" or "RAG"
3. Look for 🔑 📋 ✅ ❌ emoji markers

### Network Tab
1. Open DevTools > Network
2. Filter: XHR/Fetch
3. Enable sync
4. Look for:
   - `/rag/user-spreadsheet` - Should return 200
   - `googleapis.com` - Drive/Sheets API calls

### Test OAuth Flow Manually
```javascript
// Browser console:
const tokenClient = window.google.accounts.oauth2.initTokenClient({
  client_id: 'YOUR_CLIENT_ID',
  scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
  callback: (response) => {
    console.log('Token response:', response);
  }
});
tokenClient.requestAccessToken({ prompt: '' });
```

---

## Error Message Reference

| Error Message | Cause | Fix |
|--------------|-------|-----|
| "Google Identity Services not available - library not loaded" | GSI library didn't load | Refresh page, check internet |
| "Please grant access to Google Drive and Sheets to enable cloud sync" | Permissions not granted | Click "Allow" in OAuth popup |
| "No Drive API access token - unable to access Google Sheets" | OAuth flow failed | Clear token, try again |
| "Cloud sync enabled but cannot access Google Sheets" | Spreadsheet creation failed | Check backend logs |
| "Cloud sync failed to initialize" | General error | Check console for specific error |
| "Sync failed: [message]" | Active sync error | Check network, backend status |

---

## Prevention

### For Development
1. Always check console on page load
2. Test with fresh browser profile periodically
3. Clear localStorage when testing auth flows
4. Keep backend running when testing sync

### For Production
1. Add health check for GSI library loading
2. Add retry logic for transient errors
3. Show clear UI indicators when sync is broken
4. Add "Re-authenticate" button in settings

---

## Still Not Working?

### Check:
1. ✅ Browser console shows no script loading errors
2. ✅ Google Client ID is configured in .env
3. ✅ Backend is running (port 9000 or Lambda URL)
4. ✅ OAuth popup appears and permissions granted
5. ✅ No network errors in DevTools > Network tab

### Collect Debug Info:
```javascript
// Browser console - copy/paste this:
console.log('Debug Info:');
console.log('- Has GSI:', !!window.google?.accounts?.oauth2);
console.log('- Has token:', !!localStorage.getItem('google_drive_access_token'));
console.log('- Has sheet ID:', !!localStorage.getItem('rag_spreadsheet_id'));
console.log('- RAG config:', localStorage.getItem('rag_config'));
console.log('- Client ID:', import.meta.env.VITE_GOOGLE_CLIENT_ID);
```

Share this output when reporting issues.

---

**Updated:** 20 October 2025  
**Next Steps:** Try the fixes above in order, check console logs at each step
