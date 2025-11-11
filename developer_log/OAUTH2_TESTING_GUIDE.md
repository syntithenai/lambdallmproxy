# Quick Testing Guide - OAuth2 Migration

**Status**: ✅ System Ready for Testing  
**Date**: November 11, 2025  
**Servers Running**:
- Backend: http://localhost:3000
- Frontend: http://localhost:8081 ← **Open this in your browser**

---

## 🎯 Quick Test (2 minutes)

### Test 1: OAuth2 Sign-In & Persistence
1. **Open** http://localhost:8081 in your browser
2. **Navigate** to Settings (⚙️ icon) → Cloud Sync tab
3. **Click** "Connect to Google Drive" button
4. **Sign in** with your Google account
5. **Expected**: Button changes to "Connected to Google Drive ✅"
6. **Refresh** the page (F5 or Ctrl+R)
7. **Expected**: Still shows "Connected to Google Drive ✅" ← **THIS IS THE FIX!**

**Before**: Lost connection on every refresh (had to reconnect)  
**After**: Connection persists across page reloads ✅

---

### Test 2: Login Persistence
1. **Check** the top-right corner of the page
2. **Expected**: Shows your Google profile picture or email
3. **Refresh** the page multiple times
4. **Expected**: You stay logged in ← **THIS IS THE FIX!**

**Before**: Lost login on every refresh  
**After**: Login persists across page reloads ✅

---

### Test 3: Sign Out
1. **Click** your profile picture/email in top-right
2. **Click** "Sign Out"
3. **Expected**: 
   - You're logged out
   - Cloud Sync shows "Not connected"
   - All components update immediately
4. **Refresh** the page
5. **Expected**: Still logged out (not automatically re-authenticated)

---

## 📊 Browser Console Logs to Check

Open **Developer Tools** (F12) → **Console** tab

### On First Sign-In:
```
🔐 Initializing Google OAuth2...
✅ Google Identity Services already loaded
🔐 Requesting Google sign-in...
✅ Access token received
✅ User profile extracted: { email: "your@email.com", name: "Your Name" }
✅ Google authentication successful
✅ AuthContext updated from googleAuth success event: your@email.com
```

### On Page Refresh (When Already Authenticated):
```
🔐 Initializing Google OAuth2...
✅ Google Identity Services already loaded
✅ Token found and valid (expires in XX minutes)
🔐 AuthProvider initializing with state from googleAuth:
  isAuthenticated: true
  hasToken: true
  userEmail: "your@email.com"
```

### On Sign Out:
```
👋 Signing out...
✅ AuthContext updated from googleAuth signout event
```

---

## 🔍 What to Look For

### ✅ Success Indicators:
- Profile picture/email appears in header after sign-in
- Cloud Sync shows "Connected to Google Drive ✅"
- **Connection persists after page refresh** ← KEY TEST
- **Login persists after page refresh** ← KEY TEST
- Sign out works and affects all components
- Console shows green checkmarks (✅)

### ❌ Failure Indicators:
- Red errors in browser console
- Connection lost after page refresh
- Login lost after page refresh
- TypeScript errors in terminal
- Sign out doesn't clear user data

---

## 🐛 If Something Goes Wrong

### Connection Lost on Refresh:
1. **Check** browser console for errors
2. **Check** localStorage: Press F12 → Application → Local Storage → http://localhost:8081
3. **Look for**: `google_access_token`, `google_token_expiration`
4. **Verify**: `google_token_expiration` is a future timestamp

### Login Lost on Refresh:
1. **Check** browser console for "Token expired" messages
2. **Check** localStorage for `user_email`, `google_access_token`
3. **Try**: Sign in again and immediately refresh
4. **Report**: Copy any error messages from console

### TypeScript Errors:
1. **Check** terminal where `make dev` is running
2. **Look for**: Red error messages
3. **Run**: `make dev` again to restart servers

---

## 📸 LocalStorage Keys to Verify

After signing in, open **Developer Tools** (F12) → **Application** → **Local Storage** → **http://localhost:8081**

You should see these keys:
```
google_access_token       → Your OAuth2 access token (long string)
google_token_expiration   → Unix timestamp (milliseconds)
user_email                → your@email.com
user_name                 → Your Name
user_picture              → https://... (profile picture URL)
user_sub                  → Google user ID (numeric string)
```

**Legacy keys** (for backward compatibility, may appear):
```
google_drive_access_token      → Same as google_access_token
google_drive_token_expiration  → Same as google_token_expiration
```

---

## ✅ Test Checklist

- [ ] **Sign In**: Settings → Cloud Sync → Connect to Google Drive
- [ ] **Verify Connected**: Shows "Connected to Google Drive ✅"
- [ ] **Refresh Page**: Connection still shows as connected
- [ ] **Profile Visible**: Header shows your email/picture
- [ ] **Refresh Again**: Still logged in
- [ ] **Sign Out**: User menu → Sign Out
- [ ] **Verify Logged Out**: Cloud Sync shows "Not connected"
- [ ] **Check Console**: No red errors, only green checkmarks

---

## 🎉 Success Criteria

If all these work, the migration is successful:

1. ✅ **Sign in** via Cloud Sync settings
2. ✅ **Refresh page** → Still connected to Google Drive
3. ✅ **Refresh page** → Still logged in with profile visible
4. ✅ **Sign out** → All components update
5. ✅ **No errors** in browser console

---

## 📝 Report Results

After testing, report back with:

1. **Did it work?** Yes/No
2. **Which test failed?** (if any)
3. **Console errors?** (copy/paste if any)
4. **Browser?** Chrome/Firefox/Safari/Edge
5. **Screenshot?** (if helpful)

---

**Current Status**: System deployed and ready for testing  
**Next Step**: Open http://localhost:8081 and test sign-in + page refresh!
