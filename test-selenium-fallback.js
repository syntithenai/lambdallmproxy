#!/usr/bin/env node
/**
 * Test script for YouTube Selenium fallback
 * 
 * This tests the fallback mechanism when ytdl-core fails with 403.
 * The video used (dQw4w9WgXcQ) is known to sometimes be region-locked.
 */

const { transcribeUrl } = require('./src/tools/transcribe');

async function testSeleniumFallback() {
    console.log('🧪 Testing YouTube Selenium Fallback\n');
    console.log('📺 Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    console.log('⏳ This may take 30-60 seconds...\n');

    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    // Use a dummy API key since we're testing Selenium captions (no Whisper needed)
    const dummyApiKey = 'sk-test-not-used-for-selenium';

    try {
        const result = await transcribeUrl({
            url: testUrl,
            apiKey: dummyApiKey,
            onProgress: (event) => {
                console.log(`📊 Progress: ${event.type}`, event.message || '');
            }
        });

        console.log('\n✅ Test Result:');
        console.log(JSON.stringify(result, null, 2));

        if (result.method === 'selenium-captions') {
            console.log('\n✅ SUCCESS: Selenium fallback worked!');
            console.log(`📝 Transcript length: ${result.text.length} characters`);
            console.log(`🎬 Video title: ${result.title || 'N/A'}`);
            process.exit(0);
        } else if (result.error) {
            console.log('\n❌ FAILED: Got error instead of fallback');
            console.log(`Error: ${result.error}`);
            process.exit(1);
        } else {
            console.log('\n✅ SUCCESS: ytdl-core worked (no fallback needed)');
            console.log(`📝 Transcript length: ${result.text.length} characters`);
            process.exit(0);
        }
    } catch (error) {
        console.error('\n❌ Test failed with exception:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run test
testSeleniumFallback();
