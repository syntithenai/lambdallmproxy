# Bug Fixes: Empty Image src + IndexedDB KeyPath Error

**Date**: 2025-10-19  
**Status**: Fixed + Debug Logging Added

---

## Issues Fixed

### 1. ✅ Empty Image src Warning (MarkdownRenderer.tsx)

**Error**:
```
An empty string ("") was passed to the src attribute. 
This may cause the browser to download the whole page again over the network.
```

**Root Cause**:
- Line 427 in `MarkdownRenderer.tsx` was rendering `<img src="">` when src was empty
- React complained because empty src causes unnecessary network requests

**Fix** (Line 424-442):
```tsx
img: ({ src, alt }) => {
  // Ensure src is a string and not empty
  const imgSrc = typeof src === 'string' && src.trim() !== '' ? src : null;
  
  // Don't render if no valid src
  if (!imgSrc) {
    return null;  // <-- Return null instead of rendering empty img
  }
  
  return (
    <img src={imgSrc} alt={alt || ''} />
  );
},
```

**Result**: Warning eliminated, no more empty img tags

---

### 2. 🔍 IndexedDB KeyPath Error (DEBUGGING ADDED)

**Error**:
```
Failed to generate embeddings: DataError: Failed to execute 'put' on 'IDBObjectStore': 
Evaluating the object store's key path did not yield a value.
    at ragDB.ts:135:21
```

**Root Cause**: 
Chunks being saved to IndexedDB are missing the required `id` field.

**IndexedDB Schema** (ragDB.ts:85):
```typescript
const chunksStore = db.createObjectStore(CHUNKS_STORE, { keyPath: 'id' });
//                                                         ^^^^^^^^^^
//                                                         Requires 'id' field
```

**Expected Chunk Structure**:
```typescript
interface EmbeddingChunk {
  id: string;              // <-- REQUIRED for IndexedDB keyPath
  snippet_id: string;
  chunk_text: string;
  embedding: number[];
  chunk_index: number;
  embedding_model: string;
  created_at: string;
}
```

**Backend Generates ID** (src/endpoints/rag.js:165):
```javascript
const chunksWithEmbeddings = chunks.map((chunk, index) => ({
    id: generateUUID(),  // <-- Backend creates this
    snippet_id: snippet.id,
    chunk_text: chunk.chunk_text,
    embedding: embeddingResults[index].embedding,
    // ... other fields
}));
```

**Problem**: The `id` field is being lost somewhere between:
1. Backend generates chunks with `id` ✅
2. Frontend receives JSON response ❓
3. Frontend saves to IndexedDB ❌ (id missing)

---

## Debug Logging Added

### Location 1: SwagContext.tsx (Line ~607)

**Purpose**: Check what backend returns

```typescript
const responseData = await response.json();
console.log('📦 Backend response:', {
  success: responseData.success,
  resultsCount: responseData.results?.length,
  firstResult: responseData.results?.[0],
  firstChunk: responseData.results?.[0]?.chunks?.[0],
  firstChunkKeys: responseData.results?.[0]?.chunks?.[0] 
    ? Object.keys(responseData.results[0].chunks[0]) 
    : []
});
```

**What to look for**:
- `firstChunk` should have an `id` field
- `firstChunkKeys` should include `'id'`

---

### Location 2: SwagContext.tsx (Line ~621)

**Purpose**: Check chunks before saving to IndexedDB

```typescript
if (result.status === 'success' && result.chunks.length > 0) {
  console.log('🔍 Chunk structure check:', {
    chunkCount: result.chunks.length,
    firstChunk: result.chunks[0],
    hasId: result.chunks[0]?.id !== undefined,
    hasSnippetId: result.chunks[0]?.snippet_id !== undefined
  });
  
  await ragDB.saveChunks(result.chunks, { ... });
}
```

**What to look for**:
- `hasId` should be `true`
- If `hasId` is `false`, the `id` was lost in response parsing

---

### Location 3: ragDB.ts (Line ~207)

**Purpose**: Check what saveChunks receives

```typescript
async saveChunks(chunks: EmbeddingChunk[], metadata?: ChunkMetadata): Promise<void> {
  // Debug: Log chunk structure
  console.log('💾 saveChunks called with:', {
    chunkCount: chunks.length,
    firstChunk: chunks[0],
    firstChunkKeys: chunks[0] ? Object.keys(chunks[0]) : [],
    hasId: chunks[0]?.id !== undefined
  });
  
  // ...
}
```

**What to look for**:
- `firstChunkKeys` should include `'id'`
- If `id` is missing here, issue is in SwagContext
- If `id` is present here but put() fails, issue is in IndexedDB schema

---

## Testing Instructions

### 1. Clear Browser Cache (Important!)

IndexedDB might be in a bad state. Clear it:

```javascript
// Open browser console
indexedDB.deleteDatabase('rag_embeddings');
// Refresh page
location.reload();
```

### 2. Create Test Snippet

1. Go to SWAG page
2. Add snippet with content: "Test embedding generation"
3. Click bulk dropdown → "Generate Embeddings (Force)"

### 3. Check Console Output

You should see 3 debug logs:

**Log 1** (Backend response):
```
📦 Backend response: {
  success: true,
  resultsCount: 1,
  firstChunk: { id: "abc-123-xyz", snippet_id: "...", ... },
  firstChunkKeys: ["id", "snippet_id", "chunk_text", "embedding", ...]
}
```

**Log 2** (Before IndexedDB):
```
🔍 Chunk structure check: {
  chunkCount: 2,
  firstChunk: { id: "abc-123-xyz", ... },
  hasId: true,
  hasSnippetId: true
}
```

**Log 3** (In saveChunks):
```
💾 saveChunks called with: {
  chunkCount: 2,
  firstChunk: { id: "abc-123-xyz", ... },
  firstChunkKeys: ["id", "snippet_id", ...],
  hasId: true
}
```

### 4. Analyze Results

| Scenario | Log 1 `hasId` | Log 2 `hasId` | Log 3 `hasId` | Conclusion |
|----------|---------------|---------------|---------------|------------|
| ✅ All true | ✅ | ✅ | ✅ | Backend + Frontend working, check IndexedDB schema |
| ❌ Log 1 false | ❌ | ❌ | ❌ | **Backend not generating id** → Fix backend |
| ❌ Log 2 false | ✅ | ❌ | ❌ | **JSON parsing issue** → Check response.json() |
| ❌ Log 3 false | ✅ | ✅ | ❌ | **TypeScript interface mismatch** → Check types |
| ✅ All true but error | ✅ | ✅ | ✅ | **IndexedDB schema issue** → Delete DB and retry |

---

## Possible Root Causes

### Hypothesis 1: Backend Not Generating UUID

**Check**: Look at Log 1 - `firstChunkKeys`

**If true**: 
- `id` not in array
- Fix: Check `src/endpoints/rag.js:165` - ensure `generateUUID()` is imported

**Solution**:
```javascript
// At top of rag.js
const { v4: generateUUID } = require('uuid');

// In chunksWithEmbeddings
id: generateUUID(),  // Make sure this line exists
```

---

### Hypothesis 2: JSON Response Stripping Fields

**Check**: Compare Log 1 vs Log 2

**If true**:
- Log 1 has `id`
- Log 2 missing `id`
- Issue in destructuring or mapping

**Solution**: Check if chunks are being mapped/transformed in SwagContext

---

### Hypothesis 3: TypeScript Type Mismatch

**Check**: Log 3 `firstChunkKeys`

**If true**:
- Chunks have `id` but wrong type
- TypeScript silently dropping field

**Solution**: Check `EmbeddingChunk` interface matches backend response

---

### Hypothesis 4: Stale IndexedDB Schema

**Check**: All logs show `id` present, but put() still fails

**If true**:
- Database created with old schema (keyPath: 'chunk_id')
- New data has `id` field
- Mismatch causes error

**Solution**:
```javascript
// Clear database
indexedDB.deleteDatabase('rag_embeddings');

// Refresh page
location.reload();

// Try embedding again
```

---

## Files Modified

### 1. `/ui-new/src/components/MarkdownRenderer.tsx`

**Lines**: 424-442  
**Change**: Added null check for empty src, return null instead of rendering

```diff
  img: ({ src, alt }) => {
-   const imgSrc = typeof src === 'string' ? src : '';
+   const imgSrc = typeof src === 'string' && src.trim() !== '' ? src : null;
+   
+   if (!imgSrc) {
+     return null;
+   }
    
    return (
      <img src={imgSrc} ... />
    );
  },
```

---

### 2. `/ui-new/src/contexts/SwagContext.tsx`

**Lines**: ~607-613  
**Change**: Added debug logging after JSON parse

```diff
- const { success, results, error } = await response.json();
+ const responseData = await response.json();
+ console.log('📦 Backend response:', { ... });
+ const { success, results, error } = responseData;
```

**Lines**: ~621-630  
**Change**: Added debug logging before saveChunks

```diff
  if (result.status === 'success' && result.chunks.length > 0) {
+   console.log('🔍 Chunk structure check:', { ... });
    await ragDB.saveChunks(result.chunks, { ... });
  }
```

---

### 3. `/ui-new/src/utils/ragDB.ts`

**Lines**: ~207-216  
**Change**: Added debug logging in saveChunks method

```diff
  async saveChunks(chunks: EmbeddingChunk[], metadata?: ChunkMetadata): Promise<void> {
    await this.init();
    
+   console.log('💾 saveChunks called with:', {
+     chunkCount: chunks.length,
+     firstChunk: chunks[0],
+     firstChunkKeys: chunks[0] ? Object.keys(chunks[0]) : [],
+     hasId: chunks[0]?.id !== undefined
+   });
    
    return new Promise((resolve, reject) => {
```

**Lines**: ~227-233  
**Change**: Added try-catch around put() operation

```diff
  const chunksStore = transaction.objectStore(CHUNKS_STORE);
  for (const chunk of chunks) {
+   try {
      chunksStore.put(chunk);
+   } catch (putError) {
+     console.error('❌ Error putting chunk:', { chunk, error: putError });
+     throw putError;
+   }
  }
```

---

## Next Steps

1. **User tests embedding generation** with debug logs enabled
2. **User shares console output** showing the 3 debug logs
3. **Analyze logs** to pinpoint where `id` is lost
4. **Apply targeted fix** based on analysis
5. **Remove debug logging** after fix confirmed

---

## Expected Outcome

After user provides debug logs, we can determine:

1. ✅ If backend is generating `id` correctly
2. ✅ If JSON parsing preserves all fields
3. ✅ If IndexedDB schema matches data structure
4. ✅ Exact line where `id` field disappears

Then apply surgical fix to resolve the IndexedDB error permanently.

---

**Status**: Awaiting user test results with debug output  
**ETA**: 5 minutes to diagnose once logs provided  
**Impact**: Blocks RAG embedding generation feature
