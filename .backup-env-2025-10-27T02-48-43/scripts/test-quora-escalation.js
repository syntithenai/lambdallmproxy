#!/usr/bin/env node
const { scrapeWithTierFallback } = require('../src/scrapers/tier-orchestrator');

async function run() {
  const url = process.argv[2] || 'https://www.quora.com/';
  try {
    // Let site config determine the starting tier (don't override with startTier)
    const result = await scrapeWithTierFallback(url, { enableInteractive: false });
    console.log('Final result:');
    console.log('text length:', (result.text || result.html || '').length);
  } catch (err) {
    console.error('Scrape failed with error:');
    console.error(err.message);
    if (err.code) console.error('code:', err.code);
    if (err.sample) console.error('sample snippet:', err.sample.slice(0, 400));
    if (err.requiresLocalEnvironment) console.error('requiresLocalEnvironment:', err.requiresLocalEnvironment);
  }
}

run();
