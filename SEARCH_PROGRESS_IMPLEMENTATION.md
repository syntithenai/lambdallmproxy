# Live Search Progress Feedback Implementation

## Summary

Implemented real-time progress feedback for web search operations. Users now see live updates as search results are fetched, with "three waiting blocks" animation and detailed status for each result being loaded.

## Changes Made

### Backend (src/)

1. **src/search.js**:
   - Updated `search()` method signature to accept optional `progressCallback` parameter
   - Updated `fetchContentForResultsParallel()` to pass callback through to single result fetcher
   - Updated `fetchContentForSingleResult()` to emit progress events:
     - `fetching_result`: When starting to fetch a result (includes index, total, URL, title)
     - `result_loaded`: When result successfully loaded (includes size, fetch time)
     - `result_failed`: When result fetch failed (includes error message)

2. **src/tools.js**:
   - Created `progressCallback` function that wraps `context.writeEvent()`
   - Passed callback to `searcher.search()` method
   - Backend now emits 6 types of search progress events:
     - `searching`: Initial search starting
     - `results_found`: Search returned results for a query
     - `loading_content`: About to fetch content from results
     - `fetching_result`: Fetching content from result N of M
     - `result_loaded`: Successfully loaded result N of M
     - `result_failed`: Failed to load result N of M

### Frontend (ui-new/)

1. **ui-new/src/components/SearchProgress.tsx** (NEW):
   - Created new component to display search progress
   - Renders different UI based on phase:
     - `searching`: Three animated pulsing dots + service name
     - `results_found`: Green checkmark + query
     - `loading_content`: Three animated dots + result count
     - `fetching_result`: Three animated dots + result title/URL + progress (N/M)
     - `result_loaded`: Green checkmark + result title + size/time stats
     - `result_failed`: Red X + result title + error message

2. **ui-new/src/components/ChatTab.tsx**:
   - Added `searchProgress` state to track search progress events
   - Added event handler for `search_progress` events
   - Auto-expands tool section when search starts
   - Renders `SearchProgress` component for `search_web` tool calls
   - Progress updates display in real-time as events stream in

## User Experience

Before:
- Tool execution was silent until completion
- No indication of which pages were being fetched
- No way to tell if search was progressing or stuck

After:
- Tool section auto-expands when search starts
- Live status shows which result is being fetched (1 of 3, 2 of 3, etc.)
- Three animated dots indicate active loading
- Each result shows:
  - Title and URL while loading
  - Size and fetch time when complete
  - Error message if failed
- User can see progress through all phases:
  1. "Searching DuckDuckGo..."
  2. "Found results for: [query]"
  3. "Loading content from 3 results..."
  4. "[1/3] Page Title" (with animated dots)
  5. "[1/3] Page Title - Loaded 25KB in 342ms" (with checkmark)
  6. Repeat for each result

## Technical Details

### Event Flow

1. User submits query with search enabled
2. Backend emits `search_progress` event with phase `searching`
3. DuckDuckGo returns results
4. Backend emits `search_progress` event with phase `results_found`
5. Backend emits `search_progress` event with phase `loading_content`
6. For each result (parallel fetching):
   - Backend emits `search_progress` event with phase `fetching_result`
   - Content is fetched from the URL
   - Backend emits `search_progress` event with phase `result_loaded` or `result_failed`
7. Tool execution completes, result is displayed

### Progress Event Schema

```typescript
interface SearchProgressEvent {
  type: 'search_progress';
  tool: 'search_web';
  phase: 'searching' | 'results_found' | 'loading_content' | 'fetching_result' | 'result_loaded' | 'result_failed';
  query?: string;
  queries?: string[];
  service?: 'duckduckgo' | 'tavily';
  result_count?: number;
  result_index?: number;
  result_total?: number;
  url?: string;
  title?: string;
  content_size?: number;
  fetch_time_ms?: number;
  error?: string;
  timestamp?: string;
}
```

### Callback Architecture

The implementation uses a callback function approach rather than refactoring the entire DuckDuckGoSearcher class:

```javascript
// In tools.js - create callback
const progressCallback = (data) => {
  if (context?.writeEvent) {
    context.writeEvent('search_progress', {
      tool: 'search_web',
      query: query,
      ...data,
      timestamp: new Date().toISOString()
    });
  }
};

// Pass to search method
const out = await searcher.search(query, limit, true, timeout, progressCallback);
```

This approach:
- ✅ Minimal code changes
- ✅ No breaking changes to existing API
- ✅ Easy to add similar progress to other tools
- ✅ Clean separation of concerns

## Deployment

- Backend: Deployed via `make fast` (10 seconds)
- Frontend: Built via `./scripts/build-docs.sh` and deployed via `./scripts/deploy-docs.sh`
- Live at: https://lambdallmproxy.pages.dev

## Testing

To test the live progress feedback:
1. Open the UI at https://lambdallmproxy.pages.dev
2. Enable web search tool in settings
3. Send a query that will trigger a search (e.g., "What's the latest news about AI?")
4. Watch the tool section auto-expand and show progress as each result loads

Expected behavior:
- Tool section expands automatically
- Progress indicators appear with animated dots
- Each result shows loading status (1/3, 2/3, 3/3)
- Green checkmarks appear as results complete
- Final result displays after all pages loaded

## Future Enhancements

Potential improvements for future iterations:
1. Add cancel button to stop search in progress
2. Show estimated time remaining based on previous fetch times
3. Add retry button for failed results
4. Display thumbnail/favicon for each result
5. Show total bandwidth used for all results
6. Add progress bar showing overall completion percentage
7. Highlight which results contributed most to the final answer

## Files Modified

Backend:
- src/search.js (3 functions updated)
- src/tools.js (1 function updated)

Frontend:
- ui-new/src/components/SearchProgress.tsx (new file)
- ui-new/src/components/ChatTab.tsx (event handling + rendering)

## Commits

- Backend: Deployed via `make fast` at 2025-10-07 22:07 UTC
- Frontend: Committed and pushed at 2025-10-07 22:10 UTC
  - Commit: d5353f8
  - Message: "docs: update built site (2025-10-07 22:10:12 UTC) - Add live search progress feedback"

## Related Work

This feature builds upon:
- Existing transcription progress implementation (TranscriptionProgress.tsx)
- SSE streaming architecture in sendChatMessageStreaming()
- Tool execution status tracking in ChatTab.tsx

The implementation follows the same patterns as transcription progress, making it consistent with existing UX and easy to maintain.
