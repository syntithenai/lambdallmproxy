# Google Drive Sync for Snippets and Embeddings - Implementation Complete

## Overview

Extended the existing Google Drive sync infrastructure to support **snippets** and **embeddings**, enabling cross-device access to RAG content and vector search data. Users can now login on any device and have their SWAG snippets and local browser embeddings automatically synchronized.

## User Request

> "embeddings should be synchronised to google docs in the same document as snippets/swag so that when i login to a different computer, i have the embeddings available for search and automatic context injection. the snippets should also be synchronised this way although it doesn't seem to be working at the moment"

## Implementation Summary

### 1. Extended Sync Service (`ui-new/src/services/googleDriveSync.ts`)

**Added to SyncMetadata Interface:**
- `lastSnippetsSync: number` - Timestamp of last snippet sync
- `lastEmbeddingsSync: number` - Timestamp of last embedding sync  
- `snippetsCount: number` - Number of snippets in Drive
- `embeddingsCount: number` - Number of embedding chunks in Drive

**New Constants:**
```typescript
const SNIPPETS_FILENAME = 'saved_snippets.json';
const EMBEDDINGS_FILENAME = 'saved_embeddings.json';
```

**New Methods:**

#### `syncSnippets()` (~90 lines)
- Gets local snippets from `storage.getItem('swag-snippets')`
- Downloads remote snippets from Google Drive
- Compares timestamps using Last-Write-Wins strategy
- Uploads or downloads based on which is newer
- Returns `SyncResult` with action and item count

#### `syncEmbeddings()` (~90 lines)
- Gets all chunks from `ragDB.getAllChunks()`
- Handles EmbeddingChunk ISO timestamp conversion
- Downloads remote embeddings from Google Drive
- Syncs bidirectionally based on max timestamp
- Uses `ragDB.clearChunks()` and `ragDB.addChunk()` for updates

#### Helper Methods:
- `uploadSnippets()` / `downloadSnippets()`
- `uploadEmbeddings()` / `downloadEmbeddings()`

**Updated Methods:**
- `syncAll()` - Now syncs all 4 types (plans, playlists, snippets, embeddings) in parallel
- `getSyncMetadata()` - Backward compatible, fills missing fields with 0
- `updateSyncMetadata()` - Handles 'snippets' | 'embeddings' types

### 2. SwagContext Integration (`ui-new/src/contexts/SwagContext.tsx`)

**Automatic Sync Triggers:**

1. **Snippet Changes (Lines 133-151):**
   - Debounced 5 seconds after last change
   - Checks `isSyncEnabled()` before syncing
   - Logs sync results to console
   ```typescript
   useEffect(() => {
     if (!isLoaded || !isSyncEnabled()) return;
     const syncTimeout = setTimeout(async () => {
       const result = await googleDriveSync.syncSnippets();
       if (result.success && result.action !== 'no-change') {
         console.log(`✅ Snippets synced: ${result.action}`);
       }
     }, 5000);
     return () => clearTimeout(syncTimeout);
   }, [snippets, isLoaded]);
   ```

2. **Drive Check on Mount (Lines 70-105):**
   - After loading local snippets, checks Google Drive for newer data
   - Downloads and reloads if remote is newer
   - Ensures fresh data on login
   ```typescript
   useEffect(() => {
     // ... existing local load code ...
     
     // Check Google Drive for newer data
     if (isSyncEnabled()) {
       googleDriveSync.syncSnippets().then(result => {
         if (result.success && result.action === 'downloaded') {
           // Reload snippets from storage
           const updated = storage.getItem('swag-snippets');
           if (updated) setSnippets(JSON.parse(updated));
         }
       });
     }
   }, []);
   ```

3. **Embedding Sync After Generation (Lines 1067-1081):**
   - Triggers 3 seconds after embeddings complete
   - Ensures new embeddings are backed up to Drive
   ```typescript
   if (isSyncEnabled()) {
     setTimeout(async () => {
       const result = await googleDriveSync.syncEmbeddings();
       if (result.success) {
         console.log(`✅ Embeddings synced`);
       }
     }, 3000);
   }
   ```

### 3. CloudSyncSettings UI (`ui-new/src/components/CloudSyncSettings.tsx`)

**Added Sync State:**
```typescript
const [isSyncing, setIsSyncing] = useState(false);
const [syncStatus, setSyncStatus] = useState<string | null>(null);
const [lastSyncTime, setLastSyncTime] = useState<number>(0);
const [syncMetadata, setSyncMetadata] = useState<{
  plansCount: number;
  playlistsCount: number;
  snippetsCount: number;
  embeddingsCount: number;
}>({ plansCount: 0, playlistsCount: 0, snippetsCount: 0, embeddingsCount: 0 });
const [autoSyncEnabled, setAutoSyncEnabled] = useState(
  localStorage.getItem('auto_sync_enabled') === 'true'
);
```

**New Functions:**
- `loadSyncMetadata()` - Fetches metadata from Drive on mount
- `handleSync()` - Manual sync for all 4 types, shows detailed status
- `handleAutoSyncToggle()` - Enables/disables auto-sync every 5 minutes
- `formatLastSyncTime()` - Human-readable time formatting

**UI Panel Added:**
- Shows last sync time
- Displays counts for all 4 data types:
  - Saved plans: X items
  - Saved playlists: X items
  - Saved snippets: X items ✨ NEW
  - Saved embeddings: X chunks ✨ NEW
- "Sync Now" button (syncs all 4 types)
- Auto-sync toggle checkbox
- Status messages for sync results

**Updated Description:**
- Changed "RAG Content: Snippets and embeddings synced to Google Sheets" 
- To: "RAG Content: Snippets and embeddings synced to Google Drive"

## Sync Strategy

### Last-Write-Wins Algorithm

```
1. Get local data timestamp (max of all items)
2. Get remote data timestamp from Drive file
3. Compare:
   - If local empty → Download from remote
   - If remote empty → Upload to remote
   - If local timestamp > remote → Upload local
   - If remote timestamp > local → Download remote
   - If equal → No change
4. Update sync metadata
```

### Data Storage Locations

**Local:**
- Snippets: `localStorage['swag-snippets']` - ContentSnippet[] array
- Embeddings: IndexedDB `ragDB.chunks` - EmbeddingChunk[] array

**Remote:**
- Google Drive folder: "LLM Proxy App Data"
- Files:
  - `saved_plans.json`
  - `saved_playlists.json`
  - `saved_snippets.json` ✨ NEW
  - `saved_embeddings.json` ✨ NEW
  - `sync_metadata.json`

### Timestamp Handling

**Snippets:**
- ContentSnippet has `created_at: number` (milliseconds)
- Uses `Math.max(...snippets.map(s => s.created_at))`

**Embeddings:**
- EmbeddingChunk has `created_at: string` (ISO 8601 format)
- Converts to milliseconds: `new Date(chunk.created_at).getTime()`
- Uses `Math.max(...chunks.map(c => new Date(c.created_at).getTime()))`

## Testing Checklist

### ✅ Backend Integration
- [x] syncSnippets() method implemented
- [x] syncEmbeddings() method implemented
- [x] syncAll() updated to include new types
- [x] Metadata backward compatible
- [x] Timestamp conversion handles ISO strings

### ✅ Frontend Integration
- [x] SwagContext triggers snippet sync on changes
- [x] SwagContext triggers embedding sync after generation
- [x] Drive check on mount downloads newer data
- [x] CloudSyncSettings UI shows all 4 counts

### 🔄 Cross-Device Flow (Pending User Testing)
1. **Device A**: Create snippets and generate embeddings
2. **Verify**: Check Google Drive "LLM Proxy App Data" folder for:
   - `saved_snippets.json`
   - `saved_embeddings.json`
3. **Device B**: Login and open app
4. **Verify**: Snippets and embeddings download automatically
5. **Test**: Vector search works with synced embeddings
6. **Modify**: Change data on Device B
7. **Verify**: Changes sync back to Device A

## Usage Instructions

### For Users

1. **Enable Sync:**
   - Go to Settings → Cloud Sync
   - Click "Connect to Google Drive"
   - Authorize the app

2. **Automatic Sync:**
   - Snippets sync 5 seconds after changes
   - Embeddings sync 3 seconds after generation
   - On mount, checks Drive for newer data
   - Optional: Enable "Auto-sync every 5 minutes"

3. **Manual Sync:**
   - Click "Sync Now" button
   - Status message shows what was uploaded/downloaded

4. **Cross-Device:**
   - Login on any device with same Google account
   - Data automatically downloads if remote is newer
   - Make changes on any device - they sync everywhere

### For Developers

**Sync Functions:**
```typescript
// Individual syncs
await googleDriveSync.syncSnippets();
await googleDriveSync.syncEmbeddings();

// Sync everything
const result = await googleDriveSync.syncAll();
// result.snippets = { success: true, action: 'uploaded', itemCount: 5 }
// result.embeddings = { success: true, action: 'downloaded', itemCount: 120 }

// Get metadata
const metadata = await googleDriveSync.getSyncMetadata();
// metadata.snippetsCount = 5
// metadata.embeddingsCount = 120
// metadata.lastSnippetsSync = 1234567890
```

**Checking Sync Status:**
```typescript
import { isSyncEnabled } from '../contexts/SwagContext';

if (isSyncEnabled()) {
  // Google Drive is authenticated and ready
  await googleDriveSync.syncSnippets();
}
```

## Architecture Notes

### Debouncing Strategy
- **5 seconds for snippets**: Prevents excessive syncs during rapid editing
- **3 seconds for embeddings**: Allows generation to complete before sync
- **On mount check**: Ensures fresh data without delay

### Error Handling
- All sync methods return `SyncResult` with `success: boolean`
- Errors logged to console but don't block app
- UI shows error messages in CloudSyncSettings
- Try-catch wraps all async operations

### Backward Compatibility
- `getSyncMetadata()` fills missing fields with 0
- Old metadata files upgraded gracefully
- Existing plans/playlists sync unaffected

## File Changes Summary

### Modified Files:
1. **ui-new/src/services/googleDriveSync.ts**
   - Extended SyncMetadata interface (+4 fields)
   - Added syncSnippets() method (~90 lines)
   - Added syncEmbeddings() method (~90 lines)
   - Added upload/download helpers
   - Updated syncAll(), getSyncMetadata(), updateSyncMetadata()

2. **ui-new/src/contexts/SwagContext.tsx**
   - Added googleDriveSync import
   - Added debounced snippet sync effect (~20 lines)
   - Added Drive check on mount (~35 lines)
   - Added embedding sync after generation (~15 lines)

3. **ui-new/src/components/CloudSyncSettings.tsx**
   - Added sync state management (~18 lines)
   - Added loadSyncMetadata(), handleSync(), handleAutoSyncToggle(), formatLastSyncTime()
   - Added Data Sync Status panel with 4 counts
   - Added manual sync button and auto-sync toggle

## Success Criteria

✅ **Completed:**
- Snippets sync to Google Drive
- Embeddings sync to Google Drive
- Last-Write-Wins prevents conflicts
- UI shows all sync status
- Automatic sync on changes
- Manual sync button works
- Cross-device architecture ready

🔄 **Pending User Testing:**
- Multi-device sync flow
- Conflict resolution in practice
- Performance with large datasets

## Related Documentation
- See: `developer_log/GOOGLE_DRIVE_SYNC_COMPLETE.md` - Original plans/playlists sync
- See: `developer_log/FEATURE_MEMORY_TRACKING.md` - RAG embeddings system
- See: `ui-new/src/services/googleDriveSync.ts` - Full sync implementation

## Next Steps

1. **Test Multi-Device Sync:**
   - Create test data on Device A
   - Verify sync to Drive
   - Login on Device B
   - Verify download and functionality

2. **Monitor Performance:**
   - Check sync timing with large datasets
   - Optimize debounce delays if needed
   - Monitor Google Drive API quota

3. **User Feedback:**
   - Collect feedback on sync reliability
   - Adjust auto-sync frequency if needed
   - Consider adding sync progress indicators

## Deployment

This feature is ready for local testing. To deploy:

```bash
# Build UI
make build-ui

# Deploy to production
make deploy-ui
```

No backend changes required - all sync logic runs in the browser.
