# Quick Test: Search Visibility Management

## What Changed

✅ **New Chat now clears visible search results**
✅ **Search results automatically appear when LLM uses search_web**
✅ **Smart detection of page load vs. intentional clear**

## How to Test (2 minutes)

### Test 1: New Chat Clears Searches
```
1. Open http://localhost:8081
2. Go to Chat tab
3. Enable "Web Search" checkbox
4. Ask: "What's the weather in London?"
5. Wait for response
6. Check Searches tab → Should see search results ✅
7. Go back to Chat tab
8. Click "🗑️ New Chat" button
9. Check Searches tab → Should be EMPTY ✅
```

### Test 2: New Searches Appear
```
1. After clearing (from Test 1)
2. Chat tab: Ask "What's the capital of France?"
3. Wait for response
4. Check Searches tab → Should see NEW search ✅
5. Old "London weather" search should NOT be there ✅
```

### Test 3: Page Refresh Preserves Results
```
1. After Test 2, you should have search results visible
2. Press F5 to refresh page
3. Check Searches tab → Results should still be there ✅
4. This is expected: refresh keeps the session alive
```

### Test 4: Multiple Searches Accumulate
```
1. Start fresh or continue from previous
2. Ask 3 questions that trigger searches:
   - "What is Python?"
   - "What is JavaScript?"
   - "What is Rust?"
3. Check Searches tab → Should see all 3 searches ✅
4. Click "New Chat"
5. Check Searches tab → Should be empty ✅
```

## Expected Behavior Summary

| Action | Searches Tab |
|--------|--------------|
| **Page Load** | Shows saved results from localStorage |
| **New Search** | Adds result to visible list |
| **New Chat** | CLEARS all visible results |
| **Page Refresh** | Keeps results (session continues) |

## Technical Details

### Files Modified
1. `SearchResultsContext.tsx` - Added `wasCleared` flag
2. `ChatTab.tsx` - Call `clearSearchResults()` on new chat
3. `SearchTab.tsx` - Sync with `wasCleared` flag

### Why wasCleared Flag?

**Problem**: How to distinguish between:
- **Initial state** (page load, context empty) → Keep localStorage results
- **Intentional clear** (new chat) → Clear visible results

**Solution**: `wasCleared` boolean flag
- `false` on page load → SearchTab keeps localStorage results
- `true` on new chat → SearchTab clears visible results
- Reset to `false` when adding new results

### State Flow

```
Page Load:
  contextResults: []
  wasCleared: false
  SearchTab: Load from localStorage ✅

New Chat:
  contextResults: [] (cleared)
  wasCleared: true (set)
  SearchTab: Clear results ✅

New Search:
  addSearchResult() called
  wasCleared: false (reset)
  contextResults: [result]
  SearchTab: Show result ✅
```

## Debugging

### Check Context State (Browser Console)
```javascript
// Open React DevTools
// Find SearchResultsProvider
// Check state:
// - searchResults: [] or [{query, results}, ...]
// - wasCleared: true or false
```

### Check localStorage
```javascript
// Browser console
localStorage.getItem('search_results')  // Visible results
localStorage.getItem('llm_proxy_search_cache')  // Long-term cache
localStorage.getItem('chat_messages')  // Chat history
```

### Console Logs
Look for:
```
Search result added to SearchTab: {query: "...", results: [...]}
```

## Common Issues

### Issue: Searches tab empty after page refresh
**Expected**: This is correct if you clicked "New Chat" before refreshing
**Solution**: Perform a new search to populate

### Issue: Old searches still visible after New Chat
**Cause**: Bug (shouldn't happen)
**Debug**: 
1. Check if `clearSearchResults` is called (add console.log)
2. Check `wasCleared` flag in React DevTools
3. Check SearchTab useEffect is triggering

### Issue: Searches disappear on page load
**Cause**: localStorage might be cleared or corrupted
**Solution**: 
1. Check localStorage in console
2. Perform new searches to repopulate

## Performance

- **Bundle size**: 247.88 kB (increase: 0.06 kB)
- **Build time**: 1.11s
- **Runtime overhead**: Negligible (one boolean flag check)
- **localStorage**: Still cached for performance (not cleared)

## Success Criteria

✅ New chat clears visible searches  
✅ New searches auto-appear in Searches tab  
✅ Page refresh preserves results  
✅ Multiple searches accumulate correctly  
✅ No console errors  
✅ Clean separation between chat sessions  

---

**Status**: ✅ Ready for testing  
**URL**: http://localhost:8081  
**Build**: index-je7s85Fb.js (247.88 kB)
