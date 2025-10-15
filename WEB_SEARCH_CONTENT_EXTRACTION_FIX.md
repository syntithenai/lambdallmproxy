# Web Search Content and Image Extraction Fix

**Date**: October 15, 2025  
**Issues**: 
1. Web search not showing scraped page content in expandable section
2. Images from page_content not appearing in expandable "All Images" section  
**Status**: ✅ Fixed and Deployed

## Problem Description

### Issue 1: Missing Scraped Page Content
When using `search_web` tool with `load_content: true`, the actual scraped text content from web pages was not showing in the expandable tool result display, even though the backend was scraping and sending the content.

**Root Cause**: The UI was trying to display `result.page_content` (which is an object containing images, videos, links) instead of `result.content` (which contains the actual scraped text).

### Issue 2: Missing Images from page_content
Images extracted from scraped web pages (stored in `result.page_content.images`) were not appearing in the expandable "All Images" section.

**Root Cause**: The `extractMediaFromMessage` function in ChatTab.tsx had two problems:
1. Line 624: Checked `if (data.page_content && data.images)` instead of `if (data.page_content?.images)`
2. Did not extract images from `data.results[].page_content.images` (search results array)

## Solution

### Fix 1: Display Actual Scraped Content (Lines 3540-3575)

**Changed:**
```typescript
// BEFORE: Tried to display page_content object
const pageContent = result.page_content || result.content;
const hasContent = pageContent && pageContent.length > 0;
```

**To:**
```typescript
// AFTER: Display the actual text content
const pageContent = result.content;
const hasContent = pageContent && typeof pageContent === 'string' && pageContent.length > 0;
```

Also updated label from "📄 Page Content" to "📄 Scraped Page Content" for clarity.

### Fix 2: Extract Images from page_content (Lines 610-660)

**Changed:**
```typescript
// BEFORE: Wrong condition and missing search results extraction
// Page content with images
if (data.page_content && data.images) {
  if (Array.isArray(data.images)) {
    data.images.forEach((img: any) => {
      // ...extract image
    });
  }
}
```

**To:**
```typescript
// AFTER: Correct condition and comprehensive extraction
// Images from page_content object (scraped from web pages)
if (data.page_content?.images && Array.isArray(data.page_content.images)) {
  data.page_content.images.forEach((img: any) => {
    if (typeof img === 'string') {
      media.images.push(img);
    } else if (img && img.src) {
      media.images.push(img.src);
    } else if (img && img.url) {
      media.images.push(img.url);
    }
  });
}

// Extract images from search results (each result can have page_content.images)
if (data.results && Array.isArray(data.results)) {
  data.results.forEach((result: any) => {
    if (result.page_content?.images && Array.isArray(result.page_content.images)) {
      result.page_content.images.forEach((img: any) => {
        if (typeof img === 'string') {
          media.images.push(img);
        } else if (img && img.src) {
          media.images.push(img.src);
        } else if (img && img.url) {
          media.images.push(img.url);
        }
      });
    }
  });
}
```

## Data Structure Reference

### Backend (src/tools.js)

Search results structure:
```javascript
{
  results: [
    {
      title: "...",
      url: "...",
      description: "...",
      content: "...scraped text content...",  // ← Actual text from page
      page_content: {                         // ← Structured metadata
        images: [{ src: "...", alt: "..." }],
        videos: [...],
        links: [...]
      }
    }
  ]
}
```

### Frontend Display Logic

**Tool Result Expandable Section**:
- Shows `result.content` (scraped text) in scrollable box
- Shows first 2000 chars with "..." if longer
- Label: "📄 Scraped Page Content (X chars)"

**ExtractedContent Component**:
- Shows `prioritizedImages` (first 3) inline as "Related Images"
- Shows `allImages` (all images) in expandable section
- Images now include those from `page_content.images`

## Testing

### Test Case 1: Web Search with Content Loading
```
User: search for python tutorials with load_content true
```

**Expected Result**:
- ✅ Tool result shows expandable section "📄 Scraped Page Content (X chars)"
- ✅ Clicking expand shows full scraped text content (up to 2000 chars preview)
- ✅ Content is actual text from the web pages, not object notation

### Test Case 2: Image Extraction from Scraped Pages
```
User: search for "machine learning" and load the page content
```

**Expected Result**:
- ✅ Images extracted from scraped pages appear in "Related Images" (first 3)
- ✅ All images appear in expandable "All Images" section
- ✅ Count in "All Images (X)" includes images from page_content

### Test Case 3: Multiple Search Results with Images
```
User: search for "data visualization examples"
```

**Expected Result**:
- ✅ Images from ALL search result pages are extracted
- ✅ No duplicate images (deduplicated by src URL)
- ✅ Each result's page_content.images are processed

## Deployment

### Build
```bash
cd ui-new && npm run build
```
- ✅ Build successful (11.87s)
- ✅ No TypeScript errors
- ✅ All 2,503 modules transformed

### Deploy
```bash
./scripts/deploy-docs.sh -m "fix: web search page content display and image extraction from page_content"
```
- ✅ Committed: `37956f4`
- ✅ Pushed to `origin/agent`
- ✅ Deployed to: https://lambdallmproxy.pages.dev

## Impact

### User Experience Improvements

1. **Visible Scraped Content**: Users can now see the actual text content that was scraped from web pages, not just metadata
2. **Complete Image Collection**: All images from scraped pages are now visible in the expandable section
3. **Better Transparency**: Users can verify what content the LLM received from web searches
4. **Accurate Counts**: Image counts now reflect all extracted images, not just top-level ones

### Use Cases

- **Research**: View full scraped content to verify sources
- **Image Collection**: Access all images from web search results
- **Content Analysis**: See exactly what text was extracted from each page
- **Debugging**: Verify that web scraping is working correctly

## Files Modified

1. **ui-new/src/components/ChatTab.tsx**
   - Lines 3540-3575: Fixed page content display to use `result.content`
   - Lines 610-660: Fixed image extraction from `page_content.images` and search results

## Related Components

- **Backend**: `src/tools.js` - Search result structure (no changes needed)
- **Backend**: `src/endpoints/chat.js` - Extraction logic (no changes needed)
- **Frontend**: `ExtractedContent.tsx` - Display of extracted images (working correctly)
- **Frontend**: `MediaSections.tsx` - Expandable media sections (working correctly)

## Technical Details

### Why page_content is an Object

The backend uses `page_content` to store structured metadata extracted from web pages:
- `images[]` - Array of image objects with src, alt, caption
- `videos[]` - Array of video objects
- `links[]` - Array of link objects
- `media[]` - Array of other media objects

The actual scraped TEXT content is stored separately in the `content` field because:
1. Text can be very large (truncated to fit model limits)
2. Structured metadata needs to be accessible for UI features
3. LLM needs text content, UI needs both text and metadata

### Image Extraction Priority

Images are extracted from multiple sources in this order:
1. `data.images` - Direct image array (e.g., from image search tools)
2. `data.page_content.images` - Images from scraped page metadata
3. `data.results[].page_content.images` - Images from each search result

All sources are deduplicated by image URL before display.

## Verification

After deployment, test with:

```
1. Simple search: "search for react hooks"
   → Should show scraped content in expandable section

2. Image-heavy search: "search for nature photography"
   → Should show all images in expandable "All Images" section

3. Multiple results: "search for python tutorials with load_content"
   → Each result should show scraped content
   → All images from all results should be collected
```

## Notes

- The fix is client-side only (no backend changes needed)
- Existing scraped content in message history will now display correctly
- Images that were already extracted by backend are now properly displayed
- No breaking changes to API or data structures

---

**Related Issues**: Web Search Content Display, Image Extraction, ExtractedContent
**Commit**: `37956f4`
**Deployed**: October 15, 2025
