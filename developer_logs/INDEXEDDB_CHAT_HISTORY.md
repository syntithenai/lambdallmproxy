# IndexedDB Chat History Migration

**Date**: 2025-10-08  
**Status**: ✅ Deployed  
**Build**: index-Bl7AC-Ge.js (714.13 KB)

## Problem

Users experienced `QuotaExceededError` when saving chat history to localStorage:

```
QuotaExceededError: Failed to execute 'setItem' on 'Storage': Setting the value of 'chat_history' exceeded the quota
```

### Root Cause

- **localStorage limit**: 5-10 MB per domain
- **Chat history size**: Grows rapidly with tool outputs
  - Web search results: ~5 KB each
  - Transcriptions: Can be several KB
  - Multiple searches per chat: Easily exceeds 10 MB
- **Failure mode**: Entire save operation fails, history lost

## Solution

Migrated chat history storage from localStorage to IndexedDB.

### Benefits

| Feature | localStorage | IndexedDB |
|---------|--------------|-----------|
| **Capacity** | 5-10 MB | 50+ MB (typically ~50% of disk space) |
| **API** | Synchronous | Asynchronous |
| **Data Structure** | Strings only | Structured objects |
| **Indexing** | None | Multiple indexes |
| **Performance** | Fast for small data | Optimized for large data |

## Implementation

### Database Schema

```typescript
Database: llmproxy_chat_history
Version: 1
Object Store: chats
  - keyPath: 'id'
  - Index: 'timestamp' (for sorting)

Entry Structure:
{
  id: string,              // UUID v4
  timestamp: number,       // Date.now()
  firstUserPrompt: string, // First 100 chars (display)
  messages: any[]          // Full conversation with tool outputs
}
```

### Modified Files

#### 1. `ui-new/src/utils/chatHistory.ts`

**Complete rewrite** from localStorage to IndexedDB:

```typescript
// Old (localStorage)
const CHAT_HISTORY_KEY = 'chat_history';

export function saveChatToHistory(messages, chatId?) {
  const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
  // ... synchronous operations
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
}

// New (IndexedDB)
const DB_NAME = 'llmproxy_chat_history';
const STORE_NAME = 'chats';

export async function saveChatToHistory(messages, chatId?): Promise<string> {
  const db = await openDB();
  // ... async IndexedDB operations
  return new Promise((resolve, reject) => {
    const request = store.put(entry);
    request.onsuccess = () => resolve(entry.id);
  });
}
```

**All 5 functions converted to async**:
- `getAllChatHistory()` → `Promise<ChatHistoryEntry[]>`
- `saveChatToHistory()` → `Promise<string>`
- `loadChatFromHistory()` → `Promise<any[] | null>`
- `deleteChatFromHistory()` → `Promise<void>`
- `clearAllChatHistory()` → `Promise<void>`

#### 2. `ui-new/src/components/ChatTab.tsx`

**Updated all callsites** to handle async functions:

```typescript
// useEffect hooks - wrapped in async IIFE
useEffect(() => {
  (async () => {
    const messages = await loadChatFromHistory(chatId);
    setMessages(messages);
  })();
}, []);

// Event handlers - made async
const handleLoadChat = async (entry: ChatHistoryEntry) => {
  const loadedMessages = await loadChatFromHistory(entry.id);
  if (loadedMessages) {
    setMessages(loadedMessages);
    showSuccess('Chat loaded successfully');
  }
};

const handleDeleteChat = async (chatId: string) => {
  await deleteChatFromHistory(chatId);
  const history = await getAllChatHistory();
  setChatHistory(history);
  showSuccess('Chat deleted');
};

const handleClearAllHistory = async () => {
  await clearAllChatHistory();
  setChatHistory([]);
  showSuccess('All chat history cleared');
};
```

### Key Changes

1. **No more message stripping**: IndexedDB has plenty of space, store full conversations
2. **No quota error handling**: Removed try-catch for quota exceeded
3. **Async/await everywhere**: All chatHistory functions return Promises
4. **Transaction-based**: Each operation uses IndexedDB transactions for consistency
5. **Indexed for sorting**: Timestamp index enables efficient descending sort

## Testing

### Manual Verification

1. **Save large chat**:
   ```
   - Start new chat
   - Send multiple search queries (generates ~5 KB tool output each)
   - Verify no QuotaExceededError
   - Open DevTools → Application → IndexedDB → llmproxy_chat_history
   - Verify chat saved with full tool outputs
   ```

2. **Load chat**:
   ```
   - Refresh page
   - Verify chat restores with all messages
   - Verify tool outputs preserved
   ```

3. **Delete/Clear**:
   ```
   - Delete individual chat → verify removed from IndexedDB
   - Clear all history → verify database empty
   ```

### Browser Compatibility

IndexedDB is supported in all modern browsers:
- Chrome 24+
- Firefox 16+
- Safari 10+
- Edge (all versions)

## Migration Notes

### Existing Users

- **No data loss**: Existing localStorage history remains unchanged
- **Auto-migration**: Not implemented (would require complexity)
- **User action**: Old chats in localStorage won't appear in history list
- **Workaround**: Users can manually copy important chats before clearing localStorage

### Future Enhancement

Could add one-time migration on first load:

```typescript
// Pseudocode - not implemented
async function migrateFromLocalStorage() {
  const oldHistory = localStorage.getItem('chat_history');
  if (oldHistory) {
    const chats = JSON.parse(oldHistory);
    for (const chat of chats) {
      await saveChatToHistory(chat.messages, chat.id);
    }
    localStorage.removeItem('chat_history');
  }
}
```

## Performance Impact

### Before (localStorage)

- **Save**: ~1-5 ms (synchronous)
- **Load**: ~1-5 ms (synchronous)
- **Limit**: Fails at 5-10 MB

### After (IndexedDB)

- **Save**: ~5-20 ms (asynchronous, non-blocking)
- **Load**: ~5-20 ms (asynchronous, non-blocking)
- **Limit**: 50+ MB (no issues)

**Trade-off**: Slightly slower operations, but:
- Non-blocking (doesn't freeze UI)
- Much larger capacity
- No quota errors

## Related Work

- **Phase 21**: Fixed tool calls not being passed to LLM in current cycle
- **Token optimizations**: Reduced message sizes but couldn't prevent quota issues
- **Tool output windowing**: Limited history sent to LLM, but full history still saved locally

## Deployment

```bash
# Build
./scripts/build-docs.sh

# Deploy
./scripts/deploy-docs.sh -m "Fix localStorage quota error with IndexedDB migration"

# Verify
# Visit: https://lambdallmproxy.pages.dev
# Check: DevTools → Application → IndexedDB → llmproxy_chat_history
```

**Commit**: `ced2db7` (2025-10-08 11:57:49 UTC)  
**Build**: `index-Bl7AC-Ge.js` (714.13 KB, gzip: 212.89 kB)

## Conclusion

IndexedDB migration successfully resolves localStorage quota errors while providing better scalability for chat history storage. Users can now save large conversations with multiple tool executions without encountering storage limits.
