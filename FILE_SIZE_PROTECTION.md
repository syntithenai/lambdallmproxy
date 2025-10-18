# File Size Protection for Document Uploads

## Overview
Added file size checks and warnings to prevent UI slowdown when uploading large files.

## Implementation

### Size Limits

```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB hard limit
const WARN_FILE_SIZE = 10 * 1024 * 1024; // 10MB warning threshold
```

### Protection Logic

**File:** `ui-new/src/components/SwagPage.tsx` - `handleUploadDocuments()`

```typescript
// Check for oversized files
const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
if (oversizedFiles.length > 0) {
  const fileList = oversizedFiles.map(f => 
    `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`
  ).join(', ');
  showError(`Files too large (max 50MB): ${fileList}`);
  setLoading(false);
  setUploadProgress(null);
  return; // Abort upload
}

// Warn about large files
const largeFiles = files.filter(f => 
  f.size > WARN_FILE_SIZE && f.size <= MAX_FILE_SIZE
);
if (largeFiles.length > 0) {
  const fileList = largeFiles.map(f => 
    `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`
  ).join(', ');
  showWarning(`Large files detected - processing may be slow: ${fileList}`);
}
```

## User Experience

### Upload Flow

```
User selects files
    ↓
Check file sizes
    ↓
[If any file > 50MB]
    ↓
❌ Show error: "Files too large (max 50MB): filename.pdf (75.3MB)"
    ↓
Abort upload (no files processed)

[If files 10MB-50MB]
    ↓
⚠️ Show warning: "Large files detected - processing may be slow: doc.pdf (23.5MB)"
    ↓
Continue processing (with warning)

[If all files < 10MB]
    ↓
✅ Process normally (no warning)
```

## Size Categories

### Small Files (<10MB)
- **Processing**: Fast, no warnings
- **Experience**: Smooth, responsive UI
- **Examples**: 
  - Text files (TXT, MD, JSON)
  - Small PDFs
  - Regular images
  - Short documents

### Large Files (10MB-50MB)
- **Processing**: Slower, warning shown
- **Experience**: UI may briefly freeze during conversion
- **Warning Message**: "Large files detected - processing may be slow"
- **Examples**:
  - Large PDFs with many pages
  - High-resolution images
  - Complex DOCX files
  - Scanned documents

### Oversized Files (>50MB)
- **Processing**: BLOCKED
- **Experience**: Upload rejected immediately
- **Error Message**: "Files too large (max 50MB): filename (75.3MB)"
- **Examples**:
  - Very large PDFs
  - Video files
  - Large image archives
  - Multi-hundred page documents

## Why These Limits?

### 10MB Warning Threshold
- **PDF Parsing**: pdf-parse loads entire file into memory
- **Image Processing**: Canvas operations can be memory-intensive
- **UI Responsiveness**: JavaScript is single-threaded
- **User Expectation**: Users should know processing will take time

### 50MB Hard Limit
- **Browser Memory**: Prevent browser tab crashes
- **Lambda Limits**: AWS Lambda has memory constraints
- **Processing Time**: Very large files can timeout
- **User Experience**: Anything larger should be split or compressed

## Benefits

### ✅ Prevents UI Freezing
- Blocks massive files before processing starts
- No more unresponsive browser tabs
- User can continue working while files process

### ✅ Clear User Feedback
- Shows file size in human-readable format (MB)
- Lists specific files that are problematic
- Explains why upload was rejected

### ✅ Graceful Degradation
- Warning for large-but-acceptable files
- Hard stop for unacceptable files
- Doesn't penalize small files with unnecessary checks

## Error Messages

### Oversized Files
```
Files too large (max 50MB): 
- research_paper.pdf (75.3MB)
- dataset.csv (102.5MB)
```

### Large Files (Warning)
```
Large files detected - processing may be slow:
- manual.pdf (23.5MB)
- presentation.pptx (15.2MB)
```

## Implementation Details

### File Size Check Timing
```
1. User selects files
2. handleUploadDocuments() called
3. setLoading(true) - Show loading state
4. setUploadProgress() - Initialize progress
5. → CHECK FILE SIZES ← (NEW)
6. If oversized: Show error, abort
7. If large: Show warning
8. Process files normally
```

### Why Check Early?
- **Before** setting up progress tracking
- **Before** starting any processing
- **Before** converting files to markdown
- **After** loading state is set (so error shows properly)

### File Size Calculation
```typescript
// File object has built-in size property (bytes)
const sizeInBytes = file.size;
const sizeInMB = file.size / 1024 / 1024;

// Display with 1 decimal place
const displaySize = `${sizeInMB.toFixed(1)}MB`;
```

## Testing

### Test Cases

**Small Files:**
- [ ] Upload 1MB PDF → No warning, processes quickly
- [ ] Upload 5MB image → No warning, converts properly
- [ ] Upload multiple small files → No warnings

**Large Files:**
- [ ] Upload 15MB PDF → Warning shown, processes (slowly)
- [ ] Upload 40MB DOCX → Warning shown, processes
- [ ] Mix of small and large → Only large files listed in warning

**Oversized Files:**
- [ ] Upload 60MB PDF → Error shown, upload blocked
- [ ] Upload 100MB file → Error shown, upload blocked
- [ ] Upload 55MB file → Error shown (over limit)

**Edge Cases:**
- [ ] Upload exactly 10MB → No warning (at threshold)
- [ ] Upload exactly 50MB → No error (at limit)
- [ ] Upload 10.1MB → Warning shown (just over threshold)
- [ ] Upload 50.1MB → Error shown (just over limit)

**Mixed Scenarios:**
- [ ] Upload 5MB + 70MB files → Error lists only oversized
- [ ] Upload 15MB + 20MB files → Warning lists both
- [ ] Upload 5MB + 15MB + 70MB → Error (oversized takes precedence)

## Configuration

### Adjusting Limits

To change the limits, edit `handleUploadDocuments()` in `SwagPage.tsx`:

```typescript
// Current settings
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const WARN_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// More permissive
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const WARN_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// More restrictive
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const WARN_FILE_SIZE = 5 * 1024 * 1024; // 5MB
```

### Recommendations by Use Case

**Public-Facing App:**
- MAX: 10MB (prevent abuse)
- WARN: 5MB

**Internal Tool:**
- MAX: 100MB (trust users)
- WARN: 25MB

**Development:**
- MAX: 50MB (balanced)
- WARN: 10MB (current)

**Shared Hosting:**
- MAX: 25MB (memory limits)
- WARN: 10MB

## Future Enhancements

### Chunked Processing
```typescript
// For very large files, process in chunks
if (file.size > CHUNK_THRESHOLD) {
  await processInChunks(file, CHUNK_SIZE);
}
```

### Web Workers
```typescript
// Process files in background thread
const worker = new Worker('file-processor.js');
worker.postMessage({ file, action: 'convert' });
```

### Server-Side Processing
```typescript
// Upload to server first, process there
const uploadUrl = await getSignedUploadUrl();
await fetch(uploadUrl, { method: 'PUT', body: file });
await triggerServerSideProcessing(fileId);
```

### Progress for Large Files
```typescript
// Show detailed progress for slow operations
setUploadProgress({
  current: 0,
  total: 100,
  status: 'Extracting PDF pages... 15/230'
});
```

## Related Files

- ✅ Modified: `ui-new/src/components/SwagPage.tsx`
- 📄 Used: Browser File API (file.size property)
- 🔧 Backend: No changes needed (already has multer 50MB limit)

## Summary

Added comprehensive file size protection to prevent UI slowdown:

1. **10MB Warning**: Alerts user that processing may be slow
2. **50MB Hard Limit**: Rejects files that would crash browser/Lambda
3. **User-Friendly Messages**: Shows file names and sizes
4. **Early Detection**: Checks before any processing begins

This ensures a responsive UI even when users attempt to upload very large files.
