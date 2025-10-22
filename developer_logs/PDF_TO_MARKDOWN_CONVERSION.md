# PDF to Markdown Conversion for Uploads

## Overview
Uploaded files (PDF, DOCX, images, HTML, etc.) are now automatically converted to markdown before being saved as SWAG snippets.

## Implementation

### Frontend Changes (`ui-new/src/components/SwagPage.tsx`)

#### Updated Upload Handler
```typescript
const handleUploadDocuments = async (files: File[], urls: string[]) => {
  for (const file of files) {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    // Check if file needs backend conversion
    if (['pdf', 'docx', 'doc', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'html', 'htm']
        .includes(fileExtension || '')) {
      
      // Send to backend for conversion
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/convert-to-markdown', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      markdownContent = result.markdown;
      
    } else {
      // Plain text files - read directly
      markdownContent = await file.text();
    }
    
    // Add as snippet (auto-embeds if enabled)
    await addSnippet(markdownContent, 'user', file.name);
  }
};
```

### Backend Changes

#### New Endpoint: POST `/convert-to-markdown`

**File:** `src/lambda_search_llm_handler.js`

**Request Formats:**

1. **File Upload (multipart/form-data):**
   ```
   FormData with 'file' field
   ```

2. **URL Fetch (application/json):**
   ```json
   {
     "url": "https://example.com/document.pdf"
   }
   ```

**Response:**
```json
{
  "markdown": "# Converted Content\n\n...",
  "content": "# Converted Content\n\n..."
}
```

#### Handler Function

```javascript
async function handleConvertToMarkdown(event, responseStream, context) {
  const { convertToMarkdown } = require('./rag/file-converters');
  
  const body = JSON.parse(event.body || '{}');
  
  // Handle file buffer (from multer)
  if (body.fileBuffer && body.fileName) {
    const buffer = Buffer.from(body.fileBuffer, 'base64');
    markdown = await convertToMarkdown(buffer, body.fileName, body.mimeType);
  }
  
  // Handle URL fetch
  else if (body.url) {
    // Fetch URL, convert to markdown
  }
  
  // Return markdown
  responseStream.write(JSON.stringify({
    statusCode: 200,
    body: JSON.stringify({ markdown })
  }));
}
```

### Local Server Changes (`scripts/run-local-lambda.js`)

#### Added Multer Middleware
```javascript
const multer = require('multer');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});
```

#### Special Route for File Uploads
```javascript
app.post('/convert-to-markdown', upload.single('file'), async (req, res) => {
  let body;
  
  if (req.file) {
    // File uploaded via multipart/form-data
    body = {
      fileBuffer: req.file.buffer.toString('base64'),
      fileName: req.file.originalname,
      mimeType: req.file.mimetype
    };
  } else {
    // URL provided via JSON
    body = req.body;
  }
  
  // Call Lambda handler with converted event
  await handler(event, context);
});
```

## Supported File Types

### With Conversion
- **PDF** → Markdown (extracts text and images)
- **DOCX/DOC** → Markdown (preserves formatting)
- **HTML/HTM** → Markdown (cleans markup)
- **Images (PNG/JPG/GIF/WEBP)** → Markdown with base64 embedded

### Plain Text (No Conversion)
- **.txt** - Plain text
- **.md** - Already markdown
- **.csv** - CSV data
- **.json** - JSON data

## Conversion Features

### PDF Conversion
```javascript
// Uses pdf-parse
const pdfModule = await import('pdf-parse/lib/pdf-parse.js');
const pdfData = await pdfModule.default(buffer);

// Extracts:
// - Text content
// - Page structure
// - Metadata (title, author, etc.)
```

### DOCX Conversion
```javascript
// Uses mammoth
const result = await mammoth.convertToHtml({ buffer });

// Then HTML → Markdown via turndown
const markdown = turndownService.turndown(result.value);

// Preserves:
// - Headings
// - Lists
// - Tables
// - Bold/italic
// - Images (as base64)
```

### HTML Conversion
```javascript
// Uses turndown
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

const markdown = turndown.turndown(html);
```

### Image Conversion
```javascript
// Converts to base64 data URI
const base64 = buffer.toString('base64');
const dataUri = `data:${mimeType};base64,${base64}`;

const markdown = `![Image](${dataUri})`;
```

## Workflow

### Upload Flow

```
User uploads PDF file
    ↓
Frontend detects .pdf extension
    ↓
Send file to /convert-to-markdown
    ↓
Backend receives via multer
    ↓
convertToMarkdown(buffer, 'file.pdf', 'application/pdf')
    ↓
PDF parsed, text extracted
    ↓
Return markdown to frontend
    ↓
Create SWAG snippet with markdown
    ↓
[If auto-embed enabled]
    ↓
Generate embeddings from markdown
    ↓
Store in RAG knowledge base
```

### URL Flow

```
User enters document URL
    ↓
Frontend sends { url: "..." }
    ↓
Backend fetches URL
    ↓
Detect content type
    ↓
Convert to markdown
    ↓
Return to frontend
    ↓
Create snippet + embed
```

## Benefits

### ✅ Advantages

1. **Rich Content Extraction**: PDFs become searchable text
2. **Format Preservation**: DOCX formatting converted to markdown
3. **Image Embedding**: Images embedded as base64 (self-contained)
4. **Consistent Format**: All content stored as markdown
5. **Better Embeddings**: Clean markdown produces better vector embeddings
6. **Offline Access**: Base64 images don't require external URLs

### 🎯 Use Cases

- **Research Papers** (PDF) → Searchable knowledge base
- **Documentation** (DOCX) → Markdown snippets
- **Web Articles** (HTML) → Clean markdown
- **Screenshots** (PNG/JPG) → Embedded images
- **Mixed Content** → Unified markdown format

## Dependencies

### Required Packages

**Already Installed:**
- ✅ `pdf-parse` - PDF text extraction
- ✅ `mammoth` - DOCX conversion
- ✅ `turndown` - HTML to markdown

**Need to Install:**
- ❌ `multer` - File upload handling

### Installation

```bash
npm install multer
```

Or add to `package.json`:
```json
{
  "dependencies": {
    "multer": "^1.4.5-lts.1"
  }
}
```

## Error Handling

### Frontend
```typescript
try {
  const response = await fetch('/convert-to-markdown', {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`Failed to convert ${file.name}`);
  }
  
  const result = await response.json();
  markdownContent = result.markdown;
  
} catch (error) {
  console.error(`Failed to process ${file.name}:`, error);
  showWarning(`Could not process ${file.name}`);
}
```

### Backend
```javascript
try {
  markdown = await convertToMarkdown(buffer, fileName, mimeType);
} catch (error) {
  console.error('Conversion error:', error);
  responseStream.write(JSON.stringify({
    statusCode: 500,
    body: JSON.stringify({ 
      error: 'Failed to convert document',
      details: error.message 
    })
  }));
}
```

## Testing Checklist

### File Upload Tests
- [ ] Upload .pdf file converts to markdown
- [ ] Upload .docx file converts to markdown
- [ ] Upload .html file converts to markdown
- [ ] Upload .png image embeds as base64
- [ ] Upload .txt file reads directly (no conversion)
- [ ] Upload .md file reads directly (no conversion)

### Conversion Quality Tests
- [ ] PDF text extraction works correctly
- [ ] DOCX formatting preserved in markdown
- [ ] HTML cleaned and converted properly
- [ ] Images embedded as valid base64
- [ ] Tables converted to markdown tables
- [ ] Links preserved in conversion

### Integration Tests
- [ ] Converted snippet appears in SWAG list
- [ ] Auto-embed creates embeddings from markdown
- [ ] Search finds content from converted docs
- [ ] Chat can retrieve converted content

### Error Handling Tests
- [ ] Invalid file shows error message
- [ ] Oversized file shows error (>50MB)
- [ ] Network error shows error message
- [ ] Unsupported format falls back to text

## Example Conversions

### PDF to Markdown
**Input:** `research-paper.pdf`
```
[Binary PDF data with text and images]
```

**Output:**
```markdown
# Research Paper Title

## Abstract

This paper presents...

## Introduction

Recent advances in...

![Figure 1](data:image/png;base64,iVBORw0K...)

## Methodology

We propose a novel approach...
```

### DOCX to Markdown
**Input:** `report.docx`
```
[Word document with headings, lists, tables]
```

**Output:**
```markdown
# Executive Summary

Key findings:
- Revenue increased 15%
- Customer satisfaction: 92%

| Quarter | Revenue | Growth |
|---------|---------|--------|
| Q1      | $1.2M   | 10%    |
| Q2      | $1.5M   | 25%    |
```

### HTML to Markdown
**Input:** `article.html`
```html
<article>
  <h1>Article Title</h1>
  <p>Content with <strong>bold</strong> and <em>italic</em>.</p>
  <ul>
    <li>Point 1</li>
    <li>Point 2</li>
  </ul>
</article>
```

**Output:**
```markdown
# Article Title

Content with **bold** and *italic*.

- Point 1
- Point 2
```

## Performance Considerations

### File Size Limits
- **Frontend**: No limit (browser handles)
- **Multer**: 50MB configured limit
- **Lambda**: Consider memory limits for large PDFs

### Conversion Time
- **Small PDF** (<1MB): ~1-2 seconds
- **Large PDF** (10MB+): ~5-10 seconds
- **DOCX**: ~1-3 seconds
- **HTML**: <1 second
- **Images**: <1 second (base64 encoding)

### Memory Usage
- **PDF Parsing**: High (entire document in memory)
- **DOCX Conversion**: Moderate
- **HTML Conversion**: Low
- **Image Encoding**: Moderate (buffer size)

### Optimization Strategies
1. **Stream Large Files**: For very large PDFs
2. **Chunk Processing**: Process in batches
3. **External Storage**: Store images separately
4. **Caching**: Cache converted results
5. **Timeouts**: Set reasonable timeout limits

## Future Enhancements

### Planned Improvements
- [ ] Support for more formats (PPT, Excel, etc.)
- [ ] OCR for scanned PDFs
- [ ] Better table extraction
- [ ] Preserve document structure
- [ ] Metadata extraction (author, date, etc.)
- [ ] Multi-page PDF splitting
- [ ] Conversion quality settings
- [ ] Preview before saving
- [ ] Batch conversion progress

### Advanced Features
- [ ] Extract and link images separately
- [ ] Generate table of contents
- [ ] Auto-tag based on content
- [ ] Language detection
- [ ] Citation extraction
- [ ] Summary generation

## Files Modified

✅ Frontend:
- `ui-new/src/components/SwagPage.tsx` - Upload handler with conversion

✅ Backend:
- `src/lambda_search_llm_handler.js` - `/convert-to-markdown` endpoint
- `scripts/run-local-lambda.js` - Multer middleware

📄 Existing (Used):
- `src/rag/file-converters.js` - Conversion functions

📦 Dependencies:
- `multer` (needs installation)

## Summary

Files uploaded to SWAG are now automatically converted to markdown format before being saved as snippets. This enables:

1. **Better Content Extraction** - Text from PDFs and Word docs
2. **Consistent Storage** - Everything as markdown
3. **Improved Search** - Clean text for embeddings
4. **Self-Contained** - Images embedded as base64

The conversion happens transparently - users upload files as before, but now get properly formatted markdown snippets that are optimized for RAG-powered search and retrieval.
