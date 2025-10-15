#!/usr/bin/env node

/**
 * Document Ingestion Script
 * 
 * Ingests documents from a directory into the libSQL vector database.
 * Supports multiple file formats: PDF, DOCX, HTML, TXT, MD, CSV, JSON
 * 
 * Usage:
 *   node scripts/ingest-documents.js <directory> [options]
 * 
 * Options:
 *   --db-path <path>        Path to database file (default: ./rag-kb.db)
 *   --embedding-model <model> Embedding model to use (default: text-embedding-3-small)
 *   --chunk-size <size>     Chunk size in tokens (default: 512)
 *   --chunk-overlap <size>  Chunk overlap in tokens (default: 50)
 *   --batch-size <size>     Embedding batch size (default: 100)
 *   --resume                Resume from last successful document
 *   --force                 Re-ingest documents that already exist
 *   --dry-run               Show what would be ingested without actually doing it
 */

const fs = require('fs').promises;
const path = require('path');
const { createLibsqlClient, initDatabase, saveChunks, getDatabaseStats } = require('../src/rag/libsql-storage');
const { loadFile } = require('../src/rag/file-loaders');
const { chunkText } = require('../src/rag/chunker-langchain');
const { batchGenerateEmbeddings } = require('../src/rag/embeddings');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    directory: null,
    dbPath: process.env.LIBSQL_URL?.replace('file://', '') || './rag-kb.db',
    embeddingModel: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingProvider: process.env.RAG_EMBEDDING_PROVIDER || 'openai',
    chunkSize: 512,
    chunkOverlap: 50,
    batchSize: 100,
    resume: false,
    force: false,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--db-path':
        options.dbPath = args[++i];
        break;
      case '--embedding-model':
        options.embeddingModel = args[++i];
        break;
      case '--embedding-provider':
        options.embeddingProvider = args[++i];
        break;
      case '--chunk-size':
        options.chunkSize = parseInt(args[++i]);
        break;
      case '--chunk-overlap':
        options.chunkOverlap = parseInt(args[++i]);
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i]);
        break;
      case '--resume':
        options.resume = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log('Usage: node scripts/ingest-documents.js <directory> [options]');
        console.log('\nOptions:');
        console.log('  --db-path <path>              Path to database file (default: from LIBSQL_URL or ./rag-kb.db)');
        console.log('  --embedding-model <model>     Embedding model (default: from RAG_EMBEDDING_MODEL or text-embedding-3-small)');
        console.log('  --embedding-provider <name>   Provider (default: from RAG_EMBEDDING_PROVIDER or openai)');
        console.log('  --chunk-size <size>           Chunk size in tokens (default: 512)');
        console.log('  --chunk-overlap <size>     Chunk overlap in tokens (default: 50)');
        console.log('  --batch-size <size>        Embedding batch size (default: 100)');
        console.log('  --resume                   Resume from last successful document');
        console.log('  --force                    Re-ingest documents that already exist');
        console.log('  --dry-run                  Show what would be ingested without actually doing it');
        process.exit(0);
        break;
      default:
        if (!arg.startsWith('--')) {
          options.directory = arg;
        }
    }
  }

  if (!options.directory) {
    console.error('Error: Directory path is required');
    console.error('Usage: node scripts/ingest-documents.js <directory> [options]');
    process.exit(1);
  }

  return options;
}

// Recursively find all files in directory
async function findFiles(dir, extensions = ['.pdf', '.docx', '.html', '.txt', '.md', '.csv', '.json']) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...await findFiles(fullPath, extensions));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

// Check if document already exists in database
async function documentExists(client, filePath) {
  try {
    const result = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM chunks WHERE source_file_path = ?',
      args: [filePath]
    });
    return result.rows[0].count > 0;
  } catch (error) {
    return false;
  }
}

// Load resume state from file
async function loadResumeState(stateFile) {
  try {
    const data = await fs.readFile(stateFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { lastProcessedFile: null, processedFiles: [] };
  }
}

// Save resume state to file
async function saveResumeState(stateFile, state) {
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

// Process a single document
async function processDocument(filePath, options, client) {
  console.log(`\nProcessing: ${filePath}`);

  try {
    // Load file content
    console.log('  Loading file...');
    const { text: content, metadata } = await loadFile(filePath);
    
    if (!content || content.trim().length === 0) {
      console.log('  ⚠️  Skipped: Empty content');
      return { success: false, reason: 'empty' };
    }

    // Create snippet ID from file path
    const snippetId = `file:${path.relative(options.directory, filePath)}`;
    const snippetName = path.basename(filePath);

    // Chunk the text
    console.log('  Chunking text...');
    const chunks = await chunkText(content, {
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
      method: 'langchain'
    });

    console.log(`  Created ${chunks.length} chunks`);

    if (options.dryRun) {
      console.log('  ✓ Would ingest (dry run)');
      return { success: true, chunks: chunks.length, dryRun: true };
    }

    // Generate embeddings in batches
    console.log(`  Generating embeddings (${options.embeddingModel})...`);
    const chunkTexts = chunks.map(chunk => chunk.chunk_text || chunk.text);
    
    // Get API key from environment
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    const embeddingResults = await batchGenerateEmbeddings(
      chunkTexts,
      options.embeddingModel,
      options.embeddingProvider,
      apiKey,
      {
        batchSize: options.batchSize,
        onProgress: (progress) => {
          console.log(`  Progress: ${progress.completed}/${progress.total} chunks embedded (batch ${progress.batch}/${progress.totalBatches})`);
        }
      }
    );
    
    const allEmbeddings = embeddingResults.map(result => result.embedding);

    // Prepare chunks for storage
    const chunksWithEmbeddings = chunks.map((chunk, index) => ({
      id: `${snippetId}-chunk-${index}`,
      snippet_id: snippetId,
      snippet_name: snippetName,
      chunk_index: index,
      chunk_text: chunk.chunk_text || chunk.text,
      embedding_vector: allEmbeddings[index],
      // Source metadata
      source_type: 'file',
      source_file_path: filePath,
      source_file_name: path.basename(filePath),
      source_mime_type: metadata.mimeType || 'text/plain',
      // Embedding metadata
      embedding_model: options.embeddingModel,
      embedding_provider: options.embeddingProvider,
      embedding_dimensions: allEmbeddings[index]?.length || 1536,
      token_count: chunk.token_count || chunk.tokens,
      char_count: chunk.char_count || (chunk.chunk_text || chunk.text).length
    }));

    // Save to database
    console.log('  Saving to database...');
    await saveChunks(client, chunksWithEmbeddings);

    console.log('  ✓ Successfully ingested');
    return { success: true, chunks: chunks.length };

  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// Main ingestion function
async function ingestDocuments() {
  const options = parseArgs();
  
  console.log('Document Ingestion Script');
  console.log('=========================\n');
  console.log('Configuration:');
  console.log(`  Directory:          ${options.directory}`);
  console.log(`  Database:           ${options.dbPath}`);
  console.log(`  Embedding Provider: ${options.embeddingProvider}`);
  console.log(`  Embedding Model:    ${options.embeddingModel}`);
  console.log(`  Chunk Size:         ${options.chunkSize} tokens`);
  console.log(`  Chunk Overlap:   ${options.chunkOverlap} tokens`);
  console.log(`  Batch Size:      ${options.batchSize} embeddings`);
  console.log(`  Resume:          ${options.resume ? 'Yes' : 'No'}`);
  console.log(`  Force:           ${options.force ? 'Yes' : 'No'}`);
  console.log(`  Dry Run:         ${options.dryRun ? 'Yes' : 'No'}`);

  try {
    // Check if directory exists
    const stats = await fs.stat(options.directory);
    if (!stats.isDirectory()) {
      console.error(`\nError: ${options.directory} is not a directory`);
      process.exit(1);
    }

    // Find all files
    console.log('\nScanning directory...');
    const files = await findFiles(options.directory);
    console.log(`Found ${files.length} documents`);

    if (files.length === 0) {
      console.log('\nNo documents found to ingest');
      return;
    }

    // Initialize database
    console.log('\nInitializing database...');
    const client = createLibsqlClient({ url: `file://${path.resolve(options.dbPath)}` });
    await initDatabase(client);

    // Load resume state if needed
    const stateFile = `${options.dbPath}.state.json`;
    let resumeState = { lastProcessedFile: null, processedFiles: [] };
    
    if (options.resume) {
      resumeState = await loadResumeState(stateFile);
      console.log(`Resuming from: ${resumeState.lastProcessedFile || 'beginning'}`);
    }

    // Process each file
    console.log('\nProcessing documents...');
    const startTime = Date.now();
    const results = {
      total: files.length,
      success: 0,
      skipped: 0,
      failed: 0,
      chunks: 0
    };

    let skipUntilResume = options.resume && resumeState.lastProcessedFile;

    for (const filePath of files) {
      // Skip if resuming and haven't reached last processed file
      if (skipUntilResume) {
        if (filePath === resumeState.lastProcessedFile) {
          skipUntilResume = false;
        }
        console.log(`Skipping (resume): ${filePath}`);
        results.skipped++;
        continue;
      }

      // Check if already exists
      if (!options.force && await documentExists(client, filePath)) {
        console.log(`Skipping (exists): ${filePath}`);
        results.skipped++;
        continue;
      }

      // Process document
      const result = await processDocument(filePath, options, client);
      
      if (result.success) {
        results.success++;
        if (!result.dryRun) {
          results.chunks += result.chunks;
          // Update resume state
          resumeState.lastProcessedFile = filePath;
          resumeState.processedFiles.push(filePath);
          await saveResumeState(stateFile, resumeState);
        }
      } else {
        if (result.reason === 'empty') {
          results.skipped++;
        } else {
          results.failed++;
        }
      }
    }

    // Calculate stats
    const duration = (Date.now() - startTime) / 1000;
    console.log('\n=========================');
    console.log('Ingestion Complete');
    console.log('=========================');
    console.log(`Total documents:    ${results.total}`);
    console.log(`Successfully ingested: ${results.success}`);
    console.log(`Skipped:            ${results.skipped}`);
    console.log(`Failed:             ${results.failed}`);
    if (!options.dryRun) {
      console.log(`Total chunks:       ${results.chunks}`);
    }
    console.log(`Duration:           ${duration.toFixed(2)}s`);

    if (!options.dryRun) {
      // Get database stats
      console.log('\nDatabase Statistics:');
      const dbStats = await getDatabaseStats(client);
      console.log(`  Total chunks:     ${dbStats.totalChunks}`);
      console.log(`  With embeddings:  ${dbStats.chunksWithEmbeddings}`);
      console.log(`  Avg chunk size:   ${dbStats.avgChunkSize} chars`);
      console.log(`  Storage estimate: ${(dbStats.totalChunks * 6.7 / 1024).toFixed(2)} MB`);
    }

    // Clean up resume state if fully complete
    if (results.failed === 0 && !options.dryRun) {
      await fs.unlink(stateFile).catch(() => {});
    }

  } catch (error) {
    console.error('\nFatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  ingestDocuments().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { ingestDocuments, findFiles, processDocument };
