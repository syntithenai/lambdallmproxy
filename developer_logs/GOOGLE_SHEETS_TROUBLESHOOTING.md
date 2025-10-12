# Google Sheets Logging - Complete Setup & Troubleshooting

## ✅ Code Deployed Successfully

The logging system is now fully deployed with:
- ✅ Error logging support (error code + message)
- ✅ Fixed `email is not defined` bug
- ✅ Logging on both success and error paths

## 🚨 Required Setup Steps

### 1. Enable Google Sheets API (CRITICAL)

**Your Google Cloud project needs the Sheets API enabled.**

**Quick Link:** [Enable Google Sheets API](https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=927667106833)

Or manually:
1. Go to: https://console.cloud.google.com/
2. Select project: **abc2book** (ID: 927667106833)
3. Navigate to: **APIs & Services** → **Library**
4. Search: "Google Sheets API"
5. Click **Enable**
6. Wait 1-2 minutes for propagation

**Current Status:** ❌ DISABLED (getting 403 errors)

---

### 2. Share Your Google Sheet

**Your sheet MUST be shared with the service account.**

1. Open your sheet: https://docs.google.com/spreadsheets/d/1i0wNrPjMh21-1TIsAUZbYwV_c30A4-g39m4rJ-zr9Fw/edit

2. Click **Share** button (top right)

3. Add this email with **Editor** permissions:
   ```
   llamdallmproxy-log@abc2book.iam.gserviceaccount.com
   ```

4. Click **Done**

**Current Status:** ⚠️ UNKNOWN (needs verification)

---

### 3. Initialize Sheet Headers

After completing steps 1 & 2, run:

```bash
node test-sheets-init.js
```

This will add column headers to your sheet:
- Timestamp
- User Email
- Provider
- Model
- Tokens In
- Tokens Out
- Total Tokens
- Cost ($)
- Duration (s)
- Error Code
- Error Message

---

## 🧪 Testing

### Test Locally
```bash
# Should succeed after API enabled + sheet shared
node test-sheets-init.js
```

### Test Production
1. Make a chat request through your UI
2. Check CloudWatch logs: `make logs`
3. Look for: `✅ Logged to Google Sheets: gemini-2.0-flash...`
4. Check your Google Sheet for new row

---

## 🔍 Troubleshooting

### Error: "Google Sheets API has not been used... or it is disabled" (403)

**Solution:** Enable the API (see step 1 above)

**How to verify:**
- Go to: https://console.cloud.google.com/apis/dashboard?project=927667106833
- Check if "Google Sheets API" is in the enabled list

---

### Error: "The caller does not have permission" (403)

**Cause:** Sheet not shared with service account

**Solution:**
1. Open your sheet
2. Click Share
3. Add: `llamdallmproxy-log@abc2book.iam.gserviceaccount.com`
4. Set permission: **Editor**
5. Click Done

---

### Error: "email is not defined"

**Status:** ✅ FIXED in latest deployment

**Fix Applied:**
- Added `userEmail` variable extraction from `verifiedUser.email`
- All logging calls now use `userEmail` instead of undefined `email`
- Catch block handles case where `userEmail` not defined (early errors)

---

### No logs appearing in sheet (but no errors)

**Possible causes:**

1. **Logging is disabled** - Check environment variables:
   ```bash
   # Should see all 3 variables
   grep GOOGLE_SHEETS .env
   ```

2. **Lambda not seeing env vars** - Redeploy environment:
   ```bash
   make deploy-env
   ```

3. **Service account key format issue** - Verify private key has:
   - `\n` (backslash-n, not actual newlines)
   - Wrapped in quotes
   - Includes `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`

4. **Wrong spreadsheet ID** - Verify ID matches:
   ```bash
   grep SPREADSHEET_ID .env
   # Should show: 1i0wNrPjMh21-1TIsAUZbYwV_c30A4-g39m4rJ-zr9Fw
   ```

---

### Logs show "ℹ️ Google Sheets logging not configured (skipping)"

**Cause:** One or more environment variables missing

**Check:**
```bash
cat .env | grep GOOGLE_SHEETS
```

**Should see 3 variables:**
- `GOOGLE_SHEETS_LOG_SPREADSHEET_ID=1i0wNrPjMh21-1TIsAUZbYwV_c30A4-g39m4rJ-zr9Fw`
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=llamdallmproxy-log@abc2book.iam.gserviceaccount.com`
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."`

**Fix:**
```bash
# Redeploy environment variables
make deploy-env
```

---

### Logs show "❌ Failed to log to Google Sheets: [error message]"

**This is OK!** The system is designed to fail gracefully. Your requests will still work.

**Common errors:**

1. **OAuth failed: 400** → Private key format issue (check newlines)
2. **Sheets API error: 403** → API not enabled OR sheet not shared
3. **Sheets API error: 404** → Wrong spreadsheet ID

**Debug steps:**
1. Check CloudWatch: `make logs`
2. Look for full error message
3. Verify all setup steps completed

---

## 📊 Expected Sheet Format

After successful initialization, your sheet should have these columns:

| Timestamp | User Email | Provider | Model | Tokens In | Tokens Out | Total Tokens | Cost ($) | Duration (s) | Error Code | Error Message |
|-----------|------------|----------|-------|-----------|------------|--------------|----------|--------------|------------|---------------|
| 2025-10-11T16:25:30Z | user@example.com | gemini-free | gemini-2.0-flash | 150 | 500 | 650 | 0.0000 | 2.35 | | |
| 2025-10-11T16:30:45Z | user@example.com | gemini-free | gemini-2.0-flash | 0 | 0 | 0 | 0.0000 | 1.12 | ERROR | Connection timeout |

---

## 🎯 Quick Verification Checklist

- [ ] Google Sheets API enabled in Cloud Console
- [ ] Sheet shared with service account email (Editor permissions)
- [ ] Environment variables configured in `.env`
- [ ] Environment deployed to Lambda: `make deploy-env`
- [ ] Code deployed to Lambda: `make deploy-lambda-fast`
- [ ] Test script runs successfully: `node test-sheets-init.js`
- [ ] Made a test request through UI
- [ ] Checked CloudWatch logs: `make logs`
- [ ] Verified row appeared in Google Sheet

---

## 🔗 Quick Links

- **Enable API:** https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=927667106833
- **Your Sheet:** https://docs.google.com/spreadsheets/d/1i0wNrPjMh21-1TIsAUZbYwV_c30A4-g39m4rJ-zr9Fw/edit
- **Cloud Console:** https://console.cloud.google.com/apis/dashboard?project=927667106833
- **Service Account:** https://console.cloud.google.com/iam-admin/serviceaccounts?project=927667106833

---

## 📞 Support

If logging still doesn't work after completing all steps:

1. Run: `node test-sheets-init.js > debug.txt 2>&1`
2. Run: `make logs > logs.txt`
3. Check both files for error messages
4. Verify all checklist items above

The most common issue is forgetting to enable the API or share the sheet!
