# Embedding Generation Issues - Debug & Fix Summary

**Date**: October 19, 2025  
**Issues Reported**:
1. "No items were added to search index" when generating embeddings
2. No Google Sheet visible containing embeddings

## Root Causes Identified

### Issue 1: Silent IndexedDB Save Failures

**Problem**: When `saveChunks()` threw an error, it would prevent the `embedded++` counter from incrementing, causing the function to return `embedded: 0`, which triggered the "No items were added" message.

**Location**: `ui-new/src/contexts/SwagContext.tsx` lines 669-686

**Fix Applied**:
```typescript
// BEFORE: No error handling around saveChunks
await ragDB.saveChunks(result.chunks, {...});
embeddedSnippetIds.push(result.id);
totalChunks += result.chunks.length;
embedded++;

// AFTER: Wrapped in try-catch to properly track failures
try {
  await ragDB.saveChunks(result.chunks, {...});
  embeddedSnippetIds.push(result.id);
  totalChunks += result.chunks.length;
  embedded++;
  console.log(`✅ Saved ${result.chunks.length} chunks for snippet ${result.id}`);
} catch (saveError) {
  failed++;
  console.error(`❌ Failed to save chunks for snippet ${result.id}:`, saveError);
  // Continue processing other results
}
```

**Result**: Now properly distinguishes between embedding generation success and IndexedDB save failures.

### Issue 2: Missing Spreadsheet ID

**Problem**: Google Sheets sync requires a spreadsheet ID stored in `localStorage.getItem('rag_spreadsheet_id')`. If this is missing:
- Sync code path would be skipped silently
- User wouldn't know why embeddings weren't syncing
- No Google Sheet would be created/updated

**Location**: `ui-new/src/contexts/SwagContext.tsx` lines 705-730

**Fix Applied**:
```typescript
// Added explicit check and logging
const spreadsheetId = localStorage.getItem('rag_spreadsheet_id');
if (!spreadsheetId) {
  console.warn('⚠️ No spreadsheet ID found. Skipping Google Sheets sync.');
  console.log('💡 To enable sync: Go to Settings > RAG and configure cloud sync');
  showWarning('⚠️ Embeddings saved locally. Enable cloud sync in Settings to backup to Google Sheets.');
} else {
  // Proceed with sync...
}
```

**Additional Logging**:
```typescript
console.log(`📊 Google Sheets sync check:`, {
  chunksToSync: allChunks.length,
  userEmail: user?.email,
  spreadsheetId: localStorage.getItem('rag_spreadsheet_id'),
  googleLinked: localStorage.getItem('rag_google_linked'),
});

console.log(`📤 Sync method: ${canUseClientSync ? 'Client-side direct' : 'Backend'}`);
console.log(`📝 Formatted ${rows.length} rows for Google Sheets`);
```

**Result**: User now gets clear feedback about why sync isn't happening and how to fix it.

## Files Modified

### 1. `ui-new/src/contexts/SwagContext.tsx`

**Lines 656-693**: Added try-catch around `saveChunks()` with success/failure logging
- Properly increments `embedded` counter only on success
- Increments `failed` counter on save errors
- Continues processing other results instead of bailing out

**Lines 705-735**: Enhanced Google Sheets sync logging
- Logs sync decision factors (spreadsheet ID, user email, link status)
- Shows sync method being used (client-side vs backend)
- Warns user when spreadsheet ID is missing with instructions
- Logs row formatting and API call progress

### 2. `debug-embeddings.js` (NEW FILE)

Created comprehensive debug script to help diagnose embedding issues. Run in browser console to check:

1. **LocalStorage Configuration**:
   - authToken presence
   - spreadsheet ID
   - Google account link status
   - RAG config (threshold, sync enabled)

2. **IndexedDB Status**:
   - Database open status
   - Object stores available
   - Chunk count
   - Sample chunk structure (has id? has embedding?)

3. **Backend Connectivity**:
   - API URL configuration
   - Health check endpoint

4. **Google Identity Services**:
   - GIS library loaded

5. **Testing Instructions**:
   - Step-by-step guide to test embedding generation
   - Which logs to watch for
   - Google Sheets URL to verify sheet exists

6. **Common Issues & Solutions**:
   - Diagnosis of typical problems
   - Step-by-step fixes

## How to Use Debug Script

1. Open your app in browser (e.g., http://localhost:8081)
2. Open DevTools (F12)
3. Go to Console tab
4. Copy and paste contents of `debug-embeddings.js`
5. Press Enter
6. Review the output to identify issues

The script will show:
- ✅ What's configured correctly
- ❌ What's missing
- 💡 How to fix each issue

## Testing Checklist

After these fixes, test the following:

### Basic Embedding Generation
- [ ] Select a snippet in SWAG
- [ ] Click "Add to Index"
- [ ] Should see console logs:
  - `📦 Backend response: {...}` (chunks from backend)
  - `🔍 Chunk structure check: {...}` (chunk validation)
  - `💾 saveChunks called with: {...}` (IndexedDB save attempt)
  - `✅ Saved X chunks for snippet Y` (success) OR
  - `❌ Failed to save chunks: ...` (failure with details)

### Google Sheets Sync
- [ ] Run debug script to check spreadsheet ID
- [ ] If missing: Go to Settings > RAG, enable cloud sync
- [ ] Generate embeddings
- [ ] Should see console logs:
  - `📊 Google Sheets sync check: {...}` (sync decision)
  - `📤 Sync method: Client-side direct` or `Backend`
  - `📝 Formatted X rows for Google Sheets`
  - `✅ Synced to Google Sheets` OR error with fallback

### Error Cases
- [ ] If IndexedDB save fails:
  - Should see `❌ Failed to save chunks: ...` with error details
  - Should still get success message for other snippets that worked
  - Failed count should be accurate

- [ ] If spreadsheet ID missing:
  - Should see warning: "⚠️ No spreadsheet ID found"
  - Should see instructions: "Go to Settings > RAG and configure cloud sync"
  - Should see UI message about local-only save

## Expected Console Logs (Success Case)

```javascript
// 1. Backend returns chunks
📦 Backend response: {
  success: true,
  resultsCount: 1,
  firstResult: { id: "...", status: "success", chunks: [...] },
  firstChunk: { id: "...", content: "...", embedding: [...], ... }
}

// 2. Chunk structure validated
🔍 Chunk structure check: {
  chunkCount: 3,
  firstChunk: { id: "abc123", ... },
  hasId: true,
  hasSnippetId: true
}

// 3. IndexedDB save attempt
💾 saveChunks called with: {
  chunkCount: 3,
  firstChunk: { id: "abc123", ... },
  hasId: true
}

// 4. IndexedDB save success
✅ Saved 3 chunks for snippet xyz789

// 5. Google Sheets sync decision
📊 Google Sheets sync check: {
  chunksToSync: 3,
  userEmail: "user@example.com",
  spreadsheetId: "1ABC...XYZ",
  googleLinked: "true"
}

// 6. Sync method and execution
📤 Sync method: Client-side direct
📤 Using direct Google Sheets sync for 3 chunks (client-side)...
📝 Formatted 3 rows for Google Sheets
✅ Synced to Google Sheets (client-side)
```

## Expected Console Logs (Failure Cases)

### Case A: IndexedDB Save Fails
```javascript
🔍 Chunk structure check: { ... }
💾 saveChunks called with: { ... }
❌ PUT request failed: { error: "DataError: ...", ... }
❌ Failed to save chunks for snippet xyz789: DataError: ...
```

### Case B: No Spreadsheet ID
```javascript
📊 Google Sheets sync check: {
  chunksToSync: 3,
  userEmail: "user@example.com",
  spreadsheetId: null,  // ← Missing!
  googleLinked: "false"
}
⚠️ No spreadsheet ID found. Skipping Google Sheets sync.
💡 To enable sync: Go to Settings > RAG and configure cloud sync
```

### Case C: Sync Fails, Fallback Works
```javascript
📤 Sync method: Client-side direct
📝 Formatted 3 rows for Google Sheets
❌ Client-side sync failed, falling back to backend: Error: ...
⚠️ Direct sync failed, using backend fallback...
📤 Starting backend Google Sheets sync...
📤 Syncing: 3/3 chunks
✅ Synced to Google Sheets (backend)
```

## Next Steps

1. **Run the debug script** to identify current state
2. **Test embedding generation** with console open
3. **Check for specific error messages** in logs
4. **Follow the script's recommendations** to fix configuration issues

If issues persist after fixes:
1. Share the console logs from debug script
2. Share the logs from embedding generation attempt
3. Check browser DevTools Network tab for failed requests
4. Verify IndexedDB structure (Application tab > IndexedDB > rag_db)

## Related Files

- **SwagContext.tsx**: Main embedding generation and sync logic
- **ragDB.ts**: IndexedDB operations, saveChunks implementation
- **googleSheetsClient.ts**: Client-side Google Sheets API wrapper
- **RAGSettings.tsx**: UI for configuring sync and linking Google account
- **debug-embeddings.js**: Diagnostic script

## Configuration Requirements

For full functionality:
1. **Logged In**: `localStorage.getItem('authToken')` must exist
2. **Spreadsheet Configured**: `localStorage.getItem('rag_spreadsheet_id')` must exist
3. **Optional - Direct Sync**: `localStorage.getItem('rag_google_linked') === 'true'`

To configure:
1. Log in to app (creates authToken)
2. Go to Settings > RAG
3. Enable "Cloud Sync to Google Sheets" (creates spreadsheet)
4. Optionally: Click "Link Google Account" (enables client-side direct sync)

## Summary

The fixes add:
1. ✅ Proper error handling to distinguish save failures from successful embeddings
2. ✅ Explicit spreadsheet ID checking with user guidance
3. ✅ Comprehensive logging throughout the sync pipeline
4. ✅ Debug script to quickly diagnose configuration issues

The "No items were added to search index" message should now only appear when:
- Backend actually returns no chunks, OR
- All chunks fail to save (with detailed error logs)

Not when:
- ~~Some chunks save and some fail~~ (now reports accurate counts)
- ~~Sync is skipped due to missing config~~ (now reports separately)
