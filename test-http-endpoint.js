#!/usr/bin/env node

/**
 * Test that the local Lambda server can serve sample files via HTTP
 * This validates the realistic HTTP flow for transcription
 */

const http = require('http');

const testUrl = 'http://localhost:3000/samples/long-form-ai-speech.mp3';

console.log(`🧪 Testing HTTP endpoint: ${testUrl}\n`);

http.get(testUrl, (res) => {
    console.log(`✅ Status: ${res.statusCode} ${res.statusMessage}`);
    console.log(`📋 Headers:`);
    Object.entries(res.headers).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
    });
    
    let bytes = 0;
    res.on('data', (chunk) => {
        bytes += chunk.length;
    });
    
    res.on('end', () => {
        console.log(`\n📦 Downloaded: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
        console.log(`\n✅ HTTP endpoint works! Transcription will use fetch() naturally.`);
    });
}).on('error', (err) => {
    console.error(`❌ Error: ${err.message}`);
    console.error(`\n⚠️  Make sure servers are running with: make dev`);
    process.exit(1);
});
