# SWAG Page Upload Feature

## Overview
Document upload functionality has been moved from RAG Settings to the SWAG page, making it easier to upload documents to the knowledge base while managing content snippets.

## Changes Made

### 1. SwagPage.tsx Updates

#### New Imports
```typescript
import { FileUploadDialog } from './FileUploadDialog';
```

#### New State Variables
```typescript
// Document upload state
const [showUploadDialog, setShowUploadDialog] = useState(false);
const [uploadProgress, setUploadProgress] = useState<{
  current: number;
  total: number;
  status: string;
} | null>(null);
```

#### New Functions

**handleUploadDocuments(files: File[], urls: string[])**
- Handles batch upload of files and URLs to the knowledge base
- Shows progress indicator with current/total count
- Calls `/rag/ingest` endpoint for each file/URL
- Parses SSE responses for real-time feedback
- Displays success/error messages

**handleSingleUpload(fileOrUrl: File | string)**
- Adapter function for FileUploadDialog compatibility
- Wraps single file/URL in array for handleUploadDocuments

#### UI Components Added

**Upload Button (Header)**
```tsx
<button
  onClick={() => setShowUploadDialog(true)}
  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-2"
  title="Upload documents to knowledge base"
>
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
  Upload to KB
</button>
```

**Upload Progress Overlay**
```tsx
{uploadProgress && (
  <div className="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-40">
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl min-w-[300px]">
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300 mb-2">
          <span>{uploadProgress.status}</span>
          <span>{uploadProgress.current} / {uploadProgress.total}</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
          />
        </div>
      </div>
    </div>
  </div>
)}
```

**FileUploadDialog Integration**
```tsx
{showUploadDialog && (
  <FileUploadDialog
    isOpen={showUploadDialog}
    onClose={() => setShowUploadDialog(false)}
    onUpload={handleSingleUpload}
  />
)}
```

## User Experience

### Upload Flow

1. **Click "Upload to KB" button** in SWAG page header
2. **Select file or enter URL** in the upload dialog
3. **Review estimated cost** (if applicable)
4. **Click Upload** to begin ingestion
5. **Watch progress** in overlay (shows file name and count)
6. **See success message** when complete

### Features

- **File Support**: .pdf, .docx, .txt, .md, .html, .csv, .json, images
- **URL Support**: Any http/https URL
- **Progress Tracking**: Real-time status updates during upload
- **Error Handling**: Clear error messages if upload fails
- **SSE Streaming**: Backend sends progress events via Server-Sent Events
- **Dark Mode**: Full support for dark theme

## Backend Integration

### Endpoint Used
- **POST** `/rag/ingest`
- **Body**: `{ content?, url?, title, sourceType: 'file' | 'url' }`
- **Response**: SSE stream with progress events

### Request Format

**File Upload:**
```json
{
  "content": "file content as text",
  "sourceType": "file",
  "title": "filename.txt"
}
```

**URL Upload:**
```json
{
  "url": "https://example.com/document",
  "title": "https://example.com/document"
}
```

### SSE Events

```
data: {"message": "Processing document..."}
data: {"message": "Chunking text..."}
data: {"message": "Generating embeddings..."}
data: {"message": "Stored 10 chunks"}
data: {"error": "Error message"}  // On failure
```

## Technical Details

### State Management
- Upload state managed locally in SwagPage
- No global state changes needed
- Progress overlay shows/hides based on `uploadProgress` state

### Error Handling
- Try-catch blocks around all async operations
- User-friendly error messages via toast notifications
- Cleanup in finally blocks ensures UI resets

### Progress Tracking
```typescript
setUploadProgress({ 
  current: completedCount, 
  total: totalItems, 
  status: 'Uploading file.txt...' 
});
```

### Memory Management
- File content read as text (await file.text())
- SSE reader properly closed after use
- No memory leaks from unclosed streams

## Location in Codebase

### Modified File
- `ui-new/src/components/SwagPage.tsx`

### Related Files (Unchanged)
- `ui-new/src/components/FileUploadDialog.tsx` - Reused dialog component
- `src/lambda_search_llm_handler.js` - Backend endpoint handler
- `src/rag/libsql-storage.js` - Storage layer

## Testing Checklist

- [ ] Click "Upload to KB" button opens dialog
- [ ] Select .txt file and upload successfully
- [ ] Select .md file and upload successfully
- [ ] Enter valid URL and upload successfully
- [ ] Progress overlay shows during upload
- [ ] Success message appears on completion
- [ ] Error message appears on failure
- [ ] Dialog closes after successful upload
- [ ] Multiple files can be uploaded sequentially
- [ ] Dark mode styling looks correct
- [ ] Upload works with dev server (localhost:3000)
- [ ] Upload works with deployed Lambda

## Benefits

1. **Centralized Location**: Upload directly from content management page
2. **Better UX**: No need to switch to settings to upload documents
3. **Consistent UI**: Matches existing SWAG page design patterns
4. **Easy Access**: Upload button always visible in header
5. **Progress Feedback**: Real-time updates during long uploads
6. **Error Recovery**: Clear messages help users fix issues

## Future Enhancements

- [ ] Batch file selection (multiple files at once)
- [ ] Drag-and-drop upload anywhere on SWAG page
- [ ] Document management view in SWAG page
- [ ] Show which documents embeddings came from
- [ ] Delete uploaded documents from SWAG page
- [ ] Re-process documents with different chunk settings
- [ ] Show document metadata in snippet tooltips
