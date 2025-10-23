# Image Gallery Restoration - Using page_content Instead of Truncated Images

**Date**: October 22, 2025  
**Issue**: Image gallery section disappeared from web search results  
**Status**: ✅ Fixed  
**Root Cause**: `compressSearchResultsForLLM` was collecting images from truncated `result.images` instead of untruncated `result.page_content.images`

---

## Problem Description

### User Report
> "i used to see an all images section after a web search including all the images of all the scraped pages. i don't see this anymore. please restore it."

### Technical Issue
When performing a web search with `load_content: true`, the system would scrape pages and extract images. However, the **image gallery section was not showing all images** - it was showing at most N images (one per search result) instead of potentially dozens or hundreds of images from all scraped pages.

---

## Root Cause Analysis

### The Search Result Data Flow

1. **Scraping Phase** (`src/search.js`):
   - Pages are scraped and media is extracted
   - ALL images are stored in `result.page_content.images[]` (untruncated)
   - SOME images are also stored in `result.images[]` (preview)

2. **Truncation Phase** (`src/tools.js` lines 1490-1520):
   - When response is too large (>50K chars or >4K tokens)
   - **Aggressive truncation** limits `result.images` to 1 image per result
   - BUT `result.page_content` is **fully preserved** for UI extraction
   
   ```javascript
   images: r.images ? r.images.slice(0, 1) : undefined, // Max 1 image ❌
   page_content: r.page_content // Keep full content ✅
   ```

3. **Formatting Phase** (`src/tools.js` lines 189-289):
   - `compressSearchResultsForLLM()` creates formatted output for LLM
   - **BUG**: Was collecting from `result.images` (truncated to 1 per result)
   - Should collect from `result.page_content.images` (all images preserved)

### The Bug

**Before Fix** (line 228-237):
```javascript
for (const result of results) {
  if (result.images) allImages.push(...result.images);  // ❌ Only 1 image per result after truncation
  if (result.youtube) allYoutube.push(...result.youtube);
  if (result.media) allMedia.push(...result.media);
}
```

Result: Gallery shows at most N images (1 per search result)

**Expected Behavior**: Gallery should show ALL images from ALL scraped pages (potentially dozens or hundreds)

---

## Solution

Modified `compressSearchResultsForLLM()` to prioritize `page_content` (untruncated) over direct media arrays (truncated).

### Code Change

**File**: `src/tools.js`  
**Lines**: 228-237 → 228-254

```javascript
// Collect all media from all results for gallery at bottom
// CRITICAL: Use page_content for complete media (not truncated like result.images)
const allImages = [];
const allYoutube = [];
const allMedia = [];

for (const result of results) {
  // Prefer page_content (untruncated) over result.images (truncated to 1)
  if (result.page_content?.images) {
    allImages.push(...result.page_content.images);
  } else if (result.images) {
    allImages.push(...result.images);
  }
  
  // Same for videos and media
  if (result.page_content?.videos) {
    allYoutube.push(...result.page_content.videos);
  } else if (result.youtube) {
    allYoutube.push(...result.youtube);
  }
  
  if (result.page_content?.media) {
    allMedia.push(...result.page_content.media);
  } else if (result.media) {
    allMedia.push(...result.media);
  }
}
```

### Why This Works

1. **Truncation Preserves `page_content`**: The aggressive truncation logic (line 1508) keeps `page_content` intact
2. **Formatting Now Uses Full Data**: `compressSearchResultsForLLM` now extracts from the untruncated source
3. **Fallback for Non-Truncated**: If `page_content` doesn't exist (no truncation occurred), falls back to direct arrays
4. **All Media Types**: Applied same fix to images, videos (YouTube), and other media

---

## Data Structure Reference

### Backend (src/search.js)

After scraping, each result has TWO places where images are stored:

```javascript
{
  title: "...",
  url: "...",
  content: "...scraped text...",
  images: [...]          // ← Preview images (truncated to 1 during compression)
  page_content: {        // ← Full structured metadata (NEVER truncated)
    images: [...],       // ← ALL images from scraped page (20+)
    videos: [...],       // ← ALL videos
    media: [...],        // ← ALL other media
    links: [...]         // ← ALL links
  }
}
```

### Truncation Logic (src/tools.js line 1503)

```javascript
// When response is too large:
images: r.images ? r.images.slice(0, 1) : undefined,  // Reduce to 1 image
page_content: r.page_content  // Keep EVERYTHING for UI
```

### Gallery Format (src/tools.js line 264-270)

```markdown
**Images:**
```gallery
![Caption 1](url1)
![Caption 2](url2)
...
![Caption N](urlN)
```
```

The ```gallery markdown block triggers special rendering in the UI.

---

## Testing

### Test Case: Multi-Result Search with Images

**Steps**:
1. Open UI at `http://localhost:8081`
2. Send query: "search for python tutorials with load_content true"
3. Wait for search to complete
4. Check LLM response for `**Images:**` section

**Expected Result**:
- ✅ Gallery section includes ALL images from ALL scraped pages
- ✅ Not limited to 1 image per result
- ✅ Potentially 20-100+ images depending on pages scraped
- ✅ Each image has caption from `alt`, `title`, or `caption` field

### Test Case: Truncated vs Non-Truncated Responses

**Small Response** (no truncation):
- Falls back to `result.images` if `page_content` not present
- Still works correctly

**Large Response** (triggers truncation):
- Uses `result.page_content.images` which is preserved
- Shows full gallery with all images

---

## Related Documentation

- **Original Feature**: `developer_logs/WEB_SEARCH_CONTENT_EXTRACTION_FIX.md`
- **UI Image Extraction**: `ui-new/src/components/ChatTab.tsx` (extractMediaFromMessage)
- **Search Architecture**: `developer_logs/COMPREHENSIVE_CONTENT_EXTRACTION.md`
- **Data Flow**: `developer_logs/EXTRACTED_CONTENT_API.md`

---

## Key Takeaways

1. **Truncation is Selective**: Aggressive truncation reduces duplicate/preview data but preserves `page_content`
2. **UI vs LLM Data**: 
   - LLM gets compressed markdown (1 image per result)
   - UI extracts from `page_content` (all images)
   - Gallery formatting bridges both: shows all images to LLM in special section
3. **Data Source Priority**: Always prefer `page_content` over direct arrays when available
4. **Fallback Strategy**: Code gracefully handles both truncated and non-truncated responses

---

## Impact

- ✅ Restores full image gallery functionality
- ✅ Shows ALL images from ALL scraped pages
- ✅ Applies same fix to videos and media
- ✅ Maintains backward compatibility with non-truncated responses
- ✅ No impact on LLM context size (gallery is at bottom, can be truncated if needed)

---

## Files Modified

1. **src/tools.js** (lines 228-254)
   - Modified `compressSearchResultsForLLM()` to use `page_content` media arrays
   - Added fallback logic for non-truncated responses
   - Applied fix to images, videos, and media

---

## Deployment

**Local Testing**:
```bash
make dev  # Restart local dev server with fix
```

**Production Deployment** (when ready):
```bash
make deploy-lambda-fast  # Deploy backend code changes
```

---

## Notes

- User specifically mentioned: "i thought all images were extracted from raw page content and passed back with the response but not sent to the llm"
- This was CORRECT - images ARE extracted and stored in `page_content`
- The bug was that formatting function wasn't using `page_content`, it was using the truncated `result.images` array
- Now both UI and LLM formatting use the full `page_content` data when available
