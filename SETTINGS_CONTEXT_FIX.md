# Settings Context Fix - Immediate Provider Changes

## Problem

When changing provider settings (e.g., from Groq to OpenAI) in the Settings modal, the chat continued to use the old provider/models until the page was reloaded. This was confusing and broke the user experience.

## Root Cause

The application had **decentralized settings management**:

1. **SettingsModal** used `useLocalStorage('app_settings')` to read and write settings
2. **ChatTab** also used `useLocalStorage('app_settings')` to read settings
3. Both components had their own independent state

When SettingsModal saved changes to localStorage, ChatTab's state didn't update because:
- `useLocalStorage` only reads from localStorage on component mount
- There was no mechanism to notify ChatTab that settings had changed
- ChatTab kept using stale settings until page reload forced re-initialization

## Solution

Implemented centralized settings management using **React Context**:

### 1. Created SettingsContext (`ui-new/src/contexts/SettingsContext.tsx`)

```typescript
export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useLocalStorage<Settings>('app_settings', {
    provider: 'groq',
    llmApiKey: '',
    tavilyApiKey: '',
    apiEndpoint: 'https://api.groq.com/openai/v1',
    // ... default settings
  });

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
```

### 2. Wrapped App with SettingsProvider (`ui-new/src/App.tsx`)

```typescript
function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SettingsProvider>  {/* NEW */}
            <PlaylistProvider>
              <SearchResultsProvider>
                <SwagProvider>
                  <AppContent />
                </SwagProvider>
              </SearchResultsProvider>
            </PlaylistProvider>
          </SettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
```

### 3. Updated SettingsModal to use context

**Before**:
```typescript
const [settings, setSettings] = useLocalStorage<Settings>('app_settings', { ... });
```

**After**:
```typescript
const { settings, setSettings } = useSettings();
```

### 4. Updated ChatTab to use context

**Before**:
```typescript
const [settings] = useLocalStorage('app_settings', {
  provider: 'groq',
  llmApiKey: '',
  // ...
});
```

**After**:
```typescript
const { settings } = useSettings();
```

## Benefits

1. **Immediate Updates**: Settings changes take effect immediately across all components
2. **Single Source of Truth**: Only one place manages settings state
3. **Type Safety**: Centralized Settings type definition
4. **Better Architecture**: Follows React best practices for shared state
5. **No Page Reload Required**: User experience is smooth and intuitive

## Testing

To verify the fix works:

1. Open the app and start a chat
2. Note the current provider (check LLM Calls section to see which models are being used)
3. Open Settings modal
4. Change provider from Groq to OpenAI (or vice versa)
5. Save settings
6. Send a new message
7. Check LLM Calls section - should show the new provider's models immediately

**Expected behavior**: Next chat message uses the newly selected provider without any page reload.

## Technical Details

**React Context Flow**:
1. SettingsProvider wraps the entire app tree
2. Uses `useLocalStorage` hook to persist settings to localStorage
3. Exposes `{ settings, setSettings }` via context
4. Any component calling `useSettings()` gets reactive access to settings
5. When SettingsModal calls `setSettings()`, all consumers automatically re-render with new settings

**Persistence**:
- Settings still persist to localStorage via `useLocalStorage` in the provider
- All components share the same state instance
- Page reload still loads settings from localStorage (no data loss)

## Files Changed

1. **NEW**: `ui-new/src/contexts/SettingsContext.tsx` - Settings context provider
2. **MODIFIED**: `ui-new/src/App.tsx` - Added SettingsProvider wrapper
3. **MODIFIED**: `ui-new/src/components/SettingsModal.tsx` - Use context instead of local state
4. **MODIFIED**: `ui-new/src/components/ChatTab.tsx` - Use context instead of local state

## Deployment

- **Frontend**: Deployed to GitHub Pages
- **Build**: index-DssVKPLj.js (2025-10-08)
- **Commit**: 4d58df2 - "fix: Settings changes now apply immediately without page reload (using React context)"
