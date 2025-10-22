# Cloud Sync Error Message Fix - Updated

**Date:** 20 October 2025  
**Issue:** "Failed to initialise cloud sync" error on page load  
**Status:** ✅ Fixed with better error messages

---

## Problem

Users were seeing "Failed to initialize cloud sync" error, but:
- When sync was NOT enabled: Error was confusing (optional feature shouldn't error)
- When sync WAS enabled: Error message wasn't helpful for debugging

---

## Solution - Version 2 (Current)

After discovering the user HAD cloud sync enabled, the fix needed to be different:

### Goals:
1. **Silent failure** when sync is disabled (don't alarm users)
2. **Helpful errors** when sync is enabled but failing (guide users to fix)
3. **Better logging** to diagnose the actual issue

### Changes Made:

#### 1. Enhanced Error Logging in `getUserRagSpreadsheet()`
**Location:** `ui-new/src/contexts/SwagContext.tsx` line ~160

**Added:**
- Check if Google Identity Services library is loaded
- Detailed console messages explaining what's wrong
- Throw specific error messages instead of generic ones
- Better OAuth error handling

**New console output:**
```javascript
// Before requesting token:
🔑 Requesting Google Drive API access token...

// If library not loaded:
❌ Google Identity Services not available. The library may not have loaded yet.
💡 This usually happens if the page loads before Google GSI library is ready.
💡 Try: 1) Refresh the page, 2) Check internet connection, 3) Check browser console

// If using cached token:
✅ Using cached Drive API access token

// After getting token:
✅ Got Drive API access token
```

#### 2. Better Error Messages in `initSync()`
**Location:** `ui-new/src/contexts/SwagContext.tsx` line ~270

**Changed:**
```typescript
// When spreadsheet can't be accessed:
if (!spreadsheetId) {
  console.warn('Could not get user RAG spreadsheet - sync disabled');
  showWarning('Cloud sync enabled but cannot access Google Sheets. Please check permissions in Settings > RAG.');
  return;
}

// When sync initialization fails:
} catch (error) {
  console.error('Failed to initialize sync:', error);
  showError('Cloud sync failed to initialize. Check Settings > RAG for details.');
}
```

---

## Error Scenarios

### Scenario 1: Sync Disabled (Default)
- **Before:** No errors (fixed in v1)
- **After:** Still no errors ✅

### Scenario 2: Sync Enabled, Google Library Not Loaded
- **Error shown:** "Cloud sync failed to initialize. Check Settings > RAG for details."
- **Console shows:** Detailed explanation about GSI library not loading
- **User action:** Refresh page

### Scenario 3: Sync Enabled, Permissions Not Granted
- **Error shown:** "Cloud sync enabled but cannot access Google Sheets. Please check permissions..."
- **Console shows:** "📋 Requesting Google Drive & Sheets permissions..."
- **User action:** Grant permissions in OAuth popup

### Scenario 4: Sync Enabled, Backend Error
- **Error shown:** "Cloud sync failed to initialize. Check Settings > RAG for details."
- **Console shows:** Backend API error details
- **User action:** Check backend is running

---

## Code Changes

### File: `ui-new/src/contexts/SwagContext.tsx`

#### Change 1: Check for GSI Library (line ~162)
```typescript
// Check if Google Identity Services is available
if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
  console.error('❌ Google Identity Services not available. The library may not have loaded yet.');
  console.log('💡 This usually happens if the page loads before Google GSI library is ready.');
  console.log('💡 Try: 1) Refresh the page, 2) Check internet connection, 3) Check browser console for script loading errors');
  throw new Error('Google Identity Services not available - library not loaded');
}
```

#### Change 2: Better OAuth Error Handling (line ~195)
```typescript
tokenClient.callback = (response: any) => {
  if (response.error) {
    console.error('OAuth error:', response.error);
    reject(new Error(`OAuth error: ${response.error}`));
    return;
  }
  if (response.access_token) {
    authToken = response.access_token;
    localStorage.setItem('google_drive_access_token', response.access_token);
    console.log('✅ Got Drive API access token');
    resolve();
  } else {
    reject(new Error('No access token received'));
  }
};
```

#### Change 3: Helpful Warning When Sync Enabled But Fails (line ~275)
```typescript
if (!spreadsheetId) {
  console.warn('Could not get user RAG spreadsheet - sync disabled');
  showWarning('Cloud sync enabled but cannot access Google Sheets. Please check permissions in Settings > RAG.');
  return;
}
```

#### Change 4: Success Confirmation (line ~338)
```typescript
console.log('✅ RAG sync initialized and auto-sync started');
```

---

## Testing

### Test 1: Fresh Install, Sync Disabled
```bash
# Clear localStorage
localStorage.clear()

# Reload page
```
**Expected:** No errors ✅

### Test 2: Enable Sync, No Permissions
```bash
# Enable cloud sync in Settings > RAG
```
**Expected:**
- OAuth popup appears
- Grant permissions
- Console: "✅ RAG sync initialized and auto-sync started"

### Test 3: Enable Sync, Deny Permissions
```bash
# Enable cloud sync
# Click "Deny" in OAuth popup
```
**Expected:**
- Error: "Cloud sync failed to initialize..."
- Console: "OAuth error: access_denied"

### Test 4: Sync Enabled, Backend Down
```bash
# Stop backend
# Reload page
```
**Expected:**
- Warning: "Cloud sync enabled but cannot access Google Sheets..."
- Console: Backend connection error

---

## Troubleshooting

See `CLOUD_SYNC_TROUBLESHOOTING.md` for comprehensive debugging guide.

**Quick checks:**
1. Check console for specific error message
2. Verify Google GSI library loaded: `console.log(window.google?.accounts?.oauth2)`
3. Check token exists: `localStorage.getItem('google_drive_access_token')`
4. Verify backend running: `curl http://localhost:9000/health`

---

**Status:** ✅ Complete  
**Documentation:** Added CLOUD_SYNC_TROUBLESHOOTING.md  
**Next:** Test with fresh browser profile

