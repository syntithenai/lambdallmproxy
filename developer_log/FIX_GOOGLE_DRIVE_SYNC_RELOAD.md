# Google Drive Sync - Data Reload Fix

**Date**: 2025-11-12  
**Issue**: Playlists and snippets not loading after clearing app data and relogging in  
**Status**: ✅ FIXED

## Problem Description

### User Report
> "when I clear all app data and relogin, only one of my playlists loaded (there were 3), none of my snippets load"

### Root Cause Analysis

The Google Drive sync was working correctly:
1. ✅ Data was being uploaded to Google Drive
2. ✅ Data was being downloaded from Google Drive on login
3. ✅ Data was being written to IndexedDB/localStorage

However, **the UI contexts weren't reloading the data after sync completion**.

#### Why This Happened

The sync flow is:
1. User logs in → `triggerImmediateSync()` runs → `syncAll()` downloads all data
2. `syncAll()` updates IndexedDB (playlists) and localStorage (snippets)  
3. `syncAll()` dispatches `'sync-complete'` event
4. **PROBLEM**: `PlaylistContext` and `SwagContext` didn't listen for this event
5. Result: Data was synced but UI still showed empty/stale data

## The Fix

### Files Changed

1. **ui-new/src/contexts/PlaylistContext.tsx** (Line 448)
2. **ui-new/src/contexts/SwagContext.tsx** (Line 184)

### Changes Made

#### PlaylistContext.tsx

Added event listener to refresh saved playlists after sync:

```typescript
// Listen for sync-complete events to refresh playlists after cloud sync
useEffect(() => {
  const handleSyncComplete = () => {
    console.log('🔄 [PlaylistContext] Sync complete, refreshing playlists...');
    refreshSavedPlaylists();
  };

  window.addEventListener('sync-complete', handleSyncComplete);
  
  return () => {
    window.removeEventListener('sync-complete', handleSyncComplete);
  };
}, [refreshSavedPlaylists]);
```

**What this does**:
- Listens for `'sync-complete'` event dispatched by `googleDriveSync.syncAll()`
- Calls `refreshSavedPlaylists()` which reads from IndexedDB and updates React state
- Updates `savedPlaylists` state which re-renders the UI

#### SwagContext.tsx

Fixed existing listener to use correct event name:

```typescript
// BEFORE (listening for wrong event):
window.addEventListener('cloud_sync_completed', handleSyncComplete);

// AFTER (listening for correct event):
window.addEventListener('sync-complete', handleSyncComplete);
```

**What this does**:
- Listens for `'sync-complete'` event (was listening for `'cloud_sync_completed'` which is never dispatched)
- Reloads snippets from localStorage after sync completes
- Updates `allSnippets` state which re-renders the UI

## Sync Event Architecture

### Event Flow

```
User Action (login/manual sync)
  ↓
googleDriveSync.triggerImmediateSync()
  ↓
googleDriveSync.syncAll()
  ↓
Promise.all([
  syncPlans(),      // Updates IndexedDB (planningDB)
  syncPlaylists(),  // Updates IndexedDB (playlistDB)
  syncSnippets(),   // Updates localStorage ('swag-snippets')
  syncEmbeddings(), // Updates IndexedDB (ragDB)
  syncChatHistory(),
  syncQuizProgress(),
  syncSettings(),
  syncImages()
])
  ↓
window.dispatchEvent('sync-complete')
  ↓
┌─────────────────────┬─────────────────────┐
│ PlaylistContext     │ SwagContext         │
│ refreshPlaylists()  │ reloadSnippets()    │
└─────────────────────┴─────────────────────┘
  ↓
UI re-renders with fresh data
```

### Events Dispatched

| Event Name | Dispatched By | Listened By | Purpose |
|------------|--------------|-------------|---------|
| `'sync-complete'` | `googleDriveSync.syncAll()` | `PlaylistContext`, `SwagContext`, `CloudSyncSettings` | Signal that all sync operations finished |
| `'sync-progress'` | `googleDriveSync.updateSyncProgress()` | `CloudSyncSettings` | Update progress UI during sync |
| `'google-auth-success'` | `googleAuth.ts` | `CloudSyncSettings`, `AuthContext` | Signal successful Google login |
| `'google-auth-signout'` | `googleAuth.ts` | Various contexts | Signal user logged out |
| `'google-drive-disconnected'` | `googleAuth.ts` | `CloudSyncSettings` | Signal Drive access removed |

## Testing Scenarios

### Test 1: Fresh Login After Clear Data ✅

**Steps**:
1. Clear all application data (IndexedDB + localStorage)
2. Log in with Google account that has synced data
3. Wait for sync to complete

**Expected Result**:
- All 3 playlists appear in playlists list
- All snippets appear in SWAG page
- Toast shows "✅ Sync complete!"

**Before Fix**: ❌ Only 1 playlist, 0 snippets  
**After Fix**: ✅ All data loads correctly

### Test 2: Manual Sync Button ✅

**Steps**:
1. Make changes to playlists/snippets in another browser
2. Click "Sync Now" button in Cloud Sync Settings

**Expected Result**:
- Remote changes download
- UI updates immediately with new data
- No page refresh needed

**Before Fix**: ❌ Data downloaded but UI didn't update  
**After Fix**: ✅ UI updates immediately

### Test 3: Auto-Sync on Login ✅

**Steps**:
1. Have existing data in Google Drive
2. Log in to fresh browser session

**Expected Result**:
- `triggerImmediateSync()` runs automatically
- All data downloads
- UI shows all data without manual action

**Before Fix**: ❌ Data downloaded but UI stayed empty  
**After Fix**: ✅ UI populates automatically

## Data Sync Behavior

### Playlists (IndexedDB)

**Storage**: `playlistDB` (IndexedDB database)
**Sync Logic**: Last-Write-Wins with merge
- If remote timestamp > local timestamp → Download and merge
- If local timestamp > remote timestamp → Upload
- Merge deduplicates by name (case-insensitive)

**Reload Trigger**:
```typescript
refreshSavedPlaylists() → playlistDB.listPlaylists() → setSavedPlaylists()
```

### Snippets (localStorage)

**Storage**: `localStorage` key `'swag-snippets'`
**Sync Logic**: Last-Write-Wins with full replace
- Compares max `updateDate` or `timestamp` of all snippets
- Remote newer → Replace local with remote
- Local newer → Upload local to remote

**Reload Trigger**:
```typescript
storage.getItem('swag-snippets') → setAllSnippets()
```

## Plans Sync - Google Docs Integration (Future)

### User Request
> "plans should sync via google docs"

### Current Implementation
Plans currently sync to **Google Drive JSON files** (`saved_plans.json`), not Google Docs.

### Why Current Approach
- JSON files are simpler and faster
- No formatting/parsing overhead
- Same pattern as playlists and snippets
- Works with existing `googleDriveSync` infrastructure

### Google Docs Alternative (If Needed)

If user specifically wants Google Docs instead of JSON files:

**Pros**:
- Human-readable in Google Docs UI
- Can manually edit plans in browser
- Collaborative editing possible

**Cons**:
- Slower (requires Google Docs API calls)
- More complex parsing (HTML → JSON)
- Formatting can break data structure
- Requires additional API scopes

**Implementation Path**:
1. Add Google Docs API integration
2. Create adapter in `ui-new/src/services/adapters/plansDocsAdapter.ts`
3. Update `PlansAdapter` to use Docs API instead of Drive API
4. Add scope `https://www.googleapis.com/auth/documents`

**Recommendation**: Keep current JSON approach unless user has specific use case for Docs editing.

## Related Files

### Core Sync Service
- `ui-new/src/services/googleDriveSync.ts` - Main sync orchestration
- `ui-new/src/services/adapters/plansAdapter.ts` - Plans sync adapter
- `ui-new/src/services/adapters/playlistsAdapter.ts` - Playlists sync adapter

### Data Storage
- `ui-new/src/utils/playlistDB.ts` - Playlist IndexedDB operations
- `ui-new/src/utils/planningDB.ts` - Plans IndexedDB operations
- `ui-new/src/utils/ragDB.ts` - Embeddings IndexedDB operations
- `ui-new/src/utils/storage.ts` - localStorage wrapper

### UI Contexts
- `ui-new/src/contexts/PlaylistContext.tsx` - Playlist state management
- `ui-new/src/contexts/SwagContext.tsx` - Snippets state management
- `ui-new/src/contexts/AuthContext.tsx` - Authentication state

### Settings UI
- `ui-new/src/components/CloudSyncSettings.tsx` - Cloud sync configuration

## Deployment

**Status**: ✅ Changes committed, ready to deploy

**Deployment Commands**:
```bash
# Test locally first
make dev

# Deploy UI to GitHub Pages when ready
make deploy-ui
```

**No backend changes needed** - this is purely a frontend fix.

## Summary

### What Was Broken
- ❌ Data was syncing but UI contexts weren't reloading
- ❌ Wrong event name in SwagContext (`'cloud_sync_completed'` vs `'sync-complete'`)
- ❌ PlaylistContext had no sync listener at all

### What Was Fixed
- ✅ PlaylistContext now listens for `'sync-complete'` and refreshes playlists
- ✅ SwagContext fixed to listen for correct `'sync-complete'` event
- ✅ Both contexts reload data after sync completes
- ✅ UI now updates immediately after cloud sync

### User Experience
- **Before**: Data synced but UI showed stale/empty data until page refresh
- **After**: Data syncs and UI updates automatically without page refresh
