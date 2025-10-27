#!/usr/bin/env node
/**
 * List Documents CLI Tool
 * 
 * Lists all documents ingested into the RAG knowledge base
 * with details about chunk counts, file sizes, and ingestion dates.
 * 
 * Usage:
 *   node scripts/list-documents.js [options]
 * 
 * Options:
 *   --db-path <path>       Path to database file (default: ./rag-kb.db)
 *   --type <file|url|text> Filter by source type
 *   --format <table|json>  Output format (default: table)
 *   --limit <n>            Limit number of results
 * 
 * Environment:
 *   LIBSQL_URL        Alternative to --db-path (file:/// format)
 *   LIBSQL_AUTH_TOKEN Optional auth token for remote databases
 */

// Load environment variables from .env file
require('dotenv').config();

const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dbPath: process.env.DB_URL || 'file:///' + path.resolve('./rag-kb.db'),
    type: null,
    format: 'table',
    limit: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && args[i + 1]) {
      const dbPath = path.resolve(args[i + 1]);
      options.dbPath = 'file:///' + dbPath;
      i++;
    } else if (args[i] === '--type' && args[i + 1]) {
      options.type = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
List Documents Tool

Usage: node scripts/list-documents.js [options]

Options:
  --db-path <path>       Path to database file (default: ./rag-kb.db)
  --type <file|url|text> Filter by source type
  --format <table|json>  Output format (default: table)
  --limit <n>            Limit number of results
  --help, -h             Show this help message

Environment Variables:
  LIBSQL_URL        Database URL (file:/// or libsql://)
  LIBSQL_AUTH_TOKEN Auth token for remote databases

Examples:
  node scripts/list-documents.js
  node scripts/list-documents.js --type file --limit 10
  node scripts/list-documents.js --format json
      `);
      process.exit(0);
    }
  }

  return options;
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Format bytes
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Truncate string
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

// Format as table
function formatAsTable(documents) {
  if (documents.length === 0) {
    console.log('\nNo documents found.\n');
    return;
  }

  console.log('\n' + '='.repeat(100));
  console.log('DOCUMENTS IN KNOWLEDGE BASE');
  console.log('='.repeat(100) + '\n');

  // Group by source type
  const byType = {};
  documents.forEach(doc => {
    const type = doc.source_type || 'unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(doc);
  });

  Object.entries(byType).forEach(([type, docs]) => {
    console.log(`\n${type.toUpperCase()} (${docs.length} documents)`);
    console.log('-'.repeat(100));

    docs.forEach((doc, i) => {
      const name = doc.source_file_name || doc.source_url || doc.snippet_id;
      const chunks = doc.chunk_count;
      const size = formatBytes(doc.total_size);
      const date = formatDate(doc.last_chunk);
      const hasEmbeddings = doc.embedded_count === doc.chunk_count ? '✓' : `${doc.embedded_count}/${doc.chunk_count}`;
      
      console.log(`\n${i + 1}. ${truncate(name, 60)}`);
      console.log(`   ID: ${doc.snippet_id}`);
      console.log(`   Chunks: ${chunks}  |  Size: ${size}  |  Embeddings: ${hasEmbeddings}`);
      console.log(`   Ingested: ${date}`);
      
      if (doc.embedding_model) {
        console.log(`   Model: ${doc.embedding_provider || 'unknown'}/${doc.embedding_model}`);
      }
      
      if (doc.source_url) {
        console.log(`   URL: ${truncate(doc.source_url, 70)}`);
      }
      
      if (doc.source_file_path) {
        console.log(`   Path: ${truncate(doc.source_file_path, 70)}`);
      }
    });
  });

  console.log('\n' + '='.repeat(100));
  console.log(`Total: ${documents.length} documents`);
  console.log('='.repeat(100) + '\n');
}

// Format as JSON
function formatAsJson(documents) {
  console.log(JSON.stringify(documents, null, 2));
}

// Main function
async function main() {
  const options = parseArgs();

  try {
    // Import storage module
    const storageModule = require('../src/rag/libsql-storage');
    
    // Create client
    const client = storageModule.createLibsqlClient({
      url: options.dbPath,
      authToken: process.env.DB_TOKEN,
    });

    // Build query
    let sql = `
      SELECT 
        snippet_id,
        source_type,
        source_file_name,
        source_file_path,
        source_url,
        source_mime_type,
        embedding_model,
        embedding_provider,
        COUNT(*) as chunk_count,
        SUM(CASE WHEN embedding_vector IS NOT NULL THEN 1 ELSE 0 END) as embedded_count,
        SUM(LENGTH(chunk_text)) as total_size,
        MIN(created_at) as first_chunk,
        MAX(created_at) as last_chunk
      FROM chunks
    `;

    const args = [];
    
    if (options.type) {
      sql += ' WHERE source_type = ?';
      args.push(options.type);
    }

    sql += ' GROUP BY snippet_id ORDER BY last_chunk DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      args.push(options.limit);
    }

    // Execute query
    const result = await client.execute({ sql, args });
    const documents = result.rows;

    // Format output
    if (options.format === 'json') {
      formatAsJson(documents);
    } else {
      formatAsTable(documents);
    }

    process.exit(0);

  } catch (error) {
    console.error('\nError:', error.message);
    
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
