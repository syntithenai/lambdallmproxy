#!/usr/bin/env node
/**
 * Simple test to verify search is working
 */

const tools = require('./src/tools');
const { initializeCache } = require('./src/utils/cache');

async function testSearch() {
  console.log('🧪 Testing RAG Search\n');
  
  // Initialize cache
  await initializeCache();
  
  // Test with a query that should match the documents
  const queries = [
    { query: 'Lambda LLM Proxy', threshold: 0.3 },
    { query: 'OpenAI API', threshold: 0.3 },
    { query: 'RAG retrieval augmented generation', threshold: 0.3 },
  ];
  
  for (const { query, threshold } of queries) {
    console.log(`\n📝 Testing query: "${query}" (threshold=${threshold})`);
    console.log('='.repeat(70));
    
    try {
      const result = await tools.callFunction(
        'search_knowledge_base',
        { query, top_k: 3, threshold },
        { apiKey: process.env.OPENAI_API_KEY }
      );
      
      const parsed = JSON.parse(result);
      console.log(`✅ Found ${parsed.result_count || 0} results`);
      
      if (parsed.results && parsed.results.length > 0) {
        parsed.results.forEach((r, i) => {
          console.log(`\n${i + 1}. ${r.source} (score: ${r.similarity_score})`);
          console.log(`   ${r.text.substring(0, 100)}...`);
        });
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

testSearch()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal:', error);
    process.exit(1);
  });
