#!/usr/bin/env node
/**
 * Test script to verify Puppeteer scraping with progress updates
 * Tests the complete flow: tool execution → progress events → result
 */

require('dotenv').config();

async function testScraping() {
  console.log('🧪 Testing Puppeteer Scraping with Progress Updates');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`🎭 Puppeteer ARN: ${process.env.PUPPETEER_LAMBDA_ARN ? 'Set' : 'Not set'}`);
  console.log(`✅ Use Puppeteer: ${process.env.USE_PUPPETEER !== 'false' ? 'Yes' : 'No'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const { callFunction } = require('./src/tools');
  
  const url = process.argv[2] || 'https://example.com';
  const progressEvents = [];
  
  // Create context with progress callback
  const context = {
    onProgress: (event) => {
      progressEvents.push(event);
      const icon = {
        scrape_launching: '🚀',
        scrape_launched: '✅',
        scrape_navigating: '🌐',
        scrape_page_loaded: '📄',
        scrape_extracting: '📖',
        scrape_extracted: '✅',
        scrape_complete: '🎉'
      }[event.type] || '📍';
      
      console.log(`${icon} ${event.message || event.type}`);
    }
  };
  
  console.log(`🔍 Scraping: ${url}`);
  console.log('');
  
  try {
    const startTime = Date.now();
    const result = await callFunction('scrape_web_content', { url, timeout: 30 }, context);
    const duration = Date.now() - startTime;
    
    const parsed = JSON.parse(result);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`🔧 Scrape Service: ${parsed.scrapeService}`);
    console.log(`📰 Title: ${parsed.title || 'N/A'}`);
    console.log(`📏 Content: ${parsed.content?.length || 0} chars`);
    console.log(`🔗 Links: ${parsed.links?.length || 0}`);
    console.log(`🖼️  Images: ${parsed.images?.length || 0} (${parsed.allImages?.length || 0} total)`);
    console.log(`📡 Progress Events: ${progressEvents.length}`);
    console.log('');
    
    if (progressEvents.length > 0) {
      console.log('📝 Progress Event Timeline:');
      progressEvents.forEach((evt, i) => {
        console.log(`  ${i + 1}. ${evt.type}: ${evt.message || evt.stage}`);
      });
      console.log('');
    }
    
    if (parsed.content) {
      console.log('📄 Content Preview (first 300 chars):');
      console.log(parsed.content.substring(0, 300));
      console.log('');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Verify expectations
    const expectedService = process.env.NODE_ENV === 'development' ? 'puppeteer_local' : 'duckduckgo_proxy';
    const actualService = parsed.scrapeService;
    
    if (actualService.includes('puppeteer')) {
      console.log('✅ SUCCESS: Using Puppeteer as expected!');
      if (progressEvents.length > 0) {
        console.log('✅ SUCCESS: Progress events working!');
      } else {
        console.log('⚠️  WARNING: No progress events received');
      }
    } else {
      console.log(`⚠️  NOTICE: Using ${actualService} (expected Puppeteer in dev mode)`);
      console.log('💡 TIP: Ensure NODE_ENV=development is set in .env');
    }
    
  } catch (error) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ ERROR');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(error);
    process.exit(1);
  }
}

testScraping();
