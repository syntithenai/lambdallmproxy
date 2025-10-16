# Provider Enabled Field Fix

## Problem
When adding a new provider in the Settings UI, the `enabled` field was not being set. This caused the provider to be filtered out when sending chat or planning requests because the code filters providers with:

```typescript
const enabledProviders = settings.providers.filter(p => p.enabled === true);
```

Since newly added providers had `enabled: undefined`, they failed the `=== true` check and were excluded from API requests.

## Root Cause

In `ui-new/src/hooks/useProviders.ts`, the `addProvider` function created new providers without setting the `enabled` field:

```typescript
// OLD CODE (line 39-42):
const newProvider: ProviderConfig = {
  ...provider,
  id: crypto.randomUUID(),
};
```

## Solution

Modified the `addProvider` function to explicitly set `enabled: true` for new providers:

```typescript
// NEW CODE (line 39-43):
const newProvider: ProviderConfig = {
  ...provider,
  id: crypto.randomUUID(),
  enabled: true, // Default new providers to enabled
};
```

## Impact

### Before Fix:
1. User adds new provider in Settings
2. Provider saved to localStorage with `enabled: undefined`
3. ChatTab filters providers: `filter(p => p.enabled === true)`
4. New provider excluded (undefined !== true)
5. No API calls use the new provider
6. User sees errors or no responses

### After Fix:
1. User adds new provider in Settings
2. Provider saved to localStorage with `enabled: true`
3. ChatTab filters providers: `filter(p => p.enabled === true)`
4. New provider included ✅
5. API calls use the new provider
6. Everything works as expected

## Files Modified

**`ui-new/src/hooks/useProviders.ts`** (line 41):
- Added `enabled: true` to new provider object

## Related Code

### Where Providers are Filtered

**ChatTab.tsx** (lines 1523, 2578):
```typescript
const enabledProviders = settings.providers.filter(p => p.enabled === true);
```

**PlanningTab.tsx** (line 71):
```typescript
const enabledProviders = settings.providers.filter(p => p.enabled === true);
```

### How Providers are Sent to Backend

**generatePlan()** in `api.ts` (lines 343-349):
```typescript
const enabledProviders = providers.filter(p => p.enabled !== false);
const providersMap: Record<string, { apiKey: string; [key: string]: any }> = {};

enabledProviders.forEach(provider => {
  const { type, enabled, ...providerConfig } = provider;
  providersMap[type] = providerConfig;
});
```

**sendChatMessageStreaming()** in `api.ts`:
- Passes `providers` array directly in request body
- Backend receives and processes enabled providers

## Testing

### Before Testing:
If you have providers in Settings that were added before this fix, they may have `enabled: undefined`. To fix them:

1. Open browser console
2. Run: `localStorage.getItem('app_settings')`
3. Check if your providers have `enabled: undefined`
4. If so, either:
   - Delete and re-add the provider in Settings UI
   - Or manually edit localStorage:
     ```javascript
     let settings = JSON.parse(localStorage.getItem('app_settings'));
     settings.providers.forEach(p => { if (p.enabled === undefined) p.enabled = true; });
     localStorage.setItem('app_settings', JSON.stringify(settings));
     location.reload();
     ```

### Test Scenarios:

1. **Add New Provider**:
   - Go to Settings → Provider tab
   - Click "+ Add Provider"
   - Fill in provider details (type, API key)
   - Click "Save"
   - **Verify**: Provider should be enabled (green checkmark)

2. **Send Chat Message**:
   - Add a message in Chat tab
   - Press Enter
   - **Verify**: API request should include your provider
   - Check browser Network tab → `/chat` request → Request Payload → `providers` field

3. **Generate Plan**:
   - Go to Planning tab
   - Enter research query
   - Click "Generate Plan"
   - **Verify**: API request should include your provider
   - Check browser Network tab → `/planning` request → Request Payload → `providers` field

4. **Toggle Provider**:
   - In Settings, click the checkmark to disable provider
   - **Verify**: Checkmark turns to ✗ and text says "DISABLED"
   - Try sending message/generating plan
   - **Verify**: Provider not included in request
   - Click ✗ to re-enable
   - **Verify**: Provider works again

## Debugging

If providers still not being sent:

1. **Check localStorage**:
   ```javascript
   JSON.parse(localStorage.getItem('app_settings')).providers
   ```
   Each provider should have `enabled: true`

2. **Check filter logic**:
   - Open ChatTab.tsx or PlanningTab.tsx
   - Add console.log before sending request:
     ```typescript
     console.log('Enabled providers:', enabledProviders);
     ```

3. **Check Network requests**:
   - Open DevTools → Network tab
   - Find `/chat` or `/planning` request
   - Look at Request Payload → `providers` field
   - Should contain your provider's apiKey

4. **Check backend logs**:
   - If using local backend, check terminal output
   - Look for provider initialization messages

## Related Issues

- Users reported: "my ui provider settings are not being sent with chat or planning requests"
- Root cause: `enabled` field not set on new providers
- Solution: Default `enabled: true` when creating provider

## Implementation Date
October 15, 2025

---

**Status**: ✅ Fixed
**Build**: ✅ Passing  
**Impact**: All newly added providers now work immediately
**Action Required**: Users with existing providers may need to delete and re-add them, or manually fix localStorage
