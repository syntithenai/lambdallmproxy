# Google OAuth2 App Publishing Requirements

**Date**: October 25, 2025  
**Status**: Currently using OAuth client from another project (testing mode)  
**Goal**: Publish app to remove 100-user limit and "unverified app" warning

---

## Current Situation

- **OAuth Client**: Reused from another project
- **Mode**: Testing/Development (max 100 users)
- **Warning**: Users see "This app isn't verified" screen
- **Scopes Requested**:
  - `https://www.googleapis.com/auth/userinfo.email` - Get user's email
  - `https://www.googleapis.com/auth/userinfo.profile` - Get user's name
  - `https://www.googleapis.com/auth/spreadsheets` - Read/write Google Sheets (for billing logs)

---

## Publishing Requirements (Google OAuth Verification)

### 1. **Create Dedicated OAuth Client**

**Don't reuse credentials from another project**. Create new OAuth 2.0 credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "LLM Proxy" or similar
3. Enable APIs:
   - Google+ API (for profile/email)
   - Google Sheets API
4. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized JavaScript origins: `https://syntithenai.github.io`
   - Authorized redirect URIs: `https://syntithenai.github.io/lambdallmproxy/`

### 2. **OAuth Consent Screen Configuration**

**User Type**: External (since you want public users)

**Required Fields**:
- App name: "Lambda LLM Proxy" (or your preferred name)
- User support email: Your email
- App logo: 120x120px PNG/JPG (professional looking)
- App domain: `syntithenai.github.io`
- Authorized domains: `syntithenai.github.io`
- Developer contact: Your email
- Privacy policy URL: `https://syntithenai.github.io/lambdallmproxy/privacy` (REQUIRED - see below)
- Terms of service URL: `https://syntithenai.github.io/lambdallmproxy/terms` (optional but recommended)

### 3. **Privacy Policy (REQUIRED)**

Google requires a publicly accessible privacy policy. Create `ui-new/public/privacy.html`:

**Minimum Content Required**:
```html
<!DOCTYPE html>
<html>
<head>
    <title>Privacy Policy - Lambda LLM Proxy</title>
</head>
<body>
    <h1>Privacy Policy</h1>
    <p>Last updated: October 25, 2025</p>
    
    <h2>Data We Collect</h2>
    <ul>
        <li>Google account email address (for authentication)</li>
        <li>Google account profile name (for display purposes)</li>
        <li>API usage data (stored in your personal Google Sheets)</li>
    </ul>
    
    <h2>How We Use Your Data</h2>
    <ul>
        <li>Email: To identify you and authorize API requests</li>
        <li>Profile: To display your name in the UI</li>
        <li>Google Sheets: To log your API usage and billing data (stored in YOUR Google Drive)</li>
    </ul>
    
    <h2>Data Storage</h2>
    <p>Your usage logs are stored in a Google Sheet in YOUR Google Drive account. We do not store your data on our servers beyond the OAuth token (stored in browser localStorage).</p>
    
    <h2>Data Sharing</h2>
    <p>We do not sell, trade, or share your personal data with third parties. Your Google Sheets data is only accessible to you.</p>
    
    <h2>Token Storage</h2>
    <p>Your Google OAuth token is stored in your browser's localStorage and is used only to authenticate requests to our API.</p>
    
    <h2>Contact</h2>
    <p>For questions about this privacy policy, contact: [YOUR EMAIL]</p>
</body>
</html>
```

### 4. **App Verification Submission**

Once consent screen is configured, submit for verification:

1. Go to OAuth consent screen
2. Click "Publish App"
3. Click "Prepare for Verification"
4. Fill out verification questionnaire:

**Questions You'll Answer**:
- **What does your app do?** "Provides a proxy API for multiple LLM providers with usage tracking via Google Sheets"
- **Why do you need these scopes?**
  - `userinfo.email`: "To identify users and authorize API requests"
  - `userinfo.profile`: "To display user's name in the UI"
  - `spreadsheets`: "To log API usage data to the user's own Google Sheets for billing transparency"
- **How do you use Google Sheets?** "We write API usage logs (timestamp, model, cost, tokens) to a Google Sheet that the user owns. This provides full transparency into their API usage and costs."

### 5. **Video Demonstration (REQUIRED)**

Google requires a **YouTube video** showing:

1. User signs in with Google
2. Consent screen showing requested permissions
3. User grants access
4. App creates/writes to Google Sheets
5. Show the data being written (timestamps, API calls, costs)

**Video Tips**:
- 1-3 minutes long
- Unlisted or public YouTube video
- Narration optional but helpful
- Show the OAuth flow clearly
- Demonstrate Google Sheets writing

### 6. **Homepage Link**

Provide a link to your app: `https://syntithenai.github.io/lambdallmproxy/`

Ensure the homepage clearly describes:
- What the app does
- Why it needs Google Sheets access
- How user data is used

---

## Verification Timeline

- **Submission to Review**: 1-2 weeks typically
- **Follow-up Questions**: Common, be responsive
- **Approval**: Can take 2-4 weeks total

---

## Alternative: Keep Testing Mode

If you don't want to go through verification:

**Testing Mode Limitations**:
- Max 100 users
- Users see "unverified app" warning (can click "Advanced" → "Go to [App]")
- No functional limitations otherwise

**To Add Test Users**:
1. OAuth consent screen → Test users
2. Add email addresses (max 100)
3. Test users won't see verification warning

---

## Quick Action Items

**Immediate (to continue testing)**:
- ✅ Nothing - current OAuth client works for <100 users

**For Publishing (to remove 100-user limit)**:
1. ☐ Create dedicated Google Cloud project
2. ☐ Create new OAuth 2.0 credentials
3. ☐ Write privacy policy (`ui-new/public/privacy.html`)
4. ☐ Write terms of service (optional: `ui-new/public/terms.html`)
5. ☐ Deploy privacy policy: `make deploy-ui`
6. ☐ Configure OAuth consent screen with all required fields
7. ☐ Record demonstration video showing OAuth flow + Sheets writing
8. ☐ Upload video to YouTube (unlisted)
9. ☐ Submit for verification with video link
10. ☐ Respond to Google's follow-up questions (usually within 1-2 days)
11. ☐ Wait for approval (1-4 weeks)

---

## Scopes Justification (For Verification Form)

**`https://www.googleapis.com/auth/userinfo.email` (Sensitive)**
- **Justification**: "Required to identify users and authorize API requests. Email is used as the primary user identifier for billing and access control."
- **Alternatives Considered**: None - email is the standard OAuth identifier

**`https://www.googleapis.com/auth/userinfo.profile` (Sensitive)**
- **Justification**: "Used to display the user's name in the application UI for personalization."
- **Alternatives Considered**: Could be omitted, but degrades UX

**`https://www.googleapis.com/auth/spreadsheets` (Restricted)**
- **Justification**: "Required to provide transparent billing logs. The application writes API usage data (timestamp, model, tokens, cost) to a Google Sheet owned by the user. This ensures users have full visibility into their API usage and costs. We do not read or modify any other spreadsheets."
- **Alternatives Considered**: 
  - Database storage: Users prefer owning their own data
  - Read-only access: Insufficient - need to write logs
  - Limited scope: This is already the narrowest scope for Sheets writing

---

## References

- [Google OAuth Verification](https://support.google.com/cloud/answer/9110914)
- [OAuth Consent Screen Setup](https://support.google.com/cloud/answer/10311615)
- [Verification Best Practices](https://support.google.com/cloud/answer/9110914#verification-best-practices)
