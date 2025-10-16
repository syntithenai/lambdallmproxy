# SWAG Google Docs List Caching

## Problem
When opening the SWAG page, the screen would flash and show a "Processing..." loading overlay every time the page loaded. This was caused by the `loadGoogleDocs()` function fetching the list of Google Documents from the API on every page mount, even though the list rarely changes.

## Solution
Implemented localStorage caching for the Google Docs list to eliminate unnecessary API calls and loading flashes.

### Key Changes

#### 1. Initialize from Cache
The `googleDocs` state now initializes from localStorage cache on mount:

```typescript
const [googleDocs, setGoogleDocs] = useState<GoogleDoc[]>(() => {
  // Initialize from localStorage cache
  try {
    const cached = localStorage.getItem('swag-google-docs-cache');
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('Failed to load Google Docs cache:', error);
  }
  return [];
});
```

#### 2. Conditional Loading
Only fetch from Google Drive API if:
- No cached data exists
- Documents haven't been loaded yet

```typescript
useEffect(() => {
  initGoogleAuth().catch(console.error);
  // Only load Google Docs from API if we don't have cached data
  if (googleDocs.length === 0 && !docsLoaded) {
    loadGoogleDocs();
  }
}, []);
```

#### 3. Cache Updates on Load
After successfully loading documents from the API, cache them:

```typescript
const loadGoogleDocs = async (force = false) => {
  // Skip if already loaded and not forcing refresh
  if (docsLoaded && !force) {
    return;
  }
  
  try {
    setLoading(true);
    const docs = await listGoogleDocs();
    setGoogleDocs(docs);
    setDocsLoaded(true);
    
    // Cache the results in localStorage
    try {
      localStorage.setItem('swag-google-docs-cache', JSON.stringify(docs));
    } catch (error) {
      console.error('Failed to cache Google Docs:', error);
    }
  } catch (error) {
    console.error('Failed to load Google Docs:', error);
    showError('Failed to load Google Docs. Please try again.');
  } finally {
    setLoading(false);
  }
};
```

#### 4. Immediate Cache Updates on Document Creation
When creating a new document, immediately update the cache:

```typescript
const handleCreateDoc = async () => {
  // ... validation ...
  
  try {
    setLoading(true);
    const doc = await createGoogleDocInFolder(newDocName);
    const updatedDocs = [doc, ...googleDocs];
    setGoogleDocs(updatedDocs);
    
    // Update cache immediately when creating a document
    try {
      localStorage.setItem('swag-google-docs-cache', JSON.stringify(updatedDocs));
    } catch (error) {
      console.error('Failed to update Google Docs cache:', error);
    }
    
    // ... success handling ...
  }
};
```

The same pattern is applied in `handleBulkOperation` for the 'new-doc' case.

## Behavior

### Before Changes
1. User opens SWAG page
2. Screen shows loading overlay: "Processing..."
3. API call to Google Drive: `listGoogleDocs()`
4. Documents list appears after ~1-2 seconds
5. **This happened EVERY TIME the page loaded**

### After Changes
1. User opens SWAG page
2. Documents list appears **instantly** from cache (no loading flash)
3. API call only happens:
   - First time ever opening SWAG
   - After clearing browser storage
   - When explicitly refreshing (future enhancement)
4. Cache automatically updates when:
   - Creating a new document
   - First successful API load

## Benefits

1. **No Loading Flash**: Documents appear instantly from cache
2. **Better UX**: No jarring loading overlay on every page visit
3. **Reduced API Calls**: Only fetch when necessary
4. **Offline-Friendly**: Cached documents available even if API temporarily fails
5. **Automatic Updates**: Cache refreshes when creating new documents

## Cache Storage

- **Key**: `swag-google-docs-cache`
- **Format**: JSON array of `GoogleDoc` objects
- **Location**: localStorage
- **Persistence**: Survives page reloads, cleared with browser storage

### GoogleDoc Type
```typescript
interface GoogleDoc {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  createdTime: string;
  modifiedTime: string;
}
```

## Future Enhancements

### Manual Refresh Button
Add a refresh button to manually reload the document list when needed:

```typescript
<button onClick={() => loadGoogleDocs(true)}>
  Refresh Documents
</button>
```

### Cache Invalidation
Consider invalidating cache after a certain time period:

```typescript
interface CachedData {
  docs: GoogleDoc[];
  timestamp: number;
}

const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// On load
const cached = localStorage.getItem('swag-google-docs-cache');
if (cached) {
  const data: CachedData = JSON.parse(cached);
  if (Date.now() - data.timestamp < CACHE_EXPIRY) {
    return data.docs;
  }
}
```

### Cache Document Details
Could extend to cache document metadata or previews for even better performance.

## Files Modified

- `ui-new/src/components/SwagPage.tsx`
  - Added localStorage cache initialization for `googleDocs` state
  - Added `docsLoaded` state flag to prevent duplicate loads
  - Modified `loadGoogleDocs()` to cache results and check loaded flag
  - Modified `handleCreateDoc()` to update cache on document creation
  - Modified `handleBulkOperation()` 'new-doc' case to update cache

## Testing

### Test Scenarios

1. **First Load**
   - Clear browser cache
   - Open SWAG page
   - Should see loading (only once)
   - Documents appear

2. **Subsequent Loads**
   - Refresh page or navigate away and back
   - Documents appear **instantly** (no loading)
   - No API call made

3. **Create Document**
   - Create a new document
   - New document appears in list
   - Refresh page
   - New document still appears (cached)

4. **Cache Persistence**
   - Load SWAG page
   - Close browser completely
   - Reopen browser and load SWAG page
   - Documents still appear instantly

### Verification
```javascript
// In browser console
localStorage.getItem('swag-google-docs-cache')
// Should show JSON array of documents
```

## Related Issues

- User reported: "when i open the swag, the screen flashes and shows a loading message"
- Related to Google Drive integration in SWAG
- Improves overall SWAG performance and UX

## Implementation Date
October 15, 2025

---

**Status**: ✅ Complete
**Build**: ✅ Passing
**Cache Strategy**: localStorage with automatic updates on creation
