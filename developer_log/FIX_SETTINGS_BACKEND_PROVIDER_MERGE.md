# Fix: Settings UI Backend Provider Merge Issue

**Date**: 2025-01-27
**Status**: ✅ COMPLETE

## Problem

The Settings UI was incorrectly loading server-configured providers (from environment variables via the `/billing` endpoint) and **merging them into the user's local settings**. This violated the architectural separation between:

1. **User-Configured Providers**: Stored in localStorage, editable by users
2. **Server-Configured Providers**: From environment variables, display-only

### Symptoms

- Backend providers appeared in the user's editable provider list
- Settings state contained both local and backend providers
- API keys (even though empty) were stored in frontend settings
- Violated the principle that server providers should be "display-only"

### Root Cause

In `ui-new/src/contexts/SettingsContext.tsx`, lines 62-115 contained a `useEffect` hook that:
1. Fetched backend providers via `getBackendProviders()` API
2. Converted them to `ProviderConfig` format
3. **Merged them into `settings.providers` array** (lines 95-103)
4. Updated the settings state with merged providers

```tsx
// PROBLEMATIC CODE (removed):
const mergedProviders = [
  ...settings.providers, // Local providers first
  ...convertedProviders.filter(bp => !localProviderIds.has(bp.id))
];

setRawSettings({
  ...settings,
  providers: mergedProviders // ⚠️ Backend providers merged into settings
});
```

## Solution

### Changes Made

**File**: `ui-new/src/contexts/SettingsContext.tsx`

1. **Removed** lines 62 (state variable):
   - `const [backendProvidersLoaded, setBackendProvidersLoaded] = useState(false);`

2. **Removed** lines 66-115 (entire useEffect):
   - Backend provider loading logic
   - Provider conversion and merge logic

3. **Removed** unused import:
   - `import { getBackendProviders } from '../utils/api';`

### Architecture

The correct architecture is now enforced:

```
┌─────────────────────────────────────────────────┐
│ SettingsContext                                 │
│                                                  │
│ - Stores only user-configured providers         │
│ - Persists to localStorage                      │
│ - Syncs with Google Drive (optional)            │
│ - NO backend providers                          │
└─────────────────────────────────────────────────┘
                    │
                    │ provides settings to
                    ↓
┌─────────────────────────────────────────────────┐
│ SettingsModal                                   │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ ServerProviders Component                   │ │
│ │ - Fetches from /billing endpoint           │ │
│ │ - Display-only (read-only)                 │ │
│ │ - Shows server provider capabilities       │ │
│ │ - Independent data fetching                │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ ProviderList Component                      │ │
│ │ - Shows settings.providers only            │ │
│ │ - Editable (add/edit/delete/enable)        │ │
│ │ - User-configured providers                │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Key Principles

1. **Separation of Concerns**:
   - `SettingsContext`: Stores ONLY user-configured providers
   - `ServerProviders`: Displays ONLY server-configured providers

2. **Data Flow**:
   - User providers: localStorage ↔ SettingsContext ↔ ProviderList
   - Server providers: /billing endpoint → ServerProviders (display)

3. **Security**:
   - Server provider API keys NEVER exposed to frontend
   - Backend providers NEVER stored in browser storage
   - Frontend only sees provider capabilities, not credentials

4. **Display-Only**:
   - ServerProviders component is read-only
   - Shows users what providers are available on server
   - No edit/delete/enable functionality for backend providers

## Testing

### Verification Steps

1. **Settings State**:
   - Open DevTools → Application → localStorage
   - Check `settings` key
   - Verify `providers` array contains ONLY user-configured providers

2. **ServerProviders Display**:
   - Open Settings Modal → Provider Credentials
   - Verify "⚡ Server-Configured Providers" section appears
   - Verify it shows backend providers with capabilities
   - Verify no API keys are displayed

3. **ProviderList**:
   - Verify "👤 User-Configured Providers" section is separate
   - Verify only user providers can be edited/deleted
   - Verify backend providers don't appear here

4. **Console Logs**:
   - Verify no "🔄 Loading backend providers..." log
   - Verify no "🔀 Merged providers..." log
   - ServerProviders component should log its own fetch

### Expected Behavior

**Before Fix**:
```json
// settings.providers contained both user AND backend providers
{
  "providers": [
    {"id": "user-groq-1", "source": "user", ...},
    {"id": "env-openai-1", "source": "env", ...}  // ❌ Backend provider
  ]
}
```

**After Fix**:
```json
// settings.providers contains ONLY user providers
{
  "providers": [
    {"id": "user-groq-1", "source": "user", ...}
  ]
}
// Backend providers are fetched independently by ServerProviders component
```

## Impact

### Positive Effects

1. **Cleaner Architecture**: Proper separation between user and server providers
2. **Security**: Backend provider credentials never touch localStorage
3. **Simpler State**: SettingsContext only manages user settings
4. **Independent Components**: ServerProviders can fetch/display independently

### No Regressions

- User-configured providers still work (add/edit/delete/enable)
- Server-configured providers still displayed (via ServerProviders component)
- Google Drive sync unaffected (only syncs user providers)
- Provider priority system unaffected (backend providers have priority)

## Related Files

- `ui-new/src/contexts/SettingsContext.tsx` - Fixed (removed merge logic)
- `ui-new/src/components/ServerProviders.tsx` - Unchanged (already correct)
- `ui-new/src/components/SettingsModal.tsx` - Unchanged (layout correct)
- `ui-new/src/components/ProviderList.tsx` - Unchanged (uses settings.providers)
- `ui-new/src/utils/api.ts` - Unchanged (getBackendProviders still used by ServerProviders)

## Notes

- The `getBackendProviders()` function in `utils/api.ts` is still used by `ServerProviders.tsx` component
- This fix enforces the intended architecture: user settings are local, server providers are remote
- The UI now correctly shows two separate sections in Settings Modal
- Backend providers can still be prioritized via server-side configuration (not affected)

## Backend API Security Enhancement

**Additional Fix**: Removed API key exposure from billing endpoint

### Changes Made

**File**: `src/endpoints/billing.js` (lines 195-231)

**Removed**:
```javascript
// Show masked API key preview for identification
if (provider.apiKey) {
    const key = provider.apiKey;
    capability.apiKeyPreview = key.length > 8 
        ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}`
        : '****';
}
```

**Added**:
```javascript
// NOTE: API keys are NEVER sent to frontend (not even masked)
// Provider is configured on server side only
```

### UI Updates

**File**: `ui-new/src/components/ServerProviders.tsx`

**Removed**:
```tsx
{provider.apiKeyPreview && (
  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
    API Key: {provider.apiKeyPreview}
  </div>
)}
```

**Added**:
```tsx
<div className="text-xs text-green-600 dark:text-green-400 mt-1">
  🔒 Configured on server (API key not exposed)
</div>
```

### TypeScript Interface Updates

**Files**: 
- `ui-new/src/components/ServerProviders.tsx`
- `ui-new/src/utils/api.ts`

**Removed**: `apiKeyPreview?: string;` field from `ProviderCapability` and `BackendProvider` interfaces

**Added**: Security comment: `// NOTE: API keys are NEVER sent from backend (security)`

### Security Impact

- ✅ **Before**: Masked API keys like `gsk_...xxxx` were sent to frontend
- ✅ **After**: Zero API key information sent to frontend
- ✅ **Defense in Depth**: Even if billing endpoint is compromised, no key info available
- ✅ **User Clarity**: UI explicitly states "API key not exposed"

## References

- Issue identified in conversation: "it seems like the settings UI is loading the server provider config into the UI settings"
- User requirement: "server UI section should only show the available providers... don't show the keys"
- User requirement: "ensure that when the backend sends the provider data through the billing endpoint no keys are sent"
- Architecture intent: "server UI section is only meant to show the user that there are options"
