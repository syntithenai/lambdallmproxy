# RAG (Retrieval-Augmented Generation) Guide

## What is RAG?

Retrieval-Augmented Generation (RAG) is a technique that enhances Large Language Models (LLMs) by providing them with relevant information retrieved from a knowledge base before generating responses.

## Why Use RAG?

### Benefits

1. **Up-to-date Information**: Access current data beyond the model's training cutoff
2. **Domain-Specific Knowledge**: Incorporate specialized information not in training data
3. **Reduced Hallucinations**: Ground responses in factual retrieved documents
4. **Explainability**: Cite sources for generated content
5. **Cost-Effective**: Cheaper than fine-tuning for many use cases
6. **Dynamic Updates**: Update knowledge without retraining the model

### Use Cases

- Customer support with product documentation
- Research assistants with scientific papers
- Code assistants with API documentation
- Legal analysis with case law databases
- Medical information systems with clinical guidelines

## RAG Architecture

### Components

1. **Document Ingestion Pipeline**
   - Load documents from various sources
   - Split into manageable chunks
   - Generate embeddings for each chunk
   - Store in vector database

2. **Vector Database**
   - Stores document embeddings
   - Enables fast similarity search
   - Common options: Pinecone, Weaviate, Chroma, libSQL

3. **Retrieval System**
   - Convert user query to embedding
   - Search vector database for similar chunks
   - Rank results by relevance
   - Return top-K most relevant documents

4. **Generation System**
   - Combine retrieved documents with user query
   - Send to LLM with appropriate prompt
   - Generate contextual response
   - Include citations to sources

## Implementation Steps

### 1. Document Processing

```javascript
// Load document
const document = await loadFile('path/to/document.pdf');

// Split into chunks
const chunks = await chunkText(document.content, {
  chunkSize: 512,
  chunkOverlap: 50
});

// Generate embeddings
const embeddings = await generateEmbeddings(
  chunks.map(c => c.text),
  { model: 'text-embedding-3-small' }
);

// Store in database
await saveChunks(db, chunks.map((chunk, i) => ({
  ...chunk,
  embedding: embeddings[i]
})));
```

### 2. Retrieval

```javascript
// Convert query to embedding
const queryEmbedding = await generateEmbedding(userQuery);

// Search vector database
const results = await searchChunks(db, queryEmbedding, {
  topK: 5,
  threshold: 0.7
});

// Format context
const context = results
  .map(r => `Source: ${r.source}\n${r.text}`)
  .join('\n\n');
```

### 3. Generation

```javascript
const prompt = `Answer the question based on the context below.

Context:
${context}

Question: ${userQuery}

Answer:`;

const response = await llm.complete(prompt);
```

## Chunking Strategies

### Fixed-Size Chunking
- Split text into equal-sized chunks
- Simple but may break semantic units
- Good for uniform documents

### Semantic Chunking
- Split at natural boundaries (paragraphs, sentences)
- Preserves meaning better
- More complex to implement

### Hierarchical Chunking
- Create chunks at multiple levels (document, section, paragraph)
- Better context preservation
- Requires more storage

### Recommended Settings

- **Chunk size**: 512-1024 tokens
- **Overlap**: 10-20% of chunk size
- **Method**: Semantic (RecursiveCharacterTextSplitter)

## Embedding Models

### OpenAI
- **text-embedding-3-small**: 1536 dims, fast, cost-effective
- **text-embedding-3-large**: 3072 dims, higher accuracy

### Open Source
- **all-MiniLM-L6-v2**: 384 dims, fast, good for general use
- **BAAI/bge-large-en**: 1024 dims, high accuracy

### Selection Criteria
- **Speed vs Accuracy**: Smaller models faster but less accurate
- **Cost**: OpenAI charges per token, open source free but requires hosting
- **Language**: Ensure model supports your language
- **Domain**: Some models specialized for code, science, etc.

## Vector Search

### Similarity Metrics

1. **Cosine Similarity** (most common)
   - Measures angle between vectors
   - Range: -1 to 1 (higher is more similar)
   - Good for text embeddings

2. **Euclidean Distance**
   - Measures straight-line distance
   - Lower values indicate more similarity
   - Sensitive to magnitude

3. **Dot Product**
   - Fast to compute
   - Requires normalized vectors
   - Often equivalent to cosine similarity

### Search Parameters

- **topK**: Number of results to return (typically 3-10)
- **threshold**: Minimum similarity score (e.g., 0.7)
- **filters**: Restrict by metadata (date, author, type)

## Prompt Engineering for RAG

### Basic Template

```
You are a helpful assistant. Use the context below to answer the question.
If the answer is not in the context, say "I don't have enough information."

Context:
{retrieved_documents}

Question: {user_question}

Answer:
```

### Advanced Template

```
You are an expert assistant. Answer the question using ONLY the provided context.

Instructions:
- Cite sources using [Source X] notation
- If information is contradictory, acknowledge it
- If context doesn't contain the answer, say so clearly
- Be concise but complete

Context:
{retrieved_documents}

Question: {user_question}

Answer (with citations):
```

## Optimization Techniques

### 1. Hybrid Search
Combine vector search with keyword search (BM25) for better results.

### 2. Reranking
Use a separate model to rerank retrieved results for relevance.

### 3. Query Expansion
Reformulate user query into multiple variations for better recall.

### 4. Metadata Filtering
Pre-filter documents by metadata before vector search.

### 5. Caching
Cache embeddings and frequent queries to reduce latency and costs.

## Evaluation Metrics

### Retrieval Quality
- **Precision@K**: Fraction of top-K results that are relevant
- **Recall@K**: Fraction of relevant documents in top-K
- **MRR (Mean Reciprocal Rank)**: Average position of first relevant result

### Generation Quality
- **Faithfulness**: Does response stay true to retrieved context?
- **Relevance**: Does response answer the question?
- **Completeness**: Are all important points covered?

## Common Pitfalls

1. **Chunk size too large**: Loses precision, irrelevant information included
2. **Chunk size too small**: Loses context, incomplete information
3. **No overlap**: Missing information at chunk boundaries
4. **Too few results**: Insufficient context for LLM
5. **Too many results**: Context window overflow, increased cost
6. **No source tracking**: Can't verify or cite information
7. **Outdated embeddings**: Need to re-embed when model changes

## Production Considerations

### Scalability
- Use managed vector databases for large datasets
- Implement async processing for document ingestion
- Batch embedding generation to reduce API calls
- Cache frequently accessed chunks

### Monitoring
- Track retrieval accuracy over time
- Monitor response quality
- Log failed queries for analysis
- Measure latency at each stage

### Maintenance
- Regular database backups
- Periodic re-indexing
- Update documents as information changes
- Monitor storage costs

## Tools and Libraries

### LangChain
Comprehensive framework for RAG applications with built-in components.

### LlamaIndex
Specialized in data ingestion and indexing for RAG.

### Haystack
Production-ready framework from deepset.

### Custom Implementation
Use vector database client directly for full control.

## Future Directions

- **Multi-modal RAG**: Include images, tables, code
- **Iterative retrieval**: Multiple rounds of retrieval
- **Agentic RAG**: LLM decides when and what to retrieve
- **Fine-tuned retrievers**: Train specialized embedding models
- **Knowledge graphs**: Combine with structured data

## Resources

- Papers: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
- LangChain RAG documentation
- Pinecone RAG guides
- OpenAI cookbook examples
