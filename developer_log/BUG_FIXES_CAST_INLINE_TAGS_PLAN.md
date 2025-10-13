# Bug Fixes - Cast Scroll & Inline Tags - Implementation Plan

**Date:** October 14, 2025  
**Status:** 📋 Planning  
**Priority:** High (User-reported bugs)

---

## Issues to Fix

### Issue 1: Cast Does Not Scroll with Sending Device

**Problem**: When user scrolls in the web app, the Chromecast TV display doesn't sync the scroll position.

**Current State**:
- CastContext has `sendScrollPosition()` function implemented
- Receiver has `SCROLL_UPDATE` message handler implemented  
- **BUT**: ChatTab never calls `sendScrollPosition()`

**Root Cause**: Missing scroll event listener in ChatTab

**Impact**: Medium - TV always auto-scrolls to bottom, can't view older messages in sync with sender

---

### Issue 2: Tag Selector Dialog in Snippets

**Problem**: Each snippet has a "+" button that opens a tag dialog. User wants inline tag management instead.

**Current State**:
- "+" button in snippet (line 604-620) opens showTagDialog
- Tag dialog is bulk operations dialog (lines 889-996)
- Recently created TagAutocomplete component for edit dialog

**Desired State**:
- Remove "+" button
- Add inline TagAutocomplete directly in each snippet block
- Similar to edit dialog but smaller/more compact

**Impact**: High - Better UX, consistency with edit dialog

---

## Implementation Plan

### Phase 1: Fix Cast Scroll Sync (1-2 hours)

**Goal**: Sync scroll position from web app to Chromecast TV

#### Task 1.1: Add Scroll Listener to ChatTab

**File**: `ui-new/src/components/ChatTab.tsx`

**Changes**:
1. Import `sendScrollPosition` from `useCast()`
2. Add ref to messages container
3. Add scroll event listener
4. Debounce scroll events (avoid flooding)
5. Send scroll position when user scrolls manually

**Code**:
```typescript
const messagesEndRef = useRef<HTMLDivElement>(null);
const messagesContainerRef = useRef<HTMLDivElement>(null);
const { isCastConnected, sendCastMessages, sendScrollPosition } = useCast();

// Debounced scroll handler
const handleScroll = useCallback(() => {
  if (!isCastConnected || !messagesContainerRef.current) return;
  
  const container = messagesContainerRef.current;
  const scrollPosition = container.scrollTop;
  
  // Send scroll position to cast device
  sendScrollPosition(scrollPosition);
}, [isCastConnected, sendScrollPosition]);

// Add scroll listener with debouncing
useEffect(() => {
  if (!isCastConnected || !messagesContainerRef.current) return;
  
  const container = messagesContainerRef.current;
  let timeoutId: NodeJS.Timeout;
  
  const debouncedScroll = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleScroll, 100); // 100ms debounce
  };
  
  container.addEventListener('scroll', debouncedScroll);
  
  return () => {
    container.removeEventListener('scroll', debouncedScroll);
    clearTimeout(timeoutId);
  };
}, [isCastConnected, handleScroll]);
```

**Update JSX**:
```tsx
<div 
  ref={messagesContainerRef}
  className="flex-1 overflow-y-auto p-4 space-y-4"
>
  {/* messages */}
  <div ref={messagesEndRef} />
</div>
```

#### Task 1.2: Test Scroll Sync

**Testing Steps**:
1. Connect to Chromecast
2. Send several messages to create scrollable content
3. Scroll up in web app
4. Verify TV scrolls to same position
5. Scroll down in web app
6. Verify TV scrolls down
7. Let auto-scroll re-enable after 2 seconds
8. Send new message
9. Verify TV auto-scrolls to bottom

**Acceptance Criteria**:
- ✅ TV scrolls when web app scrolls
- ✅ Scroll position matches within 10-20px
- ✅ No lag or jank during scrolling
- ✅ Auto-scroll re-enables after user stops scrolling
- ✅ New messages still auto-scroll

---

### Phase 2: Inline Tag Management in Snippets (2-3 hours)

**Goal**: Replace "+" button with inline TagAutocomplete in each snippet block

#### Task 2.1: Add TagAutocomplete to Snippet Display

**File**: `ui-new/src/components/SwagPage.tsx`

**Current UI** (lines 596-623):
```tsx
<div className="flex flex-wrap items-center gap-1.5 mb-2">
  {(snippet.tags || []).map((tag, idx) => (
    <span key={idx} className="px-2 py-0.5 text-xs bg-blue-100 ...">
      {tag}
    </span>
  ))}
  <button onClick={...} className="w-5 h-5 ...">
    + {/* Add tags button */}
  </button>
</div>
```

**New UI**:
```tsx
<div className="mb-2">
  {/* Existing Tags (compact display) */}
  {(snippet.tags || []).length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
      {(snippet.tags || []).map((tag, idx) => (
        <span 
          key={idx} 
          className="group px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center gap-1"
        >
          {tag}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTagToDelete(tag);
              setSnippetToEdit(snippet.id);
              setShowDeleteTagConfirm(true);
            }}
            className="opacity-60 hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-opacity"
            title="Remove tag"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )}
  
  {/* Inline Tag Input (compact) */}
  <TagAutocomplete
    existingTags={getAllTags()}
    currentTags={snippet.tags || []}
    onAddTag={(tag) => {
      updateSnippet(snippet.id, {
        tags: [...(snippet.tags || []), tag]
      });
    }}
    placeholder="Add tag..."
    className="text-xs"
  />
</div>
```

#### Task 2.2: Add State for Tag Deletion

**Add State Variables**:
```typescript
const [snippetToEdit, setSnippetToEdit] = useState<string | null>(null);
```

**Update Delete Handler**:
```typescript
<ConfirmDialog
  isOpen={showDeleteTagConfirm}
  title="Remove Tag?"
  message={`Remove tag "${tagToDelete}" from this snippet?`}
  confirmLabel="Remove Tag"
  cancelLabel="Cancel"
  variant="danger"
  onConfirm={() => {
    if (tagToDelete && snippetToEdit) {
      const snippet = snippets.find(s => s.id === snippetToEdit);
      if (snippet) {
        updateSnippet(snippetToEdit, {
          tags: (snippet.tags || []).filter(t => t !== tagToDelete)
        });
      }
      setShowDeleteTagConfirm(false);
      setTagToDelete(null);
      setSnippetToEdit(null);
    }
  }}
  onCancel={() => {
    setShowDeleteTagConfirm(false);
    setTagToDelete(null);
    setSnippetToEdit(null);
  }}
/>
```

#### Task 2.3: Remove Tag Dialog References

**Files to Update**:
- Remove "+" button (lines 604-620)
- Remove tag dialog open logic for individual snippets (lines 606-616)
- Keep bulk tag dialog for multi-select operations

**Bulk Operations Still Available**:
- Select multiple snippets
- Use toolbar buttons for bulk add/remove tags
- Tag dialog still used for bulk operations

#### Task 2.4: Style Adjustments

**Compact TagAutocomplete Styles**:
```tsx
<TagAutocomplete
  existingTags={getAllTags()}
  currentTags={snippet.tags || []}
  onAddTag={(tag) => {...}}
  placeholder="Add tag..."
  className="text-xs max-w-xs" // Smaller font, limited width
/>
```

**Update TagAutocomplete.tsx**:
- Add support for smaller size via className
- Ensure compact dropdown for inline use
- Adjust padding/spacing for inline context

#### Task 2.5: Update Mobile Responsiveness

**Mobile Considerations**:
- Tag input might be too wide on mobile
- Consider making it full width on mobile
- Ensure touch-friendly

**Responsive Classes**:
```tsx
className="text-xs w-full sm:max-w-xs"
```

---

## Detailed Code Changes

### Change 1: ChatTab.tsx - Add Scroll Sync

**Location**: `ui-new/src/components/ChatTab.tsx`

**Import Changes**:
```typescript
// Add to existing imports
import { useRef, useCallback } from 'react';
```

**Add Refs**:
```typescript
// Around line 30-40, with other refs
const messagesContainerRef = useRef<HTMLDivElement>(null);
```

**Update useCast Hook**:
```typescript
// Around line 60-70
const { 
  isCastConnected, 
  sendCastMessages,
  sendScrollPosition  // ADD THIS
} = useCast();
```

**Add Scroll Handler**:
```typescript
// After other useCallbacks, around line 400-450
const handleScroll = useCallback(() => {
  if (!isCastConnected || !messagesContainerRef.current) return;
  
  const container = messagesContainerRef.current;
  const scrollPosition = container.scrollTop;
  
  sendScrollPosition(scrollPosition);
}, [isCastConnected, sendScrollPosition]);
```

**Add Scroll Listener Effect**:
```typescript
// After existing useEffects, around line 450-500
useEffect(() => {
  if (!isCastConnected || !messagesContainerRef.current) return;
  
  const container = messagesContainerRef.current;
  let timeoutId: NodeJS.Timeout;
  
  const debouncedScroll = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleScroll, 100);
  };
  
  container.addEventListener('scroll', debouncedScroll);
  
  return () => {
    container.removeEventListener('scroll', debouncedScroll);
    clearTimeout(timeoutId);
  };
}, [isCastConnected, handleScroll]);
```

**Update Messages Container JSX**:
```typescript
// Find the messages container div (around line 1100-1200)
// Current:
<div className="flex-1 overflow-y-auto p-4 space-y-4">

// Change to:
<div 
  ref={messagesContainerRef}
  className="flex-1 overflow-y-auto p-4 space-y-4"
>
```

---

### Change 2: SwagPage.tsx - Inline Tags

**Location**: `ui-new/src/components/SwagPage.tsx`

**Add State Variable**:
```typescript
// Around line 50-55, after showDeleteTagConfirm
const [snippetToEdit, setSnippetToEdit] = useState<string | null>(null);
```

**Replace Snippet Tags Section** (lines 596-623):

**OLD CODE**:
```tsx
{/* Tags */}
<div className="flex flex-wrap items-center gap-1.5 mb-2">
  {(snippet.tags || []).map((tag, idx) => (
    <span 
      key={idx}
      className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full"
    >
      {tag}
    </span>
  ))}
  <button
    onClick={(e) => {
      e.stopPropagation();
      selectNone();
      toggleSelection(snippet.id);
      setTimeout(() => {
        setTagDialogMode('add');
        setSelectedTagsForOperation([]);
        setShowTagDialog(true);
      }, 50);
    }}
    className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-colors flex-shrink-0"
    title="Add tags"
  >
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  </button>
</div>
```

**NEW CODE**:
```tsx
{/* Tags Section */}
<div className="mb-2">
  {/* Existing Tags (compact chips with delete) */}
  {(snippet.tags || []).length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
      {(snippet.tags || []).map((tag, idx) => (
        <span 
          key={idx}
          className="group px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center gap-1"
        >
          {tag}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTagToDelete(tag);
              setSnippetToEdit(snippet.id);
              setShowDeleteTagConfirm(true);
            }}
            className="opacity-60 hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-opacity"
            title="Remove tag"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )}
  
  {/* Inline Tag Autocomplete */}
  <TagAutocomplete
    existingTags={getAllTags()}
    currentTags={snippet.tags || []}
    onAddTag={(tag) => {
      updateSnippet(snippet.id, {
        tags: [...(snippet.tags || []), tag]
      });
      showSuccess(`Added tag "${tag}"`);
    }}
    placeholder="Add tag..."
    className="text-xs w-full sm:max-w-xs"
  />
</div>
```

**Update ConfirmDialog** (around line 758):

**OLD CODE**:
```tsx
<ConfirmDialog
  isOpen={showDeleteTagConfirm}
  title="Remove Tag?"
  message={`Remove tag "${tagToDelete}" from this snippet?`}
  confirmLabel="Remove Tag"
  cancelLabel="Cancel"
  variant="danger"
  onConfirm={() => {
    if (tagToDelete) {
      setEditTags(editTags.filter(t => t !== tagToDelete));
      setShowDeleteTagConfirm(false);
      setTagToDelete(null);
    }
  }}
  onCancel={() => {
    setShowDeleteTagConfirm(false);
    setTagToDelete(null);
  }}
/>
```

**NEW CODE**:
```tsx
<ConfirmDialog
  isOpen={showDeleteTagConfirm}
  title="Remove Tag?"
  message={`Remove tag "${tagToDelete}"?`}
  confirmLabel="Remove Tag"
  cancelLabel="Cancel"
  variant="danger"
  onConfirm={() => {
    if (tagToDelete) {
      // Check if we're editing a snippet (from edit dialog) or a snippet display
      if (snippetToEdit) {
        // From snippet display - update the snippet
        const snippet = snippets.find(s => s.id === snippetToEdit);
        if (snippet) {
          updateSnippet(snippetToEdit, {
            tags: (snippet.tags || []).filter(t => t !== tagToDelete)
          });
          showSuccess(`Removed tag "${tagToDelete}"`);
        }
        setSnippetToEdit(null);
      } else {
        // From edit dialog - update editTags state
        setEditTags(editTags.filter(t => t !== tagToDelete));
      }
      setShowDeleteTagConfirm(false);
      setTagToDelete(null);
    }
  }}
  onCancel={() => {
    setShowDeleteTagConfirm(false);
    setTagToDelete(null);
    setSnippetToEdit(null);
  }}
/>
```

---

## Testing Plan

### Test 1: Cast Scroll Synchronization

**Setup**:
1. Open app with Chromecast available
2. Connect to Cast device
3. Send 10+ messages to create scrollable content

**Test Cases**:
1. **Scroll Up**:
   - Scroll up in web app
   - ✅ TV should scroll up to match
   
2. **Scroll Down**:
   - Scroll down in web app
   - ✅ TV should scroll down to match
   
3. **Scroll to Middle**:
   - Scroll to middle of messages
   - ✅ TV should show same middle section
   
4. **Auto-Scroll Resume**:
   - Scroll up manually
   - Wait 2 seconds
   - Send new message
   - ✅ TV should auto-scroll to bottom
   
5. **Rapid Scrolling**:
   - Scroll rapidly up and down
   - ✅ TV should follow smoothly without lag
   
6. **No Performance Impact**:
   - With scrolling enabled
   - ✅ Web app should remain responsive
   - ✅ No console errors

### Test 2: Inline Tag Management

**Setup**:
1. Open SWAG page with several snippets
2. Ensure snippets have various tag states (no tags, few tags, many tags)

**Test Cases**:
1. **Add Tag to Empty Snippet**:
   - Find snippet with no tags
   - Type tag name in autocomplete
   - Press Enter
   - ✅ Tag should appear in snippet
   - ✅ Success message shown
   
2. **Add Existing Tag**:
   - Type first few letters
   - ✅ Dropdown shows matching tags
   - Select from dropdown
   - ✅ Tag added to snippet
   
3. **Create New Tag**:
   - Type new tag name
   - ✅ "Create new tag" option appears
   - Press Enter
   - ✅ New tag created and added
   
4. **Delete Tag**:
   - Click × on tag chip
   - ✅ Confirmation dialog appears
   - Click "Remove Tag"
   - ✅ Tag removed from snippet
   - ✅ Success message shown
   
5. **Delete Tag - Cancel**:
   - Click × on tag chip
   - Click "Cancel"
   - ✅ Tag remains on snippet
   
6. **Mobile Responsive**:
   - Test on mobile viewport
   - ✅ Tag input takes full width
   - ✅ Touch targets are adequate
   - ✅ Dropdown works on mobile
   
7. **Dark Mode**:
   - Toggle dark mode
   - ✅ Tags styled correctly
   - ✅ Autocomplete styled correctly
   - ✅ Confirmation dialog styled correctly
   
8. **Multiple Snippets**:
   - Add tags to multiple different snippets
   - ✅ Each snippet manages tags independently
   - ✅ No cross-contamination
   
9. **Bulk Operations Still Work**:
   - Select multiple snippets
   - Click "Add Tags" in toolbar
   - ✅ Tag dialog opens
   - ✅ Bulk add still works
   - ✅ Bulk remove still works
   
10. **Edit Dialog Still Works**:
    - Click "Edit" on snippet
    - ✅ Edit dialog tag management works
    - ✅ No conflicts with inline tags

---

## Timeline

**Total Estimated Time**: 3-5 hours

- **Phase 1** (Cast Scroll): 1-2 hours
  - Coding: 30-45 minutes
  - Testing: 30-45 minutes
  - Bug fixes: 15-30 minutes

- **Phase 2** (Inline Tags): 2-3 hours
  - Coding: 1-1.5 hours
  - Testing: 45-60 minutes
  - Bug fixes: 15-30 minutes

**Recommended Approach**: Fix Phase 1 first (quick win), then Phase 2

---

## Success Criteria

### Phase 1: Cast Scroll

- ✅ Web app scroll syncs to TV
- ✅ Scroll position matches accurately
- ✅ No performance degradation
- ✅ Auto-scroll still works
- ✅ No console errors
- ✅ Documented in FEATURE_CHROMECAST.md

### Phase 2: Inline Tags

- ✅ "+" button removed
- ✅ Inline TagAutocomplete in each snippet
- ✅ Can add tags inline
- ✅ Can delete tags with confirmation
- ✅ Mobile responsive
- ✅ Dark mode works
- ✅ No conflicts with edit dialog
- ✅ Bulk operations still work
- ✅ All existing tests still pass

---

## Risk Assessment

### Low Risk

Both changes are low risk:

1. **Cast Scroll**:
   - Isolated to ChatTab
   - Debounced to avoid performance issues
   - Receiver already has handler implemented
   - No breaking changes

2. **Inline Tags**:
   - Reusing existing TagAutocomplete component
   - Similar pattern to edit dialog
   - Doesn't affect bulk operations
   - Doesn't affect data model

---

## Documentation Updates

### Files to Update

1. **developer_log/FEATURE_CHROMECAST.md**:
   - Update "Known Limitations" section
   - Remove "No Manual Scroll Control" limitation
   - Add "Scroll Synchronization" to features list

2. **steves_wishlist.md**:
   - Mark both issues as complete
   - Add completion date

3. **New Document**: `developer_log/BUG_FIXES_CAST_INLINE_TAGS.md`
   - Summary of both fixes
   - Before/after screenshots/descriptions
   - Testing results

---

## Conclusion

Both fixes are straightforward and low-risk:

1. **Cast Scroll**: Add scroll event listener that was already planned but not implemented
2. **Inline Tags**: Reuse TagAutocomplete component we just created

**Recommendation**: Implement both fixes in a single session (3-5 hours total)

---

**Document Version**: 1.0  
**Last Updated**: October 14, 2025  
**Status**: ✅ Ready for Implementation
