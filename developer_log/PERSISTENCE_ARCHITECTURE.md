# Persistence Architecture

**Date**: 2025-11-11  
**Status**: Planning Document  
**Scope**: Core persistence concepts and authentication

---

## Executive Summary

This document defines the architectural principles for data persistence in the application:

1. **Authentication-Required Persistence** - All persistence operations (including local) require a valid Google OAuth token
2. **User-Scoped Data** - All user-generated data is scoped to the authenticated user's email address
3. **IndexedDB Primary Storage** - All persistent data uses IndexedDB (eliminates inconsistent localStorage usage)
4. **Google Sync** - User's own Google Drive/Sheets for cloud synchronization (no multi-user shared documents)
5. **Ephemeral UI State** - User-scoped but local-only (not synchronized)
6. **Feed Items Local-Only** - Persist to survive page reload but never sync

---

## 1. Authentication Requirements

### 1.1. No Unauthenticated Persistence

**⚡ CRITICAL**: ALL persistence operations require authentication, even for local-only storage.

**Rationale**:
- Prevents data mixing between users on shared devices
- Ensures data integrity and ownership
- Simplifies security model (no anonymous/guest mode)
- Consistent userId assignment

**Implementation**:
```typescript
class UnifiedStorage {
  private getCurrentUserId(): string {
    const { user } = useAuth();
    if (!user?.email) {
      throw new Error('Authentication required for all persistence operations');
    }
    return user.email;
  }

  async save(dataType: string, record: any): Promise<void> {
    const userId = this.getCurrentUserId(); // Throws if not authenticated
    record.userId = userId;
    record.updatedAt = Date.now();
    await db[dataType].put(record);
  }

  async query(dataType: string, filters?: any): Promise<any[]> {
    const userId = this.getCurrentUserId(); // Throws if not authenticated
    return await db[dataType]
      .where('userId')
      .equals(userId)
      .toArray();
  }
}
```

### 1.2. Authentication Source

**Source of Truth**: Google OAuth email address

**Obtaining User Email**:
```typescript
// From AuthContext
const { user } = useAuth();
const userId = user.email; // "user@gmail.com"
```

**Google OAuth Flow**:
1. User clicks "Sign in with Google"
2. OAuth flow completes, returns ID token
3. Extract email from token: `gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail()`
4. Store email in AuthContext state
5. All persistence operations use this email as `userId`

**Token Storage**:
- `google_access_token` in localStorage (for API calls)
- `google_id_token` in localStorage (for backend authentication)
- Email stored in AuthContext state (React context, not persisted)

---

## 2. User-Scoped Data Model

### 2.1. Base Record Interface

All persistent data types MUST extend this base interface:

```typescript
interface BaseUserRecord {
  id: string;           // Unique record ID (UUID)
  userId: string;       // User's email from Google OAuth
  createdAt: number;    // Unix timestamp (milliseconds)
  updatedAt: number;    // Unix timestamp (milliseconds)
}
```

### 2.2. Example Data Models

**Snippet**:
```typescript
interface Snippet extends BaseUserRecord {
  content: string;
  tags: string[];
  type: 'text' | 'code' | 'markdown';
  title?: string;
  projectId?: string;
}
```

**Quiz**:
```typescript
interface Quiz extends BaseUserRecord {
  title: string;
  snippetIds: string[];
  questions: QuizQuestion[];
  projectId?: string;
}
```

**Plan**:
```typescript
interface Plan extends BaseUserRecord {
  title: string;
  description: string;
  steps: PlanStep[];
  status: 'active' | 'completed' | 'archived';
  projectId?: string;
}
```

### 2.3. Settings: Special Case

Settings are per-user singletons (one settings object per user):

```typescript
interface Settings {
  userId: string;       // Primary key (user's email)
  version: string;      // Settings schema version
  
  // App settings
  language: string;
  theme: 'light' | 'dark' | 'auto';
  
  // Provider settings
  providers: ProviderConfig[];
  defaultProvider?: string;
  
  // Voice settings
  voice: VoiceSettings;
  
  // Proxy settings
  proxy: ProxySettings;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

interface VoiceSettings {
  hotword: string;
  sensitivity: number;
  speechTimeout: number;
  conversationTimeout: number;
  useLocalWhisper: boolean;
  localWhisperUrl: string;
}

interface ProxySettings {
  enabled: boolean;
  username: string;
  password: string;
  useServerProxy: boolean;
}
```

**Storage Pattern**:
```typescript
// Save (upsert)
await unifiedStorage.save('settings', {
  userId: user.email,
  version: '2.0.0',
  language: 'en',
  voice: { ... },
  proxy: { ... },
  // ...
});

// Retrieve
const settings = await unifiedStorage.get('settings', user.email);
```

---

## 3. Data Classification

### 3.1. Synchronized Data (IndexedDB + Google)

Data that persists locally AND syncs to user's Google Drive/Sheets:

| Data Type | IndexedDB Table | Google Destination | Sync Frequency |
|-----------|----------------|-------------------|----------------|
| Settings | `settings` | Drive: `settings.json` | On change |
| Snippets | `snippets` | Sheets: `Snippets` tab | Manual + periodic |
| RAG Data | `ragData` | Sheets: `RAG` tab | Manual + periodic |
| Quizzes | `quizzes` | Sheets: `Quizzes` tab | Manual |
| Quiz Analytics | `quizAnalytics` | Sheets: `QuizAnalytics` tab | After quiz completion |
| Plans | `plans` | Drive: `plans/{planId}.json` | On change |
| Playlists | `playlists` | Drive: `playlists/{playlistId}.json` | On change |
| Projects | `projects` | Drive: `projects.json` | On change |
| Chat History | `chatHistory` | Drive: `chat/{chatId}.json` | Manual |
| Images | `images` | Drive: `images/{imageId}` (blob) | Manual |

### 3.2. Local-Only Data (IndexedDB, No Sync)

Data that persists locally but NEVER syncs to cloud:

| Data Type | IndexedDB Table | Reason for Local-Only |
|-----------|----------------|----------------------|
| Feed Items | `feedItems` | High volume, low value, regenerable |
| Quiz Progress | `quizProgress` | Embedded in quizzes (synced indirectly) |

**Feed Items Behavior**:
- Persist to IndexedDB to survive page reload
- User-scoped (include `userId` field)
- Never sync to Google (too many records, regenerable from sources)
- Cleanup: Keep only most recent 100 items per user

### 3.3. Ephemeral UI State (IndexedDB, User-Scoped, Not Synchronized)

Transient UI state that is user-scoped but NOT synchronized:

| State Type | IndexedDB Table | Purpose |
|-----------|----------------|---------|
| Recent Tags | `uiState_recentTags` | Tag autocomplete |
| Last Active Chat | `uiState_lastActiveChat` | Resume conversation |
| Image Editor State | `uiState_imageEditor` | Restore editor |
| Scroll Position | `uiState_scrollPosition` | Restore scroll |

**Pattern**:
```typescript
interface UIState extends BaseUserRecord {
  stateType: string;  // e.g., 'recentTags', 'lastActiveChat'
  data: any;          // State-specific data
}

// Save
await unifiedStorage.saveUIState('recentTags', {
  tags: ['ai', 'research'],
  updatedAt: Date.now(),
});

// Retrieve
const state = await unifiedStorage.getUIState('recentTags');
```

**Important**: UI state is NOT synced to Google (device-local only)

---

## 4. Storage Layers

### 4.1. IndexedDB (Primary Storage)

**Why IndexedDB**:
- Structured storage with indexes
- Large storage capacity (hundreds of MB)
- Transactional (ACID guarantees)
- Asynchronous API (non-blocking)
- Offline-first (works without network)

**Database Name**: `UnifiedDB`

**Schema**:
```typescript
class UnifiedDB extends Dexie {
  settings!: Table<Settings>;
  snippets!: Table<Snippet>;
  feedItems!: Table<FeedItem>;
  ragData!: Table<RAGData>;
  quizzes!: Table<Quiz>;
  quizProgress!: Table<QuizProgress>;
  quizAnalytics!: Table<QuizAnalytics>;
  plans!: Table<Plan>;
  playlists!: Table<Playlist>;
  projects!: Table<Project>;
  chatHistory!: Table<ChatMessage>;
  images!: Table<ImageRecord>;
  // UI State tables
  uiState_recentTags!: Table<UIState>;
  uiState_lastActiveChat!: Table<UIState>;
  uiState_imageEditor!: Table<UIState>;
  uiState_scrollPosition!: Table<UIState>;

  constructor() {
    super('UnifiedDB');
    this.version(1).stores({
      // Synchronized tables
      settings: 'userId',
      snippets: 'id, userId, createdAt, updatedAt, projectId',
      ragData: 'id, userId, createdAt, updatedAt',
      quizzes: 'id, userId, createdAt, updatedAt, projectId',
      quizProgress: 'id, userId, quizId, updatedAt',
      quizAnalytics: 'id, userId, quizId, createdAt',
      plans: 'id, userId, createdAt, updatedAt, projectId',
      playlists: 'id, userId, createdAt, updatedAt, projectId',
      projects: 'id, userId, createdAt, updatedAt',
      chatHistory: 'id, userId, createdAt, projectId',
      images: 'id, userId, createdAt, source',
      
      // Local-only tables
      feedItems: 'id, userId, createdAt, updatedAt, projectId',
      
      // UI State tables (user-scoped, not synced)
      uiState_recentTags: 'userId',
      uiState_lastActiveChat: 'userId',
      uiState_imageEditor: 'userId',
      uiState_scrollPosition: 'userId',
    });
  }
}
```

### 4.2. Google Drive (Cloud Storage for Blobs/JSON)

**Purpose**: Store large files and structured JSON documents

**Organization**:
```
Research Agent/
├── settings.json
├── projects.json
├── plans/
│   ├── plan_abc123.json
│   └── plan_def456.json
├── playlists/
│   ├── playlist_xyz789.json
│   └── playlist_uvw101.json
├── chat/
│   ├── chat_aaa111.json
│   └── chat_bbb222.json
└── images/
    ├── image_ccc333.jpg
    └── image_ddd444.png
```

**Key Point**: Each user has their own Google Drive. No need to organize by email subdirectories because the Drive is already user-specific.

### 4.3. Google Sheets (Cloud Storage for Tabular Data)

**Purpose**: Store large datasets that benefit from row-based structure

**Organization**:
```
Research Agent Data (Spreadsheet)
├── Snippets (Tab)
├── RAG (Tab)
├── Quizzes (Tab)
└── QuizAnalytics (Tab)
```

**Key Point**: Each user has their own Google Sheets document. No `user_email` column needed because it's a single-user document.

---

## 5. Migration from localStorage

### 5.1. Current localStorage Usage

**Identified localStorage Keys** (147 occurrences found):

**Authentication**:
- `google_access_token`
- `google_id_token`
- `google_refresh_token`

**Settings** (MIGRATE TO IndexedDB):
- `settings` (app settings)
- `proxy_settings` (proxy credentials)
- `voice_useLocalWhisper`, `voice_localWhisperUrl` (voice settings)
- `continuousVoice_hotword`, `continuousVoice_sensitivity`, etc. (voice settings)

**UI State** (MIGRATE TO IndexedDB as ephemeral):
- `recent-tags`
- `lastActiveChat`
- `imageEditorState`
- `scrollPosition`

**API Configuration** (KEEP in localStorage):
- `api_base_url_cache` (runtime cache, not persistent data)
- `use_remote_lambda` (runtime preference)

### 5.2. Migration Strategy

**Phase 1**: Settings Consolidation
1. Read all settings from localStorage (settings, proxy_settings, voice_*)
2. Merge into unified Settings object
3. Save to IndexedDB via `unifiedStorage.save('settings', settings)`
4. Remove individual localStorage keys (EXCEPT auth tokens and API cache)

**Phase 2**: UI State Migration
1. Read UI state from localStorage
2. Save to IndexedDB via `unifiedStorage.saveUIState(type, data)`
3. Remove localStorage keys

**Phase 3**: Remove Direct localStorage Access
1. Replace all `localStorage.getItem('settings')` → `unifiedStorage.get('settings', userId)`
2. Replace all `localStorage.setItem('settings')` → `unifiedStorage.save('settings', settings)`
3. No parameters lost (all data migrated)

**Detailed Steps**: See `LOCALSTORAGE_MIGRATION.md`

---

## 6. Unified Storage API

### 6.1. Core API

```typescript
class UnifiedStorage {
  // Save or update a record
  async save(dataType: string, record: any): Promise<void>
  
  // Get a single record by ID
  async get(dataType: string, id: string): Promise<any | null>
  
  // Query records with filters
  async query(dataType: string, filters?: any): Promise<any[]>
  
  // Delete a record
  async delete(dataType: string, id: string): Promise<void>
  
  // Sync to cloud (only for sync-enabled data types)
  async syncToCloud(dataType: string): Promise<void>
  
  // Pull from cloud (only for sync-enabled data types)
  async pullFromCloud(dataType: string): Promise<void>
  
  // UI State helpers
  async saveUIState(stateType: string, data: any): Promise<void>
  async getUIState(stateType: string): Promise<any | null>
}
```

### 6.2. Usage Examples

**Save Settings**:
```typescript
const settings: Settings = {
  userId: user.email,
  version: '2.0.0',
  language: 'en',
  theme: 'dark',
  providers: [...],
  voice: {
    hotword: 'Hey Google',
    sensitivity: 0.5,
    speechTimeout: 2,
    conversationTimeout: 10000,
    useLocalWhisper: true,
    localWhisperUrl: 'http://localhost:8000',
  },
  proxy: {
    enabled: true,
    username: 'exrihquq',
    password: '***',
    useServerProxy: false,
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

await unifiedStorage.save('settings', settings);
```

**Query Snippets**:
```typescript
// Get all user's snippets
const allSnippets = await unifiedStorage.query('snippets');

// Get snippets for specific project
const projectSnippets = await unifiedStorage.query('snippets', {
  projectId: 'project_abc123',
});
```

**Save UI State**:
```typescript
// Save recent tags (not synced)
await unifiedStorage.saveUIState('recentTags', {
  tags: ['ai', 'research', 'notes'],
  updatedAt: Date.now(),
});

// Retrieve recent tags
const recentTags = await unifiedStorage.getUIState('recentTags');
```

---

## 7. Security & Privacy

### 7.1. Data Ownership

- **User owns all data**: Stored in their Google Drive/Sheets
- **No centralized database**: Application does not store user data server-side
- **Revocable access**: User can revoke OAuth permissions at any time

### 7.2. Authentication

- **Google OAuth 2.0**: Industry-standard authentication
- **Limited scopes**:
  - `drive.file`: Only files created by this app
  - `spreadsheets`: Only spreadsheets created by this app
- **Token storage**: localStorage (HTTPS-only, cleared on sign out)

### 7.3. Privacy Considerations

**⚠️ localStorage is NOT encrypted**:
- OAuth tokens stored in plain text
- Settings (including proxy credentials) stored in plain text
- Vulnerable to XSS attacks

**Mitigation**:
- Strict Content Security Policy (CSP)
- Regular security audits
- Use dedicated proxy accounts with limited permissions
- Recommend strong Google account security (2FA)

**Data Residency**:
- All user data stays in user's Google account
- No third-party data processing
- No analytics or tracking

---

## 8. Success Criteria

1. ✅ **No unauthenticated persistence** - All operations require valid Google OAuth token
2. ✅ **User-scoped data** - All records include userId, all queries filter by userId
3. ✅ **IndexedDB primary** - All persistent data stored in IndexedDB (not localStorage)
4. ✅ **Settings unified** - All settings (app, voice, proxy) in single Settings object
5. ✅ **Feed items local-only** - Persist to survive reload, never sync to cloud
6. ✅ **Ephemeral UI state** - User-scoped, local-only, not synchronized
7. ✅ **Google Drive per-user** - No email subfolders (Drive already user-specific)
8. ✅ **No multi-user sheets** - Each user has their own Sheets document
9. ✅ **Unified API** - Single consistent interface for all persistence operations

---

## Next Steps

1. **Review**: `INDEXEDDB_SCHEMA.md` - Detailed database schema and TypeScript interfaces
2. **Review**: `GOOGLE_SYNC_STRATEGY.md` - Sync implementation and sharding strategy
3. **Review**: `SETTINGS_PERSISTENCE.md` - Unified settings structure and migration
4. **Review**: `LOCALSTORAGE_MIGRATION.md` - Step-by-step localStorage removal
5. **Implement**: See `IMPLEMENTATION_PHASES.md` for week-by-week plan
