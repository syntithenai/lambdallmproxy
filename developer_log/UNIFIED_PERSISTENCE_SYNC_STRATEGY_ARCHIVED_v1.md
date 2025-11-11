# Unified Persistence & Sync Strategy

**Date**: 2025-11-11  
**Status**: Planning Document  
**Goal**: Establish a comprehensive, consistent data persistence and synchronization system for all user data

---

## Executive Summary

This document outlines a complete refactoring of the application's data persistence layer to:
1. **Unify all storage** under a single IndexedDB-based system
2. **Enable complete cloud sync** for all user data via Google Sheets/Drive
3. **Eliminate inconsistent localStorage usage** across the codebase
4. **Implement proper garbage collection** to prevent orphaned data
5. **Add sharding support** for oversized individual records (large JSON objects split across rows)
6. **Ensure direct UI-to-Google communication** with no backend intermediaries
7. **⚡ CRITICAL: Implement user-scoped data** - All records saved with userId, all queries filtered by user
8. **⚡ CRITICAL: Require authentication** - No persistence without valid Google OAuth token
9. **⚡ CRITICAL: Per-user Google Drive/Sheets** - Each user has their own spreadsheet/folders

---

## 0. User-Scoped Data Architecture

### 0.1. Critical Principle: Every Record Belongs to a User

**⚡ MANDATORY**: All user-generated data MUST include a `userId` field (user's email address from Google OAuth).

**Why User Scoping is Critical**:
1. **Privacy**: Users should only see their own data
2. **Multi-User Spreadsheets**: Multiple users can share the same Google Spreadsheet without data mixing
3. **Data Integrity**: Prevents accidental deletion/modification of other users' data
4. **Sync Safety**: Only sync data owned by the authenticated user

### 0.2. User Identification

**Source of Truth**: Google OAuth email address
- Obtained via: `gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail()`
- Stored in: `AuthContext.user.email`
- Used as: Primary user identifier (`userId` field in all records)

**Pattern**:
```typescript
// Get current user
const { user } = useAuth(); // Returns { email: "user@example.com", ... }

// Save data with userId
await unifiedStorage.save('snippets', {
  id: 'snippet_123',
  content: 'My note...',
  userId: user.email, // ✅ REQUIRED
  // ...other fields
});

// Query data filtered by userId
const mySnippets = await unifiedStorage.query('snippets', {
  userId: user.email // ✅ REQUIRED - only returns user's data
});
```

### 0.3. Data Model Requirements

All data types MUST include:
```typescript
interface BaseUserRecord {
  id: string;
  userId: string;        // ✅ REQUIRED: Google OAuth email
  createdAt: number;     // ✅ REQUIRED: Unix timestamp
  updatedAt: number;     // ✅ REQUIRED: Unix timestamp
  // ...type-specific fields
}
```

**Examples**:

```typescript
interface Snippet extends BaseUserRecord {
  content: string;
  tags: string[];
  type: string;
  title?: string;
  projectId?: string;
}

interface FeedItem extends BaseUserRecord {
  title: string;
  content: string;
  url?: string;
  image?: string;
  imageSource?: string;
  projectId?: string;
}

interface Quiz extends BaseUserRecord {
  title: string;
  snippetIds: string[];
  questions: QuizQuestion[];
  projectId?: string;
}
```

### 0.4. Settings: Special Case

**Settings are per-user but singleton**:
```typescript
interface Settings {
  userId: string;  // ✅ REQUIRED: Identifies which user's settings
  version: string;
  providers: ProviderConfig[];
  voice: VoiceSettings;
  proxy: ProxySettings;
  // ...other settings
}

// Stored with userId as the key
await unifiedStorage.save('settings', {
  userId: user.email,
  version: '2.0.0',
  // ...settings
});

// Retrieved by userId
const mySettings = await unifiedStorage.get('settings', user.email);
```

### 0.5. UI State: Not User-Scoped

**Ephemeral UI state is device-local, not user-scoped**:
- Recent tags, last active chat, image editor state
- NOT synced to cloud (stays on device)
- NOT filtered by user (each browser has its own state)

```typescript
// UI state stored without userId (local only)
await unifiedStorage.saveUIState('recent-tags', {
  tags: ['ai', 'research', 'notes'],
  updatedAt: Date.now(),
});
```

### 0.6. IndexedDB Indexes for User Filtering

**All tables MUST have userId index**:
```typescript
class UnifiedDB extends Dexie {
  constructor() {
    super('UnifiedDB');
    this.version(1).stores({
      snippets: 'id, userId, createdAt, updatedAt, projectId',     // ✅ userId indexed
      feedItems: 'id, userId, createdAt, updatedAt, projectId',    // ✅ userId indexed
      ragData: 'id, userId, createdAt, updatedAt',                 // ✅ userId indexed
      quizzes: 'id, userId, createdAt, updatedAt, projectId',      // ✅ userId indexed
      quizProgress: 'id, userId, quizId, updatedAt',               // ✅ userId indexed
      quizAnalytics: 'id, userId, quizId, createdAt',              // ✅ userId indexed
      plans: 'id, userId, createdAt, updatedAt, projectId',        // ✅ userId indexed
      playlists: 'id, userId, createdAt, updatedAt, projectId',    // ✅ userId indexed
      projects: 'id, userId, createdAt, updatedAt',                // ✅ userId indexed
      chatHistory: 'id, userId, createdAt, projectId',             // ✅ userId indexed
      images: 'id, userId, createdAt, source',                     // ✅ userId indexed
      settings: 'userId',                                          // ✅ userId is primary key
    });
  }
}
```

### 0.7. Google Sheets User Filtering

**Every sheet tab includes `user_email` column**:

| ID | user_email | Title | Content | Created At | Updated At |
|----|-----------|-------|---------|------------|------------|
| snippet_1 | alice@example.com | Note 1 | ... | 2025-11-11 | 2025-11-11 |
| snippet_2 | bob@example.com | Note 2 | ... | 2025-11-11 | 2025-11-11 |
| snippet_3 | alice@example.com | Note 3 | ... | 2025-11-11 | 2025-11-11 |

**When pulling from cloud**:
```typescript
// Fetch all rows from Sheets
const allRows = await sheetsAPI.getRows('Snippets');

// Filter to only current user's rows
const myRows = allRows.filter(row => row.user_email === user.email);

// Save to IndexedDB
await db.snippets.bulkPut(myRows.map(row => ({
  id: row.id,
  userId: row.user_email,
  content: row.content,
  // ...
})));
```

**When pushing to cloud**:
```typescript
// Only push current user's data
const mySnippets = await db.snippets.where('userId').equals(user.email).toArray();

// Upload to Sheets with user_email column
await sheetsAPI.appendRows('Snippets', mySnippets.map(snippet => [
  snippet.id,
  snippet.userId,  // ✅ Always include userId in every row
  snippet.title,
  snippet.content,
  // ...
]));
```

### 0.8. Google Drive User Filtering

**Files organized by user email in folder structure**:
```
Research Agent/
├── Users/
│   ├── alice@example.com/
│   │   ├── Images/
│   │   │   ├── ai_generated/
│   │   │   ├── unsplash/
│   │   │   └── pexels/
│   │   └── Chat_History/
│   │       └── chat_123.json
│   └── bob@example.com/
│       ├── Images/
│       └── Chat_History/
└── Shared/ (optional future feature)
```

**Upload path includes userId**:
```typescript
// Upload image to user-specific folder
const uploadPath = `Research Agent/Users/${user.email}/Images/ai_generated/${imageId}.png`;
await driveAPI.uploadFile(uploadPath, imageBlob);
```

**Download filters by folder**:
```typescript
// List files in user's folder only
const userFolder = await driveAPI.findFolder(`Research Agent/Users/${user.email}/Images`);
const files = await driveAPI.listFiles(userFolder.id);
```

### 0.9. Anonymous/Guest Mode

**If user not authenticated**:
- Store data with `userId: 'anonymous'`
- Data stays local only (no cloud sync)
- Prompt user to sign in for cloud sync
- Optional: Migrate anonymous data to user account on sign-in

```typescript
const userId = user?.email || 'anonymous';

await unifiedStorage.save('snippets', {
  id: 'snippet_123',
  userId: userId,  // 'anonymous' if not signed in
  // ...
});

// On sign-in, optionally migrate
if (previouslyAnonymous) {
  await migrateAnonymousData(user.email);
}
```

### 0.10. Multi-User Shared Spreadsheet

**Why this works**:
- Each user's data is tagged with their email
- Pulling from cloud filters by `user_email === currentUser.email`
- Pushing to cloud only uploads user's own rows
- Google Sheets permissions control who can access the spreadsheet
- Users can share the same spreadsheet without seeing each other's data

**Example Flow**:
1. Alice and Bob both have access to "Research Agent Data" spreadsheet
2. Alice saves a snippet → Row added with `user_email: alice@example.com`
3. Bob saves a snippet → Row added with `user_email: bob@example.com`
4. Alice opens app → Pulls only rows where `user_email: alice@example.com`
5. Bob opens app → Pulls only rows where `user_email: bob@example.com`

**No data leakage** - each user only sees their own data despite sharing storage.

---

## 1. Current Data Inventory & Status

### 1.1. User Data Categories

**⚡ CRITICAL**: All data types below MUST include `userId` field. Current implementation status noted.

| Data Type | Current Local Storage | Current Cloud Sync | userId Field | Notes |
|-----------|----------------------|-------------------|--------------|-------|
| **Settings** | localStorage (`app_settings`) | ❌ None | ❌ Missing | Migrate to IndexedDB, add userId |
| **Swag Snippets** | IndexedDB (`db.snippets`) | ✅ Google Sheets | ✅ Has `user_email` | Working, needs image sync |
| **Feed Items** | IndexedDB (`db.feedItems`) | ✅ Google Sheets | ✅ Has `user_email` | Working, needs image sync |
| **RAG Data** | IndexedDB (`db.ragData`) | ❌ None | ❌ Missing | Add userId, implement sync |
| **Quizzes** | IndexedDB (`db.quizzes`) | ❌ None | ✅ Has `userId` | Add sync implementation |
| **Quiz Progress** | Embedded in quiz objects | ❌ None | ❌ Missing | Separate table + userId + sync |
| **Quiz Analytics** | IndexedDB (`db.quizAnalytics`) | ❌ None | ❌ Missing | Add userId, implement sync |
| **Plans** | IndexedDB (`planningDB`) | ✅ Google Drive JSON | ⚠️ Partial | Add userId consistently |
| **Playlists** | IndexedDB (`playlistDB`) | ✅ Google Drive JSON | ❌ Missing | Add userId, migrate to Sheets |
| **Projects** | IndexedDB (`db.projects`) | ❌ None | ❌ Missing | Add userId, implement sync |
| **Chat History** | IndexedDB (`chatHistoryDB`) | ✅ Google Drive JSON | ⚠️ Partial | Add userId consistently |
| **Images (AI/Unsplash/Pexels)** | IndexedDB (`swag-images`) | ❌ None | ❌ Missing | Add userId, Google Drive sync |
| **Voice Settings** | localStorage (multiple keys) | ❌ None | ❌ N/A | Migrate to Settings object |
| **Proxy Settings** | localStorage (`proxy_settings`) | ❌ None | ❌ N/A | Migrate to Settings object |
| **Recent Tags** | localStorage (`swag-recent-tags`) | ❌ None | ❌ N/A | Move to IndexedDB (UI state) |
| **Google Docs Cache** | localStorage (`swag-google-docs-cache`) | ❌ None | ❌ N/A | Move to IndexedDB (UI state) |
| **Image Editor State** | localStorage (multiple keys) | ❌ None | ❌ N/A | Move to IndexedDB (UI state) |
| **Welcome Wizard State** | localStorage (`has_completed_welcome_wizard`) | ❌ None | ❌ N/A | Migrate to Settings object |

**Legend**:
- ✅ Has `userId` - Field exists and is used
- ⚠️ Partial - Field exists but not used consistently
- ❌ Missing - Field does not exist, must be added
- ❌ N/A - Not applicable (will be part of Settings or UI state)

### 1.2. Authentication & Sync Config

| Data Type | Storage | Purpose |
|-----------|---------|---------|
| **Google OAuth Tokens** | localStorage | Required for all sync operations |
| **Auto-sync Enabled** | localStorage (`auto_sync_enabled`) | User preference |
| **Spreadsheet ID** | localStorage (`google_sheets_spreadsheet_id`) | Cache of main spreadsheet |
| **Last Sync Timestamps** | localStorage (various keys) | Optimization metadata |

---

## 2. Target Architecture

### 2.1. Storage Layer Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  (React Components, Contexts, Pages)                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Unified Storage Service (NEW)                   │
│  - Single API for all data operations                        │
│  - Automatic sync queue management                           │
│  - Conflict resolution                                       │
│  - Garbage collection                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│  Local Storage   │    │   Cloud Storage  │
│   (IndexedDB)    │    │ (Google Sheets/  │
│                  │    │  Google Drive)   │
│  - Immediate     │    │  - Debounced     │
│  - Offline-first │    │  - Batched       │
│  - Fast reads    │    │  - Cross-device  │
└──────────────────┘    └──────────────────┘
```

### 2.2. Unified IndexedDB Schema

**⚡ CRITICAL**: All tables (except uiState, syncMetadata, syncQueue) MUST have `userId` indexed for efficient filtering.

```typescript
interface UnifiedDB extends Dexie {
  // ========== USER DATA (ALL REQUIRE userId) ==========
  // Content & Knowledge
  snippets: Dexie.Table<Snippet, string>;
  feedItems: Dexie.Table<FeedItem, string>;
  ragData: Dexie.Table<RAGData, string>;
  quizzes: Dexie.Table<Quiz, string>;
  quizProgress: Dexie.Table<QuizProgress, string>;  // NEW: Separated from quiz objects
  quizAnalytics: Dexie.Table<QuizAnalytic, string>;
  
  // Planning & Organization
  plans: Dexie.Table<Plan, string>;
  playlists: Dexie.Table<Playlist, string>;
  projects: Dexie.Table<Project, string>;
  chatHistory: Dexie.Table<ChatHistoryEntry, string>;
  
  // Media Assets
  images: Dexie.Table<ImageMetadata, string>;  // AI, Unsplash, Pexels - ALL images
  
  // ========== CONFIGURATION (userId as primary key) ==========
  settings: Dexie.Table<Settings, string>;  // NEW: Migrated from localStorage, keyed by userId
  
  // ========== UI STATE (Ephemeral, not synced, no userId) ==========
  uiState: Dexie.Table<UIState, string>;  // NEW: Recent tags, last active chat, etc.
  
  // ========== SYNC METADATA (Internal, no userId) ==========
  syncMetadata: Dexie.Table<SyncMetadata, string>;  // Track sync state per data type
  syncQueue: Dexie.Table<SyncQueueItem, string>;    // Pending sync operations
}

// Schema with indexes
class UnifiedDB extends Dexie {
  constructor() {
    super('UnifiedDB');
    this.version(1).stores({
      // ⚡ CRITICAL: userId MUST be indexed in all user data tables
      snippets: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      feedItems: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      ragData: 'id, userId, createdAt, updatedAt, [userId+createdAt]',
      quizzes: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      quizProgress: 'id, userId, quizId, updatedAt, [userId+quizId]',
      quizAnalytics: 'id, userId, quizId, createdAt, [userId+quizId]',
      plans: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      playlists: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      projects: 'id, userId, createdAt, updatedAt, [userId+createdAt]',
      chatHistory: 'id, userId, timestamp, projectId, [userId+projectId]',
      images: 'id, userId, createdAt, source, [userId+source]',
      
      // Settings keyed by userId (one settings object per user)
      settings: 'userId, updatedAt',
      
      // UI state (no userId - device-local)
      uiState: 'id, updatedAt',
      
      // Sync metadata (internal tracking)
      syncMetadata: 'id, lastSyncedAt',
      syncQueue: 'id, timestamp, dataType',
    });
  }
}

/**
 * Type Definitions with userId
 */

interface BaseUserRecord {
  id: string;
  userId: string;        // ✅ REQUIRED: User's email from Google OAuth
  createdAt: number;     // ✅ REQUIRED: Unix timestamp (ms)
  updatedAt: number;     // ✅ REQUIRED: Unix timestamp (ms)
}

interface Snippet extends BaseUserRecord {
  content: string;
  tags: string[];
  type: string;
  title?: string;
  projectId?: string;
  embedding?: number[];
}

interface FeedItem extends BaseUserRecord {
  title: string;
  content: string;
  url?: string;
  image?: string;        // swag-image:// reference or external URL
  imageSource?: 'ai_generated' | 'unsplash' | 'pexels';
  imageProvider?: string;
  projectId?: string;
}

interface RAGData extends BaseUserRecord {
  content: string;
  source: string;
  metadata?: Record<string, any>;
  embedding?: number[];
}

interface Quiz extends BaseUserRecord {
  title: string;
  snippetIds: string[];
  questions: QuizQuestion[];
  projectId?: string;
}

interface QuizProgress extends BaseUserRecord {
  quizId: string;
  currentQuestionIndex: number;
  answers: Record<string, string>;
  score: number;
  completedAt?: number;
}

interface QuizAnalytic extends BaseUserRecord {
  quizId: string;
  questionId: string;
  correct: boolean;
  timeSpent: number;
}

interface Plan extends BaseUserRecord {
  title: string;
  description: string;
  steps: PlanStep[];
  projectId?: string;
}

interface Playlist extends BaseUserRecord {
  name: string;
  tracks: PlaylistTrack[];
  projectId?: string;
}

interface Project extends BaseUserRecord {
  name: string;
  description?: string;
}

interface ChatHistoryEntry extends BaseUserRecord {
  messages: any[];
  timestamp: number;
  title?: string;
  projectId?: string;
  systemPrompt?: string;
}

interface ImageMetadata extends BaseUserRecord {
  data: string;           // base64 data URL
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  source: 'ai_generated' | 'unsplash' | 'pexels' | 'unknown';
  provider?: string;
  originalUrl?: string;
  cloudUrl?: string;      // Google Drive file ID after sync
}

interface Settings {
  userId: string;         // ✅ PRIMARY KEY: User's email
  version: string;
  providers: ProviderConfig[];
  tavilyApiKey: string;
  language: string;
  embeddingSource: string;
  embeddingModel: string;
  imageQuality: string;
  voice: VoiceSettings;
  proxy: ProxySettings;
  welcomeWizardCompleted: boolean;
  updatedAt: number;
}

interface UIState {
  id: string;             // e.g., 'recent-tags', 'last-active-chat', 'image-editor'
  data: any;
  updatedAt: number;
}
```

### 2.3. Google Sheets Organization

**Single Spreadsheet**: "Research Agent Data" (created in "Research Agent" folder)

**⚡ CRITICAL**: Every tab MUST include `user_email` as the SECOND column (after `id`).

**Tabs**:
1. **Settings** - User configuration (keyed by `user_email`)
2. **Snippets** - Swag snippets with image references (filtered by `user_email`)
3. **Feed** - Feed items with image references (filtered by `user_email`)
4. **RAG Data** - Knowledge base entries (filtered by `user_email`)
5. **Quizzes** - Quiz definitions (filtered by `user_email`)
6. **Quiz Progress** - User progress tracking (filtered by `user_email`)
7. **Quiz Analytics** - Performance statistics (filtered by `user_email`)
8. **Plans** - Research plans (filtered by `user_email`)
9. **Playlists** - Audio playlists (filtered by `user_email`)
10. **Projects** - Project definitions (filtered by `user_email`)
11. **Chat History Metadata** - Chat list (filtered by `user_email`, full chats in Drive)
12. **Sync Metadata** - Last sync timestamps per user (filtered by `user_email`)

**Standard Column Layout**:
All tabs follow this pattern:
```
| Column A | Column B    | Column C      | Column D      | Column E      | ... |
|----------|-------------|---------------|---------------|---------------|-----|
| id       | user_email  | created_at    | updated_at    | (type fields) | ... |
```

**Example: Snippets Tab**:
```
| id          | user_email           | title    | content      | tags         | type | project_id | created_at         | updated_at         |
|-------------|---------------------|----------|--------------|--------------|------|------------|--------------------|-------------------|
| snippet_1   | alice@example.com   | Note 1   | My note...   | ai,research  | tool | proj_1     | 2025-11-11 10:00   | 2025-11-11 10:00  |
| snippet_2   | bob@example.com     | Note 2   | Bob's note.. | ml,python    | tool | proj_2     | 2025-11-11 10:05   | 2025-11-11 10:05  |
| snippet_3   | alice@example.com   | Note 3   | Another...   | databases    | tool | proj_1     | 2025-11-11 10:10   | 2025-11-11 10:10  |
```

**Query Pattern (Client-Side Filtering)**:
```typescript
// Fetch ALL rows from tab
const allRows = await sheetsAPI.getValues(`${spreadsheetId}!Snippets!A:Z`);

// Filter to current user's rows ONLY
const currentUserEmail = user.email;
const myRows = allRows.filter(row => row[1] === currentUserEmail); // Column B = user_email

// Convert to objects
const snippets = myRows.map(row => ({
  id: row[0],
  userId: row[1],      // user_email
  title: row[2],
  content: row[3],
  tags: row[4].split(','),
  type: row[5],
  projectId: row[6],
  createdAt: new Date(row[7]).getTime(),
  updatedAt: new Date(row[8]).getTime(),
}));
```

**Write Pattern (Always Include userId)**:
```typescript
// Get current user's snippets from IndexedDB
const mySnippets = await db.snippets
  .where('userId')
  .equals(user.email)  // ✅ Only user's own data
  .toArray();

// Convert to rows (MUST include user_email in column B)
const rows = mySnippets.map(snippet => [
  snippet.id,                    // Column A
  snippet.userId,                // Column B ✅ REQUIRED
  snippet.title,
  snippet.content,
  snippet.tags.join(','),
  snippet.type,
  snippet.projectId || '',
  new Date(snippet.createdAt).toISOString(),
  new Date(snippet.updatedAt).toISOString(),
]);

// Append to Sheets (only user's own rows)
await sheetsAPI.append(`${spreadsheetId}!Snippets!A:Z`, rows);
```

**Sharding Strategy** (for tabs exceeding 10,000 rows):
- When a tab reaches 9,000 rows across ALL users, create `TabName_Shard_2`
- Keep active data in latest shard
- Archive old shards for history
- UI automatically queries across all shards
- **Important**: Sharding is global (all users), but filtering by `user_email` still applies per shard

**Shard Query Example**:
```typescript
// Query all shards for user's data
const shards = ['Snippets', 'Snippets_Shard_2', 'Snippets_Shard_3'];
let allMySnippets = [];

for (const shard of shards) {
  const allRows = await sheetsAPI.getValues(`${spreadsheetId}!${shard}!A:Z`);
  const myRows = allRows.filter(row => row[1] === user.email);  // ✅ Filter by user
  allMySnippets.push(...myRows);
}
```

### 2.4. Google Drive Organization

**⚡ CRITICAL**: User-specific folders to prevent data mixing.

```
Research Agent/
├── Users/                           # ✅ NEW: Per-user folders
│   ├── alice@example.com/
│   │   ├── Images/
│   │   │   ├── ai_generated/
│   │   │   │   ├── img_20251111_abc123.png
│   │   │   │   └── img_20251111_def456.png
│   │   │   ├── unsplash/
│   │   │   │   ├── photo-123456.jpg
│   │   │   │   └── photo-789012.jpg
│   │   │   └── pexels/
│   │   │       └── video-456789.mp4
│   │   └── Chat_History/
│   │       ├── chat_20251111_123.json
│   │       └── chat_20251111_456.json
│   └── bob@example.com/
│       ├── Images/
│       │   ├── ai_generated/
│       │   ├── unsplash/
│       │   └── pexels/
│       └── Chat_History/
│           └── chat_20251111_789.json
├── Research Agent Data.xlsx         # Shared spreadsheet (filtered by user_email)
└── Shared/ (optional future feature)
```

**Upload Pattern (Always use user-specific path)**:
```typescript
const userId = user.email;  // e.g., 'alice@example.com'

// Upload image to user's folder
const uploadPath = `Research Agent/Users/${userId}/Images/ai_generated/${imageId}.png`;
await driveAPI.uploadFile(uploadPath, imageBlob, {
  description: JSON.stringify({
    userId: userId,           // ✅ Include userId in metadata
    source: 'ai_generated',
    provider: 'openai',
  }),
});
```

**Download Pattern (Only from user's folder)**:
```typescript
const userId = user.email;

// Get user's Images folder
const userImagesFolder = await driveAPI.findFolder(
  `Research Agent/Users/${userId}/Images`
);

if (!userImagesFolder) {
  console.log('No images folder for user');
  return [];
}

// List files in user's folder ONLY
const files = await driveAPI.listFiles({
  q: `'${userImagesFolder.id}' in parents and trashed=false`,
});

// All files are guaranteed to belong to current user
for (const file of files.files) {
  const blob = await driveAPI.downloadFile(file.id);
  // Process file...
}
```

**Folder Permissions**:
- **Option 1** (Recommended): Each user has their own spreadsheet + Drive folder
  - Path: `Research Agent - {user.email}/`
  - Complete isolation, no sharing concerns
  
- **Option 2**: Shared spreadsheet, user-specific Drive folders
  - Spreadsheet: `Research Agent Data` (shared, filtered by user_email)
  - Drive folders: `Research Agent/Users/{user.email}/` (per-user)
  - Allows data portability while maintaining privacy

**Migration Path**:
```typescript
// One-time migration: Move existing files to user-specific folders
async function migrateFilesToUserFolders() {
  const userId = user.email;
  
  // Find old flat Images folder
  const oldImagesFolder = await driveAPI.findFolder('Research Agent/Images');
  
  if (oldImagesFolder) {
    // Create user-specific folder
    const userFolder = await driveAPI.createFolder(
      `Research Agent/Users/${userId}/Images`
    );
    
    // Move all files to user folder
    const files = await driveAPI.listFiles({
      q: `'${oldImagesFolder.id}' in parents`,
    });
    
    for (const file of files.files) {
      await driveAPI.moveFile(file.id, userFolder.id);
      console.log(`Moved ${file.name} to user folder`);
    }
  }
}
```

---

## 3. Detailed Implementation Plan

### 3.1. Phase 1: Consolidate Local Storage (Week 1)

#### Step 1.1: Create Unified Storage Service

**File**: `ui-new/src/services/unifiedStorage.ts`

```typescript
/**
 * Unified Storage Service
 * Single entry point for all data persistence operations
 * Automatically handles local IndexedDB + cloud sync
 */

import Dexie from 'dexie';
import type { SyncAdapter } from './adapters/syncAdapter';

// Import all adapters
import { GoogleSheetsAdapter } from './adapters/googleSheetsAdapter';
import { GoogleDriveAdapter } from './adapters/googleDriveAdapter';

interface StorageConfig<T> {
  tableName: string;
  localStore: 'indexeddb';
  cloudSync: SyncAdapter<T> | null;
  debounceMs: number;        // Wait time before syncing
  garbageCollect?: (items: T[]) => Promise<string[]>;  // Return IDs to delete
}

class UnifiedStorageService {
  private db: UnifiedDB;
  private syncQueue: Map<string, NodeJS.Timeout> = new Map();
  private adapters: Map<string, SyncAdapter<any>> = new Map();
  
  constructor() {
    this.db = new UnifiedDB();
    this.initializeAdapters();
  }
  
  private initializeAdapters(): void {
    // Structured data → Google Sheets
    const sheetsAdapter = new GoogleSheetsAdapter();
    this.adapters.set('settings', sheetsAdapter);
    this.adapters.set('snippets', sheetsAdapter);
    this.adapters.set('feedItems', sheetsAdapter);
    this.adapters.set('ragData', sheetsAdapter);
    this.adapters.set('quizzes', sheetsAdapter);
    this.adapters.set('quizProgress', sheetsAdapter);
    this.adapters.set('quizAnalytics', sheetsAdapter);
    this.adapters.set('plans', sheetsAdapter);
    this.adapters.set('playlists', sheetsAdapter);
    this.adapters.set('projects', sheetsAdapter);
    
    // Binary/blob data → Google Drive
    const driveAdapter = new GoogleDriveAdapter();
    this.adapters.set('images', driveAdapter);
    this.adapters.set('chatHistory', driveAdapter);
  }
  
  /**
   * Save data to local storage and enqueue for sync
   * ⚡ CRITICAL: Automatically adds userId to all records
   */
  async save<T extends BaseUserRecord>(tableName: string, data: T | T[]): Promise<void> {
    // Get current user
    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new Error('Cannot save data: User not authenticated');
    }
    
    // Ensure all items have userId
    const items = Array.isArray(data) ? data : [data];
    const itemsWithUserId = items.map(item => ({
      ...item,
      userId: userId,  // ✅ Force userId on all records
      updatedAt: Date.now(),
    }));
    
    // 1. Save to IndexedDB immediately (offline-first)
    await this.db[tableName].bulkPut(itemsWithUserId);
    
    // 2. Enqueue for cloud sync (debounced)
    this.enqueueSave(tableName, itemsWithUserId);
  }
  
  /**
   * Query data filtered by current user
   * ⚡ CRITICAL: Always filters by userId
   */
  async query<T extends BaseUserRecord>(
    tableName: string,
    filters?: Partial<T>
  ): Promise<T[]> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      console.warn('No user authenticated, returning empty array');
      return [];
    }
    
    // ✅ ALWAYS filter by userId
    let query = this.db[tableName].where('userId').equals(userId);
    
    // Apply additional filters
    if (filters) {
      const results = await query.toArray();
      return results.filter(item => {
        return Object.entries(filters).every(([key, value]) => {
          return item[key] === value;
        });
      });
    }
    
    return await query.toArray();
  }
  
  /**
   * Get current authenticated user ID
   */
  private getCurrentUserId(): string | null {
    // Get from AuthContext
    const user = this.authService.getCurrentUser();
    return user?.email || null;
  }
  
  /**
   * Enqueue save operation for cloud sync (debounced)
   */
  private enqueueSave<T>(tableName: string, items: T[]): void {
    // Clear existing timer
    const existing = this.syncQueue.get(tableName);
    if (existing) clearTimeout(existing);
    
    // Set new timer (debounce to batch rapid saves)
    const timer = setTimeout(async () => {
      await this.syncToCloud(tableName, items);
    }, 2000); // 2 second debounce
    
    this.syncQueue.set(tableName, timer);
  }
  
  /**
   * Sync data to cloud storage
   * ⚡ CRITICAL: Only syncs current user's data
   */
  private async syncToCloud<T extends BaseUserRecord>(tableName: string, items: T[]): Promise<void> {
    const adapter = this.adapters.get(tableName);
    if (!adapter) {
      console.log(`⏭️ Skipping cloud sync for ${tableName} (no adapter)`);
      return;
    }
    
    const userId = this.getCurrentUserId();
    if (!userId) {
      console.error('❌ Cannot sync: User not authenticated');
      return;
    }
    
    // ✅ Filter to only current user's items (defensive check)
    const userItems = items.filter(item => item.userId === userId);
    
    if (userItems.length === 0) {
      console.log(`⏭️ No items to sync for user ${userId}`);
      return;
    }
    
    try {
      console.log(`☁️ Syncing ${userItems.length} ${tableName} to cloud for user ${userId}...`);
      await adapter.save(userItems, userId);  // Pass userId to adapter
      
      // Update sync metadata
      await this.db.syncMetadata.put({
        id: `${tableName}:${userId}`,  // ✅ Per-user sync metadata
        lastSyncedAt: Date.now(),
        lastLocalChange: Date.now(),
        syncStatus: 'idle',
      });
      
      console.log(`✅ Synced ${userItems.length} ${tableName} to cloud`);
    } catch (error) {
      console.error(`❌ Failed to sync ${tableName}:`, error);
      
      // Update sync metadata with error
      await this.db.syncMetadata.put({
        id: `${tableName}:${userId}`,
        lastSyncedAt: Date.now(),
        lastLocalChange: Date.now(),
        syncStatus: 'error',
        errorMessage: error.message,
      });
    }
  }
  
  /**
   * Pull all data from cloud on app startup
   * ⚡ CRITICAL: Only pulls current user's data
   */
  async pullFromCloud(): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      console.error('❌ Cannot pull: User not authenticated');
      return;
    }
    
    console.log(`🔄 Pulling all data from cloud for user ${userId}...`);
    
    for (const [tableName, adapter] of this.adapters.entries()) {
      try {
        // Fetch from cloud (adapter will filter by userId)
        const cloudData = await adapter.fetch(userId);  // ✅ Pass userId
        
        // Get local data for this user
        const localData = await this.db[tableName]
          .where('userId')
          .equals(userId)  // ✅ Only user's local data
          .toArray();
        
        // Merge with conflict resolution (last-write-wins)
        const merged = this.resolveConflicts(localData, cloudData);
        
        // Clear user's data from IndexedDB
        await this.db[tableName]
          .where('userId')
          .equals(userId)
          .delete();
        
        // Save merged data
        await this.db[tableName].bulkPut(merged);
        
        console.log(`✅ Pulled ${merged.length} ${tableName} from cloud for user ${userId}`);
      } catch (error) {
        console.error(`❌ Failed to pull ${tableName} for user ${userId}:`, error);
      }
    }
  }
  
  /**
   * Conflict resolution: last-write-wins based on timestamp
   */
  private resolveConflicts<T extends { id: string; updatedAt?: number }>(
    local: T[],
    cloud: T[]
  ): T[] {
    const byId = new Map<string, T>();
    
    // Add all items, keeping the one with latest timestamp
    [...local, ...cloud].forEach(item => {
      const existing = byId.get(item.id);
      if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
        byId.set(item.id, item);
      }
    });
    
    return Array.from(byId.values());
  }
  
  /**
   * Delete data from local and cloud
   * ⚡ CRITICAL: Verify ownership before deletion
   */
  async delete(tableName: string, id: string): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new Error('Cannot delete: User not authenticated');
    }
    
    // ✅ Verify the item belongs to current user
    const item = await this.db[tableName].get(id);
    if (!item) {
      console.warn(`Item ${id} not found in ${tableName}`);
      return;
    }
    
    if (item.userId !== userId) {
      throw new Error(`Cannot delete item ${id}: Does not belong to user ${userId}`);
    }
    
    // 1. Delete from IndexedDB
    await this.db[tableName].delete(id);
    
    // 2. Delete from cloud
    const adapter = this.adapters.get(tableName);
    if (adapter) {
      await adapter.delete(id, userId);  // ✅ Pass userId for verification
    }
    
    // 3. Garbage collect dependent data
    await this.garbageCollect(tableName, id);
  }
  
  /**
   * Garbage collection: Clean up dependent data
   */
  private async garbageCollect(tableName: string, deletedId: string): Promise<void> {
    console.log(`🗑️ Garbage collecting for ${tableName}:${deletedId}`);
    
    switch (tableName) {
      case 'snippets':
        // Delete images referenced in snippet markdown
        await this.cleanupSnippetImages(deletedId);
        break;
        
      case 'feedItems':
        // Delete images referenced in feed item
        await this.cleanupFeedItemImages(deletedId);
        break;
        
      case 'feedItems':
        // When clearing old feed, remove orphaned images
        await this.cleanupOrphanedFeedImages();
        break;
        
      default:
        console.log(`⏭️ No garbage collection rules for ${tableName}`);
    }
  }
  
  /**
   * Clean up images referenced in deleted snippet
   */
  private async cleanupSnippetImages(snippetId: string): Promise<void> {
    // Find snippet to extract image references
    const snippet = await this.db.snippets.get(snippetId);
    if (!snippet) return;
    
    // Extract swag-image:// references from markdown
    const imageRefs = this.extractImageRefs(snippet.content);
    
    // Check if images are used elsewhere before deleting
    for (const imageRef of imageRefs) {
      const imageId = imageRef.replace('swag-image://', '');
      const isOrphaned = await this.isImageOrphaned(imageId);
      
      if (isOrphaned) {
        console.log(`🗑️ Deleting orphaned image: ${imageId}`);
        await this.db.images.delete(imageId);
        
        // Also delete from Google Drive
        const driveAdapter = this.adapters.get('images') as GoogleDriveAdapter;
        await driveAdapter.deleteImage(imageId);
      }
    }
  }
  
  /**
   * Clean up images referenced in deleted feed item
   */
  private async cleanupFeedItemImages(feedItemId: string): Promise<void> {
    const feedItem = await this.db.feedItems.get(feedItemId);
    if (!feedItem || !feedItem.image) return;
    
    // Only clean up if it's a swag-image:// reference
    if (feedItem.image.startsWith('swag-image://')) {
      const imageId = feedItem.image.replace('swag-image://', '');
      const isOrphaned = await this.isImageOrphaned(imageId);
      
      if (isOrphaned) {
        console.log(`🗑️ Deleting orphaned feed image: ${imageId}`);
        await this.db.images.delete(imageId);
        
        const driveAdapter = this.adapters.get('images') as GoogleDriveAdapter;
        await driveAdapter.deleteImage(imageId);
      }
    }
  }
  
  /**
   * Clean up old feed items (keep only latest N items per user)
   * ⚡ CRITICAL: Only affects current user's data
   */
  async cleanupOldFeedItems(keepCount: number = 100): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      console.warn('Cannot cleanup: User not authenticated');
      return;
    }
    
    // Get user's feed items only
    const allItems = await this.db.feedItems
      .where('userId')
      .equals(userId)  // ✅ Only user's items
      .reverse()
      .sortBy('createdAt');
    
    if (allItems.length <= keepCount) {
      console.log(`✅ Feed items (${allItems.length}) within limit (${keepCount}) for user ${userId}`);
      return;
    }
    
    // Delete old items beyond limit
    const itemsToDelete = allItems.slice(keepCount);
    console.log(`🗑️ Deleting ${itemsToDelete.length} old feed items for user ${userId}`);
    
    for (const item of itemsToDelete) {
      await this.delete('feedItems', item.id);
    }
    
    // Clean up orphaned images (user-scoped)
    await this.cleanupOrphanedFeedImages();
  }
  
  /**
   * Clean up images that are no longer referenced by any of user's content
   * ⚡ CRITICAL: Only checks current user's content
   */
  private async cleanupOrphanedFeedImages(): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) return;
    
    // Get user's images only
    const allImages = await this.db.images
      .where('userId')
      .equals(userId)  // ✅ Only user's images
      .toArray();
    
    for (const image of allImages) {
      const isOrphaned = await this.isImageOrphaned(image.id, userId);
      if (isOrphaned) {
        console.log(`🗑️ Deleting orphaned image: ${image.id} for user ${userId}`);
        await this.db.images.delete(image.id);
        
        const driveAdapter = this.adapters.get('images') as GoogleDriveAdapter;
        await driveAdapter.deleteImage(image.id, userId);  // ✅ Pass userId
      }
    }
  }
  
  /**
   * Check if image is referenced anywhere in the user's content
   * ⚡ CRITICAL: Only checks current user's content
   */
  private async isImageOrphaned(imageId: string, userId: string): Promise<boolean> {
    const imageRef = `swag-image://${imageId}`;
    
    // Check user's snippets only
    const snippets = await this.db.snippets
      .where('userId')
      .equals(userId)  // ✅ Only user's snippets
      .toArray();
    
    for (const snippet of snippets) {
      if (snippet.content.includes(imageRef)) return false;
    }
    
    // Check user's feed items only
    const feedItems = await this.db.feedItems
      .where('userId')
      .equals(userId)  // ✅ Only user's feed items
      .toArray();
    
    for (const item of feedItems) {
      if (item.image === imageRef) return false;
      if (item.content?.includes(imageRef)) return false;
    }
    
    // Not found anywhere in user's content - it's orphaned
    return true;
  }
  
  /**
   * Extract swag-image:// references from markdown
   */
  private extractImageRefs(markdown: string): string[] {
    const regex = /!\[.*?\]\((swag-image:\/\/[^)]+)\)/g;
    const matches: string[] = [];
    let match;
    
    while ((match = regex.exec(markdown)) !== null) {
      matches.push(match[1]);
    }
    
    return matches;
  }
}

export const unifiedStorage = new UnifiedStorageService();
```

#### Step 1.2: Migrate Settings to IndexedDB

**File**: `ui-new/src/contexts/SettingsContext.tsx` (UPDATE)

```typescript
// BEFORE: localStorage-based
const [rawSettings, setRawSettings] = useLocalStorage<Settings>('app_settings', defaultSettings);

// AFTER: IndexedDB-based via unified storage
const [settings, setSettings] = useState<Settings>(defaultSettings);

useEffect(() => {
  // Load from IndexedDB on mount
  unifiedStorage.load('settings', 'singleton').then(setSettings);
}, []);

const updateSettings = async (newSettings: Settings) => {
  setSettings(newSettings);
  await unifiedStorage.save('settings', newSettings);
};
```

#### Step 1.3: Migrate Voice Settings to Settings Object

**File**: `ui-new/src/components/VoiceSettings.tsx` (UPDATE)

```typescript
// BEFORE: Multiple localStorage keys
localStorage.getItem('continuousVoice_hotword')
localStorage.getItem('continuousVoice_sensitivity')
localStorage.getItem('voice_useLocalWhisper')
localStorage.getItem('voice_localWhisperUrl')

// AFTER: Single settings object in IndexedDB
interface Settings {
  // ...existing fields...
  voice: {
    hotword: string;
    sensitivity: number;
    speechTimeout: number;
    conversationTimeout: number;
    useLocalWhisper: boolean;
    localWhisperUrl: string;
  };
}

// Update via SettingsContext
const { settings, updateSettings } = useSettings();
updateSettings({
  ...settings,
  voice: { ...settings.voice, hotword: 'hey google' }
});
```

#### Step 1.4: Migrate UI State to IndexedDB

**File**: `ui-new/src/utils/uiStateStorage.ts` (NEW)

```typescript
/**
 * UI State Storage
 * Stores ephemeral UI state (not synced to cloud)
 */

interface UIState {
  id: string;
  data: any;
  updatedAt: number;
}

// Recent tags for Swag page
export async function saveRecentTags(tags: string[]): Promise<void> {
  await unifiedStorage.saveUIState('recent-tags', { tags, updatedAt: Date.now() });
}

export async function getRecentTags(): Promise<string[]> {
  const state = await unifiedStorage.loadUIState('recent-tags');
  return state?.tags || [];
}

// Last active chat ID
export async function saveLastActiveChatId(id: string): Promise<void> {
  await unifiedStorage.saveUIState('last-active-chat', { id, updatedAt: Date.now() });
}

export async function getLastActiveChatId(): Promise<string | null> {
  const state = await unifiedStorage.loadUIState('last-active-chat');
  return state?.id || null;
}

// Image editor state
export async function saveImageEditorState(state: any): Promise<void> {
  await unifiedStorage.saveUIState('image-editor', { ...state, updatedAt: Date.now() });
}

export async function getImageEditorState(): Promise<any> {
  return await unifiedStorage.loadUIState('image-editor');
}
```

---

### 3.2. Phase 2: Universal Image Sync (Week 2)

#### Step 2.1: Capture ALL Images at Source

**Goal**: Treat Unsplash/Pexels images the same as AI-generated images - save to IndexedDB immediately

**File**: `ui-new/src/contexts/FeedContext.tsx` (UPDATE)

```typescript
// CURRENT: Only AI images are stored in IndexedDB
if (item.imageSource === 'ai_generated') {
  // Store in IndexedDB via imageStorage service
}

// NEW: Store ALL images in IndexedDB (AI, Unsplash, Pexels)
const saveFeedItemWithImage = async (item: FeedItem): Promise<FeedItem> => {
  if (!item.image) return item;
  
  let imageRef = item.image;
  
  // Check if image needs to be downloaded and stored
  if (item.image.startsWith('http://') || item.image.startsWith('https://')) {
    console.log(`📥 Downloading external image: ${item.imageProvider}`);
    
    try {
      // Download image from URL
      const response = await fetch(item.image);
      const blob = await response.blob();
      
      // Convert to base64 data URI
      const base64 = await blobToBase64(blob);
      
      // Save to IndexedDB
      imageRef = await imageStorage.saveImage(base64, {
        source: item.imageSource || 'unknown',
        provider: item.imageProvider,
        originalUrl: item.image,
      });
      
      console.log(`✅ Saved image as: ${imageRef}`);
    } catch (error) {
      console.error(`❌ Failed to download image:`, error);
      // Fall back to original URL if download fails
      imageRef = item.image;
    }
  } else if (item.image.startsWith('data:')) {
    // AI-generated image (already base64)
    imageRef = await imageStorage.saveImage(item.image, {
      source: 'ai_generated',
      provider: item.imageProvider,
      model: item.imageModel,
    });
  }
  
  return {
    ...item,
    image: imageRef, // Now always a swag-image:// reference
  };
};
```

#### Step 2.2: Update Image Storage Service

**File**: `ui-new/src/utils/imageStorage.ts` (UPDATE)

```typescript
interface ImageMetadata {
  id: string;
  data: string;           // base64 data URL
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  source: 'ai_generated' | 'unsplash' | 'pexels' | 'unknown';
  provider?: string;      // e.g., "openai", "unsplash"
  originalUrl?: string;   // Original URL if downloaded
  cloudUrl?: string;      // Google Drive file ID after sync
  createdAt: number;
  updatedAt: number;
}

/**
 * Save image with metadata
 */
async saveImage(
  imageData: string,
  metadata: {
    source: string;
    provider?: string;
    model?: string;
    originalUrl?: string;
  }
): Promise<string> {
  await this.ensureReady();
  
  if (!this.db) {
    throw new Error('IndexedDB not initialized');
  }
  
  const mimeMatch = imageData.match(/data:([^;]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const size = imageData.length;
  
  const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const dimensions = await this.getImageDimensions(imageData);
  
  const imageMetadata: ImageMetadata = {
    id,
    data: imageData,
    size,
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
    source: metadata.source,
    provider: metadata.provider,
    originalUrl: metadata.originalUrl,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  // Save to IndexedDB
  const transaction = this.db.transaction([this.storeName], 'readwrite');
  const store = transaction.objectStore(this.storeName);
  await store.put(imageMetadata);
  
  // Enqueue for Google Drive sync
  await unifiedStorage.enqueueSave('images', imageMetadata);
  
  return `swag-image://${id}`;
}
```

#### Step 2.3: Google Drive Image Adapter

**File**: `ui-new/src/services/adapters/googleDriveImageAdapter.ts` (NEW)

```typescript
/**
 * Google Drive Image Adapter
 * Syncs images to Google Drive for backup and cross-device access
 */

import { requestGoogleAuth } from '../../utils/googleDocs';
import type { SyncAdapter } from './syncAdapter';
import type { ImageMetadata } from '../../utils/imageStorage';

export class GoogleDriveImageAdapter implements SyncAdapter<ImageMetadata> {
  private folderCache: Map<string, string> = new Map();
  
  async save(images: ImageMetadata[]): Promise<void> {
    const token = await requestGoogleAuth();
    
    for (const image of images) {
      // Skip if already uploaded
      if (image.cloudUrl) continue;
      
      try {
        // Determine subfolder based on source
        const subfolder = image.source === 'ai_generated' ? 'ai_generated' :
                          image.source === 'unsplash' ? 'unsplash' :
                          image.source === 'pexels' ? 'pexels' : 'other';
        
        const folderId = await this.getOrCreateFolder(token, `Research Agent/Images/${subfolder}`);
        
        // Convert base64 to blob
        const blob = this.base64ToBlob(image.data);
        
        // Upload to Google Drive
        const metadata = {
          name: `${image.id}.${this.getExtension(image.mimeType)}`,
          parents: [folderId],
          description: JSON.stringify({
            source: image.source,
            provider: image.provider,
            originalUrl: image.originalUrl,
          }),
        };
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);
        
        const response = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form,
          }
        );
        
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
        
        const file = await response.json();
        
        // Update image metadata with cloud URL
        await db.images.update(image.id, {
          cloudUrl: file.id,
          updatedAt: Date.now(),
        });
        
        console.log(`✅ Uploaded image ${image.id} to Drive (${file.id})`);
      } catch (error) {
        console.error(`❌ Failed to upload image ${image.id}:`, error);
      }
    }
  }
  
  async fetch(): Promise<ImageMetadata[]> {
    const token = await requestGoogleAuth();
    const allImages: ImageMetadata[] = [];
    
    // List all images in Images folder
    const folderId = await this.getOrCreateFolder(token, 'Research Agent/Images');
    
    const subfolders = ['ai_generated', 'unsplash', 'pexels', 'other'];
    for (const subfolder of subfolders) {
      const subfolderId = await this.getOrCreateFolder(token, `Research Agent/Images/${subfolder}`);
      
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${subfolderId}' in parents and trashed=false&fields=files(id,name,description)`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) continue;
      
      const data = await response.json();
      
      for (const file of data.files) {
        // Download image content
        const contentResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );
        
        if (!contentResponse.ok) continue;
        
        const blob = await contentResponse.blob();
        const base64 = await this.blobToBase64(blob);
        
        // Parse metadata from description
        let metadata = { source: 'unknown', provider: undefined, originalUrl: undefined };
        try {
          if (file.description) {
            metadata = JSON.parse(file.description);
          }
        } catch (e) {
          console.warn('Could not parse image metadata:', e);
        }
        
        const imageId = file.name.split('.')[0]; // Remove extension
        
        allImages.push({
          id: imageId,
          data: base64,
          size: base64.length,
          mimeType: blob.type,
          source: metadata.source,
          provider: metadata.provider,
          originalUrl: metadata.originalUrl,
          cloudUrl: file.id,
          createdAt: 0, // Unknown from Drive
          updatedAt: Date.now(),
        });
      }
    }
    
    return allImages;
  }
  
  async delete(id: string): Promise<void> {
    const token = await requestGoogleAuth();
    const image = await db.images.get(id);
    
    if (!image?.cloudUrl) return;
    
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${image.cloudUrl}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    console.log(`🗑️ Deleted image ${id} from Drive`);
  }
  
  private async getOrCreateFolder(token: string, path: string): Promise<string> {
    if (this.folderCache.has(path)) {
      return this.folderCache.get(path)!;
    }
    
    // Recursively create folder path
    const parts = path.split('/');
    let parentId = 'root';
    
    for (const part of parts) {
      const fullPath = parts.slice(0, parts.indexOf(part) + 1).join('/');
      
      if (this.folderCache.has(fullPath)) {
        parentId = this.folderCache.get(fullPath)!;
        continue;
      }
      
      // Search for existing folder
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${part}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      const searchData = await searchResponse.json();
      
      if (searchData.files && searchData.files.length > 0) {
        parentId = searchData.files[0].id;
      } else {
        // Create folder
        const createResponse = await fetch(
          'https://www.googleapis.com/drive/v3/files',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: part,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [parentId]
            })
          }
        );
        
        const createData = await createResponse.json();
        parentId = createData.id;
      }
      
      this.folderCache.set(fullPath, parentId);
    }
    
    return parentId;
  }
  
  private base64ToBlob(base64: string): Blob {
    const parts = base64.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const byteString = atob(parts[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([arrayBuffer], { type: mimeType });
  }
  
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    return map[mimeType] || 'png';
  }
}
```

---

### 3.3. Phase 3: Google Sheets Sharding (Week 3)

#### Step 3.1: Implement Automatic Sharding

**File**: `ui-new/src/services/adapters/googleSheetsAdapter.ts` (UPDATE)

```typescript
const MAX_ROWS_PER_SHARD = 9000; // Leave buffer before 10K limit

class GoogleSheetsAdapter {
  /**
   * Save data to Google Sheets with automatic sharding
   */
  async saveData<T>(tabName: string, data: T[]): Promise<void> {
    const token = await requestGoogleAuth();
    const spreadsheetId = await this.getOrCreateSpreadsheet();
    
    // Check if sharding is needed
    const currentRowCount = await this.getRowCount(spreadsheetId, tabName);
    const totalRows = currentRowCount + data.length;
    
    if (totalRows > MAX_ROWS_PER_SHARD) {
      console.log(`⚠️ Sharding needed for ${tabName}: ${totalRows} rows`);
      await this.saveWithSharding(spreadsheetId, tabName, data);
    } else {
      // Normal save to single tab
      await this.saveToTab(spreadsheetId, tabName, data);
    }
  }
  
  /**
   * Save data across multiple sharded tabs
   */
  private async saveWithSharding<T>(
    spreadsheetId: string,
    tabName: string,
    data: T[]
  ): Promise<void> {
    // Find highest shard number
    const shards = await this.getShardTabs(spreadsheetId, tabName);
    const latestShard = shards.length > 0 ? Math.max(...shards.map(s => s.shardNum)) : 1;
    
    // Get current row count in latest shard
    const latestShardName = `${tabName}_Shard_${latestShard}`;
    const currentRows = await this.getRowCount(spreadsheetId, latestShardName);
    
    if (currentRows + data.length > MAX_ROWS_PER_SHARD) {
      // Create new shard
      const newShardNum = latestShard + 1;
      const newShardName = `${tabName}_Shard_${newShardNum}`;
      
      console.log(`📄 Creating new shard: ${newShardName}`);
      await this.createTab(spreadsheetId, newShardName);
      
      // Save to new shard
      await this.saveToTab(spreadsheetId, newShardName, data);
    } else {
      // Append to latest shard
      await this.saveToTab(spreadsheetId, latestShardName, data);
    }
  }
  
  /**
   * Fetch data from all shards
   */
  async fetchData<T>(tabName: string): Promise<T[]> {
    const token = await requestGoogleAuth();
    const spreadsheetId = await this.getOrCreateSpreadsheet();
    
    // Get all shard tabs
    const shards = await this.getShardTabs(spreadsheetId, tabName);
    
    if (shards.length === 0) {
      // No shards, try base tab
      return await this.fetchFromTab(spreadsheetId, tabName);
    }
    
    // Fetch from all shards and merge
    const allData: T[] = [];
    for (const shard of shards) {
      const shardData = await this.fetchFromTab(spreadsheetId, shard.name);
      allData.push(...shardData);
    }
    
    return allData;
  }
  
  /**
   * Get list of shard tabs for a base tab name
   */
  private async getShardTabs(
    spreadsheetId: string,
    baseTabName: string
  ): Promise<Array<{ name: string; shardNum: number }>> {
    const token = await requestGoogleAuth();
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    const data = await response.json();
    const shards: Array<{ name: string; shardNum: number }> = [];
    
    for (const sheet of data.sheets) {
      const title = sheet.properties.title;
      
      // Match pattern: TabName_Shard_N
      const match = title.match(new RegExp(`^${baseTabName}_Shard_(\\d+)$`));
      if (match) {
        shards.push({
          name: title,
          shardNum: parseInt(match[1]),
        });
      }
    }
    
    return shards.sort((a, b) => a.shardNum - b.shardNum);
  }
  
  /**
   * Get row count for a tab
   */
  private async getRowCount(spreadsheetId: string, tabName: string): Promise<number> {
    const token = await requestGoogleAuth();
    
    try {
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tabName}!A:A`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      const data = await response.json();
      return data.values ? data.values.length : 0;
    } catch (error) {
      return 0; // Tab doesn't exist yet
    }
  }
}
```

---

### 3.4. Phase 4: Eliminate Direct Storage Access (Week 4)

#### Step 4.1: Audit & Replace Direct localStorage Access

**Files to Update** (147 occurrences found):

1. **Authentication** (`ui-new/src/utils/auth.ts`)
   - Keep OAuth tokens in localStorage (required by Google OAuth flow)
   - Move all other auth state to unified storage

2. **Settings** (multiple files)
   - Replace all `localStorage.getItem('app_settings')` with `unifiedStorage.load('settings')`
   - Replace all `localStorage.setItem('app_settings')` with `unifiedStorage.save('settings')`

3. **UI State** (multiple files)
   - Move `swag-recent-tags` → `unifiedStorage.saveUIState('recent-tags')`
   - Move `last_active_chat_id` → `unifiedStorage.saveUIState('last-active-chat')`
   - Move `image_editor_*` → `unifiedStorage.saveUIState('image-editor')`

4. **RAG Config** (multiple files)
   - Move `rag_config` → Part of Settings object
   - Move `rag_spreadsheet_id` → Sync metadata
   - Move `rag_google_linked` → Sync metadata

5. **Proxy Settings** (`SettingsPage.tsx`)
   - Move `proxy_settings` → Part of Settings object

6. **Voice Settings** (`VoiceSettings.tsx`, `ContinuousVoiceMode.tsx`)
   - Move all `continuousVoice_*` keys → `settings.voice` object
   - Move `voice_useLocalWhisper` → `settings.voice.useLocalWhisper`

7. **Welcome Wizard** (`auth.ts`)
   - Move `has_completed_welcome_wizard` → `settings.welcomeWizardCompleted`

8. **Google Docs Cache** (`SwagPage.tsx`)
   - Move `swag-google-docs-cache` → `unifiedStorage.saveUIState('google-docs-cache')`

9. **Planning Transfer** (`ChatTab.tsx`)
   - Keep `sessionStorage` for temporary page-to-page data transfer
   - No sync needed (ephemeral)

#### Step 4.2: Create Storage Migration Utility

**File**: `ui-new/src/utils/storageMigration.ts` (NEW)

```typescript
/**
 * One-time migration from localStorage to unified storage
 * Runs on app startup, safely migrates all legacy data
 */

import { unifiedStorage } from '../services/unifiedStorage';

export async function migrateFromLocalStorage(): Promise<void> {
  console.log('🔄 Migrating data from localStorage to unified storage...');
  
  try {
    // 1. Migrate Settings
    await migrateSettings();
    
    // 2. Migrate UI State
    await migrateUIState();
    
    // 3. Migrate RAG Config
    await migrateRAGConfig();
    
    // 4. Cleanup old localStorage keys
    await cleanupLocalStorage();
    
    console.log('✅ Migration complete');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

async function migrateSettings(): Promise<void> {
  const oldSettings = localStorage.getItem('app_settings');
  if (!oldSettings) return;
  
  try {
    const settings = JSON.parse(oldSettings);
    
    // Add new voice settings from separate keys
    settings.voice = {
      hotword: localStorage.getItem('continuousVoice_hotword') || 'hey google',
      sensitivity: parseFloat(localStorage.getItem('continuousVoice_sensitivity') || '0.5'),
      speechTimeout: parseFloat(localStorage.getItem('continuousVoice_speechTimeout') || '2'),
      conversationTimeout: parseInt(localStorage.getItem('continuousVoice_conversationTimeout') || '10000'),
      useLocalWhisper: localStorage.getItem('voice_useLocalWhisper') === 'true',
      localWhisperUrl: localStorage.getItem('voice_localWhisperUrl') || 'http://localhost:8000',
    };
    
    // Add proxy settings
    const proxySettings = localStorage.getItem('proxy_settings');
    if (proxySettings) {
      settings.proxy = JSON.parse(proxySettings);
    }
    
    // Add welcome wizard state
    settings.welcomeWizardCompleted = localStorage.getItem('has_completed_welcome_wizard') === 'true';
    
    // Save to unified storage
    await unifiedStorage.save('settings', settings);
    
    console.log('✅ Migrated settings');
  } catch (error) {
    console.error('❌ Failed to migrate settings:', error);
  }
}

async function migrateUIState(): Promise<void> {
  // Recent tags
  const recentTags = localStorage.getItem('swag-recent-tags');
  if (recentTags) {
    await unifiedStorage.saveUIState('recent-tags', JSON.parse(recentTags));
  }
  
  // Last active chat
  const lastChatId = localStorage.getItem('last_active_chat_id');
  if (lastChatId) {
    await unifiedStorage.saveUIState('last-active-chat', { id: lastChatId });
  }
  
  // Google Docs cache
  const docsCache = localStorage.getItem('swag-google-docs-cache');
  if (docsCache) {
    await unifiedStorage.saveUIState('google-docs-cache', JSON.parse(docsCache));
  }
  
  // Image editor state
  const editorImages = localStorage.getItem('image_editor_images');
  const editorSelection = localStorage.getItem('image_editor_selection');
  const editorCommand = localStorage.getItem('image_editor_command');
  if (editorImages || editorSelection || editorCommand) {
    await unifiedStorage.saveUIState('image-editor', {
      images: editorImages ? JSON.parse(editorImages) : [],
      selection: editorSelection ? JSON.parse(editorSelection) : [],
      command: editorCommand || '',
    });
  }
  
  console.log('✅ Migrated UI state');
}

async function migrateRAGConfig(): Promise<void> {
  const ragConfig = localStorage.getItem('rag_config');
  if (!ragConfig) return;
  
  try {
    const config = JSON.parse(ragConfig);
    
    // Merge into settings
    const settings = await unifiedStorage.load('settings');
    await unifiedStorage.save('settings', {
      ...settings,
      rag: config,
    });
    
    console.log('✅ Migrated RAG config');
  } catch (error) {
    console.error('❌ Failed to migrate RAG config:', error);
  }
}

async function cleanupLocalStorage(): Promise<void> {
  const keysToRemove = [
    'app_settings',
    'continuousVoice_hotword',
    'continuousVoice_sensitivity',
    'continuousVoice_speechTimeout',
    'continuousVoice_conversationTimeout',
    'voice_useLocalWhisper',
    'voice_localWhisperUrl',
    'proxy_settings',
    'has_completed_welcome_wizard',
    'swag-recent-tags',
    'last_active_chat_id',
    'swag-google-docs-cache',
    'image_editor_images',
    'image_editor_selection',
    'image_editor_command',
    'rag_config',
  ];
  
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  
  console.log(`✅ Cleaned up ${keysToRemove.length} localStorage keys`);
}
```

---

### 3.5. Phase 5: OAuth Token Propagation (Week 5)

#### Step 5.1: Centralized Token Management

**File**: `ui-new/src/utils/tokenManager.ts` (NEW)

```typescript
/**
 * Centralized OAuth Token Management
 * Ensures all sync adapters receive valid tokens
 */

import { getGoogleAuthToken, refreshGoogleToken } from './auth';

class TokenManager {
  private cachedToken: string | null = null;
  private tokenExpiration: number = 0;
  
  /**
   * Get valid Google OAuth token (refreshes if needed)
   */
  async getToken(): Promise<string> {
    // Check if cached token is still valid
    if (this.cachedToken && Date.now() < this.tokenExpiration - 60000) {
      return this.cachedToken;
    }
    
    // Try to refresh token
    try {
      const token = await refreshGoogleToken();
      this.cachedToken = token;
      this.tokenExpiration = this.getTokenExpiration(token);
      return token;
    } catch (error) {
      console.error('❌ Token refresh failed, requesting new auth:', error);
      
      // Fall back to requesting new token
      const token = await getGoogleAuthToken();
      this.cachedToken = token;
      this.tokenExpiration = this.getTokenExpiration(token);
      return token;
    }
  }
  
  /**
   * Extract expiration from JWT token
   */
  private getTokenExpiration(token: string): number {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000; // Convert to milliseconds
    } catch (error) {
      // Default to 1 hour if can't parse
      return Date.now() + 3600000;
    }
  }
  
  /**
   * Clear cached token (on logout)
   */
  clearToken(): void {
    this.cachedToken = null;
    this.tokenExpiration = 0;
  }
}

export const tokenManager = new TokenManager();
```

#### Step 5.2: Update All Adapters to Use Token Manager

**File**: `ui-new/src/services/adapters/googleSheetsAdapter.ts` (UPDATE)

```typescript
import { tokenManager } from '../../utils/tokenManager';

// BEFORE:
const token = await requestGoogleAuth();

// AFTER:
const token = await tokenManager.getToken();
```

**Files to Update**:
- `ui-new/src/services/adapters/googleSheetsAdapter.ts`
- `ui-new/src/services/adapters/googleDriveImageAdapter.ts`
- `ui-new/src/services/adapters/plansAdapter.ts`
- `ui-new/src/services/adapters/playlistsAdapter.ts`
- `ui-new/src/services/googleDriveSync.ts`

---

## 4. Additional User Data Identified

### 4.1. Quiz Analytics

**Current**: IndexedDB (`db.quizAnalytics`)  
**Sync**: ❌ None  
**Action**: Add to Google Sheets sync (tab: "Quiz Analytics")

### 4.2. Projects

**Current**: IndexedDB (`db.projects`)  
**Sync**: ❌ None  
**Action**: Add to Google Sheets sync (tab: "Projects")

### 4.3. Embeddings Cache

**Current**: IndexedDB (via transformers.js)  
**Sync**: ❌ None  
**Action**: Optional - very large, better to regenerate locally

### 4.4. Planning Transfer Data

**Current**: sessionStorage (`planning_transfer_data`)  
**Sync**: ❌ None (ephemeral)  
**Action**: No sync needed - temporary page transfer only

---

## 5. Data Cleanup Rules

### 5.1. Feed Items Cleanup

```typescript
// Run daily or on app startup
unifiedStorage.cleanupOldFeedItems(100); // Keep latest 100 items

// Cleanup logic:
// 1. Delete feed items older than keepCount
// 2. Delete associated images if not referenced elsewhere
// 3. Delete from both IndexedDB and Google Sheets/Drive
```

### 5.2. Snippet Images Cleanup

```typescript
// On snippet deletion
unifiedStorage.delete('snippets', snippetId);

// Automatic cleanup:
// 1. Extract swag-image:// references from snippet markdown
// 2. Check if images are used elsewhere (other snippets, feed items)
// 3. Delete orphaned images from IndexedDB and Google Drive
```

### 5.3. Chat History Cleanup

```typescript
// Keep latest N chats per project
chatHistoryDB.cleanupOldChats(100);

// Cleanup logic:
// 1. Sort by timestamp descending
// 2. Keep top N per project (or N for null project)
// 3. Delete old chats from IndexedDB and Google Drive
```

---

## 6. No Server-Side Calls Required

### 6.1. Current Server Dependencies

**Backend Endpoints Used**:
- ❌ None for sync operations
- ✅ `/chat` - LLM inference only
- ✅ `/feed` - Feed generation only
- ✅ `/quiz` - Quiz generation only
- ✅ `/transcribe` - Audio transcription only

**Sync Architecture**:
```
┌──────────────┐          ┌─────────────────┐
│   Browser    │ ────────▶│  Google APIs    │
│   (React UI) │   HTTPS  │  (Sheets/Drive) │
└──────────────┘ ◀──────── └─────────────────┘
                   OAuth2
                   
NO backend involvement in sync!
```

### 6.2. OAuth Flow (UI-Only)

```typescript
// All OAuth handled in browser
import { gapi } from 'gapi-script';

// Initialize Google API client
gapi.load('client:auth2', () => {
  gapi.client.init({
    clientId: 'YOUR_CLIENT_ID',
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
  });
});

// Sign in
gapi.auth2.getAuthInstance().signIn();

// Get token
const token = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;

// Use token in Fetch API calls directly to Google
fetch('https://sheets.googleapis.com/v4/...', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 7. Migration Timeline

| Phase | Week | Deliverables | Risk |
|-------|------|--------------|------|
| **1. Consolidate Local Storage** | 1 | Unified storage service, Settings migration | Low |
| **2. Universal Image Sync** | 2 | Image download, Google Drive upload | Medium |
| **3. Google Sheets Sharding** | 3 | Automatic sharding, multi-shard queries | Medium |
| **4. Eliminate Direct Storage** | 4 | Replace 147 localStorage calls | High |
| **5. OAuth Propagation** | 5 | Token manager, adapter updates | Low |

---

## 8. Testing Checklist

### 8.1. Local Storage

- [ ] Settings persist across page reloads
- [ ] UI state (recent tags, last chat) persists
- [ ] All localStorage keys migrated to IndexedDB
- [ ] No direct localStorage access outside auth

### 8.2. Cloud Sync

- [ ] Snippets sync to Google Sheets
- [ ] Feed items sync to Google Sheets
- [ ] Images sync to Google Drive (all sources)
- [ ] Quizzes sync to Google Sheets
- [ ] Plans sync to Google Sheets
- [ ] Playlists sync to Google Sheets
- [ ] Projects sync to Google Sheets
- [ ] Chat history metadata syncs to Sheets
- [ ] Chat history full content syncs to Drive

### 8.3. Data Cleanup

- [ ] Old feed items deleted (keep 100)
- [ ] Orphaned images deleted
- [ ] Snippet deletion removes images
- [ ] Feed item deletion removes images
- [ ] Old chats deleted (keep 100 per project)

### 8.4. Sharding

- [ ] Snippets shard at 9,000 rows
- [ ] Feed items shard at 9,000 rows
- [ ] Multi-shard queries return all data
- [ ] New shards created automatically

### 8.5. OAuth

- [ ] Token refreshes before expiry
- [ ] All adapters use token manager
- [ ] No server-side token calls
- [ ] Token survives page reload

---

## 9. Success Criteria

1. ✅ **All user data** persisted in IndexedDB
2. ✅ **All user data** synced to Google (Sheets or Drive)
3. ✅ **Zero localStorage usage** (except OAuth tokens)
4. ✅ **Zero orphaned data** (automatic cleanup)
5. ✅ **Sharding works** for large datasets
6. ✅ **Direct UI-to-Google** sync (no backend)
7. ✅ **Cross-device sync** works seamlessly
8. ✅ **Offline-first** with eventual consistency
9. ✅ **⚡ ALL records include userId** - No exceptions
10. ✅ **⚡ ALL queries filter by userId** - User sees only their data
11. ✅ **⚡ Multi-user safe** - Multiple users can share same spreadsheet
12. ✅ **⚡ Ownership verification** - Users can only delete their own data

---

## 10. User Filtering Validation Checklist

### 10.1. Database Schema
- [ ] All tables have `userId` indexed
- [ ] All tables have compound indexes with `userId` (e.g., `[userId+projectId]`)
- [ ] Settings table uses `userId` as primary key
- [ ] UI state tables do NOT have `userId` (device-local)

### 10.2. Save Operations
- [ ] All save operations automatically add `userId`
- [ ] Save fails if user not authenticated
- [ ] `updatedAt` timestamp automatically set on save
- [ ] Cannot save data for different userId than authenticated user

### 10.3. Query Operations
- [ ] All queries automatically filter by `userId`
- [ ] Query returns empty array if user not authenticated
- [ ] Compound queries still filter by `userId` first
- [ ] No queries bypass userId filtering (except internal sync/ui state)

### 10.4. Delete Operations
- [ ] Delete verifies item belongs to authenticated user
- [ ] Delete fails if userId doesn't match
- [ ] Garbage collection only checks user's own data
- [ ] Orphan detection scoped to user's content

### 10.5. Google Sheets Sync
- [ ] All tabs have `user_email` as column B
- [ ] Pull operations filter rows by `user_email === user.email`
- [ ] Push operations only upload user's own rows
- [ ] Sharded queries filter by user across all shards
- [ ] Spreadsheet can be shared without data mixing

### 10.6. Google Drive Sync
- [ ] Files uploaded to `Users/{userId}/` subfolders
- [ ] Downloads only from user's subfolder
- [ ] File metadata includes `userId` in description
- [ ] Cannot access other users' folders

### 10.7. Edge Cases
- [ ] Anonymous mode stores data with `userId: 'anonymous'`
- [ ] Anonymous data can be migrated to user account on sign-in
- [ ] Switching users clears IndexedDB and pulls new user's data
- [ ] Logout clears user-specific data from IndexedDB
- [ ] Re-login pulls user's data from cloud

### 10.8. Security & Privacy
- [ ] User A cannot see User B's data (even in shared spreadsheet)
- [ ] User A cannot modify User B's data
- [ ] User A cannot delete User B's data
- [ ] Shared spreadsheet filters correctly on client side
- [ ] Drive folder permissions prevent cross-user access

---

## 11. Migration Checklist: Adding userId to Existing Data

### 11.1. Identify Records Missing userId

**Script**: `ui-new/src/utils/addUserIdMigration.ts`

```typescript
/**
 * One-time migration: Add userId to all existing records
 * Run this ONCE after deploying userId changes
 */

import { db } from '../db/db';
import { getCurrentUser } from './auth';

export async function addUserIdToExistingRecords(): Promise<void> {
  const user = getCurrentUser();
  if (!user?.email) {
    console.error('❌ Cannot migrate: User not authenticated');
    return;
  }
  
  const userId = user.email;
  console.log(`🔄 Adding userId to existing records for ${userId}...`);
  
  // Migrate snippets
  await migrateTable('snippets', userId);
  
  // Migrate feed items
  await migrateTable('feedItems', userId);
  
  // Migrate RAG data
  await migrateTable('ragData', userId);
  
  // Migrate quizzes
  await migrateTable('quizzes', userId);
  
  // Migrate quiz analytics
  await migrateTable('quizAnalytics', userId);
  
  // Migrate plans
  await migrateTable('plans', userId);
  
  // Migrate playlists
  await migrateTable('playlists', userId);
  
  // Migrate projects
  await migrateTable('projects', userId);
  
  // Migrate chat history
  await migrateTable('chatHistory', userId);
  
  // Migrate images
  await migrateTable('images', userId);
  
  console.log('✅ Migration complete');
}

async function migrateTable(tableName: string, userId: string): Promise<void> {
  try {
    const allRecords = await db[tableName].toArray();
    const recordsWithoutUserId = allRecords.filter(r => !r.userId);
    
    if (recordsWithoutUserId.length === 0) {
      console.log(`✅ ${tableName}: All records already have userId`);
      return;
    }
    
    console.log(`🔄 ${tableName}: Adding userId to ${recordsWithoutUserId.length} records...`);
    
    const updated = recordsWithoutUserId.map(record => ({
      ...record,
      userId: userId,
      updatedAt: record.updatedAt || Date.now(),
    }));
    
    await db[tableName].bulkPut(updated);
    console.log(`✅ ${tableName}: Migrated ${updated.length} records`);
  } catch (error) {
    console.error(`❌ ${tableName}: Migration failed:`, error);
  }
}
```

### 11.2. Run Migration on App Startup

**File**: `ui-new/src/App.tsx` (UPDATE)

```typescript
import { addUserIdToExistingRecords } from './utils/addUserIdMigration';

// In useEffect after user authentication
useEffect(() => {
  if (user?.email) {
    // Check if migration already ran
    const migrationComplete = localStorage.getItem('userId_migration_complete');
    
    if (!migrationComplete) {
      addUserIdToExistingRecords().then(() => {
        // Mark migration as complete
        localStorage.setItem('userId_migration_complete', 'true');
        console.log('✅ userId migration complete');
      });
    }
  }
}, [user]);
```

### 11.3. Google Sheets Migration

**Add `user_email` column to existing sheets**:

```typescript
/**
 * One-time migration: Add user_email column to existing Google Sheets tabs
 */
async function addUserEmailColumnToSheets(): Promise<void> {
  const token = await tokenManager.getToken();
  const user = getCurrentUser();
  const spreadsheetId = await googleSheetsAdapter.getSpreadsheetId();
  
  const tabs = ['Snippets', 'Feed', 'RAG Data', 'Quizzes', 'Plans', 'Playlists', 'Projects'];
  
  for (const tab of tabs) {
    try {
      // Get existing data
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tab}!A:Z`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      const data = await response.json();
      const rows = data.values || [];
      
      if (rows.length === 0) continue;
      
      // Check if user_email column already exists
      const headers = rows[0];
      if (headers.includes('user_email')) {
        console.log(`✅ ${tab}: user_email column already exists`);
        continue;
      }
      
      console.log(`🔄 ${tab}: Adding user_email column...`);
      
      // Insert user_email as column B (after id)
      const updatedRows = rows.map((row, index) => {
        if (index === 0) {
          // Header row: insert 'user_email' after 'id'
          return [row[0], 'user_email', ...row.slice(1)];
        } else {
          // Data rows: insert current user's email
          return [row[0], user.email, ...row.slice(1)];
        }
      });
      
      // Clear existing data
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tab}!A:Z:clear`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      // Write updated data
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tab}!A1`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: updatedRows
          })
        }
      );
      
      console.log(`✅ ${tab}: Added user_email column to ${updatedRows.length - 1} rows`);
    } catch (error) {
      console.error(`❌ ${tab}: Failed to add user_email column:`, error);
    }
  }
}
```

---

## 12. Rollback Plan

If migration fails:
1. Revert to previous version via git
2. localStorage data still intact (not deleted until verified)
3. IndexedDB can be cleared without data loss
4. Google Sheets/Drive data serves as backup

**Safety**: Migration is additive - existing data preserved in localStorage until verification complete.
