# Snippet Context Bugfixes

## Issues Fixed

### 1. TagAutocomplete TypeError
**Error:** `Cannot read properties of undefined (reading 'filter')`

**Root Cause:** 
- SnippetSelector was trying to use TagAutocomplete with wrong props (`availableTags`, `selectedTags`)
- TagAutocomplete expects `existingTags` and `currentTags`
- TagAutocomplete wasn't designed for multi-select filtering

**Solution:**
- Replaced TagAutocomplete in SnippetSelector with simple clickable tag badges (same pattern as SwagPage)
- Added safety check in TagAutocomplete to handle undefined `existingTags`
- Tags can now be clicked to toggle filter selection
- Added "Clear tag filters" button

### 2. Images in Snippet Context
**Issue:** Base64 images and large image data being sent in snippet context, causing:
- Massive payload sizes
- Potential context window overflow
- Unnecessary data transmission

**Solution:**
Added `stripImages()` function that removes:
- Markdown images: `![alt](url)` → `[Image: alt]`
- HTML img tags with base64: `<img src="data:image/...">` → `[Base64 Image]`
- HTML img tags: `<img src="...">` → `[Image]`
- Standalone base64 data URLs: `data:image/...;base64,...` → `[Base64 Image Data]`

## Files Modified

1. **ui-new/src/components/TagAutocomplete.tsx**
   - Added safety check for undefined `existingTags`
   - Returns empty array if `existingTags` is undefined or not an array

2. **ui-new/src/components/SnippetSelector.tsx**
   - Removed TagAutocomplete import
   - Replaced TagAutocomplete with clickable tag badges for filtering
   - Added "Clear tag filters" button

3. **ui-new/src/components/ChatTab.tsx**
   - Added `stripImages()` helper function
   - Strips all image formats from snippet content before sending
   - Updated console log to indicate images are stripped

## Testing

### Tag Filtering
- [x] Click tags to toggle filter
- [x] Multiple tags can be selected
- [x] Clear button removes all tag filters
- [x] Filtering works correctly with selected tags
- [x] No more TagAutocomplete errors

### Image Stripping
- [ ] Test with snippet containing markdown images
- [ ] Test with snippet containing HTML img tags
- [ ] Test with snippet containing base64 images
- [ ] Verify images are replaced with placeholder text
- [ ] Verify snippet context is much smaller without images
- [ ] Verify LLM still receives useful text content

## Benefits

1. **Smaller Payloads**: Removing images dramatically reduces message size
2. **Better UX**: Tag filtering is now more intuitive (click to toggle)
3. **No Errors**: TagAutocomplete safety check prevents crashes
4. **Consistent Pattern**: Tag selection now matches SwagPage design
5. **Context Window**: More room for actual text content instead of base64 data

## Notes

The `stripImages()` function preserves alt text from markdown images as `[Image: alt]`, giving the LLM context about what was removed. This is better than silently dropping the content entirely.
