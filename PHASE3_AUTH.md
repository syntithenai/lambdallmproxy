# Phase 3: Authentication & Authorization Enhancement

## Objective
Enforce Google OAuth for all API requests, implement email whitelist checking, merge user and environment credentials, and create a credential pooling system for intelligent load balancing.

## Current State Analysis

### Existing Authentication
**File**: `src/auth.js`
```javascript
// Current implementation:
// - verifyGoogleToken(token) - Validates Google OAuth JWT
// - Checks if token is valid and extracts email
// - No email whitelist checking
// - No credential merging
```

### Current Authorization Flow
1. Frontend sends `Authorization: Bearer <google-token>` header
2. Lambda validates token using Google's public keys
3. If valid, request proceeds
4. No distinction between authenticated vs authorized users

### Issues with Current System
1. **No Whitelisting**: Any Google user can access the service
2. **No Credential Pooling**: User credentials separate from env credentials
3. **Inconsistent Enforcement**: Some endpoints may not require auth
4. **No Rate Limiting by User**: Can't track usage per user

## New Authentication Architecture

### Two-Tier Authorization Model

#### Tier 1: Public Users (Google Authenticated)
- **Access**: Basic features only
- **Credentials**: Must provide their own API keys for all providers
- **Search**: DuckDuckGo only (free)
- **Tools**: Web scraping, code execution (serverless)
- **Rate Limits**: Based on their own provider keys

#### Tier 2: Authorized Users (Whitelisted)
- **Access**: All features including shared credentials
- **Credentials**: Can use environment variable credentials + their own
- **Search**: DuckDuckGo + Tavily (if env key configured)
- **Tools**: All tools including transcription
- **Rate Limits**: Pooled across user + environment credentials

### Environment Variables Structure

#### Current
```bash
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
```

#### New (Backward Compatible)
```bash
# User whitelist (comma-separated emails)
AUTHORIZED_USERS=alice@example.com,bob@example.com,admin@company.com

# Existing provider keys (for backward compatibility)
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...

# Additional provider keys (indexed)
OPENAI_COMPATIBLE_LLM_KEY_0=sk-together-xyz-123
OPENAI_COMPATIBLE_LLM_URL_0=https://api.together.xyz/v1
OPENAI_COMPATIBLE_LLM_NAME_0=Together AI

OPENAI_COMPATIBLE_LLM_KEY_1=sk-anyscale-456
OPENAI_COMPATIBLE_LLM_URL_1=https://api.endpoints.anyscale.com/v1
OPENAI_COMPATIBLE_LLM_NAME_1=Anyscale

# Gemini keys
GEMINI_API_KEY_FREE=AIza...
GEMINI_API_KEY_PAID=AIza...

# Cohere keys
COHERE_API_KEY_FREE=co...
COHERE_API_KEY_PAID=co...

# Mistral keys
MISTRAL_API_KEY=sk-...

# Search keys
TAVILY_API_KEY=tvly-...
```

## Implementation

### 1. Enhanced Auth Module

**File**: `src/auth.js` (modifications)

```javascript
/**
 * Enhanced authentication and authorization module
 */

const { verifyGoogleToken } = require('./existing-auth'); // Keep existing

/**
 * Check if email is in authorized users list
 * @param {string} email - User email from verified token
 * @returns {boolean} - True if authorized
 */
function isAuthorizedUser(email) {
    const authorizedUsers = process.env.AUTHORIZED_USERS || '';
    const emailList = authorizedUsers
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(e => e.length > 0);
    
    return emailList.includes(email.toLowerCase());
}

/**
 * Authenticate and authorize request
 * @param {Object} event - Lambda event
 * @returns {Object} - {authenticated, authorized, email, error}
 */
async function authenticateRequest(event) {
    // Extract token
    const authHeader = event.headers.authorization || event.headers.Authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            authenticated: false,
            authorized: false,
            email: null,
            error: 'Missing or invalid authorization header. Google OAuth required.'
        };
    }

    const token = authHeader.substring(7);
    
    // Verify Google token
    try {
        const decodedToken = await verifyGoogleToken(token);
        
        if (!decodedToken || !decodedToken.email) {
            return {
                authenticated: false,
                authorized: false,
                email: null,
                error: 'Invalid or expired Google OAuth token'
            };
        }

        const email = decodedToken.email;
        const authorized = isAuthorizedUser(email);

        return {
            authenticated: true,
            authorized,
            email,
            error: null
        };
    } catch (error) {
        return {
            authenticated: false,
            authorized: false,
            email: null,
            error: `Token verification failed: ${error.message}`
        };
    }
}

module.exports = {
    authenticateRequest,
    isAuthorizedUser,
    verifyGoogleToken // Re-export for backward compatibility
};
```

### 2. Credential Pool Manager

**New File**: `src/credential-pool.js`

```javascript
/**
 * Credential pooling system
 * Merges user-provided credentials with environment credentials for authorized users
 */

/**
 * Load environment provider credentials
 * @returns {Array<ProviderConfig>} - Array of provider configs from env vars
 */
function loadEnvironmentProviders() {
    const providers = [];

    // Legacy Groq key
    if (process.env.GROQ_API_KEY) {
        providers.push({
            id: 'env-groq',
            source: 'environment',
            type: 'groq',
            apiKey: process.env.GROQ_API_KEY,
            freeTier: true,
            priority: 100 // Lower priority than user keys
        });
    }

    // Legacy OpenAI key
    if (process.env.OPENAI_API_KEY) {
        providers.push({
            id: 'env-openai',
            source: 'environment',
            type: 'openai',
            apiKey: process.env.OPENAI_API_KEY,
            freeTier: false,
            priority: 100
        });
    }

    // Gemini keys
    if (process.env.GEMINI_API_KEY_FREE) {
        providers.push({
            id: 'env-gemini-free',
            source: 'environment',
            type: 'gemini-free',
            apiKey: process.env.GEMINI_API_KEY_FREE,
            freeTier: true,
            priority: 50 // Higher priority for free tier
        });
    }

    if (process.env.GEMINI_API_KEY_PAID) {
        providers.push({
            id: 'env-gemini-paid',
            source: 'environment',
            type: 'gemini',
            apiKey: process.env.GEMINI_API_KEY_PAID,
            freeTier: false,
            priority: 100
        });
    }

    // Cohere keys
    if (process.env.COHERE_API_KEY_FREE) {
        providers.push({
            id: 'env-cohere-free',
            source: 'environment',
            type: 'cohere-free',
            apiKey: process.env.COHERE_API_KEY_FREE,
            freeTier: true,
            priority: 50
        });
    }

    if (process.env.COHERE_API_KEY_PAID) {
        providers.push({
            id: 'env-cohere-paid',
            source: 'environment',
            type: 'cohere',
            apiKey: process.env.COHERE_API_KEY_PAID,
            freeTier: false,
            priority: 100
        });
    }

    // Mistral key
    if (process.env.MISTRAL_API_KEY) {
        providers.push({
            id: 'env-mistral',
            source: 'environment',
            type: 'mistral',
            apiKey: process.env.MISTRAL_API_KEY,
            freeTier: false,
            priority: 100
        });
    }

    // OpenAI-compatible providers (indexed)
    let index = 0;
    while (process.env[`OPENAI_COMPATIBLE_LLM_KEY_${index}`]) {
        const key = process.env[`OPENAI_COMPATIBLE_LLM_KEY_${index}`];
        const url = process.env[`OPENAI_COMPATIBLE_LLM_URL_${index}`];
        const name = process.env[`OPENAI_COMPATIBLE_LLM_NAME_${index}`] || `Custom Provider ${index}`;

        if (key && url) {
            providers.push({
                id: `env-custom-${index}`,
                source: 'environment',
                type: 'openai-compatible',
                name,
                apiKey: key,
                endpoint: url,
                freeTier: false,
                priority: 100
            });
        }

        index++;
    }

    return providers;
}

/**
 * Merge user providers with environment providers for authorized users
 * @param {Array<ProviderConfig>} userProviders - Providers from request
 * @param {boolean} isAuthorized - Whether user is authorized
 * @returns {Array<ProviderConfig>} - Merged provider pool
 */
function buildProviderPool(userProviders, isAuthorized) {
    // Always include user providers
    const pool = [...userProviders];

    // Add environment providers only for authorized users
    if (isAuthorized) {
        const envProviders = loadEnvironmentProviders();
        pool.push(...envProviders);
    }

    // Sort by priority (lower number = higher priority)
    // Free tier providers are already given lower priority values
    pool.sort((a, b) => {
        // Free tier first
        if (a.freeTier && !b.freeTier) return -1;
        if (!a.freeTier && b.freeTier) return 1;
        
        // Then by priority
        return (a.priority || 100) - (b.priority || 100);
    });

    return pool;
}

module.exports = {
    loadEnvironmentProviders,
    buildProviderPool
};
```

### 3. Request Handler Updates

**File**: `src/index.js` (modifications)

```javascript
// Add at top
const { authenticateRequest } = require('./auth');
const { buildProviderPool } = require('./credential-pool');

// In handler, before routing to endpoints:
async function handler(event, responseStream) {
    try {
        // Authenticate all requests
        const authResult = await authenticateRequest(event);
        
        if (!authResult.authenticated) {
            // Return auth error via streaming response
            const metadata = {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: authResult.error,
                requiresAuth: true
            }));
            responseStream.end();
            return;
        }

        // Extract user providers from request body
        let userProviders = [];
        try {
            const body = JSON.parse(event.body || '{}');
            userProviders = body.providers || [];
        } catch (e) {
            console.warn('Failed to parse providers from request body');
        }

        // Build provider pool (merges with env credentials if authorized)
        const providerPool = buildProviderPool(userProviders, authResult.authorized);

        // Attach to event for use by endpoints
        event.auth = authResult;
        event.providerPool = providerPool;

        // Continue with existing routing...
        
    } catch (error) {
        // Error handling...
    }
}
```

## Side Effects Analysis

### Breaking Changes
1. **All requests require Google OAuth**: Programmatic API access needs token
2. **Unauthenticated requests will fail**: Must update error handling in UI
3. **Settings without providers will fail**: Need at least one provider configured

### Security Implications
1. **API keys in requests**: Must ensure HTTPS and no logging of keys
2. **Email whitelist in env**: Sensitive data, must be managed carefully
3. **Credential pooling**: Environment keys used by all authorized users

### Performance Impact
1. **Auth check overhead**: ~50-100ms per request for token verification
2. **Provider pool building**: Minimal (<10ms)
3. **No persistent state**: Rebuilds pool on each request (acceptable for Lambda)

### User Experience
1. **Must authenticate**: Could be friction for new users
2. **Authorized users benefit**: Access to more providers
3. **Clear tier distinction**: Need UI to communicate benefits

## Error Handling

### Authentication Errors
```javascript
// 401 Unauthorized - Missing/invalid token
{
  "error": "Missing or invalid authorization header. Google OAuth required.",
  "requiresAuth": true,
  "statusCode": 401
}

// 401 Unauthorized - Expired token
{
  "error": "Invalid or expired Google OAuth token",
  "requiresAuth": true,
  "statusCode": 401
}
```

### Authorization Errors (for restricted features)
```javascript
// 403 Forbidden - Feature requires whitelist
{
  "error": "This feature requires authorized user access. Contact administrator.",
  "requiresAuthorization": true,
  "statusCode": 403
}
```

## Frontend Changes Required

### ChatTab.tsx Updates
```typescript
// Check auth before sending request
const sendMessage = async () => {
    if (!accessToken) {
        setError('Please sign in with Google to continue');
        return;
    }

    try {
        // Include providers in request
        const request = {
            modelSuggestion: getModelSuggestion(messageType),
            providers: settings.providers,
            messages: conversationHistory,
            stream: true
        };

        // Send request...
    } catch (error) {
        if (error.statusCode === 401) {
            // Token expired, trigger re-auth
            handleAuthExpired();
        }
    }
};
```

### Error Handling
```typescript
// Add to error handler
if (error.requiresAuth) {
    showAuthPrompt();
} else if (error.requiresAuthorization) {
    showUpgradePrompt(); // Explain whitelist access
}
```

## Testing Requirements

### Unit Tests
- `isAuthorizedUser()` with various email formats
- `loadEnvironmentProviders()` with different env var combinations
- `buildProviderPool()` with user + env providers
- Token validation edge cases

### Integration Tests
- Request with valid token (authorized user)
- Request with valid token (non-authorized user)
- Request with expired token
- Request without token
- Provider pool building with env vars

### Security Tests
- API keys not logged in CloudWatch
- Credentials not exposed in error messages
- Email injection attempts in whitelist

## Migration Strategy

### Phase 1: Soft Enforcement
1. Check auth but don't block requests
2. Log authentication status
3. Identify usage patterns

### Phase 2: Warnings
1. Return warning header for unauthenticated requests
2. UI shows banner: "Authentication will be required soon"
3. Grace period: 2 weeks

### Phase 3: Hard Enforcement
1. Block unauthenticated requests
2. Clear error messages
3. UI forces authentication

## Implementation Checklist

- [ ] Update `src/auth.js` with authorization logic
- [ ] Create `src/credential-pool.js`
- [ ] Update `src/index.js` request handler
- [ ] Add error response for auth failures
- [ ] Update frontend error handling
- [ ] Add auth status to UI
- [ ] Create migration guide for users
- [ ] Add unit tests for auth logic
- [ ] Add integration tests for auth flow
- [ ] Update API documentation
- [ ] Add monitoring for auth failures

## Next Phase Dependencies

Phase 4 (Provider Integration) requires:
- Provider pool structure from credential-pool.js
- Understanding of which credentials are available

Phase 5 (Model Selection) requires:
- Provider pool to select from
- Auth status to determine available providers
