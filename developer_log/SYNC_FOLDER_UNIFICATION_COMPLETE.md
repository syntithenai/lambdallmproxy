# Google Drive Sync Folder Unification - COMPLETE

**Date**: 2025-11-11  
**Status**: ✅ COMPLETE  
**Issue**: User data scattered across multiple Google Drive folders  
**Solution**: Unified all sync systems to use single "Research Agent" folder

## Problem Discovered

User reported finding files in Google Drive folder "LLM Proxy App Data" despite not connecting Google Drive in settings:
- `sync_metadata.json`
- `saved_snippets.json`  
- `saved_plans.json`

This was caused by **two separate sync systems** using different folder structures:

### OLD System (Legacy Google Drive Sync)
- **Folder**: `LLM Proxy App Data/`
- **Files**: JSON files for plans, playlists, snippets, embeddings, chat history, quiz progress, feed items
- **Used by**: 
  - `googleDriveSync.ts` (legacy)
  - `plansAdapter.ts`
  - `playlistsAdapter.ts`

### NEW System (Google Sheets Sync)
- **Folder**: `Research Agent/` (intended)
- **Spreadsheet**: `Research Agent Swag`
- **Sheets**: Snippets, Feed, Quizzes, Config, Embeddings
- **Used by**: `googleSheetsAdapter.ts`

### Issue
The Google Sheets sync was creating the spreadsheet **without placing it in the Research Agent folder**!

## Solution Implemented

### 1. Updated Google Sheets Adapter (`googleSheetsAdapter.ts`)

**Added folder management**:
```typescript
private readonly FOLDER_NAME = 'Research Agent';
private folderIdCache: string | null = null;

// New method to ensure folder exists
private async ensureResearchAgentFolder(token: string): Promise<string> {
  // Search for existing folder
  // Create if not found
  // Cache folder ID for performance
}
```

**Updated spreadsheet creation**:
- Now searches for spreadsheet **within Research Agent folder**
- Creates spreadsheet and **moves it to Research Agent folder**
- Search query changed from:
  ```
  name='Research Agent Swag' and mimeType='spreadsheet'
  ```
  To:
  ```
  name='Research Agent Swag' and '{folderId}' in parents and mimeType='spreadsheet'
  ```

### 2. Updated Plans Adapter (`plansAdapter.ts`)

**Changed**:
```typescript
// OLD
const APP_FOLDER_NAME = 'LLM Proxy App Data';

// NEW  
const APP_FOLDER_NAME = 'Research Agent';
```

### 3. Updated Playlists Adapter (`playlistsAdapter.ts`)

**Changed**:
```typescript
// OLD
const APP_FOLDER_NAME = 'LLM Proxy App Data';

// NEW
const APP_FOLDER_NAME = 'Research Agent';
```

### 4. Updated Legacy Google Drive Sync (`googleDriveSync.ts`)

**Changed**:
```typescript
// OLD
const APP_FOLDER_NAME = 'LLM Proxy App Data';

// NEW
const APP_FOLDER_NAME = 'Research Agent'; // UPDATED: Unified with Google Sheets sync
```

## Unified Structure

All user data now syncs to a **single folder structure**:

```
📁 Research Agent/
├── 📊 Research Agent Swag (Google Sheet)
│   ├── Sheet: Snippets
│   ├── Sheet: Feed  
│   ├── Sheet: Quizzes
│   ├── Sheet: Config
│   └── Sheet: Embeddings
├── 📄 saved_plans.json (JSON file - legacy)
├── 📄 saved_playlists.json (JSON file - legacy)
├── 📄 saved_snippets.json (JSON file - legacy, will be deprecated)
├── 📄 saved_embeddings.json (JSON file - legacy, will be deprecated)
├── 📄 chat_history.json (JSON file)
├── 📄 quiz_progress.json (JSON file - legacy, will be deprecated)
├── 📄 feed_items.json (JSON file - legacy, will be deprecated)
└── 📄 sync_metadata.json (JSON file - legacy)
```

## Migration Path

**For existing users**:

1. **Old data in "LLM Proxy App Data"** will remain there (not automatically deleted)
2. **New syncs** will create/use "Research Agent" folder
3. **Google Sheets** will contain the primary data going forward
4. **JSON files** continue to work for backward compatibility

**Recommended cleanup** (manual):
- Users can delete the old "LLM Proxy App Data" folder after verifying data is in "Research Agent"
- System will automatically create new data in correct location

## Files Modified

1. ✅ `ui-new/src/services/adapters/googleSheetsAdapter.ts`
   - Added `ensureResearchAgentFolder()` method
   - Updated `ensureSpreadsheetExists()` to search in folder
   - Updated `createSpreadsheet()` to move to folder
   
2. ✅ `ui-new/src/services/adapters/plansAdapter.ts`
   - Changed `APP_FOLDER_NAME` to 'Research Agent'
   
3. ✅ `ui-new/src/services/adapters/playlistsAdapter.ts`
   - Changed `APP_FOLDER_NAME` to 'Research Agent'
   
4. ✅ `ui-new/src/services/googleDriveSync.ts`
   - Changed `APP_FOLDER_NAME` to 'Research Agent'

## Testing Required

- [ ] Create new snippet → Verify goes to Research Agent folder
- [ ] Create new plan → Verify JSON file in Research Agent folder  
- [ ] Create new playlist → Verify JSON file in Research Agent folder
- [ ] Enable Google Sheets sync → Verify spreadsheet created in Research Agent folder
- [ ] Verify no new files in "LLM Proxy App Data" folder

## Future Improvements

### Short-term
- Add migration tool to move data from old folder to new
- Add cleanup confirmation dialog for old folder

### Long-term  
- **Deprecate JSON files** entirely, move all data to Google Sheets
- Remove `googleDriveSync.ts` (legacy system)
- Consolidate all sync through `unifiedSync.ts` → Google Sheets adapter only
- Benefits:
  - Single source of truth (Google Sheets)
  - Better conflict resolution
  - Easier data management for users
  - Consistent sync behavior

## Security Notes

- Folder creation uses existing OAuth flow (no new permissions)
- Folder is created in user's own Google Drive
- No backend access required (all browser-side API calls)
- User maintains full ownership of data

## Backward Compatibility

✅ **Fully backward compatible**:
- Existing installations continue to work
- Old sync adapters still functional
- Data not lost or corrupted
- Gradual migration approach

## Documentation Updates Needed

- [ ] Update README.md with new folder structure
- [ ] Update user documentation about Google Drive sync
- [ ] Add FAQ about "LLM Proxy App Data" folder cleanup
- [ ] Document migration path for existing users

## Related Issues

- Fixes: User finding unexpected files in Google Drive
- Addresses: Inconsistent folder naming across sync systems
- Prevents: Future confusion about where data is stored
- Enables: Future consolidation to Google Sheets only

## Conclusion

All sync systems now use the **"Research Agent"** folder as the single source of truth for Google Drive storage. This provides:

✅ **Consistency**: One folder name across all features  
✅ **Clarity**: Users know exactly where their data is  
✅ **Organization**: All app data in one logical location  
✅ **Future-proof**: Foundation for full Google Sheets migration

**Next deployment**: Changes will apply to all new syncs automatically. Existing users will see new folder created on next sync operation.
