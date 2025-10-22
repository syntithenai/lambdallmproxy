# Chat History Multi-Select & Planning UI Improvements

**Date**: October 15, 2025  
**Status**: ✅ Deployed  
**Commit**: 39c7330

## Summary

Implemented two feature improvements:
1. **Chat History**: Added multi-select checkboxes with bulk delete functionality
2. **Planning UI**: Removed blue section, replaced with editable user message field, and made textareas auto-resize

## Changes

### 1. Chat History Multi-Select (ChatTab.tsx)

#### New State
```typescript
const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
```

#### New Handler Functions
```typescript
// Toggle individual chat selection
const handleToggleChatSelection = (chatId: string) => {
  const newSelection = new Set(selectedChatIds);
  if (newSelection.has(chatId)) {
    newSelection.delete(chatId);
  } else {
    newSelection.add(chatId);
  }
  setSelectedChatIds(newSelection);
};

// Select all chats
const handleSelectAllChats = () => {
  const allIds = new Set(chatHistory.map(entry => entry.id));
  setSelectedChatIds(allIds);
};

// Deselect all chats
const handleSelectNoneChats = () => {
  setSelectedChatIds(new Set());
};

// Delete all selected chats
const handleDeleteSelectedChats = async () => {
  if (selectedChatIds.size === 0) return;
  
  const count = selectedChatIds.size;
  for (const chatId of selectedChatIds) {
    await deleteChatFromHistory(chatId);
  }
  
  const history = await getAllChatHistory();
  setChatHistory(history);
  setSelectedChatIds(new Set());
  showSuccess(`${count} chat${count > 1 ? 's' : ''} deleted`);
};
```

#### UI Changes

**Header** - Added Select All/None buttons:
```tsx
<div className="flex justify-between items-center mb-4">
  <h3 className="text-xl font-bold">Chat History</h3>
  {chatHistory.length > 0 && (
    <div className="flex gap-2">
      <button onClick={handleSelectAllChats} className="btn-secondary text-xs">
        ☑️ Select All
      </button>
      <button onClick={handleSelectNoneChats} className="btn-secondary text-xs">
        ☐ Select None
      </button>
    </div>
  )}
</div>
```

**Chat Items** - Added checkboxes:
```tsx
<div className={`border ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'} rounded-lg p-3`}>
  <div className="flex items-start gap-3">
    {/* Checkbox */}
    <input
      type="checkbox"
      checked={isSelected}
      onChange={() => handleToggleChatSelection(entry.id)}
      className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
    />
    
    {/* Chat info and buttons */}
    ...
  </div>
</div>
```

**Footer** - Added Delete Selected button:
```tsx
<div className="flex gap-2 mt-4">
  {selectedChatIds.size > 0 && (
    <button
      onClick={handleDeleteSelectedChats}
      className="btn-secondary text-red-600 dark:text-red-400"
    >
      🗑️ Delete Selected ({selectedChatIds.size})
    </button>
  )}
  {/* Other buttons */}
</div>
```

#### Features
- ✅ Checkboxes for each chat entry
- ✅ Visual indication when selected (blue border + background)
- ✅ Select All button in header
- ✅ Select None button in header
- ✅ Delete Selected button in footer (disabled when none selected)
- ✅ Shows count of selected items: "Delete Selected (3)"
- ✅ Success message after deletion: "3 chats deleted"
- ✅ Selection cleared after deletion
- ✅ Selection cleared when dialog closes

### 2. Planning UI Improvements (PlanningDialog.tsx)

#### Changes Made

**Before** - Blue system prompt section:
```tsx
{systemPrompt && (
  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
    <h4 className="font-semibold mb-2 text-blue-800 dark:text-blue-300">
      System Prompt (Editable):
    </h4>
    <textarea ... />
  </div>
)}
```

**After** - Neutral card styling + editable user message:
```tsx
{/* Editable System Prompt */}
{systemPrompt && (
  <div className="card p-4">
    <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">
      System Prompt (Editable):
    </h4>
    <textarea
      ref={systemPromptTextareaRef}
      value={systemPrompt}
      onChange={(e) => setSystemPrompt(e.target.value)}
      className="input-field resize-none overflow-hidden w-full"
      style={{ minHeight: '96px' }}
    />
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
      This defines the AI's role and behavior. Edit as needed before transferring to chat.
    </p>
  </div>
)}

{/* Editable User Message */}
<div className="card p-4">
  <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">
    User Message (Editable):
  </h4>
  <textarea
    ref={queryTextareaRef}
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    className="input-field resize-none overflow-hidden w-full"
    style={{ minHeight: '96px' }}
  />
  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
    This is the message that will be sent to the chat. Edit to refine your query.
  </p>
</div>
```

#### Auto-Resize Implementation

Already had refs and auto-resize logic:
```typescript
// Refs for auto-resizing textareas
const queryTextareaRef = useRef<HTMLTextAreaElement>(null);
const systemPromptTextareaRef = useRef<HTMLTextAreaElement>(null);

// Auto-resize function for textareas
const autoResize = (textarea: HTMLTextAreaElement | null) => {
  if (textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }
};

// Auto-resize query textarea when query changes
useEffect(() => {
  autoResize(queryTextareaRef.current);
}, [query]);

// Auto-resize system prompt textarea when it changes
useEffect(() => {
  autoResize(systemPromptTextareaRef.current);
}, [systemPrompt]);
```

Both textareas use:
- `resize-none` - Prevents manual resize
- `overflow-hidden` - Hides scrollbar
- `minHeight: '96px'` - Minimum height
- Auto-resize on content change via useEffect

#### Features
- ✅ Removed blue background from system prompt section
- ✅ Changed to neutral card styling (same as other cards)
- ✅ Added editable user message field
- ✅ Both textareas auto-expand with content
- ✅ Both textareas have clear labels and descriptions
- ✅ Consistent styling across all cards
- ✅ Both fields use the same auto-resize mechanism

## User Experience Improvements

### Chat History
1. **Bulk Actions**: Users can now select multiple chats and delete them all at once
2. **Quick Selection**: Select All/None buttons for rapid selection
3. **Visual Feedback**: Selected chats have blue border and background
4. **Count Display**: Shows how many items are selected
5. **Smart Buttons**: Delete Selected only appears when items are selected

### Planning UI
1. **Consistency**: Removed special blue styling, all cards now consistent
2. **Flexibility**: Users can edit both system and user messages
3. **Better UX**: Auto-expanding textareas adapt to content
4. **Clear Labels**: Each field clearly labeled with purpose
5. **Context**: Helper text explains what each field does

## Files Modified

### ui-new/src/components/ChatTab.tsx
- Line 87: Added `selectedChatIds` state
- Lines 2506-2539: Added selection handler functions
- Lines 4381-4473: Updated chat history dialog UI

### ui-new/src/components/PlanningDialog.tsx
- Lines 330-353: Replaced blue system prompt section with neutral card + added user message editor

## Testing Checklist

- [ ] Chat History
  - [ ] Checkboxes appear for each chat
  - [ ] Clicking checkbox toggles selection
  - [ ] Selected chats show blue border/background
  - [ ] Select All button selects all chats
  - [ ] Select None button deselects all
  - [ ] Delete Selected button appears when items selected
  - [ ] Delete Selected removes all selected chats
  - [ ] Success message shows correct count
  - [ ] Selection clears after deletion

- [ ] Planning UI
  - [ ] No blue background on system prompt
  - [ ] System prompt textarea is editable
  - [ ] System prompt auto-expands with content
  - [ ] User message field appears
  - [ ] User message textarea is editable
  - [ ] User message auto-expands with content
  - [ ] Both fields transfer correctly to chat
  - [ ] Helper text clearly explains each field

## Deployment

**Build**: ✅ Successful (11.89s)
```bash
cd ui-new && npm run build
```

**Deploy**: ✅ Deployed
```bash
./scripts/deploy-docs.sh -m "feat: Add multi-select to chat history + editable user message in planning"
```

**Commit**: 39c7330  
**Branch**: agent  
**Production**: https://lambdallmproxy.pages.dev

## Future Enhancements

### Chat History
- [ ] Add "Select Page" for paginated lists
- [ ] Add keyboard shortcuts (Ctrl+A for select all, Del for delete)
- [ ] Add undo for deletion
- [ ] Add export selected chats
- [ ] Add search/filter with multi-select

### Planning UI
- [ ] Add template system for common planning scenarios
- [ ] Add save/load for user message templates
- [ ] Add preview of final message before transfer
- [ ] Add character count for both fields
- [ ] Add formatting toolbar for markdown

## Notes

- The auto-resize functionality was already implemented, just needed to reuse it
- Selection state is cleared on dialog close (via component unmount)
- Delete operations are async but UI updates immediately after all deletions
- User message field uses the existing `query` state variable
- Both textareas have minimum height of 96px for consistency

---

**Status**: ✅ Complete and Deployed  
**Production URL**: https://lambdallmproxy.pages.dev
