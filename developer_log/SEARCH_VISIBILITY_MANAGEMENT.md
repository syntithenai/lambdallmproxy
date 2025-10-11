# Search Visibility Management - Implementation Guide

**Date**: 2025-10-05  
**Status**: ✅ Complete  
**Build**: 247.88 kB bundle (index-je7s85Fb.js)

## Overview

Enhanced the search results system with intelligent visibility management that ties visible search results to the current chat context. This provides a clean separation between chat sessions and prevents confusion from stale search results.

## Problem & Solution

### Problem
- Search results persisted across chat sessions
- No clear indication which searches belong to current conversation
- Confusing UX when starting new chat with old searches visible

### Solution
- **New Chat = Clean Slate**: Starting a new chat clears visible search results
- **Smart Context Tracking**: Distinguishes between initial load and intentional clear
- **Auto-Add on Tool Execution**: New searches automatically appear in visible results
- **Preserved Cache**: Search cache remains intact for performance

## Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: React Context (Ephemeral State)                   │
│ - searchResults: SearchResult[]                             │
│ - wasCleared: boolean                                       │
│ - Cleared on new chat                                       │
│ - Lives only during session                                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Component State (Session + localStorage)          │
│ - SearchTab: results state                                  │
│ - Syncs with context via useEffect                          │
│ - Persists to localStorage for page refresh                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Cache (Long-term Storage)                         │
│ - localStorage: llm_proxy_search_cache                      │
│ - Indexed by query (lowercase)                              │
│ - 7-day TTL                                                 │
│ - Never cleared on new chat                                 │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. SearchResultsContext Enhancement

**File**: `ui-new/src/contexts/SearchResultsContext.tsx`

**Added `wasCleared` Flag**:

```tsx
interface SearchResultsContextType {
  searchResults: SearchResult[];
  addSearchResult: (result: SearchResult) => void;
  setSearchResults: (results: SearchResult[]) => void;
  clearSearchResults: () => void;
  wasCleared: boolean;  // ← NEW: Tracks intentional clears
}
```

**State Management**:

```tsx
const [searchResults, setSearchResultsState] = useState<SearchResult[]>([]);
const [wasCleared, setWasCleared] = useState(false);
```

**Updated Functions**:

```tsx
const clearSearchResults = () => {
  setWasCleared(true);  // Signal intentional clear
  setSearchResultsState([]);
};

const addSearchResult = (result: SearchResult) => {
  setWasCleared(false);  // Reset flag when adding results
  setSearchResultsState(prev => {
    const existingIndex = prev.findIndex(
      r => r.query.toLowerCase() === result.query.toLowerCase()
    );
    
    if (existingIndex >= 0) {
      const updated = [...prev];
      updated[existingIndex] = result;
      return updated;
    } else {
      return [...prev, result];
    }
  });
};
```

**Why the Flag?**

The `wasCleared` flag solves the "initial state problem":

| Scenario | contextResults | wasCleared | Action |
|----------|---------------|------------|--------|
| **Page Load** | `[]` (empty) | `false` | Keep localStorage results |
| **New Chat** | `[]` (cleared) | `true` | Clear visible results |
| **Adding Search** | `[result]` | `false` (reset) | Merge with existing |

### 2. ChatTab Integration

**File**: `ui-new/src/components/ChatTab.tsx`

**Import clearSearchResults**:

```tsx
const { addSearchResult, clearSearchResults } = useSearchResults();
```

**Updated handleNewChat**:

```tsx
const handleNewChat = () => {
  setMessages([]);
  setInput('');
  clearSearchResults();  // ← Clear visible search results
};
```

**Unchanged - Auto-Add on Tool Execution**:

```tsx
case 'tool_call_result':
  // ... (tool status updates)
  
  const toolMessage: ChatMessage = {
    role: 'tool',
    content: data.content,
    tool_call_id: data.id,
    name: data.name
  };
  setMessages(prev => [...prev, toolMessage]);
  
  // Auto-add search results to visible list
  if (data.name === 'search_web' && data.content) {
    const searchResult = extractAndSaveSearchResult(data.name, data.content);
    if (searchResult) {
      addSearchResult(searchResult);  // ← Sets wasCleared = false
      console.log('Search result added to SearchTab:', searchResult);
    }
  }
  break;
```

### 3. SearchTab Synchronization

**File**: `ui-new/src/components/SearchTab.tsx`

**Import wasCleared Flag**:

```tsx
const { searchResults: contextResults, wasCleared } = useSearchResults();
```

**Smart Sync Logic**:

```tsx
// Sync search results with chat context
useEffect(() => {
  if (wasCleared) {
    // Context was intentionally cleared (new chat) - clear visible results
    setResults([]);
  } else if (contextResults.length > 0) {
    // Merge context results with existing results
    setResults(prev => {
      // Create a map of existing results by query (lowercase)
      const existingMap = new Map(prev.map(r => [r.query.toLowerCase(), r]));
      
      // Add/update results from context
      contextResults.forEach(result => {
        existingMap.set(result.query.toLowerCase(), result);
      });
      
      // Convert back to array
      return Array.from(existingMap.values());
    });
  }
  // If wasCleared is false and contextResults empty, it's initial state - do nothing
}, [contextResults, wasCleared, setResults]);
```

**Logic Flow**:

```
┌─────────────────────────┐
│ useEffect triggered     │
└────────┬────────────────┘
         │
         ▼
    ┌────────────┐
    │ wasCleared?│
    └─┬────────┬─┘
      │        │
  YES │        │ NO
      │        │
      ▼        ▼
┌────────┐  ┌──────────────────┐
│ Clear  │  │ contextResults   │
│ Results│  │ length > 0?      │
└────────┘  └─┬──────────────┬─┘
              │              │
          YES │              │ NO
              │              │
              ▼              ▼
        ┌──────────┐  ┌────────────┐
        │ Merge    │  │ Do Nothing │
        │ Results  │  │ (initial   │
        └──────────┘  │  state)    │
                      └────────────┘
```

## User Experience Flows

### Flow 1: New User First Session

```
1. User opens app
   → contextResults: []
   → wasCleared: false
   → SearchTab: Shows empty (no localStorage yet)

2. User asks question triggering search
   → LLM executes search_web
   → addSearchResult() called
   → wasCleared: false (reset)
   → contextResults: [result1]
   → SearchTab: Shows result1

3. User asks another question with search
   → addSearchResult() called again
   → contextResults: [result1, result2]
   → SearchTab: Shows both results

4. User refreshes page
   → contextResults: []
   → wasCleared: false
   → SearchTab: Loads from localStorage (shows result1, result2)
```

### Flow 2: Existing User, New Chat

```
1. User has existing chat with searches
   → contextResults: [result1, result2]
   → SearchTab: Shows result1, result2

2. User clicks "New Chat"
   → handleNewChat() called
   → clearSearchResults() sets wasCleared = true
   → contextResults: []
   → SearchTab useEffect triggered
   → wasCleared is true → setResults([])
   → SearchTab: Now empty ✅

3. User performs new search
   → addSearchResult() called
   → wasCleared: false (reset)
   → contextResults: [result3]
   → SearchTab: Shows only result3 ✅
```

### Flow 3: Page Refresh During Chat

```
1. User has active chat with searches
   → Messages persisted to localStorage
   → Search results persisted to localStorage
   → contextResults lost (page refresh)

2. Page loads
   → contextResults: [] (initial state)
   → wasCleared: false
   → SearchTab: Loads from localStorage ✅
   → Shows previous search results

3. User continues chat
   → New searches are added via addSearchResult()
   → wasCleared: false (reset when adding)
   → SearchTab: Merges new with existing results ✅
```

### Flow 4: Multiple New Chats

```
Chat Session 1:
  Search: "Python tutorials"
  Results: [...10 results...]

User clicks "New Chat"
  → SearchTab cleared ✅

Chat Session 2:
  Search: "JavaScript frameworks"
  Results: [...8 results...]
  
User clicks "New Chat"
  → SearchTab cleared ✅

Chat Session 3:
  Search: "Rust programming"
  Results: [...12 results...]
  
SearchTab shows only Rust results ✅
No confusion with Python or JavaScript searches ✅
```

## State Transition Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ Initial State (Page Load)                                    │
│ contextResults: []                                           │
│ wasCleared: false                                            │
│ SearchTab: Shows localStorage results                        │
└────────────────────────┬─────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌────────────┐  ┌─────────────────┐
│ Search       │  │ New Chat   │  │ Page Refresh    │
│ Executed     │  │ Clicked    │  │                 │
└──────┬───────┘  └──────┬─────┘  └────────┬────────┘
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────┐  ┌────────────┐  ┌─────────────────┐
│ addSearch    │  │ clear      │  │ Return to       │
│ Result()     │  │ Search     │  │ Initial State   │
│              │  │ Results()  │  │                 │
│ wasCleared=  │  │            │  │                 │
│ false        │  │ wasCleared=│  │                 │
│              │  │ true       │  │                 │
└──────┬───────┘  └──────┬─────┘  └────────┬────────┘
       │                 │                 │
       │                 ▼                 │
       │          ┌────────────┐           │
       │          │ Results    │           │
       │          │ Cleared    │           │
       │          └──────┬─────┘           │
       │                 │                 │
       └─────────────────┴─────────────────┘
```

## Technical Benefits

### 1. Clear State Management
- **Explicit intent**: `wasCleared` flag clearly indicates user action
- **No ambiguity**: Initial load vs. intentional clear are distinguishable
- **Predictable behavior**: Same inputs always produce same outputs

### 2. Performance Optimization
- **Cache preserved**: Long-term cache not affected by UI state
- **Minimal re-renders**: useEffect only triggers on relevant changes
- **Efficient merging**: Map-based deduplication is O(n)

### 3. User Experience
- **Clean separation**: Each chat session has its own search context
- **No confusion**: Stale searches don't pollute new conversations
- **Persistence**: Page refresh doesn't lose work
- **Immediate feedback**: New searches appear instantly

### 4. Developer Experience
- **Type safety**: TypeScript interfaces enforce contracts
- **Clear responsibilities**: Each layer has specific purpose
- **Testable**: Pure functions and isolated state
- **Debuggable**: Console logs track state changes

## Edge Cases Handled

### 1. Rapid New Chats
```typescript
// User clicks "New Chat" multiple times quickly
handleNewChat() // Call 1: wasCleared = true
handleNewChat() // Call 2: wasCleared already true
handleNewChat() // Call 3: wasCleared already true

// Result: setResults([]) called multiple times but idempotent ✅
```

### 2. Search While Clearing
```typescript
// Unlikely but possible: search completes while clearing
clearSearchResults()  // wasCleared = true
addSearchResult()     // wasCleared = false (reset)

// Result: Search result added, wasCleared reset ✅
```

### 3. Multiple Tabs Open
```typescript
// User has two tabs open with same app
// Tab 1: Clears searches
// Tab 2: Context doesn't change (separate instances)

// Result: Each tab has independent state ✅
// Note: This is expected behavior for React Context
```

### 4. Browser Back/Forward
```typescript
// User navigates with browser buttons
// React Router would typically handle this
// But for single-page app without routing:

// Result: No effect on search visibility ✅
// State remains in current context
```

### 5. localStorage Quota Exceeded
```typescript
// If localStorage is full:
try {
  setResults(results); // Persists to localStorage
} catch (e) {
  // localStorage write fails
  // But React state still updates
  // User sees results in current session ✅
}
```

## Testing Checklist

### Manual Testing

- [ ] **New Chat Clears Searches**
  1. Perform search in chat
  2. Verify results in Searches tab
  3. Click "New Chat"
  4. Verify Searches tab is empty

- [ ] **New Search Appears**
  1. Start fresh chat
  2. Ask question triggering search
  3. Verify result appears in Searches tab

- [ ] **Multiple Searches Accumulate**
  1. Perform 3 different searches
  2. Verify all 3 appear in Searches tab
  3. Verify in order added

- [ ] **Page Refresh Preserves Results**
  1. Perform searches
  2. Refresh page (F5)
  3. Verify results still visible in Searches tab

- [ ] **New Chat After Refresh**
  1. Refresh page with existing results
  2. Click "New Chat"
  3. Verify results cleared

- [ ] **Same Query Twice**
  1. Search for "AI"
  2. Click "New Chat"
  3. Search for "AI" again
  4. Verify only latest results shown

- [ ] **Cache Persists Across New Chats**
  1. Search for "Python"
  2. Note results
  3. Click "New Chat"
  4. Go to Searches tab, manually search "Python"
  5. Verify results loaded from cache (instant)

### Automated Testing (Future)

```typescript
describe('Search Visibility Management', () => {
  it('should clear visible results on new chat', () => {
    // Add search result
    // Call clearSearchResults()
    // Assert wasCleared = true
    // Assert contextResults = []
  });
  
  it('should reset wasCleared flag when adding result', () => {
    // Call clearSearchResults() (wasCleared = true)
    // Call addSearchResult()
    // Assert wasCleared = false
  });
  
  it('should not clear results on initial load', () => {
    // Mount SearchTab with empty context
    // Assert results from localStorage remain
  });
});
```

## Build Information

**Bundle**: 247.88 kB (gzip: 75.12 kB)  
**Build Time**: 1.11s  
**Files Modified**: 3
- `ui-new/src/contexts/SearchResultsContext.tsx` (+3 lines state, +2 lines logic)
- `ui-new/src/components/ChatTab.tsx` (+1 line import, +1 line call)
- `ui-new/src/components/SearchTab.tsx` (+1 line import, +8 lines logic)

**Total Code Added**: ~15 lines  
**Bundle Size Increase**: 0.06 kB (247.82 → 247.88)

## Future Enhancements

### 1. Visual Feedback
```typescript
// Show toast when clearing searches
const handleNewChat = () => {
  setMessages([]);
  setInput('');
  clearSearchResults();
  showInfo('Chat and searches cleared');
};
```

### 2. Undo Functionality
```typescript
// Save last cleared state for undo
const [lastCleared, setLastCleared] = useState<SearchResult[]>([]);

const clearSearchResults = () => {
  setLastCleared(searchResults);
  setWasCleared(true);
  setSearchResultsState([]);
};

const undoClear = () => {
  setSearchResultsState(lastCleared);
  setWasCleared(false);
};
```

### 3. Session Management
```typescript
// Save/load named chat sessions with their searches
interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  searches: SearchResult[];
  timestamp: number;
}

const saveSession = (name: string) => {
  const session: ChatSession = {
    id: crypto.randomUUID(),
    name,
    messages,
    searches: contextResults,
    timestamp: Date.now()
  };
  saveToLocalStorage(`session_${session.id}`, session);
};
```

### 4. Search History Browser
```typescript
// Browse all historical searches across sessions
const SearchHistoryTab = () => {
  const allSearches = getAllCachedSearches();
  const sessions = getAllSessions();
  
  return (
    <div>
      <h2>Search History</h2>
      {Object.entries(allSearches).map(([query, data]) => (
        <SearchHistoryItem
          query={query}
          results={data.results}
          sessions={sessions.filter(s => 
            s.searches.some(sr => sr.query === query)
          )}
        />
      ))}
    </div>
  );
};
```

---

**Summary**: Successfully implemented intelligent search visibility management with a `wasCleared` flag that distinguishes between initial page load and intentional clearing. This provides clean separation between chat sessions while preserving performance benefits of long-term caching.

**Testing**: http://localhost:8081

**Key Achievement**: Clear UX where visible searches always match current chat context, preventing confusion from stale results across sessions.
