# Troubleshooting: Location-Based Query Failed

## Issue
Query: "Find the nearest hospital or emergency room to my location"
Result: Unable to generate response

## Common Causes & Solutions

### 1. ❌ No Providers Configured

**Symptom**: No response, error about missing providers

**Solution**: Run the provider setup script

```javascript
// Open browser console (F12) and paste this:
```

**Copy the contents of `SETUP_UI_PROVIDERS.js` and paste into console**

Then refresh the page (F5) and verify in Settings → Providers.

---

### 2. ❌ Location Not Enabled

**Symptom**: Query runs but doesn't use your location

**Solution**:
1. Go to **Settings** (gear icon in header)
2. Click **Location** tab (4th tab)
3. Click **Enable Location** button
4. Allow browser location permission when prompted
5. Wait for location to load (shows green "Location Enabled")
6. Try your query again

**Check**: You should see your coordinates displayed in the Location tab.

---

### 3. ❌ Provider API Key Invalid

**Symptom**: "403 Forbidden" or "401 Unauthorized" errors in console

**Solution**:
1. Check browser console (F12 → Console tab)
2. Look for errors mentioning API keys
3. Verify your API keys are correct in the setup script
4. For Groq: Get new key from https://console.groq.com/keys
5. For Gemini: Get new key from https://aistudio.google.com/app/apikey
6. Update the setup script with new keys
7. Re-run the setup script

---

### 4. ❌ Rate Limit Exceeded

**Symptom**: Error about rate limits, "429 Too Many Requests"

**Solution**:
- Wait a few minutes before trying again
- Groq Free has limits: 7,000 requests/minute, 30,000 tokens/minute
- The system will automatically try the next provider
- Enable multiple providers for redundancy

---

### 5. ❌ Web Search Tool Disabled

**Symptom**: Response doesn't include real-time data

**Check if tools are enabled**:
```javascript
// Run in console:
console.log(JSON.parse(localStorage.getItem('research_agent_settings')));
```

Look for `enabledTools` - `web_search` should be `true`.

**Fix if needed**:
```javascript
const settings = JSON.parse(localStorage.getItem('app_settings'));
// (Settings may not have enabledTools - this is okay, defaults to all enabled)
```

---

### 6. ❌ Browser Console Errors

**How to check**:
1. Press F12 to open Developer Tools
2. Click **Console** tab
3. Try your query again
4. Look for red error messages

**Common errors**:

**Error: "Failed to fetch"**
- Network issue or CORS error
- Check internet connection
- Try refreshing the page

**Error: "No providers configured"**
- Run the setup script (SETUP_UI_PROVIDERS.js)

**Error: "Exceeded credit limit"**
- Check Settings → Usage
- Contact admin to increase limit

**Error: "Location permission denied"**
- Browser blocked location access
- Click lock icon in address bar → Allow location
- Or go to browser settings and allow location for the site

---

## Complete Diagnostic Checklist

Run these checks in order:

### ✓ Step 1: Verify Providers
```javascript
// Run in console:
const settings = JSON.parse(localStorage.getItem('app_settings'));
console.log('Providers:', settings?.providers?.filter(p => p.enabled).length || 0);
console.log('Details:', settings?.providers?.filter(p => p.enabled).map(p => p.type));
```

**Expected**: Should show 4 providers: `groq-free`, `gemini-free`, `together`, `openai-compatible`

**If 0 providers**: Run `SETUP_UI_PROVIDERS.js` script

---

### ✓ Step 2: Verify Location
```javascript
// Run in console:
const location = JSON.parse(localStorage.getItem('user_location'));
console.log('Location enabled:', !!location);
if (location) {
  console.log('Coordinates:', location.latitude, location.longitude);
  console.log('Address:', location.address?.city, location.address?.state);
}
```

**Expected**: Should show your coordinates and city

**If null**: Enable in Settings → Location tab

---

### ✓ Step 3: Test Provider Connection
```javascript
// Run in console (after enabling location and providers):
fetch('https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('google_access_token')
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'test' }],
    providers: JSON.parse(localStorage.getItem('app_settings')).providers.filter(p => p.enabled)
  })
}).then(r => r.text()).then(console.log).catch(console.error);
```

**Expected**: Should return a streaming response or JSON

**If error**: Check the error message for details

---

### ✓ Step 4: Check Network Tab
1. Open DevTools (F12) → Network tab
2. Try your query again
3. Look for request to `/chat`
4. Click on it → Check:
   - **Request**: Should have `location` object with coordinates
   - **Response**: Check status code (200 = good, 4xx/5xx = error)

---

## Quick Fix: Start Fresh

If nothing works, reset everything:

```javascript
// CAUTION: This clears all settings
localStorage.clear();
location.reload();
```

Then:
1. Login again
2. Run `SETUP_UI_PROVIDERS.js` 
3. Enable location in Settings
4. Try query again

---

## Location Query Examples

Once location is enabled, try:

✅ **Works well**:
- "Find restaurants near me"
- "What's the weather here?"
- "Search for coffee shops within 2 miles"
- "Find the nearest hospital"

❌ **Won't work without location**:
- "near me" / "my location" requires location enabled
- General queries work without location

---

## Contact Support

If still not working:
1. Copy error messages from console
2. Copy network request details
3. Share in GitHub issues: https://github.com/syntithenai/lambdallmproxy/issues

Include:
- Browser (Chrome/Firefox/Safari)
- Error messages
- Whether providers are configured
- Whether location is enabled
