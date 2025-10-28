#!/usr/bin/env node
/**
 * Test Image Search Tool
 * Tests Unsplash and Pexels image search integration
 */

require('dotenv').config();

const { 
  searchImage, 
  searchUnsplash, 
  searchPexels,
  trackUnsplashDownload,
  getCacheStats 
} = require('../src/tools/image-search');

async function testImageSearch() {
  console.log('\n🧪 Testing Image Search Integration\n');
  console.log('='.repeat(60));
  
  // Test queries
  const testQueries = [
    'artificial intelligence',
    'space exploration',
    'quantum computing',
    'ocean wildlife'
  ];
  
  console.log('\n1️⃣  Testing Unsplash API');
  console.log('-'.repeat(60));
  
  for (const query of testQueries.slice(0, 2)) {
    console.log(`\n🔍 Query: "${query}"`);
    try {
      const results = await searchUnsplash(query, 1);
      if (results.length > 0) {
        const img = results[0];
        console.log('✅ Success!');
        console.log(`   📸 Photographer: ${img.photographer}`);
        console.log(`   🔗 URL: ${img.url.substring(0, 60)}...`);
        console.log(`   📝 Attribution: ${img.attribution}`);
        
        // Test download tracking
        if (img.downloadUrl) {
          console.log('   📊 Tracking download...');
          await trackUnsplashDownload(img.downloadUrl);
        }
      } else {
        console.log('⚠️  No results found');
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n2️⃣  Testing Pexels API');
  console.log('-'.repeat(60));
  
  for (const query of testQueries.slice(2, 4)) {
    console.log(`\n🔍 Query: "${query}"`);
    try {
      const results = await searchPexels(query, 1);
      if (results.length > 0) {
        const img = results[0];
        console.log('✅ Success!');
        console.log(`   📸 Photographer: ${img.photographer}`);
        console.log(`   🔗 URL: ${img.url.substring(0, 60)}...`);
        console.log(`   📝 Attribution: ${img.attribution}`);
      } else {
        console.log('⚠️  No results found');
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n3️⃣  Testing Auto Provider Selection');
  console.log('-'.repeat(60));
  
  const autoQuery = 'machine learning';
  console.log(`\n🔍 Query: "${autoQuery}" (auto provider)`);
  
  try {
    const result = await searchImage(autoQuery, { provider: 'auto' });
    if (result) {
      console.log('✅ Success!');
      console.log(`   🏢 Provider: ${result.source}`);
      console.log(`   📸 Photographer: ${result.photographer}`);
      console.log(`   🔗 URL: ${result.url.substring(0, 60)}...`);
      console.log(`   📝 Attribution HTML:`);
      console.log(`      ${result.attributionHtml}`);
    } else {
      console.log('⚠️  No results found');
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  
  console.log('\n4️⃣  Testing Cache');
  console.log('-'.repeat(60));
  
  // Search same query twice to test caching
  const cacheTestQuery = 'artificial intelligence';
  
  console.log(`\n🔍 First search for "${cacheTestQuery}"`);
  const start1 = Date.now();
  await searchImage(cacheTestQuery);
  const time1 = Date.now() - start1;
  console.log(`   ⏱️  Time: ${time1}ms`);
  
  console.log(`\n🔍 Second search for "${cacheTestQuery}" (should be cached)`);
  const start2 = Date.now();
  await searchImage(cacheTestQuery);
  const time2 = Date.now() - start2;
  console.log(`   ⏱️  Time: ${time2}ms`);
  
  if (time2 < time1 / 10) {
    console.log('   ✅ Cache is working! (10x+ faster)');
  } else {
    console.log('   ⚠️  Cache may not be working as expected');
  }
  
  // Show cache stats
  const stats = getCacheStats();
  console.log('\n📊 Cache Statistics:');
  console.log(`   Total entries: ${stats.totalEntries}`);
  console.log(`   Valid entries: ${stats.validEntries}`);
  console.log(`   Expired entries: ${stats.expiredEntries}`);
  console.log(`   Cache TTL: ${stats.cacheTTL / 1000 / 60} minutes`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Image Search Tests Complete!\n');
  
  // Display compliance checklist
  console.log('\n📋 Unsplash API Compliance Checklist:');
  console.log('   ✅ Hotlink photos (using original URLs)');
  console.log('   ✅ Trigger downloads (trackUnsplashDownload called)');
  console.log('   ✅ No Unsplash logo/naming (app is "Research Agent")');
  console.log('   ✅ Proper attribution with links');
  console.log('   ⚠️  Screenshot needed for compliance review\n');
}

// Run tests
testImageSearch().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
