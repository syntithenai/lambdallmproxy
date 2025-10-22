const { callFunction } = require('./src/tools');

async function test() {
  console.log('Testing RAG search tool...\n');
  
  const context = {
    apiKey: process.env.OPENAI_API_KEY,
    writeEvent: (event, data) => {
      console.log(`[Event: ${event}]`, JSON.stringify(data, null, 2));
    }
  };
  
  // Test 1: Simple search
  console.log('Test 1: Searching for "How does RAG work?"');
  const result1 = await callFunction('search_knowledge_base', {
    query: 'How does RAG work?',
    top_k: 3,
    threshold: 0.5
  }, context);
  
  const parsed1 = JSON.parse(result1);
  console.log('\nResults:', parsed1.result_count);
  if (parsed1.results) {
    parsed1.results.forEach(r => {
      console.log(`  ${r.rank}. ${r.source} (${r.similarity_score})`);
      console.log(`     ${r.text.substring(0, 100)}...`);
    });
  }
  
  // Test 2: Search with filter
  console.log('\n\nTest 2: Searching for "OpenAI API" with file filter');
  const result2 = await callFunction('search_knowledge_base', {
    query: 'OpenAI API documentation',
    top_k: 2,
    threshold: 0.6,
    source_type: 'file'
  }, context);
  
  const parsed2 = JSON.parse(result2);
  console.log('\nResults:', parsed2.result_count);
  if (parsed2.results) {
    parsed2.results.forEach(r => {
      console.log(`  ${r.rank}. ${r.source} (${r.similarity_score})`);
    });
  }
  
  console.log('\n✅ Tests complete!');
}

test().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
