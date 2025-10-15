# RAG System Documentation

## Overview

The Retrieval-Augmented Generation (RAG) system for LambdaLLMProxy enables semantic search over user snippets using embeddings. It enhances LLM responses with relevant context from the user's saved content.

## Architecture

### Components

1. **Chunking** (`src/rag/chunker.js`)
   - Splits text into manageable chunks
   - Markdown-aware (preserves code blocks)
   - Configurable overlap for context continuity

2. **Embeddings** (`src/rag/embeddings.js`)
   - Generates vector embeddings via multiple providers
   - Supports OpenAI, Cohere, Together AI
   - Batch processing with retry logic
   - Cost tracking

3. **Storage** (`src/rag/indexeddb-storage.js`)
   - Local IndexedDB database for fast access
   - Three object stores: chunks, sync_metadata, embedding_config
   - CRUD operations with efficient Float32Array storage

4. **Search** (`src/rag/search.js`)
   - Cosine similarity-based vector search
   - Diversity filtering (avoid results from same snippet)
   - Recency boosting
   - Clustering and duplicate detection

5. **Integration** (`src/rag/rag-integration.js`)
   - Enhances queries with relevant context
   - Automatic embedding on snippet save
   - System/user message formatting

6. **Google Sheets Sync** (`src/rag/sheets-storage.js`)
   - Cloud backup of embeddings
   - Bidirectional sync (local ↔ cloud)
   - User owns their data

## Data Flow

### Embedding Generation
```
Snippet Text
  ↓
Chunking (1000 chars, 200 overlap)
  ↓
Embedding Generation (OpenAI API)
  ↓
IndexedDB Storage (Float32Array)
  ↓
Google Sheets Backup (optional)
```

### Query Enhancement
```
User Query
  ↓
Generate Query Embedding
  ↓
Vector Similarity Search (cosine)
  ↓
Retrieve Top-K Chunks (default 5)
  ↓
Format Context
  ↓
Enhanced Query with Context
```

## Configuration

### Default Settings
```javascript
{
  enabled: false,              // RAG system enabled
  autoEmbed: false,            // Auto-embed on snippet save
  embeddingModel: 'text-embedding-3-small',
  embeddingProvider: 'openai',
  chunkSize: 1000,            // Characters per chunk
  chunkOverlap: 200,          // Overlap for context
  topK: 5,                    // Results to return
  similarityThreshold: 0.7,   // Min similarity score
  useGoogleSheets: true,      // Enable cloud backup
  sheetsBackupEnabled: true,
}
```

### Embedding Models

| Model | Provider | Dimensions | Cost (per 1M tokens) |
|-------|----------|------------|----------------------|
| text-embedding-3-small | OpenAI | 1536 | $0.02 |
| text-embedding-3-large | OpenAI | 3072 | $0.13 |
| embed-english-v3.0 | Cohere | 1024 | $0.10 |
| m2-bert-80M-8k-retrieval | Together AI | 768 | $0.008 |

## API Usage

### Initialize System
```javascript
const RAG = require('./src/rag');

await RAG.initializeRAG();
```

### Process a Snippet
```javascript
const result = await RAG.processSnippet(
  snippet,
  { openai: 'sk-...' },
  {
    onProgress: ({ completed, total }) => {
      console.log(`${completed}/${total} chunks processed`);
    }
  }
);

console.log(`Cost: ${result.totalCost}`);
console.log(`Chunks: ${result.totalChunks}`);
```

### Search Snippets
```javascript
const results = await RAG.searchSnippets(
  'How do I use the API?',
  { openai: 'sk-...' },
  { topK: 5, threshold: 0.7 }
);

console.log(results.formatted);
```

### Enhance Query with RAG
```javascript
const enhanced = await RAG.enhanceQueryWithRAG(
  'Explain authentication',
  { openai: 'sk-...' }
);

// Send enhanced.enhancedQuery to LLM instead of original query
```

### Auto-Embed on Save
```javascript
const result = await RAG.autoEmbedSnippet(
  snippet,
  { openai: 'sk-...' }
);

if (!result.skipped) {
  console.log(`Embedded ${result.chunks.length} chunks`);
  console.log(`Cost: $${result.cost.toFixed(6)}`);
}
```

### Sync with Google Sheets
```javascript
const { google } = require('googleapis');
const sheets = RAG.sheetsStorage.initSheetsClient(credentials);

const syncResult = await RAG.syncWithGoogleSheets(
  sheets,
  'your-spreadsheet-id'
);

console.log(`Pushed: ${syncResult.pushedToCloud}`);
console.log(`Pulled: ${syncResult.pulledFromCloud}`);
```

## Database Schema

### chunks ObjectStore
```javascript
{
  id: 'uuid',
  snippet_id: 'snippet_uuid',
  snippet_name: 'My Snippet',
  chunk_index: 0,
  chunk_text: 'text content...',
  embedding: Float32Array([...]), // 1536 dimensions
  embedding_model: 'text-embedding-3-small',
  embedding_provider: 'openai',
  embedding_dimensions: 1536,
  token_count: 250,
  created_at: '2025-10-15T...',
  updated_at: '2025-10-15T...',
}
```

### Indexes
- `snippet_id` - Query chunks by snippet
- `created_at` - Sort by creation time
- `embedding_model` - Filter by model

## Cost Estimation

### Example Costs

| Snippets | Avg Length | Chunks | Tokens | Cost (text-embedding-3-small) |
|----------|------------|--------|--------|-------------------------------|
| 10 | 500 chars | 10 | 1,250 | $0.000025 |
| 100 | 500 chars | 100 | 12,500 | $0.00025 |
| 1,000 | 2000 chars | 2,000 | 250,000 | $0.005 |
| 10,000 | 2000 chars | 20,000 | 2,500,000 | $0.05 |

### Estimate Before Processing
```javascript
const cost = RAG.estimateBatchCost(
  snippets,
  'text-embedding-3-small',
  'openai'
);

console.log(`Estimated cost: $${cost.toFixed(4)}`);
```

## Performance

### Vector Search Performance
- **< 1,000 chunks**: ~10-50ms (linear search)
- **1,000-10,000 chunks**: ~50-200ms
- **> 10,000 chunks**: Consider approximate nearest neighbor (ANN)

### Storage Size
- **Per chunk**: ~6-12 KB (embedding + metadata)
- **1,000 chunks**: ~6-12 MB
- **10,000 chunks**: ~60-120 MB

## Best Practices

### Chunking
1. **Use appropriate chunk size**: 1000 chars (≈250 tokens) works well for most content
2. **Add overlap**: 20% overlap (200 chars) prevents context loss
3. **Markdown-aware**: Keep code blocks intact

### Embedding
1. **Batch processing**: Use `batchGenerateEmbeddings` for multiple texts
2. **Cost control**: Estimate cost before processing large datasets
3. **Model consistency**: Don't change models without re-embedding all content

### Search
1. **Similarity threshold**: 0.7 is a good default (0.5-0.9 range)
2. **Top-K**: 5 results usually sufficient (3-10 range)
3. **Diversity**: Enable to avoid multiple results from same snippet

### Sync
1. **Regular backups**: Sync to Google Sheets periodically
2. **Bidirectional sync**: Use `bidirectionalSync()` for smart merging
3. **Rate limits**: Built-in delays to respect API limits

## Troubleshooting

### No Results Found
- Check if snippets have been embedded
- Lower similarity threshold (try 0.5)
- Increase topK value
- Verify query is meaningful (> 10 chars)

### High Costs
- Use smaller chunk size (500 chars)
- Use cheaper model (m2-bert-80M-8k-retrieval)
- Disable auto-embed and embed selectively
- Estimate before processing

### Slow Search
- Check total chunks (use `getDBStats()`)
- Consider cleaning old/unused chunks
- For > 10k chunks, implement ANN (future enhancement)

### Sync Failures
- Check Google API credentials
- Verify spreadsheet permissions
- Check rate limits (100 requests/100 seconds)
- Use smaller batch sizes

## Future Enhancements

### Planned Features
1. **Hybrid search**: Combine vector + keyword (BM25) search
2. **Query expansion**: Generate alternative phrasings
3. **Re-ranking**: Cross-encoder for better relevance
4. **Metadata filtering**: Filter by tags, date, type
5. **ANN search**: For large datasets (>10k chunks)
6. **Semantic caching**: Cache query embeddings
7. **Analytics**: Track most-retrieved snippets

### Extension Ideas
1. **Document parsing**: PDF, HTML, CSV support
2. **Multi-language**: Multilingual embeddings
3. **Image embeddings**: CLIP for image search
4. **Knowledge graph**: Connect related snippets
5. **Auto-tagging**: Generate tags from embeddings

## API Reference

### Core Functions

#### `initializeRAG()`
Initialize the RAG system and database.

#### `processSnippet(snippet, apiKeys, options)`
Complete workflow: chunk → embed → store.

**Parameters:**
- `snippet` - Snippet object with text/content
- `apiKeys` - Object with provider API keys
- `options` - Processing options

**Returns:** `{chunks, totalChunks, totalCost, totalTokens, model, provider}`

#### `searchSnippets(query, apiKeys, options)`
Search for relevant snippets.

**Parameters:**
- `query` - Search query text
- `apiKeys` - Object with provider API keys  
- `options` - Search options (topK, threshold)

**Returns:** `{results, formatted, stats, query, embeddingCost, ragEnabled}`

#### `enhanceQueryWithRAG(query, apiKeys, options)`
Enhance a query with relevant context.

**Parameters:**
- `query` - User query
- `apiKeys` - Object with provider API keys
- `options` - RAG options

**Returns:** `{enhancedQuery, context, stats, tokensUsed, ragEnabled}`

#### `autoEmbedSnippet(snippet, apiKeys)`
Automatically embed a snippet when saved.

**Parameters:**
- `snippet` - Snippet object
- `apiKeys` - Object with provider API keys

**Returns:** `{chunks, cost, tokens, skipped}`

#### `getSystemStatus()`
Get comprehensive RAG system status.

**Returns:** `{enabled, autoEmbed, totalChunks, uniqueSnippets, ...}`

## Examples

### Example 1: Basic Setup
```javascript
const RAG = require('./src/rag');

// Initialize
await RAG.initializeRAG();

// Set configuration
await RAG.storage.setRAGConfig({
  enabled: true,
  autoEmbed: true,
  embeddingModel: 'text-embedding-3-small',
  embeddingProvider: 'openai',
});
```

### Example 2: Manual Embedding
```javascript
const snippet = {
  id: 'abc123',
  name: 'API Documentation',
  text: 'This is how to use our API...',
};

const result = await RAG.processSnippet(
  snippet,
  { openai: process.env.OPENAI_API_KEY },
  {
    onProgress: (progress) => {
      console.log(`Progress: ${progress.completed}/${progress.total}`);
    }
  }
);

console.log(`Generated ${result.totalChunks} chunks`);
console.log(`Cost: $${result.totalCost.toFixed(6)}`);
```

### Example 3: Search and Display
```javascript
const results = await RAG.searchSnippets(
  'How do I authenticate?',
  { openai: process.env.OPENAI_API_KEY }
);

console.log(`Found ${results.results.length} relevant chunks`);
console.log('\n' + results.formatted);
```

### Example 4: Integrated Chat
```javascript
async function enhancedChat(userMessage, apiKeys) {
  // Enhance query with RAG
  const ragResult = await RAG.enhanceQueryWithRAG(
    userMessage,
    apiKeys
  );
  
  // Send to LLM
  const response = await callLLM(ragResult.enhancedQuery);
  
  return {
    response,
    contextUsed: ragResult.context.length,
    ragCost: ragResult.embeddingCost,
  };
}
```

## Support

For issues, feature requests, or questions:
- Check troubleshooting section above
- Review RAG_IMPLEMENTATION_STATUS.md
- Check RAG_IMPLEMENTATION_PLAN.md for roadmap

## License

Same as LambdaLLMProxy project.
