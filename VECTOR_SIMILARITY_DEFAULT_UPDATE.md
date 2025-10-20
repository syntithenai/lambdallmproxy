# Vector Similarity Default Threshold Update

## Change Summary

Updated the default vector similarity threshold from **0.5 to 0.3** across the UI to improve recall in both RAG context matching and Swag page search.

## Rationale

A lower threshold (0.3) provides better recall by including more semantically similar results, while still filtering out completely irrelevant content. This is particularly important for:
- Finding relevant documentation chunks for RAG context
- Discovering related snippets in the Swag page search
- Ensuring the system doesn't miss potentially useful context

## Files Modified

### 1. `ui-new/src/components/ChatTab.tsx` (Line 238)

**Before:**
```typescript
const [ragThreshold, setRagThreshold] = useState(0.5); // Default to 0.5 (lowered for better recall)
```

**After:**
```typescript
const [ragThreshold, setRagThreshold] = useState(0.3); // Default to 0.3 (relaxed for better recall)
```

**Impact:** 
- Automatic RAG context chunks sent with chat requests now use 0.3 threshold by default
- Users can still override this in RAG Settings if they want stricter matching
- Affects the `ragDB.vectorSearch()` call at line 1654

### 2. `ui-new/src/components/SwagPage.tsx` (Line 773)

**Before:**
```typescript
// Get threshold from settings, default to 0.5 (lowered from 0.6 for better recall)
const ragConfig = JSON.parse(localStorage.getItem('rag_config') || '{}');
const threshold = ragConfig.similarityThreshold ?? 0.5;
```

**After:**
```typescript
// Get threshold from settings, default to 0.3 (relaxed for better recall)
const ragConfig = JSON.parse(localStorage.getItem('rag_config') || '{}');
const threshold = ragConfig.similarityThreshold ?? 0.3;
```

**Impact:**
- Vector search in the Swag page now defaults to 0.3 threshold
- Returns more semantically similar snippets in search results
- Still respects user's custom threshold from RAG Settings

## Existing Default in RAG Settings

Note: The RAG Settings component (`ui-new/src/components/RAGSettings.tsx`) already had 0.3 as the default (line 27):

```typescript
similarityThreshold: 0.3, // Lowered from 0.5 for better recall
```

This change brings the runtime defaults in ChatTab and SwagPage into alignment with the configuration default.

## Behavior

### Before Change:
- RAG context matching: 0.5 threshold (unless user configured otherwise)
- Swag page vector search: 0.5 threshold (unless user configured otherwise)
- RAG Settings UI: 0.3 default for new configurations

### After Change:
- ✅ RAG context matching: **0.3 threshold** (unless user configured otherwise)
- ✅ Swag page vector search: **0.3 threshold** (unless user configured otherwise)  
- ✅ RAG Settings UI: 0.3 default (unchanged)
- ✅ All three locations now consistent at 0.3

## User Override

Users can still customize the threshold in **RAG Settings** (Settings → RAG Settings):
- Slider range: 0.0 to 1.0
- Saved to localStorage as `rag_config.similarityThreshold`
- Applies to both chat context matching and Swag page search

## Testing

To verify the change:

1. **Chat RAG Context:**
   - Enable RAG context in chat settings
   - Send a message
   - Check browser console for: `🔍 RAG search with threshold: 0.3`

2. **Swag Page Vector Search:**
   - Go to Swag page
   - Switch to "Vector Search" mode
   - Enter a search query
   - Check browser console for: `🔍 Vector search with threshold: 0.3, query: "..."`

3. **Custom Threshold:**
   - Go to RAG Settings
   - Adjust similarity threshold slider
   - Verify both chat and search respect the custom value

## Status

✅ **COMPLETE** - Default threshold updated to 0.3 in both locations
