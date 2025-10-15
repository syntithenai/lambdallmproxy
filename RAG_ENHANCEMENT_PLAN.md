# RAG System Enhancement Plan

**Date:** October 15, 2025  
**Status:** 📋 PLANNING PHASE

---

## 🎯 Overview

Enhance the existing RAG system with:
1. **Document Source References** - Link search results back to original sources
2. **File Upload System** - Support URL paste and file upload with original resource tracking
3. **embedjs Integration** - Use embedjs for tokenization and multi-format file support
4. **libsql Vector Database** - Deploy embedded vector DB in Lambda layer with pre-populated knowledge base
5. **LLM Snippet Tool** - Enable LLM to create, search, and manage snippets for workflow generation
6. **Makefile Commands** - CLI tools for document ingestion, listing, and deletion

---

## 📊 Phase 1: Document Source References & File Upload

### 1.1 Add Source Metadata to Chunks

**Goal:** Track original document source for each chunk

**Changes:**
```javascript
// src/rag/chunker.js - Add source metadata
{
  id: 'uuid',
  snippet_id: 'snippet_uuid',
  snippet_name: 'My Document',
  chunk_index: 0,
  chunk_text: 'content...',
  embedding: Float32Array([...]),
  
  // NEW: Source tracking
  source_type: 'file' | 'url' | 'text',
  source_url: 'https://example.com/doc.pdf', // Original URL if provided
  source_file_path: '/uploads/abc123.pdf',   // Lambda S3 path if uploaded
  source_file_name: 'document.pdf',          // Original filename
  source_mime_type: 'application/pdf',       // MIME type
  
  embedding_model: 'text-embedding-3-small',
  created_at: '2025-10-15T...',
}
```

**Implementation:**
- Update `src/rag/chunker.js` to accept source metadata
- Update `src/rag/indexeddb-storage.js` to store source fields
- Update `src/rag/sheets-storage.js` to sync source metadata

**Effort:** 2-3 hours

---

### 1.2 Create File Content Endpoint

**Goal:** Serve original uploaded files via new endpoint

**Endpoint:** `GET /file/{fileId}`

**Implementation:**
```javascript
// src/endpoints/file.js
const { loadFileFromSheets } = require('../rag/sheets-storage');

exports.handler = async (event) => {
  const fileId = event.pathParameters.fileId;
  
  // Load file from Google Sheets
  const file = await loadFileFromSheets(fileId);
  
  if (!file) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'File not found' }),
    };
  }
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.originalName}"`,
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
    body: file.content, // Base64 encoded
    isBase64Encoded: true,
  };
};
```

**Storage Strategy:**
- Store uploaded files in Google Sheets in a new **"RAG_Files"** tab
- Same spreadsheet as existing RAG_Embeddings_v1 and RAG_Metadata
- Files stored as base64 in Google Sheets (max 50,000 characters per cell = ~37 KB per file)
- For large files (>37 KB), split across multiple rows with chunk_index
- Generate unique file IDs (UUID)
- Store metadata in IndexedDB for quick lookup: `{fileId, snippetId, fileName, mimeType, sheetsRowId}`

**Google Sheets "RAG_Files" Tab Schema:**
```javascript
// Column headers:
[
  'file_id',           // UUID
  'snippet_id',        // Associated snippet UUID
  'file_name',         // Original filename
  'mime_type',         // MIME type (application/pdf, etc.)
  'file_size',         // Size in bytes
  'chunk_index',       // 0, 1, 2... for files split across rows
  'total_chunks',      // Total number of chunks for this file
  'content_base64',    // Base64 encoded file content (max ~37 KB)
  'created_at',        // ISO timestamp
  'updated_at',        // ISO timestamp
]
```

**Security:**
- Validate file IDs (UUID format)
- Check file ownership (user's snippets only)
- Sanitize filenames
- Rate limiting (Google Sheets API: 100 requests/100 seconds)
- Validate MIME types (whitelist safe types)

**File Size Handling:**
- Files < 37 KB: Single row in Google Sheets
- Files > 37 KB: Split into multiple rows with chunk_index
- Max recommended: 1 MB per file (27 chunks)
- Very large files: Consider storing markdown conversion only, not original

**Google Sheets Storage Module Updates:**
```javascript
// src/rag/sheets-storage.js - Add new functions

async function saveFileToSheets(sheets, spreadsheetId, fileData) {
  const { fileId, snippetId, fileName, mimeType, content } = fileData;
  const base64Content = content.toString('base64');
  const fileSize = base64Content.length;
  
  // Split into chunks if needed (37 KB per chunk = ~50k chars)
  const chunkSize = 37000;
  const chunks = [];
  
  for (let i = 0; i < base64Content.length; i += chunkSize) {
    chunks.push(base64Content.substring(i, i + chunkSize));
  }
  
  // Prepare rows
  const rows = chunks.map((chunk, index) => [
    fileId,
    snippetId,
    fileName,
    mimeType,
    fileSize,
    index,
    chunks.length,
    chunk,
    new Date().toISOString(),
    new Date().toISOString(),
  ]);
  
  // Append to RAG_Files sheet
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'RAG_Files!A:J',
    valueInputOption: 'RAW',
    resource: { values: rows },
  });
  
  return { fileId, chunks: chunks.length };
}

async function loadFileFromSheets(sheets, spreadsheetId, fileId) {
  // Query for all chunks of this file
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RAG_Files!A:J',
  });
  
  const rows = result.data.values || [];
  const fileChunks = rows
    .filter(row => row[0] === fileId)
    .sort((a, b) => parseInt(a[5]) - parseInt(b[5])); // Sort by chunk_index
  
  if (fileChunks.length === 0) {
    return null;
  }
  
  // Reconstruct file content
  const content = fileChunks.map(chunk => chunk[7]).join('');
  
  return {
    fileId,
    snippetId: fileChunks[0][1],
    originalName: fileChunks[0][2],
    mimeType: fileChunks[0][3],
    size: parseInt(fileChunks[0][4]),
    content, // Base64 string
  };
}

async function deleteFileFromSheets(sheets, spreadsheetId, fileId) {
  // Find and delete all rows for this file
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RAG_Files!A:J',
  });
  
  const rows = result.data.values || [];
  const rowsToDelete = [];
  
  rows.forEach((row, index) => {
    if (row[0] === fileId) {
      rowsToDelete.push(index + 1); // 1-indexed for Sheets API
    }
  });
  
  // Delete rows in reverse order to maintain indices
  for (const rowIndex of rowsToDelete.reverse()) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: getSheetIdByName('RAG_Files'),
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        }],
      },
    });
  }
}
```

**Effort:** 4-5 hours (increased due to chunking logic)

---

### 1.3 File Upload UI with URL Paste Option

**Goal:** Allow users to upload files OR paste URLs

**Component:** `ui-new/src/components/FileUploadDialog.tsx`

```tsx
interface FileUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File | string) => Promise<void>;
}

const FileUploadDialog = ({ isOpen, onClose, onUpload }) => {
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  
  return (
    <Dialog>
      <Tabs>
        <Tab label="Upload File" onClick={() => setUploadMode('file')}>
          <input type="file" accept=".pdf,.docx,.txt,.md,..." />
        </Tab>
        
        <Tab label="Paste URL" onClick={() => setUploadMode('url')}>
          <input 
            type="url" 
            placeholder="https://example.com/document.pdf"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Tab>
      </Tabs>
      
      <Button onClick={handleUpload}>
        {uploadMode === 'file' ? 'Upload' : 'Fetch & Process'}
      </Button>
    </Dialog>
  );
};
```

**Features:**
- Two tabs: "Upload File" and "Paste URL"
- File drag & drop support
- URL validation
- Progress indicator
- Preview before embedding
- Cost estimation

**Effort:** 4-5 hours

---

### 1.4 Compact Search Results with Links

**Goal:** Format search results like web search with source links

**Format:**
```markdown
## Search Results (3 found)

### 1. Introduction to React Hooks [📄](https://lambdallmproxy.pages.dev/file/abc123)
**Source:** react-docs.pdf | **Similarity:** 0.89

React Hooks let you use state and other React features without writing a class. 
They were introduced in React 16.8 and provide a more direct API to the React 
concepts you already know...

[Read full document →](https://lambdallmproxy.pages.dev/file/abc123)

---

### 2. useState Hook Examples [🔗](https://react.dev/hooks/useState)
**Source:** https://react.dev/hooks/useState | **Similarity:** 0.85

The useState Hook lets you add state to functional components. Here's a simple 
counter example: `const [count, setCount] = useState(0);`...

[View original →](https://react.dev/hooks/useState)

---

### 3. Custom Hooks Best Practices [📄](https://lambdallmproxy.pages.dev/file/def456)
**Source:** react-patterns.md | **Similarity:** 0.82

Custom Hooks are a mechanism to reuse stateful logic between components. They 
start with "use" and can call other Hooks...

[Read full document →](https://lambdallmproxy.pages.dev/file/def456)
```

**Implementation:**
```javascript
// src/rag/search.js - Update formatSearchResults()
function formatSearchResultsCompact(results, options = {}) {
  const { includeScores = true, maxLength = 200 } = options;
  
  return results.map((result, index) => {
    const sourceIcon = result.source_type === 'url' ? '🔗' : '📄';
    const sourceLink = result.source_url || `/file/${result.snippet_id}`;
    
    const header = `### ${index + 1}. ${result.snippet_name} [${sourceIcon}](${sourceLink})`;
    const meta = `**Source:** ${result.source_file_name || result.source_url} | **Similarity:** ${result.similarity.toFixed(2)}`;
    
    const excerpt = result.chunk_text.substring(0, maxLength) + '...';
    const fullLink = `[Read full document →](${sourceLink})`;
    
    return `${header}\n${meta}\n\n${excerpt}\n\n${fullLink}\n\n---`;
  }).join('\n\n');
}
```

**Effort:** 2-3 hours

---

## 📊 Phase 2: embedjs Integration

### 2.1 Install embedjs

**Package:** https://github.com/llm-tools/embedjs

```bash
npm install @llm-tools/embedjs
```

**Features:**
- Tokenization (BPE, WordPiece, SentencePiece)
- Multi-format loaders (PDF, DOCX, HTML, MD, TXT, CSV, JSON)
- Automatic chunking strategies
- Metadata extraction
- Text cleaning and normalization

**Effort:** 1 hour

---

### 2.2 Replace Chunker with embedjs

**Goal:** Use embedjs for text chunking and tokenization

**Current:** `src/rag/chunker.js` (custom implementation)  
**New:** `src/rag/chunker-embedjs.js` (embedjs-based)

```javascript
// src/rag/chunker-embedjs.js
const { TextSplitter, RecursiveCharacterTextSplitter } = require('@llm-tools/embedjs');

async function chunkText(text, options = {}) {
  const {
    chunkSize = 1000,
    chunkOverlap = 200,
    separators = ['\n\n', '\n', '. ', ' '],
  } = options;
  
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators,
  });
  
  const chunks = await splitter.splitText(text);
  
  return chunks.map((chunk, index) => ({
    chunk_index: index,
    chunk_text: chunk,
    token_count: estimateTokenCount(chunk),
    char_count: chunk.length,
  }));
}
```

**Benefits:**
- Industry-standard tokenization
- Better handling of code, markdown, and special characters
- Built-in support for multiple languages
- Consistent with other LLM tools

**Migration:**
- Keep old `chunker.js` for backward compatibility
- Add flag to switch between implementations
- Test both implementations side-by-side

**Effort:** 3-4 hours

---

### 2.3 Add Multi-Format File Loaders

**Goal:** Support PDF, DOCX, HTML, CSV, JSON using embedjs loaders

```javascript
// src/rag/file-loaders.js
const { PDFLoader, DocxLoader, HTMLLoader, CSVLoader, JSONLoader } = require('@llm-tools/embedjs');

async function loadFile(filePath, fileType) {
  let loader;
  
  switch (fileType) {
    case 'application/pdf':
      loader = new PDFLoader();
      break;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      loader = new DocxLoader();
      break;
    case 'text/html':
      loader = new HTMLLoader();
      break;
    case 'text/csv':
      loader = new CSVLoader();
      break;
    case 'application/json':
      loader = new JSONLoader();
      break;
    default:
      // Fallback to text
      return fs.readFileSync(filePath, 'utf-8');
  }
  
  const documents = await loader.load(filePath);
  
  // Extract text and metadata
  return {
    text: documents.map(doc => doc.pageContent).join('\n\n'),
    metadata: documents[0]?.metadata || {},
  };
}
```

**Supported Formats:**
- ✅ PDF (text extraction with layout preservation)
- ✅ DOCX (Microsoft Word)
- ✅ HTML (clean text extraction)
- ✅ Markdown (native support)
- ✅ CSV (convert to markdown tables)
- ✅ JSON (structured data extraction)
- ✅ TXT (plain text)

**Effort:** 4-5 hours

---

### 2.4 Convert Files to Markdown with Base64 Images

**Goal:** Lossy conversion of uploaded files to markdown with embedded images

```javascript
// src/rag/file-converters.js
const { DocumentConverter } = require('@llm-tools/embedjs');

async function convertToMarkdownWithImages(filePath, fileType) {
  const converter = new DocumentConverter();
  
  // Extract text and images
  const result = await converter.convert(filePath, {
    format: 'markdown',
    extractImages: true,
    imageFormat: 'base64',
  });
  
  // Build markdown with base64 images
  let markdown = result.text;
  
  result.images.forEach((image, index) => {
    const base64 = image.data.toString('base64');
    const mimeType = image.mimeType || 'image/png';
    const imageMarkdown = `![Image ${index + 1}](data:${mimeType};base64,${base64})`;
    
    // Insert image at appropriate position
    markdown = markdown.replace(`{{IMAGE_${index}}}`, imageMarkdown);
  });
  
  return markdown;
}
```

**Features:**
- Extract images from PDFs, DOCX, HTML
- Embed as base64 in markdown
- Preserve image captions and alt text
- Handle multiple images per document
- Lossy but readable

**Effort:** 5-6 hours

---

## 📊 Phase 3: libsql Vector Database

### 3.1 Set Up libsql with Vector Extension

**Goal:** Replace IndexedDB with libsql for server-side vector storage

**Package:** https://github.com/libsql/libsql

```bash
npm install libsql @libsql/client
```

**Schema:**
```sql
-- Create vector extension (if not built-in)
CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0(
  embedding FLOAT[1536]
);

-- Main chunks table with vector index
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  snippet_id TEXT NOT NULL,
  snippet_name TEXT,
  chunk_index INTEGER,
  chunk_text TEXT,
  embedding_vector BLOB, -- Float32Array as BLOB
  
  -- Source tracking
  source_type TEXT CHECK(source_type IN ('file', 'url', 'text')),
  source_url TEXT,
  source_file_path TEXT,
  source_file_name TEXT,
  source_mime_type TEXT,
  
  -- Metadata
  embedding_model TEXT,
  embedding_provider TEXT,
  embedding_dimensions INTEGER,
  token_count INTEGER,
  created_at TEXT,
  updated_at TEXT
);

-- Create indexes
CREATE INDEX idx_chunks_snippet_id ON chunks(snippet_id);
CREATE INDEX idx_chunks_created_at ON chunks(created_at);
CREATE INDEX idx_chunks_embedding_model ON chunks(embedding_model);

-- Vector similarity function (using libsql vec extension)
-- Cosine similarity: 1 - (dot_product / (norm_a * norm_b))
```

**Configuration:**
```javascript
// src/rag/libsql-storage.js
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.LIBSQL_URL || 'file:///tmp/rag.db',
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

async function initDatabase() {
  // Create tables and indexes
  await client.execute(SCHEMA_SQL);
  
  // Load vector extension
  await client.execute('SELECT load_extension("vector.so")');
}
```

**Effort:** 6-8 hours

---

### 3.2 Prepopulate Knowledge Base

**Goal:** Bundle pre-embedded knowledge base in Lambda layer

**Knowledge Base Sources:**
- LLM documentation (OpenAI, Anthropic, Google)
- Common programming languages (Python, JavaScript, TypeScript)
- Framework docs (React, Node.js, Express)
- Your project documentation

**Process:**
1. **Collect Documents**
   ```bash
   mkdir knowledge-base
   cd knowledge-base
   
   # Download docs
   wget https://platform.openai.com/docs/...
   wget https://react.dev/...
   # etc.
   ```

2. **Ingest and Embed**
   ```bash
   node scripts/ingest-knowledge-base.js \
     --input ./knowledge-base \
     --output ./rag.db \
     --model text-embedding-3-small
   ```

3. **Bundle in Lambda Layer**
   ```bash
   # Create layer
   mkdir -p lambda-layer/rag-db
   cp rag.db lambda-layer/rag-db/
   
   # Package layer
   cd lambda-layer
   zip -r ../rag-db-layer.zip .
   
   # Deploy layer
   aws lambda publish-layer-version \
     --layer-name rag-knowledge-base \
     --zip-file fileb://../rag-db-layer.zip
   ```

4. **Attach Layer to Lambda**
   ```javascript
   // serverless.yml or AWS Console
   layers:
     - arn:aws:lambda:us-east-1:123456789:layer:rag-knowledge-base:1
   ```

**Database Size Estimate:**
- 1,000 documents × 2,000 chars = 2M chars
- 2M chars / 4 = 500K tokens
- 500K tokens / 250 tokens per chunk = 2,000 chunks
- 2,000 chunks × 1536 dims × 4 bytes = ~12 MB
- Plus text: ~5 MB
- **Total:** ~17 MB (well within Lambda layer 50 MB limit)

**Effort:** 8-10 hours

---

### 3.3 Integrate libsql with RAG System

**Goal:** Use libsql for vector search instead of IndexedDB

**Changes:**
```javascript
// src/rag/search.js - Update to use libsql
const { client } = require('./libsql-storage');

async function searchChunks(queryEmbedding, options = {}) {
  const { topK = 5, threshold = 0.7 } = options;
  
  // Use libsql vector search
  const results = await client.execute({
    sql: `
      SELECT 
        id, snippet_id, snippet_name, chunk_text, chunk_index,
        source_type, source_url, source_file_name,
        vec_distance_cosine(embedding_vector, ?) as distance,
        (1 - vec_distance_cosine(embedding_vector, ?)) as similarity
      FROM chunks
      WHERE (1 - vec_distance_cosine(embedding_vector, ?)) >= ?
      ORDER BY distance ASC
      LIMIT ?
    `,
    args: [
      queryEmbedding, // BLOB
      queryEmbedding,
      queryEmbedding,
      threshold,
      topK,
    ],
  });
  
  return results.rows;
}
```

**Benefits:**
- Server-side vector search (no client-side compute)
- Pre-populated knowledge base available immediately
- SQL queries for advanced filtering
- Persistent storage (not browser-dependent)
- Scales to millions of vectors

**Effort:** 6-8 hours

---

## 📊 Phase 4: Makefile Commands for Document Management

### 4.1 Create Document Ingestion Script

**Goal:** CLI tool to ingest documents into libsql

**Script:** `scripts/ingest-documents.js`

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadFile } = require('../src/rag/file-loaders');
const { chunkText } = require('../src/rag/chunker-embedjs');
const { batchGenerateEmbeddings } = require('../src/rag/embeddings');
const { saveChunks } = require('../src/rag/libsql-storage');

async function ingestDocuments(directory, options = {}) {
  const files = fs.readdirSync(directory, { recursive: true });
  
  for (const file of files) {
    const filePath = path.join(directory, file);
    const fileType = getMimeType(filePath);
    
    console.log(`Processing: ${file}`);
    
    // Load and convert file
    const { text, metadata } = await loadFile(filePath, fileType);
    
    // Chunk text
    const chunks = await chunkText(text, {
      chunkSize: options.chunkSize || 1000,
      chunkOverlap: options.chunkOverlap || 200,
    });
    
    // Generate embeddings
    const embeddings = await batchGenerateEmbeddings(
      chunks.map(c => c.chunk_text),
      options.model || 'text-embedding-3-small',
      'openai',
      process.env.OPENAI_API_KEY
    );
    
    // Save to database
    const chunksWithEmbeddings = chunks.map((chunk, i) => ({
      ...chunk,
      snippet_id: generateUUID(),
      snippet_name: file,
      embedding: embeddings[i].embedding,
      source_type: 'file',
      source_file_name: file,
      source_mime_type: fileType,
    }));
    
    await saveChunks(chunksWithEmbeddings);
    
    console.log(`✓ Ingested ${chunks.length} chunks from ${file}`);
  }
}

// Run if called directly
if (require.main === module) {
  const directory = process.argv[2] || './knowledge-base';
  ingestDocuments(directory).catch(console.error);
}
```

**Effort:** 3-4 hours

---

### 4.2 Add Makefile Commands

**Goal:** Easy CLI interface for document management

**Makefile:**
```makefile
# Ingest documents into vector database
ingest-docs:
	@echo "📥 Ingesting documents..."
	@node scripts/ingest-documents.js $(DIR) \
		--model $(MODEL) \
		--chunk-size $(CHUNK_SIZE) \
		--chunk-overlap $(CHUNK_OVERLAP)

# List all documents in database
list-docs:
	@echo "📋 Listing documents..."
	@node scripts/list-documents.js

# Delete document from database
delete-doc:
	@echo "🗑️  Deleting document $(ID)..."
	@node scripts/delete-document.js $(ID)

# Search documents
search-docs:
	@echo "🔍 Searching: $(QUERY)"
	@node scripts/search-documents.js "$(QUERY)" --top-k $(TOPK)

# Export database
export-db:
	@echo "📤 Exporting database..."
	@sqlite3 /tmp/rag.db ".dump" > rag-backup.sql

# Import database
import-db:
	@echo "📥 Importing database..."
	@sqlite3 /tmp/rag.db < rag-backup.sql

# Database statistics
db-stats:
	@echo "📊 Database statistics:"
	@node scripts/db-stats.js
```

**Usage Examples:**
```bash
# Ingest all documents in knowledge-base/
make ingest-docs DIR=./knowledge-base

# List all documents
make list-docs

# Delete specific document
make delete-doc ID=abc-123

# Search documents
make search-docs QUERY="React hooks" TOPK=5

# Database stats
make db-stats
```

**Effort:** 2-3 hours

---

### 4.3 Create Supporting Scripts

**Scripts to create:**

1. **list-documents.js** - List all documents
2. **delete-document.js** - Delete by ID or pattern
3. **search-documents.js** - CLI search interface
4. **db-stats.js** - Show database statistics

**Effort:** 3-4 hours

---

## 📊 Phase 5: LLM Snippet Tool

### 5.1 Design Snippet Tool API

**Goal:** Enable LLM to create and manage snippets for workflow generation

**Tool Schema:**
```json
{
  "name": "snippet_tool",
  "description": "Create, search, retrieve, and delete snippets. Snippets can store text, markdown, code, and base64 images. Use this to build documents in stages or save important information for later retrieval.",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["create", "get", "search", "delete", "list"],
        "description": "Action to perform"
      },
      "name": {
        "type": "string",
        "description": "Snippet name (required for create)"
      },
      "content": {
        "type": "string",
        "description": "Snippet content in markdown format, can include base64 images"
      },
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Tags for organizing snippets"
      },
      "snippet_id": {
        "type": "string",
        "description": "Snippet ID (required for get/delete)"
      },
      "query": {
        "type": "string",
        "description": "Search query (required for search)"
      },
      "top_k": {
        "type": "integer",
        "description": "Number of results to return (default: 5)"
      }
    },
    "required": ["action"]
  }
}
```

**Effort:** 2-3 hours

---

### 5.2 Implement Snippet Tool Endpoint

**Goal:** Backend endpoint for snippet operations

**Endpoint:** `POST /tools/snippet`

```javascript
// src/endpoints/tools/snippet.js
const { generateEmbedding } = require('../../rag/embeddings');
const { searchChunks } = require('../../rag/search');
const { saveChunks, deleteChunks } = require('../../rag/libsql-storage');

exports.handler = async (event) => {
  const { action, name, content, tags, snippet_id, query, top_k } = JSON.parse(event.body);
  
  switch (action) {
    case 'create':
      return await createSnippet(name, content, tags);
    
    case 'get':
      return await getSnippet(snippet_id);
    
    case 'search':
      return await searchSnippets(query, top_k || 5);
    
    case 'delete':
      return await deleteSnippet(snippet_id);
    
    case 'list':
      return await listSnippets();
    
    default:
      return { statusCode: 400, body: 'Invalid action' };
  }
};

async function createSnippet(name, content, tags = []) {
  // Generate unique ID
  const snippet_id = generateUUID();
  
  // Chunk content
  const chunks = await chunkText(content);
  
  // Generate embeddings
  const embeddings = await batchGenerateEmbeddings(
    chunks.map(c => c.chunk_text),
    'text-embedding-3-small',
    'openai',
    process.env.OPENAI_API_KEY
  );
  
  // Save to database
  const chunksWithEmbeddings = chunks.map((chunk, i) => ({
    id: generateUUID(),
    snippet_id,
    snippet_name: name,
    chunk_index: i,
    chunk_text: chunk.chunk_text,
    embedding: embeddings[i].embedding,
    source_type: 'text',
    tags: tags.join(','),
    created_at: new Date().toISOString(),
  }));
  
  await saveChunks(chunksWithEmbeddings);
  
  // IMPORTANT: Also save to existing system (IndexedDB via API call)
  await saveToExistingSystem({
    id: snippet_id,
    name,
    content,
    tags,
    created_at: new Date().toISOString(),
  });
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      snippet_id,
      name,
      chunks: chunks.length,
      message: 'Snippet created successfully',
    }),
  };
}

async function searchSnippets(query, top_k) {
  // Generate query embedding
  const embedding = await generateEmbedding(
    query,
    'text-embedding-3-small',
    'openai',
    process.env.OPENAI_API_KEY
  );
  
  // Search vector database
  const results = await searchChunks(embedding.embedding, {
    topK: top_k,
    threshold: 0.7,
  });
  
  // Format results with source links
  const formattedResults = formatSearchResultsCompact(results);
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      query,
      results: formattedResults,
      count: results.length,
    }),
  };
}
```

**Effort:** 6-8 hours

---

### 5.3 Integrate with Existing Snippet System

**Goal:** Save snippets to both libsql AND existing IndexedDB system

**Dual Storage:**
```javascript
async function saveToExistingSystem(snippet) {
  // Save to IndexedDB (for UI access)
  await fetch('/api/snippets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snippet),
  });
  
  // Also trigger Google Sheets sync if enabled
  const config = await getRAGConfig();
  if (config.sheetsBackupEnabled) {
    await syncToGoogleSheets(snippet);
  }
}
```

**Benefits:**
- LLM-created snippets immediately available in UI
- User can see and edit LLM-generated content
- Maintains consistency between systems
- Enables human-in-the-loop workflows

**Effort:** 3-4 hours

---

### 5.4 Add Tool to LLM Configuration

**Goal:** Register snippet tool in LLM tool catalog

```javascript
// src/tools/index.js
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'snippet_tool',
      description: 'Create, search, retrieve, and delete snippets...',
      parameters: { /* see 5.1 */ },
    },
  },
  // ... other tools
];

// Tool execution handler
async function executeSnippetTool(params) {
  const response = await fetch('/tools/snippet', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  
  return await response.json();
}
```

**Integration Points:**
- Chat endpoint: Enable tool in chat requests
- Planning endpoint: Allow planning to use snippets
- Image generation: Save prompts and results as snippets

**Effort:** 2-3 hours

---

### 5.5 LLM Workflow Examples

**Goal:** Document example workflows using snippet tool

**Example 1: Multi-Stage Document Generation**
```
User: "Create a comprehensive guide to React hooks"

LLM: [Uses snippet_tool to create outline]
{
  "action": "create",
  "name": "React Hooks Guide - Outline",
  "content": "# React Hooks Guide\n\n1. Introduction\n2. useState...",
  "tags": ["react", "hooks", "draft"]
}

LLM: [Searches for relevant documentation]
{
  "action": "search",
  "query": "React useState hook examples",
  "top_k": 5
}

LLM: [Creates detailed section]
{
  "action": "create",
  "name": "React Hooks Guide - useState Section",
  "content": "## useState Hook\n\nThe useState hook allows...",
  "tags": ["react", "hooks", "useState", "draft"]
}

LLM: [Retrieves all sections, merges, creates final document]
{
  "action": "search",
  "query": "React Hooks Guide",
  "top_k": 10
}

[Final merged document saved as new snippet]
```

**Example 2: Code Review with Snippets**
```
User: "Review this code and save improvement suggestions"

LLM: [Analyzes code, creates snippet with findings]
{
  "action": "create",
  "name": "Code Review - UserAuth Component",
  "content": "## Review Findings\n\n### Issues\n1. Missing error handling...",
  "tags": ["code-review", "security", "improvements"]
}
```

**Effort:** 2 hours (documentation)

---

## 📊 Phase 6: File Conversion to Markdown with Base64 Images

### 6.1 Implement File Converters

**Goal:** Convert uploaded files to markdown with embedded images

**Supported Conversions:**
- PDF → Markdown + base64 images
- DOCX → Markdown + base64 images
- HTML → Markdown + base64 images
- Images (PNG/JPG) → Markdown with base64

```javascript
// src/rag/file-converters.js
const { PDFDocument } = require('pdf-lib');
const mammoth = require('mammoth'); // DOCX to HTML
const TurndownService = require('turndown'); // HTML to Markdown

async function convertPDFToMarkdown(pdfPath) {
  const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
  const pages = pdfDoc.getPages();
  
  let markdown = '';
  const images = [];
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    
    // Extract text
    const text = await extractTextFromPage(page);
    markdown += `## Page ${i + 1}\n\n${text}\n\n`;
    
    // Extract images
    const pageImages = await extractImagesFromPage(page);
    pageImages.forEach((img, idx) => {
      const base64 = img.data.toString('base64');
      images.push({
        page: i + 1,
        index: idx,
        base64,
        mimeType: img.mimeType,
      });
      
      markdown += `![Image ${idx + 1} from page ${i + 1}](data:${img.mimeType};base64,${base64})\n\n`;
    });
  }
  
  return { markdown, images };
}

async function convertDOCXToMarkdown(docxPath) {
  // Convert DOCX to HTML (preserves images)
  const result = await mammoth.convertToHtml(
    { path: docxPath },
    { 
      convertImage: mammoth.images.imgElement(async (image) => {
        const buffer = await image.read();
        const base64 = buffer.toString('base64');
        return {
          src: `data:${image.contentType};base64,${base64}`,
        };
      }),
    }
  );
  
  // Convert HTML to Markdown
  const turndown = new TurndownService();
  const markdown = turndown.turndown(result.value);
  
  return { markdown };
}
```

**Dependencies:**
```bash
npm install pdf-lib mammoth turndown
```

**Effort:** 6-8 hours

---

### 6.2 Auto-Convert on Upload

**Goal:** Automatically convert uploaded files to markdown

**Flow:**
```
User uploads file
  ↓
Detect file type
  ↓
Convert to markdown + base64 images
  ↓
Save original file (for download link)
  ↓
Save markdown version (for embedding)
  ↓
Chunk markdown content
  ↓
Generate embeddings
  ↓
Save to vector database
```

**Implementation:**
```javascript
// src/endpoints/upload.js
async function handleFileUpload(file) {
  const fileId = generateUUID();
  const originalPath = `/uploads/${fileId}.${file.extension}`;
  const markdownPath = `/uploads/${fileId}.md`;
  
  // Save original file
  await saveFile(originalPath, file.buffer);
  
  // Convert to markdown
  const { markdown, images } = await convertToMarkdown(file.buffer, file.mimeType);
  await saveFile(markdownPath, markdown);
  
  // Create snippet
  const snippet = {
    id: fileId,
    name: file.originalName,
    content: markdown,
    source_type: 'file',
    source_file_path: originalPath,
    source_file_name: file.originalName,
    source_mime_type: file.mimeType,
  };
  
  // Embed and store
  await createSnippet(snippet.name, snippet.content, ['uploaded']);
  
  return { fileId, markdownPath, chunks: chunkCount };
}
```

**Effort:** 4-5 hours

---

## 📊 Implementation Timeline

### Total Effort Estimate: 84-104 hours (2-3 weeks)

### Phase 1: Document References & File Upload (14-17 hours)
- Week 1, Days 1-2
- Add source metadata to chunks
- Create file content endpoint with Google Sheets storage
- Add RAG_Files tab to sheets-storage.js
- Build file upload UI with URL paste
- Implement compact search results formatting

### Phase 2: embedjs Integration (13-16 hours)
- Week 1, Days 3-4
- Install and configure embedjs
- Replace chunker with embedjs
- Add multi-format file loaders
- Implement file-to-markdown conversion

### Phase 3: libsql Vector Database (20-26 hours)
- Week 2, Days 1-3
- Set up libsql with vector extension
- Create database schema
- Prepopulate knowledge base
- Build and deploy Lambda layer
- Integrate with RAG system

### Phase 4: Makefile Commands (8-11 hours)
- Week 2, Days 4-5
- Create ingestion script
- Add Makefile commands
- Build supporting CLI tools
- Test document management workflow

### Phase 5: LLM Snippet Tool (13-18 hours)
- Week 3, Days 1-2
- Design snippet tool API
- Implement backend endpoint
- Integrate with existing system
- Register tool in LLM configuration
- Document workflow examples

### Phase 6: File Conversion (10-13 hours)
- Week 3, Days 3-4
- Implement PDF/DOCX/HTML converters
- Auto-convert on upload
- Test conversion quality
- Handle edge cases

### Testing & Documentation (14-16 hours)
- Week 3, Days 4-5
- End-to-end testing
- Performance benchmarking
- Update documentation
- Create user guides

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                          │
│  • File Upload Dialog (file or URL)                            │
│  • Search Results with Source Links                            │
│  • Snippet Management UI                                       │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                      API Endpoints                              │
│  • POST /upload (file or URL)                                  │
│  • GET /file/{fileId} (serve original files)                  │
│  • POST /tools/snippet (LLM tool)                             │
└─────────┬────────────────┬──────────────────┬───────────────────┘
          │                │                  │
┌─────────▼─────┐  ┌──────▼──────┐  ┌───────▼────────┐
│  embedjs      │  │ File        │  │ libsql Vector  │
│  Loaders      │  │ Converters  │  │ Database       │
│               │  │             │  │                │
│  • PDF        │  │  • PDF→MD   │  │  • chunks      │
│  • DOCX       │  │  • DOCX→MD  │  │  • embeddings  │
│  • HTML       │  │  • HTML→MD  │  │  • metadata    │
│  • CSV/JSON   │  │  • base64   │  │  • vec search  │
└─────────┬─────┘  └──────┬──────┘  └───────┬────────┘
          │                │                  │
          └────────────────┴──────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────┐
│             Lambda Function + Layer                   │
│  • Pre-populated knowledge base (17 MB)              │
│  • libsql database with vector extension             │
│  • Embedding generation                              │
│  • Search with source tracking                       │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────┐
│          External Storage & Services                  │
│  • Google Sheets: Snippets, RAG data, Files         │
│    - RAG_Embeddings_v1 (embeddings)                 │
│    - RAG_Metadata (config)                          │
│    - RAG_Files (uploaded files as base64)           │
│  • OpenAI API: Embeddings                           │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Key Decisions & Trade-offs

### Decision 1: libsql vs IndexedDB
**Choice:** Use libsql for server-side storage

**Pros:**
- ✅ Server-side vector search (faster)
- ✅ Pre-populated knowledge base
- ✅ SQL queries for complex filtering
- ✅ Scales to millions of vectors
- ✅ Not browser-dependent

**Cons:**
- ❌ Requires Lambda deployment
- ❌ No offline access
- ❌ Slightly higher latency

**Mitigation:** Keep IndexedDB for client-side caching

---

### Decision 2: Lossy File Conversion
**Choice:** Convert files to markdown with base64 images

**Pros:**
- ✅ Consistent format for embedding
- ✅ Preserves visual content
- ✅ Easy to display and edit
- ✅ Works with LLM tools

**Cons:**
- ❌ Lossy conversion (formatting lost)
- ❌ Large base64 images increase size
- ❌ OCR quality varies for PDFs

**Mitigation:** Keep original files for download

---

### Decision 3: Dual Storage (libsql + IndexedDB)
**Choice:** Save snippets to both systems

**Pros:**
- ✅ LLM-created snippets visible in UI
- ✅ Maintains backward compatibility
- ✅ Enables human-in-the-loop workflows
- ✅ Resilience through redundancy

**Cons:**
- ❌ Complexity of keeping in sync
- ❌ Double storage cost

**Mitigation:** Background sync with conflict resolution

---

## 📊 Success Metrics

### Performance Targets
- File upload: < 5 seconds
- File conversion: < 10 seconds
- Vector search: < 500ms
- Snippet creation: < 3 seconds

### Quality Targets
- Search relevance: > 80% user satisfaction
- Conversion quality: > 90% content preserved
- Tool success rate: > 95% successful operations

### Usage Targets
- Knowledge base: 1,000+ documents
- User snippets: 100+ per active user
- LLM tool usage: 50+ snippet operations/day

---

## 📊 Next Steps

1. ✅ Review and approve this plan
2. 📋 Create detailed tickets for each phase
3. 🔧 Set up development environment
4. 🚀 Begin Phase 1 implementation
5. 🧪 Test each phase before moving to next
6. 📚 Update documentation continuously
7. 🎉 Launch and gather user feedback

---

## 📝 Notes

- **Backward Compatibility:** Maintain existing RAG functionality
- **Incremental Rollout:** Deploy phases independently
- **User Testing:** Get feedback after each phase
- **Cost Monitoring:** Track embedding and storage costs
- **Performance:** Benchmark at each stage
- **Documentation:** Keep docs up-to-date

---

**Plan Status:** 📋 READY FOR REVIEW  
**Estimated Timeline:** 2-3 weeks  
**Estimated Cost:** ~$10-20 for knowledge base embeddings  
**Risk Level:** Medium (new dependencies, complex integrations)
