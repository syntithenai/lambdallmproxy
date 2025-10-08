# Fix: Restore Chat Thread on Page Reload

**Date**: 2025-01-08 05:13 UTC  
**Status**: ✅ DEPLOYED

## Problem

User reported: "I lose the current chat thread when I reload the page"

## Root Cause

After fixing the async storage race condition bug (which caused message disappearing), we replaced `useAsyncStorage` with plain `useState` for the messages array. This fixed the race condition but removed persistence entirely:

**Before (with bug)**:
```typescript
const messagesStorage = useAsyncStorage<ChatMessage[]>('chat_messages', []);
const messages = messagesStorage.value;
// ❌ Had race conditions but DID persist across reloads
```

**After race fix (no persistence)**:
```typescript
const [messages, setMessages] = useState<ChatMessage[]>([]);
// ✅ No race conditions but ❌ No persistence - messages lost on reload
```

## Analysis

The app already has a complete chat history system (`chatHistory.ts`) that saves full chat sessions with:
- Unique chat IDs
- First user prompt as title
- Full message arrays
- Timestamps

The auto-save was working - chats were being saved to localStorage. The problem was that **on page reload, no chat was being loaded**. The messages started empty.

## Solution

Implement a "last active chat" restoration system:

### 1. Track Last Active Chat ID

Store the current chat ID in localStorage whenever:
- Messages are auto-saved
- User switches to a different chat

### 2. Load Last Active Chat on Mount

Add a mount effect that:
- Reads `last_active_chat_id` from localStorage
- Loads that chat's messages
- Restores the chat state

### 3. Clear on New Chat

Remove the last active chat ID when:
- User clicks "New Chat" button
- User clicks an example (starts fresh)
- User clears history

## Implementation

### Changes to ChatTab.tsx

**1. Added `messagesLoaded` Flag** (line 56):
```typescript
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [messagesLoaded, setMessagesLoaded] = useState(false);
```

This prevents the auto-save effect from running during the initial load, avoiding a race condition between loading and saving.

**2. Load Last Chat on Mount** (lines 226-244):
```typescript
// Load last active chat on mount
useEffect(() => {
  if (!messagesLoaded) {
    try {
      const lastChatId = localStorage.getItem('last_active_chat_id');
      if (lastChatId) {
        const loadedMessages = loadChatFromHistory(lastChatId);
        if (loadedMessages && loadedMessages.length > 0) {
          console.log('📂 Restored chat session:', lastChatId, 
            'with', loadedMessages.length, 'messages');
          setMessages(loadedMessages);
          setCurrentChatId(lastChatId);
        }
      }
    } catch (error) {
      console.error('Error loading last chat:', error);
    }
    setMessagesLoaded(true);
  }
}, [messagesLoaded]);
```

**3. Update Auto-Save** (lines 246-257):
```typescript
// Auto-save chat history whenever messages change
useEffect(() => {
  if (messages.length > 0 && messagesLoaded) {  // Added messagesLoaded check
    const id = saveChatToHistory(messages, currentChatId || undefined);
    if (!currentChatId) {
      setCurrentChatId(id);
    }
    // Save as last active chat
    localStorage.setItem('last_active_chat_id', id);  // NEW
  }
}, [messages, currentChatId, messagesLoaded]);
```

**4. Update handleLoadChat** (line 1086):
```typescript
const handleLoadChat = (entry: ChatHistoryEntry) => {
  const loadedMessages = loadChatFromHistory(entry.id);
  if (loadedMessages) {
    setMessages(loadedMessages);
    setCurrentChatId(entry.id);
    localStorage.setItem('last_active_chat_id', entry.id);  // NEW
    setShowLoadDialog(false);
    showSuccess('Chat loaded successfully');
  }
};
```

**5. Update handleNewChat** (line 1117):
```typescript
const handleNewChat = () => {
  setMessages([]);
  setInput('');
  setSystemPrompt('');
  clearSearchResults();
  setExpandedToolMessages(new Set());
  setCurrentChatId(null);
  localStorage.removeItem('last_active_chat_id');  // NEW
  setTimeout(() => {
    inputRef.current?.focus();
  }, 0);
};
```

**6. Update handleExampleClick** (line 197):
```typescript
const handleExampleClick = (exampleText: string) => {
  // ... abort and reset code ...
  setCurrentChatId(null);
  localStorage.removeItem('last_active_chat_id');  // NEW
  clearAllToasts();
  setTimeout(() => handleSend(exampleText), 0);
};
```

## How It Works

### Page Load Flow

1. **Component mounts** → `messagesLoaded = false`
2. **Mount effect runs** → Check for `last_active_chat_id`
3. **If found** → Load messages from chat history
4. **Set state** → `setMessages()`, `setCurrentChatId()`, `messagesLoaded = true`
5. **Auto-save effect skipped** → Because `messagesLoaded` was false

### Normal Operation Flow

1. **User sends message** → Messages updated
2. **Auto-save effect runs** → `messagesLoaded = true`, save chat
3. **Update last active** → Store chat ID in localStorage
4. **Page reload** → Loads same chat ✅

### New Chat Flow

1. **User clicks "New Chat"** → Clear messages, remove `last_active_chat_id`
2. **User sends message** → Auto-save creates new chat ID
3. **Page reload** → Would load new chat (if it has messages)

### Example Click Flow

1. **User clicks example** → Clear messages, remove `last_active_chat_id`
2. **Example sent** → Auto-save creates new chat
3. **Page reload** → Loads the example chat ✅

## Benefits

✅ **Chat threads persist across page reloads** - No more lost conversations  
✅ **No race conditions** - messagesLoaded flag prevents conflicts  
✅ **Seamless UX** - Users don't even notice the reload  
✅ **Works with existing history** - Uses the built-in chat history system  
✅ **Clean state on new chat** - New chat button properly resets state  

## Edge Cases Handled

### Case 1: First Visit (No Last Chat)
```
1. Mount effect runs
2. localStorage.getItem('last_active_chat_id') → null
3. No messages loaded
4. User starts with empty chat ✅
```

### Case 2: Last Chat Deleted
```
1. Mount effect runs
2. last_active_chat_id exists
3. loadChatFromHistory() → null (deleted)
4. No messages loaded
5. User starts with empty chat ✅
```

### Case 3: Rapid Reload During Streaming
```
1. Messages being streamed
2. Auto-save triggers with partial messages
3. User reloads page
4. Partial messages loaded
5. User can continue or start new chat ✅
```

### Case 4: Multiple Tabs
```
1. Tab A: User sends messages
2. Tab A auto-saves, updates last_active_chat_id
3. Tab B: User reloads
4. Tab B loads same chat as Tab A ✅
```

Note: Multiple tabs will share the same "last active chat" - whichever tab last updated it.

## Testing Instructions

1. **Hard refresh** (Ctrl+Shift+R) to load `index-Bxn1W8W8.js`

2. **Test Basic Persistence**:
   ```
   1. Send a message: "Hello"
   2. See response
   3. Reload page (F5)
   4. ✅ Chat should still be visible
   ```

3. **Test New Chat**:
   ```
   1. Have a chat with messages
   2. Click "New Chat" button
   3. Reload page (F5)
   4. ✅ Should start with empty chat
   ```

4. **Test Example Click**:
   ```
   1. Have a chat with messages
   2. Click an example
   3. See example response
   4. Reload page (F5)
   5. ✅ Should show the example chat
   ```

5. **Test Load Different Chat**:
   ```
   1. Have multiple chats in history
   2. Click "Load Chat", select different chat
   3. See that chat loaded
   4. Reload page (F5)
   5. ✅ Should still show the loaded chat
   ```

6. **Check Console Logs**:
   ```
   📂 Restored chat session: chat_1234567890_abc with 4 messages
   ```

## Known Limitations

1. **LLM API Calls Not Persisted**: The `llmApiCalls` field on messages includes function objects that cannot be serialized to JSON. When reloading, LLM transparency blocks may not show.

   **Solution**: Either:
   - Strip function references before saving
   - Or document that LLM transparency is session-only

2. **Streaming State Lost**: If page reloads during streaming, the partial message is saved but streaming doesn't resume.

   **Behavior**: User sees partial message, can continue conversation or start new chat.

3. **Multiple Tabs Share Last Active**: If you have multiple tabs open, they all share the same "last active chat ID". Reloading any tab will load whichever chat was most recently active across all tabs.

   **Workaround**: Use "Load Chat" to explicitly switch chats.

## Build & Deployment

**Build**:
```bash
cd ui-new && npm run build
```

**Output**:
- File: `docs/assets/index-Bxn1W8W8.js` (708.64 KB)
- Build time: 2.14s

**Deploy**:
```bash
bash scripts/deploy-docs.sh -m "feat: Restore last active chat on page reload using localStorage"
```

**Deployed at**: 2025-01-08 05:13 UTC  
**Git commit**: `b6bd3e0`  
**Branch**: `agent`

## Files Modified

1. `ui-new/src/components/ChatTab.tsx`:
   - Line 56: Added `messagesLoaded` state flag
   - Lines 226-244: Added mount effect to load last chat
   - Lines 246-257: Updated auto-save to store last_active_chat_id and check messagesLoaded
   - Line 1086: Updated handleLoadChat to store last_active_chat_id
   - Line 1117: Updated handleNewChat to clear last_active_chat_id
   - Line 197: Updated handleExampleClick to clear last_active_chat_id

## Related Issues

This fixes the regression from replacing `useAsyncStorage` with `useState`. The async storage had race conditions causing message disappearing, so we removed it. This change restores persistence without bringing back the race conditions.

## Status

✅ **RESOLVED** - Chat threads now persist across page reloads. The last active chat is automatically restored when the page loads, providing a seamless user experience.
