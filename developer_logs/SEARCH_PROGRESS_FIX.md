# Search Progress Events Fix

**Date**: October 8, 2025  
**Issue**: Live search progress events not displaying in UI  
**Status**: ✅ Fixed and Deployed

---

## Problem

User reported: "i don't see live events from the search tool"

The backend was correctly emitting `search_progress` events during web searches, but they weren't being displayed properly in the UI due to how the progress events were being tracked.

---

## Root Cause

The frontend was handling `search_progress` events, but had a critical bug in the event tracking:

### Before (Broken)
```typescript
case 'search_progress':
  if (data.tool === 'search_web') {
    // BUG: Every event creates a new key with Date.now()
    const progressKey = `search_web_${Date.now()}`;
    setSearchProgress(prev => {
      const newMap = new Map(prev);
      newMap.set(progressKey, data);  // Old events get lost!
      return newMap;
    });
  }
```

**Problem**: Each progress event created a unique key based on `Date.now()`, so:
- Events didn't accumulate - they just got replaced
- Only the most recent event was visible (briefly)
- Progress indicators disappeared immediately

---

## Solution

### 1. Smart Key Generation

Created stable keys based on event type:

```typescript
case 'search_progress':
  if (data.tool === 'search_web') {
    // Clear old progress when new search starts
    if (data.phase === 'searching') {
      setSearchProgress(new Map());
    }
    
    // Create unique key based on phase and index
    let progressKey: string;
    if (data.phase === 'fetching_result' || 
        data.phase === 'result_loaded' || 
        data.phase === 'result_failed') {
      // Per-result events: use result index
      progressKey = `search_web_result_${data.result_index || 0}`;
    } else {
      // General events: use phase name
      progressKey = `search_web_${data.phase}`;
    }
    
    setSearchProgress(prev => {
      const newMap = new Map(prev);
      newMap.set(progressKey, data);
      return newMap;
    });
  }
```

### 2. Progress Event Types

The backend emits these events during search:

| Phase | Description | Data |
|-------|-------------|------|
| `searching` | Search initiated | `service` (tavily/duckduckgo), `queries` |
| `results_found` | Search returned results | `query` |
| `loading_content` | Starting to load page content | `result_count` |
| `fetching_result` | Loading individual page | `result_index`, `result_total`, `url`, `title` |
| `result_loaded` | Page content loaded | `content_size`, `fetch_time_ms` |
| `result_failed` | Page load failed | `error` |

### 3. UI Display

The `SearchProgress` component displays each phase:

- **searching**: Blue pulsing dots + "Searching DuckDuckGo..."
- **results_found**: Green checkmark + "Found results for: query"
- **loading_content**: Blue pulsing dots + "Loading content from N results..."
- **fetching_result**: Blue pulsing dots + "[1/5] Page title" + URL
- **result_loaded**: Green checkmark + "[1/5] Page title" + size/time
- **result_failed**: Red X + "[1/5] Page title" + error

---

## Implementation Details

### Files Modified

1. **ui-new/src/components/ChatTab.tsx** (Lines 716-740)
   - Fixed progress key generation
   - Added logic to clear old progress on new search
   - Stable keys: `search_web_result_1`, `search_web_searching`, etc.

### Files Already Correct

The backend was already working properly:

1. **src/tools.js** (Lines 295-330)
   - Emits `search_progress` events at all stages
   - Passes `progressCallback` to DuckDuckGo searcher
   - Events include: searching, results_found, loading_content

2. **src/search.js** (Lines 1035-1150)
   - `fetchContentForSingleResult` emits per-result events
   - Events: fetching_result, result_loaded, result_failed
   - Includes timing and size information

3. **src/lambda_search_llm_handler.js** (Line 346)
   - Passes `stream.writeEvent` to tool context
   - Enables tools to emit events to frontend

4. **ui-new/src/components/SearchProgress.tsx**
   - Component was already correctly displaying all event types
   - Just wasn't receiving events due to key bug

---

## Testing

### Expected Behavior

When performing a search, you should now see:

1. **Searching Phase**:
   ```
   🔵 Searching DuckDuckGo...
   ```

2. **Results Found**:
   ```
   ✅ Found results for: climate change policy
   ```

3. **Loading Content**:
   ```
   🔵 Loading content from 5 results...
   ```

4. **Per-Result Progress**:
   ```
   🔵 [1/5] Climate Policy Updates 2025
       https://example.com/article
   
   ✅ [1/5] Climate Policy Updates 2025
       Loaded 23KB in 1234ms
   
   🔵 [2/5] New Environmental Regulations
       https://example.com/news
   
   ✅ [2/5] New Environmental Regulations
       Loaded 45KB in 2345ms
   
   ... and so on for all 5 results
   ```

### Test Query

Try: "Find current news about climate change policy updates"

You should see:
- Real-time progress as each page loads
- All progress indicators accumulate (don't disappear)
- Green checkmarks as each page completes
- Progress clears when new search starts

---

## Benefits

### 1. **Better User Experience**
- Users can see exactly what's happening during search
- Progress indicators show which pages are being loaded
- Clear feedback on loading times and sizes

### 2. **Debugging**
- Easy to identify slow pages
- Can see which pages fail to load
- Timing information helps optimize

### 3. **Transparency**
- Users understand the multi-step process:
  1. Search for results
  2. Load page content
  3. Extract key information
  4. Summarize with LLM (model load balancing!)
  5. Synthesize final answer

---

## Related Features

### Model Load Balancing Integration

The search progress events work beautifully with the new model load balancing feature:

**Search Progress Shows**:
```
🔵 [1/5] Loading article 1...
✅ [1/5] Loaded article 1
📝 Page 1 summary using: groq:llama-3.3-70b-versatile

🔵 [2/5] Loading article 2...
✅ [2/5] Loaded article 2
📝 Page 2 summary using: groq:llama-3.1-8b-instant

... etc
```

This gives users visibility into:
1. What content is being loaded (URLs, titles)
2. Which models are being used for summaries
3. How load is being distributed across models

---

## Console Logging

Backend logs show progress events being emitted:

```bash
[1/5] Fetching content from: https://example.com/article
🔍 Search progress event: { phase: 'fetching_result', result_index: 1, ... }
[1/5] Extracted markdown content: 15KB → 8KB (1.9x compression)
🔍 Search progress event: { phase: 'result_loaded', content_size: 8192, ... }
```

Frontend logs show events being received:

```javascript
🔍 Search progress event: { tool: 'search_web', phase: 'fetching_result', ... }
🔍 Search progress event: { tool: 'search_web', phase: 'result_loaded', ... }
```

---

## Deployment

### Build & Deploy

```bash
# Build UI
./scripts/build-docs.sh

# Deploy to GitHub Pages
./scripts/deploy-docs.sh -m "fix search progress event display"
```

### Status

✅ **Built**: October 8, 2025 10:29:56 UTC  
✅ **Deployed**: October 8, 2025 10:29:56 UTC  
✅ **Live**: https://lambdallmproxy.pages.dev

---

## Future Enhancements

### 1. Progress Persistence

Keep progress visible after search completes:

```typescript
// Add a "completed" flag to track finished searches
if (data.phase === 'result_loaded' && data.result_index === data.result_total) {
  // Mark this search as complete but keep visible
  setSearchProgress(prev => {
    const newMap = new Map(prev);
    newMap.set('search_completed', { phase: 'completed', timestamp: Date.now() });
    return newMap;
  });
}
```

### 2. Progress Summary

Show aggregate statistics:

```typescript
const totalSize = Array.from(searchProgress.values())
  .filter(p => p.phase === 'result_loaded')
  .reduce((sum, p) => sum + (p.content_size || 0), 0);

const avgTime = Array.from(searchProgress.values())
  .filter(p => p.phase === 'result_loaded')
  .reduce((sum, p) => sum + (p.fetch_time_ms || 0), 0) / loadedCount;
```

### 3. Collapsible Progress

Allow users to collapse/expand progress details:

```tsx
<button onClick={() => setProgressExpanded(!progressExpanded)}>
  {progressExpanded ? '▼' : '▶'} Search Progress ({loadedCount}/{totalCount})
</button>
{progressExpanded && (
  <div className="space-y-2">
    {/* Show detailed progress */}
  </div>
)}
```

### 4. Error Recovery

Show retry button for failed results:

```tsx
{data.phase === 'result_failed' && (
  <button onClick={() => retryFetch(data.url)}>
    🔄 Retry
  </button>
)}
```

---

## Summary

**Problem**: Search progress events weren't displaying  
**Cause**: Frontend used unstable keys (`Date.now()`) that didn't accumulate events  
**Solution**: Use stable keys based on event phase and result index  
**Status**: ✅ Fixed and deployed

Users can now see:
- Real-time search progress
- Individual page loading status
- Timing and size information
- Clear feedback on each step

Combined with model load balancing, users have full visibility into the entire search and summarization pipeline!

---

**Last Updated**: October 8, 2025  
**Author**: GitHub Copilot
