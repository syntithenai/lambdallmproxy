#!/usr/bin/env node

/**
 * Test libSQL Integration with RAG Search
 * 
 * Tests the integrated search.js with libSQL backend
 */

const { searchWithText } = require('../src/rag/search');
const { generateEmbedding } = require('../src/rag/embeddings');

async function testLibSQLSearch() {
  console.log('Testing libSQL Integration with RAG Search');
  console.log('==========================================\n');
  
  // Test queries
  const queries = [
    'How do I use OpenAI embeddings?',
    'What is RAG and how does it work?',
    'How to deploy Lambda functions?',
  ];
  
  for (const query of queries) {
    console.log(`Query: "${query}"`);
    console.log('-'.repeat(60));
    
    try {
      // Generate embedding wrapper
      const generateEmbeddingFn = async (text) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY environment variable is required');
        }
        
        const result = await generateEmbedding(
          text,
          'text-embedding-3-small',
          'openai',
          apiKey
        );
        
        return { embedding: result.embedding };
      };
      
      // Search with text
      const results = await searchWithText(query, generateEmbeddingFn, {
        topK: 3,
        threshold: 0.5,
      });
      
      console.log(`Found ${results.length} results:\n`);
      
      results.forEach((result, index) => {
        console.log(`${index + 1}. Score: ${result.similarity.toFixed(4)}`);
        console.log(`   Source: ${result.source_file_name || result.snippet_name || 'Unknown'}`);
        console.log(`   Text: ${result.chunk_text.substring(0, 150)}...`);
        console.log();
      });
      
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    console.log();
  }
}

// Run test
if (require.main === module) {
  testLibSQLSearch().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testLibSQLSearch };
