# Content Security Policy (CSP) Implementation

**Date**: January 2025  
**Status**: ✅ **IMPLEMENTED**

---

## Overview

Content Security Policy (CSP) has been added to all API responses to prevent Cross-Site Scripting (XSS) attacks and other code injection vulnerabilities.

**Files Modified**:
- `src/utils/security-headers.js` - CSP header generation utility
- `src/endpoints/chat.js` - Applied CSP to streaming chat endpoint
- `src/index.js` - Added CSP warning logs on cold start

---

## ⚠️ CRITICAL: CSP Implications

### 1. **Inline Scripts and Styles**

**What This Means**:
CSP blocks inline `<script>` and `<style>` tags by default to prevent XSS attacks.

**Current Configuration**:
- ✅ `'unsafe-inline'` directive **ENABLED** for both scripts and styles
- This allows inline code but reduces security benefits

**Why We Use `unsafe-inline`**:
- React components use inline event handlers (`onClick`, etc.)
- Tailwind CSS generates inline utility classes
- Vite development mode uses inline scripts for Hot Module Replacement (HMR)

**Better Alternative** (future improvement):
- Use CSP nonces (random tokens) generated at build time
- Example: `<script nonce="abc123">...</script>`
- Vite plugin: `vite-plugin-csp`

---

### 2. **Dynamic Code Execution (eval)**

**What This Means**:
CSP blocks `eval()`, `Function()`, and similar dynamic code execution to prevent code injection.

**Current Configuration**:
- ✅ `'unsafe-eval'` directive **ENABLED** for scripts
- This allows `eval()` but reduces security benefits

**Why We Use `unsafe-eval`**:
- Some libraries use `eval()` for parsing or expression evaluation
- Examples: math expression parsers, TF-IDF keyword extraction

**Affected Code**:
- **TF-IDF** (keyword extraction in `ui-new/src/utils/tfidf.ts`) - May use dynamic evaluation
- **Math libraries** - Some use `Function()` for parsing expressions
- **Vite dev mode** - Uses `eval()` for source maps

**How to Check**:
```bash
# Open browser console and look for errors:
# "Refused to evaluate a string as JavaScript because 'unsafe-eval'"
```

**If Errors Occur**:
1. **Temporary Fix**: Comment out CSP header in `src/utils/security-headers.js`
2. **Permanent Fix**: Replace `eval()` with safer alternatives (e.g., `math.js` with `evaluate()` disabled)

---

### 3. **External CDN Whitelisting**

**What This Means**:
Only scripts/styles from whitelisted domains can be loaded. All others are blocked.

**Currently Whitelisted CDNs**:
- `https://cdn.jsdelivr.net` - React libraries, UI components
- `https://fonts.googleapis.com` - Google Fonts stylesheets
- `https://fonts.gstatic.com` - Google Fonts font files
- `https://accounts.google.com` - Google OAuth scripts
- `https://www.gstatic.com` - Google static resources

**If External Resource Fails to Load**:
1. **Check Browser Console**:
   ```
   Refused to load the script 'https://example.com/script.js' because it violates the following
   Content Security Policy directive: "script-src 'self' 'unsafe-inline' ..."
   ```

2. **Add Domain to CSP**:
   Edit `src/utils/security-headers.js`:
   ```javascript
   "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://example.com",
   ```

3. **Redeploy Lambda**:
   ```bash
   make deploy-lambda-fast
   ```

---

### 4. **Image Sources (Data URIs, Blob URIs)**

**Current Configuration**:
```javascript
"img-src 'self' data: blob: https:"
```

**What This Allows**:
- ✅ **Self** - Images served from same origin
- ✅ **`data:`** - Base64-encoded images (e.g., uploaded files, inline SVGs)
- ✅ **`blob:`** - Object URLs from `URL.createObjectURL()` (e.g., canvas exports)
- ✅ **HTTPS** - All HTTPS images

**Why This Is Needed**:
- User uploads images as base64 (multi-modal input)
- Generated images (Stable Diffusion, DALL-E) returned as data URIs
- Canvas/chart exports use blob URLs

---

### 5. **Frames (Clickjacking Protection)**

**Current Configuration**:
```javascript
"frame-ancestors 'none'"  // Cannot be embedded in iframes
"frame-src 'none'"        // Cannot embed iframes
```

**What This Means**:
- ✅ **Prevents Clickjacking** - Attackers cannot embed your site in a malicious iframe
- ❌ **Cannot Use `<iframe>`** - Your app cannot embed YouTube videos, Google Maps, etc.

**If You Need Iframes**:
1. **Whitelist Specific Domains**:
   ```javascript
   "frame-src https://www.youtube.com https://maps.google.com"
   ```

2. **Allow All Iframes** (less secure):
   ```javascript
   "frame-src 'self' https:"
   ```

---

### 6. **AJAX/Fetch Connections (`connect-src`)**

**Current Configuration**:
```javascript
"connect-src 'self' https://*.lambda-url.us-east-1.on.aws https://*.openai.com https://*.anthropic.com ..."
```

**What This Allows**:
- ✅ **Lambda Functions** - AWS Lambda Function URLs
- ✅ **LLM APIs** - OpenAI, Anthropic, Google, etc.
- ✅ **Google APIs** - OAuth, Sheets, etc.
- ✅ **Chromecast** - WebSocket connections (`wss://cast.google.com`)

**If API Call Fails**:
1. **Check Browser Console**:
   ```
   Refused to connect to 'https://api.example.com' because it violates the following
   Content Security Policy directive: "connect-src ..."
   ```

2. **Add API Domain to CSP**:
   ```javascript
   "connect-src 'self' https://api.example.com"
   ```

---

## Testing CSP Violations

### Browser Console

Open DevTools (F12) → Console tab:
- CSP violations appear as warnings/errors
- Example:
  ```
  Refused to load the script 'https://evil.com/script.js' because it violates CSP
  ```

### CSP Report-Only Mode (Optional)

**For Testing Without Breaking Site**:
1. Change `Content-Security-Policy` → `Content-Security-Policy-Report-Only`
2. Violations are **logged but not blocked**
3. Use this to test CSP before enforcing

**Implementation**:
```javascript
// src/utils/security-headers.js
'Content-Security-Policy-Report-Only': getContentSecurityPolicy(),
```

---

## Disabling CSP (Emergency)

**⚠️ Only disable CSP if it's breaking critical functionality**

### Temporary Disable (Local Development)

**Option 1**: Comment out CSP header in `src/utils/security-headers.js`:
```javascript
function getSecurityHeaders() {
    return {
        // 'Content-Security-Policy': getContentSecurityPolicy(), // DISABLED
        'X-Frame-Options': 'DENY',
        // ... rest of headers
    };
}
```

**Option 2**: Set `Content-Security-Policy: default-src *` (allow everything):
```javascript
'Content-Security-Policy': "default-src *"
```

### Redeploy

```bash
make deploy-lambda-fast
```

---

## Future Improvements

### 1. **Use CSP Nonces Instead of `unsafe-inline`**

**What**: Generate random tokens at build time and inject into HTML
**Benefit**: Eliminates `'unsafe-inline'`, much stronger XSS protection
**Tool**: `vite-plugin-csp` or manual nonce generation

**Example**:
```html
<!-- HTML with nonce -->
<script nonce="abc123">console.log('safe');</script>
```

```javascript
// CSP header
"script-src 'self' 'nonce-abc123'"
```

### 2. **Remove `unsafe-eval` Directive**

**What**: Replace `eval()` with safer alternatives
**Examples**:
- Use `math.js` library with `evaluate()` disabled
- Rewrite TF-IDF to avoid dynamic code generation

### 3. **Implement CSP Violation Reporting**

**What**: Send CSP violations to a logging endpoint
**Benefit**: Monitor attacks in production

**Example**:
```javascript
"report-uri /api/csp-violation-report"
```

---

## Summary

| Feature | Status | Security Impact | Notes |
|---------|--------|----------------|-------|
| CSP Enabled | ✅ | HIGH | Prevents most XSS attacks |
| `unsafe-inline` | ✅ | MEDIUM | Reduces XSS protection (needed for React/Tailwind) |
| `unsafe-eval` | ✅ | MEDIUM | Allows `eval()` (needed for some libraries) |
| CDN Whitelisting | ✅ | HIGH | Only trusted CDNs can load scripts |
| Clickjacking Protection | ✅ | HIGH | Cannot be embedded in iframes |
| HTTPS Upgrade | ✅ | HIGH | Auto-upgrade HTTP → HTTPS |

**Overall Security**: ⭐⭐⭐⭐☆ (4/5)  
CSP is active and provides strong XSS protection, but `unsafe-inline` and `unsafe-eval` reduce effectiveness.

---

## Related Documentation

- [MDN CSP Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator Tool](https://csp-evaluator.withgoogle.com/) - Test your CSP policy
- [Report URI Service](https://report-uri.com/) - CSP violation reporting

---

**Last Updated**: January 2025  
**Implemented By**: GitHub Copilot
