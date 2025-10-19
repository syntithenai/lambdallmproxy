# RAG Browser-First Implementation - Testing Guide

## Test Progress: Phase 7 In Progress

### Completed Implementation (Phases 0-5) ✅

All core backend and frontend infrastructure is now complete:

1. **User Spreadsheet Discovery** ✅
2. **Backend JSON API** ✅  
3. **IndexedDB Vector Search** ✅
4. **SwagContext Integration** ✅
5. **RAG Sync Service** ✅

### Deployment Steps

1. **Build Frontend**:
```bash
cd ui-new
npm run build
cd ..
```

2. **Deploy Lambda**:
```bash
./deploy.sh
```

3. **Test in Browser**:
- Open the deployed URL
- Login with Google OAuth
- Navigate to SWAG page

### Test Plan

#### Test 1: User Spreadsheet Discovery
**Steps**:
1. Login with Google account
2. Open browser console
3. Check localStorage for `rag_spreadsheet_id`
4. Check Google Drive for "Research Agent Swag" spreadsheet

**Expected**:
- ✅ Spreadsheet ID cached in localStorage
- ✅ Spreadsheet visible in Google Drive
- ✅ Contains 3 sheets: RAG_Snippets_v1, RAG_Embeddings_v1, RAG_Search_Cache

#### Test 2: Embedding Generation
**Steps**:
1. Create a test snippet with content
2. Select snippet
3. Click "Add To Search Index" bulk operation
4. Wait for completion

**Expected**:
- ✅ POST to `/rag/embed-snippets` succeeds
- ✅ Response contains `{ success: true, results: [...] }`
- ✅ Each result has `chunks` array with embeddings
- ✅ Snippet marked with `hasEmbedding: true`

#### Test 3: IndexedDB Storage
**Steps**:
1. After generating embeddings, open DevTools → Application → IndexedDB
2. Check `rag_embeddings` database
3. Verify `chunks` store has entries

**Expected**:
- ✅ Database version 2
- ✅ Chunks stored with full 1536-dim embeddings
- ✅ Each chunk has: id, snippet_id, chunk_text, embedding, chunk_index, embedding_model

#### Test 4: Google Sheets Sync (Push)
**Steps**:
1. After generating embeddings
2. System should auto-push to Google Sheets
3. Open "Research Agent Swag" in Google Sheets
4. Check RAG_Embeddings_v1 sheet

**Expected**:
- ✅ POST to `/rag/sync-embeddings` with operation='push'
- ✅ Rows appear in RAG_Embeddings_v1
- ✅ Embedding column contains JSON array
- ⚠️ **Note**: Auto-push not yet implemented, manual call needed

#### Test 5: Google Sheets Sync (Pull)
**Steps**:
1. Clear IndexedDB
2. Call sync service to pull embeddings
3. Verify IndexedDB repopulated

**Expected**:
- ✅ POST to `/rag/sync-embeddings` with operation='pull'
- ✅ Chunks restored to IndexedDB
- ✅ Embeddings match what was pushed

#### Test 6: Vector Search (Phase 6 - Not Yet Implemented)
**Steps**:
1. Generate embeddings for multiple snippets
2. Use vector search UI
3. Enter search query
4. View results ranked by similarity

**Expected**:
- 🔄 Search UI needs implementation
- 🔄 Query embedding generation
- 🔄 Local cosine similarity calculation
- 🔄 Top K results display

### Known Issues & TODOs

#### Issue 1: No Auto-Push to Google Sheets
**Problem**: After generating embeddings, they're saved to IndexedDB but not automatically pushed to Google Sheets.

**Solution Needed**: Update `generateEmbeddings()` in SwagContext to call `ragSyncService.pushEmbeddings()` after saving to IndexedDB.

**File**: `/ui-new/src/contexts/SwagContext.tsx`

**Add after line ~655 (after saving to IndexedDB)**:
```typescript
// Step 3: Push to Google Sheets
const allChunks = results.flatMap(r => r.chunks);
if (allChunks.length > 0) {
  try {
    await ragSyncService.pushEmbeddings(allChunks, (current, total) => {
      console.log(`Syncing: ${current}/${total} chunks`);
    });
    console.log('✅ Synced to Google Sheets');
  } catch (error) {
    console.error('Failed to sync to Google Sheets:', error);
    // Continue even if sync fails
  }
}
```

#### Issue 2: Phase 6 Not Implemented
**Missing**:
- Vector search UI toggle
- RAG context checkbox in chat
- Query embedding generation
- Search results formatting

**Priority**: Medium (core functionality works, UI enhancements needed)

#### Issue 3: Error Handling
**Needed**:
- Toast notifications for sync operations
- Retry logic for failed syncs
- Conflict resolution for concurrent edits

### Manual Testing Commands

**Test Spreadsheet Discovery**:
```javascript
// In browser console
const response = await fetch(`${window.location.origin}/rag/user-spreadsheet`, {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  }
});
const result = await response.json();
console.log('Spreadsheet:', result);
```

**Test Embedding Generation**:
```javascript
// In browser console
const snippet = {
  id: 'test-123',
  content: 'This is a test snippet for RAG embeddings. It contains enough text to generate meaningful embeddings.',
  title: 'Test Snippet'
};

const response = await fetch(`${window.location.origin}/rag/embed-snippets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    snippets: [snippet]
  })
});
const result = await response.json();
console.log('Embeddings:', result);
```

**Test Vector Search**:
```javascript
// In browser console (after IndexedDB has embeddings)
import { ragDB } from '/src/utils/ragDB';

// Get a query embedding first
const queryResponse = await fetch(`${window.location.origin}/rag/embed-query`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'test search' })
});
const { embedding } = await queryResponse.json();

// Perform vector search
const results = await ragDB.vectorSearch(embedding, 5, 0.5);
console.log('Search results:', results);
```

### Next Steps

1. ✅ Deploy current implementation
2. ⚠️ Test end-to-end flow
3. 🔧 Fix auto-push to Google Sheets
4. 🔧 Implement Phase 6 (Search UI)
5. ✅ Complete Phase 7 testing
