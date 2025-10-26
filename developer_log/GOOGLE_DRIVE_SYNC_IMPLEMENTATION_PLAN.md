# Google Drive Sync for Saved Plans and Playlists - Implementation Plan

**Date**: October 26, 2025  
**Feature**: Sync saved planning queries and YouTube playlists to Google Drive  
**Status**: 📋 Planning

---

## Overview

Add Google Drive sync functionality for:
1. **Saved Plans** (currently in localStorage via `planningCache.ts`)
2. **Saved Playlists** (currently in IndexedDB via `playlistDB.ts`)

This provides cross-device sync, backup, and persistent storage beyond browser limitations.

---

## Current State Analysis

### ✅ Existing Infrastructure

1. **Google OAuth Already Implemented**:
   - `ui-new/src/utils/googleDocs.ts` - Full Google Drive API integration
   - `ui-new/src/utils/auth.ts` - OAuth token management
   - Scope: `https://www.googleapis.com/auth/drive.file` (app-created files only)
   - Token refresh mechanism in place
   - Used by SwagPage for document generation

2. **Saved Plans Storage**:
   - **Location**: `ui-new/src/utils/planningCache.ts`
   - **Storage**: localStorage with key `llm_proxy_planning_cache`
   - **Data Structure**:
     ```typescript
     interface CachedPlan {
       id: string;                    // plan_<timestamp>_<random>
       query: string;                 // User's original query
       plan: any;                     // LLM-generated plan object
       systemPrompt?: string;         // Enhanced system prompt
       userPrompt?: string;           // Enhanced user prompt
       timestamp: number;             // Unix timestamp
     }
     ```
   - **Limits**: 50 plans max, oldest deleted
   - **Issue**: localStorage quota (5-10MB), no cross-device sync

3. **Saved Playlists Storage**:
   - **Location**: `ui-new/src/utils/playlistDB.ts`
   - **Storage**: IndexedDB database `youtube-playlist-db`
   - **Data Structure**:
     ```typescript
     savedPlaylists: {
       id: number;                    // Auto-increment
       name: string;                  // User-defined playlist name
       tracks: PlaylistTrack[];       // Array of YouTube videos
       createdAt: number;             // Unix timestamp
       updatedAt: number;             // Unix timestamp
     }
     ```
   - **Features**: Search, export/import JSON, statistics
   - **Issue**: No cross-device sync, browser-specific

4. **Google Drive Integration Pattern** (from SwagPage):
   - Files stored in app-specific folder
   - Automatic overwrite for same filename
   - JSON export/import
   - Error handling with user feedback

---

## Architecture Design

### File Structure on Google Drive

```
📁 LLM Proxy App Data/
├── 📄 saved_plans.json          # All cached plans
├── 📄 saved_playlists.json      # All named playlists
└── 📄 sync_metadata.json        # Sync state tracking
```

**Why This Structure**:
- Single file per data type (simple, atomic updates)
- JSON format (human-readable, easy export/import)
- Metadata file tracks last sync time, conflicts

### Sync Strategy

**Conflict Resolution**: Last-Write-Wins (LWW)
- Use `updatedAt` timestamp to determine latest version
- Show warning if cloud version is newer during manual sync

**Sync Triggers**:
1. **Manual**: User clicks "Sync Now" button
2. **Auto**: Background sync every 5 minutes (if user is authenticated)
3. **On Change**: Debounced sync 30 seconds after local modification

**Sync Flow**:
```
1. Check if user is authenticated
2. Fetch latest from Google Drive
3. Compare timestamps (local vs cloud)
4. If cloud is newer → merge or replace local
5. If local is newer → upload to cloud
6. Update sync metadata
7. Show sync status (success/conflict/error)
```

---

## Implementation Plan

### Phase 1: Core Sync Service (3-4 hours)

**File**: `ui-new/src/services/googleDriveSync.ts` (NEW)

**Features**:
- Initialize Google Drive app folder
- Upload/download JSON files
- Timestamp-based conflict detection
- Merge strategy for plans and playlists

**API**:
```typescript
class GoogleDriveSync {
  // Authentication
  async isAuthenticated(): Promise<boolean>
  
  // Plans sync
  async syncPlans(): Promise<SyncResult>
  async uploadPlans(plans: CachedPlan[]): Promise<void>
  async downloadPlans(): Promise<CachedPlan[]>
  
  // Playlists sync
  async syncPlaylists(): Promise<SyncResult>
  async uploadPlaylists(playlists: SavedPlaylist[]): Promise<void>
  async downloadPlaylists(): Promise<SavedPlaylist[]>
  
  // Combined sync
  async syncAll(): Promise<{ plans: SyncResult, playlists: SyncResult }>
  
  // Utilities
  async getLastSyncTime(): Promise<number>
  async getSyncMetadata(): Promise<SyncMetadata>
}

interface SyncResult {
  success: boolean;
  action: 'uploaded' | 'downloaded' | 'no-change' | 'conflict';
  timestamp: number;
  itemCount: number;
  error?: string;
}
```

### Phase 2: Update Planning Cache (1-2 hours)

**File**: `ui-new/src/utils/planningCache.ts` (UPDATE)

**Changes**:
- Add `updatedAt` timestamp to each plan
- Trigger sync after save/delete operations
- Add merge function for conflict resolution
- Export `mergePlans()` utility

**New Functions**:
```typescript
// Merge local and remote plans (deduplicates by query)
export function mergePlans(local: CachedPlan[], remote: CachedPlan[]): CachedPlan[]

// Get plans modified after timestamp
export function getPlansModifiedSince(timestamp: number): CachedPlan[]

// Replace all plans (used after cloud download)
export function replacePlans(plans: CachedPlan[]): void
```

### Phase 3: Update Playlist DB (1-2 hours)

**File**: `ui-new/src/utils/playlistDB.ts` (UPDATE)

**Changes**:
- Add sync tracking to savedPlaylists
- Export all playlists as JSON array
- Import playlists from JSON (merge by name/id)
- Trigger sync after save/update/delete

**New Methods**:
```typescript
class PlaylistDatabase {
  // Export all saved playlists for sync
  async exportAllPlaylists(): Promise<SavedPlaylist[]>
  
  // Import and merge playlists from cloud
  async importAndMergePlaylists(playlists: SavedPlaylist[]): Promise<number>
  
  // Get playlists modified after timestamp
  async getPlaylistsModifiedSince(timestamp: number): Promise<SavedPlaylist[]>
  
  // Get last modified timestamp
  async getLastModified(): Promise<number>
}
```

### Phase 4: UI Components (2-3 hours)

#### A. Sync Button in Settings

**File**: `ui-new/src/components/CloudSyncSettings.tsx` (UPDATE)

**Changes**:
- Add "Sync Plans & Playlists" section
- Show last sync time
- Manual "Sync Now" button
- Auto-sync toggle switch
- Sync status indicator (idle/syncing/success/error)

**UI Mockup**:
```
┌─────────────────────────────────────┐
│ Cloud Sync                          │
├─────────────────────────────────────┤
│ ✅ Authenticated as user@gmail.com  │
│                                     │
│ Last synced: 2 minutes ago          │
│ • Plans: 23 items                   │
│ • Playlists: 5 items                │
│                                     │
│ [🔄 Sync Now]    [⚙️ Settings]     │
│                                     │
│ ☑ Auto-sync every 5 minutes         │
│ ☑ Sync on changes (30s delay)       │
└─────────────────────────────────────┘
```

#### B. Sync Indicator in Planning Dialog

**File**: `ui-new/src/components/PlanningDialog.tsx` (UPDATE)

**Changes**:
- Show cloud sync status for saved plans
- Add "Sync to Cloud" button
- Show conflict warnings

#### C. Sync Indicator in Playlist Dialog

**File**: `ui-new/src/components/PlaylistDialog.tsx` (UPDATE)

**Changes**:
- Show cloud sync status for saved playlists
- Add "Sync to Cloud" button
- Show conflict warnings

### Phase 5: Background Sync (1 hour)

**File**: `ui-new/src/hooks/useBackgroundSync.ts` (NEW)

**Features**:
- React hook for automatic background sync
- Interval-based sync (every 5 minutes)
- Debounced sync on changes (30 seconds)
- Pause sync when tab is hidden
- Show notifications on sync events

**Usage**:
```typescript
function App() {
  const { syncStatus, lastSyncTime, triggerSync } = useBackgroundSync({
    enabled: true,
    intervalMs: 5 * 60 * 1000, // 5 minutes
    debounceMs: 30 * 1000,     // 30 seconds
    onSyncComplete: (result) => {
      console.log('Sync completed:', result);
    }
  });
  
  return (
    <div>
      {syncStatus === 'syncing' && <SyncSpinner />}
      <button onClick={triggerSync}>Sync Now</button>
    </div>
  );
}
```

### Phase 6: Error Handling & Edge Cases (1-2 hours)

**Scenarios to Handle**:

1. **Network Offline**:
   - Queue sync for later
   - Show offline indicator
   - Retry with exponential backoff

2. **Authentication Expired**:
   - Detect 401 errors
   - Trigger token refresh
   - Retry sync automatically

3. **Quota Exceeded** (Google Drive):
   - Show user-friendly error
   - Suggest cleanup (delete old plans/playlists)

4. **Conflict Detection**:
   - Show diff between local and cloud
   - Let user choose: keep local, keep cloud, or merge

5. **Corrupted Data**:
   - Validate JSON schema before import
   - Show validation errors
   - Keep backup before overwrite

---

## Testing Checklist

### Unit Tests

- [ ] `googleDriveSync.ts` - All CRUD operations
- [ ] `planningCache.ts` - Merge logic
- [ ] `playlistDB.ts` - Import/export

### Integration Tests

- [ ] Upload plans → Download on different device → Verify data
- [ ] Upload playlists → Download → Verify tracks
- [ ] Conflict resolution (modify same plan locally and remotely)
- [ ] Auto-sync trigger after local changes
- [ ] Manual sync with "Sync Now" button

### Edge Case Tests

- [ ] Network offline during sync
- [ ] Token expired during sync
- [ ] Corrupted cloud file (invalid JSON)
- [ ] Empty local data + populated cloud
- [ ] Empty cloud + populated local
- [ ] Duplicate plan queries (merge by query text)
- [ ] Duplicate playlist names (merge by id)

---

## Migration Strategy

**For Existing Users**:

1. **First Sync**: Automatically upload all local data to cloud
2. **Show Onboarding**: Explain sync feature, benefits, privacy
3. **Backup Before Merge**: Create local backup before first cloud import
4. **Gradual Rollout**: Enable for authenticated users only

**Data Integrity**:
- Keep local storage as source of truth during transition
- Cloud is backup/sync layer, not replacement
- Users can disable sync anytime
- Users can export/download all data

---

## Privacy & Security

**What Gets Synced**:
- ✅ Saved plan queries and LLM responses
- ✅ Playlist names and YouTube video IDs
- ❌ Chat history (remains local-only in IndexedDB)
- ❌ API keys or credentials
- ❌ System prompts with sensitive info

**User Controls**:
- Explicit opt-in required (authenticate with Google)
- Can disable auto-sync
- Can revoke Google Drive access anytime
- Can manually delete cloud files
- Data encrypted in transit (HTTPS)
- Google Drive respects user's storage quota

---

## Alternative Approaches Considered

### ❌ Option A: Sync Chat History
**Pros**: Complete cross-device experience  
**Cons**: Privacy concerns, large data size, complexity  
**Decision**: Keep chat history local-only (current behavior)

### ❌ Option B: Use Google Drive Realtime API
**Pros**: Live collaboration, instant sync  
**Cons**: API deprecated, high complexity, overkill for this use case  
**Decision**: Use simple file-based sync with polling

### ❌ Option C: Custom Backend Sync Service
**Pros**: Full control, no third-party dependencies  
**Cons**: Infrastructure cost, maintenance burden, user trust issues  
**Decision**: Leverage existing Google OAuth and Drive integration

---

## Timeline Estimate

| Phase | Description | Estimated Time |
|-------|-------------|----------------|
| 1 | Core Sync Service | 3-4 hours |
| 2 | Update Planning Cache | 1-2 hours |
| 3 | Update Playlist DB | 1-2 hours |
| 4 | UI Components | 2-3 hours |
| 5 | Background Sync Hook | 1 hour |
| 6 | Error Handling | 1-2 hours |
| **Testing** | Unit + Integration Tests | 2-3 hours |
| **Documentation** | User guide, privacy policy update | 1 hour |
| **Total** | | **12-18 hours** |

---

## Success Criteria

**Must Have**:
- ✅ Manual sync button works reliably
- ✅ Plans upload/download without data loss
- ✅ Playlists upload/download without data loss
- ✅ Conflict detection shows warnings
- ✅ Works across different browsers on same Google account

**Nice to Have**:
- ✅ Auto-sync every 5 minutes (toggleable)
- ✅ Sync on changes (debounced)
- ✅ Sync status indicator
- ✅ Conflict resolution UI (choose local/cloud/merge)
- ✅ Export/download all data as backup

---

## Future Enhancements

**V2 Features** (Post-MVP):
1. **Selective Sync**: Choose which plans/playlists to sync
2. **Shared Playlists**: Share read-only playlists via Drive link
3. **Versioning**: Keep history of plan changes
4. **Smart Merge**: LLM-powered conflict resolution
5. **Multi-Account**: Support multiple Google accounts
6. **Other Providers**: Add Dropbox, OneDrive support

---

## Questions for User

1. **Auto-Sync Default**: Should auto-sync be enabled by default, or opt-in?
2. **Conflict Resolution**: Prefer automatic (last-write-wins) or manual (user chooses)?
3. **Sync Frequency**: Is 5 minutes a good interval, or prefer more/less frequent?
4. **Notifications**: Show toast notification on every sync, or only errors?

---

## Implementation Notes

**Code Reuse**:
- Copy patterns from `googleDocs.ts` (already has Drive file upload/download)
- Use existing `initGoogleAuth()` and `requestGoogleAuth()` from `googleDocs.ts`
- Follow error handling patterns from `playlistDB.ts` (try/catch with user-friendly messages)

**Dependencies**:
- No new packages needed (Google Drive API via fetch)
- TypeScript types for Google Drive v3 API
- Uses existing `idb` for IndexedDB operations

**Performance**:
- Debounce sync triggers to avoid excessive API calls
- Use ETag/If-Modified-Since headers to avoid unnecessary downloads
- Batch operations (sync all plans in one file, not individual)

---

## Next Steps

Ready to proceed? I can start with:

1. **Phase 1**: Create `googleDriveSync.ts` service with core sync logic
2. **Phase 2**: Update `planningCache.ts` with merge and timestamp tracking
3. **Phase 3**: Update `playlistDB.ts` with export/import functionality

Or would you like to review/modify the plan first?

---

**End of Plan**
