# RAG Browser-First Architecture Plan

## Overview
Redesign RAG storage to use browser IndexedDB as primary storage, synced with Google Sheets, eliminating dependency on Lambda ephemeral filesystem.

## Current Problems
1. **Lambda /tmp is ephemeral** - libSQL database at `/tmp/rag.db` gets reset when Lambda environment times out
2. **Embeddings lost on timeout** - No persistence across Lambda cold starts
3. **Split storage** - Snippets in Google Sheets, embeddings in Lambda (lost)

## New Architecture

### Storage Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Primary)                         │
│  ┌────────────────────────────────────────────────────┐     │
│  │ IndexedDB: rag_embeddings                          │     │
│  │  - chunks (with embeddings)                        │     │
│  │  - metadata                                         │     │
│  │  - search_cache (query embeddings)                 │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                         ↕ Sync (with progress toasts)
┌─────────────────────────────────────────────────────────────┐
│         Google Sheets (User-Owned, Per-Account)              │
│  Spreadsheet: "Research Agent Swag" (in user's Drive)       │
│  - RAG_Snippets_v1 (content)                                │
│  - RAG_Embeddings_v1 (chunks + embeddings)                  │
│  - RAG_Search_Cache (query embeddings)                      │
│  Created automatically on first login                        │
└─────────────────────────────────────────────────────────────┘
                         ↕ API Calls
┌─────────────────────────────────────────────────────────────┐
│              Lambda (Stateless Services)                     │
│  - Embedding generation (OpenAI API)                        │
│  - Google Sheets operations (user's OAuth token)            │
│  - No persistent storage                                    │
│  - Returns embeddings to client                             │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### User-Owned Spreadsheets

**Key Concept**: Each user has their own "Research Agent Swag" spreadsheet in their Google Drive.

**Discovery Flow**:
1. User logs in with Google OAuth
2. Backend receives user's access token
3. Backend searches user's Drive for spreadsheet named "Research Agent Swag"
4. If not found, create new spreadsheet in user's Drive
5. Return spreadsheet ID to frontend (stored in localStorage)
6. All subsequent operations use user's token + their spreadsheet ID

**Code Example**:
```javascript
// Backend: Find or create user's RAG spreadsheet
async function getUserSpreadsheet(authClient, userEmail) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  
  // Search for existing spreadsheet
  const response = await drive.files.list({
    q: `name='Research Agent Swag' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });
  
  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }
  
  // Create new spreadsheet
  const spreadsheet = await sheets.spreadsheets.create({
    resource: {
      properties: { title: 'Research Agent Swag' },
      sheets: [
        { properties: { title: 'RAG_Snippets_v1' } },
        { properties: { title: 'RAG_Embeddings_v1' } },
        { properties: { title: 'RAG_Search_Cache' } }
      ]
    }
  });
  
  return spreadsheet.data.spreadsheetId;
}
```

#### 4.2 Update `generateEmbeddings()` in SwagContext
**File**: `ui-new/src/contexts/SwagContext.tsx`

**Flow**: Request → Receive JSON → Save to IndexedDB → Save to Google Sheets → Update UI

```typescript
const generateEmbeddings = async (
  snippetIds: string[], 
  force: boolean = false
): Promise<void> => {
  const toastId = toast.loading(`🧬 Generating embeddings for ${snippetIds.length} snippets...`);
  
  try {
    // Step 1: Request embeddings from backend (returns JSON, not SSE)
    const response = await fetch(`${apiUrl}/rag/embed-snippets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        snippets: snippetIds,
        force
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const { success, results } = await response.json();
    
    if (!success) {
      throw new Error('Embedding generation failed');
    }
    
    // Step 2: Save to IndexedDB
    toast.update(toastId, {
      render: `💾 Saving ${results.length} snippet embeddings to browser...`
    });
    
    const embeddedSnippetIds: string[] = [];
    let totalChunks = 0;
    
    for (const result of results) {
      if (result.status === 'success' && result.chunks.length > 0) {
        await ragDB.saveChunksWithEmbeddings(result.chunks, {
          snippet_id: result.id,
          created_at: Date.now(),
          updated_at: Date.now()
        });
        
        embeddedSnippetIds.push(result.id);
        totalChunks += result.chunks.length;
      }
    }
    
    toast.update(toastId, {
      render: `💾 Saved ${totalChunks} chunks to browser. Syncing to Google Sheets...`
    });
    
    // Step 3: Sync to Google Sheets (user's spreadsheet)
    await ragSyncService.pushEmbeddings(
      results.flatMap(r => r.chunks),
      (current, total) => {
        toast.update(toastId, {
          render: `☁️ Syncing to Google Sheets: ${current}/${total} chunks...`
        });
      }
    );
    
    // Step 4: Update UI state
    setSnippets(prev => prev.map(s => 
      embeddedSnippetIds.includes(s.id)
        ? { ...s, hasEmbedding: true }
        : s
    ));
    
    toast.update(toastId, {
      render: `✅ Generated ${totalChunks} embeddings for ${embeddedSnippetIds.length} snippets`,
      type: 'success',
      isLoading: false,
      autoClose: 3000
    });
    
  } catch (error) {
    console.error('Failed to generate embeddings:', error);
    toast.update(toastId, {
      render: `❌ Failed to generate embeddings: ${error.message}`,
      type: 'error',
      isLoading: false,
      autoClose: 5000
    });
    throw error;
  }
};
```

**Toast flow**:
```
🧬 Generating embeddings for 5 snippets...
   ↓
💾 Saving 5 snippet embeddings to browser...
   ↓
☁️ Syncing to Google Sheets: 25/25 chunks...
   ↓
✅ Generated 25 embeddings for 5 snippets
```

#### 0.1 Spreadsheet Discovery Endpoint
**New endpoint**: `GET /rag/user-spreadsheet`

```javascript
// Returns user's RAG spreadsheet ID (creates if needed)
async function getUserSpreadsheetId(userEmail, authToken) {
  const authClient = createOAuthClient(authToken);
  const spreadsheetId = await getUserSpreadsheet(authClient, userEmail);
  
  return { spreadsheetId, created: !existingFound };
}
```

#### 0.2 Frontend Storage
**Store in localStorage**:
```typescript
// On login
const { spreadsheetId } = await fetch('/rag/user-spreadsheet').then(r => r.json());
localStorage.setItem('rag_spreadsheet_id', spreadsheetId);

// On all RAG operations
const spreadsheetId = localStorage.getItem('rag_spreadsheet_id');
```

### Phase 1: Google Sheets Schema Setup

#### 1.1 Update RAG_Snippets_v1 Sheet
**Status**: Already exists, no changes needed
- Columns: id, user_email, content, title, timestamp, update_date, source_type, tags, has_embedding, device_id, sync_version, deleted, deleted_at, last_modified_device

#### 1.2 Create RAG_Embeddings_v1 Sheet
**New sheet in "Research Agent Swag" spreadsheet**

Columns:
- `id` (string) - Unique chunk ID
- `snippet_id` (string) - Reference to snippet
- `user_email` (string) - Owner
- `chunk_index` (number) - Position in snippet
- `chunk_text` (string) - Text content of chunk
- `embedding` (string) - JSON array of floats (1536 dims for text-embedding-3-small)
- `embedding_model` (string) - e.g., "text-embedding-3-small"
- `total_chunks` (number) - How many chunks for this snippet
- `created_at` (timestamp)
- `sync_version` (number) - For conflict resolution

**Size Considerations**:
- Each embedding: 1536 floats × 8 bytes = ~12KB per chunk
- Google Sheets cell limit: 50,000 characters
- JSON array representation: ~15KB per chunk (acceptable)
- Spreadsheet limit: 10 million cells total

**Optimization**: Store embeddings as compressed base64 or use Float32Array for ~6KB per chunk

#### 1.3 Create RAG_Search_Cache Sheet (Optional)
Cache frequently used search query embeddings

Columns:
- `query` (string) - Search query text
- `embedding` (string) - JSON array
- `embedding_model` (string)
- `user_email` (string)
- `created_at` (timestamp)
- `last_used` (timestamp)

---

### Phase 2: Backend Endpoint Changes

#### 2.1 Modify `/rag/embed-snippets` Endpoint
**File**: `src/endpoints/rag.js`

**Current Behavior**:
- Saves to libSQL `/tmp/rag.db`
- Returns success/failure via SSE

**New Behavior**:
```javascript
// POST /rag/embed-snippets
// Request: { snippets: [...], force: boolean }
// Response: SSE stream with embeddings data

async function handleEmbedSnippets(body, writeEvent, responseStream) {
  const { snippets, force } = body;
  
  for (const snippet of snippets) {
    // Step 1: Generate embeddings (unchanged)
    const chunks = chunker.chunkText(snippet.content, { chunkSize: 512, overlap: 50 });
    const embeddings = await embeddings.batchGenerateEmbeddings(
      chunks.map(c => c.chunk_text),
      'text-embedding-3-small',
      'openai',
      process.env.OPENAI_API_KEY
    );
    
    // Step 2: Prepare chunks with embeddings
    const chunksWithEmbeddings = chunks.map((chunk, index) => ({
      id: generateUUID(),
      snippet_id: snippet.id,
      chunk_index: index,
      chunk_text: chunk.chunk_text,
      embedding: embeddings[index].embedding, // Float array
      embedding_model: 'text-embedding-3-small',
      total_chunks: chunks.length,
      created_at: Date.now()
    }));
    
    // Step 3: Save to Google Sheets
    await saveEmbeddingsToSheets(sheets, spreadsheetId, chunksWithEmbeddings, userEmail);
    
    // Step 4: Stream chunks back to client for IndexedDB storage
    writeEvent('chunk_embedded', {
      snippet_id: snippet.id,
      chunks: chunksWithEmbeddings // Full data including embeddings
    });
  }
  
  writeEvent('complete', { embedded, skipped, failed });
}
```

**Changes**:
- ❌ Remove libSQL storage
- ❌ Remove SSE streaming (embeddings too large)
- ✅ Return full chunk data via JSON response
- ✅ Client receives data, saves to IndexedDB + Google Sheets

#### 2.2 Create `/rag/embed-query` Endpoint
**New endpoint for search query embeddings**

```javascript
// POST /rag/embed-query
// Request: { query: string, useCache: boolean }
// Response: { query, embedding: float[], model, cached: boolean }

async function handleEmbedQuery(body) {
  const { query, useCache = true } = body;
  
  // Check cache in Google Sheets (if enabled)
  if (useCache) {
    const cached = await getQueryEmbeddingFromSheets(sheets, spreadsheetId, query, userEmail);
    if (cached) {
      return { query, embedding: cached.embedding, model: cached.model, cached: true };
    }
  }
  
  // Generate new embedding
  const result = await embeddings.generateEmbedding(
    query,
    'text-embedding-3-small',
    'openai',
    process.env.OPENAI_API_KEY
  );
  
  // Save to cache (async, don't wait)
  if (useCache) {
    saveQueryEmbeddingToSheets(sheets, spreadsheetId, query, result.embedding, userEmail)
      .catch(err => console.error('Failed to cache query embedding:', err));
  }
  
  return { query, embedding: result.embedding, model: 'text-embedding-3-small', cached: false };
}
```

#### 2.3 Remove libSQL Dependencies
**Files to modify**:
- `src/rag/index.js` - Remove libSQL imports
- `src/endpoints/rag.js` - Remove `createLibsqlClient` calls
- `src/rag/libsql-storage.js` - Mark as deprecated or remove

---

### Phase 3: Frontend IndexedDB Updates

#### 3.1 Enhance ragDB.ts
**File**: `ui-new/src/utils/ragDB.ts`

**Add new methods**:

```typescript
class RAGDatabase {
  // ... existing methods ...
  
  /**
   * Save chunks with full embeddings to IndexedDB
   */
  async saveChunksWithEmbeddings(chunks: EmbeddingChunk[], metadata: ChunkMetadata): Promise<void> {
    await this.init();
    const db = this.db!;
    
    const tx = db.transaction(['chunks', 'metadata'], 'readwrite');
    const chunkStore = tx.objectStore('chunks');
    const metaStore = tx.objectStore('metadata');
    
    // Save all chunks
    for (const chunk of chunks) {
      await chunkStore.put(chunk);
    }
    
    // Update metadata
    await metaStore.put({
      ...metadata,
      chunk_count: chunks.length,
      has_embeddings: true
    });
    
    await tx.done;
  }
  
  /**
   * Get all chunks for vector search
   */
  async getAllChunksForSearch(): Promise<EmbeddingChunk[]> {
    await this.init();
    const db = this.db!;
    
    const tx = db.transaction('chunks', 'readonly');
    const chunks = await tx.objectStore('chunks').getAll();
    return chunks;
  }
  
  /**
   * Cache search query embedding
   */
  async cacheQueryEmbedding(query: string, embedding: number[], model: string): Promise<void> {
    await this.init();
    const db = this.db!;
    
    // Create search_cache store if not exists
    if (!db.objectStoreNames.contains('search_cache')) {
      // Need to upgrade schema
      db.close();
      await this.upgradeSchema();
    }
    
    const tx = db.transaction('search_cache', 'readwrite');
    await tx.objectStore('search_cache').put({
      query,
      embedding,
      model,
      created_at: Date.now(),
      last_used: Date.now()
    });
  }
  
  /**
   * Get cached query embedding
   */
  async getCachedQueryEmbedding(query: string): Promise<{ embedding: number[], model: string } | null> {
    await this.init();
    const db = this.db!;
    
    if (!db.objectStoreNames.contains('search_cache')) {
      return null;
    }
    
    const tx = db.transaction('search_cache', 'readwrite');
    const store = tx.objectStore('search_cache');
    const cached = await store.get(query);
    
    if (cached) {
      // Update last_used
      cached.last_used = Date.now();
      await store.put(cached);
    }
    
    return cached ? { embedding: cached.embedding, model: cached.model } : null;
  }
  
  /**
   * Perform cosine similarity search
   */
  async vectorSearch(queryEmbedding: number[], topK: number = 5): Promise<SearchResult[]> {
    const chunks = await this.getAllChunksForSearch();
    
    // Calculate similarity for each chunk
    const results = chunks.map(chunk => ({
      chunk,
      score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
    }));
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    // Return top K
    return results.slice(0, topK).map(r => ({
      snippet_id: r.chunk.snippet_id,
      chunk_id: r.chunk.chunk_id,
      content: r.chunk.content,
      score: r.score,
      chunk_index: r.chunk.chunk_index,
      total_chunks: r.chunk.total_chunks
    }));
  }
  
  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

interface SearchResult {
  snippet_id: string;
  chunk_id: string;
  content: string;
  score: number;
  chunk_index: number;
  total_chunks: number;
}
```

#### 3.2 Update SwagContext.tsx
**File**: `ui-new/src/contexts/SwagContext.tsx`

**Modify `generateEmbeddings` to save full data**:

```typescript
const generateEmbeddings = async (snippetIds: string[], onProgress?, force = false) => {
  // ... existing fetch setup ...
  
  // Parse SSE response
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.substring(6));
      
      // Save chunks with embeddings to IndexedDB
      if (data.event === 'chunk_embedded' && data.chunks) {
        await ragDB.saveChunksWithEmbeddings(
          data.chunks.map(c => ({
            chunk_id: c.id,
            snippet_id: c.snippet_id,
            content: c.chunk_text,
            embedding: c.embedding, // Full embedding array
            chunk_index: c.chunk_index,
            total_chunks: c.total_chunks,
            created_at: c.created_at,
            embedding_model: c.embedding_model
          })),
          {
            snippet_id: data.snippet_id,
            title: snippet?.title,
            source_type: 'text',
            tags: snippet?.tags || [],
            created_at: Date.now(),
            updated_at: Date.now()
          }
        );
        
        embeddedSnippetIds.push(data.snippet_id);
      }
    }
  }
  
  // ... rest of function ...
};
```

**Add vector search function**:

```typescript
const vectorSearch = async (query: string, topK: number = 5): Promise<SearchResult[]> => {
  try {
    // Get or generate query embedding
    let queryEmbedding: number[];
    
    const cached = await ragDB.getCachedQueryEmbedding(query);
    if (cached) {
      queryEmbedding = cached.embedding;
    } else {
      // Call backend to generate embedding
      const response = await fetch(`${import.meta.env.VITE_LAMBDA_URL || 'http://localhost:3000'}/rag/embed-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, useCache: true })
      });
      
      const result = await response.json();
      queryEmbedding = result.embedding;
      
      // Cache in IndexedDB
      await ragDB.cacheQueryEmbedding(query, queryEmbedding, result.model);
    }
    
    // Perform local vector search
    const results = await ragDB.vectorSearch(queryEmbedding, topK);
    
    return results;
  } catch (error) {
    console.error('Vector search failed:', error);
    throw error;
  }
};
```

---

### Phase 4: Google Sheets Sync Service

#### 4.1 Create sheets-embedding-storage.js
**New file**: `src/rag/sheets-embedding-storage.js`

```javascript
/**
 * Save embeddings to Google Sheets
 */
async function saveEmbeddingsToSheets(sheets, spreadsheetId, chunks, userEmail) {
  const EMBEDDINGS_SHEET = 'RAG_Embeddings_v1';
  
  // Ensure sheet exists
  await ensureEmbeddingsSheetExists(sheets, spreadsheetId);
  
  // Prepare rows
  const rows = chunks.map(chunk => [
    chunk.id,
    chunk.snippet_id,
    userEmail,
    chunk.chunk_index,
    chunk.chunk_text,
    JSON.stringify(chunk.embedding), // Serialize float array
    chunk.embedding_model,
    chunk.total_chunks,
    new Date(chunk.created_at).toISOString(),
    1 // sync_version
  ]);
  
  // Append to sheet
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${EMBEDDINGS_SHEET}!A:J`,
    valueInputOption: 'RAW',
    resource: { values: rows }
  });
  
  console.log(`✅ Saved ${chunks.length} embedding chunks to Sheets`);
}

/**
 * Load embeddings from Google Sheets for a user
 */
async function loadEmbeddingsFromSheets(sheets, spreadsheetId, userEmail, snippetIds = null) {
  const EMBEDDINGS_SHEET = 'RAG_Embeddings_v1';
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${EMBEDDINGS_SHEET}!A2:J` // Skip header
  });
  
  const rows = response.data.values || [];
  
  const chunks = rows
    .filter(row => row[2] === userEmail) // Filter by user_email
    .filter(row => !snippetIds || snippetIds.includes(row[1])) // Filter by snippet_id if provided
    .map(row => ({
      id: row[0],
      snippet_id: row[1],
      user_email: row[2],
      chunk_index: parseInt(row[3]),
      chunk_text: row[4],
      embedding: JSON.parse(row[5]), // Deserialize float array
      embedding_model: row[6],
      total_chunks: parseInt(row[7]),
      created_at: new Date(row[8]).getTime(),
      sync_version: parseInt(row[9])
    }));
  
  return chunks;
}

/**
 * Ensure RAG_Embeddings_v1 sheet exists with proper schema
 */
async function ensureEmbeddingsSheetExists(sheets, spreadsheetId) {
  // Check if sheet exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetExists = meta.data.sheets.some(s => s.properties.title === 'RAG_Embeddings_v1');
  
  if (!sheetExists) {
    // Create sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          addSheet: {
            properties: { title: 'RAG_Embeddings_v1' }
          }
        }]
      }
    });
    
    // Add header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'RAG_Embeddings_v1!A1:J1',
      valueInputOption: 'RAW',
      resource: {
        values: [[
          'id', 'snippet_id', 'user_email', 'chunk_index', 'chunk_text',
          'embedding', 'embedding_model', 'total_chunks', 'created_at', 'sync_version'
        ]]
      }
    });
  }
}

module.exports = {
  saveEmbeddingsToSheets,
  loadEmbeddingsFromSheets,
  ensureEmbeddingsSheetExists
};
```

#### 4.2 Update ragSyncService.ts
**File**: `ui-new/src/services/ragSyncService.ts`

**Add embedding sync methods**:

```typescript
/**
 * Pull embeddings from Google Sheets and save to IndexedDB
 */
async pullEmbeddings(userEmail: string, snippetIds?: string[]): Promise<number> {
  const response = await fetch(`${this.apiUrl}/rag/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: 'pull-embeddings',
      userEmail,
      snippetIds // Optional: only sync specific snippets
    })
  });
  
  const result = await response.json();
  const chunks = result.chunks || [];
  
  // Group by snippet_id
  const bySnippet = chunks.reduce((acc, chunk) => {
    if (!acc[chunk.snippet_id]) acc[chunk.snippet_id] = [];
    acc[chunk.snippet_id].push(chunk);
    return acc;
  }, {});
  
  // Save to IndexedDB
  for (const [snippetId, snippetChunks] of Object.entries(bySnippet)) {
    await ragDB.saveChunksWithEmbeddings(snippetChunks, {
      snippet_id: snippetId,
      created_at: Date.now(),
      updated_at: Date.now()
    });
  }
  
  console.log(`✅ Synced ${chunks.length} embedding chunks from Sheets`);
  return chunks.length;
}

/**
 * Full sync on login
 */
async fullSync(userEmail: string): Promise<SyncResult> {
  // Sync snippets (existing)
  await this.bidirectionalSync(userEmail);
  
  // Sync embeddings
  const embeddingCount = await this.pullEmbeddings(userEmail);
  
  return {
    snippetsPushed: 0,
    snippetsPulled: 0,
    embeddingsPushed: 0,
    embeddingsPulled: embeddingCount,
    conflicts: 0,
    errors: []
  };
}
```

---

### Phase 5: Search Implementation

#### 5.1 RAG Search Results Integration with LLM

**Flow**: Search → Format → Inject into Message → Send to LLM

```
User Query
    ↓
┌─────────────────────────────────┐
│ 1. Embed query (cached)         │
│    GET /rag/embed-query         │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 2. Vector search (local)        │
│    - Cosine similarity          │
│    - Top K results (default: 5) │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 3. Format as markdown           │
│    #title                        │
│    ##content                     │
│    (repeat for each result)     │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 4. Append to user message       │
│    Original: "How do I...?"     │
│    Enhanced: "How do I...?"     │
│              ""                  │
│              "[RAG Context]"     │
│              "#Result 1"         │
│              "##Content..."      │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 5. Send to LLM                  │
│    POST /chat                    │
└─────────────────────────────────┘
```

**Implementation**:

```typescript
// File: ui-new/src/contexts/ChatContext.tsx (or similar)

interface RAGSearchResult {
  snippet_id: string;
  chunk_id: string;
  content: string;
  score: number;
  title?: string;
}

async function sendMessageWithRAG(
  message: string, 
  useRAG: boolean = false,
  topK: number = 5
): Promise<void> {
  let enhancedMessage = message;
  
  if (useRAG) {
    // Step 1: Perform vector search
    const searchResults = await vectorSearch(message, topK);
    
    // Step 2: Filter by relevance threshold (optional)
    const relevantResults = searchResults.filter(r => r.score > 0.7);
    
    if (relevantResults.length === 0) {
      showWarning('No relevant context found in your snippets');
    } else {
      // Step 3: Format results as compressed markdown
      const ragContext = formatRAGContext(relevantResults);
      
      // Step 4: Append to message
      enhancedMessage = `${message}\n\n[RAG Context]\n${ragContext}`;
      
      showInfo(`📚 Added ${relevantResults.length} relevant snippets to context`);
    }
  }
  
  // Step 5: Send to Lambda
  const response = await fetch(`${import.meta.env.VITE_LAMBDA_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      messages: [
        ...conversationHistory,
        { role: 'user', content: enhancedMessage }
      ],
      model: selectedModel,
      stream: true
    })
  });
  
  // Handle streaming response...
}

function formatRAGContext(results: RAGSearchResult[]): string {
  // Compressed format: one link per result
  return results.map(result => {
    const title = result.title || 'Untitled';
    const content = result.content.trim();
    
    // Format: #title\n##content
    return `#${title}\n##${content}`;
  }).join('\n\n');
}

// Example formatted output:
// [RAG Context]
// #How to Deploy Lambda
// ##To deploy a Lambda function, first ensure you have AWS CLI configured...
//
// #Lambda Environment Variables
// ##Environment variables in Lambda can be set through the AWS Console...
//
// #Lambda Timeout Settings
// ##The default timeout for Lambda functions is 3 seconds. You can increase...
```

**Chat UI Integration**:

```tsx
// File: ui-new/src/components/ChatInterface.tsx

const [useRAGSearch, setUseRAGSearch] = useState(false);
const [ragResultCount, setRagResultCount] = useState(5);

<div className="chat-input-container">
  <textarea 
    value={message}
    onChange={(e) => setMessage(e.target.value)}
    placeholder="Type your message..."
  />
  
  <div className="chat-options">
    <label className="checkbox-label">
      <input
        type="checkbox"
        checked={useRAGSearch}
        onChange={(e) => setUseRAGSearch(e.target.checked)}
      />
      <span>🔍 Use RAG Context</span>
    </label>
    
    {useRAGSearch && (
      <select 
        value={ragResultCount}
        onChange={(e) => setRagResultCount(parseInt(e.target.value))}
      >
        <option value="3">Top 3 results</option>
        <option value="5">Top 5 results</option>
        <option value="10">Top 10 results</option>
      </select>
    )}
  </div>
  
  <button onClick={() => sendMessageWithRAG(message, useRAGSearch, ragResultCount)}>
    Send
  </button>
</div>
```

**Token Management**:
- Each result adds ~200-500 tokens
- Top 5 results ≈ 1,000-2,500 tokens
- Monitor context window limits
- Option to reduce `topK` if approaching limit

**LLM Behavior**:
- LLM receives enhanced message with context
- Can reference snippet content in response
- User sees original message + "[RAG Context]" marker (optional: hide in UI)
- LLM trained to use context naturally

#### 5.2 Add Search UI Components
**File**: `ui-new/src/components/SwagPage.tsx`

**Add vector search toggle**:

```tsx
const [useVectorSearch, setUseVectorSearch] = useState(false);
const [searchResults, setSearchResults] = useState<ContentSnippet[]>([]);
const [searchQuery, setSearchQuery] = useState('');

// Modified token search (all tokens must be present)
const tokenSearch = (query: string): ContentSnippet[] => {
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  
  return snippets.filter(snippet => {
    const text = `${snippet.title || ''} ${snippet.content}`.toLowerCase();
    // All tokens must be present (order doesn't matter)
    return tokens.every(token => text.includes(token));
  });
};

// Vector search
const performVectorSearch = async (query: string): Promise<ContentSnippet[]> => {
  try {
    const results = await vectorSearch(query, 10);
    
    // Get full snippets for results
    const snippetMap = new Map(snippets.map(s => [s.id, s]));
    const enrichedResults = results
      .map(r => snippetMap.get(r.snippet_id))
      .filter(s => s !== undefined) as ContentSnippet[];
    
    return enrichedResults;
  } catch (error) {
    console.error('Vector search failed:', error);
    showError('Vector search failed. Check that embeddings exist.');
    return [];
  }
};

const handleSearch = async (query: string) => {
  setSearchQuery(query);
  
  if (!query.trim()) {
    setSearchResults([]);
    return;
  }
  
  if (useVectorSearch) {
    const results = await performVectorSearch(query);
    setSearchResults(results);
    showInfo(`🔍 Found ${results.length} results using vector search`);
  } else {
    const results = tokenSearch(query);
    setSearchResults(results);
  }
};

// UI
<div className="search-container mb-4">
  <div className="flex gap-2 items-center">
    <input
      type="text"
      placeholder="Search snippets..."
      value={searchQuery}
      onChange={(e) => handleSearch(e.target.value)}
      className="flex-1 px-4 py-2 border rounded"
    />
    
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={useVectorSearch}
        onChange={(e) => setUseVectorSearch(e.target.checked)}
        className="w-4 h-4"
      />
      <span className="text-sm">Vector Search</span>
    </label>
  </div>
  
  {searchQuery && (
    <div className="text-sm text-gray-600 mt-2">
      {useVectorSearch 
        ? `Semantic search: ${searchResults.length} results`
        : `Keyword search (all words): ${searchResults.length} results`
      }
    </div>
  )}
</div>

{/* Display search results or all snippets */}
{(searchQuery ? searchResults : snippets).map(snippet => (
  <SnippetCard key={snippet.id} snippet={snippet} />
))}
```

---

### Phase 6: Sync Progress Toasts

#### 6.1 Toast Integration
**File**: `ui-new/src/services/ragSyncService.ts`

Add toast notifications for all sync operations:

```typescript
import { toast } from 'react-toastify'; // or your toast library

class RAGSyncService {
  // ... existing code ...
  
  /**
   * Pull embeddings from Google Sheets with progress
   */
  async pullEmbeddings(userEmail: string, snippetIds?: string[]): Promise<number> {
    const toastId = toast.loading('📥 Syncing embeddings from Google Sheets...');
    
    try {
      const response = await fetch(`${this.apiUrl}/rag/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'pull-embeddings',
          userEmail,
          snippetIds
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to pull embeddings');
      }
      
      const result = await response.json();
      const chunks = result.chunks || [];
      
      // Update toast with progress
      toast.update(toastId, {
        render: `💾 Saving ${chunks.length} chunks to browser...`,
        type: 'info',
        isLoading: true
      });
      
      // Group by snippet_id
      const bySnippet = chunks.reduce((acc, chunk) => {
        if (!acc[chunk.snippet_id]) acc[chunk.snippet_id] = [];
        acc[chunk.snippet_id].push(chunk);
        return acc;
      }, {});
      
      // Save to IndexedDB
      let saved = 0;
      for (const [snippetId, snippetChunks] of Object.entries(bySnippet)) {
        await ragDB.saveChunksWithEmbeddings(snippetChunks, {
          snippet_id: snippetId,
          created_at: Date.now(),
          updated_at: Date.now()
        });
        saved++;
        
        // Update progress
        toast.update(toastId, {
          render: `💾 Saved ${saved}/${Object.keys(bySnippet).length} snippets...`,
        });
      }
      
      // Success
      toast.update(toastId, {
        render: `✅ Synced ${chunks.length} embedding chunks`,
        type: 'success',
        isLoading: false,
        autoClose: 3000
      });
      
      return chunks.length;
      
    } catch (error) {
      toast.update(toastId, {
        render: `❌ Sync failed: ${error.message}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
      throw error;
    }
  }
  
  /**
   * Push embeddings to Google Sheets with progress callback
   */
  async pushEmbeddings(
    chunks: EmbeddingChunk[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    try {
      // Batch upload (100 chunks at a time to stay under API limits)
      const batchSize = 100;
      const batches = Math.ceil(chunks.length / batchSize);
      
      for (let i = 0; i < batches; i++) {
        const batch = chunks.slice(i * batchSize, (i + 1) * batchSize);
        
        // Call progress callback
        if (onProgress) {
          onProgress((i + 1) * batchSize, chunks.length);
        }
        
        await fetch(`${this.apiUrl}/rag/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'push-embeddings',
            chunks: batch,
            userEmail: this.userEmail
          })
        });
      }
      
    } catch (error) {
      console.error('Failed to push embeddings:', error);
      throw error;
    }
  }
  
  /**
   * Full sync on login with detailed progress
   */
  async fullSync(userEmail: string): Promise<SyncResult> {
    const toastId = toast.loading('🔄 Starting full sync...');
    
    try {
      // Step 1: Sync snippets
      toast.update(toastId, {
        render: '📝 Syncing snippets...',
      });
      
      await this.bidirectionalSync(userEmail);
      
      // Step 2: Sync embeddings
      toast.update(toastId, {
        render: '🧬 Syncing embeddings...',
      });
      
      const embeddingCount = await this.pullEmbeddings(userEmail);
      
      // Success
      toast.update(toastId, {
        render: `✅ Sync complete! ${embeddingCount} embeddings loaded`,
        type: 'success',
        isLoading: false,
        autoClose: 3000
      });
      
      return {
        snippetsPushed: 0,
        snippetsPulled: 0,
        embeddingsPushed: 0,
        embeddingsPulled: embeddingCount,
        conflicts: 0,
        errors: []
      };
      
    } catch (error) {
      toast.update(toastId, {
        render: `❌ Sync failed: ${error.message}`,
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
      throw error;
    }
  }
  
  /**
   * Push embeddings to Google Sheets with progress callback
   */
  async pushEmbeddings(
    chunks: EmbeddingChunk[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    try {
      // Batch upload (100 chunks at a time to stay under API limits)
      const batchSize = 100;
      const batches = Math.ceil(chunks.length / batchSize);
      
      for (let i = 0; i < batches; i++) {
        const batch = chunks.slice(i * batchSize, (i + 1) * batchSize);
        
        // Call progress callback
        if (onProgress) {
          onProgress((i + 1) * batchSize, chunks.length);
        }
        
        await fetch(`${this.apiUrl}/rag/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'push-embeddings',
            chunks: batch,
            userEmail: this.userEmail
          })
        });
      }
      
    } catch (error) {
      console.error('Failed to push embeddings:', error);
      throw error;
    }
  }
}
```

#### 6.2 Toast Examples

**Login Sync**:
```
🔄 Starting full sync...
   ↓
📝 Syncing snippets...
   ↓
🧬 Syncing embeddings...
   ↓
💾 Saving 150 chunks to browser...
   ↓
💾 Saved 5/30 snippets...
   ↓
💾 Saved 30/30 snippets...
   ↓
✅ Sync complete! 150 embeddings loaded
```

**Embedding Generation** (Client handles all storage):
```
🧬 Generating embeddings for 5 snippets...
   ↓ (backend processes)
💾 Saving 5 snippet embeddings to browser...
   ↓ (save to IndexedDB)
☁️ Syncing to Google Sheets: 5/25 chunks...
   ↓
☁️ Syncing to Google Sheets: 25/25 chunks...
   ↓
✅ Generated 25 embeddings for 5 snippets
```

**Search with RAG**:
```
🔍 Found 8 results using vector search
   ↓
📚 Added 5 relevant snippets to context
```

---

### Phase 7: Environment Configuration

#### 6.1 Update .env
```bash
# RAG Spreadsheet (same as logging or separate)
GOOGLE_SHEETS_SPREADSHEET_ID=1i0wNrPjMh21-1TIsAUZbYwV_c30A4-g39m4rJ-zr9Fw

# Google Sheets credentials (existing)
GOOGLE_SHEETS_CREDENTIALS=...

# OpenAI for embeddings (existing)
OPENAI_API_KEY=...
```

#### 6.2 Update Documentation
- Remove references to libSQL
- Document browser-first architecture
- Add troubleshooting for IndexedDB quota issues

---

## Migration Path

### For Existing Users

1. **Backup existing data** (if any in /tmp/rag.db)
2. **Run sync** - Pull snippets from Google Sheets
3. **Re-embed all snippets** - Use "Force Re-embed" bulk operation
4. **Verify** - Check IndexedDB and Google Sheets have embeddings

### Migration Script
```javascript
// scripts/migrate-to-browser-storage.js
async function migrateExistingEmbeddings() {
  // 1. Export from libSQL (if exists)
  // 2. Push to Google Sheets
  // 3. Trigger client sync
  // 4. Verify integrity
}
```

---

## Summary

### Key Principles
1. **Browser-First**: IndexedDB is the primary storage
2. **Google Sheets Backup**: Per-user spreadsheets in their Drive
3. **Lambda is Stateless**: No persistent storage, only services
4. **User Data Ownership**: Each user's data stays in their account
5. **Client Handles Storage**: UI receives data, saves to IndexedDB + Sheets
6. **Progress Transparency**: Toasts show all sync operations
7. **Offline-First**: Works without network (read/search)

### Data Flow (Embedding Generation)
```
User clicks "Generate Embeddings"
    ↓
UI → Backend: POST /rag/embed-snippets { snippetIds }
    ↓
Backend: Generates chunks + embeddings
    ↓
Backend → UI: JSON response { results: [{ id, chunks: [...] }] }
    ↓
UI: Saves chunks to IndexedDB
    ↓
UI → Backend: POST /rag/sync { chunks } (to save to Google Sheets)
    ↓
Backend: Writes to user's "Research Agent Swag" spreadsheet
    ↓
UI: Shows success toast
```

**Why this flow?**
- ✅ Embeddings too large for SSE (50-100KB per snippet)
- ✅ Client controls all storage (no server-side state)
- ✅ User pays data cost (transparent)
- ✅ Progress toasts at each step
- ✅ Backend is pure compute service

### Benefits
- ✅ No data loss from Lambda timeouts
- ✅ Fast local search (no network latency)
- ✅ User owns and controls their data
- ✅ Scales per-user (not per-server)
- ✅ Works offline for reading/searching
- ✅ Google Sheets = free backup + manual access
- ✅ Client handles all storage decisions
- ✅ Backend doesn't need persistent storage

### Trade-offs
- ⚠️ Initial sync slower (pull from Sheets)
- ⚠️ Browser storage limits (~1GB typical, ~50K snippets)
- ⚠️ Network cost for sync (user pays data)
- ⚠️ More complex client code
- ⚠️ Larger HTTP responses (but still manageable with gzip)

---

## Migration Path

### Unit Tests
- [ ] IndexedDB storage/retrieval
- [ ] Cosine similarity calculation
- [ ] Google Sheets serialization/deserialization
- [ ] Vector search accuracy

### Integration Tests
- [ ] Full embed → save → sync flow
- [ ] Login sync from Google Sheets
- [ ] Search with vector vs token search
- [ ] Multi-browser sync

### Performance Tests
- [ ] IndexedDB with 10,000 chunks
- [ ] Vector search with 1,000 snippets
- [ ] Google Sheets write/read latency
- [ ] Browser memory usage

---

## Rollout Plan

### Phase 1: Foundation (Week 1)
- ✅ Create Google Sheets schema
- ✅ Implement sheets-embedding-storage.js
- ✅ Update endpoint to return embeddings

### Phase 2: Client Storage (Week 2)
- ✅ Enhance ragDB.ts with full embedding support
- ✅ Implement vector search
- ✅ Add search caching

### Phase 3: Sync (Week 3)
- ✅ Bidirectional embedding sync
- ✅ Login sync flow
- ✅ Conflict resolution

### Phase 4: UI (Week 4)
- ✅ Vector search toggle
- ✅ Search results display
- ✅ RAG context in chat

### Phase 5: Migration & Testing (Week 5)
- ✅ Migration script
- ✅ End-to-end testing
- ✅ Documentation

---

## Known Limitations

### Google Sheets
- **Cell limit**: 10 million cells per spreadsheet
  - 1 snippet = ~5 chunks average
  - 1 chunk = 10 cells (including metadata)
  - Max ~200,000 chunks (~40,000 snippets)
- **API quotas**: 300 read requests per minute
- **Cell size**: 50,000 characters (enough for embedding JSON)

### IndexedDB
- **Storage quota**: ~50-100 MB on mobile, unlimited on desktop
- **Chunk overhead**: ~15 KB per chunk with embedding
- **Estimated capacity**: ~3,000-6,000 chunks on mobile

### Solutions
- Implement compression for embeddings (Float32Array → base64)
- Use pagination for Google Sheets reads
- Monitor quota usage and warn users
- Offer "clean cache" option for old embeddings

---

## Success Metrics

1. **No data loss** on Lambda timeout ✅
2. **Cross-browser sync** works reliably ✅
3. **Search latency** < 100ms for 1,000 chunks ✅
4. **Embedding generation** same speed as before ✅
5. **User experience** seamless and transparent ✅

---

## Next Steps

1. **Immediate**: Add `GOOGLE_SHEETS_SPREADSHEET_ID` to .env
2. **Short-term**: Implement Phase 1 (Google Sheets schema)
3. **Medium-term**: Complete Phase 2-3 (client storage + sync)
4. **Long-term**: Polish UI and optimize performance

---

## Questions & Decisions

1. **Embedding compression**: Use Float32Array or keep JSON?
   - **Decision**: Start with JSON, optimize later if needed

2. **Search cache location**: IndexedDB or Google Sheets?
   - **Decision**: Both - IndexedDB for speed, Sheets for sync

3. **Sync frequency**: On every change or periodic?
   - **Decision**: Debounced (5s delay) + on login/logout

4. **Conflict resolution**: Last-write-wins or version-based?
   - **Decision**: Version-based with user prompt for conflicts

---

**Status**: Plan approved, ready for implementation ✅
