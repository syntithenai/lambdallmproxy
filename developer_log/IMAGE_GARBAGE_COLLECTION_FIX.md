# Image Garbage Collection Fix

## Issue
User reported that after importing a shared snippet, all existing images in their swag collection disappeared (showing as "Image Not Found" grey blocks), except for the newly imported item.

## Root Cause
The garbage collection system was too aggressive:

1. **Race Condition**: When importing a snippet, the garbage collector (GC) runs 30 seconds after page load
2. **Premature Deletion**: If existing snippets weren't fully loaded from IndexedDB when GC ran, their image references weren't found in the content check
3. **Orphan Misidentification**: The GC incorrectly identified valid images as orphaned and deleted them
4. **Retention Too Short**: 2-minute retention period wasn't long enough to protect against slow loads or sync delays

## Changes Made

### 1. imageStorage.ts - Enhanced Safety Checks

**Added zero-snippet check:**
```typescript
// SAFETY: Don't run GC if we have no snippets loaded
if (allSnippetContents.length === 0) {
  console.log(`🗑️ ⚠️ SKIPPING: No snippets loaded yet - not safe to garbage collect`);
  return 0;
}
```

**Increased retention period:**
- Changed from 2 minutes → 10 minutes
- Protects images during:
  - Slow IndexedDB loads
  - Network sync delays
  - Snippet imports
  - Page navigation

### 2. SwagContext.tsx - Safer GC Scheduling

**Added snippet count check:**
```typescript
if (allSnippets.length === 0) {
  console.log(`🗑️ Skipping garbage collection - no snippets loaded yet`);
  return;
}
```

**Increased initial GC delay:**
- Changed from 30 seconds → 60 seconds
- Gives more time for:
  - All snippets to load from IndexedDB
  - Sync operations to complete
  - User to finish importing/editing

## Prevention Strategy

The fix implements multiple safety layers:

1. **Never run GC with zero snippets** - prevents deletion when data is loading
2. **10-minute retention** - protects recently created images from premature deletion
3. **60-second initial delay** - ensures snippets are fully loaded before first GC
4. **Logging improvements** - better visibility into what GC is doing

## Recovery for Affected Users

Unfortunately, deleted images cannot be recovered from IndexedDB alone. Options:

1. **Google Sheets Sync** - If sync was enabled, images may be embedded in sheet content
2. **Browser Cache** - Check browser cache for recently viewed images
3. **Re-import** - Import snippets again from shared links if available
4. **Manual Re-add** - Paste images back into snippets from original sources

## Future Improvements

Consider:
- **Reference counting** - Track which snippets reference each image
- **Soft delete** - Mark images as deleted but keep for 24-48 hours
- **Backup before GC** - Export image refs before running garbage collection
- **User notification** - Alert user when images are about to be deleted
- **Manual GC only** - Disable automatic GC, run only when user requests it

## Testing

To verify the fix:
1. Create 5-6 snippets with images
2. Wait for them to save to IndexedDB
3. Import a shared snippet
4. Verify all existing images remain visible
5. Check browser console for GC logs
6. Confirm no images deleted within first 10 minutes

## Files Changed
- `ui-new/src/utils/imageStorage.ts` - Added safety checks and increased retention
- `ui-new/src/contexts/SwagContext.tsx` - Added snippet count check and longer initial delay
