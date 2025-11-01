# Feed Downvoting Mechanism

This document explains how the downvoting (blocking) feature works in the Feed system to filter out unwanted content.

## Overview

When you downvote (block) a feed item, the system tracks this interaction and uses it to prevent similar content from appearing in future feed generations. The mechanism analyzes the topics associated with blocked items and filters them out during the feed generation process.

## User Flow

1. **User Action**: Click the "Block" button (ThumbsDown icon) on a feed item
2. **Immediate Effect**: Item is marked as trashed and removed from view
3. **Backend Processing**: System analyzes topics from all blocked items
4. **Feed Generation**: Future feeds exclude content matching blocked topics

## Technical Implementation

### 1. Frontend - User Interaction Tracking

**File**: `ui-new/src/components/FeedItem.tsx`

```typescript
const handleTrash = async () => {
  await trackInteraction('trash');
  trashItem(item.id);
};
```

**File**: `ui-new/src/contexts/FeedContext.tsx`

```typescript
const trashItem = (id: string) => {
  setItems(prev => prev.map(i => i.id === id ? { ...i, trashed: true } : i));
};
```

### 2. Database - Interaction Storage

**File**: `ui-new/src/db/feedDb.ts`

When `trackInteraction('trash')` is called, it saves to IndexedDB:

```typescript
interface UserInteraction {
  id: string;
  feedItemId: string;
  action: 'stash' | 'trash' | 'view' | 'quiz' | 'skip';
  topics: string[];
  content: string;
  timestamp: number;
  timeSpent: number;
}
```

The interaction includes:
- `action: 'trash'` - Marks this as a downvote
- `topics: string[]` - Topics extracted from the feed item
- `content: string` - Item title/content for analysis

### 3. Backend - Topic Extraction

**File**: `src/services/feed-recommender.js`

The `_extractAvoidTopics` function analyzes all trashed items:

```javascript
_extractAvoidTopics(trashedItems) {
  const topicCounts = new Map();
  
  // Count frequency of each topic across trashed items
  for (const item of trashedItems) {
    if (item.topics && Array.isArray(item.topics)) {
      for (const topic of item.topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }
  }
  
  // Calculate threshold (topics appearing in >20% of trashed items)
  const threshold = Math.max(1, Math.floor(trashedItems.length * 0.2));
  
  // Return topics that exceed threshold
  const avoidTopics = [];
  for (const [topic, count] of topicCounts.entries()) {
    if (count >= threshold) {
      avoidTopics.push(topic);
    }
  }
  
  return avoidTopics;
}
```

**Logic**:
- Analyzes all items marked with `action: 'trash'`
- Counts how many times each topic appears in blocked items
- Calculates threshold: 20% of total trashed items (minimum 1)
- Only blocks topics that appear frequently enough (above threshold)

**Example**:
- 10 items trashed
- Threshold = 20% of 10 = 2 items
- If "politics" appears in 3 trashed items → blocked
- If "cooking" appears in 1 trashed item → not blocked (below threshold)

### 4. Backend - Search Term Filtering

**File**: `src/services/feed-recommender.js`

The `filterSearchTerms` function removes blocked topics:

```javascript
filterSearchTerms(searchTerms, preferences) {
  const { avoidTopics = [] } = preferences;
  
  return searchTerms.filter(term => {
    // Remove terms that contain any avoided topic
    for (const avoidTopic of avoidTopics) {
      if (term.toLowerCase().includes(avoidTopic.toLowerCase())) {
        return false;
      }
    }
    return true;
  });
}
```

**Example**:
- Generated search terms: `["technology news", "political developments", "tech startups"]`
- Blocked topics: `["politics"]`
- Filtered result: `["technology news", "tech startups"]`
- "political developments" is excluded because it contains "politics"

### 5. Backend - Feed Generation

**File**: `src/endpoints/feed.js`

The feed endpoint passes preferences to the recommender:

```javascript
// Line 677
const newItems = await feedRecommender.generateFeedItems(
  userEmail,
  12, // number of items
  userPreferences // includes avoidTopics
);
```

The recommender uses `avoidTopics` throughout the generation process:
1. **Search Query Generation**: Filters search terms to exclude blocked topics
2. **Content Retrieval**: DuckDuckGo searches use filtered terms
3. **Item Selection**: Resulting items naturally exclude blocked topics

## Data Persistence

### UserPreferences Schema

**File**: `ui-new/src/db/feedDb.ts`

```typescript
interface UserPreferences {
  userId: string;
  learnedTopics: Array<{
    topic: string;
    weight: number;
    frequency: number;
    recency: number;
    quizEngagement: number;
  }>;
  avoidTopics: string[];
  lastUpdated: number;
}
```

The `avoidTopics` array is:
- Stored in IndexedDB for frontend access
- Sent to backend with each feed generation request
- Updated continuously as users block more items

## Frequency Threshold Benefits

The 20% threshold provides several benefits:

1. **Prevents Over-Blocking**: Single accidental downvote won't block a topic
2. **Identifies Patterns**: Only blocks topics consistently disliked
3. **Adapts to User**: More blocks → lower threshold impact
4. **Balances Specificity**: Not too aggressive, not too permissive

## Complete Flow Diagram

```
┌─────────────────┐
│ User clicks     │
│ "Block" button  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Frontend: trackInteraction('trash') │
│ - Save to IndexedDB                 │
│ - Include topics, content           │
└────────┬────────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ User refreshes feed              │
│ (or auto-refresh triggers)       │
└────────┬─────────────────────────┘
         │
         ▼
┌───────────────────────────────────────┐
│ Backend: GET /feed                    │
│ - Receives userPreferences            │
│ - Contains all UserInteractions       │
└────────┬──────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Backend: _extractAvoidTopics()          │
│ - Analyze trashedItems                  │
│ - Count topic frequencies               │
│ - Apply 20% threshold                   │
│ - Return array of topics to avoid       │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Backend: filterSearchTerms()            │
│ - Remove terms containing avoidTopics   │
│ - Generate "clean" search queries       │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Backend: DuckDuckGo Search              │
│ - Search with filtered terms            │
│ - Results naturally exclude blocked     │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Frontend: Display new feed      │
│ - No blocked topics appear      │
└─────────────────────────────────┘
```

## Example Scenarios

### Scenario 1: User Blocks Political Content

1. User blocks 3 items with topics: `["politics", "election"]`
2. Threshold = 1 (minimum when few items blocked)
3. `avoidTopics = ["politics", "election"]`
4. Search terms filtered:
   - ❌ "political news today"
   - ❌ "election updates"
   - ✅ "technology trends"
   - ✅ "science discoveries"
5. Future feeds contain only tech/science content

### Scenario 2: Accidental Downvote

1. User accidentally blocks 1 item with topic `["cooking"]`
2. User blocks 9 other items with various topics
3. Threshold = 2 (20% of 10 items)
4. "cooking" appears only once → not added to avoidTopics
5. Cooking content still appears in future feeds

### Scenario 3: Mixed Preferences

1. User blocks items: 5 politics, 3 sports, 2 tech
2. Total trashed = 10 items, threshold = 2
3. `avoidTopics = ["politics", "sports"]` (tech appears only 2 times, at threshold)
4. Tech content may still appear depending on specific implementation

## Unblocking Topics

**Current Status**: Not implemented in UI

**Future Enhancement**: FeedSettings component will allow users to:
- View current `avoidTopics` list
- Remove specific topics from block list
- Clear all blocks at once

This will be implemented in the Feed settings tab (see separate task).

## Performance Considerations

- **IndexedDB Queries**: Efficient for thousands of interactions
- **Topic Counting**: O(n*m) where n=trashed items, m=avg topics per item
- **Threshold Calculation**: O(1) simple percentage math
- **Search Filtering**: O(k*t) where k=search terms, t=avoid topics

All operations complete in milliseconds even with large datasets.

## Related Files

**Frontend**:
- `ui-new/src/components/FeedItem.tsx` - Block button and handler
- `ui-new/src/contexts/FeedContext.tsx` - State management
- `ui-new/src/db/feedDb.ts` - IndexedDB storage and schemas

**Backend**:
- `src/services/feed-recommender.js` - Topic extraction and filtering
- `src/endpoints/feed.js` - Feed generation endpoint

## Future Enhancements

1. **User-Configurable Threshold**: Allow users to adjust sensitivity
2. **Topic Suggestions**: Show related topics to block
3. **Temporary Blocks**: Auto-expire blocks after X days
4. **Block Reasons**: Let users specify why they blocked
5. **Block Analytics**: Show statistics on blocked content
6. **Smart Filtering**: Use ML to predict unwanted topics
