# Implementation Plan: Feed as Central Feature

**Date**: November 2, 2025  
**Status**: Planning Phase  
**Estimated Time**: 2-3 hours

## Overview
Transform the Feed feature from a secondary feature into the central hub of the application, with Chat as a secondary feature accessible from the Feed.

---

## Phase 1: Routing & Navigation (30 minutes)

### 1.1 Default Route Change
**File**: `ui-new/src/App.tsx`
- Change default route from `/` (ChatTab) to `/feed` (FeedPage)
- Move ChatTab to `/chat` route
- Update any route guards or redirects

### 1.2 Navigation Button Updates
**Files**: 
- `ui-new/src/components/GitHubLink.tsx` → Rename to `BottomRightNav.tsx`
- Various components with "Back to Chat" buttons

**Changes**:
- Add Chat button to bottom-right nav group (alongside GitHub link)
- Change all "Back to Chat" buttons to "Back" 
- Make "Back" buttons navigate to `/feed` instead of `/`
- Update mobile dropdown menu to include:
  - Feed (home)
  - Chat
  - Planning
  - Swag
  - Quiz
  - Settings
  - Help

### 1.3 Files to Update
- [ ] `App.tsx` - Route changes
- [ ] `GitHubLink.tsx` → `BottomRightNav.tsx` - Add chat button
- [ ] `PlanningPage.tsx` - Update "Back to Chat" button
- [ ] `SwagPage.tsx` - Update "Back to Chat" button
- [ ] `SettingsPage.tsx` - Update navigation if present
- [ ] `HelpPage.tsx` - Update navigation if present
- [ ] Mobile dropdown component in `App.tsx`

---

## Phase 2: Feed Item UI Enhancement (15 minutes)

### 2.1 Verify Large Button Row
**File**: `ui-new/src/components/FeedItem.tsx`

**Current State** (lines 376-420): Already has large button grid with 4 buttons
- ✅ Thumbs Down (Block) - Already present
- ✅ Hand (Save to Swag) - Already present  
- ✅ Brain (Quiz) - Already present
- ✅ MessageSquare (Chat) - Already present

**Action**: Verify buttons are prominent and clearly visible
- Check button sizing (currently `h-6 w-6` icons, `p-4` padding)
- Ensure buttons have clear labels
- Confirm functionality works as expected

---

## Phase 3: Feed Refresh Behavior (15 minutes)

### 3.1 Clear-and-Replace Refresh
**File**: `ui-new/src/contexts/FeedContext.tsx`

**Current Behavior**: `generateMore()` adds to existing items
**Target Behavior**: `refresh()` should clear all and generate fresh

**Changes**:
- Modify `generateMore()` to accept `clearExisting` parameter
- Or create separate `refresh()` method that clears items first
- Update FeedPage refresh button to call this new behavior

**Implementation**:
```typescript
const refresh = async () => {
  setAllItems([]); // Clear existing
  await generateMore(); // Generate fresh
};
```

---

## Phase 4: Login & Help Page Updates (20 minutes)

### 4.1 Login Page
**File**: `ui-new/src/components/LoginScreen.tsx`

**Add Feature Description**:
- Add Feed description emphasizing learning and discovery
- Mention quiz integration
- Highlight personalized content based on interests

**Example**:
```
🎯 Personalized Learning Feed
Discover fascinating facts, news, and educational content tailored to your interests. 
Test your knowledge with auto-generated quizzes and expand your learning with AI chat.
```

### 4.2 Help Page
**File**: `ui-new/src/components/HelpPage.tsx`

**Add to Features Section**:
- Feed: Personalized content discovery
- Quizzes: Test knowledge and retain information
- Learning assistance with AI-powered explanations
- Content filtering based on your preferences

---

## Phase 5: Downvoting Documentation (10 minutes)

### 5.1 Add Explanation to Feed Page
**File**: `ui-new/src/components/FeedPage.tsx`

**Add Info Section**:
```tsx
<div className="info-banner">
  ℹ️ How Downvoting Works:
  When you downvote an item, its topics are blocked from future feeds. 
  This helps personalize your content over time.
</div>
```

### 5.2 Add to Help Documentation
**File**: `ui-new/src/components/HelpPage.tsx`

**Add Section**:
```markdown
### Feed Personalization
- **Upvote (Save)**: Topics from saved items are prioritized
- **Downvote (Block)**: Topics from blocked items are filtered out
- **Quiz**: Test your knowledge on the content
- **Chat**: Discuss and explore topics in depth
```

---

## Phase 6: Feed Settings Tab (60 minutes)

### 6.1 Create Feed Settings Component
**New File**: `ui-new/src/components/FeedSettings.tsx`

**Features**:
1. **Blocked Topics Section**
   - Display `preferences.dislikedTopics` as removable chips
   - "Remove" button for each topic
   - Calls `feedDB.removeLikedTopic(topic)` (needs implementation)

2. **Search Terms/Tags Section**
   - Display `preferences.searchTerms` as editable list
   - Add/remove search terms
   - Save to database

3. **Maturity Level Selector**
   - Dropdown: Child, Youth, Adult, Academic
   - Store in preferences
   - Modify feed generation request based on selection

4. **Topic Trends Graph**
   - Chart.js or Recharts for visualization
   - Query `feedDB.getTopicHistory()` for last 6 months
   - Show top 5 topics over time
   - X-axis: Time (weeks/months)
   - Y-axis: Topic frequency

### 6.2 Database Changes
**File**: `ui-new/src/db/feedDb.ts`

**Add Methods**:
```typescript
// Remove disliked topic
async removeLikedTopic(topic: string): Promise<void>

// Get topic history for graphs
async getTopicHistory(months: number = 6): Promise<TopicStats[]>

// Save maturity preference
async setMaturityLevel(level: MaturityLevel): Promise<void>
async getMaturityLevel(): Promise<MaturityLevel>
```

**New Type**:
```typescript
type MaturityLevel = 'child' | 'youth' | 'adult' | 'academic';

interface TopicStats {
  topic: string;
  count: number;
  timestamp: string;
}
```

### 6.3 Update Feed Generation
**File**: Backend `src/endpoints/feed.js`

**Add Maturity Filtering**:
- Accept `maturityLevel` parameter in feed generation request
- Adjust system prompt based on maturity:
  - **Child**: Simple language, no violence, educational
  - **Youth**: Age-appropriate, inspiring, educational
  - **Adult**: Standard content, all topics
  - **Academic**: Scholarly, research-focused, citations

### 6.4 Settings Page Integration
**File**: `ui-new/src/components/SettingsPage.tsx`

**Add Tab**:
```tsx
<Tab label="Feed">
  <FeedSettings />
</Tab>
```

---

## Phase 7: Backend Enhancements (30 minutes)

### 7.1 Feed Generation Endpoint
**File**: `src/endpoints/feed.js`

**Add Parameters**:
- `maturityLevel`: 'child' | 'youth' | 'adult' | 'academic'
- `clearHistory`: boolean (for refresh behavior)

**Maturity System Prompts**:
```javascript
const maturityPrompts = {
  child: "Create age-appropriate content for children (ages 6-12). Use simple language, avoid scary or violent topics, focus on educational and inspiring content.",
  youth: "Create content suitable for teenagers (ages 13-18). Use engaging language, include current trends, focus on educational and motivational topics.",
  adult: "Create content for adult audiences. Include all appropriate topics, use sophisticated language, provide in-depth analysis.",
  academic: "Create scholarly content with academic rigor. Include research findings, citations, complex analysis, and technical terminology."
};
```

---

## Implementation Checklist

### Phase 1: Routing & Navigation
- [ ] Change default route to `/feed` in `App.tsx`
- [ ] Move chat to `/chat` route
- [ ] Create `BottomRightNav.tsx` with GitHub + Chat buttons
- [ ] Update all "Back to Chat" buttons to "Back" → `/feed`
- [ ] Update mobile dropdown navigation

### Phase 2: Feed Item UI
- [ ] Verify large button row is prominent
- [ ] Test all button functionality
- [ ] Ensure responsive design

### Phase 3: Feed Refresh
- [ ] Add `refresh()` method to FeedContext
- [ ] Clear items before generating
- [ ] Connect to refresh button in FeedPage

### Phase 4: Login & Help Pages
- [ ] Add Feed description to LoginScreen
- [ ] Add Feed/Quiz features to HelpPage
- [ ] Emphasize learning assistance

### Phase 5: Downvoting Documentation
- [ ] Add info banner to FeedPage
- [ ] Add downvoting explanation to HelpPage
- [ ] Document in developer logs

### Phase 6: Feed Settings Tab
- [ ] Create `FeedSettings.tsx` component
- [ ] Add blocked topics list with remove functionality
- [ ] Add search terms editor
- [ ] Add maturity level selector
- [ ] Add topic trends graph (Chart.js)
- [ ] Add database methods for topic management
- [ ] Add maturity preference storage
- [ ] Integrate into SettingsPage

### Phase 7: Backend Enhancements
- [ ] Add maturity level parameter to feed endpoint
- [ ] Create maturity-specific system prompts
- [ ] Test feed generation with different maturity levels
- [ ] Add clearHistory parameter for refresh

---

## Testing Plan

### Manual Testing
1. **Navigation Flow**
   - Open app → Should land on Feed page
   - Click Chat button → Navigate to Chat
   - Click Back → Return to Feed
   - Test mobile dropdown menu

2. **Feed Functionality**
   - Click refresh → All items clear and regenerate
   - Click downvote → Topic blocked, future feeds exclude it
   - Click save → Item saved to Swag
   - Click quiz → Quiz generated
   - Click chat → Question generated and chat opened

3. **Settings**
   - Open Feed settings tab
   - View blocked topics
   - Remove a blocked topic
   - Change maturity level
   - View topic trends graph
   - Regenerate feed → Should respect maturity level

### Edge Cases
- No feed items (first load)
- All items downvoted
- Empty blocked topics list
- No topic history (new user)
- Maturity level changes mid-session

---

## Deployment Steps

1. **Commit Order**:
   - Phase 1: Routing changes
   - Phase 2: UI verification
   - Phase 3: Refresh behavior
   - Phase 4: Login/Help updates
   - Phase 5: Documentation
   - Phase 6: Settings tab (largest change)
   - Phase 7: Backend changes

2. **Testing Points**:
   - After Phase 1: Test navigation
   - After Phase 3: Test refresh
   - After Phase 6: Test full settings flow
   - After Phase 7: Test maturity levels

3. **Deploy**:
   - Build UI: `make build-ui`
   - Deploy UI: `make deploy-ui`
   - Deploy Lambda: `make deploy-lambda-fast`

---

## Open Questions

1. Should we keep a "Home" route at `/` that redirects to `/feed`?
2. Should the GitHub link stay in bottom-right, or move to top nav?
3. Should topic trends graph be interactive (click to filter)?
4. Should maturity level affect quiz difficulty too?
5. How many feed items should refresh generate? (Currently configurable)

---

## Future Enhancements

- Topic suggestions based on user history
- Collaborative filtering (popular topics among users)
- Scheduled feed updates (daily digest)
- Export blocked/liked topics
- Import/export feed preferences
- Social sharing of interesting feed items
- Topic collections/categories
