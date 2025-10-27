#!/usr/bin/env node
/**
 * Database Statistics CLI Tool
 * 
 * Displays comprehensive statistics about the RAG knowledge base:
 * - Total chunks and embeddings
 * - Storage size and estimates
 * - Models used for embeddings
 * - Source type breakdown
 * - Recent ingestions
 * 
 * Usage:
 *   node scripts/db-stats.js [--db-path <path>]
 * 
 * Options:
 *   --db-path <path>  Path to database file (default: ./rag-kb.db)
 * 
 * Environment:
 *   LIBSQL_URL        Alternative to --db-path (file:/// format)
 *   LIBSQL_AUTH_TOKEN Optional auth token for remote databases
 */

const path = require('path');
const fs = require('fs');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dbPath: process.env.DB_URL || 'file:///' + path.resolve('./rag-kb.db'),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && args[i + 1]) {
      const dbPath = path.resolve(args[i + 1]);
      options.dbPath = 'file:///' + dbPath;
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Database Statistics Tool

Usage: node scripts/db-stats.js [options]

Options:
  --db-path <path>  Path to database file (default: ./rag-kb.db)
  --help, -h        Show this help message

Environment Variables:
  LIBSQL_URL        Database URL (file:/// or libsql://)
  LIBSQL_AUTH_TOKEN Auth token for remote databases

Examples:
  node scripts/db-stats.js
  node scripts/db-stats.js --db-path ./my-kb.db
  LIBSQL_URL="file:///tmp/rag.db" node scripts/db-stats.js
      `);
      process.exit(0);
    }
  }

  return options;
}

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Main function
async function main() {
  const options = parseArgs();

  console.log('\n' + '='.repeat(60));
  console.log('RAG Knowledge Base Statistics');
  console.log('='.repeat(60));

  try {
    // Import storage module
    const storageModule = require('../src/rag/libsql-storage');
    
    // Create client
    console.log(`\nConnecting to database: ${options.dbPath}`);
    const client = storageModule.createLibsqlClient({
      url: options.dbPath,
      authToken: process.env.DB_TOKEN,
    });

    // Get total chunks
    const totalResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM chunks',
      args: []
    });
    const totalChunks = totalResult.rows[0].count;

    // Get chunks with embeddings
    const embeddedResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM chunks WHERE embedding_vector IS NOT NULL',
      args: []
    });
    const embeddedChunks = embeddedResult.rows[0].count;

    // Get embedding statistics
    const embeddingStatsResult = await client.execute({
      sql: `
        SELECT 
          embedding_model,
          embedding_provider,
          COUNT(*) as count,
          AVG(LENGTH(chunk_text)) as avg_chunk_size
        FROM chunks
        WHERE embedding_vector IS NOT NULL
        GROUP BY embedding_model, embedding_provider
      `,
      args: []
    });

    // Get source type breakdown
    const sourceTypeResult = await client.execute({
      sql: `
        SELECT 
          source_type,
          COUNT(*) as count,
          COUNT(DISTINCT snippet_id) as unique_sources
        FROM chunks
        GROUP BY source_type
        ORDER BY count DESC
      `,
      args: []
    });

    // Get recent ingestions
    const recentResult = await client.execute({
      sql: `
        SELECT 
          snippet_id,
          source_type,
          source_file_name,
          source_url,
          COUNT(*) as chunk_count,
          MIN(created_at) as first_chunk,
          MAX(created_at) as last_chunk
        FROM chunks
        GROUP BY snippet_id
        ORDER BY last_chunk DESC
        LIMIT 10
      `,
      args: []
    });

    // Calculate storage estimates
    const storageResult = await client.execute({
      sql: `
        SELECT 
          SUM(LENGTH(chunk_text)) as text_bytes,
          SUM(LENGTH(embedding_vector)) as embedding_bytes,
          COUNT(*) as total_chunks
        FROM chunks
        WHERE embedding_vector IS NOT NULL
      `,
      args: []
    });

    const storage = storageResult.rows[0];
    const textBytes = Number(storage.text_bytes) || 0;
    const embeddingBytes = Number(storage.embedding_bytes) || 0;
    const totalBytes = textBytes + embeddingBytes;

    // Display statistics
    console.log('\n' + '-'.repeat(60));
    console.log('OVERVIEW');
    console.log('-'.repeat(60));
    console.log(`Total Chunks:         ${totalChunks.toLocaleString()}`);
    console.log(`With Embeddings:      ${embeddedChunks.toLocaleString()} (${Math.round(embeddedChunks / totalChunks * 100)}%)`);
    console.log(`Without Embeddings:   ${(totalChunks - embeddedChunks).toLocaleString()}`);
    
    console.log('\n' + '-'.repeat(60));
    console.log('STORAGE');
    console.log('-'.repeat(60));
    console.log(`Text Content:         ${formatBytes(textBytes)}`);
    console.log(`Embeddings:           ${formatBytes(embeddingBytes)}`);
    console.log(`Total Estimated:      ${formatBytes(totalBytes)}`);
    console.log(`Avg Chunk Size:       ${Math.round(textBytes / embeddedChunks)} chars`);

    if (embeddingStatsResult.rows.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('EMBEDDING MODELS');
      console.log('-'.repeat(60));
      embeddingStatsResult.rows.forEach(row => {
        const provider = row.embedding_provider || 'unknown';
        const model = row.embedding_model || 'unknown';
        const count = row.count;
        const avgSize = Math.round(row.avg_chunk_size);
        console.log(`  ${provider}/${model}`);
        console.log(`    Chunks: ${count.toLocaleString()}, Avg Size: ${avgSize} chars`);
      });
    }

    if (sourceTypeResult.rows.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('SOURCE TYPES');
      console.log('-'.repeat(60));
      sourceTypeResult.rows.forEach(row => {
        const type = row.source_type || 'unknown';
        const count = row.count;
        const sources = row.unique_sources;
        const pct = Math.round(count / totalChunks * 100);
        console.log(`  ${type.toUpperCase()}: ${count.toLocaleString()} chunks from ${sources} sources (${pct}%)`);
      });
    }

    if (recentResult.rows.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('RECENT INGESTIONS (Last 10)');
      console.log('-'.repeat(60));
      recentResult.rows.forEach((row, i) => {
        const source = row.source_file_name || row.source_url || row.snippet_id;
        const type = row.source_type || 'unknown';
        const chunks = row.chunk_count;
        const date = formatDate(row.last_chunk);
        console.log(`  ${i + 1}. [${type}] ${source}`);
        console.log(`     ${chunks} chunks, ingested ${date}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ Statistics retrieved successfully');
    console.log('='.repeat(60) + '\n');

    process.exit(0);

  } catch (error) {
    console.error('\n' + '!'.repeat(60));
    console.error('ERROR');
    console.error('!'.repeat(60));
    console.error(error.message);
    
    if (error.message.includes('SQLITE_CANTOPEN') || error.message.includes('no such table')) {
      console.error('\nDatabase not found or not initialized.');
      console.error('Run the ingestion script first:');
      console.error('  node scripts/ingest-documents.js ./knowledge-base\n');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
