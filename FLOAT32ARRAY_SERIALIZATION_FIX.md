# Float32Array Serialization Bug Fix

**Date:** 2025-10-19  
**Issue:** Embeddings were showing as empty (`embeddingLength: 0`) when returned from backend  
**Root Cause:** Float32Array doesn't serialize properly to JSON

## Problem

When generating embeddings, the backend was returning chunks with empty embedding arrays:

```
🔍 Putting chunk: {
  hasId: true,
  idValue: 'b88dfc1d-c491-4252-a90f-1358b0affc04',
  snippetId: 'snippet-1760868752963-0lipk88wh',
  chunkIndex: 0,
  embeddingLength: 0,  // ❌ Empty!
  ...
}
```

This caused IndexedDB saves to fail with:
```
DataError: Failed to execute 'put' on 'IDBObjectStore': Evaluating the object store's key path did not yield a value.
```

## Root Cause

In `src/rag/embeddings.js`, the OpenAI batch embedding function was returning `Float32Array`:

```javascript
// Line 295
embedding: new Float32Array(item.embedding),
```

**Float32Array objects don't serialize to JSON properly** - they become empty objects or get stripped out during JSON.stringify().

## Fix

**File:** `src/endpoints/rag.js` (Line 165)

Changed:
```javascript
embedding: embeddingResults[index].embedding, // Float32Array - doesn't serialize!
```

To:
```javascript
embedding: Array.from(embeddingResults[index].embedding), // Regular array - serializes correctly
```

## Files Modified

1. **src/endpoints/rag.js** - Convert Float32Array to array before sending response
2. **ui-new/src/contexts/SwagContext.tsx** - Added more detailed logging to inspect embedding data
3. **test-embedding-api.js** - New test script to validate embedding API responses

## Testing

After deployment:
1. Generate embeddings for a snippet
2. Check console logs show:
   - `embeddingLength: 1536` (or appropriate dimension)
   - `embeddingType: 'Array'`
   - `firstChunkEmbeddingFirst5: [0.123, -0.456, ...]` (actual numbers)
3. Verify IndexedDB saves successfully
4. No "No items were added to search index" message

## Related Issues

- **INDEXEDDB_KEYPATH_FIX.md** - Fixed chunk ID generation
- **EMBEDDING_DEBUG_FIXES.md** - Added diagnostic logging
- This completes the embedding pipeline fixes

## Prevention

- Always use `Array.from()` when serializing TypedArrays to JSON
- Add TypeScript type checking to catch TypedArray vs Array[] mismatches
- Test JSON serialization in API endpoints with `JSON.parse(JSON.stringify(data))`
