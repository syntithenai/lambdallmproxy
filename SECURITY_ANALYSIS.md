# Security Analysis: JWT Authentication Implementation

## Current Implementation Analysis

### ⚠️ CRITICAL SECURITY VULNERABILITY FOUND

**Your current implementation has a MAJOR security flaw**: The JWT token signature is **NOT being verified**.

### Current Flow

1. **Frontend**: User signs in with Google OAuth
   - Uses official Google Identity Services library
   - Receives a JWT token from Google
   - Token is stored in localStorage and sent to backend

2. **Backend**: Token verification in `src/auth.js`
   ```javascript
   // ⚠️ SECURITY ISSUE: Only decodes, does NOT verify signature
   const base64Url = token.split('.')[1];
   const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
   const jsonPayload = decodeURIComponent(
       Buffer.from(base64, 'base64')...
   );
   const payload = JSON.parse(jsonPayload);
   ```

### 🚨 Why This Is Vulnerable

**YES, a user email CAN BE SPOOFED** with your current implementation because:

1. **No Signature Verification**: Anyone can create a fake JWT token with any email
2. **Easy to Forge**: An attacker can:
   ```javascript
   // Create fake payload
   const fakePayload = {
       email: "admin@yourdomain.com",
       name: "Fake Admin",
       exp: Math.floor(Date.now() / 1000) + 3600
   };
   
   // Base64 encode it
   const fakeToken = "header." + btoa(JSON.stringify(fakePayload)) + ".fakesignature";
   
   // Your backend will accept it! ⚠️
   ```

3. **Bypass Authentication**: Attacker can impersonate ANY email in your `ALLOWED_EMAILS` list

### Attack Scenario

```bash
# Attacker creates fake token
curl -X POST https://your-lambda.amazonaws.com/search \
  -H "Authorization: Bearer eyJhbGci.FAKE_PAYLOAD.FAKE_SIGNATURE" \
  -d '{"query": "sensitive data"}'

# Your backend decodes it without verification
# If the fake payload has email in ALLOWED_EMAILS, it succeeds! 🚨
```

## 🔒 Secure Solution: Verify JWT Signatures

### Option 1: Use Google's Official Verification (RECOMMENDED)

Install the official Google Auth Library:

```bash
npm install google-auth-library
```

**Secure Implementation**:

```javascript
const { OAuth2Client } = require('google-auth-library');

async function verifyGoogleToken(token) {
    try {
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        
        // ✅ SECURE: Verifies signature against Google's public keys
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        
        // Check if token is expired (already checked by verifyIdToken)
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            console.log(`Token expired`);
            return null;
        }
        
        // Check email whitelist
        const allowed = getAllowedEmails();
        if (!allowed.includes(payload.email)) {
            console.log(`Email not allowed: ${payload.email}`);
            return null;
        }
        
        // ✅ Token is cryptographically verified
        return {
            email: payload.email,
            name: payload.name,
            picture: payload.picture
        };
        
    } catch (error) {
        console.error('Token verification failed:', error.message);
        return null;
    }
}
```

### Option 2: Manual Signature Verification with jsonwebtoken

```bash
npm install jsonwebtoken jwks-rsa
```

```javascript
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    cache: true,
    cacheMaxAge: 86400000 // 24 hours
});

function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            callback(err);
            return;
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

async function verifyGoogleToken(token) {
    return new Promise((resolve, reject) => {
        jwt.verify(token, getKey, {
            audience: process.env.GOOGLE_CLIENT_ID,
            issuer: ['https://accounts.google.com', 'accounts.google.com']
        }, (err, decoded) => {
            if (err) {
                console.error('Token verification failed:', err.message);
                resolve(null);
                return;
            }
            
            // Check email whitelist
            const allowed = getAllowedEmails();
            if (!allowed.includes(decoded.email)) {
                console.log(`Email not allowed: ${decoded.email}`);
                resolve(null);
                return;
            }
            
            resolve({
                email: decoded.email,
                name: decoded.name,
                picture: decoded.picture
            });
        });
    });
}
```

## 📋 Security Checklist

### Current Status

- ✅ **Frontend**: Uses official Google Identity Services (secure)
- ✅ **Token Transmission**: Sent via Authorization header (secure)
- ✅ **Email Whitelist**: Checked against `ALLOWED_EMAILS` (good)
- ✅ **Expiration Check**: Token expiration validated (good)
- ❌ **Signature Verification**: **NOT IMPLEMENTED** (CRITICAL VULNERABILITY)
- ❌ **Issuer Validation**: Not checking if token is from Google
- ❌ **Audience Validation**: Not checking if token is for your app

### After Implementing Secure Verification

- ✅ **Signature Verification**: Cryptographically verified against Google's public keys
- ✅ **Issuer Validation**: Ensures token is from accounts.google.com
- ✅ **Audience Validation**: Ensures token is for your GOOGLE_CLIENT_ID
- ✅ **Expiration**: Already checked in the verification process
- ✅ **Email Spoofing**: **IMPOSSIBLE** - attacker cannot forge valid signature

## 🎯 Recommended Action Plan

### Immediate (CRITICAL)

1. **Install google-auth-library**:
   ```bash
   cd /home/stever/projects/lambdallmproxy
   npm install google-auth-library --save
   ```

2. **Update src/auth.js** with secure verification

3. **Deploy immediately** to fix vulnerability

### Testing

```bash
# Test with valid token (should work)
curl -X POST https://your-lambda.amazonaws.com/search \
  -H "Authorization: Bearer REAL_GOOGLE_JWT_TOKEN" \
  -d '{"query": "test"}'

# Test with fake token (should fail with 401)
curl -X POST https://your-lambda.amazonaws.com/search \
  -H "Authorization: Bearer eyJhbGci.FAKE.FAKE" \
  -d '{"query": "test"}'
```

## 🔐 Additional Security Recommendations

### 1. Add Rate Limiting Per User
```javascript
// Track requests per email
const requestCounts = new Map();

function checkRateLimit(email) {
    const now = Date.now();
    const userRequests = requestCounts.get(email) || [];
    
    // Filter requests from last minute
    const recentRequests = userRequests.filter(t => now - t < 60000);
    
    if (recentRequests.length >= 60) { // 60 per minute
        return false;
    }
    
    recentRequests.push(now);
    requestCounts.set(email, recentRequests);
    return true;
}
```

### 2. Log Authentication Attempts
```javascript
console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'auth_attempt',
    email: payload.email,
    ip: event.requestContext?.http?.sourceIp,
    success: true
}));
```

### 3. Use HTTPS Only (Already Implemented)
- ✅ Lambda Function URLs use HTTPS by default

### 4. Implement Token Refresh
Frontend should refresh tokens before expiration:
```javascript
// Check token expiration
const payload = parseJwt(token);
const timeUntilExpiry = payload.exp - Math.floor(Date.now() / 1000);

if (timeUntilExpiry < 300) { // Less than 5 minutes
    // Refresh token using Google's refresh flow
    google.accounts.id.revoke(token, () => {
        google.accounts.id.prompt(); // Re-authenticate
    });
}
```

### 5. Restrict CORS in Production
Current setting allows all origins:
```javascript
// Current (permissive)
'Access-Control-Allow-Origin': '*'

// Recommended for production
'Access-Control-Allow-Origin': 'https://yourdomain.com'
```

## 📊 Security Comparison

### Before Secure Implementation (CURRENT)

| Attack Vector | Vulnerable? | Severity |
|--------------|-------------|----------|
| Email Spoofing | ✅ YES | CRITICAL |
| Token Forgery | ✅ YES | CRITICAL |
| Replay Attack | ⚠️ Partial | HIGH |
| MitM Attack | ❌ No (HTTPS) | - |
| Brute Force | ⚠️ Possible | MEDIUM |

### After Secure Implementation (WITH SIGNATURE VERIFICATION)

| Attack Vector | Vulnerable? | Severity |
|--------------|-------------|----------|
| Email Spoofing | ❌ NO | - |
| Token Forgery | ❌ NO | - |
| Replay Attack | ⚠️ Limited* | LOW |
| MitM Attack | ❌ No (HTTPS) | - |
| Brute Force | ⚠️ Possible** | LOW |

\* Limited to token expiration window (typically 1 hour)  
** Can be mitigated with rate limiting

## 🚀 Quick Fix Implementation

I can implement the secure verification for you right now. Would you like me to:

1. Install `google-auth-library`
2. Update `src/auth.js` with secure verification
3. Add tests for the new verification
4. Update documentation

This will take about 5 minutes and will secure your authentication system.

## 📚 References

- [Google Identity: Verify JWT Tokens](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [OAuth2Client Documentation](https://github.com/googleapis/google-auth-library-nodejs)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)

---

**SUMMARY**: Your current implementation is vulnerable to email spoofing because JWT signatures are not verified. An attacker can forge tokens with any email. **Immediate action required**: Implement proper signature verification using `google-auth-library`.
