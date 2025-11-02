# Direct Google Sheets Sync Implementation

**Date**: 2025-11-02  
**Status**: ✅ Complete

## Overview

Migrated all data sync operations (snippets, quizzes, feed items) to use **direct client-side Google Sheets API** instead of going through the Lambda function. This matches the approach already used for embeddings sync.

## Problems Solved

### 1. Quiz Page Not Refreshing

**Problem**: When a quiz was generated from the Feed page, it didn't appear on the Quiz page until navigation away and back.

**Solution**: Added a custom event system:
- FeedContext dispatches `'quiz-saved'` event after saving quiz to quizDB
- QuizPage listens for `'quiz-saved'` event and reloads statistics
- Result: Quiz page updates immediately when new quizzes are created

**Files Modified**:
- `ui-new/src/contexts/FeedContext.tsx` - Added `window.dispatchEvent(new Event('quiz-saved'))`
- `ui-new/src/components/QuizPage.tsx` - Added event listener for `'quiz-saved'`

### 2. Snippet Sync Going Through Lambda

**Problem**: All snippet saves were going through the Lambda `/rag/sync` endpoint, causing:
- Unnecessary Lambda invocations (costs)
- Server logs showing snippet saves
- Slower sync performance
- Inconsistent architecture (embeddings used direct sync, snippets didn't)

**Solution**: Updated snippet sync to use direct Google Sheets API:
- Check if `isGoogleIdentityAvailable()` (client-side auth)
- If available → Use `syncSnippetsToSheets()` directly
- If not available → Fall back to Lambda endpoint
- Same fallback pattern as embeddings

## Implementation Details

### New Functions in `googleSheetsClient.ts`

```typescript
// Snippets
export function formatSnippetsForSheets(snippets: any[]): any[][]
export async function syncSnippetsToSheets(spreadsheetId: string, snippets: any[]): Promise<void>

// Feed Items
export function formatFeedItemsForSheets(items: any[]): any[][]
export async function syncFeedItemsToSheets(spreadsheetId: string, items: any[]): Promise<void>

// Quizzes
export function formatQuizzesForSheets(quizzes: any[]): any[][]
export async function syncQuizzesToSheets(spreadsheetId: string, quizzes: any[]): Promise<void>
```

### Sheet Ranges and Schema

**Snippets Sheet** (`snippets!A:I`):
- Column A: ID
- Column B: Content
- Column C: Title
- Column D: Source Type
- Column E: Timestamp
- Column F: Update Date
- Column G: Tags (JSON)
- Column H: Project ID
- Column I: Selected (boolean)

**Feed Items Sheet** (`feed!A:K`):
- Column A: ID
- Column B: Title
- Column C: Content
- Column D: URL
- Column E: Category
- Column F: Tags (JSON)
- Column G: Image URL
- Column H: Generated At
- Column I: Viewed At
- Column J: Stashed (boolean)
- Column K: Project ID

**Quizzes Sheet** (`quizzes!A:M`):
- Column A: ID
- Column B: Quiz Title
- Column C: Snippet IDs (JSON)
- Column D: Score
- Column E: Total Questions
- Column F: Percentage
- Column G: Time Taken
- Column H: Completed At
- Column I: Answers (JSON)
- Column J: Enrichment (boolean)
- Column K: Completed (boolean)
- Column L: Project ID
- Column M: Quiz Data (JSON) - Full quiz for restarting

### Updated Contexts

**SwagContext** (`ui-new/src/contexts/SwagContext.tsx`):
- `addSnippet()` - Uses direct sync with fallback
- `updateSnippet()` - Uses direct sync with fallback
- `deleteSnippets()` - Still uses Lambda (complex row deletion)

**FeedContext** (`ui-new/src/contexts/FeedContext.tsx`):
- `startQuiz()` - Syncs new quiz to Sheets after saving to quizDB
- Added `window.dispatchEvent()` to notify Quiz page

**QuizPage** (`ui-new/src/components/QuizPage.tsx`):
- Added event listener for `'quiz-saved'` to reload statistics
- Ensures real-time updates when quizzes are created elsewhere

## Sync Decision Logic

```typescript
const spreadsheetId = localStorage.getItem('rag_spreadsheet_id');
const googleLinked = localStorage.getItem('rag_google_linked') === 'true';
const canUseClientSync = spreadsheetId && googleLinked && isGoogleIdentityAvailable();

if (canUseClientSync) {
  // ✅ Direct client-side sync (preferred)
  await syncSnippetsToSheets(spreadsheetId, [snippet]);
} else {
  // ⬇️ Fallback to Lambda endpoint
  ragSyncService.queueSync({ type: 'push-snippet', data: snippet, userEmail });
}
```

## Benefits

### Performance
- ✅ Faster sync (direct browser → Sheets API)
- ✅ No Lambda cold starts for sync operations
- ✅ Reduced latency

### Cost
- ✅ Eliminates Lambda invocations for snippet/quiz/feed syncs
- ✅ Reduces Lambda execution time
- ✅ Lower AWS costs

### Architecture
- ✅ Consistent approach across all data types
- ✅ Embeddings, snippets, quizzes, and feed items all use same pattern
- ✅ Graceful fallback to Lambda if client-side auth unavailable

### User Experience
- ✅ Real-time updates across pages (quiz-saved event)
- ✅ Immediate feedback on sync operations
- ✅ No server logs cluttering CloudWatch for routine syncs

## Fallback Strategy

The implementation includes **automatic fallback** to Lambda endpoints:

1. **Primary**: Try client-side direct sync
   - Requires: Google Identity Services initialized
   - Requires: User authenticated with Google
   - Requires: Spreadsheet ID configured

2. **Fallback**: Use Lambda endpoint
   - If Google Identity not available
   - If authentication fails
   - If any error occurs during direct sync
   - Ensures sync always works

## Testing

### Test Scenarios
1. ✅ Save snippet → Check Google Sheets directly
2. ✅ Generate quiz from Feed → Verify appears on Quiz page immediately
3. ✅ Update snippet → Check updated in Sheets
4. ✅ Create feed item → Verify synced to Sheets
5. ✅ Test with Google auth disabled → Verify fallback to Lambda works

### Verification
- Check browser console for: `"📤 Syncing X snippets to Google Sheets (client-side)..."`
- Check server logs for: Should NOT see snippet/quiz saves unless fallback triggered
- Check Google Sheets directly: New rows should appear immediately

## Rate Limiting & Batching

### Google Sheets API Quotas
- **Limit**: 60 write requests per minute per user
- **Our Limit**: 50 requests per minute (safety buffer)
- **Window**: 1 minute rolling window

### Rate Limiting Implementation
```typescript
// Tracks recent requests and enforces rate limit
const RATE_LIMIT = {
  maxRequests: 50,        // Stay under 60/min limit
  windowMs: 60000,        // 1 minute window
  requests: [] as number[], // Timestamps
};

// Waits if needed before API call
await waitForRateLimit();
```

### Batching Strategy
**Snippet Sync Queue**:
- Batches multiple snippet saves into groups of 10
- 2-second debounce window (collects snippets before syncing)
- Reduces API calls: 100 snippets = 10 API calls instead of 100

**Example**:
```typescript
// User saves 20 snippets quickly
// Old: 20 API calls (might hit rate limit)
// New: 2 API calls after 2-second debounce
```

### Delete Operations
Now supports direct deletion:
- `deleteSnippetsFromSheets()` - Delete snippets by ID
- `deleteFeedItemsFromSheets()` - Delete feed items by ID  
- `deleteQuizzesFromSheets()` - Delete quizzes by ID

Process:
1. Get sheet metadata to find sheet ID
2. Search column A for matching IDs
3. Batch delete rows (sorted descending to maintain indices)
4. One API call per delete batch

## Notes

### All Operations Now Direct
✅ **Create**: Direct append to Google Sheets  
✅ **Update**: Direct append (new row with updated data)  
✅ **Delete**: Direct row deletion by ID  
✅ **Rate Limited**: All operations respect quota limits  
✅ **Batched**: Multiple operations combined to reduce API calls

### Future Improvements
- [x] Implement direct deletion (find and delete rows by ID) - ✅ DONE
- [x] Add bulk sync optimization (batch multiple operations) - ✅ DONE
- [x] Add rate limiting to avoid quota issues - ✅ DONE
- [ ] Add conflict resolution for concurrent edits
- [ ] Implement pull sync to download from Sheets on app startup
- [ ] Add retry logic with exponential backoff
- [ ] Deduplicate rows (remove old versions when updating)

## Migration Impact

### Backend (Lambda)
- **Reduced load**: Fewer `/rag/sync` invocations
- **Logs cleaner**: No more snippet save logs unless fallback triggered
- **Cost savings**: Fewer Lambda invocations

### Frontend (UI)
- **Better UX**: Real-time updates across pages
- **Faster sync**: Direct API calls, no Lambda proxy
- **More reliable**: Fallback ensures sync always works

### Users
- **Transparent**: No visible changes to UX
- **More responsive**: Quizzes appear immediately
- **Better reliability**: Dual sync paths (client + server)

## Related Files

### Core Implementation
- `ui-new/src/services/googleSheetsClient.ts` - Direct Sheets API client
- `ui-new/src/contexts/SwagContext.tsx` - Snippet sync logic
- `ui-new/src/contexts/FeedContext.tsx` - Quiz and feed sync logic
- `ui-new/src/components/QuizPage.tsx` - Quiz refresh event listener

### Supporting Files
- `ui-new/src/services/ragSyncService.ts` - Fallback Lambda sync service
- `ui-new/src/db/quizDb.ts` - Quiz database operations
- `ui-new/src/db/feedDb.ts` - Feed database operations

## Conclusion

All data sync operations (snippets, quizzes, feed items, embeddings) now use the **same direct Google Sheets API approach**, eliminating unnecessary Lambda invocations and providing a consistent, fast, and cost-effective sync architecture.

The real-time event system ensures UI updates propagate immediately across pages, improving the user experience significantly.
