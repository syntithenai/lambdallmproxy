# Quick Start: Testing Search Auto-Save Feature

## What Changed

✅ **Tool messages now stored in chat history**
- Every tool execution (search_web, execute_js, scrape_url) creates a purple tool message
- Messages are expandable to see full details

✅ **Search results automatically populate Searches tab**
- When LLM uses search_web tool, results are extracted
- Results saved to localStorage (7-day cache)
- Results appear instantly in Searches tab

## How to Test

### 1. Quick Test (30 seconds)
```bash
# Open application
http://localhost:8081

# Steps:
1. Click "Chat" tab
2. Check "Web Search" checkbox
3. Type: "What's the latest AI news?"
4. Click "Send"
5. Wait for response
6. Observe: Purple tool message appears (🔧 search_web)
7. Click: "Searches" tab
8. Verify: Search results are displayed
```

### 2. Verify Tool Message Storage
```
In Chat tab:
- Look for purple message box
- Should say: "🔧 search_web ▼ Expand"
- Click "▼ Expand"
- Should show: Call ID and full JSON result
```

### 3. Verify Searches Tab Population
```
In Searches tab:
- Should see: "AI news" (or similar query)
- Should list: Multiple search results
- Each result has: Title, snippet, link
- Links are clickable
```

### 4. Verify Persistence
```
1. Perform search
2. Refresh page (F5)
3. Check Chat tab: Tool messages restored
4. Check Searches tab: Search results still there
```

## What to Look For

### ✅ Success Indicators
- Purple tool message in Chat
- Tool message is expandable/collapsible
- Search results in Searches tab
- Results persist after refresh
- Multiple searches accumulate
- No console errors

### ❌ Failure Indicators
- No tool message appears (only green status)
- Tool message not expandable
- Searches tab empty after search
- Results disappear on refresh
- Console errors about localStorage
- Duplicate searches (same query multiple times)

## Technical Details

### Data Flow
```
User Question
    ↓
LLM decides to search
    ↓
Backend executes search
    ↓
SSE Event: tool_call_result
    ↓
ChatTab.tsx handles event:
    1. Creates tool message → adds to messages array
    2. Extracts search data → saves to cache
    3. Adds to SearchResultsContext → triggers SearchTab update
    ↓
Results visible in:
    - Chat tab (tool message)
    - Searches tab (formatted results)
```

### Storage Locations
1. **React State**: `messages` array in ChatTab
2. **localStorage**: `llm_proxy_search_cache` key
3. **Context API**: SearchResultsContext shared state

### Files Modified
- `ui-new/src/components/ChatTab.tsx`
  - Line 264-291: tool_call_result handler
  - Added: Tool message creation
  - Added: Console log for debugging

## Debug Commands

```bash
# Check build output
cat output.txt

# Verify tool message code
grep -A10 "tool_call_result" ui-new/src/components/ChatTab.tsx

# Check localStorage in browser console
localStorage.getItem('llm_proxy_search_cache')
localStorage.getItem('chat_messages')

# Clear cache if needed
localStorage.removeItem('llm_proxy_search_cache')
localStorage.removeItem('chat_messages')
```

## Common Issues

### Issue: Tool message appears but Searches tab empty
**Cause**: extractAndSaveSearchResult() might be failing to parse JSON  
**Debug**: Open browser console, look for errors  
**Fix**: Check tool result format matches expected structure

### Issue: Searches tab shows results but they disappear on refresh
**Cause**: localStorage not saving  
**Debug**: Check localStorage quota, check for errors  
**Fix**: Clear some old data, check browser permissions

### Issue: Multiple identical searches appear
**Cause**: Deduplication not working (shouldn't happen)  
**Debug**: Check SearchResultsContext addSearchResult()  
**Fix**: Verify query.toLowerCase() is used as key

### Issue: Tool message not expandable
**Cause**: expandedToolMessages state not updating  
**Debug**: Check React DevTools for state changes  
**Fix**: Verify Set operations in expand/collapse handler

## Expected Console Output

```
SSE Event: tool_call_start {id: "call_123", name: "search_web"}
SSE Event: tool_call_progress {id: "call_123", name: "search_web"}
SSE Event: tool_call_result {id: "call_123", name: "search_web", content: "{...}"}
Search result added to SearchTab: {query: "AI news", results: [...]}
```

## Performance Notes

- **Bundle size**: 247.77 kB (increased by 0.15 kB)
- **Build time**: ~1 second
- **Runtime overhead**: Minimal (localStorage writes are async)
- **Memory**: One tool message per tool call (small footprint)
- **Cache limit**: ~5-10MB localStorage (thousands of searches)

## Next Steps After Testing

If everything works:
1. ✅ Commit changes
2. ✅ Deploy to production
3. ✅ Update user documentation
4. ✅ Consider adding toast notification: "Search saved!"

If issues found:
1. ❌ Check browser console for errors
2. ❌ Verify SSE events in Network tab
3. ❌ Check localStorage contents
4. ❌ Review tool result JSON structure
5. ❌ Test with different search queries

---

**Quick Verification Checklist**:
- [ ] Build successful (no errors)
- [ ] Server running on port 8081
- [ ] Chat tab loads without errors
- [ ] Web Search checkbox works
- [ ] Tool message appears (purple box)
- [ ] Tool message expandable
- [ ] Searches tab shows results
- [ ] Results persist after refresh
- [ ] Filter works in Searches tab
- [ ] No console errors

**Status**: ✅ Ready for testing!  
**URL**: http://localhost:8081
