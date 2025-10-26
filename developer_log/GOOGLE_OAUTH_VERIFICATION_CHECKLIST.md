# Google OAuth Verification Checklist

**Date**: October 26, 2025  
**Purpose**: Complete Google OAuth verification to remove 100-user limit and "unverified app" warning

---

## ✅ Completed Requirements

### 1. Privacy Policy Page ✅
- **Location**: `https://syntithenai.github.io/lambdallmproxy/privacy.html`
- **Status**: Deployed and accessible
- **Content Includes**:
  - ✅ Data collection disclosure (email, profile, Drive access)
  - ✅ How data is used (authentication, settings sync, billing logs)
  - ✅ Data storage locations (browser, user's Google Drive)
  - ✅ Google Limited Use compliance
  - ✅ No data sharing/selling commitment
  - ✅ Contact email: syntithenai@gmail.com
  - ✅ Links to third-party provider privacy policies (OpenAI, Groq, etc.)

### 2. Homepage ✅
- **URL**: `https://syntithenai.github.io/lambdallmproxy/`
- **Content**:
  - ✅ App description and functionality
  - ✅ Link to privacy policy in footer (green lock icon)
  - ✅ Link to privacy policy in Help page → Privacy Policy tab
  - ✅ Contact information

### 3. Minimum Scopes ✅
- **Scopes Used**:
  - `https://www.googleapis.com/auth/userinfo.email` (Sensitive)
  - `https://www.googleapis.com/auth/userinfo.profile` (Sensitive)
  - `https://www.googleapis.com/auth/drive.file` (Sensitive - most restrictive Drive scope)
- **Justification**: Using `drive.file` instead of broader `drive` or `spreadsheets` scopes

### 4. Google Branding ✅
- **Sign-In Button**: Using official Google Sign-In component
- **Compliant**: Follows Google Identity branding guidelines

### 5. Contact Information ✅
- **Email**: syntithenai@gmail.com
- **GitHub**: https://github.com/syntithenai/lambdallmproxy/issues
- **Listed**: In privacy policy and Help page

---

## ❌ Pending Requirements

### 1. Domain Ownership Verification ⚠️ CRITICAL
**Action Required**: Verify `syntithenai.github.io` in Google Search Console

**Steps**:
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Click "Add Property"
3. Enter: `https://syntithenai.github.io/lambdallmproxy/`
4. Choose verification method:
   - **HTML File** (easiest for GitHub Pages):
     - Download verification file (e.g., `google1234567890abcdef.html`)
     - Place in `ui-new/public/`
     - Run `make deploy-ui`
     - Click "Verify" in Search Console
   - **DNS TXT Record** (alternative):
     - Add TXT record to GitHub Pages DNS (requires custom domain)
5. Ensure verification account is same as GCP project owner/editor

**Status**: ⏳ NOT STARTED

---

### 2. OAuth Consent Screen Configuration ⚠️ CRITICAL
**Action Required**: Update OAuth consent screen in Google Cloud Console

**Location**: [GCP Console → APIs & Credentials → OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)

**Required Fields**:
- ✅ **App name**: Lambda LLM Proxy
- ✅ **User support email**: syntithenai@gmail.com
- ✅ **App logo**: (Optional but recommended - upload 120x120 PNG)
- ⚠️ **Application homepage**: `https://syntithenai.github.io/lambdallmproxy/`
- ⚠️ **Privacy policy link**: `https://syntithenai.github.io/lambdallmproxy/privacy.html`
- ⚠️ **Terms of service** (Optional): `https://syntithenai.github.io/lambdallmproxy/terms.html`
- ⚠️ **Authorized domains**: `syntithenai.github.io` (must be verified in Search Console first)
- ✅ **Developer contact emails**: syntithenai@gmail.com
- ✅ **Scopes**: 
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
  - `https://www.googleapis.com/auth/drive.file`

**Status**: ⏳ NEEDS UPDATE (add privacy policy URL and verify domain)

---

### 3. Demonstration Video ⚠️ CRITICAL
**Action Required**: Create and upload video showing OAuth flow and scope usage

**Must Show** (in order):
1. **Homepage** (`https://syntithenai.github.io/lambdallmproxy/`)
   - Show app description and functionality
2. **Click "Sign in with Google"**
   - Show the login button being clicked
3. **Full OAuth Consent Screen** (MUST BE IN ENGLISH)
   - Show app name
   - Show all 3 scopes with their descriptions:
     - "See your primary Google Account email address"
     - "See your personal info, including any personal info you've made publicly available"
     - "See and manage Google Drive files and folders that you have opened or created with this app"
   - Show user granting permission
4. **App Functionality**
   - Show chat interface
   - Navigate to Settings → Billing
   - Show Google Sheets integration
   - Create a Google Sheet in user's Drive
   - Show billing data being written to the sheet
5. **Demonstrate Limited Access**
   - Show that ONLY app-created files are accessible
   - Show that no existing Drive files are accessed

**Recording Tools**:
- OBS Studio (Free, open source)
- Loom (Easy, browser-based)
- QuickTime (Mac)
- Windows Game Bar (Windows)

**Requirements**:
- ✅ Show complete OAuth flow start to finish
- ✅ Consent screen in English
- ✅ Show exact scopes as they appear to users
- ✅ Demonstrate how each scope is used
- ✅ Upload to YouTube (unlisted or public)
- ✅ Duration: 2-5 minutes recommended

**Upload**: YouTube (unlisted)

**Status**: ⏳ NOT STARTED

---

### 4. Scope Justification ⚠️ CRITICAL
**Action Required**: Prepare written justification for OAuth verification form

**Template**:
```
Our app uses the following Google API scopes:

1. https://www.googleapis.com/auth/userinfo.email
   - PURPOSE: User authentication and identification
   - USAGE: Verify user identity for API requests to our Lambda backend
   
2. https://www.googleapis.com/auth/userinfo.profile
   - PURPOSE: Display user's name in the interface
   - USAGE: Show personalized greeting and user profile information
   
3. https://www.googleapis.com/auth/drive.file
   - PURPOSE: Transparent billing and settings sync
   - USAGE: 
     - Create Google Sheets in user's Drive to log API usage and costs
     - Sync user settings (API keys, preferences) to JSON file in user's Drive
     - This allows users to own and control their billing data
   - WHY NOT BROADER SCOPES: We specifically chose drive.file (instead of 
     drive or spreadsheets) because we only need access to files our app 
     creates, not the user's existing Drive files. This minimizes permissions 
     and respects user privacy.

All scopes are used solely for user-facing features that add identifiable 
value (billing transparency, cross-device settings sync). We do NOT:
- Transfer data to third parties
- Sell user data
- Use data for advertising
- Access any Drive files not created by our app
```

**Status**: ✅ READY (template above)

---

## 📋 Verification Submission Checklist

Once all pending items are complete, submit for verification:

**Pre-Submission**:
- [ ] Domain verified in Google Search Console
- [ ] OAuth consent screen updated with privacy policy URL
- [ ] Demonstration video uploaded to YouTube
- [ ] Scope justification prepared

**Submission Steps**:
1. Go to [GCP Console → OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Click "Publish App" or "Submit for Verification"
3. Fill out verification form:
   - [ ] App information (already configured)
   - [ ] Privacy policy URL: `https://syntithenai.github.io/lambdallmproxy/privacy.html`
   - [ ] YouTube demo video URL
   - [ ] Scope justifications (copy template above)
   - [ ] Additional information (explain app purpose)
4. Submit and wait for Google review (typically 3-7 business days)

---

## 🔍 Post-Submission

**Expected Review Time**: 3-7 business days

**Possible Outcomes**:
1. ✅ **Approved**: 100-user limit removed, no more "unverified app" warning
2. ⚠️ **Needs Clarification**: Google asks questions, respond promptly
3. ❌ **Rejected**: Review feedback, make changes, resubmit

**Communication**: Google will email syntithenai@gmail.com with updates

---

## 📝 Notes

### Why `drive.file` is Sufficient

We chose the most restrictive Drive scope (`drive.file`) because:
- ✅ Only accesses files created by our app
- ✅ Cannot access user's existing spreadsheets/documents
- ✅ Minimizes privacy concerns
- ✅ Easier to get verified (less scrutiny than broader scopes)

### Security Assessment

**NOT REQUIRED** for our use case because:
- `drive.file` is "Sensitive" not "Restricted"
- Security assessment only required for "Restricted" scopes
- Saves time and cost

### Limited Use Policy Compliance

Our app complies with Google's Limited Use requirements:
- ✅ Data used only for user-facing features (billing logs, settings sync)
- ✅ No data transfers to third parties (except LLM providers for chat)
- ✅ No selling of user data
- ✅ No use for advertising or retargeting
- ✅ Human access only for debugging with user permission

---

## 🚀 Next Steps

**Immediate** (Today):
1. ⏳ Verify domain in Google Search Console
2. ⏳ Update OAuth consent screen with privacy policy URL

**This Week**:
3. ⏳ Record demonstration video
4. ⏳ Upload video to YouTube (unlisted)
5. ⏳ Submit verification request

**Follow-Up**:
6. ⏳ Monitor email for Google's response
7. ⏳ Respond to any questions promptly
8. ⏳ Celebrate when approved! 🎉

---

## 📧 Contact for Questions

- **Developer**: syntithenai@gmail.com
- **GitHub Issues**: https://github.com/syntithenai/lambdallmproxy/issues
- **Google Support**: [OAuth Verification Support](https://support.google.com/cloud/contact/oauth_app_verification)
