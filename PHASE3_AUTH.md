# Phase 3: Authentication & Authorization Enhancement

## Objective
Enforce Google OAuth for all API requests, implement email whitelist checking, merge user and environment credentials, and **block unauthorized users from UI until they provide their own provider settings**.

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
3. **No UI Blocking**: Unauthorized users can see chat interface without provider settings
4. **Inconsistent Enforcement**: Some endpoints may not require auth

## New Authentication Architecture

### Two-Tier Authorization Model

#### Tier 1: Unauthorized Users (Google Authenticated, Not Whitelisted)
- **Initial State**: **BLOCKED FROM UI** - Cannot see or use chat interface
- **Access Gate**: Must configure at least one provider in settings before UI unlocks
- **UI Behavior**: Show provider setup screen (similar to login screen) that blocks all other UI
- **Credentials**: Must provide their own API keys for ALL providers
- **Search**: DuckDuckGo only (free, no API key required)
- **Tools**: Web scraping, code execution (serverless, no API key required)
- **Rate Limits**: Based ONLY on their own provider keys
- **No Environment Credentials**: Cannot access any environment variable credentials

#### Tier 2: Authorized Users (Whitelisted via VALID_USERS)
- **Initial State**: Full access to UI immediately after Google sign-in
- **Credentials**: Can use environment variable credentials + their own (merged pool)
- **Search**: DuckDuckGo + Tavily (if env key configured)
- **Tools**: All tools including transcription
- **Rate Limits**: Pooled across user + environment credentials
- **Optional User Credentials**: Can add their own providers for additional capacity

### Environment Variables Structure

```bash
# User whitelist (comma-separated emails) - REQUIRED
VALID_USERS=alice@example.com,bob@example.com,admin@company.com

# Provider data for authorized users (indexed 0, 1, 2, ...)
# Each provider needs: TYPE, KEY, (optional: ENDPOINT, MODEL_NAME for openai-compatible)

# Example: Groq Free Tier
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=gsk_...

# Example: OpenAI
LLAMDA_LLM_PROXY_PROVIDER_TYPE_1=openai
LLAMDA_LLM_PROXY_PROVIDER_KEY_1=sk-...

# Example: Gemini Free
LLAMDA_LLM_PROXY_PROVIDER_TYPE_2=gemini-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_2=AIza...

# Example: Together AI
LLAMDA_LLM_PROXY_PROVIDER_TYPE_3=together
LLAMDA_LLM_PROXY_PROVIDER_KEY_3=...

# Example: OpenAI Compatible (requires ENDPOINT and MODEL_NAME)
LLAMDA_LLM_PROXY_PROVIDER_TYPE_4=openai-compatible
LLAMDA_LLM_PROXY_PROVIDER_KEY_4=custom_key_...
LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_4=https://api.custom.com/v1
LLAMDA_LLM_PROXY_PROVIDER_MODEL_4=llama-3.1-70b-instruct

# Search keys (optional, for authorized users only)
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

const crypto = require('crypto');

/**
 * Load environment provider credentials
 * @returns {Array<ProviderConfig>} - Array of provider configs from env vars
 */
function loadEnvironmentProviders() {
    const providers = [];
    let index = 0;

    // Endpoint mapping for provider types
    const PROVIDER_ENDPOINTS = {
        'groq': 'https://api.groq.com/openai/v1',
        'groq-free': 'https://api.groq.com/openai/v1',
        'openai': 'https://api.openai.com/v1',
        'gemini': 'https://generativelanguage.googleapis.com/v1beta',
        'gemini-free': 'https://generativelanguage.googleapis.com/v1beta',
        'together': 'https://api.together.xyz/v1'
    };

    // Read providers from environment (indexed 0, 1, 2, ...)
    while (true) {
        const typeKey = `LLAMDA_LLM_PROXY_PROVIDER_TYPE_${index}`;
        const keyKey = `LLAMDA_LLM_PROXY_PROVIDER_KEY_${index}`;
        
        const type = process.env[typeKey];
        const apiKey = process.env[keyKey];

        // Stop when no more providers found
        if (!type || !apiKey) {
            break;
        }

        const provider = {
            id: crypto.randomUUID(),
            type,
            apiKey
        };

        // For openai-compatible, read endpoint and modelName
        if (type === 'openai-compatible') {
            const endpointKey = `LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_${index}`;
            const modelKey = `LLAMDA_LLM_PROXY_PROVIDER_MODEL_${index}`;
            
            provider.apiEndpoint = process.env[endpointKey];
            provider.modelName = process.env[modelKey];

            if (!provider.apiEndpoint || !provider.modelName) {
                console.warn(`Provider ${index}: openai-compatible requires ENDPOINT and MODEL`);
                index++;
                continue;
            }
        } else {
            // Auto-fill endpoint for known types
            provider.apiEndpoint = PROVIDER_ENDPOINTS[type];
            if (!provider.apiEndpoint) {
                console.warn(`Provider ${index}: Unknown provider type ${type}`);
                index++;
                continue;
            }
        }

        providers.push(provider);
        index++;
    }

    console.log(`Loaded ${providers.length} environment providers`);
    return providers;
}

/**
 * Merge user providers with environment providers for authorized users
 * @param {Array<ProviderConfig>} userProviders - Providers from request
 * @param {boolean} isAuthorized - Whether user is authorized (whitelisted)
 * @returns {Array<ProviderConfig>} - Merged provider pool
 */
function buildProviderPool(userProviders, isAuthorized) {
    // Always include user providers (if any)
    const pool = userProviders ? [...userProviders] : [];

    // Add environment providers ONLY for authorized users
    if (isAuthorized) {
        const envProviders = loadEnvironmentProviders();
        pool.push(...envProviders);
        console.log(`Merged pool: ${userProviders.length} user + ${envProviders.length} env = ${pool.length} total`);
    } else {
        console.log(`Unauthorized user: using only ${pool.length} user-provided providers`);
    }

    // Backend will prioritize free tier providers automatically based on type
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
        // Authenticate all requests (Google OAuth required)
        const authResult = await authenticateRequest(event);
        
        if (!authResult.authenticated) {
            // Return auth error via streaming response
            const metadata = {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
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

        // CRITICAL: Unauthorized users MUST provide at least one provider
        if (!authResult.authorized && (!userProviders || userProviders.length === 0)) {
            const metadata = {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(JSON.stringify({
                error: 'Unauthorized users must configure at least one provider. Please add your API keys in settings.',
                requiresProviderSetup: true,
                authorized: false
            }));
            responseStream.end();
            return;
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

## Frontend UI Blocking Implementation

### Overview
Unauthorized users who have not configured providers must be completely blocked from using the chat interface. This is similar to the login screen - a full overlay that prevents access to all UI functionality until the gate condition is met.

### Gate Condition
```typescript
const canAccessChatUI = isAuthorized || (providers && providers.length > 0);
```

### Component: ProviderSetupGate

**File**: `docs/js/provider-setup-gate.js` (new)

```javascript
class ProviderSetupGate {
    constructor() {
        this.isAuthorized = false;
        this.providers = [];
        this.onSetupComplete = null;
    }

    /**
     * Check if user can access chat UI
     * @param {boolean} isAuthorized - User is in VALID_USERS whitelist
     * @param {Array} providers - User's configured providers from localStorage
     * @returns {boolean} - Can access chat UI
     */
    canAccessUI(isAuthorized, providers) {
        this.isAuthorized = isAuthorized;
        this.providers = providers || [];
        return this.isAuthorized || this.providers.length > 0;
    }

    /**
     * Show provider setup screen that blocks all UI
     * Must be called before initializing chat components
     */
    showSetupScreen() {
        // Hide main chat UI
        const mainContent = document.getElementById('main-content');
        const sidebar = document.getElementById('sidebar');
        if (mainContent) mainContent.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';

        // Create full-screen overlay
        const overlay = document.createElement('div');
        overlay.id = 'provider-setup-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #1a1a1a;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;

        // Create setup card
        const card = document.createElement('div');
        card.style.cssText = `
            background: #2a2a2a;
            border-radius: 12px;
            padding: 32px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        `;

        card.innerHTML = `
            <h2 style="margin: 0 0 16px 0; color: #fff; font-size: 24px;">
                Provider Configuration Required
            </h2>
            <p style="color: #aaa; margin: 0 0 24px 0; line-height: 1.6;">
                You are not authorized to use shared API keys. To continue, please configure 
                at least one LLM provider with your own API key.
            </p>
            <div id="provider-setup-form-container"></div>
            <p style="color: #888; margin: 24px 0 0 0; font-size: 14px;">
                Need an API key? Visit 
                <a href="https://console.groq.com" target="_blank" style="color: #4a9eff;">Groq</a>, 
                <a href="https://platform.openai.com" target="_blank" style="color: #4a9eff;">OpenAI</a>, or 
                <a href="https://ai.google.dev" target="_blank" style="color: #4a9eff;">Google AI Studio</a>
            </p>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // Initialize provider form in the container
        // This reuses the existing settings provider form component
        this.initializeProviderForm();
    }

    /**
     * Initialize the provider form inside the setup screen
     */
    initializeProviderForm() {
        const container = document.getElementById('provider-setup-form-container');
        if (!container) return;

        // Create a minimal provider form (reuse settings form logic)
        // This should include:
        // - Provider type dropdown
        // - API endpoint (auto-filled, read-only except for openai-compatible)
        // - API key input
        // - Model name (only for openai-compatible)
        // - Save button

        // When provider is saved, call checkAndUnlock()
        window.addEventListener('provider-added', () => {
            this.checkAndUnlock();
        });
    }

    /**
     * Check if gate condition is met and unlock UI if so
     */
    checkAndUnlock() {
        // Reload providers from localStorage
        const settings = JSON.parse(localStorage.getItem('llmProxySettings') || '{}');
        const providers = settings.providers || [];

        if (providers.length > 0) {
            // Remove overlay
            const overlay = document.getElementById('provider-setup-overlay');
            if (overlay) overlay.remove();

            // Show main UI
            const mainContent = document.getElementById('main-content');
            const sidebar = document.getElementById('sidebar');
            if (mainContent) mainContent.style.display = '';
            if (sidebar) sidebar.style.display = '';

            // Trigger callback if provided
            if (this.onSetupComplete) {
                this.onSetupComplete();
            }

            // Initialize main app
            if (window.initializeApp) {
                window.initializeApp();
            }
        }
    }
}

// Export singleton instance
window.providerSetupGate = new ProviderSetupGate();
```

### Integration in Main App

**File**: `docs/js/main.js` (modifications)

```javascript
// At the very start of main.js, before any other initialization:

async function checkAuthAndInitialize() {
    try {
        // Get current auth token
        const token = window.googleAuth?.currentToken;
        if (!token) {
            console.error('No auth token available');
            showLoginScreen();
            return;
        }

        // Check authorization status by making a test request
        // (The backend will return authorized: true/false in the response)
        const settings = JSON.parse(localStorage.getItem('llmProxySettings') || '{}');
        const providers = settings.providers || [];

        // Make test request to check auth status
        const testResponse = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'test' }],
                providers: providers,
                stream: false
            })
        });

        if (testResponse.status === 401) {
            // Not authenticated - show login
            showLoginScreen();
            return;
        }

        if (testResponse.status === 403) {
            // Authenticated but unauthorized, no providers configured
            const errorData = await testResponse.json();
            if (errorData.requiresProviderSetup) {
                window.providerSetupGate.showSetupScreen();
                return;
            }
        }

        // If we got here, user can access UI
        // Continue with normal initialization
        initializeApp();

    } catch (error) {
        console.error('Auth check failed:', error);
        showLoginScreen();
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', checkAuthAndInitialize);
```

### Request Error Handling

**File**: `docs/js/streaming.js` (modifications)

```javascript
// In handleStreamingResponse or similar:

async function handleStreamingResponse(response) {
    if (response.status === 403) {
        const errorData = await response.json();
        if (errorData.requiresProviderSetup) {
            // User became unauthorized (maybe their whitelist entry was removed)
            // Show setup screen
            window.providerSetupGate.showSetupScreen();
            return;
        }
    }
    
    // ... existing streaming logic
}
```

### Behavior Summary

| User Type | Providers Configured | UI State | Action Required |
|-----------|---------------------|----------|-----------------|
| Authorized (whitelisted) | Any (0+) | ✅ Full Access | None - can use env credentials |
| Unauthorized | None (0) | 🚫 BLOCKED | Must configure ≥1 provider |
| Unauthorized | 1+ | ✅ Full Access | None - using own credentials |

### Key Features

1. **Gate Check on Load**: `checkAuthAndInitialize()` runs before any UI initialization
2. **Full UI Blocking**: Setup screen is a modal overlay that prevents all interaction
3. **Cannot Dismiss**: No close button - must configure a provider to proceed
4. **Real-time Unlock**: As soon as first provider is saved, gate checks and unlocks
5. **Persistent Check**: Every request can return `requiresProviderSetup: true` to re-trigger gate
6. **Graceful for Authorized**: Authorized users never see the setup screen

## Implementation Checklist

### Backend
- [ ] Update `src/auth.js` with authorization logic (whitelist check)
- [ ] Create `src/credential-pool.js` with loadEnvironmentProviders() and buildProviderPool()
- [ ] Update `src/index.js` request handler with provider check
- [ ] Add 403 error response for unauthorized users without providers
- [ ] Add `requiresProviderSetup: true` to 403 responses
- [ ] Ensure `authorized: true/false` included in all responses
- [ ] Add unit tests for auth logic (whitelist, token verification)
- [ ] Add unit tests for credential pooling (env var loading, merging)
- [ ] Add integration tests for auth flow (authorized vs unauthorized)
- [ ] Add integration tests for provider gating (403 responses)

### Frontend
- [ ] Create `docs/js/provider-setup-gate.js` component
- [ ] Update `docs/js/main.js` with `checkAuthAndInitialize()`
- [ ] Update `docs/js/streaming.js` to handle `requiresProviderSetup` errors
- [ ] Add `provider-added` event to settings form
- [ ] Test gate with authorized user (should bypass)
- [ ] Test gate with unauthorized user, no providers (should block)
- [ ] Test gate unlock after provider configuration
- [ ] Add CSS for setup overlay and card
- [ ] Test persistent gate checks on runtime errors

### Environment Setup
- [ ] Add `VALID_USERS` environment variable to Lambda
- [ ] Add indexed provider env vars (TYPE_0, KEY_0, etc.)
- [ ] Document env var format in deployment guide
- [ ] Test env var loading with 0 providers
- [ ] Test env var loading with multiple providers
- [ ] Test env var loading with openai-compatible type

### Documentation
- [ ] Update API documentation with auth requirements
- [ ] Document provider setup gate behavior
- [ ] Create user guide for configuring providers
- [ ] Document whitelist management for admins
- [ ] Add monitoring guide for auth failures

