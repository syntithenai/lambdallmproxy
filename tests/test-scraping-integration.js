/**
 * Integration test for multi-tier scraping system
 * Tests all tiers with real scraping scenarios
 */

const Tier0 = require('../src/scrapers/tier-0-direct');
const Tier1 = require('../src/scrapers/tier-1-puppeteer');
const Tier2 = require('../src/scrapers/tier-2-playwright');
const Tier3 = require('../src/scrapers/tier-3-selenium');
const Tier4 = require('../src/scrapers/tier-4-interactive');

// Test URLs
const TEST_URLS = {
  simple: 'https://example.com',
  dynamic: 'https://httpbin.org/html',
  headers: 'https://httpbin.org/headers',
};

async function testTier0() {
  console.log('\n🧪 Testing Tier 0: Direct HTTP\n');
  
  try {
    const availability = await Tier0.checkAvailability();
    console.log('Availability:', availability.available ? '✅' : '❌', availability.reason);
    
    if (!availability.available) {
      console.log('⚠️  Tier 0 not available, skipping tests');
      return { passed: 0, failed: 0, skipped: 1 };
    }
    
    const scraper = new Tier0();
    const startTime = Date.now();
    const result = await scraper.scrape(TEST_URLS.simple);
    const duration = Date.now() - startTime;
    
    console.log('URL:', TEST_URLS.simple);
    console.log('Success:', result.success ? '✅' : '❌');
    console.log('Tier:', result.tierName);
    console.log('Status Code:', result.statusCode);
    console.log('Content Length:', result.content?.html?.length || 0);
    console.log('Duration:', duration + 'ms');
    
    if (result.content?.title) {
      console.log('Title:', result.content.title);
    }
    
    return { passed: result.success ? 1 : 0, failed: result.success ? 0 : 1, skipped: 0 };
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { passed: 0, failed: 1, skipped: 0 };
  }
}

async function testTier1() {
  console.log('\n🧪 Testing Tier 1: Puppeteer + Stealth\n');
  
  try {
    const availability = await Tier1.checkAvailability();
    console.log('Availability:', availability.available ? '✅' : '❌', availability.reason);
    
    if (!availability.available) {
      console.log('⚠️  Tier 1 not available, skipping tests');
      return { passed: 0, failed: 0, skipped: 1 };
    }
    
    const startTime = Date.now();
    const result = await Tier1.scrape(TEST_URLS.simple);
    const duration = Date.now() - startTime;
    
    console.log('URL:', TEST_URLS.simple);
    console.log('Success:', result.success ? '✅' : '❌');
    console.log('Tier:', result.tierName);
    console.log('Status Code:', result.statusCode);
    console.log('Content Length:', result.content?.html?.length || 0);
    console.log('Duration:', duration + 'ms');
    console.log('Headless:', result.metadata?.headless);
    
    if (result.content?.title) {
      console.log('Title:', result.content.title);
    }
    
    return { passed: result.success ? 1 : 0, failed: result.success ? 0 : 1, skipped: 0 };
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { passed: 0, failed: 1, skipped: 0 };
  }
}

async function testTier2() {
  console.log('\n🧪 Testing Tier 2: Playwright + Stealth\n');
  
  try {
    const availability = await Tier2.checkAvailability();
    console.log('Availability:', availability.available ? '✅' : '❌', availability.reason);
    
    if (!availability.available) {
      console.log('⚠️  Tier 2 not available, skipping tests');
      return { passed: 0, failed: 0, skipped: 1 };
    }
    
    const scraper = new Tier2({ headless: true });
    const startTime = Date.now();
    const result = await scraper.scrape(TEST_URLS.simple);
    const duration = Date.now() - startTime;
    
    await scraper.cleanup();
    
    console.log('URL:', TEST_URLS.simple);
    console.log('Success:', result.success ? '✅' : '❌');
    console.log('Tier:', result.tierName);
    console.log('Status Code:', result.statusCode);
    console.log('Content Length:', result.content?.html?.length || 0);
    console.log('Duration:', duration + 'ms');
    console.log('Browser Type:', result.metadata?.browserType);
    console.log('Headless:', result.metadata?.headless);
    
    if (result.content?.title) {
      console.log('Title:', result.content.title);
    }
    
    return { passed: result.success ? 1 : 0, failed: result.success ? 0 : 1, skipped: 0 };
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { passed: 0, failed: 1, skipped: 0 };
  }
}

async function testTier3() {
  console.log('\n🧪 Testing Tier 3: Selenium + Undetected-ChromeDriver\n');
  
  try {
    const availability = await Tier3.checkAvailability();
    console.log('Availability:', availability.available ? '✅' : '❌', availability.reason);
    
    if (!availability.available) {
      console.log('⚠️  Tier 3 not available, skipping tests');
      return { passed: 0, failed: 0, skipped: 1 };
    }
    
    const startTime = Date.now();
    const result = await Tier3.scrape(TEST_URLS.simple, { headless: true });
    const duration = Date.now() - startTime;
    
    console.log('URL:', TEST_URLS.simple);
    console.log('Success:', result.success ? '✅' : '❌');
    console.log('Tier:', result.tierName);
    console.log('Content Length:', result.content?.html?.length || 0);
    console.log('Duration:', duration + 'ms');
    console.log('Headless:', result.metadata?.headless);
    console.log('User Agent:', result.metadata?.userAgent?.substring(0, 50) + '...');
    
    if (result.content?.title) {
      console.log('Title:', result.content.title);
    }
    
    return { passed: result.success ? 1 : 0, failed: result.success ? 0 : 1, skipped: 0 };
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { passed: 0, failed: 1, skipped: 0 };
  }
}

async function testTier4() {
  console.log('\n🧪 Testing Tier 4: Interactive Mode\n');
  
  try {
    const availability = await Tier4.checkAvailability();
    console.log('Availability:', availability.available ? '✅' : '❌', availability.reason);
    
    if (!availability.available) {
      console.log('⚠️  Tier 4 not available, skipping tests');
      return { passed: 0, failed: 0, skipped: 1 };
    }
    
    console.log('⚠️  Tier 4 requires manual interaction');
    console.log('   This tier is used for manual CAPTCHA solving and login handling');
    console.log('   Skipping automated test');
    
    return { passed: 0, failed: 0, skipped: 1 };
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { passed: 0, failed: 1, skipped: 0 };
  }
}

async function testStealthFeatures() {
  console.log('\n🧪 Testing Stealth Features\n');
  
  try {
    // Test that Tier 1 includes stealth plugin
    console.log('Verifying Tier 1 uses puppeteer-extra-plugin-stealth...');
    const tier1Code = require('fs').readFileSync(
      require('path').join(__dirname, '../src/scrapers/tier-1-puppeteer.js'),
      'utf8'
    );
    
    const hasStealthPlugin = tier1Code.includes('puppeteer-extra-plugin-stealth');
    const usesStealth = tier1Code.includes('StealthPlugin()');
    
    console.log('  - Imports stealth plugin:', hasStealthPlugin ? '✅' : '❌');
    console.log('  - Uses stealth plugin:', usesStealth ? '✅' : '❌');
    
    // Test that Tier 2 includes stealth plugin
    console.log('\nVerifying Tier 2 uses playwright-extra with stealth...');
    const tier2Code = require('fs').readFileSync(
      require('path').join(__dirname, '../src/scrapers/tier-2-playwright.js'),
      'utf8'
    );
    
    const hasPlaywrightExtra = tier2Code.includes('playwright-extra');
    const hasPlaywrightStealth = tier2Code.includes('puppeteer-extra-plugin-stealth');
    
    console.log('  - Uses playwright-extra:', hasPlaywrightExtra ? '✅' : '❌');
    console.log('  - Uses stealth plugin:', hasPlaywrightStealth ? '✅' : '❌');
    
    // Test that Tier 3 uses undetected-chromedriver
    console.log('\nVerifying Tier 3 uses undetected-chromedriver...');
    const pythonScript = require('fs').readFileSync(
      require('path').join(__dirname, '../scripts/undetected-chrome.py'),
      'utf8'
    );
    
    const hasUndetectedChrome = pythonScript.includes('undetected_chromedriver');
    
    console.log('  - Uses undetected-chromedriver:', hasUndetectedChrome ? '✅' : '❌');
    
    const allPassed = hasStealthPlugin && usesStealth && 
                     hasPlaywrightExtra && hasPlaywrightStealth && 
                     hasUndetectedChrome;
    
    return { passed: allPassed ? 1 : 0, failed: allPassed ? 0 : 1, skipped: 0 };
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { passed: 0, failed: 1, skipped: 0 };
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Multi-Tier Scraping System - Integration Tests');
  console.log('═══════════════════════════════════════════════════════════');
  
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
  };
  
  // Test stealth features first
  const stealthResults = await testStealthFeatures();
  results.passed += stealthResults.passed;
  results.failed += stealthResults.failed;
  results.skipped += stealthResults.skipped;
  
  // Test each tier
  const tier0Results = await testTier0();
  results.passed += tier0Results.passed;
  results.failed += tier0Results.failed;
  results.skipped += tier0Results.skipped;
  
  const tier1Results = await testTier1();
  results.passed += tier1Results.passed;
  results.failed += tier1Results.failed;
  results.skipped += tier1Results.skipped;
  
  const tier2Results = await testTier2();
  results.passed += tier2Results.passed;
  results.failed += tier2Results.failed;
  results.skipped += tier2Results.skipped;
  
  const tier3Results = await testTier3();
  results.passed += tier3Results.passed;
  results.failed += tier3Results.failed;
  results.skipped += tier3Results.skipped;
  
  const tier4Results = await testTier4();
  results.passed += tier4Results.passed;
  results.failed += tier4Results.failed;
  results.skipped += tier4Results.skipped;
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Test Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`✅ Passed:  ${results.passed}`);
  console.log(`❌ Failed:  ${results.failed}`);
  console.log(`⚠️  Skipped: ${results.skipped}`);
  console.log('═══════════════════════════════════════════════════════════');
  
  if (results.failed > 0) {
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
