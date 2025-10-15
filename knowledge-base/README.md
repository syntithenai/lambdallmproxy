# Knowledge Base

This directory contains documents that will be ingested into the RAG system's vector database.

## Directory Structure

- `llm/` - LLM provider documentation (OpenAI, Anthropic, etc.)
- `frameworks/` - Framework documentation (LangChain, React, etc.)
- `languages/` - Programming language references (JavaScript, Python, etc.)
- `project/` - Project-specific documentation

## Supported File Formats

- PDF (.pdf)
- Word Documents (.docx)
- HTML (.html)
- Text files (.txt)
- Markdown (.md)
- CSV (.csv)
- JSON (.json)

## Ingestion

To ingest documents into the database:

```bash
node scripts/ingest-documents.js ./knowledge-base
```

Options:
- `--db-path <path>` - Database file path (default: ./rag-kb.db)
- `--embedding-model <model>` - Embedding model (default: text-embedding-3-small)
- `--chunk-size <size>` - Chunk size in tokens (default: 512)
- `--batch-size <size>` - Embedding batch size (default: 100)
- `--resume` - Resume from last successful document
- `--force` - Re-ingest existing documents
- `--dry-run` - Show what would be ingested

## Adding New Documents

1. Place documents in the appropriate subdirectory
2. Run the ingestion script
3. Test searches to verify documents are accessible
