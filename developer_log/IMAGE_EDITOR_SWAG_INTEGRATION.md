# Image Editor and Markdown Editor Swag Integration

**Date**: October 27, 2025  
**Status**: ✅ Complete  
**Components**: ImageEditor, MarkdownEditor, ImagePicker  

## Overview

Enhanced the Image Editor and Markdown Editor to better integrate with the Swag content management system:

1. **Image Editor**: Save all edited/generated images to Swag as new snippets (preserving originals)
2. **Markdown Editor**: Enable selection of images from Swag library for insertion

## Changes Implemented

### 1. Image Editor - Save to Swag as New Images

**File**: `ui-new/src/components/ImageEditor/ImageEditorPage.tsx`

**Previous Behavior**:
- Replaced original images in their source snippets
- Modified existing snippet content by updating image URLs

**New Behavior**:
- Saves each edited image as a **new snippet** in Swag
- Preserves original images unchanged
- Creates standalone image snippets with:
  - Title: "Edited Image - [timestamp]"
  - Content: Markdown image syntax with new image URL
  - Source type: 'user'

**Implementation**:
```typescript
const handleSaveToSwag = async () => {
  // For each processed image
  for (const [imageId, newUrl] of processedImageUrls.entries()) {
    const image = allImages.find((img) => img.id === imageId);
    
    // Create new snippet
    const title = `Edited Image - ${new Date().toLocaleString()}`;
    const content = `![${image.name || 'Edited image'}](${newUrl})`;
    
    // Add as new snippet (not replacing)
    await addSnippet(content, 'user', title);
  }
};
```

**Benefits**:
- ✅ Non-destructive editing workflow
- ✅ Maintains version history (originals + edits both in Swag)
- ✅ Easy to track edited images with timestamps
- ✅ Allows comparison between original and edited versions

### 2. Markdown Editor - Image Picker from Swag

**New Component**: `ui-new/src/components/ImagePicker.tsx`

**Features**:
- **Image Extraction**: Scans all Swag snippets for images
  - Markdown syntax: `![alt](url)`
  - HTML `<img>` tags with and without alt text
- **Search**: Filter images by alt text, URL, or snippet title
- **Grid Display**: Responsive grid layout (2-4 columns)
- **Image Preview**: Hover to see image details and source snippet
- **Error Handling**: Fallback for broken image URLs

**MarkdownEditor Enhancement**:
- Added new toolbar button: "Select from Swag" (gallery icon)
- Custom command: `imagePickerCommand`
- Opens modal image picker
- Inserts selected image at cursor position

**Usage Flow**:
1. User clicks "Select from Swag" button in markdown toolbar
2. Modal opens showing all images from Swag snippets
3. User can search/filter images
4. Click image to insert `![alt](url)` at cursor
5. Modal closes, markdown updated

**Implementation**:
```typescript
// New toolbar command
const imagePickerCommand = {
  name: 'image-picker',
  icon: <GalleryIcon />,
  execute: (state, api) => {
    setEditorApi(api);
    setShowImagePicker(true);
  }
};

// Handler for image selection
const handleImageSelected = (imageUrl: string, altText: string) => {
  if (editorApi) {
    editorApi.replaceSelection(`![${altText}](${imageUrl})`);
  }
  setShowImagePicker(false);
};
```

**Benefits**:
- ✅ Reuse images across multiple snippets
- ✅ No need to re-upload or remember image URLs
- ✅ Centralized image library in Swag
- ✅ Search functionality for large image collections

## Bug Fixes

**Issue**: Backend auth import errors in image endpoints  
**Files Fixed**:
- `src/endpoints/image-edit.js`
- `src/endpoints/parse-image-command.js`

**Problem**: 
```javascript
const { verifyGoogleToken } = require('../utils/auth'); // ❌ Wrong path
```

**Solution**:
```javascript
const { verifyGoogleToken } = require('../auth'); // ✅ Correct path
```

Auth module is located at `src/auth.js`, not `src/utils/auth.js`.

## Testing

### Manual Testing Checklist

**Image Editor Save to Swag**:
- [x] Edit multiple images in Image Editor
- [x] Click "Save to Swag" button
- [x] Verify new snippets created (not replacing originals)
- [x] Check snippet titles have timestamps
- [x] Verify markdown image syntax is correct
- [x] Navigate to Swag page and confirm new images appear

**Markdown Editor Image Picker**:
- [x] Open Swag snippet with markdown editor
- [x] Click "Select from Swag" button in toolbar
- [x] Verify image picker modal opens
- [x] Test search functionality
- [x] Select an image
- [x] Verify markdown syntax inserted at cursor
- [x] Preview markdown to see image rendered

**Edge Cases**:
- [x] No images in Swag (shows empty state)
- [x] Search with no results (shows "no matches")
- [x] Broken image URLs (shows placeholder)
- [x] Images without alt text (defaults to "Image")
- [x] Multiple images from same snippet (all extracted)

### Local Dev Server

```bash
make dev
```

**Servers Running**:
- ✅ Lambda backend: http://localhost:3000
- ✅ UI frontend: http://localhost:8081

**Hot Reload**: Both servers auto-restart on file changes

## User Guide

### Saving Edited Images to Swag

1. **Edit Images**:
   - Navigate to Image Editor from Swag page
   - Select images to edit
   - Apply transformations (resize, rotate, filters, etc.)

2. **Save Results**:
   - Click "Save to Swag" button (shows count of processed images)
   - Confirmation: "Successfully saved X edited image(s) to Swag as new snippets"
   - Auto-navigates back to Swag page

3. **View Saved Images**:
   - New snippets appear in Swag with titles: "Edited Image - [date/time]"
   - Each contains markdown image syntax
   - Original images remain unchanged

### Using Image Picker in Markdown Editor

1. **Open Markdown Editor**:
   - Edit any Swag snippet with markdown content
   - Or create new snippet

2. **Insert Image from Swag**:
   - Click gallery icon button in toolbar (next to image upload)
   - Modal opens showing all images from Swag

3. **Search & Select**:
   - Use search box to filter by alt text, URL, or snippet title
   - Hover over images to see details
   - Click image to insert

4. **Result**:
   - Markdown image syntax inserted at cursor: `![alt text](image-url)`
   - Modal closes automatically
   - Preview pane shows rendered image

## Technical Details

### Image Extraction Regex Patterns

**Markdown Images**:
```regex
/!\[([^\]]*)\]\(([^)]+)\)/g
```

**HTML Images (with alt)**:
```regex
/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi
```

**HTML Images (without alt)**:
```regex
/<img[^>]+src="([^"]+)"(?![^>]*alt=)[^>]*>/gi
```

### Data Flow

**Image Editor Save**:
```
ImageEditorPage
  → processedImageUrls Map<imageId, newUrl>
  → handleSaveToSwag()
  → addSnippet(content, 'user', title)
  → SwagContext.addSnippet()
  → storage.setItem('swag-snippets')
```

**Image Picker Selection**:
```
MarkdownEditor
  → imagePickerCommand.execute()
  → setShowImagePicker(true)
  → <ImagePicker />
  → onSelectImage(url, alt)
  → editorApi.replaceSelection()
  → MDEditor onChange()
```

### SwagContext Integration

**Used Methods**:
- `addSnippet(content, sourceType, title)`: Create new snippet
- `snippets`: Read-only access to all snippets

**Storage**:
- LocalStorage key: `swag-snippets`
- Syncs with Google Sheets (if configured)
- Supports RAG embeddings

## Known Limitations

1. **Image Hosting**: Images must be hosted externally (data URLs work but not recommended for large images)
2. **No Duplicate Detection**: Saving same edited image twice creates duplicate snippets
3. **No Batch Tagging**: Saved images don't auto-tag as "edited" or "generated"
4. **Search Performance**: Image extraction runs on every render (memoized, but could be optimized for 1000+ snippets)

## Future Enhancements

### Potential Improvements

1. **Auto-Tagging**:
   - Tag edited images with: `#edited`, `#image-editor`, operation type
   - Add timestamp tags: `#2025-10`, `#october`

2. **Image Metadata**:
   - Store original image reference
   - Track edit history (operations applied)
   - Save dimensions, format, file size

3. **Duplicate Detection**:
   - Hash image content
   - Warn user before saving duplicate
   - Option to update existing snippet instead

4. **Bulk Operations**:
   - Save all edited images with one click
   - Select multiple images from picker for batch insert
   - Tag multiple images at once

5. **Image Optimization**:
   - Compress images before saving
   - Generate thumbnails for preview
   - Convert to WebP automatically

6. **Smart Search**:
   - OCR text extraction from images
   - Search by image content (AI vision)
   - Date range filters
   - Snippet tags filter

## Related Files

### Modified Files
- `ui-new/src/components/ImageEditor/ImageEditorPage.tsx`
- `ui-new/src/components/MarkdownEditor.tsx`
- `src/endpoints/image-edit.js`
- `src/endpoints/parse-image-command.js`

### New Files
- `ui-new/src/components/ImagePicker.tsx`

### Dependencies
- `@uiw/react-md-editor`: Markdown editor component
- `rehype-sanitize`: Markdown sanitization
- `SwagContext`: Content management
- `sharp`: Server-side image processing (Lambda layer)

## Deployment

### Local Development
```bash
make dev
```

### Production Deployment

**UI Deployment**:
```bash
make deploy-ui
```
Builds React app and deploys to GitHub Pages.

**Backend Deployment** (if needed):
```bash
make deploy-lambda-fast  # Code only
make deploy-lambda       # Full (with dependencies)
```

## Conclusion

✅ **Image Editor**: Now saves edited images as new snippets (non-destructive)  
✅ **Markdown Editor**: Can insert images from Swag library with search  
✅ **Bug Fixes**: Auth import paths corrected  
✅ **Local Dev**: Running successfully on localhost:3000 (backend) and localhost:8081 (UI)  

Both features integrate seamlessly with existing Swag content management system and preserve backward compatibility.
