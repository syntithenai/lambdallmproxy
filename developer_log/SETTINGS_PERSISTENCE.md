# Settings Persistence Strategy

**Date**: 2025-11-11  
**Status**: Planning Document  
**Scope**: Unified settings structure (app, voice, proxy, RAG, TTS)

---

## Executive Summary

All application settings are consolidated into a single `Settings` object:
- **Stored in**: IndexedDB (table: `settings`, primary key: `userId`)
- **Synced to**: Google Drive (`settings.json`)
- **Per-User Singleton**: One settings object per user
- **Includes**: App settings, voice settings, proxy settings, provider configs, RAG settings, TTS settings

---

## 1. Settings Schema

### 1.1. Complete TypeScript Interface

```typescript
interface Settings {
  // User identification
  userId: string;           // PRIMARY KEY - user's email from Google OAuth
  version: string;          // Settings schema version (e.g., "2.0.0")
  
  // App settings
  language: string;         // "en", "es", "fr", etc.
  theme: 'light' | 'dark' | 'auto';
  
  // Provider settings
  providers: ProviderConfig[];
  defaultProvider?: string;
  
  // Voice settings
  voice: VoiceSettings;
  
  // Proxy settings
  proxy: ProxySettings;
  
  // RAG settings
  rag: RAGSettings;
  
  // TTS settings
  tts: TTSSettings;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}
```

### 1.2. Provider Configuration

```typescript
interface ProviderConfig {
  id: string;               // Unique provider ID
  type: 'openai' | 'anthropic' | 'groq' | 'google' | 'cohere' | 'deepseek';
  apiKey: string;           // Provider API key
  model?: string;           // Default model for this provider
  priority?: number;        // Provider selection priority (1 = highest)
  enabled?: boolean;        // Is provider active? (default: true)
  maxTokens?: number;       // Max tokens for requests
  temperature?: number;     // Default temperature (0.0 - 1.0)
}
```

**Example**:
```typescript
const providers: ProviderConfig[] = [
  {
    id: 'provider_openai_1',
    type: 'openai',
    apiKey: 'sk-...',
    model: 'gpt-4-turbo-preview',
    priority: 1,
    enabled: true,
    maxTokens: 4000,
    temperature: 0.7,
  },
  {
    id: 'provider_anthropic_1',
    type: 'anthropic',
    apiKey: 'sk-ant-...',
    model: 'claude-3-opus-20240229',
    priority: 2,
    enabled: true,
  },
  {
    id: 'provider_groq_1',
    type: 'groq',
    apiKey: 'gsk_...',
    model: 'mixtral-8x7b-32768',
    priority: 3,
    enabled: true,
  },
];
```

### 1.3. Voice Settings

```typescript
interface VoiceSettings {
  // Continuous voice mode
  hotword: string;              // Wake word (e.g., "Hey Google", "Alexa")
  sensitivity: number;          // Hotword sensitivity (0.0 - 1.0)
  speechTimeout: number;        // Silence duration to stop recording (seconds, float)
  conversationTimeout: number;  // Max conversation duration (milliseconds, int)
  
  // Whisper transcription
  useLocalWhisper: boolean;     // Try local Whisper service first?
  localWhisperUrl: string;      // Local Whisper endpoint (default: "http://localhost:8000")
  whisperProvider?: 'groq' | 'openai' | 'speaches';  // Cloud fallback provider
  whisperApiKey?: string;       // Cloud Whisper API key
}
```

**Example**:
```typescript
const voice: VoiceSettings = {
  hotword: 'Hey Google',
  sensitivity: 0.5,
  speechTimeout: 2.0,
  conversationTimeout: 10000,
  useLocalWhisper: true,
  localWhisperUrl: 'http://localhost:8000',
  whisperProvider: 'groq',
  whisperApiKey: 'gsk_...',
};
```

**Migration from localStorage**:
```typescript
// OLD (localStorage, scattered)
localStorage.setItem('continuousVoice_hotword', 'Hey Google');
localStorage.setItem('continuousVoice_sensitivity', '0.5');
localStorage.setItem('continuousVoice_speechTimeout', '2');
localStorage.setItem('continuousVoice_conversationTimeout', '10000');
localStorage.setItem('voice_useLocalWhisper', 'true');
localStorage.setItem('voice_localWhisperUrl', 'http://localhost:8000');

// NEW (IndexedDB, unified)
const settings = await unifiedStorage.get('settings', user.email);
settings.voice = {
  hotword: 'Hey Google',
  sensitivity: 0.5,
  speechTimeout: 2.0,
  conversationTimeout: 10000,
  useLocalWhisper: true,
  localWhisperUrl: 'http://localhost:8000',
};
await unifiedStorage.save('settings', settings);
```

### 1.4. Proxy Settings

```typescript
interface ProxySettings {
  enabled: boolean;         // Is proxy enabled?
  username: string;         // Proxy username
  password: string;         // Proxy password
  useServerProxy: boolean;  // Use server's proxy credentials instead of user's
}
```

**Example**:
```typescript
const proxy: ProxySettings = {
  enabled: true,
  username: 'exrihquq',
  password: '1cqwvmcu9ija',
  useServerProxy: false,
};
```

**Migration from localStorage**:
```typescript
// OLD (localStorage, separate key)
localStorage.setItem('proxy_settings', JSON.stringify({
  username: 'exrihquq',
  password: '***',
  enabled: true,
}));

// NEW (IndexedDB, unified)
const settings = await unifiedStorage.get('settings', user.email);
settings.proxy = {
  enabled: true,
  username: 'exrihquq',
  password: '***',
  useServerProxy: false,
};
await unifiedStorage.save('settings', settings);
```

### 1.5. RAG Settings

```typescript
interface RAGSettings {
  enabled: boolean;             // Is RAG enabled globally?
  topK: number;                 // Number of results to retrieve
  scoreThreshold: number;       // Minimum similarity score (0.0 - 1.0)
  embeddingProvider?: string;   // 'openai' | 'cohere' | 'local'
  embeddingModel?: string;      // Model name for embeddings
  chunkSize?: number;           // Text chunk size for embedding
  chunkOverlap?: number;        // Overlap between chunks
}
```

**Example**:
```typescript
const rag: RAGSettings = {
  enabled: true,
  topK: 5,
  scoreThreshold: 0.7,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  chunkSize: 512,
  chunkOverlap: 50,
};
```

### 1.6. TTS Settings

```typescript
interface TTSSettings {
  enabled: boolean;             // Auto-read responses?
  provider: 'browser' | 'elevenlabs' | 'openai' | 'google';
  voice?: string;               // Voice ID or name
  rate?: number;                // Speech rate (0.5 - 2.0)
  pitch?: number;               // Speech pitch (0.5 - 2.0)
  volume?: number;              // Speech volume (0.0 - 1.0)
  apiKey?: string;              // API key for cloud TTS providers
}
```

**Example**:
```typescript
const tts: TTSSettings = {
  enabled: false,
  provider: 'browser',
  voice: 'Google UK English Female',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};
```

---

## 2. Storage & Sync

### 2.1. IndexedDB Storage

**Table Definition**:
```typescript
class UnifiedDB extends Dexie {
  settings!: Table<Settings>;
  
  constructor() {
    super('UnifiedDB');
    this.version(1).stores({
      settings: 'userId',  // Primary key
    });
  }
}
```

**Save Settings**:
```typescript
async function saveSettings(settings: Settings): Promise<void> {
  // Ensure userId is set
  if (!settings.userId) {
    throw new Error('Settings must include userId');
  }
  
  // Update timestamp
  settings.updatedAt = Date.now();
  
  // Save to IndexedDB
  await db.settings.put(settings);
  
  // Automatically sync to Google Drive
  await syncSettingsToDrive(settings);
}
```

**Load Settings**:
```typescript
async function loadSettings(userId: string): Promise<Settings> {
  // Try local first
  let settings = await db.settings.get(userId);
  
  if (!settings) {
    // Load from Google Drive
    settings = await loadSettingsFromDrive(userId);
    
    if (!settings) {
      // Create default settings
      settings = createDefaultSettings(userId);
    }
    
    // Save locally
    await db.settings.put(settings);
  }
  
  return settings;
}
```

### 2.2. Google Drive Sync

**Upload Settings** (strips userId):
```typescript
async function syncSettingsToDrive(settings: Settings): Promise<void> {
  const rootFolderId = await ensureRootFolder();
  
  // Strip userId before upload (Drive is already user-specific)
  const { userId, ...settingsWithoutUserId } = settings;
  
  await uploadJSONFile('settings.json', settingsWithoutUserId, rootFolderId);
  console.log('Settings synced to Google Drive');
}
```

**Download Settings** (restores userId):
```typescript
async function loadSettingsFromDrive(userId: string): Promise<Settings | null> {
  const rootFolderId = await ensureRootFolder();
  const data = await downloadJSONFile('settings.json', rootFolderId);
  
  if (!data) return null;
  
  // Restore userId
  return {
    ...data,
    userId,
  };
}
```

---

## 3. Default Settings

### 3.1. Factory Function

```typescript
function createDefaultSettings(userId: string): Settings {
  return {
    userId,
    version: '2.0.0',
    
    // App settings
    language: 'en',
    theme: 'auto',
    
    // Provider settings
    providers: [],
    defaultProvider: undefined,
    
    // Voice settings
    voice: {
      hotword: 'Hey Google',
      sensitivity: 0.5,
      speechTimeout: 2.0,
      conversationTimeout: 10000,
      useLocalWhisper: false,
      localWhisperUrl: 'http://localhost:8000',
      whisperProvider: 'groq',
    },
    
    // Proxy settings
    proxy: {
      enabled: false,
      username: '',
      password: '',
      useServerProxy: false,
    },
    
    // RAG settings
    rag: {
      enabled: false,
      topK: 5,
      scoreThreshold: 0.7,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      chunkSize: 512,
      chunkOverlap: 50,
    },
    
    // TTS settings
    tts: {
      enabled: false,
      provider: 'browser',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
    },
    
    // Timestamps
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
```

---

## 4. Migration from localStorage

### 4.1. Migration Script

**Purpose**: One-time migration from scattered localStorage keys to unified Settings object

```typescript
async function migrateSettingsFromLocalStorage(userId: string): Promise<Settings> {
  console.log('Migrating settings from localStorage...');
  
  // Create default settings
  const settings = createDefaultSettings(userId);
  
  // Migrate app settings
  const oldSettings = localStorage.getItem('settings');
  if (oldSettings) {
    try {
      const parsed = JSON.parse(oldSettings);
      settings.language = parsed.language || settings.language;
      settings.theme = parsed.theme || settings.theme;
      settings.providers = parsed.providers || settings.providers;
      settings.defaultProvider = parsed.defaultProvider;
    } catch (e) {
      console.error('Failed to parse old settings:', e);
    }
  }
  
  // Migrate voice settings
  const hotword = localStorage.getItem('continuousVoice_hotword');
  const sensitivity = localStorage.getItem('continuousVoice_sensitivity');
  const speechTimeout = localStorage.getItem('continuousVoice_speechTimeout');
  const conversationTimeout = localStorage.getItem('continuousVoice_conversationTimeout');
  const useLocalWhisper = localStorage.getItem('voice_useLocalWhisper');
  const localWhisperUrl = localStorage.getItem('voice_localWhisperUrl');
  
  if (hotword) settings.voice.hotword = hotword;
  if (sensitivity) settings.voice.sensitivity = parseFloat(sensitivity);
  if (speechTimeout) settings.voice.speechTimeout = parseFloat(speechTimeout);
  if (conversationTimeout) settings.voice.conversationTimeout = parseInt(conversationTimeout);
  if (useLocalWhisper) settings.voice.useLocalWhisper = useLocalWhisper === 'true';
  if (localWhisperUrl) settings.voice.localWhisperUrl = localWhisperUrl;
  
  // Migrate proxy settings
  const proxySettings = localStorage.getItem('proxy_settings');
  if (proxySettings) {
    try {
      const parsed = JSON.parse(proxySettings);
      settings.proxy.enabled = parsed.enabled !== false;
      settings.proxy.username = parsed.username || '';
      settings.proxy.password = parsed.password || '';
      settings.proxy.useServerProxy = parsed.useServerProxy || false;
    } catch (e) {
      console.error('Failed to parse proxy settings:', e);
    }
  }
  
  // Save migrated settings
  await saveSettings(settings);
  
  // Clean up old localStorage keys (KEEP auth tokens)
  localStorage.removeItem('settings');
  localStorage.removeItem('proxy_settings');
  localStorage.removeItem('continuousVoice_hotword');
  localStorage.removeItem('continuousVoice_sensitivity');
  localStorage.removeItem('continuousVoice_speechTimeout');
  localStorage.removeItem('continuousVoice_conversationTimeout');
  localStorage.removeItem('voice_useLocalWhisper');
  localStorage.removeItem('voice_localWhisperUrl');
  
  console.log('Settings migration complete');
  return settings;
}
```

### 4.2. Migration Trigger

**Run once on app startup**:

```typescript
// In App.tsx or main initialization
useEffect(() => {
  async function initSettings() {
    if (!user?.email) return;
    
    // Check if settings exist in IndexedDB
    let settings = await db.settings.get(user.email);
    
    if (!settings) {
      // Try migration from localStorage
      const hasOldSettings = localStorage.getItem('settings') ||
                             localStorage.getItem('proxy_settings') ||
                             localStorage.getItem('continuousVoice_hotword');
      
      if (hasOldSettings) {
        settings = await migrateSettingsFromLocalStorage(user.email);
      } else {
        // No old settings, create defaults
        settings = createDefaultSettings(user.email);
        await saveSettings(settings);
      }
    }
    
    // Load settings into context
    setSettings(settings);
  }
  
  initSettings();
}, [user]);
```

---

## 5. Settings Context (React)

### 5.1. Context Definition

```typescript
interface SettingsContextType {
  settings: Settings | null;
  loading: boolean;
  error: Error | null;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  syncToDrive: () => Promise<void>;
  loadFromDrive: () => Promise<void>;
}

const SettingsContext = React.createContext<SettingsContextType>({
  settings: null,
  loading: true,
  error: null,
  updateSettings: async () => {},
  syncToDrive: async () => {},
  loadFromDrive: async () => {},
});
```

### 5.2. Context Provider

```typescript
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Load settings on mount or when user changes
  useEffect(() => {
    async function load() {
      if (!user?.email) {
        setSettings(null);
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const loaded = await loadSettings(user.email);
        setSettings(loaded);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    
    load();
  }, [user]);
  
  // Update settings (partial update)
  const updateSettings = async (updates: Partial<Settings>) => {
    if (!settings) return;
    
    const updated = {
      ...settings,
      ...updates,
      updatedAt: Date.now(),
    };
    
    await saveSettings(updated);
    setSettings(updated);
  };
  
  // Sync to Drive
  const syncToDrive = async () => {
    if (!settings) return;
    await syncSettingsToDrive(settings);
  };
  
  // Load from Drive
  const loadFromDrive = async () => {
    if (!user?.email) return;
    const loaded = await loadSettingsFromDrive(user.email);
    if (loaded) {
      await saveSettings(loaded);
      setSettings(loaded);
    }
  };
  
  return (
    <SettingsContext.Provider value={{
      settings,
      loading,
      error,
      updateSettings,
      syncToDrive,
      loadFromDrive,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
```

### 5.3. Usage in Components

**Update Theme**:
```typescript
const { settings, updateSettings } = useSettings();

const handleThemeChange = async (theme: 'light' | 'dark' | 'auto') => {
  await updateSettings({ theme });
};
```

**Update Voice Settings**:
```typescript
const { settings, updateSettings } = useSettings();

const handleVoiceChange = async (voiceUpdates: Partial<VoiceSettings>) => {
  await updateSettings({
    voice: {
      ...settings!.voice,
      ...voiceUpdates,
    },
  });
};
```

**Update Proxy Settings**:
```typescript
const { settings, updateSettings } = useSettings();

const handleProxyChange = async (proxyUpdates: Partial<ProxySettings>) => {
  await updateSettings({
    proxy: {
      ...settings!.proxy,
      ...proxyUpdates,
    },
  });
};
```

---

## 6. Updating Components

### 6.1. VoiceSettings.tsx

**BEFORE** (localStorage):
```typescript
const [hotword, setHotword] = useState(() => {
  return localStorage.getItem('continuousVoice_hotword') || 'Hey Google';
});

useEffect(() => {
  localStorage.setItem('continuousVoice_hotword', hotword);
}, [hotword]);
```

**AFTER** (unified settings):
```typescript
const { settings, updateSettings } = useSettings();
const hotword = settings?.voice.hotword || 'Hey Google';

const handleHotwordChange = (newHotword: string) => {
  updateSettings({
    voice: {
      ...settings!.voice,
      hotword: newHotword,
    },
  });
};
```

**NO PARAMETERS LOST**:
- ✅ `hotword` → `settings.voice.hotword`
- ✅ `sensitivity` → `settings.voice.sensitivity`
- ✅ `speechTimeout` → `settings.voice.speechTimeout`
- ✅ `conversationTimeout` → `settings.voice.conversationTimeout`
- ✅ `useLocalWhisper` → `settings.voice.useLocalWhisper`
- ✅ `localWhisperUrl` → `settings.voice.localWhisperUrl`

### 6.2. SettingsModal.tsx / SettingsPage.tsx

**BEFORE** (localStorage):
```typescript
const [proxyUsername, setProxyUsername] = useState('');
const [proxyPassword, setProxyPassword] = useState('');
const [proxyEnabled, setProxyEnabled] = useState(false);

useEffect(() => {
  const saved = localStorage.getItem('proxy_settings');
  if (saved) {
    const parsed = JSON.parse(saved);
    setProxyUsername(parsed.username);
    setProxyPassword(parsed.password);
    setProxyEnabled(parsed.enabled);
  }
}, []);

const handleSave = () => {
  localStorage.setItem('proxy_settings', JSON.stringify({
    username: proxyUsername,
    password: proxyPassword,
    enabled: proxyEnabled,
  }));
};
```

**AFTER** (unified settings):
```typescript
const { settings, updateSettings } = useSettings();

const handleProxySave = async () => {
  await updateSettings({
    proxy: {
      enabled: proxyEnabled,
      username: proxyUsername,
      password: proxyPassword,
      useServerProxy: useServerProxy,
    },
  });
};
```

**NO PARAMETERS LOST**:
- ✅ `username` → `settings.proxy.username`
- ✅ `password` → `settings.proxy.password`
- ✅ `enabled` → `settings.proxy.enabled`
- ✅ `useServerProxy` → `settings.proxy.useServerProxy` (NEW)

### 6.3. VoiceInputDialog.tsx

**BEFORE** (localStorage):
```typescript
const useLocalWhisper = localStorage.getItem('voice_useLocalWhisper') === 'true';
const localWhisperUrl = localStorage.getItem('voice_localWhisperUrl') || 'http://localhost:8000';
```

**AFTER** (unified settings):
```typescript
const { settings } = useSettings();
const useLocalWhisper = settings?.voice.useLocalWhisper || false;
const localWhisperUrl = settings?.voice.localWhisperUrl || 'http://localhost:8000';
```

**NO PARAMETERS LOST**:
- ✅ All voice settings preserved
- ✅ Exact same behavior
- ✅ Now synced across devices via Google Drive

### 6.4. ChatTab.tsx

**BEFORE** (localStorage):
```typescript
const proxySettings = localStorage.getItem('proxy_settings');
let proxyUsername: string | undefined;
let proxyPassword: string | undefined;
if (proxySettings) {
  const parsed = JSON.parse(proxySettings);
  if (parsed.enabled && parsed.username && parsed.password) {
    proxyUsername = parsed.username;
    proxyPassword = parsed.password;
  }
}
```

**AFTER** (unified settings):
```typescript
const { settings } = useSettings();
const proxyUsername = settings?.proxy.enabled ? settings.proxy.username : undefined;
const proxyPassword = settings?.proxy.enabled ? settings.proxy.password : undefined;
```

**NO PARAMETERS LOST**:
- ✅ Proxy credentials preserved
- ✅ Same conditional logic (only use if enabled)
- ✅ Cleaner code

---

## 7. Testing

### 7.1. Test Default Settings

```typescript
test('createDefaultSettings returns valid settings', () => {
  const settings = createDefaultSettings('test@example.com');
  
  expect(settings.userId).toBe('test@example.com');
  expect(settings.version).toBe('2.0.0');
  expect(settings.language).toBe('en');
  expect(settings.theme).toBe('auto');
  expect(settings.voice.hotword).toBe('Hey Google');
  expect(settings.proxy.enabled).toBe(false);
});
```

### 7.2. Test Migration

```typescript
test('migrateSettingsFromLocalStorage preserves data', async () => {
  // Setup old localStorage
  localStorage.setItem('continuousVoice_hotword', 'Alexa');
  localStorage.setItem('proxy_settings', JSON.stringify({
    username: 'test',
    password: 'pass',
    enabled: true,
  }));
  
  // Migrate
  const settings = await migrateSettingsFromLocalStorage('test@example.com');
  
  // Verify
  expect(settings.voice.hotword).toBe('Alexa');
  expect(settings.proxy.username).toBe('test');
  expect(settings.proxy.password).toBe('pass');
  expect(settings.proxy.enabled).toBe(true);
  
  // Verify cleanup
  expect(localStorage.getItem('continuousVoice_hotword')).toBeNull();
  expect(localStorage.getItem('proxy_settings')).toBeNull();
});
```

### 7.3. Test Sync

```typescript
test('syncSettingsToDrive strips userId', async () => {
  const settings = createDefaultSettings('test@example.com');
  
  // Mock uploadJSONFile
  const mockUpload = jest.fn();
  global.uploadJSONFile = mockUpload;
  
  await syncSettingsToDrive(settings);
  
  // Verify userId was stripped
  expect(mockUpload).toHaveBeenCalled();
  const uploaded = mockUpload.mock.calls[0][1];
  expect(uploaded.userId).toBeUndefined();
  expect(uploaded.language).toBe('en');
});
```

---

## Next Steps

1. **Review**: `LOCALSTORAGE_MIGRATION.md` - Complete migration guide
2. **Implement**: `ui-new/src/contexts/SettingsContext.tsx`
3. **Implement**: `ui-new/src/services/settings.ts` (save/load/sync functions)
4. **Update**: All components currently using localStorage for settings
5. **Test**: Migration script with real localStorage data
