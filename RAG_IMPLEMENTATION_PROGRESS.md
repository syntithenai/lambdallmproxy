# RAG Browser-First Architecture - Implementation Progress

## Completed Phases

### Phase 0: User Spreadsheet Discovery ✅
**Status**: Complete

**Backend Changes**:
- Created `/src/rag/user-spreadsheet.js` module
- Added `GET /rag/user-spreadsheet` endpoint in `/src/endpoints/rag.js`
- Searches user's Google Drive for "Research Agent Swag" spreadsheet
- Creates new spreadsheet if not found with:
  - RAG_Snippets_v1 sheet
  - RAG_Embeddings_v1 sheet  
  - RAG_Search_Cache sheet

**Frontend Changes**:
- Added `getUserRagSpreadsheet()` function in `SwagContext.tsx`
- Called on sync initialization (when user logs in)
- Caches spreadsheet ID in localStorage: `rag_spreadsheet_id`
- Shows toast notification when new spreadsheet is created

**Flow**:
1. User logs in
2. Frontend calls `/rag/user-spreadsheet` with user's OAuth token
3. Backend searches Drive, creates if needed
4. Frontend caches spreadsheet ID
5. All subsequent operations use cached ID

### Phase 2: Backend - Remove libSQL, Return JSON ✅
**Status**: Complete

**Changes to `/src/endpoints/rag.js`**:
- Removed libSQL imports: `saveChunks`, `createLibsqlClient`, `hasEmbedding`, `getEmbeddingDetails`
- Modified `handleEmbedSnippets()` to return JSON instead of SSE
- Returns full chunks with embeddings: `{ success, results: [{ id, status, chunks: [...] }] }`
- Added `handleEmbedQuery()` endpoint for query embedding generation
- Each chunk includes full 1536-dim embedding vector

**Why JSON instead of SSE**:
- Embeddings are large (~15KB per chunk as JSON)
- Multiple chunks per snippet = 50-100KB+
- SSE parsing fails with large payloads
- Client needs all data at once to save to IndexedDB + Google Sheets

### Phase 3: Frontend IndexedDB Enhancements ✅
**Status**: Complete

**Changes to `/ui-new/src/utils/ragDB.ts`**:
- Updated database version from 1 to 2
- Added `SEARCH_CACHE_STORE` for query embeddings
- Updated `EmbeddingChunk` interface to match backend format:
  - `id` (was `chunk_id`)
  - `chunk_text` (was `content`)
  - `created_at` as ISO string
- Added new methods:
  - `cacheQueryEmbedding()` - Cache query embeddings
  - `getCachedQueryEmbedding()` - Retrieve cached query
  - `vectorSearch()` - Perform local cosine similarity search
  - `cosineSimilarity()` - Calculate similarity scores
  - `getAllChunks()` - Get all chunks for backup/sync
- Exported new types: `QueryCache`, `SearchResult`

**Vector Search**:
- Runs entirely in browser (no network calls)
- Calculates cosine similarity between query and all chunks
- Filters by threshold (default: 0.7)
- Returns top K results sorted by score

### Phase 4: Update SwagContext ✅  
**Status**: Complete

**Changes to `/ui-new/src/contexts/SwagContext.tsx`**:
- Rewrote `generateEmbeddings()` to handle JSON response
- Removed SSE parsing logic
- New flow:
  1. POST to `/rag/embed-snippets` with snippet data
  2. Receive JSON response with full chunks + embeddings
  3. Save chunks to IndexedDB via `ragDB.saveChunks()`
  4. Update snippet `hasEmbedding` flags
  5. Report progress via callback
- Returns `{ embedded, skipped, failed }` counts

**Integration with Spreadsheet Discovery**:
- `getUserRagSpreadsheet()` called before sync initialization
- Checks localStorage cache first
- Falls back to API call if not cached
- Stores result in `rag_spreadsheet_id`

## Remaining Phases

### Phase 1: Google Sheets Schema
**Status**: Not Started (but partially done in Phase 0)

**What's Done**:
- Spreadsheet creation with 3 sheets
- Header rows initialized

**What's Needed**:
- Implement `saveEmbeddingsToSheets()` in backend
- Implement `getEmbeddingsFromSheets()` for sync pull
- Format embeddings as JSON arrays in cells
- Handle batch operations (100 chunks at a time)

### Phase 5: RAG Sync Service
**Status**: Not Started

**Needed**:
- Create `/ui-new/src/services/ragSyncService.ts`
- Methods:
  - `pushEmbeddings()` - Upload chunks to Google Sheets
  - `pullEmbeddings()` - Download chunks from Google Sheets  
  - `fullSync()` - Complete bidirectional sync
- Progress callbacks for toast notifications
- Error handling and retry logic

### Phase 6: Search UI
**Status**: Not Started

**Needed**:
- Add vector search toggle in `SwagPage.tsx`
- Add "Use RAG Context" checkbox in chat interface
- Implement `vectorSearch()` wrapper in SwagContext
- Format search results as markdown for LLM
- Show search progress/results in UI

### Phase 7: Testing & Validation
**Status**: Not Started

**Test Cases**:
1. Generate embeddings → verify IndexedDB has chunks
2. Sync to Google Sheets → verify RAG_Embeddings_v1 populated
3. Pull from Google Sheets → verify IndexedDB restored
4. Vector search → verify results ranked by similarity
5. RAG in chat → verify context included in LLM request

## Key Architecture Decisions

### Data Flow (Embedding Generation)
```
User: "Generate Embeddings"
  ↓
Frontend → Backend: POST /rag/embed-snippets
  ↓
Backend: Generates chunks + embeddings (OpenAI API)
  ↓
Backend → Frontend: JSON { results: [{ id, chunks: [...] }] }
  ↓
Frontend: Saves to IndexedDB
  ↓
Frontend → Backend: POST /rag/sync (save to Google Sheets)
  ↓
Backend: Writes to user's spreadsheet
  ↓
Frontend: Shows success toast
```

### Why This Approach?
1. **Client controls storage**: UI decides when to save
2. **Backend is stateless**: No /tmp storage, pure compute
3. **User pays data cost**: Transparent network usage
4. **Progress at each step**: Toasts show what's happening
5. **No SSE parsing issues**: Standard JSON response

### Storage Layers
1. **Primary**: Browser IndexedDB (~1GB, fast, offline)
2. **Backup**: User's Google Sheets (unlimited, synced, shareable)
3. **Compute**: Lambda (stateless, embeddings generation only)

## Next Steps

1. **Deploy current changes** to test end-to-end flow
2. **Implement Phase 5** (RAG Sync Service) for Google Sheets push/pull
3. **Implement Phase 6** (Search UI) for vector search + chat integration
4. **Run Phase 7** (Testing) to validate complete flow

## Files Modified

### Backend
- `/src/endpoints/rag.js` - Removed libSQL, return JSON, add user-spreadsheet endpoint
- `/src/rag/user-spreadsheet.js` - NEW - User spreadsheet discovery

### Frontend  
- `/ui-new/src/utils/ragDB.ts` - Enhanced IndexedDB with vector search
- `/ui-new/src/contexts/SwagContext.tsx` - Updated generateEmbeddings(), added spreadsheet discovery

## Breaking Changes
- `POST /rag/embed-snippets` now returns JSON instead of SSE
- Frontend expects `{ success, results }` format
- `EmbeddingChunk` interface updated (field name changes)
- IndexedDB schema version bumped to 2

## Migration Notes
- Existing users: IndexedDB will auto-upgrade to v2 (adds search_cache store)
- Old embeddings in libSQL will be ignored (ephemeral /tmp storage)
- Users should re-generate embeddings after deployment
