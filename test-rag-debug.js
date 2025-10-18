#!/usr/bin/env node

require('dotenv').config();

const search = require('./src/rag/search');
const embeddings = require('./src/rag/embeddings');

async function test() {
  try {
    console.log('Testing RAG search...\n');
    
    const query = 'duckduckgo';
    console.log(`Query: "${query}"`);
    console.log(`Threshold: 0.1 (very low to see all scores)\n`);
    
    // Generate embedding
    const embeddingModel = 'text-embedding-3-small';
    const apiKey = process.env.OPENAI_API_KEY;
    
    console.log('Generating embedding...');
    const result = await embeddings.generateEmbedding(
      query,
      embeddingModel,
      'openai',
      apiKey
    );
    
    console.log(`Embedding dimensions: ${result.dimensions}`);
    console.log(`Embedding type: ${result.embedding.constructor.name}`);
    console.log(`Embedding sample: [${result.embedding.slice(0, 5).join(', ')}...]\n`);
    
    // Search
    console.log('Searching...');
    const generateEmbedding = async (text) => ({ embedding: result.embedding });
    
    const results = await search.searchWithText(query, generateEmbedding, {
      topK: 10,
      threshold: 0.1,
    });
    
    console.log(`\nResults: ${results.length}`);
    
    if (results.length > 0) {
      console.log('\nTop results:');
      results.forEach((r, i) => {
        console.log(`${i+1}. Score: ${r.similarity?.toFixed(4) || r.score?.toFixed(4)} - ${r.source_name || r.snippet_name}`);
      });
    } else {
      console.log('❌ No results found!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

test();
