# Google Drive/Sheets Sync - Integration Plan

## Current State Analysis

### Existing OAuth2 Infrastructure ✅
The system already has a complete OAuth2 implementation:
- **Endpoints**: `/oauth/callback`, `/oauth/refresh`, `/oauth/revoke`
- **Purpose**: YouTube Transcript API access
- **Flow**: Client-side OAuth via popup → backend exchanges code for tokens → tokens stored in localStorage
- **Auth**: JWT authentication required for refresh/revoke endpoints

### Current Authentication Layers
1. **JWT Authentication** - Required for all Lambda API calls
2. **Google OAuth (YouTube)** - Optional, for YouTube transcript access

## New Requirements

### Add: Google OAuth (Drive/Sheets Sync) - Third Auth Layer
- **Purpose**: Sync user data to Google Drive and Sheets
- **Trigger**: User enables "Cloud Sync" in settings
- **Scope**: `drive.file` (app-created files only) + `spreadsheets`
- **Token Storage**: Server-side in Google Sheets (for token refresh)

## Implementation Strategy

### Phase 1: Reuse Existing OAuth Infrastructure ✅

**Current Implementation**:
```javascript
// src/endpoints/oauth.js
- oauthCallbackEndpoint() - Exchange code for tokens
- oauthRefreshEndpoint() - Refresh expired tokens
- oauthRevokeEndpoint() - Revoke tokens
```

**What We Need**:
1. **Extend scopes** to include Drive + Sheets when user connects for sync
2. **Store refresh tokens server-side** (currently only stored client-side)
3. **Add token management** in Google Sheets

### Phase 2: Server-Side Token Storage

**Storage Location**: Google Sheets service logging spreadsheet
- **Sheet Name**: `oauth_tokens`
- **Columns**: `email | service | refresh_token | access_token | expires_at | created_at | updated_at`
- **Services**: `youtube`, `drive_sheets`

**Lifetime Management**:
- Access tokens expire after 1 hour → auto-refresh
- Refresh tokens valid until revoked → store server-side
- Clear tokens when: user disconnects, token invalid, manual revoke

### Phase 3: Conditional Sync

**Settings**:
```typescript
interface Settings {
  // ... existing settings
  cloudSync: {
    enabled: boolean;           // Master switch
    googleDriveConnected: boolean;  // OAuth state
    lastSync: string | null;    // ISO timestamp
    autoSync: boolean;          // Auto vs manual
    syncInterval: number;       // Minutes (default 5)
  }
}
```

**Sync Logic**:
```typescript
// Only sync if ALL conditions met:
if (
  settings.cloudSync.enabled &&           // User enabled sync
  settings.cloudSync.googleDriveConnected && // OAuth completed
  hasValidToken()                          // Token not expired
) {
  performSync();
}
```

### Phase 4: Token Refresh Flow

**Client-Side**:
1. Check if access token expired (expires_at < now)
2. If expired, call `/oauth/refresh` with refresh token
3. Update localStorage with new access token
4. Retry sync operation

**Server-Side**:
1. Receive refresh token from client
2. Look up stored refresh token in Sheets (verify it matches)
3. Call Google OAuth2 API to refresh
4. Return new access token
5. Update Sheets with new access_token and expires_at

**Security**:
- Client sends refresh token in body (not headers)
- Server verifies JWT first (user must be authenticated)
- Server checks refresh token matches stored value (prevents token theft)
- Refresh tokens encrypted at rest (optional, for extra security)

## Implementation Tasks

### Backend Changes (src/)

1. **Extend `/oauth/callback`**:
   ```javascript
   // Add scope parameter to distinguish YouTube vs Drive/Sheets
   // Store refresh token in Sheets when service=drive_sheets
   ```

2. **Update `/oauth/refresh`**:
   ```javascript
   // Verify refresh token against stored value in Sheets
   // Update stored access_token and expires_at
   ```

3. **Update `/oauth/revoke`**:
   ```javascript
   // Clear tokens from Sheets when service specified
   ```

4. **Create `src/services/oauth-token-storage.js`**:
   ```javascript
   async function storeTokens(email, service, tokens)
   async function getTokens(email, service)
   async function updateAccessToken(email, service, accessToken, expiresAt)
   async function clearTokens(email, service)
   ```

### Frontend Changes (ui-new/src/)

1. **Update `services/googleApi.ts`**:
   - Use existing OAuth flow (popup → callback)
   - Store tokens in localStorage
   - Auto-refresh on expiry
   - Call backend `/oauth/refresh` endpoint

2. **Update `contexts/SettingsContext.tsx`**:
   - Add `cloudSync` settings section
   - Save to localStorage + IndexedDB

3. **Create `components/CloudSyncSettings.tsx`**:
   - "Connect Google Account" button
   - Display connected email
   - "Disconnect" button
   - Sync status (last sync time, pending changes)
   - Manual "Sync Now" button

4. **Update `services/unifiedSync.ts`**:
   - Check `cloudSync.enabled` before syncing
   - Check token validity
   - Auto-refresh if needed
   - Handle 401 errors (token revoked)

## OAuth Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ User clicks "Connect Google Account" for Cloud Sync             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ Open OAuth popup          │
         │ Scopes:                   │
         │ - drive.file              │
         │ - spreadsheets            │
         │ State: service=drive_sync │
         └──────────┬────────────────┘
                    │
                    ▼
         ┌──────────────────────────┐
         │ User grants permissions  │
         └──────────┬───────────────┘
                    │
                    ▼
         ┌──────────────────────────────────────┐
         │ Redirect to /oauth/callback          │
         │ Backend exchanges code for tokens    │
         │ Checks state param = drive_sync      │
         └──────────┬───────────────────────────┘
                    │
                    ▼
         ┌──────────────────────────────────────┐
         │ Store refresh_token in Sheets:       │
         │ oauth_tokens[email][drive_sheets]    │
         └──────────┬───────────────────────────┘
                    │
                    ▼
         ┌──────────────────────────────────────┐
         │ Return tokens to client via          │
         │ postMessage → store in localStorage  │
         └──────────┬───────────────────────────┘
                    │
                    ▼
         ┌──────────────────────────────────────┐
         │ Update settings:                     │
         │ cloudSync.enabled = true             │
         │ cloudSync.googleDriveConnected=true  │
         └──────────┬───────────────────────────┘
                    │
                    ▼
         ┌──────────────────────────────────────┐
         │ Start periodic sync (every 5 min)    │
         └──────────────────────────────────────┘
```

## Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Sync triggered (auto or manual)                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ Check token expiry        │
         │ expires_at < Date.now()   │
         └──────────┬────────────────┘
                    │
              ┌─────┴─────┐
              │ Expired?  │
              └─────┬─────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    YES  │                     │  NO
         │                     │
         ▼                     ▼
┌────────────────────┐  ┌──────────────┐
│ POST /oauth/refresh│  │ Use existing │
│ {                  │  │ access_token │
│   refresh_token    │  └──────────────┘
│ }                  │
└────────┬───────────┘
         │
         ▼
┌────────────────────────────────┐
│ Backend:                       │
│ 1. Verify JWT                  │
│ 2. Get stored refresh_token    │
│    from Sheets                 │
│ 3. Verify tokens match         │
│ 4. Call Google OAuth API       │
│ 5. Get new access_token        │
│ 6. Update Sheets               │
│ 7. Return new token to client  │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│ Client:                        │
│ 1. Update localStorage         │
│ 2. Retry sync with new token   │
└────────────────────────────────┘
```

## Security Considerations

### ✅ Current Security
- JWT authentication for all API calls
- OAuth tokens only accessible to authenticated user
- Refresh tokens not exposed in URLs or logs

### ⚠️ New Security Concerns
- **Refresh tokens stored server-side**: Encrypted? Access control?
- **Token theft**: Verify refresh token matches on refresh
- **Scope creep**: Limit to `drive.file` (not full Drive access)

### 🔒 Mitigations
1. **Encrypt refresh tokens** in Sheets (optional, AES-256)
2. **Rate limiting** on `/oauth/refresh` (prevent brute force)
3. **Audit logging** in Sheets (who accessed when)
4. **Token rotation** on refresh (invalidate old refresh token)
5. **Revoke on suspicious activity** (multiple failed refreshes)

## Testing Plan

### Unit Tests
- [ ] OAuth callback with drive_sheets scope
- [ ] Token storage in Sheets
- [ ] Token refresh flow
- [ ] Token revocation
- [ ] Expired token handling

### Integration Tests
- [ ] Connect Google account (OAuth popup)
- [ ] Sync data to Drive
- [ ] Sync data to Sheets
- [ ] Token auto-refresh during sync
- [ ] Disconnect account (revoke tokens)
- [ ] Reconnect after disconnect

### E2E Tests
- [ ] Full flow: connect → sync → disconnect
- [ ] Multi-device sync (same Google account)
- [ ] Offline → online transition
- [ ] Token expiry during sync
- [ ] Sync conflict resolution

## Rollout Strategy

### Phase 1: Backend (No UI)
- Add token storage in Sheets
- Extend OAuth endpoints
- Test with curl/Postman

### Phase 2: Settings UI
- Add Cloud Sync settings section
- "Connect Google Account" button
- Test OAuth flow

### Phase 3: Sync Integration
- Wire up Drive/Sheets sync
- Test auto-sync
- Monitor token refresh

### Phase 4: Production
- Deploy to Lambda
- Enable for beta users
- Collect feedback
- Full rollout

## Open Questions

1. **Token Encryption**: Should we encrypt refresh tokens in Sheets?
   - **Recommendation**: Yes, use AES-256 with key from environment variables

2. **Sync Conflicts**: What happens if local and cloud data differ?
   - **Recommendation**: Show diff dialog, let user choose (merge/overwrite/keep local)

3. **Quota Limits**: What if user hits Drive/Sheets quota?
   - **Recommendation**: Catch 403 errors, show upgrade message

4. **Multi-Device**: How to handle same user on multiple devices?
   - **Recommendation**: Last-write-wins with timestamp, show conflict warning

5. **Offline Edits**: Queue changes while offline?
   - **Recommendation**: Yes, use unifiedSync queue system (already implemented)

## Success Metrics

- **OAuth Success Rate**: >95% of connection attempts succeed
- **Sync Reliability**: >99% of syncs succeed
- **Token Refresh**: >99% of refreshes succeed
- **User Adoption**: >20% of users enable cloud sync
- **Sync Latency**: <5 seconds for average dataset
- **Error Rate**: <1% of syncs fail
- **Token Security**: 0 token theft incidents

---

**Status**: Planning complete, ready for implementation
**Next Step**: Implement backend token storage
