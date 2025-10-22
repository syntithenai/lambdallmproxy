# Auto-Embed Workflow for SWAG Snippets

## Overview
The system now automatically embeds snippet content into the RAG (Retrieval-Augmented Generation) knowledge base when snippets are created or updated, if the auto-embed setting is enabled.

## Workflow

### 1. Document Upload → Snippet Creation → Auto-Embed

```
User uploads file/URL
    ↓
Content converted to markdown snippet
    ↓
Snippet saved to SWAG
    ↓
[If auto-embed enabled]
    ↓
Content sent to /rag/ingest
    ↓
Embeddings generated & stored
    ↓
Snippet marked as hasEmbedding: true
```

### 2. Snippet Edit → Re-Embed (if content changed)

```
User edits snippet content
    ↓
updateSnippet() called with new content
    ↓
Check if content changed
    ↓
[If changed AND auto-embed enabled]
    ↓
Old embeddings replaced with new
    ↓
Snippet marked as hasEmbedding: true
```

## Configuration

### Enabling Auto-Embed

1. Go to **Settings** → **RAG Settings**
2. Enable **RAG System** (toggle on)
3. Enable **Auto-Embed Snippets** (toggle on)
4. Click **Save Configuration**

### Settings Stored

```typescript
interface RAGConfig {
  enabled: boolean;          // RAG system on/off
  autoEmbed: boolean;        // Auto-generate embeddings
  embeddingModel: string;    // e.g., 'text-embedding-3-small'
  embeddingProvider: string; // e.g., 'openai'
  chunkSize: number;         // Default: 1000
  chunkOverlap: number;      // Default: 200
  // ... other settings
}
```

Stored in: `localStorage.getItem('rag_config')`

## Implementation Details

### SwagContext.tsx

#### New Helper Functions

**isAutoEmbedEnabled()**
```typescript
const isAutoEmbedEnabled = (): boolean => {
  const ragConfig = JSON.parse(localStorage.getItem('rag_config'));
  return ragConfig.enabled && ragConfig.autoEmbed;
};
```

**autoEmbedSnippet(snippetId, content, title)**
```typescript
const autoEmbedSnippet = async (snippetId: string, content: string, title?: string) => {
  if (!isAutoEmbedEnabled()) return;
  
  // POST to /rag/ingest with snippetId for linking
  await fetch('/rag/ingest', {
    method: 'POST',
    body: JSON.stringify({
      content,
      sourceType: 'snippet',
      title: title || `Snippet ${snippetId}`,
      snippetId, // Links embedding to snippet
    }),
  });
  
  // Mark snippet as having embedding
  setSnippets(prev => prev.map(snippet =>
    snippet.id === snippetId ? { ...snippet, hasEmbedding: true } : snippet
  ));
};
```

#### Modified Functions

**addSnippet()** - Now async
```typescript
const addSnippet = async (content: string, sourceType: ContentSnippet['sourceType'], title?: string) => {
  // ... create snippet ...
  setSnippets(prev => [newSnippet, ...prev]);
  
  // Auto-embed if enabled
  await autoEmbedSnippet(newSnippet.id, content, title);
};
```

**updateSnippet()** - Now async
```typescript
const updateSnippet = async (id: string, updates: Partial<ContentSnippet>) => {
  const oldSnippet = snippets.find(s => s.id === id);
  
  setSnippets(prev => prev.map(snippet => 
    snippet.id === id ? { ...snippet, ...updates, updateDate: Date.now() } : snippet
  ));
  
  // If content changed, re-embed
  if (oldSnippet && updates.content && updates.content !== oldSnippet.content) {
    const newTitle = updates.title !== undefined ? updates.title : oldSnippet.title;
    await autoEmbedSnippet(id, updates.content, newTitle);
  }
};
```

### SwagPage.tsx

#### Upload Handler

**handleUploadDocuments()**
```typescript
const handleUploadDocuments = async (files: File[], urls: string[]) => {
  // Process files
  for (const file of files) {
    const content = await file.text();
    
    // Add as snippet (auto-embeds if enabled)
    await addSnippet(content, 'user', file.name);
  }
  
  // Process URLs
  for (const url of urls) {
    const response = await fetch(url);
    const content = await response.text();
    
    // Add as snippet (auto-embeds if enabled)
    await addSnippet(content, 'user', url);
  }
  
  showSuccess(`Successfully added ${files.length} file(s) and ${urls.length} URL(s) as snippets`);
};
```

### Other Components Updated

All components that call `addSnippet()` or `updateSnippet()` now use `await`:

- **ChatTab.tsx**: Image grabbing, content capture
- **MermaidChart.tsx**: Chart saving
- **SwagPage.tsx**: Snippet editing, tag operations

## Backend Integration

### /rag/ingest Endpoint

**Request Body:**
```json
{
  "content": "markdown content",
  "sourceType": "snippet",
  "title": "Snippet Title",
  "snippetId": "snippet-123456789"  // NEW: Links to snippet
}
```

**Processing:**
1. Chunk content (respecting chunkSize/chunkOverlap)
2. Generate embeddings for each chunk
3. Store in libSQL vector database
4. Link chunks to snippetId for future updates

**Response:** SSE stream with progress
```
data: {"message": "Processing document..."}
data: {"message": "Generated 15 chunks"}
data: {"message": "Generating embeddings..."}
data: {"message": "Stored 15 chunks"}
data: {"complete": true, "chunks": 15}
```

### Database Schema Updates

**Chunks Table:**
```sql
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  content TEXT,
  embedding BLOB,
  snippet_id TEXT,      -- NEW: Link to snippet
  document_id TEXT,
  chunk_index INTEGER,
  -- ... other fields
);

CREATE INDEX IF NOT EXISTS idx_chunks_snippet ON chunks(snippet_id);
```

## User Experience

### Upload Flow

1. **Click "Upload Documents"** button in SWAG page header
2. **Select file** (.txt, .md, .pdf, etc.) or enter URL
3. **Upload** creates snippet immediately (visible in list)
4. **Background**: Embeddings generated if auto-embed enabled
5. **Icon indicator**: Snippet shows embedding status

### Visual Indicators

- **hasEmbedding: true** → Show embedding icon/badge on snippet
- **hasEmbedding: false** → No indicator (can manually generate later)

### Manual Embedding

If auto-embed is disabled, users can still:
1. Select snippets in SWAG page
2. Click **"Generate Embeddings"** in bulk actions
3. Embeddings created on-demand

## Benefits

### ✅ Advantages

1. **Seamless Integration**: No extra step to add to knowledge base
2. **Always Synced**: Snippets and embeddings stay in sync
3. **Smart Updates**: Only re-embeds when content changes
4. **Flexible**: Can disable auto-embed for manual control
5. **Duplicate Prevention**: Checks if embeddings already exist

### 🎯 Use Cases

- **Knowledge Base Building**: Upload research docs, automatically searchable
- **Chat History**: Capture assistant responses, auto-embed for later retrieval
- **Tool Results**: Save tool outputs, make them searchable
- **Document Analysis**: Upload docs for RAG-powered chat

## Performance Considerations

### Optimization Strategies

1. **Debouncing**: Don't re-embed on every keystroke
   - Only embed on explicit save
   - Check if content actually changed

2. **Background Processing**: Embeddings generated async
   - UI doesn't block waiting for embeddings
   - User can continue working immediately

3. **Caching**: Check hasEmbedding flag
   - Skip embedding if already exists and content unchanged
   - Reduces API calls and costs

4. **Batch Processing**: When bulk uploading
   - Process files sequentially
   - Show progress indicator

## Cost Management

### Embedding Costs

**OpenAI text-embedding-3-small**: $0.02 per 1M tokens

**Example:**
- 1000-word document ≈ 1,333 tokens
- Cost: ~$0.000027 per document
- 1,000 documents: ~$0.027

### Cost Control

1. **Disable Auto-Embed**: Manual control when needed
2. **Content Deduplication**: Don't embed identical content twice
3. **Choose Cheaper Models**: Together.ai models cost less
4. **Chunk Wisely**: Smaller chunks = fewer embeddings

## Troubleshooting

### Embeddings Not Generating

**Check:**
1. Is RAG system enabled? (Settings → RAG Settings)
2. Is Auto-Embed enabled?
3. Is there an API key configured? (OpenAI, etc.)
4. Check browser console for errors
5. Check backend logs for /rag/ingest errors

### Content Not Searchable

**Verify:**
1. hasEmbedding flag is true on snippet
2. Embeddings actually stored in database (check rag-kb.db)
3. Search threshold not too high (try 0.3 instead of 0.7)
4. Query and content use similar language

### Performance Issues

**If slow:**
1. Disable auto-embed temporarily
2. Use bulk embedding instead (select + generate embeddings)
3. Reduce chunk size (fewer chunks = faster)
4. Use faster embedding model (3-small vs 3-large)

## Future Enhancements

### Planned Features

- [ ] Show embedding progress in snippet card
- [ ] Bulk re-embed option (refresh all embeddings)
- [ ] Embedding quality metrics
- [ ] Search-as-you-type in SWAG using embeddings
- [ ] Auto-tag based on semantic similarity
- [ ] Snippet recommendations based on content
- [ ] Export snippets with embeddings
- [ ] Import embeddings from other sources

## Testing Checklist

### Upload Workflow
- [ ] Upload .txt file creates snippet
- [ ] Upload .md file creates snippet
- [ ] URL upload fetches and creates snippet
- [ ] Multiple files uploaded sequentially
- [ ] Progress indicator shows during upload
- [ ] Success message appears on completion

### Auto-Embed
- [ ] Snippet created with auto-embed ON generates embeddings
- [ ] Snippet created with auto-embed OFF doesn't generate embeddings
- [ ] hasEmbedding flag set correctly
- [ ] Editing snippet content re-generates embeddings
- [ ] Editing other fields (title, tags) doesn't re-embed

### Manual Embed
- [ ] "Generate Embeddings" in bulk actions works
- [ ] Progress indicator shows during generation
- [ ] Duplicate check skips already-embedded snippets
- [ ] Error handling shows clear messages

### RAG Integration
- [ ] Embedded snippets appear in knowledge base search
- [ ] Search results include snippet content
- [ ] Relevance scoring works correctly
- [ ] Chat can retrieve embedded snippets

## Configuration Examples

### Maximum Automation
```json
{
  "enabled": true,
  "autoEmbed": true,
  "embeddingModel": "text-embedding-3-small",
  "embeddingProvider": "openai",
  "chunkSize": 1000,
  "chunkOverlap": 200
}
```

### Manual Control
```json
{
  "enabled": true,
  "autoEmbed": false,  // Manually generate embeddings when needed
  "embeddingModel": "text-embedding-3-small",
  "embeddingProvider": "openai"
}
```

### Cost-Optimized
```json
{
  "enabled": true,
  "autoEmbed": true,
  "embeddingModel": "m2-bert-80M-8k-retrieval",  // Cheaper
  "embeddingProvider": "together",
  "chunkSize": 2000,  // Larger chunks = fewer embeddings
  "chunkOverlap": 100
}
```
