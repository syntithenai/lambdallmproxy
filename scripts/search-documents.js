#!/usr/bin/env node
/**
 * Search Documents CLI Tool
 * 
 * Search the RAG knowledge base from the command line
 * with vector similarity search.
 * 
 * Usage:
 *   node scripts/search-documents.js [options] <query>
 * 
 * Options:
 *   --db-path <path>       Path to database file (default: ./rag-kb.db)
 *   --top-k <n>            Number of results (default: 5)
 *   --threshold <n>        Minimum similarity score 0-1 (default: 0.5)
 *   --type <file|url|text> Filter by source type
 *   --format <table|json>  Output format (default: table)
 * 
 * Environment:
 *   LIBSQL_URL         Database URL
 *   LIBSQL_AUTH_TOKEN  Optional auth token
 *   OPENAI_API_KEY     Required for generating query embeddings
 */

// Load environment variables from .env file
require('dotenv').config();

const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dbPath: process.env.LIBSQL_URL || 'file:///' + path.resolve('./rag-kb.db'),
    topK: 5,
    threshold: 0.3, // Lowered from 0.5 for more relaxed matching
    type: null,
    format: 'table',
    query: '',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && args[i + 1]) {
      const dbPath = path.resolve(args[i + 1]);
      options.dbPath = 'file:///' + dbPath;
      i++;
    } else if (args[i] === '--top-k' && args[i + 1]) {
      options.topK = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--threshold' && args[i + 1]) {
      options.threshold = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--type' && args[i + 1]) {
      options.type = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Search Documents Tool

Usage: node scripts/search-documents.js [options] <query>

Options:
  --db-path <path>       Path to database file (default: ./rag-kb.db)
  --top-k <n>            Number of results (default: 5)
  --threshold <n>        Minimum similarity score 0-1 (default: 0.3)
  --type <file|url|text> Filter by source type
  --format <table|json>  Output format (default: table)
  --help, -h             Show this help message

Environment Variables:
  LIBSQL_URL         Database URL (file:/// or libsql://)
  LIBSQL_AUTH_TOKEN  Auth token for remote databases
  OPENAI_API_KEY     Required for generating embeddings

Examples:
  node scripts/search-documents.js "How does RAG work?"
  node scripts/search-documents.js --top-k 10 --threshold 0.7 "OpenAI API"
  node scripts/search-documents.js --type file --format json "deployment guide"
      `);
      process.exit(0);
    } else if (!args[i].startsWith('--')) {
      // Remaining args are the query
      options.query = args.slice(i).join(' ');
      break;
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

// Truncate string
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

// Highlight query terms in text (simple)
function highlightText(text, query) {
  // For terminal, we can use ANSI codes for bold
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let highlighted = text;
  
  words.forEach(word => {
    const regex = new RegExp(`(${word})`, 'gi');
    highlighted = highlighted.replace(regex, '\x1b[1m$1\x1b[0m');
  });
  
  return highlighted;
}

// Format as table
function formatAsTable(results, query) {
  if (results.length === 0) {
    console.log('\nNo results found.\n');
    return;
  }

  console.log('\n' + '='.repeat(100));
  console.log(`SEARCH RESULTS FOR: "${query}"`);
  console.log('='.repeat(100) + '\n');

  results.forEach((result, i) => {
    const source = result.source_file_name || result.source_url || 'Unknown';
    const score = result.similarity.toFixed(4);
    const type = (result.source_type || 'unknown').toUpperCase();
    const text = highlightText(result.chunk_text, query);
    
    console.log(`${i + 1}. [${type}] ${source} (Score: ${score})`);
    console.log(`   ID: ${result.id}`);
    console.log(`   ${truncate(text, 300)}`);
    
    if (result.source_url) {
      console.log(`   URL: ${result.source_url}`);
    }
    
    console.log('');
  });

  console.log('='.repeat(100));
  console.log(`Found ${results.length} results\n`);
}

// Format as JSON
function formatAsJson(results) {
  console.log(JSON.stringify(results, null, 2));
}

// Main function
async function main() {
  const options = parseArgs();

  if (!options.query) {
    console.error('\nError: Query is required\n');
    console.error('Usage: node scripts/search-documents.js [options] <query>');
    console.error('Run with --help for more information\n');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('\nError: OPENAI_API_KEY environment variable is required\n');
    console.error('Set it with:');
    console.error('  export OPENAI_API_KEY="your-key-here"\n');
    process.exit(1);
  }

  try {
    // Set environment for search.js
    process.env.LIBSQL_URL = options.dbPath;

    // Import search module
    const search = require('../src/rag/search');
    const embeddings = require('../src/rag/embeddings');

    console.log('\nGenerating embedding for query...');

    // Create embedding generator function
    const generateEmbedding = async (text) => {
      const result = await embeddings.generateEmbedding(
        text,
        'text-embedding-3-small',
        'openai',
        process.env.OPENAI_API_KEY
      );
      return { embedding: result.embedding };
    };

    // Search
    console.log('Searching knowledge base...\n');
    
    const results = await search.searchWithText(
      options.query,
      generateEmbedding,
      {
        topK: options.topK,
        threshold: options.threshold,
        source_type: options.type,
      }
    );

    // Format output
    if (options.format === 'json') {
      formatAsJson(results);
    } else {
      formatAsTable(results, options.query);
    }

    process.exit(0);

  } catch (error) {
    console.error('\nError:', error.message);
    console.error(error.stack);
    
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
