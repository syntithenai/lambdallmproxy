#!/usr/bin/env node
/**
 * Simple test for YouTube Selenium caption scraper
 */

const { scrapeYouTubeCaptions } = require('./src/scrapers/youtube-caption-scraper');

async function test() {
    console.log('🧪 Testing YouTube Selenium Caption Scraper\n');
    
    // Use a popular music video that should have captions
    const videoId = 'dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up
    
    console.log(`📺 Video ID: ${videoId}`);
    console.log(`🔗 URL: https://www.youtube.com/watch?v=${videoId}`);
    console.log(`⏳ Starting caption extraction...\n`);
    
    try {
        const result = await scrapeYouTubeCaptions(videoId, {
            includeTimestamps: true,
            language: 'en',
            interactive: false,
            timeout: 30
        });
        
        console.log('\n📊 Result:');
        console.log(JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('\n✅ SUCCESS!');
            console.log(`📝 Caption count: ${result.captionCount}`);
            console.log(`📏 Text length: ${result.text.length} characters`);
            console.log(`🎬 Title: ${result.title || 'N/A'}`);
            console.log(`\n📖 First 200 chars:\n${result.text.substring(0, 200)}...`);
            process.exit(0);
        } else if (result.error) {
            console.log('\n❌ FAILED:', result.error);
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ Exception:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

test();
