# RAG (Retrieval-Augmented Generation) Implementation Plan

**Date:** October 13, 2025  
**Project:** LambdaLLMProxy  
**Feature:** Semantic Search with Embeddings in Google Sheets  

---

## Executive Summary

Implement a RAG system where user snippets are chunked, embedded, and stored in Google Sheets. Use IndexedDB for local caching and fast semantic search. Enable users to upload documents, generate embeddings on-demand, and inject relevant context into LLM queries.

**Key Benefits:**
- 🎯 Semantic search over user's saved content
- 📊 User owns their data (stored in their Google Sheet)
- ⚡ Fast local search via IndexedDB
- 🔄 Automatic sync between cloud and local storage
- 💰 Cost-effective with provider load balancing

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          User Interface                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Snippets │  │ Documents │  │   RAG    │  │   Settings    │ │
│  │   List   │  │  Upload   │  │ Settings │  │  (Enable/Off) │ │
│  └──────────┘  └───────────┘  └──────────┘  └───────────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
┌───────────▼──────────┐   ┌─────────▼──────────┐
│   IndexedDB Cache    │   │  Google Sheets DB  │
│                      │◄──┤                    │
│ • Chunks             │   │ • Chunks           │
│ • Embeddings         │   │ • Embeddings       │
│ • Vector Index       │   │ • Metadata         │
│ • Fast Search        │   │ • User-Owned       │
└──────────────────────┘   └────────────────────┘
            │                         
            │ Semantic Search         
            │                         
┌───────────▼──────────────────────────────────────┐
│              Query Processing                     │
│  1. Embed user query                             │
│  2. Search IndexedDB for similar chunks          │
│  3. Rank by cosine similarity                    │
│  4. Inject top-k results into prompt             │
│  5. Send to Lambda handler                       │
└──────────────────────────────────────────────────┘
```

---

## Design Decisions

### 1. Client-Side vs Server-Side RAG

**Decision: Client-Side (IndexedDB)**

| Aspect | Client-Side | Server-Side |
|--------|-------------|-------------|
| Performance | ✅ Fast (local cache) | ⚠️ Network latency |
| Resource Limits | ✅ No limits | ❌ Lambda 10GB memory |
| Complexity | ⚠️ Sync logic needed | ✅ Simpler |
| Privacy | ✅ Local-first | ⚠️ Must fetch from Sheet |
| Scalability | ✅ Scales with users | ❌ Lambda cold starts |

**Rationale:** 
- User may have 1000s of snippets with embeddings
- Local IndexedDB can handle MBs of vector data efficiently
- Avoid Lambda timeout/memory issues
- Better UX with instant search

### 2. Embedding Model Selection

**Research Needed:** Survey embedding models across providers

| Provider | Models | Dimensions | Cost | Availability |
|----------|--------|------------|------|--------------|
| OpenAI | text-embedding-3-small | 1536 | $0.02/1M tokens | ✅ High |
| OpenAI | text-embedding-3-large | 3072 | $0.13/1M tokens | ✅ High |
| OpenAI | text-embedding-ada-002 | 1536 | $0.10/1M tokens | ✅ Legacy |
| Cohere | embed-english-v3.0 | 1024 | $0.10/1M tokens | ✅ Medium |
| Cohere | embed-multilingual-v3.0 | 1024 | $0.10/1M tokens | ✅ Medium |
| Voyage | voyage-2 | 1024 | $0.10/1M tokens | ⚠️ Low |
| Together AI | togethercomputer/m2-bert-80M-8k-retrieval | 768 | Varies | ⚠️ Low |

**Recommended Default:** `text-embedding-3-small` (OpenAI)
- Widely available
- Cost-effective ($0.02/1M tokens)
- Good performance (1536 dimensions)
- Industry standard

**Fallback Chain:**
1. text-embedding-3-small (OpenAI)
2. embed-english-v3.0 (Cohere)
3. text-embedding-ada-002 (OpenAI legacy)

**Model Consistency:** 
- Store embedding model name with each chunk
- Warn user if switching models (requires re-embedding)
- Allow manual model selection in settings

### 3. Chunking Strategy

**Approach: Recursive Character Splitting with Overlap**

```javascript
{
  chunkSize: 1000,        // characters (~250 tokens)
  chunkOverlap: 200,      // 20% overlap for context continuity
  separators: ['\n\n', '\n', '. ', ' ', '']
}
```

**Rationale:**
- Balance between context and specificity
- Overlap prevents loss of meaning at boundaries
- Recursive splitting respects document structure

### 4. Google Sheets Schema

**Sheet Name:** `RAG_Embeddings_v1`

**Columns:**

| Column | Type | Description |
|--------|------|-------------|
| id | string | Unique chunk ID (UUID) |
| snippet_id | string | Parent snippet ID |
| chunk_index | number | Order within snippet (0, 1, 2...) |
| chunk_text | string | Text content of chunk |
| embedding | string | JSON array of floats |
| embedding_model | string | Model used (e.g., "text-embedding-3-small") |
| embedding_dimensions | number | Vector dimensions (e.g., 1536) |
| token_count | number | Approximate tokens in chunk |
| created_at | ISO string | When created |
| updated_at | ISO string | Last modified |

**Alternative: Separate Sheets**
- `Snippets` sheet (existing)
- `Chunks` sheet (text chunks)
- `Embeddings` sheet (vectors only)

**Decision:** Single sheet for simplicity, easier sync

### 5. IndexedDB Schema

**Database:** `lambdallmproxy_rag`

**Object Stores:**

1. **chunks**
   - keyPath: `id`
   - indexes: `snippet_id`, `created_at`
   ```javascript
   {
     id: 'uuid',
     snippet_id: 'snippet_uuid',
     chunk_index: 0,
     chunk_text: 'content...',
     embedding: [0.1, 0.2, ...], // Float32Array for efficiency
     embedding_model: 'text-embedding-3-small',
     embedding_dimensions: 1536,
     token_count: 250,
     created_at: '2025-10-13T...',
     updated_at: '2025-10-13T...'
   }
   ```

2. **sync_metadata**
   - keyPath: `key`
   ```javascript
   {
     key: 'last_sync',
     timestamp: '2025-10-13T...',
     sheet_url: 'https://...',
     total_chunks: 1500
   }
   ```

3. **embedding_config**
   - keyPath: `key`
   ```javascript
   {
     key: 'config',
     enabled: true,
     model: 'text-embedding-3-small',
     provider: 'openai',
     dimensions: 1536,
     chunk_size: 1000,
     chunk_overlap: 200
   }
   ```

---

## Implementation Phases

### Phase 1: Research & Infrastructure Setup (Week 1)

**Goals:**
- Research embedding models across providers
- Set up Google Sheets API integration
- Design database schemas

**Tasks:**

1.1. **Embedding Model Research**
   - [ ] Survey OpenAI embedding models
   - [ ] Survey Anthropic (if available)
   - [ ] Survey Cohere embedding models
   - [ ] Survey Groq (if available)
   - [ ] Survey Together AI embedding models
   - [ ] Document pricing for each model
   - [ ] Test API calls to verify availability
   - [ ] Create `EMBEDDING_MODELS_CATALOG.json`

1.2. **Google Sheets Setup**
   - [ ] Extend Google OAuth scope to include Sheets API
   - [ ] Create helper functions in `src/google-sheets.js`:
     - `createRAGSheet(accessToken, sheetName)`
     - `appendRows(accessToken, sheetId, rows)`
     - `getRows(accessToken, sheetId, range)`
     - `batchUpdate(accessToken, sheetId, updates)`
   - [ ] Add rate limiting for Sheets API (100 requests/100 seconds)
   - [ ] Add error handling for quota exceeded

1.3. **Schema Design & Documentation**
   - [ ] Finalize Google Sheets column structure
   - [ ] Finalize IndexedDB object store structure
   - [ ] Create migration strategy for schema updates
   - [ ] Document data flow diagrams

**Deliverables:**
- `EMBEDDING_MODELS_CATALOG.json`
- `src/google-sheets.js` with Sheets API helpers
- Schema documentation in `docs/RAG_SCHEMA.md`

---

### Phase 2: Chunking & Embedding Generation (Week 2)

**Goals:**
- Implement text chunking algorithm
- Create embedding API integration
- Add cost tracking for embeddings

**Tasks:**

2.1. **Text Chunking Module**
   - [ ] Create `src/rag/chunker.js`
   - [ ] Implement recursive character splitter:
     - `chunkText(text, options)` → returns array of chunks
     - Support markdown-aware splitting
     - Respect code block boundaries
     - Add metadata (chunk_index, token_count)
   - [ ] Write unit tests for chunking edge cases
   - [ ] Add chunking configuration to settings

2.2. **Embedding Generation**
   - [ ] Create `src/rag/embeddings.js`
   - [ ] Implement `generateEmbedding(text, model, provider)`:
     - Call provider API with text
     - Return embedding vector
     - Handle rate limits
     - Implement retry logic
   - [ ] Implement `batchGenerateEmbeddings(texts, model, provider)`:
     - Batch up to N texts per request (provider-dependent)
     - Progress tracking
     - Error handling per-batch
   - [ ] Add embedding cost tracking:
     - Extend `src/cost-tracking.js`
     - Track tokens embedded
     - Calculate cost per provider

2.3. **Document Parsing**
   - [ ] Create `src/rag/document-parser.js`
   - [ ] Support formats:
     - Plain text (`.txt`)
     - Markdown (`.md`)
     - HTML (`.html`) → convert to markdown
     - PDF (`.pdf`) → extract text
     - CSV (`.csv`) → convert to markdown tables
   - [ ] Install dependencies:
     ```bash
     npm install turndown pdf-parse papaparse
     ```
   - [ ] Convert images to base64 but exclude from embedding
   - [ ] Extract text content only for embedding

**Deliverables:**
- `src/rag/chunker.js` with tests
- `src/rag/embeddings.js` with provider integration
- `src/rag/document-parser.js` with multi-format support
- Updated cost tracking

---

### Phase 3: Storage Layer (Week 3)

**Goals:**
- Implement Google Sheets storage
- Implement IndexedDB storage
- Create sync mechanism

**Tasks:**

3.1. **Google Sheets Storage**
   - [ ] Create `src/rag/sheets-storage.js`
   - [ ] Implement `saveChunksToSheet(chunks, accessToken)`:
     - Check if RAG sheet exists, create if not
     - Batch append rows (max 1000 per request)
     - Update existing rows if chunk already exists
   - [ ] Implement `loadChunksFromSheet(accessToken, snippetId?)`:
     - Fetch all rows or filter by snippet_id
     - Parse embedding JSON to arrays
     - Return structured data
   - [ ] Implement `deleteChunksFromSheet(snippetId, accessToken)`:
     - Find rows by snippet_id
     - Batch delete rows
   - [ ] Handle Sheet API errors gracefully

3.2. **IndexedDB Storage**
   - [ ] Create `src/rag/indexeddb-storage.js`
   - [ ] Implement database initialization:
     - `initRAGDatabase()` → creates object stores
     - Version management for schema updates
   - [ ] Implement CRUD operations:
     - `saveChunks(chunks)` → upsert to IndexedDB
     - `loadChunks(snippetId?)` → query chunks
     - `deleteChunks(snippetId)` → remove chunks
     - `getAllChunks()` → for vector search
   - [ ] Optimize for search:
     - Store embeddings as Float32Array
     - Add indexes on snippet_id, created_at
   - [ ] Implement config storage:
     - `getRAGConfig()` → load settings
     - `setRAGConfig(config)` → save settings

3.3. **Bidirectional Sync**
   - [ ] Create `src/rag/sync.js`
   - [ ] Implement `syncToSheet(accessToken)`:
     - Get chunks from IndexedDB
     - Compare with Sheet (by chunk ID)
     - Upload new/modified chunks
     - Track last sync timestamp
   - [ ] Implement `syncFromSheet(accessToken)`:
     - Fetch chunks from Sheet
     - Compare with IndexedDB
     - Update local chunks if newer
     - Handle conflicts (Sheet wins)
   - [ ] Implement `fullSync(accessToken)`:
     - Combine both directions
     - Show progress in UI
   - [ ] Add sync on login:
     - Hook into existing auth flow
     - Trigger sync after successful login
     - Show sync status in UI

**Deliverables:**
- `src/rag/sheets-storage.js` with Sheets API integration
- `src/rag/indexeddb-storage.js` with local storage
- `src/rag/sync.js` with bidirectional sync
- Sync integrated into login flow

---

### Phase 4: Vector Search & RAG Query (Week 4)

**Goals:**
- Implement semantic search
- Integrate RAG into query flow
- Add relevance ranking

**Tasks:**

4.1. **Vector Similarity Search**
   - [ ] Create `src/rag/search.js`
   - [ ] Implement cosine similarity:
     ```javascript
     cosineSimilarity(vecA, vecB) {
       // dot product / (||A|| * ||B||)
     }
     ```
   - [ ] Implement `searchChunks(queryEmbedding, topK=5, threshold=0.7)`:
     - Load all chunks from IndexedDB
     - Calculate similarity with query
     - Filter by threshold
     - Sort by similarity (descending)
     - Return top K results
   - [ ] Optimize for large datasets:
     - Consider approximate nearest neighbor (ANN) if >10k chunks
     - Use Web Workers for parallel computation
   - [ ] Add metadata to results:
     - Include similarity score
     - Include snippet context
     - Include chunk position

4.2. **RAG Query Integration**
   - [ ] Create `src/rag/rag-integration.js`
   - [ ] Implement `enhanceQueryWithRAG(query, settings)`:
     - Check if RAG enabled in settings
     - Embed the user query
     - Search IndexedDB for relevant chunks
     - Format results as context
     - Return enhanced query
   - [ ] Format RAG context:
     ```
     Relevant context from your saved snippets:
     
     [1] (Similarity: 0.89)
     {chunk_text}
     Source: {snippet_name}
     
     [2] (Similarity: 0.85)
     {chunk_text}
     Source: {snippet_name}
     
     User Query: {original_query}
     ```
   - [ ] Add RAG context to chat request:
     - Insert before user message
     - Or use as system message
     - Track token usage

4.3. **Relevance Ranking**
   - [ ] Implement hybrid ranking:
     - Cosine similarity (semantic)
     - BM25 (keyword) - optional
     - Recency bonus (newer chunks slightly preferred)
   - [ ] Add diversity filter:
     - Avoid duplicate chunks from same snippet
     - Spread results across different snippets
   - [ ] Add metadata filtering:
     - Filter by snippet tags/labels
     - Filter by date range
     - Filter by snippet type

**Deliverables:**
- `src/rag/search.js` with vector similarity
- `src/rag/rag-integration.js` integrated into chat flow
- Enhanced queries with relevant context

---

### Phase 5: UI Integration (Week 5)

**Goals:**
- Add RAG settings to UI
- Create embedding generation UI
- Add document upload
- Display warnings and status

**Tasks:**

5.1. **Settings Panel**
   - [ ] Extend `ui-new/src/components/SettingsModal.tsx`
   - [ ] Add "RAG & Embeddings" tab
   - [ ] Settings controls:
     - ✅ Enable/Disable RAG
     - ✅ Enable/Disable automatic embedding generation
     - 🎛️ Embedding model selector (dropdown)
     - 🎛️ Provider preference (for embeddings)
     - 🎛️ Chunk size (512, 1000, 1500 chars)
     - 🎛️ Chunk overlap (100, 200, 300 chars)
     - 🎛️ Top-K results (3, 5, 10)
     - 🎛️ Similarity threshold (0.5, 0.7, 0.9)
   - [ ] Show current status:
     - Total chunks in database
     - Embedding coverage (% of snippets with embeddings)
     - Last sync time
     - Estimated cost for full re-embedding

5.2. **Snippet Embedding UI**
   - [ ] Add "Generate Embeddings" button to snippets list
   - [ ] Implement bulk embedding generation:
     - Show modal with progress bar
     - Process snippets in batches
     - Skip snippets that already have embeddings
     - Allow cancellation
     - Show cost estimate before starting
   - [ ] Add status indicator per snippet:
     - ✅ Green checkmark if embedded
     - ⚠️ Yellow warning if no embeddings
     - 🔄 Loading spinner during generation
   - [ ] Add "Re-embed" option:
     - Force re-generate embeddings
     - Use when changing embedding model

5.3. **Document Upload**
   - [ ] Add "Upload Document" button in snippets area
   - [ ] Create upload modal:
     - File picker (support .txt, .md, .html, .pdf, .csv)
     - Preview extracted text
     - Option to edit before saving
     - Auto-detect format and convert to markdown
   - [ ] Process uploaded file:
     - Parse using `document-parser.js`
     - Extract text and images
     - Convert to markdown
     - Base64 encode images
     - Save as new snippet
     - Optionally auto-generate embeddings
   - [ ] Show upload progress:
     - File size
     - Parsing status
     - Embedding generation (if enabled)

5.4. **Warnings & Notifications**
   - [ ] Warning banner if RAG enabled but no embeddings:
     ```
     ⚠️ RAG is enabled but you have {X} snippets without embeddings.
     [Generate Embeddings] [Disable RAG] [Don't show again]
     ```
   - [ ] Warning when switching embedding model:
     ```
     ⚠️ Changing embedding model requires re-embedding all snippets.
     Current: text-embedding-3-small (1536 dim)
     New: embed-english-v3.0 (1024 dim)
     Estimated cost: $X.XX
     [Proceed] [Cancel]
     ```
   - [ ] Notification on successful embedding:
     ```
     ✅ Generated embeddings for {X} snippets ({Y} chunks)
     Cost: $X.XX | Time: Xm Ys
     ```
   - [ ] Error notifications:
     - API rate limits hit
     - Google Sheets quota exceeded
     - Embedding generation failures

5.5. **RAG Query Indicator**
   - [ ] Add visual indicator when RAG is active
   - [ ] Show RAG results used in response:
     - Expandable section showing retrieved chunks
     - Highlight which snippets were used
     - Show similarity scores
   - [ ] Add "Search Snippets" button for manual RAG query

**Deliverables:**
- Updated Settings UI with RAG controls
- Snippet list with embedding status
- Document upload functionality
- Warning banners and notifications
- RAG query indicators in chat

---

### Phase 6: Polish & Optimization (Week 6)

**Goals:**
- Optimize performance
- Add error handling
- Improve UX
- Add analytics

**Tasks:**

6.1. **Performance Optimization**
   - [ ] Profile vector search performance
   - [ ] Optimize IndexedDB queries:
     - Use cursors efficiently
     - Batch operations
     - Index strategy
   - [ ] Consider Web Workers:
     - Offload vector similarity to worker
     - Parallelize embedding generation
     - Background sync
   - [ ] Implement caching:
     - Cache query embeddings (1 hour TTL)
     - Cache search results (5 min TTL)
   - [ ] Lazy loading:
     - Load embeddings on-demand
     - Paginate large result sets

6.2. **Error Handling & Recovery**
   - [ ] Handle API failures gracefully:
     - Retry with exponential backoff
     - Fallback to different provider
     - Queue failed embeddings for retry
   - [ ] Handle Google Sheets errors:
     - Sheet not found → create automatically
     - Quota exceeded → queue for later
     - Permission denied → show auth flow
   - [ ] Handle IndexedDB errors:
     - Storage quota exceeded → warn user
     - Corrupted data → rebuild from Sheet
     - Version conflicts → migrate automatically
   - [ ] Add detailed error logging:
     - Track error types and frequencies
     - Send to error tracking service (optional)

6.3. **UX Improvements**
   - [ ] Add keyboard shortcuts:
     - `Ctrl+K` → Search snippets (RAG query)
     - `Ctrl+Shift+E` → Generate embeddings
   - [ ] Add tooltips and help text:
     - Explain what RAG does
     - Explain embedding models
     - Explain similarity threshold
   - [ ] Add onboarding flow:
     - First-time RAG setup wizard
     - Explain benefits
     - Guide through initial embedding generation
   - [ ] Improve feedback:
     - Progress indicators everywhere
     - Success/error toasts
     - Loading skeletons

6.4. **Analytics & Monitoring**
   - [ ] Track RAG usage:
     - Number of RAG queries per session
     - Average chunks retrieved
     - Average similarity scores
     - User feedback on relevance (optional thumbs up/down)
   - [ ] Track embedding generation:
     - Total embeddings generated
     - Cost per user
     - Time per embedding
     - Failure rates
   - [ ] Track sync operations:
     - Sync frequency
     - Sync duration
     - Sync errors
     - Data transferred

6.5. **Documentation**
   - [ ] User documentation:
     - What is RAG?
     - How to use RAG features
     - Best practices for snippets
     - Troubleshooting guide
   - [ ] Developer documentation:
     - Architecture diagrams
     - API documentation
     - Testing guide
     - Deployment guide

**Deliverables:**
- Optimized performance (vector search <100ms)
- Comprehensive error handling
- Polished UX with helpful guidance
- Analytics dashboard (optional)
- Complete documentation

---

## Technical Specifications

### Embedding Models Research

**Research Checklist:**
```javascript
// EMBEDDING_MODELS_CATALOG.json
{
  "models": [
    {
      "id": "text-embedding-3-small",
      "provider": "openai",
      "dimensions": 1536,
      "max_tokens": 8191,
      "pricing": {
        "per_million_tokens": 0.02
      },
      "availability": "high",
      "recommended": true,
      "notes": "Best balance of cost and performance"
    },
    {
      "id": "text-embedding-3-large",
      "provider": "openai",
      "dimensions": 3072,
      "max_tokens": 8191,
      "pricing": {
        "per_million_tokens": 0.13
      },
      "availability": "high",
      "recommended": false,
      "notes": "Higher quality but expensive"
    },
    {
      "id": "embed-english-v3.0",
      "provider": "cohere",
      "dimensions": 1024,
      "max_tokens": 512,
      "pricing": {
        "per_million_tokens": 0.10
      },
      "availability": "medium",
      "recommended": false,
      "notes": "Good alternative to OpenAI"
    }
    // ... more models
  ],
  "default_model": "text-embedding-3-small",
  "fallback_chain": [
    "text-embedding-3-small",
    "embed-english-v3.0",
    "text-embedding-ada-002"
  ]
}
```

### File Structure

```
src/
├── rag/
│   ├── chunker.js              # Text chunking logic
│   ├── embeddings.js           # Embedding generation
│   ├── document-parser.js      # File parsing (PDF, MD, HTML, etc.)
│   ├── sheets-storage.js       # Google Sheets integration
│   ├── indexeddb-storage.js    # Local IndexedDB storage
│   ├── sync.js                 # Bidirectional sync
│   ├── search.js               # Vector similarity search
│   ├── rag-integration.js      # RAG query enhancement
│   └── index.js                # Public API exports
├── google-sheets.js            # Google Sheets API helpers
└── cost-tracking.js            # Updated with embedding costs

tests/
├── unit/
│   └── rag/
│       ├── chunker.test.js
│       ├── embeddings.test.js
│       ├── document-parser.test.js
│       └── search.test.js
└── integration/
    └── rag/
        ├── rag-flow.test.js
        └── sync.test.js

ui-new/src/
├── components/
│   ├── RAGSettings.tsx         # RAG settings panel
│   ├── EmbeddingStatus.tsx     # Embedding status indicators
│   ├── DocumentUpload.tsx      # File upload modal
│   └── RAGSearchResults.tsx    # Display retrieved chunks
├── hooks/
│   ├── useRAG.ts               # RAG operations hook
│   ├── useEmbeddings.ts        # Embedding generation hook
│   └── useRAGSync.ts           # Sync operations hook
└── utils/
    ├── rag-api.ts              # RAG API wrapper
    └── vector-utils.ts         # Vector math utilities

docs/
├── RAG_SCHEMA.md               # Database schema documentation
├── RAG_USER_GUIDE.md           # User-facing documentation
└── RAG_DEVELOPER_GUIDE.md      # Developer documentation

EMBEDDING_MODELS_CATALOG.json  # Embedding models database
```

### API Endpoints (if needed)

Most operations are client-side, but may need:

```javascript
// Optional server-side endpoints

// POST /api/embeddings/generate
// Body: { text: string, model: string }
// Response: { embedding: number[], dimensions: number }

// POST /api/embeddings/batch
// Body: { texts: string[], model: string }
// Response: { embeddings: number[][], dimensions: number }

// GET /api/embeddings/models
// Response: { models: [...] } from EMBEDDING_MODELS_CATALOG.json
```

**Decision:** Start with client-side only, add endpoints if needed for:
- Avoiding CORS issues with provider APIs
- Centralizing API key management
- Rate limiting across users

---

## Data Flow Examples

### Snippet Creation with Embedding

```javascript
// User creates/uploads snippet
1. Parse document → extract text
2. Save snippet to existing storage
3. If RAG enabled:
   a. Chunk text (chunker.js)
   b. Generate embeddings (embeddings.js)
   c. Save to IndexedDB (indexeddb-storage.js)
   d. Background sync to Google Sheets (sync.js)
4. Show success notification with embedding status
```

### RAG-Enhanced Query

```javascript
// User sends chat message
1. Check if RAG enabled
2. If enabled:
   a. Embed query text
   b. Search IndexedDB for similar chunks (search.js)
   c. Rank by similarity (>0.7 threshold)
   d. Take top 5 chunks
   e. Format as context
   f. Inject into system message or before user message
3. Send to Lambda handler
4. Display response with "RAG sources" indicator
```

### Login Sync

```javascript
// User logs in with Google OAuth
1. Complete OAuth flow (existing)
2. Check if RAG enabled
3. If enabled:
   a. Fetch chunks from Google Sheets (sheets-storage.js)
   b. Compare with local IndexedDB
   c. Update local with newer chunks from Sheet
   d. Upload any local-only chunks to Sheet
   e. Update last_sync timestamp
   f. Show sync status in UI
```

### Bulk Embedding Generation

```javascript
// User clicks "Generate Embeddings for All Snippets"
1. Show confirmation modal with cost estimate
2. User confirms
3. Get all snippets without embeddings
4. For each snippet:
   a. Chunk text
   b. Batch generate embeddings (up to 100 per request)
   c. Save to IndexedDB
   d. Update progress bar
5. Sync to Google Sheets in background
6. Show completion notification
```

---

## Testing Strategy

### Unit Tests

- ✅ Chunking algorithm (edge cases, boundaries)
- ✅ Embedding API calls (mocked responses)
- ✅ Document parsing (all formats)
- ✅ Vector similarity (known vectors)
- ✅ IndexedDB operations (CRUD)
- ✅ Google Sheets operations (mocked API)

### Integration Tests

- ✅ End-to-end snippet → chunks → embeddings → storage
- ✅ Search flow: query → embed → search → rank
- ✅ Sync flow: local → sheet → local
- ✅ RAG query enhancement flow

### Manual Testing

- ✅ Upload various document types
- ✅ Generate embeddings for 100+ snippets
- ✅ Search with various queries
- ✅ Sync after modifying both local and Sheet
- ✅ Test with slow network
- ✅ Test with API errors

### Performance Testing

- ✅ Vector search with 1k, 10k, 100k chunks
- ✅ Embedding generation for large documents
- ✅ Sync with large datasets
- ✅ IndexedDB storage limits

---

## Dependencies

### New NPM Packages

```bash
# Backend (Node.js)
npm install turndown         # HTML to Markdown
npm install pdf-parse        # PDF text extraction
npm install papaparse        # CSV parsing
npm install langchain        # Optional: for advanced chunking

# Frontend (React)
npm install @google/sheets   # Google Sheets API client
npm install idb              # IndexedDB wrapper (if not using native)
npm install ml-distance      # Vector similarity calculations
```

### Existing Dependencies to Use

- Google OAuth (already implemented)
- Provider system (for embedding API calls)
- Cost tracking (extend for embeddings)
- IndexedDB (extend current usage)

---

## Cost Analysis

### Embedding Generation Costs

**Scenario:** 1000 snippets, average 500 words each

```
Total words: 1000 * 500 = 500,000 words
Total tokens: 500,000 * 0.75 = 375,000 tokens (rough estimate)
Chunks: 375,000 / 250 = 1,500 chunks

Using text-embedding-3-small ($0.02/1M tokens):
Cost = (375,000 / 1,000,000) * $0.02 = $0.0075

Total: Less than $0.01 for 1000 snippets!
```

**Conclusion:** Embedding generation is very cost-effective

### Storage Costs

- **Google Sheets:** Free (user's own storage)
- **IndexedDB:** Free (browser storage)
- **Provider API calls:** Already tracked in cost system

---

## Risks & Mitigations

### Risk 1: Google Sheets API Rate Limits

**Risk:** 100 requests per 100 seconds limit  
**Impact:** Sync may fail for large datasets  
**Mitigation:**
- Batch operations (1000 rows per request)
- Implement exponential backoff
- Queue operations and process gradually
- Show clear error messages to user

### Risk 2: IndexedDB Storage Quota

**Risk:** Browser may limit storage to ~50-100MB  
**Impact:** Cannot store large embedding datasets  
**Mitigation:**
- Compress embeddings (Float32 instead of Float64)
- Request persistent storage permission
- Warn user at 80% quota usage
- Implement LRU eviction for old chunks

### Risk 3: Embedding Model Changes

**Risk:** Provider deprecates/changes embedding model  
**Impact:** Inconsistent embeddings, search quality degrades  
**Mitigation:**
- Store model name with each embedding
- Detect model mismatches during search
- Provide easy re-embedding tool
- Support multiple models simultaneously

### Risk 4: Sync Conflicts

**Risk:** User modifies Sheet and local DB simultaneously  
**Impact:** Data loss or inconsistency  
**Mitigation:**
- Timestamp-based conflict resolution (newer wins)
- Never delete user data without confirmation
- Implement "undo" for sync operations
- Provide manual conflict resolution UI

### Risk 5: Performance with Large Datasets

**Risk:** Vector search slow with 10k+ chunks  
**Impact:** Poor UX, delayed responses  
**Mitigation:**
- Implement approximate nearest neighbor (ANN)
- Use Web Workers for parallel computation
- Cache frequent queries
- Paginate search results
- Consider HNSW or other ANN algorithms

---

## Success Metrics

### Phase 1-2 (Setup & Infrastructure)
- ✅ Embedding models catalog complete
- ✅ Chunking produces consistent results
- ✅ Embeddings generated successfully for test snippets

### Phase 3-4 (Storage & Search)
- ✅ Chunks saved to Google Sheets successfully
- ✅ IndexedDB stores 1000+ chunks efficiently
- ✅ Sync completes in <30 seconds for 1000 chunks
- ✅ Vector search returns relevant results (<100ms)

### Phase 5-6 (UI & Polish)
- ✅ Users can enable RAG in settings
- ✅ Users can generate embeddings in <2 minutes for 100 snippets
- ✅ Users can upload documents successfully
- ✅ RAG-enhanced queries show improved relevance
- ✅ No major bugs or crashes in production

### User Adoption
- 📊 % of users who enable RAG
- 📊 Average snippets per user with embeddings
- 📊 RAG queries per session
- 📊 User satisfaction with search results

---

## Open Questions

1. **Should we support multiple embedding models simultaneously?**
   - Pro: Flexibility, can compare models
   - Con: Complexity, storage overhead
   - **Decision:** Single model per user, allow switching with re-embedding

2. **Should we implement approximate nearest neighbor (ANN) from the start?**
   - Pro: Better performance with large datasets
   - Con: Increased complexity, may not be needed initially
   - **Decision:** Start with brute force, optimize if needed (>10k chunks)

3. **Should we add text-to-image or multimodal embedding support?**
   - Pro: More comprehensive RAG
   - Con: Much more complex, limited provider support
   - **Decision:** Phase 2 feature, focus on text first

4. **Should embeddings be generated server-side or client-side?**
   - Server-side: Centralized API keys, easier rate limiting
   - Client-side: User's API keys, more private
   - **Decision:** Client-side (consistent with current architecture)

5. **Should we use embedjs library or build custom?**
   - embedjs: Faster development, more features
   - Custom: More control, less dependencies
   - **Decision:** Research embedjs, likely build custom for better integration

---

## Additional Requirements & Enhancements

### Enhanced Source Document Referencing

**Requirement:** Improve how RAG search results reference and display source documents.

**Implementation Details:**

1. **Compact Search Result Format**
   - Display RAG results similar to web search results
   - Use markdown format with clear source attribution
   - Format: `### [Document Title](source-link)\n\n{content snippet}`
   - Include metadata: document type, upload date, snippet name

2. **Source Material Links**
   - **For uploaded files:** Create new endpoint `/api/documents/:id/original` that returns:
     - Full unconverted file contents
     - Original filename and content-type headers
     - Download capability
   - **For URL-based documents:** Use the original pasted URL as the source link
   - Store both converted (markdown) and original file reference

3. **File Upload Enhancement**
   - Add "Paste URL" option in upload dialog
   - If URL is provided:
     - Fetch and convert content to markdown
     - Store URL as `originalSource` metadata field
     - Link to original URL in search results
   - If file is uploaded:
     - Store file in backend (S3, Google Drive, or base64 in DB)
     - Generate document ID for `/api/documents/:id/original` endpoint
     - Store file reference in metadata

**Schema Changes:**

```javascript
// Snippet metadata schema addition
{
  id: string,
  name: string,
  tags: string[],
  content: string, // markdown with base64 images
  originalSource?: {
    type: 'url' | 'file',
    url?: string, // For URL-based uploads
    fileId?: string, // For file uploads
    filename?: string,
    contentType?: string,
    uploadDate: timestamp
  },
  chunks: [...],
  embeddings: [...]
}
```

---

### EmbedJS Integration for File Format Handling

**Requirement:** Use [EmbedJS](https://github.com/llm-tools/embedjs) for tokenization and wider file format support.

**Benefits:**
- Professional-grade document parsing
- Support for 20+ file formats out of the box
- Built-in chunking strategies
- Metadata extraction
- Community-maintained

**File Formats Supported by EmbedJS:**
- Documents: PDF, DOCX, PPTX, XLSX, ODT, RTF
- Web: HTML, XML, JSON, CSV
- Code: JS, TS, PY, JAVA, CPP, etc.
- Text: TXT, MD, LOG
- Media metadata: MP3, MP4 (for metadata extraction)

**Implementation:**

```bash
npm install @llm-tools/embedjs
```

```javascript
// src/rag/document-parser-embedjs.js
import { DocxLoader, PdfLoader, WebLoader } from '@llm-tools/embedjs';

async function parseDocumentWithEmbedJS(file, options) {
  let loader;
  
  switch (file.type) {
    case 'application/pdf':
      loader = new PdfLoader({ filePathOrUrl: file });
      break;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      loader = new DocxLoader({ filePathOrUrl: file });
      break;
    case 'text/html':
      loader = new WebLoader({ urlOrContent: file });
      break;
    // ... more loaders
  }
  
  const chunks = await loader.getChunks();
  const markdown = convertChunksToMarkdown(chunks);
  
  return {
    markdown,
    chunks,
    metadata: loader.getMetadata()
  };
}
```

**Integration Points:**
- Replace existing document-parser.js logic
- Use EmbedJS chunking strategies instead of custom chunker
- Maintain markdown + base64 images output format
- Handle lossy conversions gracefully (warn user)

---

### libSQL Vector Database in Lambda Layer

**Requirement:** Pre-populate Lambda with knowledge base using libSQL vector database.

**Architecture:**

```
┌─────────────────────────────────────────┐
│         Lambda Function                  │
│  ┌───────────────────────────────────┐  │
│  │    Application Code                │  │
│  │  (Node.js handler)                 │  │
│  └─────────────┬─────────────────────┘  │
│                │                         │
│  ┌─────────────▼─────────────────────┐  │
│  │      Lambda Layer                  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  libSQL Database             │  │  │
│  │  │  ├─ knowledge_base.db        │  │  │
│  │  │  ├─ Vector extension         │  │  │
│  │  │  └─ Pre-built indexes        │  │  │
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Implementation Steps:**

1. **Setup libSQL with Vector Extension**
   ```bash
   npm install @libsql/client
   ```

2. **Create Knowledge Base Builder Script**
   ```javascript
   // scripts/build-knowledge-base.js
   import { createClient } from '@libsql/client';
   
   const db = createClient({
     url: 'file:knowledge_base.db'
   });
   
   // Create tables with vector extension
   await db.execute(`
     CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings 
     USING vec0(
       embedding FLOAT[1536],
       document_id TEXT,
       chunk_text TEXT,
       metadata TEXT
     )
   `);
   ```

3. **Makefile Commands**
   ```makefile
   # Ingest documents into knowledge base
   kb-ingest:
   	@node scripts/kb-ingest.js --file $(FILE) --name $(NAME)
   
   # List all documents in knowledge base
   kb-list:
   	@node scripts/kb-list.js
   
   # Delete document from knowledge base
   kb-delete:
   	@node scripts/kb-delete.js --id $(ID)
   
   # Build knowledge base and package for Lambda layer
   kb-build:
   	@node scripts/build-knowledge-base.js
   	@mkdir -p lambda-layer/knowledge_base
   	@cp knowledge_base.db lambda-layer/knowledge_base/
   	@cd lambda-layer && zip -r knowledge_base_layer.zip .
   
   # Deploy Lambda with updated layer
   kb-deploy:
   	@make kb-build
   	@aws lambda publish-layer-version \
   		--layer-name knowledge-base \
   		--zip-file fileb://lambda-layer/knowledge_base_layer.zip
   	@./deploy.sh
   ```

4. **Lambda Integration**
   ```javascript
   // src/rag/lambda-kb-search.js
   import { createClient } from '@libsql/client';
   
   let dbClient;
   
   export async function searchKnowledgeBase(embedding, topK = 5) {
     if (!dbClient) {
       // Lambda layer mounts to /opt
       dbClient = createClient({
         url: 'file:/opt/knowledge_base/knowledge_base.db'
       });
     }
     
     const results = await dbClient.execute({
       sql: `
         SELECT document_id, chunk_text, metadata,
                vec_distance_cosine(embedding, ?) as distance
         FROM document_embeddings
         ORDER BY distance
         LIMIT ?
       `,
       args: [embedding, topK]
     });
     
     return results.rows;
   }
   ```

**Benefits:**
- ✅ Read-only knowledge base (fast, no writes)
- ✅ Pre-computed indexes (instant search)
- ✅ No cold start penalty (already in layer)
- ✅ Versioned deployments (layer versions)
- ✅ Separate from user data (users still use Google Sheets)

**Use Cases:**
- Company documentation
- Product manuals
- FAQ databases
- Legal/compliance documents
- Code examples and templates

---

### LLM-Accessible Snippet Tool

**Requirement:** Create a tool that LLMs can use to manage snippets programmatically.

**Purpose:** Enable LLM-driven workflows for building complex documents in stages.

**Tool Specification:**

```javascript
// Tool definition for LLM
{
  name: "manage_snippets",
  description: "Create, retrieve, search, and delete snippets for building documents in stages. Snippets can contain markdown text and base64 images.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "get", "search", "delete", "update"],
        description: "Action to perform"
      },
      snippet: {
        type: "object",
        properties: {
          name: { type: "string", description: "Snippet name" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for organization" },
          content: { type: "string", description: "Content in markdown with optional base64 images" }
        }
      },
      query: {
        type: "string",
        description: "Search query (for search action) or snippet ID (for get/delete)"
      },
      limit: {
        type: "number",
        description: "Max results for search (default: 10)"
      }
    },
    required: ["action"]
  }
}
```

**Implementation:**

```javascript
// src/tools/manage-snippets.js
export async function executeSnippetTool(args, context) {
  const { action, snippet, query, limit = 10 } = args;
  const { accessToken, userId } = context;
  
  switch (action) {
    case 'create':
      // 1. Validate snippet data
      // 2. Save to Google Sheets immediately
      // 3. Generate chunks and embeddings
      // 4. Update vector database
      // 5. Sync to IndexedDB
      const newSnippet = await createSnippet(snippet, accessToken);
      return {
        success: true,
        snippetId: newSnippet.id,
        message: `Created snippet "${snippet.name}"`
      };
    
    case 'get':
      // Retrieve by ID or name
      const found = await getSnippet(query, accessToken);
      return found;
    
    case 'search':
      // Use vector database for semantic search
      const embedding = await generateEmbedding(query);
      const results = await searchSnippets(embedding, limit);
      return {
        results: results.map(r => ({
          name: r.name,
          id: r.id,
          tags: r.tags,
          snippet: r.content.substring(0, 500), // Preview
          relevance: r.similarity
        }))
      };
    
    case 'delete':
      // 1. Delete from Google Sheets
      // 2. Remove from vector database
      // 3. Clean up IndexedDB
      await deleteSnippet(query, accessToken);
      return {
        success: true,
        message: `Deleted snippet "${query}"`
      };
    
    case 'update':
      // Update existing snippet (re-embed if content changed)
      const updated = await updateSnippet(query, snippet, accessToken);
      return updated;
  }
}
```

**Workflow Example:**

```
User: "Research quantum computing and create a comprehensive report"

LLM: Let me break this down into stages:

1. [Uses web_search tool] Search for quantum computing basics
2. [Uses manage_snippets tool] create snippet "QC-Basics" with summary
3. [Uses web_search tool] Search for quantum computing applications
4. [Uses manage_snippets tool] create snippet "QC-Applications"
5. [Uses web_search tool] Search for quantum computing challenges
6. [Uses manage_snippets tool] create snippet "QC-Challenges"
7. [Uses manage_snippets tool] search for "quantum" to retrieve all parts
8. [Synthesizes final report] Combines all snippets into cohesive document
```

**Benefits:**
- ✅ Multi-stage document building
- ✅ Iterative refinement workflows
- ✅ Research organization
- ✅ Knowledge accumulation
- ✅ Reusable content blocks

**Storage Details:**
- Snippets saved immediately to Google Sheets
- Vector search uses libSQL (local) + libSQL (Lambda layer) for hybrid search
- Name, tags, content all searchable
- Content can include text (markdown) and images (base64)
- Conversion from uploaded files can be lossy (warn user)

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1. Research & Setup | 1 week | Embedding catalog, Sheets API, schemas |
| 2. Chunking & Embeddings | 1 week | Chunking module, embedding generation, document parsing |
| 3. Storage Layer | 1 week | Sheets storage, IndexedDB, sync |
| 4. Vector Search & RAG | 1 week | Similarity search, RAG integration |
| 5. UI Integration | 1 week | Settings, upload, warnings, indicators |
| 6. Polish & Optimization | 1 week | Performance, error handling, docs |

**Total:** 6 weeks (1.5 months)

**MVP (Minimum Viable Product):** Phases 1-4 (4 weeks)
**Full Feature:** All phases (6 weeks)

---

## Next Steps

### Immediate Actions (No Implementation - Planning Only)

1. **Review this plan with stakeholders**
   - Validate approach
   - Confirm priorities
   - Adjust timeline if needed

2. **Research embedding models**
   - Create spreadsheet comparing models
   - Test API availability
   - Document pricing

3. **Design database schemas**
   - Finalize Google Sheets structure
   - Finalize IndexedDB structure
   - Plan migration strategy

4. **Create detailed user stories**
   - User wants to upload a PDF
   - User wants to search their snippets semantically
   - User wants to disable RAG temporarily
   - etc.

5. **Set up project tracking**
   - Create GitHub issues for each task
   - Set up project board
   - Assign tasks to sprints

---

## Conclusion

This plan provides a comprehensive roadmap for implementing RAG with embeddings in Google Sheets. The approach is:

- ✅ **User-centric:** Users own their data
- ✅ **Cost-effective:** Embeddings are cheap, storage is free
- ✅ **Performant:** Client-side search with IndexedDB
- ✅ **Flexible:** Support multiple providers and models
- ✅ **Scalable:** Can handle 1000s of snippets
- ✅ **Privacy-focused:** Local-first with cloud backup

The 6-week timeline is achievable with focused development, and the MVP (4 weeks) provides core functionality for early adopters.

**Recommendation:** Proceed with Phase 1 (Research & Setup) to validate assumptions before committing to full implementation.
