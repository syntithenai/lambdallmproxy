#!/usr/bin/env node
/**
 * Test script for local Puppeteer scraping with progress updates
 * 
 * Usage:
 *   node test-puppeteer-local.js <url>
 *   
 * Examples:
 *   node test-puppeteer-local.js https://example.com
 *   HEADLESS=false node test-puppeteer-local.js https://news.ycombinator.com
 *   DEVTOOLS=true SLOW_MO=500 node test-puppeteer-local.js https://github.com
 */

require('dotenv').config();
const { scrapePage } = require('./src/scrapers/puppeteer-local');

const url = process.argv[2] || 'https://example.com';

console.log('🚀 Testing Local Puppeteer Scraper');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📍 URL: ${url}`);
console.log(`🖥️  Mode: ${process.env.HEADLESS === 'false' ? 'VISIBLE' : 'headless'}`);
console.log(`🛠️  DevTools: ${process.env.DEVTOOLS === 'true' ? 'enabled' : 'disabled'}`);
console.log(`⏱️  SlowMo: ${process.env.SLOW_MO || 0}ms`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// Progress callback
const onProgress = (progress) => {
  const icons = {
    launching: '🚀',
    launched: '✅',
    navigating: '🌐',
    page_loaded: '📄',
    waiting_selector: '⏳',
    extracting: '📖',
    extracted: '✅',
    screenshot: '📸',
    complete: '🎉',
    error: '❌'
  };
  
  const icon = icons[progress.stage] || '📍';
  const messages = {
    launching: 'Launching browser...',
    launched: `Browser launched (${progress.launchTime}ms)`,
    navigating: `Navigating to ${progress.url}...`,
    page_loaded: `Page loaded (${progress.navigationTime}ms)`,
    waiting_selector: `Waiting for selector: ${progress.selector}`,
    extracting: 'Extracting content...',
    extracted: `Extracted ${progress.textLength} chars, ${progress.linkCount} links, ${progress.imageCount} images`,
    screenshot: 'Taking screenshot...',
    complete: `Complete! Total time: ${progress.totalTime}ms`,
    error: `Error: ${progress.error}`
  };
  
  const message = messages[progress.stage] || progress.stage;
  console.log(`${icon} ${message}`);
};

(async () => {
  try {
    const result = await scrapePage(url, {
      extractLinks: true,
      extractImages: true,
      screenshot: false,
      onProgress
    });
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📰 Title: ${result.title}`);
    console.log(`📏 Content: ${result.text.length} characters`);
    console.log(`🔗 Links: ${result.links.length}`);
    console.log(`🖼️  Images: ${result.images.length}`);
    console.log('');
    console.log('📝 First 500 chars:');
    console.log(result.text.substring(0, 500));
    console.log('');
    
    if (result.links.length > 0) {
      console.log('🔗 Sample Links:');
      result.links.slice(0, 5).forEach((link, i) => {
        console.log(`  ${i + 1}. ${link.text.substring(0, 60)} → ${link.url.substring(0, 60)}`);
      });
      console.log('');
    }
    
    if (result.images.length > 0) {
      console.log('🖼️  Sample Images:');
      result.images.slice(0, 5).forEach((img, i) => {
        console.log(`  ${i + 1}. ${img.alt || 'No alt text'} → ${img.url.substring(0, 60)}`);
      });
      console.log('');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Success!');
    
  } catch (error) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ ERROR');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(error);
    console.error('');
    
    if (error.message.includes('Chromium not found')) {
      console.error('💡 TIP: Install full Puppeteer to use local scraping:');
      console.error('   npm install puppeteer');
      console.error('');
      console.error('   Or use system Chrome/Chromium:');
      console.error('   export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome');
    }
    
    process.exit(1);
  }
})();
