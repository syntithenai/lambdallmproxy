# RAG System - Quick Reference Guide

**Status**: ✅ 75% Complete (6/8 Phases)  
**Last Update**: October 19, 2025  
**Deployment**: Live on GitHub Pages (commit 92a6d3f)

---

## 🚀 What Works Now

### ✅ Generate Embeddings
1. Go to SWAG page
2. Select snippets (checkbox)
3. Bulk Operations → "Add To Search Index"
4. **Automatic sync to Google Sheets!** 📤

### ✅ Vector Search (Console Only)
```javascript
// In browser console
const apiUrl = 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

// Get query embedding
const res = await fetch(`${apiUrl}/rag/embed-query`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'your search query' })
});
const { embedding } = await res.json();

// Search (requires ragDB import in component)
// const results = await ragDB.vectorSearch(embedding, 5, 0.7);
```

### ✅ Check Your Data
**IndexedDB**: DevTools → Application → IndexedDB → `rag_embeddings` → `chunks`

**Google Sheets**:
```javascript
// Get spreadsheet ID
const id = localStorage.getItem('rag_spreadsheet_id');
console.log(`https://docs.google.com/spreadsheets/d/${id}`);
```

---

## 📋 API Endpoints

### Backend (Lambda)
- `GET /rag/user-spreadsheet` - Get/create user's RAG spreadsheet
- `POST /rag/embed-snippets` - Generate embeddings for snippets
- `POST /rag/embed-query` - Generate embedding for search query
- `POST /rag/sync-embeddings` - Push/pull embeddings to/from Google Sheets

### Request Examples

**Generate Embeddings**:
```javascript
POST /rag/embed-snippets
{
  "snippets": [
    {
      "id": "snippet-123",
      "content": "Your text content here",
      "title": "Optional title"
    }
  ],
  "force": false  // Optional: regenerate even if exists
}
```

**Search Query**:
```javascript
POST /rag/embed-query
{
  "query": "your search query"
}
```

**Sync to Sheets**:
```javascript
POST /rag/sync-embeddings
Headers: { Authorization: "Bearer YOUR_TOKEN" }
{
  "operation": "push",  // or "pull"
  "spreadsheetId": "YOUR_SPREADSHEET_ID",
  "chunks": [ /* array of chunks */ ]
}
```

---

## 🗄️ Data Structure

### IndexedDB Schema (Version 2)

**Database**: `rag_embeddings`

**Stores**:
1. **chunks** - Embedding vectors
   ```typescript
   {
     id: string;              // chunk UUID
     snippet_id: string;      // parent snippet ID
     chunk_text: string;      // text content
     embedding: number[];     // 1536 floats
     chunk_index: number;     // position in snippet
     embedding_model: string; // "text-embedding-3-small"
     created_at: string;      // ISO timestamp
   }
   ```

2. **metadata** - Snippet metadata
   ```typescript
   {
     snippet_id: string;
     created_at: number;
     updated_at: number;
     chunk_count: number;
   }
   ```

3. **search_cache** - Query embedding cache
   ```typescript
   {
     query: string;
     embedding: number[];
     model: string;
     created_at: number;
   }
   ```

### Google Sheets Schema

**Spreadsheet**: "Research Agent Swag" (in user's Drive)

**Sheet**: RAG_Embeddings_v1

**Columns**:
| Column | Type | Description |
|--------|------|-------------|
| id | string | Chunk UUID |
| snippet_id | string | Parent snippet ID |
| chunk_index | number | Position in snippet |
| chunk_text | string | Text content |
| embedding | JSON array | [0.123, -0.456, ...] (1536 floats) |
| embedding_model | string | "text-embedding-3-small" |
| created_at | ISO string | Timestamp |

---

## 🔍 Vector Search Algorithm

**Function**: `ragDB.vectorSearch(queryEmbedding, topK, threshold)`

**Parameters**:
- `queryEmbedding`: 1536-dim array from `/rag/embed-query`
- `topK`: Number of results (default: 5)
- `threshold`: Min similarity score 0-1 (default: 0.7)

**Process**:
1. Load all chunks from IndexedDB
2. Calculate cosine similarity for each chunk
3. Filter by threshold (>= 0.7)
4. Sort by score DESC
5. Return top K results

**Returns**:
```typescript
[
  {
    snippet_id: string;
    chunk_id: string;
    chunk_text: string;
    chunk_index: number;
    score: number;  // 0.0 - 1.0
  }
]
```

**Cosine Similarity**:
```
similarity = (A · B) / (||A|| × ||B||)
where:
  A · B = dot product
  ||A|| = magnitude of A
  ||B|| = magnitude of B
```

---

## 📊 Costs

**Embedding Model**: OpenAI text-embedding-3-small

**Pricing**: $0.02 per 1M tokens

**Estimates**:
- 1000 chars ≈ 250 tokens ≈ $0.000005
- 1000 snippets ≈ $0.005 (half a cent)
- 100K snippets ≈ $0.50

**Storage**:
- IndexedDB: ~1.5KB per chunk
- Google Sheets: ~2KB per row
- 1000 chunks: ~1.5MB IndexedDB + ~2MB Sheets

---

## 🐛 Troubleshooting

### Embeddings Not Syncing
**Check**:
1. Console for sync messages: `📤 Syncing X chunks...`
2. `localStorage.getItem('rag_spreadsheet_id')` exists
3. `localStorage.getItem('authToken')` exists
4. Network tab shows POST to `/rag/sync-embeddings`

**Fix**: Manually trigger sync:
```javascript
// Get chunks
const chunks = await ragDB.getAllChunks();

// Push to Sheets
await ragSyncService.pushEmbeddings(chunks, (curr, total) => {
  console.log(`${curr}/${total}`);
});
```

### Vector Search Returns Nothing
**Check**:
1. IndexedDB has chunks: DevTools → Application → IndexedDB
2. Query embedding generated: 1536 dimensions
3. Threshold not too high (try 0.5 instead of 0.7)

**Test**:
```javascript
const allChunks = await ragDB.getAllChunks();
console.log('Total chunks:', allChunks.length);
```

### Spreadsheet Not Created
**Check**:
1. Logged in with Google account
2. Console shows: `GET /rag/user-spreadsheet`
3. Drive API access granted

**Verify**:
```javascript
const id = localStorage.getItem('rag_spreadsheet_id');
if (!id) {
  console.error('No spreadsheet ID - check auth');
}
```

---

## 🎯 Next: Phase 6 Implementation

### Search UI Toggle
**File**: `ui-new/src/pages/SwagPage.tsx`

**Add**:
1. State: `const [searchQuery, setSearchQuery] = useState('')`
2. Input: Text field for search query
3. Button: "Vector Search"
4. Results: Display matching chunks

### Chat RAG Integration
**File**: `ui-new/src/pages/ChatPage.tsx` (or similar)

**Add**:
1. Checkbox: "Use RAG Context"
2. Before sending message:
   - Get query embedding
   - Search IndexedDB
   - Format results as context
   - Prepend to user message

---

## 📚 Documentation Files

- `RAG_BROWSER_FIRST_ARCHITECTURE.md` - Complete architecture plan
- `RAG_STATUS_OCT19.md` - Deployment status & details
- `RAG_AUTO_PUSH_COMPLETE.md` - Auto-push implementation
- `RAG_TESTING_GUIDE.md` - Test plan & procedures
- `RAG_QUICK_REFERENCE.md` - THIS FILE
- `test-rag-deployment.js` - Node.js test suite
- `test-rag-browser.js` - Browser console tests

---

## ✅ Quick Test Checklist

- [ ] Login to UI
- [ ] Create snippet with 500+ chars
- [ ] Generate embeddings ("Add To Search Index")
- [ ] Check console: "📤 Syncing X chunks..."
- [ ] Check console: "✅ Synced to Google Sheets"
- [ ] Verify IndexedDB has chunks
- [ ] Open Google Sheets, verify rows
- [ ] Test vector search in console

---

**Status**: Core RAG functionality complete and deployed ✅  
**Next**: Implement Search UI (Phase 6) → Test → Done!
