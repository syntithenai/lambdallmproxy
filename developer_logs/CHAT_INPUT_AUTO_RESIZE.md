# Chat Input Auto-Resize Implementation

## Summary
Implemented auto-resizing functionality for the chat input textarea to automatically adjust its height based on content.

## Changes Made

### File: `ui-new/src/components/ChatTab.tsx`

#### 1. Replaced Static Row Calculation with Dynamic Auto-Resize

**Before** (Lines 766-771):
```typescript
// Auto-resize textarea helper
const calculateRows = (text: string, minRows = 1, maxRows = 10): number => {
  if (!text || text.trim() === '') return minRows;
  const lines = text.split('\n').length;
  return Math.min(Math.max(lines, minRows), maxRows);
};
```

**After** (Lines 766-780):
```typescript
// Auto-resize textarea to fit content
const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (textarea) {
    textarea.style.height = 'auto';
    // Set max height to 300px (about 10 lines)
    const maxHeight = 300;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = newHeight + 'px';
  }
};

// Auto-resize input textarea when content changes
useEffect(() => {
  autoResizeTextarea(inputRef.current);
}, [input]);
```

**Why the change:**
- Old method only counted newlines (`\n`), not actual content wrapping
- New method uses `scrollHeight` to measure actual content height including wrapped text
- Provides smooth, accurate resizing regardless of text length or line breaks

#### 2. Updated Textarea Element

**Before** (Line 4080):
```typescript
<textarea
  ref={inputRef}
  value={input}
  // ... other props ...
  className="input-field flex-1 resize-none"
  rows={calculateRows(input, 1, 10)}
/>
```

**After** (Lines 4054-4089):
```typescript
<textarea
  ref={inputRef}
  value={input}
  // ... other props ...
  className="input-field flex-1 resize-none overflow-y-auto"
  style={{ minHeight: '2.5rem', maxHeight: '300px' }}
/>
```

**Key changes:**
- Removed `rows` attribute (static sizing)
- Added `overflow-y-auto` class for scrolling when content exceeds max height
- Added inline style with:
  - `minHeight: '2.5rem'` - Ensures single line is always visible (about 40px)
  - `maxHeight: '300px'` - Prevents textarea from growing too large (about 10 lines)

## Technical Details

### How Auto-Resize Works

1. **Initial State**: Textarea starts at minimum height (2.5rem)
2. **User Types**: `onChange` updates `input` state
3. **useEffect Triggers**: Detects `input` change, calls `autoResizeTextarea()`
4. **Height Calculation**:
   - Reset height to `auto` to get accurate scrollHeight
   - Measure `scrollHeight` (actual content height)
   - Apply `Math.min(scrollHeight, 300)` to respect max height
   - Set textarea height to calculated value
5. **Scrolling**: If content exceeds 300px, vertical scrollbar appears

### Benefits

1. **Accurate Sizing**: Handles both newlines and text wrapping
2. **Smooth Experience**: Grows/shrinks as user types
3. **Bounded Growth**: Max height prevents textarea from filling entire screen
4. **Consistent Behavior**: Matches Planning Dialog auto-resize pattern
5. **Mobile Friendly**: Works well on small screens

### User Experience

- **Single line input**: Textarea shows single line (2.5rem height)
- **Multi-line input**: Grows automatically to fit content
- **Long messages**: Grows up to 300px, then scrollbar appears
- **Delete content**: Shrinks back down as content is removed
- **Paste content**: Immediately resizes to fit pasted text

## Testing Recommendations

1. **Short messages**: Type single line, verify minimal height
2. **Multi-line messages**: Press Shift+Enter multiple times, verify growth
3. **Long wrapped text**: Type very long line without breaks, verify wrapping and growth
4. **Paste content**: Paste multi-paragraph text, verify immediate resize
5. **Delete content**: Remove lines, verify shrinking
6. **Max height**: Type/paste >10 lines, verify scrollbar appears at 300px

## Consistency

This implementation matches the auto-resize pattern used in:
- `PlanningDialog.tsx` - Research query textarea
- `PlanningDialog.tsx` - System prompt textarea  
- `PlanningDialog.tsx` - User query textarea

All use the same `scrollHeight`-based approach for accurate content-aware resizing.
