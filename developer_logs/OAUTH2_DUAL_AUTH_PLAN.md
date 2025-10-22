# OAuth2 Dual Authentication Implementation Plan

## Executive Summary

This plan outlines the implementation of an **optional OAuth2 authentication flow** alongside the existing JWT-based authentication system. The OAuth2 flow will enable access to YouTube's Transcript API when users explicitly opt in via a settings checkbox, while maintaining JWT as the default authentication method for all other features.

**Key Principle**: Dual authentication coexistence - JWT remains the default for API access, OAuth2 is optional and only triggered when users enable YouTube transcript features.

---

## 1. Current System Analysis

### 1.1 Existing Authentication System

**Location**: `src/auth.js` (150 lines)

**Current Implementation**:
- **Type**: JWT-based token verification using `google-auth-library`
- **Flow**: Client sends Google ID token → Lambda verifies token signature → Checks email whitelist → Grants/denies access
- **Key Functions**:
  - `verifyGoogleToken(token)`: Uses `OAuth2Client.verifyIdToken()` to validate JWT signatures
  - `authenticateRequest(event)`: Returns `{authenticated, authorized, email, user}` object
- **Environment Variables**:
  - `GOOGLE_CLIENT_ID`: OAuth client ID for JWT verification
  - `ALLOWED_EMAILS`: Comma-separated whitelist of authorized emails

**What It Does**: Verifies that incoming requests have valid Google ID tokens (JWT) signed by Google and match the email whitelist.

**What It Does NOT Do**: Full OAuth2 authorization flow (no authorization code exchange, no access tokens, no refresh tokens, no Google API scopes).

### 1.2 Lambda Infrastructure

**Main Router**: `src/index.js` (187 lines)

**Endpoint Architecture**:
```javascript
// Streaming endpoints (using awslambda.streamifyResponse)
POST /chat         → chatEndpoint (SSE streaming)
POST /planning     → planningEndpoint (SSE streaming)
POST /search       → searchEndpoint (SSE streaming)

// Buffered endpoints (direct response)
POST /proxy        → proxyEndpoint (buffered JSON)
POST /transcribe   → transcribeEndpoint (buffered JSON with progress events)
POST /stop-transcription → stopTranscription (buffered JSON)

// Static file serving
GET /*             → staticEndpoint (buffered HTML/JS/CSS)
```

**Lambda Function URL**: `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/`
- **AuthType**: NONE (public access, auth handled in application code)
- **CORS**: Fully configured with necessary headers

**Key Finding**: The static endpoint pattern can be reused for OAuth callback handling since it already returns buffered responses.

### 1.3 Current YouTube/Transcription Features

**Tool**: `transcribe_url` (defined at line 296 in `src/tools.js`)

**Current Behavior**:
- Uses **OpenAI Whisper API** for all transcriptions (audio extraction → Whisper transcription)
- Supports YouTube URLs: Downloads audio using yt-dlp → Sends to Whisper
- Also supports direct media URLs (.mp3, .mp4, .wav, .m4a, etc.)
- Provider-aware: Can use Groq's `whisper-large-v3-turbo` or OpenAI's `whisper-1`
- Progress tracking with stop capability
- Large file chunking

**Related Tool**: `search_youtube` (defined at line 199 in `src/tools.js`)
- Uses YouTube Data API v3 for video search
- Hard-coded API key: `AIzaSyDFLprO5B-qKsoHprb8BooVmVTT0B5Mnus`
- Can check caption availability but **cannot fetch transcripts** (lines 1200-1350)
- Comment at line 1332: *"YouTube's timedtext API for fetching transcripts is restricted and requires OAuth authentication which is not feasible in serverless context."*

**Problem Statement**: 
1. Current system can only transcribe YouTube videos via Whisper (slow, costs API credits, audio quality dependent)
2. YouTube has native captions/transcripts available via API but requires OAuth2
3. No mechanism exists to obtain or use YouTube API access tokens

---

## 2. Requirements & Design Goals

### 2.1 Functional Requirements

1. **Dual Authentication Coexistence**
   - JWT authentication remains the default and required for all API endpoints
   - OAuth2 is optional and only required for YouTube transcript features
   - Both auth systems can be active simultaneously for the same user

2. **YouTube Transcript Access**
   - Add checkbox in settings: "Enable YouTube Transcripts" (disabled by default)
   - When enabled, initiate OAuth2 flow to obtain YouTube API access
   - Store OAuth2 tokens securely in browser localStorage
   - Modify `transcribe_url` tool to prioritize YouTube Transcript API over Whisper when OAuth tokens are available

3. **User Experience**
   - Clicking checkbox triggers OAuth consent flow in popup/new tab
   - Clear indication of OAuth status (connected/disconnected)
   - Ability to disconnect/revoke OAuth access
   - Handle OAuth errors gracefully (expired tokens, user denial, API errors)

4. **Backward Compatibility**
   - Existing features continue to work without any OAuth configuration
   - Users who don't enable YouTube transcripts never see OAuth UI
   - JWT authentication flow remains unchanged

### 2.2 Technical Requirements

1. **OAuth2 Flow**
   - Use 3-legged OAuth 2.0 authorization code flow
   - Required scope: `https://www.googleapis.com/auth/youtube.readonly`
   - Callback endpoint: `GET /oauth/callback` on Lambda Function URL
   - Token exchange: Authorization code → Access token + Refresh token
   - Token storage: Browser localStorage (client-side storage only, no server-side persistence)

2. **Token Management**
   - Store OAuth tokens separately from JWT tokens
   - Implement token refresh logic (refresh tokens before expiry)
   - Pass OAuth access token to backend when making YouTube-related tool calls
   - Backend validates OAuth tokens before using YouTube API

3. **Security**
   - Validate OAuth state parameter to prevent CSRF attacks
   - Use PKCE (Proof Key for Code Exchange) if supported
   - Never log or expose tokens in responses
   - Validate all token responses from Google
   - Check token expiry before use, auto-refresh when possible

4. **Tool Modification**
   - Update `transcribe_url` to accept optional `youtubeAccessToken` parameter
   - Prioritize YouTube Transcript API when token is provided
   - Fallback to Whisper if YouTube API fails or token is missing
   - Update `search_youtube` to include transcript data when OAuth is available

---

## 3. Architecture Design

### 3.1 Authentication Flow Diagram

```
┌─────────────────┐
│   User Opens    │
│   Application   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ JWT Auth (EXISTING) │
│ - Google One Tap │
│ - ID Token       │
│ - Email Whitelist│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│      Application Loaded (Authorized)     │
│                                          │
│  All API calls include JWT in headers   │
└─────────────┬────────────────────────────┘
              │
              ▼
     ┌────────────────────┐
     │ User Clicks         │
     │ "Enable YouTube     │
     │  Transcripts"       │
     │ Checkbox in Settings│
     └────────┬────────────┘
              │
              ▼
     ┌─────────────────────────────┐
     │ OAuth2 Flow (NEW)           │
     │                             │
     │ 1. Generate state & PKCE    │
     │ 2. Redirect to Google OAuth │
     │ 3. User consents (popup)    │
     │ 4. Google redirects to      │
     │    Lambda callback endpoint │
     │ 5. Exchange code for tokens │
     │ 6. Return tokens to client  │
     │ 7. Store in localStorage    │
     └─────────────┬───────────────┘
                   │
                   ▼
          ┌────────────────────┐
          │ YouTube Transcripts │
          │ Enabled             │
          │                     │
          │ - Access Token      │
          │ - Refresh Token     │
          │ - Expiry Time       │
          └────────┬────────────┘
                   │
                   ▼
          ┌──────────────────────────────┐
          │ transcribe_url Tool Call     │
          │                              │
          │ Request includes:            │
          │ - JWT (Authorization header) │
          │ - OAuth token (custom header)│
          │                              │
          │ Backend logic:               │
          │ IF youtube_token provided:   │
          │   → Use YouTube Transcript API│
          │ ELSE:                        │
          │   → Use Whisper API          │
          └──────────────────────────────┘
```

### 3.2 Token Storage Strategy

**JWT Tokens** (existing):
- Stored by Google One Tap library (session/cookie)
- Sent in `Authorization: Bearer <jwt>` header
- Used for: API access control, email verification
- Managed by: Frontend auth context

**OAuth2 Tokens** (new):
- Stored in browser localStorage under key: `youtube_oauth_tokens`
- Structure:
  ```typescript
  {
    access_token: string,
    refresh_token: string,
    expires_at: number,  // Unix timestamp
    scope: string,       // 'https://www.googleapis.com/auth/youtube.readonly'
    token_type: 'Bearer'
  }
  ```
- Sent in custom header: `X-YouTube-Token: <access_token>`
- Used for: YouTube API access only
- Managed by: New `YouTubeAuthContext` (to be created)

**Token Refresh Logic**:
```javascript
// Check if token is expired or expiring soon (5 min buffer)
if (Date.now() >= tokens.expires_at - 300000) {
  // Refresh token
  const response = await fetch('/oauth/refresh', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}` },
    body: JSON.stringify({ refresh_token: tokens.refresh_token })
  });
  const newTokens = await response.json();
  localStorage.setItem('youtube_oauth_tokens', JSON.stringify(newTokens));
}
```

### 3.3 Backend Endpoint Design

**New Routes to Add in `src/index.js`**:

```javascript
// OAuth callback endpoint (buffered response)
if (event.requestContext.http.method === 'GET' && 
    event.rawPath === '/oauth/callback') {
  return oauthCallbackEndpoint(event);
}

// OAuth token refresh endpoint (buffered response)
if (event.requestContext.http.method === 'POST' && 
    event.rawPath === '/oauth/refresh') {
  return oauthRefreshEndpoint(event);
}

// OAuth revoke endpoint (buffered response)
if (event.requestContext.http.method === 'POST' && 
    event.rawPath === '/oauth/revoke') {
  return oauthRevokeEndpoint(event);
}
```

**New File**: `src/endpoints/oauth.js`

```javascript
// Pseudo-code structure

const { OAuth2Client } = require('google-auth-library');
const { authenticateRequest } = require('../auth');

// Environment variables needed:
// - GOOGLE_CLIENT_ID (already exists)
// - GOOGLE_CLIENT_SECRET (new, from OAuth credentials)
// - OAUTH_REDIRECT_URI (e.g., https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback)

async function oauthCallbackEndpoint(event) {
  try {
    // 1. Extract query parameters
    const params = event.queryStringParameters || {};
    const code = params.code;
    const state = params.state;
    const error = params.error;

    // 2. Handle user denial
    if (error) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<html><body><script>
          window.opener?.postMessage({ 
            type: 'oauth_error', 
            error: '${error}' 
          }, '*');
          window.close();
        </script></body></html>`
      };
    }

    // 3. Validate state (CSRF protection)
    // (Client must send state via sessionStorage and validate match)

    // 4. Exchange authorization code for tokens
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    
    // 5. Return tokens to client via postMessage
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body><script>
        window.opener?.postMessage({ 
          type: 'oauth_success', 
          tokens: ${JSON.stringify(tokens)}
        }, '*');
        window.close();
      </script></body></html>`
    };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body><script>
        window.opener?.postMessage({ 
          type: 'oauth_error', 
          error: '${error.message}' 
        }, '*');
        window.close();
      </script></body></html>`
    };
  }
}

async function oauthRefreshEndpoint(event) {
  try {
    // 1. Authenticate request with JWT (required)
    const auth = await authenticateRequest(event);
    if (!auth.authorized) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // 2. Parse refresh token from body
    const body = JSON.parse(event.body || '{}');
    const refreshToken = body.refresh_token;

    if (!refreshToken) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'refresh_token required' })
      };
    }

    // 3. Use OAuth2Client to refresh
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();

    // 4. Return new tokens
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date,
        refresh_token: credentials.refresh_token || refreshToken, // Some refresh don't return new refresh token
        scope: credentials.scope,
        token_type: credentials.token_type
      })
    };
  } catch (error) {
    console.error('OAuth refresh error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Token refresh failed', details: error.message })
    };
  }
}

async function oauthRevokeEndpoint(event) {
  try {
    // 1. Authenticate request with JWT
    const auth = await authenticateRequest(event);
    if (!auth.authorized) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // 2. Parse token from body
    const body = JSON.parse(event.body || '{}');
    const token = body.token;

    if (!token) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'token required' })
      };
    }

    // 3. Revoke token with Google
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI
    );

    await oauth2Client.revokeToken(token);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('OAuth revoke error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Token revocation failed', details: error.message })
    };
  }
}

module.exports = {
  oauthCallbackEndpoint,
  oauthRefreshEndpoint,
  oauthRevokeEndpoint
};
```

---

## 4. Frontend Implementation

### 4.1 New Context: `YouTubeAuthContext`

**Location**: `ui-new/src/contexts/YouTubeAuthContext.tsx` (new file)

**Purpose**: Manage YouTube OAuth state, tokens, and authentication flow

**Interface**:
```typescript
interface YouTubeAuthContextValue {
  isConnected: boolean;              // Whether OAuth tokens are valid
  isLoading: boolean;                // OAuth flow in progress
  tokens: YouTubeTokens | null;      // Current tokens
  error: string | null;              // Error message if any
  
  // Actions
  initiateOAuthFlow: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  
  // Utility
  getAccessToken: () => Promise<string | null>;  // Returns valid token or null
}

interface YouTubeTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}
```

**Implementation Outline**:
```typescript
// Pseudo-code
export const YouTubeAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tokens, setTokens] = useLocalStorage<YouTubeTokens | null>('youtube_oauth_tokens', null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if tokens are valid (not expired)
  const isConnected = useMemo(() => {
    if (!tokens) return false;
    return Date.now() < tokens.expires_at - 300000; // 5 min buffer
  }, [tokens]);

  // Initiate OAuth flow
  const initiateOAuthFlow = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Generate state for CSRF protection
      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);

      // 2. Build OAuth URL
      const params = new URLSearchParams({
        client_id: 'YOUR_GOOGLE_CLIENT_ID',
        redirect_uri: 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback',
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        access_type: 'offline',  // To get refresh token
        prompt: 'consent',       // Force consent to get refresh token
        state: state
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

      // 3. Open popup
      const popup = window.open(authUrl, 'oauth', 'width=600,height=700');

      // 4. Listen for postMessage from callback
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data.type === 'oauth_success') {
          // Validate state
          const savedState = sessionStorage.getItem('oauth_state');
          if (state !== savedState) {
            setError('Invalid state parameter');
            return;
          }

          // Save tokens
          const newTokens = {
            ...event.data.tokens,
            expires_at: Date.now() + (event.data.tokens.expires_in * 1000)
          };
          setTokens(newTokens);
          setIsLoading(false);
          sessionStorage.removeItem('oauth_state');
          window.removeEventListener('message', handleMessage);
        } else if (event.data.type === 'oauth_error') {
          setError(event.data.error);
          setIsLoading(false);
          sessionStorage.removeItem('oauth_state');
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);

      // 5. Check if popup was closed
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          setIsLoading(false);
          window.removeEventListener('message', handleMessage);
        }
      }, 500);

    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  }, [setTokens]);

  // Refresh tokens
  const refreshTokens = useCallback(async () => {
    if (!tokens?.refresh_token) return;

    try {
      const response = await fetch('/oauth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getJwtToken()}` // From existing auth context
        },
        body: JSON.stringify({ refresh_token: tokens.refresh_token })
      });

      if (!response.ok) throw new Error('Token refresh failed');

      const newTokens = await response.json();
      setTokens({
        ...newTokens,
        expires_at: newTokens.expires_at
      });
    } catch (err) {
      setError(err.message);
      setTokens(null); // Clear invalid tokens
    }
  }, [tokens, setTokens]);

  // Get valid access token (auto-refresh if needed)
  const getAccessToken = useCallback(async () => {
    if (!tokens) return null;

    // Check if expired or expiring soon
    if (Date.now() >= tokens.expires_at - 300000) {
      await refreshTokens();
      return tokens.access_token;
    }

    return tokens.access_token;
  }, [tokens, refreshTokens]);

  // Disconnect (revoke + clear)
  const disconnect = useCallback(async () => {
    if (!tokens) return;

    try {
      await fetch('/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getJwtToken()}`
        },
        body: JSON.stringify({ token: tokens.access_token })
      });
    } catch (err) {
      console.error('Revoke error:', err);
    } finally {
      setTokens(null);
      setError(null);
    }
  }, [tokens, setTokens]);

  return (
    <YouTubeAuthContext.Provider value={{
      isConnected,
      isLoading,
      tokens,
      error,
      initiateOAuthFlow,
      disconnect,
      refreshTokens,
      getAccessToken
    }}>
      {children}
    </YouTubeAuthContext.Provider>
  );
};
```

### 4.2 Settings UI Updates

**Location**: `ui-new/src/components/SettingsModal.tsx`

**Changes**:
1. Add new section: "YouTube Transcripts"
2. Add checkbox: "Enable YouTube Transcripts" (controlled by `isConnected` state)
3. Add connection status indicator
4. Add disconnect button when connected

**UI Mockup**:
```tsx
import { useYouTubeAuth } from '../contexts/YouTubeAuthContext';

// Inside SettingsModal component
const { isConnected, isLoading, error, initiateOAuthFlow, disconnect } = useYouTubeAuth();

return (
  <div className="settings-section">
    <h3>YouTube Transcripts</h3>
    <p className="text-sm text-gray-600">
      Enable direct access to YouTube transcripts using Google's API. 
      Faster and more accurate than audio transcription.
    </p>
    
    <div className="flex items-center gap-4 mt-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isConnected}
          disabled={isLoading}
          onChange={(e) => {
            if (e.target.checked) {
              initiateOAuthFlow();
            } else {
              disconnect();
            }
          }}
        />
        <span>Enable YouTube Transcripts</span>
      </label>
      
      {isConnected && (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircleIcon className="w-4 h-4" />
          Connected
        </span>
      )}
      
      {isLoading && (
        <span className="text-xs text-gray-500">
          Authenticating...
        </span>
      )}
    </div>
    
    {error && (
      <div className="mt-2 text-sm text-red-600">
        Error: {error}
      </div>
    )}
    
    {isConnected && (
      <button
        onClick={disconnect}
        className="mt-2 text-sm text-red-600 hover:underline"
      >
        Disconnect YouTube Access
      </button>
    )}
  </div>
);
```

### 4.3 Chat API Integration

**Location**: `ui-new/src/api/chat.ts` (or similar)

**Changes**: Pass YouTube access token in API requests when available

```typescript
import { useYouTubeAuth } from '../contexts/YouTubeAuthContext';

// When making API calls to /chat or /planning
const { getAccessToken } = useYouTubeAuth();

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${jwtToken}`, // Existing JWT
};

// Add YouTube token if available
const youtubeToken = await getAccessToken();
if (youtubeToken) {
  headers['X-YouTube-Token'] = youtubeToken;
}

const response = await fetch(API_ENDPOINT, {
  method: 'POST',
  headers,
  body: JSON.stringify(payload)
});
```

---

## 5. Backend Tool Modifications

### 5.1 Modify `transcribe_url` Tool

**Location**: `src/tools.js` (line 1200-1350)

**Changes**:

```javascript
case 'transcribe_url': {
  const url = String(args.url || '').trim();
  if (!url) return JSON.stringify({ error: 'url required' });

  try {
    // NEW: Check if YouTube URL and if OAuth token is available
    const isYouTubeUrl = /youtube\.com|youtu\.be|youtube\.com\/shorts/.test(url);
    const youtubeAccessToken = context.youtubeAccessToken || null;

    // NEW: Prioritize YouTube Transcript API if token available
    if (isYouTubeUrl && youtubeAccessToken) {
      try {
        const transcript = await getYouTubeTranscript(url, youtubeAccessToken);
        return JSON.stringify({
          text: transcript,
          source: 'youtube_api',
          url
        });
      } catch (ytError) {
        console.warn('YouTube API failed, falling back to Whisper:', ytError);
        // Fall through to Whisper transcription
      }
    }

    // EXISTING: Whisper transcription (unchanged)
    const onProgress = context.onProgress || null;
    const toolCallId = context.toolCallId || null;
    const provider = context.provider || (context.apiKey?.startsWith('gsk_') ? 'groq' : 'openai');
    const apiKey = provider === 'groq' 
      ? context.apiKey 
      : (context.openaiApiKey || context.apiKey);
    const model = provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';

    const result = await transcribeUrl({
      url,
      apiKey,
      provider,
      language: args.language,
      prompt: args.prompt,
      model,
      onProgress,
      toolCallId
    });

    return JSON.stringify({
      ...result,
      source: 'whisper'
    });
  } catch (error) {
    console.error('Transcribe tool error:', error);
    return JSON.stringify({ 
      error: `Transcription failed: ${error.message}`,
      url 
    });
  }
}
```

**New Helper Function**: `getYouTubeTranscript(url, accessToken)`

```javascript
// Add to src/tools.js or new file src/youtube-api.js

const https = require('https');

async function getYouTubeTranscript(url, accessToken) {
  // 1. Extract video ID
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) throw new Error('Invalid YouTube URL');

  // 2. Get caption tracks for video
  const captionsUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}`;
  
  const captionsResponse = await new Promise((resolve, reject) => {
    https.get(captionsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`YouTube API error: ${res.statusCode} ${data}`));
        }
      });
    }).on('error', reject);
  });

  // 3. Find English caption track (or first available)
  const captions = captionsResponse.items || [];
  if (captions.length === 0) {
    throw new Error('No captions available for this video');
  }

  const enCaption = captions.find(c => 
    c.snippet.language === 'en' || c.snippet.language.startsWith('en')
  ) || captions[0];

  const captionId = enCaption.id;

  // 4. Download caption track
  const trackUrl = `https://www.googleapis.com/youtube/v3/captions/${captionId}?tfmt=srt`;
  
  const transcript = await new Promise((resolve, reject) => {
    https.get(trackUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/plain'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          // Parse SRT format to plain text
          const text = parseSrtToText(data);
          resolve(text);
        } else {
          reject(new Error(`Caption download error: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });

  return transcript;
}

function extractYouTubeVideoId(url) {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/shorts\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function parseSrtToText(srt) {
  // Remove timing lines and sequence numbers
  const lines = srt.split('\n');
  const textLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip sequence numbers
    if (/^\d+$/.test(line)) continue;
    // Skip timing lines
    if (/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/.test(line)) continue;
    // Skip empty lines
    if (line === '') continue;
    // Keep text
    textLines.push(line);
  }
  
  return textLines.join(' ');
}

module.exports = {
  getYouTubeTranscript,
  extractYouTubeVideoId,
  parseSrtToText
};
```

### 5.2 Pass YouTube Token to Tool Context

**Location**: `src/endpoints/chat.js` (and similar endpoints)

**Changes**:

```javascript
// Around line 460 where context is built for tool execution
const toolContext = {
  model: requestModel,
  apiKey: provider.apiKey,
  openaiApiKey: openaiKey,
  provider: provider.type,
  writeEvent,
  onProgress: /* ... */,
  toolCallId: toolCall.id,
  
  // NEW: Pass YouTube access token if available
  youtubeAccessToken: event.headers['x-youtube-token'] || null
};

const result = await callFunction(toolCall.function.name, args, toolContext);
```

---

## 6. Deployment & Configuration

### 6.1 Google Cloud Console Setup

**Steps**:

1. **Navigate to Google Cloud Console**: https://console.cloud.google.com/

2. **Enable YouTube Data API v3**:
   - Go to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"

3. **Create OAuth 2.0 Credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Application type: "Web application"
   - Name: "LambdaLLMProxy YouTube Access"
   - Authorized JavaScript origins:
     - `https://lambdallmproxy.pages.dev`
     - `http://localhost:8081` (for local testing)
   - Authorized redirect URIs:
     - `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback`
   - Click "Create"
   - **SAVE**: Client ID and Client Secret

4. **Configure OAuth Consent Screen**:
   - Go to "APIs & Services" > "OAuth consent screen"
   - User Type: "External" (or "Internal" if G Suite organization)
   - App name: "LambdaLLMProxy"
   - User support email: Your email
   - Scopes: Click "Add or Remove Scopes"
     - Add: `https://www.googleapis.com/auth/youtube.readonly`
   - Test users: Add your email (if app is not published)
   - Save

### 6.2 AWS Lambda Environment Variables

**Add to Lambda Configuration**:

```bash
aws lambda update-function-configuration \
  --function-name lambdallmproxy \
  --environment "Variables={
    GOOGLE_CLIENT_ID=<existing>,
    GOOGLE_CLIENT_SECRET=<new_from_step_3>,
    OAUTH_REDIRECT_URI=https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback,
    ALLOWED_EMAILS=<existing>,
    ...other_vars...
  }"
```

**Or via AWS Console**:
- Lambda > Functions > lambdallmproxy > Configuration > Environment variables
- Add:
  - `GOOGLE_CLIENT_SECRET`: (from Google Cloud Console)
  - `OAUTH_REDIRECT_URI`: `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback`

### 6.3 Frontend Configuration

**Update**: `ui-new/src/config.ts` (or wherever API config is stored)

```typescript
export const GOOGLE_OAUTH_CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
export const OAUTH_REDIRECT_URI = 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/oauth/callback';
export const YOUTUBE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
```

### 6.4 Deployment Commands

```bash
# Backend deployment
make deploy-lambda-fast   # If no dependency changes
# or
make deploy-lambda        # If package.json changed (adds google-auth-library if not present)

# Frontend deployment
make deploy-ui            # Builds and deploys UI to GitHub Pages

# Verify deployment
make logs                 # Check Lambda logs for errors
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

**Test Cases for OAuth Endpoints**:

1. **OAuth Callback**:
   - ✅ Successfully exchange code for tokens
   - ✅ Handle missing code parameter
   - ✅ Handle invalid authorization code
   - ✅ Handle user denial (error parameter)
   - ✅ Return tokens via postMessage
   - ✅ Close window after completion

2. **OAuth Refresh**:
   - ✅ Successfully refresh tokens with valid refresh token
   - ✅ Reject requests without JWT authentication
   - ✅ Handle invalid refresh token
   - ✅ Return new access token and expiry

3. **OAuth Revoke**:
   - ✅ Successfully revoke token
   - ✅ Reject requests without JWT authentication
   - ✅ Handle invalid token
   - ✅ Clear tokens on client

4. **YouTube Transcript Fetching**:
   - ✅ Successfully fetch transcript with valid token
   - ✅ Handle videos without captions
   - ✅ Handle expired access token
   - ✅ Fallback to Whisper on API error
   - ✅ Parse SRT format correctly

### 7.2 Integration Tests

**Test Scenarios**:

1. **Full OAuth Flow**:
   - User clicks "Enable YouTube Transcripts"
   - Popup opens with Google consent screen
   - User authorizes
   - Tokens saved to localStorage
   - Checkbox shows as checked
   - Status shows "Connected"

2. **Token Refresh**:
   - Manually expire token (set `expires_at` to past date)
   - Make API call requiring YouTube access
   - Verify automatic token refresh
   - Verify API call succeeds with new token

3. **YouTube Transcription**:
   - Enable YouTube transcripts
   - Request transcription of YouTube video with captions
   - Verify YouTube API is used (check response source)
   - Compare transcript quality with Whisper version

4. **Fallback Behavior**:
   - Enable YouTube transcripts
   - Request transcription of video WITHOUT captions
   - Verify fallback to Whisper
   - Verify successful transcription

5. **Disconnect Flow**:
   - Click "Disconnect YouTube Access"
   - Verify tokens removed from localStorage
   - Verify checkbox unchecked
   - Verify subsequent transcriptions use Whisper

### 7.3 Manual Testing Checklist

- [ ] OAuth popup opens correctly
- [ ] Google consent screen displays correct scopes
- [ ] After authorization, popup closes automatically
- [ ] Tokens stored in localStorage
- [ ] Settings UI shows "Connected" status
- [ ] YouTube video transcription works
- [ ] Non-YouTube URLs still use Whisper
- [ ] Token refresh happens automatically
- [ ] Disconnect button removes tokens
- [ ] JWT authentication still required for all endpoints
- [ ] Works on both localhost and production domain

---

## 8. Error Handling & Edge Cases

### 8.1 OAuth Flow Errors

| Error | Cause | Handling |
|-------|-------|----------|
| `access_denied` | User denied consent | Show message: "YouTube access denied. You can enable this later in settings." |
| `invalid_request` | Malformed OAuth request | Log error, show generic message: "OAuth error. Please try again." |
| `invalid_client` | Wrong client ID/secret | Backend error, log for developer investigation |
| `popup_blocked` | Browser blocked popup | Detect and show: "Please allow popups for this site to enable YouTube transcripts." |
| `state_mismatch` | CSRF attack or session issue | Show: "Security error. Please try again." |

### 8.2 Token Management Errors

| Error | Cause | Handling |
|-------|-------|----------|
| `invalid_grant` | Refresh token expired/revoked | Clear tokens, show: "YouTube access expired. Please reconnect." |
| `token_expired` | Access token expired | Auto-refresh, retry request |
| `insufficient_scope` | Token missing youtube.readonly | Show: "Insufficient permissions. Please reconnect." |

### 8.3 YouTube API Errors

| Error | Cause | Handling |
|-------|-------|----------|
| `quotaExceeded` | Daily API quota exceeded | Fallback to Whisper, log warning |
| `videoNotFound` | Invalid video ID | Show: "Video not found" |
| `captionNotAvailable` | No captions for video | Fallback to Whisper, show: "No captions available, transcribing audio instead." |
| `forbidden` | Video is private/restricted | Show: "Cannot access this video" |

### 8.4 Edge Cases

1. **Multiple Tabs**:
   - User opens multiple tabs with app
   - OAuth flow initiated in one tab
   - Solution: Use `localStorage` events to sync tokens across tabs

2. **Token Revocation Outside App**:
   - User revokes access via Google account settings
   - Solution: Detect 401 errors, clear local tokens, prompt reconnection

3. **Network Failures**:
   - OAuth callback times out
   - Solution: Show retry button, keep popup open until success/failure

4. **Concurrent Requests**:
   - Multiple API calls while token is expiring
   - Solution: Queue requests during refresh, use mutex pattern

---

## 9. Security Considerations

### 9.1 Token Security

- **Never log tokens**: Sanitize all logs to remove access/refresh tokens
- **Client-side only**: OAuth tokens stored in browser only, never sent to database
- **HTTPS only**: All OAuth flows require HTTPS (enforced by Google)
- **CORS validation**: Callback endpoint validates origin
- **Token expiry**: Implement short expiry times with automatic refresh

### 9.2 CSRF Protection

- **State parameter**: Random UUID generated per flow, validated on callback
- **Session storage**: State stored in sessionStorage, not localStorage
- **Same-origin postMessage**: Validate message origin before accepting tokens

### 9.3 Scope Minimization

- **Read-only access**: Use `youtube.readonly` scope, not full access
- **No channel management**: Scope does NOT allow modifications
- **Caption access only**: Scope limited to reading video metadata and captions

### 9.4 Rate Limiting

- **YouTube API quota**: 10,000 units/day (caption fetch = ~50 units)
- **Fallback strategy**: Use Whisper if quota exceeded
- **Monitoring**: Log API usage to track quota consumption

---

## 10. Documentation Updates

### 10.1 User Documentation

**Add to README.md or User Guide**:

```markdown
## YouTube Transcripts

By default, the application transcribes YouTube videos using OpenAI Whisper, which downloads the audio and processes it. For faster and more accurate results, you can enable direct access to YouTube captions.

### Enabling YouTube Transcripts

1. Open **Settings** (gear icon)
2. Scroll to **YouTube Transcripts** section
3. Check **Enable YouTube Transcripts**
4. Authorize the application when prompted
5. You're all set! Future YouTube transcriptions will use native captions when available.

### How It Works

- When enabled, the app uses YouTube's official Transcript API
- Much faster than audio transcription (seconds vs. minutes)
- More accurate for videos with high-quality captions
- Automatically falls back to Whisper if captions are unavailable
- Your Google account is only used for YouTube API access (read-only)

### Disconnecting

To revoke YouTube access:
1. Open **Settings**
2. Click **Disconnect YouTube Access**
3. Your tokens will be removed immediately

You can also revoke access from your [Google Account Permissions](https://myaccount.google.com/permissions).
```

### 10.2 Developer Documentation

**Create**: `OAUTH2_IMPLEMENTATION.md`

- Architecture overview
- OAuth flow diagram
- API endpoint documentation
- Environment variable reference
- Troubleshooting guide
- Testing instructions

### 10.3 API Documentation

**Update**: `ENDPOINTS_README.md`

Add sections for:
- `GET /oauth/callback` - OAuth2 callback endpoint
- `POST /oauth/refresh` - Token refresh endpoint
- `POST /oauth/revoke` - Token revocation endpoint

---

## 11. Rollout Plan

### Phase 1: Backend Implementation (Week 1)
- [ ] Create `src/endpoints/oauth.js`
- [ ] Add OAuth routes to `src/index.js`
- [ ] Implement `oauthCallbackEndpoint`
- [ ] Implement `oauthRefreshEndpoint`
- [ ] Implement `oauthRevokeEndpoint`
- [ ] Set up Google Cloud Console OAuth credentials
- [ ] Configure Lambda environment variables
- [ ] Write unit tests for OAuth endpoints
- [ ] Deploy to Lambda: `make deploy-lambda`

### Phase 2: YouTube API Integration (Week 1-2)
- [ ] Create `src/youtube-api.js` with transcript fetching
- [ ] Modify `transcribe_url` tool in `src/tools.js`
- [ ] Add YouTube token passing in `src/endpoints/chat.js`
- [ ] Write unit tests for YouTube API functions
- [ ] Test with sample YouTube videos (with/without captions)
- [ ] Deploy to Lambda: `make deploy-lambda-fast`

### Phase 3: Frontend Implementation (Week 2)
- [ ] Create `ui-new/src/contexts/YouTubeAuthContext.tsx`
- [ ] Update `ui-new/src/components/SettingsModal.tsx`
- [ ] Add OAuth configuration to `ui-new/src/config.ts`
- [ ] Implement popup flow and postMessage handling
- [ ] Update API call functions to include YouTube token
- [ ] Add UI components for connection status
- [ ] Write frontend tests
- [ ] Deploy UI: `make deploy-ui`

### Phase 4: Testing & Refinement (Week 2-3)
- [ ] Manual testing of full OAuth flow
- [ ] Test token refresh mechanism
- [ ] Test error handling (denial, expired tokens, etc.)
- [ ] Test YouTube transcript fetching
- [ ] Test fallback to Whisper
- [ ] Test disconnect flow
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile testing (iOS Safari, Chrome Mobile)

### Phase 5: Documentation & Launch (Week 3)
- [ ] Write user documentation
- [ ] Write developer documentation
- [ ] Create video tutorial (optional)
- [ ] Update README.md
- [ ] Announce feature to users
- [ ] Monitor logs for errors
- [ ] Gather user feedback

---

## 12. Success Metrics

### Performance Metrics
- **Transcription Speed**: YouTube API should be 5-10x faster than Whisper
  - Target: <5 seconds for typical 10-minute video transcript
  - Baseline: ~30-60 seconds with Whisper
- **API Cost Savings**: Reduced OpenAI Whisper API usage
  - Measure: Track Whisper API calls before/after
  - Expected: 40-60% reduction for users who enable YouTube transcripts

### Adoption Metrics
- **Opt-in Rate**: % of users who enable YouTube transcripts
  - Target: 30% within first month
- **Connection Success Rate**: % of OAuth flows that complete successfully
  - Target: >90% success rate
- **Token Longevity**: Average time before token refresh needed
  - Target: >7 days (Google's typical refresh token lifetime)

### Quality Metrics
- **Transcript Accuracy**: User feedback on transcript quality
  - Compare YouTube captions vs. Whisper output
- **Error Rate**: OAuth/API errors per 1000 requests
  - Target: <1% error rate
- **Fallback Rate**: % of YouTube requests that fallback to Whisper
  - Baseline: Unknown (depends on caption availability)

---

## 13. Risks & Mitigations

### Risk 1: Google API Quota Limits
**Impact**: High usage could exceed YouTube API daily quota (10,000 units)
**Mitigation**: 
- Monitor quota usage via CloudWatch
- Implement fallback to Whisper when quota exceeded
- Consider requesting quota increase from Google
- Add rate limiting per user if needed

### Risk 2: OAuth Complexity
**Impact**: Users may find OAuth flow confusing or intimidating
**Mitigation**:
- Clear UI messaging about what permissions are needed and why
- Video tutorial showing the process
- Make feature optional (default disabled)
- Provide support documentation

### Risk 3: Token Management Issues
**Impact**: Expired/invalid tokens could break transcription features
**Mitigation**:
- Robust error handling with clear user messages
- Automatic token refresh
- Fallback to Whisper on any OAuth errors
- Log errors for debugging

### Risk 4: Security Vulnerabilities
**Impact**: Token theft or CSRF attacks could compromise user accounts
**Mitigation**:
- Implement CSRF protection via state parameter
- Never log tokens
- Use HTTPS only
- Regular security audits
- Token stored client-side only (not in database)

### Risk 5: Maintenance Overhead
**Impact**: OAuth system adds complexity to codebase
**Mitigation**:
- Comprehensive documentation
- Thorough testing
- Isolated code (separate module)
- Feature flag to disable if needed

---

## 14. Future Enhancements

### Potential Improvements

1. **Multi-Language Support**:
   - Allow users to select preferred caption language
   - Auto-detect video language and fetch matching captions

2. **Transcript Caching**:
   - Cache fetched transcripts to reduce API calls
   - Store in S3 or DynamoDB with TTL
   - Check cache before making API request

3. **Batch Processing**:
   - Support transcribing multiple YouTube videos at once
   - Use parallel API requests
   - Show progress for each video

4. **Transcript Editing**:
   - Allow users to view and edit transcripts in UI
   - Export transcripts as text, PDF, or subtitles

5. **YouTube Playlist Support**:
   - Transcribe entire playlists
   - Generate summary across multiple videos

6. **Alternative OAuth Providers**:
   - Add support for other providers (Twitter, LinkedIn, etc.)
   - Enable features based on granted scopes

---

## 15. Conclusion

This plan provides a comprehensive roadmap for implementing dual OAuth2 authentication alongside the existing JWT system. The architecture prioritizes:

- **User Control**: Optional opt-in feature with clear benefits
- **Backward Compatibility**: Existing features unchanged
- **Security**: Robust token management and CSRF protection
- **Reliability**: Automatic fallback to Whisper
- **Maintainability**: Isolated, well-documented code

**Estimated Development Time**: 2-3 weeks
**Estimated Testing Time**: 1 week
**Total Timeline**: 3-4 weeks

**Next Steps**:
1. Review this plan with stakeholders
2. Set up Google Cloud Console OAuth credentials
3. Begin Phase 1 implementation (backend OAuth endpoints)
4. Proceed through phases 2-5 as outlined

---

## Appendix A: API Reference

### OAuth Endpoints

#### GET /oauth/callback
**Purpose**: OAuth2 callback endpoint (receives authorization code from Google)

**Query Parameters**:
- `code` (string): Authorization code
- `state` (string): CSRF protection token
- `error` (string, optional): Error code if user denied

**Response**: HTML page with JavaScript postMessage

---

#### POST /oauth/refresh
**Purpose**: Refresh expired access token

**Headers**:
- `Authorization: Bearer <jwt>` (required)

**Request Body**:
```json
{
  "refresh_token": "string"
}
```

**Response**:
```json
{
  "access_token": "string",
  "expires_at": 1234567890,
  "refresh_token": "string",
  "scope": "string",
  "token_type": "Bearer"
}
```

---

#### POST /oauth/revoke
**Purpose**: Revoke OAuth token

**Headers**:
- `Authorization: Bearer <jwt>` (required)

**Request Body**:
```json
{
  "token": "string"
}
```

**Response**:
```json
{
  "success": true
}
```

---

## Appendix B: Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | Yes (existing) | OAuth2 client ID | `123456789-abc...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Yes (new) | OAuth2 client secret | `GOCSPX-abc123...` |
| `OAUTH_REDIRECT_URI` | Yes (new) | OAuth callback URL | `https://...lambda-url.../oauth/callback` |
| `ALLOWED_EMAILS` | Yes (existing) | Email whitelist | `user@example.com,admin@example.com` |

---

## Appendix C: File Structure

### New Files
```
src/
  endpoints/
    oauth.js                          # OAuth endpoint handlers
  youtube-api.js                      # YouTube API integration

ui-new/
  src/
    contexts/
      YouTubeAuthContext.tsx          # OAuth state management
    config/
      oauth.ts                        # OAuth configuration
```

### Modified Files
```
src/
  index.js                            # Add OAuth routes
  tools.js                            # Modify transcribe_url tool
  endpoints/
    chat.js                           # Pass YouTube token to tools

ui-new/
  src/
    components/
      SettingsModal.tsx               # Add YouTube section
    api/
      chat.ts                         # Include YouTube token in requests
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-XX  
**Author**: GitHub Copilot  
**Status**: Planning Phase (No Implementation Yet)
