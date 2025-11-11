# Google Sync Strategy

**Date**: 2025-11-11  
**Status**: Planning Document  
**Scope**: Cloud synchronization via Google Drive and Google Sheets

---

## Executive Summary

This document defines the strategy for synchronizing local IndexedDB data with Google Drive and Google Sheets:

1. **User-Owned Storage** - Each user syncs to their own Google Drive/Sheets (no multi-user shared documents)
2. **Selective Sync** - Only specific data types sync to cloud (feed items are local-only)
3. **Sharding Strategy** - Large individual objects split across multiple rows for Sheets storage
4. **Strip userId on Upload** - No need to store user email in Google storage (restored on download)
5. **Direct UI-to-Google** - No backend intermediary, uses gapi library

---

## 1. Sync-Enabled Data Types

### 1.1. Google Drive (Blobs & JSON Documents)

| Data Type | File Pattern | Format | Sync Trigger |
|-----------|-------------|--------|--------------|
| Settings | `settings.json` | JSON | On change |
| Plans | `plans/{planId}.json` | JSON | On change |
| Playlists | `playlists/{playlistId}.json` | JSON | On change |
| Projects | `projects.json` | JSON (array) | On change |
| Chat History | `chat/{chatId}.json` | JSON | Manual |
| Images | `images/{imageId}.{ext}` | Blob | Manual |

**Folder Structure**:
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

### 1.2. Google Sheets (Tabular Data)

| Data Type | Sheet Tab Name | Sync Trigger | Sharding Enabled |
|-----------|---------------|--------------|------------------|
| Snippets | `Snippets` | Manual + periodic | Yes |
| RAG Data | `RAG` | Manual + periodic | Yes |
| Quizzes | `Quizzes` | Manual | Yes |
| Quiz Analytics | `QuizAnalytics` | After quiz completion | No |

**Spreadsheet Name**: `Research Agent Data`

**Tab Layout Example** (Snippets):

| Row | ID | Content | Tags | Type | Title | Project ID | Created At | Updated At |
|-----|-----|---------|------|------|-------|-----------|------------|------------|
| 1 | snippet_1 | Note content... | ai,research | text | My Note | project_1 | 2025-11-11 | 2025-11-11 |
| 2 | snippet_2 | Large content... (shard 1/3) | ai | text | Big Note | - | 2025-11-11 | 2025-11-11 |
| 3 | snippet_2 | ...continued... (shard 2/3) | - | - | - | - | - | - |
| 4 | snippet_2 | ...end (shard 3/3) | - | - | - | - | - | - |

**Key Points**:
- **No `user_email` column** - Each user has their own spreadsheet
- **Sharding for large content** - Rows 2-4 show single snippet split across 3 rows
- **First row has metadata** - Subsequent shard rows only have ID and content fragment

### 1.3. Local-Only Data (Never Synced)

| Data Type | Reason |
|-----------|--------|
| Feed Items | High volume, regenerable, low long-term value |
| Quiz Progress | Embedded in Quiz Analytics (synced indirectly) |
| UI State | Device-local ephemeral state |

---

## 2. Sharding Strategy for Large Objects

### 2.1. Why Sharding?

**Problem**: Google Sheets has a maximum cell size of ~50,000 characters per cell.

**Solution**: Split large content across multiple rows, reassemble on load.

**Use Cases**:
- Snippets with large code blocks
- RAG data with long documents
- Quizzes with many questions
- Any content exceeding cell limit

### 2.2. Sharding Implementation

**Shard Threshold**: 45,000 characters (leave buffer for safety)

**Row Structure**:

**First Row (Main Record)**:
```
| ID | Content | Tags | Type | Title | ... | _shardCount | _shardIndex |
|----|---------|------|------|-------|-----|-------------|-------------|
| snippet_1 | First 45k chars... | ai,research | text | Title | ... | 3 | 1 |
```

**Continuation Rows (Shards)**:
```
| ID | Content | _shardCount | _shardIndex |
|----|---------|-------------|-------------|
| snippet_1 | Next 45k chars... | 3 | 2 |
| snippet_1 | Final chars... | 3 | 3 |
```

**TypeScript Interface**:
```typescript
interface ShardedRow {
  id: string;
  content: string;
  _shardCount?: number;  // Total number of shards (only in first row)
  _shardIndex?: number;  // Current shard index (1-based)
  // ...other fields only in first row
}
```

### 2.3. Sharding Algorithm

**Split Large Content**:
```typescript
function shardContent(record: any, maxChars: number = 45000): any[] {
  const content = record.content || '';
  
  if (content.length <= maxChars) {
    // No sharding needed
    return [record];
  }
  
  // Calculate number of shards
  const shardCount = Math.ceil(content.length / maxChars);
  const rows: any[] = [];
  
  for (let i = 0; i < shardCount; i++) {
    const start = i * maxChars;
    const end = Math.min(start + maxChars, content.length);
    const contentShard = content.substring(start, end);
    
    if (i === 0) {
      // First row - include all metadata
      rows.push({
        ...record,
        content: contentShard,
        _shardCount: shardCount,
        _shardIndex: 1,
      });
    } else {
      // Continuation rows - only ID and content
      rows.push({
        id: record.id,
        content: contentShard,
        _shardCount: shardCount,
        _shardIndex: i + 1,
      });
    }
  }
  
  return rows;
}
```

**Reassemble Sharded Content**:
```typescript
function reassembleShards(rows: any[]): any[] {
  const recordMap = new Map<string, any>();
  const shardMap = new Map<string, string[]>();
  
  for (const row of rows) {
    const id = row.id;
    
    if (row._shardIndex === 1 || !row._shardCount) {
      // First row or unsharded record
      recordMap.set(id, row);
      if (row._shardCount > 1) {
        shardMap.set(id, [row.content]);
      }
    } else {
      // Continuation shard
      const shards = shardMap.get(id) || [];
      shards[row._shardIndex - 1] = row.content;
      shardMap.set(id, shards);
    }
  }
  
  // Reassemble sharded records
  const records: any[] = [];
  for (const [id, record] of recordMap.entries()) {
    if (shardMap.has(id)) {
      const shards = shardMap.get(id)!;
      const fullContent = shards.join('');
      records.push({
        ...record,
        content: fullContent,
        _shardCount: undefined,  // Remove shard metadata
        _shardIndex: undefined,
      });
    } else {
      records.push(record);
    }
  }
  
  return records;
}
```

### 2.4. Example: Sharding a Large Snippet

**Original Snippet**:
```typescript
const snippet: Snippet = {
  id: 'snippet_abc123',
  userId: 'user@gmail.com',
  content: 'A'.repeat(100000),  // 100k characters
  tags: ['ai', 'research'],
  type: 'text',
  title: 'Large Document',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
```

**After Sharding** (assuming 45k char limit):
```typescript
const shardedRows = shardContent(snippet, 45000);
// Returns 3 rows:
[
  {
    id: 'snippet_abc123',
    content: 'A'.repeat(45000),  // First 45k
    tags: ['ai', 'research'],
    type: 'text',
    title: 'Large Document',
    createdAt: 1699999999999,
    updatedAt: 1699999999999,
    _shardCount: 3,
    _shardIndex: 1,
  },
  {
    id: 'snippet_abc123',
    content: 'A'.repeat(45000),  // Next 45k
    _shardCount: 3,
    _shardIndex: 2,
  },
  {
    id: 'snippet_abc123',
    content: 'A'.repeat(10000),  // Final 10k
    _shardCount: 3,
    _shardIndex: 3,
  },
]
```

**Upload to Sheets**: Each object in array becomes a row

**Download from Sheets**: Rows with same ID and `_shardIndex > 1` are reassembled

---

## 3. Google Drive Sync

### 3.1. Authentication

```typescript
// Initialize Google API client
gapi.load('client:auth2', async () => {
  await gapi.client.init({
    clientId: 'YOUR_CLIENT_ID',
    scope: 'https://www.googleapis.com/auth/drive.file',
  });
});

// Get access token
const authInstance = gapi.auth2.getAuthInstance();
const user = authInstance.currentUser.get();
const accessToken = user.getAuthResponse().access_token;
```

### 3.2. Create Root Folder

```typescript
async function ensureRootFolder(): Promise<string> {
  // Search for existing folder
  const response = await gapi.client.drive.files.list({
    q: "name='Research Agent' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    spaces: 'drive',
  });
  
  if (response.result.files && response.result.files.length > 0) {
    return response.result.files[0].id!;
  }
  
  // Create folder
  const folder = await gapi.client.drive.files.create({
    resource: {
      name: 'Research Agent',
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });
  
  return folder.result.id!;
}
```

### 3.3. Upload JSON File

```typescript
async function uploadJSONFile(
  fileName: string,
  data: any,
  folderId?: string
): Promise<string> {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  
  // Check if file exists
  const q = folderId
    ? `name='${fileName}' and '${folderId}' in parents and trashed=false`
    : `name='${fileName}' and trashed=false`;
  
  const existing = await gapi.client.drive.files.list({ q, spaces: 'drive' });
  
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    ...(folderId && { parents: [folderId] }),
  };
  
  if (existing.result.files && existing.result.files.length > 0) {
    // Update existing file
    const fileId = existing.result.files[0].id!;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    
    return fileId;
  } else {
    // Create new file
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    
    const result = await response.json();
    return result.id;
  }
}
```

### 3.4. Download JSON File

```typescript
async function downloadJSONFile(fileName: string, folderId?: string): Promise<any | null> {
  const q = folderId
    ? `name='${fileName}' and '${folderId}' in parents and trashed=false`
    : `name='${fileName}' and trashed=false`;
  
  const response = await gapi.client.drive.files.list({
    q,
    spaces: 'drive',
    fields: 'files(id)',
  });
  
  if (!response.result.files || response.result.files.length === 0) {
    return null;
  }
  
  const fileId = response.result.files[0].id!;
  const file = await gapi.client.drive.files.get({
    fileId,
    alt: 'media',
  });
  
  return JSON.parse(file.body);
}
```

### 3.5. Upload Image Blob

```typescript
async function uploadImage(
  imageId: string,
  blob: Blob,
  folderId: string
): Promise<string> {
  // Extract extension from MIME type
  const ext = blob.type.split('/')[1]; // 'image/jpeg' → 'jpeg'
  const fileName = `${imageId}.${ext}`;
  
  const metadata = {
    name: fileName,
    mimeType: blob.type,
    parents: [folderId],
  };
  
  // Check if file exists
  const q = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
  const existing = await gapi.client.drive.files.list({ q, spaces: 'drive' });
  
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);
  
  if (existing.result.files && existing.result.files.length > 0) {
    // Update
    const fileId = existing.result.files[0].id!;
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    return fileId;
  } else {
    // Create
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const result = await response.json();
    return result.id;
  }
}
```

### 3.6. Strip userId on Upload

**Important**: Since each user has their own Google Drive, no need to store `userId` in files.

```typescript
async function syncSettingsToDrive(settings: Settings): Promise<void> {
  // Strip userId before upload
  const { userId, ...settingsWithoutUserId } = settings;
  
  const rootFolderId = await ensureRootFolder();
  await uploadJSONFile('settings.json', settingsWithoutUserId, rootFolderId);
}

async function loadSettingsFromDrive(userId: string): Promise<Settings | null> {
  const rootFolderId = await ensureRootFolder();
  const data = await downloadJSONFile('settings.json', rootFolderId);
  
  if (!data) return null;
  
  // Restore userId on download
  return {
    ...data,
    userId,
  };
}
```

---

## 4. Google Sheets Sync

### 4.1. Create Spreadsheet

```typescript
async function ensureSpreadsheet(): Promise<string> {
  // Search for existing spreadsheet
  const response = await gapi.client.drive.files.list({
    q: "name='Research Agent Data' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    spaces: 'drive',
  });
  
  if (response.result.files && response.result.files.length > 0) {
    return response.result.files[0].id!;
  }
  
  // Create spreadsheet
  const spreadsheet = await gapi.client.sheets.spreadsheets.create({
    properties: {
      title: 'Research Agent Data',
    },
    sheets: [
      { properties: { title: 'Snippets' } },
      { properties: { title: 'RAG' } },
      { properties: { title: 'Quizzes' } },
      { properties: { title: 'QuizAnalytics' } },
    ],
  });
  
  return spreadsheet.result.spreadsheetId!;
}
```

### 4.2. Upload Snippets with Sharding

```typescript
async function syncSnippetsToSheets(snippets: Snippet[]): Promise<void> {
  const spreadsheetId = await ensureSpreadsheet();
  
  // Strip userId and prepare rows
  const rows: any[][] = [];
  
  for (const snippet of snippets) {
    const { userId, ...snippetWithoutUserId } = snippet;
    const shardedRows = shardContent(snippetWithoutUserId, 45000);
    
    for (const shard of shardedRows) {
      rows.push([
        shard.id,
        shard.content || '',
        shard.tags?.join(',') || '',
        shard.type || '',
        shard.title || '',
        shard.projectId || '',
        shard.source || '',
        shard.language || '',
        shard.createdAt || '',
        shard.updatedAt || '',
        shard._shardCount || '',
        shard._shardIndex || '',
      ]);
    }
  }
  
  // Clear existing data
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Snippets!A2:Z',
  });
  
  // Write header row
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Snippets!A1:L1',
    valueInputOption: 'RAW',
    resource: {
      values: [[
        'ID', 'Content', 'Tags', 'Type', 'Title', 'Project ID',
        'Source', 'Language', 'Created At', 'Updated At',
        '_ShardCount', '_ShardIndex'
      ]],
    },
  });
  
  // Write data rows
  if (rows.length > 0) {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Snippets!A2:L${rows.length + 1}`,
      valueInputOption: 'RAW',
      resource: { values: rows },
    });
  }
}
```

### 4.3. Download Snippets with Reassembly

```typescript
async function loadSnippetsFromSheets(userId: string): Promise<Snippet[]> {
  const spreadsheetId = await ensureSpreadsheet();
  
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Snippets!A2:L',
  });
  
  if (!response.result.values) {
    return [];
  }
  
  // Parse rows
  const rows = response.result.values.map(row => ({
    id: row[0],
    content: row[1],
    tags: row[2] ? row[2].split(',') : [],
    type: row[3] as any,
    title: row[4],
    projectId: row[5],
    source: row[6],
    language: row[7],
    createdAt: parseInt(row[8]),
    updatedAt: parseInt(row[9]),
    _shardCount: row[10] ? parseInt(row[10]) : undefined,
    _shardIndex: row[11] ? parseInt(row[11]) : undefined,
  }));
  
  // Reassemble sharded rows
  const snippets = reassembleShards(rows);
  
  // Restore userId
  return snippets.map(snippet => ({
    ...snippet,
    userId,
  }));
}
```

---

## 5. Sync Triggers

### 5.1. Automatic Sync (On Change)

**Settings**:
```typescript
const settings = await unifiedStorage.get('settings', user.email);
settings.theme = 'dark';
await unifiedStorage.save('settings', settings);

// Automatically trigger sync
await syncSettingsToDrive(settings);
```

**Plans**:
```typescript
const plan = await unifiedStorage.get('plans', planId);
plan.status = 'completed';
await unifiedStorage.save('plans', plan);

// Automatically trigger sync
await syncPlanToDrive(plan);
```

### 5.2. Manual Sync (User-Triggered)

**Snippets**:
```typescript
// User clicks "Sync to Cloud" button
async function handleSyncSnippets() {
  const snippets = await unifiedStorage.query('snippets');
  await syncSnippetsToSheets(snippets);
  console.log('Snippets synced to Google Sheets');
}
```

### 5.3. Periodic Sync (Background)

```typescript
// Sync every 5 minutes
setInterval(async () => {
  if (navigator.onLine) {
    await syncSnippetsToSheets(await unifiedStorage.query('snippets'));
    await syncRAGToSheets(await unifiedStorage.query('ragData'));
  }
}, 5 * 60 * 1000);
```

---

## 6. Conflict Resolution

### 6.1. Last-Write-Wins

**Strategy**: Most recent `updatedAt` timestamp wins

```typescript
async function mergeSettings(local: Settings, remote: Settings): Promise<Settings> {
  return local.updatedAt > remote.updatedAt ? local : remote;
}
```

### 6.2. User Prompt

For important conflicts, ask user:

```typescript
async function handleConflict(local: any, remote: any): Promise<any> {
  const choice = await showConflictDialog({
    local,
    remote,
    message: 'Your local data differs from cloud. Which version do you want to keep?',
  });
  
  return choice === 'local' ? local : remote;
}
```

---

## 7. Error Handling

### 7.1. Network Errors

```typescript
async function syncWithRetry<T>(syncFn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await syncFn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 7.2. Quota Errors

```typescript
async function handleQuotaError(error: any): Promise<void> {
  if (error.status === 429) {
    // Rate limit exceeded
    const retryAfter = parseInt(error.headers.get('Retry-After') || '60');
    console.warn(`Rate limited. Retrying after ${retryAfter}s`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
  }
}
```

---

## Next Steps

1. **Review**: `SETTINGS_PERSISTENCE.md` - Unified settings structure
2. **Review**: `LOCALSTORAGE_MIGRATION.md` - Migrating from localStorage
3. **Implement**: `ui-new/src/services/googleSync.ts` with Drive/Sheets sync
4. **Test**: Sharding algorithm with large snippets (100k+ characters)
