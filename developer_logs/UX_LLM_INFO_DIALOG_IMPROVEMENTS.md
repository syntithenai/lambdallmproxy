# UX Improvements: LLM Info Dialog

## Changes Made

### 1. Click Outside to Close ✅
**Problem**: Dialog required clicking the X button to close.

**Solution**: Updated dialog structure to support click-outside-to-close:
- Moved `dialogRef` from content div to backdrop div
- Added `onClick={(e) => e.stopPropagation()` to content div to prevent backdrop clicks from propagating
- The `useDialogClose` hook now properly detects clicks on the backdrop

**File**: `ui-new/src/components/LlmInfoDialogNew.tsx`
```tsx
// Before: ref on content div
<div className="...backdrop...">
  <div ref={dialogRef} className="...content...">

// After: ref on backdrop div
<div ref={dialogRef} className="...backdrop...">
  <div onClick={(e) => e.stopPropagation()} className="...content...">
```

### 2. Full Screen Opens Immediately ✅
**Problem**: Users had to click dropdown arrow to expand, then click "Full Screen" button.

**Solution**: Removed the expand/collapse intermediate step:
- Clicking a section (Request Body, Response Body, etc.) now opens full screen modal immediately
- Removed the dropdown arrow and inline preview
- Changed button text to "🔍 Click to View" to make the action clear

**Changes**:
```tsx
// Before: Two-step process
<button onClick={() => setIsExpanded(!isExpanded)}>
  <span>▼/▶</span> {title}
</button>
{isExpanded && (
  <div>
    <button onClick={() => setShowFullScreen(true)}>Full Screen</button>
    <pre>{JSON preview}</pre>
  </div>
)}

// After: One-step process
<button onClick={handleSectionClick}>
  {title}
  <span>🔍 Click to View</span>
</button>
```

### 3. JSON Tree Viewer Component ✅
**Problem**: JSON was displayed as plain text, making it hard to navigate large objects.

**Solution**: Integrated `JsonTreeViewer` component for user-friendly JSON display:
- Imported existing `JsonTreeViewer` from `./JsonTreeViewer`
- Replaced plain `<pre>` with `<JsonTreeViewer>` in full screen modal
- Set `defaultExpanded={true}` to show all JSON nodes expanded by default
- Added light background for better readability

**Features**:
- ✅ Collapsible/expandable object and array nodes
- ✅ Syntax highlighting (strings, numbers, booleans, null)
- ✅ Shows array/object sizes (e.g., "[5 items]", "{3 keys}")
- ✅ Proper indentation for nested structures
- ✅ Dark mode support
- ✅ Fully expanded by default

**Full Screen Modal JSON Display**:
```tsx
{/* Modal Body - Scrollable JSON Tree */}
<div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-gray-950">
  <JsonTreeViewer data={fullyParsedData} defaultExpanded={true} />
</div>
```

## User Experience Flow

### Before
1. User clicks LLM Info button
2. Dialog opens
3. User sees collapsed sections (Request Body, Response Body)
4. User clicks dropdown arrow to expand inline
5. User sees small JSON preview
6. User clicks "Full Screen" button
7. Full screen modal opens with plain text JSON

**Total clicks to view JSON**: 3 clicks

### After
1. User clicks LLM Info button
2. Dialog opens
3. User sees sections with "🔍 Click to View"
4. User clicks section once
5. Full screen modal opens with beautiful JSON tree viewer, fully expanded

**Total clicks to view JSON**: 2 clicks

### Closing Behavior
- **Before**: Only X button closes dialog
- **After**: X button OR click outside OR Escape key closes dialog

## Technical Details

### Components Modified
1. **LlmInfoDialogNew.tsx** (Main changes)
   - Added `JsonTreeViewer` import
   - Updated `JsonTree` component to remove expand/collapse
   - Changed click handler to open full screen immediately
   - Moved `dialogRef` to backdrop div for click-outside-to-close
   - Updated modal body to use `JsonTreeViewer` instead of `<pre>`

### Deep JSON Parsing
The `deepParseJSON` function remains unchanged and still:
- Recursively parses all stringified JSON within JSON
- Ensures no text nodes contain JSON strings
- Handles arrays, objects, primitives, and null values

### Accessibility
- ✅ Escape key closes dialog
- ✅ Click outside closes dialog
- ✅ X button still works
- ✅ All buttons have clear labels
- ✅ Focus management preserved

## Visual Changes

### Section Buttons
**Before**:
```
▼ Request Body                [▶ expanded/collapsed state]
```

**After**:
```
Request Body                   🔍 Click to View
```

### Full Screen Modal
**Before**:
- Dark background (bg-gray-900)
- Plain text JSON (green monospace)
- Small, hard to read

**After**:
- Light background (bg-gray-50/dark:bg-gray-950)
- JsonTreeViewer with color-coded values
- Large, organized, collapsible tree structure
- Fully expanded by default

## Testing Checklist

- [x] Click section button opens full screen immediately
- [x] Full screen modal displays JSON tree viewer
- [x] All JSON nodes are expanded by default
- [x] Click outside modal closes it
- [x] Escape key closes modal
- [x] X button closes modal
- [x] Copy button works
- [x] Dark mode works correctly
- [x] Nested JSON is fully parsed (no stringified JSON within JSON)
- [x] Works with all call types (chat, guardrail, transcription, etc.)

## Related Files

- `ui-new/src/components/LlmInfoDialogNew.tsx` - Main dialog component (modified)
- `ui-new/src/components/JsonTreeViewer.tsx` - JSON tree viewer component (imported, not modified)
- `ui-new/src/hooks/useDialogClose.ts` - Close-on-outside-click hook (not modified)

## Benefits

1. **Faster Access**: Reduced from 3 clicks to 2 clicks to view JSON
2. **Better Readability**: JSON tree viewer makes structure clear
3. **Easier Navigation**: Collapsible nodes for large objects
4. **Better UX**: Click outside to close is expected behavior
5. **Consistent**: Uses same JsonTreeViewer as tool transparency
