#!/usr/bin/env node
/**
 * Test script for RAG query caching
 * Tests cache hit/miss behavior and measures performance improvements
 */

const tools = require('./src/tools');
const { initializeCache } = require('./src/utils/cache');

// Test query
const testQuery = 'How does RAG work?';

async function testRagCache() {
  console.log('🧪 Testing RAG Cache Performance\n');
  console.log('=' .repeat(70));
  
  // Initialize cache directories
  console.log('\n🔧 Initializing cache...');
  await initializeCache();
  console.log('✅ Cache initialized\n');
  console.log('=' .repeat(70));
  
  try {
    // Test 1: First query (cache miss)
    console.log('\n📝 Test 1: First query (should be CACHE MISS)');
    console.log('Query:', testQuery);
    console.log('-'.repeat(70));
    
    const start1 = Date.now();
    const result1 = await tools.callFunction(
      'search_knowledge_base',
      { query: testQuery, top_k: 3, threshold: 0.5 },
      { apiKey: process.env.OPENAI_KEY }
    );
    const time1 = Date.now() - start1;
    
    const parsed1 = JSON.parse(result1);
    console.log(`✅ Results: ${parsed1.result_count} chunks found`);
    console.log(`⏱️  Time: ${time1}ms`);
    console.log(`💾 Cached: ${parsed1.cached ? 'YES' : 'NO'}`);
    
    // Wait for cache write to complete
    console.log('\n⏳ Waiting for cache write to complete...');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Test 2: Same query (cache hit)
    console.log('\n📝 Test 2: Same query again (should be CACHE HIT)');
    console.log('Query:', testQuery);
    console.log('-'.repeat(70));
    
    const start2 = Date.now();
    const result2 = await tools.callFunction(
      'search_knowledge_base',
      { query: testQuery, top_k: 3, threshold: 0.5 },
      { apiKey: process.env.OPENAI_KEY }
    );
    const time2 = Date.now() - start2;
    
    const parsed2 = JSON.parse(result2);
    console.log(`✅ Results: ${parsed2.result_count} chunks found`);
    console.log(`⏱️  Time: ${time2}ms`);
    console.log(`💾 Cached: ${parsed2.cached ? 'YES' : 'NO'}`);
    
    // Test 3: Same query, different parameters (cache miss)
    console.log('\n📝 Test 3: Same query, different topK (should be CACHE MISS)');
    console.log('Query:', testQuery, '(topK=5)');
    console.log('-'.repeat(70));
    
    const start3 = Date.now();
    const result3 = await tools.callFunction(
      'search_knowledge_base',
      { query: testQuery, top_k: 5, threshold: 0.5 },
      { apiKey: process.env.OPENAI_KEY }
    );
    const time3 = Date.now() - start3;
    
    const parsed3 = JSON.parse(result3);
    console.log(`✅ Results: ${parsed3.result_count} chunks found`);
    console.log(`⏱️  Time: ${time3}ms`);
    console.log(`💾 Cached: ${parsed3.cached ? 'YES' : 'NO'}`);
    
    // Test 4: Different query (cache miss for query, but embedding cached if same words)
    const testQuery2 = 'What is retrieval augmented generation?';
    console.log('\n📝 Test 4: Different query (should be CACHE MISS)');
    console.log('Query:', testQuery2);
    console.log('-'.repeat(70));
    
    const start4 = Date.now();
    const result4 = await tools.callFunction(
      'search_knowledge_base',
      { query: testQuery2, top_k: 3, threshold: 0.5 },
      { apiKey: process.env.OPENAI_KEY }
    );
    const time4 = Date.now() - start4;
    
    const parsed4 = JSON.parse(result4);
    console.log(`✅ Results: ${parsed4.result_count} chunks found`);
    console.log(`⏱️  Time: ${time4}ms`);
    console.log(`💾 Cached: ${parsed4.cached ? 'YES' : 'NO'}`);
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 CACHE PERFORMANCE SUMMARY');
    console.log('='.repeat(70));
    console.log(`Test 1 (miss):  ${time1}ms`);
    console.log(`Test 2 (hit):   ${time2}ms - ${((1 - time2/time1) * 100).toFixed(1)}% faster`);
    console.log(`Test 3 (miss):  ${time3}ms`);
    console.log(`Test 4 (miss):  ${time4}ms`);
    console.log('\n✅ Cache speedup:', time1 > 0 ? `${(time1/time2).toFixed(1)}x faster` : 'N/A');
    console.log(`💰 Cost savings: Cached queries avoid $0.000004 embedding cost`);
    
    // Verify cache hit worked
    if (parsed2.cached) {
      console.log('\n✅ SUCCESS: Cache hit verified!');
    } else {
      console.log('\n⚠️  WARNING: Expected cache hit on Test 2 but got cache miss');
    }
    
    // Verify results are identical
    if (JSON.stringify(parsed1.results) === JSON.stringify(parsed2.results)) {
      console.log('✅ SUCCESS: Cached results match original results');
    } else {
      console.log('⚠️  WARNING: Cached results differ from original');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testRagCache()
  .then(() => {
    console.log('\n✨ All tests completed!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
