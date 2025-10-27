#!/usr/bin/env node
/**
 * Delete Document CLI Tool
 * 
 * Remove documents from the RAG knowledge base by snippet ID.
 * Deletes all chunks associated with the document.
 * 
 * Usage:
 *   node scripts/delete-document.js [options] <snippet-id>
 * 
 * Options:
 *   --db-path <path>  Path to database file (default: ./rag-kb.db)
 *   --yes, -y         Skip confirmation prompt
 *   --list            List all snippet IDs and exit
 * 
 * Environment:
 *   LIBSQL_URL        Alternative to --db-path (file:/// format)
 *   LIBSQL_AUTH_TOKEN Optional auth token for remote databases
 */

// Load environment variables from .env file
require('dotenv').config();

const path = require('path');
const readline = require('readline');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dbPath: process.env.DB_URL || 'file:///' + path.resolve('./rag-kb.db'),
    yes: false,
    list: false,
    snippetId: '',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && args[i + 1]) {
      const dbPath = path.resolve(args[i + 1]);
      options.dbPath = 'file:///' + dbPath;
      i++;
    } else if (args[i] === '--yes' || args[i] === '-y') {
      options.yes = true;
    } else if (args[i] === '--list') {
      options.list = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Delete Document Tool

Usage: node scripts/delete-document.js [options] <snippet-id>

Options:
  --db-path <path>  Path to database file (default: ./rag-kb.db)
  --yes, -y         Skip confirmation prompt
  --list            List all snippet IDs and exit
  --help, -h        Show this help message

Environment Variables:
  LIBSQL_URL        Database URL (file:/// or libsql://)
  LIBSQL_AUTH_TOKEN Auth token for remote databases

Examples:
  # List all documents
  node scripts/delete-document.js --list

  # Delete a document
  node scripts/delete-document.js "file:project/README.md"

  # Delete without confirmation
  node scripts/delete-document.js -y "file:project/README.md"
      `);
      process.exit(0);
    } else if (!args[i].startsWith('--')) {
      options.snippetId = args[i];
    }
  }

  return options;
}

// Prompt for confirmation
function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question + ' (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// List all documents
async function listDocuments(client) {
  const result = await client.execute({
    sql: `
      SELECT 
        snippet_id,
        source_type,
        source_file_name,
        source_url,
        COUNT(*) as chunk_count,
        MAX(created_at) as last_updated
      FROM chunks
      GROUP BY snippet_id
      ORDER BY last_updated DESC
    `,
    args: []
  });

  if (result.rows.length === 0) {
    console.log('\nNo documents in database.\n');
    return;
  }

  console.log('\n' + '='.repeat(100));
  console.log('DOCUMENTS IN KNOWLEDGE BASE');
  console.log('='.repeat(100) + '\n');

  result.rows.forEach((row, i) => {
    const name = row.source_file_name || row.source_url || 'Unknown';
    const type = (row.source_type || 'unknown').toUpperCase();
    const chunks = row.chunk_count;
    const date = formatDate(row.last_updated);

    console.log(`${i + 1}. [${type}] ${name}`);
    console.log(`   Snippet ID: ${row.snippet_id}`);
    console.log(`   Chunks: ${chunks} | Last Updated: ${date}`);
    console.log('');
  });

  console.log('='.repeat(100));
  console.log(`Total: ${result.rows.length} documents\n`);
}

// Get document info
async function getDocumentInfo(client, snippetId) {
  const result = await client.execute({
    sql: `
      SELECT 
        snippet_id,
        source_type,
        source_file_name,
        source_file_path,
        source_url,
        COUNT(*) as chunk_count,
        SUM(CASE WHEN embedding_vector IS NOT NULL THEN 1 ELSE 0 END) as embedded_count,
        MIN(created_at) as first_chunk,
        MAX(created_at) as last_chunk
      FROM chunks
      WHERE snippet_id = ?
      GROUP BY snippet_id
    `,
    args: [snippetId]
  });

  return result.rows[0] || null;
}

// Delete document
async function deleteDocument(client, snippetId) {
  const result = await client.execute({
    sql: 'DELETE FROM chunks WHERE snippet_id = ?',
    args: [snippetId]
  });

  return result.rowsAffected || 0;
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

    // List mode
    if (options.list) {
      await listDocuments(client);
      process.exit(0);
    }

    // Validate snippet ID
    if (!options.snippetId) {
      console.error('\nError: Snippet ID is required\n');
      console.error('Usage: node scripts/delete-document.js [options] <snippet-id>');
      console.error('\nUse --list to see all snippet IDs');
      console.error('Run with --help for more information\n');
      process.exit(1);
    }

    // Get document info
    console.log('\nLooking up document...');
    const doc = await getDocumentInfo(client, options.snippetId);

    if (!doc) {
      console.error(`\nError: Document with snippet ID "${options.snippetId}" not found\n`);
      console.error('Use --list to see all available snippet IDs\n');
      process.exit(1);
    }

    // Display document info
    const name = doc.source_file_name || doc.source_url || options.snippetId;
    const type = (doc.source_type || 'unknown').toUpperCase();
    
    console.log('\n' + '='.repeat(80));
    console.log('DOCUMENT TO DELETE');
    console.log('='.repeat(80));
    console.log(`\nName: ${name}`);
    console.log(`Type: ${type}`);
    console.log(`Snippet ID: ${doc.snippet_id}`);
    console.log(`Chunks: ${doc.chunk_count} (${doc.embedded_count} with embeddings)`);
    console.log(`Created: ${formatDate(doc.first_chunk)}`);
    console.log(`Updated: ${formatDate(doc.last_chunk)}`);
    
    if (doc.source_file_path) {
      console.log(`Path: ${doc.source_file_path}`);
    }
    
    if (doc.source_url) {
      console.log(`URL: ${doc.source_url}`);
    }
    
    console.log('\n' + '='.repeat(80) + '\n');

    // Confirm deletion
    if (!options.yes) {
      const confirmed = await confirm('Are you sure you want to delete this document?');
      if (!confirmed) {
        console.log('\nDeletion cancelled.\n');
        process.exit(0);
      }
    }

    // Delete
    console.log('\nDeleting document...');
    const deletedCount = await deleteDocument(client, options.snippetId);

    if (deletedCount > 0) {
      console.log(`\n✓ Successfully deleted ${deletedCount} chunks\n`);
      process.exit(0);
    } else {
      console.error('\n✗ No chunks were deleted. Document may have already been removed.\n');
      process.exit(1);
    }

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
