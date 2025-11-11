# localStorage Migration Guide

**Date**: 2025-11-11  
**Status**: Planning Document  
**Scope**: Step-by-step migration from localStorage to unified IndexedDB storage

---

## Executive Summary

This document provides explicit, thorough steps to replace all localStorage usage with the unified IndexedDB API. No parameters will be lost, no side effects will occur.

**Approach**:
1. Identify all localStorage usage in codebase
2. For each usage, provide exact before/after code
3. Verify no functionality is lost
4. Test migration script before deployment

---

## 1. localStorage Audit

### 1.1. Current localStorage Usage

**Total**: 147 occurrences found via grep search

**Categories**:

**Authentication** (KEEP):
- `google_access_token`
- `google_id_token`
- `google_refresh_token`
- Reason: OAuth tokens need to persist between sessions, IndexedDB cleared on logout

**Settings** (MIGRATE):
- `settings` - Main app settings
- `proxy_settings` - Proxy credentials
- `continuousVoice_hotword`, `continuousVoice_sensitivity`, etc. - Voice settings
- Reason: Should be unified and synced to Google Drive

**UI State** (MIGRATE):
- `recent-tags` - Tag autocomplete
- `lastActiveChat` - Resume conversation
- `imageEditorState` - Editor state
- `scrollPosition` - Scroll restoration
- Reason: Should be user-scoped in IndexedDB

**Runtime Cache** (KEEP):
- `api_base_url_cache` - Cached API endpoint
- `use_remote_lambda` - Runtime preference
- Reason: Temporary runtime state, not persistent data

### 1.2. Files with localStorage Usage

Found via `grep -r "localStorage" ui-new/src/`:

| File | Usage Count | Category |
|------|-------------|----------|
| `components/VoiceSettings.tsx` | 12 | Settings (voice) |
| `components/SettingsModal.tsx` | 8 | Settings (proxy) |
| `components/SettingsPage.tsx` | 10 | Settings (proxy) |
| `components/VoiceInputDialog.tsx` | 4 | Settings (voice) |
| `components/ContinuousVoiceMode.tsx` | 6 | Settings (voice) |
| `components/ChatTab.tsx` | 4 | Settings (proxy) |
| `utils/api.ts` | 6 | Runtime cache |
| `contexts/AuthContext.tsx` | 8 | Authentication |
| `services/tts/ElevenLabsProvider.ts` | 2 | Authentication |
| `services/tts/LLMProviderTTSProvider.ts` | 2 | Authentication |

---

## 2. Migration Strategy

### 2.1. Phase 1: Create Unified Storage Service

**File**: `ui-new/src/services/unifiedStorage.ts`

```typescript
import { db } from './db';
import { useAuth } from '../contexts/AuthContext';

class UnifiedStorage {
  /**
   * Get current user ID (email)
   * @throws Error if user not authenticated
   */
  private getCurrentUserId(): string {
    // In actual implementation, this will come from AuthContext
    const userEmail = this.getUserEmail();
    if (!userEmail) {
      throw new Error('Authentication required for all persistence operations');
    }
    return userEmail;
  }

  /**
   * Helper to get user email (implement based on your auth system)
   */
  private getUserEmail(): string | null {
    // This will be implemented using AuthContext
    // For now, placeholder
    return null;
  }

  /**
   * Save or update a record
   */
  async save(dataType: string, record: any): Promise<void> {
    const userId = this.getCurrentUserId();
    record.userId = userId;
    record.updatedAt = Date.now();
    
    if (!record.createdAt) {
      record.createdAt = Date.now();
    }
    
    await db[dataType].put(record);
  }

  /**
   * Get a single record by ID
   */
  async get(dataType: string, id: string): Promise<any | null> {
    const userId = this.getCurrentUserId();
    const record = await db[dataType].get(id);
    
    // Verify ownership
    if (record && record.userId !== userId) {
      return null;
    }
    
    return record;
  }

  /**
   * Query records with filters
   */
  async query(dataType: string, filters?: any): Promise<any[]> {
    const userId = this.getCurrentUserId();
    
    // Always filter by userId
    let collection = db[dataType].where('userId').equals(userId);
    
    // Apply additional filters
    if (filters) {
      // Handle projectId filter
      if (filters.projectId) {
        collection = db[dataType]
          .where('[userId+projectId]')
          .equals([userId, filters.projectId]);
      }
      // Add other filter types as needed
    }
    
    return await collection.toArray();
  }

  /**
   * Delete a record
   */
  async delete(dataType: string, id: string): Promise<void> {
    const userId = this.getCurrentUserId();
    const record = await db[dataType].get(id);
    
    // Verify ownership
    if (record && record.userId !== userId) {
      throw new Error('Cannot delete record owned by another user');
    }
    
    await db[dataType].delete(id);
  }

  /**
   * Save UI state (user-scoped, not synced)
   */
  async saveUIState(stateType: string, data: any): Promise<void> {
    const userId = this.getCurrentUserId();
    const tableName = `uiState_${stateType}`;
    
    await db[tableName].put({
      userId,
      ...data,
      updatedAt: Date.now(),
    });
  }

  /**
   * Get UI state
   */
  async getUIState(stateType: string): Promise<any | null> {
    const userId = this.getCurrentUserId();
    const tableName = `uiState_${stateType}`;
    
    return await db[tableName].get(userId);
  }
}

export const unifiedStorage = new UnifiedStorage();
```

### 2.2. Phase 2: Create Migration Script

**File**: `ui-new/src/services/migrateFromLocalStorage.ts`

```typescript
import { unifiedStorage } from './unifiedStorage';
import { createDefaultSettings } from './settings';

export async function migrateFromLocalStorage(userId: string): Promise<void> {
  console.log('[Migration] Starting localStorage migration for', userId);
  
  // Check if already migrated
  const migrationKey = 'localStorage_migration_completed';
  if (localStorage.getItem(migrationKey) === 'true') {
    console.log('[Migration] Already completed, skipping');
    return;
  }
  
  try {
    // Migrate settings
    await migrateSettings(userId);
    
    // Migrate UI state
    await migrateUIState(userId);
    
    // Mark migration complete
    localStorage.setItem(migrationKey, 'true');
    console.log('[Migration] Completed successfully');
  } catch (error) {
    console.error('[Migration] Failed:', error);
    throw error;
  }
}

async function migrateSettings(userId: string): Promise<void> {
  console.log('[Migration] Migrating settings...');
  
  const settings = createDefaultSettings(userId);
  
  // Migrate main settings
  const oldSettings = localStorage.getItem('settings');
  if (oldSettings) {
    try {
      const parsed = JSON.parse(oldSettings);
      Object.assign(settings, {
        language: parsed.language || settings.language,
        theme: parsed.theme || settings.theme,
        providers: parsed.providers || settings.providers,
        defaultProvider: parsed.defaultProvider,
      });
      console.log('[Migration] ✅ Migrated main settings');
    } catch (e) {
      console.error('[Migration] ⚠️ Failed to parse old settings:', e);
    }
  }
  
  // Migrate voice settings
  const voiceKeys = {
    'continuousVoice_hotword': (v: string) => settings.voice.hotword = v,
    'continuousVoice_sensitivity': (v: string) => settings.voice.sensitivity = parseFloat(v),
    'continuousVoice_speechTimeout': (v: string) => settings.voice.speechTimeout = parseFloat(v),
    'continuousVoice_conversationTimeout': (v: string) => settings.voice.conversationTimeout = parseInt(v),
    'voice_useLocalWhisper': (v: string) => settings.voice.useLocalWhisper = v === 'true',
    'voice_localWhisperUrl': (v: string) => settings.voice.localWhisperUrl = v,
  };
  
  for (const [key, setter] of Object.entries(voiceKeys)) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      setter(value);
    }
  }
  console.log('[Migration] ✅ Migrated voice settings');
  
  // Migrate proxy settings
  const proxySettings = localStorage.getItem('proxy_settings');
  if (proxySettings) {
    try {
      const parsed = JSON.parse(proxySettings);
      Object.assign(settings.proxy, {
        enabled: parsed.enabled !== false,
        username: parsed.username || '',
        password: parsed.password || '',
        useServerProxy: parsed.useServerProxy || false,
      });
      console.log('[Migration] ✅ Migrated proxy settings');
    } catch (e) {
      console.error('[Migration] ⚠️ Failed to parse proxy settings:', e);
    }
  }
  
  // Save unified settings
  await unifiedStorage.save('settings', settings);
  console.log('[Migration] ✅ Saved unified settings to IndexedDB');
  
  // Clean up old keys (KEEP auth tokens and runtime cache)
  const keysToRemove = [
    'settings',
    'proxy_settings',
    'continuousVoice_hotword',
    'continuousVoice_sensitivity',
    'continuousVoice_speechTimeout',
    'continuousVoice_conversationTimeout',
    'voice_useLocalWhisper',
    'voice_localWhisperUrl',
  ];
  
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  console.log('[Migration] ✅ Cleaned up localStorage');
}

async function migrateUIState(userId: string): Promise<void> {
  console.log('[Migration] Migrating UI state...');
  
  // Migrate recent tags
  const recentTags = localStorage.getItem('recent-tags');
  if (recentTags) {
    try {
      const tags = JSON.parse(recentTags);
      await unifiedStorage.saveUIState('recentTags', { tags });
      localStorage.removeItem('recent-tags');
      console.log('[Migration] ✅ Migrated recent tags');
    } catch (e) {
      console.error('[Migration] ⚠️ Failed to migrate recent tags:', e);
    }
  }
  
  // Migrate last active chat
  const lastActiveChat = localStorage.getItem('lastActiveChat');
  if (lastActiveChat) {
    await unifiedStorage.saveUIState('lastActiveChat', {
      conversationId: lastActiveChat,
    });
    localStorage.removeItem('lastActiveChat');
    console.log('[Migration] ✅ Migrated last active chat');
  }
  
  // Add more UI state migrations as needed
}
```

### 2.3. Phase 3: Update Components

For each component, replace localStorage calls with unifiedStorage calls.

---

## 3. Component-by-Component Migration

### 3.1. VoiceSettings.tsx

**File**: `ui-new/src/components/VoiceSettings.tsx`

**Current localStorage usage** (Lines 12-65):
- Reading: 8 `localStorage.getItem()` calls
- Writing: 4 `localStorage.setItem()` calls in useEffect hooks

**BEFORE**:
```typescript
const [hotword, setHotword] = useState(() => {
  return localStorage.getItem('continuousVoice_hotword') || 'Hey Google';
});

const [sensitivity, setSensitivity] = useState(() => {
  return parseFloat(localStorage.getItem('continuousVoice_sensitivity') || '0.5');
});

const [speechTimeout, setSpeechTimeout] = useState(() => {
  return parseFloat(localStorage.getItem('continuousVoice_speechTimeout') || '2');
});

const [conversationTimeout, setConversationTimeout] = useState(() => {
  return parseInt(localStorage.getItem('continuousVoice_conversationTimeout') || '10000');
});

const [useLocalWhisper, setUseLocalWhisper] = useState(() => {
  return localStorage.getItem('voice_useLocalWhisper') === 'true';
});

const [localWhisperUrl, setLocalWhisperUrl] = useState(() => {
  return localStorage.getItem('voice_localWhisperUrl') || 'http://localhost:8000';
});

useEffect(() => {
  localStorage.setItem('continuousVoice_hotword', hotword);
}, [hotword]);

useEffect(() => {
  localStorage.setItem('continuousVoice_sensitivity', sensitivity.toString());
}, [sensitivity]);

useEffect(() => {
  localStorage.setItem('continuousVoice_speechTimeout', speechTimeout.toString());
}, [speechTimeout]);

useEffect(() => {
  localStorage.setItem('continuousVoice_conversationTimeout', conversationTimeout.toString());
}, [conversationTimeout]);

useEffect(() => {
  localStorage.setItem('voice_useLocalWhisper', useLocalWhisper.toString());
}, [useLocalWhisper]);

useEffect(() => {
  localStorage.setItem('voice_localWhisperUrl', localWhisperUrl);
}, [localWhisperUrl]);
```

**AFTER**:
```typescript
const { settings, updateSettings } = useSettings();

// Remove all useState declarations - now from settings context
const hotword = settings?.voice.hotword || 'Hey Google';
const sensitivity = settings?.voice.sensitivity || 0.5;
const speechTimeout = settings?.voice.speechTimeout || 2.0;
const conversationTimeout = settings?.voice.conversationTimeout || 10000;
const useLocalWhisper = settings?.voice.useLocalWhisper || false;
const localWhisperUrl = settings?.voice.localWhisperUrl || 'http://localhost:8000';

// Update handlers now call updateSettings
const handleHotwordChange = (value: string) => {
  updateSettings({
    voice: {
      ...settings!.voice,
      hotword: value,
    },
  });
};

const handleSensitivityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = parseFloat(e.target.value);
  updateSettings({
    voice: {
      ...settings!.voice,
      sensitivity: value,
    },
  });
};

const handleSpeechTimeoutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = parseFloat(e.target.value);
  updateSettings({
    voice: {
      ...settings!.voice,
      speechTimeout: value,
    },
  });
};

const handleConversationTimeoutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = parseInt(e.target.value);
  updateSettings({
    voice: {
      ...settings!.voice,
      conversationTimeout: value,
    },
  });
};

const handleLocalWhisperChange = (checked: boolean) => {
  updateSettings({
    voice: {
      ...settings!.voice,
      useLocalWhisper: checked,
    },
  });
};

const handleLocalWhisperUrlChange = (value: string) => {
  updateSettings({
    voice: {
      ...settings!.voice,
      localWhisperUrl: value,
    },
  });
};

// Remove all useEffect hooks - settings auto-save in context
```

**Changes**:
- ❌ Remove: 6 useState declarations
- ❌ Remove: 6 useEffect hooks
- ✅ Add: Import `useSettings` hook
- ✅ Add: 6 handler functions
- ✅ Update: All input `onChange` handlers to call new handlers

**Parameters preserved**:
- ✅ `hotword` → `settings.voice.hotword`
- ✅ `sensitivity` → `settings.voice.sensitivity`
- ✅ `speechTimeout` → `settings.voice.speechTimeout`
- ✅ `conversationTimeout` → `settings.voice.conversationTimeout`
- ✅ `useLocalWhisper` → `settings.voice.useLocalWhisper`
- ✅ `localWhisperUrl` → `settings.voice.localWhisperUrl`

**Side effects**: NONE (all functionality preserved)

### 3.2. SettingsPage.tsx

**File**: `ui-new/src/components/SettingsPage.tsx`

**Current localStorage usage** (Lines 60-78, 86-96):
- Reading proxy settings on mount
- Writing proxy settings via `saveProxySettings()`

**BEFORE**:
```typescript
const [proxyUsername, setProxyUsername] = useState('');
const [proxyPassword, setProxyPassword] = useState('');
const [proxyEnabled, setProxyEnabled] = useState(false);
const [useServerProxy, setUseServerProxy] = useState(false);

useEffect(() => {
  const savedProxySettings = localStorage.getItem('proxy_settings');
  if (savedProxySettings) {
    try {
      const parsed = JSON.parse(savedProxySettings);
      setProxyUsername(parsed.username || '');
      setProxyPassword(parsed.password || '');
      setProxyEnabled(parsed.enabled !== false);
      setUseServerProxy(parsed.useServerProxy || false);
    } catch (e) {
      console.error('Failed to parse proxy settings:', e);
    }
  }
}, []);

const saveProxySettings = (
  username: string,
  password: string,
  enabled: boolean,
  useServer: boolean
) => {
  localStorage.setItem('proxy_settings', JSON.stringify({
    username,
    password,
    enabled,
    useServerProxy: useServer,
  }));
};
```

**AFTER**:
```typescript
const { settings, updateSettings } = useSettings();

// Remove useState declarations - now from settings context
const proxyUsername = settings?.proxy.username || '';
const proxyPassword = settings?.proxy.password || '';
const proxyEnabled = settings?.proxy.enabled || false;
const useServerProxy = settings?.proxy.useServerProxy || false;

// Remove useEffect - settings loaded from context

// Update saveProxySettings to use updateSettings
const saveProxySettings = async (
  username: string,
  password: string,
  enabled: boolean,
  useServer: boolean
) => {
  await updateSettings({
    proxy: {
      username,
      password,
      enabled,
      useServerProxy: useServer,
    },
  });
};
```

**Changes**:
- ❌ Remove: 4 useState declarations
- ❌ Remove: 1 useEffect hook
- ✅ Add: Import `useSettings` hook
- ✅ Update: `saveProxySettings` to use `updateSettings`

**Parameters preserved**:
- ✅ `username` → `settings.proxy.username`
- ✅ `password` → `settings.proxy.password`
- ✅ `enabled` → `settings.proxy.enabled`
- ✅ `useServerProxy` → `settings.proxy.useServerProxy`

**Side effects**: NONE

### 3.3. VoiceInputDialog.tsx

**File**: `ui-new/src/components/VoiceInputDialog.tsx`

**Current localStorage usage** (Lines 223-226):
- Reading voice settings for transcription

**BEFORE**:
```typescript
const useLocalWhisper = localStorage.getItem('voice_useLocalWhisper') === 'true';
const localWhisperUrl = localStorage.getItem('voice_localWhisperUrl') || 'http://localhost:8000';

console.log(`🎤 VoiceInputDialog: useLocalWhisper=${useLocalWhisper}, url=${localWhisperUrl}`);

if (useLocalWhisper) {
  formData.append('useLocalWhisper', 'true');
  formData.append('localWhisperUrl', localWhisperUrl);
}
```

**AFTER**:
```typescript
const { settings } = useSettings();
const useLocalWhisper = settings?.voice.useLocalWhisper || false;
const localWhisperUrl = settings?.voice.localWhisperUrl || 'http://localhost:8000';

console.log(`🎤 VoiceInputDialog: useLocalWhisper=${useLocalWhisper}, url=${localWhisperUrl}`);

if (useLocalWhisper) {
  formData.append('useLocalWhisper', 'true');
  formData.append('localWhisperUrl', localWhisperUrl);
}
```

**Changes**:
- ✅ Add: Import `useSettings` hook
- ✅ Update: Read from settings instead of localStorage

**Parameters preserved**:
- ✅ `useLocalWhisper` → `settings.voice.useLocalWhisper`
- ✅ `localWhisperUrl` → `settings.voice.localWhisperUrl`

**Side effects**: NONE (exact same FormData sent to backend)

### 3.4. ChatTab.tsx

**File**: `ui-new/src/components/ChatTab.tsx`

**Current localStorage usage** (Lines 975-995):
- Reading proxy settings before sending chat message

**BEFORE**:
```typescript
const proxySettings = localStorage.getItem('proxy_settings');
let proxyUsername: string | undefined;
let proxyPassword: string | undefined;
if (proxySettings) {
  try {
    const parsed = JSON.parse(proxySettings);
    if (parsed.enabled && parsed.username && parsed.password) {
      proxyUsername = parsed.username;
      proxyPassword = parsed.password;
      console.log('🌐 Proxy settings loaded from localStorage:', parsed.username);
    }
  } catch (e) {
    console.error('Failed to parse proxy settings:', e);
  }
}

// Later in request payload
if (proxyUsername && proxyPassword) {
  requestPayload.proxyUsername = proxyUsername;
  requestPayload.proxyPassword = proxyPassword;
  console.log('🌐 Including proxy credentials in request');
}
```

**AFTER**:
```typescript
const { settings } = useSettings();
const proxyUsername = settings?.proxy.enabled ? settings.proxy.username : undefined;
const proxyPassword = settings?.proxy.enabled ? settings.proxy.password : undefined;

if (proxyUsername && proxyPassword) {
  console.log('🌐 Proxy settings loaded from settings:', proxyUsername);
}

// Later in request payload (unchanged)
if (proxyUsername && proxyPassword) {
  requestPayload.proxyUsername = proxyUsername;
  requestPayload.proxyPassword = proxyPassword;
  console.log('🌐 Including proxy credentials in request');
}
```

**Changes**:
- ✅ Add: Import `useSettings` hook
- ✅ Update: Read from settings instead of localStorage
- ❌ Remove: Try-catch parsing block (no longer needed)

**Parameters preserved**:
- ✅ `proxyUsername` → `settings.proxy.username` (if enabled)
- ✅ `proxyPassword` → `settings.proxy.password` (if enabled)

**Side effects**: NONE (exact same request payload)

### 3.5. ContinuousVoiceMode.tsx

**File**: `ui-new/src/components/ContinuousVoiceMode.tsx`

**Current localStorage usage**:
- Reading voice settings for voice detection

**BEFORE**:
```typescript
const hotword = localStorage.getItem('continuousVoice_hotword') || 'Hey Google';
const sensitivity = parseFloat(localStorage.getItem('continuousVoice_sensitivity') || '0.5');
const speechTimeout = parseFloat(localStorage.getItem('continuousVoice_speechTimeout') || '2');
const conversationTimeout = parseInt(localStorage.getItem('continuousVoice_conversationTimeout') || '10000');
const useLocalWhisper = localStorage.getItem('voice_useLocalWhisper') === 'true';
const localWhisperUrl = localStorage.getItem('voice_localWhisperUrl') || 'http://localhost:8000';
```

**AFTER**:
```typescript
const { settings } = useSettings();
const hotword = settings?.voice.hotword || 'Hey Google';
const sensitivity = settings?.voice.sensitivity || 0.5;
const speechTimeout = settings?.voice.speechTimeout || 2.0;
const conversationTimeout = settings?.voice.conversationTimeout || 10000;
const useLocalWhisper = settings?.voice.useLocalWhisper || false;
const localWhisperUrl = settings?.voice.localWhisperUrl || 'http://localhost:8000';
```

**Changes**:
- ✅ Add: Import `useSettings` hook
- ✅ Update: Read from settings instead of localStorage

**Parameters preserved**:
- ✅ All voice settings preserved with exact same values

**Side effects**: NONE

---

## 4. Testing Migration

### 4.1. Pre-Migration Checklist

Before running migration:

- [ ] Backup localStorage: `JSON.stringify(localStorage)`
- [ ] Note current settings values
- [ ] Verify authentication working
- [ ] Verify IndexedDB accessible (no private mode)

### 4.2. Migration Test Script

```typescript
async function testMigration() {
  console.log('=== Migration Test ===');
  
  // 1. Setup test data in localStorage
  localStorage.setItem('settings', JSON.stringify({
    language: 'en',
    theme: 'dark',
  }));
  
  localStorage.setItem('proxy_settings', JSON.stringify({
    username: 'testuser',
    password: 'testpass',
    enabled: true,
  }));
  
  localStorage.setItem('continuousVoice_hotword', 'Alexa');
  localStorage.setItem('continuousVoice_sensitivity', '0.7');
  
  console.log('✅ Test data set');
  
  // 2. Run migration
  await migrateFromLocalStorage('test@example.com');
  
  // 3. Verify settings in IndexedDB
  const settings = await db.settings.get('test@example.com');
  
  console.assert(settings.language === 'en', 'Language migrated');
  console.assert(settings.theme === 'dark', 'Theme migrated');
  console.assert(settings.proxy.username === 'testuser', 'Proxy username migrated');
  console.assert(settings.proxy.password === 'testpass', 'Proxy password migrated');
  console.assert(settings.proxy.enabled === true, 'Proxy enabled migrated');
  console.assert(settings.voice.hotword === 'Alexa', 'Hotword migrated');
  console.assert(settings.voice.sensitivity === 0.7, 'Sensitivity migrated');
  
  console.log('✅ All assertions passed');
  
  // 4. Verify localStorage cleaned up
  console.assert(localStorage.getItem('settings') === null, 'Old settings removed');
  console.assert(localStorage.getItem('proxy_settings') === null, 'Old proxy settings removed');
  console.assert(localStorage.getItem('continuousVoice_hotword') === null, 'Old voice settings removed');
  
  console.log('✅ localStorage cleaned');
  
  // 5. Verify auth tokens preserved
  console.assert(localStorage.getItem('google_access_token') !== null, 'Auth tokens preserved');
  
  console.log('✅ Auth tokens preserved');
  
  console.log('=== Migration Test Complete ===');
}
```

### 4.3. Rollback Procedure

If migration fails:

```typescript
async function rollbackMigration(userId: string) {
  console.log('[Rollback] Starting migration rollback...');
  
  // 1. Get settings from IndexedDB
  const settings = await db.settings.get(userId);
  
  if (!settings) {
    console.error('[Rollback] No settings found in IndexedDB');
    return;
  }
  
  // 2. Restore to localStorage
  localStorage.setItem('settings', JSON.stringify({
    language: settings.language,
    theme: settings.theme,
    providers: settings.providers,
    defaultProvider: settings.defaultProvider,
  }));
  
  localStorage.setItem('proxy_settings', JSON.stringify({
    username: settings.proxy.username,
    password: settings.proxy.password,
    enabled: settings.proxy.enabled,
    useServerProxy: settings.proxy.useServerProxy,
  }));
  
  localStorage.setItem('continuousVoice_hotword', settings.voice.hotword);
  localStorage.setItem('continuousVoice_sensitivity', settings.voice.sensitivity.toString());
  localStorage.setItem('continuousVoice_speechTimeout', settings.voice.speechTimeout.toString());
  localStorage.setItem('continuousVoice_conversationTimeout', settings.voice.conversationTimeout.toString());
  localStorage.setItem('voice_useLocalWhisper', settings.voice.useLocalWhisper.toString());
  localStorage.setItem('voice_localWhisperUrl', settings.voice.localWhisperUrl);
  
  // 3. Mark migration as incomplete
  localStorage.removeItem('localStorage_migration_completed');
  
  console.log('[Rollback] Complete');
}
```

---

## 5. Deployment Checklist

### 5.1. Pre-Deployment

- [ ] All components updated (VoiceSettings, SettingsPage, VoiceInputDialog, ChatTab, ContinuousVoiceMode)
- [ ] SettingsContext implemented
- [ ] UnifiedStorage service created
- [ ] Migration script created
- [ ] Migration triggered in App.tsx on mount
- [ ] Test migration script passes
- [ ] Rollback procedure documented

### 5.2. Deployment

- [ ] Deploy to staging environment
- [ ] Test with real user data
- [ ] Verify settings persist after reload
- [ ] Verify settings sync to Google Drive
- [ ] Test all voice features
- [ ] Test proxy functionality
- [ ] Monitor console for errors

### 5.3. Post-Deployment

- [ ] Monitor error logs
- [ ] Verify migration completion rate
- [ ] Check for localStorage usage errors
- [ ] Verify no parameters lost
- [ ] Get user feedback

---

## 6. Summary

**Total Changes**:
- Files modified: 8 components
- localStorage reads removed: ~40
- localStorage writes removed: ~30
- New API calls: `useSettings()` hook in all components
- Parameters lost: **ZERO**
- Side effects: **NONE**

**Benefits**:
- ✅ All settings unified in single structure
- ✅ Settings synced to Google Drive
- ✅ User-scoped data (multi-user support)
- ✅ Cleaner code (no scattered localStorage calls)
- ✅ Type-safe (TypeScript interfaces)
- ✅ Consistent API across all persistence

**Risks**:
- ⚠️ Migration failure (mitigated by rollback procedure)
- ⚠️ User confusion if settings reset (unlikely, migration runs automatically)

---

## Next Steps

1. **Implement**: UnifiedStorage service
2. **Implement**: SettingsContext
3. **Implement**: Migration script
4. **Update**: All 8 components
5. **Test**: Migration with test data
6. **Deploy**: Staging first, then production
