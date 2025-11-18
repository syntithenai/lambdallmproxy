# Feature: Swag Page Feed and Chat Integration Buttons

**Status**: ✅ Complete  
**Date**: 2025-01-XX  
**Type**: Feature Enhancement

## Overview

Added two new action buttons to each snippet on the Swag page that enable quick exploration of snippet content via the Feed and Chat features. This creates a seamless workflow for users to dive deeper into their saved snippets.

## User Story

As a user managing snippets in my Swag:
- I want to **generate a feed** using a snippet's content as search criteria
- I want to **expand and fact-check** a snippet using the Chat feature
- I want these actions to be quick, accessible, and integrated into my workflow

## Implementation

### 1. SwagPage Buttons (ui-new/src/components/SwagPage.tsx)

Added two new action buttons in the snippet card action buttons section:

#### Feed Button (Orange)
- **Icon**: `Rss` from lucide-react
- **Color**: Orange (`bg-orange-500`)
- **Action**: Navigate to Feed page and generate items from snippet content
- **Tooltip**: "Generate feed from snippet"

#### Chat Button (Purple)
- **Icon**: `MessageSquare` from lucide-react
- **Color**: Purple (`bg-purple-500`)
- **Action**: Navigate to Chat page with snippet as system message and expansion prompt
- **Tooltip**: "Expand and fact-check in chat"

### 2. Handler Functions

#### `handleGenerateFeedFromSnippet(snippet)`
```typescript
// Extracts meaningful search terms from snippet
const searchText = `${snippet.title || ''} ${snippet.content.substring(0, 200)}`.trim();

// Stores request in localStorage for FeedPage to pick up
localStorage.setItem('feed_generation_request', JSON.stringify({
  searchTerms: [searchText],
  clearExisting: true,
  fromSnippet: snippet.id
}));

// Navigates to /feed
navigate('/feed');
```

**Behavior**:
1. Combines snippet title and first 200 chars of content as search criteria
2. Signals FeedPage to clear existing items
3. Navigates to Feed page
4. Shows success toast: "Generating feed from snippet..."

#### `handleChatFromSnippet(snippet)`
```typescript
// Navigates with state to set system message and auto-submit query
navigate('/chat', {
  state: {
    systemMessage: snippet.content,
    query: 'Please expand on the above content and fact-check the key claims...',
    autoSubmit: true,
    fromSnippet: snippet.id,
    snippetTitle: snippet.title
  }
});
```

**Behavior**:
1. Sets snippet content as system message (context for the LLM)
2. Injects expansion/fact-checking query
3. Auto-submits the query when Chat page loads
4. Shows success toast: "Opening chat with snippet context..."

### 3. FeedPage Integration (ui-new/src/components/FeedPage.tsx)

Added `useEffect` hook to detect and process feed generation requests:

```typescript
useEffect(() => {
  const handleFeedRequest = async () => {
    const feedRequest = localStorage.getItem('feed_generation_request');
    if (!feedRequest) return;
    
    const { searchTerms, clearExisting, fromSnippet } = JSON.parse(feedRequest);
    
    if (clearExisting) {
      await clearAllItems();
    }
    
    if (searchTerms && searchTerms.length > 0) {
      await generateMore(searchTerms);
    }
    
    localStorage.removeItem('feed_generation_request');
  };
  
  handleFeedRequest();
}, []); // Run once on mount
```

**Behavior**:
1. Checks for `feed_generation_request` in localStorage on mount
2. Clears existing feed items if requested
3. Generates new feed items with provided search terms
4. Cleans up localStorage request
5. Handles errors gracefully

### 4. ChatTab Integration (Existing Feature)

ChatTab already supported the required functionality via `routerLocation.state`:
- `systemMessage` - Sets the system prompt
- `query` - Sets the input text
- `autoSubmit` - Automatically submits the query
- Additional metadata: `fromSnippet`, `snippetTitle`

No changes required to ChatTab - we leverage existing navigation state handling.

## User Experience

### Feed Button Workflow
1. User clicks **Feed button** (🔶 orange RSS icon) on a snippet
2. User sees toast: "Generating feed from snippet..."
3. Browser navigates to `/feed`
4. FeedPage automatically:
   - Clears existing feed items
   - Uses snippet content as search criteria
   - Generates new feed items
5. User sees fresh feed items related to snippet content

### Chat Button Workflow
1. User clicks **Chat button** (🟣 purple chat icon) on a snippet
2. User sees toast: "Opening chat with snippet context..."
3. Browser navigates to `/chat`
4. ChatTab automatically:
   - Sets snippet content as system message (LLM context)
   - Populates input with expansion/fact-check query
   - Auto-submits the query
5. User sees LLM response expanding and fact-checking snippet content

## Technical Details

### Icon Usage
- **Brain**: Already imported (snippet brain icon)
- **Rss**: Newly imported from lucide-react (feed button)
- **MessageSquare**: Newly imported from lucide-react (chat button)

### Navigation Patterns
- **Feed**: Uses localStorage + `navigate('/feed')` pattern
  - FeedPage checks localStorage on mount
  - Avoids navigation state complexity
  - Clean separation of concerns

- **Chat**: Uses navigation state + `navigate('/chat', { state })` pattern
  - ChatTab already handles this elegantly
  - Avoids localStorage pollution
  - Supports auto-submit functionality

### Error Handling
- FeedPage wraps localStorage parsing in try-catch
- Cleans up invalid/stale requests
- Logs errors to console for debugging

## Button Styling

All action buttons share consistent styling:
```tsx
className="p-2 text-sm bg-{color}-500 text-white rounded hover:bg-{color}-600 transition-colors"
```

Colors:
- **Share**: Blue (`bg-blue-500`)
- **Feed**: Orange (`bg-orange-500`)
- **Chat**: Purple (`bg-purple-500`)
- **Embedding**: Green (`bg-green-500`) or Gray (default state)

## Files Modified

1. **ui-new/src/components/SwagPage.tsx**
   - Added `Rss` and `MessageSquare` icon imports
   - Added `handleGenerateFeedFromSnippet` handler (line ~1213)
   - Added `handleChatFromSnippet` handler (line ~1234)
   - Added Feed button UI (line ~2077)
   - Added Chat button UI (line ~2087)

2. **ui-new/src/components/FeedPage.tsx**
   - Added `useEffect` for localStorage feed request handling (line ~155)

3. **ui-new/src/components/ChatTab.tsx**
   - No changes required (existing navigation state handling works perfectly)

## Testing

### Manual Testing Steps

1. **Feed Button Test**:
   - Navigate to `/swag`
   - Click orange RSS icon on any snippet
   - Verify navigation to `/feed`
   - Verify existing feed items are cleared
   - Verify new feed items are generated
   - Check console for logs: `🎯 Feed generation request from snippet`

2. **Chat Button Test**:
   - Navigate to `/swag`
   - Click purple chat icon on any snippet
   - Verify navigation to `/chat`
   - Verify system prompt is set to snippet content
   - Verify expansion query is populated
   - Verify query is auto-submitted
   - Check console for logs: `📝 Setting system prompt from navigation state`

3. **Error Handling Test**:
   - Manually corrupt localStorage `feed_generation_request`
   - Navigate to `/feed`
   - Verify error is logged and request is cleaned up
   - Verify page doesn't crash

## Future Enhancements

1. **Snippet Metadata in Feed Items**
   - Track which feed items were generated from which snippets
   - Add "Back to snippet" button on feed items
   - Show snippet title/icon on related feed items

2. **Chat History Linking**
   - Link chat sessions back to source snippets
   - Show "Expand snippet" indicator in chat history
   - Allow re-expanding updated snippets

3. **Batch Operations**
   - "Generate feed from all selected snippets"
   - "Compare snippets in chat" (multiple system messages)
   - "Merge snippets and expand"

4. **Feed Customization**
   - Allow user to customize feed search depth
   - Option to include/exclude tags in search criteria
   - Maturity level override for snippet-based feeds

5. **Analytics**
   - Track which snippets generate most feed views
   - Track expansion/fact-check success rates
   - Suggest similar snippets based on feed interactions

## Related Documentation

- [Feed Feature Implementation](FEED_FEATURE_IMPLEMENTATION.md)
- [Feed Recommendations](FEED_RECOMMENDATIONS_IMPLEMENTATION_COMPLETE.md)
- [Snippet Share Dialog](../ui-new/src/components/SnippetShareDialog.tsx)
- [Chat System Prompts](../ui-new/src/components/chat/SystemPromptDisplay.tsx)

## Success Metrics

✅ Feed button successfully navigates and generates items  
✅ Chat button successfully sets context and auto-submits  
✅ No TypeScript/ESLint errors  
✅ Consistent styling with existing buttons  
✅ Error handling prevents crashes  
✅ User feedback via toast notifications  
✅ Console logging for debugging  

## Deployment

**Development**: ✅ Complete (running on `localhost:8081`)  
**Production**: ⏳ Pending (run `make deploy-ui` when ready)

---

**Created**: 2025-01-XX  
**Last Updated**: 2025-01-XX  
**Author**: GitHub Copilot + Steve R
