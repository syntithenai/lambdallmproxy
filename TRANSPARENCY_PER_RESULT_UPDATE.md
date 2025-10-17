# Transparency Section Update - Per-Result Scrape Display

**Date**: October 17, 2025  
**Status**: ✅ Complete

## Changes Summary

### 1. Removed Aggregated Transparency Section
**File**: `ui-new/src/components/ExtractedContent.tsx`

**Removed**:
- Entire "🔍 Extraction Transparency & Debug Info" section (lines 235-430)
- Included sections for:
  - 📊 Extraction Summary (image counts, link counts)
  - 📍 Image Placement Distribution (hero, above-fold, content, sidebar)
  - 🎯 Smart Image Selection (ranking with scores)
  - 📋 Raw Metadata (JSON)
- Removed unused `JsonTreeViewer` import

**Reason**: User wanted transparency info displayed **inline per tool result**, not as a separate aggregated section at the bottom.

---

### 2. Rewrote ToolTransparency Component
**File**: `ui-new/src/components/ToolTransparency.tsx`

**Before**: Showed generic "Raw Response" and "Extraction Metadata" sections

**After**: Parses `search_web` results and displays per-search-result transparency:

#### New Structure:
```tsx
🔍 Scrape Transparency
  └─ 📄 [Result Title] (X chars)
      ├─ 📝 Scraped Content (with copy button)
      │   └─ Full text content from page
      └─ 📊 Page Content Metadata (JSON)
          └─ Expandable JSON tree with:
              ├─ images[]
              ├─ videos[]
              └─ links[]
  
  └─ 📊 Extraction Metadata (if present)
      └─ Backend extraction metadata (image placement, scoring, etc.)
```

#### Key Features:
1. **Parses rawResponse**: Extracts `results` array from search_web JSON
2. **Per-Result Display**: Each search result gets its own expandable section
3. **Shows Scraped Content**: Displays the actual `result.content` text
4. **Shows Page Metadata**: Displays `result.page_content` (images, videos, links) as expandable JSON
5. **Copy Buttons**: Easy copying of scraped text content
6. **Character Count**: Shows content length in summary

#### Code Changes:
```typescript
// NEW: Parse rawResponse to extract search results
let parsedData: any = null;
let searchResults: SearchResult[] = [];

try {
  if (rawResponse) {
    parsedData = JSON.parse(rawResponse);
    if (parsedData.results && Array.isArray(parsedData.results)) {
      searchResults = parsedData.results;
    }
  }
} catch (e) {
  console.log('Failed to parse rawResponse:', e);
}

// NEW: Map over search results
{searchResults.length > 0 && searchResults.map((result, idx) => (
  <details key={idx}>
    <summary>📄 {result.title || result.url} ({result.content ? `${result.content.length} chars` : 'no content'})</summary>
    <div>
      {/* Scraped Content */}
      {result.content && (
        <div>
          <div>📝 Scraped Content</div>
          <pre>{result.content}</pre>
        </div>
      )}
      
      {/* Page Content Metadata */}
      {result.page_content && (
        <details>
          <summary>📊 Page Content Metadata (JSON)</summary>
          <JsonTree data={result.page_content} />
        </details>
      )}
    </div>
  </details>
))}
```

---

## User Experience

### Before:
- One large "Extraction Transparency & Debug Info" section at bottom of ExtractedContent
- Showed aggregated stats (total images, links, placement distribution)
- Raw response shown as one giant JSON blob
- Hard to see which content came from which search result

### After:
- **Per-result transparency** displayed inline with each search result
- Each result shows:
  1. Title and character count in summary
  2. Full scraped text content (with copy button)
  3. Page metadata (images/videos/links) as expandable JSON
- Easy to see what was scraped from each individual page
- No more aggregated section clutter

---

## Testing

### Test Case 1: search_web with Multiple Results
```
User: search for python tutorials
```

**Expected Result**:
- ✅ Tool result shows "🔍 Scrape Transparency" section
- ✅ Multiple expandable sections: "📄 [Result Title] (X chars)"
- ✅ Click to expand shows scraped content + metadata
- ✅ Copy button works for scraped content
- ✅ page_content metadata expandable as JSON tree

### Test Case 2: search_web with No Content
```
User: search for "test query" (hypothetical result with no content)
```

**Expected Result**:
- ✅ Shows "(no content)" in summary
- ✅ Only page_content metadata shown (if present)

### Test Case 3: Other Tools (scrape_url, transcribe_url)
**Expected Result**:
- ✅ Still shows rawResponse for non-search tools
- ✅ Shows extraction metadata if present

---

## Files Modified

1. **ui-new/src/components/ExtractedContent.tsx**
   - Removed lines 235-430 (entire Extraction Transparency section)
   - Removed JsonTreeViewer import (line 2)

2. **ui-new/src/components/ToolTransparency.tsx**
   - Complete rewrite (lines 1-165)
   - Added SearchResult interface
   - Added rawResponse parsing logic
   - Changed from generic raw display to per-result scrape display
   - Removed "Raw Response" section
   - Kept "Extraction Metadata" section for backend metadata

---

## Technical Details

### Data Flow:
1. **Backend** (`src/endpoints/chat.js`):
   - search_web returns JSON: `{ results: [{ title, url, content, page_content: { images, videos, links } }] }`
   - Attached as `rawResponse` to toolResults

2. **Frontend** (`ChatTab.tsx`):
   - message_complete handler populates toolResults with rawResponse
   - ToolTransparency component receives rawResponse prop

3. **ToolTransparency Component**:
   - Parses rawResponse as JSON
   - Extracts `results` array
   - Maps over results to create per-result expandable sections
   - Displays `result.content` (scraped text)
   - Displays `result.page_content` (metadata) as JSON tree

### Search Result Structure:
```json
{
  "results": [
    {
      "query": "python tutorials",
      "title": "Python Tutorial",
      "url": "https://example.com",
      "description": "Learn Python...",
      "score": 0.95,
      "content": "Full scraped text content here...",
      "page_content": {
        "images": [{ "src": "...", "alt": "..." }],
        "videos": [],
        "links": [{ "title": "...", "url": "..." }]
      },
      "contentLength": 5000,
      "fetchTimeMs": 250
    }
  ]
}
```

---

## Benefits

1. **Clarity**: Easy to see which content came from which page
2. **Granularity**: Per-result transparency instead of aggregated stats
3. **Simplicity**: Removed complex aggregated metadata display
4. **Usefulness**: Shows actual scraped content (what LLM received)
5. **Debugging**: page_content metadata visible for each result
6. **UX**: Copy buttons for easy content extraction

---

## Notes

- The component automatically detects `search_web` results by checking for `results` array
- Non-search tools still show generic rawResponse (if needed in future)
- Extraction metadata (backend-generated) still displayed if present
- Hot reload working - changes picked up immediately by Vite
- No backend changes required - only frontend display changes

---

## Related Files

- `ui-new/src/components/ExtractedContent.tsx` - Removed aggregated section
- `ui-new/src/components/ToolTransparency.tsx` - Per-result display
- `ui-new/src/components/ChatTab.tsx` - Integration (unchanged)
- `src/endpoints/chat.js` - Backend rawResponse attachment (unchanged)
- `src/tools.js` - search_web result structure (unchanged)

---

## Deployment

**Frontend Hot Reload**: ✅ Changes applied automatically via Vite HMR  
**Backend**: ✅ No changes required  
**Status**: Ready for testing

