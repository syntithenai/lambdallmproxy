# Planning Interface Flow and Persistence Plan

## Current State Analysis

### Components Involved
1. **PlanningDialog.tsx** - Modal dialog for creating research plans
2. **PlanningTab.tsx** - Dedicated tab for planning (if exists)
3. **ChatTab.tsx** - Chat interface that receives planning data
4. **chatHistoryDB.ts** - IndexedDB storage for chat history

### Current Data Flow
1. User enters planning query in PlanningDialog
2. Backend generates plan with:
   - `enhancedSystemPrompt` (for system message)
   - `enhancedUserPrompt` (for user message)
3. Generated prompts stored in localStorage:
   - `planning_dialog_generated_system_prompt`
   - `planning_dialog_generated_user_query`
4. User can edit prompts in dialog
5. "Transfer to Chat" sends both prompts to ChatTab
6. ChatTab applies system prompt to chat context

### Current Storage Issues
- **System prompts**: Stored globally in localStorage (`chat_system_prompt`)
- **Planning prompts**: Stored globally in localStorage (dialog-specific keys)
- **Chat history**: Only saves `messages` array, not system/planning context
- **No association**: System and planning prompts not tied to specific chats
- **Persistence gap**: Loading a chat doesn't restore its planning context

---

## Requirements

### 1. Planning Prompt Generation & Editing
- ✅ Planning interface generates system prompt
- ✅ System prompt is editable on planning page
- ❌ Prompts need to be saved with chat history
- ❌ Prompts need to be loaded with chat history

### 2. New Chat Behavior
- ✅ Creating new chat clears messages
- ⚠️ Should also clear system and planning prompts (currently only system prompt)
- ❌ Planning prompt source needs to be cleared

### 3. Clear Button in Planning Dialog
Should clear:
- ❌ System prompt (generated)
- ❌ Generated system prompt display
- ❌ Planning prompt (user input)
- ❌ Generated user response

### 4. Chat History Integration
- ❌ Save system prompt with each chat
- ❌ Save planning prompt with each chat
- ❌ Load both prompts when loading chat
- ❌ Maintain backward compatibility with existing chats

---

## Proposed Solution

### Phase 1: Extend Chat History Schema

**Update `ChatHistoryEntry` interface** in `chatHistoryDB.ts`:
```typescript
export interface ChatHistoryEntry {
  id: string;
  messages: any[];
  timestamp: number;
  title?: string;
  // NEW FIELDS:
  systemPrompt?: string;           // User-edited system prompt
  planningQuery?: string;           // Original planning query input
  generatedSystemPrompt?: string;   // Generated system prompt from planning
  generatedUserQuery?: string;      // Generated user query from planning
}
```

**Benefits**:
- Stores complete planning context per chat
- Backward compatible (all fields optional)
- Preserves both original and edited prompts

### Phase 2: Update Save Operations

**Modify `saveChatToHistory` wrapper** in `ChatTab.tsx`:

Currently calls:
```typescript
await chatHistoryDB.saveChat(id, messages, title);
```

Should call:
```typescript
await chatHistoryDB.saveChat(id, messages, title, {
  systemPrompt: systemPrompt,
  planningQuery: originalPlanningQuery,
  generatedSystemPrompt: generatedSystemPromptFromPlanning,
  generatedUserQuery: generatedUserQueryFromPlanning
});
```

**New state variables needed in ChatTab**:
```typescript
const [originalPlanningQuery, setOriginalPlanningQuery] = useState<string>('');
const [generatedSystemPromptFromPlanning, setGeneratedSystemPromptFromPlanning] = useState<string>('');
const [generatedUserQueryFromPlanning, setGeneratedUserQueryFromPlanning] = useState<string>('');
```

### Phase 3: Update Load Operations

**Modify `loadChatFromHistory` wrapper** in `ChatTab.tsx`:

Currently returns:
```typescript
const messages = await chatHistoryDB.getChat(id);
```

Should return:
```typescript
const chatData = await chatHistoryDB.getChatWithMetadata(id);
// Returns: { messages, systemPrompt?, planningQuery?, ... }
```

**Then restore state**:
```typescript
setMessages(chatData.messages);
setSystemPrompt(chatData.systemPrompt || '');
setOriginalPlanningQuery(chatData.planningQuery || '');
setGeneratedSystemPromptFromPlanning(chatData.generatedSystemPrompt || '');
setGeneratedUserQueryFromPlanning(chatData.generatedUserQuery || '');
```

### Phase 4: Update PlanningDialog Clear Button

**Current `handleCreateNewPlan` function**:
```typescript
const handleCreateNewPlan = () => {
  setQuery('');
  setResult(null);
  setGeneratedSystemPrompt('');
  setGeneratedUserQuery('');
};
```

**Rename and enhance to `handleClear`**:
```typescript
const handleClear = () => {
  // Clear planning input
  setQuery('');
  
  // Clear planning results
  setResult(null);
  
  // Clear generated prompts
  setGeneratedSystemPrompt('');
  setGeneratedUserQuery('');
  
  // Clear from localStorage
  localStorage.removeItem('planning_dialog_generated_system_prompt');
  localStorage.removeItem('planning_dialog_generated_user_query');
  localStorage.removeItem('planning_query');
  localStorage.removeItem('planning_result');
  
  console.log('Planning dialog cleared completely');
};
```

**Update button**:
```tsx
<button 
  onClick={handleClear}
  className="btn-secondary text-sm"
  title="Clear all planning data and start fresh"
>
  Clear All
</button>
```

### Phase 5: Update New Chat Button

**Current `handleNewChat` function**:
```typescript
const handleNewChat = () => {
  setMessages([]);
  setInput('');
  setSystemPrompt('');
  clearSearchResults();
  setExpandedToolMessages(new Set());
  setCurrentChatId(null);
  localStorage.removeItem('last_active_chat_id');
  setTimeout(() => inputRef.current?.focus(), 0);
};
```

**Enhanced version**:
```typescript
const handleNewChat = () => {
  // Clear chat messages
  setMessages([]);
  setInput('');
  
  // Clear system and planning prompts
  setSystemPrompt('');
  setOriginalPlanningQuery('');
  setGeneratedSystemPromptFromPlanning('');
  setGeneratedUserQueryFromPlanning('');
  
  // Clear search and UI state
  clearSearchResults();
  setExpandedToolMessages(new Set());
  
  // Start new chat session
  setCurrentChatId(null);
  localStorage.removeItem('last_active_chat_id');
  
  // Focus input
  setTimeout(() => inputRef.current?.focus(), 0);
  
  console.log('Started new chat - all prompts cleared');
};
```

### Phase 6: Update Transfer to Chat Flow

**Current transfer (in PlanningDialog)**:
```typescript
const handleTransferToChat = () => {
  if (!generatedUserQuery || !onTransferToChat) return;
  
  const transferData = {
    prompt: generatedUserQuery,
    persona: generatedSystemPrompt || ''
  };
  
  onTransferToChat(JSON.stringify(transferData));
  onClose();
};
```

**Enhanced transfer**:
```typescript
const handleTransferToChat = () => {
  if (!generatedUserQuery || !onTransferToChat) return;
  
  const transferData = {
    prompt: generatedUserQuery,
    persona: generatedSystemPrompt || '',
    // NEW: Include planning context
    planningQuery: query,
    generatedSystemPrompt: generatedSystemPrompt,
    generatedUserQuery: generatedUserQuery
  };
  
  onTransferToChat(JSON.stringify(transferData));
  onClose();
};
```

**Update receiver in ChatTab** (around line 787):
```typescript
if (transferFromPlanning) {
  try {
    const transferData = JSON.parse(transferFromPlanning);
    
    // Apply prompts
    if (transferData.persona) {
      setSystemPrompt(transferData.persona);
    }
    
    // NEW: Store planning context
    if (transferData.planningQuery) {
      setOriginalPlanningQuery(transferData.planningQuery);
    }
    if (transferData.generatedSystemPrompt) {
      setGeneratedSystemPromptFromPlanning(transferData.generatedSystemPrompt);
    }
    if (transferData.generatedUserQuery) {
      setGeneratedUserQueryFromPlanning(transferData.generatedUserQuery);
    }
    
    // Start a new chat with this context
    setCurrentChatId(null);
    localStorage.removeItem('last_active_chat_id');
    
    if (transferData.prompt) {
      setInput(transferData.prompt);
    }
    
    setTransferFromPlanning('');
  } catch (e) {
    console.error('Failed to parse transfer data:', e);
  }
}
```

---

## Implementation Checklist

### Database Layer (chatHistoryDB.ts)
- [ ] Add optional fields to `ChatHistoryEntry` interface
- [ ] Update `saveChat()` to accept metadata parameter
- [ ] Create `getChatWithMetadata()` that returns full chat object
- [ ] Maintain backward compatibility for old chats
- [ ] Add migration script if needed

### Chat Component (ChatTab.tsx)
- [ ] Add state variables for planning context
- [ ] Update auto-save to include planning metadata
- [ ] Update load to restore planning metadata
- [ ] Update `handleNewChat()` to clear planning prompts
- [ ] Update transfer receiver to store planning context
- [ ] Add UI indicator when chat has planning context

### Planning Dialog (PlanningDialog.tsx)
- [ ] Rename "Create New Plan" to "Clear All"
- [ ] Update clear handler to reset everything
- [ ] Update transfer to include full planning context
- [ ] Add confirmation dialog for clear action

### Testing
- [ ] Test saving chat with planning context
- [ ] Test loading chat with planning context
- [ ] Test loading old chats without planning context
- [ ] Test "New Chat" clears planning prompts
- [ ] Test "Clear All" in planning dialog
- [ ] Test transfer from planning to chat
- [ ] Test editing system prompt preserves planning query

---

## User Stories

### Story 1: Research Planning Workflow
1. User opens Planning Dialog
2. Enters query: "Compare TypeScript vs JavaScript for backend"
3. Gets generated system and user prompts
4. Edits system prompt to add preferences
5. Transfers to chat
6. Chat saves messages WITH planning context
7. User can see planning origin in chat history

### Story 2: Resume Research Session
1. User loads chat from history
2. Chat restores:
   - Messages
   - Current system prompt
   - Original planning query
   - Generated prompts
3. User can see what planning query created this chat
4. User can re-open planning with original context

### Story 3: Start Fresh
1. User in active chat with planning context
2. Clicks "New Chat"
3. All prompts cleared
4. Clean slate for new conversation

### Story 4: Clear Planning Dialog
1. User in Planning Dialog with generated prompts
2. Clicks "Clear All"
3. Query, results, and both prompts cleared
4. localStorage cleaned up
5. Ready for new planning query

---

## Migration Strategy

### Backward Compatibility
- All new fields are optional
- Old chats load normally (prompts default to empty)
- No breaking changes to existing storage
- Gradual migration as chats are re-saved

### Optional: One-time Migration
```typescript
async function migrateChatsToIncludePrompts() {
  const allChats = await chatHistoryDB.getAllChats();
  
  for (const chat of allChats) {
    // If chat doesn't have prompt fields, add them
    if (!chat.systemPrompt) {
      await chatHistoryDB.saveChat(
        chat.id,
        chat.messages,
        chat.title,
        {
          systemPrompt: '',
          planningQuery: '',
          generatedSystemPrompt: '',
          generatedUserQuery: ''
        }
      );
    }
  }
}
```

---

## Benefits

1. **Complete Context Preservation**: Every chat remembers its planning origin
2. **Reproducible Research**: Can see original query that generated prompts
3. **Clean Slate**: New chat properly clears planning context
4. **Audit Trail**: Understand what planning led to what conversations
5. **Better Organization**: Chats grouped by research topics
6. **User Clarity**: Clear understanding of prompt sources

---

## Open Questions

1. **Should system prompt edits be tracked separately?**
   - Original generated prompt vs user-edited version?
   
2. **UI for viewing planning context in chat?**
   - Show badge "From Planning: [query]"?
   - Collapsible section showing planning origin?
   
3. **Bulk operations?**
   - "Clear all planning-based chats"?
   - "Export chats with their planning queries"?

4. **Search/filter by planning query?**
   - Find all chats from specific research topics?

---

## Timeline Estimate

- **Phase 1** (Database): 1-2 hours
- **Phase 2** (Save): 1 hour
- **Phase 3** (Load): 1 hour
- **Phase 4** (Clear Button): 30 minutes
- **Phase 5** (New Chat): 30 minutes
- **Phase 6** (Transfer): 1 hour
- **Testing**: 2 hours

**Total: 7-8 hours**

---

## Success Criteria

✅ System and planning prompts saved with each chat
✅ Prompts restored when loading chat from history
✅ New Chat clears all prompts
✅ Clear button in Planning Dialog clears everything
✅ No breaking changes to existing chats
✅ Clear user feedback for all operations
✅ Complete audit trail of planning-to-chat flow
