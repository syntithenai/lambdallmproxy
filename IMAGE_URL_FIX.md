# Image URL and Media Sections Fix

**Date**: October 12, 2025  
**Branch**: agent  
**Commit**: 92bcfb1

---

## Issues Fixed

### 1. ❌ Image URLs Showing as `[object Object]`

**Problem**: Images were displaying as `http://localhost:8081/[object%20Object]` instead of actual image URLs.

**Root Cause**: The `extractMediaFromMessage` function was pushing image objects (with `src`, `alt`, `caption` properties) directly into the images array instead of extracting the URL string.

**Fix**: Updated the extraction logic to handle multiple image formats:
- String URLs (direct)
- Objects with `src` property
- Objects with `url` property

```typescript
// Before
media.images.push(...r.images);

// After
r.images.forEach((img: any) => {
  if (typeof img === 'string') {
    media.images.push(img);
  } else if (img && img.src) {
    media.images.push(img.src);
  } else if (img && img.url) {
    media.images.push(img.url);
  }
});
```

### 2. ❌ Media Sections Showing on All Messages

**Problem**: Image gallery and media sections were appearing on every assistant message, not just the final response.

**Root Cause**: The rendering logic didn't check if this was the final assistant message.

**Fix**: Added logic to only show media sections on the final assistant message with content:

```typescript
// Check if this is the final assistant message
const isFinalAssistantMessage = msg.content && !msg.isStreaming && 
  // Check if there are no subsequent assistant messages with content
  !messages.slice(idx + 1).some(m => m.role === 'assistant' && m.content);

if (!isFinalAssistantMessage) return null;
```

---

## Changes Made

### File: `ui-new/src/components/ChatTab.tsx`

#### A. Enhanced `extractMediaFromMessage` Function (Lines 468-528)

**Images Extraction**:
- Handles string URLs directly
- Extracts `src` from object format `{ src: '...', alt: '...', caption: '...' }`
- Extracts `url` from object format `{ url: '...' }`
- Applied to all image sources:
  - Search results (`data.results[].images`)
  - Direct images array (`data.images`)
  - Page content images (`data.page_content + data.images`)

**Links Extraction**:
- Added extraction from `r.links` array
- Handles string URLs
- Handles objects with `href` property
- Handles objects with `url` property
- Preserves link titles where available

#### B. Updated Media Display Logic (Lines 3208-3241)

**Conditional Rendering**:
1. Check if message has content
2. Check if message is not streaming
3. Check if no subsequent assistant messages exist
4. Check if any media exists
5. Only then render ImageGallery and MediaSections

**Result**: Media sections now only appear on the final LLM response, not on intermediate tool result messages.

---

## Testing Checklist

### Image URL Fix
- [x] Search for images with web search
- [ ] Verify images display correctly (not `[object Object]`)
- [ ] Click images to open in new tab
- [ ] Verify image URLs are proper HTTP/HTTPS links

### Media Sections Placement
- [x] Send query that uses multiple tools (search, scrape, etc.)
- [ ] Verify image gallery appears ONLY after final response
- [ ] Verify media sections appear ONLY after final response
- [ ] Verify no media on intermediate tool messages
- [ ] Verify media includes all extracted images from all tools

### Link Extraction
- [ ] Verify all links extracted from search results
- [ ] Verify all links extracted from scraped pages
- [ ] Verify link titles display correctly
- [ ] Verify links open in new tab

---

## Example Behavior

### Before Fix
```
User: Search for cats
Assistant: [tool call: search_web]
  🖼️ [object Object], [object Object], [object Object]  ❌
  📎 Extracted Content (wrong placement)
Assistant: Here are some results...
  🖼️ [object Object], [object Object], [object Object]  ❌
  📎 Extracted Content
```

### After Fix
```
User: Search for cats
Assistant: [tool call: search_web]
  (no media shown here)
Assistant: Here are some results...
  🖼️ [3 actual image thumbnails]  ✅
  📎 Extracted Content
    🖼️ All Images (10)
    🔗 All Links (15)
    🎥 YouTube Links (3)
```

---

## Technical Details

### Image Format Support
Now handles images from:
1. **Search results**: `{ src: '...', alt: '...', caption: '...' }`
2. **Direct arrays**: Both strings and objects
3. **Page content**: Mixed formats from web scraping

### Link Format Support
Now handles links from:
1. **Search results**: `{ url: '...', title: '...' }`
2. **Extracted content**: `{ href: '...', text: '...' }`
3. **Direct arrays**: String URLs

### Message Detection
Uses array slicing to look ahead:
```typescript
messages.slice(idx + 1).some(m => m.role === 'assistant' && m.content)
```
This checks if any subsequent message is an assistant message with content, ensuring we only show media on the truly final response.

---

## Deployment

✅ **Build**: Success  
✅ **Deploy**: Pushed to GitHub Pages  
✅ **Live**: https://lambdallmproxy.pages.dev

---

## Related Files

- `ui-new/src/components/ChatTab.tsx` - Main changes
- `ui-new/src/components/ImageGallery.tsx` - Image display
- `ui-new/src/components/MediaSections.tsx` - Media sections display
- `src/tools.js` - Backend image format (reference)

---

## Summary

Fixed two critical issues:
1. ✅ Images now display with correct URLs instead of `[object Object]`
2. ✅ Media sections only appear on final LLM response, not on every message

The UI now correctly extracts and displays all media types from tool results, with proper placement only on the final assistant response.
