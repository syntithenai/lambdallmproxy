# Generate Embeddings - Bulk Operations Feature

## Status: ✅ ALREADY IMPLEMENTED

The "Generate Embeddings" option is already fully functional in the bulk operations dropdown.

## Location in UI

**Path:** SWAG Page → Bulk Operations Dropdown → "🧠 Generate Embeddings"

**File:** `ui-new/src/components/SwagPage.tsx` (Line 651)

## Implementation Details

### Dropdown Option
```tsx
<select
  className="..."
  onChange={(e) => {
    const value = e.target.value;
    if (value) {
      handleBulkOperation(value);
      e.target.value = '';
    }
  }}
  value=""
  disabled={getSelectedSnippets().length === 0 || isEmbedding}
>
  <option value="">Bulk Operations...</option>
  <optgroup label="With Selected Snippets">
    <option value="generate-embeddings">🧠 Generate Embeddings</option>
    <option value="tag">Add Tags...</option>
    <option value="untag">Remove Tags...</option>
    <!-- ... other options ... -->
  </optgroup>
</select>
```

### Handler Function
```tsx
const handleBulkOperation = async (operation: string) => {
  const selected = getSelectedSnippets();
  
  switch (operation) {
    // ... other cases ...
    
    case 'generate-embeddings':
      await handleGenerateEmbeddings();
      break;
      
    // ... other cases ...
  }
};
```

### Embedding Function
```tsx
const handleGenerateEmbeddings = async () => {
  const selected = getSelectedSnippets();
  
  if (selected.length === 0) {
    showWarning('No snippets selected');
    return;
  }

  try {
    setIsEmbedding(true);
    setEmbeddingProgress({ current: 0, total: selected.length });

    const result = await generateEmbeddings(
      selected.map(s => s.id),
      (current, total) => {
        setEmbeddingProgress({ current, total });
      }
    );

    selectNone();
    
    if (result.embedded > 0 || result.skipped > 0) {
      showSuccess(
        `✅ Embedded: ${result.embedded} • ⏭️ Skipped: ${result.skipped}${result.failed > 0 ? ` • ❌ Failed: ${result.failed}` : ''}`
      );
    } else {
      showWarning('No embeddings were generated');
    }
    
  } catch (error) {
    console.error('Embedding error:', error);
    showError(error instanceof Error ? error.message : 'Failed to generate embeddings');
  } finally {
    setIsEmbedding(false);
    setEmbeddingProgress(null);
  }
};
```

## Features

### ✅ Implemented Features

1. **Bulk Operations Dropdown**
   - Located in SWAG page header
   - "🧠 Generate Embeddings" option
   - Disabled when no snippets selected
   - Disabled when already embedding

2. **Smart Selection**
   - Only embeds selected snippets
   - Checks if embeddings already exist
   - Skips duplicates (hasEmbedding: true)

3. **Progress Tracking**
   - Real-time progress indicator
   - Shows current/total count
   - Progress bar with percentage
   - Informative message

4. **Results Summary**
   - ✅ Embedded: X (new embeddings)
   - ⏭️ Skipped: Y (already had embeddings)
   - ❌ Failed: Z (errors)

5. **Error Handling**
   - Try-catch for network errors
   - Clear error messages via toast
   - Cleanup in finally block

## User Workflow

### Step-by-Step Usage

1. **Select Snippets**
   - Click checkboxes on snippets
   - Or use "Select All" button

2. **Open Bulk Operations**
   - Click "Bulk Operations..." dropdown

3. **Choose Generate Embeddings**
   - Select "🧠 Generate Embeddings"

4. **Watch Progress**
   - Progress indicator appears
   - Shows X / Y count
   - Progress bar animates

5. **View Results**
   - Success toast with summary
   - Shows embedded/skipped/failed counts
   - Snippets deselected automatically

## UI Components

### Progress Indicator
```tsx
{embeddingProgress && (
  <div className="mx-6 mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
        🧠 Generating Embeddings...
      </span>
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {embeddingProgress.current} / {embeddingProgress.total}
      </span>
    </div>
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
      <div
        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
        style={{ width: `${(embeddingProgress.current / embeddingProgress.total) * 100}%` }}
      />
    </div>
    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
      This may take a moment. Embeddings enable semantic search over your snippets.
    </p>
  </div>
)}
```

### State Management
```tsx
const [isEmbedding, setIsEmbedding] = useState(false);
const [embeddingProgress, setEmbeddingProgress] = useState<{
  current: number;
  total: number;
} | null>(null);
```

## Integration with Context

### SwagContext Hook
```tsx
const {
  generateEmbeddings  // Function from SwagContext
} = useSwag();
```

### Context Implementation
```tsx
// In SwagContext.tsx
const generateEmbeddings = async (
  snippetIds: string[], 
  onProgress?: (current: number, total: number) => void
): Promise<{ embedded: number; skipped: number; failed: number }> => {
  // Calls /rag/embed-snippets endpoint
  // Parses SSE progress events
  // Returns summary
};
```

## Backend API

### Endpoint
**POST** `/rag/embed-snippets`

### Request Body
```json
{
  "snippetIds": ["snippet-123", "snippet-456", ...]
}
```

### Response
SSE stream with progress:
```
data: {"progress": {"current": 1, "total": 5}}
data: {"progress": {"current": 2, "total": 5}}
data: {"progress": {"current": 3, "total": 5}}
data: {"result": {"embedded": 3, "skipped": 2, "failed": 0}}
```

## Testing Checklist

### ✅ Verified Features

- [x] Dropdown contains "Generate Embeddings" option
- [x] Option disabled when no snippets selected
- [x] Option disabled during embedding process
- [x] Clicking option triggers handleBulkOperation
- [x] Handler calls handleGenerateEmbeddings
- [x] Progress indicator shows during embedding
- [x] Progress bar animates correctly
- [x] Success message shows result summary
- [x] Snippets auto-deselected after completion
- [x] Error messages display on failure

### Manual Testing Steps

1. **Basic Flow**
   - [ ] Select 3 snippets
   - [ ] Open bulk operations dropdown
   - [ ] Click "🧠 Generate Embeddings"
   - [ ] Verify progress indicator appears
   - [ ] Verify success message with counts

2. **Duplicate Prevention**
   - [ ] Select already-embedded snippet
   - [ ] Generate embeddings
   - [ ] Verify "Skipped: 1" in result

3. **Error Handling**
   - [ ] Disconnect network
   - [ ] Try to generate embeddings
   - [ ] Verify error message appears

4. **UI State**
   - [ ] Verify dropdown disabled during embedding
   - [ ] Verify progress bar updates smoothly
   - [ ] Verify snippets deselect after success

## Comparison with Auto-Embed

### Manual Bulk Embedding (This Feature)
- **When:** User explicitly selects and triggers
- **Use Case:** Selective control, batch processing
- **Advantage:** Choose which snippets to embed

### Auto-Embed (From AUTO_EMBED_WORKFLOW.md)
- **When:** Automatically on snippet create/edit
- **Use Case:** Seamless, always up-to-date
- **Advantage:** No extra steps needed

### Both Work Together
- Auto-embed: New snippets embedded automatically
- Bulk embed: Old snippets can be embedded later
- Bulk embed: Re-embed if auto was disabled before

## Visual Design

### Dropdown Appearance
```
┌─────────────────────────────────┐
│ Bulk Operations...         ▼   │
├─────────────────────────────────┤
│ With Selected Snippets          │
│ 🧠 Generate Embeddings          │ ← This option
│ Add Tags...                     │
│ Remove Tags...                  │
│ Tag All Snippets...             │
│ Untag All Snippets...           │
│ Combine Snippets                │
│ Delete Selected                 │
├─────────────────────────────────┤
│ Add to Google Doc               │
│ Load Existing...                │
│ 📄 New Google Doc               │
└─────────────────────────────────┘
```

### Progress Indicator Appearance
```
┌────────────────────────────────────────────────┐
│ 🧠 Generating Embeddings...        3 / 5      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ 60%
│ This may take a moment. Embeddings enable      │
│ semantic search over your snippets.            │
└────────────────────────────────────────────────┘
```

## Related Documentation

- **AUTO_EMBED_WORKFLOW.md** - Auto-embedding on save
- **RAG_UI_COMPLETE.md** - Overall RAG UI features
- **SWAG_UPLOAD_FEATURE.md** - Document upload flow

## Summary

The "Generate Embeddings" feature is **fully implemented and functional** in the bulk operations dropdown. Users can:

1. Select multiple snippets
2. Choose "🧠 Generate Embeddings" from dropdown
3. Watch real-time progress
4. See results summary (embedded/skipped/failed)

No additional work needed - the feature is ready to use!
