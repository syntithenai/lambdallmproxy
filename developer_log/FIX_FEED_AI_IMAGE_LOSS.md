# Fix: AI-Generated Images Lost When Saving Feed Items as Snippets

## Problem
When saving a feed item with an AI-generated image as a snippet, the image is lost. Images from Unsplash and Pexels work fine.

## Root Cause Investigation

### Image Storage Architecture
The app uses a sophisticated image storage system:
1. **Image Storage Service** (`ui-new/src/utils/imageStorage.ts`): Extracts base64 data URIs from markdown content and stores them separately in IndexedDB
2. **Reference URLs**: Replaces base64 data with lightweight references like `swag-image://img_123456`
3. **Display Processing**: When displaying snippets, the service loads base64 data from IndexedDB and replaces references

### How Images Are Stored in Feed Items

**Unsplash/Pexels Images**:
- `item.image` = `https://images.unsplash.com/...` (regular URL)
- Stored as-is in markdown: `![Title](https://images.unsplash.com/...)`
- No processing needed, URL remains valid

**AI-Generated Images**:
- Backend (`src/endpoints/feed.js` lines 960-1000) sets:
  - `item.image` = `data:image/png;base64,iVBORw0KG...` (data URI)
  - `item.imageSource` = `'ai_generated'`
  - `item.imageProvider`, `item.imageModel`, etc.
- Should be stored in markdown: `![Title](data:image/png;base64,...)`
- Should be processed by `imageStorage.processContentForSave()` to extract and store in IndexedDB

### The Stash Flow

1. **FeedItem.tsx** `handleStash()` function (lines 117-163):
   ```typescript
   if (item.image) {
     content += `![${item.title}](${item.image})\n\n`;
   }
   await addSnippet(content, 'tool', item.title, tagsWithFeedMarker);
   ```

2. **SwagContext.tsx** `addSnippet()` function (lines 597-660):
   ```typescript
   let processedContent = content;
   try {
     processedContent = await imageStorage.processContentForSave(content);
   } catch (error) {
     console.error('Failed to process images, using original content:', error);
   }
   ```

3. **imageStorage.ts** `processContentForSave()` (lines 356-387):
   ```typescript
   const base64Regex = /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/g;
   const matches = content.match(base64Regex) || [];
   
   for (const base64 of uniqueMatches) {
     const imageRef = await this.saveImage(base64);
     processedContent = processedContent.split(base64).join(imageRef);
   }
   ```

### Debugging Added

Added logging to track the issue:

**FeedItem.tsx** - Log image details when stashing:
```typescript
console.log(`📸 Stashing item with image:`, {
  isDataUri,
  imageSize,
  imageSource: item.imageSource,
  imageProvider: item.imageProvider,
  imageUrl: isDataUri ? `data:... (${(imageSize / 1024).toFixed(1)} KB)` : item.image
});
```

**imageStorage.ts** - Log processing details:
```typescript
console.log(`📦 Processing ${matches.length} images for storage...`);
console.log(`📦 First image preview:`, matches[0].substring(0, 100) + '...');
console.log(`📦 Saving image (${(base64.length / 1024).toFixed(1)} KB)...`);
console.log(`✅ Saved as: ${imageRef}`);
```

## Testing Steps

1. Generate feed items with AI images (set `MATURITY_LEVEL` to enable AI image generation)
2. Click "Stash" button on a feed item with an AI-generated image
3. Check console for logging output:
   - `📸 Stashing item with image` - Should show `isDataUri: true` and size
   - `📦 Processing N images for storage` - Should show 1 image found
   - `📦 Saving image` - Should show image size
   - `✅ Saved as: swag-image://img_...` - Should show successful save
4. Navigate to Swag/Snippets page
5. Verify the saved snippet displays the image correctly

## Possible Issues to Check

1. **Regex not matching data URIs in markdown**: The regex might not be extracting base64 from `![](data:...)`
2. **Data URI truncation**: Long base64 strings might be getting cut off
3. **IndexedDB storage failure**: Large images might exceed storage limits
4. **Markdown rendering**: The snippet viewer might not be calling `processContentForDisplay()`

## Next Steps

Based on console logging output, identify which step is failing and implement the appropriate fix.

## Files Modified

- `ui-new/src/components/FeedItem.tsx` - Added image logging in `handleStash()`
- `ui-new/src/utils/imageStorage.ts` - Added detailed processing logs

## Date
2025-11-10
